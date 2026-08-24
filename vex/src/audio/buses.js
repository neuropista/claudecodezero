// buses.js — Grafo de buses: master, música y SFX, con envíos y ducking.
//
//   sfx  -> saturador -> busSfx ----\
//   mus  -> ducker    -> busMusica --+-> compresor -> master -> salida
//   envíos: reverb (convolución) y delay, compartidos por ambos buses.

import { impulsoReverb, curvaSaturacion, crearDelay, bufferRuido, bufferRuidoRosa } from './synth.js';

export class Buses {
  constructor(ctx) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;

    this.compresor = ctx.createDynamicsCompressor();
    this.compresor.threshold.value = -14;
    this.compresor.knee.value = 22;
    this.compresor.ratio.value = 5;
    this.compresor.attack.value = 0.004;
    this.compresor.release.value = 0.18;

    this.busSfx = ctx.createGain();
    this.busSfx.gain.value = 0.9;
    this.busMusica = ctx.createGain();
    this.busMusica.gain.value = 0.6;

    // Ducking: la música baja bajo los golpes fuertes y vuelve sola.
    this.ducker = ctx.createGain();
    this.ducker.gain.value = 1;

    this.saturador = ctx.createWaveShaper();
    this.saturador.curve = curvaSaturacion(6);
    this.saturador.oversample = '2x';

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulsoReverb(ctx, 2.6, 3.4, 0.30);
    this.envioReverb = ctx.createGain();
    this.envioReverb.gain.value = 0.22;
    this.retornoReverb = ctx.createGain();
    this.retornoReverb.gain.value = 0.9;

    this.delay = crearDelay(ctx, 0.27, 0.33, 2400);
    this.envioDelay = ctx.createGain();
    this.envioDelay.gain.value = 0.12;
    this.retornoDelay = ctx.createGain();
    this.retornoDelay.gain.value = 0.55;

    // Cableado.
    this.saturador.connect(this.busSfx);
    this.busMusica.connect(this.ducker);
    this.ducker.connect(this.compresor);
    this.busSfx.connect(this.compresor);
    this.compresor.connect(this.master);
    this.master.connect(ctx.destination);

    this.envioReverb.connect(this.reverb).connect(this.retornoReverb).connect(this.compresor);
    this.envioDelay.connect(this.delay.entrada);
    this.delay.salida.connect(this.retornoDelay).connect(this.compresor);

    this.busSfx.connect(this.envioReverb);
    this.busSfx.connect(this.envioDelay);
    this.busMusica.connect(this.envioReverb);

    this.ruido = bufferRuido(ctx, 2.0, 0xBEEF);
    this.ruidoRosa = bufferRuidoRosa(ctx, 2.0, 0xCAFE);

    this._duckHasta = 0;
  }

  /** Punto de entrada para efectos (pasa por saturación). */
  get entradaSfx() { return this.saturador; }
  /** Entrada seca sin saturar (interfaz, voces limpias). */
  get entradaSfxLimpia() { return this.busSfx; }
  get entradaMusica() { return this.busMusica; }

  setVolumen(master, musica, sfx) {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(master, t, 0.02);
    this.busMusica.gain.setTargetAtTime(musica, t, 0.02);
    this.busSfx.gain.setTargetAtTime(sfx, t, 0.02);
  }

  /**
   * Agacha la música durante `dur` segundos. Se ignora si ya hay un ducking
   * más profundo activo, para que los golpes encadenados no se peleen.
   */
  duck(cantidad = 0.55, dur = 0.32) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (t + dur < this._duckHasta) return;
    this._duckHasta = t + dur;
    const g = this.ducker.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(Math.max(0.05, 1 - cantidad), t + 0.012);
    g.setTargetAtTime(1, t + 0.05, dur * 0.35);
  }

  /** Silencio total (pérdida de foco). */
  silenciar(v, tiempo = 0.08) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(v ? 0.0001 : this._volMaster ?? 0.85, t, tiempo);
  }

  recordarVolumen(v) { this._volMaster = v; }
}
