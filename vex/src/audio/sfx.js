// sfx.js — Efectos de sonido procedurales, uno por evento de juego.
//
// Ninguno suena dos veces exactamente igual: cada disparo varía en altura,
// timbre, corte de filtro y panorama. Todo se sintetiza en el momento.

import { voz, golpeRuido, adsr, rampaExp, midiAFreq } from './synth.js';
import { Rng } from '../core/rng.js';

// Generador propio para el audio: es cosmético, no toca la simulación.
const R = new Rng(0x5EA50);
const v = (base, spread) => base * Math.pow(2, R.spread(spread) / 12);

export class Sfx {
  constructor(ctx, buses) {
    this.ctx = ctx;
    this.buses = buses;
    this.ultimoDisparo = 0;
    this.voces = 0;
    this.maxVoces = 48;
  }

  _puedo() {
    // Limitador de voces muy simple: evita que 30 muertes simultáneas saturen.
    const ahora = this.ctx.currentTime;
    if (this._ventana !== Math.floor(ahora * 20)) {
      this._ventana = Math.floor(ahora * 20);
      this.voces = 0;
    }
    return this.voces++ < this.maxVoces;
  }

  /** Convierte una posición de mundo a panorama estéreo respecto a la cámara. */
  pan(x, camX, ancho) {
    if (!ancho) return 0;
    return Math.max(-0.85, Math.min(0.85, ((x - camX) / (ancho * 0.5)) * 0.8));
  }

