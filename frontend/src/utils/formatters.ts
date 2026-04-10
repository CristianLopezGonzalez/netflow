import axios from "axios";
import type { Asignacion, Semana } from "../types";

export const dayOrder = ["lunes", "martes", "miercoles", "jueves", "viernes"] as const;

const monthFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  timeZone: "UTC",
});

const parseIsoDate = (value: string): Date => {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day));
};

const formatIsoDate = (value: string, includeYear = false): string => {
  const date = parseIsoDate(value);
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const month = monthFormatter.format(date).replace(".", "").toLowerCase();
  const year = date.getUTCFullYear();
  return includeYear ? `${day} ${month} ${year}` : `${day} ${month}`;
};

const formatWeekRange = (startDateIso: string, endDateIso: string): string => {
  const start = parseIsoDate(startDateIso);
  const end = parseIsoDate(endDateIso);

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();

  if (sameYear && sameMonth) {
    const month = monthFormatter.format(start).replace(".", "").toLowerCase();
    return `del ${`${start.getUTCDate()}`.padStart(2, "0")} al ${`${end.getUTCDate()}`.padStart(2, "0")} de ${month} ${start.getUTCFullYear()}`;
  }

  if (sameYear) {
    return `del ${formatIsoDate(startDateIso)} al ${formatIsoDate(endDateIso, true)}`;
  }

  return `del ${formatIsoDate(startDateIso, true)} al ${formatIsoDate(endDateIso, true)}`;
};

export const formatWeek = (week: Semana): string =>
  `Semana ${week.numero_semana} · ${formatWeekRange(
    week.fecha_inicio_semana,
    week.fecha_fin_semana,
  )}`;

export const formatAssignment = (item: Asignacion): string =>
  `${item.dia.charAt(0).toUpperCase()}${item.dia.slice(1)} · ${item.hora_inicio.slice(0, 5)}-${item.hora_fin.slice(0, 5)}`;

const extractBackendError = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as Record<string, unknown>;

  const detail = data.detail;
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((item) => String(item)).join(" ");
  }

  const nonFieldErrors = data.non_field_errors;
  if (Array.isArray(nonFieldErrors) && nonFieldErrors.length > 0) {
    return nonFieldErrors.map((item) => String(item)).join(" ");
  }

  for (const [field, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.length > 0) {
      return `${field}: ${value.map((item) => String(item)).join(" ")}`;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return `${field}: ${value}`;
    }
  }

  return null;
};

export const asErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const backendError = extractBackendError(error.response?.data);
    if (backendError) {
      return backendError;
    }
    return error.message || "Error en la comunicacion con el servidor";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Ha ocurrido un error inesperado";
};
