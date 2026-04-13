import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../api";
import { NoticeBanner } from "../components/common/NoticeBanner";
import { WeekSelector } from "../components/common/WeekSelector";
import CustomSelect from "../components/common/CustomSelect";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import type { Asignacion, DiaSemana, SemanaRotacionResumen } from "../types";
import { asErrorMessage, dayOrder, formatWeek } from "../utils/formatters";

const emptyDayGroups: Record<DiaSemana, Asignacion[]> = {
  lunes: [],
  martes: [],
  miercoles: [],
  jueves: [],
  viernes: [],
};

const weekdayHeader = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

const monthTitleFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const parseIsoDate = (value: string): Date => {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day));
};

const addUtcDays = (date: Date, days: number): Date => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const toIsoDate = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDisplayName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Sin asignar";
  }

  const parts = trimmed.split(/\s+/);
  return parts.slice(0, 2).join(" ");
};

const getDiaSemanaFromDate = (date: Date): DiaSemana | null => {
  const weekDay = date.getUTCDay();
  if (weekDay === 1) {
    return "lunes";
  }
  if (weekDay === 2) {
    return "martes";
  }
  if (weekDay === 3) {
    return "miercoles";
  }
  if (weekDay === 4) {
    return "jueves";
  }
  if (weekDay === 5) {
    return "viernes";
  }
  return null;
};

