import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import SignUp from "./pages/SignUp.jsx";
import Recovery from "./pages/Recovery.jsx";
import Account from "./pages/Account.jsx";
import Settings from "./pages/Settings.jsx";
import Terms from "./pages/Terms.jsx";
import Integracoes from "./pages/Integracoes.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/sign-up" element={<SignUp />} />
      <Route path="/recovery" element={<Recovery />} />
      <Route path="/account" element={<Account />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/integracoes" element={<Integracoes />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
