// lighting.js — Luces 2D dinámicas con sombras duras por raycast.
//
// Para cada luz que proyecta sombra se calcula su polígono de visibilidad
// (barrido angular sobre los extremos de los segmentos del nivel) y se dibuja
// como abanico de triángulos con atenuación radial, sumando en un framebuffer
// de luz que después multiplica a la escena.

import { Program, Objetivo, MEZCLA } from './gl.js';
import { LUZ_VS, LUZ_FS } from './shaders.js';

const MAX_LUCES = 128;
const MAX_VERTICES_FAN = 1600;
const MAX_SEG_CANDIDATOS = 512;
const RAYOS_BASE = 28;              // rayos de relleno para que el círculo sea redondo
const EPS = 0.00035;

export class Iluminacion {
  constructor(gl, ancho, alto) {
    this.gl = gl;
    this.objetivo = new Objetivo(gl, ancho, alto);
    this.programa = new Program(gl, LUZ_VS, LUZ_FS, 'luz');

    this.vbo = gl.createBuffer();
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_VERTICES_FAN * 2 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.fan = new Float32Array(MAX_VERTICES_FAN * 2);

    // Lista de luces del frame (SoA, se reutiliza siempre).
    this.n = 0;
    this.lx = new Float32Array(MAX_LUCES);
    this.ly = new Float32Array(MAX_LUCES);
    this.lr = new Float32Array(MAX_LUCES);
    this.lcol = new Float32Array(MAX_LUCES * 3);
    this.lint = new Float32Array(MAX_LUCES);
    this.lang = new Float32Array(MAX_LUCES);
    this.lap = new Float32Array(MAX_LUCES);
    this.lsombra = new Uint8Array(MAX_LUCES);
    this.lparpadeo = new Float32Array(MAX_LUCES);
    this.lorden = new Int32Array(MAX_LUCES);
    this.ldist = new Float32Array(MAX_LUCES);

    // Segmentos del nivel + rejilla espacial.
    this.segs = new Float32Array(0);
    this.nsegs = 0;
    this.celda = 160;
    this.hash = null;
    this.hashInicio = null;
    this.hashDatos = null;
    this.gridW = 0; this.gridH = 0;
    this.origenX = 0; this.origenY = 0;
    this.sello = null;
    this.selloActual = 1;

    this.candidatos = new Int32Array(MAX_SEG_CANDIDATOS);
    this.angulos = new Float32Array(MAX_VERTICES_FAN);
    this.puntos = new Float32Array(MAX_VERTICES_FAN * 3);   // ang, x, y

    this.ambiente = new Float32Array([0.22, 0.24, 0.32]);
    this.maxSombras = 6;
    this.tiempo = 0;
    this.sombrasActivas = true;
    this.estadisticas = { luces: 0, conSombra: 0, segmentos: 0 };
  }

  redimensionar(w, h) { this.objetivo.redimensionar(w, h); }

  /**
   * Publica la geometría de oclusión del nivel.
   * @param {Float32Array} segs  [x0,y0,x1,y1] por segmento
   */
  setGeometria(segs, nsegs, minX, minY, maxX, maxY) {
    this.segs = segs;
    this.nsegs = nsegs;
    this.origenX = minX; this.origenY = minY;
    this.gridW = Math.max(1, Math.ceil((maxX - minX) / this.celda));
    this.gridH = Math.max(1, Math.ceil((maxY - minY) / this.celda));
    const celdas = this.gridW * this.gridH;

    // Construcción del hash espacial en dos pasadas (conteo + relleno).
    const cuenta = new Int32Array(celdas + 1);
    const marcar = (fn) => {
      for (let i = 0; i < nsegs; i++) {
        const x0 = segs[i * 4], y0 = segs[i * 4 + 1], x1 = segs[i * 4 + 2], y1 = segs[i * 4 + 3];
        const cx0 = Math.max(0, Math.floor((Math.min(x0, x1) - minX) / this.celda));
        const cx1 = Math.min(this.gridW - 1, Math.floor((Math.max(x0, x1) - minX) / this.celda));
        const cy0 = Math.max(0, Math.floor((Math.min(y0, y1) - minY) / this.celda));
        const cy1 = Math.min(this.gridH - 1, Math.floor((Math.max(y0, y1) - minY) / this.celda));
        for (let cy = cy0; cy <= cy1; cy++) {
          for (let cx = cx0; cx <= cx1; cx++) fn(cy * this.gridW + cx, i);
        }
      }
    };
    marcar((c) => { cuenta[c + 1]++; });
    for (let i = 0; i < celdas; i++) cuenta[i + 1] += cuenta[i];
    this.hashInicio = cuenta;
    this.hashDatos = new Int32Array(cuenta[celdas]);
    const cursor = new Int32Array(celdas);
    marcar((c, i) => { this.hashDatos[cuenta[c] + cursor[c]++] = i; });

    this.sello = new Int32Array(nsegs);
    this.selloActual = 1;
    this.estadisticas.segmentos = nsegs;
  }

  setAmbiente(r, g, b) { this.ambiente[0] = r; this.ambiente[1] = g; this.ambiente[2] = b; }

