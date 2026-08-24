// synth.js — Primitivas de síntesis sobre Web Audio. Cero archivos de audio.
//
// Todo (osciladores, ruido, envolventes, filtros, FM, delay y la reverb por
// convolución) se construye aquí a partir de números.

// Saneado de parámetros. Un solo valor no finito (una división por cero en la
// capa de juego, por ejemplo) hacía que setValueAtTime lanzara y dejaba el
// audio muerto para el resto de la sesión. Aquí se acotan en el borde.
const FREQ_MIN = 10, FREQ_MAX = 20000;

export function freqSegura(v, porDefecto = 440) {
  if (!Number.isFinite(v)) return porDefecto;
  return v < FREQ_MIN ? FREQ_MIN : v > FREQ_MAX ? FREQ_MAX : v;
}

export function numSeguro(v, porDefecto = 0, min = -1e6, max = 1e6) {
  if (!Number.isFinite(v)) return porDefecto;
  return v < min ? min : v > max ? max : v;
}

/** Envolvente ADSR aplicada a un AudioParam de ganancia. */
export function adsr(param, t0, { a = 0.005, d = 0.08, s = 0.4, r = 0.2, pico = 1, sostenido = 0 }) {
  a = numSeguro(a, 0.005, 0.0005, 8);
  d = numSeguro(d, 0.08, 0.0005, 8);
  s = numSeguro(s, 0.4, 0, 1);
  r = numSeguro(r, 0.2, 0.0005, 12);
  pico = numSeguro(pico, 0.3, 0.0002, 4);
  sostenido = numSeguro(sostenido, 0, 0, 30);
  param.cancelScheduledValues(t0);
  param.setValueAtTime(0.0001, t0);
  param.exponentialRampToValueAtTime(Math.max(pico, 0.0002), t0 + a);
  const nivelS = Math.max(pico * s, 0.0002);
  param.exponentialRampToValueAtTime(nivelS, t0 + a + d);
  const tFin = t0 + a + d + sostenido;
  param.setValueAtTime(nivelS, tFin);
  param.exponentialRampToValueAtTime(0.0001, tFin + r);
  return tFin + r;
}

/** Rampa exponencial segura (evita el 0 prohibido de exponentialRamp). */
export function rampaExp(param, t0, desde, hasta, dur) {
  param.setValueAtTime(Math.max(desde, 0.0001), t0);
  param.exponentialRampToValueAtTime(Math.max(hasta, 0.0001), t0 + dur);
}

/** Buffer de ruido blanco reutilizable. */
export function bufferRuido(ctx, segundos = 2, semilla = 12345) {
  const n = Math.floor(ctx.sampleRate * segundos);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = semilla >>> 0;
  for (let i = 0; i < n; i++) {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    d[i] = (s / 4294967296) * 2 - 1;
  }
  return buf;
}

/** Ruido rosa aproximado (filtro de Voss-McCartney simplificado). */
export function bufferRuidoRosa(ctx, segundos = 2, semilla = 999) {
  const n = Math.floor(ctx.sampleRate * segundos);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = semilla >>> 0;
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    const w = (s / 4294967296) * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

/**
 * Impulso de reverb generado a mano: ruido con decaimiento exponencial,
 * ligera difusión temprana y oscurecimiento progresivo del espectro.
 */
export function impulsoReverb(ctx, segundos = 2.4, decaimiento = 3.2, brillo = 0.35, semilla = 7777) {
  const n = Math.floor(ctx.sampleRate * segundos);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  let s = semilla >>> 0;
  for (let canal = 0; canal < 2; canal++) {
    const d = buf.getChannelData(canal);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      const w = (s / 4294967296) * 2 - 1;
      const t = i / n;
      // Filtro paso bajo cuyo corte cae con el tiempo: la cola se vuelve oscura.
      const coef = brillo * (1 - t * 0.85) + 0.02;
      lp += coef * (w - lp);
      const env = Math.pow(1 - t, decaimiento);
      d[i] = lp * env;
    }
    // Reflexiones tempranas discretas para que no suene a "lata".
    const ecos = [0.011, 0.019, 0.031, 0.047, 0.063];
    for (let k = 0; k < ecos.length; k++) {
      const off = Math.floor(ecos[k] * ctx.sampleRate) + canal * 37;
      const g = 0.45 / (k + 1);
      for (let i = n - 1; i >= off; i--) d[i] += d[i - off] * g * 0.4;
    }
  }
  return buf;
}

