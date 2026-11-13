import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORIAS,
  IDS_CATEGORIAS,
  apagarCategoria,
  categoriasPadrao,
  exportarMeusDadosJSON,
  inventarioCookies,
  lerConsentimento,
  precisaDecidir,
  revogar as revogarConsentimento,
  salvarConsentimento,
  tamanhoAproximado,
  aoMudarConsentimento,
} from "../consentimento.js";
import "../consentimento.css";

/**
 * Abre o painel de preferências a partir de qualquer componente.
 * O banner (ou qualquer PainelCookies montado) escuta o evento.
 */
export function abrirPreferenciasCookies(origem = "app") {
  try {
    window.dispatchEvent(new CustomEvent("skynet:cookies", { detail: { origem } }));
    return true;
  } catch {
    return false;
  }
}

/** Hook prático: devolve a função que abre o painel. */
export function usePreferenciasCookies() {
  return useCallback((origem) => abrirPreferenciasCookies(origem || "app"), []);
}

const ROTULO_ACAO = {
  "aceitar-tudo": "Aceitou tudo",
  "so-essenciais": "Escolheu só essenciais",
  personalizar: "Personalizou",
  salvar: "Salvou a escolha",
  revogar: "Revogou tudo",
};

function formatarData(iso) {
  if (!iso) return "sem registro";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "data inválida";
  try {
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

function formatarBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`.replace(".", ",");
  return `${(n / (1024 * 1024)).toFixed(2)} MB`.replace(".", ",");
}

function baixarJSON(nome, conteudo) {
  try {
    const blob = new Blob([conteudo], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Painel completo de cookies.
 * Props:
 *  - modo: "overlay" (padrão, vindo do banner) ou "embutido" (página /privacidade)
 *  - onFechar?: () => void
 *  - onSalvar?: (categorias, acao) => void   quando o pai quer controlar o fechamento
 *  - onRevogar?: () => void
 */
export default function PainelCookies({ modo = "overlay", onFechar, onSalvar, onRevogar }) {
  const [salvo, setSalvo] = useState(() => lerConsentimento());
  const [rascunho, setRascunho] = useState(() => lerConsentimento().categorias);
  const [inventario, setInventario] = useState(() => inventarioCookies());
  const [aviso, setAviso] = useState(null);
  const [confirmandoRevogar, setConfirmandoRevogar] = useState(false);
  const caixaRef = useRef(null);
  const primeiroRef = useRef(null);
  const focoAnterior = useRef(null);

  const recarregar = useCallback(() => {
    const atual = lerConsentimento();
    setSalvo(atual);
    setRascunho(atual.categorias);
    setInventario(inventarioCookies());
  }, []);

  useEffect(() => aoMudarConsentimento(recarregar), [recarregar]);

  // foco inicial + trava de foco + Esc, só no modo overlay
  useEffect(() => {
    if (modo !== "overlay") return undefined;
    focoAnterior.current = document.activeElement;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const alvo = primeiroRef.current || caixaRef.current;
    try {
      alvo?.focus?.();
    } catch {
      /* elemento sem foco programático */
    }

    const aoTeclar = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onFechar?.();
        return;
      }
      if (e.key !== "Tab" || !caixaRef.current) return;
      const focaveis = caixaRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = anterior;
      try {
        focoAnterior.current?.focus?.();
      } catch {
        /* elemento já removido */
      }
    };
  }, [modo, onFechar]);

  const totalBytes = useMemo(() => tamanhoAproximado(inventario), [inventario]);
  const porCategoria = useMemo(() => {
    const mapa = {};
    for (const id of IDS_CATEGORIAS) mapa[id] = inventario.filter((i) => i.categoria === id);
    return mapa;
  }, [inventario]);

  const alternar = (id) => {
    if (id === "essenciais") return;
    setRascunho((atual) => ({ ...atual, [id]: !atual[id] }));
    setAviso(null);
  };

  const salvar = () => {
    const gravado = salvarConsentimento(rascunho, "personalizar");
    setSalvo(gravado);
    setInventario(inventarioCookies());
    setAviso({
      tipo: "ok",
      texto: `Preferência salva. Vale até ${formatarData(gravado.expiraEm)}.`,
    });
    onSalvar?.(rascunho, "personalizar");
  };

  const revogarTudo = () => {
    if (!confirmandoRevogar) {
      setConfirmandoRevogar(true);
      setAviso({
        tipo: "alerta",
        texto: "Revogar apaga agora as chaves de preferências, analíticos e marketing deste navegador. Clique de novo para confirmar.",
      });
      return;
    }
    revogarConsentimento();
    setConfirmandoRevogar(false);
    setAviso({
      tipo: "ok",
      texto: "Consentimento revogado. As chaves não essenciais foram apagadas deste navegador.",
    });
    recarregar();
    onRevogar?.();
  };

  const apagar = (categoria) => {
    const removidos = apagarCategoria(categoria);
    setInventario(inventarioCookies());
    setAviso({
      tipo: removidos.length ? "ok" : "alerta",
      texto: removidos.length
        ? `${removidos.length} chave(s) de ${categoria} apagada(s): ${removidos.join(", ")}.`
        : `Nenhuma chave de ${categoria} estava guardada neste navegador.`,
    });
    recarregar();
  };

  const exportar = () => {
    const nome = `skynet-dados-${new Date().toISOString().slice(0, 10)}.json`;
    const ok = baixarJSON(nome, exportarMeusDadosJSON());
    setAviso({
      tipo: ok ? "ok" : "alerta",
      texto: ok ? `Arquivo ${nome} gerado com consentimento e inventário.` : "O navegador bloqueou o download. Tente pelo botão Exportar da página de privacidade.",
    });
  };

  const historico = [...(salvo.registro || [])].reverse();

  const corpo = (
    <div className="ck-painel">
      {modo === "overlay" && (
        <div className="ck-overlay-topo">
          <div>
            <p className="ck-eyebrow">Preferências</p>
            <h2 className="ck-titulo" id="ck-painel-titulo">
              Cookies e armazenamento
            </h2>
          </div>
          <button type="button" className="ck-fechar" onClick={onFechar} aria-label="Fechar preferências de cookies">
            ×
          </button>
        </div>
      )}

      <section className="ck-caixa" aria-labelledby={modo === "overlay" ? "ck-painel-titulo" : "ck-painel-titulo-embutido"}>
        {modo !== "overlay" && (
          <>
            <p className="ck-eyebrow">Preferências</p>
            <h2 className="ck-titulo" id="ck-painel-titulo-embutido">
              Escolha o que este navegador pode guardar
            </h2>
          </>
        )}
        <p className="ck-sub">
          Essenciais ficam sempre ligadas porque mantêm a sessão e a segurança. As outras só gravam
          depois que você liga e salva.
        </p>

        {precisaDecidir() && (
          <p className="ck-aviso ck-alerta" style={{ marginTop: 12 }}>
            <b>Você ainda não decidiu</b> (ou a decisão anterior expirou). Nada além do essencial
            está sendo gravado.
          </p>
        )}

        <div style={{ marginTop: 6 }}>
          {CATEGORIAS.map((cat) => {
            const ligada = cat.sempre ? true : Boolean(rascunho[cat.id]);
            return (
              <div className="ck-cat" key={cat.id}>
                <div>
                  <p className="ck-cat-nome">
                    {cat.rotulo}
                    {cat.sempre && <span className="ck-etiqueta">sempre ligada</span>}
                    <span className="ck-etiqueta">
                      {porCategoria[cat.id]?.length || 0} chave(s)
                    </span>
                  </p>
                  <p className="ck-cat-desc">{cat.descricao}</p>
                  <p className="ck-cat-meta">
                    finalidade: {cat.finalidade} · exemplo: {cat.exemplos}
                  </p>
                </div>
                <button
                  type="button"
                  className="perm-toggle"
                  role="switch"
                  aria-checked={ligada}
                  aria-label={`${cat.rotulo}: ${ligada ? "ligada" : "desligada"}`}
                  disabled={Boolean(cat.sempre)}
                  onClick={() => alternar(cat.id)}
                />
              </div>
            );
          })}
        </div>

        <div className="ck-acoes" style={{ marginTop: 16 }}>
          <button type="button" className="ck-btn ck-primario" onClick={salvar}>
            Salvar preferências
          </button>
          <button
            type="button"
            className="ck-btn"
            onClick={() => {
              setRascunho(categoriasPadrao());
              setAviso({ tipo: "ok", texto: "Só os essenciais ficaram ligados. Clique em Salvar para aplicar." });
            }}
          >
            Só essenciais
          </button>
          <span className="ck-espaco" />
          <button type="button" className="ck-btn ck-fantasma" onClick={exportar}>
            Exportar JSON
          </button>
        </div>

        {aviso && (
          <p className={`ck-aviso ${aviso.tipo === "ok" ? "ck-ok" : aviso.tipo === "alerta" ? "ck-alerta" : ""}`} style={{ marginTop: 12 }} role="status">
            {aviso.texto}
          </p>
        )}
      </section>

      <section className="ck-caixa" aria-labelledby="ck-inventario-titulo">
        <p className="ck-eyebrow">Inventário real</p>
        <h2 className="ck-titulo" id="ck-inventario-titulo">
          O que este navegador guarda agora
        </h2>
        <p className="ck-sub">
          Lido do próprio navegador (cookies, localStorage e sessionStorage). Tamanho aproximado:{" "}
          <b>{formatarBytes(totalBytes)}</b> em {inventario.length} item(ns).
        </p>

        <div className="perm-tabela-wrap" style={{ marginTop: 12 }}>
          {inventario.length === 0 ? (
            <p className="perm-vazio">Nenhuma chave deste site encontrada neste navegador.</p>
          ) : (
            <table className="perm-tabela">
              <caption>Inventário de cookies e chaves locais</caption>
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">Origem</th>
                  <th scope="col">Categoria</th>
                  <th scope="col">Validade</th>
                  <th scope="col">Finalidade</th>
                </tr>
              </thead>
              <tbody>
                {inventario.map((item) => (
                  <tr key={`${item.onde}:${item.nome}`}>
                    <td>
                      <code>{item.nome}</code>
                      <span className="perm-onde">{item.onde}</span>
                    </td>
                    <td>{item.party === "propria" ? "própria" : "terceiro"}</td>
                    <td>{item.categoria}</td>
                    <td>{item.validade || "não informada"}</td>
                    <td>{item.finalidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="ck-acoes" style={{ marginTop: 12 }}>
          {IDS_CATEGORIAS.filter((id) => id !== "essenciais").map((id) => (
            <button
              key={id}
              type="button"
              className="ck-btn ck-pequeno ck-perigo"
              onClick={() => apagar(id)}
              disabled={!porCategoria[id]?.length}
            >
              Apagar {id}
            </button>
          ))}
        </div>
      </section>

      <section className="ck-caixa" aria-labelledby="ck-historico-titulo">
        <p className="ck-eyebrow">Histórico</p>
        <h2 className="ck-titulo" id="ck-historico-titulo">
          Suas decisões
        </h2>
        <p className="ck-sub">
          Última decisão: {formatarData(salvo.decididoEm)} · expira em {formatarData(salvo.expiraEm)}.
        </p>

        {historico.length === 0 ? (
          <p className="perm-vazio" style={{ paddingLeft: 0 }}>
            Nenhuma decisão registrada ainda.
          </p>
        ) : (
          <ul className="perm-historico" style={{ marginTop: 12 }}>
            {historico.map((reg, i) => (
              <li key={`${reg.quando}-${i}`}>
                <time dateTime={reg.quando}>{formatarData(reg.quando)}</time>
                <span>
                  <b>{ROTULO_ACAO[reg.acao] || reg.acao}</b>
                  {" · "}
                  {(reg.categorias || []).join(", ") || "nenhuma categoria"}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="ck-acoes" style={{ marginTop: 14 }}>
          <button type="button" className="ck-btn ck-perigo" onClick={revogarTudo}>
            {confirmandoRevogar ? "Confirmar revogação" : "Revogar tudo"}
          </button>
          {confirmandoRevogar && (
            <button type="button" className="ck-btn ck-fantasma" onClick={() => setConfirmandoRevogar(false)}>
              Cancelar
            </button>
          )}
          <span className="ck-espaco" />
          <button type="button" className="ck-btn ck-fantasma" onClick={exportar}>
            Exportar meus dados
          </button>
        </div>
      </section>
    </div>
  );

  if (modo !== "overlay") return corpo;

  return (
    <div className="ck-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onFechar?.()}>
      <div
        className="ck-overlay-caixa"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ck-painel-titulo"
        ref={caixaRef}
        tabIndex={-1}
      >
        <span ref={primeiroRef} tabIndex={-1} aria-hidden="true" />
        {corpo}
      </div>
    </div>
  );
}
