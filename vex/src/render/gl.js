// gl.js — Envoltura mínima de WebGL2: contexto, programas, texturas y FBOs.
// Sin dependencias. Todo lo que necesita el renderizador y nada más.

export function crearContexto(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    desynchronized: true,
  });
  if (!gl) throw new Error('WebGL2 no está disponible en este navegador.');
  gl.extColorFloat = gl.getExtension('EXT_color_buffer_float');
  gl.extFloatBlend = gl.getExtension('EXT_float_blend');
  gl.extAnisotropic = gl.getExtension('EXT_texture_filter_anisotropic');
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.STENCIL_TEST);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  return gl;
}

function compilar(gl, tipo, fuente, nombre) {
  const sh = gl.createShader(tipo);
  gl.shaderSource(sh, fuente);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const lineas = fuente.split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n');
    gl.deleteShader(sh);
    throw new Error(`Error compilando ${nombre} (${tipo === gl.VERTEX_SHADER ? 'vertex' : 'fragment'}):\n${log}\n${lineas}`);
  }
  return sh;
}

export class Program {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {string} vs  fuente del vertex shader
   * @param {string} fs  fuente del fragment shader
   * @param {string[]} [feedback] varyings para transform feedback
   */
  constructor(gl, vs, fs, nombre = 'programa', feedback = null) {
    this.gl = gl;
    this.nombre = nombre;
    this.uniforms = new Map();
    this.attribs = new Map();
    this.handle = null;
    this.compilar(vs, fs, feedback);
  }

  compilar(vs, fs, feedback = null) {
    const gl = this.gl;
    const v = compilar(gl, gl.VERTEX_SHADER, vs, this.nombre);
    const f = compilar(gl, gl.FRAGMENT_SHADER, fs, this.nombre);
    const p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f);
    if (feedback) gl.transformFeedbackVaryings(p, feedback, gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(p);
    gl.deleteShader(v); gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error(`Error enlazando ${this.nombre}: ${log}`);
    }
    if (this.handle) gl.deleteProgram(this.handle);
    this.handle = p;
    this.uniforms.clear();
    this.attribs.clear();
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) {
      const info = gl.getActiveUniform(p, i);
      const nombre = info.name.replace(/\[0\]$/, '');
      this.uniforms.set(nombre, gl.getUniformLocation(p, info.name));
    }
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) {
      const info = gl.getActiveAttrib(p, i);
      this.attribs.set(info.name, gl.getAttribLocation(p, info.name));
    }
    this._feedback = feedback;
    return this;
  }

  usar() { this.gl.useProgram(this.handle); return this; }
  loc(n) { const l = this.uniforms.get(n); return l === undefined ? null : l; }
  attr(n) { const a = this.attribs.get(n); return a === undefined ? -1 : a; }

  u1i(n, v) { const l = this.loc(n); if (l) this.gl.uniform1i(l, v); return this; }
  u1f(n, v) { const l = this.loc(n); if (l) this.gl.uniform1f(l, v); return this; }
  u2f(n, a, b) { const l = this.loc(n); if (l) this.gl.uniform2f(l, a, b); return this; }
  u3f(n, a, b, c) { const l = this.loc(n); if (l) this.gl.uniform3f(l, a, b, c); return this; }
  u4f(n, a, b, c, d) { const l = this.loc(n); if (l) this.gl.uniform4f(l, a, b, c, d); return this; }
  umat3(n, m) { const l = this.loc(n); if (l) this.gl.uniformMatrix3fv(l, false, m); return this; }
  u1fv(n, arr) { const l = this.loc(n); if (l) this.gl.uniform1fv(l, arr); return this; }
  u4fv(n, arr) { const l = this.loc(n); if (l) this.gl.uniform4fv(l, arr); return this; }

  tex(n, unidad, textura, target) {
    const gl = this.gl;
    const l = this.loc(n);
    if (!l) return this;
    gl.activeTexture(gl.TEXTURE0 + unidad);
    gl.bindTexture(target || gl.TEXTURE_2D, textura);
    gl.uniform1i(l, unidad);
    return this;
  }
}

export function crearTextura(gl, ancho, alto, opts = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  const internal = opts.internalFormat || gl.RGBA8;
  const format = opts.format || gl.RGBA;
  const type = opts.type || gl.UNSIGNED_BYTE;
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, ancho, alto, 0, format, type, opts.datos || null);
  const filtro = opts.nearest ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.mipmap ? gl.LINEAR_MIPMAP_LINEAR : filtro);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtro);
  const wrap = opts.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.bindTexture(gl.TEXTURE_2D, null);
  t.ancho = ancho; t.alto = alto;
  return t;
}

export function texturaDesdeCanvas(gl, canvas, opts = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  const filtro = opts.nearest ? gl.NEAREST : gl.LINEAR;
  if (opts.mipmap) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtro);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtro);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  t.ancho = canvas.width; t.alto = canvas.height;
  return t;
}

/** Framebuffer con una única textura de color. */
export class Objetivo {
  constructor(gl, ancho, alto, opts = {}) {
    this.gl = gl;
    this.opts = opts;
    this.fbo = gl.createFramebuffer();
    this.tex = null;
    this.ancho = 0; this.alto = 0;
    this.redimensionar(ancho, alto);
  }

  redimensionar(ancho, alto) {
    ancho = Math.max(1, ancho | 0); alto = Math.max(1, alto | 0);
    if (ancho === this.ancho && alto === this.alto) return this;
    const gl = this.gl;
    if (this.tex) gl.deleteTexture(this.tex);
    this.tex = crearTextura(gl, ancho, alto, this.opts);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    const estado = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (estado !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer incompleto (0x${estado.toString(16)}) a ${ancho}x${alto}`);
    }
    this.ancho = ancho; this.alto = alto;
    return this;
  }

  bind(limpiar = false, r = 0, g = 0, b = 0, a = 1) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.ancho, this.alto);
    if (limpiar) { gl.clearColor(r, g, b, a); gl.clear(gl.COLOR_BUFFER_BIT); }
    return this;
  }

  destruir() {
    const gl = this.gl;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.tex = null; this.fbo = null;
  }
}

export function bindPantalla(gl, ancho, alto, limpiar = false) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, ancho, alto);
  if (limpiar) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
}

/** VAO de un triángulo que cubre la pantalla (más barato que un quad). */
export function crearTrianguloPantalla(gl) {
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

export const MEZCLA = {
  normal(gl) { gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); },
  aditiva(gl) { gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE); },
  multiplicativa(gl) { gl.blendFunc(gl.DST_COLOR, gl.ZERO); },
  reemplazo(gl) { gl.blendFunc(gl.ONE, gl.ZERO); },
};