  salto(pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: 'triangle', freq: v(330, 1.6), freqFin: v(720, 1.2), glide: 0.09,
      gan: 0.22, env: { a: 0.004, d: 0.07, s: 0.18, r: 0.08 },
      filtro: { tipo: 'lowpass', freq: 2400, freqFin: 4200, dur: 0.1, q: 3 }, pan,
    });
    golpeRuido(this.ctx, this.buses.entradaSfx, t, this.buses.ruido, {
      dur: 0.07, gan: 0.09, tipoFiltro: 'highpass', freq: 1800, q: 0.8,
      env: { a: 0.001, d: 0.04, s: 0.1, r: 0.05 }, pan,
    });
  }

  dobleSalto(pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: 'sawtooth', freq: v(420, 1.4), freqFin: v(980, 1.2), glide: 0.13,
      gan: 0.18, env: { a: 0.003, d: 0.1, s: 0.2, r: 0.12 },
      filtro: { tipo: 'bandpass', freq: 1400, freqFin: 3600, dur: 0.14, q: 4 },
      fm: { ratio: 2.01, indice: 0.6, indiceFin: 0.05, dur: 0.15 }, pan,
    });
  }

  aterrizaje(fuerza = 1, pan = 0) {
    if (!this._puedo()) return;
    fuerza = Number.isFinite(fuerza) ? Math.min(3, Math.max(0.1, fuerza)) : 1;
    const t = this.ctx.currentTime;
    const g = 0.10 + Math.min(fuerza, 2) * 0.13;
    golpeRuido(this.ctx, this.buses.entradaSfx, t, this.buses.ruidoRosa, {
      dur: 0.10 + fuerza * 0.05, gan: g, tipoFiltro: 'lowpass',
      freq: v(700, 2), freqFin: 180, q: 1.1,
      env: { a: 0.001, d: 0.05, s: 0.3, r: 0.09 }, pan,
    });
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: 'sine', freq: v(120, 2), freqFin: 48, glide: 0.09,
      gan: g * 0.9, env: { a: 0.002, d: 0.06, s: 0.15, r: 0.08 }, pan,
    });
  }

  dash(pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    golpeRuido(this.ctx, this.buses.entradaSfx, t, this.buses.ruido, {
      dur: 0.26, gan: 0.20, tipoFiltro: 'bandpass',
      freq: v(500, 2.5), freqFin: v(4200, 2), q: 2.2,
      env: { a: 0.004, d: 0.09, s: 0.45, r: 0.14 }, pan,
    });
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: 'sawtooth', freq: v(180, 2), freqFin: v(70, 2), glide: 0.2,
      gan: 0.12, env: { a: 0.003, d: 0.12, s: 0.2, r: 0.12 },
      filtro: { tipo: 'lowpass', freq: 3000, freqFin: 400, dur: 0.22, q: 6 }, pan,
    });
  }

  /** El disparo cambia de timbre según los módulos equipados. */
  disparo(perfil = 0, carga = 0, pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    const base = v(620 - perfil * 40, 2.2) * (1 + carga * 0.35);
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: perfil % 2 === 0 ? 'square' : 'sawtooth',
      freq: base, freqFin: base * 0.35, glide: 0.07,
      gan: 0.13 + carga * 0.1, env: { a: 0.001, d: 0.05, s: 0.18, r: 0.07 },
      filtro: { tipo: 'lowpass', freq: 5200, freqFin: 900, dur: 0.09, q: 5 },
      fm: { ratio: 1.41 + perfil * 0.2, indice: 1.1 + carga, indiceFin: 0.05, dur: 0.08 },
      pan,
    });
    golpeRuido(this.ctx, this.buses.entradaSfx, t, this.buses.ruido, {
      dur: 0.06, gan: 0.07, tipoFiltro: 'highpass', freq: v(2600, 3), q: 0.7,
      env: { a: 0.001, d: 0.03, s: 0.1, r: 0.04 }, pan,
    });
  }

  impacto(fuerza = 1, pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    golpeRuido(this.ctx, this.buses.entradaSfx, t, this.buses.ruido, {
      dur: 0.07 + fuerza * 0.03, gan: 0.10 + fuerza * 0.06,
      tipoFiltro: 'bandpass', freq: v(1700, 4), freqFin: v(520, 3), q: 1.6,
      env: { a: 0.001, d: 0.035, s: 0.12, r: 0.05 }, pan,
    });
  }

  rebote(pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: 'triangle', freq: v(880, 5), freqFin: v(1500, 4), glide: 0.04,
      gan: 0.07, env: { a: 0.001, d: 0.03, s: 0.1, r: 0.05 }, pan,
    });
  }

  /** Impacto en punto débil: agudo, corto y con un armónico que destaca. */
  critico(pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: 'triangle', freq: v(2100, 2), freqFin: v(3400, 2), glide: 0.05,
      gan: 0.13, env: { a: 0.001, d: 0.05, s: 0.12, r: 0.09 },
      filtro: { tipo: 'bandpass', freq: 3000, q: 8 }, pan,
    });
    golpeRuido(this.ctx, this.buses.entradaSfx, t, this.buses.ruido, {
      dur: 0.08, gan: 0.11, tipoFiltro: 'highpass', freq: v(3200, 3), q: 1.1,
      env: { a: 0.001, d: 0.035, s: 0.1, r: 0.05 }, pan,
    });
  }

  /** Rotura de postura: golpe metálico grave con cola. */
  aturdimiento(pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    this.buses.duck(0.3, 0.25);
    for (let i = 0; i < 3; i++) {
      voz(this.ctx, this.buses.entradaSfx, t + i * 0.015, {
        tipo: 'square', freq: v(190 + i * 70, 1.5), freqFin: v(70, 1.5), glide: 0.3,
        gan: 0.11 - i * 0.02, env: { a: 0.001, d: 0.1, s: 0.25, r: 0.3 },
        filtro: { tipo: 'lowpass', freq: 2200, freqFin: 320, dur: 0.35, q: 5 }, pan,
      });
    }
    golpeRuido(this.ctx, this.buses.entradaSfx, t, this.buses.ruidoRosa, {
      dur: 0.3, gan: 0.13, tipoFiltro: 'bandpass', freq: 900, freqFin: 240, q: 1.4,
      env: { a: 0.001, d: 0.09, s: 0.3, r: 0.22 }, pan,
    });
  }

  /** El espejo devuelve un disparo. */
  reflejo(pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: 'sine', freq: v(1500, 3), freqFin: v(2600, 3), glide: 0.07,
      gan: 0.09, env: { a: 0.001, d: 0.05, s: 0.15, r: 0.12 },
      filtro: { tipo: 'bandpass', freq: 2400, q: 10 }, pan,
    });
  }

  /** Un divisor se parte. */
  division(pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    golpeRuido(this.ctx, this.buses.entradaSfx, t, this.buses.ruidoRosa, {
      dur: 0.26, gan: 0.15, tipoFiltro: 'bandpass', freq: v(700, 3), freqFin: v(1900, 3), q: 1.2,
      env: { a: 0.002, d: 0.08, s: 0.3, r: 0.18 }, pan,
    });
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: 'sawtooth', freq: v(320, 2), freqFin: v(560, 2), glide: 0.22,
      gan: 0.09, env: { a: 0.003, d: 0.1, s: 0.2, r: 0.15 },
      filtro: { tipo: 'lowpass', freq: 2600, q: 3 }, pan,
    });
  }

  danio(pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    this.buses.duck(0.5, 0.35);
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: 'sawtooth', freq: v(300, 1), freqFin: v(70, 1), glide: 0.3,
      gan: 0.28, env: { a: 0.002, d: 0.14, s: 0.35, r: 0.28 },
      filtro: { tipo: 'lowpass', freq: 2200, freqFin: 300, dur: 0.3, q: 8 },
      fm: { ratio: 0.5, indice: 3.5, indiceFin: 0.2, dur: 0.3 }, pan,
    });
    golpeRuido(this.ctx, this.buses.entradaSfx, t, this.buses.ruido, {
      dur: 0.24, gan: 0.18, tipoFiltro: 'bandpass', freq: 380, freqFin: 120, q: 0.9,
      env: { a: 0.001, d: 0.1, s: 0.3, r: 0.2 }, pan,
    });
  }

  muerteEnemigo(tam = 1, pan = 0) {
    if (!this._puedo()) return;
    // El tamaño llega desde el evento del juego: se acota antes de dividir.
    tam = Number.isFinite(tam) ? Math.min(4, Math.max(0.35, tam)) : 1;
    const t = this.ctx.currentTime;
    golpeRuido(this.ctx, this.buses.entradaSfx, t, this.buses.ruidoRosa, {
      dur: 0.22 * tam, gan: 0.16, tipoFiltro: 'lowpass',
      freq: v(1800, 4) / tam, freqFin: 120, q: 1.3,
      env: { a: 0.001, d: 0.08, s: 0.3, r: 0.18 }, pan,
    });
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: 'square', freq: v(240, 3) / tam, freqFin: v(50, 2), glide: 0.22 * tam,
      gan: 0.11, env: { a: 0.002, d: 0.09, s: 0.25, r: 0.18 },
      filtro: { tipo: 'lowpass', freq: 3000, freqFin: 260, dur: 0.24, q: 4 }, pan,
    });
  }

  explosion(fuerza = 1, pan = 0) {
    if (!this._puedo()) return;
    fuerza = Number.isFinite(fuerza) ? Math.min(4, Math.max(0.2, fuerza)) : 1;
    const t = this.ctx.currentTime;
    this.buses.duck(0.45 * fuerza, 0.4);
    golpeRuido(this.ctx, this.buses.entradaSfx, t, this.buses.ruidoRosa, {
      dur: 0.55 * fuerza, gan: 0.30, tipoFiltro: 'lowpass',
      freq: v(1200, 3), freqFin: 60, q: 0.9,
      env: { a: 0.002, d: 0.15, s: 0.4, r: 0.4 }, pan,
    });
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: 'sine', freq: v(90, 2), freqFin: 28, glide: 0.5,
      gan: 0.3, env: { a: 0.003, d: 0.2, s: 0.3, r: 0.35 }, pan,
    });
  }

  parry(exito = true, pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    if (exito) {
      this.buses.duck(0.35, 0.25);
      for (let i = 0; i < 3; i++) {
        voz(this.ctx, this.buses.entradaSfx, t + i * 0.012, {
          tipo: 'triangle', freq: v(1400 + i * 620, 1.2), freqFin: v(2600 + i * 800, 1),
          glide: 0.05, gan: 0.13 - i * 0.03,
          env: { a: 0.001, d: 0.06, s: 0.2, r: 0.22 },
          filtro: { tipo: 'bandpass', freq: 2600, q: 6 }, pan,
        });
      }
    } else {
      voz(this.ctx, this.buses.entradaSfx, t, {
        tipo: 'sine', freq: v(520, 1), freqFin: v(300, 1), glide: 0.1,
        gan: 0.07, env: { a: 0.002, d: 0.06, s: 0.1, r: 0.08 }, pan,
      });
    }
  }

  gancho(soltar = false, pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: 'sawtooth',
      freq: soltar ? v(900, 2) : v(300, 2), freqFin: soltar ? v(260, 2) : v(1200, 2),
      glide: 0.14, gan: 0.10, env: { a: 0.002, d: 0.08, s: 0.2, r: 0.1 },
      filtro: { tipo: 'bandpass', freq: 1200, freqFin: 3000, dur: 0.15, q: 5 }, pan,
    });
  }

  recogida(tipo = 0, pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    const raiz = 72 + tipo * 3;
    for (let i = 0; i < 3; i++) {
      voz(this.ctx, this.buses.entradaSfxLimpia, t + i * 0.055, {
        tipo: 'triangle', freq: midiAFreq(raiz + i * 4 + R.irange(-1, 1)),
        gan: 0.11, env: { a: 0.003, d: 0.09, s: 0.3, r: 0.16 }, pan,
      });
    }
  }

  modulo(pan = 0) {
    const t = this.ctx.currentTime;
    this.buses.duck(0.5, 0.6);
    const acordes = [0, 4, 7, 11, 14];
    for (let i = 0; i < acordes.length; i++) {
      voz(this.ctx, this.buses.entradaSfxLimpia, t + i * 0.07, {
        tipo: 'sine', freq: midiAFreq(60 + acordes[i]),
        gan: 0.13, env: { a: 0.01, d: 0.18, s: 0.5, r: 0.7 }, sostenido: 0.12, pan,
      });
    }
  }

  puerta(abrir = true, pan = 0) {
    const t = this.ctx.currentTime;
    golpeRuido(this.ctx, this.buses.entradaSfx, t, this.buses.ruidoRosa, {
      dur: 0.6, gan: 0.16, tipoFiltro: 'lowpass',
      freq: abrir ? 400 : 1400, freqFin: abrir ? 2000 : 200, q: 1.4,
      env: { a: 0.02, d: 0.2, s: 0.5, r: 0.3 }, pan,
    });
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: 'sine', freq: abrir ? 60 : 160, freqFin: abrir ? 170 : 45, glide: 0.5,
      gan: 0.2, env: { a: 0.02, d: 0.25, s: 0.4, r: 0.3 }, pan,
    });
  }

  laser(pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: 'sawtooth', freq: v(2400, 2), freqFin: v(1800, 2), glide: 0.25,
      gan: 0.09, env: { a: 0.01, d: 0.05, s: 0.7, r: 0.15 }, sostenido: 0.2,
      filtro: { tipo: 'bandpass', freq: 3000, q: 12 }, pan,
    });
  }

  telegrafia(pan = 0) {
    if (!this._puedo()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      voz(this.ctx, this.buses.entradaSfxLimpia, t + i * 0.14, {
        tipo: 'square', freq: v(1600, 0.5), gan: 0.05,
        env: { a: 0.002, d: 0.05, s: 0.1, r: 0.05 }, pan,
      });
    }
  }

  cargaLista(pan = 0) {
    const t = this.ctx.currentTime;
    voz(this.ctx, this.buses.entradaSfxLimpia, t, {
      tipo: 'sine', freq: midiAFreq(84), gan: 0.07,
      env: { a: 0.004, d: 0.06, s: 0.2, r: 0.12 }, pan,
    });
  }

  cura(pan = 0) {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      voz(this.ctx, this.buses.entradaSfxLimpia, t + i * 0.06, {
        tipo: 'sine', freq: midiAFreq(67 + i * 5), gan: 0.10,
        env: { a: 0.008, d: 0.12, s: 0.4, r: 0.3 }, pan,
      });
    }
  }

  jefeFase() {
    const t = this.ctx.currentTime;
    this.buses.duck(0.7, 1.1);
    golpeRuido(this.ctx, this.buses.entradaSfx, t, this.buses.ruidoRosa, {
      dur: 1.4, gan: 0.34, tipoFiltro: 'lowpass', freq: 2400, freqFin: 70, q: 1.1,
      env: { a: 0.01, d: 0.5, s: 0.5, r: 0.8 },
    });
    for (let i = 0; i < 3; i++) {
      voz(this.ctx, this.buses.entradaSfx, t + i * 0.02, {
        tipo: 'sawtooth', freq: midiAFreq(31 + i), freqFin: midiAFreq(24),
        glide: 1.2, gan: 0.18, env: { a: 0.02, d: 0.6, s: 0.5, r: 0.8 },
        filtro: { tipo: 'lowpass', freq: 900, freqFin: 160, dur: 1.4, q: 7 },
      });
    }
  }

  muerteJugador() {
    const t = this.ctx.currentTime;
    this.buses.duck(0.9, 2.0);
    for (let i = 0; i < 5; i++) {
      voz(this.ctx, this.buses.entradaSfx, t + i * 0.09, {
        tipo: 'sawtooth', freq: midiAFreq(62 - i * 5), freqFin: midiAFreq(30 - i * 2),
        glide: 0.7, gan: 0.16, env: { a: 0.005, d: 0.3, s: 0.4, r: 0.6 },
        filtro: { tipo: 'lowpass', freq: 2000 - i * 300, freqFin: 120, dur: 0.9, q: 6 },
      });
    }
    golpeRuido(this.ctx, this.buses.entradaSfx, t, this.buses.ruido, {
      dur: 1.2, gan: 0.2, tipoFiltro: 'lowpass', freq: 3000, freqFin: 90, q: 1,
      env: { a: 0.01, d: 0.4, s: 0.4, r: 0.8 },
    });
  }

  victoria() {
    const t = this.ctx.currentTime;
    const notas = [60, 64, 67, 72, 76, 79, 84];
    for (let i = 0; i < notas.length; i++) {
      voz(this.ctx, this.buses.entradaSfxLimpia, t + i * 0.085, {
        tipo: 'triangle', freq: midiAFreq(notas[i]), gan: 0.14,
        env: { a: 0.006, d: 0.2, s: 0.5, r: 0.7 }, sostenido: 0.1,
      });
    }
  }

  ralenti(entrando = true) {
    const t = this.ctx.currentTime;
    voz(this.ctx, this.buses.entradaSfx, t, {
      tipo: 'sine', freq: entrando ? 900 : 200, freqFin: entrando ? 180 : 900,
      glide: 0.35, gan: 0.10, env: { a: 0.01, d: 0.2, s: 0.3, r: 0.25 },
      filtro: { tipo: 'lowpass', freq: 4000, freqFin: 700, dur: 0.4, q: 3 },
    });
  }

  ui(tipo = 0) {
    const t = this.ctx.currentTime;
    voz(this.ctx, this.buses.entradaSfxLimpia, t, {
      tipo: 'square', freq: tipo === 0 ? 780 : tipo === 1 ? 1180 : 420,
      gan: 0.05, env: { a: 0.001, d: 0.03, s: 0.1, r: 0.05 },
      filtro: { tipo: 'lowpass', freq: 3000, q: 1 },
    });
  }
}
