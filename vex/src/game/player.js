// player.js — Vex: el control del personaje.
//
// Todo el "game feel" vive aquí: coyote time, buffer de salto, salto de altura
// variable, aceleraciones distintas en suelo y aire, dash con i-frames,
// wall-jump, gancho con física de péndulo y parry de ventana estrecha.
// El jugador es una entidad del ECS como cualquier otra; esta clase sólo
// guarda el estado de control y escribe en los arrays.

import { BTN } from '../core/input.js';
import { EV } from '../core/events.js';
import { MASK, TIPO, FLAG } from './components.js';
import { TAM, T } from './tiles.js';
import { clamp, approach, lerp, damp, sign } from '../core/math.js';

export const ESTADO = {
  SUELO: 0, AIRE: 1, DASH: 2, PARED: 3, GANCHO: 4, GOLPEADO: 5, MUERTO: 6, ENTRANDO: 7,
};

export const P = {
  HW: 11, HH: 15,
  GRAVEDAD: 2150,
  GRAVEDAD_SUBIDA: 1480,        // mientras se mantiene el salto
  GRAVEDAD_APEX: 1180,          // cerca del vértice: se siente "flotante"
  CAIDA_MAX: 980,
  VEL_MAX: 305,
  ACEL_SUELO: 2600, FRIC_SUELO: 3100,
  ACEL_AIRE: 1850, FRIC_AIRE: 780,
  SALTO_VEL: 615,
  SALTO_CORTO: 0.40,
  COYOTE: 0.10,
  BUFFER: 0.13,
  DASH_VEL: 790, DASH_DUR: 0.155, DASH_CD: 0.60, DASH_IFRAMES: 0.20,
  PARED_DESLIZ: 150, PARED_AGARRE: 0.16,
  PARED_SALTO_X: 345, PARED_SALTO_Y: 575,
  PARRY_VENTANA: 0.15, PARRY_CD: 0.52, PARRY_RADIO: 62,
  GANCHO_ALCANCE: 430, GANCHO_MIN: 46,
  GANCHO_RECOGE: 260, GANCHO_IMPULSO: 1600,
  IFRAMES_DANIO: 1.05,
  VIDA_MAX: 100,
  FLOTABILIDAD: -420, ARRASTRE_FLUIDO: 3.2,
};

export class Jugador {
  constructor(mundo) {
    this.mundo = mundo;
    this.id = -1;
    this.reset();
  }

  reset() {
    this.estado = ESTADO.ENTRANDO;
    this.coyote = 0;
    this.buffer = 0;
    this.saltosRestantes = 2;
    this.saltoMantenido = false;
    this.dashCd = 0;
    this.dashT = 0;
    this.dashDisponible = true;
    this.dashAngulo = 0;
    this.paredDir = 0;
    this.paredT = 0;
    this.parryT = 0;
    this.parryCd = 0;
    this.parryExito = 0;
    this.ganchoActivo = false;
    this.ganchoLanzando = 0;
    this.ganchoX = 0; this.ganchoY = 0;
    this.ganchoLen = 0;
    this.ganchoCd = 0;
    this.iframes = 0;
    this.golpeadoT = 0;
    this.muertoT = 0;
    this.squash = 1;
    this.squashVel = 0;
    this.enFluido = false;
    this.aim = 0;
    this.energia = 100;
    this.combo = 0;
    this.comboT = 0;
    this.tiempoAire = 0;
    this.ultimaVelY = 0;
    this.entradaT = 0;
    this.estelaT = 0;
  }

  /** Crea la entidad del jugador dentro del almacén. */
  crear(x, y) {
    const S = this.mundo.ent;
    this.id = this.mundo.crearEntidad(MASK.FISICA | MASK.SPRITE | MASK.VIDA | MASK.JUGADOR | MASK.LUZ);
    const e = this.id;
    S.x[e] = x; S.y[e] = y; S.px[e] = x; S.py[e] = y;
    S.vx[e] = 0; S.vy[e] = 0;
    S.hw[e] = P.HW; S.hh[e] = P.HH;
    S.tipo[e] = TIPO.JUGADOR;
    S.equipo[e] = 0;
    S.vida[e] = S.vida[e] > 0 ? S.vida[e] : P.VIDA_MAX;
    S.vidaMax[e] = P.VIDA_MAX;
    S.facing[e] = 1;
    S.escala[e] = 1;
    S.luzR[e] = 0.45; S.luzG[e] = 0.85; S.luzB[e] = 1;
    S.luzRadio[e] = 320; S.luzInt[e] = 1.25;
    S.flags[e] = FLAG.MIRA_DERECHA;
    return e;
  }

