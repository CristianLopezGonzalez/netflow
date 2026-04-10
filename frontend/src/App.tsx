import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/common/ProtectedRoute";
import { AppShell } from "./components/layout/AppShell";
import { AppDataProvider } from "./context/AppDataContext";
import { useAuth } from "./context/AuthContext";
import { BolsaPage } from "./pages/BolsaPage";
import { CalendarPage } from "./pages/CalendarPage";
import { ExchangesPage } from "./pages/ExchangesPage";
import { LoginPage } from "./pages/LoginPage";
import { PlanningCalendarPage } from "./pages/PlanningCalendarPage";
import { PlanningGenerationPage } from "./pages/PlanningGenerationPage";

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route
          element={
            <AppDataProvider>
              <AppShell />
            </AppDataProvider>
          }
        >
          <Route index element={<Navigate to="/vistas" replace />} />
          <Route path="/vistas" element={<PlanningCalendarPage />} />
          <Route path="/generacion" element={<PlanningGenerationPage />} />
          <Route path="/semanas" element={<Navigate to="/vistas" replace />} />
          <Route path="/asignaciones" element={<Navigate to="/vistas" replace />} />
          <Route path="/mis-tardes" element={<Navigate to="/vistas" replace />} />
          <Route path="/intercambios" element={<ExchangesPage />} />
          <Route path="/bolsa" element={<BolsaPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? "/vistas" : "/login"} replace />}
      />
    </Routes>
  );
}

export default App;
