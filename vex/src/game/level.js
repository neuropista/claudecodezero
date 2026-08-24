// level.js — Generación procedural de salas.
//
// Cada sala se construye desde el PRNG sembrado de la partida: la misma semilla
// produce exactamente el mismo nivel. El generador traza primero una "espina"
// de plataformas alcanzables (comprobada contra las capacidades reales de salto
// de Vex) y sólo después decora, así que ninguna sala puede quedar bloqueada.

import { TAM, T, bloqueaLuz } from './tiles.js';
import { segmentosDesdeGrid } from '../render/lighting.js';

export const TIPO_SALA = {
  COMBATE: 0, PLATAFORMAS: 1, TESORO: 2, REPOSO: 3, JEFE: 4, INICIO: 5,
};

export const NOMBRE_TIPO = ['Combate', 'Travesia', 'Camara de Modulos', 'Nodo Estable', 'Jefe', 'Entrada'];

// Capacidades de movimiento en tiles (medidas con la física real).
const SALTO_ALTO = 3;      // tiles de subida garantizados con un salto
const SALTO_LARGO = 5;     // tiles de hueco cruzables sin dash

export class Sala {
  constructor(ancho, alto) {
    this.ancho = ancho; this.alto = alto;
    this.tiles = new Uint8Array(ancho * alto);
    this.variante = new Uint8Array(ancho * alto);
    this.props = [];
    this.spawns = [];
    this.spawnsAire = [];
    this.entrada = { x: 0, y: 0 };
    this.salida = { x: 0, y: 0 };
    this.puertas = [];
    this.tipo = TIPO_SALA.COMBATE;
    this.bioma = 0;
    this.indice = 0;
    this.oleadas = [];
    this.solidez = null;
    this.segmentos = null;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.ancho || y >= this.alto) return T.SOLIDO;
    return this.tiles[y * this.ancho + x];
  }

  set(x, y, t, variante = 0) {
    if (x < 0 || y < 0 || x >= this.ancho || y >= this.alto) return;
    this.tiles[y * this.ancho + x] = t;
    this.variante[y * this.ancho + x] = variante;
  }

  get anchoPx() { return this.ancho * TAM; }
  get altoPx() { return this.alto * TAM; }

  /** Datos derivados que consumen el renderizador y las partículas. */
  finalizar() {
    const n = this.ancho * this.alto;
    this.solidez = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.solidez[i] = bloqueaLuz(this.tiles[i]) ? 255 : 0;
    const g = segmentosDesdeGrid(
      (x, y) => (x < 0 || y < 0 || x >= this.ancho || y >= this.alto ? true : bloqueaLuz(this.tiles[y * this.ancho + x])),
      this.ancho, this.alto, TAM, 0, 0,
    );
    this.segmentos = g;
    return this;
  }

  /** Primer suelo por debajo de (tx,ty). Devuelve la fila del tile de suelo. */
  sueloBajo(tx, ty) {
    for (let y = ty; y < this.alto; y++) {
      const t = this.get(tx, y);
      if (t === T.SOLIDO || t === T.PLATAFORMA || t === T.RAMPA_DER || t === T.RAMPA_IZQ) return y;
    }
    return this.alto - 1;
  }
}

function rellenarRect(sala, x0, y0, x1, y1, t, rng) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) sala.set(x, y, t, rng ? rng.int(4) : 0);
  }
}

function plataforma(sala, x0, y, largo, rng, tipo = T.SOLIDO, grosor = 1) {
  for (let x = x0; x < x0 + largo; x++) {
    for (let g = 0; g < grosor; g++) sala.set(x, y + g, tipo, rng.int(4));
  }
}

/** Construye el marco exterior y el suelo base. */
function marco(sala, rng, sueloY) {
  rellenarRect(sala, 0, 0, sala.ancho - 1, 1, T.SOLIDO, rng);
  rellenarRect(sala, 0, sala.alto - 2, sala.ancho - 1, sala.alto - 1, T.SOLIDO, rng);
  rellenarRect(sala, 0, 0, 1, sala.alto - 1, T.SOLIDO, rng);
  rellenarRect(sala, sala.ancho - 2, 0, sala.ancho - 1, sala.alto - 1, T.SOLIDO, rng);
  rellenarRect(sala, 2, sueloY, sala.ancho - 3, sala.alto - 3, T.SOLIDO, rng);
}

