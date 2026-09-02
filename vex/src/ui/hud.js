// hud.js — Interfaz de juego: integridad, energía, arma, oleadas y avisos.
// Se dibuja en coordenadas de pantalla, dentro de la cadena de post-proceso,
// para que comparta el grano y la curvatura con el resto de la imagen.

import { LISTA_MODULOS, MAX_EQUIPADOS } from '../game/weapons.js';
import { MASK, TIPO } from '../game/components.js';
import { TIPO_SALA } from '../game/level.js';
import { BIOMAS } from '../game/progression.js';
import { ESTADO } from '../game/player.js';
import { clamp, lerp } from '../core/math.js';
import { Memo, entero } from './textcache.js';

export class Hud {
  constructor(mundo) {
    this.mundo = mundo;
    this.R = mundo.R;
    this.vidaMostrada = 1;
    this.vidaRetardo = 1;
    this.jefeMostrado = 0;
    this.pulso = 0;
    // Textos memorizados: se reconstruyen sólo cuando cambia su contenido.
    this.txtSector = new Memo((a, b) => `SECTOR ${a} / ${b}`);
    this.txtOleada = new Memo((a, b, c) => `OLEADA ${a}/${b}  ·  ${c} HOSTILES`);
    this.txtCombo = new Memo((a) => `x${a}`);
  }

  actualizar(dt) {
    this.dt = dt;
    const M = this.mundo;
    const j = M.jugador;
    if (j.id < 0) return;
    const frac = j.vida / M.ent.vidaMax[j.id];
    this.vidaMostrada = lerp(this.vidaMostrada, frac, 1 - Math.exp(-16 * dt));
    // La barra "fantasma" baja más lento: se ve cuánto acabas de perder.
    this.vidaRetardo = this.vidaRetardo > frac
      ? lerp(this.vidaRetardo, frac, 1 - Math.exp(-3.2 * dt))
      : this.vidaMostrada;
    this.pulso += dt;
  }

