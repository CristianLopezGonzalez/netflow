import { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";

import { useAuth } from "../../context/AuthContext";
import { useAppData } from "../../context/AppDataContext";

const commonLinks = [
  { to: "/calendario", label: "calendario" },
  { to: "/intercambios", label: "Intercambios" },
  { to: "/calendar", label: "Google Calendar" },
];

const GROUP_TOKEN_REGEX = /^\[#GRUPO:([^\]]+)\]\s*/;
const extractGroupId = (motivo: string): string | null => motivo.match(GROUP_TOKEN_REGEX)?.[1] ?? null;
const stripGroupToken = (motivo: string): string => motivo.replace(GROUP_TOKEN_REGEX, "").trim();

export const AppShell = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const {
    loading,
    lastError,
    clearLastError,
    intercambios,
    bolsaSaldos,
  } = useAppData();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([]);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const notificationsPanelRef = useRef<HTMLDivElement | null>(null);
  const [notificationsPanelPos, setNotificationsPanelPos] = useState<{ top: number; right: number } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);
  const [isMobileHeader, setIsMobileHeader] = useState(false);

  const pendingNotificationItems = useMemo(() => {
    const requests = intercambios.recibidas
      .filter((item) => item.estado === "pendiente" && !dismissedNotificationIds.includes(item.id));

    const grouped = new Map<string, (typeof requests)[number][]>();
    const entries: Array<{
      id: string;
      focusRequestId: string;
      request: (typeof requests)[number];
      requestCount: number;
      createdAt: string;
    }> = [];

    requests.forEach((item) => {
      const groupId = extractGroupId(item.motivo);
      if (!groupId) {
        entries.push({
          id: item.id,
          focusRequestId: item.id,
          request: item,
          requestCount: 1,
          createdAt: item.fecha_creacion,
        });
        return;
      }

      const current = grouped.get(groupId) ?? [];
      current.push(item);
      grouped.set(groupId, current);
    });

    grouped.forEach((items, groupId) => {
      const sortedByDate = [...items].sort((left, right) =>
        right.fecha_creacion.localeCompare(left.fecha_creacion),
      );
      const representative = sortedByDate[0];
      if (!representative) {
        return;
      }

      entries.push({
        id: `group-${groupId}`,
        focusRequestId: representative.id,
        request: representative,
        requestCount: sortedByDate.length,
        createdAt: representative.fecha_creacion,
      });
    });

    return entries.sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }, [dismissedNotificationIds, intercambios.recibidas]);

  const pendingReceivedCount = pendingNotificationItems.length;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const updateMobileHeader = () => setIsMobileHeader(mediaQuery.matches);

    updateMobileHeader();
    mediaQuery.addEventListener("change", updateMobileHeader);
    return () => mediaQuery.removeEventListener("change", updateMobileHeader);
  }, []);

  useEffect(() => {
    if (!isMobileHeader) {
      setMobileMenuOpen(false);
    }
  }, [isMobileHeader]);

  useEffect(() => {
    if (mobileMenuOpen) {
      setMobileMenuVisible(true);
      return;
    }

    if (!mobileMenuVisible) {
      return;
    }

    const timeout = window.setTimeout(() => setMobileMenuVisible(false), 260);
    return () => window.clearTimeout(timeout);
  }, [mobileMenuOpen, mobileMenuVisible]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!notificationsOpen) {
      setNotificationsPanelPos(null);
      return;
    }

    if (isMobileHeader) {
      setNotificationsPanelPos({ top: 0, right: 0 });
    }

    const updatePanelPosition = () => {
      if (isMobileHeader) {
        return;
      }

      if (!notificationsRef.current) {
        return;
      }

      const rect = notificationsRef.current.getBoundingClientRect();
      setNotificationsPanelPos({
        top: rect.bottom + 8,
        right: Math.max(window.innerWidth - rect.right, 8),
      });
    };

    updatePanelPosition();

    const onClickOutside = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      if (!notificationsRef.current || !notificationsPanelRef.current) {
        return;
      }

      if (notificationsRef.current.contains(targetNode) || notificationsPanelRef.current.contains(targetNode)) {
        return;
      }

      setNotificationsOpen(false);
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onEscape);
    if (!isMobileHeader) {
      updatePanelPosition();
      window.addEventListener("resize", updatePanelPosition);
      window.addEventListener("scroll", updatePanelPosition, true);
    }

    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onEscape);
      if (!isMobileHeader) {
        window.removeEventListener("resize", updatePanelPosition);
        window.removeEventListener("scroll", updatePanelPosition, true);
      }
    };
  }, [isMobileHeader, notificationsOpen]);

  useEffect(() => {
    const pendingIds = new Set(
      intercambios.recibidas
        .filter((item) => item.estado === "pendiente")
        .map((item) => item.id),
    );

    setDismissedNotificationIds((current) =>
      current.filter((requestId) => pendingIds.has(requestId)),
    );
  }, [intercambios.recibidas]);

  useEffect(() => {
    const onExchangeProcessed = (event: Event) => {
      const customEvent = event as CustomEvent<{ requestId?: string }>;
      const requestId = customEvent.detail?.requestId;
      if (!requestId) {
        return;
      }

      setDismissedNotificationIds((current) =>
        current.includes(requestId) ? current : [...current, requestId],
      );
    };

    window.addEventListener("netflow:exchange-processed", onExchangeProcessed as EventListener);
    return () => window.removeEventListener("netflow:exchange-processed", onExchangeProcessed as EventListener);
  }, []);

  const links =
    user?.rol === "admin" || user?.rol === "supervisor"
      ? [
          {
            to: "/admin",
            label: user?.rol === "supervisor" ? "Supervisión" : "Admin",
          },
          ...commonLinks,
        ]
      : commonLinks;

  const bolsaTotalMeDeben = bolsaSaldos.me_deben.reduce((sum, item) => sum + item.me_deben, 0);
  const bolsaTotalDebo = bolsaSaldos.debo.reduce((sum, item) => sum + item.debo, 0);

  const requestByUser = new Map<string, { me_deben: number; debo: number }>();

  const currentUserId = user?.id;
  if (currentUserId) {
    const applyNetDelta = (counterpartId: string, delta: number) => {
      const current = requestByUser.get(counterpartId) ?? { me_deben: 0, debo: 0 };
      const nextNet = current.me_deben - current.debo + delta;
      current.me_deben = Math.max(nextNet, 0);
      current.debo = Math.max(-nextNet, 0);
      requestByUser.set(counterpartId, current);
    };

    const processRequest = (item: (typeof intercambios.recibidas)[number]) => {
      if (item.estado !== "aceptada") {
        return;
      }

      const counterpartId = item.solicitante.id === currentUserId ? item.receptor.id : item.solicitante.id;
      const days = item.dias_estimados;
      if (days <= 0) {
        return;
      }

      if (item.es_compensacion) {
        const solicitanteEsDeudor = item.rol_solicitante_compensacion === "deudor";
        const deudorId = solicitanteEsDeudor ? item.solicitante.id : item.receptor.id;
        const acreedorId = solicitanteEsDeudor ? item.receptor.id : item.solicitante.id;

        if (currentUserId === deudorId) {
          applyNetDelta(counterpartId, days);
          return;
        }
        if (currentUserId === acreedorId) {
          applyNetDelta(counterpartId, -days);
        }
        return;
      }

      if (item.modo_compensacion !== "bolsa") {
        return;
      }

      if (currentUserId === item.solicitante.id) {
        applyNetDelta(counterpartId, -days);
        return;
      }
      if (currentUserId === item.receptor.id) {
        applyNetDelta(counterpartId, days);
      }
    };

    intercambios.recibidas.forEach(processRequest);
    intercambios.enviadas.forEach(processRequest);
  }

  let requestTotalMeDeben = 0;
  let requestTotalDebo = 0;

  requestByUser.forEach((entry) => {
    const net = entry.me_deben - entry.debo;
    if (net > 0) {
      requestTotalMeDeben += net;
      return;
    }
    requestTotalDebo += Math.abs(net);
  });

  const hasBolsaData =
    bolsaTotalMeDeben > 0
    || bolsaTotalDebo > 0
    || bolsaSaldos.detalles.some((item) => item.me_deben > 0 || item.debo > 0);

  const totalMeDeben = hasBolsaData ? bolsaTotalMeDeben : requestTotalMeDeben;
  const totalDebo = hasBolsaData ? bolsaTotalDebo : requestTotalDebo;
  const saldoNeto = totalMeDeben - totalDebo;

  return (
    <main className="min-h-screen w-full bg-[#121418]">
      <header className="sticky top-0 z-40 border-b border-[var(--color-surface-border)] bg-grey-900/95 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[1600px] px-3 py-2 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-8 w-8 overflow-hidden rounded-md">
                <img src="/logo.webp" alt="Logo" className="h-full w-full object-cover" />
              </div>
              <p className="hidden text-sm font-black uppercase tracking-widest text-[var(--primary-200)] sm:block">Netflow</p>
              <p className="hidden text-xs font-medium capitalize text-[var(--primary-300)] xl:block">
                {new Date().toLocaleDateString("es-ES", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>

            {!isMobileHeader && (
              <nav className="min-w-0 flex-1 overflow-x-auto px-2">
                <div className="flex min-w-max justify-center gap-1">
                  {links.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      className={({ isActive }) =>
                        cn(
                          "rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
                          isActive
                            ? "bg-white/10 text-white shadow-sm"
                            : "text-[var(--primary-300)] hover:bg-white/5 hover:text-white",
                        )
                      }
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              </nav>
            )}

            {!isMobileHeader ? (
              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                <div className="flex h-9 min-w-[6.5rem] items-center justify-center gap-2 rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 text-[var(--primary-300)]">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--primary-400)]">Bolsa</span>
                  <span
                    className={cn(
                      "text-xs font-bold",
                      saldoNeto > 0 ? "text-emerald-400" : saldoNeto < 0 ? "text-rose-400" : "text-white",
                    )}
                  >
                    {saldoNeto}d
                  </span>
                </div>

                <div ref={notificationsRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setNotificationsOpen((current) => !current);
                    }}
                    className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface)] text-[var(--primary-300)] transition-colors duration-200 hover:border-[var(--primary-500)] hover:text-white"
                    title="Notificaciones de solicitudes pendientes"
                    aria-label="Abrir notificaciones"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V10a6 6 0 1 0-12 0v4.2a2 2 0 0 1-.6 1.4L4 17h5" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.5 17a2.5 2.5 0 0 0 5 0" />
                    </svg>
                    {pendingReceivedCount > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black leading-4 text-white shadow-lg">
                        {pendingReceivedCount > 99 ? "99+" : pendingReceivedCount}
                      </span>
                    )}
                  </button>
                </div>

                <div className="hidden min-w-0 text-right sm:block">
                  <span className="block text-sm font-semibold leading-none text-white">{user?.nombre}</span>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-[var(--primary-400)]">{user?.rol}</p>
                </div>

                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-sm font-black text-white">
                  {user?.nombre?.charAt(0).toUpperCase()}
                </div>

                <button
                  onClick={logout}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface)] text-[var(--primary-300)] transition-colors duration-200 hover:border-[var(--primary-500)] hover:text-white"
                  title="Cerrar sesión"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="ml-auto flex items-center gap-2">
                <div className="flex h-9 min-w-[6.5rem] items-center justify-center gap-2 rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 text-[var(--primary-300)]">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--primary-400)]">Bolsa</span>
                  <span
                    className={cn(
                      "text-xs font-bold",
                      saldoNeto > 0 ? "text-emerald-400" : saldoNeto < 0 ? "text-rose-400" : "text-white",
                    )}
                  >
                    {saldoNeto}d
                  </span>
                </div>

                <div ref={notificationsRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setNotificationsOpen((current) => !current);
                    }}
                    className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface)] text-[var(--primary-300)] transition-colors duration-200 hover:border-[var(--primary-500)] hover:text-white"
                    title="Notificaciones de solicitudes pendientes"
                    aria-label="Abrir notificaciones"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V10a6 6 0 1 0-12 0v4.2a2 2 0 0 1-.6 1.4L4 17h5" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.5 17a2.5 2.5 0 0 0 5 0" />
                    </svg>
                    {pendingReceivedCount > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black leading-4 text-white shadow-lg">
                        {pendingReceivedCount > 99 ? "99+" : pendingReceivedCount}
                      </span>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (mobileMenuOpen) {
                      setMobileMenuOpen(false);
                      return;
                    }

                    setMobileMenuVisible(true);
                    window.requestAnimationFrame(() => setMobileMenuOpen(true));
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface)] text-[var(--primary-300)] transition hover:border-[var(--primary-500)] hover:text-white"
                  aria-label="Abrir menú"
                  aria-expanded={mobileMenuOpen}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {notificationsOpen && (isMobileHeader || notificationsPanelPos) && ReactDOM.createPortal(
        <div
          ref={notificationsPanelRef}
          className={cn(
            "fixed z-[90] rounded-2xl border border-[var(--color-surface-border)] p-4 shadow-2xl sm:p-5",
            isMobileHeader ? "left-2 right-2 top-[4.2rem] w-auto" : "w-[min(24rem,92vw)]",
          )}
          style={
            isMobileHeader
              ? {
                  backgroundColor: "rgba(18, 20, 24, 0.42)",
                  backdropFilter: "blur(24px) saturate(150%)",
                  WebkitBackdropFilter: "blur(24px) saturate(150%)",
                }
              : {
                  top: `${notificationsPanelPos?.top ?? 0}px`,
                  right: `${notificationsPanelPos?.right ?? 0}px`,
                  backgroundColor: "rgba(18, 20, 24, 0.34)",
                  backdropFilter: "blur(32px) saturate(160%)",
                  WebkitBackdropFilter: "blur(32px) saturate(160%)",
                }
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-white">Solicitudes pendientes</h3>
              <p className="mt-1 text-[11px] text-[var(--primary-300)]">
                {pendingReceivedCount === 0
                  ? "No tienes pendientes ahora mismo."
                  : `${pendingReceivedCount} solicitud(es) recibida(s).`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotificationsOpen(false)}
              className="rounded-full p-2 text-[var(--primary-300)] transition hover:text-white"
              aria-label="Cerrar notificaciones"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="mt-3 max-h-[52vh] space-y-2 overflow-y-auto pr-1">
            {pendingNotificationItems.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-white">Todo al día</p>
            ) : (
              pendingNotificationItems.map((entry) => {
                const item = entry.request;
                const cleanMotivo = stripGroupToken(item.motivo);
                const dayScope = item.tipo === "semana" ? "Semana completa" : `${entry.requestCount} día(s)`;
                const focusPayload = {
                  focusRequestId: entry.focusRequestId,
                  focusRequestSection: "recibidas" as const,
                  focusAt: Date.now(),
                };

                return (
                  <button
                    type="button"
                    key={entry.id}
                    onClick={() => {
                      setNotificationsOpen(false);
                      window.dispatchEvent(
                        new CustomEvent("netflow:focus-request", {
                          detail: focusPayload,
                        }),
                      );
                      navigate("/intercambios", {
                        state: focusPayload,
                      });
                    }}
                    className="w-full rounded-xl border border-[var(--color-surface-border)] bg-white/5 px-3 py-2.5 text-left transition backdrop-blur-sm hover:bg-white/10 hover:border-[var(--primary-500)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-white">{item.solicitante.nombre}</p>
                      <span className="rounded-full border border-zinc-500/60 bg-zinc-800/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-200">
                        {item.modo_compensacion === "bolsa" ? "Bolsa" : "Inmediata"}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--primary-300)]">
                      {dayScope} · {item.fecha_creacion.slice(0, 10)}
                    </p>
                    {cleanMotivo && (
                      <p className="mt-1 max-h-8 overflow-hidden text-[11px] text-[var(--primary-400)]">Motivo: {cleanMotivo}</p>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}

      {isMobileHeader && mobileMenuVisible && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[88]">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMobileMenuOpen(false)}
            className={cn(
              "absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto",
              mobileMenuOpen ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            className={cn(
              "absolute inset-y-0 right-0 z-10 flex h-full w-[min(84vw,28rem)] max-w-[26rem] flex-col border-l border-[var(--color-surface-border)] bg-grey-900/98 p-4 shadow-2xl transition-transform duration-300 ease-out backdrop-blur-xl",
              mobileMenuOpen ? "translate-x-0" : "translate-x-full",
            )}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-white">Menú</h3>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-full p-2 text-[var(--primary-300)] transition hover:text-white"
                aria-label="Cerrar menú"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <nav className="grid gap-2 overflow-y-auto pr-1">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors",
                      isActive
                        ? "bg-white/10 text-white shadow-sm"
                        : "text-[var(--primary-300)] hover:bg-white/5 hover:text-white",
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-none text-white">{user?.nombre}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-[var(--primary-400)]">{user?.rol}</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/10 text-sm font-black text-white">
                {user?.nombre?.charAt(0).toUpperCase()}
              </div>
            </div>

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                logout();
              }}
              className="mt-4 w-full rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--primary-300)] transition hover:bg-white/10 hover:text-white"
              title="Cerrar sesión"
            >
              Cerrar sesión
            </button>
          </div>
        </div>,
        document.body,
      )}

      <section className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6">
        {loading && (
          <div className="flex items-center gap-2 mb-4 animate-pulse">
            <div className="h-1 w-1 rounded-full bg-blue-400"></div>
            <p className="text-[9px] font-black uppercase text-[var(--primary-600)]">Sincronizando sistema...</p>
          </div>
        )}


        {lastError && (
          <div className="notice-banner notice-banner--error animate-fade-in">
            <span className="text-xs font-black uppercase tracking-tight">{lastError}</span>
            <button
              type="button"
              onClick={clearLastError}
              className="ml-auto bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-[9px] font-black uppercase"
            >
              Ignorar
            </button>
          </div>
        )}

        <Outlet />
      </section>
    </main>
  );
};
