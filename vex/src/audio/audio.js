// audio.js — Fachada de audio: conecta el bus de eventos del juego con la
// síntesis. La simulación nunca llama al audio directamente; sólo emite
// eventos, y aquí decidimos cómo suenan.

import { Buses } from './buses.js';
import { Sfx } from './sfx.js';
import { Musica, TENSION } from './music.js';
import { EV } from '../core/events.js';

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.listo = false;
    this.silenciado = false;
    this.camX = 0;
    this.anchoVista = 1920;
    this.pendienteIniciar = false;
    this.error = null;
  }

  /** Debe llamarse desde un gesto del usuario (política de autoplay). */
  async iniciar() {
    if (this.listo) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.error = 'Este navegador no soporta Web Audio.'; return false; }
      this.ctx = new AC({ latencyHint: 'interactive' });
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.buses = new Buses(this.ctx);
      this.sfx = new Sfx(this.ctx, this.buses);
      this.musica = new Musica(this.ctx, this.buses);
      this.aplicarOpciones();
      this.listo = true;
      window.addEventListener('blur', () => this.setFoco(false));
      window.addEventListener('focus', () => this.setFoco(true));
      document.addEventListener('visibilitychange', () => this.setFoco(!document.hidden));
      return true;
    } catch (e) {
      this.error = String(e.message || e);
      return false;
    }
  }

  aplicarOpciones() {
    if (!this.listo) return;
    const s = this.settings;
    this.buses.recordarVolumen(s.get('volMaster'));
    this.buses.setVolumen(s.get('volMaster'), s.get('volMusica'), s.get('volSfx'));
  }

  setFoco(activo) {
    if (!this.listo) return;
    this.silenciado = !activo;
    this.buses.silenciar(!activo);
    if (!activo && this.ctx.state === 'running') this.ctx.suspend();
    else if (activo && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setBioma(i) { if (this.listo) this.musica.setBioma(i); }
  setTension(t) { if (this.listo) this.musica.setTension(t); }
  iniciarMusica() { if (this.listo) this.musica.iniciar(); }
  detenerMusica() { if (this.listo) this.musica.detener(); }

  /** La cámara define el panorama estéreo de los eventos posicionales. */
  setOyente(camX, anchoVista) { this.camX = camX; this.anchoVista = anchoVista; }

  ui(tipo) { if (this.listo) this.sfx.ui(tipo); }

  /** Se suscribe al bus de eventos de la simulación. */
  conectar(bus) {
    bus.on((tipo, x, y, a, b) => this.manejar(tipo, x, y, a, b));
  }

  manejar(tipo, x, y, a) {
    if (!this.listo || this.silenciado) return;
    const s = this.sfx;
    const pan = s.pan(x, this.camX, this.anchoVista);
    switch (tipo) {
      case EV.SALTO: s.salto(pan); break;
      case EV.DOBLE_SALTO: s.dobleSalto(pan); break;
      case EV.ATERRIZAJE: s.aterrizaje(a, pan); break;
      case EV.DASH: s.dash(pan); break;
      case EV.PARED: s.aterrizaje(0.4, pan); break;
      case EV.DISPARO: s.disparo(a | 0, 0, pan); break;
      case EV.IMPACTO: s.impacto(a, pan); break;
      case EV.REBOTE: s.rebote(pan); break;
      case EV.DANIO_JUGADOR: s.danio(pan); break;
      case EV.MUERTE_ENEMIGO: s.muerteEnemigo(a, pan); break;
      case EV.EXPLOSION: s.explosion(a, pan); break;
      case EV.PARRY: s.parry(a > 0.5, pan); break;
      case EV.GANCHO: s.gancho(false, pan); break;
      case EV.GANCHO_SUELTA: s.gancho(true, pan); break;
      case EV.RECOGIDA: s.recogida(a | 0, pan); break;
      case EV.MODULO: s.modulo(pan); break;
      case EV.CURA: s.cura(pan); break;
      case EV.PUERTA: s.puerta(a > 0.5, pan); break;
      case EV.LASER: s.laser(pan); break;
      case EV.TELEGRAFIA: s.telegrafia(pan); break;
      case EV.CARGA_LISTA: s.cargaLista(pan); break;
      case EV.JEFE_FASE: s.jefeFase(); break;
      case EV.MUERTE_JUGADOR: s.muerteJugador(); break;
      case EV.VICTORIA: s.victoria(); break;
      case EV.RALENTI: s.ralenti(a > 0.5); break;
      case EV.SALA_LIMPIA: if (this.listo) this.musica.acento(true); break;
      default: break;
    }
  }
}

export { TENSION };