  dibujar() {
    const M = this.mundo;
    const R = this.R;
    const j = M.jugador;
    if (j.id < 0 || !M.sala) return;
    const s = R.alto / 1080;
    const lote = R.lote;
    const blanco = R.spriteBlanco;

    // ---- Integridad ----
    // Ojo con los margenes: el texto se dibuja centrado en su Y, asi que la
    // primera linea necesita al menos media celda de aire por arriba.
    const bx = 46 * s, by = 74 * s;
    const bw = 420 * s, bh = 26 * s;
    R.panel(bx + bw * 0.5, by + bh * 0.5, bw + 18 * s, bh + 20 * s, 1, 1, 1, 0.82);
    lote.push(blanco, bx + bw * 0.5, by + bh * 0.5, bw, bh, 0, 0.06, 0.08, 0.12, 1, 0, 0);
    // Fantasma del daño reciente.
    lote.push(blanco, bx + bw * this.vidaRetardo * 0.5, by + bh * 0.5, bw * this.vidaRetardo, bh, 0,
      0.8, 0.25, 0.3, 0.65, 0.1, 0);
    const f = this.vidaMostrada;
    const critico = f < 0.3;
    const pulso = critico ? 0.75 + 0.25 * Math.sin(this.pulso * 9) : 1;
    lote.push(blanco, bx + bw * f * 0.5, by + bh * 0.5, bw * f, bh, 0,
      critico ? 1 : 0.35, critico ? 0.3 : 0.95, critico ? 0.35 : 0.85, pulso, 0.55, 0);
    R.texto('INTEGRIDAD', bx + 2 * s, by - 30 * s, 0.32 * s, 0.6, 0.85, 1, 0.9, 0);
    R.texto(entero(Math.ceil(j.vida)), bx + bw + 26 * s, by + bh * 0.5, 0.44 * s,
      critico ? 1 : 0.85, critico ? 0.4 : 0.95, critico ? 0.4 : 1, 1, 0);

    // ---- Energía / dash ----
    const ey = by + 44 * s;
    const ew = 300 * s, eh = 12 * s;
    lote.push(blanco, bx + ew * 0.5, ey, ew, eh, 0, 0.05, 0.07, 0.11, 0.9, 0, 0);
    const ef = clamp(j.energia / 100, 0, 1);
    lote.push(blanco, bx + ew * ef * 0.5, ey, ew * ef, eh, 0, 0.4, 0.75, 1, 0.95, 0.4, 0);
    // Estado del dash como bloque aparte.
    const dashListo = j.dashCd <= 0 && j.dashDisponible;
    const dx = bx + ew + 30 * s;
    lote.push(blanco, dx + 26 * s, ey, 52 * s, 16 * s, 0,
      dashListo ? 0.45 : 0.2, dashListo ? 0.9 : 0.3, dashListo ? 1 : 0.4, 0.95, dashListo ? 0.6 : 0, 0);
    R.texto('DASH', dx + 26 * s, ey - 26 * s, 0.26 * s, 0.6, 0.85, 1, dashListo ? 1 : 0.4, 0.5);

    // ---- Módulos equipados ----
    this._modulos(s);

    // ---- Progreso ----
    this._progreso(s);

    // ---- Jefe ----
    this._jefe(s);

    // ---- Combo ----
    if (j.combo > 2) {
      const a = clamp(j.comboT / 3.2, 0, 1);
      R.texto(this.txtCombo.get(j.combo), R.ancho - 60 * s, 150 * s, 0.9 * s, 1, 0.8, 0.35, a, 1, 0.6);
      R.texto('CADENA', R.ancho - 60 * s, 200 * s, 0.3 * s, 1, 0.75, 0.4, a * 0.8, 1);
    }

    // ---- Carga del arma ----
    // Se dibuja pegada al bloque de módulos: es una propiedad del arma, no del
    // personaje, y conviene que se lea junto a lo que la modifica.
    {
      const cx = 58 * s + 68 * s;
      const cy = R.alto - 92 * s - 52 * s;
      const w = 190 * s;
      const c = clamp(M.arma.carga, 0, 1);
      const listo = c >= 1;
      const pul = listo ? 0.75 + 0.25 * Math.sin(this.pulso * 10) : 1;
      // Carril visible aunque esté vacío: si no, con la carga a cero el
      // indicador desaparecía del todo y no se aprendía que existe.
      lote.push(blanco, cx, cy, w + 2 * s, 8 * s, 0, 0.35, 0.55, 0.7, 0.35, 0.1, 0);
      lote.push(blanco, cx, cy, w, 6 * s, 0, 0.04, 0.07, 0.11, 1, 0, 0);
      if (c > 0.001) {
        lote.push(blanco, cx - w * 0.5 + w * c * 0.5, cy, w * c, 6 * s, 0,
          listo ? 1 : 0.45, listo ? 0.95 : 0.8, listo ? 0.7 : 1, pul, listo ? 0.8 : 0.3, 0);
      }
      R.texto(listo ? 'DISPARO CARGADO' : 'CARGA', cx, cy - 20 * s, 0.24 * s,
        listo ? 1 : 0.5, listo ? 0.95 : 0.7, listo ? 0.7 : 0.85, listo ? pul : 0.6, 0.5);
    }

    // ---- Sobrecalentamiento ----
    if (M.arma.calor > 0.35) {
      const w = 180 * s;
      const cy = R.alto - 42 * s;
      const cx = R.ancho * 0.5;
      lote.push(blanco, cx, cy, w, 8 * s, 0, 0.06, 0.05, 0.05, 0.85, 0, 0);
      const c = clamp(M.arma.calor / 1.2, 0, 1);
      lote.push(blanco, cx - w * 0.5 + w * c * 0.5, cy, w * c, 8 * s, 0,
        1, lerp(0.8, 0.2, c), 0.2, 1, 0.5, 0);
      if (M.arma.sobrecalentada) {
        R.texto('SOBRECALENTADO', cx, cy - 26 * s, 0.32 * s, 1, 0.45, 0.3,
          0.6 + 0.4 * Math.sin(this.pulso * 12), 0.5);
      }
    }

    // ---- Cartel central ----
    this._cartel(s);
  }

  _modulos(s) {
    const R = this.R;
    const M = this.mundo;
    const arma = M.arma;
    const lote = R.lote;
    const y = R.alto - 92 * s;
    const paso = 68 * s;
    const x0 = 58 * s;

    for (let i = 0; i < MAX_EQUIPADOS; i++) {
      const cx = x0 + i * paso;
      const bit = arma.equipados[i];
      const activo = bit !== undefined;
      const seleccionado = i === (arma.ranuraActiva || 0);
      R.panel(cx, y, 56 * s, 56 * s, 1, 1, 1, seleccionado ? 0.95 : 0.7);
      if (activo) {
        const idx = this._iconoDe(bit);
        lote.push(idx, cx, y, 34 * s, 34 * s, 0, 1, 1, 1, 1, 0.6, 0);
      } else {
        R.texto('-', cx, y, 0.4 * s, 0.4, 0.5, 0.6, 0.6, 0.5);
      }
      if (seleccionado) {
        lote.push(R.spriteBlanco, cx, y + 33 * s, 40 * s, 3 * s, 0, 0.4, 0.9, 1, 0.9, 0.7, 0);
      }
    }
    R.texto(arma.etiqueta(), x0 - 28 * s, y + 54 * s, 0.26 * s, 0.65, 0.85, 1, 0.8, 0);
    R.texto('[Q] CAMBIAR MODULO', x0 - 28 * s, y - 54 * s, 0.24 * s, 0.5, 0.7, 0.85, 0.65, 0);
  }

  /** Sprite del icono de un modulo, resuelto una sola vez por bit. */
  _iconoDe(bit) {
    if (!this._iconos) {
      this._iconos = new Map();
      for (const m of LISTA_MODULOS) this._iconos.set(m.bit, this.R.idx(`ui.iconoGlow.${m.clave}`));
    }
    return this._iconos.get(bit);
  }

