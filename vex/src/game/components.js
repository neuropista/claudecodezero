// components.js — Esquema de componentes del juego (structure of arrays).
//
// Una sola tabla de entidades con todos los campos en arrays tipados. La
// máscara de bits decide qué sistemas tocan a cada entidad. Los campos
// genéricos a/b/c/d evitan multiplicar nombres para estados puntuales de IA.

import { EntityStore, makeMasks } from '../core/ecs.js';

export const ESQUEMA = {
  x: 'f32', y: 'f32',
  px: 'f32', py: 'f32',          // posición del tick anterior (interpolación)
  vx: 'f32', vy: 'f32',
  hw: 'f32', hh: 'f32',          // semiejes del AABB

  tipo: 'u8',
  equipo: 'u8',                  // 0 jugador, 1 enemigo, 2 neutro
  estado: 'u8',
  flags: 'u16',

  vida: 'f32', vidaMax: 'f32',
  dmg: 'f32',
  iframes: 'f32',
  flash: 'f32',

  // Aguante: el daño acumulado rompe la postura del enemigo y lo deja aturdido
  // y vulnerable. Es lo que convierte disparar en algo con ritmo en vez de en
  // vaciar una barra de vida.
  aguante: 'f32', aguanteMax: 'f32',
  aturdido: 'f32',
  sinGolpe: 'f32',     // tiempo sin recibir daño (regeneración de aguante)
  marca: 'f32',        // marca de la cadena eléctrica, lista para detonar
  variante: 'u8',      // modificador de élite / nivel del divisor
  enlace: 'i32',       // handle del compañero enlazado (tejedor)

  sprite: 'u16',
  cuadros: 'u8',
  anim: 'f32',
  velAnim: 'f32',
  escala: 'f32',
  angulo: 'f32',
  facing: 'i8',

  t1: 'f32', t2: 'f32',          // temporizadores
  a: 'f32', b: 'f32', c: 'f32', d: 'f32',   // campos libres por tipo
  objetivo: 'i32',               // handle de otra entidad
  padre: 'i32',
  modulos: 'u16',
  golpes: 'u8',                  // perforaciones / rebotes restantes

  luzR: 'f32', luzG: 'f32', luzB: 'f32', luzRadio: 'f32', luzInt: 'f32',
};

export const MASK = makeMasks([
  'FISICA',       // se mueve contra el grid
  'SPRITE',       // se dibuja
  'VIDA',         // puede recibir daño
  'PROYECTIL',
  'ENEMIGO',
  'JUGADOR',
  'PICKUP',
  'LUZ',
  'RIGIDO',       // cuerpo empujable
  'EMISIVO',      // se dibuja en la capa aditiva
  'JEFE',
  'ORBITAL',
]);

export const TIPO = {
  JUGADOR: 0,
  BALA_JUGADOR: 1,
  BALA_ENEMIGA: 2,
  DRON: 3,
  RASTREADOR: 4,
  VOLADOR: 5,
  ESCUDO: 6,
  ENJAMBRE: 7,
  BOMBARDERO: 8,
  TORRETA: 9,
  JEFE: 10,
  JEFE_OJO: 11,
  PICKUP_VIDA: 12,
  PICKUP_ENERGIA: 13,
  PICKUP_MODULO: 14,
  ESCOMBRO: 15,
  ORBITAL: 16,
  ONDA: 17,
  TEJEDOR: 18,
  ESPEJO: 19,
  DIVISOR: 20,
};

export const NOMBRE_ENEMIGO = {
  3: 'Dron Centinela', 4: 'Rastreador', 5: 'Volador Sinaptico',
  6: 'Guardian con Escudo', 7: 'Enjambre', 8: 'Bombardero Inestable',
  9: 'Torreta', 10: 'FRAGMENTO PRIMARIO',
  18: 'Tejedor', 19: 'Espejo', 20: 'Divisor',
};

/** Modificadores de élite. Cada uno cambia cómo hay que matarlo, no sólo cuánto. */
export const ELITE = {
  BLINDADO: 0,      // reduce el daño recibido, pero se le rompe antes la postura
  VELOZ: 1,         // rápido y pequeño, aguanta poco
  VOLATIL: 2,       // estalla al morir
  REGENERADOR: 3,   // se cura si le dejas respirar
};

export const NOMBRE_ELITE = ['BLINDADO', 'VELOZ', 'VOLATIL', 'REGENERADOR'];

export const FLAG = {
  MIRA_DERECHA: 1 << 0,
  INVULNERABLE: 1 << 1,
  ATRAVIESA_MUROS: 1 << 2,
  IGNORA_GRAVEDAD: 1 << 3,
  MUERE_AL_CHOCAR: 1 << 4,
  DESTRUIBLE: 1 << 5,       // los proyectiles enemigos que se pueden parry
  ELITE: 1 << 6,
  ACTIVADO: 1 << 7,
  EN_AGUA: 1 << 8,
  ESCUDO_FRONTAL: 1 << 9,
  REFLEJADO: 1 << 10,
  PARRYABLE: 1 << 11,     // ataque comprometido: se puede devolver con parry
  CARGADO: 1 << 12,       // proyectil potenciado por la carga del arma
  ABIERTO: 1 << 13,       // el espejo tiene la placa retirada: es vulnerable
};

export const CAPACIDAD = 3072;

export function crearAlmacen() {
  return new EntityStore(CAPACIDAD, ESQUEMA);
}
