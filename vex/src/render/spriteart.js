// spriteart.js — Todo el arte del juego, dibujado con Canvas2D en runtime.
// Ni un PNG. Formas, gradientes y ruido; cada bioma tiene su paleta.

import { grad, gradRadial, halo, poly, granular, rectRedondo } from './atlas.js';

export const PAL_VEX = {
  nucleo: '#08111d',
  cuerpo: '#12243a',
  brillo: '#4fe3ff',
  brilloTenue: '#1c8fb5',
  acento: '#ff5ad8',
  energia: '#c8f8ff',
};

export const PALETAS_BIOMA = [
  { // 0 — Corteza Externa
    nombre: 'Corteza Externa',
    fondoA: '#050a14', fondoB: '#0a1730', acento: '#3ea8ff',
    cuerpo: '#132a42', cuerpoAlto: '#1d3d5e', tapa: '#2f7cb8', linea: '#5ecdff',
    ambiente: [0.30, 0.36, 0.48],
  },
  { // 1 — Campo Sináptico
    nombre: 'Campo Sinaptico',
    fondoA: '#0a0518', fondoB: '#1a0a33', acento: '#b473ff',
    cuerpo: '#241640', cuerpoAlto: '#37225e', tapa: '#7040bb', linea: '#c78dff',
    ambiente: [0.34, 0.28, 0.48],
  },
  { // 2 — Núcleo Térmico
    nombre: 'Nucleo Termico',
    fondoA: '#150603', fondoB: '#2e0d05', acento: '#ff8a34',
    cuerpo: '#3a1a12', cuerpoAlto: '#57281a', tapa: '#b0562a', linea: '#ffb15c',
    ambiente: [0.38, 0.26, 0.19],
  },
  { // 3 — El Vacío
    nombre: 'El Vacio',
    fondoA: '#02100e', fondoB: '#04231f', acento: '#3affc0',
    cuerpo: '#0d2b28', cuerpoAlto: '#154440', tapa: '#2c9a80', linea: '#6effd6',
    ambiente: [0.26, 0.40, 0.37],
  },
];

// ---------------------------------------------------------------- utilidades

/** Segmento grueso con extremos redondeados: la primitiva de todos los cuerpos. */
function capsula(ctx, x0, y0, x1, y1, r, estilo) {
  ctx.strokeStyle = estilo;
  ctx.lineWidth = r * 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function brilloExterior(ctx, dibujo, color, radio, alfa = 0.9) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = radio;
  ctx.globalAlpha = alfa;
  dibujo();
  ctx.shadowBlur = radio * 0.5;
  dibujo();
  ctx.restore();
}

