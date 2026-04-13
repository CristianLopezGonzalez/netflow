import { NavLink, Outlet } from "react-router-dom";
import { cn } from "../../lib/utils";

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
      ? [
          {
            to: "/admin",
            label: user?.rol === "supervisor" ? "Supervisión" : "Admin",
          },
          ...commonLinks,
        ]
      : commonLinks;

  const pendientesRecibidas = intercambios.recibidas.filter((item) => item.estado === "pendiente").length;
  const pendientesEnviadas = intercambios.enviadas.filter((item) => item.estado === "pendiente").length;
  const totalMeDeben = bolsaSaldos.me_deben.reduce((sum, item) => sum + item.me_deben, 0);
  const totalDebo = bolsaSaldos.debo.reduce((sum, item) => sum + item.debo, 0);
  const saldoNeto = totalMeDeben - totalDebo;

  return (
    <main className="min-h-screen w-full bg-[#121418]">
      <header className="h-14 flex items-center justify-between px-6 border-b border-[var(--color-surface-border)] bg-grey-900 backdrop-blur-xl sticky top-0 z-40">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-md overflow-hidden">
                <img src="/logo.webp" alt="Logo" className="w-full h-full object-cover" />
             </div>
             <p className="text-sm font-black uppercase tracking-widest text-[var(--primary-200)] hidden md:block">Netflow</p>
          </div>
          
          <p className="text-xs text-[var(--primary-300)] font-medium capitalize hidden lg:block">
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          <nav className="flex items-center ml-4">
            <div className="flex gap-1">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    cn(
                      "px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors",
                      isActive 
                        ? "bg-white/10 text-white shadow-sm" 
                        : "text-[var(--primary-300)] hover:text-white hover:bg-white/5"
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {/* Header Stats Strip */}
          <div className="hidden xl:flex items-center gap-4 pr-4 border-r border-[var(--color-surface-border)]">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-black text-[var(--primary-400)]">Ptes:</span>
              <span className="text-xs font-bold text-amber-400">{pendientesRecibidas + pendientesEnviadas}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-black text-[var(--primary-400)]">Bolsa:</span>
              <span className={cn(
                "text-xs font-bold",
                saldoNeto > 0 ? "text-emerald-400" : saldoNeto < 0 ? "text-rose-400" : "text-white"
              )}>{saldoNeto}d</span>
            </div>
          </div>

          <div className="flex items-center gap-3 pl-3">
            <div className="text-right hidden sm:block">
              <span className="text-sm font-semibold text-white block leading-none">{user?.nombre}</span>
              <p className="text-[10px] text-[var(--primary-400)] uppercase font-black mt-1 tracking-wider">{user?.rol}</p>
            </div>
            <div className="w-8 h-8 rounded-md bg-white/10 border border-white/10 text-white flex items-center justify-center text-sm font-black">
              {user?.nombre?.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={logout}
              className="p-1.5 text-[var(--primary-400)] hover:text-white transition-colors"
              title="Cerrar sesión"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
      </header>

      <section className="w-full px-6 py-6 max-w-[1600px] mx-auto">
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
