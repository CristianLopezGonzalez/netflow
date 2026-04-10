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
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <p className="mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--accent)]">Netflow semanal</p>
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
          <article className="glass-card glass-interactive rounded-2xl px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-soft)]">Semanas cargadas</p>
            <p className="mt-1 text-2xl font-bold text-[color:var(--ink)]">{weeks.length}</p>
          </article>
          <article className="glass-card glass-interactive rounded-2xl px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-soft)]">Mis turnos</p>
            <p className="mt-1 text-2xl font-bold text-[color:var(--ink)]">{myAssignments.length}</p>
          </article>
          <article className="glass-card glass-interactive rounded-2xl px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-soft)]">Pendientes</p>
            <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">
              {pendientesRecibidas} recibidas · {pendientesEnviadas} enviadas
            </p>
          </article>
          <article className="glass-card glass-interactive rounded-2xl px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-soft)]">Saldo neto bolsa</p>
            <p
              className={`mt-1 text-2xl font-bold ${
                saldoNeto > 0
                  ? "text-emerald-700 dark:text-emerald-300"
                  : saldoNeto < 0
                    ? "text-rose-700 dark:text-rose-300"
                    : "text-slate-900 dark:text-slate-100"
              }`}
            >
              {saldoNeto > 0 ? `+${saldoNeto}` : saldoNeto} dia(s)
            </p>
            <p className="text-xs text-[color:var(--ink-soft)]">Me deben {totalMeDeben} · Debo {totalDebo}</p>
          </article>
        </section>

        {loading && (
          <p className="glass-panel px-4 py-3 text-sm font-medium text-[color:var(--ink-soft)]">
            Sincronizando informacion...
          </p>
        )}

        {lastError && (
          <div className="notice-banner notice-banner--error flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span>{lastError}</span>
            <button
              type="button"
              onClick={clearLastError}
              className="glass-button rounded-lg px-3 py-1.5 text-xs font-semibold"
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
