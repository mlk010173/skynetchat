// SKYNET · painel inferior de anexos com três abas reais: galeria, câmera e arquivos.
// Galeria e arquivos usam <input type="file"> do próprio dispositivo; a câmera abre
// getUserMedia e, se o navegador negar, cai no seletor com capture="environment".
import { useEffect, useRef, useState } from "react";

const ABAS = [
  { id: "galeria", rotulo: "Galeria", icone: "▤" },
  { id: "camera", rotulo: "Câmera", icone: "◎" },
  { id: "arquivos", rotulo: "Arquivos", icone: "🗎" },
];

const ACEITA_ARQUIVOS = ".pdf,.doc,.docx,.txt,.md,.json,.csv,.js,.ts,.tsx,.py,.html,.css,.log,.yml,.yaml,.xls,.xlsx,.ppt,.pptx,.zip,.rtf";

export default function AnexosSheet({ aberta, aoFechar, aoAnexar, say }) {
  const [aba, setAba] = useState("galeria");
  const [cameraOk, setCameraOk] = useState(null);
  const [capturando, setCapturando] = useState(false);
  const galeriaRef = useRef(null);
  const arquivosRef = useRef(null);
  const cameraInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const soltarCamera = () => {
    streamRef.current?.getTracks?.().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // liga a câmera só enquanto a aba estiver ativa
  useEffect(() => {
    if (!aberta || aba !== "camera") { soltarCamera(); return undefined; }
    let vivo = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
        if (!vivo) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraOk(true);
      } catch {
        if (vivo) setCameraOk(false);
      }
    })();
    return () => { vivo = false; soltarCamera(); };
  }, [aberta, aba]);

  useEffect(() => {
    if (!aberta) { setAba("galeria"); setCameraOk(null); }
  }, [aberta]);

  useEffect(() => {
    if (!aberta) return undefined;
    const esc = (e) => { if (e.key === "Escape") aoFechar?.(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberta, aoFechar]);

  const escolher = (lista) => {
    const arquivos = [...(lista || [])];
    if (!arquivos.length) return;
    aoAnexar?.(arquivos);
    aoFechar?.();
  };

  const capturar = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) { say?.("A câmera ainda está abrindo."); return; }
    setCapturando(true);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      setCapturando(false);
      if (!blob) { say?.("Não consegui capturar a foto."); return; }
      const nome = `foto-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jpg`;
      const arquivo = new File([blob], nome, { type: "image/jpeg" });
      aoAnexar?.([arquivo]);
      aoFechar?.();
    }, "image/jpeg", 0.92);
  };

  if (!aberta) return null;

  return (
    <div className="anexos-overlay" role="presentation" onClick={aoFechar}>
      <section
        className="anexos-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Anexar ao chat"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="anexos-topo">
          <span className="anexos-puxador" aria-hidden="true" />
          <h3>Anexar</h3>
          <button type="button" className="anexos-fechar" aria-label="Fechar" onClick={aoFechar}>×</button>
        </header>

        <div className="anexos-abas" role="tablist">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              className={`anexos-aba${aba === a.id ? " on" : ""}`}
              onClick={() => setAba(a.id)}
            >
              <span aria-hidden="true">{a.icone}</span> {a.rotulo}
            </button>
          ))}
        </div>

        <div className="anexos-painel" role="tabpanel">
          {aba === "galeria" && (
            <div className="anexos-caixa">
              <p>Escolha fotos ou vídeos curtos do seu aparelho.</p>
              <button type="button" className="anexos-primario" onClick={() => galeriaRef.current?.click()}>
                Abrir galeria
              </button>
              <input
                ref={galeriaRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => { escolher(e.target.files); e.target.value = ""; }}
              />
            </div>
          )}

          {aba === "camera" && (
            <div className="anexos-caixa">
              {cameraOk === false ? (
                <>
                  <p>O navegador não liberou a câmera aqui. Você ainda pode tirar a foto pelo seletor do sistema.</p>
                  <button type="button" className="anexos-primario" onClick={() => cameraInputRef.current?.click()}>
                    Usar câmera do aparelho
                  </button>
                </>
              ) : (
                <>
                  <div className="anexos-video">
                    <video ref={videoRef} playsInline muted aria-label="Prévia da câmera" />
                  </div>
                  <button type="button" className="anexos-primario" onClick={capturar} disabled={!cameraOk || capturando}>
                    {capturando ? "capturando…" : cameraOk ? "Tirar foto" : "abrindo câmera…"}
                  </button>
                </>
              )}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => { escolher(e.target.files); e.target.value = ""; }}
              />
            </div>
          )}

          {aba === "arquivos" && (
            <div className="anexos-caixa">
              <p>PDFs, documentos, planilhas, código e textos.</p>
              <button type="button" className="anexos-primario" onClick={() => arquivosRef.current?.click()}>
                Escolher arquivos
              </button>
              <input
                ref={arquivosRef}
                type="file"
                accept={ACEITA_ARQUIVOS}
                multiple
                hidden
                onChange={(e) => { escolher(e.target.files); e.target.value = ""; }}
              />
            </div>
          )}
        </div>
        <p className="anexos-dica">até 8 itens · imagens 40 MB · arquivos 20 MB</p>
      </section>
    </div>
  );
}