  reiniciar() { this.n = 0; }

  /** Encola una luz para este frame. */
  add(x, y, radio, r, g, b, intensidad = 1, sombra = false, angulo = 0, apertura = 7, parpadeo = 0) {
    if (this.n >= MAX_LUCES) return -1;
    const i = this.n++;
    this.lx[i] = x; this.ly[i] = y; this.lr[i] = radio;
    this.lcol[i * 3] = r; this.lcol[i * 3 + 1] = g; this.lcol[i * 3 + 2] = b;
    this.lint[i] = intensidad;
    this.lang[i] = angulo; this.lap[i] = apertura;
    this.lsombra[i] = sombra ? 1 : 0;
    this.lparpadeo[i] = parpadeo;
    return i;
  }

  // ---------------------------------------------------- polígono de visión --

  _recolectar(lx, ly, radio) {
    if (!this.hashInicio) return 0;
    const c = this.candidatos;
    let n = 0;
    const sello = ++this.selloActual;
    const cx0 = Math.max(0, Math.floor((lx - radio - this.origenX) / this.celda));
    const cx1 = Math.min(this.gridW - 1, Math.floor((lx + radio - this.origenX) / this.celda));
    const cy0 = Math.max(0, Math.floor((ly - radio - this.origenY) / this.celda));
    const cy1 = Math.min(this.gridH - 1, Math.floor((ly + radio - this.origenY) / this.celda));
    const r2 = radio * radio;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const celda = cy * this.gridW + cx;
        const ini = this.hashInicio[celda], fin = this.hashInicio[celda + 1];
        for (let k = ini; k < fin; k++) {
          const s = this.hashDatos[k];
          if (this.sello[s] === sello) continue;
          this.sello[s] = sello;
          // Descarte por distancia punto-segmento.
          const x0 = this.segs[s * 4], y0 = this.segs[s * 4 + 1];
          const x1 = this.segs[s * 4 + 2], y1 = this.segs[s * 4 + 3];
          const dx = x1 - x0, dy = y1 - y0;
          const len2 = dx * dx + dy * dy;
          let t = len2 > 0 ? ((lx - x0) * dx + (ly - y0) * dy) / len2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = x0 + dx * t - lx, py = y0 + dy * t - ly;
          if (px * px + py * py > r2) continue;
          if (n < MAX_SEG_CANDIDATOS) c[n++] = s;
        }
      }
    }
    return n;
  }

  _lanzarRayo(lx, ly, ang, radio, cand, ncand) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let mejor = radio;
    for (let k = 0; k < ncand; k++) {
      const s = cand[k] * 4;
      const ax = this.segs[s], ay = this.segs[s + 1];
      const bx = this.segs[s + 2], by = this.segs[s + 3];
      const sx = bx - ax, sy = by - ay;
      const den = dx * sy - dy * sx;
      if (den === 0) continue;
      const qx = ax - lx, qy = ay - ly;
      const t = (qx * sy - qy * sx) / den;      // distancia sobre el rayo
      if (t <= 0.0001 || t >= mejor) continue;
      const u = (qx * dy - qy * dx) / den;      // posición sobre el segmento
      if (u < 0 || u > 1) continue;
      mejor = t;
    }
    return mejor;
  }

  _poligono(lx, ly, radio) {
    const ncand = this._recolectar(lx, ly, radio);
    const angs = this.angulos;
    let na = 0;
    for (let i = 0; i < RAYOS_BASE && na < MAX_VERTICES_FAN - 6; i++) {
      angs[na++] = (i / RAYOS_BASE) * Math.PI * 2 - Math.PI;
    }
    for (let k = 0; k < ncand && na < MAX_VERTICES_FAN - 6; k++) {
      const s = this.candidatos[k] * 4;
      for (let e = 0; e < 2; e++) {
        const px = this.segs[s + e * 2], py = this.segs[s + e * 2 + 1];
        const a = Math.atan2(py - ly, px - lx);
        angs[na++] = a - EPS;
        angs[na++] = a;
        angs[na++] = a + EPS;
        if (na >= MAX_VERTICES_FAN - 6) break;
      }
    }

    const pts = this.puntos;
    for (let i = 0; i < na; i++) {
      const a = angs[i];
      const t = this._lanzarRayo(lx, ly, a, radio, this.candidatos, ncand);
      pts[i * 3] = a;
      pts[i * 3 + 1] = lx + Math.cos(a) * t;
      pts[i * 3 + 2] = ly + Math.sin(a) * t;
    }

    // Ordenación por ángulo con inserción sobre índices (na suele ser < 400).
    const orden = this._orden || (this._orden = new Int32Array(MAX_VERTICES_FAN));
    for (let i = 0; i < na; i++) orden[i] = i;
    for (let i = 1; i < na; i++) {
      const v = orden[i], av = pts[v * 3];
      let j = i - 1;
      while (j >= 0 && pts[orden[j] * 3] > av) { orden[j + 1] = orden[j]; j--; }
      orden[j + 1] = v;
    }

    const fan = this.fan;
    fan[0] = lx; fan[1] = ly;
    let nv = 1;
    for (let i = 0; i < na; i++) {
      const p = orden[i] * 3;
      fan[nv * 2] = pts[p + 1];
      fan[nv * 2 + 1] = pts[p + 2];
      nv++;
    }
    // Cerrar el abanico.
    if (na > 0) {
      const p = orden[0] * 3;
      fan[nv * 2] = pts[p + 1];
      fan[nv * 2 + 1] = pts[p + 2];
      nv++;
    }
    return nv;
  }

  _quad(lx, ly, radio) {
    const f = this.fan;
    f[0] = lx; f[1] = ly;
    f[2] = lx - radio; f[3] = ly - radio;
    f[4] = lx + radio; f[5] = ly - radio;
    f[6] = lx + radio; f[7] = ly + radio;
    f[8] = lx - radio; f[9] = ly + radio;
    f[10] = lx - radio; f[11] = ly - radio;
    return 6;
  }

  /** Dibuja todas las luces del frame en el framebuffer de luz. */
  render(matrizCamara, dt, camX, camY, sombrasOpcion = true) {
    const gl = this.gl;
    this.tiempo += dt;
    const amb = this.ambiente;
    this.objetivo.bind(true, 0, 0, 0, 1);
    MEZCLA.aditiva(gl);

    // Prioriza sombras en las luces más cercanas a la cámara.
    for (let i = 0; i < this.n; i++) {
      const dx = this.lx[i] - camX, dy = this.ly[i] - camY;
      this.ldist[i] = dx * dx + dy * dy;
      this.lorden[i] = i;
    }
    const ord = this.lorden;
    for (let i = 1; i < this.n; i++) {
      const v = ord[i], dv = this.ldist[v];
      let j = i - 1;
      while (j >= 0 && this.ldist[ord[j]] > dv) { ord[j + 1] = ord[j]; j--; }
      ord[j + 1] = v;
    }

    const p = this.programa;
    p.usar();
    p.umat3('uCamara', matrizCamara);
    p.u1f('uTiempo', this.tiempo);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    let conSombra = 0;
    const permitirSombras = sombrasOpcion && this.sombrasActivas && this.nsegs > 0;
    for (let k = 0; k < this.n; k++) {
      const i = ord[k];
      const usarSombra = permitirSombras && this.lsombra[i] === 1 && conSombra < this.maxSombras;
      const nv = usarSombra
        ? this._poligono(this.lx[i], this.ly[i], this.lr[i])
        : this._quad(this.lx[i], this.ly[i], this.lr[i]);
      if (usarSombra) conSombra++;

      p.u2f('uCentro', this.lx[i], this.ly[i]);
      p.u1f('uRadio', this.lr[i]);
      p.u3f('uColor', this.lcol[i * 3], this.lcol[i * 3 + 1], this.lcol[i * 3 + 2]);
      p.u1f('uIntensidad', this.lint[i]);
      p.u1f('uAngulo', this.lang[i]);
      p.u1f('uApertura', this.lap[i]);
      p.u1f('uParpadeo', this.lparpadeo[i]);

      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.fan, 0, nv * 2);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, nv);
    }
    gl.bindVertexArray(null);
    MEZCLA.normal(gl);

    this.estadisticas.luces = this.n;
    this.estadisticas.conSombra = conSombra;
  }
}