function estrella(ctx, cx, cy, puntas, rExt, rInt, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < puntas * 2; i++) {
    const r = i % 2 === 0 ? rExt : rInt;
    const a = rot + (i * Math.PI) / puntas;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// ------------------------------------------------------------------- VEX ----

/**
 * Dibuja a Vex a partir de una pose. Toda la animación es matemática:
 * no hay hojas de sprites dibujadas a mano.
 */
function dibujarVex(ctx, w, h, pose) {
  const cx = w * 0.5;
  const suelo = h * 0.94;
  const {
    bobY = 0, inclina = 0, muslo = 0, muslo2 = 0, rodilla = 0, rodilla2 = 0,
    brazo = 0, brazo2 = 0, estirado = 1, aplasta = 1, capa = 0, ojo = 1, aura = 1,
  } = pose;

  const escala = h / 56;
  const caderaY = suelo - 24 * escala * estirado + bobY * escala;
  const caderaX = cx + inclina * 1.2 * escala;
  const hombroY = caderaY - 13 * escala * estirado;
  const hombroX = caderaX + inclina * 2.2 * escala;
  const cabezaY = hombroY - 8 * escala * estirado;
  const cabezaX = hombroX + inclina * 1.4 * escala;

  ctx.save();
  ctx.scale(aplasta, 2 - aplasta);
  ctx.translate((w * (1 - aplasta)) / (2 * aplasta), (h * (aplasta - 1)) / (2 * (2 - aplasta)));

  // Aura de energía.
  if (aura > 0) halo(ctx, cabezaX, (caderaY + cabezaY) * 0.5, 22 * escala * aura, '79,227,255', 0.20 * aura);

  // Estela de datos a la espalda.
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = PAL_VEX.acento;
  ctx.lineWidth = 1.6 * escala;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const ph = capa + i * 0.9;
    ctx.beginPath();
    ctx.moveTo(hombroX - 2 * escala, hombroY + i * 2 * escala);
    for (let s = 1; s <= 4; s++) {
      const t = s / 4;
      ctx.lineTo(
        hombroX - (3 + t * 12) * escala - inclina * 2 * escala,
        hombroY + (i * 2 + Math.sin(ph + t * 3.2) * 4 * t) * escala + t * 8 * escala
      );
    }
    ctx.stroke();
  }
  ctx.restore();

  const trazo = () => {
    // Piernas.
    const rodX = caderaX + Math.sin(muslo) * 9 * escala;
    const rodY = caderaY + Math.cos(muslo) * 11 * escala;
    const pieX = rodX + Math.sin(muslo + rodilla) * 9 * escala;
    const pieY = rodY + Math.cos(muslo + rodilla) * 11 * escala;
    capsula(ctx, caderaX, caderaY, rodX, rodY, 3.1 * escala, PAL_VEX.cuerpo);
    capsula(ctx, rodX, rodY, pieX, pieY, 2.5 * escala, PAL_VEX.cuerpo);

    const rodX2 = caderaX + Math.sin(muslo2) * 9 * escala;
    const rodY2 = caderaY + Math.cos(muslo2) * 11 * escala;
    const pieX2 = rodX2 + Math.sin(muslo2 + rodilla2) * 9 * escala;
    const pieY2 = rodY2 + Math.cos(muslo2 + rodilla2) * 11 * escala;
    capsula(ctx, caderaX, caderaY, rodX2, rodY2, 3.1 * escala, PAL_VEX.nucleo);
    capsula(ctx, rodX2, rodY2, pieX2, pieY2, 2.5 * escala, PAL_VEX.nucleo);

    // Torso.
    ctx.fillStyle = grad(ctx, hombroX, hombroY, caderaX, caderaY, [
      [0, PAL_VEX.cuerpo], [1, PAL_VEX.nucleo],
    ]);
    poly(ctx, [
      hombroX - 6.5 * escala, hombroY,
      hombroX + 6.5 * escala, hombroY,
      caderaX + 4.6 * escala, caderaY + 1 * escala,
      caderaX - 4.6 * escala, caderaY + 1 * escala,
    ]);
    ctx.fill();

    // Brazos.
    const codoX = hombroX + Math.sin(brazo) * 8 * escala;
    const codoY = hombroY + Math.cos(brazo) * 9 * escala;
    capsula(ctx, hombroX, hombroY + 1 * escala, codoX, codoY, 2.4 * escala, PAL_VEX.nucleo);
    const manoX = codoX + Math.sin(brazo + 0.6) * 8 * escala;
    const manoY = codoY + Math.cos(brazo + 0.6) * 8 * escala;
    capsula(ctx, codoX, codoY, manoX, manoY, 2.0 * escala, PAL_VEX.nucleo);

    const codoX2 = hombroX + Math.sin(brazo2) * 8 * escala;
    const codoY2 = hombroY + Math.cos(brazo2) * 9 * escala;
    capsula(ctx, hombroX, hombroY + 1 * escala, codoX2, codoY2, 2.4 * escala, PAL_VEX.cuerpo);
    const manoX2 = codoX2 + Math.sin(brazo2 + 0.6) * 8 * escala;
    const manoY2 = codoY2 + Math.cos(brazo2 + 0.6) * 8 * escala;
    capsula(ctx, codoX2, codoY2, manoX2, manoY2, 2.0 * escala, PAL_VEX.cuerpo);
    pose._manoX = manoX2; pose._manoY = manoY2;

    // Cabeza: casco romboidal con visor.
    ctx.fillStyle = PAL_VEX.cuerpo;
    poly(ctx, [
      cabezaX, cabezaY - 7 * escala,
      cabezaX + 5.6 * escala, cabezaY - 1 * escala,
      cabezaX + 3.4 * escala, cabezaY + 4.4 * escala,
      cabezaX - 3.4 * escala, cabezaY + 4.4 * escala,
      cabezaX - 5.6 * escala, cabezaY - 1 * escala,
    ]);
    ctx.fill();
  };

  brilloExterior(ctx, trazo, PAL_VEX.brilloTenue, 8 * escala, 0.85);
  trazo();

  // Líneas de circuito luminosas sobre el torso.
  ctx.strokeStyle = PAL_VEX.brillo;
  ctx.lineWidth = 1.1 * escala;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(hombroX - 3 * escala, hombroY + 3 * escala);
  ctx.lineTo(caderaX + 1 * escala, caderaY - 5 * escala);
  ctx.lineTo(caderaX - 2 * escala, caderaY - 1 * escala);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Visor.
  const visorY = cabezaY - 0.5 * escala;
  ctx.save();
  ctx.shadowColor = PAL_VEX.brillo;
  ctx.shadowBlur = 10 * escala;
  ctx.fillStyle = PAL_VEX.energia;
  poly(ctx, [
    cabezaX - 4.2 * escala, visorY - 1.4 * escala,
    cabezaX + 4.2 * escala, visorY - 2.2 * escala,
    cabezaX + 3.6 * escala, visorY + 1.4 * escala,
    cabezaX - 3.8 * escala, visorY + 1.2 * escala,
  ]);
  ctx.globalAlpha = 0.35 + 0.65 * ojo;
  ctx.fill();
  ctx.restore();

  // Núcleo del pecho.
  const pechoY = hombroY + 5 * escala;
  halo(ctx, hombroX, pechoY, 5.5 * escala, '255,90,216', 0.85);
  ctx.fillStyle = PAL_VEX.energia;
  ctx.beginPath();
  ctx.arc(hombroX, pechoY, 1.7 * escala, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function registrarVex(atlas) {
  const W = 52, H = 58;

  atlas.addTira('vex.idle', 6, W, H, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    dibujarVex(ctx, w, h, {
      bobY: Math.sin(t) * 1.1,
      inclina: 0.4,
      muslo: 0.16, muslo2: -0.16, rodilla: 0.10, rodilla2: 0.12,
      brazo: 0.30 + Math.sin(t) * 0.06, brazo2: -0.24 - Math.sin(t) * 0.06,
      capa: t, ojo: 0.75 + 0.25 * Math.sin(t * 2),
      aura: 0.85 + 0.15 * Math.sin(t),
    });
  });

  atlas.addTira('vex.correr', 8, W, H, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    dibujarVex(ctx, w, h, {
      bobY: -Math.abs(Math.sin(t)) * 2.2,
      inclina: 2.6,
      muslo: Math.sin(t) * 0.85, muslo2: Math.sin(t + Math.PI) * 0.85,
      rodilla: 0.55 + Math.cos(t) * 0.45, rodilla2: 0.55 + Math.cos(t + Math.PI) * 0.45,
      brazo: Math.sin(t + Math.PI) * 0.75 + 0.15, brazo2: Math.sin(t) * 0.75 + 0.15,
      capa: t * 2, ojo: 1, aura: 1,
    });
  });

  atlas.add('vex.salto', W, H, (ctx, w, h) => dibujarVex(ctx, w, h, {
    inclina: 1.4, estirado: 1.06, aplasta: 0.9,
    muslo: -0.7, muslo2: 0.55, rodilla: 1.05, rodilla2: 0.30,
    brazo: -1.15, brazo2: 0.85, capa: 1.2, ojo: 1, aura: 1.15,
  }));

  atlas.add('vex.caida', W, H, (ctx, w, h) => dibujarVex(ctx, w, h, {
    inclina: 0.9, estirado: 0.97, aplasta: 1.06,
    muslo: 0.55, muslo2: -0.35, rodilla: 0.65, rodilla2: 0.85,
    brazo: -0.55, brazo2: -0.95, capa: 2.4, ojo: 1, aura: 1,
  }));

  atlas.add('vex.dash', W, H, (ctx, w, h) => dibujarVex(ctx, w, h, {
    inclina: 5.5, estirado: 0.9, aplasta: 1.18,
    muslo: 1.25, muslo2: 0.55, rodilla: 0.35, rodilla2: 0.95,
    brazo: 1.5, brazo2: 1.25, capa: 3.6, ojo: 1, aura: 1.5,
  }));

  atlas.add('vex.pared', W, H, (ctx, w, h) => dibujarVex(ctx, w, h, {
    inclina: -1.8, estirado: 0.98,
    muslo: -0.30, muslo2: 0.62, rodilla: 0.95, rodilla2: 0.30,
    brazo: -1.5, brazo2: 0.35, capa: 0.7, ojo: 0.9, aura: 0.9,
  }));

  atlas.add('vex.parry', W, H, (ctx, w, h) => {
    dibujarVex(ctx, w, h, {
      inclina: 1.0, estirado: 0.99,
      muslo: 0.45, muslo2: -0.42, rodilla: 0.35, rodilla2: 0.40,
      brazo: 1.45, brazo2: 1.35, capa: 0.4, ojo: 1, aura: 1.4,
    });
    // Abanico de deflexión.
    ctx.save();
    ctx.strokeStyle = PAL_VEX.acento;
    ctx.shadowColor = PAL_VEX.acento;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(w * 0.62, h * 0.56, w * 0.36, -0.95, 0.95);
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  });

  atlas.add('vex.golpe', W, H, (ctx, w, h) => {
    dibujarVex(ctx, w, h, {
      inclina: -2.2, estirado: 0.94, aplasta: 1.1,
      muslo: -0.5, muslo2: 0.2, rodilla: 0.9, rodilla2: 0.5,
      brazo: -1.4, brazo2: -1.1, capa: 5.0, ojo: 0.2, aura: 0.5,
    });
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,70,90,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  });
}

