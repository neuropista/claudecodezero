// main.js — Punto de entrada. Monta todos los sistemas y los mantiene en orden.

import { Settings } from './core/settings.js';
import { Input, BTN } from './core/input.js';
import { Loop, PASO } from './core/loop.js';
import { Replay, INTERVALO_CHECKSUM } from './core/replay.js';
import { EventBus, EV } from './core/events.js';
import { Renderer } from './render/renderer.js';
import { Audio, TENSION } from './audio/audio.js';
import { Mundo, FASE } from './game/world.js';
import { TIPO_SALA } from './game/level.js';
import { Dibujante } from './game/draw.js';
import { Records } from './game/progression.js';
import { Hud } from './ui/hud.js';
import { Menus, PANTALLA } from './ui/menus.js';
import { Depuracion } from './ui/debug.js';
import { seedFrom } from './core/rng.js';

class Juego {
  constructor(canvas) {
    this.canvas = canvas;
    this.settings = new Settings();
    this.R = new Renderer(canvas, this.settings);
    this.input = new Input(canvas);
    this.eventos = new EventBus();
    this.audio = new Audio(this.settings);
    this.mundo = new Mundo(this.R, this.eventos);
    this.dibujante = new Dibujante(this.mundo);
    this.hud = new Hud(this.mundo);
    this.records = new Records();
    this.menus = new Menus(this);
    this.debug = new Depuracion(this);
    this.replay = new Replay();
    this.semillaActual = 1;
    this.tensionActual = TENSION.SILENCIO;
    this.audioIniciado = false;
    this.tmp2 = new Float32Array(2);
    this.enPartida = false;

    this.audio.conectar(this.eventos);
    this.eventos.on((tipo) => this._reaccion(tipo));

    this.loop = new Loop((dt, tick) => this.actualizar(dt, tick), (alpha, dt) => this.dibujar(alpha, dt));
    this._bindEventos();
    this._ajustarTamano();
    this.menus.abrir(PANTALLA.TITULO);
    this.loop.iniciar();
  }

