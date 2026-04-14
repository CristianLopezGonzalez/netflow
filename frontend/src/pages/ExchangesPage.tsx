import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { api } from "../api";
import { NoticeBanner } from "../components/common/NoticeBanner";
import { WeekSelector } from "../components/common/WeekSelector";
import CustomSelect from "../components/common/CustomSelect";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import type { Asignacion, BolsaSaldos, EstadoSolicitud, Semana, SolicitudIntercambio } from "../types";
import { asErrorMessage, dayOrder, formatAssignment } from "../utils/formatters";

const parseIsoDate = (value: string): Date => {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day));
};

const formatWeekSelectLabel = (week: Semana): string => {
  const start = parseIsoDate(week.fecha_inicio_semana);
  const end = parseIsoDate(week.fecha_fin_semana);
  const formatter = new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" });
  const startMonth = formatter.format(start).replace(".", "").toLowerCase();
  const endMonth = formatter.format(end).replace(".", "").toLowerCase();
  const startDay = `${start.getUTCDate()}`.padStart(2, "0");
  const endDay = `${end.getUTCDate()}`.padStart(2, "0");
  const year = end.getUTCFullYear();

  if (startMonth === endMonth) {
    return `${startDay} - ${endDay} ${endMonth} ${year}`;
  }

  return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${year}`;
};

const sortWeeksByStart = (weekList: Semana[]) =>
  [...weekList].sort(
    (left, right) => parseIsoDate(left.fecha_inicio_semana).getTime()
      - parseIsoDate(right.fecha_inicio_semana).getTime(),
  );

const addUtcDays = (date: Date, days: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));

const formatAssignmentDate = (assignment: Asignacion, week: Semana): Date => {
  const start = parseIsoDate(week.fecha_inicio_semana);
  const dayIndex = dayOrder.indexOf(assignment.dia);
  return addUtcDays(start, dayIndex);
};

const formatSummaryDates = (dates: Date[]): string => {
  if (dates.length === 0) {
    return "Sin dias";
  }

  const sortedDates = [...dates].sort((left, right) => left.getTime() - right.getTime());
  const first = sortedDates[0];
  const last = sortedDates[sortedDates.length - 1];
  const formatter = new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" });

  const formatDate = (date: Date, includeYear = false) => {
    const day = `${date.getUTCDate()}`.padStart(2, "0");
    const month = formatter.format(date).replace(".", "").toLowerCase();
    const year = date.getUTCFullYear();
    return includeYear ? `${day} ${month} ${year}` : `${day} ${month}`;
  };

  if (sortedDates.length === 1) {
    return formatDate(first, true);
  }

  const isConsecutive = sortedDates.every(
    (date, index) => index === 0 || date.getTime() === sortedDates[index - 1].getTime() + 24 * 60 * 60 * 1000,
  );

  if (isConsecutive) {
    if (first.getUTCFullYear() === last.getUTCFullYear()) {
      return `${formatDate(first, false)} - ${formatDate(last, true)}`;
    }
    return `${formatDate(first, true)} - ${formatDate(last, true)}`;
  }

  const sameYear = sortedDates.every((date) => date.getUTCFullYear() === first.getUTCFullYear());
  if (sameYear) {
    return sortedDates
      .map((date) => formatDate(date, false))
      .join(", ") + ` ${first.getUTCFullYear()}`;
  }

  return sortedDates.map((date) => formatDate(date, true)).join(", ");
};

const GROUP_TOKEN_REGEX = /^\[#GRUPO:([^\]]+)\]\s*/;

type ExchangeSection = "recibidas" | "enviadas";
type RequestGroup = {
  groupId: string;
  items: SolicitudIntercambio[];
};

type RequestDisplayItem =
  | { kind: "group"; createdAt: string; group: RequestGroup }
  | { kind: "single"; createdAt: string; item: SolicitudIntercambio };

type ExchangesNavigationState = {
  focusRequestId?: string;
  focusRequestSection?: ExchangeSection;
  focusAt?: number;
  openNewRequest?: boolean;
  preset?: {
    receptor_id?: string;
    tipo?: "dia" | "semana";
    asignacion_origen_id?: string;
    asignacion_origen_ids?: string[];
    asignacion_destino_id?: string;
    asignacion_destino_ids?: string[];
    modo_compensacion?: "bolsa" | "inmediata";
    motivo?: string;
  };
  targetWeekId?: string;
};

type RequestDaySummary = {
  origenLabel: string;
  destinoLabel: string;
};

const statusClass: Record<EstadoSolicitud, string> = {
  pendiente: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/35 dark:text-amber-100 dark:border-amber-500/60",
  aceptada: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/35 dark:text-emerald-100 dark:border-emerald-500/60",
  rechazada: "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/35 dark:text-red-100 dark:border-red-500/60",
  cancelada: "bg-zinc-200 text-zinc-700 border-zinc-300 dark:bg-zinc-800/75 dark:text-zinc-100 dark:border-zinc-500/60",
};

const statusLabel: Record<EstadoSolicitud, string> = {
  pendiente: "Pendiente",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

const requestCardClass: Record<EstadoSolicitud, string> = {
  pendiente: "border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/80",
  aceptada: "border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/80",
  rechazada: "border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/80",
  cancelada: "border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/80",
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

const buildRequestDisplayItems = (
  grouped: { groups: RequestGroup[]; singles: SolicitudIntercambio[] },
): RequestDisplayItem[] => {
  const groupedItems: RequestDisplayItem[] = grouped.groups.map((group) => ({
    kind: "group",
    group,
    createdAt: group.items[0]?.fecha_creacion ?? "",
  }));

  const singleItems: RequestDisplayItem[] = grouped.singles.map((item) => ({
    kind: "single",
    item,
    createdAt: item.fecha_creacion,
  }));

  return [...groupedItems, ...singleItems].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
};

const buildRequestCardDomId = (rawId: string): string =>
  `exchange-request-${rawId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

const sortByDay = (assignments: Asignacion[]): Asignacion[] => {
  return [...assignments].sort((a, b) => dayOrder.indexOf(a.dia) - dayOrder.indexOf(b.dia));
};

const buildRequestDaySummary = (
  item: SolicitudIntercambio,
  items: SolicitudIntercambio[] = [item],
  weeks: Semana[],
): RequestDaySummary => {
  const weekById = new Map(weeks.map((weekItem) => [weekItem.id, weekItem]));

  const originAssignments = items.map((request) => request.asignacion_origen);
  const destinationAssignments = items
    .map((request) => request.asignacion_destino)
    .filter((assignment): assignment is Asignacion => Boolean(assignment));

  const formatDayRangesByDate = (entries: Array<{ dia: Asignacion["dia"]; date: Date }>) => {
    if (entries.length === 0) {
      return "Sin dias";
    }

    const uniqueByDate = Array.from(
      new Map(entries.map((entry) => [entry.date.toISOString().slice(0, 10), entry])).values(),
    ).sort((left, right) => left.date.getTime() - right.date.getTime());

    const ranges: string[] = [];
    let rangeStart = uniqueByDate[0];
    let rangeEnd = uniqueByDate[0];

    for (let index = 1; index < uniqueByDate.length; index += 1) {
      const current = uniqueByDate[index];
      if (current.date.getTime() === rangeEnd.date.getTime() + 24 * 60 * 60 * 1000) {
        rangeEnd = current;
        continue;
      }

      ranges.push(
        rangeStart.dia === rangeEnd.dia
          ? rangeStart.dia
          : `${rangeStart.dia}-${rangeEnd.dia}`,
      );
      rangeStart = current;
      rangeEnd = current;
    }

    ranges.push(
      rangeStart.dia === rangeEnd.dia
        ? rangeStart.dia
        : `${rangeStart.dia}-${rangeEnd.dia}`,
    );

    return ranges.join(", ");
  };

  const formatAssignments = (assignments: Asignacion[]) => {
    const datedAssignments = assignments
      .map((assignment) => {
        const week = weekById.get(assignment.semana);
        if (!week) {
          return null;
        }

        return {
          dia: assignment.dia,
          date: formatAssignmentDate(assignment, week),
        };
      })
      .filter((entry): entry is { dia: Asignacion["dia"]; date: Date } => Boolean(entry));

    const dates = datedAssignments.map((entry) => entry.date);

    return `${formatSummaryDates(dates)} (${formatDayRangesByDate(datedAssignments)})`;
  };

  if (item.tipo === "semana") {
    const originWeek = weekById.get(item.asignacion_origen.semana);
    const destinationWeek = item.asignacion_destino
      ? weekById.get(item.asignacion_destino.semana)
      : null;
    const fullWeekDayRange = `${dayOrder[0]}-${dayOrder[dayOrder.length - 1]}`;

    return {
      origenLabel: originWeek
        ? `${formatSummaryDates(
            Array.from({ length: dayOrder.length }, (_, index) =>
              addUtcDays(parseIsoDate(originWeek.fecha_inicio_semana), index),
            ),
          )} (${fullWeekDayRange})`
        : "Semana completa",
      destinoLabel:
        item.modo_compensacion === "inmediata"
          ? destinationWeek
            ? `${formatSummaryDates(
                Array.from({ length: dayOrder.length }, (_, index) =>
                  addUtcDays(parseIsoDate(destinationWeek.fecha_inicio_semana), index),
                ),
              )} (${fullWeekDayRange})`
            : "Semana completa"
          : "No aplica (bolsa)",
    };
  }

  return {
    origenLabel: originAssignments.length > 0 ? formatAssignments(originAssignments) : "Sin dias",
    destinoLabel:
      item.modo_compensacion === "inmediata"
        ? destinationAssignments.length > 0
          ? formatAssignments(destinationAssignments)
          : "Sin dias"
        : "No aplica (bolsa)",
  };
};

const sortRequestsForScan = (requests: SolicitudIntercambio[]): SolicitudIntercambio[] => {
  return [...requests].sort((left, right) =>
    right.fecha_creacion.localeCompare(left.fecha_creacion),
  );
};

const panelCardClass = "glass-panel p-4";
const selectChipClass = "glass-chip w-full rounded-lg px-3 py-2 text-left text-sm font-medium";
const textAreaControlClass = "glass-input mt-2 min-h-24 w-full rounded-xl px-4 py-3 text-base resize-none";

export const ExchangesPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    users,
    weeks,
    myAssignments,
    intercambios,
    bolsaSaldos,
    selectedWeekId,
    setSelectedWeekId,
    reloadBolsaSaldos,
    reloadIntercambios,
    reloadWeekDetail,
  } = useAppData();
  const { user } = useAuth();

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
  const [companionBalanceDetail, setCompanionBalanceDetail] = useState<{ me_deben: number; debo: number } | null>(null);
  const [companionBalanceLoadFailed, setCompanionBalanceLoadFailed] = useState(false);
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
  const [liveBolsaSaldos, setLiveBolsaSaldos] = useState<BolsaSaldos>(bolsaSaldos);

  const refreshBolsaSaldos = useCallback(async () => {
    try {
      await reloadBolsaSaldos();
    } catch {
      // Keep last known values; this refresh is best-effort.
    }
  }, [reloadBolsaSaldos]);

  useEffect(() => {
    setLiveBolsaSaldos(bolsaSaldos);
  }, [bolsaSaldos]);

  useEffect(() => {
    void refreshBolsaSaldos();
  }, [refreshBolsaSaldos, intercambios]);

  const selectedWeek = useMemo(
    () => weeks.find((week) => week.id === selectedWeekId) ?? null,
    [weeks, selectedWeekId],
  );

  const selectedCompanion = useMemo(
    () => users.find((user) => user.id === form.receptor_id) ?? null,
    [form.receptor_id, users],
  );

  const receptorOptions = useMemo(
    () => [
      { value: "", label: "Selecciona usuario" },
      ...users
        .filter((person) => person.rol === "empleado")
        .map((person) => ({ value: person.id, label: person.nombre })),
    ],
    [users],
  );

  const myWeekOptions = useMemo(() => {
    const myWeekIds = new Set(myAssignments.map((assignment) => assignment.semana));
    return sortWeeksByStart(weeks.filter((week) => myWeekIds.has(week.id)));
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
  const receivedCardIdByRequestId = useMemo(() => {
    const map = new Map<string, string>();

    groupedReceived.singles.forEach((item) => {
      map.set(item.id, buildRequestCardDomId(item.id));
    });

    groupedReceived.groups.forEach((group) => {
      const groupCardId = buildRequestCardDomId(`group-${group.groupId}`);
      group.items.forEach((item) => {
        map.set(item.id, groupCardId);
      });
    });

    return map;
  }, [groupedReceived]);
  const receivedDisplayItems = useMemo(
    () => buildRequestDisplayItems(groupedReceived),
    [groupedReceived],
  );
  const sentDisplayItems = useMemo(
    () => buildRequestDisplayItems(groupedSent),
    [groupedSent],
  );
  const receivedCount = receivedRequests.length;
  const sentCount = sentRequests.length;
  const isBolsaMode = form.modo_compensacion === "bolsa";
  const selectedOriginCount =
    form.tipo === "semana" ? weekOriginAssignments.length : selectedOriginIds.length;
  const selectedDestinationCount =
    isBolsaMode
      ? 0
      : form.tipo === "semana"
        ? weekDestinationAssignments.length
        : selectedDestinationIds.length;

  const [selectedExchangeTab, setSelectedExchangeTab] = useState<ExchangeSection>("recibidas");
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<"owed" | "debt" | null>(null);
  const [showSubmitTip, setShowSubmitTip] = useState(true);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);

  useEffect(() => {
    const state = location.state as ExchangesNavigationState | null;
    if (!state) {
      return;
    }

    if (state.targetWeekId) {
      setSelectedWeekId(state.targetWeekId);
    }

    if (state.openNewRequest) {
      setNewRequestOpen(true);
    }

    if (state.preset) {
      setForm((current) => ({
        ...current,
        ...state.preset,
      }));

      if (state.preset.asignacion_origen_ids?.length) {
        setSelectedOriginIds(state.preset.asignacion_origen_ids);
      } else if (state.preset.asignacion_origen_id) {
        setSelectedOriginIds([state.preset.asignacion_origen_id]);
      }

      if (state.preset.asignacion_destino_ids?.length) {
        setSelectedDestinationIds(state.preset.asignacion_destino_ids);
      } else if (state.preset.asignacion_destino_id) {
        setSelectedDestinationIds([state.preset.asignacion_destino_id]);
      }
    }

    if (state.openNewRequest || state.preset || state.targetWeekId) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.key, location.pathname, location.state, navigate, setSelectedWeekId]);

  const requestBalanceByUser = useMemo(() => {
    const map = new Map<string, { name: string; me_deben: number; debo: number }>();

    const currentUserId = user?.id;
    if (!currentUserId) {
      return map;
    }

    const applyNetDelta = (counterpartId: string, counterpartName: string, delta: number) => {
      const current = map.get(counterpartId) ?? { name: counterpartName, me_deben: 0, debo: 0 };
      const nextNet = current.me_deben - current.debo + delta;
      current.name = counterpartName;
      current.me_deben = Math.max(nextNet, 0);
      current.debo = Math.max(-nextNet, 0);
      map.set(counterpartId, current);
    };

    const processRequest = (item: SolicitudIntercambio) => {
      if (item.estado !== "aceptada") {
        return;
      }

      const counterpart = item.solicitante.id === currentUserId ? item.receptor : item.solicitante;
      const days = item.dias_estimados;
      if (days <= 0) {
        return;
      }

      if (item.es_compensacion) {
        const solicitanteEsDeudor = item.rol_solicitante_compensacion === "deudor";
        const deudorId = solicitanteEsDeudor ? item.solicitante.id : item.receptor.id;
        const acreedorId = solicitanteEsDeudor ? item.receptor.id : item.solicitante.id;

        // Compensation requests reduce existing debt.
        if (currentUserId === deudorId) {
          applyNetDelta(counterpart.id, counterpart.nombre, days);
          return;
        }
        if (currentUserId === acreedorId) {
          applyNetDelta(counterpart.id, counterpart.nombre, -days);
        }
        return;
      }

      if (item.modo_compensacion !== "bolsa") {
        return;
      }

      // In bolsa mode, the requester (solicitante) is the deudor if accepted.
      if (currentUserId === item.solicitante.id) {
        applyNetDelta(counterpart.id, counterpart.nombre, -days);
        return;
      }
      if (currentUserId === item.receptor.id) {
        applyNetDelta(counterpart.id, counterpart.nombre, days);
      }
    };

    receivedRequests.forEach(processRequest);
    sentRequests.forEach(processRequest);

    return map;
  }, [receivedRequests, sentRequests, user?.id]);

  const bolsaBalanceByUser = useMemo(() => {
    const map = new Map<string, { name: string; me_deben: number; debo: number }>();

    liveBolsaSaldos.detalles.forEach((item) => {
      map.set(item.usuario.id, {
        name: item.usuario.nombre,
        me_deben: item.me_deben,
        debo: item.debo,
      });
    });

    liveBolsaSaldos.me_deben.forEach((item) => {
      const current = map.get(item.usuario.id) ?? { name: item.usuario.nombre, me_deben: 0, debo: 0 };
      current.me_deben = Math.max(current.me_deben, item.me_deben);
      map.set(item.usuario.id, current);
    });

    liveBolsaSaldos.debo.forEach((item) => {
      const current = map.get(item.usuario.id) ?? { name: item.usuario.nombre, me_deben: 0, debo: 0 };
      current.debo = Math.max(current.debo, item.debo);
      map.set(item.usuario.id, current);
    });

    return map;
  }, [liveBolsaSaldos]);

  const netBalanceByUser = useCallback(
    (source: Map<string, { name: string; me_deben: number; debo: number }>) => {
      const map = new Map<string, { name: string; me_deben: number; debo: number }>();

      source.forEach((entry, id) => {
        const net = entry.me_deben - entry.debo;
        map.set(id, {
          name: entry.name,
          me_deben: Math.max(net, 0),
          debo: Math.max(-net, 0),
        });
      });

      return map;
    },
    [],
  );

  const bolsaNettedByUser = useMemo(
    () => netBalanceByUser(bolsaBalanceByUser),
    [bolsaBalanceByUser, netBalanceByUser],
  );

  const requestNettedByUser = useMemo(
    () => netBalanceByUser(requestBalanceByUser),
    [netBalanceByUser, requestBalanceByUser],
  );

  const hasBolsaDebtData = useMemo(
    () => Array.from(bolsaNettedByUser.values()).some((entry) => entry.me_deben > 0 || entry.debo > 0),
    [bolsaNettedByUser],
  );

  const activeNettedByUser = hasBolsaDebtData ? bolsaNettedByUser : requestNettedByUser;

  const owedByWorker = useMemo(
    () =>
      Array.from(activeNettedByUser.values())
        .filter((entry) => entry.me_deben > 0)
        .map((entry) => ({ name: entry.name, days: entry.me_deben })),
    [activeNettedByUser],
  );

  const debtByWorker = useMemo(
    () =>
      Array.from(activeNettedByUser.values())
        .filter((entry) => entry.debo > 0)
        .map((entry) => ({ name: entry.name, days: entry.debo })),
    [activeNettedByUser],
  );

  const owedDays = useMemo(
    () => owedByWorker.reduce((sum, entry) => sum + entry.days, 0),
    [owedByWorker],
  );

  const debtDays = useMemo(
    () => debtByWorker.reduce((sum, entry) => sum + entry.days, 0),
    [debtByWorker],
  );

  useEffect(() => {
    let active = true;

    const loadCompanionBalance = async () => {
      if (!form.receptor_id) {
        setCompanionBalanceDetail(null);
        setCompanionBalanceLoadFailed(false);
        return;
      }

      setCompanionBalanceDetail(null);
      setCompanionBalanceLoadFailed(false);

      try {
        const data = await api.bolsaSaldoUsuario(form.receptor_id);
        if (!active) {
          return;
        }

        setCompanionBalanceDetail({
          me_deben: data.me_deben ?? 0,
          debo: data.debo ?? 0,
        });
      } catch {
        if (!active) {
          return;
        }
        setCompanionBalanceDetail(null);
        setCompanionBalanceLoadFailed(true);
      }
    };

    void loadCompanionBalance();

    return () => {
      active = false;
    };
  }, [form.receptor_id, intercambios]);

  const companionBalance = useMemo(() => {
    if (!form.receptor_id) {
      return { me_deben: 0, debo: 0 };
    }

    const fallback = requestNettedByUser.get(form.receptor_id);
    const fromActive = activeNettedByUser.get(form.receptor_id);

    if (companionBalanceDetail) {
      const detailNet = companionBalanceDetail.me_deben - companionBalanceDetail.debo;
      const detailNetted = {
        me_deben: Math.max(detailNet, 0),
        debo: Math.max(-detailNet, 0),
      };

      if (
        detailNetted.me_deben === 0
        && detailNetted.debo === 0
        && fallback
        && (fallback.me_deben > 0 || fallback.debo > 0)
      ) {
        return { me_deben: fallback.me_deben, debo: fallback.debo };
      }

      return detailNetted;
    }

    if (fromActive) {
      return {
        me_deben: fromActive.me_deben,
        debo: fromActive.debo,
      };
    }

    if (fallback) {
      return { me_deben: fallback.me_deben, debo: fallback.debo };
    }

    return { me_deben: 0, debo: 0 };
  }, [activeNettedByUser, companionBalanceDetail, form.receptor_id, requestNettedByUser]);

  const bolsaCurrentOwed = companionBalance.me_deben;
  const bolsaCurrentDebt = companionBalance.debo;
  const bolsaFutureNet = bolsaCurrentOwed - (bolsaCurrentDebt + selectedOriginCount);
  const bolsaFutureOwed = Math.max(bolsaFutureNet, 0);
  const bolsaFutureDebt = Math.max(-bolsaFutureNet, 0);

  const formatBalanceText = (owed: number, debt: number): string => {
    if (owed === 0 && debt === 0) {
      return "cuentas saldadas";
    }
    if (owed > 0 && debt === 0) {
      return `te deben ${owed} días`;
    }
    if (debt > 0 && owed === 0) {
      return `debes ${debt} días`;
    }
    return `te deben ${owed} días y debes ${debt} días`;
  };

  const formatCurrentCompactSummary = (
    counterpartName: string,
    owed: number,
    debt: number,
  ): string => {
    if (owed > 0 && debt === 0) {
      return `${counterpartName} te debe ${owed}d`;
    }
    if (debt > 0 && owed === 0) {
      return `Debes ${debt}d`;
    }
    return "Saldado";
  };

  const formatProjectedCompactSummary = (owed: number, debt: number): string => {
    if (owed > 0 && debt === 0) {
      return `te deberá ${owed}d`;
    }
    if (debt > 0 && owed === 0) {
      return `deberás ${debt}d`;
    }
    return "quedará saldado";
  };

  const getAcceptedNetDeltaForCurrentUser = (
    item: SolicitudIntercambio,
    estimatedDays: number = item.dias_estimados,
  ): number => {
    const currentUserId = user?.id;
    if (!currentUserId) {
      return 0;
    }

    const days = estimatedDays;
    if (days <= 0) {
      return 0;
    }

    if (item.es_compensacion) {
      const solicitanteEsDeudor = item.rol_solicitante_compensacion === "deudor";
      const deudorId = solicitanteEsDeudor ? item.solicitante.id : item.receptor.id;
      const acreedorId = solicitanteEsDeudor ? item.receptor.id : item.solicitante.id;

      if (currentUserId === deudorId) {
        return days;
      }
      if (currentUserId === acreedorId) {
        return -days;
      }
      return 0;
    }

    if (item.modo_compensacion !== "bolsa") {
      return 0;
    }

    if (currentUserId === item.solicitante.id) {
      return -days;
    }
    if (currentUserId === item.receptor.id) {
      return days;
    }

    return 0;
  };

  const submitTip = useMemo(() => {
    if (!form.receptor_id) {
      return "Selecciona un compañero.";
    }
    if (!selectedWeekId) {
      return "Selecciona tu semana activa.";
    }
    if (form.tipo === "dia") {
      if (selectedOriginIds.length === 0) {
        return "Selecciona los días que quieras intercambiar.";
      }
      if (!isBolsaMode) {
        if (!companionWeekId) {
          return "Selecciona la semana del compañero.";
        }
        if (selectedDestinationIds.length === 0) {
          return `Selecciona días del compañero (${selectedDestinationIds.length}/${selectedOriginIds.length}).`;
        }
        if (selectedDestinationIds.length !== selectedOriginIds.length) {
          return `Selecciona la misma cantidad de turnos del compañero (${selectedDestinationIds.length}/${selectedOriginIds.length}).`;
        }
      }
    }
    if (form.tipo === "semana" && form.modo_compensacion === "inmediata" && !companionWeekId) {
      return "Selecciona una semana del compañero para intercambio semanal inmediato.";
    }
    return "";
  }, [
    form.receptor_id,
    selectedWeekId,
    form.tipo,
    selectedOriginIds.length,
    selectedDestinationIds.length,
    isBolsaMode,
    companionWeekId,
    form.modo_compensacion,
  ]);

  const visibleSubmitTip = showSubmitTip ? submitTip : "";
  const isSubmitDisabled = submitBusy || Boolean(submitTip);

  useEffect(() => {
    const state = (location.state as ExchangesNavigationState | null) ?? null;
    const focusRequestId = state?.focusRequestId;
    if (!focusRequestId) {
      return;
    }

    setSelectedExchangeTab(state?.focusRequestSection ?? "recibidas");

    const targetCardId = receivedCardIdByRequestId.get(focusRequestId);
    if (!targetCardId) {
      return;
    }

    const tryFocus = () => {
      const targetElement = document.getElementById(targetCardId);
      if (!targetElement) {
        return false;
      }

      targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedCardId(targetCardId);

      navigate(location.pathname, { replace: true, state: null });

      window.setTimeout(() => {
        setHighlightedCardId((current) => (current === targetCardId ? null : current));
      }, 2300);

      return true;
    };

    const initialTimer = window.setTimeout(() => {
      if (tryFocus()) {
        return;
      }

      window.setTimeout(() => {
        void tryFocus();
      }, 220);
    }, 80);

    return () => {
      window.clearTimeout(initialTimer);
    };
  }, [location.pathname, location.state, navigate, receivedCardIdByRequestId]);

  useEffect(() => {
    const onFocusRequest = (event: Event) => {
      const customEvent = event as CustomEvent<ExchangesNavigationState>;
      const focusRequestId = customEvent.detail?.focusRequestId;
      if (!focusRequestId) {
        return;
      }

      setSelectedExchangeTab(customEvent.detail?.focusRequestSection ?? "recibidas");

      const targetCardId = receivedCardIdByRequestId.get(focusRequestId);
      if (!targetCardId) {
        return;
      }

      const tryFocus = () => {
        const targetElement = document.getElementById(targetCardId);
        if (!targetElement) {
          return false;
        }

        targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedCardId(targetCardId);

        window.setTimeout(() => {
          setHighlightedCardId((current) => (current === targetCardId ? null : current));
        }, 2300);

        return true;
      };

      window.setTimeout(() => {
        if (tryFocus()) {
          return;
        }

        window.setTimeout(() => {
          void tryFocus();
        }, 220);
      }, 80);
    };

    window.addEventListener("netflow:focus-request", onFocusRequest as EventListener);
    return () => window.removeEventListener("netflow:focus-request", onFocusRequest as EventListener);
  }, [receivedCardIdByRequestId]);

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

        const filteredWeeks = sortWeeksByStart(weeks.filter((week) => weekIds.has(week.id)));
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
    setShowSubmitTip(true);
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
    setShowSubmitTip(true);
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

    if (submitTip) {
      return;
    }

    if (!selectedWeekId) {
      setError("Debes seleccionar una semana activa para crear el intercambio.");
      return;
    }

    if (!form.receptor_id) {
      setError("Debes seleccionar un compañero receptor.");
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
            setError("Selecciona una semana del compañero para intercambio semanal inmediato.");
            return;
          }

          if (weekDestinationAssignments.length === 0) {
            setError("El compañero no tiene turnos en su semana seleccionada para intercambio semanal inmediato.");
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
            "Algunos turnos del compañero ya no estan disponibles. Recarga la vista e intenta de nuevo.",
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
        receptor_id: "",
        tipo: "dia",
        asignacion_origen_id: "",
        asignacion_destino_id: "",
        motivo: "",
      }));
      setShowSubmitTip(false);

      await Promise.all([
        reloadIntercambios(),
        reloadWeekDetail(selectedWeekId),
        loadCompanionAssignments(),
        refreshBolsaSaldos(),
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

      window.dispatchEvent(
        new CustomEvent("netflow:exchange-processed", {
          detail: { requestId, action },
        }),
      );

      try {
        await Promise.all([
          reloadIntercambios(),
          reloadWeekDetail(selectedWeekId),
          loadCompanionAssignments(),
          refreshBolsaSaldos(),
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
    domId?: string,
  ) => {
    const cleanMotivo = stripGroupToken(item.motivo);
    const detailDays = daySummary ?? buildRequestDaySummary(item, undefined, weeks);
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
      ? "border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900/80"
      : requestCardClass[item.estado];
    const sectionHighlight =
      section === "recibidas"
        ? "bg-zinc-100 dark:bg-zinc-900/80"
        : "bg-zinc-100 dark:bg-zinc-900/80";
    const counterpartName = section === "recibidas" ? item.solicitante.nombre : item.receptor.nombre;
    const isUserOrigin = item.asignacion_origen.usuario === user?.id;
    const entregaLabel = isUserOrigin ? detailDays.origenLabel : detailDays.destinoLabel;
    const cambioLabel = isUserOrigin ? detailDays.destinoLabel : detailDays.origenLabel;
    const scopeLabel = item.tipo === "semana" ? "Semana completa" : `${groupedItems} dia(s)`;
    const compensationLabel = item.modo_compensacion === "inmediata" ? "Inmediata" : "Bolsa";
    const createdLabel = item.fecha_creacion.slice(0, 10);
    const counterpartId = section === "recibidas" ? item.solicitante.id : item.receptor.id;
    const baseBalance = activeNettedByUser.get(counterpartId)
      ?? requestNettedByUser.get(counterpartId)
      ?? { name: counterpartName, me_deben: 0, debo: 0 };
    const currentNet = baseBalance.me_deben - baseBalance.debo;
    const pendingDaysEstimate =
      item.tipo === "dia"
        ? Math.max(groupedItems, item.dias_estimados)
        : item.dias_estimados;
    const acceptDelta = item.estado === "pendiente"
      ? getAcceptedNetDeltaForCurrentUser(item, pendingDaysEstimate)
      : 0;
    const projectedNet = currentNet + acceptDelta;
    const projectedBalance = {
      me_deben: Math.max(projectedNet, 0),
      debo: Math.max(-projectedNet, 0),
    };
    const cardDomId = domId ?? buildRequestCardDomId(item.id);
    const isHighlighted = highlightedCardId === cardDomId;
    const statusIcon = isTransitioning
      ? <span className="h-3 w-3 animate-spin rounded-full border border-current/40 border-t-current" />
      : item.estado === "aceptada"
        ? (
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l3 3 7-7" />
            </svg>
          )
        : item.estado === "rechazada"
          ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l8 8M14 6l-8 8" />
              </svg>
            )
          : item.estado === "cancelada"
            ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 10h8" />
                </svg>
              )
            : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 5v5l3 2" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
                </svg>
              );

    return (
      <div
        id={cardDomId}
        key={keyOverride ?? item.id}
        className={`rounded-xl border p-4 shadow-sm transition hover:shadow-md ${cardClass} ${sectionHighlight} ${isHighlighted ? "request-focus-glow" : ""}`}
      >
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="glass-badge max-w-[8.25rem] truncate rounded-full px-2 py-0.5 text-[9px] font-semibold">{scopeLabel}</span>
            <span className="glass-badge rounded-full px-2 py-0.5 text-[9px] font-semibold">{compensationLabel}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[10px] text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 2v3M14 2v3M3 8h14" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5h12a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1Z" />
              </svg>
              <span>{createdLabel}</span>
            </span>
            <span className={`inline-flex items-center ml-1 gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusPillClass}`}>
              {statusIcon}
              <span>{pillLabel}</span>
            </span>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-cyan-200 bg-cyan-100/60 p-3 dark:border-cyan-500/40 dark:bg-cyan-950/30">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
                  <span>↑</span>
                  <span>ENTREGA</span>
                </div>
                <span className="rounded-full border border-cyan-300 bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold text-cyan-800 dark:border-cyan-500/60 dark:bg-cyan-900/35 dark:text-cyan-100">
                  TÚ
                </span>
              </div>
              <p className="mt-2 text-[13px] font-semibold text-[color:var(--ink)] leading-tight">{entregaLabel}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-100/60 p-3 dark:border-amber-500/40 dark:bg-amber-950/30">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                  <span>↓</span>
                  <span>A CAMBIO</span>
                </div>
                <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-500/60 dark:bg-amber-900/35 dark:text-amber-100">
                  {counterpartName}
                </span>
              </div>
              <p className="mt-2 text-[13px] font-semibold text-[color:var(--ink)] leading-tight">{cambioLabel}</p>
            </div>
          </div>
        {cleanMotivo && (
          <p className="mt-3 text-[12px] text-[color:var(--ink-soft)]">Motivo: {cleanMotivo}</p>
        )}

        {item.estado === "pendiente" && section === "recibidas" && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex gap-2">
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

            <div className="glass-soft rounded-lg border border-[var(--color-surface-border)] px-2.5 py-2 text-[10px] sm:ml-auto sm:max-w-[16.5rem]">
              <p className="mt-1 text-[var(--primary-200)]">
                <span className="font-semibold text-[var(--primary-50)]">
                  {formatCurrentCompactSummary(counterpartName, baseBalance.me_deben, baseBalance.debo)}
                </span>
                {", Si aceptas "}
                <span className="font-semibold text-[var(--primary-50)]">
                  {formatProjectedCompactSummary(projectedBalance.me_deben, projectedBalance.debo)}
                </span>
                .
              </p>
            </div>
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

    const daySummary = buildRequestDaySummary(representative, group.items, weeks);

    return renderRequestItem(
      representative,
      section,
      group.items.length,
      `group-${group.groupId}`,
      daySummary,
      buildRequestCardDomId(`group-${group.groupId}`),
    );
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <article className="glass-card float-in p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Nueva solicitud</h2>
          </div>
          <button
            type="button"
            onClick={() => setNewRequestOpen((current) => !current)}
            className="glass-button glass-button-secondary inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold md:hidden"
          >
            {newRequestOpen ? "Ocultar solicitud" : "Nueva solicitud"}
          </button>
        </div>

        <form
          className={`mt-4 space-y-3.5 ${newRequestOpen ? "block" : "hidden"} md:block`}
          onSubmit={handleSubmit}
        >
          <div className="block text-sm text-[var(--primary-200)]">
            Compañero receptor
            <CustomSelect
              value={form.receptor_id}
              onChange={(val) => {
                setShowSubmitTip(true);
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
                ...receptorOptions
              ]}
              className="mt-2"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="block text-sm text-[var(--primary-200)]">
              <div className="mb-2 text-sm font-semibold">Tipo</div>
              <div className="inline-flex rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-1">
                {(["dia", "semana"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setShowSubmitTip(true);
                      setForm((current) => ({
                        ...current,
                        tipo: option,
                        asignacion_origen_id: "",
                        asignacion_destino_id: "",
                      }));
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      form.tipo === option
                        ? "bg-[var(--color-surface-bright)] text-white"
                        : "text-[var(--primary-300)] hover:text-white"
                    }`}
                  >
                    {option === "dia" ? "Dia" : "Semana"}
                  </button>
                ))}
              </div>
            </div>

            <div className="block text-sm text-[var(--primary-200)]">
              <div className="mb-2 text-sm font-semibold">Modo de compensacion</div>
              <div className="inline-flex rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-1">
                {(["bolsa", "inmediata"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setShowSubmitTip(true);
                      setSelectedDestinationIds([]);
                      setForm((current) => ({
                        ...current,
                        modo_compensacion: option,
                        asignacion_destino_id: "",
                      }));
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      form.modo_compensacion === option
                        ? "bg-[var(--color-surface-bright)] text-white"
                        : "text-[var(--primary-300)] hover:text-white"
                    }`}
                  >
                    {option === "bolsa" ? "Bolsa" : "Inmediata"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className={panelCardClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary-200)]">
                {form.tipo === "dia"
                  ? "Tus turnos (selecciona los dias que quieras)"
                  : "Selecciona tu semana para intercambio"}
              </p>
              <p className="mt-1 text-xs text-[var(--primary-400)]">
                {form.tipo === "dia"
                  ? "Selecciona primero una semana y luego elige tus dias." 
                  : "Selecciona una de tus semanas disponibles para intercambiar."}
              </p>

              <div className="mt-3">
                <WeekSelector
                  weeks={myWeekOptions}
                  selectedWeekId={selectedWeekId}
                  onChange={(weekId) => {
                    setShowSubmitTip(true);
                    setSelectedWeekId(weekId);
                  }}
                  label=""
                  formatOption={formatWeekSelectLabel}
                />
                {!selectedWeek && (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-500/60 dark:bg-red-900/35 dark:text-red-100">
                    No tienes una semana activa disponible.
                  </p>
                )}
              </div>

              {form.tipo === "dia" && (
                <div className="mt-2 space-y-2">
                  {filteredMyAssignments.length === 0 ? (
                    <p className="text-xs text-[var(--primary-400)]">
                      No tienes turnos disponibles en esta semana para intercambiar.
                    </p>
                  ) : (
                    filteredMyAssignments.map((assignment) => {
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
                    })
                  )}
                </div>
              )}

              {form.tipo === "dia" && selectedOriginIds.length > 0 && (
                <p className="mt-2 text-xs text-[var(--primary-300)]">
                  Seleccionados ({selectedOriginIds.length}): {selectedOriginAssignments.map((item) => item.dia).join(", ")}
                </p>
              )}
            </div>

            <div className={panelCardClass}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary-200)]">
                {selectedCompanion
                  ? `Turnos de ${selectedCompanion.nombre}`
                  : "Turnos del compañero seleccionado"}
              </p>

              <p className="mt-1 text-xs text-[var(--primary-400)]">
                {form.modo_compensacion === "inmediata"
                  ? form.tipo === "dia"
                    ? "Compensacion inmediata por dia: selecciona la misma cantidad de turnos tuyos y del companero."
                    : "Compensacion inmediata semanal: cada empleado usa su propia semana y se intercambia completa."
                  : "Compensacion bolsa: solo eliges tus turnos y se genera deuda para compensar despues."}
              </p>

              {isBolsaMode ? (
                <div className="mt-3 rounded-2xl border border-zinc-300 bg-zinc-100 px-4 py-4 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-100">
                  {companionBalanceLoadFailed && (
                    <p className="mt-2 text-[12px] font-semibold text-amber-700 dark:text-amber-300">
                      No se pudo refrescar el saldo individual ahora mismo. Mostrando el ultimo saldo disponible.
                    </p>
                  )}
                  <p className="font-semibold">Saldo actual: {formatBalanceText(bolsaCurrentOwed, bolsaCurrentDebt)}.</p>
                  <p className="mt-2 font-semibold">Saldo futuro: {formatBalanceText(bolsaFutureOwed, bolsaFutureDebt)}.</p>
                  <p className="mt-2 text-[13px] text-zinc-500 dark:text-zinc-400">Tu compañero recibe la solicitud y, si acepta, la deuda se refleja en la bolsa.</p>
                </div>
              ) : (
                <>
                  {form.receptor_id && (
                    <div className="glass-soft mt-2 p-2">
                      <WeekSelector
                        weeks={companionWeekOptions}
                        selectedWeekId={companionWeekId}
                        onChange={(weekId) => {
                          setShowSubmitTip(true);
                          setCompanionWeekId(weekId);
                        }}
                        label=""
                        formatOption={formatWeekSelectLabel}
                      />
                      {loadingCompanionWeeks && (
                        <p className="mt-1 text-xs text-[var(--primary-400)]">Cargando semanas del companero...</p>
                      )}
                    </div>
                  )}

                  <div className="mt-2 space-y-2">
                    {!form.receptor_id && (
                      <p className="text-xs text-[var(--primary-400)]">Selecciona un compañero para ver sus turnos.</p>
                    )}
                    {form.receptor_id && loadingCompanionAssignments && (
                      <p className="text-xs text-[var(--primary-400)]">Cargando turnos del compañero...</p>
                    )}
                    {form.receptor_id && !loadingCompanionAssignments && form.tipo === "dia" && destinationOptions.length === 0 && companionWeekOptions.length > 0 && (
                      <p className="text-xs text-[var(--primary-400)]">Este compañero no tiene turnos en la semana seleccionada.</p>
                    )}
                    {form.tipo === "dia"
                      ? destinationOptions.map((assignment) => {
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
                        })
                      : null}
                  </div>

                  {form.tipo === "dia" && selectedDestinationIds.length > 0 && (
                    <p className="mt-2 text-xs text-[var(--primary-300)]">
                      Destinos seleccionados ({selectedDestinationIds.length}): {selectedDestinationAssignments.map((item) => item.dia).join(", ")}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <label className="block text-sm text-[var(--primary-200)]">
            Motivo
            <textarea
              value={form.motivo}
              onChange={(event) => {
                setShowSubmitTip(true);
                setForm((current) => ({ ...current, motivo: event.target.value }));
              }}
              className={textAreaControlClass}
            />
          </label>

          <div className="grid items-center gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex flex-wrap gap-2 text-[11px] text-[var(--primary-400)]">
              <span className="glass-badge rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary-400)]">
                Tus dias: <span className="ml-1 text-[var(--primary-50)] font-bold">{selectedOriginCount}</span>
              </span>
              <span className="glass-badge rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary-400)]">
                Dias companero: <span className="ml-1 text-[var(--primary-50)] font-bold">{isBolsaMode ? "No aplica" : selectedDestinationCount}</span>
              </span>
              <span className="glass-badge rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary-400)]">
                Modo actual: <span className="ml-1 text-[var(--primary-50)] font-bold">{form.modo_compensacion}</span>
              </span>
            </div>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="glass-button glass-button-primary h-11 rounded-lg px-6 text-base font-semibold disabled:opacity-50"
            >
              {submitBusy ? "Enviando..." : "Enviar solicitud"}
            </button>
          </div>
          {visibleSubmitTip && (
            <NoticeBanner message={visibleSubmitTip} kind="warning" />
          )}
        </form>

        <div className="mt-3 space-y-2">
          <NoticeBanner message={error} kind="error" />
          <NoticeBanner message={notice} kind="success" />
        </div>
      </article>

      <article className="glass-card float-in space-y-5 p-5 md:p-6 xl:self-start">
        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-bold text-[color:var(--ink)]">Bolsa</h3>
            <p className="mt-1 text-xs text-[color:var(--ink-soft)]">
              Días que debemos y días que nos deben en tus intercambios.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedSummary((current) => (current === "owed" ? null : "owed"))}
                className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                  selectedSummary === "owed"
                    ? "bg-zinc-700 border-zinc-500 text-white shadow-sm"
                    : "bg-zinc-900/60 border border-zinc-700 text-zinc-100 hover:bg-zinc-800 hover:text-white"
                }`}
              >
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">Nos deben</p>
                <p className="mt-1 text-lg font-semibold">{owedDays} días</p>
              </button>
              <button
                type="button"
                onClick={() => setSelectedSummary((current) => (current === "debt" ? null : "debt"))}
                className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                  selectedSummary === "debt"
                    ? "bg-zinc-700 border-zinc-500 text-white shadow-sm"
                    : "bg-zinc-900/60 border border-zinc-700 text-zinc-100 hover:bg-zinc-800 hover:text-white"
                }`}
              >
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">Debemos</p>
                <p className="mt-1 text-lg font-semibold">{debtDays} días</p>
              </button>
            </div>
          </div>

          {selectedSummary === "owed" && (
            <div className="mt-4 rounded-2xl border border-zinc-300 bg-zinc-100 px-4 py-3 text-sm text-[color:var(--ink)] dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100">
              {owedByWorker.length === 0 ? (
                <p className="text-[color:var(--ink-soft)]">No hay trabajadores que nos deban días.</p>
              ) : (
                <div className="space-y-2">
                  {owedByWorker.map((entry) => (
                    <p key={entry.name} className="flex items-center justify-between gap-3 text-sm">
                      <span>{entry.name}</span>
                      <span className="font-semibold">{entry.days} días</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedSummary === "debt" && (
            <div className="mt-4 rounded-2xl border border-zinc-300 bg-zinc-100 px-4 py-3 text-sm text-[color:var(--ink)] dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100">
              {debtByWorker.length === 0 ? (
                <p className="text-[color:var(--ink-soft)]">No debes días a ningún trabajador.</p>
              ) : (
                <div className="space-y-2">
                  {debtByWorker.map((entry) => (
                    <p key={entry.name} className="flex items-center justify-between gap-3 text-sm">
                      <span>{entry.name}</span>
                      <span className="font-semibold">{entry.days} días</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

        <div className="inline-flex rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-1 text-sm">
          {(["recibidas", "enviadas"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSelectedExchangeTab(option)}
              className={`rounded-full px-4 py-2 font-semibold transition ${
                selectedExchangeTab === option
                  ? "bg-[var(--color-surface-bright)] text-white"
                  : "text-[var(--primary-300)] hover:text-white"
              }`}
            >
              {option === "recibidas" ? `Recibidas (${receivedCount})` : `Enviadas (${sentCount})`}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-3 max-h-[58vh] overflow-y-auto pr-1 xl:mt-4 xl:max-h-[calc(100dvh-14rem)]">
          {selectedExchangeTab === "recibidas" ? (
            <>
              {receivedDisplayItems.length === 0 && (
                <p className="text-sm text-[color:var(--ink-soft)]">No tienes solicitudes recibidas.</p>
              )}
              {receivedDisplayItems.map((entry) =>
                entry.kind === "group"
                  ? renderGroup(entry.group, "recibidas")
                  : renderRequestItem(entry.item, "recibidas"),
              )}
            </>
          ) : (
            <>
              {sentDisplayItems.length === 0 && (
                <p className="text-sm text-[color:var(--ink-soft)]">No has enviado solicitudes.</p>
              )}
              {sentDisplayItems.map((entry) =>
                entry.kind === "group"
                  ? renderGroup(entry.group, "enviadas")
                  : renderRequestItem(entry.item, "enviadas"),
              )}
            </>
          )}
        </div>
      </article>
    </section>
  );
};
