// fx.js — Traducción de la simulación a espectáculo.
//
// Nada de lo que hay aquí afecta al estado del juego: son partículas, destellos
// y sacudidas. Por eso usa el generador cosmético y no el de la simulación, y
// por eso desactivarlo entero no rompe el determinismo ni la repetición.

import { cosmeticRng as CR } from '../core/rng.js';
import { TAU } from '../core/math.js';

const MAX_FX = 512;

/** Pool de efectos animados con sprites (anillos, impactos, telegrafías). */
class PoolFx {
  constructor() {
    this.x = new Float32Array(MAX_FX);
    this.y = new Float32Array(MAX_FX);
    this.vx = new Float32Array(MAX_FX);
    this.vy = new Float32Array(MAX_FX);
    this.t = new Float32Array(MAX_FX);
    this.dur = new Float32Array(MAX_FX);
    this.sprite = new Uint16Array(MAX_FX);
    this.cuadros = new Uint8Array(MAX_FX);
    this.escala = new Float32Array(MAX_FX);
    this.escalaFin = new Float32Array(MAX_FX);
    this.rot = new Float32Array(MAX_FX);
    this.rotVel = new Float32Array(MAX_FX);
    this.r = new Float32Array(MAX_FX);
    this.g = new Float32Array(MAX_FX);
    this.b = new Float32Array(MAX_FX);
    this.a = new Float32Array(MAX_FX);
    this.vivo = new Uint8Array(MAX_FX);
    this.n = 0;
    this.cursor = 0;
  }

  add(sprite, cuadros, x, y, dur, escala, escalaFin, r, g, b, a, rot = 0, rotVel = 0, vx = 0, vy = 0) {
    let i = -1;
    for (let k = 0; k < MAX_FX; k++) {
      const c = (this.cursor + k) % MAX_FX;
      if (!this.vivo[c]) { i = c; break; }
    }
    if (i < 0) return;
    this.cursor = (i + 1) % MAX_FX;
    this.vivo[i] = 1;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.t[i] = 0; this.dur[i] = dur;
    this.sprite[i] = sprite; this.cuadros[i] = cuadros;
    this.escala[i] = escala; this.escalaFin[i] = escalaFin;
    this.r[i] = r; this.g[i] = g; this.b[i] = b; this.a[i] = a;
    this.rot[i] = rot; this.rotVel[i] = rotVel;
  }

  actualizar(dt) {
    let vivos = 0;
    for (let i = 0; i < MAX_FX; i++) {
      if (!this.vivo[i]) continue;
      this.t[i] += dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.rotVel[i] * dt;
      if (this.t[i] >= this.dur[i]) this.vivo[i] = 0; else vivos++;
    }
    this.n = vivos;
  }
}

export class Fx {
  constructor(mundo) {
    this.mundo = mundo;
    this.pool = new PoolFx();
    this.activo = true;
  }

  get P() { return this.mundo.R.particulas; }
  get R() { return this.mundo.R; }

  actualizar(dt) { this.pool.actualizar(dt); }

  // ------------------------------------------------------------ jugador ----

  aterrizaje(x, y, fuerza) {
    if (!this.activo) return;
    this.P.humo(x, y - 4, 6 + fuerza * 8, 12, 0.55, 0.65, 0.85, 0.35, 0.6, 22);
    this.P.chispas(x, y, 4 + fuerza * 6, -Math.PI / 2, 1.5, 130 * fuerza, 0.55, 0.85, 1, 0.35, 5);
    this.pool.add(this.R.idx('fx.anillo.0'), 5, x, y - 2, 0.30, 0.5 + fuerza * 0.35, 1.1 + fuerza * 0.5,
      0.6, 0.85, 1, 0.55 * Math.min(1, fuerza));
  }

  polvoPared(x, y, dir) {
    if (!this.activo) return;
    this.P.chispas(x + dir * 12, y, 10, dir > 0 ? 0 : Math.PI, 1.1, 200, 0.6, 0.9, 1, 0.35, 6);
  }

  polvo(x, y, n) {
    if (!this.activo) return;
    this.P.humo(x, y, n, 10, 0.55, 0.6, 0.75, 0.3, 0.5, 18);
  }

  dash(x, y, ang) {
    if (!this.activo) return;
    this.P.ondaChoque(x, y, 22, 300, 0.5, 0.9, 1, 0.32);
    this.pool.add(this.R.idx('fx.anillo.0'), 5, x, y, 0.26, 0.55, 1.5, 0.55, 0.9, 1, 0.7, ang);
    this.mundo.camara.sacudir(0.11);
  }

  estelaDash(x, y, vx, vy) {
    if (!this.activo) return;
    this.P.estela(x, y, vx, vy, 4, 0.45, 0.85, 1, 16, 0.32);
  }

  anilloDobleSalto(x, y) {
    if (!this.activo) return;
    this.pool.add(this.R.idx('fx.anillo.0'), 5, x, y + 8, 0.28, 0.4, 1.15, 1, 0.5, 0.95, 0.8);
    this.P.chispas(x, y + 10, 14, Math.PI / 2, 1.0, 200, 1, 0.55, 0.95, 0.4, 6);
  }

  anclaGancho(x, y) {
    if (!this.activo) return;
    this.pool.add(this.R.idx('fx.ancla'), 1, x, y, 0.35, 1.4, 0.6, 0.55, 0.9, 1, 0.9, 0, 6);
    this.P.chispas(x, y, 10, 0, Math.PI, 180, 0.5, 0.9, 1, 0.3, 5);
  }

