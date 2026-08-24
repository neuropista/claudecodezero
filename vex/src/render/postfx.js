// postfx.js — Cadena de post-proceso en framebuffers.
//
// escena -> (multiplicar por luz) -> capa emisiva -> brillo -> pirámide de
// desenfoque separable -> composición final con aberración cromática, viñeta,
// grano, distorsión de barril tipo CRT, glitch y flash de impacto.

import { Program, Objetivo, crearTrianguloPantalla, bindPantalla, MEZCLA } from './gl.js';
import {
  FULL_VS, COPIA_FS, BRILLO_FS, DESENFOQUE_FS, SUBIR_FS, POST_FS, COMPONER_LUZ_FS,
} from './shaders.js';

const NIVELES_BLOOM = 5;

export class PostProceso {
  constructor(gl, ancho, alto) {
    this.gl = gl;
    this.tri = crearTrianguloPantalla(gl);

    const hdr = gl.extColorFloat
      ? { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT }
      : {};
    this.hdr = !!gl.extColorFloat;

    this.escena = new Objetivo(gl, ancho, alto, hdr);
    this.compuesto = new Objetivo(gl, ancho, alto, hdr);
    this.brillo = new Objetivo(gl, ancho >> 1, alto >> 1, hdr);
    this.mips = [];
    this.temp = [];
    for (let i = 0; i < NIVELES_BLOOM; i++) {
      const d = 2 << i;
      this.mips.push(new Objetivo(gl, Math.max(1, ancho / d), Math.max(1, alto / d), hdr));
      this.temp.push(new Objetivo(gl, Math.max(1, ancho / d), Math.max(1, alto / d), hdr));
    }

    this.pCopia = new Program(gl, FULL_VS, COPIA_FS, 'copia');
    this.pBrillo = new Program(gl, FULL_VS, BRILLO_FS, 'brillo');
    this.pDesenfoque = new Program(gl, FULL_VS, DESENFOQUE_FS, 'desenfoque');
    this.pSubir = new Program(gl, FULL_VS, SUBIR_FS, 'subir');
    this.pPost = new Program(gl, FULL_VS, POST_FS, 'post');
    this.pLuz = new Program(gl, FULL_VS, COMPONER_LUZ_FS, 'componerLuz');

    this.ancho = ancho; this.alto = alto;
    this.tiempo = 0;

    // Parámetros animables desde el juego.
    this.bloomFuerza = 0.72;
    this.bloomUmbral = 0.88;
    this.bloomCodo = 0.25;
    this.aberracion = 1;
    this.vineta = 0.85;
    this.grano = 0.35;
    this.curvatura = 0.055;
    this.flash = 0;
    this.flashColor = new Float32Array([1, 1, 1]);
    this.danio = 0;
    this.glitch = 0;
    this.saturacion = 1;
    this.fundido = 0;

    this.opciones = { bloom: true, aberracion: true, vineta: true, grano: true, crt: true, flash: true };
  }

  redimensionar(ancho, alto) {
    if (ancho === this.ancho && alto === this.alto) return;
    this.ancho = ancho; this.alto = alto;
    this.escena.redimensionar(ancho, alto);
    this.compuesto.redimensionar(ancho, alto);
    this.brillo.redimensionar(Math.max(1, ancho >> 1), Math.max(1, alto >> 1));
    for (let i = 0; i < NIVELES_BLOOM; i++) {
      const d = 2 << i;
      this.mips[i].redimensionar(Math.max(1, ancho / d), Math.max(1, alto / d));
      this.temp[i].redimensionar(Math.max(1, ancho / d), Math.max(1, alto / d));
    }
  }

