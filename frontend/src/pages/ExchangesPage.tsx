import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { api } from "../api";
import { NoticeBanner } from "../components/common/NoticeBanner";
import { WeekSelector } from "../components/common/WeekSelector";
import CustomSelect from "../components/common/CustomSelect";
import CustomDatePicker from "../components/common/CustomDatePicker";
import { useAppData } from "../context/AppDataContext";
import type { Asignacion, EstadoSolicitud, Semana, SolicitudIntercambio } from "../types";
import { asErrorMessage, dayOrder, formatAssignment, formatWeek } from "../utils/formatters";

const GROUP_TOKEN_REGEX = /^\[#GRUPO:([^\]]+)\]\s*/;

type ExchangeSection = "recibidas" | "enviadas";
type RequestGroup = {
  groupId: string;
  items: SolicitudIntercambio[];
};

type RequestDaySummary = {
  origenLabel: string;
  destinoLabel: string;
};

const statusClass: Record<EstadoSolicitud, string> = {
  pendiente: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/35 dark:text-amber-100 dark:border-amber-500/60",
  aceptada: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/35 dark:text-emerald-100 dark:border-emerald-500/60",
  rechazada: "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/35 dark:text-red-100 dark:border-red-500/60",
  cancelada: "bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800/75 dark:text-slate-100 dark:border-slate-500/60",
};

const statusLabel: Record<EstadoSolicitud, string> = {
  pendiente: "Pendiente",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

const requestPriority: Record<EstadoSolicitud, number> = {
  pendiente: 0,
  aceptada: 1,
  rechazada: 2,
  cancelada: 3,
};

const requestCardClass: Record<EstadoSolicitud, string> = {
  pendiente:
    "border-amber-300 bg-[color:var(--glass-surface-2)] hover:border-amber-400 dark:border-amber-500/55 dark:hover:border-amber-400",
  aceptada:
    "border-emerald-200 bg-[color:var(--glass-surface-2)] hover:border-emerald-300 dark:border-emerald-500/45 dark:hover:border-emerald-400",
  rechazada:
    "border-red-200 bg-[color:var(--glass-surface-2)] hover:border-red-300 dark:border-red-500/45 dark:hover:border-red-400",
  cancelada:
    "border-slate-200 bg-[color:var(--glass-surface-2)] hover:border-slate-300 dark:border-slate-500/50 dark:hover:border-slate-400",
};

const extractGroupId = (motivo: string): string | null => {
  const match = motivo.match(GROUP_TOKEN_REGEX);
  return match?.[1] ?? null;
};

const stripGroupToken = (motivo: string): string => motivo.replace(GROUP_TOKEN_REGEX, "").trim();

const groupRequests = (
  requests: SolicitudIntercambio[],
): { groups: RequestGroup[]; singles: SolicitudIntercambio[] } => {
  const groupedMap = new Map<string, SolicitudIntercambio[]>();
  const singles: SolicitudIntercambio[] = [];

  for (const request of requests) {
    const groupId = extractGroupId(request.motivo);
    if (!groupId) {
      singles.push(request);
      continue;
    }

    const current = groupedMap.get(groupId) ?? [];
    current.push(request);
    groupedMap.set(groupId, current);
  }

  const groups = Array.from(groupedMap.entries()).map(([groupId, items]) => ({
    groupId,
    items,
  }));

  return { groups, singles };
};

const sortByDay = (assignments: Asignacion[]): Asignacion[] => {
  return [...assignments].sort((a, b) => dayOrder.indexOf(a.dia) - dayOrder.indexOf(b.dia));
};

const sortAndFormatDays = (days: string[]): string => {
  const uniqueDays = Array.from(new Set(days));
  const orderedDays = uniqueDays.sort((left, right) => {
    const leftIndex = dayOrder.indexOf(left as (typeof dayOrder)[number]);
    const rightIndex = dayOrder.indexOf(right as (typeof dayOrder)[number]);
    if (leftIndex === -1 || rightIndex === -1) {
      return left.localeCompare(right);
    }
    return leftIndex - rightIndex;
  });

  return orderedDays.join(", ");
};

const buildRequestDaySummary = (
  item: SolicitudIntercambio,
  items: SolicitudIntercambio[] = [item],
): RequestDaySummary => {
  if (item.tipo === "semana") {
    return {
      origenLabel: "Semana completa",
      destinoLabel: item.modo_compensacion === "inmediata" ? "Semana completa" : "No aplica (bolsa)",
    };
  }

  const originDays = items
    .map((request) => String(request.asignacion_origen.dia))
    .filter((day) => day.length > 0);
  const destinationDays = items
    .map((request) => String(request.asignacion_destino?.dia ?? ""))
    .filter((day) => day.length > 0);

  return {
    origenLabel: sortAndFormatDays(originDays) || "Sin dias",
    destinoLabel:
      item.modo_compensacion === "inmediata"
        ? sortAndFormatDays(destinationDays) || "Sin dias"
        : "No aplica (bolsa)",
  };
};

const buildRequestMessage = (
  item: SolicitudIntercambio,
  section: ExchangeSection,
  groupedItems: number,
): string => {
  const scope = item.tipo === "semana"
    ? "una semana completa"
    : `${groupedItems} dia(s)`;
  const mode = item.modo_compensacion === "inmediata" ? "intercambio inmediato" : "compensacion en bolsa";

  if (section === "recibidas") {
    return `${item.solicitante.nombre} te solicita ${scope} (${mode}).`;
  }

  return `Solicitud para ${item.receptor.nombre}: ${scope} (${mode}).`;
};

const sortRequestsForScan = (requests: SolicitudIntercambio[]): SolicitudIntercambio[] => {
  return [...requests].sort((left, right) => {
    const priorityDiff = requestPriority[left.estado] - requestPriority[right.estado];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return right.fecha_creacion.localeCompare(left.fecha_creacion);
  });
};

const panelCardClass = "glass-panel p-4";
const selectChipClass = "glass-chip w-full rounded-lg px-3 py-2 text-left text-sm font-medium";
const formControlClass = "glass-input mt-2 h-11 w-full rounded-xl px-4 text-base font-medium";
const textAreaControlClass = "glass-input mt-2 min-h-24 w-full rounded-xl px-4 py-3 text-base";
const summaryCardClass = "glass-soft rounded-xl px-3 py-2";

export const ExchangesPage = () => {
  const {
    weeks,
    users,
    myAssignments,
    intercambios,
    selectedWeekId,
    setSelectedWeekId,
    reloadIntercambios,
    reloadWeekDetail,
  } = useAppData();

  const [submitBusy, setSubmitBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedOriginIds, setSelectedOriginIds] = useState<string[]>([]);
  const [selectedDestinationIds, setSelectedDestinationIds] = useState<string[]>([]);
  const [companionWeekId, setCompanionWeekId] = useState("");
  const [companionWeekOptions, setCompanionWeekOptions] = useState<Semana[]>([]);
  const [loadingCompanionWeeks, setLoadingCompanionWeeks] = useState(false);
  const [companionAssignments, setCompanionAssignments] = useState<Asignacion[]>([]);
  const [loadingCompanionAssignments, setLoadingCompanionAssignments] = useState(false);
  const [requestActionLoading, setRequestActionLoading] = useState<Record<string, "accept" | "reject">>({});
  const [optimisticStatusById, setOptimisticStatusById] = useState<Record<string, EstadoSolicitud>>({});
  const [form, setForm] = useState({
    receptor_id: "",
    tipo: "dia",
    asignacion_origen_id: "",
    asignacion_destino_id: "",
    modo_compensacion: "bolsa",
    motivo: "",
  });

  const selectedWeek = useMemo(
    () => weeks.find((week) => week.id === selectedWeekId) ?? null,
    [weeks, selectedWeekId],
  );

  const selectedCompanionWeek = useMemo(
    () => weeks.find((week) => week.id === companionWeekId) ?? null,
    [weeks, companionWeekId],
  );

  const selectedCompanion = useMemo(
    () => users.find((user) => user.id === form.receptor_id) ?? null,
    [form.receptor_id, users],
  );

  const myWeekOptions = useMemo(() => {
    const myWeekIds = new Set(myAssignments.map((assignment) => assignment.semana));
    return weeks.filter((week) => myWeekIds.has(week.id));
  }, [myAssignments, weeks]);

  const filteredMyAssignments = useMemo(() => {
    const mine = selectedWeekId
      ? myAssignments.filter((item) => item.semana === selectedWeekId)
      : myAssignments;
    return sortByDay(mine);
  }, [myAssignments, selectedWeekId]);

  useEffect(() => {
    if (selectedWeekId && myWeekOptions.some((week) => week.id === selectedWeekId)) {
      return;
    }

    setSelectedWeekId(myWeekOptions[0]?.id ?? "");
  }, [myWeekOptions, selectedWeekId, setSelectedWeekId]);

  const destinationOptions = useMemo(() => sortByDay(companionAssignments), [companionAssignments]);

  const selectedOriginAssignments = useMemo(() => {
    const selected = new Set(selectedOriginIds);
    return filteredMyAssignments.filter((assignment) => selected.has(assignment.id));
  }, [filteredMyAssignments, selectedOriginIds]);

  const selectedDestinationAssignments = useMemo(() => {
    const selected = new Set(selectedDestinationIds);
    return destinationOptions.filter((assignment) => selected.has(assignment.id));
  }, [destinationOptions, selectedDestinationIds]);

  const weekOriginAssignments = useMemo(
    () => (form.tipo === "semana" ? sortByDay(filteredMyAssignments) : []),
    [filteredMyAssignments, form.tipo],
  );

  const weekDestinationAssignments = useMemo(
    () =>
      form.tipo === "semana" && form.modo_compensacion !== "bolsa"
        ? sortByDay(destinationOptions)
        : [],
    [destinationOptions, form.modo_compensacion, form.tipo],
  );

  const receivedRequests = useMemo(
    () =>
      sortRequestsForScan(
        intercambios.recibidas.map((item) => {
          const optimisticStatus = optimisticStatusById[item.id];
          if (!optimisticStatus) {
            return item;
          }
          return {
            ...item,
            estado: optimisticStatus,
          };
        }),
      ),
    [intercambios.recibidas, optimisticStatusById],
  );

  const sentRequests = useMemo(
    () =>
      sortRequestsForScan(
        intercambios.enviadas.map((item) => {
          const optimisticStatus = optimisticStatusById[item.id];
          if (!optimisticStatus) {
            return item;
          }
          return {
            ...item,
            estado: optimisticStatus,
          };
        }),
      ),
    [intercambios.enviadas, optimisticStatusById],
  );

  const groupedReceived = useMemo(() => groupRequests(receivedRequests), [receivedRequests]);
  const groupedSent = useMemo(() => groupRequests(sentRequests), [sentRequests]);
  const receivedCount = receivedRequests.length;
  const sentCount = sentRequests.length;
  const pendingReceivedCount = receivedRequests.filter((item) => item.estado === "pendiente").length;
  const pendingSentCount = sentRequests.filter((item) => item.estado === "pendiente").length;
  const isBolsaMode = form.modo_compensacion === "bolsa";
  const selectedOriginCount =
    form.tipo === "semana" ? weekOriginAssignments.length : selectedOriginIds.length;
  const selectedDestinationCount =
    isBolsaMode
      ? 0
      : form.tipo === "semana"
        ? weekDestinationAssignments.length
        : selectedDestinationIds.length;

  useEffect(() => {
    let active = true;

    const loadCompanionWeeks = async () => {
      if (!form.receptor_id) {
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
              weekSummary.empleados.some((employeeSummary) => employeeSummary.usuario_id === form.receptor_id),
            )
            .map((weekSummary) => weekSummary.semana_id),
        );

        const filteredWeeks = weeks.filter((week) => weekIds.has(week.id));
        setCompanionWeekOptions(filteredWeeks);
      } catch (loadError) {
        if (!active) {
          return;
        }
        setCompanionWeekOptions([]);
        setError(`No se pudieron cargar las semanas del companero. ${asErrorMessage(loadError)}`);
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
  }, [form.receptor_id, weeks]);

  useEffect(() => {
    setCompanionWeekId((current) => {
      if (current && companionWeekOptions.some((week) => week.id === current)) {
        return current;
      }
      if (selectedWeekId && companionWeekOptions.some((week) => week.id === selectedWeekId)) {
        return selectedWeekId;
      }
      return companionWeekOptions[0]?.id ?? "";
    });
  }, [companionWeekOptions, selectedWeekId]);

  const loadCompanionAssignments = useCallback(async () => {
    if (!form.receptor_id || !companionWeekId) {
      setCompanionAssignments([]);
      setLoadingCompanionAssignments(false);
      return;
    }

    setLoadingCompanionAssignments(true);
    try {
      const detail = await api.semanaDetalle(companionWeekId);
      const companionWeekAssignments = detail.asignaciones.filter(
        (assignment) => assignment.usuario === form.receptor_id,
      );
      setCompanionAssignments(sortByDay(companionWeekAssignments));
    } catch (loadError) {
      setCompanionAssignments([]);
      setError(`No se pudieron cargar los turnos del companero. ${asErrorMessage(loadError)}`);
    } finally {
      setLoadingCompanionAssignments(false);
    }
  }, [companionWeekId, form.receptor_id]);

  useEffect(() => {
    void loadCompanionAssignments();
  }, [loadCompanionAssignments]);

  useEffect(() => {
    if (form.tipo === "semana") {
      setSelectedOriginIds([]);
      setSelectedDestinationIds([]);
    }
  }, [form.tipo]);

  useEffect(() => {
    if (form.tipo !== "semana") {
      return;
    }

    const originReferenceId = weekOriginAssignments[0]?.id ?? "";
    const destinationReferenceId =
      form.modo_compensacion === "inmediata" ? weekDestinationAssignments[0]?.id ?? "" : "";

    setForm((current) => {
      if (
        current.asignacion_origen_id === originReferenceId
        && current.asignacion_destino_id === destinationReferenceId
      ) {
        return current;
      }

      return {
        ...current,
        asignacion_origen_id: originReferenceId,
        asignacion_destino_id: destinationReferenceId,
      };
    });
  }, [form.modo_compensacion, form.tipo, weekDestinationAssignments, weekOriginAssignments]);

  useEffect(() => {
    if (form.modo_compensacion !== "bolsa") {
      return;
    }

    setSelectedDestinationIds([]);
    setForm((current) => {
      if (!current.asignacion_destino_id) {
        return current;
      }

      return {
        ...current,
        asignacion_destino_id: "",
      };
    });
  }, [form.modo_compensacion]);

  useEffect(() => {
    setSelectedOriginIds((current) =>
      current.filter((originId) => filteredMyAssignments.some((assignment) => assignment.id === originId)),
    );

    setForm((current) => {
      if (
        current.asignacion_origen_id &&
        !filteredMyAssignments.some((assignment) => assignment.id === current.asignacion_origen_id)
      ) {
        return {
          ...current,
          asignacion_origen_id: "",
        };
      }
      return current;
    });
  }, [filteredMyAssignments]);

  useEffect(() => {
    setSelectedDestinationIds((current) =>
      current.filter((destinationId) => destinationOptions.some((assignment) => assignment.id === destinationId)),
    );

    setForm((current) => {
      if (
        current.asignacion_destino_id &&
        !destinationOptions.some((assignment) => assignment.id === current.asignacion_destino_id)
      ) {
        return {
          ...current,
          asignacion_destino_id: "",
        };
      }
      return current;
    });
  }, [destinationOptions]);

  const toggleOriginSelection = (assignment: Asignacion) => {
    if (form.tipo === "semana") {
      setForm((current) => ({
        ...current,
        asignacion_origen_id: assignment.id,
      }));
      return;
    }

    setSelectedOriginIds((current) => {
      const exists = current.includes(assignment.id);
      if (exists) {
        const next = current.filter((id) => id !== assignment.id);
        setForm((formCurrent) => ({
          ...formCurrent,
          asignacion_origen_id: next[0] ?? "",
        }));
        return next;
      }

      const next = [...current, assignment.id];
      setForm((formCurrent) => ({
        ...formCurrent,
        asignacion_origen_id: next[0],
      }));
      return next;
    });
  };

  const toggleDestinationSelection = (assignment: Asignacion) => {
    if (form.modo_compensacion === "bolsa") {
      return;
    }

    if (form.tipo === "semana") {
      setForm((current) => ({
        ...current,
        asignacion_destino_id: assignment.id,
      }));
      return;
    }

    setSelectedDestinationIds((current) => {
      const exists = current.includes(assignment.id);
      if (exists) {
        return current.filter((id) => id !== assignment.id);
      }
      return [...current, assignment.id];
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!selectedWeekId) {
      setError("Debes seleccionar una semana activa para crear el intercambio.");
      return;
    }

    if (!form.receptor_id) {
      setError("Debes seleccionar un companero receptor.");
      return;
    }

    setSubmitBusy(true);

    try {
      if (form.tipo === "semana") {
        if (weekOriginAssignments.length === 0) {
          setError("No tienes turnos en la semana activa para intercambio semanal.");
          return;
        }

        const originReferenceId = weekOriginAssignments[0].id;

        let destinationReferenceId: string | undefined;

        if (form.modo_compensacion === "inmediata") {
          if (!companionWeekId) {
            setError("Selecciona una semana del companero para intercambio semanal inmediato.");
            return;
          }

          if (weekDestinationAssignments.length === 0) {
            setError("El companero no tiene turnos en su semana seleccionada para intercambio semanal inmediato.");
            return;
          }

          destinationReferenceId = weekDestinationAssignments[0].id;
        }

        await api.crearIntercambio({
          receptor_id: form.receptor_id,
          tipo: "semana",
          asignacion_origen_id: originReferenceId,
          ...(destinationReferenceId ? { asignacion_destino_id: destinationReferenceId } : {}),
          modo_compensacion: form.modo_compensacion as "inmediata" | "bolsa",
          motivo: form.motivo,
        });

        setNotice(
          `Solicitud semanal enviada correctamente (${weekOriginAssignments.length} dia(s)).`,
        );
      } else {
        const originIds =
          selectedOriginIds.length > 0
            ? selectedOriginIds
            : form.asignacion_origen_id
              ? [form.asignacion_origen_id]
              : [];

        if (originIds.length === 0) {
          setError("Selecciona al menos 1 dia propio para solicitar intercambio.");
          return;
        }

        const selectedOrigins = filteredMyAssignments.filter((assignment) =>
          originIds.includes(assignment.id),
        );

        if (selectedOrigins.length !== originIds.length) {
          setError("Algunos dias seleccionados ya no estan disponibles. Recarga la vista e intenta de nuevo.");
          return;
        }

        const destinationIds = selectedDestinationIds;
        const selectedDestinations = destinationOptions.filter((assignment) =>
          destinationIds.includes(assignment.id),
        );

        if (selectedDestinations.length !== destinationIds.length) {
          setError(
            "Algunos turnos del companero ya no estan disponibles. Recarga la vista e intenta de nuevo.",
          );
          return;
        }

        if (form.modo_compensacion === "inmediata") {
          if (selectedDestinations.length === 0) {
            setError("Para compensacion inmediata de dia debes seleccionar turnos destino del companero.");
            return;
          }

          if (selectedOrigins.length !== selectedDestinations.length) {
            setError(
              "En compensacion inmediata debes seleccionar la misma cantidad de turnos tuyos y del companero.",
            );
            return;
          }
        }

        if (form.modo_compensacion === "bolsa" && selectedDestinations.length > 0) {
          setError("En modo bolsa no se pueden seleccionar turnos destino.");
          return;
        }

        const orderedOrigins = sortByDay(selectedOrigins);
        const orderedDestinations = sortByDay(selectedDestinations);

        const payload: {
          receptor_id: string;
          tipo: "dia";
          asignacion_origen_id?: string;
          asignacion_origen_ids?: string[];
          asignacion_destino_id?: string;
          asignacion_destino_ids?: string[];
          modo_compensacion: "inmediata" | "bolsa";
          motivo: string;
        } = {
          receptor_id: form.receptor_id,
          tipo: "dia",
          modo_compensacion: form.modo_compensacion as "inmediata" | "bolsa",
          motivo: form.motivo,
        };

        if (orderedOrigins.length === 1) {
          payload.asignacion_origen_id = orderedOrigins[0].id;
        } else {
          payload.asignacion_origen_ids = orderedOrigins.map((assignment) => assignment.id);
        }

        if (form.modo_compensacion === "inmediata") {
          if (orderedDestinations.length === 1) {
            payload.asignacion_destino_id = orderedDestinations[0].id;
          } else {
            payload.asignacion_destino_ids = orderedDestinations.map((assignment) => assignment.id);
          }
        }

        await api.crearIntercambio(payload);

        setNotice(
          `Solicitud enviada correctamente para ${orderedOrigins.length} dia(s) en una sola peticion.`,
        );
      }

      setSelectedOriginIds([]);
      setSelectedDestinationIds([]);
      setForm((current) => ({
        ...current,
        tipo: "dia",
        asignacion_origen_id: "",
        asignacion_destino_id: "",
        motivo: "",
      }));

      await Promise.all([
        reloadIntercambios(),
        reloadWeekDetail(selectedWeekId),
        loadCompanionAssignments(),
      ]);
    } catch (submitError) {
      setError(`No se pudo enviar la solicitud. ${asErrorMessage(submitError)}`);
    } finally {
      setSubmitBusy(false);
    }
  };

  const handleRequestAction = async (
    requestId: string,
    action: "accept" | "reject",
  ) => {
    setRequestActionLoading((current) => ({
      ...current,
      [requestId]: action,
    }));
    setOptimisticStatusById((current) => ({
      ...current,
      [requestId]: action === "accept" ? "aceptada" : "rechazada",
    }));
    setError("");
    setNotice("");

    try {
      if (action === "accept") {
        const response = await api.aceptarIntercambio(requestId);
        setNotice(response.detail);
      }
      if (action === "reject") {
        const response = await api.rechazarIntercambio(requestId);
        setNotice(response.detail);
      }

      try {
        await Promise.all([
          reloadIntercambios(),
          reloadWeekDetail(selectedWeekId),
          loadCompanionAssignments(),
        ]);

        setOptimisticStatusById((current) => {
          const next = { ...current };
          delete next[requestId];
          return next;
        });
      } catch (refreshError) {
        setError(
          `Accion aplicada, pero no se pudo sincronizar la vista. Pulsa Recargar datos. ${asErrorMessage(refreshError)}`,
        );
      }
    } catch (actionError) {
      setOptimisticStatusById((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
      setError(`No se pudo completar la accion. ${asErrorMessage(actionError)}`);
    } finally {
      setRequestActionLoading((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
    }
  };

  const renderRequestItem = (
    item: SolicitudIntercambio,
    section: ExchangeSection,
    groupedItems = 1,
    keyOverride?: string,
    daySummary?: RequestDaySummary,
  ) => {
    const cleanMotivo = stripGroupToken(item.motivo);
    const message = buildRequestMessage(item, section, groupedItems);
    const detailDays = daySummary ?? buildRequestDaySummary(item);
    const isAccepting = requestActionLoading[item.id] === "accept";
    const isRejecting = requestActionLoading[item.id] === "reject";
    const isTransitioning = isAccepting || isRejecting;
    const pillLabel = isAccepting
      ? "Aceptando"
      : isRejecting
        ? "Rechazando"
        : statusLabel[item.estado];
    const statusPillClass = isTransitioning
      ? "bg-amber-100 text-amber-900 border-amber-300 animate-pulse dark:bg-amber-900/35 dark:text-amber-100 dark:border-amber-500/60"
      : statusClass[item.estado];
    const cardClass = isTransitioning
      ? "border-amber-300 bg-[color:var(--glass-surface-2)] dark:border-amber-500/55"
      : requestCardClass[item.estado];
    const counterpartLabel = section === "recibidas" ? "De" : "Para";
    const counterpartName = section === "recibidas" ? item.solicitante.nombre : item.receptor.nombre;
    const scopeLabel = item.tipo === "semana" ? "Semana completa" : `${groupedItems} dia(s)`;
    const compensationLabel = item.modo_compensacion === "inmediata" ? "Inmediata" : "Bolsa";
    const createdLabel = item.fecha_creacion.slice(0, 10);

    return (
      <div
        key={keyOverride ?? item.id}
        className={`rounded-xl border p-3 shadow-sm transition hover:shadow-md ${cardClass}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--primary-400)]">
              {counterpartLabel}: {counterpartName}
            </p>
            <p className="text-sm font-semibold text-[color:var(--ink)]">{message}</p>
          </div>
          <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusPillClass}`}>
            {pillLabel}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
          <span className="glass-badge rounded-full px-2 py-1">Tipo: {scopeLabel}</span>
          <span className="glass-badge rounded-full px-2 py-1">Compensacion: {compensationLabel}</span>
          <span className="glass-badge rounded-full px-2 py-1">Creada: {createdLabel}</span>
        </div>

        <div className="mt-2 space-y-1 text-xs text-[color:var(--ink-soft)]">
          <p>
            <span className="font-semibold">Dias que entrega:</span> {detailDays.origenLabel}
          </p>
          <p>
            <span className="font-semibold">Dias a cambio:</span> {detailDays.destinoLabel}
          </p>
        </div>

        {cleanMotivo && <p className="mt-2 text-xs text-[color:var(--ink-soft)]">Motivo: {cleanMotivo}</p>}

        {item.estado === "pendiente" && section === "recibidas" && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void handleRequestAction(item.id, "accept")}
              disabled={isTransitioning || submitBusy}
              className="glass-button glass-button-success inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAccepting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {isAccepting ? "Aceptando..." : "Aceptar"}
            </button>
            <button
              type="button"
              onClick={() => void handleRequestAction(item.id, "reject")}
              disabled={isTransitioning || submitBusy}
              className="glass-button glass-button-danger inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRejecting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-300 border-t-red-700" />}
              {isRejecting ? "Rechazando..." : "Rechazar"}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderGroup = (group: RequestGroup, section: ExchangeSection) => {
    const representative = group.items[0];
    if (!representative) {
      return null;
    }

    const daySummary = buildRequestDaySummary(representative, group.items);

    return (
      <div
        key={group.groupId}
        className={`rounded-xl border p-3 ${
          section === "recibidas"
            ? "border-cyan-200 bg-[color:var(--glass-surface-3)] dark:border-cyan-500/45"
            : "border-indigo-200 bg-[color:var(--glass-surface-3)] dark:border-indigo-500/45"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-soft)]">
          Solicitud agrupada · {group.items.length} dia(s)
        </p>
        <div className="mt-2">
          {renderRequestItem(
            representative,
            section,
            group.items.length,
            `group-${group.groupId}`,
            daySummary,
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <article className="glass-card float-in p-5 md:p-6">
        <h2 className="text-2xl font-bold">Nueva solicitud</h2>

        <div className={`mt-4 ${panelCardClass}`}>
          <WeekSelector
            weeks={myWeekOptions}
            selectedWeekId={selectedWeekId}
            onChange={setSelectedWeekId}
            label="Semana activa para intercambio (mis semanas)"
          />
          {selectedWeek ? (
            <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-500/60 dark:bg-slate-900/45 dark:text-slate-100">
              {formatWeek(selectedWeek)}
            </p>
          ) : (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-500/60 dark:bg-red-900/35 dark:text-red-100">
              No hay semana activa seleccionada.
            </p>
          )}
        </div>

        <form className="mt-4 space-y-3.5" onSubmit={handleSubmit}>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className={summaryCardClass}>
              <p className="text-xs uppercase tracking-wide text-slate-500">Tus dias seleccionados</p>
              <p className="text-lg font-bold text-[var(--primary-50)]">{selectedOriginCount}</p>
            </div>
            <div className={summaryCardClass}>
              <p className="text-xs uppercase tracking-wide text-slate-500">Dias companero</p>
              <p className="text-lg font-bold text-[var(--primary-50)]">{isBolsaMode ? "No aplica" : selectedDestinationCount}</p>
            </div>
            <div className={summaryCardClass}>
              <p className="text-xs uppercase tracking-wide text-slate-500">Modo actual</p>
              <p className="text-lg font-bold text-[var(--primary-50)]">{form.modo_compensacion}</p>
            </div>
          </div>

          <div className="block text-sm text-slate-700">
            Companero receptor
            <CustomSelect
              value={form.receptor_id}
              onChange={(val) => {
                const receptorId = String(val);
                setForm((current) => ({
                  ...current,
                  receptor_id: receptorId,
                  asignacion_destino_id: "",
                }));
                setSelectedDestinationIds([]);

                if (!receptorId) {
                  setCompanionAssignments([]);
                  return;
                }

                setCompanionWeekId((current) => {
                  if (current && companionWeekOptions.some((week) => week.id === current)) {
                    return current;
                  }
                  if (selectedWeekId && companionWeekOptions.some((week) => week.id === selectedWeekId)) {
                    return selectedWeekId;
                  }
                  return companionWeekOptions[0]?.id ?? "";
                });
              }}
              options={[
                { value: "", label: "Selecciona usuario" },
                ...users.map(u => ({ value: u.id, label: u.nombre }))
              ]}
              className="mt-2"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="block text-sm text-slate-700">
              Tipo
              <CustomSelect
                value={form.tipo}
                onChange={(val) =>
                  setForm((current) => ({
                    ...current,
                    tipo: String(val),
                    asignacion_origen_id: "",
                    asignacion_destino_id: "",
                  }))
                }
                options={[
                  { value: "dia", label: "Dia" },
                  { value: "semana", label: "Semana" },
                ]}
                className="mt-2"
              />
            </div>

            <div className="block text-sm text-slate-700">
              Modo de compensacion
              <CustomSelect
                value={form.modo_compensacion}
                onChange={(val) => {
                  setSelectedDestinationIds([]);
                  setForm((current) => ({
                    ...current,
                    modo_compensacion: String(val),
                    asignacion_destino_id: "",
                  }));
                }}
                options={[
                  { value: "bolsa", label: "Bolsa" },
                  { value: "inmediata", label: "Inmediata" },
                ]}
                className="mt-2"
              />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className={panelCardClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                {form.tipo === "dia"
                  ? "Tus turnos (selecciona los dias que quieras)"
                  : "Tu semana (selecciona referencia)"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {form.tipo === "dia"
                  ? "Los dias pueden ser no consecutivos."
                  : "Se intercambia la semana completa al aceptar."}
              </p>
              <div className="mt-2 space-y-2">
                {filteredMyAssignments.length === 0 && (
                  <p className="text-xs text-slate-500">
                    No tienes turnos disponibles en esta semana para intercambiar.
                  </p>
                )}
                {form.tipo === "semana"
                  ? weekOriginAssignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className={`${selectChipClass} glass-chip-active`}
                      >
                        {formatAssignment(assignment)}
                      </div>
                    ))
                  : filteredMyAssignments.map((assignment) => {
                      const isSelected = selectedOriginIds.includes(assignment.id);

                      return (
                        <button
                          key={assignment.id}
                          type="button"
                          onClick={() => toggleOriginSelection(assignment)}
                          className={`${selectChipClass} ${isSelected ? "glass-chip-active" : ""}`}
                        >
                          {formatAssignment(assignment)}
                        </button>
                      );
                    })}
              </div>
              {form.tipo === "dia" && selectedOriginIds.length > 0 && (
                <p className="mt-2 text-xs text-slate-600">
                  Seleccionados ({selectedOriginIds.length}): {selectedOriginAssignments.map((item) => item.dia).join(", ")}
                </p>
              )}
            </div>

            <div className={panelCardClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                {selectedCompanion
                  ? `Turnos de ${selectedCompanion.nombre}`
                  : "Turnos del companero seleccionado"}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {form.modo_compensacion === "inmediata"
                  ? form.tipo === "dia"
                    ? "Compensacion inmediata por dia: selecciona la misma cantidad de turnos tuyos y del companero."
                    : "Compensacion inmediata semanal: cada empleado usa su propia semana y se intercambia completa."
                  : "Compensacion bolsa: solo eliges tus turnos y se genera deuda para compensar despues."}
              </p>

              {isBolsaMode ? (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-500/60 dark:bg-blue-900/35 dark:text-blue-100">
                  En Bolsa no se permite elegir destinos. Tu companero recibe tu solicitud y, si acepta, quedara reflejada la deuda en la bolsa.
                </div>
              ) : (
                <>
                  {form.receptor_id && (
                    <div className="glass-soft mt-2 p-2">
                      <WeekSelector
                        weeks={companionWeekOptions}
                        selectedWeekId={companionWeekId}
                        onChange={setCompanionWeekId}
                        label={
                          form.tipo === "semana"
                            ? "Semana del companero (se intercambia completa)"
                            : "Semana del companero"
                        }
                      />
                      {loadingCompanionWeeks && (
                        <p className="mt-1 text-xs text-slate-500">Cargando semanas del companero...</p>
                      )}
                      {selectedCompanionWeek ? (
                        <p className="mt-1 text-xs text-slate-500">{formatWeek(selectedCompanionWeek)}</p>
                      ) : (
                        <p className="mt-1 text-xs text-slate-500">Este companero no tiene semanas con turnos.</p>
                      )}
                    </div>
                  )}

                  {form.receptor_id && form.tipo === "semana" && (
                    <div className="glass-soft mt-2 px-3 py-2 text-xs text-slate-600">
                      Semana propia: {selectedWeek ? formatWeek(selectedWeek) : "sin semana activa"}. Semana companero: {selectedCompanionWeek ? formatWeek(selectedCompanionWeek) : "sin semana seleccionada"}. En modo semanal se preseleccionan todos los dias de ambas semanas.
                    </div>
                  )}

                  <div className="mt-2 space-y-2">
                    {!form.receptor_id && (
                      <p className="text-xs text-slate-500">Selecciona un companero para ver sus turnos.</p>
                    )}
                    {form.receptor_id && loadingCompanionAssignments && (
                      <p className="text-xs text-slate-500">Cargando turnos del companero...</p>
                    )}
                    {form.receptor_id && !loadingCompanionAssignments && destinationOptions.length === 0 && companionWeekOptions.length > 0 && (
                      <p className="text-xs text-slate-500">Este companero no tiene turnos en la semana seleccionada.</p>
                    )}
                    {form.tipo === "semana"
                      ? weekDestinationAssignments.map((assignment) => (
                          <div
                            key={assignment.id}
                            className={`${selectChipClass} glass-chip-active`}
                          >
                            {formatAssignment(assignment)}
                          </div>
                        ))
                      : destinationOptions.map((assignment) => {
                          const isSelected = selectedDestinationIds.includes(assignment.id);

                          return (
                            <button
                              key={assignment.id}
                              type="button"
                              onClick={() => toggleDestinationSelection(assignment)}
                              className={`${selectChipClass} ${isSelected ? "glass-chip-active" : ""}`}
                            >
                              {formatAssignment(assignment)}
                            </button>
                          );
                        })}
                  </div>

                  {form.tipo === "dia" && selectedDestinationIds.length > 0 && (
                    <p className="mt-2 text-xs text-slate-600">
                      Destinos seleccionados ({selectedDestinationIds.length}): {selectedDestinationAssignments.map((item) => item.dia).join(", ")}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <label className="block text-sm text-slate-700">
            Motivo
            <textarea
              value={form.motivo}
              onChange={(event) => setForm((current) => ({ ...current, motivo: event.target.value }))}
              className={textAreaControlClass}
            />
          </label>

          <NoticeBanner
            message={
              isBolsaMode
                ? "Modo bolsa: solo seleccionas tus turnos. No se permite elegir destino."
                : form.tipo === "dia"
                  ? "Modo dia: puedes seleccionar 1..N dias y se enviara una unica peticion."
                  : "Modo semana: se preseleccionan automaticamente todos los dias de tu semana y de la semana elegida del companero."
            }
            kind="info"
          />

          <button
            type="submit"
            disabled={submitBusy}
            className="glass-button glass-button-primary h-11 rounded-lg px-6 text-base font-semibold disabled:opacity-50"
          >
            {submitBusy ? "Enviando..." : "Enviar solicitud"}
          </button>
        </form>

        <div className="mt-3 space-y-2">
          <NoticeBanner message={error} kind="error" />
          <NoticeBanner message={notice} kind="success" />
        </div>
      </article>

      <article className="glass-card float-in space-y-5 p-5 md:p-6">
        <div className="glass-panel glass-interactive border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-500/55 dark:bg-cyan-900/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xl font-bold text-[color:var(--ink)]">
                Recibidas <span className="text-base font-semibold text-[color:var(--ink-soft)]">({receivedCount})</span>
              </h3>
              <p className="mt-1 text-xs text-[color:var(--ink-soft)]">
                {pendingReceivedCount > 0
                  ? "Prioriza las pendientes para desbloquear cambios en el calendario."
                  : "Sin acciones pendientes en este bloque."}
              </p>
            </div>
            <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
              Por responder: {pendingReceivedCount}
            </span>
          </div>
          <div className="mt-3 max-h-[38vh] space-y-3 overflow-y-auto pr-1">
            {groupedReceived.groups.length === 0 && groupedReceived.singles.length === 0 && (
              <p className="text-sm text-[color:var(--ink-soft)]">No tienes solicitudes recibidas.</p>
            )}

            {groupedReceived.groups.map((group) => renderGroup(group, "recibidas"))}
            {groupedReceived.singles.map((item) => renderRequestItem(item, "recibidas"))}
          </div>
        </div>

        <div className="glass-panel glass-interactive border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-500/55 dark:bg-indigo-900/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xl font-bold text-[color:var(--ink)]">
                Enviadas <span className="text-base font-semibold text-[color:var(--ink-soft)]">({sentCount})</span>
              </h3>
              <p className="mt-1 text-xs text-[color:var(--ink-soft)]">
                {pendingSentCount > 0
                  ? "Estas solicitudes siguen en espera de respuesta del companero."
                  : "No hay solicitudes en espera en este bloque."}
              </p>
            </div>
            <span className="glass-badge rounded-full px-2.5 py-1 text-xs font-semibold text-slate-700">
              En espera: {pendingSentCount}
            </span>
          </div>
          <div className="mt-3 max-h-[38vh] space-y-3 overflow-y-auto pr-1">
            {groupedSent.groups.length === 0 && groupedSent.singles.length === 0 && (
              <p className="text-sm text-[color:var(--ink-soft)]">No has enviado solicitudes.</p>
            )}

            {groupedSent.groups.map((group) => renderGroup(group, "enviadas"))}
            {groupedSent.singles.map((item) => renderRequestItem(item, "enviadas"))}
          </div>
        </div>
      </article>
    </section>
  );
};
