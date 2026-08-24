// textcache.js — Memoización de cadenas del HUD.
//
// El HUD dibuja textos que sólo cambian cuando cambia un número ("SECTOR 3/24",
// "x7", "84"). Construirlos con plantillas cada fotograma generaba basura
// constante; aquí se reconstruyen únicamente cuando alguna de sus claves cambia.

export class Memo {
  /** @param {(a:any,b:any,c:any)=>string} formato */
  constructor(formato) {
    this.formato = formato;
    this.a = undefined; this.b = undefined; this.c = undefined;
    this.valor = '';
    this.aciertos = 0;
    this.fallos = 0;
  }

  get(a, b, c) {
    if (a !== this.a || b !== this.b || c !== this.c) {
      this.a = a; this.b = b; this.c = c;
      this.valor = this.formato(a, b, c);
      this.fallos++;
    } else {
      this.aciertos++;
    }
    return this.valor;
  }
}

/** Enteros preformateados: cubre el rango típico de vidas, combos y contadores. */
const ENTEROS = [];
for (let i = 0; i <= 512; i++) ENTEROS.push(String(i));

export function entero(n) {
  const i = n | 0;
  return (i >= 0 && i <= 512) ? ENTEROS[i] : String(i);
}
