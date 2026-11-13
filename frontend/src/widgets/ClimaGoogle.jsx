// SKYNET · widget de clima completo (dados reais da Open-Meteo, qualidade do ar e avisos).
// Identidade própria: hierarquia de leitura inspirada em apps de clima modernos, mas com
// ícones geométricos, escala ESQUADRO (raios 8 a 14px, borda em vez de sombra) e sem
// nenhum valor simulado. Falhou a rede? Mostra a última leitura marcada como desatualizada.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./widgets-novos.css";
import {
  ICONES,
  buscarCidades,
  carregarClima,
  classificarUv,
  direcaoVento,
  formatarPressao,
  formatarTemperatura,
  formatarVento,
  lerPreferenciasClima,
  numeroTemperatura,
  reverterCoordenadas,
  salvarPreferenciasClima,
  simboloTemperatura,
  tempoDoCodigo,
} from "./clima-api.js";

const INTERVALO_MS = 10 * 60 * 1000;
const ABAS = [
  { id: "temp", rotulo: "Temperatura" },
  { id: "chuva", rotulo: "Chuva" },
  { id: "vento", rotulo: "Vento" },
];
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Alvo de localização (SVG próprio: o glifo ⌖ não existe na maioria das fontes). */
function IconeAlvo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
}

/** Seta de atualizar (o glifo ↻ varia entre fontes). */
function IconeAtualizar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

/** Desenha um ícone de ICONES (formas geométricas, sem emoji). */
export function IconeTempo({ nome, tamanho = 48, titulo }) {
  const def = ICONES[nome] ?? ICONES.nublado;
  return (
    <svg
      className="wx-icone"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={titulo ? "img" : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      {def.formas.map((f, i) => {
        const g = { key: i, transform: f.dx || f.dy ? `translate(${f.dx ?? 0} ${f.dy ?? 0})` : undefined };
        if (f.t === "circle") return <circle {...g} cx={f.cx} cy={f.cy} r={f.r} />;
        if (f.t === "line") return <line {...g} x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} />;
        return <path {...g} d={f.d} />;
      })}
    </svg>
  );
}

/** Junta avisos repetidos (mesmo tipo/severidade/janela) e monta a janela legível. */
function agruparAvisos(itens) {
  const vistos = new Map();
  for (const a of itens) {
    const chave = [a.titulo, a.severidade, a.inicio, a.fim, a.abrangencia].join("|");
    if (vistos.has(chave)) continue;
    const dia = (t) => String(t ?? "").slice(0, 10).split("-").reverse().slice(0, 2).join("/");
    const janela = a.inicio && a.fim ? `de ${dia(a.inicio)} a ${dia(a.fim)}` : "janela não informada";
    vistos.set(chave, {
      chave,
      titulo: String(a.titulo ?? "Aviso meteorológico"),
      severidade: String(a.severidade ?? ""),
      cor: /^#[0-9a-f]{3,8}$/i.test(String(a.cor ?? "")) ? a.cor : null,
      riscos: Array.isArray(a.riscos) ? a.riscos.map(String) : [],
      janela,
      abrangencia: a.abrangencia,
    });
  }
  // aviso que vale para a cidade primeiro
  return [...vistos.values()].sort((x, y) => (x.abrangencia === "municipio" ? 0 : 1) - (y.abrangencia === "municipio" ? 0 : 1)).slice(0, 3);
}

const horaDe = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

const diaDaSemana = (data, i) => {
  if (i === 0) return "hoje";
  const d = new Date(`${data}T12:00:00`);
  return Number.isNaN(d.getTime()) ? data : DIAS_SEMANA[d.getDay()];
};

