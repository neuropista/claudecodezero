// draw.js — Dibuja el estado del mundo. No modifica nada de la simulación.
//
// Separa con cuidado dos capas: la iluminable (tiles, cuerpos, enemigos) y la
// emisiva (proyectiles, arcos, rayos, partículas), que se suma por encima de la
// luz para que lo que brilla brille de verdad.

import { MASK, TIPO, FLAG, ELITE } from './components.js';
import { STATS, puntoDebil } from './enemies.js';
import { TAM, T } from './tiles.js';
import { ESTADO, P } from './player.js';
import { TIPO_SALA } from './level.js';
import { PALETAS_BIOMA } from '../render/spriteart.js';
import { ZONA } from './fx.js';
import { clamp, lerp, TAU } from '../core/math.js';
import { cosmeticRng as CR } from '../core/rng.js';

/** Color de cada modificador de élite, para que se distingan de un vistazo. */
const TINTE_ELITE = [
  [0.65, 0.88, 1.25],   // blindado
  [1.35, 1.15, 0.45],   // veloz
  [1.35, 0.7, 0.3],     // volatil
  [0.5, 1.3, 0.7],      // regenerador
];

export class Dibujante {
  constructor(mundo) {
    this.mundo = mundo;
    this.R = mundo.R;
    this.cacheBioma = -1;
    this.tiles = null;
    this.tiempoAmbiente = 0;
  }

  _cacheTiles(bioma) {
    if (this.cacheBioma === bioma) return;
    const R = this.R;
    this.tiles = {
      cuerpo: [0, 1, 2, 3].map((v) => R.idx(`tile.${bioma}.cuerpo.${v}`)),
      tapa: [0, 1].map((v) => R.idx(`tile.${bioma}.tapa.${v}`)),
      plataforma: R.idx(`tile.${bioma}.plataforma`),
      rampaDer: R.idx(`tile.${bioma}.rampaDer`),
      rampaIzq: R.idx(`tile.${bioma}.rampaIzq`),
      fondo: R.idx(`tile.${bioma}.fondo`),
      cinta: R.idx('tile.cinta.0'),
      gel: R.idx('tile.gel.0'),
      gelTapa: R.idx('tile.gelTapa.0'),
      pincho: R.idx('tile.pincho'),
      fragil: R.idx('tile.fragil.0'),
      puerta: R.idx('prop.puerta.0'),
      terminal: R.idx('prop.terminal.0'),
      haz: R.idx('fx.haz'),
      eslabon: R.idx('fx.eslabon'),
      ancla: R.idx('fx.ancla'),
      suave: R.idx('fx.suave'),
      blanco: R.idx('fx.blanco'),
      emisor: R.idx('prop.emisor.0'),
      canon: R.idx('enem.canon'),
    };
    this.cacheBioma = bioma;
  }

  // ------------------------------------------------------- capa iluminada --

