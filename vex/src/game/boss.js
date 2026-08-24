// boss.js — FRAGMENTO PRIMARIO, el jefe de cada bioma.
//
// Tres fases con patrones distintos y dos ojos orbitales que son sus puntos
// débiles: mientras estén vivos, el núcleo recibe daño reducido. Cada cambio de
// fase para el tiempo un instante, sacude la cámara y sube la capa de música.

import { MASK, TIPO, FLAG } from './components.js';
import { EV } from '../core/events.js';
import { dispararEnemigo } from './enemies.js';
import { TAU, clamp, approach, lerp } from '../core/math.js';

const ATAQUES = {
  ABANICO: 0, ESPIRAL: 1, BARRIDO: 2, EMBESTIDA: 3, INVOCAR: 4, LLUVIA: 5,
};

export function crearJefe(mundo, x, y, nivel = 0) {
  const S = mundo.ent;
  const e = mundo.crearEntidad(MASK.FISICA | MASK.SPRITE | MASK.VIDA | MASK.ENEMIGO | MASK.JEFE | MASK.LUZ);
  if (e < 0) return -1;
  S.x[e] = x; S.y[e] = y; S.px[e] = x; S.py[e] = y;
  S.vx[e] = 0; S.vy[e] = 0;
  S.hw[e] = 52; S.hh[e] = 52;
  S.tipo[e] = TIPO.JEFE;
  S.equipo[e] = 1;
  S.vida[e] = 900 + nivel * 520;
  S.vidaMax[e] = S.vida[e];
  S.dmg[e] = 20 + nivel * 5;
  S.sprite[e] = mundo.R.idx('jefe.nucleo.0');
  S.cuadros[e] = 6;
  S.velAnim[e] = 5;
  S.escala[e] = 1;
  S.estado[e] = 0;              // fase
  S.t1[e] = 1.6;                // hasta el siguiente ataque
  S.t2[e] = 0;                  // temporizador del ataque en curso
  S.a[e] = 0;                   // ángulo acumulado del patrón
  S.b[e] = x; S.c[e] = y;       // ancla de la posición base
  S.d[e] = 0;                   // ataque actual
  S.flags[e] = FLAG.IGNORA_GRAVEDAD;
  S.luzR[e] = 1; S.luzG[e] = 0.3; S.luzB[e] = 0.45;
  S.luzRadio[e] = 620; S.luzInt[e] = 1.5;
  S.golpes[e] = 0;

  // Dos ojos orbitales: puntos débiles.
  for (let i = 0; i < 2; i++) crearOjo(mundo, e, i, nivel);
  mundo.jefeId = mundo.ent.handle(e);
  return e;
}

function crearOjo(mundo, padre, indice, nivel) {
  const S = mundo.ent;
  const e = mundo.crearEntidad(MASK.FISICA | MASK.SPRITE | MASK.VIDA | MASK.ENEMIGO | MASK.LUZ);
  if (e < 0) return -1;
  S.x[e] = S.x[padre]; S.y[e] = S.y[padre];
  S.hw[e] = 22; S.hh[e] = 15;
  S.tipo[e] = TIPO.JEFE_OJO;
  S.equipo[e] = 1;
  S.vida[e] = 180 + nivel * 90;
  S.vidaMax[e] = S.vida[e];
  S.dmg[e] = 12;
  S.sprite[e] = mundo.R.idx('jefe.ojo.0');
  S.cuadros[e] = 4;
  S.velAnim[e] = 3;
  S.escala[e] = 1;
  S.padre[e] = mundo.ent.handle(padre);
  S.a[e] = indice * Math.PI;
  S.b[e] = 150;
  S.flags[e] = FLAG.IGNORA_GRAVEDAD;
  S.luzR[e] = 1; S.luzG[e] = 0.4; S.luzB[e] = 0.55;
  S.luzRadio[e] = 200; S.luzInt[e] = 0.8;
  return e;
}

export function ojosVivos(mundo, jefe) {
  const S = mundo.ent;
  let n = 0;
  const h = S.handle(jefe);
  for (let i = 0; i < S.count; i++) {
    const e = S.dense[i];
    if (S.alive[e] === 1 && S.tipo[e] === TIPO.JEFE_OJO && S.padre[e] === h) n++;
  }
  return n;
}