/** Gráfico por hora (SVG). Arraste/toque para ler cada hora; nunca recebe NaN. */
function GraficoHoras({ horas, aba, unidade, ativo, onAtivo }) {
  const ref = useRef(null);
  const L = 320;
  const A = 96;
  const pad = { x: 10, topo: 14, base: 14 };

  const valores = useMemo(
    () =>
      horas.map((h) => {
        if (aba === "chuva") return h.chuvaProb ?? 0;
        if (aba === "vento") return h.ventoKmh ?? 0;
        return numeroTemperatura(h.tempC, unidade);
      }),
    [horas, aba, unidade],
  );

  if (horas.length < 2) return <p className="wx-vazio">Sem dados por hora para esta localidade.</p>;

  const min = aba === "temp" ? Math.min(...valores) : 0;
  const maxBruto = Math.max(...valores);
  const max = aba === "chuva" ? 100 : maxBruto === min ? min + 1 : maxBruto;
  const x = (i) => pad.x + (i / (horas.length - 1)) * (L - pad.x * 2);
  const y = (v) => A - pad.base - ((v - min) / (max - min || 1)) * (A - pad.topo - pad.base);
  const linha = valores.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${linha} L${x(horas.length - 1).toFixed(1)} ${A - pad.base} L${x(0).toFixed(1)} ${A - pad.base} Z`;

  const escolher = (ev) => {
    const caixa = ref.current?.getBoundingClientRect();
    if (!caixa || !caixa.width) return;
    const px = ((ev.clientX - caixa.left) / caixa.width) * L;
    const i = Math.round(((px - pad.x) / (L - pad.x * 2)) * (horas.length - 1));
    onAtivo(Math.max(0, Math.min(horas.length - 1, i)));
  };

  const sel = ativo >= 0 ? ativo : 0;
  const unidadeRotulo = aba === "chuva" ? "%" : aba === "vento" ? " km/h" : simboloTemperatura(unidade);
  const rotuloValor = aba === "temp" ? Math.round(valores[sel]) : Math.round(valores[sel]);

  return (
    <div className="wx-grafico">
      <div className="wx-grafico-leitura" aria-live="polite">
        <b>{rotuloValor}{unidadeRotulo}</b>
        <span>{horas[sel].hora}</span>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${L} ${A}`}
        className="wx-grafico-svg"
        role="img"
        aria-label={`Gráfico por hora de ${ABAS.find((a) => a.id === aba)?.rotulo.toLowerCase()}`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); escolher(e); }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") escolher(e); }}
      >
        <path d={area} className="wx-grafico-area" />
        <path d={linha} className="wx-grafico-linha" />
        <line x1={x(sel)} x2={x(sel)} y1={pad.topo - 6} y2={A - pad.base} className="wx-grafico-guia" />
        <circle cx={x(sel)} cy={y(valores[sel])} r="4" className="wx-grafico-ponto" />
      </svg>
      <div className="wx-grafico-eixo">
        {[0, Math.floor(horas.length / 3), Math.floor((horas.length * 2) / 3), horas.length - 1].map((i) => (
          <span key={i}>{horas[i].hora}</span>
        ))}
      </div>
    </div>
  );
}

function Detalhe({ rotulo, valor, extra }) {
  return (
    <div className="wx-detalhe">
      <span className="wx-detalhe-rotulo">{rotulo}</span>
      <b className="wx-detalhe-valor">{valor}</b>
      {extra ? <small>{extra}</small> : null}
    </div>
  );
}