// --------------------------------------------------------------- enemigos ---

const CHASIS = '#1a1520';
const CHASIS_ALTO = '#2e2438';
const HOSTIL = '#ff3d6e';
const HOSTIL_TENUE = '#8a1e3c';

function registrarEnemigos(atlas) {
  // Dron flotante: rombo con anillo y ojo central.
  atlas.addTira('enem.dron', 6, 44, 44, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    const cx = w / 2, cy = h / 2 + Math.sin(t) * 2;
    halo(ctx, cx, cy, 20, '255,61,110', 0.30);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.5);
    ctx.fillStyle = grad(ctx, -14, -14, 14, 14, [[0, CHASIS_ALTO], [1, CHASIS]]);
    poly(ctx, [0, -15, 13, 0, 0, 15, -13, 0]);
    ctx.fill();
    ctx.strokeStyle = HOSTIL_TENUE;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    // Anillo orbital.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-t);
    ctx.strokeStyle = HOSTIL;
    ctx.lineWidth = 1.8;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Ojo.
    halo(ctx, cx, cy, 8, '255,61,110', 0.95);
    ctx.fillStyle = '#ffd9e4';
    ctx.beginPath();
    ctx.arc(cx, cy, 3 + Math.sin(t * 2) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  });

  // Rastreador: cuadrúpedo bajo con patas animadas.
  atlas.addTira('enem.rastreador', 6, 52, 44, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    const cx = w / 2, cy = h * 0.52;
    ctx.strokeStyle = CHASIS_ALTO;
    ctx.lineCap = 'round';
    for (let p = 0; p < 4; p++) {
      const f = t + p * 1.6;
      const bx = cx + (p < 2 ? -1 : 1) * (8 + (p % 2) * 6);
      const kx = bx + Math.sin(f) * 6;
      const ky = cy + 9;
      ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(bx, cy + 2); ctx.lineTo(kx, ky); ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx + Math.cos(f) * 3, h * 0.94); ctx.stroke();
    }
    halo(ctx, cx, cy, 18, '255,61,110', 0.22);
    ctx.fillStyle = grad(ctx, cx - 18, cy - 10, cx + 18, cy + 10, [[0, CHASIS_ALTO], [1, CHASIS]]);
    rectRedondo(ctx, cx - 19, cy - 11, 38, 20, 8);
    ctx.fill();
    ctx.strokeStyle = HOSTIL_TENUE; ctx.lineWidth = 2; ctx.stroke();
    // Visor de barrido.
    ctx.save();
    ctx.shadowColor = HOSTIL; ctx.shadowBlur = 10;
    ctx.fillStyle = HOSTIL;
    const off = Math.sin(t) * 5;
    rectRedondo(ctx, cx - 12 + off, cy - 5, 12, 4, 2);
    ctx.fill();
    ctx.restore();
    // Placas dorsales.
    ctx.fillStyle = HOSTIL_TENUE;
    for (let p = 0; p < 3; p++) {
      poly(ctx, [cx - 12 + p * 11, cy - 11, cx - 7 + p * 11, cy - 17, cx - 3 + p * 11, cy - 11]);
      ctx.fill();
    }
  });

  // Torreta: base fija + cañón separado que rota en el juego.
  atlas.addTira('enem.torreta', 4, 48, 40, (ctx, w, h, i, n) => {
    const t = i / n;
    const cx = w / 2, cy = h * 0.72;
    ctx.fillStyle = grad(ctx, 0, cy - 14, 0, h, [[0, CHASIS_ALTO], [1, '#0d0a12']]);
    poly(ctx, [cx - 20, h, cx - 14, cy - 8, cx + 14, cy - 8, cx + 20, h]);
    ctx.fill();
    ctx.strokeStyle = HOSTIL_TENUE; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = CHASIS;
    ctx.beginPath(); ctx.arc(cx, cy - 8, 11, Math.PI, 0); ctx.fill();
    // Luz de carga.
    const p = 0.3 + 0.7 * t;
    halo(ctx, cx, cy - 10, 9 * p, '255,61,110', 0.9 * p);
    ctx.fillStyle = '#ffe6ee';
    ctx.beginPath(); ctx.arc(cx, cy - 10, 2.6, 0, Math.PI * 2); ctx.fill();
  });

  atlas.add('enem.canon', 40, 18, (ctx, w, h) => {
    const cy = h / 2;
    ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, CHASIS_ALTO], [0.5, CHASIS], [1, '#0b0810']]);
    rectRedondo(ctx, 2, cy - 6, w - 8, 12, 5);
    ctx.fill();
    ctx.strokeStyle = HOSTIL_TENUE; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = HOSTIL;
    rectRedondo(ctx, w - 10, cy - 3.5, 8, 7, 3);
    ctx.fill();
    halo(ctx, w - 5, cy, 8, '255,61,110', 0.8);
  }, 0.12, 0.5);

  // Enjambre: motas rápidas.
  atlas.addTira('enem.enjambre', 4, 22, 22, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    const cx = w / 2, cy = h / 2;
    halo(ctx, cx, cy, 10, '255,120,60', 0.75);
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(t);
    ctx.fillStyle = '#ffb066';
    estrella(ctx, 0, 0, 3, 8, 3.2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff2e0';
    ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
  });

  // Volador: alas batientes.
  atlas.addTira('enem.volador', 6, 52, 40, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    const cx = w / 2, cy = h / 2;
    const ala = Math.sin(t) * 0.9;
    ctx.save();
    ctx.translate(cx, cy);
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.scale(s, 1);
      ctx.rotate(ala * 0.5);
      ctx.fillStyle = 'rgba(190,80,255,0.55)';
      poly(ctx, [4, -2, 24, -12 - ala * 5, 22, 2, 6, 5]);
      ctx.fill();
      ctx.strokeStyle = '#c98bff'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    halo(ctx, cx, cy, 14, '190,110,255', 0.35);
    ctx.fillStyle = grad(ctx, cx, cy - 10, cx, cy + 10, [[0, CHASIS_ALTO], [1, CHASIS]]);
    ctx.beginPath(); ctx.ellipse(cx, cy, 9, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8c4fd0'; ctx.lineWidth = 2; ctx.stroke();
    halo(ctx, cx, cy - 2, 7, '220,150,255', 0.9);
    ctx.fillStyle = '#f3e0ff';
    ctx.beginPath(); ctx.arc(cx, cy - 2, 2.6, 0, Math.PI * 2); ctx.fill();
  });

  // Escudo: hexágono con placa frontal (hay que rodearlo).
  atlas.addTira('enem.escudo', 4, 60, 60, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    const cx = w / 2, cy = h / 2;
    halo(ctx, cx, cy, 26, '90,180,255', 0.28);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = grad(ctx, -20, -20, 20, 20, [[0, CHASIS_ALTO], [1, CHASIS]]);
    estrella(ctx, 0, 0, 6, 20, 17, Math.PI / 6);
    ctx.fill();
    ctx.strokeStyle = '#3b7fc4'; ctx.lineWidth = 2.4; ctx.stroke();
    // Placa de escudo con brillo animado.
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t);
    ctx.shadowColor = '#6fd4ff'; ctx.shadowBlur = 14;
    ctx.strokeStyle = '#9fe6ff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 24, -0.85, 0.85); ctx.stroke();
    ctx.restore();
    ctx.restore();
    halo(ctx, cx, cy, 9, '255,61,110', 0.8);
    ctx.fillStyle = '#ffdfe8';
    ctx.beginPath(); ctx.arc(cx, cy, 3.4, 0, Math.PI * 2); ctx.fill();
  });

  // Tejedor: nodo que tiende un cable de energía con su pareja.
  atlas.addTira('enem.tejedor', 5, 46, 46, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    const cx = w / 2, cy = h / 2;
    halo(ctx, cx, cy, 20, '90,255,210', 0.35);
    // Filamentos que giran.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.6);
    ctx.strokeStyle = '#5cffcf';
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.75;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 9);
      ctx.lineTo(Math.cos(a) * (17 + Math.sin(t + k) * 3), Math.sin(a) * (17 + Math.sin(t + k) * 3));
      ctx.stroke();
    }
    ctx.restore();
    // Cuerpo romboidal.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = grad(ctx, -10, -10, 10, 10, [[0, '#1d4a42'], [1, '#0b201d']]);
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeStyle = '#3fd7ae'; ctx.lineWidth = 2; ctx.strokeRect(-9, -9, 18, 18);
    ctx.restore();
    halo(ctx, cx, cy, 8, '160,255,230', 0.95);
    ctx.fillStyle = '#e8fff8';
    ctx.beginPath(); ctx.arc(cx, cy, 3 + Math.sin(t * 2) * 0.6, 0, Math.PI * 2); ctx.fill();
  });

  // Espejo (placa puesta): devuelve los disparos que le llegan de frente.
  atlas.addTira('enem.espejo', 4, 56, 52, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    const cx = w / 2 - 4, cy = h / 2;
    halo(ctx, cx, cy, 20, '150,190,255', 0.28);
    // Cuerpo hexagonal.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = grad(ctx, -16, -16, 16, 16, [[0, CHASIS_ALTO], [1, CHASIS]]);
    estrella(ctx, 0, 0, 6, 16, 14, Math.PI / 6);
    ctx.fill();
    ctx.strokeStyle = '#5f7fb8'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    // Placa reflectante, montada hacia +x (el sprite se voltea con la mirada).
    ctx.save();
    ctx.translate(cx + 6, cy);
    ctx.shadowColor = '#bfe4ff'; ctx.shadowBlur = 12;
    const g = ctx.createLinearGradient(0, -20, 8, 20);
    g.addColorStop(0, 'rgba(220,240,255,0.95)');
    g.addColorStop(0.45 + 0.12 * Math.sin(t), 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(150,190,235,0.85)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(-4, 0, 20, -1.05, 1.05); ctx.stroke();
    ctx.globalAlpha = 0.4; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(-4, 0, 20, -1.05, 1.05); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#8fb4e8';
    ctx.beginPath(); ctx.arc(cx - 4, cy, 3, 0, Math.PI * 2); ctx.fill();
  });

  // Espejo abierto: la placa se retira y deja el núcleo a tiro.
  atlas.addTira('enem.espejoAbierto', 3, 56, 52, (ctx, w, h, i, n) => {
    const t = i / (n - 1);
    const cx = w / 2 - 4, cy = h / 2;
    halo(ctx, cx, cy, 24, '90,255,150', 0.5);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = grad(ctx, -16, -16, 16, 16, [[0, CHASIS_ALTO], [1, CHASIS]]);
    estrella(ctx, 0, 0, 6, 16, 14, Math.PI / 6);
    ctx.fill();
    ctx.strokeStyle = '#4fa87a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    // Las dos mitades de la placa, separadas.
    ctx.save();
    ctx.translate(cx + 6, cy);
    ctx.strokeStyle = 'rgba(200,225,255,0.8)';
    ctx.lineWidth = 5;
    for (const s2 of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(-4, s2 * (7 + t * 9), 20, s2 > 0 ? 0.12 : -1.05, s2 > 0 ? 1.05 : -0.12);
      ctx.stroke();
    }
    ctx.restore();
    // Núcleo expuesto.
    halo(ctx, cx, cy, 12, '110,255,170', 0.95);
    ctx.fillStyle = '#e6fff0';
    ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.fill();
  });

  // Divisor: masa que se parte en dos al morir.
  atlas.addTira('enem.divisor', 4, 52, 48, (ctx, w, h, i, n, r) => {
    const t = (i / n) * Math.PI * 2;
    const cx = w / 2, cy = h / 2;
    halo(ctx, cx, cy, 22, '255,110,190', 0.32);
    const wob = 1 + Math.sin(t) * 0.06;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(wob, 2 - wob);
    ctx.fillStyle = grad(ctx, -20, -18, 20, 18, [[0, '#4a1638'], [1, '#1c0714']]);
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 17, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff62be'; ctx.lineWidth = 2.2; ctx.stroke();
    // Costura por donde se partirá.
    ctx.strokeStyle = 'rgba(255,150,215,0.55)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(0, 17); ctx.stroke();
    ctx.setLineDash([]);
    // Células internas.
    for (let k = 0; k < 3; k++) {
      const a = t + k * 2.1;
      halo(ctx, Math.cos(a) * 7, Math.sin(a * 1.3) * 5, 6, '255,150,215', 0.7);
    }
    ctx.restore();
    ctx.fillStyle = '#ffd9f0';
    ctx.beginPath(); ctx.arc(cx, cy - 4, 3, 0, Math.PI * 2); ctx.fill();
  });

  // Bombardero: cuerpo esférico inestable.
  atlas.addTira('enem.bombardero', 5, 48, 48, (ctx, w, h, i, n) => {
    const t = i / n;
    const cx = w / 2, cy = h / 2;
    const pulso = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    halo(ctx, cx, cy, 22 + pulso * 6, '255,150,40', 0.35 + pulso * 0.3);
    ctx.fillStyle = grad(ctx, cx - 16, cy - 16, cx + 16, cy + 16, [[0, '#3a2416'], [1, '#16100a']]);
    ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b06a20'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.4 + pulso * 0.6;
    ctx.shadowColor = '#ffae4a'; ctx.shadowBlur = 16;
    ctx.strokeStyle = '#ffc46a'; ctx.lineWidth = 2.2;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(cx, cy, 6 + k * 4.5, k * 1.7 + t * 4, k * 1.7 + t * 4 + 2.1);
      ctx.stroke();
    }
    ctx.restore();
  });
}