const buildMonthCells = (year: number, monthIndex: number): Array<Date | null> => {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const firstDayMondayIndex = (firstDay.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

  const cells: Array<Date | null> = [];

  for (let i = 0; i < firstDayMondayIndex; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(Date.UTC(year, monthIndex, day)));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

type EmployeeTone = {
  chip: string;
  badge: string;
  surface: string;
  text: string;
  ring: string;
};

const employeeTonePalette: EmployeeTone[] = [
  {
    chip: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/60 dark:bg-sky-900/35 dark:text-sky-100",
    badge: "bg-sky-100 text-sky-800 dark:bg-sky-900/55 dark:text-sky-100",
    surface: "border-sky-300 bg-sky-50/90 text-sky-900 dark:border-sky-500/65 dark:bg-sky-900/35 dark:text-sky-100",
    text: "text-sky-700 dark:text-sky-200",
    ring: "ring-sky-300 dark:ring-sky-500/70",
  },
  {
    chip: "border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-500/60 dark:bg-indigo-900/35 dark:text-indigo-100",
    badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/55 dark:text-indigo-100",
    surface: "border-indigo-300 bg-indigo-50/90 text-indigo-900 dark:border-indigo-500/65 dark:bg-indigo-900/35 dark:text-indigo-100",
    text: "text-indigo-700 dark:text-indigo-200",
    ring: "ring-indigo-300 dark:ring-indigo-500/70",
  },
  {
    chip: "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-500/60 dark:bg-violet-900/35 dark:text-violet-100",
    badge: "bg-violet-100 text-violet-800 dark:bg-violet-900/55 dark:text-violet-100",
    surface: "border-violet-300 bg-violet-50/90 text-violet-900 dark:border-violet-500/65 dark:bg-violet-900/35 dark:text-violet-100",
    text: "text-violet-700 dark:text-violet-200",
    ring: "ring-violet-300 dark:ring-violet-500/70",
  },
  {
    chip: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900 dark:border-fuchsia-500/60 dark:bg-fuchsia-900/35 dark:text-fuchsia-100",
    badge: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/55 dark:text-fuchsia-100",
    surface: "border-fuchsia-300 bg-fuchsia-50/90 text-fuchsia-900 dark:border-fuchsia-500/65 dark:bg-fuchsia-900/35 dark:text-fuchsia-100",
    text: "text-fuchsia-700 dark:text-fuchsia-200",
    ring: "ring-fuchsia-300 dark:ring-fuchsia-500/70",
  },
  {
    chip: "border-zinc-300 bg-zinc-50 text-zinc-900 dark:border-zinc-500/60 dark:bg-zinc-900/35 dark:text-zinc-100",
    badge: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-100",
    surface: "border-zinc-300 bg-zinc-50/90 text-zinc-900 dark:border-zinc-500/65 dark:bg-zinc-900/35 dark:text-zinc-100",
    text: "text-zinc-700 dark:text-zinc-200",
    ring: "ring-zinc-300 dark:ring-zinc-500/70",
  },
  {
    chip: "border-stone-300 bg-stone-50 text-stone-900 dark:border-stone-500/60 dark:bg-stone-900/35 dark:text-stone-100",
    badge: "bg-stone-100 text-stone-800 dark:bg-stone-800/70 dark:text-stone-100",
    surface: "border-stone-300 bg-stone-50/90 text-stone-900 dark:border-stone-500/65 dark:bg-stone-900/35 dark:text-stone-100",
    text: "text-stone-700 dark:text-stone-200",
    ring: "ring-stone-300 dark:ring-stone-500/70",
  },
  {
    chip: "border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-500/60 dark:bg-neutral-900/35 dark:text-neutral-100",
    badge: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800/70 dark:text-neutral-100",
    surface: "border-neutral-300 bg-neutral-50/90 text-neutral-900 dark:border-neutral-500/65 dark:bg-neutral-900/35 dark:text-neutral-100",
    text: "text-neutral-700 dark:text-neutral-200",
    ring: "ring-neutral-300 dark:ring-neutral-500/70",
  },
  {
    chip: "border-cyan-300 bg-cyan-50 text-cyan-900 dark:border-cyan-500/60 dark:bg-cyan-900/35 dark:text-cyan-100",
    badge: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/55 dark:text-cyan-100",
    surface: "border-cyan-300 bg-cyan-50/90 text-cyan-900 dark:border-cyan-500/65 dark:bg-cyan-900/35 dark:text-cyan-100",
    text: "text-cyan-700 dark:text-cyan-200",
    ring: "ring-cyan-300 dark:ring-cyan-500/70",
  },
  {
    chip: "border-purple-300 bg-purple-50 text-purple-900 dark:border-purple-500/60 dark:bg-purple-900/35 dark:text-purple-100",
    badge: "bg-purple-100 text-purple-800 dark:bg-purple-900/55 dark:text-purple-100",
    surface: "border-purple-300 bg-purple-50/90 text-purple-900 dark:border-purple-500/65 dark:bg-purple-900/35 dark:text-purple-100",
    text: "text-purple-700 dark:text-purple-200",
    ring: "ring-purple-300 dark:ring-purple-500/70",
  },
  {
    chip: "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-500/60 dark:bg-slate-900/35 dark:text-slate-100",
    badge: "bg-slate-100 text-slate-800 dark:bg-slate-800/70 dark:text-slate-100",
    surface: "border-slate-300 bg-slate-50/90 text-slate-900 dark:border-slate-500/65 dark:bg-slate-900/35 dark:text-slate-100",
    text: "text-slate-700 dark:text-slate-200",
    ring: "ring-slate-300 dark:ring-slate-500/70",
  },
];

const defaultEmployeeTone: EmployeeTone = {
  chip: "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-500/60 dark:bg-slate-900/35 dark:text-slate-100",
  badge: "bg-slate-100 text-slate-700 dark:bg-slate-800/70 dark:text-slate-100",
  surface: "border-slate-300 bg-slate-50/90 text-slate-900 dark:border-slate-500/65 dark:bg-slate-900/55 dark:text-slate-100",
  text: "text-slate-600 dark:text-slate-300",
  ring: "ring-slate-300 dark:ring-slate-500/70",
};

const collectUniqueEmployeeIds = (
  rotationSummary: SemanaRotacionResumen[],
  weekAssignments: Asignacion[],
  currentUserId?: string,
): string[] => {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const register = (employeeId?: string | null) => {
    if (!employeeId || employeeId === currentUserId || seen.has(employeeId)) {
      return;
    }

    seen.add(employeeId);
    ordered.push(employeeId);
  };

  for (const week of rotationSummary) {
    register(week.principal_usuario_id);

    for (const employee of week.empleados ?? []) {
      register(employee.usuario_id);
    }

    for (const day of week.dias ?? []) {
      register(day.usuario_id);

      for (const employee of day.usuarios ?? []) {
        register(employee.usuario_id);
      }
    }
  }

  for (const assignment of weekAssignments) {
    register(assignment.usuario);
  }

  return ordered;
};

export const PlanningCalendarPage = () => {
  const { user } = useAuth();
  const { weeks, selectedWeekId, setSelectedWeekId, weekAssignments, reloadWeekDetail } = useAppData();

  const [rotationSummary, setRotationSummary] = useState<SemanaRotacionResumen[]>([]);
  const [rotationLoading, setRotationLoading] = useState(true);
  const [rotationError, setRotationError] = useState("");
  const [selectedOverviewYear, setSelectedOverviewYear] = useState(() => new Date().getFullYear());
  const [selectedOverviewMonthIndex, setSelectedOverviewMonthIndex] = useState(() => new Date().getMonth());

  const loadRotationSummary = useCallback(async () => {
    setRotationLoading(true);

    try {
      const data = await api.semanasRotacion();
      setRotationSummary(data);
      setRotationError("");
    } catch (error) {
      setRotationError(asErrorMessage(error));
    } finally {
      setRotationLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRotationSummary();
  }, [loadRotationSummary, weeks]);

  const selectedWeek = useMemo(
    () => weeks.find((week) => week.id === selectedWeekId) ?? null,
    [weeks, selectedWeekId],
  );

  const weeksOrderedAsc = useMemo(
    () =>
      [...weeks].sort((left, right) => {
        if (left.anio !== right.anio) {
          return left.anio - right.anio;
        }
        return left.numero_semana - right.numero_semana;
      }),
    [weeks],
  );

  const nextWeek = useMemo(() => {
    if (!selectedWeekId) {
      return null;
    }

    const currentIndex = weeksOrderedAsc.findIndex((week) => week.id === selectedWeekId);
    if (currentIndex < 0 || currentIndex === weeksOrderedAsc.length - 1) {
      return null;
    }

    return weeksOrderedAsc[currentIndex + 1];
  }, [selectedWeekId, weeksOrderedAsc]);

  const rotationByWeekId = useMemo(
    () => new Map(rotationSummary.map((item) => [item.semana_id, item])),
    [rotationSummary],
  );

  const selectedWeekSummary = selectedWeekId ? rotationByWeekId.get(selectedWeekId) ?? null : null;
  const nextWeekSummary = nextWeek ? rotationByWeekId.get(nextWeek.id) ?? null : null;

  const employeeToneById = useMemo(() => {
    const employeeIds = collectUniqueEmployeeIds(rotationSummary, weekAssignments, user?.id);
    const toneById = new Map<string, EmployeeTone>();

    employeeIds.forEach((employeeId, index) => {
      const tone = employeeTonePalette[index % employeeTonePalette.length] ?? defaultEmployeeTone;
      toneById.set(employeeId, tone);
    });

    return toneById;
  }, [rotationSummary, user?.id, weekAssignments]);

  const getEmployeeTone = useCallback(
    (employeeId?: string | null): EmployeeTone => {
      if (employeeId && employeeId === user?.id) {
        return {
          chip: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-500/60 dark:bg-blue-900/35 dark:text-blue-100",
          badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/55 dark:text-blue-100",
          surface: "border-blue-400 bg-blue-50/95 text-blue-900 dark:border-blue-500/65 dark:bg-blue-900/35 dark:text-blue-100",
          text: "text-blue-700 dark:text-blue-200",
          ring: "ring-blue-300 dark:ring-blue-500/70",
        };
      }

      if (!employeeId) {
        return defaultEmployeeTone;
      }

      return employeeToneById.get(employeeId) ?? defaultEmployeeTone;
    },
    [employeeToneById, user?.id],
  );

  const selectedWeekEmployeeLegend = useMemo(
    () =>
      (selectedWeekSummary?.empleados ?? []).map((employee) => ({
        ...employee,
        tone: getEmployeeTone(employee.usuario_id),
      })),
    [getEmployeeTone, selectedWeekSummary],
  );

  const groupedByDay = useMemo(() => {
    const grouped: Record<DiaSemana, Asignacion[]> = {
      ...emptyDayGroups,
      lunes: [...emptyDayGroups.lunes],
      martes: [...emptyDayGroups.martes],
      miercoles: [...emptyDayGroups.miercoles],
      jueves: [...emptyDayGroups.jueves],
      viernes: [...emptyDayGroups.viernes],
    };

    for (const assignment of weekAssignments) {
      grouped[assignment.dia].push(assignment);
    }

    for (const day of dayOrder) {
      grouped[day].sort((left, right) => {
        const nameLeft = left.usuario_detalle?.nombre ?? "";
        const nameRight = right.usuario_detalle?.nombre ?? "";
        return nameLeft.localeCompare(nameRight);
      });
    }

    return grouped;
  }, [weekAssignments]);

  const myAssignmentsThisWeek = weekAssignments.filter((assignment) => assignment.usuario === user?.id).length;

  const myAssignmentsNextWeek =
    !nextWeekSummary || !user?.id
      ? 0
      : nextWeekSummary.empleados.find((item) => item.usuario_id === user.id)?.total_dias ?? 0;

  const availableRotationYears = useMemo(
    () => [...new Set(rotationSummary.map((item) => item.anio))].sort((left, right) => right - left),
    [rotationSummary],
  );

  const availableRotationYearsAsc = useMemo(
    () => [...availableRotationYears].sort((left, right) => left - right),
    [availableRotationYears],
  );

  const activeOverviewYear = availableRotationYears.includes(selectedOverviewYear)
    ? selectedOverviewYear
    : availableRotationYears[0] ?? selectedOverviewYear;

  const activeOverviewMonthKey = `${activeOverviewYear}-${`${selectedOverviewMonthIndex + 1}`.padStart(2, "0")}`;
  const activeOverviewMonthTitle = monthTitleFormatter.format(
    new Date(Date.UTC(activeOverviewYear, selectedOverviewMonthIndex, 1)),
  );
  const activeOverviewMonthCells = useMemo(
    () => buildMonthCells(activeOverviewYear, selectedOverviewMonthIndex),
    [activeOverviewYear, selectedOverviewMonthIndex],
  );

  const canGoPreviousMonth = useMemo(() => {
    if (rotationLoading || availableRotationYearsAsc.length === 0) {
      return false;
    }

    if (selectedOverviewMonthIndex > 0) {
      return true;
    }

    return availableRotationYearsAsc.indexOf(activeOverviewYear) > 0;
  }, [activeOverviewYear, availableRotationYearsAsc, rotationLoading, selectedOverviewMonthIndex]);

  const canGoNextMonth = useMemo(() => {
    if (rotationLoading || availableRotationYearsAsc.length === 0) {
      return false;
    }

    if (selectedOverviewMonthIndex < 11) {
      return true;
    }

    return availableRotationYearsAsc.indexOf(activeOverviewYear) < availableRotationYearsAsc.length - 1;
  }, [activeOverviewYear, availableRotationYearsAsc, rotationLoading, selectedOverviewMonthIndex]);

  const goToPreviousMonth = useCallback(() => {
    if (!canGoPreviousMonth) {
      return;
    }

    if (selectedOverviewMonthIndex > 0) {
      setSelectedOverviewMonthIndex((current) => current - 1);
      return;
    }

    const yearIndex = availableRotationYearsAsc.indexOf(activeOverviewYear);
    if (yearIndex <= 0) {
      return;
    }

    setSelectedOverviewYear(availableRotationYearsAsc[yearIndex - 1]);
    setSelectedOverviewMonthIndex(11);
  }, [activeOverviewYear, availableRotationYearsAsc, canGoPreviousMonth, selectedOverviewMonthIndex]);

  const goToNextMonth = useCallback(() => {
    if (!canGoNextMonth) {
      return;
    }

    if (selectedOverviewMonthIndex < 11) {
      setSelectedOverviewMonthIndex((current) => current + 1);
      return;
    }

    const yearIndex = availableRotationYearsAsc.indexOf(activeOverviewYear);
    if (yearIndex < 0 || yearIndex >= availableRotationYearsAsc.length - 1) {
      return;
    }

    setSelectedOverviewYear(availableRotationYearsAsc[yearIndex + 1]);
    setSelectedOverviewMonthIndex(0);
  }, [activeOverviewYear, availableRotationYearsAsc, canGoNextMonth, selectedOverviewMonthIndex]);

  const rotationByDate = useMemo(() => {
    const byDate = new Map<string, SemanaRotacionResumen>();
    for (const item of rotationSummary) {
      const monday = parseIsoDate(item.fecha_inicio_semana);
      for (let offset = 0; offset < 5; offset += 1) {
        byDate.set(toIsoDate(addUtcDays(monday, offset)), item);
      }
    }
    return byDate;
  }, [rotationSummary]);

  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  return (
    <section className="space-y-4">
      <article className="glass-card float-in space-y-3 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-bold">Calendario de turnos</h2>
            <p className="mt-1 text-sm text-[var(--primary-400)]">
              Consulta lo generado por dia y por semana, con foco en la siguiente rotacion.
            </p>
          </div>

          <div className="flex w-full max-w-lg flex-col gap-2 md:flex-row md:items-end">
            <div className="w-full md:flex-1">
              <WeekSelector
                weeks={weeks}
                selectedWeekId={selectedWeekId}
                onChange={setSelectedWeekId}
                label="Semana"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                void reloadWeekDetail(selectedWeekId);
                void loadRotationSummary();
              }}
              className="glass-button h-10 rounded-lg px-4 text-sm font-semibold"
            >
              Actualizar
            </button>
          </div>
        </div>

        {selectedWeek && (
          <div className="glass-chip px-3 py-2 text-sm font-bold inline-flex">
            Semana activa: {formatWeek(selectedWeek)}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <article className="panel p-3">
            <p className="stat-label">Semana actual</p>
            <p className="stat-value mt-1">
              {selectedWeekSummary?.principal_usuario_nombre ?? "Sin principal"}
            </p>
            <p className="text-[10px] uppercase font-black text-[var(--primary-500)] mt-1">Dias: {selectedWeekSummary?.principal_total_dias ?? 0}</p>
          </article>

          <article className="panel p-3">
            <p className="stat-label">Semana siguiente</p>
            <p className="stat-value mt-1">
              {nextWeekSummary?.principal_usuario_nombre ?? "Sin siguiente"}
            </p>
            <p className="text-[10px] uppercase font-black text-[var(--primary-500)] mt-1">
              {nextWeek ? `W${nextWeek.numero_semana}/${nextWeek.anio}` : "No cargada"}
            </p>
          </article>

          <article className="panel p-3 border-emerald-500/30 bg-emerald-500/5">
            <p className="text-[10px] font-black uppercase tracking-wide text-emerald-400">Tu visibilidad</p>
            <p className="stat-value mt-1 text-emerald-100">{myAssignmentsThisWeek} dia(s)</p>
            <p className="text-[10px] uppercase font-black text-emerald-500/80 mt-1 leading-tight">
              {myAssignmentsNextWeek > 0
                ? `Proxima semana: te toca (${myAssignmentsNextWeek} d).`
                : `Prox. semana: ${nextWeekSummary?.principal_usuario_nombre ?? "sin asignar"}.`}
            </p>
          </article>
        </div>

        {selectedWeekSummary && (
          <article className="glass-panel p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-[var(--primary-500)] mb-2">
              Distribucion real de la semana
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedWeekSummary.empleados.length === 0 && (
                <p className="text-xs text-[var(--primary-600)] italic">Sin asignaciones registradas.</p>
              )}
              {selectedWeekEmployeeLegend.map((employee) => (
                <span
                  key={`${selectedWeekSummary.semana_id}-${employee.usuario_id}`}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase transition hover:scale-105 ${employee.tone.chip}`}
                >
                  {employee.usuario_nombre}: {employee.total_dias}d
                </span>
              ))}
            </div>
          </article>
        )}
      </article>

      <article className="glass-card float-in space-y-4 p-5">
        <h3 className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--primary-500)]">Detalle diario de la semana</h3>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {dayOrder.map((day) => (
            <article key={day} className="panel p-3">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--primary-500)]">{day}</h4>

              <div className="mt-3 space-y-2">
                {groupedByDay[day].length === 0 && (
                  <p className="text-[10px] font-medium text-[var(--primary-600)] italic">Sin turnos</p>
                )}

                {groupedByDay[day].map((assignment) => {
                  const isMine = assignment.usuario === user?.id;
                  const tone = getEmployeeTone(assignment.usuario);
                  const ownerName = assignment.usuario_detalle?.nombre ?? "Sin usuario";

                  return (
                    <div
                      key={assignment.id}
                      className={`rounded-lg border px-3 py-2.5 transition-all shadow-sm ${tone.surface} ${
                        isMine ? "ring-2 ring-emerald-500/40 border-emerald-500/30" : ""
                      }`}
                    >
                      <p className="text-sm font-bold leading-tight">
                        {ownerName}
                        {isMine ? " (tu)" : ""}
                      </p>
                      <p className="mono mt-1 text-[10px] font-medium opacity-70">
                        {assignment.hora_inicio.slice(0, 5)} - {assignment.hora_fin.slice(0, 5)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </article>

      <article className="glass-card float-in space-y-4 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-xl font-bold">Calendario de rotacion</h3>
            <p className="text-sm text-[var(--primary-400)]">
              Vista mensual: semana activa y asignaciones por bloque.
            </p>
          </div>

          <div className="grid w-full gap-2 md:w-auto md:grid-cols-[minmax(0,140px)_auto]">
            <div className="block text-sm">
              <span className="text-[10px] font-black uppercase text-[var(--primary-400)]">Anio</span>
              <CustomSelect
                value={activeOverviewYear}
                onChange={(val) => setSelectedOverviewYear(Number.parseInt(String(val), 10))}
                options={availableRotationYears.map(year => ({ value: year, label: `${year}` }))}
                className="mt-1"
                disabled={rotationLoading || availableRotationYears.length === 0}
              />
            </div>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={goToPreviousMonth}
                className="glass-button h-10 rounded-lg px-3 text-sm font-semibold disabled:opacity-30"
                disabled={!canGoPreviousMonth}
              >
                ←
              </button>
              <div className="glass-panel h-10 flex items-center justify-center rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider min-w-[140px]">
                {activeOverviewMonthTitle}
              </div>
              <button
                type="button"
                onClick={goToNextMonth}
                className="glass-button h-10 rounded-lg px-3 text-sm font-semibold disabled:opacity-30"
                disabled={!canGoNextMonth}
              >
                →
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <div className="glass-badge justify-start px-3 py-2 text-[10px]">
            <span className="text-white mr-1">ACTIVA:</span> ANILLO VISIBLE
          </div>
          <div className="glass-badge justify-start border-blue-500/30 bg-blue-500/5 text-blue-300 px-3 py-2 text-[10px]">
             <span className="text-white mr-1">TU DIA:</span> TONO AZUL
          </div>
          <div className="glass-badge justify-start border-indigo-500/30 bg-indigo-500/5 text-indigo-300 px-3 py-2 text-[10px]">
            <span className="text-white mr-1">MIXTO:</span> VARIOS EMPLEADOS
          </div>
          <div className="glass-badge justify-start border-blue-400/50 ring-1 ring-blue-400/30 px-3 py-2 text-[10px]">
            <span className="text-white mr-1">HOY:</span> MARCO AZUL
          </div>
          <div className="glass-badge justify-start border-red-500/30 bg-red-500/5 text-red-300 px-3 py-2 text-[10px]">
            <span className="text-white mr-1">FINDE:</span> BLOQUE ROJO
          </div>
        </div>

        {selectedWeekEmployeeLegend.length > 0 && (
          <div className="glass-panel p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-[var(--primary-400)] mb-2">Leyenda</p>
            <div className="flex flex-wrap gap-2">
              {selectedWeekEmployeeLegend.map((employee) => (
                <span
                  key={`legend-${employee.usuario_id}`}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${employee.tone.chip}`}
                >
                  {formatDisplayName(employee.usuario_nombre)}
                </span>
              ))}
            </div>
          </div>
        )}

        {rotationLoading && <p className="text-sm text-[var(--primary-400)] italic">Cargando rotacion...</p>}
        {rotationError && <NoticeBanner kind="error" message={rotationError} />}

        {!rotationLoading && availableRotationYears.length === 0 && (
          <p className="text-sm text-[var(--primary-400)] italic">No hay datos de rotacion.</p>
        )}

        {!rotationLoading && availableRotationYears.length > 0 && (
          <article key={activeOverviewMonthKey} className="glass-panel p-4">
            <h4 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[var(--primary-400)] text-center">{activeOverviewMonthTitle}</h4>

            <div className="grid grid-cols-7 gap-1">
              {weekdayHeader.map((label, headerIndex) => (
                <div
                  key={`${activeOverviewMonthKey}-${label}`}
                  className={`rounded-lg border px-1 py-1 text-center text-[10px] font-black uppercase tracking-wider ${
                    headerIndex >= 5
                      ? "border-red-500/30 bg-red-500/5 text-red-300"
                      : "border-[var(--color-surface-border)] bg-[var(--color-surface)] text-[var(--primary-400)]"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-1">
              {activeOverviewMonthCells.map((cell, index) => {
                const isWeekendColumn = index % 7 >= 5;

                if (!cell) {
                  return (
                    <div
                      key={`${activeOverviewMonthKey}-empty-${index}`}
                      className={`min-h-24 rounded-xl border border-dashed ${
                        isWeekendColumn
                          ? "border-red-500/10 bg-red-500/[0.02]"
                          : "border-[var(--color-surface-border)] bg-[var(--color-background)]/30"
                      }`}
                    />
                  );
                }

                const iso = toIsoDate(cell);
                const rotationItem = rotationByDate.get(iso);
                const isWeekend = cell.getUTCDay() === 0 || cell.getUTCDay() === 6;
                const isToday = iso === todayIso;

                if (!rotationItem) {
                  return (
                    <div
                      key={`${activeOverviewMonthKey}-${iso}`}
                      className={`min-h-24 rounded-xl border p-2 ${
                        isWeekend
                          ? "border-red-500/30 bg-red-500/5 text-red-100"
                          : "border-[var(--color-surface-border)] bg-[var(--color-background)]/60 text-[var(--primary-400)]"
                      }`}
                    >
                      <div className="flex justify-between">
                        <p className="text-[10px] font-black opacity-50">{cell.getUTCDate()}</p>
                        {isToday && <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>}
                      </div>
                      <p className="mt-1 text-[9px] font-bold uppercase opacity-30">{isWeekend ? "Finde" : "Vacio"}</p>
                    </div>
                  );
                }

                const diaSemana = getDiaSemanaFromDate(cell);
                const diaDetalle = diaSemana
                  ? rotationItem.dias.find((item) => item.dia === diaSemana) ?? null
                  : null;
                const ownerId = diaDetalle?.usuario_id ?? rotationItem.principal_usuario_id;
                const ownerTone = getEmployeeTone(ownerId);
                const isMine = ownerId === user?.id;
                const isSelected = rotationItem.semana_id === selectedWeekId;
                const isMixedDay = (diaDetalle?.usuarios.length ?? 0) > 1;
                const isMixedWeek = (rotationItem.empleados?.length ?? 0) > 1;
                const ownerName = diaDetalle?.usuario_nombre ?? rotationItem.principal_usuario_nombre ?? "Sin asignar";
                const ownerDisplayName = formatDisplayName(ownerName);
                
                const baseClasses = isMixedDay
                  ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-100"
                  : isMine
                    ? "border-blue-500/40 bg-blue-500/10 text-blue-100"
                    : ownerTone.surface;
                
                const weekendClasses = isWeekend
                  ? "border-red-500/40 bg-red-500/10 text-red-100"
                  : "";
                
                const activeClasses = isSelected
                  ? "ring-2 ring-[var(--primary-400)] shadow-xl z-20 scale-[1.02]"
                  : "hover:scale-[1.01] hover:shadow-lg";
                
                const todayClasses = isToday ? "ring-2 ring-blue-400/60" : "";
                const helperTextClasses = isMixedDay ? "text-indigo-300" : ownerTone.text;

                return (
                  <button
                    key={`${activeOverviewMonthKey}-${iso}`}
                    type="button"
                    onClick={() => {
                      setSelectedWeekId(rotationItem.semana_id);
                      void reloadWeekDetail(rotationItem.semana_id);
                    }}
                    className={`min-h-24 w-full rounded-xl border p-2 text-left transition-all ${baseClasses} ${weekendClasses} ${activeClasses} ${todayClasses}`}
                  >
                    <div className="flex justify-between items-start">
                      <p className="text-[10px] font-black opacity-60">{cell.getUTCDate()}</p>
                      <p className="text-[9px] font-bold opacity-40">W{rotationItem.numero_semana}</p>
                    </div>
                    
                    <p className="mt-2 text-[10px] font-black leading-tight truncate">
                      {ownerDisplayName}
                    </p>
                    
                    <div className="mt-1">
                      {isMixedDay ? (
                        <p className={`text-[8px] font-black uppercase tracking-tighter ${helperTextClasses}`}>MIXTO</p>
                      ) : (
                        <p className={`text-[8px] font-black uppercase tracking-tighter opacity-70`}>{rotationItem.principal_total_dias}D</p>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-0.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ownerTone.badge}`}>
                        {ownerDisplayName}
                      </span>
                      {isMine && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-900/55 dark:text-blue-100">
                          Tu dia
                        </span>
                      )}
                      {isMixedDay && (
                        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800 dark:bg-indigo-900/55 dark:text-indigo-100">
                          Dia mixto
                        </span>
                      )}
                      {isMixedWeek && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800 dark:bg-slate-800/80 dark:text-slate-100">
                          Semana mixta
                        </span>
                      )}
                      {isToday && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-900/55 dark:text-blue-100">
                          Hoy
                        </span>
                      )}
                      {isWeekend && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-900/55 dark:text-red-100">
                          Fin de semana
                        </span>
                      )}
                      {isSelected && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800 dark:bg-slate-800/80 dark:text-slate-100">
                          Activa
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </article>
        )}
      </article>
    </section>
  );
};
