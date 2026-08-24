#!/usr/bin/env node
// empaquetar.mjs — Genera vex.html: un único archivo que se abre con doble clic.
//
// El juego NO necesita este paso para funcionar: index.html + src/ corren tal
// cual desde cualquier servidor estático. Esto existe sólo porque el protocolo
// file:// bloquea la carga de módulos ES por CORS, así que para poder repartir
// el juego como un archivo suelto hay que resolver los imports por adelantado.
//
// No minifica ni transpila: reordena los módulos por dependencias, sustituye
// cada import por una llamada al registro y deja el código tal como está.
//
//   node herramientas/empaquetar.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');
const ENTRADA = resolve(RAIZ, 'src/main.js');
const PLANTILLA = resolve(RAIZ, 'index.html');
const SALIDA = resolve(RAIZ, 'vex.html');

const modulos = new Map();   // ruta absoluta -> { id, codigo, deps, exports }
const orden = [];

const idDe = (ruta) => relative(RAIZ, ruta).replace(/\\/g, '/');

/** Sustituye los import/export de un módulo por el registro interno. */
function transformar(codigo, ruta) {
  const deps = [];
  const exportados = new Set();

  const resolver = (spec) => {
    const abs = resolve(dirname(ruta), spec);
    if (!deps.includes(abs)) deps.push(abs);
    return idDe(abs);
  };

  // import * as ns from '...'
  codigo = codigo.replace(
    /^import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"];?/gm,
    (_, ns, spec) => `const ${ns} = __req(${JSON.stringify(resolver(spec))});`,
  );

  // import { a, b as c } from '...'   (admite varias líneas)
  codigo = codigo.replace(
    /^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/gm,
    (_, lista, spec) => {
      const campos = lista.split(',').map((s) => s.trim()).filter(Boolean)
        .map((s) => {
          const m = s.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
          return m ? `${m[1]}: ${m[2]}` : s;
        });
      return `const { ${campos.join(', ')} } = __req(${JSON.stringify(resolver(spec))});`;
    },
  );

  // import '...'  (sólo por efecto secundario)
  codigo = codigo.replace(
    /^import\s+['"]([^'"]+)['"];?/gm,
    (_, spec) => `__req(${JSON.stringify(resolver(spec))});`,
  );

  if (/^import\s/m.test(codigo)) {
    throw new Error(`Forma de import no soportada en ${idDe(ruta)}`);
  }

  // export const/let/class/function NOMBRE
  codigo = codigo.replace(
    /^export\s+(const|let|var|class|function|async function)\s+([A-Za-z_$][\w$]*)/gm,
    (_, tipo, nombre) => { exportados.add(nombre); return `${tipo} ${nombre}`; },
  );

  // export { a, b as c };
  codigo = codigo.replace(/^export\s*\{([^}]*)\};?/gm, (_, lista) => {
    for (const bruto of lista.split(',')) {
      const s = bruto.trim();
      if (!s) continue;
      const m = s.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      exportados.add(m ? `${m[2]}: ${m[1]}` : s);
    }
    return '';
  });

  if (/^export\s/m.test(codigo)) {
    throw new Error(`Forma de export no soportada en ${idDe(ruta)}`);
  }

  return { codigo, deps, exportados: [...exportados] };
}

/** Recorrido en profundidad: las dependencias se emiten antes que quien las usa. */
function cargar(ruta) {
  if (modulos.has(ruta)) return;
  const fuente = readFileSync(ruta, 'utf8');
  const { codigo, deps, exportados } = transformar(fuente, ruta);
  modulos.set(ruta, { id: idDe(ruta), codigo, deps, exportados, listo: false });
  for (const d of deps) cargar(d);
  orden.push(ruta);
}

cargar(ENTRADA);

// --- Comprobación de ciclos (el registro no los soportaría) ---
const visitando = new Set(), visitado = new Set();
(function ciclos(ruta, pila) {
  if (visitado.has(ruta)) return;
  if (visitando.has(ruta)) {
    throw new Error(`Dependencia circular: ${[...pila, idDe(ruta)].map(idDe0).join(' -> ')}`);
  }
  visitando.add(ruta);
  for (const d of modulos.get(ruta).deps) ciclos(d, [...pila, ruta]);
  visitando.delete(ruta);
  visitado.add(ruta);
})(ENTRADA, []);
function idDe0(x) { return typeof x === 'string' && x.includes('/') && !x.startsWith('/') ? x : idDe(x); }

// --- Ensamblado ---
const partes = [];
partes.push(`// VEX — Colapso Neuronal · paquete de un solo archivo
// Generado por herramientas/empaquetar.mjs a partir de src/. No editar a mano:
// el codigo fuente vive en src/ y ahi es donde hay que tocar.
const __defs = Object.create(null);
const __cache = Object.create(null);
function __def(id, fn) { __defs[id] = fn; }
function __req(id) {
  if (__cache[id]) return __cache[id];
  const exports = Object.create(null);
  __cache[id] = exports;
  const def = __defs[id];
  if (!def) throw new Error('Modulo no empaquetado: ' + id);
  def(exports, __req);
  return exports;
}
`);

for (const ruta of orden) {
  const m = modulos.get(ruta);
  const asignaciones = m.exportados.length
    ? `\n  Object.assign(exports, { ${m.exportados.join(', ')} });\n`
    : '\n';
  partes.push(
    `\n// ${'='.repeat(66)}\n// ${m.id}\n// ${'='.repeat(66)}\n` +
    `__def(${JSON.stringify(m.id)}, function (exports, __req) {\n` +
    m.codigo.replace(/^/gm, '  ') +
    asignaciones +
    `});\n`,
  );
}
partes.push(`\n__req(${JSON.stringify(idDe(ENTRADA))});\n`);

const bundle = partes.join('');

// --- HTML final: la misma plantilla, con el script embebido ---
let html = readFileSync(PLANTILLA, 'utf8');
html = html.replace(
  /<script type="module" src="\.\/src\/main\.js"><\/script>/,
  `<script type="module">\n${bundle}\n</script>`,
);
html = html.replace(
  /<meta name="description"[^>]*>/,
  '$&\n<!-- Archivo unico autocontenido: funciona con doble clic, sin servidor. -->',
);
if (!html.includes('__def(')) throw new Error('No se pudo insertar el paquete en la plantilla.');

writeFileSync(SALIDA, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`vex.html generado · ${modulos.size} modulos · ${kb} KB`);
console.log('Orden de evaluacion:');
for (const r of orden) console.log('  ' + idDe(r));
