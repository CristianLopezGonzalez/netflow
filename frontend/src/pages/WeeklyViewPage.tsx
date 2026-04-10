import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { api } from "../api";
import { NoticeBanner } from "../components/common/NoticeBanner";
import { WeekSelector } from "../components/common/WeekSelector";
import CustomSelect from "../components/common/CustomSelect";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import type { Asignacion, GeneracionCalendarioResumen } from "../types";
import { asErrorMessage, dayOrder, formatWeek } from "../utils/formatters";

const monthNameFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  timeZone: "UTC",
});

const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: (index + 1).toString(),
  label: monthNameFormatter.format(new Date(Date.UTC(2026, index, 1))),
}));

export const WeeklyViewPage = () => {
  const { user } = useAuth();
  const {
    users,
    weeks,
    selectedWeekId,
    setSelectedWeekId,
    weekAssignments,
    reloadWeekDetail,
    reloadAll,
  } = useAppData();

  const [autoMode, setAutoMode] = useState<"mes" | "anio">("mes");
  const [autoEmployeeCount, setAutoEmployeeCount] = useState(2);
  const [autoEmployeeIds, setAutoEmployeeIds] = useState<string[]>(["", ""]);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoError, setAutoError] = useState("");
  const [autoNotice, setAutoNotice] = useState("");
  const [autoSummary, setAutoSummary] = useState<GeneracionCalendarioResumen | null>(null);
  const [autoForm, setAutoForm] = useState({
    anio: new Date().getFullYear().toString(),
    mes: `${new Date().getMonth() + 1}`,
    estado: "borrador" as "borrador" | "publicado",
    estrategia_conflicto: "replace" as "skip" | "replace",
  });

  const canCreateWeek = user?.rol === "admin" || user?.rol === "supervisor";
  const availableEmployees = useMemo(
    () => users.filter((item) => item.activo && item.rol === "empleado"),
    [users],
  );
  const availableEmployeeCount = availableEmployees.length;

  const selectedWeek = useMemo(
    () => weeks.find((week) => week.id === selectedWeekId) ?? null,
    [weeks, selectedWeekId],
  );

  const groupedByDay = useMemo(() => {
    const grouped: Record<string, Asignacion[]> = {
      lunes: [],
      martes: [],
      miercoles: [],
      jueves: [],
      viernes: [],
    };

    for (const assignment of weekAssignments) {
      grouped[assignment.dia].push(assignment);
    }

    return grouped;
  }, [weekAssignments]);

  useEffect(() => {
    const monthMax = Math.min(4, Math.max(1, availableEmployees.length || 1));
    const yearMax = Math.max(1, availableEmployees.length || 1);
    const maxForMode = autoMode === "mes" ? monthMax : yearMax;
    setAutoEmployeeCount((current) => {
      const bounded = Math.max(1, Math.min(current, maxForMode));
      return bounded;
    });
  }, [autoMode, availableEmployees.length]);

  useEffect(() => {
    setAutoEmployeeIds((current) => {
      const next = [...current];
      if (next.length < autoEmployeeCount) {
        while (next.length < autoEmployeeCount) {
          next.push("");
        }
        return next;
      }
      if (next.length > autoEmployeeCount) {
        return next.slice(0, autoEmployeeCount);
      }
      return current;
    });
  }, [autoEmployeeCount]);

  const handleAutoGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAutoError("");
    setAutoNotice("");

    const anio = Number.parseInt(autoForm.anio, 10);
    const mes = Number.parseInt(autoForm.mes, 10);

    if (Number.isNaN(anio) || anio < 2020 || anio > 2100) {
      setAutoError("Debes indicar un anio valido entre 2020 y 2100.");
      return;
    }

    if (autoMode === "mes" && (Number.isNaN(mes) || mes < 1 || mes > 12)) {
      setAutoError("Debes seleccionar un mes valido.");
      return;
    }

    const maxEmployees =
      autoMode === "mes"
        ? Math.min(4, Math.max(1, availableEmployees.length || 1))
        : Math.max(1, availableEmployees.length || 1);
    if (autoEmployeeCount < 1 || autoEmployeeCount > maxEmployees) {
      setAutoError(
        autoMode === "mes"
          ? "Para generacion mensual la cantidad de empleados debe estar entre 1 y 4."
          : `La cantidad de empleados debe estar entre 1 y ${maxEmployees}.`,
      );
      return;
    }

    const selectedEmployees = autoEmployeeIds.slice(0, autoEmployeeCount).filter((item) => item.trim().length > 0);
    if (selectedEmployees.length !== autoEmployeeCount) {
      setAutoError("Debes seleccionar todos los empleados indicados.");
      return;
    }

    const uniqueEmployees = new Set(selectedEmployees);
    if (uniqueEmployees.size !== selectedEmployees.length) {
      setAutoError("No puedes repetir empleados en la lista de generacion.");
      return;
    }

    setAutoBusy(true);

    try {
      const resumen =
        autoMode === "mes"
          ? await api.generarCalendarioMes({
              anio,
              mes,
              empleado_ids: selectedEmployees,
              estado: autoForm.estado,
              estrategia_conflicto: autoForm.estrategia_conflicto,
            })
          : await api.generarCalendarioAnio({
              anio,
              empleado_ids: selectedEmployees,
              estado: autoForm.estado,
              estrategia_conflicto: autoForm.estrategia_conflicto,
            });

      setAutoSummary(resumen);
      setAutoNotice(
        `Generacion completada. Semanas objetivo: ${resumen.semanas_objetivo}, creadas: ${resumen.semanas_creadas}, actualizadas: ${resumen.semanas_actualizadas}.`,
      );

      await reloadAll();
      const firstWeekId = resumen.semanas_detalle[0]?.semana_id;
      if (firstWeekId) {
        setSelectedWeekId(firstWeekId);
        await reloadWeekDetail(firstWeekId);
      }
    } catch (error) {
      setAutoError(asErrorMessage(error));
    } finally {
      setAutoBusy(false);
    }
  };

  return (
    <section className="glass-card float-in space-y-4 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-bold">Turnos semanales de tarde</h2>
          <p className="mt-1 text-sm text-[var(--primary-400)]">
            {selectedWeek ? `Estado: ${selectedWeek.estado}` : "No hay semana seleccionada."}
          </p>
        </div>

        <div className="flex w-full max-w-lg flex-col gap-2 md:flex-row md:items-end">
          <div className="w-full md:flex-1">
            <WeekSelector
              weeks={weeks}
              selectedWeekId={selectedWeekId}
              onChange={setSelectedWeekId}
              label="Semana activa"
            />
          </div>
          <button
            type="button"
            onClick={() => void reloadWeekDetail(selectedWeekId)}
            className="glass-button h-10 rounded-lg px-4 text-sm font-semibold"
          >
            Actualizar
          </button>
        </div>
      </div>

      {canCreateWeek && (
        <form onSubmit={handleAutoGenerate} className="glass-panel p-4">
          <h3 className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--primary-500)]">
            Generacion automatica
          </h3>

          <div className="mt-3 inline-flex rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-1">
            <button
              type="button"
              onClick={() => setAutoMode("mes")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                autoMode === "mes" ? "bg-[var(--primary-700)] text-white shadow-sm" : "text-[var(--primary-400)] hover:text-white"
              }`}
            >
              Generar mes
            </button>
            <button
              type="button"
              onClick={() => setAutoMode("anio")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                autoMode === "anio" ? "bg-[var(--primary-700)] text-white shadow-sm" : "text-[var(--primary-400)] hover:text-white"
              }`}
            >
              Generar anio
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="block text-sm text-[var(--primary-300)]">
              Anio
              <input
                type="number"
                min={2020}
                max={2100}
                value={autoForm.anio}
                onChange={(event) =>
                  setAutoForm((current) => ({
                    ...current,
                    anio: event.target.value,
                  }))
                }
                className="glass-input mt-1 w-full rounded-lg px-3 py-2"
                required
              />
            </label>

            {autoMode === "mes" && (
              <div className="block text-sm text-[var(--primary-300)]">
                Mes
                <CustomSelect
                  value={autoForm.mes}
                  onChange={(val) =>
                    setAutoForm((current) => ({
                      ...current,
                      mes: String(val),
                    }))
                  }
                  options={monthOptions}
                  className="mt-1"
                />
              </div>
            )}

            <label className="block text-sm text-[var(--primary-300)]">
              Cantidad empleados
              <input
                type="number"
                min={1}
                max={
                  autoMode === "mes"
                    ? Math.min(4, Math.max(1, availableEmployees.length || 1))
                    : Math.max(1, availableEmployees.length || 1)
                }
                value={autoEmployeeCount}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  if (Number.isNaN(parsed)) {
                    setAutoEmployeeCount(1);
                    return;
                  }
                  const max =
                    autoMode === "mes"
                      ? Math.min(4, Math.max(1, availableEmployees.length || 1))
                      : Math.max(1, availableEmployees.length || 1);
                  setAutoEmployeeCount(Math.max(1, Math.min(parsed, max)));
                }}
                className="glass-input mt-1 w-full rounded-lg px-3 py-2"
                required
              />
              <p className="mt-1 text-[10px] text-[var(--primary-500)] font-medium">
                Disponibles: {availableEmployeeCount}
              </p>
            </label>

            <div className="block text-sm text-[var(--primary-300)]">
              Estado semanas
              <CustomSelect
                value={autoForm.estado}
                onChange={(val) =>
                  setAutoForm((current) => ({
                    ...current,
                    estado: val as "borrador" | "publicado",
                  }))
                }
                options={[
                  { value: "borrador", label: "Borrador" },
                  { value: "publicado", label: "Publicado" },
                ]}
                className="mt-1"
              />
            </div>

            <div className="block text-sm text-[var(--primary-300)]">
              Estrategia conflicto
              <CustomSelect
                value={autoForm.estrategia_conflicto}
                onChange={(val) =>
                  setAutoForm((current) => ({
                    ...current,
                    estrategia_conflicto: val as "skip" | "replace",
                  }))
                }
                options={[
                  { value: "replace", label: "Replace (sustituir)" },
                  { value: "skip", label: "Skip (mantener)" },
                ]}
                className="mt-1"
              />
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: autoEmployeeCount }).map((_, index) => (
              <div key={`auto-employee-${index}`} className="block text-sm text-[var(--primary-300)]">
                Empleado {index + 1}
                <CustomSelect
                  value={autoEmployeeIds[index] ?? ""}
                  onChange={(val) =>
                    setAutoEmployeeIds((current) => {
                      const next = [...current];
                      next[index] = String(val);
                      return next;
                    })
                  }
                  options={[
                    { value: "", label: "Selecciona empleado" },
                    ...availableEmployees.map(e => ({ value: e.id, label: e.nombre }))
                  ]}
                  className="mt-1"
                />
              </div>
            ))}
          </div>

          <p className="mt-3 text-[10px] text-[var(--primary-500)] font-medium max-w-2xl">
            En anual puedes cambiar cantidad o lista de empleados y regenerar.
            Replace recalcula la rotacion completa. Solo se permiten usuarios con rol empleado.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={autoBusy}
              className="glass-button glass-button-primary rounded-lg px-6 py-2.5 text-sm font-bold disabled:opacity-50"
            >
              {autoBusy
                ? "Generando..."
                : autoMode === "mes"
                  ? "Generar plan mensual"
                  : "Generar plan anual"}
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <NoticeBanner message={autoError} kind="error" />
            <NoticeBanner message={autoNotice} kind="success" />
          </div>

          {autoSummary && (
            <div className="mt-4 glass-soft border border-[var(--color-surface-border)] rounded-xl p-4 text-sm">
              <p className="font-bold text-[var(--primary-50)] mb-1">
                Resumen de generacion
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[var(--primary-400)]">
                <p>Semanas objetivo: <span className="text-[var(--primary-200)] font-semibold">{autoSummary.semanas_objetivo}</span></p>
                <p>Asignaciones creadas: <span className="text-emerald-400 font-semibold">{autoSummary.asignaciones_creadas}</span></p>
                <p>Semanas creadas: <span className="text-[var(--primary-200)] font-semibold">{autoSummary.semanas_creadas}</span></p>
                <p>Asignaciones reemplazadas: <span className="text-amber-400 font-semibold">{autoSummary.asignaciones_reemplazadas}</span></p>
                <p>Semanas actualizadas: <span className="text-[var(--primary-200)] font-semibold">{autoSummary.semanas_actualizadas}</span></p>
                <p>Conflictos: <span className="text-rose-400 font-semibold">{autoSummary.conflictos.length}</span></p>
              </div>
            </div>
          )}
        </form>
      )}

      {selectedWeek && (
        <div className="glass-chip px-3 py-2 text-sm font-bold inline-flex">
          {formatWeek(selectedWeek)}
        </div>
      )}

      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--primary-500)]">Semanas registradas: {weeks.length}</p>

      {weeks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {weeks.slice(0, 12).map((week) => (
            <button
              key={week.id}
              type="button"
              onClick={() => setSelectedWeekId(week.id)}
              className={`h-10 rounded-lg border px-4 text-xs font-bold transition-all shadow-sm ${
                selectedWeekId === week.id
                  ? "bg-[var(--primary-700)] border-[var(--primary-600)] text-white shadow-lg"
                  : "bg-[var(--color-surface-hover)] border-[var(--color-surface-border)] text-[var(--primary-400)] hover:text-white"
              }`}
            >
              W{week.numero_semana}/{week.anio}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {dayOrder.map((day) => (
          <article key={day} className="panel p-3">
            <h3 className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--primary-500)]">{day}</h3>
            <div className="mt-3 space-y-2">
              {groupedByDay[day].length === 0 && (
                <p className="text-xs text-[var(--primary-600)] italic">Sin turnos</p>
              )}
              {groupedByDay[day].map((item) => (
                <div key={item.id} className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 py-2.5 shadow-sm">
                  <p className="text-sm font-bold text-[var(--primary-100)]">{item.usuario_detalle?.nombre}</p>
                  <p className="mono mt-0.5 text-[10px] font-medium text-[var(--primary-400)]">
                    {item.hora_inicio.slice(0, 5)} - {item.hora_fin.slice(0, 5)}
                  </p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
