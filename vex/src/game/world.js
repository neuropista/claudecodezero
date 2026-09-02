// world.js — La simulación. Un tick de este archivo es un tick de juego.
//
// Reglas de la casa:
//  · Aquí nunca se usa Math.random ni Date: sólo `this.rng`.
//  · Aquí nunca se toca el DOM ni WebGL.
//  · Aquí no se asigna memoria en el bucle caliente: todo sale de pools.
// Cumplir esas tres cosas es lo que hace que la repetición sea exacta.

import { crearAlmacen, MASK, TIPO, FLAG, ELITE, NOMBRE_ENEMIGO } from './components.js';
import { Fisica } from './physics.js';
import { generarSala, TIPO_SALA } from './level.js';
import { TAM, T, esSolido } from './tiles.js';
import { Jugador, ESTADO, P } from './player.js';
import { Arma, disparar, actualizarProyectil, comboDe, MOD, LISTA_MODULOS, MAX_EQUIPADOS } from './weapons.js';
import {
  crearEnemigo, actualizarEnemigo, dispararEnemigo, bloqueaEscudo, reflejaEspejo,
  desgastarAguante, puntoDebil, factorDanio, separarEnemigos, partirDivisor, STATS,
} from './enemies.js';
import { crearJefe, actualizarJefe, actualizarOjo, ojosVivos } from './boss.js';
import { Trampas, crearEscombro, actualizarRigido } from './hazards.js';
import { crearPickup, actualizarPickup } from './pickups.js';
import { Progresion, BIOMAS } from './progression.js';
import { Fx } from './fx.js';
import { Rejilla } from './broadphase.js';
import { EventBus, EV } from '../core/events.js';
import { Rng, seedFrom } from '../core/rng.js';
import { hashTyped } from '../core/replay.js';
import { BTN } from '../core/input.js';
import { clamp, lerp, damp, sign, TAU } from '../core/math.js';

export const FASE = {
  MENU: 0, JUGANDO: 1, TRANSICION: 2, MUERTE: 3, VICTORIA: 4, PAUSA: 5,
};

const MAX_ARCOS = 64;

