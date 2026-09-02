// events.js — Bus de eventos sin asignaciones.
//
// Los eventos se acumulan en colas de arrays tipados durante el tick y se
// consumen al final. Así el audio y los efectos visuales pueden reaccionar a la
// simulación sin que la simulación conozca a nadie.

export const EV = {
  SALTO: 0, DOBLE_SALTO: 1, ATERRIZAJE: 2, DASH: 3, PARED: 4,
  DISPARO: 5, IMPACTO: 6, DANIO_JUGADOR: 7, MUERTE_ENEMIGO: 8,
  RECOGIDA: 9, PUERTA: 10, PARRY: 11, GANCHO: 12, GANCHO_SUELTA: 13,
  EXPLOSION: 14, JEFE_FASE: 15, SALA_LIMPIA: 16, MUERTE_JUGADOR: 17,
  CARGA_LISTA: 18, LASER: 19, CURA: 20, MODULO: 21, VICTORIA: 22,
  RALENTI: 23, TELEGRAFIA: 24, REBOTE: 25,
  CRITICO: 26, ATURDIMIENTO: 27, REFLEJO: 28, DIVISION: 29,
};

export const EV_NOMBRE = Object.keys(EV);

const MAX_EVENTOS = 512;

export class EventBus {
  constructor() {
    this.tipo = new Uint8Array(MAX_EVENTOS);
    this.x = new Float32Array(MAX_EVENTOS);
    this.y = new Float32Array(MAX_EVENTOS);
    this.a = new Float32Array(MAX_EVENTOS);   // intensidad / parámetro libre
    this.b = new Float32Array(MAX_EVENTOS);   // parámetro libre secundario
    this.n = 0;
    this.listeners = [];
  }

  emit(tipo, x = 0, y = 0, a = 1, b = 0) {
    if (this.n >= MAX_EVENTOS) return;
    const i = this.n++;
    this.tipo[i] = tipo; this.x[i] = x; this.y[i] = y; this.a[i] = a; this.b[i] = b;
  }

  /** fn(tipo, x, y, a, b) */
  on(fn) { this.listeners.push(fn); return fn; }
  off(fn) { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); }

  /** Entrega y vacía la cola. */
  dispatch() {
    for (let i = 0; i < this.n; i++) {
      const t = this.tipo[i], x = this.x[i], y = this.y[i], a = this.a[i], b = this.b[i];
      for (let k = 0; k < this.listeners.length; k++) this.listeners[k](t, x, y, a, b);
    }
    this.n = 0;
  }

  clear() { this.n = 0; }
}
