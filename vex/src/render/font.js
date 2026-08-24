// font.js — Fuente de trazos definida en código y rasterizada al atlas.
//
// No se descarga ninguna tipografía: cada glifo es una lista de polilíneas
// sobre una rejilla de 5x7 unidades (con dos unidades extra arriba para los
// acentos del español). Se dibuja con juntas y remates redondeados y un halo,
// lo que le da el aspecto de neón coherente con el resto del juego.

const A = 2.5;   // desplazamiento vertical de las letras dentro de la caja

// Cada entrada es un array de polilíneas; cada polilínea es [x0,y0,x1,y1,...].
const T = {
  A: [[0, 7, 0, 2, 2, 0, 3, 0, 5, 2, 5, 7], [0, 4.4, 5, 4.4]],
  B: [[0, 7, 0, 0, 4, 0, 5, 1, 5, 2.6, 4, 3.4, 0, 3.4], [4, 3.4, 5, 4.3, 5, 6, 4, 7, 0, 7]],
  C: [[5, 1.2, 3.8, 0, 1.2, 0, 0, 1.2, 0, 5.8, 1.2, 7, 3.8, 7, 5, 5.8]],
  D: [[0, 0, 3.2, 0, 5, 1.8, 5, 5.2, 3.2, 7, 0, 7, 0, 0]],
  E: [[5, 0, 0, 0, 0, 7, 5, 7], [0, 3.4, 3.6, 3.4]],
  F: [[5, 0, 0, 0, 0, 7], [0, 3.4, 3.6, 3.4]],
  G: [[5, 1.2, 3.8, 0, 1.2, 0, 0, 1.2, 0, 5.8, 1.2, 7, 3.8, 7, 5, 5.8, 5, 4, 2.6, 4]],
  H: [[0, 0, 0, 7], [5, 0, 5, 7], [0, 3.4, 5, 3.4]],
  I: [[1, 0, 4, 0], [2.5, 0, 2.5, 7], [1, 7, 4, 7]],
  J: [[5, 0, 5, 5.8, 3.8, 7, 1.2, 7, 0, 5.8, 0, 5]],
  K: [[0, 0, 0, 7], [5, 0, 0.2, 3.9], [1.7, 2.7, 5, 7]],
  L: [[0, 0, 0, 7, 5, 7]],
  M: [[0, 7, 0, 0, 2.5, 3.2, 5, 0, 5, 7]],
  N: [[0, 7, 0, 0, 5, 7, 5, 0]],
  O: [[1.2, 0, 3.8, 0, 5, 1.2, 5, 5.8, 3.8, 7, 1.2, 7, 0, 5.8, 0, 1.2, 1.2, 0]],
  P: [[0, 7, 0, 0, 4, 0, 5, 1.1, 5, 2.9, 4, 4, 0, 4]],
  Q: [[1.2, 0, 3.8, 0, 5, 1.2, 5, 5.8, 3.8, 7, 1.2, 7, 0, 5.8, 0, 1.2, 1.2, 0], [3, 5, 5.4, 7.6]],
  R: [[0, 7, 0, 0, 4, 0, 5, 1.1, 5, 2.9, 4, 4, 0, 4], [2.9, 4, 5, 7]],
  S: [[5, 1.1, 3.8, 0, 1.2, 0, 0, 1.1, 0, 2.7, 1.1, 3.5, 3.9, 3.5, 5, 4.3, 5, 5.9, 3.8, 7, 1.2, 7, 0, 5.9]],
  T: [[0, 0, 5, 0], [2.5, 0, 2.5, 7]],
  U: [[0, 0, 0, 5.8, 1.2, 7, 3.8, 7, 5, 5.8, 5, 0]],
  V: [[0, 0, 2.5, 7, 5, 0]],
  W: [[0, 0, 1.1, 7, 2.5, 3.2, 3.9, 7, 5, 0]],
  X: [[0, 0, 5, 7], [5, 0, 0, 7]],
  Y: [[0, 0, 2.5, 3.5, 5, 0], [2.5, 3.5, 2.5, 7]],
  Z: [[0, 0, 5, 0, 0, 7, 5, 7]],

  0: [[1.2, 0, 3.8, 0, 5, 1.2, 5, 5.8, 3.8, 7, 1.2, 7, 0, 5.8, 0, 1.2, 1.2, 0], [1.1, 5.6, 3.9, 1.4]],
  1: [[0.6, 1.6, 2.5, 0, 2.5, 7], [0.8, 7, 4.2, 7]],
  2: [[0, 1.2, 1.2, 0, 3.8, 0, 5, 1.2, 5, 2.6, 0, 7, 5, 7]],
  3: [[0.2, 0, 5, 0, 2.6, 3.2], [3.9, 3.2, 5, 4.2, 5, 5.9, 3.8, 7, 1.2, 7, 0, 5.9]],
  4: [[3.9, 7, 3.9, 0, 0, 4.8, 5, 4.8]],
  5: [[5, 0, 0, 0, 0, 3.2, 3.9, 3.2, 5, 4.2, 5, 5.9, 3.8, 7, 1.2, 7, 0, 5.9]],
  6: [[5, 1.1, 3.8, 0, 1.2, 0, 0, 1.2, 0, 5.8, 1.2, 7, 3.8, 7, 5, 5.8, 5, 4.4, 3.9, 3.5, 0, 3.5]],
  7: [[0, 0, 5, 0, 1.9, 7]],
  8: [[1.2, 3.5, 0, 2.6, 0, 1.1, 1.2, 0, 3.8, 0, 5, 1.1, 5, 2.6, 3.8, 3.5, 1.2, 3.5, 0, 4.5, 0, 5.9, 1.2, 7, 3.8, 7, 5, 5.9, 5, 4.5, 3.8, 3.5]],
  9: [[0, 5.9, 1.2, 7, 3.8, 7, 5, 5.8, 5, 1.2, 3.8, 0, 1.2, 0, 0, 1.2, 0, 2.7, 1.1, 3.6, 5, 3.6]],

  ' ': [],
  '.': [[2.2, 6.6, 2.8, 6.6, 2.8, 7, 2.2, 7, 2.2, 6.6]],
  ',': [[2.9, 6.4, 2.2, 8.1]],
  ':': [[2.5, 2.2, 2.5, 2.7], [2.5, 6.3, 2.5, 6.8]],
  ';': [[2.5, 2.2, 2.5, 2.7], [2.9, 6.2, 2.2, 7.9]],
  '!': [[2.5, 0, 2.5, 4.8], [2.5, 6.4, 2.5, 7]],
  '?': [[0.2, 1.2, 1.4, 0, 3.6, 0, 4.8, 1.2, 4.8, 2.4, 2.5, 4, 2.5, 4.9], [2.5, 6.4, 2.5, 7]],
  '¡': [[2.5, 7, 2.5, 2.2], [2.5, 0.6, 2.5, 0]],
  '¿': [[4.8, 5.8, 3.6, 7, 1.4, 7, 0.2, 5.8, 0.2, 4.6, 2.5, 3, 2.5, 2.1], [2.5, 0.6, 2.5, 0]],
  '-': [[0.8, 3.5, 4.2, 3.5]],
  '_': [[0, 7.4, 5, 7.4]],
  '+': [[0.8, 3.5, 4.2, 3.5], [2.5, 1.8, 2.5, 5.2]],
  '=': [[0.8, 2.6, 4.2, 2.6], [0.8, 4.4, 4.2, 4.4]],
  '*': [[2.5, 1.4, 2.5, 5.2], [0.9, 2.3, 4.1, 4.3], [4.1, 2.3, 0.9, 4.3]],
  '/': [[0.3, 7, 4.7, 0]],
  '\\': [[0.3, 0, 4.7, 7]],
  '(': [[3.6, 0, 1.6, 2, 1.6, 5, 3.6, 7]],
  ')': [[1.4, 0, 3.4, 2, 3.4, 5, 1.4, 7]],
  '[': [[3.8, 0, 1.4, 0, 1.4, 7, 3.8, 7]],
  ']': [[1.2, 0, 3.6, 0, 3.6, 7, 1.2, 7]],
  '<': [[4, 0.6, 0.8, 3.5, 4, 6.4]],
  '>': [[1, 0.6, 4.2, 3.5, 1, 6.4]],
  "'": [[2.5, 0, 2.5, 1.8]],
  '"': [[1.6, 0, 1.6, 1.8], [3.4, 0, 3.4, 1.8]],
  '%': [[4.6, 0.4, 0.4, 6.6], [0.3, 0.4, 1.7, 0.4, 1.7, 2, 0.3, 2, 0.3, 0.4], [3.3, 5, 4.7, 5, 4.7, 6.6, 3.3, 6.6, 3.3, 5]],
  '#': [[1.4, 0.6, 0.8, 6.4], [3.8, 0.6, 3.2, 6.4], [0.3, 2.4, 4.6, 2.4], [0.2, 4.6, 4.5, 4.6]],
  '@': [[4.4, 5.6, 1.4, 7, 0.2, 5.4, 0.4, 1.6, 2, 0, 4, 0.4, 4.8, 2.2, 4.4, 4.4, 3, 4.6, 2.6, 2.2, 1.6, 2.4, 1.6, 4.2, 3, 4.6]],
  '&': [[4.6, 7, 1, 3.2, 1, 1.2, 2, 0, 3.2, 0.6, 3.2, 2, 0.4, 4.4, 0.4, 6, 1.6, 7, 3.4, 6.6, 4.6, 4.6]],
  '°': [[1.6, 0.2, 3, 0.2, 3.4, 1, 3, 1.8, 1.6, 1.8, 1.2, 1, 1.6, 0.2]],
  '·': [[2.3, 3.3, 2.7, 3.3, 2.7, 3.8, 2.3, 3.8, 2.3, 3.3]],
  '·': [[2.3, 3.3, 2.7, 3.3, 2.7, 3.8, 2.3, 3.8, 2.3, 3.3]],
  '»': [[0.4, 1.4, 2.2, 3.5, 0.4, 5.6], [2.6, 1.4, 4.4, 3.5, 2.6, 5.6]],
  '«': [[4.6, 1.4, 2.8, 3.5, 4.6, 5.6], [2.4, 1.4, 0.6, 3.5, 2.4, 5.6]],
  '|': [[2.5, 0, 2.5, 7]],
  '—': [[0, 3.5, 5, 3.5]],
  '·': [[2.2, 3.2, 2.8, 3.2, 2.8, 3.9, 2.2, 3.9, 2.2, 3.2]],
  '^': [[0.8, 2.2, 2.5, 0.2, 4.2, 2.2]],
  '~': [[0.4, 3.8, 1.5, 2.9, 3.5, 4.1, 4.6, 3.2]],
  '←': [[0.4, 3.5, 4.6, 3.5], [2.1, 1.6, 0.4, 3.5, 2.1, 5.4]],
  '→': [[0.4, 3.5, 4.6, 3.5], [2.9, 1.6, 4.6, 3.5, 2.9, 5.4]],
  '↑': [[2.5, 0.4, 2.5, 6.6], [0.9, 2.2, 2.5, 0.4, 4.1, 2.2]],
  '↓': [[2.5, 0.4, 2.5, 6.6], [0.9, 4.8, 2.5, 6.6, 4.1, 4.8]],
  '▲': [[2.5, 1, 4.6, 6, 0.4, 6, 2.5, 1]],
  '●': [[1.2, 2.4, 3.8, 2.4, 3.8, 5, 1.2, 5, 1.2, 2.4]],
};

