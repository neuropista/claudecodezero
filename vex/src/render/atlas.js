// atlas.js — Empaquetador de atlas generado en tiempo de ejecución.
//
// No hay ni un solo archivo de imagen en el proyecto: cada sprite se dibuja con
// Canvas2D procedural y se empaqueta aquí en una única textura, de modo que
// todos los sprites del juego caben en una sola llamada de dibujo.

const PADDING = 2;

export class Atlas {
  constructor(tam = 2048) {
    this.tam = tam;
    this.pendientes = [];
    this.indices = new Map();     // nombre -> índice
    this.nombres = [];
    this.uv = null;               // Float32Array [u0,v0,u1,v1] por sprite
    this.tam2d = null;            // Float32Array [ancho,alto] en píxeles por sprite
    this.pivote = null;           // Float32Array [px,py] normalizado (0.5,0.5 por defecto)
    this.canvas = null;
    this.construido = false;
  }

  /**
   * Encola un sprite. `dibujar(ctx, w, h, rng)` recibe un contexto ya trasladado
   * al origen de la celda.
   */
  add(nombre, ancho, alto, dibujar, pivoteX = 0.5, pivoteY = 0.5) {
    if (this.indices.has(nombre)) throw new Error(`Sprite duplicado en el atlas: ${nombre}`);
    const idx = this.pendientes.length;
    this.indices.set(nombre, idx);
    this.nombres.push(nombre);
    this.pendientes.push({ nombre, ancho: Math.ceil(ancho), alto: Math.ceil(alto), dibujar, pivoteX, pivoteY, idx });
    return idx;
  }

  /** Encola una tira de fotogramas y devuelve el índice del primero. */
  addTira(nombre, cuadros, ancho, alto, dibujar, pivoteX = 0.5, pivoteY = 0.5) {
    let primero = -1;
    for (let i = 0; i < cuadros; i++) {
      const id = this.add(`${nombre}.${i}`, ancho, alto, (ctx, w, h, rng) => dibujar(ctx, w, h, i, cuadros, rng), pivoteX, pivoteY);
      if (i === 0) primero = id;
    }
    return primero;
  }

  indice(nombre) {
    const i = this.indices.get(nombre);
    if (i === undefined) throw new Error(`Sprite inexistente en el atlas: ${nombre}`);
    return i;
  }

  /** Empaqueta con un algoritmo de estanterías y ejecuta todos los dibujos. */
  construir(rng) {
    const items = this.pendientes.slice().sort((a, b) => b.alto - a.alto || b.ancho - a.ancho);
    let x = PADDING, y = PADDING, alturaFila = 0;
    for (const it of items) {
      const w = it.ancho + PADDING, h = it.alto + PADDING;
      if (x + w > this.tam) { x = PADDING; y += alturaFila; alturaFila = 0; }
      if (y + h > this.tam) throw new Error(`El atlas de ${this.tam}px se ha quedado sin espacio en "${it.nombre}".`);
      it.x = x; it.y = y;
      x += w;
      if (h > alturaFila) alturaFila = h;
    }
    this.alturaUsada = y + alturaFila;

    const canvas = document.createElement('canvas');
    canvas.width = this.tam; canvas.height = this.tam;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    ctx.clearRect(0, 0, this.tam, this.tam);

    const n = this.pendientes.length;
    this.uv = new Float32Array(n * 4);
    this.tam2d = new Float32Array(n * 2);
    this.pivote = new Float32Array(n * 2);

    const inv = 1 / this.tam;
    for (const it of items) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(it.x, it.y, it.ancho, it.alto);
      ctx.clip();
      ctx.translate(it.x, it.y);
      it.dibujar(ctx, it.ancho, it.alto, rng);
      ctx.restore();

      const i4 = it.idx * 4;
      // Medio téxel de margen: evita el sangrado del vecino con filtrado lineal.
      this.uv[i4 + 0] = (it.x + 0.5) * inv;
      this.uv[i4 + 1] = (it.y + 0.5) * inv;
      this.uv[i4 + 2] = (it.x + it.ancho - 0.5) * inv;
      this.uv[i4 + 3] = (it.y + it.alto - 0.5) * inv;
      this.tam2d[it.idx * 2] = it.ancho;
      this.tam2d[it.idx * 2 + 1] = it.alto;
      this.pivote[it.idx * 2] = it.pivoteX;
      this.pivote[it.idx * 2 + 1] = it.pivoteY;
    }

    this.canvas = canvas;
    this.construido = true;
    return canvas;
  }

  ocupacion() {
    let usado = 0;
    for (const it of this.pendientes) usado += it.ancho * it.alto;
    return usado / (this.tam * this.tam);
  }
}

// --- Ayudas de dibujo compartidas por todo el arte procedural --------------

/** Gradiente lineal rápido a partir de una lista de paradas [t, color]. */
export function grad(ctx, x0, y0, x1, y1, paradas) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c] of paradas) g.addColorStop(t, c);
  return g;
}

export function gradRadial(ctx, x, y, r0, r1, paradas) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [t, c] of paradas) g.addColorStop(t, c);
  return g;
}

/** Halo suave centrado; base de casi todo lo que brilla en el juego. */
export function halo(ctx, x, y, r, color, alfa = 1) {
  ctx.fillStyle = gradRadial(ctx, x, y, 0, r, [
    [0, `rgba(${color},${alfa})`],
    [0.35, `rgba(${color},${alfa * 0.45})`],
    [1, `rgba(${color},0)`],
  ]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Polígono cerrado a partir de pares de coordenadas. */
export function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

/** Ruido granulado sobre la celda actual (da textura a los tiles). */
export function granular(ctx, w, h, rng, cantidad = 0.08, escala = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  const paso = Math.max(1, escala | 0);
  for (let y = 0; y < h; y += paso) {
    for (let x = 0; x < w; x += paso) {
      const v = rng.float();
      if (v > 1 - cantidad * 2) {
        ctx.fillStyle = v > 1 - cantidad ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.22)';
        ctx.fillRect(x, y, paso, paso);
      }
    }
  }
  ctx.restore();
}

/** Rectángulo con esquinas redondeadas (sin depender de roundRect). */
export function rectRedondo(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
