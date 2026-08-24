// physics.js — Colisión AABB por barrido contra el grid de tiles.
//
// Resolución por ejes separados (primero X, luego Y), que es lo que hace que
// las esquinas no enganchen y que las rampas se sientan bien. Todos los cuerpos
// del juego (jugador, enemigos, escombros) pasan por aquí.

import { TAM, T, esSolido, esUnaVia, esRampa, alturaRampa, esCinta, esFluido, VELOCIDAD_CINTA } from './tiles.js';

/** Resultado de un movimiento; se reutiliza para no asignar por frame. */
export class ResultadoMov {
  constructor() { this.reset(); }
  reset() {
    this.chocoX = 0;      // -1 izquierda, 1 derecha
    this.chocoY = 0;      // -1 techo, 1 suelo
    this.enSuelo = false;
    this.enRampa = false;
    this.pendiente = 0;
    this.cintaVel = 0;
    this.enFluido = false;
    this.tileDanino = 0;
    this.impactoY = 0;    // velocidad vertical en el momento de tocar suelo
  }
}

const MARGEN = 0.001;

export class Fisica {
  constructor() {
    this.sala = null;
    this.resultado = new ResultadoMov();
  }

  setSala(sala) { this.sala = sala; }

  tile(tx, ty) {
    const s = this.sala;
    if (!s) return T.VACIO;
    if (tx < 0 || ty < 0 || tx >= s.ancho || ty >= s.alto) return T.SOLIDO;
    return s.tiles[ty * s.ancho + tx];
  }

  solidoEn(tx, ty) { return esSolido(this.tile(tx, ty)); }

  /** ¿Hay bloqueo total en el punto de mundo (x,y)? Incluye rampas. */
  bloqueoPunto(x, y) {
    const tx = Math.floor(x / TAM), ty = Math.floor(y / TAM);
    const t = this.tile(tx, ty);
    if (esSolido(t)) return true;
    if (esRampa(t)) {
      const fx = (x - tx * TAM) / TAM;
      const superficie = ty * TAM + alturaRampa(t, fx);
      return y >= superficie;
    }
    return false;
  }

  /** Traza un rayo por el grid (DDA). Devuelve la distancia al primer bloqueo. */
  raycast(x0, y0, dx, dy, maxDist) {
    let t = 0;
    const paso = 4;
    while (t < maxDist) {
      const x = x0 + dx * t, y = y0 + dy * t;
      if (this.bloqueoPunto(x, y)) return t;
      t += paso;
    }
    return maxDist;
  }