/**
 * Extrae los segmentos frontera de un grid de tiles sólidos, fusionando tramos
 * contiguos para que el raycast tenga que probar muchos menos segmentos.
 */
export function segmentosDesdeGrid(esSolido, ancho, alto, tam, offsetX = 0, offsetY = 0) {
  const lista = [];
  // Bordes horizontales (arriba y abajo de cada tile).
  for (let dir = 0; dir < 2; dir++) {
    const dy = dir === 0 ? -1 : 1;
    for (let y = 0; y < alto; y++) {
      let inicio = -1;
      for (let x = 0; x <= ancho; x++) {
        const borde = x < ancho && esSolido(x, y) && !esSolido(x, y + dy);
        if (borde && inicio < 0) inicio = x;
        else if (!borde && inicio >= 0) {
          const py = offsetY + (dir === 0 ? y : y + 1) * tam;
          lista.push(offsetX + inicio * tam, py, offsetX + x * tam, py);
          inicio = -1;
        }
      }
    }
  }
  // Bordes verticales (izquierda y derecha).
  for (let dir = 0; dir < 2; dir++) {
    const dx = dir === 0 ? -1 : 1;
    for (let x = 0; x < ancho; x++) {
      let inicio = -1;
      for (let y = 0; y <= alto; y++) {
        const borde = y < alto && esSolido(x, y) && !esSolido(x + dx, y);
        if (borde && inicio < 0) inicio = y;
        else if (!borde && inicio >= 0) {
          const px = offsetX + (dir === 0 ? x : x + 1) * tam;
          lista.push(px, offsetY + inicio * tam, px, offsetY + y * tam);
          inicio = -1;
        }
      }
    }
  }
  const arr = new Float32Array(lista.length);
  arr.set(lista);
  return { segs: arr, n: lista.length / 4 };
}
