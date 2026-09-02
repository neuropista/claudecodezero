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

/**
 * Combinaciones con nombre. No cambian las reglas —los módulos ya se acumulan
 * solos— pero le ponen nombre a lo que el jugador acaba de descubrir, que es la
 * diferencia entre "llevo tres iconos" y "llevo la Tormenta de Esquirlas".
 */
export const COMBOS = [
  { bits: MOD.PERFORANTE | MOD.REBOTE | MOD.CADENA, nombre: 'TORMENTA ESTATICA', efecto: 'Atraviesa, rebota y electrifica todo lo que toca' },
  { bits: MOD.ESCOPETA | MOD.BUSCADOR | MOD.CADENA, nombre: 'JAURIA', efecto: 'Cinco fragmentos que buscan y encadenan' },
  { bits: MOD.PERFORANTE | MOD.REBOTE, nombre: 'LANZA RICOCHETE', efecto: 'Una lanza que atraviesa y sigue viva al rebotar' },
  { bits: MOD.ESCOPETA | MOD.REBOTE, nombre: 'TORMENTA DE ESQUIRLAS', efecto: 'Convierte una sala cerrada en una trampa' },
  { bits: MOD.ORBITAL | MOD.BUSCADOR, nombre: 'ENJAMBRE CAZADOR', efecto: 'Nodos que esperan girando y salen a por su presa' },
  { bits: MOD.PERFORANTE | MOD.CADENA, nombre: 'PARARRAYOS', efecto: 'El arco salta desde cada cuerpo perforado' },
  { bits: MOD.ESCOPETA | MOD.PERFORANTE, nombre: 'LANZA DE FRAGMENTOS', efecto: 'Abanico que recupera el alcance perdido' },
  { bits: MOD.ORBITAL | MOD.CADENA, nombre: 'REACTOR', efecto: 'Anillo de nodos que electrifica por contacto' },
  { bits: MOD.BUSCADOR | MOD.REBOTE, nombre: 'AVISPA LOCA', efecto: 'Corrige tras cada rebote: no suelta al objetivo' },
  { bits: MOD.ORBITAL | MOD.ESCOPETA, nombre: 'CORONA', efecto: 'Dos nodos por disparo, muralla alrededor' },
  { bits: MOD.BUSCADOR | MOD.CADENA, nombre: 'CONDUCTOR', efecto: 'Marca al objetivo y detona el arco al reimpactar' },
];

/** Devuelve el combo con nombre que mejor describe una máscara, o null. */
export function comboDe(mascara) {
  let mejor = null, mejorBits = 0;
  for (const c of COMBOS) {
    if ((mascara & c.bits) !== c.bits) continue;
    let n = 0;
    for (let b = c.bits; b; b >>= 1) n += b & 1;
    if (n > mejorBits) { mejor = c; mejorBits = n; }
  }
  return mejor;
}

