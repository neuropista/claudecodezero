// menus.js — Menús: título, pausa, opciones, controles, muerte y victoria.
//
// Todo se dibuja con la misma fuente de trazos y el mismo lote de sprites que
// el juego, así que comparte el bloom, el grano y la curvatura del tubo.

import { BTN, NOMBRE_BOTON, MAPA_DEFECTO } from '../core/input.js';
import { OPCIONES_DEFECTO } from '../core/settings.js';
import { LISTA_MODULOS } from '../game/weapons.js';
import { BIOMAS } from '../game/progression.js';
import { clamp, lerp } from '../core/math.js';

export const PANTALLA = {
  NINGUNA: 0, TITULO: 1, PAUSA: 2, OPCIONES: 3, CONTROLES: 4,
  MUERTE: 5, VICTORIA: 6, SEMILLA: 7, MODULOS: 8, AYUDA: 9,
};

export class Menus {
  constructor(juego) {
    this.juego = juego;
    this.R = juego.R;
    this.settings = juego.settings;
    this.pantalla = PANTALLA.TITULO;
    this.seleccion = 0;
    this.anterior = PANTALLA.NINGUNA;
    this.tiempo = 0;
    this.semillaTexto = '';
    this.editandoSemilla = false;
    this.hover = -1;
    this.items = [];
    this._construir();
    this._bindTeclado();
  }

  _bindTeclado() {
    window.addEventListener('keydown', (e) => {
      if (this.pantalla === PANTALLA.NINGUNA) return;
      if (this.editandoSemilla) {
        if (e.key === 'Backspace') { this.semillaTexto = this.semillaTexto.slice(0, -1); e.preventDefault(); }
        else if (e.key === 'Enter') { this.editandoSemilla = false; e.preventDefault(); }
        else if (e.key.length === 1 && this.semillaTexto.length < 18) {
          this.semillaTexto += e.key.toUpperCase();
          e.preventDefault();
        }
      }
    });
  }

  abrir(pantalla) {
    if (this.pantalla !== pantalla) {
      this.anterior = this.pantalla;
      this.pantalla = pantalla;
      this.seleccion = 0;
      this._construir();
    }
  }

  cerrar() {
    this.pantalla = PANTALLA.NINGUNA;
    this.editandoSemilla = false;
  }

  get abierto() { return this.pantalla !== PANTALLA.NINGUNA; }

  // ------------------------------------------------------------- items ----

