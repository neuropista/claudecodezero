// ecs.js — Almacén de entidades "structure of arrays".
//
// Cada componente es un array tipado plano indexado por id de entidad. Las
// entidades se reciclan con una lista libre y llevan generación para detectar
// referencias colgantes. No se asigna memoria después de la construcción.

const CTORS = {
  f32: Float32Array, f64: Float64Array,
  i32: Int32Array, u32: Uint32Array,
  i16: Int16Array, u16: Uint16Array,
  i8: Int8Array, u8: Uint8Array,
};

/**
 * @param {number} capacity  número máximo de entidades simultáneas
 * @param {Object} schema    {nombreCampo: 'f32' | ['f32', aridad]}
 */
export class EntityStore {
  constructor(capacity, schema) {
    this.capacity = capacity;
    this.schema = schema;
    this.fields = Object.keys(schema);
    this.arity = Object.create(null);

    for (const name of this.fields) {
      const def = schema[name];
      const type = Array.isArray(def) ? def[0] : def;
      const n = Array.isArray(def) ? def[1] : 1;
      const Ctor = CTORS[type];
      if (!Ctor) throw new Error(`Tipo de componente desconocido: ${type}`);
      this[name] = new Ctor(capacity * n);
      this.arity[name] = n;
    }

    this.alive = new Uint8Array(capacity);
    this.gen = new Uint16Array(capacity);
    this.mask = new Uint32Array(capacity);      // bits de arquetipo
    this.freeList = new Int32Array(capacity);
    this.freeCount = capacity;
    for (let i = 0; i < capacity; i++) this.freeList[i] = capacity - 1 - i;

    // Lista compacta de entidades vivas para iterar sin recorrer huecos.
    this.dense = new Int32Array(capacity);
    this.denseIndex = new Int32Array(capacity).fill(-1);
    this.count = 0;

    this._pendingKill = new Int32Array(capacity);
    this._pendingCount = 0;
  }

  /** Reserva una entidad. Devuelve su id o -1 si no queda espacio. */
  create(mask = 0) {
    if (this.freeCount === 0) return -1;
    const id = this.freeList[--this.freeCount];
    this.alive[id] = 1;
    this.mask[id] = mask;
    this.denseIndex[id] = this.count;
    this.dense[this.count++] = id;
    return id;
  }

  /** Marca la entidad para eliminación al final del tick. */
  kill(id) {
    if (id < 0 || this.alive[id] !== 1) return;
    this.alive[id] = 2; // moribunda: ya no participa en consultas
    this._pendingKill[this._pendingCount++] = id;
  }

  /** Elimina de verdad las entidades marcadas. Se llama una vez por tick. */
  flush() {
    for (let i = 0; i < this._pendingCount; i++) {
      const id = this._pendingKill[i];
      if (this.alive[id] !== 2) continue;
      this.alive[id] = 0;
      this.mask[id] = 0;
      this.gen[id] = (this.gen[id] + 1) & 0xffff;
      // swap-remove en la lista densa
      const di = this.denseIndex[id];
      const last = this.dense[--this.count];
      this.dense[di] = last;
      this.denseIndex[last] = di;
      this.denseIndex[id] = -1;
      this.freeList[this.freeCount++] = id;
    }
    this._pendingCount = 0;
  }

  isAlive(id) { return id >= 0 && this.alive[id] === 1; }
  has(id, bits) { return this.alive[id] === 1 && (this.mask[id] & bits) === bits; }
  addBits(id, bits) { this.mask[id] |= bits; }
  removeBits(id, bits) { this.mask[id] &= ~bits; }

  /** Handle estable: empaqueta id y generación en un entero. */
  handle(id) { return id < 0 ? -1 : (id | (this.gen[id] << 16)); }
  resolve(handle) {
    if (handle < 0) return -1;
    const id = handle & 0xffff;
    return (this.alive[id] === 1 && this.gen[id] === (handle >>> 16)) ? id : -1;
  }

  /** Vacía el almacén completo sin reasignar memoria. */
  clear() {
    // Se ponen a cero también los componentes: si no, los huecos conservan los
    // valores de la partida anterior y cualquier firma del estado (checksums de
    // la repetición) dejaría de ser reproducible.
    for (const name of this.fields) this[name].fill(0);
    this.alive.fill(0);
    this.mask.fill(0);
    this.denseIndex.fill(-1);
    this.count = 0;
    this._pendingCount = 0;
    this.freeCount = this.capacity;
    for (let i = 0; i < this.capacity; i++) this.freeList[i] = this.capacity - 1 - i;
  }

  /** Copia todos los arrays a otro almacén idéntico (para snapshots/replay). */
  copyTo(other) {
    for (const name of this.fields) other[name].set(this[name]);
    other.alive.set(this.alive);
    other.gen.set(this.gen);
    other.mask.set(this.mask);
    other.dense.set(this.dense);
    other.denseIndex.set(this.denseIndex);
    other.freeList.set(this.freeList);
    other.freeCount = this.freeCount;
    other.count = this.count;
    other._pendingCount = 0;
  }
}

/** Crea máscaras de bits nombradas a partir de una lista de componentes. */
export function makeMasks(names) {
  const out = Object.create(null);
  names.forEach((n, i) => { out[n] = 1 << i; });
  return out;
}
