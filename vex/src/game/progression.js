// progression.js — Estructura de la partida: biomas, salas, dificultad y
// recompensas. Todo se deriva de la semilla, así que una misma semilla siempre
// produce el mismo recorrido.

import { TIPO_SALA } from './level.js';
import { LISTA_MODULOS, MOD } from './weapons.js';

export const BIOMAS = [
  { nombre: 'CORTEZA EXTERNA', salas: 5, lema: 'La superficie del pensamiento se resquebraja.' },
  { nombre: 'CAMPO SINAPTICO', salas: 6, lema: 'Aqui los recuerdos todavia intentan conectarse.' },
  { nombre: 'NUCLEO TERMICO', salas: 6, lema: 'El calor de un millon de decisiones fallidas.' },
  { nombre: 'EL VACIO', salas: 7, lema: 'Lo que queda cuando la red deja de sostenerse.' },
];

export class Progresion {
  constructor(rng) {
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.bioma = 0;
    this.salaIndice = 0;
    this.salasTotales = 0;
    this.modulosObtenidos = 0;
    this.enemigosDerrotados = 0;
    this.jefesDerrotados = 0;
    this.tiempo = 0;
    this.danioRecibido = 0;
    this.plan = null;
    this.terminada = false;
    this.victoria = false;
    this.generarPlan();
  }

  /** Construye la lista completa de salas de la partida. */
  generarPlan() {
    const plan = [];
    plan.push({ tipo: TIPO_SALA.INICIO, bioma: 0 });
    for (let b = 0; b < BIOMAS.length; b++) {
      const n = BIOMAS[b].salas;
      // Reparto: combate y plataformas alternando, una cámara de módulos y un
      // nodo estable antes del jefe.
      const cuerpo = [];
      for (let i = 0; i < n - 2; i++) {
        cuerpo.push(this.rng.bool(0.55) ? TIPO_SALA.COMBATE : TIPO_SALA.PLATAFORMAS);
      }
      // Garantiza al menos una cámara de módulos por bioma.
      cuerpo[this.rng.int(cuerpo.length)] = TIPO_SALA.TESORO;
      this.rng.shuffle(cuerpo);
      for (const t of cuerpo) plan.push({ tipo: t, bioma: b });
      plan.push({ tipo: TIPO_SALA.REPOSO, bioma: b });
      plan.push({ tipo: TIPO_SALA.JEFE, bioma: b });
    }
    this.plan = plan;
    this.salasTotales = plan.length;
  }

  get actual() { return this.plan[Math.min(this.salaIndice, this.plan.length - 1)]; }
  get esUltima() { return this.salaIndice >= this.plan.length - 1; }

  /** Dificultad continua: sube dentro del bioma y entre biomas. */
  dificultad() {
    const b = this.actual.bioma;
    const dentro = this.salaIndice - this.plan.findIndex((s) => s.bioma === b);
    return 1 + b * 2.1 + dentro * 0.42;
  }

  escalaVida() { return 1 + this.actual.bioma * 0.55 + this.salaIndice * 0.045; }

  avanzar() {
    this.salaIndice++;
    if (this.salaIndice >= this.plan.length) {
      this.terminada = true;
      this.victoria = true;
      this.salaIndice = this.plan.length - 1;
      return false;
    }
    this.bioma = this.actual.bioma;
    return true;
  }

  /** Módulo que toca entregar (nunca repite hasta agotarlos). */
  siguienteModulo(desbloqueados) {
    const faltan = LISTA_MODULOS.filter((m) => (desbloqueados & m.bit) === 0);
    if (faltan.length === 0) return 0;
    return this.rng.pick(faltan).bit;
  }

  /** Composición de una oleada, en función de la dificultad y el bioma. */
  generarOleadas(sala, TIPOS) {
    const dif = this.dificultad();
    const b = this.actual.bioma;
    const oleadas = [];
    const nOleadas = sala.tipo === TIPO_SALA.PLATAFORMAS ? 1 : Math.min(3, 1 + Math.floor(dif / 3));
    for (let o = 0; o < nOleadas; o++) {
      const lista = [];
      const presupuesto = Math.round((3 + dif * 1.35) * (1 + o * 0.32));
      let gastado = 0;
      // `pareja` fuerza a que salgan de dos en dos: un tejedor solo no tiende
      // ningun cable y pierde todo su sentido.
      const disponibles = [
        { tipo: TIPOS.DRON, coste: 2, desde: 0 },
        { tipo: TIPOS.RASTREADOR, coste: 2, desde: 0 },
        { tipo: TIPOS.ENJAMBRE, coste: 1, desde: 0 },
        { tipo: TIPOS.VOLADOR, coste: 2, desde: 1 },
        { tipo: TIPOS.BOMBARDERO, coste: 3, desde: 1 },
        { tipo: TIPOS.DIVISOR, coste: 4, desde: 1 },
        { tipo: TIPOS.TEJEDOR, coste: 3, desde: 1, pareja: true },
        { tipo: TIPOS.ESCUDO, coste: 4, desde: 2 },
        { tipo: TIPOS.ESPEJO, coste: 4, desde: 2 },
      ].filter((x) => b >= x.desde);
      let guardia = 0;
      while (gastado < presupuesto && guardia++ < 64) {
        const pick = this.rng.pick(disponibles);
        const cuantos = pick.pareja ? 2 : 1;
        const coste = pick.coste * cuantos;
        if (gastado + coste > presupuesto + 1) break;
        const elite = dif > 6 && !pick.pareja && this.rng.bool(0.14);
        for (let k = 0; k < cuantos; k++) lista.push({ tipo: pick.tipo, elite });
        gastado += coste * (elite ? 2 : 1);
      }
      if (lista.length === 0) lista.push({ tipo: TIPOS.DRON, elite: false });
      oleadas.push(lista);
    }
    return oleadas;
  }

  resumen() {
    return {
      salas: this.salaIndice,
      total: this.salasTotales,
      enemigos: this.enemigosDerrotados,
      jefes: this.jefesDerrotados,
      modulos: this.modulosObtenidos,
      tiempo: this.tiempo,
      danio: this.danioRecibido,
    };
  }
}

/** Récords persistentes entre partidas. */
export class Records {
  constructor() {
    this.datos = { mejorSala: 0, mejorTiempo: 0, partidas: 0, victorias: 0, enemigos: 0 };
    this.cargar();
  }
  cargar() {
    try {
      const raw = localStorage.getItem('vex.records.v1');
      if (raw) Object.assign(this.datos, JSON.parse(raw));
    } catch { /* sin almacenamiento */ }
  }
  guardar() {
    try { localStorage.setItem('vex.records.v1', JSON.stringify(this.datos)); } catch { /* nada */ }
  }
  registrar(resumen, victoria) {
    this.datos.partidas++;
    if (victoria) this.datos.victorias++;
    this.datos.enemigos += resumen.enemigos;
    if (resumen.salas > this.datos.mejorSala) this.datos.mejorSala = resumen.salas;
    if (victoria && (this.datos.mejorTiempo === 0 || resumen.tiempo < this.datos.mejorTiempo)) {
      this.datos.mejorTiempo = resumen.tiempo;
    }
    this.guardar();
  }
}
