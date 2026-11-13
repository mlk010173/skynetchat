// SKYNET · clima na experiência inicial: abrir, minimizar (vira pílula) e remover, com
// restauração. A escolha fica salva no navegador. A posição é "antes/depois" dos atalhos,
// ajustável por botões (teclado e toque) ou arrastando.
import { useCallback, useEffect, useRef, useState } from "react";
import ClimaGoogle, { IconeTempo } from "./ClimaGoogle.jsx";
import { carregarClima, formatarTemperatura, lerPreferenciasClima, tempoDoCodigo } from "./clima-api.js";
import "./widgets-novos.css";

export const CHAVE_CLIMA_HOME = "skynet.widget.clima.home.v1";
const ESTADOS = ["aberto", "minimizado", "removido"];

export function lerEstadoClimaHome() {
  try {
    const bruto = JSON.parse(globalThis.localStorage?.getItem(CHAVE_CLIMA_HOME) || "null");
    return {
      estado: ESTADOS.includes(bruto?.estado) ? bruto.estado : "aberto",
      posicao: bruto?.posicao === "depois" ? "depois" : "antes",
    };
  } catch {
    return { estado: "aberto", posicao: "antes" };
  }
}

export function salvarEstadoClimaHome(patch) {
  const novo = { ...lerEstadoClimaHome(), ...patch };
  try { globalThis.localStorage?.setItem(CHAVE_CLIMA_HOME, JSON.stringify(novo)); } catch { /* modo privado */ }
  globalThis.dispatchEvent?.(new CustomEvent("skynet:clima-home", { detail: novo }));
  return novo;
}

export function restaurarClimaHome() {
  return salvarEstadoClimaHome({ estado: "aberto" });
}

/** Hook: estado compartilhado entre o widget e o botão de restaurar. */
export function useClimaHome() {
  const [s, setS] = useState(lerEstadoClimaHome);
  useEffect(() => {
    const aoMudar = (e) => setS(e.detail ?? lerEstadoClimaHome());
    globalThis.addEventListener("skynet:clima-home", aoMudar);
    return () => globalThis.removeEventListener("skynet:clima-home", aoMudar);
  }, []);
  const mudar = useCallback((patch) => setS(salvarEstadoClimaHome(patch)), []);
  return [s, mudar];
}

/** Pílula minimizada: temperatura real, clique para abrir. */
function Pilula({ onAbrir, onRemover }) {
  const [resumo, setResumo] = useState(null);
  useEffect(() => {
    let vivo = true;
    const p = lerPreferenciasClima();
    carregarClima({ lat: p.lat, lon: p.lon, unidade: p.unidade, local: { nome: p.cidade, lat: p.lat, lon: p.lon } }).then((r) => {
      if (vivo && r.ok) setResumo({ nome: r.local.nome, temp: formatarTemperatura(r.agora.tempC, p.unidade), icone: tempoDoCodigo(r.agora.codigo, r.agora.isDia).icone });
    });
    return () => { vivo = false; };
  }, []);
  return (
    <div className="wx-pilula" role="group" aria-label="Clima minimizado">
      <button type="button" onClick={onAbrir} aria-label="Abrir widget de clima">
        {resumo ? <IconeTempo nome={resumo.icone} tamanho={24} /> : <span aria-hidden="true">☁</span>}
        <b>{resumo ? resumo.temp : "Clima"}</b>
        {resumo ? <span>{resumo.nome}</span> : null}
      </button>
      <button type="button" className="wx-pilula-x" onClick={onRemover} aria-label="Remover widget de clima">×</button>
    </div>
  );
}

/** Botão discreto para trazer o clima de volta depois de removido. */
export function RestaurarClima() {
  const [s, mudar] = useClimaHome();
  if (s.estado !== "removido") return null;
  return (
    <button type="button" className="wx-restaurar" onClick={() => mudar({ estado: "aberto" })}>
      Restaurar widget de clima
    </button>
  );
}

export default function ClimaHome() {
  const [s, mudar] = useClimaHome();
  const [confirmando, setConfirmando] = useState(false);
  const arraste = useRef(null);

  if (s.estado === "removido") return null;

  const iniciarArraste = (e) => {
    if (e.target.closest("button, a, input")) return; // só arrasta pela borda/fundo
    arraste.current = { y: e.clientY };
  };
  const soltarArraste = (e) => {
    if (!arraste.current) return;
    const dy = e.clientY - arraste.current.y;
    arraste.current = null;
    if (Math.abs(dy) > 60) mudar({ posicao: dy > 0 ? "depois" : "antes" });
  };

  return (
    <div
      className="wx-home"
      data-posicao={s.posicao}
      onPointerDown={iniciarArraste}
      onPointerUp={soltarArraste}
      onPointerCancel={() => { arraste.current = null; }}
    >
      {s.estado === "minimizado" ? (
        <Pilula onAbrir={() => mudar({ estado: "aberto" })} onRemover={() => setConfirmando(true)} />
      ) : (
        <>
          <ClimaGoogle onMinimizar={() => mudar({ estado: "minimizado" })} onRemover={() => setConfirmando(true)} />
          <div className="wx-mover" role="group" aria-label="Posição do widget de clima">
            <button type="button" onClick={() => mudar({ posicao: "antes" })} disabled={s.posicao === "antes"}>Subir</button>
            <button type="button" onClick={() => mudar({ posicao: "depois" })} disabled={s.posicao === "depois"}>Descer</button>
          </div>
        </>
      )}
      {confirmando ? (
        <div className="wx-confirma" role="alertdialog" aria-label="Remover widget de clima">
          <p>Remover o clima da tela inicial? Você pode restaurar depois.</p>
          <button type="button" onClick={() => { setConfirmando(false); mudar({ estado: "removido" }); }}>Remover</button>
          <button type="button" onClick={() => setConfirmando(false)}>Cancelar</button>
        </div>
      ) : null}
    </div>
  );
}
