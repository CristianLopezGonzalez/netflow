import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { api } from "../api";
import { NoticeBanner } from "../components/common/NoticeBanner";
import { WeekSelector } from "../components/common/WeekSelector";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import type { Asignacion, BolsaMovimiento, BolsaSaldoCompanero, Semana } from "../types";
import { asErrorMessage, dayOrder, formatAssignment, formatWeek } from "../utils/formatters";

type DireccionCompensacion = "cobrar" | "devolver";
type MovementTypeFilter = "todos" | "genera_deuda" | "compensa_deuda";
type MovementOrder = "desc" | "asc";

type StoredMovementFilters = {
  search: string;
  type: MovementTypeFilter;
  companion: string;
  dateFrom: string;
  dateTo: string;
  order: MovementOrder;
};

const MOVEMENT_FILTERS_STORAGE_KEY = "netflow.bolsa.movements.filters.v1";

const isMovementTypeFilter = (value: string): value is MovementTypeFilter => {
  return value === "todos" || value === "genera_deuda" || value === "compensa_deuda";
};

const isMovementOrder = (value: string): value is MovementOrder => {
  return value === "asc" || value === "desc";
};

const sortByDay = (assignments: Asignacion[]): Asignacion[] => {
  return [...assignments].sort((a, b) => dayOrder.indexOf(a.dia) - dayOrder.indexOf(b.dia));
};

const getWeeklyReferenceAssignment = (assignments: Asignacion[]): Asignacion | null => {
  return sortByDay(assignments)[0] ?? null;
};

const resolveMovementCompanion = (
  movement: BolsaMovimiento,
  currentUserId?: string,
) => {
  if (!currentUserId) {
    return movement.destino_usuario;
  }

  if (movement.origen_usuario.id === currentUserId) {
    return movement.destino_usuario;
  }

  if (movement.destino_usuario.id === currentUserId) {
    return movement.origen_usuario;
  }

  return movement.destino_usuario;
};

const panelCardClass = "glass-panel p-4";
const selectChipClass = "glass-chip w-full rounded-lg px-3 py-2 text-left text-sm font-medium";
const formControlClass = "glass-input mt-2 h-11 w-full rounded-xl px-4 text-base font-medium";
const textAreaControlClass = "glass-input mt-2 min-h-24 w-full rounded-xl px-4 py-3 text-base";
const summaryCardClass = "glass-soft rounded-xl px-3 py-2";
const movementControlClass = "glass-input mt-1 h-10 w-full rounded-lg px-3 text-sm font-medium";