// ------------------------------------------------------------------ jefes ---

function registrarJefes(atlas) {
  atlas.addTira('jefe.nucleo', 6, 148, 148, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    const cx = w / 2, cy = h / 2;
    halo(ctx, cx, cy, 70, '255,70,120', 0.30);
    // Caparazón fracturado.
    ctx.save();
    ctx.translate(cx, cy);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + t * 0.15;
      const r0 = 34, r1 = 58 + Math.sin(t + k) * 4;
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = grad(ctx, 0, -r1, 0, -r0, [[0, '#2b1120'], [1, '#5a1f34']]);
      poly(ctx, [-13, -r0, -9, -r1, 9, -r1, 13, -r0]);
      ctx.fill();
      ctx.strokeStyle = '#ff5f86'; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.7; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    // Anillos internos.
    ctx.save();
    ctx.translate(cx, cy);
    for (let k = 0; k < 3; k++) {
      ctx.rotate(t * (k % 2 === 0 ? 0.4 : -0.6));
      ctx.strokeStyle = k === 1 ? '#ff9ec2' : '#ff4f7e';
      ctx.lineWidth = 3 - k * 0.6;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(0, 0, 30 - k * 7, 22 - k * 6, k * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // Núcleo.
    const p = 0.6 + 0.4 * Math.sin(t * 2);
    halo(ctx, cx, cy, 26 * p, '255,220,240', 0.95);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx, cy, 8 * p, 0, Math.PI * 2); ctx.fill();
  });

  atlas.add('jefe.brazo', 96, 40, (ctx, w, h) => {
    const cy = h / 2;
    ctx.fillStyle = grad(ctx, 0, cy - 14, 0, cy + 14, [[0, '#5a1f34'], [1, '#1d0a14']]);
    poly(ctx, [4, cy - 11, w - 16, cy - 15, w - 2, cy, w - 16, cy + 15, 4, cy + 11]);
    ctx.fill();
    ctx.strokeStyle = '#ff5f86'; ctx.lineWidth = 2; ctx.stroke();
    for (let k = 0; k < 4; k++) {
      halo(ctx, 16 + k * 20, cy, 7, '255,90,140', 0.6);
    }
  }, 0.05, 0.5);

  atlas.addTira('jefe.ojo', 4, 56, 56, (ctx, w, h, i, n) => {
    const t = i / n;
    const cx = w / 2, cy = h / 2;
    halo(ctx, cx, cy, 24, '255,70,120', 0.6);
    ctx.fillStyle = '#2b1120';
    ctx.beginPath(); ctx.ellipse(cx, cy, 22, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff5f86'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.fillStyle = '#ffe3ee';
    ctx.beginPath(); ctx.arc(cx + (t - 0.5) * 12, cy, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5c0a24';
    ctx.beginPath(); ctx.arc(cx + (t - 0.5) * 12, cy, 3, 0, Math.PI * 2); ctx.fill();
  });
}

// ----------------------------------------------------------- proyectiles ----

function bala(atlas, nombre, w, h, color, dibujo) {
  atlas.add(nombre, w, h, (ctx) => {
    halo(ctx, w / 2, h / 2, Math.min(w, h) * 0.5, color, 0.85);
    dibujo(ctx, w, h);
  });
}

function registrarProyectiles(atlas) {
  bala(atlas, 'bala.base', 26, 14, '90,230,255', (ctx, w, h) => {
    ctx.fillStyle = grad(ctx, 0, 0, w, 0, [[0, 'rgba(80,220,255,0.1)'], [0.6, '#7fe8ff'], [1, '#ffffff']]);
    rectRedondo(ctx, 2, h / 2 - 3, w - 4, 6, 3);
    ctx.fill();
  });

  bala(atlas, 'bala.perfora', 34, 12, '255,240,140', (ctx, w, h) => {
    ctx.fillStyle = grad(ctx, 0, 0, w, 0, [[0, 'rgba(255,240,140,0.05)'], [0.7, '#ffe98a'], [1, '#fffdf0']]);
    poly(ctx, [1, h / 2, w * 0.55, h / 2 - 4.5, w - 1, h / 2, w * 0.55, h / 2 + 4.5]);
    ctx.fill();
  });

  bala(atlas, 'bala.rebote', 20, 20, '120,255,180', (ctx, w, h) => {
    ctx.fillStyle = '#8effc4';
    estrella(ctx, w / 2, h / 2, 5, 8, 3.6);
    ctx.fill();
    ctx.fillStyle = '#f2fff8';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 2.6, 0, Math.PI * 2); ctx.fill();
  });

  bala(atlas, 'bala.buscador', 22, 16, '255,140,230', (ctx, w, h) => {
    ctx.fillStyle = '#ff96e6';
    poly(ctx, [2, h / 2, w * 0.6, 2, w - 2, h / 2, w * 0.6, h - 2]);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(w * 0.62, h / 2, 2.4, 0, Math.PI * 2); ctx.fill();
  });

  bala(atlas, 'bala.escopeta', 16, 10, '255,190,90', (ctx, w, h) => {
    ctx.fillStyle = '#ffcf80';
    ctx.beginPath(); ctx.ellipse(w / 2, h / 2, 6, 3.2, 0, 0, Math.PI * 2); ctx.fill();
  });

  bala(atlas, 'bala.orbital', 24, 24, '160,190,255', (ctx, w, h) => {
    ctx.strokeStyle = '#b8ccff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e8f0ff';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 3.4, 0, Math.PI * 2); ctx.fill();
  });

  bala(atlas, 'bala.cadena', 18, 18, '180,120,255', (ctx, w, h) => {
    ctx.fillStyle = '#c79bff';
    estrella(ctx, w / 2, h / 2, 4, 8, 2.4, 0.4);
    ctx.fill();
  });

  bala(atlas, 'bala.enemiga', 18, 18, '255,70,110', (ctx, w, h) => {
    ctx.fillStyle = '#ff6f92';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 2.2, 0, Math.PI * 2); ctx.fill();
  });

  bala(atlas, 'bala.enemigaGrande', 28, 28, '255,110,60', (ctx, w, h) => {
    ctx.fillStyle = '#ff9a4a';
    estrella(ctx, w / 2, h / 2, 6, 11, 6);
    ctx.fill();
    ctx.fillStyle = '#fff3e0';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 3.6, 0, Math.PI * 2); ctx.fill();
  });

  // Segmento repetible para láseres y cadenas eléctricas.
  atlas.add('fx.haz', 32, 16, (ctx, w, h) => {
    ctx.fillStyle = grad(ctx, 0, 0, 0, h, [
      [0, 'rgba(255,255,255,0)'], [0.35, 'rgba(255,255,255,0.55)'],
      [0.5, '#ffffff'], [0.65, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillRect(0, 0, w, h);
  });
}

// ------------------------------------------------------------------ tiles ---

function registrarTiles(atlas, rng) {
  PALETAS_BIOMA.forEach((P, b) => {
    // Cuerpo: cuatro variantes para romper la repetición.
    for (let v = 0; v < 4; v++) {
      atlas.add(`tile.${b}.cuerpo.${v}`, 32, 32, (ctx, w, h, r) => {
        ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, P.cuerpoAlto], [1, P.cuerpo]]);
        ctx.fillRect(0, 0, w, h);
        // Circuitería interna determinista por variante.
        ctx.strokeStyle = P.linea;
        ctx.globalAlpha = 0.16;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const paso = 8 + v * 2;
        for (let x = -h; x < w; x += paso) { ctx.moveTo(x, h); ctx.lineTo(x + h, 0); }
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Remaches.
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        const n = 2 + (v % 3);
        for (let k = 0; k < n; k++) {
          ctx.beginPath();
          ctx.arc(6 + ((v * 7 + k * 11) % 20), 8 + ((v * 5 + k * 13) % 18), 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        granular(ctx, w, h, r, 0.05, 2);
        // Sombra interior en los bordes.
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, w - 2, h - 2);
      });
    }

    // Tapa: superficie superior iluminada.
    for (let v = 0; v < 2; v++) {
      atlas.add(`tile.${b}.tapa.${v}`, 32, 32, (ctx, w, h, r) => {
        ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, P.tapa], [0.35, P.cuerpoAlto], [1, P.cuerpo]]);
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.shadowColor = P.linea; ctx.shadowBlur = 8;
        ctx.fillStyle = P.linea;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(0, 0, w, 2.5);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        for (let k = 0; k < 4; k++) ctx.fillRect(2 + k * 8 + v * 3, 4, 4, 1.5);
        granular(ctx, w, h, r, 0.05, 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, h); ctx.stroke();
      });
    }

    // Plataforma de un solo sentido.
    atlas.add(`tile.${b}.plataforma`, 32, 14, (ctx, w, h) => {
      ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, P.tapa], [1, P.cuerpo]]);
      rectRedondo(ctx, 0, 0, w, h - 2, 3);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = P.linea; ctx.shadowBlur = 10;
      ctx.fillStyle = P.linea;
      ctx.fillRect(0, 0, w, 2);
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, h - 3, w, 3);
    });

    // Rampas.
    for (const [nom, pts] of [['rampaDer', [0, 32, 32, 0, 32, 32]], ['rampaIzq', [0, 0, 32, 32, 0, 32]]]) {
      atlas.add(`tile.${b}.${nom}`, 32, 32, (ctx, w, h, r) => {
        ctx.save();
        poly(ctx, pts);
        ctx.clip();
        ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, P.tapa], [0.4, P.cuerpoAlto], [1, P.cuerpo]]);
        ctx.fillRect(0, 0, w, h);
        granular(ctx, w, h, r, 0.05, 2);
        ctx.restore();
        ctx.save();
        ctx.shadowColor = P.linea; ctx.shadowBlur = 8;
        ctx.strokeStyle = P.linea; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]); ctx.lineTo(pts[2], pts[3]);
        ctx.stroke();
        ctx.restore();
      });
    }

    // Fondo decorativo del bioma (relleno de huecos).
    atlas.add(`tile.${b}.fondo`, 32, 32, (ctx, w, h, r) => {
      ctx.fillStyle = P.fondoB;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = P.acento;
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = 1;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.globalAlpha = 1;
      granular(ctx, w, h, r, 0.03, 2);
    });
  });

  // Cinta transportadora animada.
  atlas.addTira('tile.cinta', 8, 32, 16, (ctx, w, h, i, n) => {
    ctx.fillStyle = '#151b28';
    rectRedondo(ctx, 0, 1, w, h - 2, 4);
    ctx.fill();
    ctx.save();
    ctx.beginPath(); rectRedondo(ctx, 1, 2, w - 2, h - 4, 3); ctx.clip();
    ctx.fillStyle = '#2a3550';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5ad0ff';
    const off = (i / n) * 12;
    for (let x = -12; x < w + 12; x += 12) {
      poly(ctx, [x + off, 2, x + off + 5, 2, x + off - 2, h - 2, x + off - 7, h - 2]);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.shadowColor = '#5ad0ff'; ctx.shadowBlur = 6;
    ctx.strokeStyle = '#8ce0ff'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(1, 2.5); ctx.lineTo(w - 1, 2.5); ctx.stroke();
    ctx.restore();
  });

  // Gel / fluido de datos.
  atlas.addTira('tile.gel', 6, 32, 32, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    ctx.fillStyle = 'rgba(60,200,255,0.30)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(160,240,255,0.55)';
    ctx.lineWidth = 1.6;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = 6 + k * 10 + Math.sin(t + x * 0.16 + k) * 2.2;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(200,250,255,0.5)';
    for (let k = 0; k < 4; k++) {
      const bx = (k * 9 + 5) % w;
      const by = (h - ((t * 4 + k * 9) % h));
      ctx.beginPath(); ctx.arc(bx, by, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  });

  // Superficie del fluido.
  atlas.addTira('tile.gelTapa', 6, 32, 12, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    ctx.save();
    ctx.shadowColor = '#7fe9ff'; ctx.shadowBlur = 8;
    ctx.strokeStyle = '#aef2ff'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const y = h * 0.5 + Math.sin(t + x * 0.22) * 2.4;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(60,200,255,0.30)';
    ctx.fillRect(0, h * 0.5, w, h * 0.5);
  });

  // Pinchos.
  atlas.add('tile.pincho', 32, 20, (ctx, w, h) => {
    for (let k = 0; k < 4; k++) {
      const x = 4 + k * 8;
      ctx.fillStyle = grad(ctx, x, h, x, 0, [[0, '#2a2030'], [1, '#e0eaf5']]);
      poly(ctx, [x - 4, h, x, 1, x + 4, h]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,120,0.55)'; ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = '#16121c';
    ctx.fillRect(0, h - 4, w, 4);
  }, 0.5, 1);

  // Bloque destructible.
  atlas.addTira('tile.fragil', 3, 32, 32, (ctx, w, h, i) => {
    ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, '#4a3b2a'], [1, '#241c14']]);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c79a5a'; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.7;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.6;
    const grietas = i + 1;
    for (let k = 0; k < grietas * 3; k++) {
      const a = (k / (grietas * 3)) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(16, 16);
      ctx.lineTo(16 + Math.cos(a) * 15, 16 + Math.sin(a) * 15);
      ctx.stroke();
    }
  });
}