/** Abre huecos en el suelo y los llena de peligro o de vacío. */
function fosos(sala, rng, sueloY, cantidad, bioma) {
  for (let i = 0; i < cantidad; i++) {
    const ancho = rng.irange(3, 6);
    const x = rng.irange(6, sala.ancho - 8 - ancho);
    // No abrir fosos justo en las entradas.
    if (x < 8 || x + ancho > sala.ancho - 8) continue;
    for (let dx = 0; dx < ancho; dx++) {
      for (let y = sueloY; y < sala.alto - 2; y++) sala.set(x + dx, y, T.VACIO);
    }
    const relleno = rng.float();
    if (relleno < 0.45) {
      for (let dx = 0; dx < ancho; dx++) sala.set(x + dx, sala.alto - 3, T.PINCHO_ARRIBA);
    } else if (relleno < 0.7) {
      for (let dx = 0; dx < ancho; dx++) {
        for (let y = sala.alto - 5; y < sala.alto - 2; y++) sala.set(x + dx, y, T.GEL);
      }
    }
  }
}

/** Espina de plataformas garantizada alcanzable de izquierda a derecha. */
function espina(sala, rng, sueloY) {
  let x = 6;
  let y = sueloY - rng.irange(3, 5);
  const anclas = [];
  while (x < sala.ancho - 10) {
    const largo = rng.irange(3, 7);
    const tipo = rng.float() < 0.28 ? T.PLATAFORMA : T.SOLIDO;
    plataforma(sala, x, y, largo, rng, tipo, tipo === T.SOLIDO ? rng.irange(1, 2) : 1);
    anclas.push({ x: x + (largo >> 1), y });
    const hueco = rng.irange(2, SALTO_LARGO);
    const subida = rng.irange(-2, SALTO_ALTO);
    x += largo + hueco;
    y = Math.max(5, Math.min(sueloY - 2, y - subida));
  }
  return anclas;
}

/** Columnas y salientes que dan cobertura y verticalidad. */
function columnas(sala, rng, sueloY, cantidad) {
  for (let i = 0; i < cantidad; i++) {
    const x = rng.irange(5, sala.ancho - 7);
    const alto = rng.irange(2, 6);
    const ancho = rng.irange(1, 2);
    const base = sala.sueloBajo(x, 3);
    for (let dx = 0; dx < ancho; dx++) {
      for (let dy = 1; dy <= alto; dy++) sala.set(x + dx, base - dy, T.SOLIDO, rng.int(4));
    }
    // Chaflan lateral: rampa arriba y relleno solido debajo, para que la
    // silueta no quede como un bloque plantado y se pueda subir por el lado.
    if (rng.bool(0.5) && alto >= 2) {
      const top = base - alto;
      for (const [tx, tipo] of [[x - 1, T.RAMPA_DER], [x + ancho, T.RAMPA_IZQ]]) {
        if (sala.get(tx, top) !== T.VACIO) continue;
        sala.set(tx, top, tipo);
        for (let dy = top + 1; dy <= base - 1; dy++) sala.set(tx, dy, T.SOLIDO, rng.int(4));
      }
    }
  }
}

function rampasSuelo(sala, rng, cantidad) {
  for (let i = 0; i < cantidad; i++) {
    const x = rng.irange(6, sala.ancho - 10);
    const y = sala.sueloBajo(x, 3);
    if (sala.get(x, y) !== T.SOLIDO) continue;
    const largo = rng.irange(2, 4);
    const dir = rng.bool() ? 1 : -1;
    for (let k = 0; k < largo; k++) {
      const tx = x + k * dir;
      if (sala.get(tx, y) !== T.SOLIDO) break;
      // Subiendo hacia la derecha se usa RAMPA_DER, y al reves RAMPA_IZQ.
      sala.set(tx, y - k - 1, dir > 0 ? T.RAMPA_DER : T.RAMPA_IZQ);
      // Relleno macizo bajo la rampa: sin esto quedaban escalones flotando.
      for (let d = 1; d <= k; d++) sala.set(tx, y - d, T.SOLIDO, rng.int(4));
    }
  }
}

