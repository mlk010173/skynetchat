// SKYNET · gravação de áudio no navegador, com nível para a onda sonora,
// pausa/retomada e cancelamento. Sem dependências externas.
export async function iniciarGravacao({ onNivel } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("microfone indisponível");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  // não bloqueia: em alguns navegadores resume() só resolve após gesto
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const fonte = ctx.createMediaStreamSource(stream);
  const analisador = ctx.createAnalyser();
  analisador.fftSize = 512;
  fonte.connect(analisador);
  const amostra = new Uint8Array(analisador.frequencyBinCount);
  let raf = 0;
  let pausado = false;

  const medir = () => {
    if (!pausado) {
      analisador.getByteTimeDomainData(amostra);
      let soma = 0;
      for (let i = 0; i < amostra.length; i += 1) {
        const v = (amostra[i] - 128) / 128;
        soma += v * v;
      }
      const rms = Math.sqrt(soma / amostra.length);
      // escala perceptual: fala normal fica na metade da onda
      onNivel?.(Math.min(1, Math.pow(rms * 3.2, 0.62)));
    }
    raf = requestAnimationFrame(medir);
  };
  medir();

  const rec = new MediaRecorder(stream);
  const pedacos = [];
  rec.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data); };
  rec.start(200);

  const encerrarTrilhas = () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    try { ctx.close(); } catch {}
  };

  return {
    get pausado() { return pausado; },
    pausar() {
      if (rec.state === "recording") { rec.pause(); pausado = true; onNivel?.(0); }
    },
    retomar() {
      if (rec.state === "paused") { rec.resume(); pausado = false; }
    },
    parar() {
      return new Promise((resolver) => {
        const tipo = rec.mimeType || "audio/webm";
        rec.onstop = () => {
          const blob = new Blob(pedacos, { type: tipo });
          encerrarTrilhas();
          resolver(blob);
        };
        try { rec.stop(); } catch { encerrarTrilhas(); resolver(new Blob(pedacos, { type: tipo })); }
      });
    },
    cancelar() {
      try { rec.stop(); } catch {}
      encerrarTrilhas();
    },
  };
}

export function duracaoLegivel(segundos) {
  const s = Math.max(0, Math.round(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
