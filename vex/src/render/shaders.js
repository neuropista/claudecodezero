// shaders.js — Todo el GLSL del juego en un único módulo.
//
// Está aislado a propósito: en modo depuración se vuelve a importar con un
// parámetro de cache-busting y los programas se recompilan en caliente sin
// perder el estado de la partida (ver render/renderer.js -> recargarShaders).

export const VERSION_SHADERS = 7;

const CABECERA = `#version 300 es
precision highp float;
precision highp int;
`;

const RUIDO = `
float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); p3 += dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float ruido(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash12(i), b = hash12(i+vec2(1,0)), c = hash12(i+vec2(0,1)), d = hash12(i+vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ s += ruido(p)*a; p = p*2.03 + vec2(11.3,7.7); a *= 0.5; }
  return s*1.032;
}
`;

// ---------------------------------------------------------------- sprites ---

export const SPRITE_VS = CABECERA + `
layout(location=0) in vec2 aEsquina;      // quad unitario 0..1
layout(location=1) in vec4 aPosSize;      // xy = centro mundo, zw = tamaño
layout(location=2) in vec4 aRotUV0;       // x = rotación, yz = uv0, w = emisivo
layout(location=3) in vec4 aUV1Flash;     // xy = uv1, z = flash, w = recorte
layout(location=4) in vec4 aColor;        // rgba normalizado

uniform mat3 uCamara;

out vec2 vUV;
out vec4 vColor;
out float vEmisivo;
out float vFlash;

void main(){
  vec2 local = (aEsquina - 0.5) * aPosSize.zw;
  float c = cos(aRotUV0.x), s = sin(aRotUV0.x);
  vec2 rot = vec2(local.x*c - local.y*s, local.x*s + local.y*c);
  vec3 mundo = vec3(aPosSize.xy + rot, 1.0);
  gl_Position = vec4((uCamara * mundo).xy, 0.0, 1.0);
  vUV = mix(aRotUV0.yz, aUV1Flash.xy, aEsquina);
  vColor = aColor;
  vEmisivo = aRotUV0.w;
  vFlash = aUV1Flash.z;
}
`;

export const SPRITE_FS = CABECERA + `
in vec2 vUV;
in vec4 vColor;
in float vEmisivo;
in float vFlash;

uniform sampler2D uAtlas;

out vec4 fragColor;

void main(){
  vec4 t = texture(uAtlas, vUV);
  if (t.a < 0.004) discard;
  vec3 rgb = t.rgb * vColor.rgb;
  rgb = mix(rgb, vec3(1.0), clamp(vFlash, 0.0, 1.0));
  rgb *= (1.0 + vEmisivo * 2.5);
  float a = t.a * vColor.a;
  fragColor = vec4(rgb * a, a);   // premultiplicado
}
`;

// ------------------------------------------------------------- partículas ---

