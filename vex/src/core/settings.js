// settings.js — Opciones persistentes en localStorage.

const CLAVE = 'vex.opciones.v1';

export const OPCIONES_DEFECTO = {
  volMaster: 0.85,
  volMusica: 0.6,
  volSfx: 0.9,
  bloom: true,
  aberracion: true,
  vineta: true,
  grano: true,
  crt: true,
  flash: true,
  shake: 1.0,
  luces: true,
  sombras: true,
  particulas: 1.0,
  parallax: true,
  escala: 1.0,           // escala de resolución interna
  mostrarFps: false,
  hitstop: true,
  idioma: 'es',
};

export class Settings {
  constructor() {
    this.datos = { ...OPCIONES_DEFECTO };
    this.oyentes = [];
    this.cargar();
  }

  get(k) { return this.datos[k]; }

  set(k, v) {
    if (this.datos[k] === v) return;
    this.datos[k] = v;
    this.guardar();
    for (const fn of this.oyentes) fn(k, v);
  }

  toggle(k) { this.set(k, !this.datos[k]); }
  on(fn) { this.oyentes.push(fn); }

  restaurar() {
    for (const k of Object.keys(OPCIONES_DEFECTO)) this.set(k, OPCIONES_DEFECTO[k]);
  }

  cargar() {
    try {
      const raw = localStorage.getItem(CLAVE);
      if (!raw) return;
      const obj = JSON.parse(raw);
      for (const k of Object.keys(OPCIONES_DEFECTO)) {
        if (obj[k] !== undefined && typeof obj[k] === typeof OPCIONES_DEFECTO[k]) {
          this.datos[k] = obj[k];
        }
      }
    } catch { /* almacenamiento no disponible: seguimos con los valores por defecto */ }
  }

  guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(this.datos)); } catch { /* modo privado */ }
  }
}
