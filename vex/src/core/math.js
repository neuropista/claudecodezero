// math.js — utilidades matemáticas puras y libres de asignaciones.
// Todo aquí es determinista: no usa Math.random ni Date.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inverseLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const smootherstep = (t) => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };

/** Interpolación exponencial independiente del framerate. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Mueve `a` hacia `b` como mucho `step` unidades. */
export function approach(a, b, step) {
  if (a < b) { a += step; return a > b ? b : a; }
  if (a > b) { a -= step; return a < b ? b : a; }
  return b;
}

/** Diferencia angular mínima con signo en el rango [-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function rotateTowards(from, to, maxStep) {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + sign(d) * maxStep;
}

export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

/** Solape de dos AABB definidos por centro y semi-extensión. */
export function aabbOverlap(ax, ay, ahw, ahh, bx, by, bhw, bhh) {
  return Math.abs(ax - bx) < ahw + bhw && Math.abs(ay - by) < ahh + bhh;
}

/** Intersección segmento-segmento. Devuelve t en [0,1] sobre el primer segmento o -1. */
export function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const r1 = bx - ax, r2 = by - ay;
  const s1 = dx - cx, s2 = dy - cy;
  const den = r1 * s2 - r2 * s1;
  if (den === 0) return -1;
  const t = ((cx - ax) * s2 - (cy - ay) * s1) / den;
  const u = ((cx - ax) * r2 - (cy - ay) * r1) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return -1;
  return t;
}

// --- Matrices 3x3 en column-major (compatibles con mat3 de GLSL) ---

export function mat3Identity(out) {
  out[0] = 1; out[1] = 0; out[2] = 0;
  out[3] = 0; out[4] = 1; out[5] = 0;
  out[6] = 0; out[7] = 0; out[8] = 1;
  return out;
}

/** Matriz de cámara: mundo -> clip space, con zoom y rotación. */
export function mat3Camera(out, camX, camY, zoom, rot, viewW, viewH) {
  const c = Math.cos(rot) * zoom, s = Math.sin(rot) * zoom;
  const sx = 2 / viewW, sy = -2 / viewH;
  // R * T aplicado y luego escalado a NDC.
  out[0] = c * sx;  out[1] = s * sy;  out[2] = 0;
  out[3] = -s * sx; out[4] = c * sy;  out[5] = 0;
  out[6] = (-c * camX + s * camY) * sx;
  out[7] = (-s * camX - c * camY) * sy;
  out[8] = 1;
  return out;
}

/** Ruido de valor 2D determinista basado en hash entero (para arte procedural). */
export function hash2(x, y, seed = 0) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 1442695040;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smoothstep(xf), v = smoothstep(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm2(x, y, octaves = 4, seed = 0) {
  let sum = 0, amp = 0.5, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(fx, fy, seed + i * 7919) * amp;
    norm += amp; amp *= 0.5; fx *= 2.03; fy *= 2.01;
  }
  return sum / norm;
}

/** Empaqueta RGBA (0..1) en un float de 32 bits reinterpretando 4 bytes. */
const _packBuf = new ArrayBuffer(4);
const _packU8 = new Uint8Array(_packBuf);
const _packF32 = new Float32Array(_packBuf);
export function packColor(r, g, b, a) {
  _packU8[0] = (clamp01(r) * 255) | 0;
  _packU8[1] = (clamp01(g) * 255) | 0;
  _packU8[2] = (clamp01(b) * 255) | 0;
  _packU8[3] = (clamp01(a) * 255) | 0;
  return _packF32[0];
}

/** Conversión HSL -> RGB, devuelta en el array `out` de 3 componentes. */
export function hsl(out, h, s, l) {
  h = ((h % 1) + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = [h + 1 / 3, h, h - 1 / 3];
  for (let i = 0; i < 3; i++) {
    let t = hk[i];
    if (t < 0) t += 1; if (t > 1) t -= 1;
    let c;
    if (t < 1 / 6) c = p + (q - p) * 6 * t;
    else if (t < 1 / 2) c = q;
    else if (t < 2 / 3) c = p + (q - p) * (2 / 3 - t) * 6;
    else c = p;
    out[i] = c;
  }
  return out;
}
