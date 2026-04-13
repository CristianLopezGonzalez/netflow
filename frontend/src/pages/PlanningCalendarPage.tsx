import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../api";
import { NoticeBanner } from "../components/common/NoticeBanner";
import CustomSelect from "../components/common/CustomSelect";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import type { Asignacion, DiaSemana, Semana, SemanaRotacionResumen } from "../types";
import { asErrorMessage } from "../utils/formatters";

const weekdayHeader = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

const monthNameFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  timeZone: "UTC",
});

const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: (index + 1).toString(),
  label: monthNameFormatter.format(new Date(Date.UTC(2026, index, 1))),
}));

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

const formatWeekSelectLabel = (week: Semana): string => {
  const start = parseIsoDate(week.fecha_inicio_semana);
  const end = parseIsoDate(week.fecha_fin_semana);
  const startLabel = `${start.getUTCDate()}`.padStart(2, "0");
  const endLabel = `${end.getUTCDate()}`.padStart(2, "0");

  if (start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()) {
    const monthLabel = monthNameFormatter.format(start);
    return `${startLabel} - ${endLabel} ${monthLabel} ${end.getUTCFullYear()}`;
  }

  const startMonthLabel = monthNameFormatter.format(start);
  const endMonthLabel = monthNameFormatter.format(end);
  return `${startLabel} ${startMonthLabel} - ${endLabel} ${endMonthLabel} ${end.getUTCFullYear()}`;
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
  const [viewMode, setViewMode] = useState<"semana" | "mes">("semana");

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

  const selectedWeekIndex = useMemo(
    () => weeksOrderedAsc.findIndex((week) => week.id === selectedWeekId),
    [weeksOrderedAsc, selectedWeekId],
  );

  const canGoPreviousWeek = selectedWeekIndex > 0;
  const canGoNextWeek = selectedWeekIndex >= 0 && selectedWeekIndex < weeksOrderedAsc.length - 1;

  const goToPreviousWeek = useCallback(() => {
    if (!canGoPreviousWeek) {
      return;
    }

    const previous = weeksOrderedAsc[selectedWeekIndex - 1];
    if (previous) {
      setSelectedWeekId(previous.id);
      void reloadWeekDetail(previous.id);
    }
  }, [canGoPreviousWeek, reloadWeekDetail, selectedWeekIndex, weeksOrderedAsc, setSelectedWeekId]);

  const goToNextWeek = useCallback(() => {
    if (!canGoNextWeek) {
      return;
    }

    const next = weeksOrderedAsc[selectedWeekIndex + 1];
    if (next) {
      setSelectedWeekId(next.id);
      void reloadWeekDetail(next.id);
    }
  }, [canGoNextWeek, reloadWeekDetail, selectedWeekIndex, weeksOrderedAsc, setSelectedWeekId]);

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

  const selectedWeek = useMemo(
    () => weeks.find((week) => week.id === selectedWeekId) ?? null,
    [weeks, selectedWeekId],
  );

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
          chip: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/60 dark:bg-emerald-900/35 dark:text-emerald-100",
          badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/55 dark:text-emerald-100",
          surface: "border-emerald-300 bg-emerald-50/95 text-emerald-900 dark:border-emerald-500/65 dark:bg-emerald-900/35 dark:text-emerald-100",
          text: "text-emerald-700 dark:text-emerald-200",
          ring: "ring-emerald-300 dark:ring-emerald-500/70",
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

  const myAssignmentsThisWeek = weekAssignments.filter((assignment) => assignment.usuario === user?.id).length;

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
  const activeOverviewMonthCells = useMemo(
    () => buildMonthCells(activeOverviewYear, selectedOverviewMonthIndex),
    [activeOverviewYear, selectedOverviewMonthIndex],
  );

  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const currentMonthKey = useMemo(() => {
    const today = new Date();
    return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  }, []);

  const monthSelectionOptions = useMemo(
    () =>
      availableRotationYearsAsc.flatMap((year) =>
        monthOptions.map((month, monthIndex) => {
          const value = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
          return {
            value,
            label: `${month.label} ${year}`,
            isCurrent: value === currentMonthKey,
          };
        }),
      ),
    [availableRotationYearsAsc, currentMonthKey],
  );

  const selectedMonthKey = activeOverviewMonthKey;

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

  const todayIsoDate = useMemo(() => toIsoDate(new Date()), []);

  const currentWeekId = useMemo(() => {
    const matchByDate = weeksOrderedAsc.find((week) => {
      const start = parseIsoDate(week.fecha_inicio_semana).getTime();
      const end = addUtcDays(parseIsoDate(week.fecha_fin_semana), 2).getTime();
      const today = parseIsoDate(todayIsoDate).getTime();
      return start <= today && today <= end;
    });

    return matchByDate?.id ?? rotationByDate.get(todayIsoDate)?.semana_id ?? null;
  }, [weeksOrderedAsc, rotationByDate, todayIsoDate]);

  const visibleDaysInRange = useMemo(() => {
    if (viewMode === "semana") {
      return myAssignmentsThisWeek;
    }

    if (!user?.id) {
      return 0;
    }

    return activeOverviewMonthCells.reduce((count, cell) => {
      if (!cell) {
        return count;
      }

      const iso = toIsoDate(cell);
      const rotation = rotationByDate.get(iso);
      if (!rotation) {
        return count;
      }

      const diaSemana = getDiaSemanaFromDate(cell);
      const dayItem = diaSemana ? rotation.dias.find((item) => item.dia === diaSemana) ?? null : null;
      const assigned =
        dayItem?.usuario_id === user.id ||
        dayItem?.usuarios.some((item) => item.usuario_id === user.id);
      return count + (assigned ? 1 : 0);
    }, 0);
  }, [activeOverviewMonthCells, rotationByDate, user?.id, viewMode, myAssignmentsThisWeek]);

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

  return (
    <section className="space-y-4">
      <article className="glass-card float-in space-y-3 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-bold">Calendario de turnos</h2>
            <p className="mt-1 text-sm text-[var(--primary-400)]">
              Consulta lo generado por día, semana y mes, con foco en la siguiente rotación.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-1">
              <button
                type="button"
                onClick={() => setViewMode("semana")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  viewMode === "semana"
                    ? "bg-[var(--color-surface-bright)] text-white"
                    : "text-[var(--primary-300)] hover:text-white"
                }`}
              >
                Semana
              </button>
              <button
                type="button"
                onClick={() => setViewMode("mes")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  viewMode === "mes"
                    ? "bg-[var(--color-surface-bright)] text-white"
                    : "text-[var(--primary-300)] hover:text-white"
                }`}
              >
                Mes
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={viewMode === "semana" ? goToPreviousWeek : goToPreviousMonth}
                disabled={viewMode === "semana" ? !canGoPreviousWeek : !canGoPreviousMonth}
                className="glass-button h-10 rounded-lg px-3 text-sm font-semibold disabled:opacity-30"
              >
                ←
              </button>
              <div className="min-w-[220px]">
                <CustomSelect
                  value={viewMode === "semana" ? selectedWeekId : selectedMonthKey}
                  onChange={(value) => {
                    if (viewMode === "semana") {
                      setSelectedWeekId(String(value));
                      void reloadWeekDetail(String(value));
                      return;
                    }

                    const [year, monthString] = String(value).split("-");
                    setSelectedOverviewYear(Number.parseInt(year, 10));
                    setSelectedOverviewMonthIndex(Number.parseInt(monthString, 10) - 1);
                  }}
                  options={
                    viewMode === "semana"
                      ? weeksOrderedAsc.map((week) => ({
                          value: week.id,
                          label: formatWeekSelectLabel(week),
                          isCurrent: week.id === currentWeekId,
                        }))
                      : monthSelectionOptions
                  }
                  placeholder={viewMode === "semana" ? "Selecciona semana" : "Selecciona mes"}
                  className="w-full"
                  hSize="h-12"
                  disabled={viewMode === "mes" ? rotationLoading || monthSelectionOptions.length === 0 : weeksOrderedAsc.length === 0}
                />
              </div>
              <button
                type="button"
                onClick={viewMode === "semana" ? goToNextWeek : goToNextMonth}
                disabled={viewMode === "semana" ? !canGoNextWeek : !canGoNextMonth}
                className="glass-button h-10 rounded-lg px-3 text-sm font-semibold disabled:opacity-30"
              >
                →
              </button>
            </div>

            <div className="glass-badge rounded-full px-3 py-2 text-sm font-semibold uppercase">
              Tu visibilidad: {visibleDaysInRange} dia(s)
            </div>
          </div>
        </div>

      </article>

      {viewMode === "semana" && (
        <article className="glass-card float-in space-y-4 p-5">
          <h3 className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--primary-500)]">Detalle semanal</h3>

          {!selectedWeek ? (
            <p className="text-sm text-[var(--primary-400)] italic">Selecciona una semana</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-7 gap-1">
                {weekdayHeader.map((label) => (
                  <div
                    key={`week-header-${label}`}
                    className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-1 py-1 text-center text-[10px] font-black uppercase tracking-wider text-[var(--primary-400)]"
                  >
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }).map((_, dayIndex) => {
                  const cell = addUtcDays(parseIsoDate(selectedWeek.fecha_inicio_semana), dayIndex);
                  const iso = toIsoDate(cell);
                  const rotationItem = rotationByDate.get(iso);
                  const isToday = iso === todayIso;

                  if (!rotationItem) {
                    const todayRingClasses = isToday
                      ? "ring-2 ring-amber-300/80 border-amber-300/70 shadow-xl z-20 scale-[1.01]"
                      : "hover:scale-[1.01] hover:shadow-lg";

                    return (
                      <div
                        key={`week-cell-${iso}`}
                        className={`min-h-24 rounded-xl border border-slate-700 p-2 text-slate-400 transition-all ${todayRingClasses}`}
                      >
                        <div className="flex justify-start">
                          <p className="text-[10px] font-black opacity-50">{cell.getUTCDate()}</p>
                        </div>
                      </div>
                    );
                  }

                  const diaSemana = getDiaSemanaFromDate(cell);
                  const diaDetalle = diaSemana
                    ? rotationItem.dias.find((item) => item.dia === diaSemana) ?? null
                    : null;
                  const ownerId = diaDetalle?.usuario_id ?? rotationItem.principal_usuario_id;
                  const isUserDay = diaDetalle?.usuario_id === user?.id;
                  const isMine = isUserDay;
                  const ownerName = diaDetalle?.usuario_nombre ?? rotationItem.principal_usuario_nombre ?? "Sin asignar";
                  const swapPartner = diaDetalle?.usuarios.find((item) => item.usuario_id !== ownerId) ?? null;

                  const baseClasses = isMine
                    ? "border-blue-500/60 bg-blue-500/15 text-blue-100"
                    : "border-slate-700 text-slate-300";

                  const todayRingClasses = isToday
                    ? "ring-2 ring-amber-300/80 border-amber-300/70 shadow-xl z-20 scale-[1.01]"
                    : "hover:scale-[1.01] hover:shadow-lg";

                  return (
                    <div
                      key={`week-cell-${iso}`}
                      className={`min-h-24 rounded-xl border p-2 text-left transition-all ${baseClasses} ${todayRingClasses}`}
                    >
                      <div className="flex justify-between items-start">
                        <p className="text-[10px] font-black opacity-60">{cell.getUTCDate()}</p>
                      </div>

                      <p className="mt-4 text-sm font-bold leading-tight truncate">
                        {ownerName}
                      </p>

                      {swapPartner ? (
                        <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-[var(--primary-200)]">
                          <span aria-hidden>↔</span>
                          {swapPartner.usuario_nombre}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {viewMode === "semana" && (
            <article className="panel p-3">
              <p className="stat-label">Semana siguiente</p>
              <p className="stat-value mt-1">{nextWeekSummary?.principal_usuario_nombre ?? "Sin siguiente"}</p>
            </article>
        )}

        </article>
      )}

      {viewMode === "mes" && (
      <article className="glass-card float-in space-y-4 p-5">

        {rotationLoading && <p className="text-sm text-[var(--primary-400)] italic">Cargando rotacion...</p>}
        {rotationError && <NoticeBanner kind="error" message={rotationError} />}

        {!rotationLoading && availableRotationYears.length === 0 && (
          <p className="text-sm text-[var(--primary-400)] italic">No hay datos de rotacion.</p>
        )}

        {!rotationLoading && availableRotationYears.length > 0 && (
          <article key={activeOverviewMonthKey} className="glass-panel p-4">
            <div className="grid grid-cols-7 gap-1">
              {weekdayHeader.map((label) => (
                <div
                  key={`${activeOverviewMonthKey}-${label}`}
                  className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-1 py-1 text-center text-[10px] font-black uppercase tracking-wider text-[var(--primary-400)]"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-1">
              {activeOverviewMonthCells.map((cell, index) => {

                if (!cell) {
                  return (
                    <div
                      key={`${activeOverviewMonthKey}-empty-${index}`}
                      className="min-h-24 rounded-xl border border-dashed border-[var(--color-surface-border)] bg-[var(--color-background)]/30"
                    />
                  );
                }

                const iso = toIsoDate(cell);
                const rotationItem = rotationByDate.get(iso);
                const isToday = iso === todayIso;

                if (!rotationItem) {
                  const todayRingClasses = isToday
                    ? "ring-2 ring-amber-300/80 border-amber-300/70 shadow-xl z-20 scale-[1.01]"
                    : "hover:scale-[1.01] hover:shadow-lg";

                  return (
                    <div
                      key={`${activeOverviewMonthKey}-${iso}`}
                      className={`min-h-24 rounded-xl border border-slate-700 p-2 text-slate-400 transition-all ${todayRingClasses}`}
                    >
                      <div className="flex justify-start">
                        <p className="text-[10px] font-black opacity-50">{cell.getUTCDate()}</p>
                      </div>
                    </div>
                  );
                }

                const diaSemana = getDiaSemanaFromDate(cell);
                const isWeekend = cell.getUTCDay() === 0 || cell.getUTCDay() === 6;
                const diaDetalle = diaSemana
                  ? rotationItem.dias.find((item) => item.dia === diaSemana) ?? null
                  : null;
                const ownerId = diaDetalle?.usuario_id ?? rotationItem.principal_usuario_id;
                const isUserDay = diaDetalle?.usuario_id === user?.id;
                const isMine = !isWeekend && isUserDay;
                const ownerName = diaDetalle?.usuario_nombre ?? rotationItem.principal_usuario_nombre ?? "Sin asignar";
                const ownerDisplayName = formatDisplayName(ownerName);
                const swapPartner = diaDetalle?.usuarios.find((item) => item.usuario_id !== ownerId) ?? null;
                const isSelectedWeek = rotationItem.semana_id === selectedWeekId;

                const baseClasses = isMine
                  ? "border-blue-500/60 bg-blue-500/15 text-blue-100"
                  : "border-slate-700 text-slate-300";

                const selectedWeekClasses = isSelectedWeek && !isToday
                  ? "ring-2 ring-blue-500/60 border-blue-500/70 shadow-xl z-20 scale-[1.01]"
                  : "";

                const todayRingClasses = isToday
                  ? "ring-2 ring-amber-300/80 border-amber-300/70 shadow-xl z-20 scale-[1.01]"
                  : "hover:scale-[1.01] hover:shadow-lg";

                return (
                  <button
                    key={`${activeOverviewMonthKey}-${iso}`}
                    type="button"
                    onClick={() => {
                      setSelectedWeekId(rotationItem.semana_id);
                      void reloadWeekDetail(rotationItem.semana_id);
                    }}
                    className={`min-h-24 w-full rounded-xl border p-2 text-left transition-all ${baseClasses} ${selectedWeekClasses} ${todayRingClasses}`}
                  >
                    <div className="flex justify-between items-start">
                      <p className="text-[10px] font-black opacity-60">{cell.getUTCDate()}</p>
                    </div>

                    <p className="mt-4 text-sm font-bold leading-tight truncate">
                      {ownerDisplayName}
                    </p>

                    {swapPartner ? (
                      <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-[var(--primary-200)]">
                        <span aria-hidden>↔</span>
                        {swapPartner.usuario_nombre}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </article>
        )}
      </article>
      )}
    </section>
  );
};