export const BolsaPage = () => {
  const { user } = useAuth();
  const {
    weeks,
    selectedWeekId,
    setSelectedWeekId,
    myAssignments,
    bolsaSaldos,
    movements,
    reloadAll,
  } = useAppData();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingCompanionBalance, setLoadingCompanionBalance] = useState(false);
  const [companionBalanceError, setCompanionBalanceError] = useState("");
  const [loadingCompanionWeeks, setLoadingCompanionWeeks] = useState(false);
  const [loadingCompanionAssignments, setLoadingCompanionAssignments] = useState(false);
  const [companionAssignmentsError, setCompanionAssignmentsError] = useState("");
  const [companionWeekOptions, setCompanionWeekOptions] = useState<Semana[]>([]);
  const [companionAssignments, setCompanionAssignments] = useState<Asignacion[]>([]);
  const [companionBalance, setCompanionBalance] = useState<BolsaSaldoCompanero | null>(null);
  const [selectedDayOriginIds, setSelectedDayOriginIds] = useState<string[]>([]);
  const [movementSearch, setMovementSearch] = useState("");
  const [movementTypeFilter, setMovementTypeFilter] = useState<MovementTypeFilter>("todos");
  const [movementCompanionFilter, setMovementCompanionFilter] = useState("todos");
  const [movementDateFrom, setMovementDateFrom] = useState("");
  const [movementDateTo, setMovementDateTo] = useState("");
  const [movementOrder, setMovementOrder] = useState<MovementOrder>("desc");
  const [movementFiltersHydrated, setMovementFiltersHydrated] = useState(false);
  const [form, setForm] = useState<{
    usuario_id: string;
    direccion: DireccionCompensacion;
    tipo: "dia" | "semana";
    asignacion_origen_id: string;
    motivo: string;
  }>({
    usuario_id: "",
    direccion: "cobrar",
    tipo: "dia",
    asignacion_origen_id: "",
    motivo: "",
  });

  const selectedWeek = useMemo(
    () => weeks.find((week) => week.id === selectedWeekId) ?? null,
    [weeks, selectedWeekId],
  );

  const filteredMyAssignments = useMemo(() => {
    if (!selectedWeekId) {
      return [];
    }
    return sortByDay(myAssignments.filter((item) => item.semana === selectedWeekId));
  }, [myAssignments, selectedWeekId]);

  const myWeekOptions = useMemo(() => {
    const myWeekIds = new Set(myAssignments.map((assignment) => assignment.semana));
    return weeks.filter((week) => myWeekIds.has(week.id));
  }, [myAssignments, weeks]);

  const usuariosQueMeDeben = useMemo(
    () => bolsaSaldos.me_deben.filter((item) => item.me_deben > 0),
    [bolsaSaldos.me_deben],
  );

  const usuariosALosQueDebo = useMemo(
    () => bolsaSaldos.debo.filter((item) => item.debo > 0),
    [bolsaSaldos.debo],
  );

  const companionsDisponibles = useMemo(() => {
    return form.direccion === "cobrar" ? usuariosQueMeDeben : usuariosALosQueDebo;
  }, [form.direccion, usuariosALosQueDebo, usuariosQueMeDeben]);

  const weekOptionsForOperation = useMemo(() => {
    if (form.direccion === "cobrar") {
      return myWeekOptions;
    }
    if (!form.usuario_id) {
      return [];
    }
    return companionWeekOptions;
  }, [companionWeekOptions, form.direccion, form.usuario_id, myWeekOptions]);

  const hasDevolverDebt = usuariosALosQueDebo.length > 0;

  const sourceAssignmentsSemana = useMemo(() => {
    if (form.direccion === "cobrar") {
      return filteredMyAssignments;
    }
    return companionAssignments;
  }, [companionAssignments, filteredMyAssignments, form.direccion]);

  const sourceAssignmentsDia = useMemo(() => sourceAssignmentsSemana, [sourceAssignmentsSemana]);

  const weeklyReferenceAssignment = useMemo(
    () => getWeeklyReferenceAssignment(sourceAssignmentsSemana),
    [sourceAssignmentsSemana],
  );

  const selectedDayAssignments = useMemo(
    () =>
      sortByDay(
        sourceAssignmentsDia.filter((item) => selectedDayOriginIds.includes(item.id)),
      ),
    [selectedDayOriginIds, sourceAssignmentsDia],
  );

  const totalMeDeben = bolsaSaldos.me_deben.reduce((sum, item) => sum + item.me_deben, 0);
  const totalDebo = bolsaSaldos.debo.reduce((sum, item) => sum + item.debo, 0);
  const diasOperacionSemana = sourceAssignmentsSemana.length;

  const deudaDisponible = companionBalance
    ? form.direccion === "cobrar"
      ? companionBalance.me_deben
      : companionBalance.debo
    : null;

  const movementCompanionOptions = useMemo(() => {
    const byId = new Map<string, string>();

    for (const movement of movements) {
      const companion = resolveMovementCompanion(movement, user?.id);
      byId.set(companion.id, companion.nombre);
    }

    return [...byId.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((left, right) => left.nombre.localeCompare(right.nombre));
  }, [movements, user?.id]);

  const hasActiveMovementFilters =
    movementSearch.trim().length > 0
    || movementTypeFilter !== "todos"
    || movementCompanionFilter !== "todos"
    || movementDateFrom.length > 0
    || movementDateTo.length > 0
    || movementOrder !== "desc";

  const filteredMovements = useMemo(() => {
    const search = movementSearch.trim().toLowerCase();

    const filtered = movements.filter((movement) => {
      if (movementTypeFilter !== "todos" && movement.tipo !== movementTypeFilter) {
        return false;
      }

      const companion = resolveMovementCompanion(movement, user?.id);
      if (movementCompanionFilter !== "todos" && companion.id !== movementCompanionFilter) {
        return false;
      }

      const movementDate = movement.fecha.slice(0, 10);
      if (movementDateFrom && movementDate < movementDateFrom) {
        return false;
      }
      if (movementDateTo && movementDate > movementDateTo) {
        return false;
      }

      if (!search) {
        return true;
      }

      const text = [
        movement.origen_usuario.nombre,
        movement.destino_usuario.nombre,
        movement.tipo,
        movementDate,
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(search);
    });

    return filtered.sort((left, right) => {
      const leftDate = left.fecha;
      const rightDate = right.fecha;
      if (movementOrder === "asc") {
        return leftDate.localeCompare(rightDate);
      }
      return rightDate.localeCompare(leftDate);
    });
  }, [
    movementCompanionFilter,
    movementDateFrom,
    movementDateTo,
    movementOrder,
    movementSearch,
    movementTypeFilter,
    movements,
    user?.id,
  ]);

  useEffect(() => {
    try {
      const rawStored = window.sessionStorage.getItem(MOVEMENT_FILTERS_STORAGE_KEY);
      if (!rawStored) {
        return;
      }

      const parsed = JSON.parse(rawStored) as Partial<StoredMovementFilters>;
      if (typeof parsed.search === "string") {
        setMovementSearch(parsed.search);
      }
      if (typeof parsed.type === "string" && isMovementTypeFilter(parsed.type)) {
        setMovementTypeFilter(parsed.type);
      }
      if (typeof parsed.companion === "string" && parsed.companion.length > 0) {
        setMovementCompanionFilter(parsed.companion);
      }
      if (typeof parsed.dateFrom === "string") {
        setMovementDateFrom(parsed.dateFrom);
      }
      if (typeof parsed.dateTo === "string") {
        setMovementDateTo(parsed.dateTo);
      }
      if (typeof parsed.order === "string" && isMovementOrder(parsed.order)) {
        setMovementOrder(parsed.order);
      }
    } catch {
      // Ignore malformed persisted filters and keep defaults.
    } finally {
      setMovementFiltersHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!movementFiltersHydrated) {
      return;
    }

    const payload: StoredMovementFilters = {
      search: movementSearch,
      type: movementTypeFilter,
      companion: movementCompanionFilter,
      dateFrom: movementDateFrom,
      dateTo: movementDateTo,
      order: movementOrder,
    };

    try {
      window.sessionStorage.setItem(MOVEMENT_FILTERS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage write errors to keep filters functional in-memory.
    }
  }, [
    movementCompanionFilter,
    movementDateFrom,
    movementDateTo,
    movementFiltersHydrated,
    movementOrder,
    movementSearch,
    movementTypeFilter,
  ]);

  useEffect(() => {
    if (movementCompanionFilter === "todos") {
      return;
    }

    if (movementCompanionOptions.some((item) => item.id === movementCompanionFilter)) {
      return;
    }

    setMovementCompanionFilter("todos");
  }, [movementCompanionFilter, movementCompanionOptions]);

  useEffect(() => {
    let active = true;

    const loadCompanionBalance = async () => {
      if (!form.usuario_id) {
        setCompanionBalance(null);
        setCompanionBalanceError("");
        return;
      }

      setLoadingCompanionBalance(true);
      setCompanionBalanceError("");

      try {
        const data = await api.bolsaSaldoUsuario(form.usuario_id);
        if (active) {
          setCompanionBalance(data);
        }
      } catch (loadError) {
        if (active) {
          setCompanionBalance(null);
          setCompanionBalanceError(asErrorMessage(loadError));
        }
      } finally {
        if (active) {
          setLoadingCompanionBalance(false);
        }
      }
    };

    void loadCompanionBalance();
    return () => {
      active = false;
    };
  }, [form.usuario_id]);

  useEffect(() => {
    let active = true;

    const loadCompanionWeeks = async () => {
      if (form.direccion !== "devolver" || !form.usuario_id) {
        setCompanionWeekOptions([]);
        setLoadingCompanionWeeks(false);
        return;
      }

      setLoadingCompanionWeeks(true);
      try {
        const rotationSummary = await api.semanasRotacion();
        if (!active) {
          return;
        }

        const weekIds = new Set(
          rotationSummary
            .filter((weekSummary) =>
              weekSummary.empleados.some((employeeSummary) => employeeSummary.usuario_id === form.usuario_id),
            )
            .map((weekSummary) => weekSummary.semana_id),
        );

        setCompanionWeekOptions(weeks.filter((week) => weekIds.has(week.id)));
      } catch (loadError) {
        if (!active) {
          return;
        }
        setCompanionWeekOptions([]);
        setError(asErrorMessage(loadError));
      } finally {
        if (active) {
          setLoadingCompanionWeeks(false);
        }
      }
    };

    void loadCompanionWeeks();
    return () => {
      active = false;
    };
  }, [form.direccion, form.usuario_id, weeks]);

  const loadCompanionAssignments = useCallback(async () => {
    if (form.direccion !== "devolver" || !form.usuario_id || !selectedWeekId) {
      setCompanionAssignments([]);
      setCompanionAssignmentsError("");
      setLoadingCompanionAssignments(false);
      return;
    }

    setLoadingCompanionAssignments(true);
    setCompanionAssignmentsError("");

    try {
      const detail = await api.semanaDetalle(selectedWeekId);
      const assignments = detail.asignaciones.filter((item) => item.usuario === form.usuario_id);
      setCompanionAssignments(sortByDay(assignments));
    } catch (loadError) {
      setCompanionAssignments([]);
      setCompanionAssignmentsError(asErrorMessage(loadError));
    } finally {
      setLoadingCompanionAssignments(false);
    }
  }, [form.direccion, form.usuario_id, selectedWeekId]);

  useEffect(() => {
    void loadCompanionAssignments();
  }, [loadCompanionAssignments]);

  useEffect(() => {
    if (selectedWeekId && weekOptionsForOperation.some((week) => week.id === selectedWeekId)) {
      return;
    }

    setSelectedWeekId(weekOptionsForOperation[0]?.id ?? "");
  }, [selectedWeekId, setSelectedWeekId, weekOptionsForOperation]);

  useEffect(() => {
    if (form.direccion !== "devolver" || hasDevolverDebt) {
      return;
    }

    setCompanionBalance(null);
    setCompanionBalanceError("");
    setCompanionAssignments([]);
    setCompanionAssignmentsError("");
    setSelectedDayOriginIds([]);
    setForm((current) => ({
      ...current,
      direccion: "cobrar",
      usuario_id: "",
      asignacion_origen_id: "",
    }));
  }, [form.direccion, hasDevolverDebt]);

  useEffect(() => {
    if (!form.usuario_id) {
      return;
    }

    if (companionsDisponibles.some((item) => item.usuario.id === form.usuario_id)) {
      return;
    }

    setCompanionBalance(null);
    setCompanionAssignments([]);
    setSelectedDayOriginIds([]);
    setForm((current) => ({
      ...current,
      usuario_id: "",
      asignacion_origen_id: "",
    }));
  }, [companionsDisponibles, form.usuario_id]);

  useEffect(() => {
    if (form.tipo !== "dia") {
      return;
    }

    setSelectedDayOriginIds((current) =>
      current.filter((originId) => sourceAssignmentsDia.some((item) => item.id === originId)),
    );
  }, [form.tipo, sourceAssignmentsDia]);

  useEffect(() => {
    if (form.tipo !== "semana") {
      return;
    }

    const referenceId = weeklyReferenceAssignment?.id ?? "";
    setForm((current) => {
      if (current.asignacion_origen_id === referenceId) {
        return current;
      }
      return {
        ...current,
        asignacion_origen_id: referenceId,
      };
    });
  }, [form.tipo, weeklyReferenceAssignment]);

  const handleDirectionChange = (direccion: DireccionCompensacion) => {
    setError("");
    setNotice("");
    setCompanionBalance(null);
    setCompanionBalanceError("");
    setCompanionAssignments([]);
    setCompanionAssignmentsError("");
    setSelectedDayOriginIds([]);
    setForm((current) => ({
      ...current,
      direccion,
      usuario_id: "",
      asignacion_origen_id: "",
    }));
  };

  const resetMovementFilters = () => {
    setMovementSearch("");
    setMovementTypeFilter("todos");
    setMovementCompanionFilter("todos");
    setMovementDateFrom("");
    setMovementDateTo("");
    setMovementOrder("desc");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedWeekId) {
      setError("Debes seleccionar una semana para compensar.");
      return;
    }

    if (companionsDisponibles.length === 0) {
      setError(
        form.direccion === "cobrar"
          ? "No hay companeros que te deban dias para cobrar ahora mismo."
          : "No tienes deuda pendiente para devolver en este momento.",
      );
      return;
    }

    if (!form.usuario_id) {
      setError("Debes seleccionar un companero para compensar la deuda.");
      return;
    }

    const selectedOriginsDia = sourceAssignmentsDia.filter((item) =>
      selectedDayOriginIds.includes(item.id),
    );
    const origenId = form.tipo === "semana" ? (weeklyReferenceAssignment?.id ?? "") : "";

    if (form.tipo === "dia" && selectedOriginsDia.length === 0) {
      setError("Selecciona al menos 1 turno para la compensacion por dia.");
      return;
    }

    if (form.tipo === "dia" && selectedOriginsDia.length !== selectedDayOriginIds.length) {
      setError("Algunos turnos seleccionados ya no estan disponibles. Recarga e intenta de nuevo.");
      return;
    }

    const diasSolicitados = form.tipo === "semana" ? diasOperacionSemana : selectedOriginsDia.length;
    if (form.tipo === "semana" && diasOperacionSemana === 0) {
      setError(
        form.direccion === "cobrar"
          ? "Para compensar semana necesitas tus turnos en la semana seleccionada."
          : "Para devolver semana necesitas turnos del acreedor en la semana seleccionada.",
      );
      return;
    }

    if (form.tipo === "semana" && !origenId) {
      setError("No se encontro una referencia valida para compensar la semana completa.");
      return;
    }

    if (deudaDisponible !== null && deudaDisponible < diasSolicitados) {
      setError(
        `No puedes compensar ${diasSolicitados} dia(s). Deuda disponible: ${deudaDisponible}.`,
      );
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const payload: {
        usuario_id: string;
        direccion: DireccionCompensacion;
        tipo: "dia" | "semana";
        asignacion_origen_id?: string;
        asignacion_origen_ids?: string[];
        motivo: string;
      } = {
        usuario_id: form.usuario_id,
        direccion: form.direccion,
        tipo: form.tipo,
        motivo: form.motivo,
      };

      if (form.tipo === "semana") {
        payload.asignacion_origen_id = origenId;
      } else if (selectedOriginsDia.length === 1) {
        payload.asignacion_origen_id = selectedOriginsDia[0].id;
      } else {
        payload.asignacion_origen_ids = selectedOriginsDia.map((assignment) => assignment.id);
      }

      await api.compensarBolsa(payload);
      setNotice(
        form.direccion === "cobrar"
          ? `Solicitud para cobrar deuda creada (${diasSolicitados} dia(s)).`
          : `Solicitud para devolver deuda creada (${diasSolicitados} dia(s)).`,
      );
      setSelectedDayOriginIds([]);
      setForm((current) => ({
        ...current,
        usuario_id: "",
        tipo: "dia",
        asignacion_origen_id: "",
        motivo: "",
      }));
      await reloadAll();
    } catch (submitError) {
      setError(asErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <article className="glass-card float-in space-y-4 p-5 md:p-6">
        <h2 className="text-2xl font-bold text-slate-900">Solicitar compensacion</h2>

        <div className={panelCardClass}>
          <WeekSelector
            weeks={weekOptionsForOperation}
            selectedWeekId={selectedWeekId}
            onChange={setSelectedWeekId}
            label={
              form.direccion === "cobrar"
                ? "Semana objetivo para cobrar (tus semanas con turnos)"
                : "Semana objetivo del acreedor seleccionado"
            }
          />
          {form.direccion === "devolver" && !form.usuario_id && (
            <p className="mt-2 text-xs text-slate-500">
              Selecciona primero un companero acreedor para cargar sus semanas.
            </p>
          )}
          {form.direccion === "devolver" && form.usuario_id && loadingCompanionWeeks && (
            <p className="mt-2 text-xs text-slate-500">Cargando semanas del acreedor...</p>
          )}
          {selectedWeek ? (
            <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              Semana activa: {formatWeek(selectedWeek)}
            </p>
          ) : (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              No hay semana activa para compensar.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Operacion</p>
          <div className="glass-segment grid grid-cols-2 gap-2 rounded-xl p-1">
            <button
              type="button"
              onClick={() => handleDirectionChange("cobrar")}
              className={`h-10 rounded-lg text-sm font-semibold transition ${
                form.direccion === "cobrar"
                  ? "glass-segment-button-active"
                  : "glass-segment-button"
              }`}
            >
              Cobrar deuda
            </button>
            <button
              type="button"
              onClick={() => handleDirectionChange("devolver")}
              disabled={!hasDevolverDebt}
              className={`h-10 rounded-lg text-sm font-semibold transition ${
                !hasDevolverDebt
                  ? "cursor-not-allowed bg-slate-100 text-slate-400"
                  : form.direccion === "devolver"
                    ? "glass-segment-button-active"
                    : "glass-segment-button"
              }`}
            >
              Devolver deuda
            </button>
          </div>
          {!hasDevolverDebt && (
            <p className="text-xs font-semibold text-slate-500">
              No debes dias ahora mismo, por eso Devolver deuda esta deshabilitado.
            </p>
          )}
          <p className="text-sm text-slate-600">
            {form.direccion === "cobrar"
              ? "El deudor cubre turnos del acreedor para reducir saldo pendiente."
              : "El deudor propone cubrir turnos del acreedor para devolver saldo pendiente."}
          </p>
        </div>

        {companionsDisponibles.length === 0 && (
          <NoticeBanner
            kind="info"
            message={
              form.direccion === "cobrar"
                ? "No hay usuarios que te deban dias ahora mismo."
                : "No tienes deuda pendiente para devolver ahora mismo."
            }
          />
        )}

        {form.direccion === "cobrar" && companionsDisponibles.length > 0 && selectedWeekId && sourceAssignmentsSemana.length === 0 && (
          <NoticeBanner
            kind="info"
            message="Te deben dias, pero en esta semana no tienes turnos para cobrar. Cambia la semana activa a una con tus turnos. No necesitas borrar ni recrear calendario."
          />
        )}

        {companionsDisponibles.length > 0 ? (
        <form className="space-y-3.5" onSubmit={handleSubmit}>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className={summaryCardClass}>
              <p className="text-xs uppercase tracking-wide text-slate-500">Tipo</p>
              <p className="text-lg font-bold text-slate-900">{form.tipo}</p>
            </div>
            <div className={summaryCardClass}>
              <p className="text-xs uppercase tracking-wide text-slate-500">Dias solicitados</p>
              <p className="text-lg font-bold text-slate-900">
                {form.tipo === "semana" ? diasOperacionSemana : selectedDayOriginIds.length}
              </p>
            </div>
            <div className={summaryCardClass}>
              <p className="text-xs uppercase tracking-wide text-slate-500">Deuda disponible</p>
              <p className="text-lg font-bold text-slate-900">{deudaDisponible ?? 0}</p>
            </div>
          </div>

          <label className="block text-sm text-slate-700">
            {form.direccion === "cobrar" ? "Companero deudor" : "Companero acreedor"}
            <select
              value={form.usuario_id}
              onChange={(event) => {
                setSelectedDayOriginIds([]);
                setForm((current) => ({
                  ...current,
                  usuario_id: event.target.value,
                  asignacion_origen_id: "",
                }));
              }}
              disabled={companionsDisponibles.length === 0}
              className={formControlClass}
              required
            >
              <option value="">
                {companionsDisponibles.length === 0 ? "Sin usuarios disponibles" : "Selecciona usuario"}
              </option>
              {companionsDisponibles.map((item) => (
                <option key={item.usuario.id} value={item.usuario.id}>
                  {item.usuario.nombre} (
                  {form.direccion === "cobrar" ? `te debe ${item.me_deben}` : `le debes ${item.debo}`})
                </option>
              ))}
            </select>
          </label>

          <div className="glass-soft px-3 py-2 text-sm text-slate-700">
            {!form.usuario_id && <p>Selecciona un companero para ver el saldo individual.</p>}
            {form.usuario_id && loadingCompanionBalance && <p>Cargando saldo con companero...</p>}
            {form.usuario_id && !loadingCompanionBalance && companionBalance && (
              <div className="space-y-1">
                <p className="font-semibold text-slate-900">
                  Saldo con {companionBalance.usuario?.nombre ?? "companero"}
                </p>
                <p>
                  Te debe: <span className="font-semibold text-emerald-700 dark:text-emerald-200">{companionBalance.me_deben}</span>
                </p>
                <p>
                  Le debes: <span className="font-semibold text-rose-700 dark:text-rose-200">{companionBalance.debo}</span>
                </p>
              </div>
            )}
            {companionBalanceError && (
              <p className="font-semibold text-rose-700">
                No se pudo cargar el saldo individual: {companionBalanceError}
              </p>
            )}
          </div>

          <label className="block text-sm text-slate-700">
            Tipo
            <select
              value={form.tipo}
              onChange={(event) => {
                setSelectedDayOriginIds([]);
                setForm((current) => ({
                  ...current,
                  tipo: event.target.value as "dia" | "semana",
                  asignacion_origen_id: "",
                }));
              }}
              className={formControlClass}
            >
              <option value="dia">Dia</option>
              <option value="semana">Semana</option>
            </select>
          </label>

          {form.tipo === "dia" ? (
            <div className={panelCardClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                {form.direccion === "cobrar"
                  ? "Tus turnos (elige los turnos a cobrar)"
                  : "Turnos del acreedor (elige los turnos a devolver)"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                La compensacion por dia permite seleccionar 1..N turnos en una sola solicitud.
              </p>

              <div className="mt-2 space-y-2">
                {form.direccion === "devolver" && form.usuario_id && loadingCompanionAssignments && (
                  <p className="text-xs text-slate-500">Cargando turnos del acreedor...</p>
                )}
                {form.direccion === "devolver" && companionAssignmentsError && (
                  <p className="text-xs font-semibold text-rose-700">
                    No se pudieron cargar los turnos del acreedor: {companionAssignmentsError}
                  </p>
                )}
                {sourceAssignmentsDia.length === 0 && (
                  <p className="text-xs text-slate-500">
                    {form.direccion === "cobrar"
                      ? "No tienes turnos en la semana activa para cobrar deuda."
                      : "El acreedor no tiene turnos en la semana activa."}
                  </p>
                )}

                {sourceAssignmentsDia.map((assignment) => {
                  const isSelected = selectedDayOriginIds.includes(assignment.id);

                  return (
                    <button
                      key={assignment.id}
                      type="button"
                      onClick={() => {
                        setSelectedDayOriginIds((current) => {
                          if (current.includes(assignment.id)) {
                            return current.filter((id) => id !== assignment.id);
                          }
                          return [...current, assignment.id];
                        });
                      }}
                      className={`${selectChipClass} ${isSelected ? "glass-chip-active" : ""}`}
                    >
                      {formatAssignment(assignment)}
                    </button>
                  );
                })}
              </div>

              {selectedDayAssignments.length > 0 && (
                <p className="mt-2 text-xs text-slate-600">
                  Seleccionados ({selectedDayAssignments.length}): {selectedDayAssignments.map((assignment) => assignment.dia).join(", ")}
                </p>
              )}
            </div>
          ) : (
            <div className={panelCardClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                Resumen semanal
              </p>
              <p className="mt-1 text-xs text-slate-500">
                En modo semana no eliges un dia manualmente. Se usa una referencia automatica valida.
              </p>

              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div className="glass-soft px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Turnos en semana</p>
                  <p className="text-base font-bold text-slate-900">{diasOperacionSemana}</p>
                </div>
                <div className="glass-soft px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Deuda requerida</p>
                  <p className="text-base font-bold text-slate-900">{diasOperacionSemana}</p>
                </div>
                <div className="glass-soft px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Deuda disponible</p>
                  <p className="text-base font-bold text-slate-900">{deudaDisponible ?? 0}</p>
                </div>
              </div>

              {form.direccion === "devolver" && form.usuario_id && loadingCompanionAssignments && (
                <p className="mt-2 text-xs text-slate-500">Cargando turnos del acreedor...</p>
              )}
              {form.direccion === "devolver" && companionAssignmentsError && (
                <p className="mt-2 text-xs font-semibold text-rose-700">
                  No se pudieron cargar los turnos del acreedor: {companionAssignmentsError}
                </p>
              )}

              {weeklyReferenceAssignment ? (
                <p className="mt-2 text-xs text-slate-600">
                  Referencia automatica: {formatAssignment(weeklyReferenceAssignment)}
                </p>
              ) : (
                <p className="mt-2 text-xs font-semibold text-rose-700">
                  No hay turnos disponibles para compensar la semana completa.
                </p>
              )}

              <p className="mt-2 text-xs text-slate-600">
                {form.direccion === "cobrar"
                  ? "Al aceptar, el deudor cubrira todos tus turnos de la semana activa."
                  : "Al aceptar, cubriras todos los turnos del acreedor en la semana activa."}
              </p>
            </div>
          )}

          <label className="block text-sm text-slate-700">
            Motivo
            <textarea
              value={form.motivo}
              onChange={(event) => setForm((current) => ({ ...current, motivo: event.target.value }))}
              className={textAreaControlClass}
            />
          </label>

          <NoticeBanner
            kind="info"
            message={
              form.tipo === "semana"
                ? "Semana: se calcula automaticamente la referencia y los dias a compensar."
                : "Dia: selecciona 1..N turnos y se enviara una unica solicitud agrupada."
            }
          />

          <button
            type="submit"
            disabled={busy || (form.direccion === "devolver" && loadingCompanionAssignments)}
            className={`glass-button h-11 rounded-lg px-6 text-base font-semibold disabled:opacity-50 ${
              form.direccion === "cobrar" ? "glass-button-primary" : "glass-button-warn"
            }`}
          >
            {form.direccion === "cobrar"
              ? "Crear solicitud para cobrar"
              : "Crear solicitud para devolver"}
          </button>
        </form>
        ) : (
          <div className={panelCardClass}>
            <p className="text-sm font-semibold text-slate-800">
              {form.direccion === "cobrar"
                ? "No hay operaciones de cobro disponibles ahora mismo."
                : "No hay operaciones de devolucion disponibles ahora mismo."}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {form.direccion === "cobrar"
                ? "Cuando un companero te deba dias, podras crear solicitudes de cobro desde aqui."
                : "Cuando tengas deuda pendiente, podras activar Devolver deuda y crear solicitudes desde esta misma pantalla."}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <NoticeBanner message={error} kind="error" />
          <NoticeBanner message={notice} kind="success" />
        </div>
      </article>

      <article className="glass-card float-in space-y-4 p-5 md:p-6">
        <h2 className="text-2xl font-bold text-slate-900">Saldos y movimientos</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="glass-soft border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/60 dark:bg-emerald-900/35">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">Me deben</p>
            <p className="mt-1 text-3xl font-bold text-emerald-900 dark:text-emerald-100">{totalMeDeben}</p>
          </div>
          <div className="glass-soft border-rose-200 bg-rose-50 p-4 dark:border-rose-500/60 dark:bg-rose-900/35">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-200">Debo</p>
            <p className="mt-1 text-3xl font-bold text-rose-900 dark:text-rose-100">{totalDebo}</p>
          </div>
        </div>

        <div className={panelCardClass}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Detalle por companero</p>
          <div className="mt-2 space-y-2">
            {bolsaSaldos.detalles.length === 0 && (
              <p className="text-sm text-slate-500">No hay saldos pendientes con companeros.</p>
            )}

            {bolsaSaldos.detalles.map((item) => (
              <div key={item.usuario.id} className="glass-soft px-3 py-3">
                <p className="font-semibold text-slate-900">{item.usuario.nombre}</p>
                <p className="text-sm text-slate-600">
                  Me deben: <span className="font-semibold text-emerald-700 dark:text-emerald-200">{item.me_deben}</span> | Debo:
                  <span className="font-semibold text-rose-700 dark:text-rose-200"> {item.debo}</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className={panelCardClass}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Movimientos historicos</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Buscar
              <input
                type="search"
                value={movementSearch}
                onChange={(event) => setMovementSearch(event.target.value)}
                placeholder="Nombre, tipo o fecha"
                className={movementControlClass}
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Tipo
              <select
                value={movementTypeFilter}
                onChange={(event) => setMovementTypeFilter(event.target.value as MovementTypeFilter)}
                className={movementControlClass}
              >
                <option value="todos">Todos</option>
                <option value="genera_deuda">Genera deuda</option>
                <option value="compensa_deuda">Compensa deuda</option>
              </select>
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Companero
              <select
                value={movementCompanionFilter}
                onChange={(event) => setMovementCompanionFilter(event.target.value)}
                className={movementControlClass}
              >
                <option value="todos">Todos</option>
                {movementCompanionOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Orden
              <select
                value={movementOrder}
                onChange={(event) => setMovementOrder(event.target.value as MovementOrder)}
                className={movementControlClass}
              >
                <option value="desc">Mas recientes primero</option>
                <option value="asc">Mas antiguos primero</option>
              </select>
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Desde
              <input
                type="date"
                value={movementDateFrom}
                onChange={(event) => setMovementDateFrom(event.target.value)}
                className={movementControlClass}
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Hasta
              <input
                type="date"
                value={movementDateTo}
                onChange={(event) => setMovementDateTo(event.target.value)}
                className={movementControlClass}
              />
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Mostrando {filteredMovements.length} de {movements.length} movimiento(s).
            </p>
            {hasActiveMovementFilters && (
              <button
                type="button"
                onClick={resetMovementFilters}
                className="glass-button rounded-lg px-3 py-1.5 text-xs font-semibold"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          <div className="mt-2 max-h-80 space-y-2 overflow-auto pr-1">
            {filteredMovements.length === 0 && (
              <p className="text-sm text-slate-500">
                {movements.length === 0
                  ? "Sin movimientos registrados."
                  : "No hay movimientos para los filtros actuales. Ajusta filtros o usa Limpiar filtros."}
              </p>
            )}
            {filteredMovements.map((item) => (
              <div key={item.id} className="glass-soft p-3">
                <p className="text-sm font-semibold text-slate-900">
                  {item.origen_usuario.nombre} {"->"} {item.destino_usuario.nombre}
                </p>
                <p className="text-xs text-slate-500">
                  {item.tipo} · {item.dias} dia(s) · {item.fecha.slice(0, 10)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </article>
    </section>
  );
};
