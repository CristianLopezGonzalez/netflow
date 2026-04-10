from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .models import (
    AsignacionTarde,
    AuditoriaEvento,
    BolsaDiasMovimiento,
    BolsaDiasSaldo,
    EstadoAsignacion,
    EstadoSolicitud,
    RolSolicitanteCompensacion,
    TipoEventoAuditoria,
    TipoIntercambio,
    TipoMovimientoBolsa,
)


def registrar_auditoria(tipo_evento, usuario, entidad, id_entidad, metadata=None):
    AuditoriaEvento.objects.create(
        tipo_evento=tipo_evento,
        usuario=usuario,
        entidad=entidad,
        id_entidad=str(id_entidad),
        metadata=metadata or {},
    )


def _ordenar_usuarios(usuario_1, usuario_2):
    if str(usuario_1.id) < str(usuario_2.id):
        return usuario_1, usuario_2
    return usuario_2, usuario_1


@transaction.atomic
def obtener_o_crear_saldo(usuario_1, usuario_2):
    usuario_a, usuario_b = _ordenar_usuarios(usuario_1, usuario_2)
    saldo, _ = BolsaDiasSaldo.objects.get_or_create(usuario_a=usuario_a, usuario_b=usuario_b)
    return BolsaDiasSaldo.objects.select_for_update().get(id=saldo.id)


def obtener_deuda(deudor, acreedor):
    usuario_a, usuario_b = _ordenar_usuarios(deudor, acreedor)
    saldo = BolsaDiasSaldo.objects.filter(usuario_a=usuario_a, usuario_b=usuario_b).first()
    if not saldo:
        return 0

    if acreedor.id == saldo.usuario_a_id and deudor.id == saldo.usuario_b_id:
        return saldo.saldo_dias_a_favor_de_a
    if acreedor.id == saldo.usuario_b_id and deudor.id == saldo.usuario_a_id:
        return saldo.saldo_dias_a_favor_de_b
    return 0


@transaction.atomic
def incrementar_deuda(deudor, acreedor, dias, solicitud=None):
    saldo = obtener_o_crear_saldo(deudor, acreedor)

    if acreedor.id == saldo.usuario_a_id and deudor.id == saldo.usuario_b_id:
        saldo.saldo_dias_a_favor_de_a += dias
    elif acreedor.id == saldo.usuario_b_id and deudor.id == saldo.usuario_a_id:
        saldo.saldo_dias_a_favor_de_b += dias
    else:
        raise serializers.ValidationError("No se pudo calcular el saldo para los usuarios.")

    saldo.save(update_fields=["saldo_dias_a_favor_de_a", "saldo_dias_a_favor_de_b", "ultima_actualizacion"])

    BolsaDiasMovimiento.objects.create(
        saldo=saldo,
        origen_usuario=deudor,
        destino_usuario=acreedor,
        dias=dias,
        tipo=TipoMovimientoBolsa.GENERA_DEUDA,
        solicitud_intercambio=solicitud,
    )

    registrar_auditoria(
        tipo_evento=TipoEventoAuditoria.ACTUALIZAR_BOLSA,
        usuario=deudor,
        entidad="bolsa",
        id_entidad=saldo.id,
        metadata={
            "accion": "genera_deuda",
            "deudor_id": str(deudor.id),
            "acreedor_id": str(acreedor.id),
            "dias": dias,
        },
    )


@transaction.atomic
def compensar_deuda(deudor, acreedor, dias, solicitud=None):
    saldo = obtener_o_crear_saldo(deudor, acreedor)

    if acreedor.id == saldo.usuario_a_id and deudor.id == saldo.usuario_b_id:
        if saldo.saldo_dias_a_favor_de_a < dias:
            raise serializers.ValidationError("No se puede compensar mas dias de los adeudados.")
        saldo.saldo_dias_a_favor_de_a -= dias
    elif acreedor.id == saldo.usuario_b_id and deudor.id == saldo.usuario_a_id:
        if saldo.saldo_dias_a_favor_de_b < dias:
            raise serializers.ValidationError("No se puede compensar mas dias de los adeudados.")
        saldo.saldo_dias_a_favor_de_b -= dias
    else:
        raise serializers.ValidationError("No se pudo calcular el saldo para los usuarios.")

    saldo.save(update_fields=["saldo_dias_a_favor_de_a", "saldo_dias_a_favor_de_b", "ultima_actualizacion"])

    BolsaDiasMovimiento.objects.create(
        saldo=saldo,
        origen_usuario=deudor,
        destino_usuario=acreedor,
        dias=dias,
        tipo=TipoMovimientoBolsa.COMPENSA_DEUDA,
        solicitud_intercambio=solicitud,
    )

    registrar_auditoria(
        tipo_evento=TipoEventoAuditoria.ACTUALIZAR_BOLSA,
        usuario=deudor,
        entidad="bolsa",
        id_entidad=saldo.id,
        metadata={
            "accion": "compensa_deuda",
            "deudor_id": str(deudor.id),
            "acreedor_id": str(acreedor.id),
            "dias": dias,
        },
    )


