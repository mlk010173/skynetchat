/* ==========================================================================
   permissoes-site.js · SKYNETchat
   Gerenciador de permissões por site/origem usando as APIs REAIS do navegador.

   Princípios (importantes para não mentir na interface):
   1. consultarTodas() só pergunta, nunca dispara prompt.
   2. solicitar(nome) só pode ser chamado a partir de um clique do usuário;
      é o clique que autoriza o prompt do navegador.
   3. Revogação NÃO é feita por código: o navegador é o dono da decisão.
      instrucaoRevogar(nome) devolve o passo a passo por navegador.
   4. Pop-ups e downloads automáticos não têm API de pedido: o navegador
      decide, e a interface só explica onde mudar.
   5. Nada de senha, token de terceiro ou cookie de autenticação de outro
      site é guardado aqui. O registro local é só de uso da permissão.
   ========================================================================== */

export const CHAVE_USO = "skynet.permissoes.uso.v1";
export const LIMITE_USO = 100;

/** Nomes usados internamente (estáveis, sem acento). */
export const PERMISSOES = [
  {
    nome: "geolocalizacao",
    rotulo: "Localização",
    descricao: "Sua posição aproximada, para respostas e clima do lugar onde você está.",
    api: "navigator.geolocation",
    feature: "geolocation",
    query: "geolocation",
    pedivel: true,
  },
  {
    nome: "notificacoes",
    rotulo: "Notificações",
    descricao: "Avisos do SKYNET fora da aba, como lembretes e tarefas concluídas.",
    api: "Notification",
    feature: null,
    query: "notifications",
    pedivel: true,
  },
  {
    nome: "microfone",
    rotulo: "Microfone",
    descricao: "Gravar sua voz para transcrição e conversa por áudio.",
    api: "navigator.mediaDevices.getUserMedia",
    feature: "microphone",
    query: "microphone",
    pedivel: true,
  },
  {
    nome: "camera",
    rotulo: "Câmera",
    descricao: "Fotografar e ler documentos direto do chat.",
    api: "navigator.mediaDevices.getUserMedia",
    feature: "camera",
    query: "camera",
    pedivel: true,
  },
  {
    nome: "area-transferencia-leitura",
    rotulo: "Ler a área de transferência",
    descricao: "Colar no chat o que você copiou em outro lugar.",
    api: "navigator.clipboard.readText",
    feature: "clipboard-read",
    query: "clipboard-read",
    pedivel: true,
  },
  {
    nome: "area-transferencia-escrita",
    rotulo: "Escrever na área de transferência",
    descricao: "Copiar respostas e blocos de código com um clique.",
    api: "navigator.clipboard.writeText",
    feature: "clipboard-write",
    query: "clipboard-write",
    pedivel: true,
  },
  {
    nome: "armazenamento-persistente",
    rotulo: "Armazenamento persistente",
    descricao: "Pedir ao navegador para não apagar dados do SKYNET por falta de espaço.",
    api: "navigator.storage.persist",
    feature: null,
    query: null,
    pedivel: true,
  },
  {
    nome: "compartilhar-arquivos",
    rotulo: "Compartilhar arquivos",
    descricao: "Abrir o seletor de arquivos e enviar o que você escolher pelo menu de compartilhar do sistema.",
    api: "navigator.canShare / showOpenFilePicker",
    feature: null,
    query: null,
    pedivel: true,
  },
  {
    nome: "downloads-automaticos",
    rotulo: "Downloads automáticos",
    descricao: "Vários downloads seguidos sem novo clique. Quem controla é o navegador.",
    api: "sem API de permissão",
    feature: null,
    query: null,
    pedivel: false,
  },
  {
    nome: "pop-ups",
    rotulo: "Pop-ups",
    descricao: "Abrir janelas novas. Quem controla é o navegador, e um teste automático seria bloqueado.",
    api: "window.open",
    feature: null,
    query: null,
    pedivel: false,
  },
];

export const NOMES = PERMISSOES.map((p) => p.nome);