// ------------------------------------------------------------------ props ---

function registrarProps(atlas) {
  // Puerta de sala: 6 fotogramas de apertura. Con marco y pilares para que se
  // lea como una puerta y no como una barra suelta a media altura.
  atlas.addTira('prop.puerta', 6, 52, 104, (ctx, w, h, i, n) => {
    const t = i / (n - 1);
    const abierta = t > 0.9;
    const acento = abierta ? '#5effc0' : '#ff4f7e';

    // Pilares laterales.
    ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, '#2c3b56'], [1, '#111823']]);
    ctx.fillRect(0, 0, 8, h);
    ctx.fillRect(w - 8, 0, 8, h);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(6, 0, 2, h);
    ctx.fillRect(w - 8, 0, 2, h);

    // Dintel y umbral.
    ctx.fillStyle = '#26334a';
    ctx.fillRect(0, 0, w, 7);
    ctx.fillRect(0, h - 7, w, 7);

    // Hueco.
    ctx.fillStyle = '#05080f';
    ctx.fillRect(8, 7, w - 16, h - 14);

    // Hojas que se retiran hacia arriba y hacia abajo.
    const hoja = ((h - 14) / 2) * (1 - t);
    ctx.fillStyle = grad(ctx, 8, 0, w - 8, 0, [[0, '#22304a'], [0.5, '#41618a'], [1, '#22304a']]);
    ctx.fillRect(8, 7, w - 16, hoja);
    ctx.fillRect(8, h - 7 - hoja, w - 16, hoja);
    // Franjas de aviso sobre las hojas.
    ctx.save();
    ctx.beginPath(); ctx.rect(8, 7, w - 16, hoja); ctx.rect(8, h - 7 - hoja, w - 16, hoja); ctx.clip();
    ctx.strokeStyle = 'rgba(255,190,60,0.30)';
    ctx.lineWidth = 5;
    for (let x = -h; x < w + h; x += 16) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke();
    }
    ctx.restore();

    // Bordes luminosos de las hojas.
    ctx.save();
    ctx.shadowColor = acento; ctx.shadowBlur = 14;
    ctx.fillStyle = acento;
    ctx.fillRect(8, 7 + hoja - 3, w - 16, 3);
    ctx.fillRect(8, h - 7 - hoja, w - 16, 3);
    // Escuadras en las esquinas del marco.
    ctx.fillRect(0, 0, 14, 3); ctx.fillRect(w - 14, 0, 14, 3);
    ctx.fillRect(0, h - 3, 14, 3); ctx.fillRect(w - 14, h - 3, 14, 3);
    ctx.restore();

    // Piloto central: verde si esta abierta, rojo si no.
    halo(ctx, w / 2, abierta ? h - 12 : h / 2, 10, abierta ? '94,255,192' : '255,79,126', 0.9);
  });

  // Terminal / punto de guardado.
  atlas.addTira('prop.terminal', 6, 40, 56, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    ctx.fillStyle = '#141a26';
    poly(ctx, [6, h, 10, 14, w - 10, 14, w - 6, h]);
    ctx.fill();
    ctx.strokeStyle = '#3f5a80'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save();
    ctx.shadowColor = '#5fe0ff'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#5fe0ff';
    rectRedondo(ctx, 11, 6, w - 22, 16, 3);
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#0b1018';
    for (let k = 0; k < 3; k++) ctx.fillRect(13, 9 + k * 4, (w - 26) * (0.4 + 0.6 * ((k + i) % 3) / 2), 2);
    halo(ctx, w / 2, 14, 18, '95,224,255', 0.35);
  }, 0.5, 1);

  // Cápsula de módulo (recompensa).
  atlas.addTira('prop.capsula', 6, 36, 44, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    const cy = h / 2 + Math.sin(t) * 2;
    halo(ctx, w / 2, cy, 20, '255,200,90', 0.5);
    ctx.save();
    ctx.translate(w / 2, cy);
    ctx.rotate(t * 0.4);
    ctx.fillStyle = grad(ctx, -12, -12, 12, 12, [[0, '#ffe6a8'], [1, '#c98d24']]);
    estrella(ctx, 0, 0, 6, 13, 7);
    ctx.fill();
    ctx.strokeStyle = '#fff6dc'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#fffdf4';
    ctx.beginPath(); ctx.arc(w / 2, cy, 3.4, 0, Math.PI * 2); ctx.fill();
  });

  atlas.addTira('prop.vida', 4, 28, 28, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    halo(ctx, w / 2, h / 2, 12, '90,255,150', 0.65);
    ctx.fillStyle = '#7dffb0';
    const s = 1 + Math.sin(t) * 0.08;
    ctx.save();
    ctx.translate(w / 2, h / 2); ctx.scale(s, s);
    ctx.fillRect(-9, -3, 18, 6);
    ctx.fillRect(-3, -9, 6, 18);
    ctx.restore();
  });

  atlas.addTira('prop.energia', 4, 24, 24, (ctx, w, h, i, n) => {
    const t = (i / n) * Math.PI * 2;
    halo(ctx, w / 2, h / 2, 11, '120,200,255', 0.65);
    ctx.save();
    ctx.translate(w / 2, h / 2); ctx.rotate(t);
    ctx.fillStyle = '#9ad4ff';
    poly(ctx, [-3, -9, 4, -2, 0, -1, 3, 9, -4, 2, 0, 1]);
    ctx.fill();
    ctx.restore();
  });

  // Escombro empujable / caja rígida.
  atlas.addTira('prop.escombro', 4, 28, 28, (ctx, w, h, i, n, r) => {
    ctx.fillStyle = grad(ctx, 0, 0, w, h, [[0, '#3b4257'], [1, '#161a24']]);
    const s = 10 + i * 1.2;
    poly(ctx, [
      w / 2 - s, h / 2 - s * 0.8, w / 2 + s * 0.7, h / 2 - s,
      w / 2 + s, h / 2 + s * 0.7, w / 2 - s * 0.6, h / 2 + s,
    ]);
    ctx.fill();
    ctx.strokeStyle = '#6d7a96'; ctx.lineWidth = 1.6; ctx.stroke();
    granular(ctx, w, h, r, 0.09, 2);
  });

  // Emisor de láser.
  atlas.addTira('prop.emisor', 4, 24, 24, (ctx, w, h, i, n) => {
    const t = i / n;
    ctx.fillStyle = '#1b1420';
    rectRedondo(ctx, 2, 2, w - 4, h - 4, 4);
    ctx.fill();
    ctx.strokeStyle = '#8a1e3c'; ctx.lineWidth = 2; ctx.stroke();
    halo(ctx, w / 2, h / 2, 9 * (0.4 + t), '255,61,110', 0.5 + t * 0.5);
    ctx.fillStyle = '#ffd9e4';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 2.4 + t * 1.6, 0, Math.PI * 2); ctx.fill();
  });
}