function cintas(sala, rng, cantidad) {
  for (let i = 0; i < cantidad; i++) {
    const x = rng.irange(6, sala.ancho - 12);
    const y = sala.sueloBajo(x, 4);
    const largo = rng.irange(4, 8);
    const dir = rng.bool() ? T.CINTA_DER : T.CINTA_IZQ;
    for (let k = 0; k < largo; k++) {
      if (sala.get(x + k, y) === T.SOLIDO) sala.set(x + k, y, dir);
    }
  }
}

function fragiles(sala, rng, cantidad) {
  for (let i = 0; i < cantidad; i++) {
    const x = rng.irange(5, sala.ancho - 7);
    const y = rng.irange(5, sala.alto - 6);
    if (sala.get(x, y) !== T.VACIO) continue;
    if (sala.get(x, y + 1) === T.VACIO && sala.get(x - 1, y) === T.VACIO) continue;
    const largo = rng.irange(1, 3);
    for (let k = 0; k < largo; k++) sala.set(x + k, y, T.FRAGIL);
  }
}

function pinchosTecho(sala, rng, cantidad) {
  for (let i = 0; i < cantidad; i++) {
    const x = rng.irange(6, sala.ancho - 8);
    for (let y = 2; y < sala.alto - 6; y++) {
      if (sala.get(x, y) === T.SOLIDO && sala.get(x, y + 1) === T.VACIO) {
        const largo = rng.irange(1, 3);
        for (let k = 0; k < largo; k++) {
          if (sala.get(x + k, y) === T.SOLIDO && sala.get(x + k, y + 1) === T.VACIO) {
            sala.set(x + k, y + 1, T.PINCHO_ABAJO);
          }
        }
        break;
      }
    }
  }
}

/** Coloca puertas de entrada y salida, y registra sus posiciones en píxeles. */
function puertas(sala, rng, sueloY, primera, ultima) {
  const yEnt = sala.sueloBajo(4, 3);
  const ySal = sala.sueloBajo(sala.ancho - 5, 3);
  // Nichos despejados para que nunca aparezcas dentro de un muro.
  for (let dy = 1; dy <= 4; dy++) {
    for (let dx = 2; dx <= 5; dx++) sala.set(dx, yEnt - dy, T.VACIO);
    for (let dx = sala.ancho - 6; dx <= sala.ancho - 3; dx++) sala.set(dx, ySal - dy, T.VACIO);
  }
  for (let dx = 2; dx <= 5; dx++) if (sala.get(dx, yEnt) === T.VACIO) sala.set(dx, yEnt, T.SOLIDO, rng.int(4));
  for (let dx = sala.ancho - 6; dx <= sala.ancho - 3; dx++) {
    if (sala.get(dx, ySal) === T.VACIO) sala.set(dx, ySal, T.SOLIDO, rng.int(4));
  }

  sala.entrada.x = 4 * TAM + TAM * 0.5;
  sala.entrada.y = yEnt * TAM - 30;
  sala.salida.x = (sala.ancho - 4) * TAM + TAM * 0.5;
  sala.salida.y = ySal * TAM - 30;

  sala.puertas.push({
    x: (sala.ancho - 3) * TAM, y: ySal * TAM - 48,
    ancho: 40, alto: 96, abierta: false, esSalida: true, animacion: 0,
  });
  if (!primera) {
    sala.puertas.push({
      x: 2 * TAM, y: yEnt * TAM - 48,
      ancho: 40, alto: 96, abierta: true, esSalida: false, animacion: 1,
    });
  }
}

