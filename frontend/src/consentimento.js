/* ==========================================================================
   consentimento.js · SKYNETchat
   Módulo puro (sem React) que guarda a decisão de cookies, permite checar
   permissão por categoria, inventaria de verdade o que este site guarda no
   navegador e apaga as chaves quando o usuário revoga uma categoria.

   Regras que este arquivo segue:
   1. nada não essencial é gravado antes do aceite (use guardaCategoria);
   2. revogar apaga de fato as chaves daquela categoria;
   3. o inventário é lido do navegador, não de uma lista imaginária;
   4. nenhuma função quebra quando localStorage/document não existem
      (SSR, testes em Node, navegador com armazenamento desativado).
   ========================================================================== */

export const VERSAO = 1;
export const CHAVE = "skynet.consentimento.v1";
export const CHAVE_USO_PERMISSOES = "skynet.permissoes.uso.v1";
export const DIAS_VALIDADE = 180;
export const LIMITE_REGISTRO = 50;
const MS_DIA = 24 * 60 * 60 * 1000;

/** Identificadores aceitos como "deste site" ao varrer o armazenamento. */
const PREFIXOS = ["skynet.", "skynet-", "sb-", "supabase"];

/**
 * Categorias de consentimento. `essenciais` é sempre ligada por necessidade
 * técnica (sessão, segurança, registro da própria escolha).
 */
export const CATEGORIAS = [
  {
    id: "essenciais",
    rotulo: "Essenciais",
    sempre: true,
    resumo: "Sem elas o site não funciona.",
    descricao:
      "Mantêm sua sessão autenticada, protegem o formulário contra abuso e guardam a sua própria decisão de cookies. Não podem ser desligadas.",
    finalidade: "Operação e segurança",
    exemplos: "sessão Supabase, registro de consentimento",
  },
  {
    id: "preferencias",
    rotulo: "Preferências",
    sempre: false,
    resumo: "Lembram como você gosta da interface.",
    descricao:
      "Guardam tema, densidade, modelo escolhido, rascunhos e ajustes do agente. Desligar apaga esses ajustes e o site volta ao padrão.",
    finalidade: "Conforto de uso",
    exemplos: "tema, densidade, modelo padrão, rascunho",
  },
  {
    id: "analiticos",
    rotulo: "Analíticos",
    sempre: false,
    resumo: "Ajudam a entender erros e uso.",
    descricao:
      "Servem para medir uso e diagnosticar falhas. O SKYNETchat não tem hoje um serviço de analytics contratado: se aparecer alguma chave nesta categoria, ela é listada no inventário abaixo com o nome real.",
    finalidade: "Medição e diagnóstico",
    exemplos: "métricas de uso, quando existirem",
  },
  {
    id: "marketing",
    rotulo: "Marketing",
    sempre: false,
    resumo: "Medem campanhas e anúncios.",
    descricao:
      "Seriam usadas para medir campanhas e personalizar anúncios. O SKYNETchat não instala pixel de anúncio por conta própria; qualquer cookie de terceiro nesta categoria aparece no inventário com nome e origem.",
    finalidade: "Divulgação",
    exemplos: "pixels de campanha, quando existirem",
  },
];

export const IDS_CATEGORIAS = CATEGORIAS.map((c) => c.id);

/** Mapa nome guardado → classificação conhecida. */
const CONHECIDOS = {
  [CHAVE]: {
    categoria: "essenciais",
    party: "propria",
    finalidade: "Guardar sua decisão de cookies e o histórico de decisões.",
    validade: `${DIAS_VALIDADE} dias`,
  },
  [CHAVE_USO_PERMISSOES]: {
    categoria: "essenciais",
    party: "propria",
    finalidade: "Registro local de quando o SKYNET pediu ou usou uma permissão do navegador.",
    validade: "até você apagar",
  },
  "skynet.sites.v1": {
    categoria: "essenciais",
    party: "propria",
    finalidade: "Lista de sites conectados e o estado das sessões isoladas.",
    validade: "até você remover",
  },
  "skynet-session": {
    categoria: "essenciais",
    party: "propria",
    finalidade: "Manter você autenticado no SKYNETchat (token de sessão do próprio site).",
    validade: "até sair da conta ou expirar o refresh token",
  },
  "skynet-theme-bg": {
    categoria: "preferencias",
    party: "propria",
    finalidade: "Lembrar o tema claro ou escuro escolhido.",
    validade: "até você trocar",
  },
  "skynet-modo": {
    categoria: "preferencias",
    party: "propria",
    finalidade: "Lembrar o modo de resposta selecionado.",
    validade: "até você trocar",
  },
  "skynet-menu-fechados": {
    categoria: "preferencias",
    party: "propria",
    finalidade: "Lembrar quais grupos do menu você deixou fechados.",
    validade: "até você trocar",
  },
};

