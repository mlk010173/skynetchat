// SKYNET · configuração do agente de pesquisa, guardada no navegador.
// Controla profundidade, quantas fontes entram no dossiê, quantas são lidas na
// íntegra, se vídeos e Instagram entram, e por quanto tempo o cache vale.

const CHAVE = "skynet.agente.config.v1";

export const PADRAO = {
  profundidade: "equilibrada", // rapida | equilibrada | profunda
  frentes: 4, // 2 a 5
  fontesMax: 12, // 6 a 20
  leiturasIntegra: 2, // 0 a 4
  fontesPorFrente: 6, // 3 a 10
  videos: true,
  instagram: true,
  idioma: "auto", // auto | pt | en
  cacheMin: 12, // 1 a 120
  mostrarPassos: true,
  autoridadePrimeiro: true,
};

export const NIVEIS = {
  rapida: { rotulo: "Rápida", frentes: 2, fontesMax: 8, leiturasIntegra: 1, fontesPorFrente: 5, desc: "2 frentes, 1 leitura completa · resposta em segundos" },
  equilibrada: { rotulo: "Equilibrada", frentes: 4, fontesMax: 12, leiturasIntegra: 2, fontesPorFrente: 6, desc: "4 frentes, 2 leituras completas · padrão" },
  profunda: { rotulo: "Profunda", frentes: 5, fontesMax: 18, leiturasIntegra: 4, fontesPorFrente: 10, desc: "5 frentes, 4 leituras completas · mais lento, mais lastro" },
};

const ouvintes = new Set();
let atual = null;

export function lerConfig() {
  if (atual) return atual;
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) || "{}");
    atual = { ...PADRAO, ...salvo };
  } catch {
    atual = { ...PADRAO };
  }
  return atual;
}

export function salvarConfig(patch) {
  atual = { ...lerConfig(), ...patch };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(atual));
  } catch {
    /* modo privado: segue em memória */
  }
  ouvintes.forEach((fn) => {
    try {
      fn(atual);
    } catch {
      /* ouvinte com defeito não derruba a tela */
    }
  });
  return atual;
}

export function assinarConfig(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/** Aplica um nível de profundidade mantendo o resto da configuração. */
export function aplicarNivel(nivel) {
  const n = NIVEIS[nivel];
  if (!n) return lerConfig();
  return salvarConfig({
    profundidade: nivel,
    frentes: n.frentes,
    fontesMax: n.fontesMax,
    leiturasIntegra: n.leiturasIntegra,
    fontesPorFrente: n.fontesPorFrente,
  });
}

/** Resumo curto para mostrar no chat. */
export function resumoConfig(cfg = lerConfig()) {
  const n = NIVEIS[cfg.profundidade] || NIVEIS.equilibrada;
  const extras = [cfg.videos ? "vídeos" : null, cfg.instagram ? "instagram" : null].filter(Boolean);
  return `${n.rotulo} · ${cfg.frentes} frentes · até ${cfg.fontesMax} fontes · ${cfg.leiturasIntegra} lidas na íntegra${extras.length ? " · " + extras.join(" + ") : ""}`;
}

/** TTL do cache em milissegundos. */
export const ttlCache = (cfg = lerConfig()) => Math.max(1, Number(cfg.cacheMin) || 12) * 60 * 1000;
