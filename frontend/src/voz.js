// Voz local no navegador, sem chave de API:
//  - reconhecimento de fala com Whisper (transformers.js / onnx)
//  - sintese de voz neural com MMS-TTS pt-BR (mesmo motor do Piper local: modelo onnx no navegador)
// Tudo roda offline depois do primeiro download; nenhum audio sai do dispositivo.

const CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/transformers.min.js";

let libPromessa = null;
async function carregarLib() {
  if (!libPromessa) libPromessa = import(/* @vite-ignore */ CDN);
  return libPromessa;
}

const modelos = { asr: null, tts: null };
let asrCarregando = null;
let ttsCarregando = null;

/** Carrega (uma vez) o Whisper para transcricao. */
export async function carregarWhisper(onProgress) {
  if (modelos.asr) return modelos.asr;
  if (asrCarregando) return asrCarregando;
  asrCarregando = (async () => {
    const { pipeline, env } = await carregarLib();
    env.allowLocalModels = false;
    const asr = await pipeline("automatic-speech-recognition", "Xenova/whisper-small", {
      dtype: "q8",
      progress_callback: (p) => onProgress?.(p),
    });
    modelos.asr = asr;
    return asr;
  })();
  try {
    return await asrCarregando;
  } finally {
    asrCarregando = null;
  }
}

/** Carrega (uma vez) o TTS neural local em portugues. */
export async function carregarVoz(onProgress) {
  if (modelos.tts) return modelos.tts;
  if (ttsCarregando) return ttsCarregando;
  ttsCarregando = (async () => {
    const { pipeline, env } = await carregarLib();
    env.allowLocalModels = false;
    const tts = await pipeline("text-to-speech", "Xenova/mms-tts-por", {
      progress_callback: (p) => onProgress?.(p),
    });
    modelos.tts = tts;
    return tts;
  })();
  try {
    return await ttsCarregando;
  } finally {
    ttsCarregando = null;
  }
}

/** Reamostra para 16 kHz mono (formato que o Whisper espera). */
function reamostrar(origem, taxaOrigem, taxaDestino = 16000) {
  if (taxaOrigem === taxaDestino) return origem;
  const razao = taxaOrigem / taxaDestino;
  const tamanho = Math.floor(origem.length / razao);
  const saida = new Float32Array(tamanho);
  for (let i = 0; i < tamanho; i++) {
    const inicio = Math.floor(i * razao);
    const fim = Math.min(Math.floor((i + 1) * razao), origem.length);
    let soma = 0;
    for (let j = inicio; j < fim; j++) soma += origem[j];
    saida[i] = soma / Math.max(1, fim - inicio);
  }
  return saida;
}

/** Converte um Blob de audio em Float32Array 16 kHz mono. */
export async function audioParaFloat32(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
  const canal = buffer.getChannelData(0);
  const pcm = reamostrar(canal, buffer.sampleRate, 16000);
  await ctx.close();
  return pcm;
}

/** Transcreve um Float32Array (16 kHz) em portugues. */
export async function transcrever(pcm, { onProgress, idioma = "portuguese" } = {}) {
  const asr = await carregarWhisper(onProgress);
  const saida = await asr(pcm, { language: idioma, task: "transcribe", chunk_length_s: 25, stride_length_s: 5 });
  const texto = Array.isArray(saida) ? saida.map((s) => s.text).join(" ") : saida?.text ?? "";
  return String(texto).replace(/\s+/g, " ").trim();
}

/** Grava o microfone e devolve o audio como Blob. */
export async function gravarMicrofone({ onNivel } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const tipo = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
  const gravador = new MediaRecorder(stream, { mimeType: tipo });
  const pedacos = [];

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const fonte = ctx.createMediaStreamSource(stream);
  const analisador = ctx.createAnalyser();
  analisador.fftSize = 512;
  fonte.connect(analisador);
  const dados = new Uint8Array(analisador.frequencyBinCount);
  let nivelTimer = null;
  if (onNivel) {
    nivelTimer = setInterval(() => {
      analisador.getByteTimeDomainData(dados);
      let pico = 0;
      for (const v of dados) pico = Math.max(pico, Math.abs(v - 128) / 128);
      onNivel(pico);
    }, 120);
  }

  gravador.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data); };
  gravador.start(250);

  const parar = () => new Promise((resolve) => {
    gravador.onstop = resolve;
    try { gravador.stop(); } catch { resolve(); }
  });

  return {
    async finalizar() {
      await parar();
      clearInterval(nivelTimer);
      stream.getTracks().forEach((t) => t.stop());
      try { await ctx.close(); } catch { /* ja fechado */ }
      return new Blob(pedacos, { type: "audio/webm" });
    },
    cancelar() {
      clearInterval(nivelTimer);
      try { gravador.stop(); } catch { /* ignorado */ }
      stream.getTracks().forEach((t) => t.stop());
      try { ctx.close(); } catch { /* ignorado */ }
    },
  };
}

function wavDeFloat32(pcm, taxa = 16000) {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const escrever = (pos, s) => { for (let i = 0; i < s.length; i++) view.setUint8(pos + i, s.charCodeAt(i)); };
  escrever(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  escrever(8, "WAVE");
  escrever(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, taxa, true);
  view.setUint32(28, taxa * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  escrever(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let off = 44;
  for (let i = 0; i < pcm.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

let audioAtual = null;

/** Fala um texto com a voz neural local (cai para a voz do sistema se falhar). */
export async function falar(texto, { onProgress, velocidade = 1 } = {}) {
  const limpo = String(texto || "").replace(/[#*_`>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 900);
  if (!limpo) return { ok: false, erro: "texto vazio" };
  pararFala();
  try {
    const tts = await carregarVoz(onProgress);
    const saida = await tts(limpo);
    const pcm = saida?.audio instanceof Float32Array ? saida.audio : new Float32Array(saida?.audio ?? []);
    if (!pcm.length) throw new Error("audio vazio");
    const blob = wavDeFloat32(pcm, saida.sampling_rate ?? 16000);
    const url = URL.createObjectURL(blob);
    audioAtual = new Audio(url);
    audioAtual.playbackRate = velocidade;
    let tocado = true;
    try {
      await audioAtual.play();
    } catch {
      // navegador bloqueia audio sem gesto do usuario; a voz foi gerada mesmo assim
      tocado = false;
    }
    return { ok: true, motor: "mms-tts-por", url, wav: blob, tocado };
  } catch (e) {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(limpo);
      u.lang = "pt-BR";
      u.rate = velocidade;
      window.speechSynthesis.speak(u);
      return { ok: true, motor: "sistema", erro: String(e).slice(0, 80) };
    }
    return { ok: false, erro: String(e).slice(0, 120) };
  }
}

export function pararFala() {
  try { audioAtual?.pause(); } catch { /* ignorado */ }
  audioAtual = null;
  try { window.speechSynthesis?.cancel(); } catch { /* ignorado */ }
}

if (typeof window !== "undefined") {
  window.SKYVoz = {
    carregarWhisper,
    carregarVoz,
    transcrever,
    audioParaFloat32,
    gravarMicrofone,
    falar,
    pararFala,
    wavDeFloat32,
  };
}