/** Regras por prefixo, para famílias de chaves que crescem. */
const POR_PREFIXO = [
  {
    prefixo: "skynet.agente.",
    categoria: "preferencias",
    party: "propria",
    finalidade: "Configuração e memória local do agente neste navegador.",
    validade: "até você apagar",
  },
  {
    prefixo: "skynet.permissoes.",
    categoria: "essenciais",
    party: "propria",
    finalidade: "Registro local de uso de permissões do navegador.",
    validade: "até você apagar",
  },
  {
    prefixo: "skynet.clima.",
    categoria: "preferencias",
    party: "propria",
    finalidade: "Cidade, unidade e última leitura do clima, para abrir mais rápido (cache de 10 minutos).",
    validade: "10 minutos (cache); preferências até você apagar",
  },
  {
    prefixo: "skynet.widget",
    categoria: "preferencias",
    party: "propria",
    finalidade: "Estado e posição dos widgets da tela inicial.",
    validade: "até você apagar",
  },
  {
    prefixo: "skynet.memoria",
    categoria: "preferencias",
    party: "propria",
    finalidade: "Memória local do agente quando você não está logado.",
    validade: "até você apagar",
  },
  {
    prefixo: "sb-",
    categoria: "essenciais",
    party: "propria",
    finalidade: "Sessão de autenticação do Supabase (token do próprio SKYNETchat).",
    validade: "definida pelo servidor",
  },
  {
    prefixo: "supabase",
    categoria: "essenciais",
    party: "propria",
    finalidade: "Sessão de autenticação do Supabase (token do próprio SKYNETchat).",
    validade: "definida pelo servidor",
  },
];

const DESCONHECIDO = {
  categoria: "analiticos",
  party: "terceiro",
  finalidade: "Não identificado pelo SKYNETchat.",
  validade: null,
  desconhecido: true,
};

/* ------------------------------------------------------------- utilidades */

function armazem(tipo) {
  try {
    if (tipo === "session") {
      if (typeof sessionStorage === "undefined" || !sessionStorage) return null;
      return sessionStorage;
    }
    if (typeof localStorage === "undefined" || !localStorage) return null;
    return localStorage;
  } catch {
    // Safari em modo privado antigo, iframe sem permissão etc.
    return null;
  }
}

function doc() {
  try {
    return typeof document !== "undefined" && document ? document : null;
  } catch {
    return null;
  }
}

function bytesDe(texto) {
  try {
    return new TextEncoder().encode(String(texto)).length;
  } catch {
    return String(texto).length;
  }
}

function evento(nome, detalhe) {
  try {
    if (typeof window === "undefined" || !window?.dispatchEvent) return;
    window.dispatchEvent(new CustomEvent(nome, { detail: detalhe }));
  } catch {
    /* ambiente sem CustomEvent: silencioso de propósito */
  }
}

/** Categorias padrão: só essenciais ligada. */
export function categoriasPadrao() {
  const base = {};
  for (const c of CATEGORIAS) base[c.id] = Boolean(c.sempre);
  return base;
}

function normalizarCategorias(entrada) {
  const base = categoriasPadrao();
  if (entrada && typeof entrada === "object") {
    for (const id of IDS_CATEGORIAS) {
      if (Object.prototype.hasOwnProperty.call(entrada, id)) base[id] = Boolean(entrada[id]);
    }
  }
  base.essenciais = true;
  return base;
}

function consentimentoVazio() {
  return {
    versao: VERSAO,
    categorias: categoriasPadrao(),
    decididoEm: null,
    expiraEm: null,
    registro: [],
  };
}

function valido(bruto) {
  return Boolean(
    bruto &&
      typeof bruto === "object" &&
      typeof bruto.categorias === "object" &&
      bruto.categorias !== null &&
      bruto.decididoEm,
  );
}