// Actualización por transform feedback: toda la física vive en la GPU.
export const PART_UPDATE_VS = CABECERA + RUIDO + `
layout(location=0) in vec4 aPosVel;    // xy pos, zw velocidad
layout(location=1) in vec4 aVida;      // x vida restante, y vida total, z semilla, w tipo
layout(location=2) in vec4 aParam;     // x tamaño, y arrastre, z gravedad, w turbulencia
layout(location=3) in vec4 aColor;

uniform float uDt;
uniform sampler2D uColision;           // máscara de solidez del nivel (R8)
uniform vec4 uMundo;                   // xy origen, zw tamaño del mundo en píxeles
uniform float uTiempo;
uniform float uColisionActiva;

out vec4 vPosVel;
out vec4 vVida;
out vec4 vParam;
out vec4 vColor;

float solido(vec2 p){
  vec2 uv = (p - uMundo.xy) / uMundo.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(uColision, uv).r;
}

void main(){
  vec2 pos = aPosVel.xy;
  vec2 vel = aPosVel.zw;
  float vida = aVida.x;

  if (vida > 0.0) {
    vida -= uDt;
    // Turbulencia procedural: campo de ruido rotacional barato.
    if (aParam.w > 0.0) {
      float n1 = fbm(pos*0.01 + vec2(uTiempo*0.35, aVida.z*13.0));
      float n2 = fbm(pos*0.01 + vec2(-uTiempo*0.27, aVida.z*7.0 + 91.0));
      vel += (vec2(n1, n2) - 0.5) * aParam.w * uDt * 240.0;
    }
    vel.y += aParam.z * uDt;
    vel *= exp(-aParam.y * uDt);

    vec2 siguiente = pos + vel * uDt;

    if (uColisionActiva > 0.5 && aVida.w > 0.5) {
      // Rebote por ejes separados contra la geometría del nivel.
      if (solido(vec2(siguiente.x, pos.y)) > 0.5) { vel.x = -vel.x * 0.42; siguiente.x = pos.x; }
      if (solido(vec2(pos.x, siguiente.y)) > 0.5) { vel.y = -vel.y * 0.38; vel.x *= 0.7; siguiente.y = pos.y; }
    }
    pos = siguiente;
  }

  vPosVel = vec4(pos, vel);
  vVida = vec4(max(vida, 0.0), aVida.yzw);
  vParam = aParam;
  vColor = aColor;
  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

export const PART_UPDATE_FS = CABECERA + `
out vec4 fragColor;
void main(){ fragColor = vec4(0.0); }
`;

export const PART_RENDER_VS = CABECERA + `
layout(location=0) in vec2 aEsquina;
layout(location=1) in vec4 aPosVel;
layout(location=2) in vec4 aVida;
layout(location=3) in vec4 aParam;
layout(location=4) in vec4 aColor;

uniform mat3 uCamara;
uniform float uEscalaTam;

out vec4 vColor;
out vec2 vLocal;
out float vTipo;

void main(){
  float t = aVida.y > 0.0 ? clamp(aVida.x / aVida.y, 0.0, 1.0) : 0.0;
  if (aVida.x <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vColor = vec4(0.0); vLocal = vec2(0.0); vTipo = 0.0; return; }

  // Curva de tamaño: crece rápido, muere encogiendo.
  float curva = smoothstep(0.0, 0.18, 1.0 - t) * (0.25 + 0.75 * t);
  float tam = aParam.x * curva * uEscalaTam;

  vec2 local = (aEsquina - 0.5) * tam;
  // Estirado en la dirección del movimiento para las chispas rápidas.
  float vlen = length(aPosVel.zw);
  if (aVida.w > 1.5 && vlen > 20.0) {
    vec2 dir = aPosVel.zw / vlen;
    float est = 1.0 + min(vlen * 0.006, 3.0);
    local = dir * (local.x * est) + vec2(-dir.y, dir.x) * local.y;
  }

  vec3 mundo = vec3(aPosVel.xy + local, 1.0);
  gl_Position = vec4((uCamara * mundo).xy, 0.0, 1.0);
  vColor = vec4(aColor.rgb, aColor.a * smoothstep(0.0, 0.25, t));
  vLocal = aEsquina * 2.0 - 1.0;
  vTipo = aVida.w;
}
`;

export const PART_RENDER_FS = CABECERA + `
in vec4 vColor;
in vec2 vLocal;
in float vTipo;
out vec4 fragColor;

