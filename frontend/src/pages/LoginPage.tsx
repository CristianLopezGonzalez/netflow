import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { NoticeBanner } from "../components/common/NoticeBanner";
import { useAuth } from "../context/AuthContext";
import { asErrorMessage } from "../utils/formatters";

type AuthMode = "login" | "register";

export const LoginPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, login, register } = useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [form, setForm] = useState({ nombre: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/calendario", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (mode === "register") {
        await register({
          nombre: form.nombre,
          email: form.email,
          password: form.password,
        });
      }

      await login(form.email, form.password);
      navigate("/calendario", { replace: true });
    } catch (submitError) {
      setError(asErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10">
      <section className="glass-card float-in w-full max-w-xl p-8 md:p-10">
        <p className="mono text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">Netflow</p>
        <h1 className="gradient-title mt-3 text-4xl font-bold md:text-5xl">Gestor de turno de tarde</h1>
        <p className="mt-3 text-sm text-slate-600 md:text-base">
          Controla quien cubre cada tarde, valida intercambios entre companeros y lleva el saldo de
          bolsa de dias.
        </p>

        <div className="glass-segment mt-7 inline-flex rounded-xl p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              mode === "login" ? "glass-segment-button-active" : "glass-segment-button"
            }`}
          >
            Iniciar sesion
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              mode === "register" ? "glass-segment-button-active" : "glass-segment-button"
            }`}
          >
            Crear cuenta
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {mode === "register" && (
            <label className="block text-sm font-medium text-slate-700">
              Nombre
              <input
                value={form.nombre}
                onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))}
                required
                className="glass-input mt-1 w-full rounded-xl px-3 py-2"
              />
            </label>
          )}

          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
              className="glass-input mt-1 w-full rounded-xl px-3 py-2"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              required
              className="glass-input mt-1 w-full rounded-xl px-3 py-2"
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="glass-button glass-button-primary w-full rounded-xl px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Procesando..." : mode === "login" ? "Entrar" : "Registrar y entrar"}
          </button>
        </form>

        <div className="mt-4">
          <NoticeBanner message={error} kind="error" />
        </div>
      </section>
    </main>
  );
};