  _construir() {
    const J = this.juego;
    const S = this.settings;
    const items = [];
    switch (this.pantalla) {
      case PANTALLA.TITULO:
        items.push({ t: 'accion', txt: 'INICIAR COLAPSO', fn: () => J.empezarPartida(this.semillaTexto || undefined) });
        items.push({ t: 'accion', txt: 'SEMILLA: ' + (this.semillaTexto || 'ALEATORIA'), fn: () => this.abrir(PANTALLA.SEMILLA) });
        items.push({ t: 'accion', txt: 'OPCIONES', fn: () => this.abrir(PANTALLA.OPCIONES) });
        items.push({ t: 'accion', txt: 'CONTROLES', fn: () => this.abrir(PANTALLA.CONTROLES) });
        items.push({ t: 'accion', txt: 'MODULOS DE ARMA', fn: () => this.abrir(PANTALLA.MODULOS) });
        break;
      case PANTALLA.PAUSA:
        items.push({ t: 'accion', txt: 'CONTINUAR', fn: () => J.reanudar() });
        items.push({ t: 'accion', txt: 'OPCIONES', fn: () => this.abrir(PANTALLA.OPCIONES) });
        items.push({ t: 'accion', txt: 'CONTROLES', fn: () => this.abrir(PANTALLA.CONTROLES) });
        items.push({ t: 'accion', txt: 'VER REPETICION', fn: () => J.reproducirRepeticion() });
        items.push({ t: 'accion', txt: 'ABANDONAR', fn: () => J.volverAlTitulo() });
        break;
      case PANTALLA.OPCIONES:
        items.push({ t: 'slider', txt: 'VOLUMEN GENERAL', clave: 'volMaster' });
        items.push({ t: 'slider', txt: 'MUSICA', clave: 'volMusica' });
        items.push({ t: 'slider', txt: 'EFECTOS', clave: 'volSfx' });
        items.push({ t: 'sep' });
        items.push({ t: 'toggle', txt: 'BLOOM', clave: 'bloom' });
        items.push({ t: 'toggle', txt: 'ABERRACION CROMATICA', clave: 'aberracion' });
        items.push({ t: 'toggle', txt: 'VINETA', clave: 'vineta' });
        items.push({ t: 'toggle', txt: 'GRANO', clave: 'grano' });
        items.push({ t: 'toggle', txt: 'CURVATURA CRT', clave: 'crt' });
        items.push({ t: 'toggle', txt: 'DESTELLO DE IMPACTO', clave: 'flash' });
        items.push({ t: 'toggle', txt: 'LUCES DINAMICAS', clave: 'luces' });
        items.push({ t: 'toggle', txt: 'SOMBRAS PROYECTADAS', clave: 'sombras' });
        items.push({ t: 'toggle', txt: 'PARALLAX', clave: 'parallax' });
        items.push({ t: 'toggle', txt: 'HIT-STOP', clave: 'hitstop' });
        items.push({ t: 'slider', txt: 'SACUDIDA DE CAMARA', clave: 'shake', max: 2 });
        items.push({ t: 'slider', txt: 'DENSIDAD DE PARTICULAS', clave: 'particulas', max: 2 });
        items.push({ t: 'slider', txt: 'ESCALA DE RESOLUCION', clave: 'escala', min: 0.5, max: 1.5 });
        items.push({ t: 'toggle', txt: 'MOSTRAR FPS', clave: 'mostrarFps' });
        items.push({ t: 'sep' });
        items.push({ t: 'accion', txt: 'RESTAURAR VALORES', fn: () => { S.restaurar(); J.aplicarOpciones(); } });
        items.push({ t: 'accion', txt: 'VOLVER', fn: () => this.abrir(this.anterior || PANTALLA.TITULO) });
        break;
      case PANTALLA.CONTROLES:
        items.push({ t: 'accion', txt: 'VOLVER', fn: () => this.abrir(this.anterior || PANTALLA.TITULO) });
        break;
      case PANTALLA.MODULOS:
        items.push({ t: 'accion', txt: 'VOLVER', fn: () => this.abrir(this.anterior || PANTALLA.TITULO) });
        break;
      case PANTALLA.SEMILLA:
        items.push({ t: 'accion', txt: 'ESCRIBIR SEMILLA', fn: () => { this.editandoSemilla = true; } });
        items.push({ t: 'accion', txt: 'BORRAR (ALEATORIA)', fn: () => { this.semillaTexto = ''; } });
        items.push({ t: 'accion', txt: 'ACEPTAR', fn: () => { this.editandoSemilla = false; this.abrir(PANTALLA.TITULO); } });
        break;
      case PANTALLA.MUERTE:
        items.push({ t: 'accion', txt: 'REINTENTAR (MISMA SEMILLA)', fn: () => J.empezarPartida(J.semillaActual) });
        items.push({ t: 'accion', txt: 'NUEVA SEMILLA', fn: () => J.empezarPartida() });
        items.push({ t: 'accion', txt: 'VER REPETICION', fn: () => J.reproducirRepeticion() });
        items.push({ t: 'accion', txt: 'VOLVER AL TITULO', fn: () => J.volverAlTitulo() });
        break;
      case PANTALLA.VICTORIA:
        items.push({ t: 'accion', txt: 'JUGAR DE NUEVO', fn: () => J.empezarPartida() });
        items.push({ t: 'accion', txt: 'VER REPETICION', fn: () => J.reproducirRepeticion() });
        items.push({ t: 'accion', txt: 'VOLVER AL TITULO', fn: () => J.volverAlTitulo() });
        break;
      default: break;
    }
    this.items = items;
    if (this.items[this.seleccion] && this.items[this.seleccion].t === 'sep') this._mover(1);
  }

