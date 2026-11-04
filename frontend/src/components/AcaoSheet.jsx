import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconBrain, IconClose, IconCode, IconGlobe, IconImage, IconWave,
} from "./Icons.jsx";

/**
 * Folha de ação imersiva.
 * Em vez de jogar um texto no composer, cada atalho abre uma interface própria
 * com campo, presets e prévia do pedido que vai ser enviado ao SKYNET.
 */
export const ACOES = {
  "Pesquisar na web agora": {
    chave: "pesquisar",
    titulo: "Pesquisar na web",
    sub: "Busca real, com fontes ao vivo e data de hoje",
    icone: IconGlobe,
    campo: {
      label: "O que você quer descobrir?",
      placeholder: "ex: melhores placas de vídeo custo-benefício em 2026",
    },
    grupos: [
      {
        label: "Atalhos",
        opcoes: ["Últimas notícias de IA", "Preço do dólar hoje", "O que aconteceu no Brasil hoje", "Comparativo de celulares"],
      },
      {
        label: "Como responder",
        opcoes: ["Resumo em 5 tópicos", "Com números e datas", "Com fontes numeradas", "Explicando como para um leigo"],
      },
    ],
    montar: (valor, sel) => {
      const extra = sel.length ? `\nFormato: ${sel.join("; ")}.` : "";
      return `Pesquise na web agora e responda com fontes: ${valor}${extra}`;
    },
  },

  "Abrir um site e ler a página": {
    chave: "abrir",
    titulo: "Abrir um site",
    sub: "O SKYNET navega de verdade e lê o conteúdo",
    icone: IconGlobe,
    campo: {
      label: "Endereço ou nome do site",
      placeholder: "ex: news.ycombinator.com",
    },
    grupos: [
      {
        label: "Sites rápidos",
        opcoes: ["example.com", "github.com/trending", "news.ycombinator.com", "wikipedia.org"],
      },
      {
        label: "O que fazer com a página",
        opcoes: ["Resumir os pontos principais", "Extrair os links", "Comparar com outra fonte"],
      },
    ],
    montar: (valor, sel) => {
      const extra = sel.length ? ` Depois, ${sel.join(" e ").toLowerCase()}.` : "";
      return `Abra o site ${valor}, leia a página e me conte o que importa.${extra}`;
    },
  },

  "Gerar uma imagem": {
    chave: "imagem",
    titulo: "Gerar imagem",
    sub: "NVIDIA, Hugging Face e fallback automático",
    icone: IconImage,
    campo: {
      label: "Descreva a imagem",
      placeholder: "ex: um lobo de neon em uma cidade futurista à noite, chuva, reflexos",
      linhas: 3,
    },
    grupos: [
      {
        label: "Estilo",
        opcoes: ["Fotorrealista", "Ilustração", "Anime", "3D render", "Cinematográfico", "Aquarela"],
      },
      {
        label: "Enquadramento",
        opcoes: ["Quadrado 1:1", "Horizontal 16:9", "Vertical 9:16", "Close-up", "Plano aberto"],
      },
    ],
    montar: (valor, sel) => {
      const estilo = sel.slice(0, 1);
      const enquad = sel.slice(1);
      const partes = [valor.trim()];
      if (estilo.length) partes.push(`estilo ${estilo[0].toLowerCase()}`);
      if (enquad.length) partes.push(enquad.map((e) => e.toLowerCase()).join(", "));
      return `Gere uma imagem: ${partes.join(" · ")}`;
    },
  },

  "Tocar uma música ou vídeo": {
    chave: "midia",
    titulo: "Música ou vídeo",
    sub: "Player integrado na própria conversa",
    icone: IconWave,
    campo: {
      label: "O que tocar?",
      placeholder: "ex: lofi hip hop para estudar, ou um clássico do rock",
    },
    grupos: [
      {
        label: "Buscar por",
        opcoes: ["Artista ou banda", "Gênero ou clima", "Playlist longa", "Um vídeo específico"],
      },
      {
        label: "Atmosfera",
        opcoes: ["Para focar", "Para relaxar", "Para treinar", "Para festa"],
      },
    ],
    montar: (valor, sel) => {
      const extra = sel.length ? ` (${sel.join(" · ").toLowerCase()})` : "";
      return `Toque uma música ou vídeo: ${valor}${extra}. Deixe o player pronto para eu dar play aqui no chat.`;
    },
  },

  "Clima de hoje com gráfico": {
    chave: "clima",
    titulo: "Clima de hoje",
    sub: "24 horas e 5 dias, com gráfico interativo",
    icone: IconBrain,
    campo: { label: "Cidade", placeholder: "ex: São Paulo" },
    grupos: [
      { label: "Cidades", opcoes: ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Curitiba", "Recife"] },
      { label: "Quero ver", opcoes: ["Temperatura", "Chuva", "Vento", "Próximos 5 dias"] },
    ],
    montar: (valor, sel) => {
      const extra = sel.length ? ` Mostre ${sel.join(", ").toLowerCase()}.` : "";
      return `Qual o clima em ${valor} agora? Traga o gráfico das próximas horas e dos 5 dias.${extra}`;
    },
  },

  "Criar um widget para o painel": {
    chave: "widget",
    titulo: "Criar widget",
    sub: "Fica salvo no seu painel em /widgets",
    icone: IconCode,
    campo: {
      label: "O que o widget deve mostrar?",
      placeholder: "ex: status do sistema e latência dos modelos",
      linhas: 3,
    },
    grupos: [
      { label: "Widgets prontos", opcoes: ["Status do sistema", "Métricas com sparkline", "Notícias", "GitHub do projeto", "Galeria de mídia"] },
      { label: "Atualização", opcoes: ["Manual", "A cada 30s", "A cada 5 min"] },
    ],
    montar: (valor, sel) => {
      const extra = sel.length ? ` Configuração desejada: ${sel.join(" · ").toLowerCase()}.` : "";
      return `Crie um widget para o meu painel que mostre: ${valor}.${extra}`;
    },
  },
};

function chaveDe(acao) {
  return typeof acao === "string" ? acao : acao?.label;
}

export default function AcaoSheet({ acao, onFechar, onEnviar }) {
  const titulo = chaveDe(acao);
  const cfg = titulo ? ACOES[titulo] : null;
  const [valor, setValor] = useState("");
  const [sel, setSel] = useState([]);
  const campoRef = useRef(null);

  // guarda o fechar em ref: o efeito não pode depender da identidade do callback,
  // senão cada re-render do pai limpa o campo enquanto a pessoa digita.
  const fecharRef = useRef(onFechar);
  useEffect(() => {
    fecharRef.current = onFechar;
  }, [onFechar]);

  const chave = cfg?.chave ?? null;

  useEffect(() => {
    if (!chave) return undefined;
    setValor("");
    setSel([]);
    const t = setTimeout(() => campoRef.current?.focus(), 240);
    const aoTeclar = (e) => {
      if (e.key === "Escape") fecharRef.current?.();
    };
    document.addEventListener("keydown", aoTeclar);
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAntes;
    };
  }, [chave]);

  const previa = useMemo(() => {
    if (!cfg) return "";
    const base = valor.trim();
    if (!base) return cfg.montar("…", sel);
    return cfg.montar(base, sel);
  }, [cfg, valor, sel]);

  if (!cfg) return null;

  const Icone = cfg.icone;
  const pronto = valor.trim().length >= (cfg.chave === "imagem" ? 3 : 2);

  const alternar = (opcao) => {
    setSel((atual) => (atual.includes(opcao) ? atual.filter((x) => x !== opcao) : [...atual, opcao]));
  };

  const enviar = () => {
    if (!pronto) return;
    onEnviar(cfg.montar(valor.trim(), sel));
  };

  return (
    <div className="ac-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className={`ac-sheet ac-${cfg.chave}`} role="dialog" aria-modal="true" aria-label={cfg.titulo}>
        <span className="ac-glow" aria-hidden="true" />
        <div className="ac-topo">
          <span className="ac-icone" aria-hidden="true"><Icone width={20} height={20} /></span>
          <span className="ac-titulos">
            <b>{cfg.titulo}</b>
            <small>{cfg.sub}</small>
          </span>
          <button type="button" className="ac-x" onClick={onFechar} aria-label="Fechar">
            <IconClose width={16} height={16} />
          </button>
        </div>

        <label className="ac-campo">
          <span>{cfg.campo.label}</span>
          {cfg.campo.linhas ? (
            <textarea
              ref={campoRef}
              rows={cfg.campo.linhas}
              value={valor}
              placeholder={cfg.campo.placeholder}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviar(); }
              }}
            />
          ) : (
            <input
              ref={campoRef}
              value={valor}
              placeholder={cfg.campo.placeholder}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); enviar(); }
              }}
            />
          )}
        </label>

        {cfg.grupos.map((g) => (
          <div className="ac-grupo" key={g.label}>
            <span className="ac-rotulo">{g.label}</span>
            <div className="ac-opcoes">
              {g.opcoes.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={"ac-opcao" + (sel.includes(o) ? " marcada" : "")}
                  aria-pressed={sel.includes(o)}
                  onClick={() => alternar(o)}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="ac-previa" aria-live="polite">
          <span className="ac-rotulo">Vai ser enviado</span>
          <p>{previa}</p>
        </div>

        <div className="ac-rodape">
          <button type="button" className="ac-cancelar" onClick={onFechar}>Cancelar</button>
          <button type="button" className="ac-enviar" onClick={enviar} disabled={!pronto}>
            Enviar ao SKYNET
          </button>
        </div>
        <p className="ac-dica">Enter envia · Shift+Enter nova linha · Esc fecha</p>
      </div>
    </div>
  );
}