// Diacríticos, en coordenadas absolutas dentro de la caja (antes del offset A).
const AGUDO = [[2.0, 1.9, 3.6, 0.4]];
const DIERESIS = [[1.5, 0.6, 1.5, 1.5], [3.5, 0.6, 3.5, 1.5]];
const TILDE_N = [[1.0, 1.9, 1.9, 0.7, 3.1, 1.7, 4.0, 0.5]];

const ACENTUADAS = {
  'Á': ['A', AGUDO], 'É': ['E', AGUDO], 'Í': ['I', AGUDO], 'Ó': ['O', AGUDO], 'Ú': ['U', AGUDO],
  'Ü': ['U', DIERESIS], 'Ñ': ['N', TILDE_N],
};

export const CARACTERES = [...Object.keys(T), ...Object.keys(ACENTUADAS)];

export const ANCHO_UNIDAD = 5;
export const ALTO_UNIDAD = 10;      // 2.5 de acentos + 7 de letra + 0.5 de descendentes

/** Pares minuscula -> mayuscula que la fuente sabe dibujar. */
const MINUSCULAS = {
  0xE1: 'Á', 0xE9: 'É', 0xED: 'Í', 0xF3: 'Ó', 0xFA: 'Ú', 0xFC: 'Ü', 0xF1: 'Ñ',
};

