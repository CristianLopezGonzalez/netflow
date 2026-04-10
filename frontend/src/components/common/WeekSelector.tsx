import type { Semana } from "../../types";
import { formatWeek } from "../../utils/formatters";

interface WeekSelectorProps {
  weeks: Semana[];
  selectedWeekId: string;
  onChange: (weekId: string) => void;
  label?: string;
}

export const WeekSelector = ({ weeks, selectedWeekId, onChange, label = "Semana" }: WeekSelectorProps) => {
  const hasWeeks = weeks.length > 0;

  return (
    <label className="block">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <span className="glass-badge rounded-full px-2.5 py-1 text-xs font-semibold">
          {hasWeeks ? `${weeks.length} semana(s)` : "Sin semanas"}
        </span>
      </div>
      <select
        value={selectedWeekId}
        onChange={(event) => onChange(event.target.value)}
        disabled={!hasWeeks}
        className="glass-input mt-2 h-12 w-full rounded-xl px-4 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
      >
        {!hasWeeks && <option value="">Sin semanas publicadas</option>}
        {weeks.map((week) => (
          <option key={week.id} value={week.id}>
            {formatWeek(week)}
          </option>
        ))}
      </select>
      {hasWeeks && (
        <p className="mt-2 text-xs text-[color:var(--ink-soft)]">
          Selecciona una semana para filtrar turnos y operaciones.
        </p>
      )}
    </label>
  );
};