  mundoIluminado(alpha, dt) {
    const M = this.mundo;
    const R = this.R;
    const sala = M.sala;
    if (!sala) return;
    this._cacheTiles(sala.bioma);
    this.tiempoAmbiente += dt;

    const v = R.vistaMundo;
    const tx0 = Math.max(0, Math.floor(v[0] / TAM));
    const ty0 = Math.max(0, Math.floor(v[1] / TAM));
    const tx1 = Math.min(sala.ancho - 1, Math.ceil(v[2] / TAM));
    const ty1 = Math.min(sala.alto - 1, Math.ceil(v[3] / TAM));
    const Tl = this.tiles;
    const lote = R.lote;

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = sala.tiles[ty * sala.ancho + tx];
        if (t === T.VACIO) continue;
        const x = tx * TAM + TAM * 0.5;
        const y = ty * TAM + TAM * 0.5;
        const varia = sala.variante[ty * sala.ancho + tx];
        switch (t) {
          case T.SOLIDO: {
            const arriba = sala.get(tx, ty - 1);
            const descubierto = arriba === T.VACIO || arriba === T.PLATAFORMA || arriba === T.GEL;
            const idx = descubierto ? Tl.tapa[varia & 1] : Tl.cuerpo[varia & 3];
            lote.push(idx, x, y, TAM, TAM, 0, 1, 1, 1, 1, descubierto ? 0.08 : 0, 0);
            break;
          }
          case T.PLATAFORMA:
            lote.push(Tl.plataforma, x, ty * TAM + 7, TAM, 14, 0, 1, 1, 1, 1, 0.12, 0);
            break;
          case T.RAMPA_DER:
            lote.push(Tl.rampaDer, x, y, TAM, TAM, 0, 1, 1, 1, 1, 0.06, 0);
            break;
          case T.RAMPA_IZQ:
            lote.push(Tl.rampaIzq, x, y, TAM, TAM, 0, 1, 1, 1, 1, 0.06, 0);
            break;
          case T.PINCHO_ARRIBA:
            lote.push(Tl.pincho, x, ty * TAM + TAM - 10, TAM, 20, 0, 1, 1, 1, 1, 0.05, 0);
            break;
          case T.PINCHO_ABAJO:
            lote.push(Tl.pincho, x, ty * TAM + 10, TAM, 20, Math.PI, 1, 1, 1, 1, 0.05, 0);
            break;
          case T.CINTA_DER:
          case T.CINTA_IZQ: {
            const f = Math.floor(this.tiempoAmbiente * 14) % 8;
            const dir = t === T.CINTA_DER ? 1 : -1;
            lote.push(Tl.cuerpo[varia & 3], x, y, TAM, TAM, 0, 1, 1, 1, 1, 0, 0);
            lote.push(Tl.cinta + (dir > 0 ? f : 7 - f), x, ty * TAM + 8, TAM, 16, 0, 1, 1, 1, 1, 0.25, 0);
            break;
          }
          case T.GEL: {
            const f = Math.floor(this.tiempoAmbiente * 7) % 6;
            const arriba = sala.get(tx, ty - 1);
            lote.push(Tl.gel + f, x, y, TAM, TAM, 0, 1, 1, 1, 0.85, 0.14, 0);
            if (arriba !== T.GEL) lote.push(Tl.gelTapa + f, x, ty * TAM + 6, TAM, 12, 0, 1, 1, 1, 1, 0.3, 0);
            break;
          }
          case T.FRAGIL:
            lote.push(Tl.fragil, x, y, TAM, TAM, 0, 1, 1, 1, 1, 0.04, 0);
            break;
          default: break;
        }
      }
    }

    this._puertas(lote, sala);
    this._props(lote, sala);
    this._entidades(lote, alpha);
    this._plataformasMoviles(lote);
    this._jugador(lote, alpha);
  }

  _puertas(lote, sala) {
    const Tl = this.tiles;
    for (let i = 0; i < sala.puertas.length; i++) {
      const p = sala.puertas[i];
      const f = Math.min(5, Math.floor(p.animacion * 5.99));
      lote.push(Tl.puerta + f, p.x + 20, p.y + 48, 52, 104, 0, 1, 1, 1, 1, 0.25, 0);
    }
  }

  _props(lote, sala) {
    const Tl = this.tiles;
    const M = this.mundo;
    for (let i = 0; i < sala.props.length; i++) {
      const p = sala.props[i];
      if (p.tipo === 'terminal') {
        const f = Math.floor(this.tiempoAmbiente * 6) % 6;
        lote.push(Tl.terminal + f, p.x, p.y - 28, 40, 56, 0, 1, 1, 1, 1, 0.3, 0);
      } else if (p.tipo === 'laser') {
        const f = Math.floor(this.tiempoAmbiente * 8) % 4;
        lote.push(Tl.emisor + f, p.x, p.y - 8, 24, 24, 0, 1, 1, 1, 1, 0.2, 0);
      }
    }
  }

  _plataformasMoviles(lote) {
    const Tl = this.tiles;
    const plats = this.mundo.trampas.plataformas;
    for (let i = 0; i < plats.length; i++) {
      const p = plats[i];
      lote.push(Tl.plataforma, p.x + p.ancho * 0.5, p.y, p.ancho, p.alto + 4, 0, 1, 1, 1, 1, 0.15, 0);
    }
  }

  _entidades(lote, alpha) {
    const M = this.mundo;
    const S = M.ent;
    const v = this.R.vistaMundo;
    for (let i = 0; i < S.count; i++) {
      const e = S.dense[i];
      if (S.alive[e] !== 1) continue;
      const m = S.mask[e];
      if ((m & MASK.SPRITE) === 0) continue;
      if (m & MASK.JUGADOR) continue;
      if (m & MASK.EMISIVO) continue;      // se dibuja en la capa aditiva

      const x = lerp(S.px[e], S.x[e], alpha);
      const y = lerp(S.py[e], S.y[e], alpha);
      if (x < v[0] || x > v[2] || y < v[1] || y > v[3]) continue;

      const cuadros = S.cuadros[e] || 1;
      const f = cuadros > 1 ? (Math.floor(S.anim[e]) % cuadros + cuadros) % cuadros : 0;
      const idx = S.sprite[e] + f;
      const t = this.R.atlas.tam2d;
      const w = t[idx * 2] * S.escala[e];
      const h = t[idx * 2 + 1] * S.escala[e];
      const flash = S.flash[e];
      const elite = (S.flags[e] & FLAG.ELITE) !== 0;
      // El espejo se orienta hacia el jugador en vez de voltearse: su placa
      // tiene que apuntar exactamente adonde va a rebotar el disparo.
      const rotado = S.tipo[e] === TIPO.ESPEJO;
      const espejo = rotado ? 1 : (S.facing[e] < 0 ? -1 : 1);
      const rot = rotado ? S.angulo[e] : 0;

      let tr = 1, tg = 1, tb = 1;
      if (elite) {
        const tinte = TINTE_ELITE[S.variante[e]] || TINTE_ELITE[0];
        tr = tinte[0]; tg = tinte[1]; tb = tinte[2];
      }
      // Aturdido: se lava a blanco para que la ventana de castigo se vea sola.
      const aturdido = S.aturdido[e] > 0;
      const brillo = aturdido ? 0.55 : elite ? 0.25 : 0.05;

      lote.push(idx, x, y, w * espejo, h, rot, tr, tg, tb, 1, brillo, flash);

      if (elite) this._marcaElite(lote, x, y, h, S.variante[e]);
      if (aturdido) this._marcaAturdido(lote, x, y, h, S.aturdido[e]);
      this._marcaPuntoDebil(lote, S, e, x, y);

      // Cañón de la torreta, orientado al jugador.
      if (S.tipo[e] === TIPO.TORRETA) {
        lote.push(this.tiles.canon, x + Math.cos(S.angulo[e]) * 8, y - 14 + Math.sin(S.angulo[e]) * 8,
          40, 18, S.angulo[e], 1, 1, 1, 1, 0.12, flash);
      }
      // Barra de vida de los grandes, con el aguante justo debajo.
      if ((m & MASK.VIDA) && S.vidaMax[e] > 90 && S.tipo[e] !== TIPO.JEFE && S.vida[e] < S.vidaMax[e]) {
        const by = y - h * 0.5 - 12;
        this._barraVida(lote, x, by, 44, S.vida[e] / S.vidaMax[e]);
        if (S.aguanteMax[e] > 0 && S.aguante[e] < S.aguanteMax[e] * 0.995) {
          const f = clamp(S.aguante[e] / S.aguanteMax[e], 0, 1);
          lote.push(this.tiles.blanco, x - 44 * 0.5 * (1 - f), by + 6, 44 * f, 2.5, 0,
            1, 0.85, 0.35, 0.9, 0.5, 0);
        }
      }
    }
  }

  /** Distintivo de élite: un anillo con el color del modificador. */
  _marcaElite(lote, x, y, h, variante) {
    const t = this.tiempoAmbiente * 2.2 + variante;
    const c = TINTE_ELITE[variante] || TINTE_ELITE[0];
    const r = h * 0.62 + Math.sin(t) * 2;
    lote.push(this.R.idx('fx.telegrafia.0'), x, y, r * 2, r * 2, t * 0.5,
      c[0], c[1], c[2], 0.5, 0.6, 0);
  }

  /** Aturdido: anillo blanco girando encima. */
  _marcaAturdido(lote, x, y, h, t) {
    const a = clamp(t / 0.95, 0, 1);
    const giro = this.tiempoAmbiente * 7;
    for (let k = 0; k < 3; k++) {
      const ang = giro + (k / 3) * TAU;
      lote.push(this.tiles.blanco,
        x + Math.cos(ang) * 18, y - h * 0.55 + Math.sin(ang) * 7,
        5, 5, ang, 1, 0.92, 0.5, a, 1, 0);
    }
  }

  /**
   * Pista del punto débil: sólo se enseña cuando el jugador está cerca, y muy
   * tenue. Es para que se aprenda dónde apuntar, no para señalarlo siempre.
   */
  _marcaPuntoDebil(lote, S, e, x, y) {
    const j = this.mundo.jugador;
    if (!j || j.id < 0) return;
    const dx = j.x - S.x[e], dy = j.y - S.y[e];
    const d2 = dx * dx + dy * dy;
    if (d2 > 420 * 420) return;
    if (!puntoDebil(S, e, this._debil || (this._debil = new Float32Array(4)))) return;
    const P4 = this._debil;
    const cerca = 1 - Math.min(1, Math.sqrt(d2) / 420);
    const pulso = 0.35 + 0.3 * Math.sin(this.tiempoAmbiente * 5 + e);
    const ox = P4[0] - S.x[e], oy = P4[1] - S.y[e];
    lote.push(this.R.idx('fx.suave'), x + ox, y + oy, P4[2] * 2.4, P4[2] * 2.4, 0,
      1, 0.88, 0.4, cerca * pulso * 0.5, 1, 0);
  }

  _barraVida(lote, x, y, ancho, frac) {
    lote.push(this.tiles.blanco, x, y, ancho + 3, 7, 0, 0.05, 0.05, 0.08, 0.85, 0, 0);
    lote.push(this.tiles.blanco, x - ancho * 0.5 * (1 - frac), y, ancho * frac, 4, 0,
      1, 0.35 + frac * 0.4, 0.35, 1, 0.4, 0);
  }

  _jugador(lote, alpha) {
    const M = this.mundo;
    const j = M.jugador;
    if (j.id < 0) return;
    const S = M.ent;
    const x = lerp(S.px[j.id], S.x[j.id], alpha);
    const y = lerp(S.py[j.id], S.y[j.id], alpha);
    const idx = j.spriteActual(this.R);
    const t = this.R.atlas.tam2d;
    const sq = j.squash;
    const w = t[idx * 2] * (2 - sq) * (j.facing < 0 ? -1 : 1);
    const h = t[idx * 2 + 1] * sq;
    // Parpadeo de invulnerabilidad.
    let a = 1;
    if (j.iframes > 0 && j.estado !== ESTADO.DASH) a = 0.35 + 0.65 * (Math.sin(j.iframes * 44) * 0.5 + 0.5);
    const flash = S.flash[j.id];
    const emisivo = j.estado === ESTADO.DASH ? 0.6 : j.parryT > 0 ? 0.5 : 0.12;
    lote.push(idx, x, y, w, h, 0, 1, 1, 1, a, emisivo, flash);
  }

  // --------------------------------------------------------- capa emisiva --

  emisivo(alpha) {
    const M = this.mundo;
    const S = M.ent;
    const lote = this.R.lote;
    const Tl = this.tiles;
    if (!Tl) return;

    // Proyectiles y recogibles.
    for (let i = 0; i < S.count; i++) {
      const e = S.dense[i];
      if (S.alive[e] !== 1) continue;
      if ((S.mask[e] & MASK.EMISIVO) === 0) continue;
      const x = lerp(S.px[e], S.x[e], alpha);
      const y = lerp(S.py[e], S.y[e], alpha);
      const cuadros = S.cuadros[e] || 1;
      const f = cuadros > 1 ? (Math.floor(S.anim[e]) % cuadros + cuadros) % cuadros : 0;
      const idx = S.sprite[e] + f;
      const t = this.R.atlas.tam2d;
      const esc = S.escala[e] || 1;
      lote.push(idx, x, y, t[idx * 2] * esc, t[idx * 2 + 1] * esc, S.angulo[e],
        S.luzR[e] || 1, S.luzG[e] || 1, S.luzB[e] || 1, 1, 0.85, 0);
    }

    // Cuerda del gancho.
    const j = M.jugador;
    if (j.ganchoActivo) {
      const dx = j.ganchoX - j.x, dy = j.ganchoY - j.y;
      const largo = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const n = Math.max(2, Math.floor(largo / 14));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        // Combadura sutil: la cuerda no es una recta perfecta.
        const comba = Math.sin(t * Math.PI) * 6;
        const px = j.x + dx * t - Math.sin(ang) * comba;
        const py = j.y + dy * t + Math.cos(ang) * comba;
        lote.push(Tl.eslabon, px, py, 16, 9, ang, 0.5, 0.9, 1, 0.9, 0.9, 0);
      }
      lote.push(Tl.ancla, j.ganchoX, j.ganchoY, 26, 26, M.tiempo * 3, 0.6, 0.95, 1, 1, 1, 0);
    }

    // Retícula del objetivo fijado por el módulo Buscador.
    const fijado = S.resolve(M.arma.objetivo);
    if (fijado >= 0) {
      const t = M.tiempo * 2.4;
      const rad = Math.max(S.hw[fijado], S.hh[fijado]) * 1.9 + 8;
      for (let k = 0; k < 4; k++) {
        const a = t + (k / 4) * TAU;
        lote.push(this.tiles.blanco,
          S.x[fijado] + Math.cos(a) * rad, S.y[fijado] + Math.sin(a) * rad,
          10, 3, a, 1, 0.55, 0.9, 0.85, 1, 0);
      }
    }

    // Enemigos marcados por la cadena: el siguiente impacto detona.
    for (let i = 0; i < S.count; i++) {
      const e = S.dense[i];
      if (S.alive[e] !== 1 || S.marca[e] <= 0) continue;
      const a = clamp(S.marca[e] / 2.5, 0, 1);
      const r = Math.max(S.hw[e], S.hh[e]) * 1.5;
      lote.push(this.R.idx('fx.telegrafia.0'), S.x[e], S.y[e], r * 2, r * 2,
        M.tiempo * 3, 0.72, 0.5, 1, 0.35 + a * 0.4, 1, 0);
    }

    // Cables entre tejedores: la amenaza es el segmento, no los nodos.
    const cables = M.cables;
    if (cables && cables.n > 0) {
      for (let i = 0; i < cables.n; i++) {
        this._rayo(lote, cables.x0[i], cables.y0[i], cables.x1[i], cables.y1[i],
          1, 0.35, 1, 0.8, 16);
        this._rayo(lote, cables.x0[i], cables.y0[i], cables.x1[i], cables.y1[i],
          1, 0.9, 1, 0.95, 5);
      }
    }

    // Arcos de la cadena eléctrica.
    for (let i = 0; i < M.arcos.n; i++) {
      this._rayo(lote, M.arcos.x0[i], M.arcos.y0[i], M.arcos.x1[i], M.arcos.y1[i],
        M.arcos.t[i] / 0.16, 0.75, 0.5, 1, 7);
    }

    // Rayo del jefe.
    if (M.laser.activo) {
      const L = M.laser;
      const x1 = L.x + Math.cos(L.ang) * L.largo;
      const y1 = L.y + Math.sin(L.ang) * L.largo;
      this._rayo(lote, L.x, L.y, x1, y1, 1, 1, 0.3, 0.4, 26);
      this._rayo(lote, L.x, L.y, x1, y1, 1, 1, 0.95, 0.95, 8);
    }

    // Láseres de trampa.
    for (let i = 0; i < M.trampas.laseres.length; i++) {
      const l = M.trampas.laseres[i];
      if (l.activo) {
        this._rayo(lote, l.x, l.y, l.x, l.y + l.largo, 1, 1, 0.28, 0.36, 18);
        this._rayo(lote, l.x, l.y, l.x, l.y + l.largo, 1, 1, 0.9, 0.9, 6);
      } else if (l.avisando > 0) {
        const a = l.avisando * 0.55;
        this._rayo(lote, l.x, l.y, l.x, l.y + l.largo, a, 1, 0.4, 0.45, 4);
      }
    }

    // Aura del jugador y destello del parry.
    if (j.id >= 0 && j.estado !== ESTADO.MUERTO) {
      const x = lerp(S.px[j.id], S.x[j.id], alpha);
      const y = lerp(S.py[j.id], S.y[j.id], alpha);
      if (j.parryT > 0) {
        const t = j.parryT / P.PARRY_VENTANA;
        lote.push(Tl.suave, x, y, 150 * t, 150 * t, 0, 1, 0.55, 0.95, 0.55 * t, 1, 0);
      }
      if (j.estado === ESTADO.DASH) {
        lote.push(Tl.suave, x, y, 96, 96, 0, 0.45, 0.85, 1, 0.45, 1, 0);
      }
      if (this.mundo.arma.sobrecalentada) {
        lote.push(Tl.suave, x, y - 26, 54, 54, 0, 1, 0.4, 0.25, 0.5, 1, 0);
      }
    }

    this._zonas(lote);

    // Pool de efectos animados.
    const pool = M.fx.pool;
    const tam = this.R.atlas.tam2d;
    for (let i = 0; i < pool.x.length; i++) {
      if (!pool.vivo[i]) continue;
      const t = pool.t[i] / pool.dur[i];
      const cuadros = pool.cuadros[i];
      const f = cuadros > 1 ? Math.min(cuadros - 1, Math.floor(t * cuadros)) : 0;
      const idx = pool.sprite[i] + f;
      const esc = lerp(pool.escala[i], pool.escalaFin[i], t);
      const a = pool.a[i] * (1 - t * t);
      lote.push(idx, pool.x[i], pool.y[i], tam[idx * 2] * esc, tam[idx * 2 + 1] * esc,
        pool.rot[i], pool.r[i], pool.g[i], pool.b[i], a, 1, 0);
    }
  }

  /**
   * Zonas de peligro. El contorno dice dónde y el relleno dice cuándo: la barra
   * avanza con el temporizador real del ataque, así que si llega al final es
   * porque el golpe sale ya.
   */
  _zonas(lote) {
    const Z = this.mundo.fx.zonas;
    if (Z.n === 0) return;
    const Tl = this.tiles;
    const haz = Tl.haz, suave = Tl.suave, anillo = this.R.idx('fx.anillo.0');

    for (let i = 0; i < Z.vivo.length; i++) {
      if (!Z.vivo[i]) continue;
      const p = clamp(Z.t[i] / Z.dur[i], 0, 1);
      const r = Z.r[i], g = Z.g[i], b = Z.b[i];
      // Late más rápido según se acerca el impacto, y da un fogonazo al final.
      const latido = 0.35 + 0.35 * Math.sin(Z.t[i] * (9 + p * 26));
      const inminente = p > 0.86 ? (p - 0.86) / 0.14 : 0;
      const aContorno = (0.45 + latido * 0.55) * (1 - inminente * 0.25) + inminente * 0.8;
      // La capa emisiva suma: con alfas bajos el relleno no llegaba a verse.
      const aRelleno = 0.16 + inminente * 0.5;

      if (Z.tipo[i] === ZONA.LINEA) {
        const dx = Z.x2[i] - Z.x[i], dy = Z.y2[i] - Z.y[i];
        const largo = Math.hypot(dx, dy);
        if (largo < 1) continue;
        const ang = Math.atan2(dy, dx);
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        const mitad = Z.grosor[i] * 0.5;
        const cx = Z.x[i] + dx * 0.5, cy = Z.y[i] + dy * 0.5;
        const ux = Math.cos(ang), uy = Math.sin(ang);
        // Banda tenue de fondo: dice DÓNDE.
        lote.push(Tl.blanco, cx, cy, largo, Z.grosor[i], ang, r, g, b, 0.10 + inminente * 0.2, 1, 0);
        // Relleno que avanza: dice CUÁNDO.
        const lleno = largo * p;
        lote.push(Tl.blanco, Z.x[i] + ux * lleno * 0.5, Z.y[i] + uy * lleno * 0.5,
          lleno, Z.grosor[i], ang, r, g, b, aRelleno, 1, 0);
        // Bordes.
        for (const s2 of [-1, 1]) {
          lote.push(haz, cx + nx * mitad * s2, cy + ny * mitad * s2, largo, 6, ang, r, g, b, aContorno, 1, 0);
        }
        // Frente del relleno.
        lote.push(haz, Z.x[i] + ux * lleno, Z.y[i] + uy * lleno,
          Z.grosor[i] + 6, 8, ang + Math.PI * 0.5, 1, 0.9, 0.85, aContorno, 1, 0);

      } else if (Z.tipo[i] === ZONA.CONO) {
        const n = 13;
        const radio = Z.radio[i];
        const lleno = radio * p;
        // Relleno en abanico: bandas anchas para que se lea como un área.
        const grosorBanda = (Z.apertura[i] * 2 * radio) / (n - 1) + 8;
        for (let k = 0; k < n; k++) {
          const a = Z.ang[i] + (k / (n - 1) - 0.5) * Z.apertura[i] * 2;
          lote.push(haz, Z.x[i] + Math.cos(a) * radio * 0.5, Z.y[i] + Math.sin(a) * radio * 0.5,
            radio, grosorBanda, a, r, g, b, 0.07 + inminente * 0.12, 1, 0);
          lote.push(haz, Z.x[i] + Math.cos(a) * lleno * 0.5, Z.y[i] + Math.sin(a) * lleno * 0.5,
            lleno, grosorBanda, a, r, g, b, aRelleno * 0.55, 1, 0);
        }
        // Aristas y arco del frente.
        for (const s2 of [-1, 1]) {
          const a = Z.ang[i] + s2 * Z.apertura[i];
          lote.push(haz, Z.x[i] + Math.cos(a) * radio * 0.5, Z.y[i] + Math.sin(a) * radio * 0.5,
            radio, 6, a, r, g, b, aContorno, 1, 0);
        }
        const pasos = 10;
        for (let k = 0; k < pasos; k++) {
          const a = Z.ang[i] + ((k / (pasos - 1)) - 0.5) * Z.apertura[i] * 2;
          const a2 = Z.ang[i] + (((k + 1) / (pasos - 1)) - 0.5) * Z.apertura[i] * 2;
          const x1 = Z.x[i] + Math.cos(a) * lleno, y1 = Z.y[i] + Math.sin(a) * lleno;
          const x2 = Z.x[i] + Math.cos(a2) * lleno, y2 = Z.y[i] + Math.sin(a2) * lleno;
          if (k === pasos - 1) break;
          lote.push(haz, (x1 + x2) * 0.5, (y1 + y2) * 0.5, Math.hypot(x2 - x1, y2 - y1) + 4, 7,
            Math.atan2(y2 - y1, x2 - x1), 1, 0.9, 0.85, aContorno * 0.9, 1, 0);
        }

      } else {
        const radio = Z.radio[i];
        lote.push(suave, Z.x[i], Z.y[i], radio * 2, radio * 2, 0, r, g, b, 0.10 + inminente * 0.22, 1, 0);
        lote.push(suave, Z.x[i], Z.y[i], radio * 2 * p, radio * 2 * p, 0, r, g, b, aRelleno, 1, 0);
        lote.push(anillo + 4, Z.x[i], Z.y[i], radio * 2.3, radio * 2.3, 0, r, g, b, aContorno, 1, 0);
        lote.push(anillo + 4, Z.x[i], Z.y[i], radio * 2.3 * p, radio * 2.3 * p, 0,
          1, 0.9, 0.85, aContorno * 0.8, 1, 0);
      }
    }
  }

  /** Rayo compuesto por segmentos con temblor: barato y muy legible. */
  _rayo(lote, x0, y0, x1, y1, intensidad, r, g, b, grosor) {
    const dx = x1 - x0, dy = y1 - y0;
    const largo = Math.hypot(dx, dy);
    if (largo < 1) return;
    const ang = Math.atan2(dy, dx);
    const n = clamp(Math.floor(largo / 26), 1, 40);
    let px = x0, py = y0;
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const jitter = k === n ? 0 : (CR.float() - 0.5) * grosor * 0.9;
      const cx = x0 + dx * t + nx * jitter;
      const cy = y0 + dy * t + ny * jitter;
      const sx = (px + cx) * 0.5, sy = (py + cy) * 0.5;
      const seg = Math.hypot(cx - px, cy - py);
      lote.push(this.tiles.haz, sx, sy, seg + 6, grosor, Math.atan2(cy - py, cx - px),
        r, g, b, intensidad, 1, 0);
      px = cx; py = cy;
    }
  }

  // ---------------------------------------------------------------- luces --

  luces(alpha) {
    const M = this.mundo;
    const R = this.R;
    const S = M.ent;
    const luz = R.luz;
    const sala = M.sala;
    if (!sala) return;
    const v = R.vistaMundo;

    // Luces estáticas del nivel (proyectan sombra).
    for (let i = 0; i < sala.props.length; i++) {
      const p = sala.props[i];
      if (p.tipo !== 'luz') continue;
      if (p.x < v[0] - p.radio || p.x > v[2] + p.radio) continue;
      if (p.y < v[1] - p.radio || p.y > v[3] + p.radio) continue;
      luz.add(p.x, p.y, p.radio, p.r, p.g, p.b, p.intensidad, true, 0, 7, p.parpadeo);
    }

    // Luces de entidades.
    for (let i = 0; i < S.count; i++) {
      const e = S.dense[i];
      if (S.alive[e] !== 1) continue;
      if ((S.mask[e] & MASK.LUZ) === 0) continue;
      const x = lerp(S.px[e], S.x[e], alpha);
      const y = lerp(S.py[e], S.y[e], alpha);
      const rad = S.luzRadio[e];
      if (x < v[0] - rad || x > v[2] + rad || y < v[1] - rad || y > v[3] + rad) continue;
      const esJugador = (S.mask[e] & MASK.JUGADOR) !== 0;
      let intensidad = S.luzInt[e];
      if (esJugador) {
        const j = M.jugador;
        if (j.estado === ESTADO.DASH) intensidad *= 1.7;
        if (j.parryT > 0) intensidad *= 1.5;
      }
      luz.add(x, y, rad, S.luzR[e], S.luzG[e], S.luzB[e], intensidad, esJugador || (S.mask[e] & MASK.JEFE) !== 0);
    }

    // Trampas encendidas.
    for (let i = 0; i < M.trampas.laseres.length; i++) {
      const l = M.trampas.laseres[i];
      if (l.activo) luz.add(l.x, l.y + l.largo * 0.5, 220, 1, 0.3, 0.35, 1.1, false);
      else if (l.avisando > 0) luz.add(l.x, l.y, 120, 1, 0.35, 0.4, l.avisando * 0.7, false);
    }
    if (M.laser.activo) {
      const L = M.laser;
      luz.add(L.x + Math.cos(L.ang) * L.largo * 0.5, L.y + Math.sin(L.ang) * L.largo * 0.5,
        420, 1, 0.35, 0.4, 1.5, false);
    }
    for (let i = 0; i < M.arcos.n; i++) {
      luz.add((M.arcos.x0[i] + M.arcos.x1[i]) * 0.5, (M.arcos.y0[i] + M.arcos.y1[i]) * 0.5,
        180, 0.7, 0.5, 1, 1.2, false);
    }
  }

  /** Motas de ambiente que flotan por la sala. */
  ambiente(dt) {
    const M = this.mundo;
    const sala = M.sala;
    if (!sala || !M.fx.activo) return;
    const v = this.R.vistaMundo;
    const P = PALETAS_BIOMA[sala.bioma];
    const n = 2;
    for (let i = 0; i < n; i++) {
      const x = v[0] + CR.float() * (v[2] - v[0]);
      const y = v[1] + CR.float() * (v[3] - v[1]);
      M.fx.ambiente(x, y, 0.4 + CR.float() * 0.3, 0.6 + CR.float() * 0.3, 0.9);
    }
  }
}
