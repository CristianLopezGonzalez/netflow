import { useMemo, useState } from "react";
import type { FormEvent } from "react";

import { api } from "../api";
import { NoticeBanner } from "../components/common/NoticeBanner";
import { WeekSelector } from "../components/common/WeekSelector";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import type { DiaSemana } from "../types";
import { asErrorMessage, dayOrder, formatWeek } from "../utils/formatters";

const defaultStart = "14:00";
const defaultEnd = "22:00";

const normalizeHour = (value: string): string => {
  if (value.length === 5) {
    return `${value}:00`;
  }
  return value;
};

export const AssignmentsPage = () => {
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

  const [mode, setMode] = useState<"dia" | "semana">("dia");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedDay, setSelectedDay] = useState<DiaSemana>("lunes");
  const [selectedWeekDays, setSelectedWeekDays] = useState<DiaSemana[]>([...dayOrder]);
  const [startHour, setStartHour] = useState(defaultStart);
  const [endHour, setEndHour] = useState(defaultEnd);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inlineUpdatingId, setInlineUpdatingId] = useState("");
  const [deletingAssignmentId, setDeletingAssignmentId] = useState("");
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({});

  const canManageAssignments = user?.rol === "admin" || user?.rol === "supervisor";

  const selectedWeek = useMemo(
    () => weeks.find((week) => week.id === selectedWeekId) ?? null,
    [weeks, selectedWeekId],
  );

  const availableUsers = useMemo(() => {
    const base = [...users];
    if (user && !base.some((entry) => entry.id === user.id)) {
      base.unshift(user);
    }
    return base;
  }, [user, users]);

  const sortedAssignments = useMemo(
    () =>
      [...weekAssignments].sort((a, b) => {
        const dayOrderMap: Record<DiaSemana, number> = {
          lunes: 1,
          martes: 2,
          miercoles: 3,
          jueves: 4,
          viernes: 5,
        };
        const dayDiff = dayOrderMap[a.dia] - dayOrderMap[b.dia];
        if (dayDiff !== 0) {
          return dayDiff;
        }
        return (a.usuario_detalle?.nombre ?? "").localeCompare(b.usuario_detalle?.nombre ?? "");
      }),
    [weekAssignments],
  );

  const clearMessages = () => {
    setError("");
    setNotice("");
  };

  const clearAssignmentDraft = (assignmentId: string) => {
    setAssignmentDrafts((current) => {
      if (!(assignmentId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[assignmentId];
      return next;
    });
  };

  const toggleWeekDay = (day: DiaSemana) => {
    setSelectedWeekDays((current) => {
      if (current.includes(day)) {
        return current.filter((item) => item !== day);
      }
      return [...current, day];
    });
  };

  const handleCreateAssignments = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessages();

    if (!selectedWeekId) {
      setError("Debes seleccionar una semana.");
      return;
    }
    if (!selectedUserId) {
      setError("Debes seleccionar un trabajador.");
      return;
    }

    const horaInicio = normalizeHour(startHour);
    const horaFin = normalizeHour(endHour);

    if (horaInicio >= horaFin) {
      setError("La hora de inicio debe ser menor que la hora fin.");
      return;
    }

    const daysToAssign = mode === "dia" ? [selectedDay] : selectedWeekDays;
    if (daysToAssign.length === 0) {
      setError("Selecciona al menos un dia para asignar.");
      return;
    }

    setBusy(true);

    try {
      const results = await Promise.allSettled(
        daysToAssign.map(async (day) => {
          const existing = weekAssignments.find(
            (assignment) => assignment.usuario === selectedUserId && assignment.dia === day,
          );

          if (!existing) {
            await api.crearAsignacion({
              semana: selectedWeekId,
              usuario: selectedUserId,
              dia: day,
              hora_inicio: horaInicio,
              hora_fin: horaFin,
            });
            return "created" as const;
          }

          if (existing.hora_inicio === horaInicio && existing.hora_fin === horaFin) {
            return "skipped" as const;
          }

          await api.actualizarAsignacion(existing.id, {
            hora_inicio: horaInicio,
            hora_fin: horaFin,
            estado: "asignado",
          });
          return "updated" as const;
        }),
      );

      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const result of results) {
        if (result.status !== "fulfilled") {
          continue;
        }
        if (result.value === "created") {
          createdCount += 1;
        }
        if (result.value === "updated") {
          updatedCount += 1;
        }
        if (result.value === "skipped") {
          skippedCount += 1;
        }
      }

      const failures = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );

      await reloadWeekDetail(selectedWeekId);
      await reloadAll();

      if (failures.length === 0) {
        const processed = createdCount + updatedCount + skippedCount;
        setNotice(
          `Procesadas ${processed} asignacion(es): nuevas ${createdCount}, actualizadas ${updatedCount}, sin cambios ${skippedCount}.`,
        );
      } else {
        const firstError = asErrorMessage(failures[0].reason);
        setError(
          `Procesadas ${createdCount + updatedCount + skippedCount} asignacion(es), con ${failures.length} error(es). Detalle: ${firstError}`,
        );
      }
    } catch (createError) {
      setError(asErrorMessage(createError));
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateAssignmentUser = async (
    assignmentId: string,
    nextUserId: string,
    currentUserId: string,
  ) => {
    if (!nextUserId || nextUserId === currentUserId) {
      clearAssignmentDraft(assignmentId);
      return;
    }

    clearMessages();
    setInlineUpdatingId(assignmentId);

    try {
      await api.actualizarAsignacion(assignmentId, { usuario: nextUserId });
      setNotice("Asignacion actualizada correctamente.");
      await reloadWeekDetail(selectedWeekId);
      await reloadAll();
    } catch (updateError) {
      setError(asErrorMessage(updateError));
    } finally {
      setInlineUpdatingId("");
      clearAssignmentDraft(assignmentId);
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    clearMessages();
    setDeletingAssignmentId(assignmentId);

    try {
      await api.eliminarAsignacion(assignmentId);
      setNotice("Asignacion eliminada correctamente.");
      await reloadWeekDetail(selectedWeekId);
      await reloadAll();
    } catch (deleteError) {
      setError(asErrorMessage(deleteError));
    } finally {
      setDeletingAssignmentId("");
      clearAssignmentDraft(assignmentId);
    }
  };

  if (!canManageAssignments) {
    return (
      <section className="glass-card float-in space-y-3 p-5">
        <h2 className="text-xl font-bold">Asignaciones</h2>
        <NoticeBanner
          message="Solo admin o supervisor pueden crear o editar asignaciones."
          kind="info"
        />
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <article className="glass-card float-in space-y-4 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-bold">Asignar turnos</h2>
            <p className="mt-1 text-sm text-[var(--primary-400)]">
              Crea turnos por dia o semana y asignalos a trabajadores.
            </p>
          </div>

          <div className="w-full max-w-md">
            <WeekSelector
              weeks={weeks}
              selectedWeekId={selectedWeekId}
              onChange={setSelectedWeekId}
              label="Semana"
            />
          </div>
        </div>

        {selectedWeek && (
          <div className="glass-chip px-3 py-2 text-sm font-bold">
            Semana seleccionada: {formatWeek(selectedWeek)}
          </div>
        )}

        <form className="space-y-4 glass-panel p-4" onSubmit={handleCreateAssignments}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="block text-sm text-[var(--primary-300)]">
              Trabajador
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="glass-input mt-2 w-full rounded-xl px-4 text-base font-medium"
                required
              >
                <option value="">Selecciona usuario</option>
                {availableUsers.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.nombre} ({entry.email})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-[var(--primary-300)]">
              Modo
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as "dia" | "semana")}
                className="glass-input mt-2 w-full rounded-xl px-4 text-base font-medium"
              >
                <option value="dia">Dia</option>
                <option value="semana">Semana</option>
              </select>
            </label>

            <label className="block text-sm text-[var(--primary-300)]">
              Hora inicio
              <input
                type="time"
                value={startHour}
                onChange={(event) => setStartHour(event.target.value)}
                className="glass-input mt-2 w-full rounded-xl px-4 text-base font-medium"
                required
              />
            </label>

            <label className="block text-sm text-[var(--primary-300)]">
              Hora fin
              <input
                type="time"
                value={endHour}
                onChange={(event) => setEndHour(event.target.value)}
                className="glass-input mt-2 w-full rounded-xl px-4 text-base font-medium"
                required
              />
            </label>

            {mode === "dia" ? (
              <label className="block text-sm text-[var(--primary-300)]">
                Dia
                <select
                  value={selectedDay}
                  onChange={(event) => setSelectedDay(event.target.value as DiaSemana)}
                  className="glass-input mt-2 w-full rounded-xl px-4 text-base font-medium"
                >
                  {dayOrder.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="xl:col-span-1">
                <p className="text-sm text-[var(--primary-300)]">Dias de semana</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {dayOrder.map((day) => {
                    const checked = selectedWeekDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleWeekDay(day)}
                        className={`h-8 rounded-lg border px-3 text-xs font-bold transition-all ${
                          checked
                            ? "bg-[var(--primary-700)] border-[var(--primary-600)] text-white shadow-sm"
                            : "bg-[var(--color-surface-hover)] border-[var(--color-surface-border)] text-[var(--primary-400)]"
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="glass-button glass-button-primary h-11 rounded-xl px-6 text-sm font-bold shadow-lg disabled:opacity-50"
            >
              {busy ? "Guardando..." : mode === "dia" ? "Asignar dia" : "Asignar semana"}
            </button>
            <button
              type="button"
              onClick={() => void reloadWeekDetail(selectedWeekId)}
              className="glass-button h-11 rounded-xl px-6 text-sm font-bold"
            >
              Refrescar lista
            </button>
          </div>

          <div className="space-y-2">
            <NoticeBanner message={error} kind="error" />
            <NoticeBanner message={notice} kind="success" />
          </div>
        </form>
      </article>

      <article className="glass-card float-in space-y-4 p-5">
        <h3 className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--primary-500)]">Asignaciones de la semana seleccionada</h3>

        {sortedAssignments.length === 0 && (
          <p className="text-sm text-[var(--primary-600)] italic">No hay asignaciones en esta semana.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sortedAssignments.map((assignment) => (
            <div
              key={assignment.id}
              className="panel p-3 border border-[var(--color-surface-border)] shadow-sm"
            >
              <div className="mb-3">
                <p className="text-sm font-bold text-[var(--primary-50)]">
                  {assignment.dia} · {assignment.hora_inicio.slice(0, 5)}-{assignment.hora_fin.slice(0, 5)}
                </p>
                <p className="text-[11px] font-medium text-[var(--primary-400)] mt-0.5">
                  Asignado a: {assignment.usuario_detalle?.nombre ?? assignment.usuario}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={assignmentDrafts[assignment.id] ?? assignment.usuario}
                  onChange={(event) => {
                    const nextUserId = event.target.value;
                    setAssignmentDrafts((current) => ({ ...current, [assignment.id]: nextUserId }));
                    void handleUpdateAssignmentUser(assignment.id, nextUserId, assignment.usuario);
                  }}
                  disabled={inlineUpdatingId === assignment.id || deletingAssignmentId === assignment.id}
                  className="glass-input flex-1 h-9 rounded-lg px-2 text-xs"
                >
                  {availableUsers.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.nombre}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={inlineUpdatingId === assignment.id || deletingAssignmentId === assignment.id}
                  onClick={() => void handleDeleteAssignment(assignment.id)}
                  className="glass-button glass-button-danger h-9 w-9 p-0 flex items-center justify-center rounded-lg disabled:opacity-50"
                  title="Eliminar"
                >
                  {deletingAssignmentId === assignment.id ? "..." : "×"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
};
