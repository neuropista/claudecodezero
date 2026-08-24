// enemies.js — Bestiario y su IA.
//
// Cada tipo tiene un rol táctico distinto para que las salas se lean de un
// vistazo: el dron te obliga a moverte, el rastreador te empuja hacia arriba,
// el guardián te obliga a rodear, el bombardero a soltar el sitio donde estás.

import { MASK, TIPO, FLAG } from './components.js';
import { EV } from '../core/events.js';
import { clamp, approach, sign, angleDelta, TAU } from '../core/math.js';
import { P } from './player.js';

export const STATS = {
  [TIPO.DRON]: { vida: 34, dmg: 10, hw: 17, hh: 17, vel: 132, sprite: 'enem.dron.0', cuadros: 6, aire: true, valor: 1 },
  [TIPO.RASTREADOR]: { vida: 52, dmg: 14, hw: 20, hh: 16, vel: 190, sprite: 'enem.rastreador.0', cuadros: 6, aire: false, valor: 1 },
  [TIPO.VOLADOR]: { vida: 28, dmg: 12, hw: 18, hh: 14, vel: 205, sprite: 'enem.volador.0', cuadros: 6, aire: true, valor: 1 },
  [TIPO.ESCUDO]: { vida: 96, dmg: 16, hw: 22, hh: 22, vel: 92, sprite: 'enem.escudo.0', cuadros: 4, aire: false, valor: 2 },
  [TIPO.ENJAMBRE]: { vida: 10, dmg: 7, hw: 8, hh: 8, vel: 265, sprite: 'enem.enjambre.0', cuadros: 4, aire: true, valor: 0 },
  [TIPO.BOMBARDERO]: { vida: 40, dmg: 26, hw: 18, hh: 18, vel: 118, sprite: 'enem.bombardero.0', cuadros: 5, aire: true, valor: 2 },
  [TIPO.TORRETA]: { vida: 60, dmg: 12, hw: 20, hh: 18, vel: 0, sprite: 'enem.torreta.0', cuadros: 4, aire: false, valor: 1 },
};

const COLOR_HOSTIL = [1.0, 0.24, 0.43];

export function crearEnemigo(mundo, tipo, x, y, elite = false, escalaVida = 1) {
  const S = mundo.ent;
  const st = STATS[tipo];
  if (!st) return -1;
  let mask = MASK.FISICA | MASK.SPRITE | MASK.VIDA | MASK.ENEMIGO | MASK.LUZ;
  const e = mundo.crearEntidad(mask);
  if (e < 0) return -1;

  S.x[e] = x; S.y[e] = y; S.px[e] = x; S.py[e] = y;
  S.vx[e] = 0; S.vy[e] = 0;
  S.hw[e] = st.hw; S.hh[e] = st.hh;
  S.tipo[e] = tipo;
  S.equipo[e] = 1;
  S.vida[e] = st.vida * escalaVida * (elite ? 2.4 : 1);
  S.vidaMax[e] = S.vida[e];
  S.dmg[e] = st.dmg * (elite ? 1.4 : 1);
  S.sprite[e] = mundo.R.idx(st.sprite);
  S.cuadros[e] = st.cuadros;
  S.velAnim[e] = 6 + mundo.rng.float() * 3;
  S.anim[e] = mundo.rng.float() * 4;
  S.escala[e] = elite ? 1.25 : 1;
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
  S.luzRadio[e] = elite ? 220 : 150;
  S.luzInt[e] = 0.55;

  mundo.fx.aparicion(x, y, S.luzR[e], S.luzG[e], S.luzB[e]);
  return e;
}

/** Proyectil enemigo. Los marcados como DESTRUIBLE se pueden devolver con parry. */
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
  S.flags[e] = FLAG.IGNORA_GRAVEDAD | (destruible ? FLAG.DESTRUIBLE : 0);
  S.sprite[e] = mundo.R.idx(grande ? 'bala.enemigaGrande' : 'bala.enemiga');
  S.luzR[e] = 1; S.luzG[e] = 0.35; S.luzB[e] = 0.45;
  S.luzRadio[e] = grande ? 150 : 100; S.luzInt[e] = 0.7;
  return e;
}

/** Distancia y dirección al jugador; se cachea en el mundo para no recalcular. */
function haciaJugador(mundo, e) {
  const S = mundo.ent;
  const j = mundo.jugador;
  const dx = j.x - S.x[e], dy = j.y - S.y[e];
  const d = Math.hypot(dx, dy) || 1;
  mundo._dx = dx / d; mundo._dy = dy / d; mundo._dist = d;
  return d;
}