  _mover(dir) {
    if (this.items.length === 0) return;
    let n = 0;
    do {
      this.seleccion = (this.seleccion + dir + this.items.length) % this.items.length;
      n++;
    } while (this.items[this.seleccion].t === 'sep' && n < this.items.length);
  }

  // ------------------------------------------------------------ entrada ---

  actualizar(dt, input) {
    this.tiempo += dt;
    if (!this.abierto) return;
    if (this.editandoSemilla) return;

    if (input.pressed(BTN.ARRIBA)) { this._mover(-1); this.juego.audio.ui(0); }
    if (input.pressed(BTN.ABAJO)) { this._mover(1); this.juego.audio.ui(0); }

    const item = this.items[this.seleccion];
    if (!item) return;

    if (item.t === 'slider') {
      const paso = 0.05;
      const min = item.min ?? 0, max = item.max ?? 1;
      if (input.pressed(BTN.IZQ) || input.down(BTN.IZQ)) {
        this.settings.set(item.clave, clamp(Math.round((this.settings.get(item.clave) - paso * (input.pressed(BTN.IZQ) ? 1 : 0.35)) * 100) / 100, min, max));
        this.juego.aplicarOpciones();
      }
      if (input.pressed(BTN.DER) || input.down(BTN.DER)) {
        this.settings.set(item.clave, clamp(Math.round((this.settings.get(item.clave) + paso * (input.pressed(BTN.DER) ? 1 : 0.35)) * 100) / 100, min, max));
        this.juego.aplicarOpciones();
      }
    } else if (item.t === 'toggle') {
      if (input.pressed(BTN.IZQ) || input.pressed(BTN.DER) || input.pressed(BTN.SALTO) || input.pressed(BTN.INTERACTUAR)) {
        this.settings.toggle(item.clave);
        this.juego.aplicarOpciones();
        this.juego.audio.ui(1);
      }
      return;
    }

    if (input.pressed(BTN.SALTO) || input.pressed(BTN.INTERACTUAR) || input.pressed(BTN.DISPARO)) {
      if (item.fn) { this.juego.audio.ui(1); item.fn(); }
    }
    if (input.pressed(BTN.PAUSA)) {
      this.juego.audio.ui(2);
      if (this.pantalla === PANTALLA.PAUSA) this.juego.reanudar();
      else if (this.pantalla === PANTALLA.OPCIONES || this.pantalla === PANTALLA.CONTROLES ||
               this.pantalla === PANTALLA.SEMILLA || this.pantalla === PANTALLA.MODULOS) {
        this.abrir(this.anterior || PANTALLA.TITULO);
      }
    }
  }

