// enemies.js — Bestiario y su IA.
//
// Cada tipo plantea un problema táctico distinto, no sólo una barra de vida:
//   dron        te obliga a moverte en horizontal
//   rastreador  te empuja hacia arriba y castiga quedarte en el suelo
//   volador     castiga quedarte quieto
//   escudo      te obliga a rodearlo (su espalda es su punto débil)
//   enjambre    llena el espacio y te obliga a limpiar rápido
//   bombardero  te expulsa del sitio donde estás
//   torreta     corta líneas de tiro
//   tejedor     tiende un cable entre dos: hay que decidir a cuál matas antes
//   espejo      te devuelve tus propios disparos salvo en su ventana abierta
//   divisor     se multiplica: obliga a gestionar el ritmo de la sala
//
// Tres sistemas transversales dan el ritmo del combate:
//   · AGUANTE: el daño acumulado rompe la postura y deja al enemigo aturdido
//     y vulnerable. Disparar tiene ritmo en vez de ser vaciar una barra.
//   · PUNTOS DÉBILES: acertar donde toca multiplica el daño. Premia apuntar.
//   · TELEGRAFÍA: todo ataque comprometido dibuja su área real antes de salir,
//     y mientras está comprometido se puede devolver con un parry.

import { MASK, TIPO, FLAG, ELITE } from './components.js';
import { EV } from '../core/events.js';
import { clamp, approach, sign, angleDelta, TAU } from '../core/math.js';
import { P } from './player.js';

/**
 * `debil` está en coordenadas locales: ox se refleja con la orientación.
 * `aguante` es cuánto daño hay que meterle seguido para romperle la postura.
 */
export const STATS = {
  [TIPO.DRON]: {
    vida: 34, dmg: 10, hw: 17, hh: 17, vel: 132, sprite: 'enem.dron.0', cuadros: 6,
    aire: true, valor: 1, aguante: 30, debil: { ox: 0, oy: 0, r: 9, mult: 2.2 },
  },
  [TIPO.RASTREADOR]: {
    vida: 52, dmg: 14, hw: 20, hh: 16, vel: 190, sprite: 'enem.rastreador.0', cuadros: 6,
    aire: false, valor: 1, aguante: 44, debil: { ox: -16, oy: -6, r: 11, mult: 2.0 },
  },
  [TIPO.VOLADOR]: {
    vida: 28, dmg: 12, hw: 18, hh: 14, vel: 205, sprite: 'enem.volador.0', cuadros: 6,
    aire: true, valor: 1, aguante: 22, debil: { ox: 0, oy: -2, r: 8, mult: 2.0 },
  },
  [TIPO.ESCUDO]: {
    vida: 96, dmg: 16, hw: 22, hh: 22, vel: 92, sprite: 'enem.escudo.0', cuadros: 4,
    aire: false, valor: 2, aguante: 88, debil: { ox: -20, oy: 0, r: 15, mult: 3.0 },
  },
  [TIPO.ENJAMBRE]: {
    vida: 10, dmg: 7, hw: 8, hh: 8, vel: 265, sprite: 'enem.enjambre.0', cuadros: 4,
    aire: true, valor: 0, aguante: 8, debil: null,
  },
  [TIPO.BOMBARDERO]: {
    vida: 40, dmg: 26, hw: 18, hh: 18, vel: 118, sprite: 'enem.bombardero.0', cuadros: 5,
    aire: true, valor: 2, aguante: 34, debil: { ox: 0, oy: 0, r: 10, mult: 2.5 },
  },
  [TIPO.TORRETA]: {
    vida: 60, dmg: 12, hw: 20, hh: 18, vel: 0, sprite: 'enem.torreta.0', cuadros: 4,
    aire: false, valor: 1, aguante: 52, debil: { ox: 0, oy: -14, r: 10, mult: 2.2 },
  },
  [TIPO.TEJEDOR]: {
    vida: 44, dmg: 13, hw: 16, hh: 16, vel: 118, sprite: 'enem.tejedor.0', cuadros: 5,
    aire: true, valor: 2, aguante: 38, debil: { ox: 0, oy: 0, r: 9, mult: 2.4 },
  },
  [TIPO.ESPEJO]: {
    vida: 58, dmg: 14, hw: 20, hh: 20, vel: 104, sprite: 'enem.espejo.0', cuadros: 4,
    aire: true, valor: 2, aguante: 58, debil: { ox: 0, oy: 0, r: 13, mult: 2.5 },
  },
  [TIPO.DIVISOR]: {
    vida: 70, dmg: 18, hw: 22, hh: 20, vel: 128, sprite: 'enem.divisor.0', cuadros: 4,
    aire: false, valor: 2, aguante: 48, debil: { ox: 0, oy: -4, r: 12, mult: 1.9 },
  },
};

const COLOR_HOSTIL = [1.0, 0.24, 0.43];

