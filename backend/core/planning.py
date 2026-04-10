from dataclasses import dataclass
from datetime import date, timedelta

from django.db import transaction

from .models import AsignacionTarde, CalendarioSemanal, DiaSemana, EstadoAsignacion

CONFLICT_SKIP = "skip"
CONFLICT_REPLACE = "replace"

WEEKDAY_VALUES = [
    DiaSemana.LUNES,
    DiaSemana.MARTES,
    DiaSemana.MIERCOLES,
    DiaSemana.JUEVES,
    DiaSemana.VIERNES,
]


@dataclass(frozen=True)
class WeekTarget:
    anio: int
    numero_semana: int
    fecha_inicio_semana: date
    fecha_fin_semana: date


def _week_target_from_iso(anio: int, numero_semana: int) -> WeekTarget:
    monday = date.fromisocalendar(anio, numero_semana, 1)
    return WeekTarget(
        anio=anio,
        numero_semana=numero_semana,
        fecha_inicio_semana=monday,
        fecha_fin_semana=monday + timedelta(days=4),
    )


def _last_day_of_month(anio: int, mes: int) -> date:
    if mes == 12:
        return date(anio, 12, 31)
    return date(anio, mes + 1, 1) - timedelta(days=1)


def target_weeks_for_month(anio: int, mes: int) -> list[WeekTarget]:
    first_day = date(anio, mes, 1)
    last_day = _last_day_of_month(anio, mes)

    week_keys = set()
    current = first_day
    while current <= last_day:
        iso = current.isocalendar()
        week_keys.add((iso.year, iso.week))
        current += timedelta(days=1)

    targets = [_week_target_from_iso(iso_year, iso_week) for iso_year, iso_week in week_keys]
    return sorted(targets, key=lambda item: item.fecha_inicio_semana)


def target_weeks_for_year(anio: int) -> list[WeekTarget]:
    total_weeks = date(anio, 12, 28).isocalendar().week
    return [_week_target_from_iso(anio, week_number) for week_number in range(1, total_weeks + 1)]


def _ensure_week(target: WeekTarget, estado: str, estrategia_conflicto: str):
    week, created = CalendarioSemanal.objects.get_or_create(
        anio=target.anio,
        numero_semana=target.numero_semana,
        defaults={
            "fecha_inicio_semana": target.fecha_inicio_semana,
            "fecha_fin_semana": target.fecha_fin_semana,
            "estado": estado,
        },
    )

    updated = False
    update_fields = []

    if week.fecha_inicio_semana != target.fecha_inicio_semana:
        week.fecha_inicio_semana = target.fecha_inicio_semana
        update_fields.append("fecha_inicio_semana")

    if week.fecha_fin_semana != target.fecha_fin_semana:
        week.fecha_fin_semana = target.fecha_fin_semana
        update_fields.append("fecha_fin_semana")

    if estrategia_conflicto == CONFLICT_REPLACE and week.estado != estado:
        week.estado = estado
        update_fields.append("estado")

    if update_fields:
        week.save(update_fields=update_fields)
        updated = True

    return week, created, updated


def _replace_week_assignments(week: CalendarioSemanal, empleado):
    replaced_count, _ = AsignacionTarde.objects.filter(semana=week, dia__in=WEEKDAY_VALUES).delete()

    created_count = 0
    for dia in WEEKDAY_VALUES:
        AsignacionTarde.objects.create(
            semana=week,
            usuario=empleado,
            dia=dia,
            hora_inicio="14:00",
            hora_fin="22:00",
            estado=EstadoAsignacion.ASIGNADO,
        )
        created_count += 1

    return created_count, replaced_count


def _create_week_assignments_skip(week: CalendarioSemanal, empleado):
    created_count = 0
    omitted_count = 0
    conflicts = []

    for dia in WEEKDAY_VALUES:
        own_assignment_exists = AsignacionTarde.objects.filter(
            semana=week,
            usuario=empleado,
            dia=dia,
        ).exists()
        if own_assignment_exists:
            continue

        day_busy_for_other_user = AsignacionTarde.objects.filter(
            semana=week,
            dia=dia,
        ).exclude(usuario=empleado).exists()

        if day_busy_for_other_user:
            omitted_count += 1
            conflicts.append(
                {
                    "semana_id": str(week.id),
                    "anio": week.anio,
                    "numero_semana": week.numero_semana,
                    "dia": dia,
                    "motivo": "Ya existe asignacion de otro empleado para ese dia.",
                }
            )
            continue

        AsignacionTarde.objects.create(
            semana=week,
            usuario=empleado,
            dia=dia,
            hora_inicio="14:00",
            hora_fin="22:00",
            estado=EstadoAsignacion.ASIGNADO,
        )
        created_count += 1

    return created_count, omitted_count, conflicts


@transaction.atomic
def generate_rotation_schedule(
    week_targets: list[WeekTarget],
    empleados: list,
    estado: str,
    estrategia_conflicto: str,
):
    summary = {
        "semanas_objetivo": len(week_targets),
        "semanas_creadas": 0,
        "semanas_existentes": 0,
        "semanas_actualizadas": 0,
        "asignaciones_creadas": 0,
        "asignaciones_reemplazadas": 0,
        "asignaciones_omitidas": 0,
        "conflictos": [],
        "semanas_detalle": [],
    }

    if not week_targets or not empleados:
        return summary

    for index, target in enumerate(week_targets):
        empleado = empleados[index % len(empleados)]

        week, created, updated = _ensure_week(target, estado, estrategia_conflicto)
        week_changed = updated
        if created:
            summary["semanas_creadas"] += 1
        else:
            summary["semanas_existentes"] += 1

        if estrategia_conflicto == CONFLICT_REPLACE:
            created_count, replaced_count = _replace_week_assignments(week, empleado)
            summary["asignaciones_creadas"] += created_count
            summary["asignaciones_reemplazadas"] += replaced_count
            if not created and (replaced_count > 0 or created_count > 0):
                week_changed = True
        else:
            created_count, omitted_count, conflicts = _create_week_assignments_skip(week, empleado)
            summary["asignaciones_creadas"] += created_count
            summary["asignaciones_omitidas"] += omitted_count
            summary["conflictos"].extend(conflicts)
            if not created and created_count > 0:
                week_changed = True

        if week_changed and not created:
            summary["semanas_actualizadas"] += 1

        summary["semanas_detalle"].append(
            {
                "semana_id": str(week.id),
                "anio": week.anio,
                "numero_semana": week.numero_semana,
                "empleado_id": str(empleado.id),
                "empleado_nombre": empleado.nombre,
                "accion": "creada" if created else "actualizada" if week_changed else "existente",
            }
        )

    return summary


@transaction.atomic
def generate_month_schedule(anio: int, mes: int, empleados: list, estado: str, estrategia_conflicto: str):
    week_targets = target_weeks_for_month(anio, mes)
    summary = generate_rotation_schedule(
        week_targets=week_targets,
        empleados=empleados,
        estado=estado,
        estrategia_conflicto=estrategia_conflicto,
    )
    summary["tipo"] = "mes"
    summary["anio_solicitado"] = anio
    summary["mes"] = mes
    return summary


@transaction.atomic
def generate_year_schedule(anio: int, empleados: list, estado: str, estrategia_conflicto: str):
    week_targets = target_weeks_for_year(anio)
    summary = generate_rotation_schedule(
        week_targets=week_targets,
        empleados=empleados,
        estado=estado,
        estrategia_conflicto=estrategia_conflicto,
    )
    summary["tipo"] = "anio"
    summary["anio_solicitado"] = anio
    return summary
