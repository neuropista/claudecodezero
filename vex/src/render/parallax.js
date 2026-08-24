// parallax.js — Fondo procedural de cuatro capas, distinto por bioma.
// Se resuelve en una sola pasada a pantalla completa: las cuatro capas se
// acumulan dentro del fragment shader, así que cuesta una draw call.

import { Program, crearTrianguloPantalla, MEZCLA } from './gl.js';
import { FULL_VS, PARALLAX_FS } from './shaders.js';
import { PALETAS_BIOMA } from './spriteart.js';

function hexARgb(hex, out) {
  const v = parseInt(hex.slice(1), 16);
  out[0] = ((v >> 16) & 255) / 255;
  out[1] = ((v >> 8) & 255) / 255;
  out[2] = (v & 255) / 255;
  return out;
}

export class Parallax {
  constructor(gl) {
    this.gl = gl;
    this.programa = new Program(gl, FULL_VS, PARALLAX_FS, 'parallax');
    this.tri = crearTrianguloPantalla(gl);
    this.colA = new Float32Array(3);
    this.colB = new Float32Array(3);
    this.colC = new Float32Array(3);
    this.bioma = 0;
    this.intensidad = 1;
    this.tiempo = 0;
    this.activo = true;
    this.setBioma(0);
  }

  setBioma(i) {
    const P = PALETAS_BIOMA[i % PALETAS_BIOMA.length];
    hexARgb(P.fondoA, this.colA);
    hexARgb(P.fondoB, this.colB);
    hexARgb(P.acento, this.colC);
    this.bioma = i % PALETAS_BIOMA.length;
  }

  dibujar(ancho, alto, camX, camY, zoom, dt) {
    const gl = this.gl;
    this.tiempo += dt;
    const p = this.programa;
    p.usar();
    p.u2f('uResolucion', ancho, alto);
    p.u2f('uCamara', camX, camY);
    p.u1f('uTiempo', this.tiempo);
    p.u1f('uZoom', zoom);
    p.u3f('uColorA', this.colA[0], this.colA[1], this.colA[2]);
    p.u3f('uColorB', this.colB[0], this.colB[1], this.colB[2]);
    p.u3f('uColorC', this.colC[0], this.colC[1], this.colC[2]);
    p.u1f('uBioma', this.bioma);
    p.u1f('uIntensidad', this.activo ? this.intensidad : 0.35);
    MEZCLA.reemplazo(gl);
    gl.bindVertexArray(this.tri);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    MEZCLA.normal(gl);
  }
}
