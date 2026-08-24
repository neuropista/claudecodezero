// music.js — Música adaptativa por capas, generada nota a nota en tiempo real.
//
// Cada bioma tiene su tempo, su escala y su progresión armónica. Sobre eso se
// generan cinco capas (pad, bajo, arpegio, percusión y lead) que entran y salen
// según la tensión del juego. Los cambios SIEMPRE se aplican al empezar el
// siguiente compás, nunca a mitad, para que no se note el corte.

import { voz, golpeRuido, midiAFreq, gradoANota, ESCALAS } from './synth.js';
import { Rng } from '../core/rng.js';

const PASOS_POR_COMPAS = 16;      // semicorcheas
const LOOKAHEAD = 0.35;           // segundos programados por adelantado
const INTERVALO = 25;             // ms del temporizador del planificador

export const TENSION = {
  SILENCIO: 0, EXPLORACION: 1, COMBATE: 2, JEFE: 3, VICTORIA: 4, DERROTA: 5,
};

// Mezcla objetivo de cada capa (pad, bajo, arpegio, percusión, lead) por estado.
const MEZCLAS = {
  0: [0.10, 0.00, 0.00, 0.00, 0.00],
  1: [0.55, 0.45, 0.35, 0.10, 0.00],
  2: [0.45, 0.70, 0.55, 0.75, 0.20],
  3: [0.60, 0.85, 0.45, 0.95, 0.75],
  4: [0.70, 0.30, 0.60, 0.15, 0.55],
  5: [0.35, 0.10, 0.00, 0.00, 0.00],
};

export const TEMAS = [
  { // Corteza Externa — frío, hipnótico
    bpm: 104, raiz: 45, escala: ESCALAS.menorNatural,
    progresion: [0, 0, 5, 4], padTipo: 'sawtooth', leadTipo: 'triangle',
  },
  { // Campo Sináptico — orgánico, inquieto
    bpm: 122, raiz: 43, escala: ESCALAS.dorico,
    progresion: [0, 3, 6, 4], padTipo: 'triangle', leadTipo: 'square',
  },
  { // Núcleo Térmico — urgente
    bpm: 138, raiz: 41, escala: ESCALAS.frigioDominante,
    progresion: [0, 1, 0, 4], padTipo: 'sawtooth', leadTipo: 'sawtooth',
  },
  { // El Vacío — disonante, suspendido
    bpm: 92, raiz: 44, escala: ESCALAS.locrio,
    progresion: [0, 6, 3, 5], padTipo: 'sine', leadTipo: 'triangle',
  },
];

export class Musica {
  constructor(ctx, buses) {
    this.ctx = ctx;
    this.buses = buses;
    this.capas = [];
    for (let i = 0; i < 5; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(buses.entradaMusica);
      this.capas.push(g);
    }
    // Filtro global: se abre con la tensión.
    this.filtro = ctx.createBiquadFilter();
    this.filtro.type = 'lowpass';
    this.filtro.frequency.value = 1400;
    this.filtro.Q.value = 0.7;

    this.tema = TEMAS[0];
    this.bioma = 0;
    this.tension = TENSION.SILENCIO;
    this.tensionPendiente = null;
    this.rng = new Rng('musica');

    this.paso = 0;             // paso global desde el arranque
    this.tiempoSiguiente = 0;
    this.corriendo = false;
    this._timer = 0;
    this.compasActual = 0;
    this.intensidad = 0;
  }

  get duracionPaso() { return 60 / this.tema.bpm / 4; }

  iniciar() {
    if (this.corriendo) return;
    this.corriendo = true;
    this.tiempoSiguiente = this.ctx.currentTime + 0.1;
    this.paso = 0;
    this._timer = setInterval(() => this._planificar(), INTERVALO);
  }

  detener() {
    this.corriendo = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = 0;
    const t = this.ctx.currentTime;
    for (const c of this.capas) {
      c.gain.cancelScheduledValues(t);
      c.gain.setTargetAtTime(0, t, 0.15);
    }
  }