/** Tinte y ajustes de cada modificador de élite. */
const AJUSTE_ELITE = [
  { nombre: 'BLINDADO', vida: 3.0, dmg: 1.35, vel: 0.85, escala: 1.32, aguante: 0.55, luz: [0.6, 0.85, 1.0] },
  { nombre: 'VELOZ', vida: 1.5, dmg: 1.2, vel: 1.55, escala: 0.86, aguante: 0.8, luz: [1.0, 0.9, 0.35] },
  { nombre: 'VOLATIL', vida: 2.0, dmg: 1.3, vel: 1.05, escala: 1.15, aguante: 1.0, luz: [1.0, 0.55, 0.2] },
  { nombre: 'REGENERADOR', vida: 2.6, dmg: 1.25, vel: 1.0, escala: 1.2, aguante: 1.3, luz: [0.45, 1.0, 0.6] },
];

export function crearEnemigo(mundo, tipo, x, y, elite = false, escalaVida = 1, nivelDivisor = 0) {
  const S = mundo.ent;
  const st = STATS[tipo];
  if (!st) return -1;
  const e = mundo.crearEntidad(MASK.FISICA | MASK.SPRITE | MASK.VIDA | MASK.ENEMIGO | MASK.LUZ);
  if (e < 0) return -1;

  const variante = elite ? mundo.rng.int(AJUSTE_ELITE.length) : 0;
  const A = elite ? AJUSTE_ELITE[variante] : null;
  // El divisor encoge y pierde vida en cada generación.
  const factorDiv = tipo === TIPO.DIVISOR ? Math.pow(0.52, nivelDivisor) : 1;
  const escalaDiv = tipo === TIPO.DIVISOR ? Math.pow(0.72, nivelDivisor) : 1;

  S.x[e] = x; S.y[e] = y; S.px[e] = x; S.py[e] = y;
  S.vx[e] = 0; S.vy[e] = 0;
  S.hw[e] = st.hw * escalaDiv; S.hh[e] = st.hh * escalaDiv;
  S.tipo[e] = tipo;
  S.equipo[e] = 1;
  S.vida[e] = st.vida * escalaVida * factorDiv * (A ? A.vida : 1);
  S.vidaMax[e] = S.vida[e];
  S.dmg[e] = st.dmg * factorDiv * (A ? A.dmg : 1);
  S.aguanteMax[e] = st.aguante * escalaVida * factorDiv * (A ? A.aguante : 1);
  S.aguante[e] = S.aguanteMax[e];
  S.aturdido[e] = 0;
  S.sinGolpe[e] = 0;
  S.marca[e] = 0;
  S.variante[e] = tipo === TIPO.DIVISOR ? nivelDivisor : variante;
  S.enlace[e] = -1;
  S.sprite[e] = mundo.R.idx(st.sprite);
  S.cuadros[e] = st.cuadros;
  S.velAnim[e] = 6 + mundo.rng.float() * 3;
  S.anim[e] = mundo.rng.float() * 4;
  S.escala[e] = escalaDiv * (A ? A.escala : 1);
  S.facing[e] = mundo.jugador && mundo.jugador.x < x ? -1 : 1;
  S.estado[e] = 0;
  S.t1[e] = mundo.rng.range(0.4, 1.6);
  S.t2[e] = 0;
  S.a[e] = mundo.rng.angle();
  S.b[e] = 0; S.c[e] = 0; S.d[e] = 0;
  S.objetivo[e] = -1;
  S.flags[e] = st.aire ? FLAG.IGNORA_GRAVEDAD : 0;
  if (elite) S.flags[e] |= FLAG.ELITE;
  if (tipo === TIPO.ESCUDO) S.flags[e] |= FLAG.ESCUDO_FRONTAL;

  S.luzR[e] = COLOR_HOSTIL[0]; S.luzG[e] = COLOR_HOSTIL[1]; S.luzB[e] = COLOR_HOSTIL[2];
  if (tipo === TIPO.VOLADOR) { S.luzR[e] = 0.75; S.luzG[e] = 0.4; S.luzB[e] = 1; }
  if (tipo === TIPO.BOMBARDERO) { S.luzR[e] = 1; S.luzG[e] = 0.55; S.luzB[e] = 0.2; }
  if (tipo === TIPO.ESCUDO) { S.luzR[e] = 0.4; S.luzG[e] = 0.7; S.luzB[e] = 1; }
  if (tipo === TIPO.TEJEDOR) { S.luzR[e] = 0.45; S.luzG[e] = 1; S.luzB[e] = 0.85; }
  if (tipo === TIPO.ESPEJO) { S.luzR[e] = 0.8; S.luzG[e] = 0.9; S.luzB[e] = 1; }
  if (tipo === TIPO.DIVISOR) { S.luzR[e] = 1; S.luzG[e] = 0.45; S.luzB[e] = 0.75; }
  if (A) { S.luzR[e] = A.luz[0]; S.luzG[e] = A.luz[1]; S.luzB[e] = A.luz[2]; }
  S.luzRadio[e] = (elite ? 230 : 155) * escalaDiv;
  S.luzInt[e] = elite ? 0.85 : 0.55;

  if (tipo === TIPO.TEJEDOR) emparejarTejedor(mundo, e);

  mundo.fx.aparicion(x, y, S.luzR[e], S.luzG[e], S.luzB[e]);
  return e;
}