void main(){
  float d = dot(vLocal, vLocal);
  if (d > 1.0) discard;
  float caida = 1.0 - d;
  // Tipo 1 = humo (borde suave), resto = chispa (núcleo caliente).
  float a = vTipo < 1.5 ? caida * caida * 0.75 : pow(caida, 1.6);
  vec3 rgb = vColor.rgb * (vTipo < 1.5 ? 1.0 : (1.0 + caida * 1.8));
  float alpha = a * vColor.a;
  fragColor = vec4(rgb * alpha, alpha);
}
`;

// ---------------------------------------------------------------- luces -----

export const LUZ_VS = CABECERA + `
layout(location=0) in vec2 aPos;      // vértice del polígono de visibilidad, en mundo
uniform mat3 uCamara;
out vec2 vMundo;
void main(){
  vMundo = aPos;
  gl_Position = vec4((uCamara * vec3(aPos, 1.0)).xy, 0.0, 1.0);
}
`;

export const LUZ_FS = CABECERA + RUIDO + `
in vec2 vMundo;
uniform vec2 uCentro;
uniform float uRadio;
uniform vec3 uColor;
uniform float uIntensidad;
uniform float uAngulo;     // dirección del cono (radianes)
uniform float uApertura;   // half-angle; >= PI = omnidireccional
uniform float uTiempo;
uniform float uParpadeo;
out vec4 fragColor;

void main(){
  vec2 d = vMundo - uCentro;
  float r = length(d);
  float t = clamp(1.0 - r / uRadio, 0.0, 1.0);
  // Atenuación cuadrática suave con núcleo brillante.
  float att = t * t * (3.0 - 2.0 * t);
  att *= att;

  if (uApertura < 3.14159) {
    float a = atan(d.y, d.x);
    float delta = abs(mod(a - uAngulo + 9.42477796, 6.28318530) - 3.14159265);
    att *= 1.0 - smoothstep(uApertura * 0.55, uApertura, delta);
  }

  float flick = 1.0;
  if (uParpadeo > 0.0) {
    flick = 1.0 - uParpadeo * (0.5 + 0.5 * sin(uTiempo * 37.0 + uCentro.x * 0.1)) * hash11(floor(uTiempo * 18.0) + uCentro.y);
  }

  vec3 c = uColor * att * uIntensidad * flick;
  fragColor = vec4(c, 1.0);
}
`;

// ------------------------------------------------------------- composición --

export const FULL_VS = CABECERA + `
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const COMPONER_LUZ_FS = CABECERA + `
in vec2 vUV;
uniform sampler2D uEscena;
uniform sampler2D uLuz;
uniform vec3 uAmbiente;
uniform float uLucesActivas;
out vec4 fragColor;
void main(){
  vec4 escena = texture(uEscena, vUV);
  vec3 luz = vec3(1.0);
  if (uLucesActivas > 0.5) {
    // Respuesta saturante: varias luces solapadas suman, pero la suma tiende a
    // un techo en vez de dispararse. Sin esto, un bioma con muchas luces se
    // quemaba entero y el bloom lo remataba.
    vec3 L = texture(uLuz, vUV).rgb;
    luz = uAmbiente + L / (1.0 + L * 0.62);
  }
  fragColor = vec4(escena.rgb * luz, escena.a);
}
`;

export const COPIA_FS = CABECERA + `
in vec2 vUV;
uniform sampler2D uTex;
out vec4 fragColor;
void main(){ fragColor = texture(uTex, vUV); }
`;

// ------------------------------------------------------------------ bloom ---

export const BRILLO_FS = CABECERA + `
in vec2 vUV;
uniform sampler2D uTex;
uniform float uUmbral;
uniform float uCodo;
out vec4 fragColor;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  float br = max(c.r, max(c.g, c.b));
  // Curva con codo suave: evita el corte duro típico del threshold.
  float suave = clamp(br - uUmbral + uCodo, 0.0, 2.0 * uCodo);
  suave = suave * suave / (4.0 * uCodo + 1e-4);
  float contrib = max(suave, br - uUmbral) / max(br, 1e-4);
  fragColor = vec4(c * contrib, 1.0);
}
`;

export const DESENFOQUE_FS = CABECERA + `
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uPaso;      // (1/w, 0) o (0, 1/h) multiplicado por el radio
out vec4 fragColor;
void main(){
  // Gaussiana de 9 taps aprovechando el filtrado bilineal (5 muestras reales).
  vec3 c = texture(uTex, vUV).rgb * 0.2270270270;
  vec2 o1 = uPaso * 1.3846153846;
  vec2 o2 = uPaso * 3.2307692308;
  c += texture(uTex, vUV + o1).rgb * 0.3162162162;
  c += texture(uTex, vUV - o1).rgb * 0.3162162162;
  c += texture(uTex, vUV + o2).rgb * 0.0702702703;
  c += texture(uTex, vUV - o2).rgb * 0.0702702703;
  fragColor = vec4(c, 1.0);
}
`;

