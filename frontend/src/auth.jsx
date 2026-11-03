// Contexto de autenticação do SKYNETchat.
// Dois métodos convivem: e-mail+senha (Supabase Auth) e código secreto de 12 dígitos
// (edge function auth-code, que também devolve uma sessão Supabase real).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib.js";

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
      // limpa os tokens da barra de endereços sem recarregar
      const limpo = window.location.href.replace(/(#?)([?&]?(access_token|refresh_token|expires_in|token_type|type)=[^#&]*)+/g, "");
      history.replaceState(null, "", limpo || window.location.pathname);
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

/** Mensagens de erro do Supabase Auth em português. */
export function traduzirErro(error) {
  const msg = String(error?.message || "").toLowerCase();
  if (msg.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar. Verifique a caixa de entrada.";
  if (msg.includes("user already registered")) return "Este e-mail já tem conta. Use a recuperação de senha se esqueceu.";
  if (msg.includes("password should be at least")) return "A senha é curta demais. Use no mínimo 8 caracteres.";
  if (msg.includes("weak") || msg.includes("pwned")) return "Essa senha apareceu em vazamentos públicos. Escolha outra.";
  if (msg.includes("unable to validate email") || msg.includes("invalid email")) return "E-mail inválido.";
  if (msg.includes("email rate limit") || msg.includes("over email send")) return "Muitos e-mails em pouco tempo. Tente de novo em alguns minutos.";
  if (msg.includes("for security purposes")) return "Aguarde alguns segundos antes de tentar novamente.";
  if (msg.includes("signup is disabled")) return "Cadastro por e-mail desativado no momento.";
  if (msg.includes("failed to fetch") || msg.includes("network")) return "Sem conexão com o servidor. Verifique sua internet.";
  return error?.message || "Não foi possível concluir. Tente de novo.";
}

/** Regras de senha usadas na interface (o servidor valida de novo). */
export function forcaDaSenha(senha = "") {
  const cheios = [
    senha.length >= 8,
    /[a-z]/.test(senha) && /[A-Z]/.test(senha),
    /\d/.test(senha),
    /[^A-Za-z0-9]/.test(senha),
  ];
  return { pontos: cheios.filter(Boolean).length, minimo: senha.length >= 8 };
}
