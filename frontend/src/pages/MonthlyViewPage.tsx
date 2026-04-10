import { useMemo } from "react";

import { useAppData } from "../context/AppDataContext";
import type { DiaSemana, Semana } from "../types";

const weekdayHeader = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

const weekdayFormatter = new Intl.DateTimeFormat("es-ES", {
  weekday: "short",
  timeZone: "UTC",
});

const monthTitleFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const monthCellFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dayIndex: Record<DiaSemana, number> = {
  lunes: 0,
  martes: 1,
  miercoles: 2,
  jueves: 3,
  viernes: 4,
};

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

const toMonthKey = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
};

const parseMonthKey = (monthKey: string): { year: number; monthIndex: number } => {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  return { year, monthIndex: month - 1 };
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

const monthKeysFromWeeks = (weeks: Semana[]): string[] => {
  const keys = new Set<string>();

  for (const week of weeks) {
    const monday = parseIsoDate(week.fecha_inicio_semana);
    for (let offset = 0; offset < 5; offset += 1) {
      keys.add(toMonthKey(addUtcDays(monday, offset)));
    }
  }

  if (keys.size === 0) {
    keys.add(toMonthKey(new Date()));
  }

  return [...keys].sort((left, right) => left.localeCompare(right));
};

export const MonthlyViewPage = () => {
  const { weeks, myAssignments } = useAppData();

  const weekById = useMemo(() => {
    return new Map(weeks.map((week) => [week.id, week]));
  }, [weeks]);

  const coveredDateSet = useMemo(() => {
    const covered = new Set<string>();

    for (const week of weeks) {
      const monday = parseIsoDate(week.fecha_inicio_semana);
      for (let offset = 0; offset < 5; offset += 1) {
        covered.add(toIsoDate(addUtcDays(monday, offset)));
      }
    }

    return covered;
  }, [weeks]);

  const assignmentsByDate = useMemo(() => {
    const grouped = new Map<string, Array<{ id: string; hora_inicio: string; hora_fin: string }>>();

    for (const assignment of myAssignments) {
      const week = weekById.get(assignment.semana);
      if (!week) {
        continue;
      }

      const offset = dayIndex[assignment.dia];
      if (offset === undefined) {
        continue;
      }

      const date = addUtcDays(parseIsoDate(week.fecha_inicio_semana), offset);
      const iso = toIsoDate(date);
      const current = grouped.get(iso) ?? [];
      current.push({
        id: assignment.id,
        hora_inicio: assignment.hora_inicio,
        hora_fin: assignment.hora_fin,
      });
      grouped.set(iso, current);
    }

    return grouped;
  }, [myAssignments, weekById]);

  const monthKeys = useMemo(() => monthKeysFromWeeks(weeks), [weeks]);

  return (
    <section className="space-y-4">
      <article className="glass-card float-in p-5">
        <h2 className="text-xl font-bold text-slate-900">Vista mensual</h2>
        <p className="mt-1 text-sm text-slate-600">
          Se muestran todos los dias del mes. Los dias fuera de semanas creadas se mantienen visibles
          como vacios para que el calendario mensual siempre sea completo.
        </p>
      </article>

      {monthKeys.map((monthKey) => {
        const { year, monthIndex } = parseMonthKey(monthKey);
        const monthCells = buildMonthCells(year, monthIndex);
        const assignedCount = monthCells.reduce((count, cell) => {
          if (!cell) {
            return count;
          }
          const iso = toIsoDate(cell);
          return count + (assignmentsByDate.has(iso) ? 1 : 0);
        }, 0);

        return (
          <article key={monthKey} className="glass-card float-in p-5">
            <header className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <h3 className="text-xl font-bold capitalize text-slate-900">
                {monthTitleFormatter.format(new Date(Date.UTC(year, monthIndex, 1)))}
              </h3>
              <p className="text-sm font-medium text-slate-600">
                Dias con turno asignado: <span className="font-bold text-teal-700">{assignedCount}</span>
              </p>
            </header>

            <div className="grid grid-cols-7 gap-2">
              {weekdayHeader.map((label) => (
                <div
                  key={`${monthKey}-${label}`}
                  className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-2">
              {monthCells.map((cell, index) => {
                if (!cell) {
                  return (
                    <div
                      key={`${monthKey}-empty-${index}`}
                      className="min-h-24 rounded-xl border border-dashed border-slate-200 bg-white/40"
                    />
                  );
                }

                const iso = toIsoDate(cell);
                const hasCoverage = coveredDateSet.has(iso);
                const assignments = assignmentsByDate.get(iso) ?? [];
                const hasAssignments = assignments.length > 0;

                const stateClasses = hasAssignments
                  ? "border-teal-400 bg-teal-50 text-teal-900"
                  : hasCoverage
                    ? "border-slate-300 bg-slate-50 text-slate-800"
                    : "border-slate-200 bg-white text-slate-500";

                return (
                  <div
                    key={`${monthKey}-${iso}`}
                    className={`min-h-24 rounded-xl border p-2 ${stateClasses}`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide">
                      {weekdayFormatter.format(cell).replace(".", "")}
                    </p>
                    <p className="text-sm font-bold">{cell.getUTCDate()}</p>
                    <p className="text-[11px] text-slate-500">
                      {monthCellFormatter.format(cell).replace(".", "")}
                    </p>

                    {hasAssignments ? (
                      <div className="mt-1 space-y-1">
                        <p className="text-[11px] font-semibold text-teal-700">Asignado</p>
                        {assignments.slice(0, 2).map((assignment) => (
                          <p key={assignment.id} className="mono text-[11px] text-teal-800">
                            {assignment.hora_inicio.slice(0, 5)}-{assignment.hora_fin.slice(0, 5)}
                          </p>
                        ))}
                        {assignments.length > 2 && (
                          <p className="text-[11px] font-semibold text-teal-700">
                            +{assignments.length - 2} turno(s)
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px]">{hasCoverage ? "Semana creada" : "Sin semana"}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
    </section>
  );
};
