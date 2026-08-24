// broadphase.js — Rejilla espacial uniforme para consultas de proximidad.
//
// Se reconstruye cada tick con dos pasadas de conteo sobre arrays tipados: sin
// asignaciones, sin listas por celda, sin basura. Convierte el "cada proyectil
// contra cada enemigo" en unas pocas comprobaciones por celda.

export class Rejilla {
  constructor(capacidad, tamCelda = 96, maxCeldas = 8192) {
    this.tam = tamCelda;
    this.maxCeldas = maxCeldas;
    this.inicio = new Int32Array(maxCeldas + 1);
    this.datos = new Int32Array(capacidad);
    this.cursor = new Int32Array(maxCeldas);
    this.cuenta = new Int32Array(maxCeldas);
    this.n = 0;
    this.ancho = 1; this.alto = 1;
    this.originX = 0; this.originY = 0;
    this.resultado = new Int32Array(512);
  }

  configurar(minX, minY, maxX, maxY) {
    this.originX = minX; this.originY = minY;
    this.ancho = Math.max(1, Math.ceil((maxX - minX) / this.tam));
    this.alto = Math.max(1, Math.ceil((maxY - minY) / this.tam));
    if (this.ancho * this.alto > this.maxCeldas) {
      // Sala enorme: agranda la celda hasta que quepa.
      const factor = Math.sqrt((this.ancho * this.alto) / this.maxCeldas);
      this.tam = Math.ceil(this.tam * factor);
      this.ancho = Math.max(1, Math.ceil((maxX - minX) / this.tam));
      this.alto = Math.max(1, Math.ceil((maxY - minY) / this.tam));
    }
  }

  _celda(x, y) {
    let cx = ((x - this.originX) / this.tam) | 0;
    let cy = ((y - this.originY) / this.tam) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.ancho) cx = this.ancho - 1;
    if (cy < 0) cy = 0; else if (cy >= this.alto) cy = this.alto - 1;
    return cy * this.ancho + cx;
  }

  /** Reconstruye desde una lista de ids con posiciones en arrays externos. */
  construir(ids, cuantos, xs, ys) {
    const celdas = this.ancho * this.alto;
    this.cuenta.fill(0, 0, celdas);
    for (let i = 0; i < cuantos; i++) {
      this.cuenta[this._celda(xs[ids[i]], ys[ids[i]])]++;
    }
    let acumulado = 0;
    for (let c = 0; c < celdas; c++) {
      this.inicio[c] = acumulado;
      acumulado += this.cuenta[c];
      this.cursor[c] = this.inicio[c];
    }
    this.inicio[celdas] = acumulado;
    for (let i = 0; i < cuantos; i++) {
      const id = ids[i];
      const c = this._celda(xs[id], ys[id]);
      this.datos[this.cursor[c]++] = id;
    }
    this.n = cuantos;
  }

  /**
   * Rellena `resultado` con los ids cuyas celdas tocan el AABB dado.
   * Devuelve cuántos hay.
   */
  consultar(x, y, radio) {
    let n = 0;
    const cx0 = Math.max(0, ((x - radio - this.originX) / this.tam) | 0);
    const cx1 = Math.min(this.ancho - 1, ((x + radio - this.originX) / this.tam) | 0);
    const cy0 = Math.max(0, ((y - radio - this.originY) / this.tam) | 0);
    const cy1 = Math.min(this.alto - 1, ((y + radio - this.originY) / this.tam) | 0);
    const res = this.resultado;
    for (let cy = cy0; cy <= cy1; cy++) {
      const fila = cy * this.ancho;
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = fila + cx;
        const ini = this.inicio[c], fin = this.inicio[c + 1];
        for (let k = ini; k < fin; k++) {
          if (n >= res.length) return n;
          res[n++] = this.datos[k];
        }
      }
    }
    return n;
  }
}