  setBioma(i) {
    const nuevo = i % TEMAS.length;
    if (nuevo === this.bioma) return;
    this.bioma = nuevo;
    // El cambio de tema también espera al siguiente compás.
    this.temaPendiente = TEMAS[nuevo];
  }

  /** Cambia la tensión; el cruce ocurre al empezar el siguiente compás. */
  setTension(t) {
    if (t === this.tension && this.tensionPendiente === null) return;
    this.tensionPendiente = t;
  }

  _aplicarCambios(tCompas) {
    if (this.temaPendiente) {
      this.tema = this.temaPendiente;
      this.temaPendiente = null;
    }
    if (this.tensionPendiente !== null) {
      this.tension = this.tensionPendiente;
      this.tensionPendiente = null;
    }
    const mezcla = MEZCLAS[this.tension] || MEZCLAS[1];
    const dur = this.duracionPaso * PASOS_POR_COMPAS * 0.85;
    for (let i = 0; i < this.capas.length; i++) {
      const g = this.capas[i].gain;
      g.cancelScheduledValues(tCompas);
      g.setValueAtTime(g.value, tCompas);
      g.linearRampToValueAtTime(mezcla[i], tCompas + dur);
    }
    this.intensidad = mezcla[3];
  }

  _planificar() {
    const ctx = this.ctx;
    while (this.tiempoSiguiente < ctx.currentTime + LOOKAHEAD) {
      const paso = this.paso % PASOS_POR_COMPAS;
      if (paso === 0) {
        this.compasActual++;
        this._aplicarCambios(this.tiempoSiguiente);
      }
      this._emitirPaso(paso, this.tiempoSiguiente);
      this.paso++;
      this.tiempoSiguiente += this.duracionPaso;
    }
  }

  _acordeActual() {
    const p = this.tema.progresion;
    return p[this.compasActual % p.length];
  }

  _emitirPaso(paso, t) {
    const T = this.tema;
    const grado = this._acordeActual();
    const raiz = T.raiz;
    // Semilla estable por compás: el tema se reconoce pero varía entre vueltas.
    const r = this.rng;
    r.seed(this.bioma * 7919 + this.compasActual * 131 + paso);

    const nivel = MEZCLAS[this.tension] || MEZCLAS[1];

    // --- Capa 0: pad sostenido, un acorde por compás.
    if (paso === 0 && nivel[0] > 0.01) {
      const notas = [0, 2, 4].map((g) => gradoANota(raiz, T.escala, grado + g));
      const dur = this.duracionPaso * PASOS_POR_COMPAS;
      for (let i = 0; i < notas.length; i++) {
        voz(this.ctx, this.capas[0], t, {
          tipo: T.padTipo, freq: midiAFreq(notas[i] + 12), detune: (i - 1) * 7,
          gan: 0.055, env: { a: dur * 0.35, d: dur * 0.2, s: 0.75, r: dur * 0.5 },
          sostenido: dur * 0.35,
          filtro: { tipo: 'lowpass', freq: 700 + this.intensidad * 1800, q: 1.6 },
          pan: (i - 1) * 0.45,
        });
      }
    }

    // --- Capa 1: bajo en corcheas con síncopa.
    if (nivel[1] > 0.01 && (paso % 4 === 0 || paso % 8 === 6)) {
      const nota = gradoANota(raiz, T.escala, grado) - 12;
      const oct = paso % 8 === 6 ? 12 : 0;
      voz(this.ctx, this.capas[1], t, {
        tipo: 'sawtooth', freq: midiAFreq(nota + oct),
        gan: 0.14, env: { a: 0.004, d: 0.09, s: 0.35, r: 0.12 },
        sostenido: this.duracionPaso * 0.7,
        filtro: {
          tipo: 'lowpass', freq: 220 + this.intensidad * 700,
          freqFin: 140, dur: this.duracionPaso * 2, q: 9,
        },
      });
    }

    // --- Capa 2: arpegio de semicorcheas.
    if (nivel[2] > 0.01 && paso % 2 === 0) {
      const patron = [0, 2, 4, 6, 4, 2];
      const g = grado + patron[(paso / 2) % patron.length];
      const nota = gradoANota(raiz, T.escala, g) + 24;
      voz(this.ctx, this.capas[2], t, {
        tipo: 'square', freq: midiAFreq(nota),
        gan: 0.055, env: { a: 0.002, d: 0.06, s: 0.15, r: 0.1 },
        filtro: { tipo: 'bandpass', freq: 1200 + r.float() * 2200, q: 5 },
        pan: r.spread(0.6),
      });
    }

    // --- Capa 3: percusión sintética.
    if (nivel[3] > 0.01) {
      if (paso % 8 === 0) this._bombo(t);
      if (paso % 8 === 4) this._caja(t);
      if (paso % 2 === 0 || r.bool(0.22)) this._charles(t, paso % 4 === 0 ? 0.55 : 0.3);
      if (paso === 14 && this.tension >= TENSION.COMBATE && r.bool(0.4)) this._caja(t, 0.7);
    }

    // --- Capa 4: lead / motivo del jefe.
    if (nivel[4] > 0.01 && (paso === 0 || paso === 6 || paso === 10)) {
      const salto = r.pick([0, 2, 4, 7, -2]);
      const nota = gradoANota(raiz, T.escala, grado + salto) + 24;
      voz(this.ctx, this.capas[4], t, {
        tipo: T.leadTipo, freq: midiAFreq(nota), freqFin: midiAFreq(nota + 0.2),
        glide: 0.2, gan: 0.075,
        env: { a: 0.01, d: 0.15, s: 0.4, r: 0.35 }, sostenido: this.duracionPaso * 1.5,
        filtro: { tipo: 'lowpass', freq: 2600, freqFin: 900, dur: 0.5, q: 4 },
        fm: { ratio: 2.0, indice: 0.35, indiceFin: 0.02, dur: 0.4 },
        pan: r.spread(0.35),
      });
    }
  }

