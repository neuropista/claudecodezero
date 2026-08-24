// weapons.js — Arma modular de Vex.
//
// El disparo base es siempre el mismo; lo que cambia es qué módulos lleva
// equipados. Los módulos NO son seis armas distintas: son seis modificadores
// que se acumulan sobre el mismo proyectil, y de ahí salen los comportamientos
// emergentes (una bala orbital + buscadora se queda girando hasta que detecta
// un objetivo y sale disparada; perforante + cadena encadena a través de los
// enemigos que atraviesa; escopeta + rebote convierte una sala en una trampa).

import { MASK, TIPO, FLAG } from './components.js';
import { EV } from '../core/events.js';
import { TAU, clamp, angleDelta } from '../core/math.js';

export const MOD = {
  PERFORANTE: 1 << 0,
  REBOTE: 1 << 1,
  BUSCADOR: 1 << 2,
  ESCOPETA: 1 << 3,
  ORBITAL: 1 << 4,
  CADENA: 1 << 5,
};

export const LISTA_MODULOS = [
  {
    bit: MOD.PERFORANTE, clave: 'perforante', nombre: 'Perforante',
    descripcion: 'Atraviesa hasta tres objetivos y gana alcance. Con Cadena, el arco salta desde cada cuerpo perforado.',
  },
  {
    bit: MOD.REBOTE, clave: 'rebote', nombre: 'Rebote',
    descripcion: 'Los disparos rebotan en la geometria. Con Escopeta, una sala cerrada se convierte en una trampa.',
  },
  {
    bit: MOD.BUSCADOR, clave: 'buscador', nombre: 'Buscador',
    descripcion: 'Corrige la trayectoria hacia el enemigo mas cercano. Con Orbital, los nodos esperan girando y salen a por su presa.',
  },
  {
    bit: MOD.ESCOPETA, clave: 'escopeta', nombre: 'Escopeta',
    descripcion: 'Dispara cinco fragmentos en abanico con menos alcance. Con Perforante recupera el alcance perdido.',
  },
  {
    bit: MOD.ORBITAL, clave: 'orbital', nombre: 'Orbital',
    descripcion: 'Los disparos quedan orbitando a tu alrededor y golpean por contacto.',
  },
  {
    bit: MOD.CADENA, clave: 'cadena', nombre: 'Cadena electrica',
    descripcion: 'Cada impacto salta a dos enemigos cercanos. Con Rebote, el arco persigue por toda la sala.',
  },
];

export const MAX_EQUIPADOS = 3;

const VELOCIDAD_BASE = 780;
const VIDA_BASE = 1.15;
const DANIO_BASE = 12;

/** Estado del arma; vive en el jugador, no en el ECS. */
export class Arma {
  constructor() {
    this.reset();
  }

  reset() {
    this.desbloqueados = 0;      // máscara de módulos encontrados
    this.equipados = [];         // hasta MAX_EQUIPADOS claves (bits)
    this.cadencia = 0.14;
    this.enfriamiento = 0;
    this.calor = 0;              // sube al disparar, penaliza si se satura
    this.sobrecalentada = false;
    this.orbitales = 0;
    this.nivelDanio = 1;
    this.retroceso = 0;
  }

  get mascara() {
    let m = 0;
    for (const b of this.equipados) m |= b;
    return m;
  }

  tiene(bit) { return (this.mascara & bit) !== 0; }
  desbloqueado(bit) { return (this.desbloqueados & bit) !== 0; }

  desbloquear(bit) {
    const nuevo = (this.desbloqueados & bit) === 0;
    this.desbloqueados |= bit;
    if (nuevo && this.equipados.length < MAX_EQUIPADOS) this.equipados.push(bit);
    return nuevo;
  }

  /** Rota el módulo de la ranura indicada entre los desbloqueados. */
  rotarRanura(ranura) {
    const disponibles = LISTA_MODULOS.filter((m) => this.desbloqueado(m.bit)).map((m) => m.bit);
    if (disponibles.length === 0) return;
    const actual = this.equipados[ranura];
    let i = disponibles.indexOf(actual);
    for (let k = 0; k < disponibles.length; k++) {
      i = (i + 1) % disponibles.length;
      const cand = disponibles[i];
      // No repetir módulo en dos ranuras.
      if (!this.equipados.some((b, j) => j !== ranura && b === cand)) {
        this.equipados[ranura] = cand;
        return;
      }
    }
  }

  /** Ciclo rápido: mueve la ranura activa. */
  cicloRapido() {
    if (this.equipados.length === 0) return;
    this.ranuraActiva = ((this.ranuraActiva || 0) + 1) % Math.max(1, this.equipados.length);
    this.rotarRanura(this.ranuraActiva);
  }

