/* Motor de voz do SKYNET: TTS neural open-source no navegador (MMS-TTS pt-BR) com
   fallback para a voz do sistema, e microfone por reconhecimento do navegador. */
(function () {
  var cfg = window.__SKY_LIVE || {};
  var estado = { carregado: false, carregando: null, falando: false, audio: null, ctx: null, voz: "neuronal" };
  var MODELO = "Xenova/mms-tts-por";

  function sessao() { try { return localStorage.getItem("sky_session") || ""; } catch (e) { return ""; } }
  function cabecalhos() {
    var h = { "Content-Type": "application/json", "apikey": cfg.key, "Authorization": "Bearer " + cfg.key };
    var s = sessao(); if (s) h["x-session"] = s;
    return h;
  }

  function ctxAudio() {
    if (!estado.ctx) estado.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    if (estado.ctx.state === "suspended") estado.ctx.resume();
    return estado.ctx;
  }

  async function carregar(onProgresso) {
    if (estado.carregado) return true;
    if (estado.carregando) return estado.carregando;
    estado.carregando = (async function () {
      try {
        var tf = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/transformers.min.js");
        tf.env.allowLocalModels = false;
        var tts = await tf.pipeline("text-to-speech", MODELO, {
          dtype: "q8",
          device: "wasm",
          progress_callback: function (p) {
            if (onProgresso && p && p.status === "progress" && p.total) onProgresso(Math.round((p.loaded / p.total) * 100));
          }
        });
        estado.tts = tts;
        estado.carregado = true;
        return true;
      } catch (e) {
        estado.erro = (e && e.message) || "falha ao carregar";
        return false;
      } finally { estado.carregando = null; }
    })();
    return estado.carregando;
  }

  function parar() {
    estado.falando = false;
    try { if (estado.audio) { estado.audio.pause(); estado.audio = null; } } catch (e) {}
    try { window.speechSynthesis.cancel(); } catch (e) {}
    if (window.__skyVozBars) window.__skyVozBars(false);
  }

  function falarSistema(texto, opts) {
    return new Promise(function (resolve) {
      try {
        var u = new SpeechSynthesisUtterance(texto);
        u.lang = "pt-BR";
        u.rate = (opts && opts.velocidade) || 1;
        u.volume = (opts && opts.volume) != null ? opts.volume : 1;
        var vozes = window.speechSynthesis.getVoices() || [];
        var pt = vozes.filter(function (v) { return /pt/i.test(v.lang); });
        if (pt.length) u.voice = pt[0];
        u.onend = function () { estado.falando = false; if (window.__skyVozBars) window.__skyVozBars(false); resolve(true); };
        u.onerror = function () { estado.falando = false; resolve(false); };
        estado.falando = true;
        if (window.__skyVozBars) window.__skyVozBars(true);
        window.speechSynthesis.speak(u);
      } catch (e) { resolve(false); }
    });
  }

  async function falar(texto, opts) {
    opts = opts || {};
    var limpo = String(texto || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#*_>`]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 900);
    if (!limpo) return false;
    parar();
    var modo = opts.motor || estado.voz || "neuronal";
    if (modo === "sistema") return falarSistema(limpo, opts);
    var ok = await carregar(opts.onProgresso);
    if (!ok || !estado.tts) return falarSistema(limpo, opts);
    try {
      var saida = await estado.tts(limpo);
      var dados = saida && saida.audio ? saida.audio : saida;
      var taxa = (saida && saida.sampling_rate) || 16000;
      var arr = dados instanceof Float32Array ? dados : new Float32Array(dados);
      var ctx = ctxAudio();
      var buf = ctx.createBuffer(1, arr.length, taxa);
      buf.getChannelData(0).set(arr);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = opts.velocidade || 1;
      var ganho = ctx.createGain();
      ganho.gain.value = opts.volume != null ? opts.volume : 1;
      src.connect(ganho); ganho.connect(ctx.destination);
      estado.falando = true;
      if (window.__skyVozBars) window.__skyVozBars(true);
      await new Promise(function (resolve) {
        var terminou = false;
        var fim = function () {
          if (terminou) return;
          terminou = true;
          estado.falando = false;
          if (window.__skyVozBars) window.__skyVozBars(false);
          resolve();
        };
        src.onended = fim;
        try { src.start(); } catch (e) { fim(); return; }
        var segundos = (buf.duration || arr.length / taxa) / (opts.velocidade || 1);
        setTimeout(fim, Math.max(600, segundos * 1000 + 500));
      });
      return true;
    } catch (e) {
      return falarSistema(limpo, opts);
    }
  }

  function suportaMicrofone() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function ouvir(opcoes) {
    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return null;
    var rec = new Rec();
    rec.lang = "pt-BR";
    rec.continuous = !!(opcoes && opcoes.continuo);
    rec.interimResults = true;
    rec.onresult = function (ev) {
      var parcial = "", final = "";
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var r = ev.results[i];
        if (r.isFinal) final += r[0].transcript; else parcial += r[0].transcript;
      }
      if (opcoes && opcoes.onTexto) opcoes.onTexto(parcial, final);
    };
    rec.onerror = function (ev) { if (opcoes && opcoes.onErro) opcoes.onErro(ev.error || "erro"); };
    rec.onend = function () { if (opcoes && opcoes.onFim) opcoes.onFim(); };
    try { rec.start(); } catch (e) { return null; }
    return rec;
  }

  async function conversar(texto, opts) {
    opts = opts || {};
    var r = await fetch(cfg.url + "/functions/v1/chat", {
      method: "POST",
      headers: cabecalhos(),
      body: JSON.stringify({ content: texto, model: "auto" })
    });
    if (!r.ok || !r.body) throw new Error("HTTP " + r.status);
    var reader = r.body.getReader(), dec = new TextDecoder(), buf = "", completo = "";
    for (;;) {
      var x = await reader.read();
      if (x.done) break;
      buf += dec.decode(x.value, { stream: true });
      var blocos = buf.split("\n\n"); buf = blocos.pop() || "";
      for (var i = 0; i < blocos.length; i++) {
        var l = blocos[i].trim();
        if (l.indexOf("data:") !== 0) continue;
        var d; try { d = JSON.parse(l.slice(5).trim()); } catch (e) { continue; }
        if (d.delta) { completo += d.delta; if (opts.onDelta) opts.onDelta(completo); }
      }
    }
    return completo;
  }

  window.SKYVoz = {
    falar: falar, parar: parar, ouvir: ouvir, conversar: conversar,
    suportaMicrofone: suportaMicrofone, carregar: carregar,
    get estado() { return estado; },
    set motor(v) { estado.voz = v; },
    get motor() { return estado.voz; }
  };
})();
