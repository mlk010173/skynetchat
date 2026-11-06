// Contexto de autenticação do SKYNETchat.
// Dois métodos convivem: e-mail+senha (Supabase Auth) e código secreto de 12 dígitos
// (edge function auth-code, que também devolve uma sessão Supabase real).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib.js";
import { forcaDaSenha, traduzirErro } from "./auth-helpers.js";

export { forcaDaSenha, traduzirErro };

const AuthCtx = createContext(null);

/** Junta query e fragmentos da URL (o roteador usa hash, e o Supabase devolve tokens no hash). */
function paramsDaUrl() {
  const out = new URLSearchParams(window.location.search);
  const pedacos = String(window.location.hash || "").split("#").filter(Boolean);
  for (const pedaco of pedacos) {
    const consulta = pedaco.includes("?") ? pedaco.slice(pedaco.indexOf("?") + 1) : pedaco;
    new URLSearchParams(consulta).forEach((valor, chave) => out.set(chave, valor));
  }
  return out;
}

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [recuperacao, setRecuperacao] = useState(false);
  const capturouUrl = useRef(false);

  // Links de e-mail (confirmação e redefinição) chegam com tokens no fragmento.
  useEffect(() => {
    if (capturouUrl.current) return;
    capturouUrl.current = true;
    const p = paramsDaUrl();
    const acesso = p.get("access_token");
    const renovacao = p.get("refresh_token");
    const tipo = p.get("type");
    if (!acesso || !renovacao) return;
    (async () => {
      await supabase.auth.setSession({ access_token: acesso, refresh_token: renovacao });
      if (tipo === "recovery") setRecuperacao(true);
      // limpa os tokens da barra de endereços sem recarregar (mantém só a rota)
      const rota = String(window.location.hash || "").split("&")[0].split("?")[0] || "#/";
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}${rota}`);
    })();
  }, []);

  useEffect(() => {
    let ativo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setSessao(data.session ?? null);
      setCarregando(false);
    });
    const { data: assinatura } = supabase.auth.onAuthStateChange((evento, novaSessao) => {
      setSessao(novaSessao ?? null);
      setCarregando(false);
      if (evento === "PASSWORD_RECOVERY") setRecuperacao(true);
      if (evento === "SIGNED_OUT") setRecuperacao(false);
    });
    return () => {
      ativo = false;
      assinatura?.subscription?.unsubscribe?.();
    };
  }, []);

  const entrar = useCallback(async (email, senha) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) return { ok: false, erro: traduzirErro(error) };
    return { ok: true, sessao: data.session, precisaConfirmar: !data.user?.email_confirmed_at && !data.user?.confirmed_at };
  }, []);

  const cadastrar = useCallback(async (email, senha, nome) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
      options: {
        data: { nome: nome?.trim() || null },
        emailRedirectTo: `${window.location.origin}/#/login?confirmado=1`,
      },
    });
    if (error) return { ok: false, erro: traduzirErro(error) };
    return { ok: true, precisaConfirmar: !data.session, usuario: data.user };
  }, []);

  const sair = useCallback(async () => {
    await supabase.auth.signOut();
    setSessao(null);
    return { ok: true };
  }, []);

  const recuperarSenha = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/#/reset-password`,
    });
    if (error) return { ok: false, erro: traduzirErro(error) };
    return { ok: true };
  }, []);

  const definirNovaSenha = useCallback(async (senha) => {
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) return { ok: false, erro: traduzirErro(error) };
    setRecuperacao(false);
    return { ok: true };
  }, []);

  const reenviarConfirmacao = useCallback(async (email) => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/#/login?confirmado=1` },
    });
    if (error) return { ok: false, erro: traduzirErro(error) };
    return { ok: true };
  }, []);

  const valor = useMemo(
    () => ({
      sessao,
      usuario: sessao?.user ?? null,
      email: sessao?.user?.email ?? null,
      nome: sessao?.user?.user_metadata?.nome ?? null,
      papel: (() => {
        const bruto = String(
          sessao?.user?.app_metadata?.role ?? sessao?.user?.user_metadata?.role ?? "",
        ).toLowerCase();
        return ["admin", "dev", "owner", "dono"].includes(bruto) ? "dev" : "user";
      })(),
      autenticado: Boolean(sessao),
      carregando,
      recuperacao,
      entrar,
      cadastrar,
      sair,
      recuperarSenha,
      definirNovaSenha,
      reenviarConfirmacao,
    }),
    [sessao, carregando, recuperacao, entrar, cadastrar, sair, recuperarSenha, definirNovaSenha, reenviarConfirmacao],
  );

  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
