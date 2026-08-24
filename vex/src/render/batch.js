// batch.js — Lote de sprites por instancias: una draw call para todo el atlas.
//
// Cada sprite son 12 flotantes en un único buffer intercalado que se sube una
// vez por lote. El buffer se asigna al arrancar y jamás vuelve a crecer, por lo
// que dibujar no genera basura.

import { Program } from './gl.js';
import { SPRITE_VS, SPRITE_FS } from './shaders.js';

export const FLOATS_POR_SPRITE = 16;
//  0..3  x, y, w, h
//  4..7  rot, u0, v0, emisivo
//  8..11 u1, v1, flash, reservado
// 12..15 r, g, b, a

export class LoteSprites {
  constructor(gl, maxSprites = 16384) {
    this.gl = gl;
    this.max = maxSprites;
    this.datos = new Float32Array(maxSprites * FLOATS_POR_SPRITE);
    this.n = 0;
    this.drawCalls = 0;
    this.spritesDibujados = 0;

    this.programa = new Program(gl, SPRITE_VS, SPRITE_FS, 'sprites');

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Quad unitario compartido.
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Buffer de instancias.
    this.instancias = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instancias);
    gl.bufferData(gl.ARRAY_BUFFER, this.datos.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS_POR_SPRITE * 4;
    for (let i = 0; i < 4; i++) {
      const loc = 1 + i;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, i * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);

    this.atlasTex = null;
    this.uvTabla = null;
  }

  configurarAtlas(textura, uvTabla, tamTabla) {
    this.atlasTex = textura;
    this.uvTabla = uvTabla;
    this.tamTabla = tamTabla;
  }

  reiniciarEstadisticas() { this.drawCalls = 0; this.spritesDibujados = 0; }

  /**
   * Encola un sprite. Todos los parámetros son escalares: no se crean objetos.
   * @param {number} idx índice de sprite en el atlas
   */
  push(idx, x, y, w, h, rot, r, g, b, a, emisivo = 0, flash = 0) {
    if (this.n >= this.max) this.flush();
    const o = this.n * FLOATS_POR_SPRITE;
    const d = this.datos;
    const u = this.uvTabla, i4 = idx * 4;
    d[o] = x; d[o + 1] = y; d[o + 2] = w; d[o + 3] = h;
    d[o + 4] = rot; d[o + 5] = u[i4]; d[o + 6] = u[i4 + 1]; d[o + 7] = emisivo;
    d[o + 8] = u[i4 + 2]; d[o + 9] = u[i4 + 3]; d[o + 10] = flash; d[o + 11] = 0;
    d[o + 12] = r; d[o + 13] = g; d[o + 14] = b; d[o + 15] = a;
    this.n++;
  }

  /** Igual que push pero usando el tamaño nativo del sprite por una escala. */
  pushEscala(idx, x, y, escalaX, escalaY, rot, r, g, b, a, emisivo = 0, flash = 0) {
    const t = this.tamTabla, i2 = idx * 2;
    this.push(idx, x, y, t[i2] * escalaX, t[i2 + 1] * escalaY, rot, r, g, b, a, emisivo, flash);
  }

  /** Sub-rectángulo del atlas: permite recortar (barras de vida, etc.). */
  pushRecorte(idx, x, y, w, h, rot, r, g, b, a, u0f, v0f, u1f, v1f, emisivo = 0) {
    if (this.n >= this.max) this.flush();
    const o = this.n * FLOATS_POR_SPRITE;
    const d = this.datos;
    const u = this.uvTabla, i4 = idx * 4;
    const su = u[i4 + 2] - u[i4], sv = u[i4 + 3] - u[i4 + 1];
    d[o] = x; d[o + 1] = y; d[o + 2] = w; d[o + 3] = h;
    d[o + 4] = rot;
    d[o + 5] = u[i4] + su * u0f; d[o + 6] = u[i4 + 1] + sv * v0f; d[o + 7] = emisivo;
    d[o + 8] = u[i4] + su * u1f; d[o + 9] = u[i4 + 1] + sv * v1f; d[o + 10] = 0; d[o + 11] = 0;
    d[o + 12] = r; d[o + 13] = g; d[o + 14] = b; d[o + 15] = a;
    this.n++;
  }

  /** Envía el lote acumulado. Devuelve el número de sprites dibujados. */
  flush(matrizCamara) {
    if (this.n === 0) return 0;
    const gl = this.gl;
    if (matrizCamara) this._matriz = matrizCamara;

    this.programa.usar();
    this.programa.umat3('uCamara', this._matriz);
    this.programa.tex('uAtlas', 0, this.atlasTex);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instancias);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.datos, 0, this.n * FLOATS_POR_SPRITE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n);
    gl.bindVertexArray(null);

    const dibujados = this.n;
    this.spritesDibujados += dibujados;
    this.drawCalls++;
    this.n = 0;
    return dibujados;
  }

  setMatriz(m) { this._matriz = m; }
}