def _validar_solicitud_pendiente(solicitud):
    if solicitud.estado != EstadoSolicitud.PENDIENTE:
        raise serializers.ValidationError("Solo se pueden aceptar solicitudes pendientes.")


def _asignaciones_semana(usuario, semana):
    return list(
        AsignacionTarde.objects.select_for_update()
        .filter(usuario=usuario, semana=semana)
        .order_by("dia")
    )


def _hay_solape(semana, dia, usuario, excluir_ids=None):
    qs = AsignacionTarde.objects.filter(semana=semana, dia=dia, usuario=usuario)
    if excluir_ids:
        qs = qs.exclude(id__in=excluir_ids)
    return qs.exists()


def _obtener_flujo_transferencia(solicitud):
    origen_pertenece_a_solicitante = not (
        solicitud.es_compensacion
        and solicitud.rol_solicitante_compensacion == RolSolicitanteCompensacion.DEUDOR
    )
    if origen_pertenece_a_solicitante:
        return solicitud.solicitante, solicitud.receptor
    return solicitud.receptor, solicitud.solicitante


def _obtener_roles_compensacion(solicitud):
    if solicitud.rol_solicitante_compensacion == RolSolicitanteCompensacion.DEUDOR:
        return solicitud.solicitante, solicitud.receptor
    return solicitud.receptor, solicitud.solicitante


