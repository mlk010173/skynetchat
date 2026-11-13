import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { precisaDecidir, salvarConsentimento, categoriasPadrao, aoMudarConsentimento } from "../consentimento.js";
import PainelCookies from "./PainelCookies.jsx";
import "../consentimento.css";

/**
 * Banner de cookies. Aparece só quando `precisaDecidir()` é true.
 * Aceitar e recusar têm o mesmo peso visual (mesmas classes, mesma altura).
 *
 * Esc fecha o banner e abre o painel de personalização sem gravar decisão,
 * como pede a especificação. A decisão só é gravada quando o usuário escolhe.
 */
export default function BannerCookies() {
  const [visivel, setVisivel] = useState(() => {
    try {
      return precisaDecidir();
    } catch {
      return false;
    }
  });
  const [painel, setPainel] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [focoVolta, setFocoVolta] = useState(null);

  const fechar = useCallback((comAnimacao = true) => {
    if (comAnimacao) setSaindo(true);
    window.setTimeout(() => {
      setVisivel(false);
      setSaindo(false);
    }, comAnimacao ? 200 : 0);
  }, []);

  const decidir = useCallback(
    (categorias, acao) => {
      salvarConsentimento(categorias, acao);
      setPainel(false);
      fechar();
    },
    [fechar],
  );

  const abrirPainel = useCallback(() => {
    setFocoVolta(document.activeElement);
    setPainel(true);
  }, []);

  // O painel completo também pode ser aberto por qualquer lugar do app.
  useEffect(() => {
    const abrir = (evento) => {
      if (evento?.detail?.origem === "banner") return;
      setFocoVolta(document.activeElement);
      setPainel(true);
    };
    window.addEventListener("skynet:cookies", abrir);
    return () => window.removeEventListener("skynet:cookies", abrir);
  }, []);

  // Se o consentimento for decidido em outra aba/componente, o banner some.
  useEffect(() => aoMudarConsentimento(() => {
    if (!precisaDecidir()) setVisivel(false);
  }), []);

  // Esc: fecha o banner abrindo a personalização, sem decidir nada.
  useEffect(() => {
    if (!visivel || painel) return undefined;
    const aoTeclar = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      abrirPainel();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [visivel, painel, abrirPainel]);

  const fecharPainel = useCallback(() => {
    setPainel(false);
    try {
      if (focoVolta && typeof focoVolta.focus === "function") focoVolta.focus();
    } catch {
      /* elemento já removido do DOM */
    }
  }, [focoVolta]);

  return (
    <>
      {visivel && !saindo && (
        <div className="ck-banner" role="region" aria-label="Aviso de cookies">
          <div
            className="ck-banner-caixa"
            role="dialog"
            aria-modal="false"
            aria-labelledby="ck-banner-titulo"
            aria-describedby="ck-banner-texto"
          >
            <p className="ck-banner-topo" id="ck-banner-titulo">
              <span className="ck-banner-ponto" aria-hidden="true" />
              Cookies e armazenamento
            </p>

            <p className="ck-banner-texto" id="ck-banner-texto">
              O SKYNETchat guarda no seu navegador o necessário para manter a sessão e, se você
              liberar, preferências, medição e divulgação. <b>Nada além do essencial é gravado antes
              da sua escolha.</b> Você pode mudar de ideia quando quiser em{" "}
              <Link className="ck-link" to="/privacidade">
                Privacidade
              </Link>
              .
            </p>

            <p className="ck-banner-nota">
              Aceitar e recusar valem o mesmo. A escolha expira em 180 dias.
            </p>

            <div className="ck-banner-acoes">
              <button
                type="button"
                className="ck-btn ck-primario"
                onClick={() => decidir({ ...categoriasPadrao(), preferencias: true, analiticos: true, marketing: true }, "aceitar-tudo")}
              >
                Aceitar tudo
              </button>
              <button
                type="button"
                className="ck-btn ck-primario"
                onClick={() => decidir(categoriasPadrao(), "so-essenciais")}
              >
                Só essenciais
              </button>
              <button
                type="button"
                className="ck-btn ck-fantasma"
                onClick={abrirPainel}
                aria-haspopup="dialog"
                aria-expanded={painel}
              >
                Personalizar
              </button>
            </div>
          </div>
        </div>
      )}

      {painel && (
        <PainelCookies
          modo="overlay"
          onFechar={fecharPainel}
          onSalvar={(categorias, acao) => decidir(categorias, acao || "personalizar")}
          onRevogar={() => {
            setPainel(false);
            // revogar() já apaga as chaves; o banner volta a aparecer
            setVisivel(true);
          }}
        />
      )}
    </>
  );
}