/** Puntos donde pueden aparecer enemigos sin quedar atrapados. */
function puntosSpawn(sala, rng) {
  for (let x = 6; x < sala.ancho - 6; x += 2) {
    const y = sala.sueloBajo(x, 3);
    if (y >= sala.alto - 1) continue;
    if (sala.get(x, y - 1) !== T.VACIO || sala.get(x, y - 2) !== T.VACIO) continue;
    const px = x * TAM + TAM * 0.5, py = y * TAM - 26;
    if (px < 7 * TAM || px > (sala.ancho - 7) * TAM) continue;
    sala.spawns.push(px, py);
  }
  for (let i = 0; i < 40; i++) {
    const x = rng.irange(6, sala.ancho - 7);
    const y = rng.irange(4, sala.alto - 8);
    if (sala.get(x, y) !== T.VACIO || sala.get(x, y - 1) !== T.VACIO || sala.get(x + 1, y) !== T.VACIO) continue;
    sala.spawnsAire.push(x * TAM + TAM * 0.5, y * TAM);
  }
  if (sala.spawns.length === 0) {
    sala.spawns.push(sala.anchoPx * 0.5, (sala.alto - 3) * TAM - 26);
  }
  if (sala.spawnsAire.length === 0) {
    sala.spawnsAire.push(sala.anchoPx * 0.5, sala.altoPx * 0.4);
  }
}

/** Luces estáticas y props decorativos que dan carácter al bioma. */
function decorar(sala, rng, bioma) {
  const paletaLuz = [
    [0.35, 0.75, 1.0], [0.75, 0.45, 1.0], [1.0, 0.6, 0.25], [0.35, 1.0, 0.8],
  ][bioma];
  // Las luces se anclan a una superficie pero SIEMPRE dentro de un hueco: una
  // luz metida en la roca genera un poligono de visibilidad degenerado y se ve
  // como una franja vertical rarisima.
  const cuantas = 10 + rng.int(7);
  let colocadas = 0;
  for (let intento = 0; intento < cuantas * 8 && colocadas < cuantas; intento++) {
    const x = rng.irange(3, sala.ancho - 4);
    const desdeArriba = rng.bool(0.45);
    let py = -1;
    if (desdeArriba) {
      // Colgada del techo: primer hueco por debajo de un solido.
      for (let y = 2; y < sala.alto - 4; y++) {
        if (sala.get(x, y) === T.SOLIDO && sala.get(x, y + 1) === T.VACIO) { py = y + 1; break; }
      }
    } else {
      // Apoyada en el suelo: primer hueco por encima de un solido.
      for (let y = sala.alto - 4; y > 2; y--) {
        if (sala.get(x, y) === T.SOLIDO && sala.get(x, y - 1) === T.VACIO) { py = y - 1; break; }
      }
    }
    if (py < 0) continue;
    // Comprobacion final: el hueco tiene que estar realmente despejado.
    if (sala.get(x, py) !== T.VACIO) continue;
    sala.props.push({
      tipo: 'luz',
      x: x * TAM + TAM * 0.5, y: py * TAM + TAM * 0.5,
      r: paletaLuz[0], g: paletaLuz[1], b: paletaLuz[2],
      radio: 230 + rng.int(200), intensidad: 0.85 + rng.float() * 0.45,
      parpadeo: rng.bool(0.22) ? 0.35 : 0,
    });
    colocadas++;
  }
  for (let i = 0; i < 4 + rng.int(4); i++) {
    const x = rng.irange(5, sala.ancho - 6);
    const y = sala.sueloBajo(x, 3);
    if (sala.get(x, y - 1) !== T.VACIO) continue;
    sala.props.push({ tipo: 'escombro', x: x * TAM + TAM * 0.5, y: y * TAM - 16, variante: rng.int(4) });
  }
}