  actualizar(dt) {
    this.enfriamiento = Math.max(0, this.enfriamiento - dt);
    this.calor = Math.max(0, this.calor - dt * (this.sobrecalentada ? 0.55 : 0.9));
    if (this.sobrecalentada && this.calor <= 0.05) this.sobrecalentada = false;
    this.retroceso = Math.max(0, this.retroceso - dt * 6);
  }

  get listo() { return this.enfriamiento <= 0 && !this.sobrecalentada; }

  /**
   * Etiqueta corta del arma resultante, para el HUD. Se cachea por máscara
   * porque el HUD la pide en cada fotograma y sólo cambia al reconfigurar.
   */
  etiqueta() {
    const m = this.mascara;
    if (this._etiquetaMascara === m && this._etiqueta !== undefined) return this._etiqueta;
    this._etiquetaMascara = m;
    if (this.equipados.length === 0) {
      this._etiqueta = 'PULSO BASE';
    } else {
      let out = '';
      for (let i = 0; i < this.equipados.length; i++) {
        const info = LISTA_MODULOS.find((x) => x.bit === this.equipados[i]);
        if (!info) continue;
        out += (out ? ' + ' : '') + info.nombre.toUpperCase();
      }
      this._etiqueta = out || 'PULSO BASE';
    }
    return this._etiqueta;
  }
}

/**
 * Dispara. Devuelve el número de proyectiles creados.
 * `crear` es una función del mundo que reserva la entidad.
 */
export function disparar(mundo, jugador, arma, angulo, rng) {
  if (!arma.listo) return 0;
  const m = arma.mascara;
  const S = mundo.ent;

  const escopeta = (m & MOD.ESCOPETA) !== 0;
  const orbital = (m & MOD.ORBITAL) !== 0;
  const perfora = (m & MOD.PERFORANTE) !== 0;

  let n = escopeta ? 5 : 1;
  let apertura = escopeta ? 0.30 : 0.022;
  let velocidad = VELOCIDAD_BASE * (escopeta ? 0.82 : 1) * (perfora ? 1.22 : 1);
  let vida = VIDA_BASE * (escopeta ? 0.55 : 1) * (perfora ? 1.35 : 1);
  let danio = DANIO_BASE * arma.nivelDanio * (escopeta ? 0.52 : 1) * (perfora ? 1.18 : 1);

  if (orbital) {
    // Los orbitales no se disparan hacia fuera: se acumulan girando.
    if (arma.orbitales >= (escopeta ? 8 : 5)) return 0;
    n = escopeta ? 2 : 1;
    vida = 6.5;
    velocidad = 0;
    danio *= 0.85;
  }

  let creados = 0;
  for (let i = 0; i < n; i++) {
    const desvio = n === 1 ? rng.spread(apertura) : ((i / (n - 1)) - 0.5) * apertura * 2 + rng.spread(0.03);
    const ang = angulo + desvio;
    const e = mundo.crearEntidad(MASK.FISICA | MASK.SPRITE | MASK.PROYECTIL | MASK.EMISIVO | MASK.LUZ | (orbital ? MASK.ORBITAL : 0));
    if (e < 0) break;

    const distInicial = orbital ? 0 : 26;
    S.x[e] = jugador.x + Math.cos(ang) * distInicial;
    S.y[e] = jugador.y + Math.sin(ang) * distInicial;
    S.px[e] = S.x[e]; S.py[e] = S.y[e];
    S.vx[e] = Math.cos(ang) * velocidad;
    S.vy[e] = Math.sin(ang) * velocidad;
    S.hw[e] = escopeta ? 5 : 7; S.hh[e] = escopeta ? 4 : 5;
    S.tipo[e] = orbital ? TIPO.ORBITAL : TIPO.BALA_JUGADOR;
    S.equipo[e] = 0;
    S.dmg[e] = danio;
    S.vida[e] = vida; S.vidaMax[e] = vida;
    S.angulo[e] = ang;
    S.modulos[e] = m;
    S.escala[e] = 1;
    S.flags[e] = FLAG.IGNORA_GRAVEDAD;
    S.golpes[e] = perfora ? 3 : 1;
    S.c[e] = (m & MOD.REBOTE) ? (perfora ? 5 : 4) : 0;   // rebotes restantes
    S.objetivo[e] = -1;

    if (orbital) {
      arma.orbitales++;
      S.a[e] = (arma.orbitales * (TAU / 5)) + rng.spread(0.4);   // fase angular
      S.b[e] = 78 + rng.spread(10);                              // radio de órbita
      S.d[e] = 3.4 + rng.spread(0.6);                            // velocidad angular
      S.padre[e] = 0;
    }

    // Aspecto según el módulo dominante.
    S.sprite[e] = mundo.spriteProyectil(m);
    S.luzR[e] = 0.45; S.luzG[e] = 0.85; S.luzB[e] = 1;
    if (m & MOD.PERFORANTE) { S.luzR[e] = 1; S.luzG[e] = 0.95; S.luzB[e] = 0.55; }
    if (m & MOD.CADENA) { S.luzR[e] = 0.72; S.luzG[e] = 0.5; S.luzB[e] = 1; }
    if (m & MOD.REBOTE) { S.luzG[e] = 1; S.luzB[e] = 0.75; }
    S.luzRadio[e] = 110; S.luzInt[e] = 0.75;
    creados++;
  }

  arma.enfriamiento = arma.cadencia * (escopeta ? 2.6 : 1) * (orbital ? 2.2 : 1);
  arma.calor = Math.min(1.35, arma.calor + (escopeta ? 0.16 : 0.075));
  if (arma.calor >= 1.2) arma.sobrecalentada = true;
  arma.retroceso = 1;

  if (creados > 0) {
    mundo.eventos.emit(EV.DISPARO, jugador.x, jugador.y, arma.equipados.length, 0);
  }
  return creados;
}

