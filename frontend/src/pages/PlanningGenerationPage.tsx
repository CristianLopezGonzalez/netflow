import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { api } from "../api";
import { NoticeBanner } from "../components/common/NoticeBanner";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import type { GeneracionCalendarioResumen, Semana } from "../types";
import { asErrorMessage } from "../utils/formatters";

const monthNameFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  timeZone: "UTC",
});

const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: monthNameFormatter.format(new Date(Date.UTC(2026, index, 1))),
}));

const parseIsoDate = (value: string): Date => new Date(`${value}T00:00:00Z`);

const isWeekInsideMonthScope = (week: Semana, anio: number, mes: number): boolean => {
  const monthStart = new Date(Date.UTC(anio, mes - 1, 1));
  const monthEnd = new Date(Date.UTC(anio, mes, 0));
  const weekStart = parseIsoDate(week.fecha_inicio_semana);
  const weekEnd = parseIsoDate(week.fecha_fin_semana);
  return weekStart <= monthEnd && weekEnd >= monthStart;
};

export const PlanningGenerationPage = () => {
  const { user } = useAuth();
  const { users, weeks, selectedWeekId, setSelectedWeekId, reloadWeekDetail, reloadAll } = useAppData();

  const [autoMode, setAutoMode] = useState<"mes" | "anio">("mes");
  const [annualMode, setAnnualMode] = useState<"generar" | "editar">("generar");
  const [autoEmployeeCount, setAutoEmployeeCount] = useState(2);
  const [autoEmployeeIds, setAutoEmployeeIds] = useState<string[]>(["", ""]);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [autoLoadingTemplate, setAutoLoadingTemplate] = useState(false);
  const [autoError, setAutoError] = useState("");
  const [autoNotice, setAutoNotice] = useState("");
  const [autoSummary, setAutoSummary] = useState<GeneracionCalendarioResumen | null>(null);
  const publishCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const publishConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const [autoForm, setAutoForm] = useState({
    anio: new Date().getFullYear().toString(),
    mes: `${new Date().getMonth() + 1}`,
    estado: "borrador" as "borrador" | "publicado",
  });

  const canGenerate = user?.rol === "admin" || user?.rol === "supervisor";
  const availableEmployees = useMemo(
    () => users.filter((item) => item.activo && item.rol === "empleado"),
    [users],
  );
  const availableEmployeeCount = availableEmployees.length;
  const yearsWithCalendar = useMemo(
    () => [...new Set(weeks.map((item) => item.anio))].sort((left, right) => right - left),
    [weeks],
  );

  const selectedYear = useMemo(() => Number.parseInt(autoForm.anio, 10), [autoForm.anio]);
  const selectedMonth = useMemo(() => Number.parseInt(autoForm.mes, 10), [autoForm.mes]);

  const selectedScopeWeeks = useMemo(() => {
    if (Number.isNaN(selectedYear) || selectedYear < 2020 || selectedYear > 2100) {
      return [];
    }

    if (autoMode === "anio") {
      return weeks.filter((week) => week.anio === selectedYear);
    }

    if (Number.isNaN(selectedMonth) || selectedMonth < 1 || selectedMonth > 12) {
      return [];
    }

    return weeks.filter((week) => isWeekInsideMonthScope(week, selectedYear, selectedMonth));
  }, [autoMode, selectedMonth, selectedYear, weeks]);

  const selectedScopeDraftWeekIds = useMemo(
    () => selectedScopeWeeks.filter((week) => week.estado === "borrador").map((week) => week.id),
    [selectedScopeWeeks],
  );

  const selectedScopePublishedCount = useMemo(
    () => selectedScopeWeeks.filter((week) => week.estado === "publicado").length,
    [selectedScopeWeeks],
  );

  const selectedEmployeesFilled = useMemo(
    () => autoEmployeeIds.slice(0, autoEmployeeCount).filter((item) => item.trim().length > 0).length,
    [autoEmployeeCount, autoEmployeeIds],
  );

  const scopeLabel = useMemo(() => {
    const yearLabel = Number.isNaN(selectedYear) ? "--" : `${selectedYear}`;
    if (autoMode === "anio") {
      return `Anio ${yearLabel}`;
    }

    const monthLabel = monthOptions.find((option) => option.value === selectedMonth)?.label ?? `Mes ${autoForm.mes}`;
    return `${monthLabel} ${yearLabel}`;
  }, [autoForm.mes, autoMode, selectedMonth, selectedYear]);

  const nextStepHint = useMemo(() => {
    if (autoForm.estado === "publicado") {
      return "La ejecucion saldra publicada directamente. Puedes usar recalculo para ajustar la rotacion.";
    }
    if (selectedScopeDraftWeekIds.length > 0) {
      return "Despues de generar o recalcular, publica los borradores del alcance para que queden visibles al equipo.";
    }
    return "Configura alcance y equipo, ejecuta la generacion y revisa el resumen antes de publicar.";
  }, [autoForm.estado, selectedScopeDraftWeekIds.length]);

  useEffect(() => {
    const monthMax = Math.min(4, Math.max(1, availableEmployees.length || 1));
    const yearMax = Math.max(1, availableEmployees.length || 1);
    const maxForMode = autoMode === "mes" ? monthMax : yearMax;
    setAutoEmployeeCount((current) => Math.max(1, Math.min(current, maxForMode)));
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

  const validateStep1 = (): boolean => {
    const anio = selectedYear;
    const mes = selectedMonth;

    if (Number.isNaN(anio) || anio < 2020 || anio > 2100) {
      setAutoError("Paso 1: indica un anio valido entre 2020 y 2100.");
      return false;
    }

    if (autoMode === "mes" && (Number.isNaN(mes) || mes < 1 || mes > 12)) {
      setAutoError("Paso 1: selecciona un mes valido.");
      return false;
    }

    if (autoMode === "anio" && annualMode === "editar" && !weeks.some((week) => week.anio === anio)) {
      setAutoError("Paso 1: no existe calendario anual para ese anio. Genera primero el anio completo.");
      return false;
    }

    return true;
  };

  const validateStep2 = (): boolean => {
    const maxEmployees =
      autoMode === "mes"
        ? Math.min(4, Math.max(1, availableEmployees.length || 1))
        : Math.max(1, availableEmployees.length || 1);

    if (autoEmployeeCount < 1 || autoEmployeeCount > maxEmployees) {
      setAutoError(
        autoMode === "mes"
          ? "Paso 2: en generacion mensual la cantidad de empleados debe estar entre 1 y 4."
          : `Paso 2: la cantidad de empleados debe estar entre 1 y ${maxEmployees}.`,
      );
      return false;
    }

    const selectedEmployees = autoEmployeeIds
      .slice(0, autoEmployeeCount)
      .filter((item) => item.trim().length > 0);

    if (selectedEmployees.length !== autoEmployeeCount) {
      setAutoError("Paso 2: selecciona todos los empleados indicados.");
      return false;
    }

    const uniqueEmployees = new Set(selectedEmployees);
    if (uniqueEmployees.size !== selectedEmployees.length) {
      setAutoError("Paso 2: no puedes repetir empleados en la lista de generacion.");
      return false;
    }

    return true;
  };

  const goToStep = (targetStep: 1 | 2 | 3) => {
    setAutoError("");
    if (targetStep === 1) {
      setCurrentStep(1);
      return;
    }

    if (!validateStep1()) {
      setCurrentStep(1);
      return;
    }

    if (targetStep === 2) {
      setCurrentStep(2);
      return;
    }

    if (!validateStep2()) {
      setCurrentStep(2);
      return;
    }

    setCurrentStep(3);
  };

  const goToStep2 = () => {
    goToStep(2);
  };

  const goToStep3 = () => {
    goToStep(3);
  };

  const handleLoadYearTemplate = async () => {
    setAutoError("");
    setAutoNotice("");

    const anio = selectedYear;
    if (Number.isNaN(anio) || anio < 2020 || anio > 2100) {
      setAutoError("Debes indicar un anio valido para cargar plantilla.");
      return;
    }

    if (!weeks.some((week) => week.anio === anio)) {
      setAutoError("No existe calendario anual generado para ese anio.");
      return;
    }

    setAutoLoadingTemplate(true);

    try {
      const rotation = await api.semanasRotacion();
      const yearRows = rotation.filter((item) => item.anio === anio);

      const totalsByEmployee = new Map<string, number>();
      for (const row of yearRows) {
        for (const employee of row.empleados) {
          totalsByEmployee.set(
            employee.usuario_id,
            (totalsByEmployee.get(employee.usuario_id) ?? 0) + employee.total_dias,
          );
        }
      }

      const employeeIds = [...totalsByEmployee.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([employeeId]) => employeeId)
        .filter((employeeId) => availableEmployees.some((item) => item.id === employeeId));

      if (employeeIds.length === 0) {
        setAutoError("No se han detectado empleados asignados para ese anio.");
        return;
      }

      setAutoEmployeeCount(employeeIds.length);
      setAutoEmployeeIds(employeeIds);
      setAutoNotice(
        `Plantilla anual cargada con ${employeeIds.length} empleado(s). Ajusta la lista y recalcula.`,
      );
    } catch (error) {
      setAutoError(asErrorMessage(error));
    } finally {
      setAutoLoadingTemplate(false);
    }
  };

  const handleAutoGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAutoError("");
    setAutoNotice("");

    const anio = selectedYear;
    const mes = selectedMonth;

    if (!validateStep1()) {
      setCurrentStep(1);
      return;
    }

    if (!validateStep2()) {
      setCurrentStep(2);
      return;
    }

    const selectedEmployees = autoEmployeeIds
      .slice(0, autoEmployeeCount)
      .filter((item) => item.trim().length > 0);

    setAutoBusy(true);

    try {
      const resumen =
        autoMode === "mes"
          ? await api.generarCalendarioMes({
              anio,
              mes,
              empleado_ids: selectedEmployees,
              estado: autoForm.estado,
              estrategia_conflicto: "replace",
            })
          : await api.generarCalendarioAnio({
              anio,
              empleado_ids: selectedEmployees,
              estado: autoForm.estado,
              estrategia_conflicto: "replace",
            });

      setAutoSummary(resumen);
      setAutoNotice(
        autoMode === "anio" && annualMode === "editar"
          ? `Recalculo anual completado. Semanas objetivo: ${resumen.semanas_objetivo}, creadas: ${resumen.semanas_creadas}, actualizadas: ${resumen.semanas_actualizadas}.`
          : `Generacion completada. Semanas objetivo: ${resumen.semanas_objetivo}, creadas: ${resumen.semanas_creadas}, actualizadas: ${resumen.semanas_actualizadas}.`,
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

  const handlePublishScopeDrafts = useCallback(async () => {
    setAutoError("");
    setAutoNotice("");

    if (selectedScopeDraftWeekIds.length === 0) {
      setAutoError(
        autoMode === "mes"
          ? "No hay semanas en borrador para publicar en el mes seleccionado."
          : "No hay semanas en borrador para publicar en el anio seleccionado.",
      );
      return;
    }

    setPublishBusy(true);

    try {
      const results = await Promise.allSettled(
        selectedScopeDraftWeekIds.map((weekId) => api.publicarSemana(weekId)),
      );

      const okCount = results.filter((item) => item.status === "fulfilled").length;
      const failCount = results.length - okCount;

      await reloadAll();
      if (selectedWeekId) {
        await reloadWeekDetail(selectedWeekId);
      }

      if (failCount > 0) {
        setAutoError(
          `Se publicaron ${okCount} semana(s), pero ${failCount} fallaron. Revisa permisos o refresca e intenta de nuevo.`,
        );
        return;
      }

      setAutoNotice(`Publicadas ${okCount} semana(s) en borrador del alcance seleccionado.`);
    } catch (error) {
      setAutoError(asErrorMessage(error));
    } finally {
      setPublishBusy(false);
    }
  }, [autoMode, reloadAll, reloadWeekDetail, selectedScopeDraftWeekIds, selectedWeekId]);

  const requestPublishScopeDrafts = () => {
    setAutoError("");
    setAutoNotice("");

    if (selectedScopeDraftWeekIds.length === 0) {
      setAutoError(
        autoMode === "mes"
          ? "No hay semanas en borrador para publicar en el mes seleccionado."
          : "No hay semanas en borrador para publicar en el anio seleccionado.",
      );
      return;
    }

    setPublishConfirmOpen(true);
  };

  const confirmPublishScopeDrafts = useCallback(async () => {
    setPublishConfirmOpen(false);
    await handlePublishScopeDrafts();
  }, [handlePublishScopeDrafts]);

  useEffect(() => {
    if (!publishConfirmOpen) {
      return;
    }

    const cancelButton = publishCancelButtonRef.current;
    const confirmButton = publishConfirmButtonRef.current;
    cancelButton?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPublishConfirmOpen(false);
        return;
      }

      if (event.key === "Tab" && cancelButton && confirmButton) {
        const active = document.activeElement;
        if (!event.shiftKey && active === confirmButton) {
          event.preventDefault();
          cancelButton.focus();
        }
        if (event.shiftKey && active === cancelButton) {
          event.preventDefault();
          confirmButton.focus();
        }
      }

      if (event.key === "Enter" && !publishBusy) {
        const active = document.activeElement;
        if (active === cancelButton) {
          event.preventDefault();
          setPublishConfirmOpen(false);
        }
        if (active === confirmButton) {
          event.preventDefault();
          void confirmPublishScopeDrafts();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [confirmPublishScopeDrafts, publishBusy, publishConfirmOpen]);

  if (!canGenerate) {
    return (
      <article className="glass-card float-in p-5">
        <NoticeBanner
          kind="info"
          message="Solo admin o supervisor pueden generar automaticamente el calendario."
        />
      </article>
    );
  }

  return (
    <article className="glass-card float-in p-5">
      <h2 className="text-xl font-bold">Generacion automatica</h2>
      <p className="mt-1 text-sm text-[var(--primary-400)]">
        Flujo guiado para configurar alcance, ajustar equipo y publicar la planificacion.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="panel p-3">
          <p className="stat-label">Alcance activo</p>
          <p className="mt-1 text-sm font-bold">{scopeLabel}</p>
        </article>

        <article className="panel p-3">
          <p className="stat-label">Semanas en alcance</p>
          <p className="mt-1 text-lg font-bold">{selectedScopeWeeks.length}</p>
        </article>

        <article className="panel p-3">
          <p className="stat-label">Estado actual</p>
          <p className="mt-1 text-sm font-semibold text-[var(--primary-200)]">
            Pub. {selectedScopePublishedCount} · Borr. {selectedScopeDraftWeekIds.length}
          </p>
        </article>

        <article className="panel p-3">
          <p className="stat-label">Equipo configurado</p>
          <p className="mt-1 text-sm font-semibold text-[var(--primary-200)]">
            {selectedEmployeesFilled}/{autoEmployeeCount} empleado(s)
          </p>
        </article>
      </div>

      <form onSubmit={handleAutoGenerate} className="glass-panel mt-4 space-y-4 p-4">
        <div className="grid gap-2 md:grid-cols-3">
          {[1, 2, 3].map((step) => {
            const isActive = currentStep === step;
            const isCompleted = currentStep > step;

            return (
              <button
                key={`wizard-step-${step}`}
                type="button"
                onClick={() => goToStep(step as 1 | 2 | 3)}
                aria-current={isActive ? "step" : undefined}
                className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
                  isActive
                    ? "bg-[var(--primary-700)] border-[var(--primary-600)] text-white shadow-sm"
                    : isCompleted
                      ? "bg-emerald-900/20 border-emerald-900/30 text-emerald-400"
                      : "bg-[var(--color-surface-hover)] border-[var(--color-surface-border)] text-[var(--primary-500)]"
                }`}
              >
                Paso {step}
              </button>
            );
          })}
        </div>

        {currentStep === 1 && (
        <section className="glass-soft p-3">
          <p className="text-[10px] font-black uppercase tracking-wide text-[var(--primary-500)]">Paso 1 · Alcance y modo</p>

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

          {autoMode === "anio" && (
            <div className="mt-3 block">
              <div className="inline-flex rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-1">
                <button
                  type="button"
                  onClick={() => setAnnualMode("generar")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    annualMode === "generar" ? "bg-[var(--primary-700)] text-white shadow-sm" : "text-[var(--primary-400)] hover:text-white"
                  }`}
                >
                  Nuevo anual
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAnnualMode("editar");
                    if (yearsWithCalendar.length > 0 && !yearsWithCalendar.includes(selectedYear)) {
                      setAutoForm((current) => ({
                        ...current,
                        anio: `${yearsWithCalendar[0]}`,
                      }));
                    }
                  }}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    annualMode === "editar" ? "bg-[var(--primary-700)] text-white shadow-sm" : "text-[var(--primary-400)] hover:text-white"
                  }`}
                >
                  Editar anual
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {autoMode === "anio" && annualMode === "editar" && yearsWithCalendar.length > 0 ? (
              <label className="block text-sm text-[var(--primary-300)]">
                Anio a editar
                <select
                  value={autoForm.anio}
                  onChange={(event) =>
                    setAutoForm((current) => ({
                      ...current,
                      anio: event.target.value,
                    }))
                  }
                  className="glass-input mt-1 w-full rounded-lg px-3 py-2"
                >
                  {yearsWithCalendar.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
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
            )}

            {autoMode === "mes" && (
              <label className="block text-sm text-[var(--primary-300)]">
                Mes
                <select
                  value={autoForm.mes}
                  onChange={(event) =>
                    setAutoForm((current) => ({
                      ...current,
                      mes: event.target.value,
                    }))
                  }
                  className="glass-input mt-1 w-full rounded-lg px-3 py-2"
                >
                  {monthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block text-sm text-[var(--primary-300)]">
              Estado inicial
              <select
                value={autoForm.estado}
                onChange={(event) =>
                  setAutoForm((current) => ({
                    ...current,
                    estado: event.target.value as "borrador" | "publicado",
                  }))
                }
                className="glass-input mt-1 w-full rounded-lg px-3 py-2"
              >
                <option value="borrador">borrador</option>
                <option value="publicado">publicado</option>
              </select>
            </label>
          </div>

          {autoMode === "anio" && annualMode === "editar" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleLoadYearTemplate()}
                disabled={autoLoadingTemplate || autoBusy}
                className="glass-button rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {autoLoadingTemplate ? "Cargando..." : "Cargar equipo del anio"}
              </button>
              <p className="text-[10px] uppercase font-black tracking-tight text-[var(--primary-500)]">
                Recupera el equipo del calendario para ajustar antes de recalcular.
              </p>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={goToStep2}
              className="glass-button glass-button-primary rounded-lg px-6 py-2 text-sm font-bold"
            >
              Paso 2 →
            </button>
          </div>
        </section>
        )}

        {currentStep === 2 && (
        <section className="glass-soft p-3">
          <p className="text-[10px] font-black uppercase tracking-wide text-[var(--primary-500)]">Paso 2 · Equipo de rotacion</p>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
              <p className="mt-1 text-[10px] font-medium text-[var(--primary-500)]">Activos disponibles: {availableEmployeeCount}</p>
            </label>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: autoEmployeeCount }).map((_, index) => (
              <label key={`auto-employee-${index}`} className="block text-sm text-[var(--primary-300)]">
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
                  className="glass-input mt-1 w-full rounded-lg px-3 py-2"
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

          <div className="mt-4 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="glass-button rounded-lg px-4 py-2 text-sm font-semibold"
            >
              ← Paso 1
            </button>
            <button
              type="button"
              onClick={goToStep3}
              className="glass-button glass-button-primary rounded-lg px-6 py-2 text-sm font-bold"
            >
              Paso 3 →
            </button>
          </div>
        </section>
        )}

        {currentStep === 3 && (
        <section className="glass-soft p-3">
          <p className="text-[10px] font-black uppercase tracking-wide text-[var(--primary-500)]">Paso 3 · Ejecutar y publicar</p>
          <p className="mt-2 text-xs font-medium text-[var(--primary-400)]">{nextStepHint}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="glass-button rounded-lg px-4 py-2 text-sm font-semibold"
            >
              ← Paso 2
            </button>

            <button
              type="submit"
              disabled={autoBusy || autoLoadingTemplate || publishBusy}
              className="glass-button glass-button-primary rounded-lg px-6 py-2.5 text-sm font-bold shadow-lg disabled:opacity-50"
            >
              {autoBusy
                ? "Ejecutando..."
                : autoMode === "mes"
                  ? "Generar plan mensual"
                  : annualMode === "editar"
                    ? "Recalcular plan anual"
                    : "Generar plan anual"}
            </button>

            <button
              type="button"
              onClick={requestPublishScopeDrafts}
              disabled={publishBusy || autoBusy || autoLoadingTemplate || selectedScopeDraftWeekIds.length === 0}
              className="glass-button rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {publishBusy
                ? "Publicando..."
                : autoMode === "mes"
                  ? "Publicar borradores del mes"
                  : "Publicar borradores del anio"}
            </button>
          </div>

          <p className="mt-2 text-xs text-slate-500">
            Borradores detectados en el alcance actual: {selectedScopeDraftWeekIds.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Si abres la confirmacion, usa Esc para cancelar y Enter sobre el boton enfocado para confirmar.
          </p>
        </section>
        )}

        <p className="text-xs text-slate-500">
          Regla activa: 1 empleado por semana laboral (lunes a viernes). En mensual el maximo es 4 empleados.
        </p>
        <p className="text-xs text-slate-500">
          Solo se permiten usuarios con rol empleado. Si necesitas seleccionar mas de {availableEmployeeCount},
          primero crea o activa mas empleados.
        </p>

        <div className="space-y-2">
          <NoticeBanner message={autoError} kind="error" />
          <NoticeBanner message={autoNotice} kind="success" />
        </div>

        {autoSummary && (
          <div className="glass-soft p-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">
              Resumen: {autoSummary.semanas_objetivo} objetivo, {autoSummary.semanas_creadas} creadas,
              {" "}
              {autoSummary.semanas_actualizadas} actualizadas.
            </p>
            <p>
              Asignaciones: {autoSummary.asignaciones_creadas} creadas,
              {" "}
              {autoSummary.asignaciones_reemplazadas} reemplazadas,
              {" "}
              {autoSummary.asignaciones_omitidas} omitidas.
            </p>
            <p>Conflictos reportados: {autoSummary.conflictos.length}</p>
          </div>
        )}
      </form>

      {publishConfirmOpen && (
        <div className="glass-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="glass-modal w-full max-w-lg rounded-2xl p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-scope-title"
            aria-describedby="publish-scope-description"
          >
            <h3 id="publish-scope-title" className="text-lg font-bold text-slate-900">
              Confirmar publicacion
            </h3>
            <p id="publish-scope-description" className="mt-2 text-sm text-slate-700">
              Vas a publicar {selectedScopeDraftWeekIds.length} semana(s) en borrador de {scopeLabel}.
              Esta accion las dejara visibles para el equipo.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPublishConfirmOpen(false)}
                ref={publishCancelButtonRef}
                className="glass-button rounded-lg px-4 py-2 text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmPublishScopeDrafts()}
                disabled={publishBusy}
                ref={publishConfirmButtonRef}
                className="glass-button glass-button-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Confirmar publicacion
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
};