function trampas(sala, rng, dificultad, bioma) {
  const nTorretas = Math.min(4, Math.floor(dificultad * 0.6) + rng.int(2));
  for (let i = 0; i < nTorretas; i++) {
    const x = rng.irange(8, sala.ancho - 9);
    const y = sala.sueloBajo(x, 3);
    if (sala.get(x, y - 1) !== T.VACIO) continue;
    sala.props.push({ tipo: 'torreta', x: x * TAM + TAM * 0.5, y: y * TAM - 20, cadencia: 1.4 + rng.float() * 0.9 });
  }
  const nLaseres = Math.min(3, Math.floor(dificultad * 0.5));
  for (let i = 0; i < nLaseres; i++) {
    const x = rng.irange(8, sala.ancho - 9);
    let y = 3;
    while (y < sala.alto - 6 && sala.get(x, y) !== T.SOLIDO) y++;
    if (y >= sala.alto - 6) continue;
    sala.props.push({
      tipo: 'laser', x: x * TAM + TAM * 0.5, y: y * TAM + TAM * 0.7,
      periodo: 2.4 + rng.float() * 1.6, aviso: 0.7, fase: rng.float() * 3,
    });
  }
  const nMoviles = 1 + rng.int(3);
  for (let i = 0; i < nMoviles; i++) {
    const x = rng.irange(8, sala.ancho - 12);
    const y = rng.irange(6, sala.alto - 8);
    if (sala.get(x, y) !== T.VACIO) continue;
    const vertical = rng.bool(0.4);
    sala.props.push({
      tipo: 'plataformaMovil',
      x: x * TAM, y: y * TAM,
      ancho: TAM * rng.irange(2, 4), alto: 14,
      recorrido: TAM * rng.irange(3, 6),
      vertical, velocidad: 42 + rng.float() * 45, fase: rng.float() * 6.28,
    });
  }
}

/**
 * Genera una sala completa.
 * @param {Rng} rng generador ya sembrado
 */
