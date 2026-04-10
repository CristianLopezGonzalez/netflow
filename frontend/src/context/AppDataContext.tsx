/* eslint-disable react-refresh/only-export-components */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api } from "../api";
import type {
  Asignacion,
  BolsaMovimiento,
  BolsaSaldos,
  IntercambiosMios,
  Semana,
  Usuario,
} from "../types";
import { asErrorMessage } from "../utils/formatters";
import { useAuth } from "./AuthContext";

const emptyIntercambios: IntercambiosMios = { enviadas: [], recibidas: [] };
const emptySaldos: BolsaSaldos = { me_deben: [], debo: [], detalles: [] };

const getIsoYearWeek = (input = new Date()) => {
  const date = new Date(Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { isoYear, isoWeek };
};

interface AppDataContextValue {
  users: Usuario[];
  weeks: Semana[];
  selectedWeekId: string;
  weekAssignments: Asignacion[];
  myAssignments: Asignacion[];
  intercambios: IntercambiosMios;
  bolsaSaldos: BolsaSaldos;
  movements: BolsaMovimiento[];
  loading: boolean;
  lastError: string;
  setSelectedWeekId: (weekId: string) => void;
  reloadAll: () => Promise<void>;
  reloadIntercambios: () => Promise<void>;
  reloadWeekDetail: (weekId?: string) => Promise<void>;
  clearLastError: () => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export const AppDataProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();

  const [users, setUsers] = useState<Usuario[]>([]);
  const [weeks, setWeeks] = useState<Semana[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState("");
  const [weekAssignments, setWeekAssignments] = useState<Asignacion[]>([]);
  const [myAssignments, setMyAssignments] = useState<Asignacion[]>([]);
  const [intercambios, setIntercambios] = useState<IntercambiosMios>(emptyIntercambios);
  const [bolsaSaldos, setBolsaSaldos] = useState<BolsaSaldos>(emptySaldos);
  const [movements, setMovements] = useState<BolsaMovimiento[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState("");

  const clearLastError = useCallback(() => {
    setLastError("");
  }, []);

  const resetData = useCallback(() => {
    setUsers([]);
    setWeeks([]);
    setSelectedWeekId("");
    setWeekAssignments([]);
    setMyAssignments([]);
    setIntercambios(emptyIntercambios);
    setBolsaSaldos(emptySaldos);
    setMovements([]);
    setLastError("");
  }, []);

  const reloadAll = useCallback(async () => {
    if (!isAuthenticated) {
      resetData();
      return;
    }

    setLoading(true);
    setLastError("");

    try {
      const [usersData, weeksData, myData, exchangesData, saldosData, movementsData] =
        await Promise.all([
          api.usuariosActivos(),
          api.semanas(),
          api.misAsignaciones(),
          api.intercambiosMios(),
          api.bolsaSaldos(),
          api.bolsaMovimientos(),
        ]);

      setUsers(usersData);
      setWeeks(weeksData);
      setMyAssignments(myData);
      setIntercambios(exchangesData);
      setBolsaSaldos(saldosData);
      setMovements(movementsData);

      setSelectedWeekId((current) => {
        if (current && weeksData.some((week) => week.id === current)) {
          return current;
        }

        const { isoYear, isoWeek } = getIsoYearWeek();
        const currentWeek = weeksData.find(
          (week) => week.anio === isoYear && week.numero_semana === isoWeek,
        );
        if (currentWeek) {
          return currentWeek.id;
        }

        return weeksData[0]?.id ?? "";
      });
    } catch (error) {
      setLastError(asErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, resetData]);

  const reloadIntercambios = useCallback(async () => {
    if (!isAuthenticated) {
      setIntercambios(emptyIntercambios);
      return;
    }

    try {
      const exchangesData = await api.intercambiosMios();
      setIntercambios(exchangesData);
    } catch (error) {
      setLastError(asErrorMessage(error));
    }
  }, [isAuthenticated]);

  const reloadWeekDetail = useCallback(
    async (weekId?: string) => {
      const targetWeekId = weekId ?? selectedWeekId;
      if (!isAuthenticated || !targetWeekId) {
        setWeekAssignments([]);
        return;
      }

      try {
        const detail = await api.semanaDetalle(targetWeekId);
        setWeekAssignments(detail.asignaciones);
      } catch (error) {
        setLastError(asErrorMessage(error));
      }
    },
    [isAuthenticated, selectedWeekId],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      resetData();
      return;
    }
    void reloadAll();
  }, [isAuthenticated, reloadAll, resetData]);

  useEffect(() => {
    if (!isAuthenticated || !selectedWeekId) {
      setWeekAssignments([]);
      return;
    }
    void reloadWeekDetail(selectedWeekId);
  }, [isAuthenticated, reloadWeekDetail, selectedWeekId]);

  const value = useMemo<AppDataContextValue>(
    () => ({
      users,
      weeks,
      selectedWeekId,
      weekAssignments,
      myAssignments,
      intercambios,
      bolsaSaldos,
      movements,
      loading,
      lastError,
      setSelectedWeekId,
      reloadAll,
      reloadIntercambios,
      reloadWeekDetail,
      clearLastError,
    }),
    [
      bolsaSaldos,
      clearLastError,
      intercambios,
      lastError,
      loading,
      movements,
      myAssignments,
      reloadAll,
      reloadIntercambios,
      reloadWeekDetail,
      selectedWeekId,
      users,
      weekAssignments,
      weeks,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};

export const useAppData = (): AppDataContextValue => {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("useAppData debe usarse dentro de AppDataProvider");
  }
  return context;
};
