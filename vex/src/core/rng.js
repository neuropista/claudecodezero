// rng.js — PRNG xorshift128+ implementado sobre pares de enteros de 32 bits.
// Es la ÚNICA fuente de aleatoriedad de la simulación. Math.random() está
// prohibido en cualquier código que afecte al estado del juego.

const POW32 = 4294967296;
const POW53 = 9007199254740992;

/** Mezclador splitmix32 usado sólo para expandir la semilla inicial. */
function splitmix32(a) {
  a = (a + 0x9e3779b9) | 0;
  let t = a ^ (a >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t = t ^ (t >>> 15);
  t = Math.imul(t, 0x735a2d97);
  return (t ^ (t >>> 15)) >>> 0;
}

/** Convierte una semilla arbitraria (número o texto) en un entero de 32 bits. */
export function seedFrom(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return (value >>> 0) || 1;
  const s = String(value ?? 'vex');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

export class Rng {
  constructor(seed = 1) {
    this.s = new Uint32Array(4);
    this.seed(seed);
  }

  seed(value) {
    let x = seedFrom(value);
    for (let i = 0; i < 4; i++) { x = splitmix32(x); this.s[i] = x; }
    // El estado no puede ser todo ceros.
    if ((this.s[0] | this.s[1] | this.s[2] | this.s[3]) === 0) this.s[0] = 0x9e3779b9;
    this.rawSeed = seedFrom(value);
    // Descarta las primeras salidas para dispersar semillas cercanas.
    for (let i = 0; i < 16; i++) this.next();
    return this;
  }

  /** Devuelve un uint32 y avanza el estado (xorshift128+ de 64 bits emulado). */
  next() {
    const s = this.s;
    // s1 = state[0], s0 = state[1]
    let s1h = s[0], s1l = s[1];
    const s0h = s[2], s0l = s[3];
    s[0] = s0h; s[1] = s0l;

    // s1 ^= s1 << 23
    const a_h = ((s1h << 23) | (s1l >>> 9)) >>> 0;
    const a_l = (s1l << 23) >>> 0;
    s1h = (s1h ^ a_h) >>> 0;
    s1l = (s1l ^ a_l) >>> 0;

    // s1 ^ s0 ^ (s1 >>> 18) ^ (s0 >>> 5)
    const b_h = s1h >>> 18;
    const b_l = ((s1l >>> 18) | (s1h << 14)) >>> 0;
    const c_h = s0h >>> 5;
    const c_l = ((s0l >>> 5) | (s0h << 27)) >>> 0;
    const rh = (s1h ^ s0h ^ b_h ^ c_h) >>> 0;
    const rl = (s1l ^ s0l ^ b_l ^ c_l) >>> 0;
    s[2] = rh; s[3] = rl;

    // resultado = state[1] + s0 (suma de 64 bits, devolvemos los 32 altos)
    const lo = (rl + s0l) >>> 0;
    const carry = lo < rl ? 1 : 0;
    const hi = (rh + s0h + carry) >>> 0;
    this._lo = lo;
    return hi;
  }

  /** Flotante en [0,1) con 53 bits de precisión. */
  float() {
    const hi = this.next();
    const lo = this._lo;
    return (hi * 2097152 + (lo >>> 11)) / POW53;
  }

  /** Entero en [0, n). */
  int(n) { return (this.float() * n) | 0; }

  /** Flotante en [a, b). */
  range(a, b) { return a + this.float() * (b - a); }

  /** Entero en [a, b] inclusive. */
  irange(a, b) { return a + ((this.float() * (b - a + 1)) | 0); }

  /** Flotante en [-m, m). */
  spread(m) { return (this.float() * 2 - 1) * m; }

  bool(p = 0.5) { return this.float() < p; }

  angle() { return this.float() * Math.PI * 2; }

  pick(arr) { return arr[(this.float() * arr.length) | 0]; }

  /** Aproximación gaussiana media 0 desviación 1 (suma de uniformes). */
  gauss() {
    return (this.float() + this.float() + this.float() + this.float() - 2) * 1.1547;
  }

  /** Selección ponderada; `weights` es un array de números no negativos. */
  weighted(weights) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    let r = this.float() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  /** Baraja in-place (Fisher-Yates determinista). */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** Deriva un generador hijo independiente y reproducible. */
  fork(tag = 0) {
    const child = new Rng(1);
    child.s[0] = (this.s[0] ^ splitmix32(tag + 1)) >>> 0 || 1;
    child.s[1] = (this.s[1] ^ splitmix32(tag + 2)) >>> 0;
    child.s[2] = (this.s[2] ^ splitmix32(tag + 3)) >>> 0;
    child.s[3] = (this.s[3] ^ splitmix32(tag + 4)) >>> 0;
    if ((child.s[0] | child.s[1] | child.s[2] | child.s[3]) === 0) child.s[0] = 1;
    return child;
  }

  saveState(out = new Uint32Array(4)) { out.set(this.s); return out; }
  loadState(state) { this.s.set(state); return this; }
}

/** Generador global para efectos puramente cosméticos (no afecta a la simulación). */
export const cosmeticRng = new Rng(0xC0FFEE);
