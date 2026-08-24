// camera.js — Cámara 2D con zoom, rotación, límites y sacudida por trauma.
//
// El "trauma" (0..1) decae solo; la sacudida es proporcional a trauma^2, que es
// lo que hace que los golpes fuertes se sientan fuertes y los flojos, discretos.

import { clamp, damp, lerp, mat3Camera, valueNoise2 } from '../core/math.js';

export class Camera {
  constructor(anchoVista, altoVista) {
    this.x = 0; this.y = 0;
    this.xPrev = 0; this.yPrev = 0;
    this.zoom = 1; this.zoomObjetivo = 1;
    this.rot = 0;
    this.anchoVista = anchoVista;
    this.altoVista = altoVista;

    this.trauma = 0;
    this.traumaDecay = 1.35;
    this.shakeAmplitud = 26;
    this.shakeAngulo = 0.045;
    this.shakeEscala = 1;
    this.semillaShake = 0;

    this.offX = 0; this.offY = 0;      // desplazamiento final aplicado (shake)
    this.lookX = 0; this.lookY = 0;    // anticipación hacia donde se mira
    this.limites = null;               // {x0,y0,x1,y1} en mundo
    this.matriz = new Float32Array(9);
    this.tiempo = 0;
    this.retroceso = 0; this.retrocesoAng = 0;
  }

  redimensionar(w, h) { this.anchoVista = w; this.altoVista = h; }

  /** Añade trauma acumulativo (se satura en 1). */
  sacudir(cantidad) {
    this.trauma = clamp(this.trauma + cantidad, 0, 1);
  }

  /** Empujón direccional breve, ideal para el retroceso del arma. */
  empujar(angulo, fuerza) {
    this.retroceso = Math.min(this.retroceso + fuerza, 30);
    this.retrocesoAng = angulo;
  }

  fijar(x, y) { this.x = this.xPrev = x; this.y = this.yPrev = y; }

  setLimites(x0, y0, x1, y1) {
    if (x0 === null) { this.limites = null; return; }
    this.limites = { x0, y0, x1, y1 };
  }

  /**
   * Paso de simulación de la cámara (dentro del tick fijo).
   * @param {number} objX objetivo a seguir
   * @param {number} mirandoX componente -1..1 de anticipación horizontal
   */
  actualizar(dt, objX, objY, mirandoX = 0, mirandoY = 0, urgencia = 1) {
    this.xPrev = this.x; this.yPrev = this.y;
    this.tiempo += dt;

    this.lookX = damp(this.lookX, mirandoX * this.anchoVista * 0.16, 4, dt);
    this.lookY = damp(this.lookY, mirandoY * this.altoVista * 0.10, 4, dt);

    let destinoX = objX + this.lookX;
    let destinoY = objY + this.lookY;

    this.x = damp(this.x, destinoX, 7.5 * urgencia, dt);
    this.y = damp(this.y, destinoY, 6.5 * urgencia, dt);
    this.zoom = damp(this.zoom, this.zoomObjetivo, 5, dt);

    this.trauma = Math.max(0, this.trauma - this.traumaDecay * dt);
    this.retroceso = Math.max(0, this.retroceso - 90 * dt);

    this._aplicarLimites();
  }

  _aplicarLimites() {
    const L = this.limites;
    if (!L) return;
    const hw = (this.anchoVista * 0.5) / this.zoom;
    const hh = (this.altoVista * 0.5) / this.zoom;
    if (L.x1 - L.x0 <= hw * 2) this.x = (L.x0 + L.x1) * 0.5;
    else this.x = clamp(this.x, L.x0 + hw, L.x1 - hw);
    if (L.y1 - L.y0 <= hh * 2) this.y = (L.y0 + L.y1) * 0.5;
    else this.y = clamp(this.y, L.y0 + hh, L.y1 - hh);
  }

  /**
   * Calcula la matriz de vista para este frame.
   * @param {number} alpha interpolación entre el tick anterior y el actual
   * @param {number} intensidadShake multiplicador de opciones (0 desactiva)
   */
  construirMatriz(alpha, intensidadShake = 1) {
    const ix = lerp(this.xPrev, this.x, alpha);
    const iy = lerp(this.yPrev, this.y, alpha);

    const s = this.trauma * this.trauma * intensidadShake * this.shakeEscala;
    let ox = 0, oy = 0, orot = 0;
    if (s > 0.0001) {
      const t = this.tiempo * 26;
      // Ruido continuo (no aleatorio puro): la sacudida se siente física.
      ox = (valueNoise2(t, 0.5, 11) * 2 - 1) * this.shakeAmplitud * s;
      oy = (valueNoise2(t, 5.5, 23) * 2 - 1) * this.shakeAmplitud * s;
      orot = (valueNoise2(t, 9.5, 37) * 2 - 1) * this.shakeAngulo * s;
    }
    if (this.retroceso > 0.01) {
      ox += Math.cos(this.retrocesoAng) * this.retroceso * 0.35;
      oy += Math.sin(this.retrocesoAng) * this.retroceso * 0.35;
    }
    this.offX = ox; this.offY = oy;

    mat3Camera(this.matriz, ix + ox, iy + oy, this.zoom, this.rot + orot, this.anchoVista, this.altoVista);
    this._ix = ix + ox; this._iy = iy + oy; this._irot = this.rot + orot;
    return this.matriz;
  }

  /** Convierte coordenadas de pantalla (píxeles del canvas) a mundo. */
  pantallaAMundo(sx, sy, out) {
    const cx = this.anchoVista * 0.5, cy = this.altoVista * 0.5;
    const dx = (sx - cx) / this.zoom, dy = (sy - cy) / this.zoom;
    const c = Math.cos(-this._irot ?? 0), s = Math.sin(-this._irot ?? 0);
    out[0] = (this._ix ?? this.x) + dx * c - dy * s;
    out[1] = (this._iy ?? this.y) + dx * s + dy * c;
    return out;
  }

  mundoAPantalla(wx, wy, out) {
    const c = Math.cos(this._irot ?? 0), s = Math.sin(this._irot ?? 0);
    const dx = wx - (this._ix ?? this.x), dy = wy - (this._iy ?? this.y);
    out[0] = this.anchoVista * 0.5 + (dx * c - dy * s) * this.zoom;
    out[1] = this.altoVista * 0.5 + (dx * s + dy * c) * this.zoom;
    return out;
  }

  /** AABB del área visible en mundo, con margen. */
  vista(out, margen = 64) {
    const hw = (this.anchoVista * 0.5) / this.zoom + margen;
    const hh = (this.altoVista * 0.5) / this.zoom + margen;
    const cx = this._ix ?? this.x, cy = this._iy ?? this.y;
    out[0] = cx - hw; out[1] = cy - hh; out[2] = cx + hw; out[3] = cy + hh;
    return out;
  }
}