/** Proyectil enemigo. Los DESTRUIBLE se pueden devolver con parry. */
export function dispararEnemigo(mundo, x, y, ang, vel, dmg, grande = false, destruible = true) {
  const S = mundo.ent;
  const e = mundo.crearEntidad(MASK.FISICA | MASK.SPRITE | MASK.PROYECTIL | MASK.EMISIVO | MASK.LUZ);
  if (e < 0) return -1;
  S.x[e] = x; S.y[e] = y; S.px[e] = x; S.py[e] = y;
  S.vx[e] = Math.cos(ang) * vel;
  S.vy[e] = Math.sin(ang) * vel;
  S.hw[e] = grande ? 11 : 7; S.hh[e] = grande ? 11 : 7;
  S.tipo[e] = TIPO.BALA_ENEMIGA;
  S.equipo[e] = 1;
  S.dmg[e] = dmg;
  S.vida[e] = grande ? 4.5 : 3.2;
  S.vidaMax[e] = S.vida[e];
  S.angulo[e] = ang;
  S.escala[e] = 1;
  S.golpes[e] = 1;
  S.modulos[e] = 0;
  S.c[e] = 0;
  S.marca[e] = 0;
  S.flags[e] = FLAG.IGNORA_GRAVEDAD | (destruible ? FLAG.DESTRUIBLE : 0);
  S.sprite[e] = mundo.R.idx(grande ? 'bala.enemigaGrande' : 'bala.enemiga');
  S.luzR[e] = 1; S.luzG[e] = 0.35; S.luzB[e] = 0.45;
  S.luzRadio[e] = grande ? 150 : 100; S.luzInt[e] = 0.7;
  return e;
}

function haciaJugador(mundo, e) {
  const S = mundo.ent;
  const j = mundo.jugador;
  const dx = j.x - S.x[e], dy = j.y - S.y[e];
  const d = Math.hypot(dx, dy) || 1;
  mundo._dx = dx / d; mundo._dy = dy / d; mundo._dist = d;
  return d;
}

/** Marca el ataque como comprometido: telegrafiado y devolvible con parry. */
function comprometer(mundo, e, duracion) {
  const S = mundo.ent;
  S.flags[e] |= FLAG.PARRYABLE;
  S.t2[e] = duracion;
  mundo.eventos.emit(EV.TELEGRAFIA, S.x[e], S.y[e], 1, 0);
}

function soltarCompromiso(S, e) { S.flags[e] &= ~FLAG.PARRYABLE; }

// ---------------------------------------------------------------- aguante ---

/**
 * Aplica desgaste de postura. Devuelve true si el enemigo acaba de quedar
 * aturdido, para que quien llame pueda reaccionar (efectos, sonido, cámara).
 */
export function desgastarAguante(mundo, e, cantidad) {
  const S = mundo.ent;
  if (S.tipo[e] === TIPO.JEFE) return false;
  S.sinGolpe[e] = 0;
  if (S.aturdido[e] > 0) return false;
  S.aguante[e] -= cantidad;
  if (S.aguante[e] > 0) return false;
  S.aguante[e] = S.aguanteMax[e];
  S.aturdido[e] = 0.95;
  S.estado[e] = 0;
  S.t1[e] = Math.max(S.t1[e], 0.7);
  S.t2[e] = 0;
  soltarCompromiso(S, e);
  S.vx[e] *= 0.25; S.vy[e] *= 0.25;
  mundo.fx.aturdimiento(S.x[e], S.y[e]);
  mundo.eventos.emit(EV.ATURDIMIENTO, S.x[e], S.y[e], 1, 0);
  return true;
}

/** Punto débil en coordenadas de mundo. Devuelve false si el tipo no tiene. */
export function puntoDebil(S, e, out) {
  const st = STATS[S.tipo[e]];
  if (!st || !st.debil) return false;
  // El espejo sólo enseña su núcleo cuando está abierto.
  if (S.tipo[e] === TIPO.ESPEJO && (S.flags[e] & FLAG.ABIERTO) === 0) return false;
  const esc = S.escala[e] || 1;
  out[0] = S.x[e] + st.debil.ox * esc * (S.facing[e] < 0 ? -1 : 1);
  out[1] = S.y[e] + st.debil.oy * esc;
  out[2] = st.debil.r * esc;
  out[3] = st.debil.mult;
  return true;
}

/** Reducción de daño por élite blindado. */
export function factorDanio(S, e) {
  if ((S.flags[e] & FLAG.ELITE) && S.variante[e] === ELITE.BLINDADO) return 0.6;
  return 1;
}

// ------------------------------------------------------------- separación ---