  parry(x, y, n) {
    if (!this.activo) return;
    this.pool.add(this.R.idx('fx.anillo.0'), 5, x, y, 0.34, 0.7, 2.1, 1, 0.45, 0.9, 1);
    this.pool.add(this.R.idx('fx.destello'), 1, x, y, 0.22, 1.4, 0.4, 1, 0.7, 1, 1, 0, 8);
    this.P.ondaChoque(x, y, 34 + n * 8, 460, 1, 0.5, 0.95, 0.4);
    this.mundo.post.golpe(0.32, 1, 0.6, 1);
  }

  curacion(x, y) {
    if (!this.activo) return;
    this.P.chispas(x, y, 24, -Math.PI / 2, 1.1, 190, 0.5, 1, 0.65, 0.9, 7);
    this.pool.add(this.R.idx('fx.anillo.0'), 5, x, y, 0.4, 0.4, 1.3, 0.5, 1, 0.7, 0.8);
  }

  // ----------------------------------------------------------- enemigos ----

  aparicion(x, y, r, g, b) {
    if (!this.activo) return;
    this.pool.add(this.R.idx('fx.anillo.0'), 5, x, y, 0.34, 1.3, 0.35, r, g, b, 0.85);
    this.P.chispas(x, y, 14, 0, Math.PI, 200, r, g, b, 0.4, 6);
  }

  telegrafia(x, y) {
    if (!this.activo) return;
    this.pool.add(this.R.idx('fx.telegrafia.0'), 4, x, y, 0.42, 0.85, 1.15, 1, 0.35, 0.45, 0.9);
  }

  telegrafiaGrande(x, y) {
    if (!this.activo) return;
    this.pool.add(this.R.idx('fx.telegrafia.0'), 4, x, y, 0.7, 2.6, 3.4, 1, 0.3, 0.4, 0.95);
  }

  fogonazo(x, y, ang, r, g, b) {
    if (!this.activo) return;
    this.P.chispas(x, y, 7, ang, 0.42, 300, r, g, b, 0.22, 6);
    this.pool.add(this.R.idx('fx.destello'), 1, x, y, 0.10, 0.55, 0.15, r, g, b, 0.95, ang);
  }

  impacto(x, y, ang, r, g, b, fuerza = 1) {
    if (!this.activo) return;
    this.P.chispas(x, y, 8 + fuerza * 8, ang + Math.PI, 1.35, 340 * fuerza, r, g, b, 0.35, 6);
    this.pool.add(this.R.idx('fx.impacto.0'), 4, x, y, 0.20, 0.45 * fuerza + 0.35, 0.9 * fuerza + 0.4, r, g, b, 0.95, CR.angle());
  }

  muerteEnemigo(x, y, r, g, b, tam = 1) {
    if (!this.activo) return;
    this.P.sangreDatos(x, y, 18 * tam, -Math.PI / 2, 260 * tam, r, g, b);
    this.P.chispas(x, y, 22 * tam, 0, Math.PI, 380 * tam, r, g, b, 0.5, 8);
    this.P.humo(x, y, 8 * tam, 16 * tam, 0.35, 0.35, 0.45, 0.4, 1.0, 30 * tam);
    this.pool.add(this.R.idx('fx.anillo.0'), 5, x, y, 0.32, 0.6 * tam, 1.7 * tam, r, g, b, 0.9);
    this.pool.add(this.R.idx('fx.impacto.0'), 4, x, y, 0.24, 0.7 * tam, 1.5 * tam, 1, 1, 1, 0.8, CR.angle());
  }

  explosionGrande(x, y, escala = 1) {
    if (!this.activo) return;
    this.P.ondaChoque(x, y, 60 * escala, 620 * escala, 1, 0.7, 0.35, 0.5);
    this.P.escombros(x, y, 26 * escala, 420 * escala, 0.75, 0.55, 0.4);
    this.P.humo(x, y, 20 * escala, 26 * escala, 0.35, 0.33, 0.36, 0.55, 1.6, 44 * escala);
    this.P.chispas(x, y, 40 * escala, 0, Math.PI, 560 * escala, 1, 0.75, 0.35, 0.6, 10);
    this.pool.add(this.R.idx('fx.anillo.0'), 5, x, y, 0.42, 0.9 * escala, 3.4 * escala, 1, 0.65, 0.3, 1);
    this.pool.add(this.R.idx('fx.destello'), 1, x, y, 0.18, 2.2 * escala, 0.6, 1, 0.9, 0.7, 1);
  }

  estelaJefe(x, y, vx, vy) {
    if (!this.activo) return;
    this.P.estela(x, y, vx, vy, 5, 1, 0.35, 0.5, 30, 0.5);
  }

  chispaLaser(x, y) {
    if (!this.activo) return;
    this.P.chispas(x, y, 2, CR.angle(), 1.2, 140, 1, 0.4, 0.5, 0.28, 5);
  }

  rotura(x, y, r, g, b) {
    if (!this.activo) return;
    this.P.escombros(x, y, 12, 260, r, g, b);
    this.P.humo(x, y, 5, 12, 0.5, 0.45, 0.4, 0.4, 0.8, 24);
  }

  modulo(x, y) {
    if (!this.activo) return;
    this.P.ondaChoque(x, y, 48, 380, 1, 0.85, 0.45, 0.7);
    this.pool.add(this.R.idx('fx.anillo.0'), 5, x, y, 0.6, 0.7, 3.0, 1, 0.85, 0.45, 1);
    this.pool.add(this.R.idx('fx.destello'), 1, x, y, 0.35, 1.8, 0.5, 1, 0.95, 0.7, 1);
    this.mundo.post.golpe(0.45, 1, 0.9, 0.6);
  }

  ambiente(x, y, r, g, b) {
    if (!this.activo) return;
    this.P.ambiente(x, y, 1, r, g, b);
  }
}