@transaction.atomic
def aceptar_intercambio(solicitud, actor):
    _validar_solicitud_pendiente(solicitud)

    if actor.id != solicitud.receptor_id:
        raise serializers.ValidationError("Solo el receptor puede aceptar la solicitud.")

    origen_propietario, origen_receptor = _obtener_flujo_transferencia(solicitud)

    origen = AsignacionTarde.objects.select_for_update().select_related("semana", "usuario").get(
        id=solicitud.asignacion_origen_id
    )

    dias_transferidos = 0

    if solicitud.tipo == TipoIntercambio.DIA:
        if origen.usuario_id != origen_propietario.id:
            raise serializers.ValidationError("La asignacion origen ya no pertenece al usuario esperado.")

        destino = None
        if solicitud.asignacion_destino_id:
            destino = AsignacionTarde.objects.select_for_update().get(id=solicitud.asignacion_destino_id)

        if destino:
            if destino.usuario_id != origen_receptor.id:
                raise serializers.ValidationError(
                    "La asignacion destino ya no pertenece al usuario contraparte."
                )

            excluir_ids = [origen.id, destino.id]
            if _hay_solape(
                semana=origen.semana,
                dia=origen.dia,
                usuario=origen_receptor,
                excluir_ids=excluir_ids,
            ):
                raise serializers.ValidationError(
                    "El receptor ya tiene un turno de tarde en el dia origen."
                )

            if _hay_solape(
                semana=destino.semana,
                dia=destino.dia,
                usuario=origen_propietario,
                excluir_ids=excluir_ids,
            ):
                raise serializers.ValidationError(
                    "El solicitante ya tiene un turno de tarde en el dia destino."
                )

            dia_origen_real = origen.dia
            requiere_pivote_temporal = (
                origen.semana_id == destino.semana_id and origen.dia == destino.dia
            )

            if requiere_pivote_temporal:
                origen.dia = f"tmpdia_{str(origen.id).replace('-', '')[:10]}"[:20]
                origen.save(update_fields=["dia"])

            destino.usuario = origen_propietario
            destino.estado = EstadoAsignacion.INTERCAMBIADO
            destino.save(update_fields=["usuario", "estado"])

            origen.usuario = origen_receptor
            origen.estado = EstadoAsignacion.INTERCAMBIADO
            if requiere_pivote_temporal:
                origen.dia = dia_origen_real
                origen.save(update_fields=["usuario", "estado", "dia"])
            else:
                origen.save(update_fields=["usuario", "estado"])
        else:
            if _hay_solape(
                semana=origen.semana,
                dia=origen.dia,
                usuario=origen_receptor,
                excluir_ids=[origen.id],
            ):
                raise serializers.ValidationError(
                    "El receptor ya tiene un turno de tarde en ese dia y semana."
                )
            origen.usuario = origen_receptor
            origen.estado = EstadoAsignacion.INTERCAMBIADO
            origen.save(update_fields=["usuario", "estado"])

        dias_transferidos = 1

    else:
        semana_origen = origen.semana
        origen_items = _asignaciones_semana(origen_propietario, semana_origen)
        if not origen_items:
            raise serializers.ValidationError("No hay asignaciones semanales para intercambiar.")

        if solicitud.asignacion_destino_id:
            destino_ref = AsignacionTarde.objects.select_for_update().get(id=solicitud.asignacion_destino_id)
            if destino_ref.usuario_id != origen_receptor.id:
                raise serializers.ValidationError(
                    "La asignacion destino debe pertenecer a la contraparte."
                )

            semana_destino = destino_ref.semana
            destino_items = _asignaciones_semana(origen_receptor, semana_destino)
            if not destino_items:
                raise serializers.ValidationError(
                    "La contraparte no tiene asignaciones semanales para intercambio inmediato."
                )

            if semana_origen.id == semana_destino.id:
                mapa_origen = {item.dia: item for item in origen_items}
                mapa_destino = {item.dia: item for item in destino_items}

                if set(mapa_origen.keys()) != set(mapa_destino.keys()):
                    raise serializers.ValidationError(
                        "Para intercambio semanal inmediato en la misma semana ambos usuarios deben tener los mismos dias asignados."
                    )

                # Evita colision de unique_together(semana, usuario, dia) durante el swap.
                # 1) Mover temporalmente dias de origen a valores pivot.
                for index, (dia, asignacion_origen) in enumerate(mapa_origen.items()):
                    asignacion_origen.dia = f"tmp_{index}_{dia}"[:20]
                AsignacionTarde.objects.bulk_update(origen_items, ["dia"])

                # 2) Mover destinos al solicitante en sus dias definitivos.
                for asignacion_destino in destino_items:
                    asignacion_destino.usuario = origen_propietario
                    asignacion_destino.estado = EstadoAsignacion.INTERCAMBIADO
                AsignacionTarde.objects.bulk_update(destino_items, ["usuario", "estado"])

                # 3) Restaurar dias originales de origen y moverlos al receptor.
                for dia, asignacion_origen in mapa_origen.items():
                    asignacion_origen.usuario = origen_receptor
                    asignacion_origen.dia = dia
                    asignacion_origen.estado = EstadoAsignacion.INTERCAMBIADO
                AsignacionTarde.objects.bulk_update(origen_items, ["usuario", "dia", "estado"])
            else:
                for asignacion in origen_items:
                    if _hay_solape(
                        semana=semana_origen,
                        dia=asignacion.dia,
                        usuario=origen_receptor,
                        excluir_ids=[asignacion.id],
                    ):
                        raise serializers.ValidationError(
                            "La contraparte ya tiene un turno en la semana origen para alguno de los dias."
                        )

                for asignacion in destino_items:
                    if _hay_solape(
                        semana=semana_destino,
                        dia=asignacion.dia,
                        usuario=origen_propietario,
                        excluir_ids=[asignacion.id],
                    ):
                        raise serializers.ValidationError(
                            "El solicitante ya tiene un turno en la semana destino para alguno de los dias."
                        )

                for asignacion in origen_items:
                    asignacion.usuario = origen_receptor
                    asignacion.estado = EstadoAsignacion.INTERCAMBIADO
                AsignacionTarde.objects.bulk_update(origen_items, ["usuario", "estado"])

                for asignacion in destino_items:
                    asignacion.usuario = origen_propietario
                    asignacion.estado = EstadoAsignacion.INTERCAMBIADO
                AsignacionTarde.objects.bulk_update(destino_items, ["usuario", "estado"])
        else:
            for asignacion in origen_items:
                if _hay_solape(
                    semana=semana_origen,
                    dia=asignacion.dia,
                    usuario=origen_receptor,
                    excluir_ids=[asignacion.id],
                ):
                    raise serializers.ValidationError(
                        "El receptor tiene solape en al menos uno de los dias de la semana."
                    )

            for asignacion in origen_items:
                asignacion.usuario = origen_receptor
                asignacion.estado = EstadoAsignacion.INTERCAMBIADO

            AsignacionTarde.objects.bulk_update(origen_items, ["usuario", "estado"])

        dias_transferidos = len(origen_items)

    if solicitud.es_compensacion:
        deudor, acreedor = _obtener_roles_compensacion(solicitud)
        compensar_deuda(
            deudor=deudor,
            acreedor=acreedor,
            dias=dias_transferidos,
            solicitud=solicitud,
        )
    elif solicitud.modo_compensacion == "bolsa":
        incrementar_deuda(
            deudor=solicitud.solicitante,
            acreedor=solicitud.receptor,
            dias=dias_transferidos,
            solicitud=solicitud,
        )

    solicitud.estado = EstadoSolicitud.ACEPTADA
    solicitud.fecha_respuesta = timezone.now()
    solicitud.save(update_fields=["estado", "fecha_respuesta"])

    registrar_auditoria(
        tipo_evento=TipoEventoAuditoria.ACEPTAR_INTERCAMBIO,
        usuario=actor,
        entidad="solicitud",
        id_entidad=solicitud.id,
        metadata={
            "tipo": solicitud.tipo,
            "modo_compensacion": solicitud.modo_compensacion,
            "dias_transferidos": dias_transferidos,
            "es_compensacion": solicitud.es_compensacion,
        },
    )

    return dias_transferidos