export default function ClimaGoogle({ config, onConfig, compacto = false, onMinimizar, onRemover }) {
  const prefs = useMemo(() => ({ ...lerPreferenciasClima(), ...(config ?? {}) }), [config]);
  const [local, setLocal] = useState({ nome: prefs.cidade, lat: prefs.lat, lon: prefs.lon });
  const [unidade, setUnidade] = useState(prefs.unidade);
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState("carregando"); // carregando | ok | erro
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState("temp");
  const [ativo, setAtivo] = useState(-1);
  const [buscando, setBuscando] = useState(false);
  const [termo, setTermo] = useState("");
  const [sugestoes, setSugestoes] = useState([]);
  const [aviso, setAviso] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const ultimaBusca = useRef(0);

  const persistir = useCallback((patch) => {
    const novo = salvarPreferenciasClima(patch);
    onConfig?.(novo);
    return novo;
  }, [onConfig]);

  const carregar = useCallback(async (forcar = false) => {
    setAtualizando(true);
    const r = await carregarClima({ lat: local.lat, lon: local.lon, unidade, forcar, local: { nome: local.nome, lat: local.lat, lon: local.lon, pais: local.pais ?? "", uf: local.uf ?? "" }, uf: local.uf ?? "", pais: local.pais ?? "" });
    setAtualizando(false);
    if (r.ok) {
      setDados(r);
      setEstado("ok");
      setErro(r.desatualizado ? r.erro : "");
      setAtivo(-1);
    } else if (!dados) {
      setEstado("erro");
      setErro(r.erro || "não consegui carregar o clima");
    } else {
      setErro(r.erro || "falha ao atualizar; mantendo a última leitura");
    }
  }, [local, unidade, dados]);

  // carga inicial e quando a cidade muda
  useEffect(() => {
    setEstado((e) => (dados ? e : "carregando"));
    carregar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local.lat, local.lon]);

  // atualização automática só com a aba visível
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") carregar(true);
    }, INTERVALO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && dados?.atualizadoEm && Date.now() - new Date(dados.atualizadoEm).getTime() > INTERVALO_MS) carregar(true);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", aoVoltar); };
  }, [carregar, dados]);

  // busca de cidades com debounce
  useEffect(() => {
    if (!buscando || termo.trim().length < 2) { setSugestoes([]); return undefined; }
    const marca = ++ultimaBusca.current;
    const t = setTimeout(async () => {
      const r = await buscarCidades(termo);
      if (marca === ultimaBusca.current) setSugestoes(r.slice(0, 6));
    }, 280);
    return () => clearTimeout(t);
  }, [termo, buscando]);

  const escolherCidade = (c) => {
    setLocal({ nome: c.nome, lat: c.lat, lon: c.lon, pais: c.pais, uf: c.uf });
    persistir({ cidade: c.nome, lat: c.lat, lon: c.lon });
    setBuscando(false);
    setTermo("");
    setSugestoes([]);
    setDados(null);
    setEstado("carregando");
  };

  const usarMinhaLocalizacao = () => {
    setAviso("");
    if (!("geolocation" in navigator)) { setAviso("Este navegador não oferece localização."); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const nome = (await reverterCoordenadas(lat, lon).catch(() => null)) ?? null;
        const cidade = nome?.nome || nome?.cidade || "Minha localização";
        escolherCidade({ nome: cidade, lat, lon, pais: nome?.pais ?? "", uf: nome?.uf ?? "" });
      },
      (e) => {
        setAviso(
          e.code === 1
            ? "Localização negada. Libere nas permissões do navegador ou escolha uma cidade."
            : e.code === 2
              ? "Não consegui determinar sua posição agora."
              : "A localização demorou demais. Tente de novo ou escolha uma cidade.",
        );
      },
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 5 * 60 * 1000 },
    );
  };

  const alternarUnidade = () => {
    const nova = unidade === "C" ? "F" : "C";
    setUnidade(nova);
    persistir({ unidade: nova });
  };

  /* ----------------------------------------------------------- estados */
  if (estado === "carregando" && !dados) {
    return (
      <section className={`wx${compacto ? " wx-compacto" : ""}`} aria-busy="true" aria-label="Clima, carregando">
        <div className="wx-esqueleto wx-esq-topo" />
        <div className="wx-esqueleto wx-esq-graf" />
        <div className="wx-esqueleto wx-esq-dias" />
      </section>
    );
  }

  if (estado === "erro" && !dados) {
    return (
      <section className="wx wx-erro" role="alert">
        <b>Clima indisponível</b>
        <p>{erro}</p>
        <button type="button" className="wx-btn" onClick={() => { setEstado("carregando"); carregar(true); }}>Tentar de novo</button>
      </section>
    );
  }

  const a = dados.agora;
  const h = dados.hoje;
  const horas = dados.horas;
  const tempoAgora = tempoDoCodigo(a.codigo, a.isDia);
  const uv = h.uv !== null ? classificarUv(h.uv) : null;
  const ar = dados.ar;
  const avisosUnicos = agruparAvisos(dados.avisos?.disponivel ? dados.avisos.itens ?? [] : []);

  return (
    <section className={`wx${compacto ? " wx-compacto" : ""}`} aria-label={`Clima em ${dados.local.nome}`}>
      <header className="wx-topo">
        <button type="button" className="wx-cidade" onClick={() => setBuscando((v) => !v)} aria-expanded={buscando} aria-label="Trocar cidade">
          <b>{dados.local.nome}</b>
          {dados.local.uf ? <span>{dados.local.uf}</span> : null}
          <i aria-hidden="true">▾</i>
        </button>
        <div className="wx-acoes">
          <button type="button" className="wx-icone-btn" onClick={usarMinhaLocalizacao} aria-label="Usar minha localização" title="Usar minha localização"><IconeAlvo /></button>
          <button type="button" className="wx-icone-btn wx-unid" onClick={alternarUnidade} aria-label={`Mudar para ${unidade === "C" ? "Fahrenheit" : "Celsius"}`} title="Alternar °C/°F">°{unidade}</button>
          <button type="button" className={`wx-icone-btn${atualizando ? " girando" : ""}`} onClick={() => carregar(true)} disabled={atualizando} aria-label="Atualizar agora" title="Atualizar"><IconeAtualizar /></button>
          {onMinimizar ? <button type="button" className="wx-icone-btn" onClick={onMinimizar} aria-label="Minimizar widget de clima" title="Minimizar">–</button> : null}
          {onRemover ? <button type="button" className="wx-icone-btn" onClick={onRemover} aria-label="Remover widget de clima" title="Remover">×</button> : null}
        </div>
      </header>

      {buscando ? (
        <div className="wx-busca">
          <input
            autoFocus
            type="search"
            inputMode="search"
            placeholder="Buscar cidade"
            aria-label="Buscar cidade"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setBuscando(false); }}
          />
          {termo.trim().length >= 2 && !sugestoes.length ? <p className="wx-vazio">Nenhuma cidade encontrada.</p> : null}
          <ul role="listbox" aria-label="Cidades encontradas">
            {sugestoes.map((c) => (
              <li key={c.id ?? `${c.lat},${c.lon}`}>
                <button type="button" role="option" aria-selected="false" onClick={() => escolherCidade(c)}>{c.rotulo}</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {aviso ? <p className="wx-aviso" role="status">{aviso}</p> : null}
      {erro ? <p className="wx-aviso wx-aviso-forte" role="status">{erro}</p> : null}

      {avisosUnicos.length ? (
        <ul className="wx-alertas" aria-label="Alertas meteorológicos">
          {avisosUnicos.map((x) => (
            <li key={x.chave} style={x.cor ? { borderColor: `${x.cor}66`, background: `${x.cor}14` } : undefined}>
              <b style={x.cor ? { color: x.cor } : undefined}>
                {x.titulo}{x.severidade ? ` · ${x.severidade.toLowerCase()}` : ""}
              </b>
              {x.riscos.length ? <span>{x.riscos.join(" · ")}</span> : null}
              <small>
                {x.janela}
                {x.abrangencia === "municipio" ? " · vale para esta cidade" : " · aviso para o estado, pode não atingir a cidade"}
              </small>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="wx-agora">
        <IconeTempo nome={tempoAgora.icone} tamanho={compacto ? 44 : 64} titulo={tempoAgora.rotulo} />
        <div className="wx-agora-temp" aria-live="polite">
          <b>{numeroTemperatura(a.tempC, unidade)}</b>
          <span>{simboloTemperatura(unidade)}</span>
        </div>
        <div className="wx-agora-txt">
          <p>{tempoAgora.rotulo}</p>
          <small>Sensação {formatarTemperatura(a.sensacaoC, unidade)}</small>
          <small>Máx {formatarTemperatura(h.maxC, unidade)} · Mín {formatarTemperatura(h.minC, unidade)}</small>
        </div>
      </div>

      {!compacto ? (
        <>
          <div className="wx-abas" role="tablist" aria-label="Tipo de gráfico">
            {ABAS.map((x) => (
              <button key={x.id} type="button" role="tab" aria-selected={aba === x.id} className={aba === x.id ? "ativa" : ""} onClick={() => { setAba(x.id); setAtivo(-1); }}>{x.rotulo}</button>
            ))}
          </div>
          <GraficoHoras horas={horas} aba={aba} unidade={unidade} ativo={ativo} onAtivo={setAtivo} />

          <ol className="wx-dias" aria-label="Próximos dias">
            {dados.dias.slice(0, 7).map((d, i) => {
              const t = tempoDoCodigo(d.codigo, true);
              return (
                <li key={d.data}>
                  <span>{diaDaSemana(d.data, i)}</span>
                  <IconeTempo nome={t.icone} tamanho={28} titulo={t.rotulo} />
                  <small>{d.chuvaMax !== null ? `${Math.round(d.chuvaMax)}%` : "—"}</small>
                  <b>{formatarTemperatura(d.maxC, unidade)}</b>
                  <em>{formatarTemperatura(d.minC, unidade)}</em>
                </li>
              );
            })}
          </ol>

          <div className="wx-detalhes">
            <Detalhe rotulo="Umidade" valor={a.umidade !== null ? `${Math.round(a.umidade)}%` : "—"} />
            <Detalhe rotulo="Vento" valor={formatarVento(a.ventoKmh)} extra={a.ventoGraus !== null ? `de ${direcaoVento(a.ventoGraus).sigla} (${direcaoVento(a.ventoGraus).nome})` : null} />
            <Detalhe rotulo="Pressão" valor={formatarPressao(a.pressaoHpa)} />
            <Detalhe rotulo="Índice UV" valor={uv ? `${Math.round(h.uv)} · ${uv.rotulo}` : "—"} />
            <Detalhe rotulo="Nascer do sol" valor={h.nascer || "—"} />
            <Detalhe rotulo="Pôr do sol" valor={h.por || "—"} />
            <Detalhe rotulo="Chuva hoje" valor={h.chuvaMax !== null ? `${Math.round(h.chuvaMax)}%` : "—"} />
            {ar ? <Detalhe rotulo="Qualidade do ar" valor={`${Math.round(ar.valor)} · ${ar.faixa.rotulo}`} extra={ar.pm25 !== null ? `PM2,5 ${Math.round(ar.pm25)} µg/m³` : null} /> : null}
          </div>
        </>
      ) : null}

      <footer className="wx-rodape">
        <span>
          {dados.desatualizado ? "Desatualizado · " : ""}
          Atualizado às {horaDe(dados.atualizadoEm)}
          {dados.doCache ? " (cache)" : ""}
        </span>
        <span className="wx-fontes">
          {(dados.fontes ?? []).map((f, i) => (
            <a key={f.url ?? i} href={f.url} target="_blank" rel="noopener noreferrer">{f.nome}</a>
          ))}
        </span>
      </footer>
    </section>
  );
}