  get S() { return this.mundo.ent; }
  get x() { return this.mundo.ent.x[this.id]; }
  set x(v) { this.mundo.ent.x[this.id] = v; }
  get y() { return this.mundo.ent.y[this.id]; }
  set y(v) { this.mundo.ent.y[this.id] = v; }
  get vx() { return this.mundo.ent.vx[this.id]; }
  set vx(v) { this.mundo.ent.vx[this.id] = v; }
  get vy() { return this.mundo.ent.vy[this.id]; }
  set vy(v) { this.mundo.ent.vy[this.id] = v; }
  get vida() { return this.mundo.ent.vida[this.id]; }
  set vida(v) { this.mundo.ent.vida[this.id] = v; }
  get facing() { return this.mundo.ent.facing[this.id]; }
  set facing(v) { this.mundo.ent.facing[this.id] = v; }

  colocar(x, y) {
    this.x = x; this.y = y;
    this.S.px[this.id] = x; this.S.py[this.id] = y;
    this.vx = 0; this.vy = 0;
    this.estado = ESTADO.ENTRANDO;
    this.entradaT = 0.35;
    this.ganchoActivo = false;
  }

  // ---------------------------------------------------------------- tick ---

  actualizar(dt, input) {
    const M = this.mundo;
    const S = this.S;
    const e = this.id;
    S.px[e] = S.x[e]; S.py[e] = S.y[e];

    if (this.estado === ESTADO.MUERTO) {
      this.muertoT += dt;
      this._integrarSimple(dt);
      return;
    }

    this.dashCd = Math.max(0, this.dashCd - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.ganchoCd = Math.max(0, this.ganchoCd - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.parryExito = Math.max(0, this.parryExito - dt);
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT <= 0) this.combo = 0;
    S.iframes[e] = this.iframes;
    S.flash[e] = Math.max(0, S.flash[e] - dt * 5);

    if (this.estado === ESTADO.ENTRANDO) {
      this.entradaT -= dt;
      if (this.entradaT <= 0) this.estado = ESTADO.AIRE;
    }

    this.aim = input.aim;

    // --- Buffers de entrada ---
    if (input.pressed(BTN.SALTO)) this.buffer = P.BUFFER;
    else this.buffer = Math.max(0, this.buffer - dt);
    this.saltoMantenido = input.down(BTN.SALTO);

    const ejeX = input.axisX();
    const abajo = input.down(BTN.ABAJO);

    // --- Parry (ventana estrecha) ---
    this.parryT = Math.max(0, this.parryT - dt);
    if (input.pressed(BTN.PARRY) && this.parryCd <= 0 && this.estado !== ESTADO.GOLPEADO) {
      this.parryT = P.PARRY_VENTANA;
      this.parryCd = P.PARRY_CD;
      M.eventos.emit(EV.PARRY, this.x, this.y, 0, 0);
    }
    if (this.parryT > 0) this._resolverParry();

    // --- Gancho ---
    if (input.pressed(BTN.GANCHO) && this.ganchoCd <= 0) {
      if (this.ganchoActivo) this._soltarGancho(true);
      else this._lanzarGancho();
    }
    if (this.ganchoActivo && !input.down(BTN.GANCHO) && this.ganchoSostenido) this._soltarGancho(false);

    // --- Dash ---
    if (input.pressed(BTN.DASH) && this.dashCd <= 0 && this.dashDisponible && this.estado !== ESTADO.GOLPEADO) {
      this._iniciarDash(input);
    }

    switch (this.estado) {
      case ESTADO.DASH: this._tickDash(dt, ejeX); break;
      case ESTADO.GANCHO: this._tickGancho(dt, ejeX, input); break;
      case ESTADO.GOLPEADO: this._tickGolpeado(dt); break;
      default: this._tickNormal(dt, ejeX, abajo, input); break;
    }

    this._integrar(dt, abajo, input);
    this._animar(dt, ejeX);
  }

  // ------------------------------------------------------------ estados ----

  _tickNormal(dt, ejeX, abajo, input) {
    const enSuelo = this.estado === ESTADO.SUELO;
    const acel = enSuelo ? P.ACEL_SUELO : P.ACEL_AIRE;
    const fric = enSuelo ? P.FRIC_SUELO : P.FRIC_AIRE;
    let vmax = P.VEL_MAX;
    if (this.enFluido) vmax *= 0.72;

    if (ejeX !== 0) {
      // Girar en seco es más rápido que acelerar desde parado: responde mejor.
      const girando = sign(this.vx) !== 0 && sign(this.vx) !== ejeX;
      this.vx = approach(this.vx, ejeX * vmax, acel * (girando ? 1.9 : 1) * dt);
      this.facing = ejeX;
    } else {
      this.vx = approach(this.vx, 0, fric * dt);
    }

    // Deslizamiento por pared.
    if (this.paredDir !== 0 && !enSuelo && this.vy > 0 && ejeX === this.paredDir) {
      this.estado = ESTADO.PARED;
      this.vy = Math.min(this.vy, P.PARED_DESLIZ);
      this.paredT = P.PARED_AGARRE;
      this.saltosRestantes = Math.max(this.saltosRestantes, 1);
      this.dashDisponible = true;
    } else if (this.estado === ESTADO.PARED && (this.paredDir === 0 || ejeX === -this.paredDir)) {
      this.estado = ESTADO.AIRE;
    }

    // Salto (con coyote y buffer).
    if (this.buffer > 0) {
      if (this.estado === ESTADO.PARED || (this.paredDir !== 0 && this.paredT > 0)) {
        this._saltoPared();
      } else if (this.coyote > 0) {
        this._salto(false);
      } else if (this.saltosRestantes > 0) {
        this._salto(true);
      }
    }
  }

  _salto(doble) {
    this.vy = -P.SALTO_VEL * (doble ? 0.92 : 1);
    this.buffer = 0;
    this.coyote = 0;
    this.estado = ESTADO.AIRE;
    this.saltosRestantes = doble ? this.saltosRestantes - 1 : 1;
    this.squashVel = doble ? -5.5 : -7;
    this.mundo.eventos.emit(doble ? EV.DOBLE_SALTO : EV.SALTO, this.x, this.y, 1, 0);
    if (doble) this.mundo.fx.anilloDobleSalto(this.x, this.y);
  }

  _saltoPared() {
    this.vx = -this.paredDir * P.PARED_SALTO_X;
    this.vy = -P.PARED_SALTO_Y;
    this.facing = -this.paredDir;
    this.buffer = 0;
    this.paredT = 0;
    this.paredDir = 0;
    this.estado = ESTADO.AIRE;
    this.saltosRestantes = 1;
    this.squashVel = -6;
    this.mundo.eventos.emit(EV.SALTO, this.x, this.y, 1.2, 0);
    this.mundo.fx.polvoPared(this.x, this.y, -this.facing);
  }

  _iniciarDash(input) {
    const ejeX = input.axisX(), ejeY = input.axisY();
    let ang;
    if (ejeX !== 0 || ejeY !== 0) ang = Math.atan2(ejeY, ejeX);
    else if (input.usaRaton) ang = input.aim;
    else ang = this.facing > 0 ? 0 : Math.PI;

    this.dashAngulo = ang;
    this.dashT = P.DASH_DUR;
    this.dashCd = P.DASH_CD;
    this.dashDisponible = false;
    this.estado = ESTADO.DASH;
    this.iframes = Math.max(this.iframes, P.DASH_IFRAMES);
    this.vx = Math.cos(ang) * P.DASH_VEL;
    this.vy = Math.sin(ang) * P.DASH_VEL;
    if (Math.abs(Math.cos(ang)) > 0.2) this.facing = sign(Math.cos(ang));
    this.squashVel = -4;
    if (this.ganchoActivo) this._soltarGancho(true);
    this.mundo.eventos.emit(EV.DASH, this.x, this.y, 1, 0);
    this.mundo.fx.dash(this.x, this.y, ang);
  }

  _tickDash(dt) {
    this.dashT -= dt;
    this.estelaT -= dt;
    if (this.estelaT <= 0) {
      this.mundo.fx.estelaDash(this.x, this.y, this.vx, this.vy);
      this.estelaT = 0.018;
    }
    if (this.dashT <= 0) {
      this.estado = ESTADO.AIRE;
      // Corte suave al salir: conserva impulso pero no dispara al infinito.
      this.vx *= 0.55; this.vy *= 0.4;
    }
  }

  _lanzarGancho() {
    const M = this.mundo;
    const ang = this.aim;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const dist = M.fisica.raycast(this.x, this.y, dx, dy, P.GANCHO_ALCANCE);
    if (dist >= P.GANCHO_ALCANCE - 1 || dist < P.GANCHO_MIN) {
      M.eventos.emit(EV.GANCHO_SUELTA, this.x, this.y, 0, 0);
      this.ganchoCd = 0.18;
      return;
    }
    this.ganchoX = this.x + dx * dist;
    this.ganchoY = this.y + dy * dist;
    this.ganchoLen = dist;
    this.ganchoActivo = true;
    this.ganchoSostenido = true;
    this.estado = ESTADO.GANCHO;
    this.ganchoCd = 0.12;
    M.eventos.emit(EV.GANCHO, this.ganchoX, this.ganchoY, 1, 0);
    M.fx.anclaGancho(this.ganchoX, this.ganchoY);
  }

  _soltarGancho(conImpulso) {
    if (!this.ganchoActivo) return;
    this.ganchoActivo = false;
    this.ganchoSostenido = false;
    if (this.estado === ESTADO.GANCHO) this.estado = ESTADO.AIRE;
    if (conImpulso) {
      // Pequeño extra vertical al soltar arriba: recompensa el buen timing.
      if (this.vy < -80) this.vy -= 90;
      this.saltosRestantes = Math.max(this.saltosRestantes, 1);
    }
    this.ganchoCd = 0.14;
    this.mundo.eventos.emit(EV.GANCHO_SUELTA, this.x, this.y, 0, 0);
  }

  _tickGancho(dt, ejeX, input) {
    const dx = this.x - this.ganchoX;
    const dy = this.y - this.ganchoY;
    const len = Math.hypot(dx, dy) || 0.0001;

    // Recoger o soltar cuerda.
    if (input.down(BTN.ARRIBA)) this.ganchoLen = Math.max(P.GANCHO_MIN, this.ganchoLen - P.GANCHO_RECOGE * dt);
    if (input.down(BTN.ABAJO)) this.ganchoLen = Math.min(P.GANCHO_ALCANCE, this.ganchoLen + P.GANCHO_RECOGE * dt);

    // Gravedad completa: el péndulo necesita energía.
    this.vy += P.GRAVEDAD * dt;
    // Empuje tangencial del jugador para bombear el balanceo.
    if (ejeX !== 0) {
      const tx = -dy / len, ty = dx / len;
      const signo = sign(tx * ejeX) || 1;
      this.vx += tx * signo * 900 * dt;
      this.vy += ty * signo * 900 * dt;
      this.facing = ejeX;
    }

    if (this.buffer > 0) {
      this._soltarGancho(true);
      this._salto(false);
      return;
    }
  }

  _tickGolpeado(dt) {
    this.golpeadoT -= dt;
    this.vx = approach(this.vx, 0, 900 * dt);
    if (this.golpeadoT <= 0) this.estado = ESTADO.AIRE;
  }

  // --------------------------------------------------------- integración ---

  _integrar(dt, abajo, input) {
    const M = this.mundo;
    const S = this.S, e = this.id;

    // Gravedad con tres tramos: subida, ápex y caída.
    if (this.estado !== ESTADO.DASH && this.estado !== ESTADO.GANCHO) {
      let g = P.GRAVEDAD;
      if (this.vy < 0 && this.saltoMantenido) g = P.GRAVEDAD_SUBIDA;
      if (Math.abs(this.vy) < 90) g = P.GRAVEDAD_APEX;
      if (this.enFluido) {
        this.vy += (g + P.FLOTABILIDAD) * dt;
        this.vy = damp(this.vy, 0, P.ARRASTRE_FLUIDO, dt);
        this.vx = damp(this.vx, this.vx * 0.9, P.ARRASTRE_FLUIDO, dt);
      } else {
        this.vy += g * dt;
      }
      // Corte del salto al soltar el botón: altura variable.
      if (!this.saltoMantenido && this.vy < -140 && this.estado !== ESTADO.PARED) {
        this.vy += P.SALTO_VEL * P.SALTO_CORTO * 8 * dt;
      }
      if (this.vy > P.CAIDA_MAX) this.vy = P.CAIDA_MAX;
    }

    const pos = M.tmpPos;
    const opciones = M.tmpOpciones;
    opciones.atraviesaUnaVia = abajo && this.vy >= 0 && input.down(BTN.ABAJO);
    opciones.ignoraRampas = false;

    const r = M.fisica.mover(pos, S.x[e], S.y[e], P.HW, P.HH, this.vx * dt, this.vy * dt, opciones, M.tmpRes);
    S.x[e] = pos[0]; S.y[e] = pos[1];

    // Plataformas móviles: colisión y arrastre.
    const soporte = M.resolverPlataformas(this, r);

    this.enFluido = r.enFluido;
    if (r.enFluido) S.flags[e] |= FLAG.EN_AGUA; else S.flags[e] &= ~FLAG.EN_AGUA;

    if (r.chocoX !== 0) {
      this.vx = 0;
      this.paredDir = r.chocoX;
      this.paredT = P.PARED_AGARRE;
    } else {
      this.paredT = Math.max(0, this.paredT - dt);
      if (this.paredT <= 0) this.paredDir = 0;
    }

    if (r.chocoY === -1 && this.vy < 0) this.vy = 0;

    const estabaEnAire = this.estado !== ESTADO.SUELO;
    if (r.enSuelo || soporte) {
      if (this.estado !== ESTADO.DASH && this.estado !== ESTADO.GANCHO) {
        if (estabaEnAire && this.ultimaVelY > 240) {
          const fuerza = clamp(this.ultimaVelY / P.CAIDA_MAX, 0.2, 1.4);
          M.eventos.emit(EV.ATERRIZAJE, this.x, this.y, fuerza, 0);
          M.fx.aterrizaje(this.x, this.y + P.HH, fuerza);
          this.squashVel = 9 * fuerza;
          M.camara.sacudir(0.06 * fuerza);
        }
        this.estado = ESTADO.SUELO;
      }
      if (this.vy > 0) this.vy = 0;
      this.coyote = P.COYOTE;
      this.saltosRestantes = 2;
      this.dashDisponible = true;
      this.tiempoAire = 0;
      if (r.cintaVel !== 0) S.x[e] += r.cintaVel * dt;
    } else {
      if (this.estado === ESTADO.SUELO) this.estado = ESTADO.AIRE;
      this.coyote = Math.max(0, this.coyote - dt);
      this.tiempoAire += dt;
    }
    this.ultimaVelY = this.vy;

    if (r.tileDanino) M.danarJugador(14, this.x, this.y - 20, 0);

    // Límites de la sala.
    const sala = M.sala;
    if (sala) {
      S.x[e] = clamp(S.x[e], P.HW + 2, sala.anchoPx - P.HW - 2);
      if (S.y[e] > sala.altoPx + 120) M.danarJugador(9999, this.x, this.y, 0);
    }
  }

  _integrarSimple(dt) {
    const S = this.S, e = this.id;
    this.vy += P.GRAVEDAD * dt;
    const pos = this.mundo.tmpPos;
    this.mundo.fisica.mover(pos, S.x[e], S.y[e], P.HW, P.HH, this.vx * dt, this.vy * dt, null, this.mundo.tmpRes);
    S.x[e] = pos[0]; S.y[e] = pos[1];
    this.vx = approach(this.vx, 0, 400 * dt);
  }

  // ------------------------------------------------------------- parry -----

  _resolverParry() {
    const M = this.mundo;
    const S = M.ent;
    let reflejados = 0;
    for (let i = 0; i < S.count; i++) {
      const e = S.dense[i];
      if (S.alive[e] !== 1) continue;
      if (S.tipo[e] !== TIPO.BALA_ENEMIGA) continue;
      const dx = S.x[e] - this.x, dy = S.y[e] - this.y;
      if (dx * dx + dy * dy > P.PARRY_RADIO * P.PARRY_RADIO) continue;
      // Reflejar: cambia de equipo, dobla daño y sale hacia donde apuntas.
      const vel = Math.hypot(S.vx[e], S.vy[e]) * 1.55 + 220;
      const ang = this.aim;
      S.vx[e] = Math.cos(ang) * vel;
      S.vy[e] = Math.sin(ang) * vel;
      S.equipo[e] = 0;
      S.tipo[e] = TIPO.BALA_JUGADOR;
      S.dmg[e] = S.dmg[e] * 2.4 + 8;
      S.flags[e] |= FLAG.REFLEJADO;
      S.golpes[e] = 2;
      S.vida[e] = Math.max(S.vida[e], 2.0);
      S.luzR[e] = 1; S.luzG[e] = 0.5; S.luzB[e] = 0.95;
      reflejados++;
    }
    if (reflejados > 0) {
      this.parryT = 0;
      this.parryExito = 0.35;
      this.iframes = Math.max(this.iframes, 0.28);
      M.eventos.emit(EV.PARRY, this.x, this.y, 1, reflejados);
      M.fx.parry(this.x, this.y, reflejados);
      M.hitstop(0.085, true);
      M.camara.sacudir(0.28);
      M.energiaParry(reflejados);
    }
  }

  // ------------------------------------------------------------- daño ------

  recibirDanio(cantidad, desdeX) {
    if (this.iframes > 0 || this.estado === ESTADO.MUERTO) return false;
    if (this.estado === ESTADO.DASH) return false;
    const S = this.S, e = this.id;
    S.vida[e] -= cantidad;
    this.iframes = P.IFRAMES_DANIO;
    this.combo = 0;
    const dir = desdeX === undefined ? -this.facing : sign(this.x - desdeX) || 1;
    this.vx = dir * 235;
    this.vy = -255;
    this.golpeadoT = 0.22;
    this.estado = ESTADO.GOLPEADO;
    S.flash[e] = 1;
    if (this.ganchoActivo) this._soltarGancho(false);
    if (S.vida[e] <= 0) {
      S.vida[e] = 0;
      this.estado = ESTADO.MUERTO;
      this.muertoT = 0;
    }
    return true;
  }

  curar(cantidad) {
    const S = this.S, e = this.id;
    S.vida[e] = Math.min(S.vidaMax[e], S.vida[e] + cantidad);
  }

  // ---------------------------------------------------------- animación ----

  _animar(dt, ejeX) {
    const S = this.S, e = this.id;
    // Squash & stretch con muelle amortiguado.
    const objetivo = 1;
    const k = 190, amort = 18;
    this.squashVel += (objetivo - this.squash) * k * dt - this.squashVel * amort * dt;
    this.squash += this.squashVel * dt;
    this.squash = clamp(this.squash, 0.62, 1.42);

    S.anim[e] += dt;
    if (this.facing !== 0) {
      if (this.facing > 0) S.flags[e] |= FLAG.MIRA_DERECHA;
      else S.flags[e] &= ~FLAG.MIRA_DERECHA;
    }
    S.escala[e] = this.squash;
  }

  /** Sprite y fotograma actuales, según el estado. */
  spriteActual(R) {
    const vel = Math.abs(this.vx);
    switch (this.estado) {
      case ESTADO.DASH: return R.idx('vex.dash');
      case ESTADO.PARED: return R.idx('vex.pared');
      case ESTADO.GOLPEADO: return R.idx('vex.golpe');
      case ESTADO.MUERTO: return R.idx('vex.golpe');
      case ESTADO.GANCHO: return R.idx('vex.salto');
      case ESTADO.SUELO: {
        if (this.parryT > 0) return R.idx('vex.parry');
        if (vel > 24) {
          const f = Math.floor((this.S.anim[this.id] * (7 + vel * 0.022)) % 8);
          return R.idx('vex.correr.0') + f;
        }
        const f = Math.floor((this.S.anim[this.id] * 5.2) % 6);
        return R.idx('vex.idle.0') + f;
      }
      default:
        if (this.parryT > 0) return R.idx('vex.parry');
        return this.vy < -30 ? R.idx('vex.salto') : R.idx('vex.caida');
    }
  }
}
