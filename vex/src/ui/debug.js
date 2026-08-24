// debug.js — Superposición de depuración y utilidades de desarrollo.
// F1 estadísticas · F2 recarga de shaders en caliente · F3 repetición ·
// F4 paso a paso · F5 dibuja la geometría de sombras.

import { MASK } from '../game/components.js';

export class Depuracion {
  constructor(juego) {
    this.juego = juego;
    this.R = juego.R;
    this.visible = false;
    this.dibujarGeometria = false;
    this.mensaje = '';
    this.mensajeT = 0;
    this.historialFps = new Float32Array(120);
    this.historialSim = new Float32Array(120);
    this.cursor = 0;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', async (e) => {
      if (e.code === 'F1') { e.preventDefault(); this.visible = !this.visible; }
      else if (e.code === 'F2') {
        e.preventDefault();
        this.aviso('Recompilando shaders...');
        const res = await this.R.recargarShaders();
        this.aviso(res.ok ? `Shaders recargados (v${res.version})` : `Error: ${res.errores[0].slice(0, 90)}`);
      } else if (e.code === 'F3') {
        e.preventDefault();
        this.juego.reproducirRepeticion();
      } else if (e.code === 'F4') {
        e.preventDefault();
        this.juego.loop.pasoManual();
      } else if (e.code === 'F5') {
        e.preventDefault();
        this.dibujarGeometria = !this.dibujarGeometria;
        this.aviso(`Geometria de sombras: ${this.dibujarGeometria ? 'ON' : 'OFF'}`);
      }
    });
  }

  aviso(t) { this.mensaje = t; this.mensajeT = 3; }

  actualizar(dt) {
    this.mensajeT = Math.max(0, this.mensajeT - dt);
    const L = this.juego.loop;
    this.historialFps[this.cursor] = L.fps;
    this.historialSim[this.cursor] = L.msSim + L.msRender;
    this.cursor = (this.cursor + 1) % this.historialFps.length;
  }

  /** Geometría de oclusión, en la capa emisiva. */
  dibujarSegmentos() {
    if (!this.dibujarGeometria) return;
    const M = this.juego.mundo;
    if (!M.sala || !M.sala.segmentos) return;
    const segs = M.sala.segmentos.segs;
    const n = M.sala.segmentos.n;
    const lote = this.R.lote;
    const idx = this.R.idx('fx.haz');
    for (let i = 0; i < n; i++) {
      const x0 = segs[i * 4], y0 = segs[i * 4 + 1], x1 = segs[i * 4 + 2], y1 = segs[i * 4 + 3];
      const largo = Math.hypot(x1 - x0, y1 - y0);
      lote.push(idx, (x0 + x1) * 0.5, (y0 + y1) * 0.5, largo, 3, Math.atan2(y1 - y0, x1 - x0),
        0.2, 1, 0.4, 0.8, 1, 0);
    }
  }

  dibujar() {
    const R = this.R;
    const s = R.alto / 1080;
    if (this.mensajeT > 0) {
      R.texto(this.mensaje, R.ancho * 0.5, R.alto - 140 * s, 0.3 * s, 0.6, 1, 0.8, Math.min(1, this.mensajeT), 0.5);
    }

    const J = this.juego;
    if (J.settings.get('mostrarFps') && !this.visible) {
      R.texto(`${J.loop.fps.toFixed(0)} FPS`, R.ancho - 20 * s, R.alto - 20 * s, 0.26 * s, 0.6, 0.9, 0.8, 0.75, 1);
    }
    if (!this.visible) return;

    const M = J.mundo;
    const L = J.loop;
    const est = R.estadisticas;
    let media = 0, peor = 0;
    for (let i = 0; i < this.historialSim.length; i++) {
      media += this.historialSim[i];
      if (this.historialSim[i] > peor) peor = this.historialSim[i];
    }
    media /= this.historialSim.length;

    const lineas = [
      `FPS ${L.fps.toFixed(1)}  TICK ${L.tick}  ALPHA ${L.alpha.toFixed(2)}`,
      `CPU sim ${L.msSim.toFixed(2)} ms  render ${L.msRender.toFixed(2)} ms`,
      `CPU total medio ${media.toFixed(2)} ms  pico ${peor.toFixed(2)} ms`,
      `Entidades ${M.ent.count}/${M.ent.capacity}  enemigos ${M.estadisticas.enemigos}  proyectiles ${M.estadisticas.proyectiles}`,
      `Sprites ${est.sprites}  draw calls ${est.drawCalls}`,
      `Luces ${est.luces} (con sombra ${est.lucesSombra})  segmentos ${M.sala ? M.sala.segmentos.n : 0}`,
      `Particulas GPU ${R.particulas.max}  fx ${M.fx.pool.n}`,
      `Sala ${M.progresion.salaIndice + 1}/${M.progresion.salasTotales}  estado ${M.estadoSala}  oleada ${M.oleadaActual}`,
      `Semilla ${J.semillaActual}  checksum ${M.checksum().toString(16)}`,
      `Repeticion ${J.replay.grabando ? 'GRABANDO' : J.replay.reproduciendo ? `REPRODUCIENDO ${J.replay.cursor}/${J.replay.length}` : 'inactiva'}`,
      J.replay.reproduciendo ? `Desajustes ${J.replay.desajustes} (primero en tick ${J.replay.primerDesajuste})` : '',
      `Zoom ${M.camara.zoom.toFixed(2)}  trauma ${M.camara.trauma.toFixed(2)}  escalaT ${M.escalaTiempo.toFixed(2)}`,
      `F1 stats · F2 shaders · F3 repeticion · F4 paso · F5 geometria`,
    ];

    const x = 24 * s;
    let y = 200 * s;
    R.panel(x + 330 * s, y + lineas.length * 13 * s, 700 * s, (lineas.length * 26 + 30) * s, 1, 1, 1, 0.85);
    for (const l of lineas) {
      if (!l) continue;
      R.texto(l, x + 12 * s, y, 0.24 * s, 0.65, 1, 0.85, 0.95, 0);
      y += 26 * s;
    }

    // Gráfica de tiempos.
    const gx = x + 12 * s, gy = y + 20 * s, gw = 660 * s, gh = 60 * s;
    R.rect(gx + gw * 0.5, gy + gh * 0.5, gw, gh, 0.03, 0.05, 0.08, 0.9);
    const n = this.historialSim.length;
    for (let i = 0; i < n; i++) {
      const v = this.historialSim[(this.cursor + i) % n];
      const h = Math.min(gh, (v / 16.67) * gh);
      const rojo = v > 8 ? 1 : 0.3;
      R.rect(gx + (i / n) * gw, gy + gh - h * 0.5, gw / n - 1, h, rojo, 1 - rojo * 0.6, 0.5, 0.9, 0.3);
    }
    // Línea de 8 ms (el presupuesto).
    R.rect(gx + gw * 0.5, gy + gh - (8 / 16.67) * gh, gw, 1.5 * s, 1, 0.8, 0.2, 0.8, 0.5);
    R.texto('8 ms', gx + gw + 10 * s, gy + gh - (8 / 16.67) * gh, 0.2 * s, 1, 0.8, 0.3, 0.9, 0);
  }
}