export function permissaoPorNome(nome) {
  return PERMISSOES.find((p) => p.nome === nome) || null;
}

/* ------------------------------------------------------------- políticas */

/**
 * O Permissions-Policy do site permite a feature?
 * Chrome/Edge expõem document.permissionsPolicy (antes featurePolicy).
 * Devolve true/false, ou null quando o navegador não informa.
 */
export function politicaPermite(feature) {
  if (!feature) return null;
  try {
    if (typeof document === "undefined" || !document) return null;
    const pol = document.permissionsPolicy || document.featurePolicy;
    if (!pol || typeof pol.allowsFeature !== "function") return null;
    return Boolean(pol.allowsFeature(feature));
  } catch {
    return null;
  }
}

/**
 * O vercel.json atual deste projeto declara:
 *   camera=(self), microphone=(self), geolocation=(), payment=(), usb=()
 * Ou seja: câmera e microfone funcionam na origem; geolocalização está
 * bloqueada para todos, inclusive para a própria origem. Este módulo apenas
 * relata o fato. O ajuste sugerido é trocar geolocation=() por
 * geolocation=(self) no arquivo vercel.json (não alterado por aqui).
 */
export const POLITICA_CONHECIDA = {
  camera: "camera=(self)",
  microphone: "microphone=(self)",
  geolocation: "geolocation=()",
  ajusteSugerido: "geolocation=(self)",
};

/* ------------------------------------------------------------ utilidades */

function est() {
  try {
    if (typeof localStorage === "undefined" || !localStorage) return null;
    return localStorage;
  } catch {
    return null;
  }
}

function evento(nome, detalhe) {
  try {
    if (typeof window === "undefined" || !window?.dispatchEvent) return;
    window.dispatchEvent(new CustomEvent(nome, { detail: detalhe }));
  } catch {
    /* ambiente sem window */
  }
}

function normalizarEstado(bruto) {
  switch (bruto) {
    case "granted":
      return "concedida";
    case "denied":
      return "negada";
    case "prompt":
      return "pergunta";
    default:
      return "desconhecido";
  }
}

/**
 * Consulta um nome de permissão via navigator.permissions.query.
 * Navegadores lançam TypeError para nomes que não reconhecem (Firefox é
 * o caso clássico de clipboard-read/clipboard-write): tratamos como
 * "indisponivel" em vez de quebrar a tela.
 */
async function consultarQuery(query) {
  if (!query) return { estado: "indisponivel", motivo: "Este navegador não expõe consulta para esta permissão." };
  try {
    if (typeof navigator === "undefined" || !navigator?.permissions?.query) {
      return { estado: "indisponivel", motivo: "A API de permissões não está disponível neste navegador." };
    }
  } catch {
    return { estado: "indisponivel", motivo: "A API de permissões não está disponível neste navegador." };
  }
  try {
    // O descritor precisa ser { name }. Alguns navegadores exigem allowWithoutGesture.
    const status = await navigator.permissions.query({ name: query });
    return { estado: normalizarEstado(status?.state), motivo: null };
  } catch (erro) {
    const tipo = erro?.name || "";
    if (tipo === "TypeError") {
      return {
        estado: "indisponivel",
        motivo: "Este navegador não aceita consultar esse nome (TypeError). O prompt ainda pode existir ao usar o recurso.",
      };
    }
    return { estado: "desconhecido", motivo: erro?.message || "Não foi possível consultar." };
  }
}

/* -------------------------------------------------------------- registro */

/**
 * Registro local de quando o SKYNET pediu ou usou cada permissão.
 * Guarda só nome, ação e horário: nunca conteúdo, nunca credencial.
 */
export function lerRegistroUso() {
  const ls = est();
  if (!ls) return [];
  try {
    const bruto = JSON.parse(ls.getItem(CHAVE_USO) || "[]");
    return Array.isArray(bruto) ? bruto : [];
  } catch {
    return [];
  }
}