// -------------------------------------------------------------------- FX ----

function registrarFX(atlas) {
  atlas.addTira('fx.anillo', 5, 96, 96, (ctx, w, h, i, n) => {
    const t = i / (n - 1);
    const r = 12 + t * 34;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${(1 - t) * 0.95})`;
    ctx.lineWidth = 9 * (1 - t) + 1.5;
    ctx.shadowColor = '#9fe8ff';
    ctx.shadowBlur = 22;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });

  atlas.addTira('fx.impacto', 4, 64, 64, (ctx, w, h, i, n) => {
    const t = i / (n - 1);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.globalAlpha = 1 - t * 0.85;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = '#ffd28a'; ctx.shadowBlur = 16;
    ctx.lineCap = 'round';
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + i * 0.3;
      const r0 = 4 + t * 12, r1 = r0 + 8 + t * 14;
      ctx.lineWidth = 3.5 * (1 - t) + 0.8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  });

  atlas.addTira('fx.humo', 4, 48, 48, (ctx, w, h, i, n, r) => {
    const cx = w / 2, cy = h / 2;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + i;
      const rr = 8 + i * 3;
      halo(ctx, cx + Math.cos(a) * rr * 0.5, cy + Math.sin(a) * rr * 0.5, 12 + i * 2, '190,200,220', 0.16);
    }
  });

  atlas.add('fx.destello', 72, 72, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    halo(ctx, cx, cy, 34, '255,255,255', 0.9);
    ctx.save();
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 20;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 32, cy); ctx.lineTo(cx + 32, cy);
    ctx.moveTo(cx, cy - 32); ctx.lineTo(cx, cy + 32);
    ctx.stroke();
    ctx.restore();
  });

  atlas.add('fx.eslabon', 16, 12, (ctx, w, h) => {
    ctx.strokeStyle = '#7fe8ff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#7fe8ff'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(2, h / 2); ctx.lineTo(w - 2, h / 2); ctx.stroke();
  });

  atlas.add('fx.ancla', 26, 26, (ctx, w, h) => {
    halo(ctx, w / 2, h / 2, 12, '127,232,255', 0.8);
    ctx.strokeStyle = '#dff7ff'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = k * 2.09;
      ctx.moveTo(w / 2 + Math.cos(a) * 7, h / 2 + Math.sin(a) * 7);
      ctx.lineTo(w / 2 + Math.cos(a) * 12, h / 2 + Math.sin(a) * 12);
    }
    ctx.stroke();
  });

  atlas.addTira('fx.telegrafia', 4, 64, 64, (ctx, w, h, i, n) => {
    const t = i / (n - 1);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.strokeStyle = `rgba(255,80,110,${0.35 + t * 0.6})`;
    ctx.lineWidth = 2 + t * 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(0, 0, 26 - t * 8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });

  atlas.add('fx.suave', 64, 64, (ctx, w, h) => {
    halo(ctx, w / 2, h / 2, w / 2, '255,255,255', 1);
  });

  atlas.add('fx.blanco', 8, 8, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  });
}

// -------------------------------------------------------------------- UI ----

export const ICONOS_MODULO = ['perforante', 'rebote', 'buscador', 'escopeta', 'orbital', 'cadena'];

function registrarUI(atlas) {
  const dibujos = {
    perforante: (ctx, w, h, c) => {
      ctx.strokeStyle = c; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(4, h / 2); ctx.lineTo(w - 4, h / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w - 12, h / 2 - 6); ctx.lineTo(w - 4, h / 2); ctx.lineTo(w - 12, h / 2 + 6); ctx.stroke();
    },
    rebote: (ctx, w, h, c) => {
      ctx.strokeStyle = c; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(4, h - 6); ctx.lineTo(w / 2, 5); ctx.lineTo(w - 4, h - 6);
      ctx.stroke();
    },
    buscador: (ctx, w, h, c) => {
      ctx.strokeStyle = c; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w / 2, 2); ctx.lineTo(w / 2, 6);
      ctx.moveTo(w / 2, h - 2); ctx.lineTo(w / 2, h - 6);
      ctx.stroke();
    },
    escopeta: (ctx, w, h, c) => {
      ctx.strokeStyle = c; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(5, h / 2);
        ctx.lineTo(w - 4, h / 2 + k * 5.5);
        ctx.stroke();
      }
    },
    orbital: (ctx, w, h, c) => {
      ctx.strokeStyle = c; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(w / 2, h / 2, 10, 5, 0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w / 2 + 9, h / 2 - 4, 2.4, 0, Math.PI * 2); ctx.fill();
    },
    cadena: (ctx, w, h, c) => {
      ctx.strokeStyle = c; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(3, h / 2 - 5); ctx.lineTo(w * 0.35, h / 2 + 5);
      ctx.lineTo(w * 0.6, h / 2 - 6); ctx.lineTo(w - 3, h / 2 + 4);
      ctx.stroke();
    },
  };

  ICONOS_MODULO.forEach((nombre) => {
    atlas.add(`ui.icono.${nombre}`, 32, 32, (ctx, w, h) => {
      dibujos[nombre](ctx, w, h, '#dff6ff');
    });
    atlas.add(`ui.iconoGlow.${nombre}`, 32, 32, (ctx, w, h) => {
      ctx.save();
      ctx.shadowColor = '#5fe0ff'; ctx.shadowBlur = 10;
      dibujos[nombre](ctx, w, h, '#9ff0ff');
      ctx.restore();
    });
  });

  atlas.add('ui.panel', 32, 32, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(8,14,24,0.86)';
    rectRedondo(ctx, 1, 1, w - 2, h - 2, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(95,224,255,0.42)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  atlas.add('ui.barra', 16, 16, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    rectRedondo(ctx, 0, 0, w, h, 3);
    ctx.fill();
  });

  atlas.add('ui.cursor', 40, 40, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    ctx.strokeStyle = '#7fe8ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#7fe8ff'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      ctx.moveTo(cx + dx * 14, cy + dy * 14);
      ctx.lineTo(cx + dx * 18, cy + dy * 18);
    }
    ctx.stroke();
  });

  atlas.add('ui.corazon', 24, 24, (ctx, w, h) => {
    ctx.fillStyle = '#ff5f86';
    ctx.shadowColor = '#ff5f86'; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.86);
    ctx.bezierCurveTo(-2, h * 0.48, 3, h * 0.06, w / 2, h * 0.30);
    ctx.bezierCurveTo(w - 3, h * 0.06, w + 2, h * 0.48, w / 2, h * 0.86);
    ctx.fill();
  });
}

/** Registra todos los sprites del juego en el atlas dado. */
export function registrarTodo(atlas, rng) {
  registrarVex(atlas);
  registrarEnemigos(atlas);
  registrarJefes(atlas);
  registrarProyectiles(atlas);
  registrarTiles(atlas, rng);
  registrarProps(atlas);
  registrarFX(atlas);
  registrarUI(atlas);
}