/**
 * Empuje mutuo entre enemigos. Sin esto se apilan en el mismo píxel y una
 * oleada de diez se lee como un solo bulto.
 *
 * Dos detalles que costaron un intento fallido:
 *  · Se corrige la POSICIÓN, no la velocidad. Aplicándolo a la velocidad, el
 *    `approach()` de cada IA lo cancelaba al tick siguiente y no separaba nada.
 *  · Si dos enemigos caen exactamente en el mismo punto la dirección de empuje
 *    es indefinida; se usa un ángulo derivado del id (determinista) para que
 *    una pila perfecta también se deshaga.
 */
const EMPUJE_MAX = 130;        // px/s
const ANGULO_DORADO = 2.39996322972865332;

export function separarEnemigos(mundo, dt) {
  const S = mundo.ent;
  const rej = mundo.rejillaEnemigos;
  for (let i = 0; i < S.count; i++) {
    const e = S.dense[i];
    if (S.alive[e] !== 1 || (S.mask[e] & MASK.ENEMIGO) === 0) continue;
    const tipo = S.tipo[e];
    if (tipo === TIPO.TORRETA || tipo === TIPO.JEFE || tipo === TIPO.JEFE_OJO) continue;

    const radio = S.hw[e] + 26;
    const n = rej.consultar(S.x[e], S.y[e], radio);
    let ex = 0, ey = 0, cuenta = 0;
    for (let k = 0; k < n; k++) {
      const o = rej.resultado[k];
      if (o === e || S.alive[o] !== 1) continue;
      const tipoO = S.tipo[o];
      if (tipoO === TIPO.TORRETA || tipoO === TIPO.JEFE || tipoO === TIPO.JEFE_OJO) continue;
      const dx = S.x[e] - S.x[o], dy = S.y[e] - S.y[o];
      const d2 = dx * dx + dy * dy;
      const min = S.hw[e] + S.hw[o];
      if (d2 > min * min) continue;
      cuenta++;
      if (d2 < 0.25) {
        // Superpuestos del todo: dirección estable a partir del id.
        const a = e * ANGULO_DORADO;
        ex += Math.cos(a); ey += Math.sin(a);
      } else {
        const d = Math.sqrt(d2);
        const fuerza = 1 - d / min;
        ex += (dx / d) * fuerza;
        ey += (dy / d) * fuerza;
      }
    }
    if (cuenta === 0) continue;

    // Se acota la suma: con muchos vecinos, si no, daría un salto.
    const len = Math.hypot(ex, ey);
    if (len > 2.5) { ex = ex / len * 2.5; ey = ey / len * 2.5; }

    const aire = (S.flags[e] & FLAG.IGNORA_GRAVEDAD) !== 0;
    const nx = S.x[e] + ex * EMPUJE_MAX * dt;
    const ny = aire ? S.y[e] + ey * EMPUJE_MAX * dt : S.y[e];
    // Nunca se empuja dentro de la roca: primero se intenta el movimiento
    // completo y, si no cabe, sólo el horizontal.
    if (!mundo.fisica.solapaSolido(nx, ny, S.hw[e], S.hh[e])) {
      S.x[e] = nx; S.y[e] = ny;
    } else if (!mundo.fisica.solapaSolido(nx, S.y[e], S.hw[e], S.hh[e])) {
      S.x[e] = nx;
    }
  }
}

// ------------------------------------------------------------- tejedores ---

function emparejarTejedor(mundo, e) {
  const S = mundo.ent;
  for (let i = 0; i < S.count; i++) {
    const o = S.dense[i];
    if (o === e || S.alive[o] !== 1) continue;
    if (S.tipo[o] !== TIPO.TEJEDOR) continue;
    if (S.resolve(S.enlace[o]) >= 0) continue;
    S.enlace[o] = S.handle(e);
    S.enlace[e] = S.handle(o);
    return;
  }
}

// ------------------------------------------------------------------- IA ----

