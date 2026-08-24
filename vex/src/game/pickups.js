// pickups.js — Objetos recogibles: vida, energía y cápsulas de módulo.

import { MASK, TIPO, FLAG } from './components.js';
import { EV } from '../core/events.js';
import { approach } from '../core/math.js';

export function crearPickup(mundo, tipo, x, y, dato = 0) {
  const S = mundo.ent;
  const e = mundo.crearEntidad(MASK.FISICA | MASK.SPRITE | MASK.PICKUP | MASK.LUZ | MASK.EMISIVO);
  if (e < 0) return -1;
  S.x[e] = x; S.y[e] = y; S.px[e] = x; S.py[e] = y;
  S.vx[e] = mundo.rng.spread(70);
  S.vy[e] = -160 - mundo.rng.float() * 90;
  S.hw[e] = 12; S.hh[e] = 12;
  S.tipo[e] = tipo;
  S.equipo[e] = 2;
  S.vida[e] = 26;            // tiempo de vida
  S.escala[e] = 1;
  S.anim[e] = mundo.rng.float() * 3;
  S.velAnim[e] = 5;
  S.a[e] = dato;             // bit de módulo, si aplica
  S.flags[e] = 0;
  S.t1[e] = 0.35;            // retardo antes de poder recogerse

  if (tipo === TIPO.PICKUP_VIDA) {
    S.sprite[e] = mundo.R.idx('prop.vida.0'); S.cuadros[e] = 4;
    S.luzR[e] = 0.45; S.luzG[e] = 1; S.luzB[e] = 0.6; S.luzRadio[e] = 140; S.luzInt[e] = 0.9;
  } else if (tipo === TIPO.PICKUP_ENERGIA) {
    S.sprite[e] = mundo.R.idx('prop.energia.0'); S.cuadros[e] = 4;
    S.luzR[e] = 0.55; S.luzG[e] = 0.8; S.luzB[e] = 1; S.luzRadio[e] = 120; S.luzInt[e] = 0.8;
    S.hw[e] = 9; S.hh[e] = 9;
  } else {
    S.sprite[e] = mundo.R.idx('prop.capsula.0'); S.cuadros[e] = 6;
    S.luzR[e] = 1; S.luzG[e] = 0.82; S.luzB[e] = 0.4; S.luzRadio[e] = 260; S.luzInt[e] = 1.4;
    S.vida[e] = 9999;
    S.hw[e] = 18; S.hh[e] = 20;
    S.vx[e] = 0; S.vy[e] = 0;
    S.flags[e] = FLAG.IGNORA_GRAVEDAD;
  }
  return e;
}

export function actualizarPickup(mundo, e, dt) {
  const S = mundo.ent;
  const j = mundo.jugador;
  S.anim[e] += dt * S.velAnim[e];
  S.vida[e] -= dt;
  S.t1[e] = Math.max(0, S.t1[e] - dt);

  if ((S.flags[e] & FLAG.IGNORA_GRAVEDAD) === 0) {
    S.vy[e] += 1500 * dt;
    const pos = mundo.tmpPos;
    const r = mundo.fisica.mover(pos, S.x[e], S.y[e], S.hw[e], S.hh[e], S.vx[e] * dt, S.vy[e] * dt, null, mundo.tmpRes);
    S.x[e] = pos[0]; S.y[e] = pos[1];
    if (r.chocoY === 1) { S.vy[e] = -S.vy[e] * 0.32; S.vx[e] *= 0.7; if (Math.abs(S.vy[e]) < 40) S.vy[e] = 0; }
    if (r.chocoX) S.vx[e] = -S.vx[e] * 0.4;
  } else {
    S.y[e] += Math.sin(S.anim[e] * 0.5) * 12 * dt;
  }

  // Imán: a partir de cierta cercanía vuelan hacia el jugador.
  if (j && j.id >= 0 && S.t1[e] <= 0) {
    const dx = j.x - S.x[e], dy = j.y - S.y[e];
    const d = Math.hypot(dx, dy) || 1;
    if (S.tipo[e] !== TIPO.PICKUP_MODULO && d < 190) {
      const f = (1 - d / 190) * 1400;
      S.vx[e] = approach(S.vx[e], (dx / d) * f, 2600 * dt);
      S.vy[e] = approach(S.vy[e], (dy / d) * f, 2600 * dt);
      S.flags[e] |= FLAG.IGNORA_GRAVEDAD;
      S.x[e] += S.vx[e] * dt; S.y[e] += S.vy[e] * dt;
    }
    if (d < 30 + S.hw[e]) return recoger(mundo, e);
  }
  if (S.vida[e] <= 0) return false;
  return true;
}

function recoger(mundo, e) {
  const S = mundo.ent;
  const j = mundo.jugador;
  switch (S.tipo[e]) {
    case TIPO.PICKUP_VIDA:
      j.curar(22);
      mundo.eventos.emit(EV.CURA, S.x[e], S.y[e], 1, 0);
      mundo.fx.curacion(S.x[e], S.y[e]);
      break;
    case TIPO.PICKUP_ENERGIA:
      j.energia = Math.min(100, j.energia + 9);
      mundo.eventos.emit(EV.RECOGIDA, S.x[e], S.y[e], 1, 0);
      break;
    case TIPO.PICKUP_MODULO:
      mundo.otorgarModulo(S.a[e], S.x[e], S.y[e]);
      break;
    default: break;
  }
  return false;
}
