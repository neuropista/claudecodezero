// input.js — Teclado, ratón y mando reducidos a un estado compacto por tick.
//
// La simulación NUNCA lee el DOM: sólo consume el snapshot `InputFrame`, que es
// exactamente lo que se graba para la repetición.

export const BTN = {
  IZQ: 1 << 0, DER: 1 << 1, ARRIBA: 1 << 2, ABAJO: 1 << 3,
  SALTO: 1 << 4, DASH: 1 << 5, DISPARO: 1 << 6, PARRY: 1 << 7,
  GANCHO: 1 << 8, CAMBIO: 1 << 9, PAUSA: 1 << 10, INTERACTUAR: 1 << 11,
};

export const NOMBRE_BOTON = {
  IZQ: 'Izquierda', DER: 'Derecha', ARRIBA: 'Arriba', ABAJO: 'Abajo',
  SALTO: 'Saltar', DASH: 'Dash', DISPARO: 'Disparar', PARRY: 'Parry',
  GANCHO: 'Gancho', CAMBIO: 'Cambiar módulo', PAUSA: 'Pausa', INTERACTUAR: 'Interactuar',
};

/** Mapa por defecto: `code` de teclado -> botón. */
export const MAPA_DEFECTO = {
  KeyA: 'IZQ', ArrowLeft: 'IZQ',
  KeyD: 'DER', ArrowRight: 'DER',
  KeyW: 'ARRIBA', ArrowUp: 'ARRIBA',
  KeyS: 'ABAJO', ArrowDown: 'ABAJO',
  Space: 'SALTO', KeyK: 'SALTO',
  ShiftLeft: 'DASH', ShiftRight: 'DASH', KeyL: 'DASH',
  KeyJ: 'DISPARO', KeyZ: 'DISPARO',
  KeyF: 'PARRY', KeyX: 'PARRY',
  KeyE: 'GANCHO', KeyC: 'GANCHO',
  KeyQ: 'CAMBIO', Tab: 'CAMBIO',
  Escape: 'PAUSA', KeyP: 'PAUSA',
  Enter: 'INTERACTUAR',
};

const CUANTOS_ANGULO = 4096;

/** Snapshot inmutable-por-convención de la entrada de un tick. */
export class InputFrame {
  constructor() {
    this.buttons = 0;
    this.prev = 0;
    this.aim = 0;          // ángulo en radianes
    this.aimQ = 0;         // ángulo cuantizado (lo que se graba)
    this.usaRaton = 0;
  }
  down(b) { return (this.buttons & b) !== 0; }
  pressed(b) { return (this.buttons & b) !== 0 && (this.prev & b) === 0; }
  released(b) { return (this.buttons & b) === 0 && (this.prev & b) !== 0; }
  axisX() { return (this.down(BTN.DER) ? 1 : 0) - (this.down(BTN.IZQ) ? 1 : 0); }
  axisY() { return (this.down(BTN.ABAJO) ? 1 : 0) - (this.down(BTN.ARRIBA) ? 1 : 0); }
}

export class Input {
  constructor(canvas, mapa = MAPA_DEFECTO) {
    this.canvas = canvas;
    this.mapa = { ...mapa };
    this.raw = 0;            // botones crudos acumulados entre ticks
    this.rawSticky = 0;      // pulsaciones que ocurrieron dentro del tick
    this.frame = new InputFrame();
    this.frameUI = new InputFrame();
    this.mouseX = 0; this.mouseY = 0;
    this.mouseEnCanvas = false;
    this.usaRaton = false;
    this.gamepadIndex = -1;
    this.capturaTeclas = true;
    this.textoUltimaTecla = '';
    this._bind();
  }

