// replay.js — Grabación y reproducción determinista.
//
// Guardar la semilla y el input de cada tick basta para reconstruir la partida
// entera. También se guardan sumas de comprobación periódicas para detectar
// cualquier fuga de no-determinismo (Math.random, Date.now, orden de iteración).

const TICKS_MAX = 60 * 60 * 60;      // una hora de juego a 60 Hz
export const INTERVALO_CHECKSUM = 30;

export class Replay {
  constructor() {
    this.buttons = new Uint16Array(TICKS_MAX);
    this.aim = new Uint16Array(TICKS_MAX);
    this.checksums = new Uint32Array(Math.ceil(TICKS_MAX / INTERVALO_CHECKSUM));
    this.length = 0;
    this.seed = 0;
    this.grabando = false;
    this.reproduciendo = false;
    this.cursor = 0;
    this.desajustes = 0;
    this.primerDesajuste = -1;
  }

  iniciarGrabacion(seed) {
    this.seed = seed >>> 0;
    this.length = 0;
    this.cursor = 0;
    this.grabando = true;
    this.reproduciendo = false;
    this.desajustes = 0;
    this.primerDesajuste = -1;
  }

  grabar(tick, buttons, aimQ) {
    if (!this.grabando || tick >= TICKS_MAX) return;
    this.buttons[tick] = buttons;
    this.aim[tick] = aimQ;
    if (tick + 1 > this.length) this.length = tick + 1;
  }

  anotarChecksum(tick, valor) {
    if (tick % INTERVALO_CHECKSUM !== 0) return;
    const i = tick / INTERVALO_CHECKSUM;
    if (i >= this.checksums.length) return;
    if (this.reproduciendo) {
      if (this.checksums[i] !== (valor >>> 0)) {
        this.desajustes++;
        if (this.primerDesajuste < 0) this.primerDesajuste = tick;
      }
    } else if (this.grabando) {
      this.checksums[i] = valor >>> 0;
    }
  }

  iniciarReproduccion() {
    this.grabando = false;
    this.reproduciendo = true;
    this.cursor = 0;
    this.desajustes = 0;
    this.primerDesajuste = -1;
  }

  detener() { this.grabando = false; this.reproduciendo = false; }

  terminada(tick) { return tick >= this.length; }

  /** Serializa a un objeto plano transportable (JSON o descarga). */
  exportar() {
    const n = this.length;
    return {
      version: 1,
      seed: this.seed,
      length: n,
      buttons: Array.from(this.buttons.subarray(0, n)),
      aim: Array.from(this.aim.subarray(0, n)),
      checksums: Array.from(this.checksums.subarray(0, Math.ceil(n / INTERVALO_CHECKSUM))),
    };
  }

  importar(obj) {
    if (!obj || obj.version !== 1) return false;
    this.seed = obj.seed >>> 0;
    this.length = Math.min(obj.length | 0, TICKS_MAX);
    this.buttons.fill(0); this.aim.fill(0); this.checksums.fill(0);
    for (let i = 0; i < this.length; i++) {
      this.buttons[i] = obj.buttons[i] || 0;
      this.aim[i] = obj.aim[i] || 0;
    }
    const cn = Math.min(obj.checksums ? obj.checksums.length : 0, this.checksums.length);
    for (let i = 0; i < cn; i++) this.checksums[i] = obj.checksums[i] >>> 0;
    return true;
  }
}

/** Hash FNV-1a de 32 bits sobre un array tipado, usado para las sumas. */
export function hashTyped(arr, h = 2166136261 >>> 0, stride = 1, limit = -1) {
  const n = limit < 0 ? arr.length : Math.min(limit, arr.length);
  for (let i = 0; i < n; i += stride) {
    // Cuantizamos los flotantes para que ruido de coma flotante irrelevante no
    // dispare falsos desajustes, pero cualquier divergencia real sí lo haga.
    const v = (arr[i] * 4096) | 0;
    h ^= v & 0xff; h = Math.imul(h, 16777619);
    h ^= (v >>> 8) & 0xff; h = Math.imul(h, 16777619);
    h ^= (v >>> 16) & 0xff; h = Math.imul(h, 16777619);
    h ^= (v >>> 24) & 0xff; h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
