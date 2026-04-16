import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { api } from "../api";
import { NoticeBanner } from "../components/common/NoticeBanner";
import CustomSelect from "../components/common/CustomSelect";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import type {
  EstadoSemana,
  RolUsuario,
  Usuario,
  UsuarioCreatePayload,
  UsuarioUpdatePayload,
  Semana,
} from "../types";
import { asErrorMessage } from "../utils/formatters";

const roleOptions = [
  { value: "all", label: "Todos" },
  { value: "admin", label: "Admin" },
  { value: "supervisor", label: "Supervisor" },
  { value: "empleado", label: "Empleado" },
];

const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: (index + 1).toString(),
  label: new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, index, 1)),
  ),
}));

const stateOptions = [
  { value: "borrador", label: "Borrador" },
  { value: "publicado", label: "Publicado" },
];

export const AdminPage = () => {
  const { user } = useAuth();
  const { users, weeks, reloadAll } = useAppData();

  const isAdmin = user?.rol === "admin";
  const isSupervisor = user?.rol === "supervisor";
  const canManageUsers = isAdmin;
  const canGenerate = isAdmin || isSupervisor;
  const pageTitle = isSupervisor ? "Supervisión" : "Admin";

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [scopeMode, setScopeMode] = useState<"mes" | "anio">("mes");
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [month, setMonth] = useState<string>(`${new Date().getMonth() + 1}`);
  const [targetState, setTargetState] = useState<EstadoSemana>("borrador");
  const [strategy, setStrategy] = useState<"replace" | "skip">("replace");
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formSuccess, setFormSuccess] = useState("");
  const [generationBusy, setGenerationBusy] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [generationSummary, setGenerationSummary] = useState<null | { message: string; weeks: number }>(null);

  const activeUsers = users.filter((item) => item.activo);
  const employeeUsers = activeUsers.filter((item) => item.rol === "empleado");

  const filteredUsers = useMemo(() => {
    return activeUsers.filter((item) => {
      const matchesSearch = [item.nombre, item.email].some((value) =>
        value.toLowerCase().includes(searchTerm.toLowerCase()),
      );

      const matchesRole = roleFilter === "all" || item.rol === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [activeUsers, roleFilter, searchTerm]);

  const selectedWeeks = weeks;
  const weekSummary = `${selectedWeeks.length} semanas cargadas`;

  useEffect(() => {
    if (employeeUsers.length > 0 && selectedEmployeeIds.length === 0) {
      setSelectedEmployeeIds(employeeUsers.slice(0, 3).map((item) => item.id));
    }
  }, [employeeUsers.length]);

  const openCreateForm = () => {
    setEditingUser(null);
    setFormError("");
    setFormSuccess("");
    setUserFormOpen(true);
  };

  const openEditForm = (userToEdit: Usuario) => {
    setEditingUser(userToEdit);
    setFormError("");
    setFormSuccess("");
    setUserFormOpen(true);
  };

  const [userForm, setUserForm] = useState<{
    nombre: string;
    email: string;
    password: string;
    rol: RolUsuario;
    activo: boolean;
  }>({ nombre: "", email: "", password: "", rol: "empleado", activo: true });

  useEffect(() => {
    if (!userFormOpen) {
      setUserForm({ nombre: "", email: "", password: "", rol: "empleado", activo: true });
      setEditingUser(null);
    }
  }, [userFormOpen]);

  useEffect(() => {
    if (editingUser) {
      setUserForm({
        nombre: editingUser.nombre,
        email: editingUser.email,
        password: "",
        rol: editingUser.rol,
        activo: editingUser.activo,
      });
    }
  }, [editingUser]);

  const handleUserFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageUsers) return;

    setFormError("");
    setFormSuccess("");
    setFormBusy(true);

    try {
      const payload: UsuarioCreatePayload | UsuarioUpdatePayload = {
        nombre: userForm.nombre.trim(),
        email: userForm.email.trim().toLowerCase(),
        rol: userForm.rol,
        activo: userForm.activo,
      };

      if (!payload.nombre || !payload.email) {
        throw new Error("Nombre y email son obligatorios.");
      }

      if (editingUser) {
        if (userForm.password.trim()) {
          payload.password = userForm.password.trim();
        }
        await api.actualizarUsuario(editingUser.id, payload as UsuarioUpdatePayload);
        setFormSuccess("Usuario actualizado correctamente.");
      } else {
        if (!userForm.password.trim()) {
          throw new Error("La contraseña es obligatoria para nuevos usuarios.");
        }
        await api.crearUsuario(payload as UsuarioCreatePayload);
        setFormSuccess("Usuario creado correctamente.");
      }

      await reloadAll();
      setUserFormOpen(false);
    } catch (error) {
      setFormError(asErrorMessage(error));
    } finally {
      setFormBusy(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!canManageUsers) return;
    const confirmed = window.confirm("¿Eliminar este usuario? Esta acción no se puede deshacer.");
    if (!confirmed) return;

    try {
      await api.eliminarUsuario(userId);
      await reloadAll();
      setFormSuccess("Usuario eliminado.");
    } catch (error) {
      setFormError(asErrorMessage(error));
    }
  };

  const handleToggleEmployee = (employeeId: string) => {
    setSelectedEmployeeIds((current) => {
      if (current.includes(employeeId)) {
        return current.filter((item) => item !== employeeId);
      }
      return [...current, employeeId];
    });
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerationError("");
    setGenerationBusy(true);
    setGenerationSummary(null);

    try {
      if (selectedEmployeeIds.length < 1) {
        throw new Error("Selecciona al menos un empleado para generar.");
      }

      if (scopeMode === "mes") {
        const summary = await api.generarCalendarioMes({
          anio: Number(year),
          mes: Number(month),
          empleado_ids: selectedEmployeeIds,
          estado: targetState,
          estrategia_conflicto: strategy,
        });
        setGenerationSummary({
          message: `Generación mensual completada: ${summary.semanas_creadas} semanas creadas, ${summary.semanas_actualizadas} actualizadas.`,
          weeks: summary.semanas_objetivo,
        });
      } else {
        const summary = await api.generarCalendarioAnio({
          anio: Number(year),
          empleado_ids: selectedEmployeeIds,
          estado: targetState,
          estrategia_conflicto: strategy,
        });
        setGenerationSummary({
          message: `Generación anual completada: ${summary.semanas_creadas} semanas creadas, ${summary.semanas_actualizadas} actualizadas.`,
          weeks: summary.semanas_objetivo,
        });
      }

      await reloadAll();
    } catch (error) {
      setGenerationError(asErrorMessage(error));
    } finally {
      setGenerationBusy(false);
    }
  };

  const yearOptions = Array.from({ length: 5 }, (_, index) => {
    const currentYear = new Date().getFullYear() + index;
    return { value: currentYear.toString(), label: currentYear.toString() };
  });

  return (
    <div className="space-y-5">
      <header className="space-y-5">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--primary-400)]">{pageTitle}</p>
          <h1 className="text-3xl font-bold text-white">Gestión central</h1>
          <p className="text-sm leading-6 text-[var(--primary-300)]">
            Controla los trabajadores, supervisa el calendario y genera rotaciones desde un único panel.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
          <article className="panel p-3">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--primary-400)]">Usuarios</p>
            <p className="mt-3 text-3xl font-bold text-white">{activeUsers.length}</p>
            <p className="mt-2 text-sm text-[var(--primary-300)]">Trabajadores activos disponibles.</p>
          </article>

          <article className="panel p-3">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--primary-400)]">Semanas</p>
            <p className="mt-3 text-3xl font-bold text-white">{selectedWeeks.length}</p>
            <p className="mt-2 text-sm text-[var(--primary-300)]">Semanas cargadas en el sistema.</p>
          </article>
        </div>
      </header>

      <section className="glass-card float-in p-5">
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="glass-panel p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Gestionar trabajadores</h2>
              <p className="mt-1 text-sm text-[var(--primary-300)]">
                {canManageUsers
                  ? "Crea, edita y administra cuentas del equipo desde aquí."
                  : "Solo puedes ver los trabajadores. Pide a un admin cambios de roles o datos."}
              </p>
            </div>
            <button
              type="button"
              disabled={!canManageUsers}
              onClick={openCreateForm}
              className="glass-button rounded-xl px-4 py-2 text-sm font-semibold bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface-bright)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Nuevo trabajador
            </button>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar nombre o email"
              className="glass-input w-full px-4 py-3 text-sm"
            />
            <CustomSelect
              value={roleFilter}
              onChange={(value) => setRoleFilter(String(value))}
              options={roleOptions}
              placeholder="Filtrar rol"
            />
            <div className="rounded-xl border border-[var(--color-surface-border)] bg-[#121418] px-4 py-3 text-sm text-[var(--primary-300)]">
              {filteredUsers.length} resultados
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)]">
            <table className="min-w-[760px] text-left text-xs">
              <thead className="bg-white/5 text-[var(--primary-400)] uppercase tracking-[0.18em] text-[10px]">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.map((item) => (
                  <tr key={item.id} className="border-t border-white/5">
                    <td className="px-4 py-4 text-sm text-white">{item.nombre}</td>
                    <td className="px-4 py-4 text-sm text-[var(--primary-300)]">{item.email}</td>
                    <td className="px-4 py-4 text-sm uppercase tracking-[0.12em] text-[var(--primary-400)]">
                      {item.rol}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase ${
                          item.activo
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-rose-100 text-rose-900"
                        }`}
                      >
                        {item.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {canManageUsers ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(item)}
                            className="rounded-xl border border-[var(--color-surface-border)] px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-[var(--primary-100)] hover:bg-white/10"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(item.id)}
                            className="rounded-xl border border-rose-500 px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-rose-300 hover:bg-rose-500/10"
                          >
                            Eliminar
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs uppercase tracking-[0.18em] text-[var(--primary-500)]">
                          Solo lectura
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {userFormOpen && (
            <section className="mt-6 rounded-2xl border border-[var(--color-surface-border)] bg-[#0f1320] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">{editingUser ? "Editar trabajador" : "Nuevo trabajador"}</h3>
                  <p className="mt-1 text-sm text-[var(--primary-300)]">
                    {editingUser
                      ? "Actualiza el perfil y la información de acceso del trabajador."
                      : "Crea un nuevo trabajador que pueda aparecer en la generación de turnos."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setUserFormOpen(false)}
                  className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--primary-400)] hover:text-white"
                >
                  Cerrar
                </button>
              </div>

              <form onSubmit={handleUserFormSubmit} className="mt-6 space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="block text-sm text-[var(--primary-300)]">
                    Nombre
                    <input
                      value={userForm.nombre}
                      onChange={(event) => setUserForm((current) => ({ ...current, nombre: event.target.value }))}
                      required
                      className="glass-input mt-2 w-full rounded-xl px-4 py-3"
                    />
                  </label>

                  <label className="block text-sm text-[var(--primary-300)]">
                    Email
                    <input
                      type="email"
                      value={userForm.email}
                      onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
                      required
                      className="glass-input mt-2 w-full rounded-xl px-4 py-3"
                    />
                  </label>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <CustomSelect
                    value={userForm.rol}
                    onChange={(value) => setUserForm((current) => ({ ...current, rol: value as RolUsuario }))}
                    options={roleOptions.filter((item) => item.value !== "all")}
                    placeholder="Rol"
                  />
                  <label className="block text-sm text-[var(--primary-300)]">
                    Contraseña
                    <input
                      type="password"
                      value={userForm.password}
                      onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder={editingUser ? "Dejar vacío para no cambiar" : "mínimo 8 caracteres"}
                      className="glass-input mt-2 w-full rounded-xl px-4 py-3"
                    />
                  </label>
                  <label className="flex items-center gap-3 text-sm text-[var(--primary-300)]">
                    <input
                      type="checkbox"
                      checked={userForm.activo}
                      onChange={(event) => setUserForm((current) => ({ ...current, activo: event.target.checked }))}
                      className="h-4 w-4 rounded border-[var(--color-surface-border)] bg-[#121418] text-[var(--primary-400)] focus:ring-[var(--primary-500)]"
                    />
                    Activo
                  </label>
                </div>

                {formError && <NoticeBanner message={formError} kind="error" />}
                {formSuccess && <NoticeBanner message={formSuccess} kind="success" />}

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={formBusy}
                    className="glass-button rounded-xl px-5 py-3 font-semibold bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface-bright)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {formBusy ? "Guardando..." : editingUser ? "Actualizar" : "Crear usuario"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserFormOpen(false)}
                    className="rounded-xl border border-[var(--color-surface-border)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[var(--primary-300)] hover:bg-white/5"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>

        <aside className="glass-panel p-5">
          <div className="mb-6">
            <p className="text-sm uppercase tracking-[0.25em] text-[var(--primary-400)]">Generación</p>
            <h2 className="mt-3 text-2xl font-bold text-white">Rotación intuitiva</h2>
            <p className="mt-2 text-sm text-[var(--primary-300)]">
              Configura el alcance y las personas clave. El sistema generará la rotación para el equipo.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setScopeMode("mes")}
                className={`rounded-lg px-4 py-3 text-sm font-bold uppercase tracking-[0.15em] ${
                  scopeMode === "mes"
                    ? "bg-[var(--color-surface-bright)] text-white shadow-sm"
                    : "border border-[var(--color-surface-border)] text-[var(--primary-300)] hover:bg-[var(--color-surface-bright)]"
                }`}
              >
                Mensual
              </button>
              <button
                type="button"
                onClick={() => setScopeMode("anio")}
                className={`rounded-lg px-4 py-3 text-sm font-bold uppercase tracking-[0.15em] ${
                  scopeMode === "anio"
                    ? "bg-[var(--color-surface-bright)] text-white shadow-sm"
                    : "border border-[var(--color-surface-border)] text-[var(--primary-300)] hover:bg-[var(--color-surface-bright)]"
                }`}
              >
                Anual
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <CustomSelect
                value={year}
                onChange={(value) => setYear(String(value))}
                options={yearOptions}
                placeholder="Año"
              />
              {scopeMode === "mes" && (
                <CustomSelect
                  value={month}
                  onChange={(value) => setMonth(String(value))}
                  options={monthOptions}
                  placeholder="Mes"
                />
              )}
            </div>

            <CustomSelect
              value={targetState}
              onChange={(value) => setTargetState(value as EstadoSemana)}
              options={stateOptions}
              placeholder="Estado"
            />

            <div className="panel p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--primary-400)]">Equipo</p>
              <div className="mt-3 grid gap-3 max-h-52 overflow-auto">
                {employeeUsers.length > 0 ? (
                  employeeUsers.map((employee) => (
                    <button
                      key={employee.id}
                      type="button"
                      onClick={() => handleToggleEmployee(employee.id)}
                      className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                        selectedEmployeeIds.includes(employee.id)
                          ? "bg-[var(--color-surface-bright)] border-[var(--color-surface-border)] text-white shadow-sm"
                          : "bg-[var(--color-surface)] border-[var(--color-surface-border)] text-[var(--primary-300)] hover:border-white/20 hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span>{employee.nombre}</span>
                        {selectedEmployeeIds.includes(employee.id) && (
                          <span className="shrink-0 rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--primary-200)]">Seleccionado</span>
                        )}
                      </div>
                      <span className="mt-2 block text-[11px] text-[var(--primary-500)]">{employee.email}</span>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-[var(--primary-500)]">No hay empleados activos disponibles.</p>
                )}
              </div>
            </div>

            {!canGenerate && (
              <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-200">
                Los supervisores pueden revisar la configuración, pero solo los admins pueden lanzar generación.
              </div>
            )}

            {generationError && <NoticeBanner message={generationError} kind="error" />}
            {generationSummary && <NoticeBanner message={generationSummary.message} kind="success" />}

            <button
              type="button"
              disabled={!canGenerate || generationBusy}
              onClick={handleGenerate}
              className="glass-button w-full rounded-xl px-5 py-3 font-semibold bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface-bright)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generationBusy ? "Generando..." : "Generar rotación"}
            </button>

            <div className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--primary-300)]">
              <p className="font-bold text-white">Consejo</p>
              <p className="mt-2">
                Selecciona el alcance y al menos un empleado para ejecutar la rotación. Si eliges "Publicado", los cambios se harán visibles de inmediato.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </div>
  );
};
