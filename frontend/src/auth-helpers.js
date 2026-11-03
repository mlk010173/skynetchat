/** Funções puras de autenticação (testáveis sem tocar no Supabase). */

/** Traduz os erros do Supabase Auth para português. */
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

/** Força da senha em 4 níveis; mínimo aceito pela interface. */
export function forcaDaSenha(senha = "") {
  const cheios = [
    senha.length >= 8,
    /[a-z]/.test(senha) && /[A-Z]/.test(senha),
    /\d/.test(senha),
    /[^A-Za-z0-9]/.test(senha),
  ];
  return { pontos: cheios.filter(Boolean).length, minimo: senha.length >= 8 };
}

/** Para onde voltar depois do login (só caminhos internos). */
export function destinoSeguro(from, padrao = "/") {
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return padrao;
  return from;
}