export function actualizarOjo(mundo, e, dt) {
  const S = mundo.ent;
  const padre = S.resolve(S.padre[e]);
  if (padre < 0) { mundo.matarEnemigo(e, false); return; }
  S.anim[e] += dt * S.velAnim[e];
  S.a[e] += dt * (1.1 + S.estado[padre] * 0.45);
  const r = S.b[e] + Math.sin(S.a[e] * 2.2) * 22;
  S.x[e] = S.x[padre] + Math.cos(S.a[e]) * r;
  S.y[e] = S.y[padre] + Math.sin(S.a[e]) * r * 0.62;
  S.flash[e] = Math.max(0, S.flash[e] - dt * 6);
  S.t1[e] -= dt;
  const j = mundo.jugador;
  if (S.t1[e] <= 0 && j && j.estado !== 6) {
    S.t1[e] = 2.3 - S.estado[padre] * 0.5 + mundo.rng.float() * 0.8;
    const ang = Math.atan2(j.y - S.y[e], j.x - S.x[e]);
    dispararEnemigo(mundo, S.x[e], S.y[e], ang, 330, S.dmg[e]);
    mundo.fx.fogonazo(S.x[e], S.y[e], ang, 1, 0.4, 0.55);
  }
}

export function actualizarJefe(mundo, e, dt) {
  const S = mundo.ent;
  const j = mundo.jugador;
  if (!j) return;
  S.anim[e] += dt * S.velAnim[e];
  S.flash[e] = Math.max(0, S.flash[e] - dt * 6);

  // --- Transición de fase por umbrales de vida ---
  const frac = S.vida[e] / S.vidaMax[e];
  const faseObjetivo = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
  if (faseObjetivo > S.estado[e]) {
    S.estado[e] = faseObjetivo;
    S.t1[e] = 1.4;
    S.t2[e] = 0;
    S.golpes[e] = 1;                 // marca de invulnerabilidad breve
    mundo.eventos.emit(EV.JEFE_FASE, S.x[e], S.y[e], faseObjetivo, 0);
    mundo.camara.sacudir(0.85);
    mundo.hitstop(0.22, true);
    mundo.fx.explosionGrande(S.x[e], S.y[e], 1.6);
    mundo.post.golpe(0.55, 1, 0.4, 0.5);
    mundo.post.glitch = 1;
    // Cada fase repone un ojo si queda hueco.
    if (ojosVivos(mundo, e) < 2) crearOjo(mundo, e, mundo.rng.int(2), mundo.nivelJefe || 0);
  }
  if (S.golpes[e] > 0) {
    S.t1[e] -= dt;
    if (S.t1[e] <= 0) { S.golpes[e] = 0; S.t1[e] = 0.6; }
    return;
  }

  const fase = S.estado[e];
  const sala = mundo.sala;

  // --- Movimiento base: flota buscando la horizontal del jugador ---
  const objetivoX = clamp(j.x, 260, sala.anchoPx - 260);
  const objetivoY = S.c[e] + Math.sin(S.anim[e] * 0.35) * (40 + fase * 18);
  S.vx[e] = approach(S.vx[e], (objetivoX - S.x[e]) * (1.1 + fase * 0.4), 420 * dt);
  S.vy[e] = approach(S.vy[e], (objetivoY - S.y[e]) * 2.2, 520 * dt);

  S.t1[e] -= dt;
  S.t2[e] = Math.max(0, S.t2[e] - dt);

  // --- Selección de ataque ---
  if (S.t1[e] <= 0 && S.t2[e] <= 0) {
    const repertorio = fase === 0
      ? [ATAQUES.ABANICO, ATAQUES.INVOCAR, ATAQUES.ESPIRAL]
      : fase === 1
        ? [ATAQUES.ESPIRAL, ATAQUES.BARRIDO, ATAQUES.EMBESTIDA, ATAQUES.INVOCAR]
        : [ATAQUES.ESPIRAL, ATAQUES.LLUVIA, ATAQUES.EMBESTIDA, ATAQUES.BARRIDO, ATAQUES.ABANICO];
    S.d[e] = mundo.rng.pick(repertorio);
    S.t2[e] = duracion(S.d[e], fase);
    S.t1[e] = S.t2[e] + (1.5 - fase * 0.35);
    S.a[e] = mundo.rng.angle();
    S.b[e] = 0;   // contador interno del ataque
    mundo.eventos.emit(EV.TELEGRAFIA, S.x[e], S.y[e], 1, 0);
    mundo.fx.telegrafiaGrande(S.x[e], S.y[e]);
  }

  if (S.t2[e] > 0) ejecutar(mundo, e, dt, fase);
}