/** Normaliza texto de entrada al juego de caracteres disponible. */
export function normalizar(texto) {
  let s = String(texto).toUpperCase();
  let out = '';
  for (const ch of s) {
    if (T[ch] !== undefined || ACENTUADAS[ch] !== undefined) out += ch;
    else if (ch === '\n') out += ch;
    else out += ' ';
  }
  return out;
}

/**
 * Registra un sprite por carácter en el atlas.
 * @returns {Map<string, number>} carácter -> índice de sprite
 */
export function registrarFuente(atlas, celdaAlto = 44, color = '#dff6ff', glow = '#3ad9ff') {
  const escala = celdaAlto / ALTO_UNIDAD;
  const celdaAncho = Math.ceil(ANCHO_UNIDAD * escala) + 6;
  const grosor = Math.max(2, escala * 0.62);
  const mapa = new Map();
  // Indice por codigo de caracter: permite dibujar texto sin construir una
  // cadena normalizada por fotograma (era la unica fuente de basura del HUD).
  const porCodigo = new Map();

  const trazar = (ctx, lineas, offsetY) => {
    for (const linea of lineas) {
      if (linea.length < 4) continue;
      ctx.beginPath();
      ctx.moveTo(3 + linea[0] * escala, (linea[1] + offsetY) * escala);
      for (let i = 2; i < linea.length; i += 2) {
        ctx.lineTo(3 + linea[i] * escala, (linea[i + 1] + offsetY) * escala);
      }
      ctx.stroke();
    }
  };

  const dibujarGlifo = (ch) => (ctx) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const acentuada = ACENTUADAS[ch];
    const base = acentuada ? T[acentuada[0]] : T[ch];
    const acento = acentuada ? acentuada[1] : null;
    if (!base || base.length === 0) return;

    // Pasada de halo.
    ctx.strokeStyle = glow;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = grosor * 2.6;
    trazar(ctx, base, A);
    if (acento) trazar(ctx, acento, 0);

    // Pasada nítida.
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = grosor;
    trazar(ctx, base, A);
    if (acento) trazar(ctx, acento, 0);
  };

  for (const ch of CARACTERES) {
    const idx = atlas.add(`fuente.${ch}`, celdaAncho, celdaAlto, dibujarGlifo(ch));
    mapa.set(ch, idx);
    porCodigo.set(ch.charCodeAt(0), idx);
    // Minusculas latinas basicas -> el mismo glifo en mayuscula.
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) porCodigo.set(c + 32, idx);
  }
  for (const codigo of Object.keys(MINUSCULAS)) {
    const idx = mapa.get(MINUSCULAS[codigo]);
    if (idx !== undefined) porCodigo.set(Number(codigo), idx);
  }
  const espacio = mapa.get(' ');

  return { mapa, porCodigo, espacio, celdaAncho, celdaAlto, avance: celdaAncho - 4 };
}
