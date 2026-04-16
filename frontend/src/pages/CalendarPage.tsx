import { useState } from "react";
import type { FormEvent } from "react";

import { api } from "../api";
import { NoticeBanner } from "../components/common/NoticeBanner";
import { WeekSelector } from "../components/common/WeekSelector";
import { useAppData } from "../context/AppDataContext";
import { asErrorMessage } from "../utils/formatters";

export const CalendarPage = () => {
  const { weeks, selectedWeekId, setSelectedWeekId } = useAppData();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [callbackForm, setCallbackForm] = useState({ code: "", state: "" });

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await action();
    } catch (actionError) {
      setError(asErrorMessage(actionError));
    } finally {
      setBusy(false);
    }
  };

  const connectGoogle = async () => {
    await runAction(async () => {
      const data = await api.googleConnectUrl();
      window.open(data.url, "_blank", "noopener,noreferrer");
      setNotice("Se abrio la URL de conexion con Google.");
    });
  };

  const handleGoogleCallback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!callbackForm.code) {
      setError("Debes indicar el code devuelto por Google.");
      return;
    }

    await runAction(async () => {
      await api.googleCallback({
        code: callbackForm.code,
        state: callbackForm.state || undefined,
      });
      setNotice("Google Calendar conectado correctamente.");
      setCallbackForm({ code: "", state: "" });
    });
  };

  const syncSelectedWeek = async () => {
    if (!selectedWeekId) {
      setError("No hay semana seleccionada para sincronizar.");
      return;
    }

    await runAction(async () => {
      const data = await api.googleSyncWeek(selectedWeekId);
      setNotice(`${data.message} Eventos sincronizados: ${data.synced}`);
    });
  };

  const syncAll = async () => {
    await runAction(async () => {
      const data = await api.googleSyncMe();
      setNotice(`${data.message} Total: ${data.synced}`);
    });
  };

  const disconnectCalendar = async () => {
    await runAction(async () => {
      await api.googleDisconnect();
      setNotice("Integracion con Google desconectada.");
    });
  };

  return (
    <section className="glass-card float-in space-y-4 p-5">
      <h2 className="text-xl font-bold">Google Calendar</h2>
      <p className="text-sm text-[var(--primary-400)]">
        Conecta tu cuenta para crear y actualizar eventos de turno automaticamente al aceptar
        intercambios.
      </p>

      <div className="max-w-md">
        <WeekSelector
          weeks={weeks}
          selectedWeekId={selectedWeekId}
          onChange={setSelectedWeekId}
          label="Semana para sync puntual"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void connectGoogle()}
          disabled={busy}
          className="glass-button glass-button-strong rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Conectar Google
        </button>
        <button
          type="button"
          onClick={() => void syncSelectedWeek()}
          disabled={busy}
          className="glass-button rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Sync semana seleccionada
        </button>
        <button
          type="button"
          onClick={() => void syncAll()}
          disabled={busy}
          className="glass-button rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Sync todo
        </button>
        <button
          type="button"
          onClick={() => void disconnectCalendar()}
          disabled={busy}
          className="glass-button glass-button-danger rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Desconectar
        </button>
      </div>

      <form onSubmit={handleGoogleCallback} className="glass-panel grid gap-3 p-4 md:grid-cols-2">
        <label className="block text-sm text-[var(--primary-300)]">
          Code OAuth
          <input
            value={callbackForm.code}
            onChange={(event) =>
              setCallbackForm((current) => ({ ...current, code: event.target.value }))
            }
            className="glass-input mt-1 w-full rounded-lg px-3 py-2"
            placeholder="Pega aqui el code"
            required
          />
        </label>

        <label className="block text-sm text-[var(--primary-300)]">
          State (opcional)
          <input
            value={callbackForm.state}
            onChange={(event) =>
              setCallbackForm((current) => ({ ...current, state: event.target.value }))
            }
            className="glass-input mt-1 w-full rounded-lg px-3 py-2"
            placeholder="State OAuth"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="glass-button glass-button-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 md:col-span-2 md:justify-self-start"
        >
          Confirmar callback
        </button>
      </form>

      <div className="space-y-2">
        <NoticeBanner message={error} kind="error" />
        <NoticeBanner message={notice} kind="success" />
      </div>
    </section>
  );
};
