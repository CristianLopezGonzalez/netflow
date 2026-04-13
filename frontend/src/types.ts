export type RolUsuario = "admin" | "supervisor" | "empleado";
export type EstadoSemana = "borrador" | "publicado";
export type DiaSemana = "lunes" | "martes" | "miercoles" | "jueves" | "viernes";
export type EstadoSolicitud = "pendiente" | "aceptada" | "rechazada" | "cancelada";
export type TipoIntercambio = "dia" | "semana";
export type ModoCompensacion = "inmediata" | "bolsa";
export type DireccionCompensacion = "cobrar" | "devolver";
export type EstrategiaConflicto = "skip" | "replace";

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  activo: boolean;
}

export interface UsuarioCreatePayload {
  nombre: string;
  email: string;
  password: string;
  rol: RolUsuario;
  activo: boolean;
}

export interface UsuarioUpdatePayload {
  nombre?: string;
  email?: string;
  password?: string;
  rol?: RolUsuario;
  activo?: boolean;
}

export interface Semana {
  id: string;
  anio: number;
  numero_semana: number;
  fecha_inicio_semana: string;
  fecha_fin_semana: string;
  estado: EstadoSemana;
}
  fecha_inicio_semana: string;
  fecha_fin_semana: string;
  estado: EstadoSemana;
}

export interface SemanaCreatePayload {
  anio: number;
  numero_semana: number;
  fecha_inicio_semana: string;
  fecha_fin_semana: string;
  estado: EstadoSemana;
}

export interface GenerarCalendarioMesPayload {
  anio: number;
  mes: number;
  empleado_ids: string[];
  estado: EstadoSemana;
  estrategia_conflicto: EstrategiaConflicto;
}

export interface GenerarCalendarioAnioPayload {
  anio: number;
  empleado_ids: string[];
  estado: EstadoSemana;
  estrategia_conflicto: EstrategiaConflicto;
}

export interface GeneracionSemanaDetalle {
  semana_id: string;
  anio: number;
  numero_semana: number;
  empleado_id: string;
  empleado_nombre: string;
  accion: "creada" | "actualizada" | "existente";
}

export interface GeneracionConflicto {
  semana_id: string;
  anio: number;
  numero_semana: number;
  dia: DiaSemana;
  motivo: string;
}

export interface GeneracionCalendarioResumen {
  tipo: "mes" | "anio";
  anio_solicitado: number;
  mes?: number;
  semanas_objetivo: number;
  semanas_creadas: number;
  semanas_existentes: number;
  semanas_actualizadas: number;
  asignaciones_creadas: number;
  asignaciones_reemplazadas: number;
  asignaciones_omitidas: number;
  conflictos: GeneracionConflicto[];
  semanas_detalle: GeneracionSemanaDetalle[];
}

export interface SemanaRotacionEmpleadoResumen {
  usuario_id: string;
  usuario_nombre: string;
  total_dias: number;
}

export interface SemanaRotacionDiaUsuarioResumen {
  usuario_id: string;
  usuario_nombre: string;
  total_turnos: number;
}

export interface SemanaRotacionDiaResumen {
  dia: DiaSemana;
  usuario_id: string | null;
  usuario_nombre: string | null;
  usuarios: SemanaRotacionDiaUsuarioResumen[];
}

export interface SemanaRotacionResumen {
  semana_id: string;
  anio: number;
  numero_semana: number;
  fecha_inicio_semana: string;
  fecha_fin_semana: string;
  principal_usuario_id: string | null;
  principal_usuario_nombre: string | null;
  principal_total_dias: number;
  empleados: SemanaRotacionEmpleadoResumen[];
  dias: SemanaRotacionDiaResumen[];
}

export interface Asignacion {
  id: string;
  semana: string;
  usuario: string;
  usuario_detalle?: Usuario;
  dia: DiaSemana;
  hora_inicio: string;
  hora_fin: string;
  estado: "asignado" | "intercambiado";
  google_event_id?: string;
}

export interface AsignacionCreatePayload {
  semana: string;
  usuario: string;
  dia: DiaSemana;
  hora_inicio: string;
  hora_fin: string;
  estado?: "asignado" | "intercambiado";
}

export interface AsignacionUpdatePayload {
  usuario?: string;
  dia?: DiaSemana;
  hora_inicio?: string;
  hora_fin?: string;
  estado?: "asignado" | "intercambiado";
}

export interface SemanaDetalle extends Semana {
  asignaciones: Asignacion[];
}

export interface SolicitudIntercambio {
  id: string;
  solicitante: Usuario;
  receptor: Usuario;
  tipo: TipoIntercambio;
  asignacion_origen: Asignacion;
  asignacion_destino: Asignacion | null;
  motivo: string;
  modo_compensacion: ModoCompensacion;
  estado: EstadoSolicitud;
  es_compensacion: boolean;
  dias_estimados: number;
  fecha_creacion: string;
  fecha_respuesta: string | null;
}

export interface IntercambiosMios {
  enviadas: SolicitudIntercambio[];
  recibidas: SolicitudIntercambio[];
}

export interface BolsaUsuarioSaldo {
  usuario: Usuario;
  me_deben: number;
  debo: number;
}

export interface BolsaSaldos {
  me_deben: BolsaUsuarioSaldo[];
  debo: BolsaUsuarioSaldo[];
  detalles: BolsaUsuarioSaldo[];
}

export interface BolsaSaldoCompanero {
  usuario?: Usuario;
  usuario_id?: string;
  me_deben: number;
  debo: number;
}

export interface BolsaMovimiento {
  id: string;
  origen_usuario: Usuario;
  destino_usuario: Usuario;
  dias: number;
  tipo: "genera_deuda" | "compensa_deuda";
  solicitud_intercambio: string | null;
  fecha: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}