export const SUBIR_FS = CABECERA + `
in vec2 vUV;
uniform sampler2D uTex;
uniform sampler2D uPrevio;
uniform float uPeso;
out vec4 fragColor;
void main(){
  fragColor = vec4(texture(uTex, vUV).rgb + texture(uPrevio, vUV).rgb * uPeso, 1.0);
}
`;

// -------------------------------------------------------------- post final --

export const POST_FS = CABECERA + RUIDO + `
in vec2 vUV;
uniform sampler2D uEscena;
uniform sampler2D uBloom;
uniform float uTiempo;
uniform vec2 uResolucion;

uniform float uBloomFuerza;
uniform float uAberracion;
uniform float uVineta;
uniform float uGrano;
uniform float uCurvatura;
uniform float uFlash;
uniform vec3  uFlashColor;
uniform float uDanio;        // pulso rojo al recibir daño
uniform float uGlitch;       // distorsión del colapso de la red
uniform float uSaturacion;
uniform float uFundido;      // 0 = visible, 1 = negro

out vec4 fragColor;

vec2 barril(vec2 uv, float k){
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  return 0.5 + c * (1.0 + k * r2 + k * 0.35 * r2 * r2);
}

void main(){
  vec2 uv = uCurvatura > 0.0 ? barril(vUV, uCurvatura) : vUV;

  // Glitch horizontal por bandas: la red neuronal fallando.
  if (uGlitch > 0.001) {
    float banda = floor(uv.y * 48.0);
    float salto = (hash11(banda + floor(uTiempo * 14.0) * 31.7) - 0.5);
    float activa = step(0.82 - uGlitch * 0.5, hash11(banda * 3.1 + floor(uTiempo * 9.0)));
    uv.x += salto * uGlitch * 0.06 * activa;
  }

  vec3 col;
  float ab = uAberracion * (1.0 + uDanio * 3.0 + uGlitch * 4.0);
  if (ab > 0.0001) {
    vec2 dir = uv - 0.5;
    float amt = ab * (0.0015 + dot(dir, dir) * 0.012);
    col.r = texture(uEscena, uv + dir * amt).r;
    col.g = texture(uEscena, uv).g;
    col.b = texture(uEscena, uv - dir * amt).b;
  } else {
    col = texture(uEscena, uv).rgb;
  }

  if (uBloomFuerza > 0.0) col += texture(uBloom, uv).rgb * uBloomFuerza;

  // Saturación / desaturación (bullet time, muerte).
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSaturacion);

  if (uDanio > 0.0) {
    col = mix(col, vec3(luma * 1.1 + 0.28, luma * 0.14, luma * 0.2), uDanio * 0.55);
  }

  col += uFlashColor * uFlash;

  if (uVineta > 0.0) {
    vec2 v = uv * (1.0 - uv.yx);
    float vig = pow(clamp(v.x * v.y * 16.0, 0.0, 1.0), uVineta * 0.55);
    col *= mix(1.0, vig, clamp(uVineta, 0.0, 1.0));
  }

  if (uGrano > 0.0) {
    float g = hash12(uv * uResolucion + fract(uTiempo) * 1731.0);
    col += (g - 0.5) * uGrano * 0.12;
  }

  if (uCurvatura > 0.0) {
    // Líneas de barrido y máscara de fósforo muy sutiles.
    float scan = 0.965 + 0.035 * sin(uv.y * uResolucion.y * 1.5708);
    col *= scan;
    // Bordes negros fuera del tubo.
    vec2 fuera = step(vec2(0.0), uv) * step(uv, vec2(1.0));
    col *= fuera.x * fuera.y;
  }

  // Tone mapping suave para que el bloom no queme.
  col = col / (col + vec3(0.86)) * 1.86;
  col = mix(col, vec3(0.0), clamp(uFundido, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}
`;