  _bombo(t) {
    voz(this.ctx, this.capas[3], t, {
      tipo: 'sine', freq: 130, freqFin: 42, glide: 0.09,
      gan: 0.30, env: { a: 0.002, d: 0.10, s: 0.05, r: 0.09 },
    });
  }

  _caja(t, gan = 1) {
    golpeRuido(this.ctx, this.capas[3], t, this.buses.ruido, {
      dur: 0.13, gan: 0.16 * gan, tipoFiltro: 'bandpass',
      freq: 1900, freqFin: 900, q: 1.1,
      env: { a: 0.001, d: 0.06, s: 0.12, r: 0.07 },
    });
    voz(this.ctx, this.capas[3], t, {
      tipo: 'triangle', freq: 210, freqFin: 150, glide: 0.06,
      gan: 0.08 * gan, env: { a: 0.001, d: 0.05, s: 0.1, r: 0.05 },
    });
  }

  _charles(t, gan) {
    golpeRuido(this.ctx, this.capas[3], t, this.buses.ruido, {
      dur: 0.05, gan: 0.055 * gan, tipoFiltro: 'highpass',
      freq: 7200, q: 0.8, env: { a: 0.001, d: 0.025, s: 0.05, r: 0.03 },
      pan: (t * 7) % 1 > 0.5 ? 0.25 : -0.25,
    });
  }

  /** Golpe de acento para transiciones (entrada de jefe, sala limpia). */
  acento(subida = true) {
    const t = this.ctx.currentTime;
    const T = this.tema;
    const notas = subida ? [0, 4, 7, 11] : [11, 7, 4, 0];
    for (let i = 0; i < notas.length; i++) {
      voz(this.ctx, this.capas[0], t + i * 0.05, {
        tipo: 'triangle', freq: midiAFreq(T.raiz + 12 + notas[i]),
        gan: 0.10, env: { a: 0.004, d: 0.15, s: 0.4, r: 0.5 },
      });
    }
  }
}
