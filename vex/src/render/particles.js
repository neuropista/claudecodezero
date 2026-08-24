// particles.js — Sistema de partículas simulado íntegramente en la GPU.
//
// La posición, la velocidad, la vida y el rebote contra el nivel se calculan en
// el vertex shader de actualización y se escriben con transform feedback en un
// segundo buffer, que en el frame siguiente pasa a ser la fuente. La CPU sólo
// escribe partículas nuevas en un buffer circular: emitir 500 chispas cuesta
// una copia de memoria, no 500 objetos.

import { Program, crearTextura } from './gl.js';
import { PART_UPDATE_VS, PART_UPDATE_FS, PART_RENDER_VS, PART_RENDER_FS } from './shaders.js';
import { cosmeticRng } from '../core/rng.js';

const FLOATS = 16;              // posVel(4) + vida(4) + param(4) + color(4)
const BYTES = FLOATS * 4;
const STAGING_MAX = 4096;       // partículas por subida

// tipo: 0 = humo, 1 = niebla, 2 = chispa, 3 = escombro (colisiona)
export const TIPO = { HUMO: 0, NIEBLA: 1, CHISPA: 2, ESCOMBRO: 3 };

export class SistemaParticulas {
  constructor(gl, max = 32768) {
    this.gl = gl;
    this.max = max;
    this.cursor = 0;
    this.vivas = 0;
    this.emitidasFrame = 0;
    this.escalaTam = 1;
    this.activo = true;

    this.progUpdate = new Program(gl, PART_UPDATE_VS, PART_UPDATE_FS, 'part-update',
      ['vPosVel', 'vVida', 'vParam', 'vColor']);
    this.progRender = new Program(gl, PART_RENDER_VS, PART_RENDER_FS, 'part-render');

    const vacio = new Float32Array(max * FLOATS);
    this.buffers = [gl.createBuffer(), gl.createBuffer()];
    for (const b of this.buffers) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, vacio, gl.DYNAMIC_COPY);
    }

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

    this.vaoUpdate = [this._vaoUpdate(0), this._vaoUpdate(1)];
    this.vaoRender = [this._vaoRender(0), this._vaoRender(1)];
    this.tf = gl.createTransformFeedback();

    this.src = 0;
    this.staging = new Float32Array(STAGING_MAX * FLOATS);
    this.stagingN = 0;
    this.stagingInicio = 0;

    // Textura de colisión (solidez del nivel) de 1x1 por defecto.
    this.texColision = crearTextura(gl, 1, 1, {
      internalFormat: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE,
      datos: new Uint8Array([0]), nearest: true,
    });
    this.mundo = new Float32Array([0, 0, 1, 1]);
    this.colisionActiva = 0;
    this.tiempo = 0;
  }

  _vaoUpdate(i) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[i]);
    for (let k = 0; k < 4; k++) {
      gl.enableVertexAttribArray(k);
      gl.vertexAttribPointer(k, 4, gl.FLOAT, false, BYTES, k * 16);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  _vaoRender(i) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[i]);
    for (let k = 0; k < 4; k++) {
      const loc = 1 + k;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, BYTES, k * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  /** Publica la solidez del nivel para que las partículas reboten. */
  setColision(datos, ancho, alto, mundoX, mundoY, mundoW, mundoH) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texColision);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, ancho, alto, 0, gl.RED, gl.UNSIGNED_BYTE, datos);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.mundo[0] = mundoX; this.mundo[1] = mundoY;
    this.mundo[2] = mundoW; this.mundo[3] = mundoH;
    this.colisionActiva = 1;
  }

  /** Escribe una partícula en el staging. Cero asignaciones. */
  _escribir(x, y, vx, vy, vida, tam, arrastre, gravedad, turbulencia, r, g, b, a, tipo) {
    if (this.stagingN >= STAGING_MAX) this._subir();
    // Si el buffer circular fuese a dar la vuelta, cerramos el lote actual.
    if (this.stagingInicio + this.stagingN >= this.max) this._subir();
    if (this.stagingN === 0) this.stagingInicio = this.cursor;

    const o = this.stagingN * FLOATS;
    const d = this.staging;
    d[o] = x; d[o + 1] = y; d[o + 2] = vx; d[o + 3] = vy;
    d[o + 4] = vida; d[o + 5] = vida; d[o + 6] = cosmeticRng.float(); d[o + 7] = tipo;
    d[o + 8] = tam; d[o + 9] = arrastre; d[o + 10] = gravedad; d[o + 11] = turbulencia;
    d[o + 12] = r; d[o + 13] = g; d[o + 14] = b; d[o + 15] = a;
    this.stagingN++;
    this.cursor = (this.cursor + 1) % this.max;
    this.emitidasFrame++;
  }

  _subir() {
    if (this.stagingN === 0) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[this.src]);
    gl.bufferSubData(gl.ARRAY_BUFFER, this.stagingInicio * BYTES, this.staging, 0, this.stagingN * FLOATS);
    this.stagingN = 0;
    this.stagingInicio = this.cursor;
  }

  // ---------------------------------------------------------- emisores -----

  /** Chispas rápidas en abanico. */
  chispas(x, y, n, ang, apertura, velocidad, r, g, b, vida = 0.55, tam = 7) {
    n = Math.round(n * this.escalaTam);
    for (let i = 0; i < n; i++) {
      const a = ang + cosmeticRng.spread(apertura);
      const v = velocidad * (0.45 + cosmeticRng.float() * 0.9);
      this._escribir(
        x + cosmeticRng.spread(2), y + cosmeticRng.spread(2),
        Math.cos(a) * v, Math.sin(a) * v,
        vida * (0.6 + cosmeticRng.float() * 0.8),
        tam * (0.6 + cosmeticRng.float() * 0.8),
        2.4, 620, 0,
        r, g, b, 1, TIPO.CHISPA,
      );
    }
  }

  /** Humo que sube y se disipa. */
  humo(x, y, n, radio, r, g, b, a = 0.5, vida = 1.4, tam = 26) {
    n = Math.round(n * this.escalaTam);
    for (let i = 0; i < n; i++) {
      const ang = cosmeticRng.angle();
      const d = cosmeticRng.float() * radio;
      this._escribir(
        x + Math.cos(ang) * d, y + Math.sin(ang) * d,
        cosmeticRng.spread(24), -18 - cosmeticRng.float() * 34,
        vida * (0.7 + cosmeticRng.float() * 0.7),
        tam * (0.7 + cosmeticRng.float() * 0.9),
        1.5, -22, 0.35,
        r, g, b, a, TIPO.HUMO,
      );
    }
  }

  /** "Sangre de datos": gotas luminosas que rebotan contra la geometría. */
  sangreDatos(x, y, n, ang, velocidad, r, g, b) {
    n = Math.round(n * this.escalaTam);
    for (let i = 0; i < n; i++) {
      const a = ang + cosmeticRng.spread(1.5);
      const v = velocidad * (0.3 + cosmeticRng.float());
      this._escribir(
        x, y, Math.cos(a) * v, Math.sin(a) * v,
        0.9 + cosmeticRng.float() * 0.8,
        5 + cosmeticRng.float() * 6,
        0.7, 900, 0,
        r, g, b, 1, TIPO.ESCOMBRO,
      );
    }
  }

  /** Escombros pesados con rebote. */
  escombros(x, y, n, velocidad, r, g, b) {
    n = Math.round(n * this.escalaTam);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * 0.5 + cosmeticRng.spread(2.2);
      const v = velocidad * (0.3 + cosmeticRng.float());
      this._escribir(
        x + cosmeticRng.spread(6), y + cosmeticRng.spread(6),
        Math.cos(a) * v, Math.sin(a) * v,
        1.2 + cosmeticRng.float() * 1.4,
        6 + cosmeticRng.float() * 8,
        0.35, 1250, 0,
        r, g, b, 1, TIPO.ESCOMBRO,
      );
    }
  }

  /** Onda de choque: anillo de partículas hacia fuera. */
  ondaChoque(x, y, n, velocidad, r, g, b, vida = 0.45) {
    n = Math.round(n * this.escalaTam);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + cosmeticRng.spread(0.06);
      const v = velocidad * (0.9 + cosmeticRng.float() * 0.25);
      this._escribir(
        x + Math.cos(a) * 6, y + Math.sin(a) * 6,
        Math.cos(a) * v, Math.sin(a) * v,
        vida, 10 + cosmeticRng.float() * 6,
        4.5, 0, 0,
        r, g, b, 1, TIPO.CHISPA,
      );
    }
  }

  /** Estela continua (dash, proyectiles). */
  estela(x, y, vx, vy, n, r, g, b, tam = 12, vida = 0.35) {
    n = Math.round(n * this.escalaTam);
    for (let i = 0; i < n; i++) {
      this._escribir(
        x + cosmeticRng.spread(5), y + cosmeticRng.spread(5),
        vx * 0.12 + cosmeticRng.spread(26), vy * 0.12 + cosmeticRng.spread(26),
        vida * (0.6 + cosmeticRng.float() * 0.8),
        tam * (0.5 + cosmeticRng.float()),
        3.5, -40, 0.15,
        r, g, b, 0.85, TIPO.NIEBLA,
      );
    }
  }

  /** Motas ambientales que flotan por el bioma. */
  ambiente(x, y, n, r, g, b) {
    n = Math.round(n * this.escalaTam);
    for (let i = 0; i < n; i++) {
      this._escribir(
        x, y, cosmeticRng.spread(12), -6 - cosmeticRng.float() * 14,
        3 + cosmeticRng.float() * 3,
        2.5 + cosmeticRng.float() * 3.5,
        0.4, -4, 0.5,
        r, g, b, 0.55, TIPO.NIEBLA,
      );
    }
  }

  // ------------------------------------------------------------- ciclo -----

  actualizar(dt) {
    if (!this.activo) return;
    const gl = this.gl;
    this._subir();
    this.tiempo += dt;

    const dst = 1 - this.src;
    this.progUpdate.usar();
    this.progUpdate.u1f('uDt', dt);
    this.progUpdate.u1f('uTiempo', this.tiempo);
    this.progUpdate.u1f('uColisionActiva', this.colisionActiva);
    const l = this.progUpdate.loc('uMundo');
    if (l) gl.uniform4fv(l, this.mundo);
    this.progUpdate.tex('uColision', 0, this.texColision);

    gl.bindVertexArray(this.vaoUpdate[this.src]);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.tf);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.buffers[dst]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, this.max);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindVertexArray(null);

    this.src = dst;
    this.stagingInicio = this.cursor;
    this.emitidasFrame = 0;
  }

  dibujar(matrizCamara) {
    if (!this.activo) return;
    const gl = this.gl;
    this.progRender.usar();
    this.progRender.umat3('uCamara', matrizCamara);
    this.progRender.u1f('uEscalaTam', 1);
    gl.bindVertexArray(this.vaoRender[this.src]);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.max);
    gl.bindVertexArray(null);
  }

  /**
   * Cuenta partículas vivas leyendo el buffer de vuelta. Es una operación de
   * diagnóstico (sincroniza CPU y GPU), NO se usa en el bucle normal.
   */
  contarVivas() {
    const gl = this.gl;
    if (!this._lectura) this._lectura = new Float32Array(this.max * FLOATS);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[this.src]);
    gl.getBufferSubData(gl.ARRAY_BUFFER, 0, this._lectura);
    let n = 0;
    for (let i = 0; i < this.max; i++) if (this._lectura[i * FLOATS + 4] > 0) n++;
    return n;
  }

  limpiar() {
    const gl = this.gl;
    const vacio = new Float32Array(this.max * FLOATS);
    for (const b of this.buffers) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vacio);
    }
    this.cursor = 0; this.stagingN = 0; this.stagingInicio = 0;
  }
}
