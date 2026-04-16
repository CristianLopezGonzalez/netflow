import axios from "axios";

import { API_BASE, http } from "./lib/http";
import type {
  Asignacion,
  AsignacionCreatePayload,
  AsignacionUpdatePayload,
  AuthTokens,
  BolsaSaldoCompanero,
  DireccionCompensacion,
  BolsaMovimiento,
  BolsaSaldos,
  GeneracionCalendarioResumen,
  GenerarCalendarioAnioPayload,
  GenerarCalendarioMesPayload,
  IntercambiosMios,
  Semana,
  SemanaCreatePayload,
  SemanaDetalle,
  SolicitudIntercambio,
  SemanaRotacionResumen,
  TipoIntercambio,
  Usuario,
  UsuarioCreatePayload,
  UsuarioUpdatePayload,
} from "./types";

const authHttp = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

export const api = {
  async register(payload: {
    nombre: string;
    email: string;
    password: string;
  }): Promise<Usuario> {
    const response = await authHttp.post<Usuario>("/auth/register", payload);
    return response.data;
  },

  async login(email: string, password: string): Promise<AuthTokens> {
    const response = await authHttp.post<AuthTokens>("/auth/login", { email, password });
    return response.data;
  },

  async me(): Promise<Usuario> {
    const response = await http.get<Usuario>("/auth/me");
    return response.data;
  },

  async usuariosActivos(): Promise<Usuario[]> {
    const response = await http.get<Usuario[]>("/usuarios");
    return response.data;
  },

  async usuarios(): Promise<Usuario[]> {
    const response = await http.get<Usuario[]>("/usuarios");
    return response.data;
  },

  async usuario(id: string): Promise<Usuario> {
    const response = await http.get<Usuario>(`/usuarios/${id}`);
    return response.data;
  },

  async crearUsuario(payload: UsuarioCreatePayload): Promise<Usuario> {
    const response = await http.post<Usuario>("/usuarios", payload);
    return response.data;
  },

  async actualizarUsuario(id: string, payload: UsuarioUpdatePayload): Promise<Usuario> {
    const response = await http.patch<Usuario>(`/usuarios/${id}`, payload);
    return response.data;
  },

  async eliminarUsuario(id: string): Promise<void> {
    await http.delete(`/usuarios/${id}`);
  },

  async eliminarUsuarioDefinitivo(id: string): Promise<void> {
    await http.delete(`/usuarios/${id}?modo=eliminar`);
  },

  async semanas(): Promise<Semana[]> {
    const response = await http.get<Semana[]>("/semanas");
    return response.data;
  },

  async semanasRotacion(): Promise<SemanaRotacionResumen[]> {
    const response = await http.get<SemanaRotacionResumen[]>("/semanas/rotacion");
    return response.data;
  },

  async crearSemana(payload: SemanaCreatePayload): Promise<Semana> {
    const response = await http.post<Semana>("/semanas", payload);
    return response.data;
  },

  async generarCalendarioMes(
    payload: GenerarCalendarioMesPayload,
  ): Promise<GeneracionCalendarioResumen> {
    const response = await http.post<GeneracionCalendarioResumen>("/semanas/generar-mes", payload);
    return response.data;
  },

  async generarCalendarioAnio(
    payload: GenerarCalendarioAnioPayload,
  ): Promise<GeneracionCalendarioResumen> {
    const response = await http.post<GeneracionCalendarioResumen>("/semanas/generar-anio", payload);
    return response.data;
  },

  async semanaDetalle(id: string): Promise<SemanaDetalle> {
    const response = await http.get<SemanaDetalle>(`/semanas/${id}`);
    return response.data;
  },

  async publicarSemana(id: string): Promise<{ detail: string }> {
    const response = await http.post<{ detail: string }>(`/semanas/${id}/publicar`);
    return response.data;
  },

  async misAsignaciones(semanaId?: string): Promise<Asignacion[]> {
    const query = semanaId ? `?semana_id=${semanaId}` : "";
    const response = await http.get<Asignacion[]>(`/asignaciones-tarde/mias${query}`);
    return response.data;
  },

  async crearAsignacion(payload: AsignacionCreatePayload): Promise<Asignacion> {
    const response = await http.post<Asignacion>("/asignaciones-tarde", payload);
    return response.data;
  },

  async actualizarAsignacion(
    id: string,
    payload: AsignacionUpdatePayload,
  ): Promise<Asignacion> {
    const response = await http.patch<Asignacion>(`/asignaciones-tarde/${id}`, payload);
    return response.data;
  },

  async eliminarAsignacion(id: string): Promise<void> {
    await http.delete(`/asignaciones-tarde/${id}`);
  },

  async crearIntercambio(payload: {
    receptor_id: string;
    tipo: TipoIntercambio;
    asignacion_origen_id?: string;
    asignacion_origen_ids?: string[];
    asignacion_destino_id?: string;
    asignacion_destino_ids?: string[];
    motivo: string;
    modo_compensacion: "inmediata" | "bolsa";
  }): Promise<SolicitudIntercambio> {
    const response = await http.post<SolicitudIntercambio>("/intercambios", payload);
    return response.data;
  },

  async intercambiosMios(): Promise<IntercambiosMios> {
    const response = await http.get<IntercambiosMios>("/intercambios/mias");
    return response.data;
  },

  async aceptarIntercambio(id: string): Promise<{ detail: string }> {
    const response = await http.post<{ detail: string }>(`/intercambios/${id}/aceptar`);
    return response.data;
  },

  async rechazarIntercambio(id: string): Promise<{ detail: string }> {
    const response = await http.post<{ detail: string }>(`/intercambios/${id}/rechazar`);
    return response.data;
  },

  async cancelarIntercambio(id: string): Promise<{ detail: string }> {
    const response = await http.post<{ detail: string }>(`/intercambios/${id}/cancelar`);
    return response.data;
  },

  async bolsaSaldos(): Promise<BolsaSaldos> {
    const response = await http.get<BolsaSaldos>("/bolsa/saldos");
    return response.data;
  },

  async bolsaSaldoUsuario(usuarioId: string): Promise<BolsaSaldoCompanero> {
    const response = await http.get<BolsaSaldoCompanero>(`/bolsa/saldos/${usuarioId}`);
    return response.data;
  },

  async bolsaMovimientos(): Promise<BolsaMovimiento[]> {
    const response = await http.get<BolsaMovimiento[]>("/bolsa/movimientos");
    return response.data;
  },

  async compensarBolsa(payload: {
    usuario_id: string;
    direccion: DireccionCompensacion;
    tipo: TipoIntercambio;
    asignacion_origen_id?: string;
    asignacion_origen_ids?: string[];
    motivo: string;
  }): Promise<SolicitudIntercambio> {
    const response = await http.post<SolicitudIntercambio>("/bolsa/compensar", payload);
    return response.data;
  },

  async googleConnectUrl(): Promise<{ url: string }> {
    const response = await http.get<{ url: string }>("/calendar/google/connect-url");
    return response.data;
  },

  async googleCallback(payload: { code: string; state?: string }): Promise<{ detail: string }> {
    const response = await http.post<{ detail: string }>("/calendar/google/callback", payload);
    return response.data;
  },

  async googleSyncWeek(weekId: string): Promise<{ synced: number; message: string }> {
    const response = await http.post<{ synced: number; message: string }>(
      `/calendar/google/sync/semana/${weekId}`,
    );
    return response.data;
  },

  async googleSyncMe(): Promise<{ synced: number; message: string }> {
    const response = await http.post<{ synced: number; message: string }>("/calendar/google/sync/me");
    return response.data;
  },

  async googleDisconnect(): Promise<{ detail: string }> {
    const response = await http.delete<{ detail: string }>("/calendar/google/disconnect");
    return response.data;
  },
};
