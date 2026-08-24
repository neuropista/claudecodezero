// tiles.js — Vocabulario del grid del nivel.

export const TAM = 32;              // píxeles por tile

export const T = {
  VACIO: 0,
  SOLIDO: 1,
  PLATAFORMA: 2,        // sólo colisiona desde arriba
  RAMPA_DER: 3,         // sube hacia la derecha
  RAMPA_IZQ: 4,         // sube hacia la izquierda
  PINCHO_ARRIBA: 5,
  PINCHO_ABAJO: 6,
  CINTA_DER: 7,
  CINTA_IZQ: 8,
  GEL: 9,               // fluido con flotabilidad
  FRAGIL: 10,           // se rompe al recibir daño
  PUERTA: 11,           // sólido mientras la sala no está limpia
  DECOR: 12,            // sin colisión, sólo arte de fondo
};

/** Bloquea el movimiento en todas direcciones. */
export function esSolido(t) {
  return t === T.SOLIDO || t === T.CINTA_DER || t === T.CINTA_IZQ ||
         t === T.FRAGIL || t === T.PUERTA;
}

/** Sólido sólo cuando se cae sobre él desde arriba. */
export function esUnaVia(t) { return t === T.PLATAFORMA; }

export function esRampa(t) { return t === T.RAMPA_DER || t === T.RAMPA_IZQ; }

export function esDanino(t) { return t === T.PINCHO_ARRIBA || t === T.PINCHO_ABAJO; }

export function esFluido(t) { return t === T.GEL; }

export function esCinta(t) { return t === T.CINTA_DER || t === T.CINTA_IZQ; }

/** Bloquea la luz (para el cálculo de sombras). */
export function bloqueaLuz(t) {
  return t === T.SOLIDO || t === T.FRAGIL || t === T.PUERTA ||
         t === T.RAMPA_DER || t === T.RAMPA_IZQ;
}

/**
 * Altura del suelo dentro de una rampa, en píxeles desde el borde superior del
 * tile. `fx` es la posición horizontal normalizada (0..1) dentro del tile.
 */
export function alturaRampa(t, fx) {
  if (t === T.RAMPA_DER) return TAM * (1 - fx);
  if (t === T.RAMPA_IZQ) return TAM * fx;
  return TAM;
}

export const VELOCIDAD_CINTA = 145;