export function actualizarEnemigo(mundo, e, dt) {
  const S = mundo.ent;
  const tipo = S.tipo[e];
  const j = mundo.jugador;
  if (!j || j.id < 0) return;

  S.anim[e] += dt * S.velAnim[e];
  S.flash[e] = Math.max(0, S.flash[e] - dt * 6);
  S.sinGolpe[e] += dt;
  S.marca[e] = Math.max(0, S.marca[e] - dt);

  // Regeneración de aguante y de vida (élite regenerador).
  if (S.sinGolpe[e] > 1.3 && S.aturdido[e] <= 0) {
    S.aguante[e] = Math.min(S.aguanteMax[e], S.aguante[e] + S.aguanteMax[e] * 0.45 * dt);
  }
  if ((S.flags[e] & FLAG.ELITE) && S.variante[e] === ELITE.REGENERADOR && S.sinGolpe[e] > 2) {
    S.vida[e] = Math.min(S.vidaMax[e], S.vida[e] + S.vidaMax[e] * 0.07 * dt);
  }

  // Aturdido: ni se mueve ni ataca. Es la ventana para castigarlo.
  if (S.aturdido[e] > 0) {
    S.aturdido[e] -= dt;
    S.vx[e] = approach(S.vx[e], 0, 700 * dt);
    if ((S.flags[e] & FLAG.IGNORA_GRAVEDAD) !== 0) S.vy[e] = approach(S.vy[e], 0, 700 * dt);
    if (S.aturdido[e] <= 0) S.t1[e] = 0.45;
    return;
  }

  S.t1[e] -= dt;
  S.t2[e] = Math.max(0, S.t2[e] - dt);

  const d = haciaJugador(mundo, e);
  const dx = mundo._dx, dy = mundo._dy;
  const vivo = j.estado !== 6;
  const st = STATS[tipo];
  const A = (S.flags[e] & FLAG.ELITE) ? AJUSTE_ELITE[S.variante[e]] : null;
  const vel = st.vel * (A ? A.vel : 1);

  switch (tipo) {
    case TIPO.DRON: dron(mundo, e, dt, d, dx, dy, vivo, vel); break;
    case TIPO.RASTREADOR: rastreador(mundo, e, dt, d, dx, dy, vivo, vel); break;
    case TIPO.VOLADOR: volador(mundo, e, dt, d, dx, dy, vivo, vel); break;
    case TIPO.ESCUDO: escudo(mundo, e, dt, d, dx, dy, vivo, vel); break;
    case TIPO.ENJAMBRE: enjambre(mundo, e, dt, dx, dy, vel); break;
    case TIPO.BOMBARDERO: bombardero(mundo, e, dt, d, dx, dy, vivo, vel); break;
    case TIPO.TORRETA: torreta(mundo, e, dt, d, vivo); break;
    case TIPO.TEJEDOR: tejedor(mundo, e, dt, d, dx, dy, vivo, vel); break;
    case TIPO.ESPEJO: espejo(mundo, e, dt, d, dx, dy, vivo, vel); break;
    case TIPO.DIVISOR: divisor(mundo, e, dt, d, dx, dy, vivo, vel); break;
    default: break;
  }
}

// --- Dron: fuego de supresión a media distancia -----------------------------
function dron(mundo, e, dt, d, dx, dy, vivo, vel) {
  const S = mundo.ent;
  const j = mundo.jugador;
  const ideal = 230;
  const empuje = d < ideal - 40 ? -1 : d > ideal + 40 ? 1 : 0;
  S.vx[e] = approach(S.vx[e], dx * vel * empuje, 400 * dt);
  S.vy[e] = approach(S.vy[e], dy * vel * empuje + Math.sin(S.anim[e] * 0.7 + S.a[e]) * 45, 400 * dt);
  S.facing[e] = dx > 0 ? 1 : -1;

  if (S.estado[e] === 0 && S.t1[e] <= 0 && d < 520 && vivo &&
      mundo.lineaDeVision(S.x[e], S.y[e], j.x, j.y)) {
    S.estado[e] = 1;
    S.t1[e] = 2.1 + mundo.rng.float() * 1.1;
    S.d[e] = 3;
    S.a[e] = Math.atan2(j.y - S.y[e], j.x - S.x[e]);
    comprometer(mundo, e, 0.5);
    mundo.fx.zonaCono(S.x[e], S.y[e], S.a[e], 0.16, 520, 0.5, S.handle(e));
  }
  if (S.estado[e] === 1 && S.t2[e] <= 0) {
    soltarCompromiso(S, e);
    if (S.d[e] > 0) {
      const ang = Math.atan2(j.y - S.y[e], j.x - S.x[e]) + mundo.rng.spread(0.07);
      dispararEnemigo(mundo, S.x[e] + dx * 20, S.y[e] + dy * 20, ang, 360, S.dmg[e]);
      mundo.fx.fogonazo(S.x[e] + dx * 20, S.y[e] + dy * 20, ang, 1, 0.35, 0.5);
      S.d[e]--;
      S.t2[e] = 0.13;
    } else S.estado[e] = 0;
  }
}

