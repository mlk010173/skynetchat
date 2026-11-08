import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import SignUp from "./pages/SignUp.jsx";
import Recovery from "./pages/Recovery.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Account from "./pages/Account.jsx";
import Settings from "./pages/Settings.jsx";
import Terms from "./pages/Terms.jsx";
import Integracoes from "./pages/Integracoes.jsx";
import Widgets from "./pages/Widgets.jsx";
import Ferramentas from "./pages/Ferramentas.jsx";
import Permissoes from "./pages/Permissoes.jsx";
import Crm from "./pages/Crm.jsx";
import Sandbox from "./pages/Sandbox.jsx";
import Lembretes from "./pages/Lembretes.jsx";
import Devtool from "./pages/Devtool.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { AuthProvider } from "./auth.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* chat principal: aberto também no modo anônimo */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/sign-up" element={<SignUp />} />
        <Route path="/recovery" element={<Recovery />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/widgets" element={<Widgets />} />
        <Route path="/ferramentas" element={<Ferramentas />} />
        <Route path="/permissoes" element={<Permissoes />} />
        <Route path="/crm" element={<Crm />} />
        <Route path="/codex" element={<Sandbox />} />
        <Route path="/lembretes" element={<Lembretes />} />
        <Route path="/devtool" element={<Devtool />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/integracoes" element={<Integracoes />} />
        {/* rotas que exigem conta */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
