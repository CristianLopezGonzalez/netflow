import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useNavigate } from "react-router-dom";

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

type SelectedCalendarGroup = {
  ownerName: string;
  ownerId: string;
  isMine: boolean;
  dateLabel: string;
  dayCount: number;
  assignmentIds: string[];
  weekId?: string;
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const { weeks, selectedWeekId, setSelectedWeekId, weekAssignments, reloadWeekDetail } = useAppData();

  const [rotationSummary, setRotationSummary] = useState<SemanaRotacionResumen[]>([]);
  const [rotationLoading, setRotationLoading] = useState(true);
  const [rotationError, setRotationError] = useState("");
  const [selectedOverviewYear, setSelectedOverviewYear] = useState(() => new Date().getFullYear());
  const [selectedOverviewMonthIndex, setSelectedOverviewMonthIndex] = useState(() => new Date().getMonth());
  const [viewMode, setViewMode] = useState<"semana" | "mes">("semana");
  const [isCompactWeek, setIsCompactWeek] = useState(false);
  const [selectedCalendarGroup, setSelectedCalendarGroup] = useState<SelectedCalendarGroup | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const closeGroupModalTimeoutRef = useRef<number | null>(null);

  const closeGroupModal = useCallback(() => {
    setGroupModalOpen(false);
    if (closeGroupModalTimeoutRef.current !== null) {
      window.clearTimeout(closeGroupModalTimeoutRef.current);
    }

    closeGroupModalTimeoutRef.current = window.setTimeout(() => {
      setSelectedCalendarGroup(null);
      closeGroupModalTimeoutRef.current = null;
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (closeGroupModalTimeoutRef.current !== null) {
        window.clearTimeout(closeGroupModalTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSelectedCalendarGroup(null);
  }, [viewMode]);

  useEffect(() => {
    if (closeGroupModalTimeoutRef.current !== null) {
      window.clearTimeout(closeGroupModalTimeoutRef.current);
      closeGroupModalTimeoutRef.current = null;
    }

    if (!selectedCalendarGroup) {
      setGroupModalOpen(false);
      return;
    }

    setGroupModalOpen(false);
    const frameId = window.requestAnimationFrame(() => setGroupModalOpen(true));
    return () => window.cancelAnimationFrame(frameId);
  }, [selectedCalendarGroup]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const updateCompact = () => setIsCompactWeek(mediaQuery.matches);

    updateCompact();
    mediaQuery.addEventListener("change", updateCompact);
    return () => mediaQuery.removeEventListener("change", updateCompact);
  }, []);

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

  const buildSelectedCalendarGroup = useCallback(
    (group: {
      ownerDisplayName: string;
      ownerId: string;
      isMine: boolean;
      rotationItem?: SemanaRotacionResumen;
      startCell: Date | null;
      endCell: Date | null;
      span: number;
    }): SelectedCalendarGroup | null => {
      if (!group.rotationItem || !group.startCell || !group.endCell) {
        return null;
      }

      const formatLabel = (date: Date) =>
        date.toLocaleDateString("es-ES", {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        });

      const startDate = group.startCell;
      const endDate = group.endCell;
      const dayCount = group.span;
      const dateLabel = dayCount > 1
        ? `${formatLabel(startDate)} - ${formatLabel(endDate)}`
        : `${formatLabel(startDate)}`;

      const selectedDays = new Set<DiaSemana>([]);
      let cursor = startDate;
      while (cursor.getTime() <= endDate.getTime()) {
        const dayName = getDiaSemanaFromDate(cursor);
        if (dayName) {
          selectedDays.add(dayName);
        }
        cursor = addUtcDays(cursor, 1);
      }

      const assignmentIds = weekAssignments
        .filter(
          (assignment) =>
            assignment.semana === group.rotationItem?.semana_id
            && assignment.usuario === group.ownerId
            && selectedDays.has(assignment.dia),
        )
        .map((assignment) => assignment.id);

      return {
        ownerName: group.ownerDisplayName,
        ownerId: group.ownerId,
        isMine: group.isMine,
        dateLabel,
        dayCount,
        assignmentIds,
        weekId: group.rotationItem.semana_id,
      };
    },
    [weekAssignments],
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

  const handleSelectCalendarGroup = useCallback(
    (group: {
      ownerDisplayName: string;
      ownerId: string;
      isMine: boolean;
      rotationItem?: SemanaRotacionResumen;
      startCell: Date | null;
      endCell: Date | null;
      span: number;
    }) => {
      const selected = buildSelectedCalendarGroup(group);
      if (!selected) {
        return;
      }

      if (closeGroupModalTimeoutRef.current !== null) {
        window.clearTimeout(closeGroupModalTimeoutRef.current);
        closeGroupModalTimeoutRef.current = null;
      }

      setSelectedCalendarGroup(selected);

      if (group.rotationItem) {
        setSelectedWeekId(group.rotationItem.semana_id);
        void reloadWeekDetail(group.rotationItem.semana_id);
      }
    },
    [buildSelectedCalendarGroup, reloadWeekDetail, setSelectedWeekId],
  );

  const rotationByWeekId = useMemo(
    () => new Map(rotationSummary.map((item) => [item.semana_id, item])),
    [rotationSummary],
  );

  const selectedWeekSummary = selectedWeekId ? rotationByWeekId.get(selectedWeekId) ?? null : null;
  const nextWeekSummary = nextWeek ? rotationByWeekId.get(nextWeek.id) ?? null : null;

  const nextWeekEmployees = useMemo(() => {
    if (!nextWeekSummary) {
      return null;
    }

    const names = nextWeekSummary.empleados
      .map((item) => item.usuario_nombre?.trim() ?? "")
      .filter(Boolean)
      .map(formatDisplayName);

    if (names.length === 0) {
      return nextWeekSummary.principal_usuario_nombre ? formatDisplayName(nextWeekSummary.principal_usuario_nombre) : null;
    }

    return names.join(", ");
  }, [nextWeekSummary]);

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

  const monthColumns = isCompactWeek ? 5 : 7;
  const visibleMonthCells = useMemo(() => {
    if (!isCompactWeek) {
      return activeOverviewMonthCells;
    }

    const compact: Array<Date | null> = [];
    for (let index = 0; index < activeOverviewMonthCells.length; index += 7) {
      compact.push(...activeOverviewMonthCells.slice(index, index + 5));
    }
    return compact;
  }, [activeOverviewMonthCells, isCompactWeek]);

  const monthGroups = useMemo(() => {
    type MonthGroup = {
      key: string;
      span: number;
      startCell: Date | null;
      endCell: Date | null;
      isToday: boolean;
      isEmpty: boolean;
      isPlaceholder: boolean;
      isWeekend: boolean;
      ownerDisplayName: string;
      ownerId: string;
      isMine: boolean;
      rotationItem?: SemanaRotacionResumen;
      swapPartnerName?: string | null;
    };

    const groups: MonthGroup[] = [];
    for (let index = 0; index < visibleMonthCells.length; index += 1) {
      const cell = visibleMonthCells[index];
      const row = Math.floor(index / monthColumns);
      const iso = cell ? toIsoDate(cell) : null;
      const rotationItem = iso ? rotationByDate.get(iso) : undefined;
      const isToday = iso === todayIso;
      const isPlaceholder = !cell;
      const isEmpty = !!cell && !rotationItem;
      const isWeekend = !!cell && (cell.getUTCDay() === 0 || cell.getUTCDay() === 6);
      const diaSemana = cell ? getDiaSemanaFromDate(cell) : null;
      const diaDetalle = diaSemana && rotationItem
        ? rotationItem.dias.find((item) => item.dia === diaSemana) ?? null
        : null;
      const ownerId = diaDetalle?.usuario_id ?? rotationItem?.principal_usuario_id ?? "";
      const ownerName = diaDetalle?.usuario_nombre ?? rotationItem?.principal_usuario_nombre ?? "Sin asignar";
      const ownerDisplayName = formatDisplayName(ownerName);
      const swapPartnerName = diaDetalle?.usuarios.find((item) => item.usuario_id !== ownerId)?.usuario_nombre ?? null;
      const isMine = diaDetalle?.usuario_id === user?.id;
      const groupKey = isPlaceholder
        ? `placeholder:${row}`
        : isEmpty
        ? `empty:${row}:${isWeekend ? "weekend" : "weekday"}`
        : `assigned:${row}:${rotationItem?.semana_id}:${ownerId}`;

      const current = {
        key: groupKey,
        span: 1,
        startCell: cell,
        endCell: cell,
        isToday,
        isEmpty,
        isPlaceholder,
        isWeekend,
        ownerDisplayName,
        ownerId,
        isMine,
        rotationItem,
        swapPartnerName,
      };

      const previousGroup = groups[groups.length - 1];
      if (previousGroup && previousGroup.key === groupKey) {
        previousGroup.span += 1;
        previousGroup.endCell = cell;
        previousGroup.isToday = previousGroup.isToday || isToday;
      } else {
        groups.push(current);
      }
    }

    return groups;
  }, [monthColumns, rotationByDate, todayIso, user?.id, visibleMonthCells]);

  const visibleWeekdayHeader = useMemo(() => (isCompactWeek ? weekdayHeader.slice(0, 5) : weekdayHeader), [isCompactWeek]);

  const weekGroups = useMemo(() => {
    if (!selectedWeek) {
      return [];
    }

    type WeekGroup = {
      key: string;
      span: number;
      startCell: Date;
      endCell: Date;
      isToday: boolean;
      isEmpty: boolean;
      ownerDisplayName: string;
      ownerId: string;
      isMine: boolean;
      rotationItem?: SemanaRotacionResumen;
      swapPartnerName?: string | null;
    };

    const groups: WeekGroup[] = [];
    const startOfWeek = parseIsoDate(selectedWeek.fecha_inicio_semana);
    const maxDayIndex = isCompactWeek ? 5 : 7;

    for (let dayIndex = 0; dayIndex < maxDayIndex; dayIndex += 1) {
      const cell = addUtcDays(startOfWeek, dayIndex);
      const iso = toIsoDate(cell);
      const rotationItem = rotationByDate.get(iso);
      const isToday = iso === todayIso;
      const diaSemana = getDiaSemanaFromDate(cell);
      const diaDetalle = diaSemana
        ? rotationItem?.dias.find((item) => item.dia === diaSemana) ?? null
        : null;
      const ownerId = diaDetalle?.usuario_id ?? rotationItem?.principal_usuario_id ?? "";
      const ownerName = diaDetalle?.usuario_nombre ?? rotationItem?.principal_usuario_nombre ?? "Sin asignar";
      const ownerDisplayName = formatDisplayName(ownerName);
      const swapPartnerName = diaDetalle?.usuarios.find((item) => item.usuario_id !== ownerId)?.usuario_nombre ?? null;
      const isMine = diaDetalle?.usuario_id === user?.id;
      const groupKey = rotationItem && ownerId ? `assigned:${rotationItem.semana_id}:${ownerId}` : `empty:${iso}`;

      const current = {
        key: groupKey,
        span: 1,
        startCell: cell,
        endCell: cell,
        isToday,
        isEmpty: !rotationItem,
        ownerDisplayName,
        ownerId,
        isMine,
        rotationItem,
        swapPartnerName,
      };

      const previousGroup = groups[groups.length - 1];
      if (previousGroup && previousGroup.key === groupKey) {
        previousGroup.span += 1;
        previousGroup.endCell = cell;
        previousGroup.isToday = previousGroup.isToday || isToday;
      } else {
        groups.push(current);
      }
    }

    return groups;
  }, [isCompactWeek, rotationByDate, selectedWeek, todayIso, user?.id]);

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
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 flex-1 text-xl font-bold">Calendario de turnos</h2>
            <div className="glass-badge shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold uppercase sm:text-sm">
              {visibleDaysInRange} días a la vista
            </div>
          </div>

          <p className="text-sm text-[var(--primary-400)]">
            Consulta lo generado por día, semana y mes, con foco en la siguiente rotación.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-1">
              <button
                type="button"
                onClick={() => setViewMode("semana")}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
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
                className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                  viewMode === "mes"
                    ? "bg-[var(--color-surface-bright)] text-white"
                    : "text-[var(--primary-300)] hover:text-white"
                }`}
              >
                Mes
              </button>
            </div>

            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:max-w-[30rem]">
              <button
                type="button"
                onClick={viewMode === "semana" ? goToPreviousWeek : goToPreviousMonth}
                disabled={viewMode === "semana" ? !canGoPreviousWeek : !canGoPreviousMonth}
                className="inline-flex h-12 min-w-[3rem] items-center justify-center rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 text-lg font-semibold text-[var(--primary-300)] transition-colors duration-200 hover:border-[var(--primary-500)] hover:text-white disabled:opacity-30"
                aria-label="Semana anterior"
              >
                <span aria-hidden>{`<`}</span>
              </button>
              <div className="w-full min-w-0 sm:min-w-[14rem] sm:max-w-[22rem]">
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
                className="inline-flex h-12 min-w-[3rem] items-center justify-center rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 text-lg font-semibold text-[var(--primary-300)] transition-colors duration-200 hover:border-[var(--primary-500)] hover:text-white disabled:opacity-30"
                aria-label="Semana siguiente"
              >
                <span aria-hidden>{`>`}</span>
              </button>
            </div>
          </div>
        </div>

      </article>

      {viewMode === "semana" && (
        <article className="glass-card float-in space-y-4 p-5">
          <h3 className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--primary-500)]">Detalle semanal</h3>
          <p className="text-xs text-[var(--primary-500)]">
            Empleados en rotación: {selectedWeekEmployeeLegend.length}
          </p>

          {!selectedWeek ? (
            <p className="text-sm text-[var(--primary-400)] italic">Selecciona una semana</p>
          ) : (
            <div className="overflow-x-auto">
              <div className={isCompactWeek ? "space-y-3 p-1" : "min-w-[640px] space-y-3 p-1"}>
                <div className={`grid ${isCompactWeek ? "grid-cols-5" : "grid-cols-7"} gap-1`}>
                {visibleWeekdayHeader.map((label) => (
                  <div
                    key={`week-header-${label}`}
                    className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-bright)] px-1 py-1 text-center text-[10px] font-black uppercase tracking-wider text-[var(--primary-400)]"
                  >
                    {label}
                  </div>
                ))}
                </div>

                <div className={`grid ${isCompactWeek ? "grid-cols-5" : "grid-cols-7"} gap-1`}>
                  {weekGroups.map((group, groupIndex) => {
                    const spanStyle = { gridColumn: `span ${group.span}` };
                    const groupStartDate = group.startCell.getUTCDate();
                    const groupEndDate = group.endCell.getUTCDate();
                    const dateLabel = group.span > 1 ? `${groupStartDate} - ${groupEndDate}` : `${groupStartDate}`;
                    const todayRingClasses = group.isToday
                      ? "ring-2 ring-amber-300/80 border-amber-300/70 shadow-xl z-20"
                      : "hover:shadow-lg";

                    if (group.isEmpty) {
                      const weekendEmptyClasses = group.startCell.getUTCDay() === 0 || group.startCell.getUTCDay() === 6
                        ? "border-red-500/20 bg-red-500/10 text-rose-200"
                        : "border-slate-700 text-slate-400";

                      return (
                        <div
                          key={`week-group-empty-${groupIndex}`}
                          style={spanStyle}
                          className={`min-h-24 rounded-xl p-2 transition-all ${weekendEmptyClasses} ${todayRingClasses}`}
                        >
                          <div className="flex justify-start">
                            <p className="text-[10px] font-black opacity-50">{dateLabel}</p>
                          </div>
                        </div>
                      );
                    }

                    const baseClasses = group.isMine
                      ? "border-blue-500/60 bg-blue-500/15 text-blue-100"
                      : "border-slate-700 text-slate-300";

                    return (
                      <button
                        key={`week-group-${groupIndex}`}
                        type="button"
                        style={spanStyle}
                        onClick={() => handleSelectCalendarGroup(group)}
                        className={`min-h-24 w-full rounded-xl border p-2 text-left transition-all ${baseClasses} ${todayRingClasses}`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <p className="text-[10px] font-black opacity-60">{dateLabel}</p>
                          {group.span > 1 ? (
                            <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--primary-400)]">
                              {group.span} días
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-4 text-sm font-bold leading-tight truncate">
                          {group.ownerDisplayName}
                        </p>

                        {group.swapPartnerName ? (
                          <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-[var(--primary-200)]">
                            <span aria-hidden>↔</span>
                            {group.swapPartnerName}
                          </p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

              </div>
            </div>
          )}
          
          {viewMode === "semana" && (
            <article className="panel p-3">
              <p className="stat-label">Semana siguiente</p>
              <p className="stat-value mt-1">
                {nextWeekEmployees ?? "Sin siguiente"}
              </p>
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
          <div key={activeOverviewMonthKey} className="space-y-4">
            <div className="overflow-x-auto">
              <div className={isCompactWeek ? "space-y-3 p-1" : "min-w-[640px] space-y-3 p-1"}>
                <div className={`grid ${isCompactWeek ? "grid-cols-5" : "grid-cols-7"} gap-1`}>
              {visibleWeekdayHeader.map((label) => (
                <div
                  key={`${activeOverviewMonthKey}-${label}`}
                  className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-bright)] px-1 py-1 text-center text-[10px] font-black uppercase tracking-wider text-[var(--primary-400)]"
                >
                  {label}
                </div>
              ))}
                </div>

                <div className={`mt-2 grid ${isCompactWeek ? "grid-cols-5" : "grid-cols-7"} gap-1`}>
                  {monthGroups.map((group, groupIndex) => {
                    const spanStyle = { gridColumn: `span ${group.span}` };
                    const startDate = group.startCell?.getUTCDate() ?? "";
                    const endDate = group.endCell?.getUTCDate() ?? "";
                    const dateLabel = group.span > 1 ? `${startDate} - ${endDate}` : `${startDate}`;
                    const todayRingClasses = group.isToday
                      ? "ring-2 ring-amber-300/80 border-amber-300/70 shadow-xl z-20"
                      : "hover:shadow-lg";

                    if (group.isPlaceholder) {
                      return (
                        <div
                          key={`month-group-placeholder-${groupIndex}`}
                          style={spanStyle}
                          className="min-h-24 rounded-xl border border-dashed border-[var(--color-surface-border)] bg-[var(--color-background)]/30"
                        />
                      );
                    }

                    if (group.isEmpty) {
                      const weekendEmptyClasses = group.isWeekend
                        ? "border-red-500/20 bg-red-500/10 text-rose-200"
                        : "border-slate-700 text-slate-400";

                      return (
                        <div
                          key={`month-group-empty-${groupIndex}`}
                          style={spanStyle}
                          className={`min-h-24 rounded-xl p-2 transition-all ${weekendEmptyClasses} ${todayRingClasses}`}
                        >
                          <div className="flex justify-start">
                            <p className="text-[10px] font-black opacity-50">{dateLabel}</p>
                          </div>
                        </div>
                      );
                    }

                    const baseClasses = group.isMine
                      ? "border-blue-500/60 bg-blue-500/15 text-blue-100"
                      : "border-slate-700 text-slate-300";

                    return (
                      <button
                        key={`month-group-${groupIndex}`}
                        type="button"
                        style={spanStyle}
                        onClick={() => handleSelectCalendarGroup(group)}
                        className={`min-h-24 w-full rounded-xl border p-2 text-left transition-all ${baseClasses} ${todayRingClasses}`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <p className="text-[10px] font-black opacity-60">{dateLabel}</p>
                          {group.span > 1 ? (
                            <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--primary-400)]">
                              {group.span} días
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-4 text-sm font-bold leading-tight truncate">
                          {group.ownerDisplayName}
                        </p>

                        {group.swapPartnerName ? (
                          <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-[var(--primary-200)]">
                            <span aria-hidden>↔</span>
                            {group.swapPartnerName}
                          </p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </article>
      )}

      {selectedCalendarGroup && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[80]">
          <button
            type="button"
            aria-label="Cerrar detalle"
            onClick={closeGroupModal}
            className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto ${
              groupModalOpen ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            className={
              `absolute inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[56rem] overflow-y-auto rounded-t-3xl border border-[var(--color-surface-border)] bg-grey-900/98 p-6 shadow-2xl transition-transform duration-300 ease-out backdrop-blur-xl ${
                groupModalOpen ? "translate-y-0" : "translate-y-full"
              }`
            }
            style={{
              minHeight: "30vh",
              maxHeight: "82vh",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeGroupModal}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full p-2 text-[var(--primary-300)] transition hover:text-white"
              aria-label="Cerrar detalle"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--primary-500)]">Detalle de turno</p>
                <p className="text-lg font-semibold text-white">
                  {selectedCalendarGroup.ownerName}
                  {selectedCalendarGroup.isMine ? " · Tu turno" : ""}
                </p>
                <p className="text-sm text-[var(--primary-300)]">{selectedCalendarGroup.dateLabel}</p>
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--primary-400)]">{selectedCalendarGroup.dayCount} días</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <button
                  type="button"
                  onClick={() => {
                    const { ownerId, isMine, assignmentIds, weekId } = selectedCalendarGroup;
                    const preset: {
                      receptor_id?: string;
                      tipo: "dia" | "semana";
                      asignacion_origen_id?: string;
                      asignacion_origen_ids?: string[];
                      asignacion_destino_id?: string;
                      asignacion_destino_ids?: string[];
                      modo_compensacion: "bolsa" | "inmediata";
                      motivo: string;
                    } = {
                      tipo: "dia",
                      modo_compensacion: "bolsa",
                      motivo: "",
                    };

                    if (isMine) {
                      if (assignmentIds.length === 1) {
                        preset.asignacion_origen_id = assignmentIds[0];
                      } else if (assignmentIds.length > 1) {
                        preset.asignacion_origen_ids = assignmentIds;
                      }
                    } else {
                      preset.receptor_id = ownerId;
                      if (assignmentIds.length === 1) {
                        preset.asignacion_destino_id = assignmentIds[0];
                      } else if (assignmentIds.length > 1) {
                        preset.asignacion_destino_ids = assignmentIds;
                      }
                    }

                    const state = {
                      openNewRequest: true,
                      preset,
                      targetWeekId: weekId,
                    };

                    setSelectedWeekId(weekId ?? selectedWeekId);
                    closeGroupModal();
                    navigate("/intercambios", { state });
                  }}
                  className="glass-button inline-flex h-12 items-center justify-center rounded-2xl px-5 text-sm font-semibold"
                >
                  Solicitar intercambio
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
};