  _bind() {
    const onKey = (e, abajo) => {
      if (!this.capturaTeclas) return;
      const nombre = this.mapa[e.code];
      if (nombre === undefined) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      const bit = BTN[nombre];
      if (abajo) {
        if ((this.raw & bit) === 0) this.rawSticky |= bit;
        this.raw |= bit;
        this.usaRaton = false;
      } else {
        this.raw &= ~bit;
      }
    };
    this._onDown = (e) => onKey(e, true);
    this._onUp = (e) => onKey(e, false);
    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
    window.addEventListener('blur', () => { this.raw = 0; });

    const c = this.canvas;
    c.addEventListener('mousemove', (e) => {
      const r = c.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) * (c.width / r.width);
      this.mouseY = (e.clientY - r.top) * (c.height / r.height);
      this.mouseEnCanvas = true;
      this.usaRaton = true;
    });
    c.addEventListener('mouseleave', () => { this.mouseEnCanvas = false; });
    c.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const bit = e.button === 0 ? BTN.DISPARO : e.button === 2 ? BTN.GANCHO : BTN.PARRY;
      if ((this.raw & bit) === 0) this.rawSticky |= bit;
      this.raw |= bit;
      this.usaRaton = true;
    });
    window.addEventListener('mouseup', (e) => {
      const bit = e.button === 0 ? BTN.DISPARO : e.button === 2 ? BTN.GANCHO : BTN.PARRY;
      this.raw &= ~bit;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('gamepadconnected', (e) => { this.gamepadIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { this.gamepadIndex = -1; });
  }

  _leerMando() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return 0;
    const pads = navigator.getGamepads();
    let bits = 0;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (ax < -0.4) bits |= BTN.IZQ;
      if (ax > 0.4) bits |= BTN.DER;
      if (ay < -0.4) bits |= BTN.ARRIBA;
      if (ay > 0.4) bits |= BTN.ABAJO;
      const b = p.buttons;
      if (b[0] && b[0].pressed) bits |= BTN.SALTO;
      if (b[1] && b[1].pressed) bits |= BTN.PARRY;
      if (b[2] && b[2].pressed) bits |= BTN.GANCHO;
      if (b[3] && b[3].pressed) bits |= BTN.CAMBIO;
      if (b[5] && b[5].pressed) bits |= BTN.DISPARO;
      if (b[7] && b[7].value > 0.4) bits |= BTN.DISPARO;
      if (b[6] && b[6].value > 0.4) bits |= BTN.DASH;
      if (b[4] && b[4].pressed) bits |= BTN.DASH;
      if (b[9] && b[9].pressed) bits |= BTN.PAUSA;
      // Apuntado con el stick derecho.
      const rx = p.axes[2] || 0, ry = p.axes[3] || 0;
      if (rx * rx + ry * ry > 0.16) {
        this._padAim = Math.atan2(ry, rx);
        this._padAimActivo = true;
        this.usaRaton = false;
      } else this._padAimActivo = false;
      break;
    }
    return bits;
  }

  /**
   * Construye el snapshot del tick. `aimOriginX/Y` son las coordenadas de
   * pantalla del jugador, necesarias para convertir el ratón en un ángulo.
   */
  sample(aimOriginX, aimOriginY, facing) {
    const f = this.frame;
    f.prev = f.buttons;
    f.buttons = (this.raw | this.rawSticky | this._leerMando()) & 0xffff;
    this.rawSticky = 0;

    let ang;
    if (this._padAimActivo) {
      ang = this._padAim;
    } else if (this.usaRaton && this.mouseEnCanvas) {
      ang = Math.atan2(this.mouseY - aimOriginY, this.mouseX - aimOriginX);
    } else {
      // Sin ratón: se apunta con las direcciones o hacia donde se mira.
      const ax = f.axisX(), ay = f.axisY();
      ang = (ax === 0 && ay === 0) ? (facing < 0 ? Math.PI : 0) : Math.atan2(ay, ax);
    }
    f.usaRaton = this.usaRaton ? 1 : 0;
    // Cuantizar es lo que garantiza que grabación y repetición coincidan bit a bit.
    f.aimQ = ((ang / (Math.PI * 2)) * CUANTOS_ANGULO + CUANTOS_ANGULO * 4) & (CUANTOS_ANGULO - 1);
    f.aim = (f.aimQ / CUANTOS_ANGULO) * Math.PI * 2;
    return f;
  }

  /**
   * Snapshot independiente para menús: la interfaz responde aunque la
   * simulación esté pausada y no se estén consumiendo ticks.
   */
  sampleUI() {
    const f = this.frameUI;
    f.prev = f.buttons;
    f.buttons = (this.raw | this._leerMando()) & 0xffff;
    f.usaRaton = this.usaRaton ? 1 : 0;
    return f;
  }

  /** Inyecta un frame grabado (modo repetición). */
  aplicarGrabado(frame, buttons, aimQ) {
    frame.prev = frame.buttons;
    frame.buttons = buttons;
    frame.aimQ = aimQ;
    frame.aim = (aimQ / CUANTOS_ANGULO) * Math.PI * 2;
    return frame;
  }

  reasignar(code, nombreBoton) {
    for (const k of Object.keys(this.mapa)) if (this.mapa[k] === nombreBoton && k === code) return;
    this.mapa[code] = nombreBoton;
  }
}

export const ANGULO_CUANTOS = CUANTOS_ANGULO;