export function actualizarEnemigo(mundo, e, dt) {
  const S = mundo.ent;
  const tipo = S.tipo[e];
  const j = mundo.jugador;
  if (!j || j.id < 0) return;

  S.anim[e] += dt * S.velAnim[e];
  S.t1[e] -= dt;
  S.t2[e] = Math.max(0, S.t2[e] - dt);
  S.flash[e] = Math.max(0, S.flash[e] - dt * 6);

  const d = haciaJugador(mundo, e);
  const dx = mundo._dx, dy = mundo._dy;
  const jugadorVivo = j.estado !== 6;

  switch (tipo) {
    case TIPO.DRON: {
      // Mantiene una distancia media y dispara ráfagas cortas.
      const ideal = 230;
      const empuje = d < ideal - 40 ? -1 : d > ideal + 40 ? 1 : 0;
      S.vx[e] = approach(S.vx[e], dx * STATS[tipo].vel * empuje, 400 * dt);
      S.vy[e] = approach(S.vy[e], dy * STATS[tipo].vel * empuje + Math.sin(S.anim[e] * 0.7 + S.a[e]) * 45, 400 * dt);
      S.facing[e] = dx > 0 ? 1 : -1;
      if (S.t1[e] <= 0 && d < 520 && jugadorVivo && mundo.lineaDeVision(S.x[e], S.y[e], j.x, j.y)) {
        S.estado[e] = 1;
        S.t2[e] = 0.42;
        S.t1[e] = 2.1 + mundo.rng.float() * 1.1;
        S.d[e] = 3;   // disparos restantes de la ráfaga
        S.c[e] = 0;
        mundo.eventos.emit(EV.TELEGRAFIA, S.x[e], S.y[e], 1, 0);
        mundo.fx.telegrafia(S.x[e], S.y[e]);
      }
      if (S.estado[e] === 1 && S.t2[e] <= 0) {
        if (S.d[e] > 0) {
          const ang = Math.atan2(j.y - S.y[e], j.x - S.x[e]) + mundo.rng.spread(0.07);
          dispararEnemigo(mundo, S.x[e] + dx * 20, S.y[e] + dy * 20, ang, 360, S.dmg[e]);
          mundo.fx.fogonazo(S.x[e] + dx * 20, S.y[e] + dy * 20, ang, 1, 0.35, 0.5);
          S.d[e]--;
          S.t2[e] = 0.13;
        } else S.estado[e] = 0;
      }
      break;
    }

    case TIPO.RASTREADOR: {
      // Persigue por el suelo y hace una embestida telegrafiada.
      const enSuelo = S.b[e] > 0;
      if (S.estado[e] === 0) {
        const dir = sign(dx) || 1;
        S.vx[e] = approach(S.vx[e], dir * STATS[tipo].vel * (d > 90 ? 1 : 0), 900 * dt);
        S.facing[e] = dir;
        if (d < 260 && Math.abs(j.y - S.y[e]) < 70 && S.t1[e] <= 0 && jugadorVivo) {
          S.estado[e] = 1; S.t2[e] = 0.42; S.t1[e] = 2.6;
          mundo.eventos.emit(EV.TELEGRAFIA, S.x[e], S.y[e], 1, 0);
          mundo.fx.telegrafia(S.x[e], S.y[e]);
        }
        // Salta si hay un obstáculo o un hueco delante.
        if (enSuelo && S.c[e] > 0 && mundo.rng.bool(0.6)) { S.vy[e] = -520; S.c[e] = 0; }
      } else if (S.estado[e] === 1) {
        S.vx[e] = approach(S.vx[e], 0, 1800 * dt);
        if (S.t2[e] <= 0) {
          S.estado[e] = 2; S.t2[e] = 0.55;
          S.vx[e] = S.facing[e] * 620;
          if (enSuelo) S.vy[e] = -180;
          mundo.fx.dash(S.x[e], S.y[e], S.facing[e] > 0 ? 0 : Math.PI);
        }
      } else {
        if (S.t2[e] <= 0) S.estado[e] = 0;
      }
      break;
    }

    case TIPO.VOLADOR: {
      // Vuelo ondulante y picado cuando está alineado.
      S.a[e] += dt * 2.4;
      if (S.estado[e] === 0) {
        const alturaObjetivo = j.y - 130;
        S.vx[e] = approach(S.vx[e], dx * STATS[tipo].vel, 500 * dt);
        S.vy[e] = approach(S.vy[e], (alturaObjetivo - S.y[e]) * 2.4 + Math.sin(S.a[e]) * 70, 600 * dt);
        S.facing[e] = dx > 0 ? 1 : -1;
        if (Math.abs(j.x - S.x[e]) < 90 && S.y[e] < j.y - 60 && S.t1[e] <= 0 && jugadorVivo) {
          S.estado[e] = 1; S.t2[e] = 0.34; S.t1[e] = 3.2;
          mundo.fx.telegrafia(S.x[e], S.y[e]);
          mundo.eventos.emit(EV.TELEGRAFIA, S.x[e], S.y[e], 1, 0);
        }
      } else if (S.estado[e] === 1) {
        S.vx[e] = approach(S.vx[e], 0, 1400 * dt);
        S.vy[e] = approach(S.vy[e], -60, 900 * dt);
        if (S.t2[e] <= 0) {
          S.estado[e] = 2; S.t2[e] = 0.8;
          S.vx[e] = dx * 240; S.vy[e] = 760;
        }
      } else {
        S.vy[e] = approach(S.vy[e], -140, 700 * dt);
        if (S.t2[e] <= 0) S.estado[e] = 0;
      }
      break;
    }

    case TIPO.ESCUDO: {
      // Avanza de frente; el escudo bloquea por delante, hay que rodearlo.
      const dir = sign(dx) || 1;
      S.facing[e] = dir;
      S.vx[e] = approach(S.vx[e], dir * STATS[tipo].vel, 500 * dt);
      S.angulo[e] = Math.atan2(j.y - S.y[e], j.x - S.x[e]);
      if (S.t1[e] <= 0 && d < 400 && jugadorVivo) {
        S.t1[e] = 2.4 + mundo.rng.float();
        const base = S.angulo[e];
        for (let k = -1; k <= 1; k++) {
          dispararEnemigo(mundo, S.x[e] + dx * 24, S.y[e], base + k * 0.22, 300, S.dmg[e] * 0.6);
        }
        mundo.fx.fogonazo(S.x[e] + dx * 24, S.y[e], base, 0.5, 0.75, 1);
      }
      break;
    }

    case TIPO.ENJAMBRE: {
      // Bandada: persigue con ruido y sin frenos.
      S.a[e] += dt * 6;
      const vel = STATS[tipo].vel;
      S.vx[e] = approach(S.vx[e], dx * vel + Math.cos(S.a[e]) * 90, 900 * dt);
      S.vy[e] = approach(S.vy[e], dy * vel + Math.sin(S.a[e] * 1.3) * 90, 900 * dt);
      S.facing[e] = dx > 0 ? 1 : -1;
      break;
    }

    case TIPO.BOMBARDERO: {
      // Se acerca lento, pita y revienta.
      if (S.estado[e] === 0) {
        S.vx[e] = approach(S.vx[e], dx * STATS[tipo].vel, 260 * dt);
        S.vy[e] = approach(S.vy[e], dy * STATS[tipo].vel, 260 * dt);
        if (d < 130 && jugadorVivo) { S.estado[e] = 1; S.t2[e] = 0.85; }
      } else {
        S.vx[e] = approach(S.vx[e], dx * 60, 400 * dt);
        S.vy[e] = approach(S.vy[e], dy * 60, 400 * dt);
        S.flash[e] = 0.35 + 0.65 * Math.abs(Math.sin(S.t2[e] * 22));
        if (Math.floor(S.t2[e] * 6) !== Math.floor((S.t2[e] + dt) * 6)) {
          mundo.eventos.emit(EV.TELEGRAFIA, S.x[e], S.y[e], 1, 0);
        }
        if (S.t2[e] <= 0) { mundo.matarEnemigo(e, true); return; }
      }
      break;
    }

    case TIPO.TORRETA: {
      S.angulo[e] = Math.atan2(j.y - S.y[e], j.x - S.x[e]);
      if (S.estado[e] === 0) {
        if (S.t1[e] <= 0 && d < 560 && jugadorVivo && mundo.lineaDeVision(S.x[e], S.y[e] - 14, j.x, j.y)) {
          S.estado[e] = 1; S.t2[e] = 0.55; S.t1[e] = S.d[e] || 1.9;
          mundo.eventos.emit(EV.TELEGRAFIA, S.x[e], S.y[e], 1, 0);
          mundo.fx.telegrafia(S.x[e], S.y[e] - 14);
        }
      } else if (S.t2[e] <= 0) {
        const base = S.angulo[e];
        for (let k = 0; k < 3; k++) {
          dispararEnemigo(mundo, S.x[e] + Math.cos(base) * 26, S.y[e] - 14 + Math.sin(base) * 26,
            base + (k - 1) * 0.14, 400, S.dmg[e]);
        }
        mundo.fx.fogonazo(S.x[e] + Math.cos(base) * 26, S.y[e] - 14 + Math.sin(base) * 26, base, 1, 0.4, 0.5);
        mundo.camara.sacudir(0.05);
        S.estado[e] = 0;
      }
      break;
    }
    default: break;
  }
}

/** ¿El escudo frontal bloquea un impacto que llega desde (ix,iy)? */
export function bloqueaEscudo(S, e, ix, iy) {
  if ((S.flags[e] & FLAG.ESCUDO_FRONTAL) === 0) return false;
  const ang = Math.atan2(iy - S.y[e], ix - S.x[e]);
  const frente = S.facing[e] > 0 ? 0 : Math.PI;
  return Math.abs(angleDelta(frente, ang)) < 1.05;
}