  clicEn(x, y) {
    if (!this.abierto) return false;
    const geo = this._geometria();
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].t === 'sep') continue;
      const iy = geo.y0 + i * geo.paso;
      if (Math.abs(y - iy) < geo.paso * 0.45 && Math.abs(x - this.R.ancho * 0.5) < geo.ancho * 0.5) {
        this.seleccion = i;
        const item = this.items[i];
        if (item.t === 'toggle') { this.settings.toggle(item.clave); this.juego.aplicarOpciones(); }
        else if (item.fn) item.fn();
        this.juego.audio.ui(1);
        return true;
      }
    }
    return false;
  }

  moverRaton(x, y) {
    if (!this.abierto) return;
    const geo = this._geometria();
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].t === 'sep') continue;
      const iy = geo.y0 + i * geo.paso;
      if (Math.abs(y - iy) < geo.paso * 0.45 && Math.abs(x - this.R.ancho * 0.5) < geo.ancho * 0.5) {
        this.seleccion = i;
        return;
      }
    }
  }

  _geometria() {
    const R = this.R;
    const s = R.alto / 1080;
    if (this.pantalla === PANTALLA.OPCIONES) {
      // La lista de opciones es larga: en vez de centrarla (lo que la metia por
      // encima del titulo) se reparte en la banda que queda libre debajo.
      const arriba = R.alto * 0.155;
      const abajo = R.alto * 0.955;
      const paso = Math.min(44 * s, (abajo - arriba) / Math.max(1, this.items.length));
      return { s, paso, y0: arriba + paso * 0.5, ancho: 760 * s };
    }
    const paso = 62 * s;
    const alturaTotal = this.items.length * paso;
    const centro = this.pantalla === PANTALLA.TITULO ? R.alto * 0.62 : R.alto * 0.58;
    return { s, paso, y0: centro - alturaTotal * 0.5 + paso * 0.5, ancho: 700 * s };
  }

  // ------------------------------------------------------------ dibujo ----

  dibujar() {
    if (!this.abierto) return;
    const R = this.R;
    const s = R.alto / 1080;

    // Velo.
    const opacidad = this.pantalla === PANTALLA.TITULO ? 0.72 : 0.68;
    R.rect(R.ancho * 0.5, R.alto * 0.5, R.ancho, R.alto, 0.02, 0.03, 0.05, opacidad);

    switch (this.pantalla) {
      case PANTALLA.TITULO: this._titulo(s); break;
      case PANTALLA.PAUSA: this._cabecera(s, 'PAUSA', 'La red te espera'); break;
      case PANTALLA.OPCIONES: this._cabecera(s, 'OPCIONES', 'Flechas para ajustar · ESC para volver', R.alto * 0.065); break;
      case PANTALLA.CONTROLES: this._controles(s); return;
      case PANTALLA.MODULOS: this._modulos(s); return;
      case PANTALLA.SEMILLA: this._semilla(s); break;
      case PANTALLA.MUERTE: this._muerte(s); break;
      case PANTALLA.VICTORIA: this._victoria(s); break;
      default: break;
    }
    this._items(s);
  }

  _cabecera(s, titulo, sub, y) {
    const R = this.R;
    const cy = y !== undefined ? y : R.alto * 0.20;
    R.texto(titulo, R.ancho * 0.5, cy, 1.0 * s, 0.85, 0.97, 1, 1, 0.5, 0.5);
    if (sub) R.texto(sub, R.ancho * 0.5, cy + 54 * s, 0.28 * s, 0.6, 0.8, 0.95, 0.8, 0.5);
  }

  _titulo(s) {
    const R = this.R;
    const t = this.tiempo;
    const cy = R.alto * 0.26;
    // Título con latido y sombra desplazada tipo neón.
    const pulso = 1 + Math.sin(t * 1.6) * 0.012;
    R.texto('VEX', R.ancho * 0.5 + 4 * s, cy + 4 * s, 2.5 * s * pulso, 1, 0.35, 0.75, 0.35, 0.5, 1);
    R.texto('VEX', R.ancho * 0.5, cy, 2.5 * s * pulso, 0.9, 0.99, 1, 1, 0.5, 0.8);
    R.texto('COLAPSO NEURONAL', R.ancho * 0.5, cy + 100 * s, 0.66 * s, 0.6, 0.88, 1, 1, 0.5, 0.5);
    R.texto('Una consciencia corriendo dentro de una red que se apaga',
      R.ancho * 0.5, cy + 158 * s, 0.32 * s, 0.65, 0.8, 0.92, 0.9, 0.5);

    const rec = this.juego.records.datos;
    R.texto(`PARTIDAS ${rec.partidas}   ·   VICTORIAS ${rec.victorias}   ·   MEJOR SECTOR ${rec.mejorSala}`,
      R.ancho * 0.5, R.alto - 60 * s, 0.26 * s, 0.5, 0.7, 0.85, 0.7, 0.5);
    R.texto('FLECHAS/WASD MOVER · ENTER O ESPACIO ACEPTAR', R.ancho * 0.5, R.alto - 26 * s, 0.24 * s, 0.45, 0.6, 0.75, 0.6, 0.5);
  }

  _semilla(s) {
    const R = this.R;
    this._cabecera(s, 'SEMILLA', 'La misma semilla genera exactamente la misma red');
    const txt = this.semillaTexto || (this.editandoSemilla ? '' : 'ALEATORIA');
    const cursor = this.editandoSemilla && Math.floor(this.tiempo * 2) % 2 === 0 ? '_' : '';
    R.panel(R.ancho * 0.5, R.alto * 0.36, 620 * s, 76 * s, 1, 1, 1, 0.9);
    R.texto(txt + cursor, R.ancho * 0.5, R.alto * 0.36, 0.62 * s,
      this.editandoSemilla ? 1 : 0.7, 0.95, 1, 1, 0.5, 0.4);
  }

  _muerte(s) {
    const R = this.R;
    const res = this.juego.mundo.progresion.resumen();
    R.texto('CONSCIENCIA PERDIDA', R.ancho * 0.5, R.alto * 0.18, 1.05 * s, 1, 0.35, 0.45, 1, 0.5, 0.5);
    const lineas = [
      `SECTORES SUPERADOS: ${res.salas}`,
      `HOSTILES ELIMINADOS: ${res.enemigos}`,
      `MODULOS RECUPERADOS: ${res.modulos}`,
      `TIEMPO: ${formatoTiempo(res.tiempo)}`,
    ];
    R.textoMulti(lineas, R.ancho * 0.5, R.alto * 0.30, 0.32 * s, 0.75, 0.85, 0.95, 0.9, 0.5);
  }

  _victoria(s) {
    const R = this.R;
    const res = this.juego.mundo.progresion.resumen();
    R.texto('RED ESTABILIZADA', R.ancho * 0.5, R.alto * 0.16, 1.1 * s, 0.6, 1, 0.85, 1, 0.5, 0.7);
    R.texto('Vex sigue corriendo. Eso, por ahora, es suficiente.',
      R.ancho * 0.5, R.alto * 0.16 + 66 * s, 0.32 * s, 0.7, 0.95, 0.9, 0.9, 0.5);
    const lineas = [
      `TIEMPO TOTAL: ${formatoTiempo(res.tiempo)}`,
      `HOSTILES ELIMINADOS: ${res.enemigos}`,
      `JEFES DERROTADOS: ${res.jefes}`,
      `DANIO RECIBIDO: ${Math.round(res.danio)}`,
    ];
    R.textoMulti(lineas, R.ancho * 0.5, R.alto * 0.30, 0.32 * s, 0.75, 0.95, 0.9, 0.9, 0.5);
  }

  _controles(s) {
    const R = this.R;
    this._cabecera(s, 'CONTROLES', 'Teclado, raton y mando');
    const filas = [
      ['MOVER', 'A / D  ·  FLECHAS  ·  STICK IZQ'],
      ['SALTAR / DOBLE SALTO', 'ESPACIO  ·  K  ·  A'],
      ['DASH (invulnerable)', 'MAYUS  ·  L  ·  LB / LT'],
      ['DISPARAR', 'CLIC IZQ  ·  J  ·  RB / RT'],
      ['APUNTAR', 'RATON  ·  STICK DER  ·  DIRECCIONES'],
      ['PARRY (ventana corta)', 'F  ·  X  ·  B'],
      ['GANCHO', 'CLIC DER  ·  E  ·  X'],
      ['CAMBIAR MODULO', 'Q  ·  TAB  ·  Y'],
      ['BAJAR DE PLATAFORMA', 'S + SALTO'],
      ['PAUSA', 'ESC  ·  P  ·  START'],
      ['DEPURACION', 'F1 estadisticas · F2 recargar shaders · F3 repeticion'],
    ];
    const x0 = R.ancho * 0.5 - 420 * s;
    let y = R.alto * 0.30;
    for (const [k, v] of filas) {
      R.texto(k, x0, y, 0.30 * s, 0.65, 0.9, 1, 0.95, 0);
      R.texto(v, x0 + 460 * s, y, 0.28 * s, 0.85, 0.9, 0.95, 0.8, 0);
      y += 44 * s;
    }
    this._items(s, R.alto * 0.86);
  }

  _modulos(s) {
    const R = this.R;
    this._cabecera(s, 'MODULOS DE ARMA', 'Se combinan: el arma final es la suma de las ranuras');
    const x0 = R.ancho * 0.5 - 460 * s;
    let y = R.alto * 0.30;
    for (const m of LISTA_MODULOS) {
      R.lote.push(R.idx(`ui.iconoGlow.${m.clave}`), x0 - 20 * s, y, 34 * s, 34 * s, 0, 1, 1, 1, 1, 0.6, 0);
      R.texto(m.nombre.toUpperCase(), x0 + 20 * s, y - 12 * s, 0.32 * s, 0.7, 0.95, 1, 1, 0);
      R.texto(m.descripcion, x0 + 20 * s, y + 18 * s, 0.24 * s, 0.7, 0.8, 0.9, 0.8, 0);
      y += 74 * s;
    }
    this._items(s, R.alto * 0.90);
  }

  _items(s, yBase) {
    const R = this.R;
    const geo = this._geometria();
    const y0 = yBase !== undefined ? yBase : geo.y0;
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (item.t === 'sep') continue;
      const y = y0 + i * geo.paso;
      const sel = i === this.seleccion;
      const a = sel ? 1 : 0.82;
      const brillo = sel ? 0.6 : 0.1;

      if (sel) {
        const w = geo.ancho + Math.sin(this.tiempo * 5) * 6 * s;
        R.rect(R.ancho * 0.5, y, w, geo.paso * 0.86, 0.15, 0.45, 0.65, 0.28, 0.2);
        R.texto('>', R.ancho * 0.5 - geo.ancho * 0.5 + 8 * s, y, 0.34 * s, 0.6, 1, 1, 1, 0.5, 0.5);
      }

      if (item.t === 'accion') {
        R.texto(item.txt, R.ancho * 0.5, y, 0.40 * s, 0.85, 0.97, 1, a, 0.5, brillo);
      } else if (item.t === 'toggle') {
        const v = this.settings.get(item.clave);
        R.texto(item.txt, R.ancho * 0.5 - geo.ancho * 0.5 + 30 * s, y, 0.29 * s, 0.8, 0.92, 1, a, 0, brillo);
        R.texto(v ? 'SI' : 'NO', R.ancho * 0.5 + geo.ancho * 0.5 - 30 * s, y, 0.30 * s,
          v ? 0.45 : 0.9, v ? 1 : 0.5, v ? 0.8 : 0.5, a, 1, brillo);
      } else if (item.t === 'slider') {
        const min = item.min ?? 0, max = item.max ?? 1;
        const v = this.settings.get(item.clave);
        const f = clamp((v - min) / (max - min), 0, 1);
        R.texto(item.txt, R.ancho * 0.5 - geo.ancho * 0.5 + 30 * s, y, 0.29 * s, 0.8, 0.92, 1, a, 0, brillo);
        const bx = R.ancho * 0.5 + 80 * s, bw = 210 * s;
        R.rect(bx + bw * 0.5, y, bw, 8 * s, 0.1, 0.15, 0.2, 0.9);
        R.rect(bx + bw * f * 0.5, y, bw * f, 8 * s, 0.4, 0.85, 1, a, 0.4);
        R.rect(bx + bw * f, y, 6 * s, 20 * s, 0.8, 0.98, 1, a, 0.7);
        R.texto(String(Math.round(v * 100)), R.ancho * 0.5 + geo.ancho * 0.5 - 22 * s, y, 0.27 * s, 0.85, 0.95, 1, a, 1);
      }
    }
  }
}

export function formatoTiempo(segundos) {
  const m = Math.floor(segundos / 60);
  const sg = Math.floor(segundos % 60);
  return `${String(m).padStart(2, '0')}:${String(sg).padStart(2, '0')}`;
}
