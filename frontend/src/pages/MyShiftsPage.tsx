import { useMemo } from "react";

import { WeekSelector } from "../components/common/WeekSelector";
import { useAppData } from "../context/AppDataContext";

export const MyShiftsPage = () => {
  const { weeks, selectedWeekId, setSelectedWeekId, myAssignments } = useAppData();

  const filteredAssignments = useMemo(() => {
    if (!selectedWeekId) {
      return myAssignments;
    }
    return myAssignments.filter((assignment) => assignment.semana === selectedWeekId);
  }, [myAssignments, selectedWeekId]);

  return (
    <section className="glass-card float-in space-y-4 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-bold">Mis tardes</h2>
          <p className="mt-1 text-sm text-[var(--primary-400)]">
            Tus turnos asignados e intercambiados para la semana seleccionada.
          </p>
        </div>

        <div className="w-full max-w-md">
          <WeekSelector
            weeks={weeks}
            selectedWeekId={selectedWeekId}
            onChange={setSelectedWeekId}
            label="Filtrar por semana"
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredAssignments.length === 0 && (
          <p className="text-sm text-[var(--primary-500)]">No tienes turnos en este filtro.</p>
        )}

        {filteredAssignments.map((item) => (
          <article key={item.id} className="panel p-4">
            <p className="mono text-[10px] font-black uppercase tracking-[0.1em] text-[var(--primary-500)]">{item.estado}</p>
            <p className="mt-2 text-lg font-bold text-[var(--primary-50)]">{item.dia}</p>
            <p className="text-sm text-[var(--primary-400)]">
              {item.hora_inicio.slice(0, 5)} - {item.hora_fin.slice(0, 5)}
            </p>
            <p className="mt-2 text-[10px] font-medium text-[var(--primary-600)]">Semana ID: {item.semana}</p>
          </article>
        ))}
      </div>
    </section>
  );
};