  /**
   * Mueve un AABB (centro cx,cy con semiejes hw,hh) por (dx,dy) resolviendo
   * colisiones. Escribe el desenlace en `salida` y devuelve la nueva posición
   * a través de `pos` (Float32Array de 2).
   */
  mover(pos, cx, cy, hw, hh, dx, dy, opciones, salida) {
    const r = salida || this.resultado;
    r.reset();
    const atraviesaUnaVia = opciones && opciones.atraviesaUnaVia;
    const ignoraRampas = opciones && opciones.ignoraRampas;

    // ---- Eje X ----
    let nx = cx + dx;
    if (dx !== 0) {
      const dir = dx > 0 ? 1 : -1;
      const borde = nx + dir * hw;
      const txBorde = Math.floor(borde / TAM);
      const ty0 = Math.floor((cy - hh + MARGEN) / TAM);
      const ty1 = Math.floor((cy + hh - MARGEN) / TAM);
      const txInicio = Math.floor((cx + dir * hw) / TAM);
      for (let tx = txInicio; dir > 0 ? tx <= txBorde : tx >= txBorde; tx += dir) {
        let golpe = false;
        for (let ty = ty0; ty <= ty1; ty++) {
          const t = this.tile(tx, ty);
          if (esSolido(t)) { golpe = true; break; }
          if (!ignoraRampas && esRampa(t)) {
            // Una rampa sólo frena si su parte alta está por encima de los pies.
            const alturaBorde = ty * TAM + alturaRampa(t, dir > 0 ? 0 : 1);
            if (cy + hh - 2 > alturaBorde) { golpe = true; break; }
          }
        }
        if (golpe) {
          nx = tx * TAM + (dir > 0 ? -hw - MARGEN : TAM + hw + MARGEN);
          r.chocoX = dir;
          break;
        }
      }
    }

    // ---- Eje Y ----
    let ny = cy + dy;
    if (dy !== 0) {
      const dir = dy > 0 ? 1 : -1;
      const borde = ny + dir * hh;
      const tyBorde = Math.floor(borde / TAM);
      const tx0 = Math.floor((nx - hw + MARGEN) / TAM);
      const tx1 = Math.floor((nx + hw - MARGEN) / TAM);
      const tyInicio = Math.floor((cy + dir * hh) / TAM);
      for (let ty = tyInicio; dir > 0 ? ty <= tyBorde : ty >= tyBorde; ty += dir) {
        let golpe = false;
        for (let tx = tx0; tx <= tx1; tx++) {
          const t = this.tile(tx, ty);
          if (esSolido(t)) { golpe = true; break; }
          if (dir > 0 && esUnaVia(t) && !atraviesaUnaVia) {
            // Sólo bloquea si veníamos claramente por encima.
            const supTile = ty * TAM;
            if (cy + hh <= supTile + 6) { golpe = true; break; }
          }
        }
        if (golpe) {
          ny = ty * TAM + (dir > 0 ? -hh - MARGEN : TAM + hh + MARGEN);
          r.chocoY = dir;
          if (dir > 0) { r.enSuelo = true; r.impactoY = dy; }
          break;
        }
      }
    }

    // ---- Rampas: ajusta la altura si los pies están dentro de una ----
    if (!ignoraRampas) {
      const pieY = ny + hh;
      for (let k = -1; k <= 1; k++) {
        const px = nx + k * (hw - 2);
        const tx = Math.floor(px / TAM);
        const ty = Math.floor((pieY - 1) / TAM);
        const t = this.tile(tx, ty);
        if (!esRampa(t)) continue;
        const fx = (px - tx * TAM) / TAM;
        const superficie = ty * TAM + alturaRampa(t, fx);
        if (pieY >= superficie - 2 && pieY <= superficie + TAM * 0.75) {
          const nuevoY = superficie - hh - MARGEN;
          if (nuevoY < ny || dy >= 0) {
            if (dy >= 0 || nuevoY < ny) {
              ny = Math.min(ny, nuevoY);
              r.enSuelo = true;
              r.enRampa = true;
              r.pendiente = t === T.RAMPA_DER ? -1 : 1;
              if (r.chocoY === 0) { r.chocoY = 1; r.impactoY = dy; }
            }
          }
        }
      }
    }

    // ---- Consultas de entorno bajo los pies y dentro del cuerpo ----
    const pieTy = Math.floor((ny + hh + 1) / TAM);
    for (let tx = Math.floor((nx - hw + 2) / TAM); tx <= Math.floor((nx + hw - 2) / TAM); tx++) {
      const t = this.tile(tx, pieTy);
      if (esCinta(t) && r.enSuelo) r.cintaVel = t === T.CINTA_DER ? VELOCIDAD_CINTA : -VELOCIDAD_CINTA;
    }
    const cTx = Math.floor(nx / TAM);
    const cTy0 = Math.floor((ny - hh + 4) / TAM);
    const cTy1 = Math.floor((ny + hh - 4) / TAM);
    for (let ty = cTy0; ty <= cTy1; ty++) {
      const t = this.tile(cTx, ty);
      if (esFluido(t)) r.enFluido = true;
      if (t === T.PINCHO_ARRIBA || t === T.PINCHO_ABAJO) r.tileDanino = t;
    }
    // Pinchos también bajo los pies y sobre la cabeza.
    for (let tx = Math.floor((nx - hw + 4) / TAM); tx <= Math.floor((nx + hw - 4) / TAM); tx++) {
      if (this.tile(tx, pieTy) === T.PINCHO_ARRIBA) r.tileDanino = T.PINCHO_ARRIBA;
      if (this.tile(tx, Math.floor((ny - hh - 1) / TAM)) === T.PINCHO_ABAJO) r.tileDanino = T.PINCHO_ABAJO;
    }

    pos[0] = nx; pos[1] = ny;
    return r;
  }

  /** ¿Está el AABB apoyado en algo? Útil para coyote time y para la IA. */
  haySueloBajo(cx, cy, hw, hh, margen = 2) {
    const ty = Math.floor((cy + hh + margen) / TAM);
    for (let tx = Math.floor((cx - hw + 2) / TAM); tx <= Math.floor((cx + hw - 2) / TAM); tx++) {
      const t = this.tile(tx, ty);
      if (esSolido(t) || esUnaVia(t) || esRampa(t)) return true;
    }
    return false;
  }

  /** Comprueba si un AABB solapa geometría sólida (para telefragging y spawn). */
  solapaSolido(cx, cy, hw, hh) {
    const tx0 = Math.floor((cx - hw) / TAM), tx1 = Math.floor((cx + hw) / TAM);
    const ty0 = Math.floor((cy - hh) / TAM), ty1 = Math.floor((cy + hh) / TAM);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (esSolido(this.tile(tx, ty))) return true;
        if (esRampa(this.tile(tx, ty))) return true;
      }
    }
    return false;
  }
}
