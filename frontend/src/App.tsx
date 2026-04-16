import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/common/ProtectedRoute";
import { AppShell } from "./components/layout/AppShell";
import { AppDataProvider } from "./context/AppDataContext";
import { useAuth } from "./context/AuthContext";
import { CalendarPage } from "./pages/CalendarPage";
import { ExchangesPage } from "./pages/ExchangesPage";
import { LoginPage } from "./pages/LoginPage";
import { PlanningCalendarPage } from "./pages/PlanningCalendarPage";
import { AdminPage } from "./pages/AdminPage";

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
          <Route index element={<Navigate to="/calendario" replace />} />
          <Route path="/calendario" element={<PlanningCalendarPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/generacion" element={<Navigate to="/admin" replace />} />
          <Route path="/semanas" element={<Navigate to="/calendario" replace />} />
          <Route path="/asignaciones" element={<Navigate to="/calendario" replace />} />
          <Route path="/mis-tardes" element={<Navigate to="/calendario" replace />} />
          <Route path="/intercambios" element={<ExchangesPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? "/calendario" : "/login"} replace />}
      />
    </Routes>
  );
}

export default App;