function lerBruto() {
  const ls = armazem();
  if (!ls) return null;
  try {
    const texto = ls.getItem(CHAVE);
    if (!texto) return null;
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function gravar(registro) {
  const ls = armazem();
  if (!ls) return null;
  try {
    ls.setItem(CHAVE, JSON.stringify(registro));
    return registro;
  } catch {
    // cota cheia ou armazenamento bloqueado: a decisão vale só nesta aba
    return null;
  }
}

/* --------------------------------------------------------------- leitura */

/**
 * Lê a decisão salva. Sempre devolve um objeto com o mesmo formato;
 * `decididoEm: null` significa que o usuário nunca decidiu.
 * @returns {{versao:number, categorias:Record<string,boolean>, decididoEm:string|null, expiraEm:string|null, registro:Array<{quando:string, acao:string, categorias:string[]}>}}
 */
export function lerConsentimento() {
  const bruto = lerBruto();
  if (!valido(bruto)) {
    const vazio = consentimentoVazio();
    // registros antigos continuam visíveis mesmo se o formato principal falhar
    if (Array.isArray(bruto?.registro)) vazio.registro = bruto.registro.slice(-LIMITE_REGISTRO);
    return vazio;
  }
  return {
    versao: Number(bruto.versao) || VERSAO,
    categorias: normalizarCategorias(bruto.categorias),
    decididoEm: bruto.decididoEm || null,
    expiraEm: bruto.expiraEm || null,
    registro: Array.isArray(bruto.registro) ? bruto.registro.slice(-LIMITE_REGISTRO) : [],
  };
}

/** True quando nunca houve decisão, quando ela expirou ou quando a versão mudou. */
export function precisaDecidir() {
  const c = lerConsentimento();
  if (!c.decididoEm) return true;
  if (c.versao !== VERSAO) return true;
  if (!c.expiraEm) return true;
  const expira = Date.parse(c.expiraEm);
  if (!Number.isFinite(expira)) return true;
  return Date.now() >= expira;
}

/** Uma categoria está liberada? Essenciais sempre; o resto exige decisão válida. */
export function permitido(categoria) {
  if (!IDS_CATEGORIAS.includes(categoria)) return false;
  if (categoria === "essenciais") return true;
  if (precisaDecidir()) return false;
  return Boolean(lerConsentimento().categorias[categoria]);
}

/**
 * Executa `fn` somente se a categoria estiver liberada.
 * É o portão obrigatório para qualquer gravação não essencial.
 * @template T
 * @param {string} categoria
 * @param {() => T} fn
 * @returns {T | null}
 */
export function guardaCategoria(categoria, fn) {
  if (typeof fn !== "function") return null;
  if (!permitido(categoria)) return null;
  return fn();
}

/* -------------------------------------------------------------- escrita */

function acrescentarRegistro(c, acao, categorias) {
  const registro = Array.isArray(c.registro) ? [...c.registro] : [];
  registro.push({
    quando: new Date().toISOString(),
    acao: String(acao || "salvar"),
    categorias: IDS_CATEGORIAS.filter((id) => Boolean(categorias[id])),
  });
  return registro.slice(-LIMITE_REGISTRO);
}

/**
 * Salva a decisão. Categorias que passam de ligadas para desligadas têm as
 * chaves apagadas na hora (é revogação, não só preferência).
 * @param {Record<string, boolean>} categorias
 * @param {string} [acao] rótulo livre: "aceitar-tudo", "so-essenciais", "personalizar"...
 * @returns {object} consentimento gravado
 */
export function salvarConsentimento(categorias, acao = "salvar") {
  const anterior = lerConsentimento();
  const novas = normalizarCategorias(categorias);
  const agora = new Date();

  // revogação por categoria: apaga antes de gravar a nova decisão
  for (const id of IDS_CATEGORIAS) {
    if (id === "essenciais") continue;
    if (anterior.categorias[id] && !novas[id]) apagarCategoria(id);
  }

  const registroInterno = {
    versao: VERSAO,
    categorias: novas,
    decididoEm: agora.toISOString(),
    expiraEm: new Date(agora.getTime() + DIAS_VALIDADE * MS_DIA).toISOString(),
    registro: acrescentarRegistro(anterior, acao, novas),
  };

  const gravado = gravar(registroInterno) || registroInterno;
  evento("skynet:consentimento", gravado);
  return gravado;
}

/**
 * Revoga tudo: apaga as chaves de todas as categorias não essenciais e deixa
 * a decisão expirada, para o usuário decidir de novo com o banner.
 * @returns {object} consentimento resultante
 */
export function revogar() {
  for (const id of IDS_CATEGORIAS) {
    if (id === "essenciais") continue;
    apagarCategoria(id);
  }
  const anterior = lerConsentimento();
  const agora = new Date();
  const zerado = categoriasPadrao();
  const registroInterno = {
    versao: VERSAO,
    categorias: zerado,
    decididoEm: agora.toISOString(),
    // expira no mesmo instante: precisaDecidir() volta a ser true
    expiraEm: agora.toISOString(),
    registro: acrescentarRegistro(anterior, "revogar", zerado),
  };
  const gravado = gravar(registroInterno) || registroInterno;
  evento("skynet:consentimento", gravado);
  return gravado;
}

/** Assina mudanças de consentimento (banner e painel ficam em sincronia). */
export function aoMudarConsentimento(cb) {
  if (typeof window === "undefined" || typeof cb !== "function") return () => {};
  const ouvinte = () => cb(lerConsentimento());
  window.addEventListener("skynet:consentimento", ouvinte);
  return () => window.removeEventListener("skynet:consentimento", ouvinte);
}

/* ------------------------------------------------------------ inventário */

function classificar(nome, onde) {
  const base = CONHECIDOS[nome];
  if (base) return { ...base };
  for (const regra of POR_PREFIXO) {
    if (nome.startsWith(regra.prefixo)) return { ...regra };
  }
  if (onde === "cookie") {
    if (nome.startsWith("__Host-") || nome.startsWith("__Secure-")) {
      return {
        categoria: "essenciais",
        party: "propria",
        finalidade: "Cookie marcado como seguro pelo próprio site.",
        validade: null,
      };
    }
  }
  // Tudo que está no storage da NOSSA origem foi gravado por este site (ou por um script
  // que ele carregou, que o navegador não distingue). Chamar de "terceiro" sem prova seria
  // acusar sem evidência: marca como própria e aponta que a finalidade não foi catalogada.
  if (nome.startsWith("skynet")) {
    return {
      categoria: "preferencias",
      party: "propria",
      finalidade: "Dado do SKYNETchat sem descrição catalogada ainda.",
      validade: null,
      desconhecido: true,
    };
  }
  return { ...DESCONHECIDO };
}

function chavesDe(tipo) {
  const st = armazem(tipo);
  if (!st) return [];
  const saida = [];
  try {
    for (let i = 0; i < st.length; i += 1) {
      const nome = st.key(i);
      if (nome) saida.push(nome);
    }
  } catch {
    return saida;
  }
  return saida;
}

function lerCookieBruto() {
  const d = doc();
  if (!d) return [];
  let texto = "";
  try {
    texto = String(d.cookie || "");
  } catch {
    return [];
  }
  return texto
    .split(";")
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const igual = par.indexOf("=");
      const nome = igual >= 0 ? par.slice(0, igual).trim() : par;
      const valor = igual >= 0 ? par.slice(igual + 1) : "";
      return { nome, valor };
    });
}