/** Perfil de sonido/aspecto según los módulos (0..3). */
export function perfilSonido(mascara) {
  if (mascara & MOD.ESCOPETA) return 2;
  if (mascara & MOD.PERFORANTE) return 1;
  if (mascara & MOD.CADENA) return 3;
  return 0;
}

/**
 * Actualiza un proyectil del jugador. Devuelve false si debe morir.
 * Aquí es donde los módulos se combinan.
 */
export function actualizarProyectil(mundo, e, dt) {
  const S = mundo.ent;
  const m = S.modulos[e];

  S.vida[e] -= dt;
  if (S.vida[e] <= 0) return false;

  if (S.tipo[e] === TIPO.ORBITAL) {
    const j = mundo.jugador;
    S.a[e] += S.d[e] * dt;
    let radio = S.b[e];
    // Orbital + Buscador: sale de la órbita al detectar un objetivo cercano.
    if ((m & MOD.BUSCADOR) && S.estado[e] === 0) {
      const obj = mundo.enemigoMasCercano(S.x[e], S.y[e], 340, -1);
      if (obj >= 0) {
        S.estado[e] = 1;
        S.objetivo[e] = mundo.ent.handle(obj);
        const ang = Math.atan2(S.y[obj] - S.y[e], S.x[obj] - S.x[e]);
        S.vx[e] = Math.cos(ang) * 620;
        S.vy[e] = Math.sin(ang) * 620;
        S.vida[e] = Math.min(S.vida[e], 2.2);
        mundo.ent.removeBits(e, MASK.ORBITAL);
        mundo.arma.orbitales = Math.max(0, mundo.arma.orbitales - 1);
      }
    }
    if (S.estado[e] === 0) {
      // Órbita elíptica ligera: se lee mejor que un círculo perfecto.
      const ang = S.a[e];
      S.x[e] = j.x + Math.cos(ang) * radio;
      S.y[e] = j.y + Math.sin(ang) * radio * 0.72;
      S.angulo[e] = ang + Math.PI * 0.5;
      return true;
    }
  }

  // Buscador: giro suave hacia el objetivo.
  if (m & MOD.BUSCADOR) {
    let obj = mundo.ent.resolve(S.objetivo[e]);
    if (obj < 0 || mundo.ent.vida[obj] <= 0) {
      obj = mundo.enemigoMasCercano(S.x[e], S.y[e], 520, -1);
      S.objetivo[e] = obj >= 0 ? mundo.ent.handle(obj) : -1;
    }
    if (obj >= 0) {
      const deseado = Math.atan2(S.y[obj] - S.y[e], S.x[obj] - S.x[e]);
      const actual = Math.atan2(S.vy[e], S.vx[e]);
      const giro = clamp(angleDelta(actual, deseado), -6.5 * dt, 6.5 * dt);
      const vel = Math.hypot(S.vx[e], S.vy[e]) || 1;
      const nuevo = actual + giro;
      S.vx[e] = Math.cos(nuevo) * vel;
      S.vy[e] = Math.sin(nuevo) * vel;
    }
  }

  S.angulo[e] = Math.atan2(S.vy[e], S.vx[e]);
  return true;
}
