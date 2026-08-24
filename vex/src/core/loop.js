// loop.js — Bucle principal: paso fijo con acumulador + render interpolado.
//
// La simulación siempre avanza en pasos de 1/60 s exactos. El render recibe
// `alpha` para interpolar entre el estado anterior y el actual, de modo que la
// imagen es suave aunque la pantalla vaya a 144 Hz o a 50 Hz.

export const PASO = 1 / 60;
const MAX_PASOS_POR_FRAME = 5;      // evita la espiral de la muerte
const DT_MAXIMO = 0.25;             // clamp duro tras un cambio de pestaña

export class Loop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.acumulador = 0;
    this.tiempoPrev = 0;
    this.corriendo = false;
    this.pausado = false;
    this.tick = 0;
    this.frame = 0;
    this.alpha = 0;
    this.velocidad = 1;             // para bullet-time / cámara lenta
    this.msSim = 0;
    this.msRender = 0;
    this.fps = 60;
    this._fpsAcum = 0;
    this._fpsFrames = 0;
    this._rafId = 0;
    this.onPausaCambio = null;
    this._pausadoPorFoco = false;

    this._loop = this._loop.bind(this);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._pausadoPorFoco = true;
        this.setPausa(true, true);
      } else {
        // Al volver, descartamos el tiempo transcurrido en vez de simularlo.
        this.tiempoPrev = performance.now();
        this.acumulador = 0;
        if (this._pausadoPorFoco) { this._pausadoPorFoco = false; }
      }
    });
  }

  iniciar() {
    if (this.corriendo) return;
    this.corriendo = true;
    this.tiempoPrev = performance.now();
    this.acumulador = 0;
    this._rafId = requestAnimationFrame(this._loop);
  }

  detener() {
    this.corriendo = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
  }

  setPausa(v, porFoco = false) {
    if (this.pausado === v) return;
    this.pausado = v;
    this.acumulador = 0;
    this.tiempoPrev = performance.now();
    if (this.onPausaCambio) this.onPausaCambio(v, porFoco);
  }

  togglePausa() { this.setPausa(!this.pausado); }

  /** Avanza exactamente un tick aunque esté en pausa (depuración paso a paso). */
  pasoManual() {
    const t0 = performance.now();
    this.update(PASO, this.tick++);
    this.msSim = performance.now() - t0;
    this.alpha = 1;
    this.render(this.alpha, 0);
  }

  _loop(ahora) {
    if (!this.corriendo) return;
    this._rafId = requestAnimationFrame(this._loop);

    let dt = (ahora - this.tiempoPrev) / 1000;
    this.tiempoPrev = ahora;
    if (dt > DT_MAXIMO) dt = DT_MAXIMO;
    if (dt < 0) dt = 0;

    this._fpsAcum += dt; this._fpsFrames++;
    if (this._fpsAcum >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAcum;
      this._fpsAcum = 0; this._fpsFrames = 0;
    }

    if (!this.pausado) {
      this.acumulador += dt * this.velocidad;
      let pasos = 0;
      const t0 = performance.now();
      while (this.acumulador >= PASO && pasos < MAX_PASOS_POR_FRAME) {
        this.update(PASO, this.tick++);
        this.acumulador -= PASO;
        pasos++;
      }
      if (pasos > 0) this.msSim = performance.now() - t0;
      // Si nos quedamos atrás sin remedio, tiramos el retraso en vez de acumularlo.
      if (this.acumulador > PASO * MAX_PASOS_POR_FRAME) this.acumulador = 0;
      this.alpha = this.acumulador / PASO;
    } else {
      this.alpha = 1;
    }

    const t1 = performance.now();
    this.render(this.alpha, dt);
    this.msRender = performance.now() - t1;
    this.frame++;
  }
}