/**
 * Inventário real: varre document.cookie, localStorage e sessionStorage e
 * classifica cada item que pertence a este site (prefixos skynet./skynet-/sb-).
 * Itens desconhecidos entram como terceiro/não identificado, sem esconder nada.
 * @returns {Array<{nome:string, onde:'cookie'|'localStorage'|'sessionStorage', categoria:string, party:'propria'|'terceiro', finalidade:string, validade:string|null, bytes:number, desconhecido?:boolean}>}
 */
export function inventarioCookies() {
  const itens = [];
  const vistos = new Set();

  for (const { nome, valor } of lerCookieBruto()) {
    const chave = `cookie:${nome}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const cls = classificar(nome, "cookie");
    itens.push({
      nome,
      onde: "cookie",
      categoria: cls.categoria,
      party: cls.party,
      finalidade: cls.finalidade,
      validade: cls.validade ?? null,
      bytes: bytesDe(`${nome}=${valor}`),
      ...(cls.desconhecido ? { desconhecido: true } : {}),
    });
  }

  for (const onde of ["localStorage", "sessionStorage"]) {
    const st = armazem(onde === "localStorage" ? "local" : "session");
    if (!st) continue;
    for (const nome of chavesDe(onde === "localStorage" ? "local" : "session")) {
      if (!PREFIXOS.some((p) => nome.startsWith(p))) continue;
      const chave = `${onde}:${nome}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const cls = classificar(nome, onde);
      let valor = "";
      try {
        valor = st.getItem(nome) ?? "";
      } catch {
        valor = "";
      }
      itens.push({
        nome,
        onde,
        categoria: cls.categoria,
        party: cls.party,
        finalidade: cls.finalidade,
        validade: cls.validade ?? null,
        bytes: bytesDe(`${nome}${valor}`),
        ...(cls.desconhecido ? { desconhecido: true } : {}),
      });
    }
  }

  return itens.sort((a, b) => {
    const ordem = IDS_CATEGORIAS.indexOf(a.categoria) - IDS_CATEGORIAS.indexOf(b.categoria);
    if (ordem !== 0) return ordem;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

/** Soma aproximada em bytes de tudo que o inventário encontrou. */
export function tamanhoAproximado(itens = inventarioCookies()) {
  return itens.reduce((soma, item) => soma + (Number(item.bytes) || 0), 0);
}

/* -------------------------------------------------------------- exclusão */

function apagarCookie(nome) {
  const d = doc();
  if (!d) return false;
  const expira = "Thu, 01 Jan 1970 00:00:00 GMT";
  const partes = ["path=/", "path=/; SameSite=Lax"];
  let host = "";
  try {
    host = String(globalThis?.location?.hostname || "");
  } catch {
    host = "";
  }
  if (host) {
    partes.push(`path=/; domain=${host}`);
    partes.push(`path=/; domain=.${host}`);
  }
  let apagou = false;
  for (const extra of partes) {
    try {
      d.cookie = `${nome}=; expires=${expira}; Max-Age=0; ${extra}`;
      apagou = true;
    } catch {
      /* linha de cookie já expirada */
    }
  }
  return apagou;
}

/**
 * Apaga de fato todas as chaves de uma categoria (localStorage, sessionStorage
 * e cookies). Essenciais nunca são apagadas por aqui.
 * @param {string} categoria
 * @returns {string[]} nomes removidos
 */
export function apagarCategoria(categoria) {
  if (!IDS_CATEGORIAS.includes(categoria) || categoria === "essenciais") return [];
  const removidos = [];
  for (const item of inventarioCookies()) {
    if (item.categoria !== categoria) continue;
    if (item.onde === "cookie") {
      if (apagarCookie(item.nome)) removidos.push(item.nome);
      continue;
    }
    const st = armazem(item.onde === "localStorage" ? "local" : "session");
    if (!st) continue;
    try {
      st.removeItem(item.nome);
      removidos.push(item.nome);
    } catch {
      /* chave já removida */
    }
  }
  evento("skynet:consentimento:limpeza", { categoria, removidos });
  return removidos;
}

/** Remove um item específico do inventário (usado na tela de permissões). */
export function apagarItem(nome, onde) {
  if (!nome) return false;
  if (onde === "cookie") return apagarCookie(nome);
  const st = armazem(onde === "sessionStorage" ? "session" : "local");
  if (!st) return false;
  try {
    st.removeItem(nome);
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------- exportação */

/**
 * Direito de portabilidade: devolve um JSON com a decisão, o inventário real
 * e a descrição das categorias.
 */
export function exportarMeusDados() {
  const itens = inventarioCookies();
  return {
    geradoEm: new Date().toISOString(),
    aplicacao: "SKYNETchat",
    armazenamento: "localStorage, sessionStorage e cookies deste navegador",
    consentimento: lerConsentimento(),
    categorias: CATEGORIAS.map((c) => ({
      id: c.id,
      rotulo: c.rotulo,
      sempreLigada: Boolean(c.sempre),
      finalidade: c.finalidade,
      descricao: c.descricao,
    })),
    inventario: itens,
    tamanhoAproximadoBytes: tamanhoAproximado(itens),
  };
}

/** Serializa o export pronto para download. */
export function exportarMeusDadosJSON(espacos = 2) {
  return JSON.stringify(exportarMeusDados(), null, espacos);
}