// --- Rastreador: persigue por el suelo y embiste ----------------------------
function rastreador(mundo, e, dt, d, dx, dy, vivo, vel) {
  const S = mundo.ent;
  const j = mundo.jugador;
  const enSuelo = S.b[e] > 0;

  if (S.estado[e] === 0) {
    const dir = sign(dx) || 1;
    S.vx[e] = approach(S.vx[e], dir * vel * (d > 90 ? 1 : 0), 900 * dt);
    S.facing[e] = dir;

    // Salta con criterio: si tiene un muro delante, o si el suelo se acaba y
    // el jugador está al otro lado. Antes saltaba al azar y se veía tonto.
    if (enSuelo) {
      const frente = S.x[e] + dir * (S.hw[e] + 18);
      const hayMuro = S.c[e] > 0;
      const hayHueco = !mundo.fisica.haySueloBajo(frente, S.y[e], 6, S.hh[e], 8);
      const jugadorArriba = j.y < S.y[e] - 50;
      if (hayMuro || (hayHueco && Math.abs(j.x - S.x[e]) > 40) || (jugadorArriba && mundo.rng.bool(0.03))) {
        S.vy[e] = -560;
        S.c[e] = 0;
      }
    }

    if (d < 270 && Math.abs(j.y - S.y[e]) < 80 && S.t1[e] <= 0 && vivo) {
      S.estado[e] = 1;
      S.t1[e] = 2.6;
      comprometer(mundo, e, 0.46);
      const alcance = 340;
      mundo.fx.zonaLinea(S.x[e], S.y[e], S.x[e] + S.facing[e] * alcance, S.y[e],
        S.hh[e] * 2.1, 0.46, S.handle(e));
    }
  } else if (S.estado[e] === 1) {
    S.vx[e] = approach(S.vx[e], 0, 1800 * dt);
    if (S.t2[e] <= 0) {
      soltarCompromiso(S, e);
      S.estado[e] = 2; S.t2[e] = 0.55;
      S.vx[e] = S.facing[e] * 640;
      if (S.b[e] > 0) S.vy[e] = -190;
      mundo.fx.dash(S.x[e], S.y[e], S.facing[e] > 0 ? 0 : Math.PI);
    }
  } else if (S.t2[e] <= 0) S.estado[e] = 0;
}

// --- Volador: vuelo ondulante y picado --------------------------------------
function volador(mundo, e, dt, d, dx, dy, vivo, vel) {
  const S = mundo.ent;
  const j = mundo.jugador;
  S.a[e] += dt * 2.4;
  if (S.estado[e] === 0) {
    const alturaObjetivo = j.y - 130;
    S.vx[e] = approach(S.vx[e], dx * vel, 500 * dt);
    S.vy[e] = approach(S.vy[e], (alturaObjetivo - S.y[e]) * 2.4 + Math.sin(S.a[e]) * 70, 600 * dt);
    S.facing[e] = dx > 0 ? 1 : -1;
    if (Math.abs(j.x - S.x[e]) < 100 && S.y[e] < j.y - 60 && S.t1[e] <= 0 && vivo) {
      S.estado[e] = 1; S.t1[e] = 3.2;
      comprometer(mundo, e, 0.38);
      mundo.fx.zonaLinea(S.x[e], S.y[e], S.x[e], S.y[e] + 420, S.hw[e] * 2.2, 0.38, S.handle(e));
    }
  } else if (S.estado[e] === 1) {
    S.vx[e] = approach(S.vx[e], 0, 1400 * dt);
    S.vy[e] = approach(S.vy[e], -60, 900 * dt);
    if (S.t2[e] <= 0) {
      soltarCompromiso(S, e);
      S.estado[e] = 2; S.t2[e] = 0.8;
      S.vx[e] = dx * 240; S.vy[e] = 780;
    }
  } else {
    S.vy[e] = approach(S.vy[e], -140, 700 * dt);
    if (S.t2[e] <= 0) S.estado[e] = 0;
  }
}

// --- Escudo: avanza de frente; hay que rodearlo -----------------------------
function escudo(mundo, e, dt, d, dx, dy, vivo, vel) {
  const S = mundo.ent;
  const j = mundo.jugador;
  const dir = sign(dx) || 1;
  S.facing[e] = dir;
  S.vx[e] = approach(S.vx[e], dir * vel, 500 * dt);
  S.angulo[e] = Math.atan2(j.y - S.y[e], j.x - S.x[e]);

  if (S.estado[e] === 0 && S.t1[e] <= 0 && d < 420 && vivo) {
    S.estado[e] = 1;
    S.t1[e] = 2.6 + mundo.rng.float();
    S.a[e] = S.angulo[e];
    comprometer(mundo, e, 0.55);
    mundo.fx.zonaCono(S.x[e], S.y[e], S.a[e], 0.30, 420, 0.55, S.handle(e));
  } else if (S.estado[e] === 1 && S.t2[e] <= 0) {
    soltarCompromiso(S, e);
    S.estado[e] = 0;
    const base = S.angulo[e];
    for (let k = -1; k <= 1; k++) {
      dispararEnemigo(mundo, S.x[e] + dx * 24, S.y[e], base + k * 0.24, 320, S.dmg[e] * 0.6);
    }
    mundo.fx.fogonazo(S.x[e] + dx * 24, S.y[e], base, 0.5, 0.75, 1);
  }
}

// --- Enjambre: bandada sin frenos -------------------------------------------
function enjambre(mundo, e, dt, dx, dy, vel) {
  const S = mundo.ent;
  S.a[e] += dt * 6;
  S.vx[e] = approach(S.vx[e], dx * vel + Math.cos(S.a[e]) * 90, 900 * dt);
  S.vy[e] = approach(S.vy[e], dy * vel + Math.sin(S.a[e] * 1.3) * 90, 900 * dt);
  S.facing[e] = dx > 0 ? 1 : -1;
}

