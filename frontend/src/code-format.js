/** Formata o código de acesso: 12 dígitos em grupos de 4 (0000-0000-0000). */
export function formatCode(value) {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  return digits.replace(/(\d{4})(?=\d)/g, "$1-");
}