/** Diferencia angular mínima con signo. Local para no cargar el import. */
function angleDeltaLocal(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
const HITSTOP_MAX = 0.30;              // techo duro de congelacion
const TICKS_RECARGA_HITSTOP = 5;       // minimo entre micro-parones de impacto
const MAX_TICKS_CONGELADOS = 14;       // garantia: la simulacion siempre avanza

export class Mundo {
  constructor(renderer, eventos) {
    this.R = renderer;
    this.eventos = eventos || new EventBus();
    this.ent = crearAlmacen();
    this.fisica = new Fisica();
    this.camara = renderer.camara;
    this.post = renderer.post;
    this.fx = new Fx(this);
    this.trampas = new Trampas(this);
    this.rejillaEnemigos = new Rejilla(this.ent.capacity, 96);

    this.jugador = new Jugador(this);
    this.arma = new Arma();

    this.tmpPos = new Float32Array(2);
    this.tmpRes = null;
    this.tmpOpciones = { atraviesaUnaVia: false, ignoraRampas: false };
    this.tmpIds = new Int32Array(this.ent.capacity);
    this.tmpVista = new Float32Array(4);
    this.tmpDebil = new Float32Array(4);   // x, y, radio, multiplicador

    // Arcos eléctricos y rayos, sólo para dibujar.
    this.arcos = {
      x0: new Float32Array(MAX_ARCOS), y0: new Float32Array(MAX_ARCOS),
      x1: new Float32Array(MAX_ARCOS), y1: new Float32Array(MAX_ARCOS),
      t: new Float32Array(MAX_ARCOS), n: 0,
    };
    this.laser = { activo: false, x: 0, y: 0, ang: 0, largo: 0, dmg: 0 };

    this.fase = FASE.MENU;
    this.tick = 0;
    this.tiempo = 0;
    this.semilla = 1;
    this.hitstopT = 0;
    this.ticksCongelados = 0;
    this._ultimoHitstopTick = -999;
    this._hitstopBloqueadoHasta = 0;
    this.ralentiT = 0;
    this.escalaTiempo = 1;
    this.fundido = 0;
    this.fundidoObjetivo = 0;
    this.transicionT = 0;
    this.mensaje = '';
    this.mensajeT = 0;
    this.mensajeSub = '';
    this.jefeId = -1;
    this.nivelJefe = 0;
    this.estadoSala = 0;      // 0 explorando, 1 combate, 2 limpia
    this.oleadaActual = 0;
    this.oleadaT = 0;
    this.enemigosVivos = 0;
    this.tiempoSinCombate = 0;
    this.avisoModulo = null;
    this.puertaUsada = false;
    this.contadorSpawn = 0;
    this.estadisticas = { entidades: 0, enemigos: 0, proyectiles: 0 };
  }

  // ------------------------------------------------------- ciclo de vida ---

  nuevaPartida(semilla) {
    this.semilla = seedFrom(semilla);
    this.rng = new Rng(this.semilla ^ 0x9e3779b9);
    this.rngNivel = new Rng(this.semilla ^ 0x51ed270b);
    this.progresion = new Progresion(new Rng(this.semilla ^ 0x2545f491));
    this.ent.clear();
    this.arma.reset();
    this.jugador.reset();
    this.jugador.crear(200, 200);
    this.ent.vida[this.jugador.id] = P.VIDA_MAX;
    this.tick = 0;
    this.tiempo = 0;
    this.hitstopT = 0;
    this.ticksCongelados = 0;
    this._ultimoHitstopTick = -999;
    this._hitstopBloqueadoHasta = 0;
    this.ralentiT = 0;
    this.escalaTiempo = 1;
    this.fase = FASE.JUGANDO;
    this.fundido = 1;
    this.fundidoObjetivo = 0;
    this.jefeId = -1;
    this.mensajeT = 0;
    this.cargarSala(0);
    return this;
  }

  cargarSala(indice) {
    const prog = this.progresion;
    prog.salaIndice = clamp(indice, 0, prog.plan.length - 1);
    const entrada = prog.actual;
    prog.bioma = entrada.bioma;

    // Semilla propia por sala: la generación no depende de lo que haya hecho
    // el jugador hasta ahora, sólo de la semilla de la partida.
    this.rngNivel.seed(this.semilla ^ (0x85ebca6b + prog.salaIndice * 2654435761));
    const sala = generarSala(this.rngNivel, {
      tipo: entrada.tipo,
      bioma: entrada.bioma,
      indice: prog.salaIndice,
      dificultad: prog.dificultad(),
      primera: prog.salaIndice === 0,
      ultima: prog.esUltima,
    });
    this.sala = sala;
    this.fisica.setSala(sala);
    this.trampas.cargar(sala);
    this.rejillaEnemigos.configurar(0, 0, sala.anchoPx, sala.altoPx);

    // Limpia todo menos al jugador.
    const S = this.ent;
    for (let i = S.count - 1; i >= 0; i--) {
      const e = S.dense[i];
      if (e !== this.jugador.id) S.kill(e);
    }
    S.flush();

    this.jugador.colocar(sala.entrada.x, sala.entrada.y);
    this.camara.fijar(sala.entrada.x, sala.entrada.y - 40);
    this.camara.setLimites(0, 0, sala.anchoPx, sala.altoPx);

    this.arcos.n = 0;
    this.arma.orbitales = 0;
    this.oleadaActual = 0;
    this.enemigosVivos = 0;
    this.puertaUsada = false;
    this.jefeId = -1;

    // Props que se convierten en entidades.
    for (const p of sala.props) {
      if (p.tipo === 'torreta') {
        const e = crearEnemigo(this, TIPO.TORRETA, p.x, p.y, false, prog.escalaVida());
        if (e >= 0) S.d[e] = p.cadencia;
      } else if (p.tipo === 'escombro') {
        crearEscombro(this, p.x, p.y, p.variante);
      } else if (p.tipo === 'capsula') {
        const bit = prog.siguienteModulo(this.arma.desbloqueados);
        crearPickup(this, TIPO.PICKUP_MODULO, p.x, p.y, bit || MOD.PERFORANTE);
      } else if (p.tipo === 'vida') {
        crearPickup(this, TIPO.PICKUP_VIDA, p.x, p.y);
      }
    }

    // Estado de la sala.
    const necesitaCombate = entrada.tipo === TIPO_SALA.COMBATE ||
      entrada.tipo === TIPO_SALA.PLATAFORMAS || entrada.tipo === TIPO_SALA.JEFE;
    this.estadoSala = 0;
    sala.oleadas = necesitaCombate && entrada.tipo !== TIPO_SALA.JEFE
      ? prog.generarOleadas(sala, TIPO) : [];
    if (!necesitaCombate) this.abrirPuertas();

    this.R.setBioma(entrada.bioma);
    this.R.particulas.setColision(sala.solidez, sala.ancho, sala.alto, 0, 0, sala.anchoPx, sala.altoPx);
    this.R.luz.setGeometria(sala.segmentos.segs, sala.segmentos.n, 0, 0, sala.anchoPx, sala.altoPx);

    this.transicionT = 0;
    this.fundidoObjetivo = 0;
    this.mostrarCartel(this._tituloSala(entrada), BIOMAS[entrada.bioma].nombre);
    this.eventos.emit(EV.PUERTA, sala.entrada.x, sala.entrada.y, 1, 0);
    return sala;
  }

  _tituloSala(entrada) {
    switch (entrada.tipo) {
      case TIPO_SALA.JEFE: return 'FRAGMENTO PRIMARIO';
      case TIPO_SALA.TESORO: return 'CAMARA DE MODULOS';
      case TIPO_SALA.REPOSO: return 'NODO ESTABLE';
      case TIPO_SALA.INICIO: return 'PUNTO DE ENTRADA';
      case TIPO_SALA.PLATAFORMAS: return 'TRAVESIA';
      default: return `SECTOR ${this.progresion.salaIndice}`;
    }
  }

  mostrarCartel(texto, sub = '') {
    this.mensaje = texto;
    this.mensajeSub = sub;
    this.mensajeT = 2.6;
  }

  crearEntidad(mask) { return this.ent.create(mask); }

  // --------------------------------------------------------------- tick ---

  actualizar(dt, input) {
    this.tick++;

    // Hit-stop: congela el mundo unos frames en los impactos fuertes.
    if (this.hitstopT > 0 && this.ticksCongelados < MAX_TICKS_CONGELADOS) {
      this.hitstopT -= dt;
      this.ticksCongelados++;
      this.fx.actualizar(dt);
      this._decaerVisuales(dt);
      return;
    }
    if (this.ticksCongelados > 0) {
      // Al salir de un parón se bloquea el siguiente unos ticks: así el juego
      // no puede quedarse atrapado en una cadena de congelaciones.
      this.hitstopT = 0;
      this._hitstopBloqueadoHasta = this.tick + TICKS_RECARGA_HITSTOP;
      this.ticksCongelados = 0;
    }

    // Tiempo bala.
    if (this.ralentiT > 0) {
      this.ralentiT -= dt;
      this.escalaTiempo = damp(this.escalaTiempo, 0.28, 12, dt);
      if (this.ralentiT <= 0) this.eventos.emit(EV.RALENTI, this.jugador.x, this.jugador.y, 0, 0);
    } else {
      this.escalaTiempo = damp(this.escalaTiempo, 1, 6, dt);
    }
    const dts = dt * this.escalaTiempo;
    this.tiempo += dts;
    this.progresion.tiempo += dts;

    switch (this.fase) {
      case FASE.JUGANDO: this._tickJuego(dts, dt, input); break;
      case FASE.TRANSICION: this._tickTransicion(dt); break;
      case FASE.MUERTE: this._tickMuerte(dts, dt); break;
      case FASE.VICTORIA: this._tickVictoria(dt); break;
      default: break;
    }

    this._decaerVisuales(dt);
    this.fx.actualizar(dt);
    this.ent.flush();
  }

  _decaerVisuales(dt) {
    this.fundido = damp(this.fundido, this.fundidoObjetivo, 6, dt);
    this.post.fundido = this.fundido;
    this.post.saturacion = lerp(1, 0.35, clamp((1 - this.escalaTiempo) / 0.72, 0, 1));
    this.mensajeT = Math.max(0, this.mensajeT - dt);
    for (let i = this.arcos.n - 1; i >= 0; i--) {
      this.arcos.t[i] -= dt;
      if (this.arcos.t[i] <= 0) {
        this.arcos.n--;
        if (i !== this.arcos.n) {
          this.arcos.x0[i] = this.arcos.x0[this.arcos.n];
          this.arcos.y0[i] = this.arcos.y0[this.arcos.n];
          this.arcos.x1[i] = this.arcos.x1[this.arcos.n];
          this.arcos.y1[i] = this.arcos.y1[this.arcos.n];
          this.arcos.t[i] = this.arcos.t[this.arcos.n];
        }
      }
    }
  }

  _tickJuego(dt, dtReal, input) {
    const S = this.ent;
    const j = this.jugador;

    this.laser.activo = false;
    this.trampas.actualizar(dt);
    j.actualizar(dt, input);
    this.arma.actualizar(dt);

    // Fijado de blanco del módulo Buscador: se elige antes de disparar para
    // que el proyectil nazca ya con objetivo y no dé el primer bandazo.
    this._fijarObjetivo(input);

    // Aviso de que la carga acaba de completarse.
    if (this.arma.cargaRecienLista) {
      this.arma.cargaRecienLista = false;
      this.eventos.emit(EV.CARGA_LISTA, j.x, j.y, 1, 0);
      this.fx.cargaLista(j.x, j.y);
    }

    // Disparo.
    if (input.down(BTN.DISPARO) && j.estado !== ESTADO.MUERTO && this.fase === FASE.JUGANDO) {
      const eraCargado = this.arma.cargado;
      const creados = disparar(this, j, this.arma, input.aim, this.rng);
      if (creados > 0) {
        this.camara.empujar(input.aim + Math.PI, (eraCargado ? 12 : 3.5) + creados * 0.6);
        this.camara.sacudir(eraCargado ? 0.18 : 0.035);
        if (eraCargado) {
          this.fx.disparoCargado(j.x, j.y, input.aim);
          this.hitstop(0.035, true);
        }
      }
    }
    if (input.pressed(BTN.CAMBIO)) {
      this.arma.cicloRapido();
      const combo = comboDe(this.arma.mascara);
      this.mostrarCartel(this.arma.etiqueta(), combo ? combo.efecto : 'CONFIGURACION DE ARMA');
      this.mensajeT = combo ? 2.4 : 1.4;
    }

    this._construirRejilla();
    // La separación va ANTES de mover: corrige posiciones y deja que cada IA
    // decida su velocidad partiendo de una formación ya despejada.
    separarEnemigos(this, dt);
    this._actualizarEntidades(dt);
    this._colisiones(dt);
    this._logicaSala(dt);
    this._camara(dt, input);

    if (j.estado === ESTADO.MUERTO && j.muertoT > 1.1) {
      this.fase = FASE.MUERTE;
      this.fundidoObjetivo = 0.75;
      this.eventos.emit(EV.MUERTE_JUGADOR, j.x, j.y, 1, 0);
      this.post.glitch = 1.2;
    }
  }

  /**
   * Elige el enemigo fijado: el más cercano a la línea de puntería dentro de un
   * cono. Sin esto, los proyectiles buscadores elegían el más cercano a ellos y
   * se iban a por cualquiera menos a por el que estabas mirando.
   */
  _fijarObjetivo(input) {
    const arma = this.arma;
    if (!arma.tiene(MOD.BUSCADOR)) { arma.objetivo = -1; return; }
    const S = this.ent;
    const j = this.jugador;
    const cx = Math.cos(input.aim), cy = Math.sin(input.aim);
    const ALCANCE = 640;
    const n = this.rejillaEnemigos.consultar(j.x + cx * ALCANCE * 0.5, j.y + cy * ALCANCE * 0.5, ALCANCE * 0.75);
    let mejor = -1, mejorCoste = Infinity;
    for (let k = 0; k < n; k++) {
      const e = this.rejillaEnemigos.resultado[k];
      if (S.alive[e] !== 1 || S.vida[e] <= 0 || S.tipo[e] === TIPO.TORRETA) continue;
      const dx = S.x[e] - j.x, dy = S.y[e] - j.y;
      const dist = Math.hypot(dx, dy);
      if (dist > ALCANCE || dist < 1) continue;
      const desvio = Math.abs(angleDeltaLocal(input.aim, Math.atan2(dy, dx)));
      if (desvio > 0.62) continue;
      // Prioriza lo que está en el eje de puntería, no lo que está cerca.
      const coste = desvio * 420 + dist * 0.35;
      if (coste < mejorCoste) { mejorCoste = coste; mejor = e; }
    }
    arma.objetivo = mejor >= 0 ? S.handle(mejor) : -1;
  }

  _construirRejilla() {
    const S = this.ent;
    let n = 0;
    for (let i = 0; i < S.count; i++) {
      const e = S.dense[i];
      if (S.alive[e] !== 1) continue;
      if ((S.mask[e] & MASK.ENEMIGO) === 0) continue;
      this.tmpIds[n++] = e;
    }
    this.rejillaEnemigos.construir(this.tmpIds, n, S.x, S.y);
    this.enemigosVivos = n;
    this.estadisticas.enemigos = n;
  }

  _actualizarEntidades(dt) {
    const S = this.ent;
    let proyectiles = 0;
    // Copia de la lista densa: matar entidades durante el recorrido la altera.
    const total = S.count;
    for (let i = 0; i < total; i++) this.tmpIds[i] = S.dense[i];

    for (let i = 0; i < total; i++) {
      const e = this.tmpIds[i];
      if (S.alive[e] !== 1) continue;
      const m = S.mask[e];
      S.px[e] = S.x[e]; S.py[e] = S.y[e];

      if (m & MASK.JUGADOR) continue;

      if (m & MASK.PROYECTIL) {
        proyectiles++;
        this._tickProyectil(e, dt);
        continue;
      }
      if (m & MASK.PICKUP) {
        if (!actualizarPickup(this, e, dt)) S.kill(e);
        continue;
      }
      if (m & MASK.RIGIDO) { actualizarRigido(this, e, dt); continue; }

      if (m & MASK.ENEMIGO) {
        // Red de seguridad: si algo dejó la vida a cero sin pasar por
        // danarEnemigo (efectos de área, scripts de jefe), la entidad muere
        // igualmente en vez de quedarse viva con vida negativa.
        if (S.vida[e] <= 0) { this.matarEnemigo(e, false); continue; }
        if (S.tipo[e] === TIPO.JEFE) actualizarJefe(this, e, dt);
        else if (S.tipo[e] === TIPO.JEFE_OJO) actualizarOjo(this, e, dt);
        else actualizarEnemigo(this, e, dt);
        this._moverEnemigo(e, dt);
      }
    }
    this.estadisticas.proyectiles = proyectiles;
    this.estadisticas.entidades = S.count;
  }

  _moverEnemigo(e, dt) {
    const S = this.ent;
    if (S.tipo[e] === TIPO.TORRETA) return;
    if (S.tipo[e] === TIPO.JEFE_OJO) return;
    if ((S.flags[e] & FLAG.IGNORA_GRAVEDAD) === 0) S.vy[e] += 1900 * dt;

    const pos = this.tmpPos;
    const r = this.fisica.mover(pos, S.x[e], S.y[e], S.hw[e], S.hh[e], S.vx[e] * dt, S.vy[e] * dt, null, this.tmpRes);
    S.x[e] = pos[0]; S.y[e] = pos[1];

    if (S.flags[e] & FLAG.IGNORA_GRAVEDAD) {
      // Los voladores rebotan suavemente en la geometría en vez de pegarse.
      if (r.chocoX) S.vx[e] = -S.vx[e] * 0.55;
      if (r.chocoY) S.vy[e] = -S.vy[e] * 0.55;
    } else {
      if (r.chocoX) { S.vx[e] = 0; S.c[e] = 1; } else S.c[e] = 0;
      if (r.chocoY === 1) { S.vy[e] = 0; S.b[e] = 1; } else S.b[e] = r.enSuelo ? 1 : 0;
      if (r.chocoY === -1) S.vy[e] = 0;
      if (r.enSuelo && r.cintaVel !== 0) S.x[e] += r.cintaVel * dt;
    }
    if (r.tileDanino && S.tipo[e] !== TIPO.JEFE) this.danarEnemigo(e, 22, S.x[e], S.y[e], 0.4, 0.9, 1, false);

    const sala = this.sala;
    if (S.y[e] > sala.altoPx + 200) this.matarEnemigo(e, false);
  }

  _tickProyectil(e, dt) {
    const S = this.ent;
    if (S.equipo[e] === 0) {
      if (!actualizarProyectil(this, e, dt)) { this._morirProyectil(e); return; }
      if ((S.mask[e] & MASK.ORBITAL) && S.estado[e] === 0) return;   // ya posicionado
    } else {
      S.vida[e] -= dt;
      if (S.vida[e] <= 0) { this._morirProyectil(e); return; }
      S.angulo[e] = Math.atan2(S.vy[e], S.vx[e]);
    }

    const nx = S.x[e] + S.vx[e] * dt;
    const ny = S.y[e] + S.vy[e] * dt;

    // Colisión con la geometría.
    if (this.fisica.bloqueoPunto(nx, ny)) {
      const rebotes = S.c[e];
      if (rebotes > 0) {
        // Rebote por ejes: prueba cuál de los dos estaba libre.
        const libreX = !this.fisica.bloqueoPunto(nx, S.y[e]);
        const libreY = !this.fisica.bloqueoPunto(S.x[e], ny);
        if (!libreX) S.vx[e] = -S.vx[e];
        if (!libreY) S.vy[e] = -S.vy[e];
        if (libreX && libreY) { S.vx[e] = -S.vx[e]; S.vy[e] = -S.vy[e]; }
        S.c[e] = rebotes - 1;
        this.eventos.emit(EV.REBOTE, S.x[e], S.y[e], 1, 0);
        this.fx.impacto(S.x[e], S.y[e], S.angulo[e], S.luzR[e], S.luzG[e], S.luzB[e], 0.55);
        return;
      }
      this._impactoGeometria(e, nx, ny);
      return;
    }
    S.x[e] = nx; S.y[e] = ny;

    const sala = this.sala;
    if (S.x[e] < -60 || S.y[e] < -60 || S.x[e] > sala.anchoPx + 60 || S.y[e] > sala.altoPx + 60) {
      this._morirProyectil(e);
    }
  }

  _impactoGeometria(e, nx, ny) {
    const S = this.ent;
    // Los bloques frágiles se rompen.
    const tx = Math.floor(nx / TAM), ty = Math.floor(ny / TAM);
    if (this.sala.get(tx, ty) === T.FRAGIL) this.romperTile(tx, ty);
    this.fx.impacto(nx, ny, S.angulo[e], S.luzR[e], S.luzG[e], S.luzB[e], 0.7);
    this.eventos.emit(EV.IMPACTO, nx, ny, 0.6, 0);
    this._morirProyectil(e);
  }

  _morirProyectil(e) {
    const S = this.ent;
    if ((S.mask[e] & MASK.ORBITAL) && S.estado[e] === 0) {
      this.arma.orbitales = Math.max(0, this.arma.orbitales - 1);
    }
    S.kill(e);
  }

  romperTile(tx, ty) {
    const sala = this.sala;
    if (sala.get(tx, ty) !== T.FRAGIL) return;
    sala.set(tx, ty, T.VACIO);
    const x = tx * TAM + TAM / 2, y = ty * TAM + TAM / 2;
    this.fx.rotura(x, y, 0.7, 0.55, 0.35);
    this.eventos.emit(EV.EXPLOSION, x, y, 0.35, 0);
    this.camara.sacudir(0.07);
    // La geometría cambió: recalcula sombras y colisión de partículas.
    sala.finalizar();
    this.R.luz.setGeometria(sala.segmentos.segs, sala.segmentos.n, 0, 0, sala.anchoPx, sala.altoPx);
    this.R.particulas.setColision(sala.solidez, sala.ancho, sala.alto, 0, 0, sala.anchoPx, sala.altoPx);
  }

  // ---------------------------------------------------------- colisiones ---

  _colisiones(dt) {
    const S = this.ent;
    const j = this.jugador;
    const total = S.count;
    for (let i = 0; i < total; i++) this.tmpIds[i] = S.dense[i];

    for (let i = 0; i < total; i++) {
      const e = this.tmpIds[i];
      if (S.alive[e] !== 1) continue;
      const m = S.mask[e];

      if (m & MASK.PROYECTIL) {
        if (S.equipo[e] === 0) this._proyectilContraEnemigos(e);
        else this._proyectilContraJugador(e);
        continue;
      }
      if ((m & MASK.ENEMIGO) && j.id >= 0 && j.estado !== ESTADO.MUERTO) {
        if (S.tipo[e] === TIPO.TORRETA) continue;
        const dx = Math.abs(S.x[e] - j.x), dy = Math.abs(S.y[e] - j.y);
        if (dx < S.hw[e] + P.HW && dy < S.hh[e] + P.HH) {
          this.danarJugador(S.dmg[e], j.x, j.y, S.x[e]);
          // Empuje mutuo para que no se solapen indefinidamente.
          const dir = sign(S.x[e] - j.x) || 1;
          S.vx[e] += dir * 130;
        }
      }
    }

    this._cableTejedores();

    // Rayo del jefe contra el jugador.
    if (this.laser.activo && j.estado !== ESTADO.MUERTO && j.iframes <= 0) {
      const L = this.laser;
      const dx = j.x - L.x, dy = j.y - L.y;
      const proj = dx * Math.cos(L.ang) + dy * Math.sin(L.ang);
      if (proj > 0 && proj < L.largo) {
        const perp = Math.abs(-dx * Math.sin(L.ang) + dy * Math.cos(L.ang));
        if (perp < 20 + P.HH * 0.5) this.danarJugador(L.dmg, j.x, j.y, L.x);
      }
    }
  }

  _proyectilContraEnemigos(p) {
    const S = this.ent;
    const rejilla = this.rejillaEnemigos;
    const radio = S.hw[p] + 40;
    const n = rejilla.consultar(S.x[p], S.y[p], radio);
    for (let k = 0; k < n; k++) {
      const e = rejilla.resultado[k];
      if (S.alive[e] !== 1 || S.vida[e] <= 0) continue;
      if (Math.abs(S.x[e] - S.x[p]) > S.hw[e] + S.hw[p]) continue;
      if (Math.abs(S.y[e] - S.y[p]) > S.hh[e] + S.hh[p]) continue;
      if (S.tipo[e] === TIPO.JEFE && S.golpes[e] > 0) continue;   // invulnerable entre fases

      // El espejo devuelve el disparo convertido en bala enemiga. Se puede
      // volver a devolver con un parry: ese bucle es intencionado.
      if (reflejaEspejo(S, e, S.x[p], S.y[p])) {
        const j = this.jugador;
        const ang = Math.atan2(j.y - S.y[p], j.x - S.x[p]) + this.rng.spread(0.12);
        const vel = Math.max(300, Math.hypot(S.vx[p], S.vy[p]) * 0.85);
        S.vx[p] = Math.cos(ang) * vel;
        S.vy[p] = Math.sin(ang) * vel;
        S.equipo[p] = 1;
        S.tipo[p] = TIPO.BALA_ENEMIGA;
        S.modulos[p] = 0;
        S.golpes[p] = 1;
        S.c[p] = 0;
        S.dmg[p] = Math.max(8, S.dmg[p] * 0.8);
        S.flags[p] = FLAG.IGNORA_GRAVEDAD | FLAG.DESTRUIBLE;
        S.sprite[p] = this.R.idx('bala.enemiga');
        S.luzR[p] = 1; S.luzG[p] = 0.35; S.luzB[p] = 0.45;
        S.vida[p] = Math.max(S.vida[p], 2.5);
        this.eventos.emit(EV.REFLEJO, S.x[p], S.y[p], 1, 0);
        this.fx.impacto(S.x[p], S.y[p], ang, 0.8, 0.9, 1, 0.7);
        return;
      }

      if (bloqueaEscudo(S, e, S.x[p], S.y[p])) {
        this.fx.impacto(S.x[p], S.y[p], S.angulo[p], 0.5, 0.85, 1, 0.6);
        this.eventos.emit(EV.IMPACTO, S.x[p], S.y[p], 0.4, 0);
        if (S.c[p] > 0) {   // con rebote, sale despedido en vez de morir
          S.vx[p] = -S.vx[p]; S.vy[p] = -S.vy[p]; S.c[p]--;
          return;
        }
        this._morirProyectil(p);
        return;
      }

      let dmg = S.dmg[p];
      // El núcleo del jefe aguanta más mientras le queden ojos.
      if (S.tipo[e] === TIPO.JEFE && ojosVivos(this, e) > 0) dmg *= 0.35;

      this.danarEnemigo(e, dmg, S.x[p], S.y[p], S.luzR[p], S.luzG[p], S.luzB[p]);

      if (S.modulos[p] & MOD.CADENA) {
        const saltos = (S.flags[p] & FLAG.CARGADO) ? 4 : 2;
        this._cadenaElectrica(e, S.x[p], S.y[p], dmg, saltos);
      }

      S.golpes[p]--;
      if (S.golpes[p] <= 0) {
        this._morirProyectil(p);
        return;
      }
      // Perforante: sigue, pero pierde un poco de fuerza.
      S.dmg[p] *= 0.82;
    }
  }

  _proyectilContraJugador(p) {
    const S = this.ent;
    const j = this.jugador;
    if (j.id < 0 || j.estado === ESTADO.MUERTO) return;
    if (Math.abs(S.x[p] - j.x) > S.hw[p] + P.HW) return;
    if (Math.abs(S.y[p] - j.y) > S.hh[p] + P.HH) return;
    if (this.danarJugador(S.dmg[p], j.x, j.y, S.x[p])) {
      this.fx.impacto(S.x[p], S.y[p], S.angulo[p], 1, 0.35, 0.4, 1);
    }
    this._morirProyectil(p);
  }

  /**
   * Cable de los tejedores: daña al jugador si cruza el segmento que une a la
   * pareja. Sólo se procesa una vez por pareja (el de handle menor).
   */
  _cableTejedores() {
    const S = this.ent;
    const j = this.jugador;
    this.cables = this.cables || { x0: [], y0: [], x1: [], y1: [], n: 0 };
    this.cables.n = 0;
    if (!j || j.estado === ESTADO.MUERTO) return;
    for (let i = 0; i < S.count; i++) {
      const e = S.dense[i];
      if (S.alive[e] !== 1 || S.tipo[e] !== TIPO.TEJEDOR) continue;
      const o = S.resolve(S.enlace[e]);
      if (o < 0) continue;
      if (S.handle(e) > S.enlace[e]) continue;   // la pareja ya lo procesó
      const k = this.cables.n++;
      this.cables.x0[k] = S.x[e]; this.cables.y0[k] = S.y[e];
      this.cables.x1[k] = S.x[o]; this.cables.y1[k] = S.y[o];
      if (S.aturdido[e] > 0 || S.aturdido[o] > 0) continue;
      // Distancia del jugador al segmento.
      const ax = S.x[e], ay = S.y[e], bx = S.x[o], by = S.y[o];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((j.x - ax) * dx + (j.y - ay) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t - j.x, py = ay + dy * t - j.y;
      if (px * px + py * py < 22 * 22) this.danarJugador(S.dmg[e], j.x, j.y, ax + dx * t);
    }
  }

  /**
   * Cadena eléctrica con marcas: el primer impacto deja una marca y el segundo
   * la detona. Así el módulo también sirve contra un objetivo solo, que era su
   * punto flojo: antes sin multitud no hacía nada visible.
   */
  _cadenaElectrica(objetivo, x, y, dmg, saltos) {
    const S = this.ent;
    if (S.marca[objetivo] > 0) {
      S.marca[objetivo] = 0;
      this.fx.detonacion(S.x[objetivo], S.y[objetivo]);
      this.eventos.emit(EV.REBOTE, S.x[objetivo], S.y[objetivo], 1, 0);
      this.danarEnemigo(objetivo, dmg * 0.85, S.x[objetivo], S.y[objetivo], 0.72, 0.5, 1, false);
      this._cadena(objetivo, S.x[objetivo], S.y[objetivo], dmg * 0.6, saltos);
    } else {
      S.marca[objetivo] = 2.5;
      this.fx.marca(S.x[objetivo], S.y[objetivo]);
      this._cadena(objetivo, x, y, dmg * 0.5, Math.max(1, saltos - 1));
    }
  }

  /** Salto del arco a los enemigos cercanos. */
  _cadena(desde, x, y, dmg, saltos) {
    const S = this.ent;
    let origen = desde;
    let ox = x, oy = y;
    for (let s = 0; s < saltos; s++) {
      const sig = this.enemigoMasCercano(ox, oy, 230, origen);
      if (sig < 0) break;
      this.danarEnemigo(sig, dmg, ox, oy, 0.72, 0.5, 1, false);
      this._arco(ox, oy, S.x[sig], S.y[sig]);
      ox = S.x[sig]; oy = S.y[sig];
      origen = sig;
      dmg *= 0.7;
    }
  }

  _arco(x0, y0, x1, y1) {
    const A = this.arcos;
    if (A.n >= MAX_ARCOS) A.n = MAX_ARCOS - 1;
    const i = A.n++;
    A.x0[i] = x0; A.y0[i] = y0; A.x1[i] = x1; A.y1[i] = y1; A.t[i] = 0.16;
  }

  // ----------------------------------------------------------- daño/vida ---

  /**
   * Aplica daño a un enemigo. Devuelve el daño real infligido.
   *
   * Aquí es donde el combate deja de ser "vaciar una barra": el impacto puede
   * ser crítico si acierta el punto débil, se reduce si el enemigo es blindado,
   * se amplifica si está aturdido, y siempre desgasta su aguante.
   */
  danarEnemigo(e, cantidad, ix, iy, r, g, b, directo = true) {
    const S = this.ent;
    if (S.alive[e] !== 1 || S.vida[e] <= 0) return 0;

    let dmg = cantidad * factorDanio(S, e);
    let critico = false;
    if (directo && puntoDebil(S, e, this.tmpDebil)) {
      const ddx = ix - this.tmpDebil[0], ddy = iy - this.tmpDebil[1];
      if (ddx * ddx + ddy * ddy <= this.tmpDebil[2] * this.tmpDebil[2]) {
        dmg *= this.tmpDebil[3];
        critico = true;
      }
    }
    if (S.aturdido[e] > 0) dmg *= 1.6;

    S.vida[e] -= dmg;
    S.flash[e] = 1;
    const ang = Math.atan2(iy - S.y[e], ix - S.x[e]);

    if (critico) {
      this.fx.critico(ix, iy, ang);
      this.eventos.emit(EV.CRITICO, ix, iy, 1, 0);
      this.camara.sacudir(0.14);
    } else {
      this.fx.impacto(S.x[e], S.y[e], ang, r, g, b, clamp(dmg / 22, 0.5, 1.6));
      this.eventos.emit(EV.IMPACTO, S.x[e], S.y[e], clamp(dmg / 18, 0.4, 1.5), 0);
    }

    // El aguante se rompe antes con los críticos: apuntar bien acorta el combate.
    const roto = desgastarAguante(this, e, dmg * (critico ? 1.9 : 1));
    if (roto) { this.camara.sacudir(0.24); this.hitstop(0.05, true); }

    if (S.tipo[e] !== TIPO.JEFE && S.tipo[e] !== TIPO.TORRETA) {
      const emp = clamp(dmg * 3.2, 20, 220);
      S.vx[e] -= Math.cos(ang) * emp;
      S.vy[e] -= Math.sin(ang) * emp * 0.6;
    }
    if (S.vida[e] <= 0) this.matarEnemigo(e, S.tipo[e] === TIPO.BOMBARDERO);
    else if (!roto) this.hitstop(0.018);
    return dmg;
  }

  /** Golpe de área de un enemigo contra el jugador (pisotón del divisor). */
  golpeArea(x, y, radio, dmg, origen) {
    const j = this.jugador;
    if (!j || j.estado === ESTADO.MUERTO) return;
    const d = Math.hypot(j.x - x, j.y - y);
    if (d < radio) this.danarJugador(dmg * (1 - d / radio * 0.5), j.x, j.y, x);
  }

  matarEnemigo(e, explota) {
    const S = this.ent;
    if (S.alive[e] !== 1) return;
    const x = S.x[e], y = S.y[e];
    const tipo = S.tipo[e];
    const grande = tipo === TIPO.JEFE;
    const tam = grande ? 3 : tipo === TIPO.ESCUDO || tipo === TIPO.BOMBARDERO ? 1.5 : 1;

    this.fx.muerteEnemigo(x, y, S.luzR[e], S.luzG[e], S.luzB[e], tam);
    this.eventos.emit(EV.MUERTE_ENEMIGO, x, y, tam, 0);
    this.camara.sacudir(0.08 * tam);
    this.hitstop(0.03 * tam, tam > 1.2);

    // Un bombardero devuelto con parry ya no es problema tuyo: revienta para
    // el otro bando.
    const parado = (S.flags[e] & FLAG.REFLEJADO) !== 0;
    const volatil = (S.flags[e] & FLAG.ELITE) !== 0 && S.variante[e] === ELITE.VOLATIL;
    if (explota || volatil) {
      const radio = volatil && !explota ? 140 : 130;
      this.fx.explosionGrande(x, y, 1.2);
      this.eventos.emit(EV.EXPLOSION, x, y, 1, 0);
      this.camara.sacudir(0.35);
      this._explosionRadial(x, y, radio, S.dmg[e], !parado);
    }
    if (tipo === TIPO.DIVISOR) {
      const crias = partirDivisor(this, e);
      if (crias > 0) this.eventos.emit(EV.DIVISION, x, y, 1, 0);
    }

    if (tipo !== TIPO.TORRETA && tipo !== TIPO.JEFE_OJO) {
      this.progresion.enemigosDerrotados++;
      this.jugador.combo++;
      this.jugador.comboT = 3.2;
    }

    // Recompensas.
    if (this.rng.bool(tipo === TIPO.ENJAMBRE ? 0.06 : 0.19)) {
      crearPickup(this, this.rng.bool(0.62) ? TIPO.PICKUP_ENERGIA : TIPO.PICKUP_VIDA, x, y);
    }

    if (grande) {
      this.progresion.jefesDerrotados++;
      this.fx.explosionGrande(x, y, 2.6);
      this.post.golpe(0.9, 1, 0.7, 0.6);
      this.camara.sacudir(1);
      this.hitstop(0.3, true);
      for (let k = 0; k < 6; k++) crearPickup(this, TIPO.PICKUP_VIDA, x + this.rng.spread(120), y + this.rng.spread(60));
      // Al morir el jefe caen también sus ojos.
      const h = S.handle(e);
      for (let i = 0; i < S.count; i++) {
        const o = S.dense[i];
        if (S.alive[o] === 1 && S.tipo[o] === TIPO.JEFE_OJO && S.padre[o] === h) S.kill(o);
      }
    }

    S.kill(e);
    this._comprobarSalaLimpia(true);
  }

  matarRigido(e) {
    const S = this.ent;
    this.fx.rotura(S.x[e], S.y[e], 0.55, 0.6, 0.7);
    this.eventos.emit(EV.EXPLOSION, S.x[e], S.y[e], 0.3, 0);
    S.kill(e);
  }

  _explosionRadial(x, y, radio, dmg, dañaJugador = true) {
    const S = this.ent;
    const n = this.rejillaEnemigos.consultar(x, y, radio);
    for (let k = 0; k < n; k++) {
      const e = this.rejillaEnemigos.resultado[k];
      if (S.alive[e] !== 1) continue;
      const d = Math.hypot(S.x[e] - x, S.y[e] - y);
      if (d > radio) continue;
      this.danarEnemigo(e, dmg * (1 - d / radio), x, y, 1, 0.6, 0.25, false);
    }
    const j = this.jugador;
    if (dañaJugador && j.estado !== ESTADO.MUERTO) {
      const d = Math.hypot(j.x - x, j.y - y);
      if (d < radio) this.danarJugador(dmg * (1 - d / radio), j.x, j.y, x);
    }
  }

  danarJugador(cantidad, x, y, desdeX) {
    const j = this.jugador;
    if (!j.recibirDanio(cantidad, desdeX)) return false;
    this.progresion.danioRecibido += cantidad;
    this.eventos.emit(EV.DANIO_JUGADOR, j.x, j.y, cantidad, 0);
    this.camara.sacudir(0.42);
    this.hitstop(0.075, true);
    this.post.danio = Math.min(1, this.post.danio + 0.75);
    this.post.golpe(0.28, 1, 0.25, 0.3);
    this.fx.impacto(j.x, j.y, Math.atan2(0, desdeX - j.x), 1, 0.3, 0.35, 1.3);
    return true;
  }

  energiaParry(n) {
    this.jugador.energia = Math.min(100, this.jugador.energia + 12 * n);
    this.post.golpe(0.35, 1, 0.6, 1);
  }

  /**
   * Congela la simulación unos instantes para dar peso a los impactos.
   *
   * Ojo con el detalle que costó encontrar: un hit-stop de 18 ms es MÁS LARGO
   * que un tick (16,7 ms). Sin límite de frecuencia, disparando en continuo se
   * rearmaba en cada tick con impacto y la simulación avanzaba a la mitad de
   * velocidad (o se quedaba congelada del todo si el daño venía de fuera del
   * tick). De ahí las tres salvaguardas: recarga por ticks, tope de duración y
   * garantía dura de que nunca se encadenan más de MAX_TICKS_CONGELADOS.
   */
  hitstop(t, cinematico = false) {
    if (this.R.settings && !this.R.settings.get('hitstop')) return;
    if (this.tick < this._hitstopBloqueadoHasta) return;
    if (!cinematico && this.tick - this._ultimoHitstopTick < TICKS_RECARGA_HITSTOP) return;
    this._ultimoHitstopTick = this.tick;
    this.hitstopT = Math.min(HITSTOP_MAX, Math.max(this.hitstopT, t));
  }

  ralenti(t) {
    this.ralentiT = Math.max(this.ralentiT, t);
    this.eventos.emit(EV.RALENTI, this.jugador.x, this.jugador.y, 1, 0);
  }

  // ----------------------------------------------------------- consultas ---

  enemigoMasCercano(x, y, radio, excluir) {
    const S = this.ent;
    const n = this.rejillaEnemigos.consultar(x, y, radio);
    let mejor = -1, mejorD = radio * radio;
    for (let k = 0; k < n; k++) {
      const e = this.rejillaEnemigos.resultado[k];
      if (e === excluir || S.alive[e] !== 1 || S.vida[e] <= 0) continue;
      if (S.tipo[e] === TIPO.TORRETA) continue;
      const dx = S.x[e] - x, dy = S.y[e] - y;
      const d = dx * dx + dy * dy;
      if (d < mejorD) { mejorD = d; mejor = e; }
    }
    return mejor;
  }

  lineaDeVision(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const d = Math.hypot(dx, dy) || 1;
    return this.fisica.raycast(x0, y0, dx / d, dy / d, d) >= d - 6;
  }

  resolverPlataformas(jugador, r) { return this.trampas.resolverJugador(jugador, r); }

  spriteProyectil(mascara) {
    const R = this.R;
    if (mascara & MOD.ESCOPETA) return R.idx('bala.escopeta');
    if (mascara & MOD.PERFORANTE) return R.idx('bala.perfora');
    if (mascara & MOD.ORBITAL) return R.idx('bala.orbital');
    if (mascara & MOD.CADENA) return R.idx('bala.cadena');
    if (mascara & MOD.REBOTE) return R.idx('bala.rebote');
    if (mascara & MOD.BUSCADOR) return R.idx('bala.buscador');
    return R.idx('bala.base');
  }

  laserJefe(x, y, ang, dmg) {
    const largo = this.fisica.raycast(x, y, Math.cos(ang), Math.sin(ang), 1600);
    this.laser.activo = true;
    this.laser.x = x; this.laser.y = y; this.laser.ang = ang;
    this.laser.largo = largo; this.laser.dmg = dmg;
    this.fx.chispaLaser(x + Math.cos(ang) * largo, y + Math.sin(ang) * largo);
  }

  invocarSecuazJefe(x, y, fase) {
    const tipos = fase === 0 ? [TIPO.DRON, TIPO.ENJAMBRE]
      : fase === 1 ? [TIPO.DRON, TIPO.VOLADOR, TIPO.ENJAMBRE]
        : [TIPO.VOLADOR, TIPO.BOMBARDERO, TIPO.ENJAMBRE];
    const t = this.rng.pick(tipos);
    const px = clamp(x, 80, this.sala.anchoPx - 80);
    const py = clamp(y, 80, this.sala.altoPx - 120);
    crearEnemigo(this, t, px, py, false, this.progresion.escalaVida() * 0.7);
  }

  otorgarModulo(bit, x, y) {
    const nuevo = this.arma.desbloquear(bit);
    const info = LISTA_MODULOS.find((m) => m.bit === bit);
    this.progresion.modulosObtenidos++;
    this.eventos.emit(EV.MODULO, x, y, 1, 0);
    this.fx.modulo(x, y);
    this.camara.sacudir(0.3);
    this.hitstop(0.12, true);
    if (info) {
      const combo = comboDe(this.arma.mascara);
      this.mostrarCartel(`MODULO: ${info.nombre.toUpperCase()}`,
        combo ? `${combo.nombre} — ${combo.efecto}` : info.descripcion);
      this.mensajeT = 5.2;
      this.avisoModulo = info;
    }
    if (!nuevo) {
      // Duplicado: sube el daño base en su lugar.
      this.arma.nivelDanio += 0.18;
      this.mostrarCartel('NUCLEO REFORZADO', 'Danio base +18%');
    }
  }

  // ------------------------------------------------------ lógica de sala ---

  _logicaSala(dt) {
    const sala = this.sala;
    const j = this.jugador;
    const prog = this.progresion;

    // Disparador de combate: al adentrarse en la sala.
    if (this.estadoSala === 0) {
      const disparador = j.x > 7 * TAM;
      const necesita = sala.tipo === TIPO_SALA.COMBATE || sala.tipo === TIPO_SALA.PLATAFORMAS || sala.tipo === TIPO_SALA.JEFE;
      if (disparador && necesita) {
        this.estadoSala = 1;
        this.cerrarPuertas();
        if (sala.tipo === TIPO_SALA.JEFE) {
          this.nivelJefe = prog.bioma;
          const jefe = crearJefe(this, sala.anchoPx * 0.5, sala.altoPx * 0.35, prog.bioma);
          this.mostrarCartel('FRAGMENTO PRIMARIO', BIOMAS[prog.bioma].lema);
          this.mensajeT = 3.4;
          this.eventos.emit(EV.JEFE_FASE, sala.anchoPx * 0.5, sala.altoPx * 0.35, 0, 0);
        } else {
          this._lanzarOleada();
        }
      } else if (!necesita) {
        this.estadoSala = 2;
      }
    } else if (this.estadoSala === 1) {
      this.oleadaT = Math.max(0, this.oleadaT - dt);
      if (this.enemigosVivos === 0 && this.oleadaT <= 0) {
        if (sala.tipo === TIPO_SALA.JEFE) {
          this._salaLimpia();
        } else if (this.oleadaActual < sala.oleadas.length) {
          this._lanzarOleada();
        } else {
          this._salaLimpia();
        }
      }
    }

    // Puerta de salida.
    for (let i = 0; i < sala.puertas.length; i++) {
      const p = sala.puertas[i];
      p.animacion = damp(p.animacion, p.abierta ? 1 : 0, 7, dt);
      if (!p.esSalida || !p.abierta || this.puertaUsada) continue;
      if (Math.abs(j.x - (p.x + 20)) < 34 && Math.abs(j.y - (p.y + 48)) < 60) {
        this.puertaUsada = true;
        this._siguienteSala();
      }
    }
  }

  _lanzarOleada() {
    const sala = this.sala;
    const lista = sala.oleadas[this.oleadaActual];
    this.oleadaActual++;
    if (!lista) return;
    const j = this.jugador;
    for (const spec of lista) {
      const aire = STATS[spec.tipo] && STATS[spec.tipo].aire;
      const fuente = aire ? sala.spawnsAire : sala.spawns;
      let x = 0, y = 0, intentos = 0;
      do {
        const i = this.rng.int(fuente.length / 2) * 2;
        x = fuente[i]; y = fuente[i + 1];
        intentos++;
      } while (Math.abs(x - j.x) < 190 && intentos < 12);
      crearEnemigo(this, spec.tipo, x, y, spec.elite, this.progresion.escalaVida());
    }
    this.oleadaT = 0.5;
    this.mostrarCartel(`OLEADA ${this.oleadaActual}/${sala.oleadas.length}`, '');
    this.mensajeT = 1.3;
  }

  _comprobarSalaLimpia(desdeMuerte) {
    if (this.estadoSala !== 1) return;
    // El último enemigo de la sala activa el tiempo bala.
    let vivos = 0;
    const S = this.ent;
    for (let i = 0; i < S.count; i++) {
      const e = S.dense[i];
      if (S.alive[e] === 1 && (S.mask[e] & MASK.ENEMIGO) && S.tipo[e] !== TIPO.TORRETA) vivos++;
    }
    if (vivos === 0 && desdeMuerte && this.oleadaActual >= (this.sala.oleadas.length || 1)) {
      this.ralenti(0.85);
    }
  }

  _salaLimpia() {
    this.estadoSala = 2;
    this.abrirPuertas();
    this.eventos.emit(EV.SALA_LIMPIA, this.jugador.x, this.jugador.y, 1, 0);
    this.mostrarCartel('SECTOR ESTABILIZADO', 'La salida se ha abierto');
    this.mensajeT = 2.4;
    // Recompensa por limpiar.
    for (let k = 0; k < 2 + this.rng.int(3); k++) {
      crearPickup(this, this.rng.bool(0.5) ? TIPO.PICKUP_VIDA : TIPO.PICKUP_ENERGIA,
        this.jugador.x + this.rng.spread(140), this.jugador.y - 40);
    }
  }

  abrirPuertas() {
    for (const p of this.sala.puertas) {
      if (!p.abierta) {
        p.abierta = true;
        this.eventos.emit(EV.PUERTA, p.x, p.y, 1, 0);
      }
    }
  }

  cerrarPuertas() {
    for (const p of this.sala.puertas) {
      if (p.abierta && p.esSalida) {
        p.abierta = false;
        this.eventos.emit(EV.PUERTA, p.x, p.y, 0, 0);
      }
      if (!p.esSalida) p.abierta = false;
    }
  }

  _siguienteSala() {
    this.fase = FASE.TRANSICION;
    this.transicionT = 0.85;
    this.fundidoObjetivo = 1;
    this.eventos.emit(EV.PUERTA, this.jugador.x, this.jugador.y, 1, 0);
  }

  _tickTransicion(dt) {
    this.transicionT -= dt;
    if (this.transicionT <= 0.42 && !this._salaCargada) {
      this._salaCargada = true;
      if (!this.progresion.avanzar()) {
        this.fase = FASE.VICTORIA;
        this.fundidoObjetivo = 0.35;
        this.eventos.emit(EV.VICTORIA, 0, 0, 1, 0);
        this._salaCargada = false;
        return;
      }
      this.cargarSala(this.progresion.salaIndice);
      this.fundidoObjetivo = 0;
    }
    if (this.transicionT <= 0) {
      this._salaCargada = false;
      this.fase = FASE.JUGANDO;
    }
  }

  _tickMuerte(dt) {
    this.jugador.actualizar(dt, this._inputVacio || (this._inputVacio = { buttons: 0, prev: 0, aim: 0, usaRaton: 0, down: () => false, pressed: () => false, released: () => false, axisX: () => 0, axisY: () => 0 }));
  }

  _tickVictoria(dt) { /* la interfaz se encarga */ }

  // -------------------------------------------------------------- cámara --

  _camara(dt, input) {
    const j = this.jugador;
    const sala = this.sala;
    // Anticipación: mira hacia donde apuntas y hacia donde te mueves.
    const mirX = clamp((Math.cos(input.aim) * 0.55 + j.vx / P.VEL_MAX * 0.6), -1, 1);
    const mirY = clamp((Math.sin(input.aim) * 0.30 + j.vy / 700 * 0.5), -1, 1);
    const urgencia = j.estado === ESTADO.DASH ? 1.6 : 1;
    this.camara.actualizar(dt, j.x, j.y - 18, mirX, mirY, urgencia);

    // Zoom: se aleja al ir rápido, se acerca en los momentos lentos.
    const vel = Math.hypot(j.vx, j.vy);
    const base = this.R.alto / (22 * TAM);
    let objetivo = base * (1 - clamp(vel / 1400, 0, 0.10));
    if (this.estadoSala === 1 && this.sala.tipo === TIPO_SALA.JEFE) objetivo *= 0.90;
    if (this.ralentiT > 0) objetivo *= 1.07;
    this.camara.zoomObjetivo = objetivo;
    this.camara.setLimites(0, 0, sala.anchoPx, sala.altoPx);
  }

  // ------------------------------------------------------------ checksum --

  /** Firma del estado de la simulación, para validar la repetición. */
  checksum() {
    const S = this.ent;
    this._h = 2166136261 >>> 0;
    // Sólo entidades vivas y en orden de id: los huecos libres no forman parte
    // del estado, así que incluirlos daría falsos desajustes.
    for (let e = 0; e < S.capacity; e++) {
      if (S.alive[e] !== 1) continue;
      this._mezclar(e);
      this._mezclar(S.tipo[e]);
      this._mezclar(S.x[e]);
      this._mezclar(S.y[e]);
      this._mezclar(S.vx[e]);
      this._mezclar(S.vy[e]);
      this._mezclar(S.vida[e]);
      this._mezclar(S.estado[e]);
      this._mezclar(S.t1[e]);
      this._mezclar(S.aguante[e]);
      this._mezclar(S.aturdido[e]);
    }
    const j = this.jugador;
    this._mezclar(j.x); this._mezclar(j.y);
    this._mezclar(j.vx); this._mezclar(j.vy);
    this._mezclar(j.estado); this._mezclar(j.coyote); this._mezclar(j.buffer);
    this._mezclar(j.saltosRestantes); this._mezclar(j.dashCd); this._mezclar(j.iframes);
    this._mezclar(j.ganchoActivo ? 1 : 0); this._mezclar(j.ganchoLen);
    this._mezclar(S.count);
    this._mezclar(this.rng.s[0] / 65536); this._mezclar(this.rng.s[1] / 65536);
    this._mezclar(this.rng.s[2] / 65536); this._mezclar(this.rng.s[3] / 65536);
    this._mezclar(this.progresion.salaIndice);
    this._mezclar(this.estadoSala);
    this._mezclar(this.oleadaActual);
    this._mezclar(this.arma.orbitales);
    this._mezclar(this.arma.enfriamiento);
    this._mezclar(this.hitstopT);
    this._mezclar(this.ticksCongelados);
    return this._h >>> 0;
  }

  /** Mezcla FNV-1a de un escalar cuantizado. Sin asignaciones. */
  _mezclar(v) {
    const x = Math.round(v * 2048) | 0;
    let h = this._h;
    h ^= x & 0xff; h = Math.imul(h, 16777619);
    h ^= (x >>> 8) & 0xff; h = Math.imul(h, 16777619);
    h ^= (x >>> 16) & 0xff; h = Math.imul(h, 16777619);
    h ^= (x >>> 24) & 0xff; h = Math.imul(h, 16777619);
    this._h = h >>> 0;
  }
}