// --------------------------------------------------------------- parallax ---

export const PARALLAX_FS = CABECERA + RUIDO + `
in vec2 vUV;
uniform vec2 uResolucion;
uniform vec2 uCamara;
uniform float uTiempo;
uniform float uZoom;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uBioma;
uniform float uIntensidad;
out vec4 fragColor;

// Rejilla neuronal: nodos y aristas que laten.
float rejilla(vec2 p, float escala, float grosor){
  vec2 g = p * escala;
  vec2 f = abs(fract(g) - 0.5);
  float linea = min(f.x, f.y);
  return smoothstep(grosor, 0.0, linea);
}

float nodos(vec2 p, float escala, float tiempo, float semilla){
  vec2 g = p * escala;
  vec2 celda = floor(g);
  vec2 local = fract(g) - 0.5;
  vec2 jitter = hash22(celda + semilla) - 0.5;
  float d = length(local - jitter * 0.55);
  float pulso = 0.5 + 0.5 * sin(tiempo * 1.7 + hash12(celda + semilla) * 25.0);
  return smoothstep(0.16, 0.0, d) * (0.35 + 0.65 * pulso);
}

void main(){
  vec2 uv = vUV;
  vec2 px = (uv - 0.5) * uResolucion;
  vec3 col = mix(uColorA, uColorB, clamp(uv.y * 1.15 - 0.08, 0.0, 1.0));

  // Cuatro capas con factores de paralaje crecientes.
  const float FACT[4] = float[4](0.06, 0.14, 0.30, 0.58);
  const float ESC[4]  = float[4](0.0055, 0.0095, 0.017, 0.030);
  const float ALFA[4] = float[4](0.10, 0.16, 0.22, 0.30);

  for (int i = 0; i < 4; i++) {
    vec2 p = px / uZoom + uCamara * FACT[i];
    float capa = 0.0;
    if (uBioma < 0.5) {
      // Corteza: rejilla ortogonal de sinapsis.
      capa = rejilla(p, ESC[i], 0.055 - float(i) * 0.008) * 0.55;
      capa += nodos(p, ESC[i] * 0.75, uTiempo + float(i), float(i) * 17.0) * 1.4;
    } else if (uBioma < 1.5) {
      // Sinapsis: filamentos orgánicos ondulantes.
      float n = fbm(p * ESC[i] * 1.6 + vec2(uTiempo * 0.05 * float(i + 1), 0.0));
      capa = smoothstep(0.48, 0.56, n) * 0.7;
      capa += nodos(p, ESC[i] * 0.6, uTiempo * 0.8, float(i) * 31.0) * 0.9;
    } else if (uBioma < 2.5) {
      // Núcleo: anillos concéntricos de datos.
      float r = length(p * ESC[i] * 0.9);
      capa = smoothstep(0.06, 0.0, abs(fract(r * 1.4 - uTiempo * 0.12) - 0.5) - 0.42) * 0.42;
      capa += rejilla(p, ESC[i] * 2.0, 0.03) * 0.16;
    } else {
      // Vacío: ruido cristalino fracturado.
      float n = fbm(p * ESC[i] * 2.2 + float(i) * 13.0);
      capa = smoothstep(0.62, 0.78, n) * 0.9;
      capa += smoothstep(0.02, 0.0, abs(fract(p.x * ESC[i] * 3.0 + n) - 0.5) - 0.47) * 0.5;
    }
    vec3 tinte = mix(uColorC, vec3(1.0), float(i) / 3.0 * 0.35);
    col += tinte * capa * ALFA[i] * uIntensidad;
  }

  // Halo central para dar profundidad.
  float r = length(uv - vec2(0.5, 0.45));
  col += uColorC * 0.06 * (1.0 - smoothstep(0.1, 0.75, r));
  fragColor = vec4(col, 1.0);
}
`;
