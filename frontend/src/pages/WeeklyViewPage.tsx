import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { api } from "../api";
import { NoticeBanner } from "../components/common/NoticeBanner";
import { WeekSelector } from "../components/common/WeekSelector";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import type { Asignacion, GeneracionCalendarioResumen } from "../types";
import { asErrorMessage, dayOrder, formatWeek } from "../utils/formatters";

const monthNameFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  timeZone: "UTC",
});

const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
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
          <h2 className="text-xl font-bold text-slate-900">Turnos semanales de tarde</h2>
          <p className="mt-1 text-sm text-slate-600">
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
            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
          >
            Actualizar
          </button>
        </div>
      </div>

      {canCreateWeek && (
        <form onSubmit={handleAutoGenerate} className="rounded-2xl border border-slate-300 bg-white/80 p-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            Generacion automatica
          </h3>

          <div className="mt-3 inline-flex rounded-xl border border-slate-300 bg-white p-1">
            <button
              type="button"
              onClick={() => setAutoMode("mes")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                autoMode === "mes" ? "bg-slate-900 text-white" : "text-slate-700"
              }`}
            >
              Generar mes
            </button>
            <button
              type="button"
              onClick={() => setAutoMode("anio")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                autoMode === "anio" ? "bg-slate-900 text-white" : "text-slate-700"
              }`}
            >
              Generar anio
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="block text-sm text-slate-700">
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
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                required
              />
            </label>

            {autoMode === "mes" && (
              <label className="block text-sm text-slate-700">
                Mes
                <select
                  value={autoForm.mes}
                  onChange={(event) =>
                    setAutoForm((current) => ({
                      ...current,
                      mes: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                >
                  {monthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block text-sm text-slate-700">
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
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                required
              />
              <p className="mt-1 text-xs text-slate-500">
                Empleados activos disponibles: {availableEmployeeCount}
              </p>
            </label>

            <label className="block text-sm text-slate-700">
              Estado semanas
              <select
                value={autoForm.estado}
                onChange={(event) =>
                  setAutoForm((current) => ({
                    ...current,
                    estado: event.target.value as "borrador" | "publicado",
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="borrador">borrador</option>
                <option value="publicado">publicado</option>
              </select>
            </label>

            <label className="block text-sm text-slate-700">
              Estrategia conflicto
              <select
                value={autoForm.estrategia_conflicto}
                onChange={(event) =>
                  setAutoForm((current) => ({
                    ...current,
                    estrategia_conflicto: event.target.value as "skip" | "replace",
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="replace">replace (regenerar y sustituir)</option>
                <option value="skip">skip (mantener existente)</option>
              </select>
            </label>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: autoEmployeeCount }).map((_, index) => (
              <label key={`auto-employee-${index}`} className="block text-sm text-slate-700">
                Empleado {index + 1}
                <select
                  value={autoEmployeeIds[index] ?? ""}
                  onChange={(event) =>
                    setAutoEmployeeIds((current) => {
                      const next = [...current];
                      next[index] = event.target.value;
                      return next;
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  required
                >
                  <option value="">Selecciona empleado</option>
                  {availableEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.nombre}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <p className="mt-2 text-xs text-slate-500">
            En anual puedes cambiar cantidad o lista de empleados y regenerar en cualquier momento.
            Si eliges replace, se recalcula la rotacion completa de las semanas objetivo.
          </p>
          <p className="text-xs text-slate-500">
            Solo se permiten usuarios con rol empleado. Si necesitas seleccionar mas de {availableEmployeeCount},
            primero crea/activa mas empleados.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={autoBusy}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {autoBusy
                ? "Generando..."
                : autoMode === "mes"
                  ? "Generar plan mensual"
                  : "Generar plan anual"}
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <NoticeBanner message={autoError} kind="error" />
            <NoticeBanner message={autoNotice} kind="success" />
          </div>

          {autoSummary && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">
                Resumen: {autoSummary.semanas_objetivo} objetivo, {autoSummary.semanas_creadas} creadas,
                {" "}
                {autoSummary.semanas_actualizadas} actualizadas.
              </p>
              <p>
                Asignaciones: {autoSummary.asignaciones_creadas} creadas, {autoSummary.asignaciones_reemplazadas}
                {" "}
                reemplazadas, {autoSummary.asignaciones_omitidas} omitidas.
              </p>
              <p>Conflictos reportados: {autoSummary.conflictos.length}</p>
            </div>
          )}
        </form>
      )}

      {selectedWeek && (
        <p className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-700">
          {formatWeek(selectedWeek)}
        </p>
      )}

      <p className="text-sm text-slate-600">Semanas registradas: {weeks.length}</p>

      {weeks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {weeks.slice(0, 12).map((week) => (
            <button
              key={week.id}
              type="button"
              onClick={() => setSelectedWeekId(week.id)}
              className={`h-11 rounded-xl border-2 px-4 text-sm font-semibold ${
                selectedWeekId === week.id
                  ? "border-slate-800 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              Semana {week.numero_semana}/{week.anio}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {dayOrder.map((day) => (
          <article key={day} className="rounded-2xl border border-slate-300 bg-white/80 p-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{day}</h3>
            <div className="mt-2 space-y-2">
              {groupedByDay[day].length === 0 && (
                <p className="text-xs text-slate-500">Sin turno asignado</p>
              )}
              {groupedByDay[day].map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                  <p className="text-sm font-semibold text-slate-900">{item.usuario_detalle?.nombre}</p>
                  <p className="mono text-xs text-slate-600">
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
