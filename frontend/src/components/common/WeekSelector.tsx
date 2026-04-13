import { useMemo } from "react";
import type { Semana } from "../../types";
import { formatWeek } from "../../utils/formatters";
import CustomSelect from "./CustomSelect";

interface WeekSelectorProps {
  weeks: Semana[];
  selectedWeekId: string;
  onChange: (weekId: string) => void;
  label?: string;
  formatOption?: (week: Semana) => string;
}

const defaultFormatOption = (week: Semana) => formatWeek(week);

export const WeekSelector = ({
  weeks,
  selectedWeekId,
  onChange,
  label = "Semana",
  formatOption = defaultFormatOption,
}: WeekSelectorProps) => {
  const hasWeeks = weeks.length > 0;

  const options = useMemo(
    () =>
      weeks.map((week) => ({
        value: week.id,
        label: formatOption(week),
      })),
    [weeks, formatOption],
  );

  return (
    <label className="block">
      {label ? (
        <div className="mb-2">
          <span className="text-sm font-semibold">{label}</span>
        </div>
      ) : null}
      <CustomSelect
        value={selectedWeekId}
        onChange={(value) => onChange(String(value))}
        options={hasWeeks ? options : [{ value: "", label: "Sin semanas publicadas" }]}
        placeholder={hasWeeks ? "Selecciona semana" : "Sin semanas"}
        className="mt-2 w-full"
        hSize="h-12"
        disabled={!hasWeeks}
      />
      {hasWeeks && (
        <p className="mt-2 text-xs text-[color:var(--ink-soft)]">
          Selecciona una semana para filtrar turnos y operaciones.
        </p>
      )}
    </label>
  );
};
