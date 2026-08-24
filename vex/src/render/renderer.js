// renderer.js — Orquestador del render: atlas, lotes, luz, partículas y post.
//
// Expone un frame por fases explícitas para que el juego sepa exactamente qué
// se ilumina y qué es emisivo:
//   empezarFrame -> [mundo] -> finMundo -> [emisivo] -> finEmisivo -> [ui] -> presentar

import { crearContexto, texturaDesdeCanvas, MEZCLA } from './gl.js';
import { Atlas } from './atlas.js';
import { registrarTodo, PALETAS_BIOMA } from './spriteart.js';
import { registrarFuente, normalizar } from './font.js';
import { LoteSprites } from './batch.js';
import { SistemaParticulas } from './particles.js';
import { Iluminacion } from './lighting.js';
import { PostProceso } from './postfx.js';
import { Parallax } from './parallax.js';
import { Camera } from './camera.js';
import { mat3Camera } from '../core/math.js';
import { Rng } from '../core/rng.js';

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.gl = crearContexto(canvas);
    const gl = this.gl;

    this.ancho = canvas.width;
    this.alto = canvas.height;
    this.escalaResolucion = settings ? settings.get('escala') : 1;

    this.atlas = new Atlas(2048);
    const rngArte = new Rng('atlas-vex');
    registrarTodo(this.atlas, rngArte);
    this.fuente = registrarFuente(this.atlas, 40);
    const canvasAtlas = this.atlas.construir(rngArte);
    this.texAtlas = texturaDesdeCanvas(gl, canvasAtlas, { mipmap: true });

    this.lote = new LoteSprites(gl, 24576);
    this.lote.configurarAtlas(this.texAtlas, this.atlas.uv, this.atlas.tam2d);

    this.particulas = new SistemaParticulas(gl, 32768);
    this.luz = new Iluminacion(gl, this.ancho, this.alto);
    this.post = new PostProceso(gl, this.ancho, this.alto);
    this.parallax = new Parallax(gl);
    this.camara = new Camera(this.ancho, this.alto);

    this.matrizUI = new Float32Array(9);
    this.vistaMundo = new Float32Array(4);
    this.tmp2 = new Float32Array(2);

    this.spriteBlanco = this.atlas.indice('fx.blanco');
    this.spritePanel = this.atlas.indice('ui.panel');
    this.spriteSuave = this.atlas.indice('fx.suave');

    this.estadisticas = { sprites: 0, drawCalls: 0, luces: 0, particulasEmitidas: 0 };
    this.tiempoRender = 0;
    this.aplicarOpciones();
  }

  idx(nombre) { return this.atlas.indice(nombre); }

  aplicarOpciones() {
    const s = this.settings;
    if (!s) return;
    const o = this.post.opciones;
    o.bloom = s.get('bloom');
    o.aberracion = s.get('aberracion');
    o.vineta = s.get('vineta');
    o.grano = s.get('grano');
    o.crt = s.get('crt');
    o.flash = s.get('flash');
    this.luz.sombrasActivas = s.get('sombras');
    this.lucesActivas = s.get('luces');
    this.parallax.activo = s.get('parallax');
    this.particulas.escalaTam = s.get('particulas');
    this.escalaResolucion = s.get('escala');
    this.redimensionar(this.canvas.clientWidth, this.canvas.clientHeight, true);
  }

  redimensionar(anchoCss, altoCss, forzar = false) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(320, Math.round(anchoCss * dpr * this.escalaResolucion));
    const h = Math.max(240, Math.round(altoCss * dpr * this.escalaResolucion));
    if (!forzar && w === this.ancho && h === this.alto) return false;
    this.canvas.width = w;
    this.canvas.height = h;
    this.ancho = w; this.alto = h;
    this.camara.redimensionar(w, h);
    this.luz.redimensionar(w, h);
    this.post.redimensionar(w, h);
    return true;
  }

  setBioma(i) {
    this.parallax.setBioma(i);
    const P = PALETAS_BIOMA[i % PALETAS_BIOMA.length];
    this.luz.setAmbiente(P.ambiente[0], P.ambiente[1], P.ambiente[2]);
    this.biomaActual = i;
  }

  // ------------------------------------------------------------- frame -----

  empezarFrame(alpha, dt) {
    const gl = this.gl;
    this.matriz = this.camara.construirMatriz(alpha, this.settings ? this.settings.get('shake') : 1);
    this.camara.vista(this.vistaMundo, 96);
    this.lote.reiniciarEstadisticas();
    this.lote.setMatriz(this.matriz);
    this.luz.reiniciar();

    this.post.empezarEscena();
    this.parallax.dibujar(this.ancho, this.alto, this.camara._ix, this.camara._iy, this.camara.zoom, dt);
    MEZCLA.normal(gl);
  }

  /** Cierra la capa iluminable y aplica el buffer de luz. */
  finMundo(dt) {
    this.lote.flush(this.matriz);
    const amb = this.luz.ambiente;
    if (this.lucesActivas) {
      this.luz.render(this.matriz, dt, this.camara._ix, this.camara._iy,
        this.settings ? this.settings.get('sombras') : true);
    }
    this.post.aplicarLuz(this.luz.objetivo.tex, amb[0], amb[1], amb[2], this.lucesActivas);
  }

  /** Capa emisiva: partículas y todo lo que brilla por sí mismo. */
  empezarEmisivo() {
    const gl = this.gl;
    this.post.continuarEmisivo();
    gl.viewport(0, 0, this.ancho, this.alto);
    MEZCLA.aditiva(gl);
    this.particulas.dibujar(this.matriz);
    this.lote.setMatriz(this.matriz);
  }

  finEmisivo() {
    this.lote.flush(this.matriz);
    MEZCLA.normal(this.gl);
  }

  /** Capa de interfaz en coordenadas de pantalla. */
  empezarUI() {
    mat3Camera(this.matrizUI, this.ancho * 0.5, this.alto * 0.5, 1, 0, this.ancho, this.alto);
    this.lote.setMatriz(this.matrizUI);
    MEZCLA.normal(this.gl);
  }

  finUI() { this.lote.flush(this.matrizUI); }

  presentar(dt) {
    this.post.presentar(this.canvas.width, this.canvas.height, dt);
    this.estadisticas.sprites = this.lote.spritesDibujados;
    this.estadisticas.drawCalls = this.lote.drawCalls;
    this.estadisticas.luces = this.luz.estadisticas.luces;
    this.estadisticas.lucesSombra = this.luz.estadisticas.conSombra;
  }

  // -------------------------------------------------------------- texto ----

  anchoTexto(texto, escala = 1) {
    return String(texto).length * this.fuente.avance * escala;
  }

  /**
   * Dibuja texto con la fuente de trazos.
   * @param {number} alineacion 0 izquierda, 0.5 centro, 1 derecha
   */
  texto(texto, x, y, escala = 1, r = 1, g = 1, b = 1, a = 1, alineacion = 0, emisivo = 0.25) {
    // Se recorre la cadena original por codigo de caracter: ni normalizacion,
    // ni toUpperCase, ni subcadenas. Cero asignaciones por fotograma.
    const s = typeof texto === 'string' ? texto : String(texto);
    const n = s.length;
    const av = this.fuente.avance * escala;
    const w = this.fuente.celdaAncho * escala;
    const h = this.fuente.celdaAlto * escala;
    const porCodigo = this.fuente.porCodigo;
    let cx = x - n * av * alineacion + av * 0.5;
    for (let i = 0; i < n; i++) {
      const codigo = s.charCodeAt(i);
      if (codigo !== 32) {
        const idx = porCodigo.get(codigo);
        if (idx !== undefined) this.lote.push(idx, cx, y, w, h, 0, r, g, b, a, emisivo, 0);
      }
      cx += av;
    }
    return cx - av * 0.5;
  }

  /** Texto multilínea con salto por '\n'. Devuelve el alto total. */
  textoMulti(lineas, x, y, escala, r, g, b, a, alineacion = 0, interlineado = 1.15) {
    const alto = this.fuente.celdaAlto * escala * interlineado;
    let cy = y;
    for (let i = 0; i < lineas.length; i++) {
      this.texto(lineas[i], x, cy, escala, r, g, b, a, alineacion);
      cy += alto;
    }
    return cy - y;
  }

  /** Panel de interfaz con esquinas redondeadas (nine-slice implícito). */
  panel(x, y, w, h, r = 1, g = 1, b = 1, a = 0.9) {
    this.lote.push(this.spritePanel, x, y, w, h, 0, r, g, b, a, 0, 0);
  }

  /** Rectángulo sólido (barras, fondos, fundidos). */
  rect(x, y, w, h, r, g, b, a, emisivo = 0) {
    this.lote.push(this.spriteBlanco, x, y, w, h, 0, r, g, b, a, emisivo, 0);
  }

  // ------------------------------------------------- recarga en caliente ----

  /** Recompila todos los shaders reimportando el módulo (modo depuración). */
  async recargarShaders() {
    const mod = await import(`./shaders.js?hr=${Date.now()}`);
    const gl = this.gl;
    const pares = [
      [this.lote.programa, mod.SPRITE_VS, mod.SPRITE_FS, null],
      [this.particulas.progUpdate, mod.PART_UPDATE_VS, mod.PART_UPDATE_FS, ['vPosVel', 'vVida', 'vParam', 'vColor']],
      [this.particulas.progRender, mod.PART_RENDER_VS, mod.PART_RENDER_FS, null],
      [this.luz.programa, mod.LUZ_VS, mod.LUZ_FS, null],
      [this.post.pCopia, mod.FULL_VS, mod.COPIA_FS, null],
      [this.post.pBrillo, mod.FULL_VS, mod.BRILLO_FS, null],
      [this.post.pDesenfoque, mod.FULL_VS, mod.DESENFOQUE_FS, null],
      [this.post.pSubir, mod.FULL_VS, mod.SUBIR_FS, null],
      [this.post.pPost, mod.FULL_VS, mod.POST_FS, null],
      [this.post.pLuz, mod.FULL_VS, mod.COMPONER_LUZ_FS, null],
      [this.parallax.programa, mod.FULL_VS, mod.PARALLAX_FS, null],
    ];
    const errores = [];
    for (const [prog, vs, fs, fb] of pares) {
      try { prog.compilar(vs, fs, fb); } catch (e) { errores.push(e.message); }
    }
    // Los VAO de partículas apuntan a locations fijas, no hace falta rehacerlos.
    return { ok: errores.length === 0, errores, version: mod.VERSION_SHADERS };
  }
}
