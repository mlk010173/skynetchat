class PCM16AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.sourceToTargetRatio = sampleRate / this.targetSampleRate;
    this.resampleRemaining = this.sourceToTargetRatio;
    this.resampleSum = 0;
    this.resampleWeight = 0;
    this.output = new Float32Array(128);
    this.outputLength = 0;
  }

  pushSample(sample) {
    this.output[this.outputLength++] = sample;
    if (this.outputLength < this.output.length) return;

    const pcm16 = new Int16Array(this.output.length);
    for (let i = 0; i < this.output.length; i++) {
      const value = Math.max(-1, Math.min(1, this.output[i]));
      pcm16[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
    }

    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    this.outputLength = 0;
  }

  resample(input) {
    // Alguns WebKit/iOS ignoram AudioContext({ sampleRate: 16000 }) quando já existe
    // outro contexto de reprodução. O STT, porém, sempre espera PCM16 a 16 kHz.
    // Reamostrar aqui torna o formato independente da taxa real do hardware (44,1/48 kHz).
    if (Math.abs(sampleRate - this.targetSampleRate) < 1) {
      for (let i = 0; i < input.length; i++) this.pushSample(input[i]);
      return;
    }

    // Média ponderada por intervalo: preserva a fase entre quantums e também age como
    // um filtro passa-baixa simples antes do downsample, evitando aliasing de voz aguda.
    for (let i = 0; i < input.length; i++) {
      let inputRemaining = 1;
      while (inputRemaining > 1e-9) {
        const weight = Math.min(inputRemaining, this.resampleRemaining);
        this.resampleSum += input[i] * weight;
        this.resampleWeight += weight;
        inputRemaining -= weight;
        this.resampleRemaining -= weight;

        if (this.resampleRemaining <= 1e-9) {
          this.pushSample(this.resampleSum / this.resampleWeight);
          this.resampleRemaining = this.sourceToTargetRatio;
          this.resampleSum = 0;
          this.resampleWeight = 0;
        }
      }
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];

    if (!input || !input[0]) {
      return true;
    }

    this.resample(input[0]);
    return true; // Continua processando
  }
}

registerProcessor('pcm16-audio-processor', PCM16AudioProcessor);
