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
} from "../types";
import { asErrorMessage } from "../utils/formatters";

const roleOptions = [
  { value: "all", label: "Todos" },
  { value: "admin", label: "Admin" },
  { value: "supervisor", label: "Supervisor" },
  { value: "empleado", label: "Empleado" },
];

const statusFilterOptions = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "inactive", label: "Inactivos" },
];

type UserStatusFilter = "all" | "active" | "inactive";

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

const initialUserForm: {
  nombre: string;
  email: string;
  password: string;
  rol: RolUsuario;
  activo: boolean;
} = {
  nombre: "",
  email: "",
  password: "",
  rol: "empleado",
  activo: true,
};

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
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [scopeMode, setScopeMode] = useState<"mes" | "anio">("mes");
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [month, setMonth] = useState<string>(`${new Date().getMonth() + 1}`);
  const [targetState, setTargetState] = useState<EstadoSemana>("borrador");
  const strategy: "replace" | "skip" = "replace";
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formSuccess, setFormSuccess] = useState("");
  const [generationBusy, setGenerationBusy] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [generationSummary, setGenerationSummary] = useState<null | { message: string; weeks: number }>(null);

  const [localUsers, setLocalUsers] = useState<Usuario[]>(users);

  useEffect(() => {
    setLocalUsers(users);
  }, [users]);

  const activeUsers = localUsers.filter((item) => item.activo);
  const employeeUsers = activeUsers.filter((item) => item.rol === "empleado");

  const filteredUsers = useMemo(() => {
    return localUsers.filter((item) => {
      const matchesSearch = [item.nombre, item.email].some((value) =>
        value.toLowerCase().includes(searchTerm.toLowerCase()),
      );

      const matchesRole = roleFilter === "all" || item.rol === roleFilter;
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
            ? item.activo
            : !item.activo;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [localUsers, roleFilter, searchTerm, statusFilter]);

  const selectedWeeks = weeks;
  useEffect(() => {
    if (employeeUsers.length > 0 && selectedEmployeeIds.length === 0) {
      setSelectedEmployeeIds(employeeUsers.slice(0, 3).map((item) => item.id));
    }
  }, [employeeUsers.length]);

  const openCreateForm = () => {
    setEditingUser(null);
    setFormError("");
    setFormSuccess("");
    setUserForm(initialUserForm);
    setUserFormOpen(true);
  };

  const openEditForm = (userToEdit: Usuario) => {
    setEditingUser(userToEdit);
    setFormError("");
    setFormSuccess("");
    setUserFormOpen(true);
  };

  const [userForm, setUserForm] = useState(initialUserForm);

  useEffect(() => {
    if (!userFormOpen) {
      setUserForm(initialUserForm);
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
      const normalizedEmail = userForm.email.trim().toLowerCase();
      const isEditingMode = Boolean(editingUser);

      const duplicateEmail = localUsers.find((item) => {
        const sameEmail = item.email.trim().toLowerCase() === normalizedEmail;
        if (!sameEmail) {
          return false;
        }
        if (isEditingMode) {
          return item.id !== editingUser?.id;
        }
        return true;
      });

      if (duplicateEmail) {
        throw new Error("Ya existe un usuario con este email.");
      }

      const payload: UsuarioCreatePayload | UsuarioUpdatePayload = {
        nombre: userForm.nombre.trim(),
        email: normalizedEmail,
        rol: userForm.rol,
        activo: userForm.activo,
      };

      if (!payload.nombre || !payload.email) {
        throw new Error("Nombre y email son obligatorios.");
      }

      if (isEditingMode && editingUser) {
        if (userForm.password.trim()) {
          payload.password = userForm.password.trim();
        }
        const updatedUser = await api.actualizarUsuario(editingUser.id, payload as UsuarioUpdatePayload);
        setLocalUsers((current) =>
          current.map((item) => (item.id === updatedUser.id ? updatedUser : item)),
        );
        setFormSuccess("Usuario actualizado correctamente.");
      } else {
        if (!userForm.password.trim()) {
          throw new Error("La contraseña es obligatoria para nuevos usuarios.");
        }
        payload.password = userForm.password.trim();
        const createdUser = await api.crearUsuario(payload as UsuarioCreatePayload);
        setLocalUsers((current) => {
          const next = [...current.filter((item) => item.id !== createdUser.id), createdUser];
          return next.sort((left, right) => left.nombre.localeCompare(right.nombre));
        });
        setFormSuccess("Usuario creado correctamente.");
      }

      await reloadAll();
      setUserForm(initialUserForm);
      setEditingUser(null);
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
      setLocalUsers((current) => current.filter((item) => item.id !== userId));
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
    <div className="space-y-4 md:space-y-5">
      <header className="space-y-4 md:space-y-5">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--primary-400)]">{pageTitle}</p>
          <h1 className="text-2xl font-bold text-white md:text-3xl">Gestión central</h1>
          <p className="text-sm leading-6 text-[var(--primary-300)]">
            Controla los trabajadores, supervisa el calendario y genera rotaciones desde un único panel.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:gap-4">
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

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-start xl:gap-6">
        <div className="glass-panel min-w-0 p-4 md:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Gestionar trabajadores</h2>
              <p className="mt-1 text-sm text-[var(--primary-300)]">
                {canManageUsers
                  ? "Crea, edita y administra cuentas del equipo desde aquí."
                  : "Solo puedes ver los trabajadores. Pide a un admin cambios de roles o datos."}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <button
                type="button"
                disabled={!canManageUsers}
                onClick={() => {
                  if (userFormOpen) {
                    setUserFormOpen(false);
                    return;
                  }
                  openCreateForm();
                }}
                className="glass-button w-full rounded-md px-4 py-2 text-sm font-semibold bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface-bright)] disabled:cursor-not-allowed disabled:opacity-50 md:hidden"
              >
                {userFormOpen ? "Ocultar solicitud" : "Nuevo trabajador"}
              </button>
            </div>
          </div>

          {canManageUsers && (
            <div className={`mt-5 ${userFormOpen ? "block" : "hidden"} border-t border-[var(--color-surface-border)] pt-4 space-y-4 md:block`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--primary-400)]">
                  {editingUser ? "Editando trabajador" : "Alta de trabajador"}
                </p>
                {editingUser && (
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="rounded-md border border-[var(--color-surface-border)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--primary-300)] transition hover:bg-white/5 hover:text-white"
                  >
                    Nuevo trabajador
                  </button>
                )}
              </div>

              <form onSubmit={handleUserFormSubmit} className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-sm text-[var(--primary-300)]">
                    Nombre
                    <input
                      value={userForm.nombre}
                      onChange={(event) => setUserForm((current) => ({ ...current, nombre: event.target.value }))}
                      required
                      className="glass-input mt-2 h-11 w-full rounded-md px-3"
                    />
                  </label>

                  <label className="block text-sm text-[var(--primary-300)]">
                    Email
                    <input
                      type="email"
                      value={userForm.email}
                      onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
                      required
                      className="glass-input mt-2 h-11 w-full rounded-md px-3"
                    />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="block text-sm text-[var(--primary-300)]">
                    Rol
                    <CustomSelect
                      value={userForm.rol}
                      onChange={(value) => setUserForm((current) => ({ ...current, rol: value as RolUsuario }))}
                      options={roleOptions.filter((item) => item.value !== "all")}
                      placeholder="Rol"
                      className="mt-2"
                      hSize="h-11"
                    />
                  </label>
                  <label className="block text-sm text-[var(--primary-300)]">
                    Contraseña
                    <input
                      type="password"
                      value={userForm.password}
                      onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder={editingUser ? "Dejar vacío para no cambiar" : "mínimo 8 caracteres"}
                      className="glass-input mt-2 h-11 w-full rounded-md px-3"
                    />
                  </label>
                  <label className="block text-sm text-[var(--primary-300)]">
                    Estado
                    <span className="mt-2 flex h-11 items-center gap-2 rounded-md border border-[var(--color-surface-border)] bg-[var(--color-background)] px-3">
                      <input
                        type="checkbox"
                        checked={userForm.activo}
                        onChange={(event) => setUserForm((current) => ({ ...current, activo: event.target.checked }))}
                        className="h-4 w-4 rounded-[3px] border-[var(--color-surface-border)] bg-[var(--color-background)] accent-[var(--primary-500)]"
                      />
                      <span className="font-semibold text-[var(--primary-200)]">Activo</span>
                    </span>
                  </label>
                </div>

                {formError && <NoticeBanner message={formError} kind="error" />}
                {formSuccess && <NoticeBanner message={formSuccess} kind="success" />}

                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap sm:gap-3">
                  <button
                    type="submit"
                    disabled={formBusy}
                    className="glass-button w-full rounded-md px-5 py-3 font-semibold bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface-bright)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {formBusy ? "Guardando..." : editingUser ? "Actualizar" : "Crear usuario"}
                  </button>
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="w-full rounded-md border border-[var(--color-surface-border)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[var(--primary-300)] hover:bg-white/5 sm:w-auto"
                  >
                    Limpiar
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="mt-6 border-t border-[var(--color-surface-border)] pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--primary-400)]">Listado de trabajadores</p>
            <p className="mt-1 text-sm text-[var(--primary-300)]">Filtra por nombre, email o rol para encontrar usuarios rápido.</p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="block text-sm text-[var(--primary-300)]">
              Buscar trabajador
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Nombre o email"
                className="glass-input mt-2 h-11 w-full rounded-md px-3 text-sm"
              />
            </label>
            <label className="block text-sm text-[var(--primary-300)]">
              Filtrar rol
              <CustomSelect
                value={roleFilter}
                onChange={(value) => setRoleFilter(String(value))}
                options={roleOptions}
                placeholder="Todos"
                className="mt-2"
                hSize="h-11"
              />
            </label>
            <label className="block text-sm text-[var(--primary-300)]">
              Filtrar estado
              <CustomSelect
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as UserStatusFilter)}
                options={statusFilterOptions}
                placeholder="Todos"
                className="mt-2"
                hSize="h-11"
              />
            </label>
          </div>

          <div className="mt-6 space-y-3 md:hidden">
            {filteredUsers.map((item) => (
              <article
                key={`mobile-${item.id}`}
                className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{item.nombre}</p>
                    <p className="mt-1 break-all text-xs text-[var(--primary-400)]">{item.email}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <span className="inline-flex rounded-full border border-[var(--color-surface-border)] bg-[var(--color-background)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--primary-300)]">
                      {item.rol}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                        item.activo
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-rose-100 text-rose-900"
                      }`}
                    >
                      {item.activo ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </div>

                {canManageUsers ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openEditForm(item)}
                      className="rounded-xl border border-[var(--color-surface-border)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--primary-100)] hover:bg-white/10"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(item.id)}
                      className="rounded-xl border border-rose-500 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-300 hover:bg-rose-500/10"
                    >
                      Eliminar
                    </button>
                  </div>
                ) : (
                  <p className="mt-4 text-xs uppercase tracking-[0.14em] text-[var(--primary-500)]">Solo lectura</p>
                )}
              </article>
            ))}

            {filteredUsers.length === 0 && (
              <p className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--primary-400)]">
                No hay resultados para los filtros actuales.
              </p>
            )}
          </div>

          <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] md:block">
            <table className="w-full min-w-[680px] text-left text-xs lg:min-w-[760px]">
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
        </div>

        <aside className="glass-panel min-w-0 p-4 md:p-5 xl:self-start">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">Rotación intuitiva</h2>
            <p className="mt-2 text-sm text-[var(--primary-300)]">
              Configura el alcance y las personas clave. El sistema generará la rotación para el equipo.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:gap-4">
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

            <div className="grid gap-4 sm:grid-cols-2">
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
              <div className="mt-3 space-y-2.5 max-h-64 overflow-y-auto pr-1">
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
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-[var(--primary-100)]">{employee.nombre}</span>
                        {selectedEmployeeIds.includes(employee.id) && (
                          <span className="shrink-0 rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--primary-200)]">Seleccionado</span>
                        )}
                      </div>
                      <span className="mt-2 block break-all text-[11px] text-[var(--primary-500)]">{employee.email}</span>
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
      </section>
  </div>
  );
};