/** Curva de distorsión suave para el waveshaper. */
export function curvaSaturacion(cantidad = 12, n = 1024) {
  const c = new Float32Array(n);
  const k = cantidad;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

/**
 * Voz básica: oscilador (con FM opcional) -> filtro -> ganancia.
 * Devuelve el instante en que la voz termina para poder programar la siguiente.
 */
export function voz(ctx, destino, t0, opciones) {
  const {
    tipo = 'sine', freq = 440, freqFin = null, glide = 0.1,
    detune = 0, gan = 0.3, env = { a: 0.005, d: 0.1, s: 0.3, r: 0.2 },
    sostenido = 0,
    filtro = null,            // {tipo, freq, freqFin, q}
    fm = null,                // {ratio, indice, indiceFin}
    pan = 0,
  } = opciones;

  const f0 = freqSegura(freq);
  const gl = numSeguro(glide, 0.1, 0.001, 10);
  const osc = ctx.createOscillator();
  osc.type = tipo;
  osc.frequency.setValueAtTime(f0, t0);
  if (freqFin !== null) osc.frequency.exponentialRampToValueAtTime(freqSegura(freqFin, f0), t0 + gl);
  if (detune) osc.detune.setValueAtTime(numSeguro(detune, 0, -2400, 2400), t0);

  let nodo = osc;
  let modOsc = null, modGain = null;
  if (fm) {
    modOsc = ctx.createOscillator();
    modOsc.type = fm.tipo || 'sine';
    modOsc.frequency.setValueAtTime(freqSegura(f0 * fm.ratio, f0), t0);
    modGain = ctx.createGain();
    modGain.gain.setValueAtTime(numSeguro(f0 * fm.indice, 0, 0, 20000), t0);
    if (fm.indiceFin !== undefined) {
      modGain.gain.exponentialRampToValueAtTime(Math.max(numSeguro(f0 * fm.indiceFin, 0.001, 0, 20000), 0.001), t0 + numSeguro(fm.dur, 0.2, 0.001, 10));
    }
    modOsc.connect(modGain).connect(osc.frequency);
  }

  let filtroNodo = null;
  if (filtro) {
    filtroNodo = ctx.createBiquadFilter();
    filtroNodo.type = filtro.tipo || 'lowpass';
    filtroNodo.frequency.setValueAtTime(freqSegura(filtro.freq, 1000), t0);
    if (filtro.freqFin !== undefined) {
      filtroNodo.frequency.exponentialRampToValueAtTime(freqSegura(filtro.freqFin, 1000), t0 + numSeguro(filtro.dur, 0.25, 0.001, 10));
    }
    filtroNodo.Q.setValueAtTime(numSeguro(filtro.q ?? 1, 1, 0.0001, 40), t0);
    nodo = nodo.connect(filtroNodo);
  }

  const g = ctx.createGain();
  const tFin = adsr(g.gain, t0, { ...env, pico: numSeguro(gan, 0.2, 0.0002, 4), sostenido });
  nodo.connect(g);

  if (pan !== 0 && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t0);
    g.connect(p).connect(destino);
  } else {
    g.connect(destino);
  }

  osc.start(t0);
  osc.stop(tFin + 0.02);
  if (modOsc) { modOsc.start(t0); modOsc.stop(tFin + 0.02); }
  return tFin;
}

/** Golpe de ruido filtrado: base de impactos, pasos, explosiones y percusión. */
export function golpeRuido(ctx, destino, t0, buffer, opciones) {
  const {
    dur = 0.2, gan = 0.4, tipoFiltro = 'bandpass', freq = 900, freqFin = null,
    q = 1.2, env = { a: 0.002, d: 0.06, s: 0.25, r: 0.12 }, playbackRate = 1, pan = 0,
  } = opciones;

  const dur2 = numSeguro(dur, 0.2, 0.005, 20);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.setValueAtTime(numSeguro(playbackRate, 1, 0.05, 8), t0);
  // Punto de arranque aleatorio: nunca suena exactamente igual dos veces.
  const offset = Math.max(0, (Math.random() * (buffer.duration - dur2 - 0.05)) || 0);

  const f = ctx.createBiquadFilter();
  f.type = tipoFiltro;
  f.frequency.setValueAtTime(freqSegura(freq, 1000), t0);
  if (freqFin !== null) f.frequency.exponentialRampToValueAtTime(freqSegura(freqFin, 1000), t0 + dur2);
  f.Q.setValueAtTime(numSeguro(q, 1, 0.0001, 40), t0);

  const g = ctx.createGain();
  const tFin = adsr(g.gain, t0, { ...env, pico: numSeguro(gan, 0.2, 0.0002, 4), sostenido: Math.max(0, dur2 - 0.08) });

  src.connect(f).connect(g);
  if (pan !== 0 && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t0);
    g.connect(p).connect(destino);
  } else {
    g.connect(destino);
  }
  src.start(t0, offset, dur2 + 0.3);
  src.stop(tFin + 0.05);
  return tFin;
}

/** Línea de delay con realimentación y filtrado en el lazo. */
export function crearDelay(ctx, tiempo = 0.28, realimentacion = 0.34, corte = 2600) {
  const delay = ctx.createDelay(2);
  delay.delayTime.value = tiempo;
  const fb = ctx.createGain();
  fb.gain.value = realimentacion;
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.value = corte;
  delay.connect(filtro).connect(fb).connect(delay);
  return { entrada: delay, salida: delay, feedback: fb, filtro, delay };
}

// --- Utilidades musicales -------------------------------------------------

/** Frecuencia de una nota MIDI. */
export const midiAFreq = (n) => 440 * Math.pow(2, (n - 69) / 12);

export const ESCALAS = {
  menorNatural: [0, 2, 3, 5, 7, 8, 10],
  menorArmonica: [0, 2, 3, 5, 7, 8, 11],
  frigioDominante: [0, 1, 4, 5, 7, 8, 10],
  pentatonicaMenor: [0, 3, 5, 7, 10],
  locrio: [0, 1, 3, 5, 6, 8, 10],
  dorico: [0, 2, 3, 5, 7, 9, 10],
};

/** Nota de una escala por grado, con octavas automáticas. */
export function gradoANota(raiz, escala, grado) {
  const n = escala.length;
  const octava = Math.floor(grado / n);
  let i = grado % n;
  if (i < 0) i += n;
  return raiz + octava * 12 + escala[i];
}