// Carga: se acumula mientras NO disparas. Premia las ráfagas con criterio en
// vez de mantener el gatillo, y no necesita ningún botón nuevo.
const RETARDO_CARGA = 0.28;    // silencio mínimo antes de empezar a cargar
const TIEMPO_CARGA = 0.82;     // de 0 a listo, una vez empezado

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
    this.carga = 0;              // 0..1; a 1 el siguiente disparo va cargado
    this.silencio = 0;           // tiempo sin disparar
    this.objetivo = -1;          // handle del enemigo fijado (módulo Buscador)
    this._etiqueta = undefined;
    this._etiquetaMascara = -1;
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

    this.silencio += dt;
    if (this.silencio > RETARDO_CARGA && !this.sobrecalentada) {
      const antes = this.carga;
      this.carga = Math.min(1, this.carga + dt / TIEMPO_CARGA);
      if (antes < 1 && this.carga >= 1) this.cargaRecienLista = true;
    }
  }

  get cargado() { return this.carga >= 1; }

  get listo() { return this.enfriamiento <= 0 && !this.sobrecalentada; }

  /**
   * Etiqueta corta del arma resultante, para el HUD. Se cachea por máscara
   * porque el HUD la pide en cada fotograma y sólo cambia al reconfigurar.
   */
  etiqueta() {
    const m = this.mascara;
    if (this._etiquetaMascara === m && this._etiqueta !== undefined) return this._etiqueta;
    this._etiquetaMascara = m;
    const combo = comboDe(m);
    if (this.equipados.length === 0) {
      this._etiqueta = 'PULSO BASE';
    } else if (combo) {
      this._etiqueta = combo.nombre;
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
  const buscador = (m & MOD.BUSCADOR) !== 0;
  // Un disparo cargado no es "otro arma": es el mismo, amplificado, y cada
  // módulo amplifica lo suyo. Escopeta cargada = bala maciza; buscador cargado
  // = tres cabezas; orbital cargado = corona entera de golpe.
  const cargado = arma.cargado;

  let n = escopeta ? 5 : 1;
  let apertura = escopeta ? 0.30 : 0.022;
  let velocidad = VELOCIDAD_BASE * (escopeta ? 0.82 : 1) * (perfora ? 1.22 : 1);
  let vida = VIDA_BASE * (escopeta ? 0.55 : 1) * (perfora ? 1.35 : 1);
  let danio = DANIO_BASE * arma.nivelDanio * (escopeta ? 0.52 : 1) * (perfora ? 1.18 : 1);
  let escala = 1;
  let perforaciones = perfora ? 3 : 1;
  let rebotes = (m & MOD.REBOTE) ? (perfora ? 5 : 4) : 0;

  if (cargado) {
    danio *= 2.6;
    velocidad *= 1.22;
    vida *= 1.5;
    escala = 1.75;
    perforaciones += 2;
    if (rebotes > 0) rebotes += 2;
    if (escopeta) { n = 7; apertura = 0.075; vida *= 1.9; }   // proyectil macizo
    if (buscador && !orbital) { n = Math.max(n, 3); apertura = Math.max(apertura, 0.34); }
  }

  if (orbital) {
    const tope = (escopeta ? 8 : 5) + (cargado ? 3 : 0);
    if (arma.orbitales >= tope) return 0;
    n = (escopeta ? 2 : 1) * (cargado ? 3 : 1);
    vida = 6.5 * (cargado ? 1.6 : 1);
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
    S.hw[e] = (escopeta ? 5 : 7) * escala; S.hh[e] = (escopeta ? 4 : 5) * escala;
    S.tipo[e] = orbital ? TIPO.ORBITAL : TIPO.BALA_JUGADOR;
    S.equipo[e] = 0;
    S.dmg[e] = danio;
    S.vida[e] = vida; S.vidaMax[e] = vida;
    S.angulo[e] = ang;
    S.modulos[e] = m;
    S.escala[e] = escala;
    S.flags[e] = FLAG.IGNORA_GRAVEDAD | (cargado ? FLAG.CARGADO : 0);
    S.golpes[e] = perforaciones;
    S.c[e] = rebotes;
    S.a[e] = 0;              // tiempo de vuelo (rampa del buscador)
    S.marca[e] = 0;
    S.aturdido[e] = 0;
    S.objetivo[e] = buscador ? arma.objetivo : -1;

    if (orbital) {
      arma.orbitales++;
      S.a[e] = (arma.orbitales * (TAU / 5)) + rng.spread(0.4);
      S.b[e] = (78 + rng.spread(10)) * (cargado ? 1.25 : 1);
      S.d[e] = 3.4 + rng.spread(0.6);
      S.padre[e] = 0;
    }

    S.sprite[e] = mundo.spriteProyectil(m);
    S.luzR[e] = 0.45; S.luzG[e] = 0.85; S.luzB[e] = 1;
    if (m & MOD.PERFORANTE) { S.luzR[e] = 1; S.luzG[e] = 0.95; S.luzB[e] = 0.55; }
    if (m & MOD.CADENA) { S.luzR[e] = 0.72; S.luzG[e] = 0.5; S.luzB[e] = 1; }
    if (m & MOD.REBOTE) { S.luzG[e] = 1; S.luzB[e] = 0.75; }
    if (cargado) { S.luzR[e] = Math.min(1, S.luzR[e] + 0.3); S.luzG[e] = Math.min(1, S.luzG[e] + 0.2); }
    S.luzRadio[e] = 110 * (cargado ? 1.6 : 1); S.luzInt[e] = cargado ? 1.2 : 0.75;
    creados++;
  }

  arma.enfriamiento = arma.cadencia * (escopeta ? 2.6 : 1) * (orbital ? 2.2 : 1) * (cargado ? 1.7 : 1);
  arma.calor = Math.min(1.35, arma.calor + (escopeta ? 0.16 : 0.075) * (cargado ? 1.4 : 1));
  if (arma.calor >= 1.2) arma.sobrecalentada = true;
  arma.retroceso = cargado ? 2.2 : 1;
  arma.silencio = 0;
  if (cargado) arma.carga = 0;
  arma.cargaRecienLista = false;

  if (creados > 0) {
    mundo.eventos.emit(EV.DISPARO, jugador.x, jugador.y, arma.equipados.length, cargado ? 1 : 0);
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

  // Buscador: gira hacia el objetivo fijado y gana fuerza cuanto más lo
  // persigue. Un disparo que lleva rato detrás de alguien duele más.
  if (m & MOD.BUSCADOR) {
    S.a[e] += dt;
    if (S.a[e] < 1.4) S.dmg[e] *= 1 + 0.35 * dt;

    let obj = mundo.ent.resolve(S.objetivo[e]);
    if (obj < 0 || mundo.ent.vida[obj] <= 0) {
      obj = mundo.enemigoMasCercano(S.x[e], S.y[e], 560, -1);
      S.objetivo[e] = obj >= 0 ? mundo.ent.handle(obj) : -1;
    }
    if (obj >= 0) {
      const deseado = Math.atan2(S.y[obj] - S.y[e], S.x[obj] - S.x[e]);
      const actual = Math.atan2(S.vy[e], S.vx[e]);
      const agilidad = (S.flags[e] & FLAG.CARGADO) ? 9 : 6.5;
      const giro = clamp(angleDelta(actual, deseado), -agilidad * dt, agilidad * dt);
      const vel = Math.hypot(S.vx[e], S.vy[e]) || 1;
      const nuevo = actual + giro;
      S.vx[e] = Math.cos(nuevo) * vel;
      S.vy[e] = Math.sin(nuevo) * vel;
    }
  }

  S.angulo[e] = Math.atan2(S.vy[e], S.vx[e]);
  return true;
}
