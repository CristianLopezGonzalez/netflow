import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useAppData } from "../../context/AppDataContext";

const commonLinks = [
  { to: "/vistas", label: "Vistas" },
  { to: "/intercambios", label: "Intercambios" },
  { to: "/bolsa", label: "Bolsa de dias" },
  { to: "/calendar", label: "Google Calendar" },
];

export const AppShell = () => {
  const { user, logout } = useAuth();
  const {
    loading,
    lastError,
    clearLastError,
    reloadAll,
    weeks,
    myAssignments,
    intercambios,
    bolsaSaldos,
  } = useAppData();

  const links =
    user?.rol === "admin" || user?.rol === "supervisor"
      ? [{ to: "/generacion", label: "Generacion" }, ...commonLinks]
      : commonLinks;

  const pendientesRecibidas = intercambios.recibidas.filter((item) => item.estado === "pendiente").length;
  const pendientesEnviadas = intercambios.enviadas.filter((item) => item.estado === "pendiente").length;
  const totalMeDeben = bolsaSaldos.me_deben.reduce((sum, item) => sum + item.me_deben, 0);
  const totalDebo = bolsaSaldos.debo.reduce((sum, item) => sum + item.debo, 0);
  const saldoNeto = totalMeDeben - totalDebo;

  return (
    <main className="min-h-screen w-full">
      <header className="glass-topbar sticky top-0 z-40 w-full">
        <div className="flex w-full flex-col gap-3 px-3 py-3 md:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-4">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-[var(--color-surface-border)] shadow-xl">
                <img
                  src="/logo.webp"
                  alt="Netflow Logo"
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
                />
              </div>
              <div>
                <p className="mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--accent)]">Netflow</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-[color:var(--ink)] md:text-3xl">{user?.nombre}</h1>
                  <span className="glass-badge rounded-full px-2.5 py-1 text-xs font-semibold">
                    Rol: {user?.rol}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[color:var(--ink-soft)]">
                  Panel de turnos, intercambios y bolsa en una sola vista.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void reloadAll()}
                className="glass-button h-10 rounded-lg px-4 text-sm font-semibold"
              >
                Recargar datos
              </button>
              <button
                type="button"
                onClick={logout}
                className="glass-button glass-button-danger h-10 rounded-lg px-4 text-sm font-semibold"
              >
                Cerrar sesion
              </button>
            </div>
          </div>

          <nav className="glass-nav p-2">
            <div className="flex flex-wrap gap-2">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `glass-nav-link rounded-lg px-4 py-2.5 text-sm font-semibold ${isActive ? "glass-nav-link-active" : ""}`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </header>

      <section className="w-full space-y-4 px-3 py-4 md:px-6 lg:px-8">
        <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <article className="stat-card glass-interactive">
            <p className="stat-label">Semanas cargadas</p>
            <p className="stat-value">{weeks.length}</p>
          </article>
          <article className="stat-card glass-interactive">
            <p className="stat-label">Mis turnos registrados</p>
            <p className="stat-value">{myAssignments.length}</p>
          </article>
          <article className="stat-card glass-interactive">
            <p className="stat-label">Intercambios pendientes</p>
            <p className="stat-value text-amber-400">
              {pendientesRecibidas} <span className="text-[10px] opacity-60">recib.</span> · {pendientesEnviadas} <span className="text-[10px] opacity-60">env.</span>
            </p>
          </article>
          <article className="stat-card glass-interactive">
            <p className="stat-label">Saldo neto bolsa</p>
            <div className="flex items-baseline gap-2">
              <p
                className={`stat-value ${
                  saldoNeto > 0
                    ? "text-emerald-400"
                    : saldoNeto < 0
                      ? "text-rose-400"
                      : "text-[var(--primary-200)]"
                }`}
              >
                {saldoNeto > 0 ? `+${saldoNeto}` : saldoNeto} d
              </p>
              <p className="text-[10px] font-bold text-[var(--primary-500)]">
                ME DEBEN {totalMeDeben} · DEBO {totalDebo}
              </p>
            </div>
          </article>
        </section>

        {loading && (
          <div className="glass-panel px-4 py-3 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse"></div>
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--primary-400)]">
              Sincronizando informacion del servidor...
            </p>
          </div>
        )}

        {lastError && (
          <div className="notice-banner notice-banner--error flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm font-medium">{lastError}</span>
            <button
              type="button"
              onClick={clearLastError}
              className="glass-button h-8 rounded-lg px-3 text-[10px]"
            >
              Cerrar
            </button>
          </div>
        )}

        <Outlet />
      </section>
    </main>
  );
};