// --- Bombardero: se acerca, pita y revienta ---------------------------------
function bombardero(mundo, e, dt, d, dx, dy, vivo, vel) {
  const S = mundo.ent;
  if (S.estado[e] === 0) {
    S.vx[e] = approach(S.vx[e], dx * vel, 260 * dt);
    S.vy[e] = approach(S.vy[e], dy * vel, 260 * dt);
    if (d < 140 && vivo) {
      S.estado[e] = 1;
      comprometer(mundo, e, 0.95);
      // El círculo dice exactamente hasta dónde llega. Y se puede devolver.
      mundo.fx.zonaCirculo(S.x[e], S.y[e], 130, 0.95, S.handle(e), 1, 0.5, 0.2);
    }
  } else {
    S.vx[e] = approach(S.vx[e], dx * 60, 400 * dt);
    S.vy[e] = approach(S.vy[e], dy * 60, 400 * dt);
    S.flash[e] = 0.35 + 0.65 * Math.abs(Math.sin(S.t2[e] * 22));
    if (S.t2[e] <= 0) { mundo.matarEnemigo(e, true); }
  }
}

// --- Torreta ---------------------------------------------------------------
function torreta(mundo, e, dt, d, vivo) {
  const S = mundo.ent;
  const j = mundo.jugador;
  S.angulo[e] = Math.atan2(j.y - S.y[e], j.x - S.x[e]);
  if (S.estado[e] === 0) {
    if (S.t1[e] <= 0 && d < 560 && vivo && mundo.lineaDeVision(S.x[e], S.y[e] - 14, j.x, j.y)) {
      S.estado[e] = 1;
      S.t1[e] = S.d[e] || 1.9;
      comprometer(mundo, e, 0.6);
      mundo.fx.zonaCono(S.x[e], S.y[e] - 14, S.angulo[e], 0.16, 560, 0.6, S.handle(e));
    }
  } else if (S.t2[e] <= 0) {
    soltarCompromiso(S, e);
    const base = S.angulo[e];
    for (let k = 0; k < 3; k++) {
      dispararEnemigo(mundo, S.x[e] + Math.cos(base) * 26, S.y[e] - 14 + Math.sin(base) * 26,
        base + (k - 1) * 0.14, 400, S.dmg[e]);
    }
    mundo.fx.fogonazo(S.x[e] + Math.cos(base) * 26, S.y[e] - 14 + Math.sin(base) * 26, base, 1, 0.4, 0.5);
    mundo.camara.sacudir(0.05);
    S.estado[e] = 0;
  }
}

// --- Tejedor: dos nodos y un cable entre ellos ------------------------------
function tejedor(mundo, e, dt, d, dx, dy, vivo, vel) {
  const S = mundo.ent;
  const j = mundo.jugador;
  const pareja = S.resolve(S.enlace[e]);

  if (pareja >= 0) {
    // En pareja: se colocan a los lados del jugador para cruzarle el cable.
    const lado = S.handle(e) > S.enlace[e] ? 1 : -1;
    const objX = j.x + lado * 190;
    const objY = j.y - 40 + Math.sin(S.anim[e] * 0.5 + S.a[e]) * 40;
    S.vx[e] = approach(S.vx[e], (objX - S.x[e]) * 1.6, 340 * dt);
    S.vy[e] = approach(S.vy[e], (objY - S.y[e]) * 1.6, 340 * dt);
  } else {
    // Solo: se vuelve agresivo y dispara en abanico.
    S.vx[e] = approach(S.vx[e], dx * vel * 1.3, 400 * dt);
    S.vy[e] = approach(S.vy[e], dy * vel * 1.3 - 40, 400 * dt);
    if (S.estado[e] === 0 && S.t1[e] <= 0 && d < 460 && vivo) {
      S.estado[e] = 1;
      S.t1[e] = 2.4;
      S.a[e] = Math.atan2(j.y - S.y[e], j.x - S.x[e]);
      comprometer(mundo, e, 0.45);
      mundo.fx.zonaCono(S.x[e], S.y[e], S.a[e], 0.45, 400, 0.45, S.handle(e));
    } else if (S.estado[e] === 1 && S.t2[e] <= 0) {
      soltarCompromiso(S, e);
      S.estado[e] = 0;
      for (let k = -2; k <= 2; k++) {
        dispararEnemigo(mundo, S.x[e], S.y[e], S.a[e] + k * 0.22, 330, S.dmg[e] * 0.55);
      }
      mundo.fx.fogonazo(S.x[e], S.y[e], S.a[e], 0.5, 1, 0.85);
    }
  }
  S.facing[e] = dx > 0 ? 1 : -1;
}