export function registrarUso(nome, acao, extra = {}) {
  const ls = est();
  const entrada = {
    quando: new Date().toISOString(),
    nome,
    acao,
    ...(extra?.resultado ? { resultado: String(extra.resultado).slice(0, 160) } : {}),
    ...(extra?.origem ? { origem: String(extra.origem).slice(0, 40) } : {}),
  };
  if (!ls) return entrada;
  try {
    const lista = [...lerRegistroUso(), entrada].slice(-LIMITE_USO);
    ls.setItem(CHAVE_USO, JSON.stringify(lista));
    evento("skynet:permissoes:uso", entrada);
  } catch {
    /* cota cheia: o registro é diagnóstico, não crítico */
  }
  return entrada;
}

export function limparRegistroUso() {
  const ls = est();
  if (!ls) return false;
  try {
    ls.removeItem(CHAVE_USO);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------- consulta */

function detectarSuporte(nome) {
  try {
    switch (nome) {
      case "geolocalizacao":
        return Boolean(navigator?.geolocation?.getCurrentPosition);
      case "notificacoes":
        return typeof Notification !== "undefined";
      case "microfone":
      case "camera":
        return Boolean(navigator?.mediaDevices?.getUserMedia);
      case "area-transferencia-leitura":
        return Boolean(navigator?.clipboard?.readText);
      case "area-transferencia-escrita":
        return Boolean(navigator?.clipboard?.writeText);
      case "armazenamento-persistente":
        return Boolean(navigator?.storage?.persisted && navigator?.storage?.persist);
      case "compartilhar-arquivos":
        return Boolean(navigator?.canShare || globalThis?.showOpenFilePicker);
      case "downloads-automaticos":
        // A única pista real é a existência de download por blob; a decisão é do navegador.
        return typeof URL?.createObjectURL === "function";
      case "pop-ups":
        return typeof window !== "undefined" && typeof window.open === "function";
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Estado ao vivo de todas as permissões. Não dispara nenhum prompt.
 * @returns {Promise<Array<{nome:string, rotulo:string, descricao:string, api:string, suportado:boolean, estado:string, motivo:string|null, pedivel:boolean}>>}
 */
export async function consultarTodas() {
  const saida = [];
  for (const def of PERMISSOES) {
    const base = {
      nome: def.nome,
      rotulo: def.rotulo,
      descricao: def.descricao,
      api: def.api,
      pedivel: def.pedivel,
      suportado: detectarSuporte(def.nome),
      estado: "indisponivel",
      motivo: null,
    };

    if (!base.suportado) {
      saida.push({ ...base, motivo: "Este navegador não oferece a API para este recurso." });
      continue;
    }

    // Permissões de política: se o site bloqueia, é isso que vale, mesmo
    // que o usuário libere no navegador.
    if (def.feature) {
      const permite = politicaPermite(def.feature);
      if (permite === false) {
        saida.push({
          ...base,
          estado: "politica",
          motivo: `Bloqueada pela política do site (Permissions-Policy: ${POLITICA_CONHECIDA[def.feature] || `${def.feature}=()`}). O navegador nem chega a perguntar.`,
        });
        continue;
      }
    }

    if (def.nome === "armazenamento-persistente") {
      try {
        const persistido = await navigator.storage.persisted();
        saida.push({
          ...base,
          estado: persistido ? "concedida" : "pergunta",
          motivo: persistido
            ? "O navegador já marcou o armazenamento do SKYNET como persistente."
            : "O navegador ainda pode apagar os dados se faltar espaço. O botão pede a marcação permanente.",
        });
      } catch (erro) {
        saida.push({ ...base, estado: "desconhecido", motivo: erro?.message || null });
      }
      continue;
    }

    if (def.nome === "compartilhar-arquivos") {
      let canShareFiles = false;
      try {
        canShareFiles = Boolean(
          navigator?.canShare?.({ files: [new File(["x"], "teste.txt", { type: "text/plain" })] }),
        );
      } catch {
        canShareFiles = false;
      }
      const temPicker = typeof globalThis?.showOpenFilePicker === "function";
      saida.push({
        ...base,
        estado: canShareFiles || temPicker ? "pergunta" : "indisponivel",
        motivo: canShareFiles
          ? "O sistema aceita compartilhar arquivos. O botão abre o seletor de arquivos."
          : temPicker
            ? "O navegador abre o seletor de arquivos; compartilhar com outros apps não é suportado aqui."
            : "Este navegador não permite compartilhar arquivos a partir da página.",
      });
      continue;
    }

    if (def.nome === "downloads-automaticos") {
      saida.push({
        ...base,
        estado: "desconhecido",
        motivo:
          "Não existe API para consultar nem pedir. O Chrome bloqueia vários downloads seguidos e mostra um aviso na barra de endereço; em Configurações, Privacidade e segurança, Configurações do site, Downloads automáticos você libera ou bloqueia por site.",
      });
      continue;
    }

    if (def.nome === "pop-ups") {
      saida.push({
        ...base,
        estado: "desconhecido",
        motivo:
          "O navegador bloqueia window.open fora de um clique. O SKYNET não faz teste automático de pop-up justamente para não abrir janela sem a sua ação; libere em Configurações do site, Pop-ups e redirecionamentos.",
      });
      continue;
    }

    const consulta = await consultarQuery(def.query);
    saida.push({ ...base, estado: consulta.estado, motivo: consulta.motivo });
  }

  return saida;
}

/* ------------------------------------------------------------- solicitar */

function comTimeout(promessa, ms, rotulo) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Sem resposta do navegador para ${rotulo} em ${Math.round(ms / 1000)}s.`)), ms);
    promessa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function traduzErroMidia(erro) {
  const nome = erro?.name || "";
  if (nome === "NotAllowedError" || nome === "PermissionDeniedError") return "O navegador ou você negou a permissão.";
  if (nome === "NotFoundError" || nome === "DevicesNotFoundError") return "Nenhum dispositivo compatível foi encontrado.";
  if (nome === "NotReadableError") return "O dispositivo está em uso por outro programa.";
  if (nome === "SecurityError") return "A origem não é segura (precisa de HTTPS) ou a política bloqueia.";
  if (nome === "AbortError") return "Você cancelou o seletor.";
  return erro?.message || "Não foi possível concluir.";
}

/**
 * Pede a permissão de verdade, disparando o prompt do navegador.
 * PRECISA ser chamado a partir de um clique do usuário; de outra forma o
 * navegador nega ou ignora.
 * @param {string} nome
 * @returns {Promise<{ok:boolean, estado:string, detalhe?:string, dados?:any}>}
 */
export async function solicitar(nome) {
  const def = permissaoPorNome(nome);
  if (!def) return { ok: false, estado: "indisponivel", detalhe: "Permissão desconhecida." };

  registrarUso(nome, "pedido", { origem: "site-permissions" });

  if (!def.pedivel) {
    const detalhe =
      nome === "pop-ups"
        ? "Pop-ups são controlados pelo navegador. Não existe pedido por código: libere em Configurações do site."
        : "Downloads automáticos são controlados pelo navegador. Não existe pedido por código.";
    registrarUso(nome, "explicado", { resultado: detalhe });
    return { ok: false, estado: "desconhecido", detalhe };
  }

  const marca = (resultado) => {
    registrarUso(nome, resultado.ok ? "concedida" : "negada", { resultado: resultado.detalhe || resultado.estado });
    return resultado;
  };

  try {
    if (nome === "geolocalizacao") {
      if (!navigator?.geolocation?.getCurrentPosition) {
        return marca({ ok: false, estado: "indisponivel", detalhe: "Este navegador não oferece geolocalização." });
      }
      const posicao = await comTimeout(
        new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 60000,
          });
        }),
        20000,
        "geolocalização",
      );
      return marca({
        ok: true,
        estado: "concedida",
        detalhe: `Posição obtida com precisão de cerca de ${Math.round(posicao?.coords?.accuracy || 0)} m.`,
        dados: { latitude: posicao?.coords?.latitude, longitude: posicao?.coords?.longitude, precisao: posicao?.coords?.accuracy },
      });
    }

    if (nome === "notificacoes") {
      if (typeof Notification === "undefined") {
        return marca({ ok: false, estado: "indisponivel", detalhe: "Este navegador não oferece notificações." });
      }
      const resposta = await Notification.requestPermission();
      const concedida = resposta === "granted";
      return marca({
        ok: concedida,
        estado: concedida ? "concedida" : resposta === "denied" ? "negada" : "pergunta",
        detalhe: concedida ? "Notificações liberadas." : "Notificações não foram liberadas.",
      });
    }

    if (nome === "microfone" || nome === "camera") {
      if (!navigator?.mediaDevices?.getUserMedia) {
        return marca({ ok: false, estado: "indisponivel", detalhe: "Este navegador não oferece captura de mídia." });
      }
      const restricao = nome === "microfone" ? { audio: true } : { video: true };
      const fluxo = await comTimeout(navigator.mediaDevices.getUserMedia(restricao), 25000, def.rotulo);
      // libera o dispositivo na hora: o SKYNET não grava nada sem ação no chat
      try {
        fluxo?.getTracks?.().forEach((t) => t.stop());
      } catch {
        /* trilha já encerrada */
      }
      return marca({ ok: true, estado: "concedida", detalhe: `${def.rotulo} liberado e já encerrado.` });
    }

    if (nome === "area-transferencia-leitura") {
      if (!navigator?.clipboard?.readText) {
        return marca({ ok: false, estado: "indisponivel", detalhe: "Este navegador não permite ler a área de transferência pela página." });
      }
      await navigator.clipboard.readText();
      return marca({ ok: true, estado: "concedida", detalhe: "Leitura da área de transferência liberada. O conteúdo não foi guardado." });
    }

    if (nome === "area-transferencia-escrita") {
      if (!navigator?.clipboard?.writeText) {
        return marca({ ok: false, estado: "indisponivel", detalhe: "Este navegador não permite escrever na área de transferência pela página." });
      }
      await navigator.clipboard.writeText("SKYNETchat");
      return marca({ ok: true, estado: "concedida", detalhe: "Escrita na área de transferência liberada." });
    }

    if (nome === "armazenamento-persistente") {
      if (!navigator?.storage?.persist) {
        return marca({ ok: false, estado: "indisponivel", detalhe: "Este navegador não oferece armazenamento persistente." });
      }
      const concedido = await navigator.storage.persist();
      const estimativa = navigator.storage.estimate ? await navigator.storage.estimate().catch(() => null) : null;
      return marca({
        ok: Boolean(concedido),
        estado: concedido ? "concedida" : "pergunta",
        detalhe: concedido
          ? "Armazenamento marcado como persistente."
          : "O navegador não marcou como persistente. Pode ser que ele decida sozinho com o tempo de uso.",
        dados: estimativa
          ? { usoBytes: estimativa.usage ?? null, cotaBytes: estimativa.quota ?? null }
          : null,
      });
    }

    if (nome === "compartilhar-arquivos") {
      const temPicker = typeof globalThis?.showOpenFilePicker === "function";
      if (!temPicker) {
        return marca({ ok: false, estado: "indisponivel", detalhe: "Este navegador não abre o seletor de arquivos pela página." });
      }
      const [handle] = await globalThis.showOpenFilePicker({ multiple: false });
      const arquivo = handle ? await handle.getFile() : null;
      let compartilhou = false;
      if (arquivo && navigator?.canShare?.({ files: [arquivo] }) && navigator?.share) {
        try {
          await navigator.share({ files: [arquivo], title: arquivo.name });
          compartilhou = true;
        } catch (erro) {
          if (erro?.name === "AbortError") {
            return marca({ ok: false, estado: "pergunta", detalhe: "Compartilhamento cancelado." });
          }
          return marca({ ok: false, estado: "pergunta", detalhe: traduzErroMidia(erro) });
        }
      }
      return marca({
        ok: true,
        estado: "concedida",
        detalhe: compartilhou
          ? `Arquivo ${arquivo?.name || ""} enviado pelo menu do sistema.`
          : `Arquivo ${arquivo?.name || ""} selecionado. Este navegador não compartilha com outros apps, então o arquivo só foi lido.`,
        dados: { arquivos: arquivo ? [arquivo.name] : [] },
      });
    }

    return marca({ ok: false, estado: "desconhecido", detalhe: "Permissão sem implementação." });
  } catch (erro) {
    const detalhe = traduzErroMidia(erro);
    const negada = erro?.name === "NotAllowedError" || erro?.name === "PermissionDeniedError" || erro?.code === 1;
    return marca({ ok: false, estado: negada ? "negada" : "desconhecido", detalhe });
  }
}

/* -------------------------------------------------------------- revogação */

const PASSOS = {
  geolocalizacao: {
    chrome: "Chrome: clique no cadeado à esquerda do endereço, Permissões do site, Localização, Bloquear.",
    firefox: "Firefox: clique no cadeado, Limpar permissões ou Configurações, Privacidade e segurança, Permissões, Localização, Configurações, remova este site.",
    safari: "Safari: menu Safari, Ajustes para este site, Localização, Negar. No macOS também em Ajustes do Sistema, Privacidade e segurança, Localização.",
  },
  notificacoes: {
    chrome: "Chrome: cadeado no endereço, Permissões do site, Notificações, Bloquear.",
    firefox: "Firefox: cadeado, Limpar permissões; ou Configurações, Privacidade e segurança, Permissões, Notificações, Configurações.",
    safari: "Safari: menu Safari, Ajustes para este site, Notificações, Negar. No iOS: Ajustes, Notificações, Safari.",
  },
  microfone: {
    chrome: "Chrome: cadeado, Permissões do site, Microfone, Bloquear.",
    firefox: "Firefox: cadeado, Limpar permissões; ou Configurações, Privacidade e segurança, Permissões, Microfone.",
    safari: "Safari: menu Safari, Ajustes para este site, Microfone, Negar. No macOS: Ajustes do Sistema, Privacidade e segurança, Microfone.",
  },
  camera: {
    chrome: "Chrome: cadeado, Permissões do site, Câmera, Bloquear.",
    firefox: "Firefox: cadeado, Limpar permissões; ou Configurações, Privacidade e segurança, Permissões, Câmera.",
    safari: "Safari: menu Safari, Ajustes para este site, Câmera, Negar. No macOS: Ajustes do Sistema, Privacidade e segurança, Câmera.",
  },
  "area-transferencia-leitura": {
    chrome: "Chrome: cadeado, Permissões do site, Área de transferência, Bloquear. Se o item não aparecer, o navegador não guarda essa escolha e pergunta sempre.",
    firefox: "Firefox: a leitura da área de transferência não é uma permissão salva; o navegador pergunta a cada uso. Para impedir, use Configurações, Privacidade e segurança e revise as permissões de colar.",
    safari: "Safari: menu Safari, Ajustes para este site, Área de transferência, Negar.",
  },
  "area-transferencia-escrita": {
    chrome: "Chrome: cadeado, Permissões do site, Área de transferência, Bloquear.",
    firefox: "Firefox: a escrita na área de transferência não é uma permissão salva; acontece apenas durante um clique seu.",
    safari: "Safari: menu Safari, Ajustes para este site, Área de transferência, Negar.",
  },
  "armazenamento-persistente": {
    chrome: "Chrome: use o próprio botão Revogar abaixo, que chama o navegador; ou Configurações, Privacidade e segurança, Configurações do site, Dados armazenados, remova este site.",
    firefox: "Firefox: Configurações, Privacidade e segurança, Cookies e dados de sites, Gerenciar dados, remova este site.",
    safari: "Safari: menu Safari, Ajustes, Privacidade, Gerenciar dados do site, remova este site.",
  },
  "compartilhar-arquivos": {
    chrome: "Chrome: cadeado, Permissões do site, revise Arquivos e área de transferência. O compartilhamento em si só acontece quando você escolhe um arquivo.",
    firefox: "Firefox: não há permissão salva; o seletor de arquivos só abre com seu clique.",
    safari: "Safari: não há permissão salva; o menu de compartilhamento é do sistema e só abre com seu clique.",
  },
  "downloads-automaticos": {
    chrome: "Chrome: Configurações, Privacidade e segurança, Configurações do site, Downloads automáticos, remova este site ou mude para Bloquear.",
    firefox: "Firefox: Configurações, Geral, Aplicativos, ou Configurações, Privacidade e segurança, Permissões, Bloquear janelas pop-up e downloads.",
    safari: "Safari: menu Safari, Ajustes para este site, Downloads, Negar.",
  },
  "pop-ups": {
    chrome: "Chrome: cadeado, Permissões do site, Pop-ups e redirecionamentos, Bloquear.",
    firefox: "Firefox: cadeado, Limpar permissões; ou Configurações, Privacidade e segurança, Permissões, Bloquear janelas pop-up.",
    safari: "Safari: menu Safari, Ajustes para este site, Janelas pop-up, Bloquear.",
  },
};

/**
 * Texto de revogação. O SKYNET não revoga nada: quem revoga é o usuário,
 * nas configurações do navegador. Devolve passo a passo para os três
 * navegadores principais e a recomendação do que usar.
 * @param {string} nome
 * @returns {{nome:string, resumo:string, chrome:string, firefox:string, safari:string}}
 */
export function instrucaoRevogar(nome) {
  const def = permissaoPorNome(nome);
  const passos = PASSOS[nome];
  if (!def || !passos) {
    return {
      nome,
      resumo: "Revogação só é possível nas configurações do navegador.",
      chrome: "Abra as configurações do site pelo cadeado ao lado do endereço.",
      firefox: "Abra as permissões do site pelo cadeado ao lado do endereço.",
      safari: "Use o menu Safari, Ajustes para este site.",
    };
  }
  return {
    nome,
    resumo: `A permissão de ${def.rotulo.toLowerCase()} é controlada pelo navegador. O SKYNET não consegue revogar por código: use os passos abaixo.`,
    chrome: passos.chrome,
    firefox: passos.firefox,
    safari: passos.safari,
  };
}

/* ---------------------------------------------------------------- storage */

/** Uso e cota reais do armazenamento da origem. */
export async function estimarArmazenamento() {
  try {
    if (!navigator?.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return {
      usoBytes: e.usage ?? null,
      cotaBytes: e.quota ?? null,
      percentual: e.quota ? Math.round(((e.usage || 0) / e.quota) * 1000) / 10 : null,
      persistente: navigator.storage.persisted ? await navigator.storage.persisted() : null,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------- sites e sessões (local) */

export const CHAVE_SITES = "skynet.sites.v1";

/**
 * Chave por usuário: quando há sessão Supabase, o id entra na chave para que
 * duas contas no mesmo navegador nunca vejam os dados uma da outra.
 */
export function chaveSites(userId) {
  return userId ? `${CHAVE_SITES}:${userId}` : CHAVE_SITES;
}

/** Valida um domínio digitado. Nunca aceita usuário/senha na URL. */
export function normalizarDominio(entrada) {
  const bruto = String(entrada || "").trim();
  if (!bruto) return { ok: false, erro: "Digite um domínio, por exemplo exemplo.com." };
  if (bruto.length > 200) return { ok: false, erro: "Domínio longo demais." };
  if (/[\s]/.test(bruto)) return { ok: false, erro: "Domínio não pode ter espaços." };
  if (/[#?]/.test(bruto)) return { ok: false, erro: "Informe só o domínio, sem caminho, busca ou parâmetros." };

  let comProtocolo = bruto;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(bruto)) comProtocolo = `https://${bruto}`;

  let url;
  try {
    url = new URL(comProtocolo);
  } catch {
    return { ok: false, erro: "Não consegui entender esse endereço." };
  }
  if (url.username || url.password) {
    return { ok: false, erro: "Nunca coloque usuário ou senha no endereço." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, erro: "Use apenas http ou https." };
  }
  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, erro: "Domínio vazio." };

  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  const rotulo = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const ehLocal = host === "localhost";
  const ehIp = ipv4.test(host);
  const ehHostname = host.includes(".") && host.split(".").every((p) => rotulo.test(p)) && host.split(".").pop().length >= 2;

  if (!ehLocal && !ehIp && !ehHostname) {
    return { ok: false, erro: "Hostname inválido. Use algo como exemplo.com." };
  }
  if (url.pathname && url.pathname !== "/") {
    return { ok: false, erro: "Informe só o domínio, sem caminho." };
  }
  return { ok: true, dominio: host };
}

function lerLista(chave) {
  const ls = est();
  if (!ls) return [];
  try {
    const bruto = JSON.parse(ls.getItem(chave) || "[]");
    return Array.isArray(bruto) ? bruto : [];
  } catch {
    return [];
  }
}

function gravarLista(chave, lista) {
  const ls = est();
  if (!ls) return false;
  try {
    ls.setItem(chave, JSON.stringify(lista.slice(0, 200)));
    evento("skynet:sites", { chave, total: lista.length });
    return true;
  } catch {
    return false;
  }
}

/**
 * Sites registrados por este usuário neste navegador.
 * Guarda domínio, finalidade e datas. Nunca guarda senha, token de terceiro
 * ou cookie de autenticação de outro site.
 */
export function lerSites(userId = null) {
  return lerLista(chaveSites(userId));
}

export function adicionarSite(userId, { dominio, finalidade }) {
  const valido = normalizarDominio(dominio);
  if (!valido.ok) return { ok: false, erro: valido.erro };
  const chave = chaveSites(userId);
  const lista = lerLista(chave);
  if (lista.some((s) => s.dominio === valido.dominio)) {
    return { ok: false, erro: "Esse domínio já está na lista." };
  }
  const agora = new Date().toISOString();
  const item = {
    id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    dominio: valido.dominio,
    finalidade: String(finalidade || "").trim().slice(0, 240) || "sem finalidade informada",
    criadoEm: agora,
    ultimaUtilizacao: null,
    sessao: "isolada",
    estadoSessao: "nao_iniciada",
  };
  gravarLista(chave, [...lista, item]);
  return { ok: true, item };
}

export function removerSite(userId, id) {
  const chave = chaveSites(userId);
  const lista = lerLista(chave);
  const restante = lista.filter((s) => s.id !== id);
  gravarLista(chave, restante);
  return restante.length !== lista.length;
}

/**
 * Revogar sessão: como o SKYNET não guarda cookie nem token do outro site,
 * revogar apaga o registro da sessão isolada e o carimbo de uso. Nenhuma
 * credencial existia para apagar; o texto da interface diz isso.
 */
export function revogarSessaoSite(userId, id) {
  const chave = chaveSites(userId);
  const lista = lerLista(chave);
  let alterado = false;
  const nova = lista.map((s) => {
    if (s.id !== id) return s;
    alterado = true;
    return {
      ...s,
      sessao: "isolada",
      estadoSessao: "revogada",
      ultimaUtilizacao: null,
      revogadaEm: new Date().toISOString(),
    };
  });
  if (alterado) gravarLista(chave, nova);
  return alterado;
}

export function marcarUtilizacaoSite(userId, id) {
  const chave = chaveSites(userId);
  const lista = lerLista(chave);
  const nova = lista.map((s) => (s.id === id ? { ...s, ultimaUtilizacao: new Date().toISOString(), estadoSessao: "ativa" } : s));
  gravarLista(chave, nova);
  return nova;
}