  _bindEventos() {
    window.addEventListener('resize', () => this._ajustarTamano());
    const primerGesto = async () => {
      if (this.audioIniciado) return;
      this.audioIniciado = await this.audio.iniciar();
      if (this.audioIniciado) {
        this.audio.aplicarOpciones();
        this.audio.iniciarMusica();
        this.audio.setTension(TENSION.EXPLORACION);
      }
    };
    window.addEventListener('pointerdown', primerGesto, { once: false });
    window.addEventListener('keydown', primerGesto, { once: false });

    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.menus.abierto) return;
      const r = this.canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) * (this.canvas.width / r.width);
      const y = (e.clientY - r.top) * (this.canvas.height / r.height);
      this.menus.clicEn(x, y);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.menus.abierto) return;
      const r = this.canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) * (this.canvas.width / r.width);
      const y = (e.clientY - r.top) * (this.canvas.height / r.height);
      this.menus.moverRaton(x, y);
    });

    this.loop.onPausaCambio = (v, porFoco) => {
      if (v && !porFoco && this.enPartida && !this.menus.abierto) this.menus.abrir(PANTALLA.PAUSA);
    };
  }

  _ajustarTamano() {
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.R.redimensionar(w, h, true);
  }

  aplicarOpciones() {
    this.R.aplicarOpciones();
    this.audio.aplicarOpciones();
    this._ajustarTamano();
  }

  // -------------------------------------------------------- flujo de juego -

  empezarPartida(semilla) {
    const s = semilla !== undefined && semilla !== ''
      ? seedFrom(semilla)
      : (seedFrom(String(performance.now())) ^ seedFrom(String(this.records.datos.partidas + 1))) >>> 0;
    this.semillaActual = s;
    this.mundo.nuevaPartida(s);
    this.replay.iniciarGrabacion(s);
    this.menus.cerrar();
    this.enPartida = true;
    this.loop.setPausa(false);
    this.loop.tick = 0;
    this._resultadoRegistrado = false;
    if (this.audioIniciado) {
      this.audio.setBioma(0);
      this.audio.setTension(TENSION.EXPLORACION);
      this.audio.iniciarMusica();
    }
  }

  reproducirRepeticion() {
    if (this.replay.length === 0) { this.debug.aviso('No hay nada grabado todavia'); return; }
    this.mundo.nuevaPartida(this.replay.seed);
    this.replay.iniciarReproduccion();
    this.menus.cerrar();
    this.enPartida = true;
    this.loop.setPausa(false);
    this.loop.tick = 0;
    this.debug.aviso(`Reproduciendo ${this.replay.length} ticks (semilla ${this.replay.seed})`);
    this.debug.visible = true;
  }

  volverAlTitulo() {
    this.enPartida = false;
    this.replay.detener();
    this.menus.abrir(PANTALLA.TITULO);
    this.mundo.fase = FASE.MENU;
    this.loop.setPausa(false);
    if (this.audioIniciado) this.audio.setTension(TENSION.SILENCIO);
  }

  reanudar() {
    this.menus.cerrar();
    this.loop.setPausa(false);
  }

  pausar() {
    if (!this.enPartida) return;
    this.loop.setPausa(true);
    this.menus.abrir(PANTALLA.PAUSA);
  }

  _reaccion(tipo) {
    // Efectos globales que dependen de eventos de la simulación.
    if (tipo === EV.EXPLOSION || tipo === EV.MUERTE_ENEMIGO) this.R.post.golpe(0.10);
    if (tipo === EV.JEFE_FASE) this.R.post.golpe(0.5, 1, 0.4, 0.5);
  }

  // ------------------------------------------------------------ simulación -

  actualizar(dt, tick) {
    const M = this.mundo;

    if (!this.enPartida) {
      // En el título la simulación no corre; sólo se anima el fondo.
      this.R.camara.actualizar(dt, this.R.camara.x + 22 * dt, this.R.camara.y, 0.4, 0);
      return;
    }

    // Posición en pantalla del jugador: origen del apuntado con ratón.
    let ox = this.R.ancho * 0.5, oy = this.R.alto * 0.5;
    if (M.jugador.id >= 0) {
      this.R.camara.mundoAPantalla(M.jugador.x, M.jugador.y, this.tmp2);
      ox = this.tmp2[0]; oy = this.tmp2[1];
    }

    let frame;
    if (this.replay.reproduciendo) {
      if (this.replay.terminada(tick)) {
        this.replay.detener();
        this.debug.aviso(`Repeticion terminada. Desajustes: ${this.replay.desajustes}`);
        this.loop.setPausa(true);
        this.menus.abrir(PANTALLA.PAUSA);
        return;
      }
      frame = this.input.aplicarGrabado(this.input.frame, this.replay.buttons[tick], this.replay.aim[tick]);
      this.replay.cursor = tick;
    } else {
      frame = this.input.sample(ox, oy, M.jugador.facing || 1);
      this.replay.grabar(tick, frame.buttons, frame.aimQ);
    }

    if (frame.pressed(BTN.PAUSA) && !this.replay.reproduciendo) {
      this.pausar();
      return;
    }

    M.actualizar(dt, frame);
    this.eventos.dispatch();

    if (tick % INTERVALO_CHECKSUM === 0) this.replay.anotarChecksum(tick, M.checksum());

    this._actualizarAudio();
    this._comprobarFin();
  }

  _actualizarAudio() {
    if (!this.audioIniciado) return;
    const M = this.mundo;
    this.audio.setOyente(M.camara.x, this.R.ancho / M.camara.zoom);
    this.audio.setBioma(M.progresion.bioma);
    let t = TENSION.EXPLORACION;
    if (M.fase === FASE.VICTORIA) t = TENSION.VICTORIA;
    else if (M.fase === FASE.MUERTE) t = TENSION.DERROTA;
    else if (M.sala && M.sala.tipo === TIPO_SALA.JEFE && M.estadoSala === 1) t = TENSION.JEFE;
    else if (M.estadoSala === 1 && M.estadisticas.enemigos > 0) t = TENSION.COMBATE;
    if (t !== this.tensionActual) {
      this.tensionActual = t;
      this.audio.setTension(t);
    }
  }

  _comprobarFin() {
    const M = this.mundo;
    if (this._resultadoRegistrado) return;
    if (M.fase === FASE.MUERTE && !this.menus.abierto) {
      this._resultadoRegistrado = true;
      this.records.registrar(M.progresion.resumen(), false);
      this.replay.grabando = false;
      this.menus.abrir(PANTALLA.MUERTE);
    } else if (M.fase === FASE.VICTORIA && !this.menus.abierto) {
      this._resultadoRegistrado = true;
      this.records.registrar(M.progresion.resumen(), true);
      this.replay.grabando = false;
      this.menus.abrir(PANTALLA.VICTORIA);
    }
  }

  // ---------------------------------------------------------------- render -

  dibujar(alpha, dt) {
    const R = this.R;
    const M = this.mundo;

    const uiFrame = this.input.sampleUI();
    this.menus.actualizar(dt, uiFrame);
    this.debug.actualizar(dt);
    if (this.enPartida) this.hud.actualizar(dt);

    R.empezarFrame(alpha, dt);

    if (this.enPartida && M.sala) {
      this.dibujante.mundoIluminado(alpha, dt);
      this.dibujante.luces(alpha);
      this.dibujante.ambiente(dt);
    }
    R.finMundo(dt);

    R.particulas.actualizar(Math.min(dt, 1 / 30));
    R.empezarEmisivo();
    if (this.enPartida && M.sala) {
      this.dibujante.emisivo(alpha);
      this.debug.dibujarSegmentos();
    }
    R.finEmisivo();

    R.empezarUI();
    if (this.enPartida) {
      this.hud.dibujar();
      if (!this.menus.abierto) this.hud.cursor(this.input);
    }
    this.menus.dibujar();
    this.debug.dibujar();
    if (!this.audioIniciado) {
      const s = R.alto / 1080;
      R.texto('PULSA CUALQUIER TECLA PARA ACTIVAR EL AUDIO', R.ancho * 0.5, R.alto - 100 * s,
        0.26 * s, 0.7, 0.9, 1, 0.55 + 0.45 * Math.sin(performance.now() * 0.004), 0.5);
    }
    R.finUI();

    R.post.decaer(dt);
    R.presentar(dt);
  }
}

// --- Arranque -------------------------------------------------------------

function arrancar() {
  const canvas = document.getElementById('juego');
  const aviso = document.getElementById('aviso');
  try {
    window.JUEGO = new Juego(canvas);
    if (aviso) aviso.remove();
  } catch (err) {
    console.error(err);
    if (aviso) {
      aviso.innerHTML = `<h1>No se pudo iniciar</h1><p>${String(err.message || err)}</p>
        <p>VEX necesita un navegador con WebGL2 (Chrome, Firefox, Edge o Safari 15+).</p>`;
      aviso.classList.add('error');
    }
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
else arrancar();