function duracion(ataque, fase) {
  switch (ataque) {
    case ATAQUES.ABANICO: return 1.1;
    case ATAQUES.ESPIRAL: return 2.4 + fase * 0.5;
    case ATAQUES.BARRIDO: return 2.0;
    case ATAQUES.EMBESTIDA: return 1.7;
    case ATAQUES.INVOCAR: return 0.9;
    case ATAQUES.LLUVIA: return 2.2;
    default: return 1;
  }
}

function ejecutar(mundo, e, dt, fase) {
  const S = mundo.ent;
  const j = mundo.jugador;
  const cadencia = 0.11 - fase * 0.018;
  S.b[e] -= dt;

  switch (S.d[e]) {
    case ATAQUES.ABANICO: {
      if (S.b[e] > 0) break;
      S.b[e] = 0.30;
      const base = Math.atan2(j.y - S.y[e], j.x - S.x[e]);
      const n = 7 + fase * 3;
      for (let k = 0; k < n; k++) {
        const ang = base + (k / (n - 1) - 0.5) * 1.5;
        dispararEnemigo(mundo, S.x[e], S.y[e], ang, 330 + fase * 45, S.dmg[e] * 0.55);
      }
      mundo.camara.sacudir(0.12);
      break;
    }
    case ATAQUES.ESPIRAL: {
      if (S.b[e] > 0) break;
      S.b[e] = cadencia;
      S.a[e] += 0.42 + fase * 0.1;
      const brazos = 2 + fase;
      for (let k = 0; k < brazos; k++) {
        dispararEnemigo(mundo, S.x[e], S.y[e], S.a[e] + (k / brazos) * TAU, 260 + fase * 40, S.dmg[e] * 0.45);
      }
      break;
    }
    case ATAQUES.BARRIDO: {
      // Rayo continuo que barre la arena; hay que pasar por debajo.
      const t = 1 - S.t2[e] / 2.0;
      const ang = lerp(-0.35, Math.PI + 0.35, t);
      mundo.laserJefe(S.x[e], S.y[e], ang, S.dmg[e] * 0.8);
      if (S.b[e] <= 0) {
        S.b[e] = 0.2;
        mundo.eventos.emit(EV.LASER, S.x[e], S.y[e], 1, 0);
      }
      break;
    }
    case ATAQUES.EMBESTIDA: {
      if (S.b[e] <= 0 && S.c[e] !== -1) {
        S.b[e] = 999;
        const ang = Math.atan2(j.y - S.y[e], j.x - S.x[e]);
        S.vx[e] = Math.cos(ang) * 900;
        S.vy[e] = Math.sin(ang) * 620;
        mundo.camara.sacudir(0.35);
        mundo.fx.dash(S.x[e], S.y[e], ang);
      }
      // Estela de escombros durante la embestida.
      mundo.fx.estelaJefe(S.x[e], S.y[e], S.vx[e], S.vy[e]);
      break;
    }
    case ATAQUES.INVOCAR: {
      if (S.b[e] > 0) break;
      S.b[e] = 999;
      const cuantos = 2 + fase;
      for (let k = 0; k < cuantos; k++) {
        const ang = (k / cuantos) * TAU;
        mundo.invocarSecuazJefe(S.x[e] + Math.cos(ang) * 120, S.y[e] + Math.sin(ang) * 90, fase);
      }
      break;
    }
    case ATAQUES.LLUVIA: {
      if (S.b[e] > 0) break;
      S.b[e] = 0.14;
      const sala = mundo.sala;
      const x = mundo.rng.range(80, sala.anchoPx - 80);
      dispararEnemigo(mundo, x, 60, Math.PI * 0.5 + mundo.rng.spread(0.25), 300, S.dmg[e] * 0.5, true);
      break;
    }
    default: break;
  }
}
