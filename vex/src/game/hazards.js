// hazards.js — Trampas de sala: láseres telegrafiados, plataformas móviles y
// cuerpos rígidos empujables. Todo lo que no es enemigo pero puede matarte.

import { EV } from '../core/events.js';
import { TAM, T } from './tiles.js';
import { MASK, TIPO, FLAG } from './components.js';
import { clamp, lerp } from '../core/math.js';

export class Trampas {
  constructor(mundo) {
    this.mundo = mundo;
    this.laseres = [];
    this.plataformas = [];
    this.tiempo = 0;
  }

  cargar(sala) {
    this.laseres.length = 0;
    this.plataformas.length = 0;
    this.tiempo = 0;
    for (const p of sala.props) {
      if (p.tipo === 'laser') {
        this.laseres.push({
          x: p.x, y: p.y, periodo: p.periodo, aviso: p.aviso,
          fase: p.fase, largo: 0, activo: 0, avisando: 0, sonado: false,
        });
      } else if (p.tipo === 'plataformaMovil') {
        this.plataformas.push({
          x0: p.x, y0: p.y, x: p.x, y: p.y, px: p.x, py: p.y,
          ancho: p.ancho, alto: p.alto,
          recorrido: p.recorrido, vertical: p.vertical,
          velocidad: p.velocidad, fase: p.fase,
          dx: 0, dy: 0,
        });
      }
    }
    // Longitud de cada láser hasta el primer sólido, calculada una vez.
    for (const l of this.laseres) {
      let largo = 0;
      while (largo < 900) {
        const ty = Math.floor((l.y + largo) / TAM);
        const tx = Math.floor(l.x / TAM);
        const t = sala.get(tx, ty);
        if (t === T.SOLIDO || t === T.FRAGIL) break;
        largo += 8;
      }
      l.largo = largo;
    }
  }

  actualizar(dt) {
    const M = this.mundo;
    this.tiempo += dt;

    for (let i = 0; i < this.laseres.length; i++) {
      const l = this.laseres[i];
      const t = (this.tiempo + l.fase) % l.periodo;
      const inicioAviso = l.periodo - l.aviso - 0.45;
      l.avisando = t > inicioAviso && t < l.periodo - 0.45 ? (t - inicioAviso) / l.aviso : 0;
      const activo = t >= l.periodo - 0.45;
      if (activo && !l.sonado) {
        M.eventos.emit(EV.LASER, l.x, l.y, 1, 0);
        l.sonado = true;
      }
      if (!activo) l.sonado = false;
      l.activo = activo ? 1 : 0;
      if (activo) {
        const j = M.jugador;
        if (j && Math.abs(j.x - l.x) < 12 && j.y > l.y && j.y < l.y + l.largo) {
          M.danarJugador(16, l.x, j.y, l.x);
        }
        if (M.rng.bool(0.5)) M.fx.chispaLaser(l.x, l.y + M.rng.float() * l.largo);
      }
    }

    for (let i = 0; i < this.plataformas.length; i++) {
      const p = this.plataformas[i];
      p.px = p.x; p.py = p.y;
      p.fase += dt * (p.velocidad / Math.max(1, p.recorrido));
      const s = Math.sin(p.fase);
      if (p.vertical) { p.y = p.y0 + s * p.recorrido; p.x = p.x0; }
      else { p.x = p.x0 + s * p.recorrido; p.y = p.y0; }
      p.dx = p.x - p.px; p.dy = p.y - p.py;
    }
  }

  /**
   * Colisión "una vía" del jugador con las plataformas móviles y arrastre.
   * Devuelve true si el jugador está apoyado en alguna.
   */
  resolverJugador(jugador, resultado) {
    let soporte = false;
    const hw = jugador.S.hw[jugador.id], hh = jugador.S.hh[jugador.id];
    for (let i = 0; i < this.plataformas.length; i++) {
      const p = this.plataformas[i];
      const cx = p.x + p.ancho * 0.5;
      const topY = p.y - p.alto * 0.5;
      if (Math.abs(jugador.x - cx) > p.ancho * 0.5 + hw) continue;
      const pieAntes = jugador.S.py[jugador.id] + hh;
      const pieAhora = jugador.y + hh;
      if (jugador.vy >= -1 && pieAntes <= topY + 8 && pieAhora >= topY - 1 && pieAhora <= topY + 22) {
        jugador.y = topY - hh - 0.01;
        if (jugador.vy > 0) jugador.vy = 0;
        jugador.x += p.dx;
        jugador.y += p.dy;
        soporte = true;
        if (resultado) resultado.enSuelo = true;
      }
    }
    return soporte;
  }
}

/** Cuerpo rígido simple: caja empujable con rebote y rozamiento. */
export function crearEscombro(mundo, x, y, variante = 0) {
  const S = mundo.ent;
  const e = mundo.crearEntidad(MASK.FISICA | MASK.SPRITE | MASK.RIGIDO | MASK.VIDA);
  if (e < 0) return -1;
  S.x[e] = x; S.y[e] = y; S.px[e] = x; S.py[e] = y;
  S.vx[e] = 0; S.vy[e] = 0;
  S.hw[e] = 12; S.hh[e] = 12;
  S.tipo[e] = TIPO.ESCOMBRO;
  S.equipo[e] = 2;
  S.vida[e] = 30; S.vidaMax[e] = 30;
  S.sprite[e] = mundo.R.idx('prop.escombro.0') + (variante % 4);
  S.cuadros[e] = 1;
  S.escala[e] = 1;
  S.angulo[e] = 0;
  S.flags[e] = 0;
  return e;
}

export function actualizarRigido(mundo, e, dt) {
  const S = mundo.ent;
  S.vy[e] += 1800 * dt;
  S.vx[e] *= Math.exp(-1.6 * dt);
  const pos = mundo.tmpPos;
  const r = mundo.fisica.mover(pos, S.x[e], S.y[e], S.hw[e], S.hh[e], S.vx[e] * dt, S.vy[e] * dt, null, mundo.tmpRes);
  S.x[e] = pos[0]; S.y[e] = pos[1];
  if (r.chocoX) S.vx[e] = -S.vx[e] * 0.35;
  if (r.chocoY === 1) {
    if (S.vy[e] > 260) {
      mundo.eventos.emit(EV.IMPACTO, S.x[e], S.y[e], 0.5, 0);
      mundo.fx.polvo(S.x[e], S.y[e] + S.hh[e], 4);
    }
    S.vy[e] = 0;
    S.vx[e] *= 0.86;
  } else if (r.chocoY === -1) S.vy[e] = 0;
  S.angulo[e] += S.vx[e] * dt * 0.012;
  if (r.tileDanino) mundo.matarRigido(e);

  // Empuje del jugador.
  const j = mundo.jugador;
  if (j && j.id >= 0) {
    const dx = S.x[e] - j.x, dy = S.y[e] - j.y;
    if (Math.abs(dx) < S.hw[e] + j.S.hw[j.id] && Math.abs(dy) < S.hh[e] + j.S.hh[j.id]) {
      S.vx[e] += (dx > 0 ? 1 : -1) * (60 + Math.abs(j.vx) * 0.55) * dt * 8;
      if (j.estado === 2) S.vy[e] = -230;   // el dash lanza los escombros
    }
  }
}