  _pantallaCompleta() {
    const gl = this.gl;
    gl.bindVertexArray(this.tri);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /** Comienza a dibujar la escena base (todo lo que recibe iluminación). */
  empezarEscena(r = 0, g = 0, b = 0) {
    this.escena.bind(true, r, g, b, 1);
    MEZCLA.normal(this.gl);
  }

  /** Multiplica la escena por el buffer de luz y deja el resultado listo. */
  aplicarLuz(texLuz, ambienteR, ambienteG, ambienteB, activo) {
    const gl = this.gl;
    this.compuesto.bind(false);
    MEZCLA.reemplazo(gl);
    this.pLuz.usar();
    this.pLuz.tex('uEscena', 0, this.escena.tex);
    this.pLuz.tex('uLuz', 1, texLuz);
    this.pLuz.u3f('uAmbiente', ambienteR, ambienteG, ambienteB);
    this.pLuz.u1f('uLucesActivas', activo ? 1 : 0);
    this._pantallaCompleta();
    MEZCLA.normal(gl);
  }

  /** Vuelve a enlazar el buffer compuesto para dibujar encima lo emisivo. */
  continuarEmisivo() {
    this.compuesto.bind(false);
  }

  /** Genera la pirámide de bloom a partir del buffer compuesto. */
  _bloom() {
    const gl = this.gl;
    MEZCLA.reemplazo(gl);

    this.brillo.bind(false);
    this.pBrillo.usar();
    this.pBrillo.tex('uTex', 0, this.compuesto.tex);
    this.pBrillo.u1f('uUmbral', this.bloomUmbral);
    this.pBrillo.u1f('uCodo', this.bloomCodo);
    this._pantallaCompleta();

    // Bajada progresiva con desenfoque separable en cada nivel.
    let fuente = this.brillo;
    for (let i = 0; i < NIVELES_BLOOM; i++) {
      const mip = this.mips[i], tmp = this.temp[i];
      tmp.bind(false);
      this.pDesenfoque.usar();
      this.pDesenfoque.tex('uTex', 0, fuente.tex);
      this.pDesenfoque.u2f('uPaso', 1 / tmp.ancho, 0);
      this._pantallaCompleta();

      mip.bind(false);
      this.pDesenfoque.tex('uTex', 0, tmp.tex);
      this.pDesenfoque.u2f('uPaso', 0, 1 / mip.alto);
      this._pantallaCompleta();

      fuente = mip;
    }

    // Subida acumulando niveles: da el halo ancho característico.
    for (let i = NIVELES_BLOOM - 2; i >= 0; i--) {
      const destino = this.temp[i];
      destino.bind(false);
      this.pSubir.usar();
      this.pSubir.tex('uTex', 0, this.mips[i].tex);
      this.pSubir.tex('uPrevio', 1, this.mips[i + 1].tex);
      this.pSubir.u1f('uPeso', 0.82);
      this._pantallaCompleta();
      // Copia de vuelta al mip para encadenar.
      this.mips[i].bind(false);
      this.pCopia.usar();
      this.pCopia.tex('uTex', 0, destino.tex);
      this._pantallaCompleta();
    }
    MEZCLA.normal(gl);
  }

  /** Composición final a la pantalla. */
  presentar(anchoPantalla, altoPantalla, dt) {
    const gl = this.gl;
    this.tiempo += dt;
    const o = this.opciones;
    const usarBloom = o.bloom && this.bloomFuerza > 0.001;
    if (usarBloom) this._bloom();

    bindPantalla(gl, anchoPantalla, altoPantalla, false);
    MEZCLA.reemplazo(gl);
    const p = this.pPost;
    p.usar();
    p.tex('uEscena', 0, this.compuesto.tex);
    p.tex('uBloom', 1, usarBloom ? this.mips[0].tex : this.compuesto.tex);
    p.u1f('uTiempo', this.tiempo);
    p.u2f('uResolucion', this.ancho, this.alto);
    p.u1f('uBloomFuerza', usarBloom ? this.bloomFuerza : 0);
    p.u1f('uAberracion', o.aberracion ? this.aberracion : 0);
    p.u1f('uVineta', o.vineta ? this.vineta : 0);
    p.u1f('uGrano', o.grano ? this.grano : 0);
    p.u1f('uCurvatura', o.crt ? this.curvatura : 0);
    p.u1f('uFlash', o.flash ? this.flash : 0);
    p.u3f('uFlashColor', this.flashColor[0], this.flashColor[1], this.flashColor[2]);
    p.u1f('uDanio', this.danio);
    p.u1f('uGlitch', this.glitch);
    p.u1f('uSaturacion', this.saturacion);
    p.u1f('uFundido', this.fundido);
    this._pantallaCompleta();
    MEZCLA.normal(gl);
  }

  /** Decaimiento de los efectos temporales (se llama una vez por frame). */
  decaer(dt) {
    this.flash = Math.max(0, this.flash - dt * 5.5);
    this.danio = Math.max(0, this.danio - dt * 2.2);
    this.glitch = Math.max(0, this.glitch - dt * 1.6);
  }

  golpe(intensidad, r = 1, g = 1, b = 1) {
    this.flash = Math.min(1.1, this.flash + intensidad);
    this.flashColor[0] = r; this.flashColor[1] = g; this.flashColor[2] = b;
  }
}