  _progreso(s) {
    const R = this.R;
    const M = this.mundo;
    const prog = M.progresion;
    const x = R.ancho - 46 * s;
    R.texto(BIOMAS[prog.bioma].nombre, x, 46 * s, 0.36 * s, 0.7, 0.9, 1, 0.9, 1);
    R.texto(this.txtSector.get(prog.salaIndice + 1, prog.salasTotales), x, 82 * s, 0.28 * s, 0.55, 0.75, 0.95, 0.75, 1);

    // Marcas de sala.
    const lote = R.lote;
    const n = Math.min(prog.salasTotales, 26);
    const w = 8 * s, sep = 12 * s;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor((i / n) * prog.salasTotales);
      const hecho = idx < prog.salaIndice;
      const actual = idx === prog.salaIndice;
      lote.push(R.spriteBlanco, x - (n - 1 - i) * sep, 106 * s, w, actual ? 12 * s : 6 * s, 0,
        actual ? 1 : hecho ? 0.4 : 0.2, actual ? 0.9 : hecho ? 0.75 : 0.3, actual ? 0.5 : hecho ? 0.95 : 0.4,
        actual ? 1 : 0.8, actual ? 0.7 : 0.1, 0);
    }

    if (M.estadoSala === 1 && M.sala.oleadas.length > 0) {
      R.texto(this.txtOleada.get(M.oleadaActual, M.sala.oleadas.length, M.estadisticas.enemigos),
        x, 138 * s, 0.28 * s, 1, 0.55, 0.5, 0.9, 1);
    }
  }

  _jefe(s) {
    const M = this.mundo;
    const R = this.R;
    const S = M.ent;
    let jefe = -1;
    for (let i = 0; i < S.count; i++) {
      const e = S.dense[i];
      if (S.alive[e] === 1 && (S.mask[e] & MASK.JEFE)) { jefe = e; break; }
    }
    if (jefe < 0) { this.jefeMostrado = lerp(this.jefeMostrado, 0, 1 - Math.exp(-6 * (this.dt || 1 / 60))); return; }
    const frac = S.vida[jefe] / S.vidaMax[jefe];
    // Independiente del framerate: con lerp fijo la barra tardaba en llenarse
    // en maquinas lentas y se llenaba de golpe en las rapidas.
    this.jefeMostrado = lerp(this.jefeMostrado, frac, 1 - Math.exp(-9 * (this.dt || 1 / 60)));

    const w = R.ancho * 0.52, h = 20 * s;
    const cx = R.ancho * 0.5, cy = R.alto - 176 * s;
    const lote = R.lote;
    R.panel(cx, cy, w + 20 * s, h + 22 * s, 1, 1, 1, 0.8);
    lote.push(R.spriteBlanco, cx, cy, w, h, 0, 0.08, 0.03, 0.06, 1, 0, 0);
    lote.push(R.spriteBlanco, cx - w * 0.5 + w * this.jefeMostrado * 0.5, cy, w * this.jefeMostrado, h, 0,
      1, 0.25, 0.4, 1, 0.35, 0);
    // Marcas de fase.
    for (let k = 1; k < 3; k++) {
      lote.push(R.spriteBlanco, cx - w * 0.5 + w * (k / 3), cy, 2 * s, h, 0, 0, 0, 0, 0.9, 0, 0);
    }
    R.texto('FRAGMENTO PRIMARIO', cx, cy - 38 * s, 0.32 * s, 1, 0.6, 0.65, 0.95, 0.5);
  }

  _cartel(s) {
    const M = this.mundo;
    const R = this.R;
    if (M.mensajeT <= 0) return;
    const a = clamp(M.mensajeT > 0.4 ? 1 : M.mensajeT / 0.4, 0, 1);
    const subida = clamp((2.6 - M.mensajeT) * 6, 0, 1);
    const y = R.alto * 0.26 + (1 - subida) * 18 * s;
    R.texto(M.mensaje, R.ancho * 0.5, y, 0.72 * s, 0.85, 0.97, 1, a, 0.5, 0.4);
    if (M.mensajeSub) {
      R.texto(M.mensajeSub, R.ancho * 0.5, y + 52 * s, 0.32 * s, 0.6, 0.8, 0.95, a * 0.9, 0.5);
    }
  }

  /** Retícula de apuntado, sólo con ratón. */
  cursor(input) {
    if (!input.usaRaton || !input.mouseEnCanvas) return;
    const R = this.R;
    const s = R.alto / 1080;
    const dpr = R.canvas.width / R.canvas.clientWidth;
    const x = input.mouseX, y = input.mouseY;
    const listo = this.mundo.arma.listo;
    R.lote.push(R.idx('ui.cursor'), x, y, 40 * s, 40 * s, this.pulso * 0.8,
      listo ? 0.5 : 1, listo ? 0.9 : 0.4, listo ? 1 : 0.4, 0.9, 0.8, 0);
  }
}