// --- Espejo: te devuelve tus disparos salvo cuando se abre -------------------
function espejo(mundo, e, dt, d, dx, dy, vivo, vel) {
  const S = mundo.ent;
  const j = mundo.jugador;
  const ideal = 260;
  const empuje = d < ideal - 50 ? -1 : d > ideal + 50 ? 1 : 0;
  S.vx[e] = approach(S.vx[e], dx * vel * empuje, 320 * dt);
  S.vy[e] = approach(S.vy[e], dy * vel * empuje + Math.sin(S.anim[e] * 0.5) * 30, 320 * dt);
  S.facing[e] = dx > 0 ? 1 : -1;
  S.angulo[e] = Math.atan2(j.y - S.y[e], j.x - S.x[e]);

  if ((S.flags[e] & FLAG.ABIERTO) === 0) {
    if (S.t1[e] <= 0) {
      // Se abre: es la ventana para castigarlo. Se avisa en verde, no en rojo:
      // esto es una oportunidad, no una amenaza.
      S.flags[e] |= FLAG.ABIERTO;
      S.t1[e] = 1.15;
      S.sprite[e] = mundo.R.idx('enem.espejoAbierto.0');
      S.cuadros[e] = 3;
      mundo.fx.zonaCirculo(S.x[e], S.y[e], 46, 1.15, S.handle(e), 0.4, 1, 0.6);
      mundo.eventos.emit(EV.CARGA_LISTA, S.x[e], S.y[e], 1, 0);
    }
  } else if (S.t1[e] <= 0) {
    S.flags[e] &= ~FLAG.ABIERTO;
    S.t1[e] = 2.6 + mundo.rng.float() * 1.2;
    S.sprite[e] = mundo.R.idx('enem.espejo.0');
    S.cuadros[e] = 4;
    // Al cerrarse suelta una descarga hacia el jugador.
    if (vivo && d < 520) {
      dispararEnemigo(mundo, S.x[e], S.y[e], S.angulo[e], 340, S.dmg[e]);
      mundo.fx.fogonazo(S.x[e], S.y[e], S.angulo[e], 0.8, 0.9, 1);
    }
  }
}

// --- Divisor: se parte en dos al morir --------------------------------------
function divisor(mundo, e, dt, d, dx, dy, vivo, vel) {
  const S = mundo.ent;
  const enSuelo = S.b[e] > 0;
  if (S.estado[e] === 0) {
    const dir = sign(dx) || 1;
    S.facing[e] = dir;
    S.vx[e] = approach(S.vx[e], dir * vel, 620 * dt);
    if (enSuelo && (S.c[e] > 0 || mundo.rng.bool(0.012))) { S.vy[e] = -430; S.c[e] = 0; }
    if (d < 150 && S.t1[e] <= 0 && vivo) {
      S.estado[e] = 1;
      S.t1[e] = 2.2;
      comprometer(mundo, e, 0.5);
      mundo.fx.zonaCirculo(S.x[e], S.y[e], 110 * (S.escala[e] || 1), 0.5, S.handle(e));
    }
  } else if (S.t2[e] <= 0) {
    soltarCompromiso(S, e);
    S.estado[e] = 0;
    // Pisotón: onda de área alrededor.
    const radio = 110 * (S.escala[e] || 1);
    mundo.golpeArea(S.x[e], S.y[e], radio, S.dmg[e], e);
    mundo.fx.explosionGrande(S.x[e], S.y[e], 0.7 * (S.escala[e] || 1));
    mundo.camara.sacudir(0.22);
    if (enSuelo) S.vy[e] = -180;
  }
}

/** Al morir, un divisor deja dos crías más pequeñas. */
export function partirDivisor(mundo, e) {
  const S = mundo.ent;
  const nivel = S.variante[e];
  if (nivel >= 2) return 0;
  let creados = 0;
  for (let k = 0; k < 2; k++) {
    const ang = k === 0 ? -2.2 : -0.94;
    const hijo = crearEnemigo(mundo, TIPO.DIVISOR,
      S.x[e] + Math.cos(ang) * 26, S.y[e] - 10, false, mundo.progresion.escalaVida(), nivel + 1);
    if (hijo < 0) continue;
    S.vx[hijo] = Math.cos(ang) * 240;
    S.vy[hijo] = -260;
    creados++;
  }
  return creados;
}

/** ¿El escudo frontal bloquea un impacto que llega desde (ix,iy)? */
export function bloqueaEscudo(S, e, ix, iy) {
  if ((S.flags[e] & FLAG.ESCUDO_FRONTAL) === 0) return false;
  if (S.aturdido[e] > 0) return false;   // aturdido baja la guardia
  const ang = Math.atan2(iy - S.y[e], ix - S.x[e]);
  const frente = S.facing[e] > 0 ? 0 : Math.PI;
  return Math.abs(angleDelta(frente, ang)) < 1.05;
}

/** ¿El espejo devuelve este disparo? Sólo con la placa puesta y de frente. */
export function reflejaEspejo(S, e, ix, iy) {
  if (S.tipo[e] !== TIPO.ESPEJO) return false;
  if (S.flags[e] & FLAG.ABIERTO) return false;
  if (S.aturdido[e] > 0) return false;
  const ang = Math.atan2(iy - S.y[e], ix - S.x[e]);
  return Math.abs(angleDelta(S.angulo[e], ang)) < 1.25;
}