export function generarSala(rng, { tipo, bioma, indice, dificultad, primera = false, ultima = false }) {
  let ancho, alto;
  switch (tipo) {
    case TIPO_SALA.JEFE: ancho = 74; alto = 34; break;
    case TIPO_SALA.TESORO: ancho = 44; alto = 26; break;
    case TIPO_SALA.REPOSO: ancho = 40; alto = 24; break;
    case TIPO_SALA.INICIO: ancho = 52; alto = 28; break;
    case TIPO_SALA.PLATAFORMAS: ancho = rng.irange(76, 92); alto = rng.irange(32, 38); break;
    default: ancho = rng.irange(62, 78); alto = rng.irange(28, 34);
  }

  const sala = new Sala(ancho, alto);
  sala.tipo = tipo; sala.bioma = bioma; sala.indice = indice;
  const sueloY = alto - 4;
  marco(sala, rng, sueloY);

  if (tipo === TIPO_SALA.JEFE) {
    // Arena limpia con dos repisas laterales y una central baja.
    plataforma(sala, 8, sueloY - 6, 9, rng, T.SOLIDO, 2);
    plataforma(sala, ancho - 17, sueloY - 6, 9, rng, T.SOLIDO, 2);
    plataforma(sala, (ancho >> 1) - 6, sueloY - 10, 12, rng, T.PLATAFORMA, 1);
    for (let i = 0; i < 3; i++) {
      const x = rng.irange(14, ancho - 16);
      sala.props.push({
        tipo: 'luz', x: x * TAM, y: 5 * TAM,
        r: 1, g: 0.35, b: 0.5, radio: 420, intensidad: 1.1, parpadeo: 0.15,
      });
    }
  } else if (tipo === TIPO_SALA.TESORO) {
    plataforma(sala, (ancho >> 1) - 4, sueloY - 5, 8, rng, T.SOLIDO, 1);
    sala.props.push({ tipo: 'capsula', x: (ancho >> 1) * TAM, y: (sueloY - 6) * TAM - 8 });
    sala.props.push({
      tipo: 'luz', x: (ancho >> 1) * TAM, y: (sueloY - 7) * TAM,
      r: 1, g: 0.85, b: 0.45, radio: 340, intensidad: 1.5, parpadeo: 0,
    });
    columnas(sala, rng, sueloY, 2);
  } else if (tipo === TIPO_SALA.REPOSO) {
    sala.props.push({ tipo: 'terminal', x: (ancho >> 1) * TAM, y: sueloY * TAM });
    sala.props.push({ tipo: 'vida', x: (ancho >> 1) * TAM - 90, y: sueloY * TAM - 24 });
    sala.props.push({
      tipo: 'luz', x: (ancho >> 1) * TAM, y: (sueloY - 3) * TAM,
      r: 0.5, g: 0.95, b: 1, radio: 400, intensidad: 1.4, parpadeo: 0,
    });
  } else if (tipo === TIPO_SALA.INICIO) {
    espina(sala, rng, sueloY);
    columnas(sala, rng, sueloY, 2);
    sala.props.push({ tipo: 'terminal', x: 9 * TAM, y: sueloY * TAM });
  } else {
    const densidad = tipo === TIPO_SALA.PLATAFORMAS ? 1.4 : 1;
    fosos(sala, rng, sueloY, Math.round((1 + rng.int(3)) * densidad), bioma);
    espina(sala, rng, sueloY);
    columnas(sala, rng, sueloY, Math.round((2 + rng.int(4)) * densidad));
    rampasSuelo(sala, rng, 1 + rng.int(3));
    if (rng.bool(0.5)) cintas(sala, rng, 1 + rng.int(2));
    fragiles(sala, rng, 2 + rng.int(4));
    pinchosTecho(sala, rng, Math.round(dificultad * 0.8));
    // Plataformas de un solo sentido sueltas para dar rutas alternativas.
    for (let i = 0; i < 3 + rng.int(4); i++) {
      const x = rng.irange(6, ancho - 10);
      const y = rng.irange(6, sueloY - 3);
      if (sala.get(x, y) !== T.VACIO) continue;
      plataforma(sala, x, y, rng.irange(3, 6), rng, T.PLATAFORMA, 1);
    }
  }

  puertas(sala, rng, sueloY, primera, ultima);
  if (tipo !== TIPO_SALA.REPOSO && tipo !== TIPO_SALA.TESORO && tipo !== TIPO_SALA.INICIO) {
    trampas(sala, rng, dificultad, bioma);
  }
  decorar(sala, rng, bioma);
  puntosSpawn(sala, rng);

  // Luz de las puertas.
  for (const p of sala.puertas) {
    sala.props.push({
      tipo: 'luz', x: p.x + 20, y: p.y + 48,
      r: p.esSalida ? 1 : 0.4, g: p.esSalida ? 0.4 : 1, b: 0.6,
      radio: 220, intensidad: 0.9, parpadeo: 0,
    });
  }

  sanearLuces(sala);
  return sala.finalizar();
}

/**
 * Empuja fuera de la roca cualquier luz que haya quedado enterrada. Una luz
 * dentro de un solido produce un poligono de visibilidad degenerado (una franja
 * vertical) que se ve como un fallo grafico, asi que esto no es cosmetico.
 */
function sanearLuces(sala) {
  const restantes = [];
  for (const p of sala.props) {
    if (p.tipo !== 'luz') { restantes.push(p); continue; }
    let tx = Math.floor(p.x / TAM), ty = Math.floor(p.y / TAM);
    if (sala.get(tx, ty) === T.VACIO) { restantes.push(p); continue; }
    let mejor = null;
    // Busqueda en anillos crecientes del hueco mas cercano.
    for (let r = 1; r <= 4 && !mejor; r++) {
      for (let dy = -r; dy <= r && !mejor; dy++) {
        for (let dx = -r; dx <= r && !mejor; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (sala.get(tx + dx, ty + dy) === T.VACIO) mejor = [tx + dx, ty + dy];
        }
      }
    }
    if (!mejor) continue;             // sin hueco cerca: se descarta la luz
    p.x = mejor[0] * TAM + TAM * 0.5;
    p.y = mejor[1] * TAM + TAM * 0.5;
    restantes.push(p);
  }
  sala.props = restantes;
}
