'use strict';
/* =====================================================================
   La Senda del Director 3D — lógica del juego
   Dungeon crawler de rejilla en primera persona con dificultad elegible
   Estados: menu, diff, levelselect, codex, help, dialog, world,
            question, feedback, recap, defeat, boss, victory
   ===================================================================== */

const ctx = E3.ctx, W = E3.W, H = E3.H;
const COLS = 20, ROWS = 11;
const SAVE_KEY = 'senda_director_3d_save';

/* ==================== DIFICULTAD ==================== */
const DIFFS = [
  { id: 'aprendiz', name: 'APRENDIZ', color: '#7ac74f', hearts: 5, opts: 3, time: 0,
    needed: [3, 3, 3, 3, 3, 2], bossHp: 5, hard: false, mult: 1,
    tag: 'Para empezar sin miedo',
    bullets: ['5 corazones por zona', '3 opciones por pregunta', 'Sin límite de tiempo', '3 guardianes para abrir la puerta'] },
  { id: 'profesional', name: 'PROFESIONAL', color: '#f2c14e', hearts: 3, opts: 4, time: 30,
    needed: [4, 4, 4, 4, 4, 3], bossHp: 6, hard: false, mult: 2,
    tag: 'El reto equilibrado',
    bullets: ['3 corazones por zona', '4 opciones por pregunta', '30 segundos por pregunta', '4 guardianes para abrir la puerta'] },
  { id: 'director', name: 'DIRECTOR', color: '#e34a4a', hearts: 2, opts: 4, time: 15,
    needed: [5, 5, 5, 5, 5, 3], bossHp: 8, hard: true, mult: 3,
    tag: 'Solo para quien ya dirige',
    bullets: ['2 corazones por zona', '15 segundos por pregunta', 'Incluye preguntas EXPERTAS', '5 guardianes para abrir la puerta'] }
];
let DIFF = DIFFS[1];

/* ==================== PERFIL PERSISTENTE ==================== */
function defaultProfile() {
  return { unlocked: 0, done: [false, false, false, false, false, false], xp: 0, codex: [], ach: [], diff: 'profesional', best: {} };
}
function loadProfile() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return Object.assign(defaultProfile(), JSON.parse(raw));
  } catch (e) { /* sin almacenamiento */ }
  return defaultProfile();
}
function saveProfile() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(prof)); } catch (e) { /* sin almacenamiento */ }
}
let prof = loadProfile();
DIFF = DIFFS.find(d => d.id === prof.diff) || DIFFS[1];

const EXTRA_ACH = [
  { id: 'maestro_director', name: 'Maestro Director', desc: 'Completaste la aventura en dificultad DIRECTOR' },
  { id: 'sin_titubeos', name: 'Sin Titubeos', desc: 'Respondiste con más de la mitad del tiempo restante 5 veces' }
];
const ACH_ALL = ACHIEVEMENTS.concat(EXTRA_ACH);
function hasAch(id) { return prof.ach.includes(id); }
function grantAch(id, list) { if (!hasAch(id)) { prof.ach.push(id); if (list) list.push(id); } }
function confLetter() { return 'ABCDE'[Math.min(prof.done.filter(Boolean).length, 4)]; }

/* ==================== ESTADO ==================== */
const G = { state: 'menu', mode: 'adventure', lastEv: '', fast: 0 };
let Z = null, DLG = null, QS = null, FB = null, EV = null, RC = null, BS = null;
let TOAST = null, DEFEAT = null, VIC = null;
let menuIdx = 0, lvlIdx = 0, cdxIdx = 0, diffIdx = 1, tick = 0, glitchT = 0;

const PL = { x: 1.5, z: 1.5, yaw: 0, cx: 1, cz: 1, dir: 0, move: null, turn: null, bob: 0, trail: [] };
const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]];  // N, E, S, O

function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
function toast(t, ms) { TOAST = { text: t, t: ms || 3200 }; }

/* ==================== TEMAS 3D POR ZONA ==================== */
const T = E3.T;
const THEMES3D = [
  { wall: T.HEDGE, floor: T.GRASS, ceil: -1, fog: [0.42, 0.62, 0.82], dist: 14, music: 'field' },
  { wall: T.HEDGE, floor: T.GRASS, ceil: -1, fog: [0.34, 0.50, 0.66], dist: 11, music: 'field' },
  { wall: T.ROCK, floor: T.STONE, ceil: T.CEIL_STONE, fog: [0.06, 0.06, 0.10], dist: 8, music: 'cave' },
  { wall: T.WOOD, floor: T.PLANK, ceil: T.CEIL_WOOD, fog: [0.16, 0.10, 0.06], dist: 10, music: 'field' },
  { wall: T.COLUMN, floor: T.MARBLE, ceil: -1, fog: [0.72, 0.66, 0.50], dist: 15, music: 'field' },
  { wall: T.BRICK, floor: T.STONE, ceil: T.CEIL_DARK, fog: [0.07, 0.05, 0.13], dist: 9, music: 'cave' }
];

/* ==================== CARGA DE ZONA ==================== */
function parseZone(i) {
  const zd = STORY.zones[i];
  const grid = [];
  const z = {
    i, grid, guardians: [], chests: [], npcs: [], door: null, bossGate: null,
    start: { x: 1, y: 1 }, cleared: 0, heartsLost: 0, hearts: DIFF.hearts,
    queue: buildQueue(i), qpos: 0, doorOpen: false, explored: new Set(), fastAnswers: 0
  };
  for (let y = 0; y < ROWS; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) {
      const c = zd.map[y][x];
      switch (c) {
        case 'P': z.start = { x, y }; row.push('.'); break;
        case 'G': z.guardians.push({ x, y, cleared: false }); row.push('.'); break;
        case 'C': z.chests.push({ x, y, opened: false }); row.push('.'); break;
        case 'N': z.npcs.push({ x, y, li: 0 }); row.push('.'); break;
        case 'D': z.door = { x, y }; row.push('#'); break;       // la puerta es un muro hasta abrirse
        case 'B': z.bossGate = { x, y }; row.push('.'); break;
        default: row.push(c);
      }
    }
    grid.push(row);
  }
  return z;
}

function buildQueue(zi) {
  let bank = QUESTIONS[zi].slice();
  if (DIFF.hard && typeof QUESTIONS_HARD !== 'undefined') bank = bank.concat(QUESTIONS_HARD[zi]);
  return shuffle(bank);
}

function rebuildLevel() {
  const th = THEMES3D[Z.i];
  E3.buildLevel(Z.grid, {
    wall: th.wall, floor: th.floor, ceil: th.ceil,
    doorAt: Z.door, doorOpen: Z.doorOpen
  });
}

function placePlayer(x, y, dir) {
  PL.cx = x; PL.cz = y; PL.dir = dir === undefined ? PL.dir : dir;
  PL.x = x + 0.5; PL.z = y + 0.5; PL.yaw = PL.dir * Math.PI / 2;
  PL.move = null; PL.turn = null; PL.trail = [];
  markExplored();
}

function startZone(i, mode, skipIntro) {
  G.mode = mode || G.mode;
  BS = null; EV = null; TOAST = null; QS = null;
  Z = parseZone(i);
  rebuildLevel();
  // orientación inicial hacia un lado libre
  let dir = 1;
  for (let d = 0; d < 4; d++) if (passable(Z.start.x + DIRV[d][0], Z.start.y + DIRV[d][1])) { dir = d; break; }
  placePlayer(Z.start.x, Z.start.y, dir);
  AUDIO.playMusic(THEMES3D[i].music);
  const intro = STORY.zones[i].intro;
  if (skipIntro || !intro.length) G.state = 'world';
  else showDialog(intro, () => { G.state = 'world'; });
}

function restartZone() {
  const i = Z.i;
  Z = parseZone(i);
  rebuildLevel();
  placePlayer(Z.start.x, Z.start.y);
  EV = null;
  toast('Zona reiniciada. ¡Esta vez sí, Director!');
  G.state = 'world';
  AUDIO.playMusic(THEMES3D[i].music);
}

function showDialog(pages, onDone) { DLG = { pages, i: 0, onDone }; G.state = 'dialog'; }

/* ==================== COLISIONES / ENTIDADES ==================== */
function solidCell(x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
  const c = Z.grid[y][x];
  if (c === '#') return !(Z.door && Z.door.x === x && Z.door.y === y && Z.doorOpen);
  return c === '~';
}
function entityAt(x, y) {
  const g = Z.guardians.find(e => !e.cleared && e.x === x && e.y === y);
  if (g) return { kind: 'guardian', ent: g };
  const n = Z.npcs.find(e => e.x === x && e.y === y);
  if (n) return { kind: 'npc', ent: n };
  const c = Z.chests.find(e => !e.opened && e.x === x && e.y === y);
  if (c) return { kind: 'chest', ent: c };
  if (Z.bossGate && Z.bossGate.x === x && Z.bossGate.y === y) return { kind: 'boss', ent: Z.bossGate };
  return null;
}
function passable(x, y) { return !solidCell(x, y) && !entityAt(x, y); }
function frontCell() { const d = DIRV[PL.dir]; return { x: PL.cx + d[0], y: PL.cz + d[1] }; }

function markExplored() {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = PL.cx + dx, y = PL.cz + dy;
      if (x >= 0 && y >= 0 && x < COLS && y < ROWS) Z.explored.add(x + ',' + y);
    }
  }
}

/* ==================== MOVIMIENTO ==================== */
function tryStep(sign, strafe) {
  if (PL.move || PL.turn) return;
  let d = PL.dir;
  if (strafe) d = (PL.dir + (sign > 0 ? 1 : 3)) % 4;
  const v = DIRV[d], s = strafe ? 1 : sign;
  const nx = PL.cx + v[0] * s, ny = PL.cz + v[1] * s;
  if (!passable(nx, ny)) {
    const blocker = entityAt(nx, ny);
    if (blocker && blocker.kind === 'guardian') toast('Un GUARDIÁN bloquea el paso. Pulsa ESPACIO para responder.', 2600);
    else if (Z.door && Z.door.x === nx && Z.door.y === ny && !Z.doorOpen)
      toast('Puerta sellada. Guardianes restantes: ' + Math.max(0, DIFF.needed[Z.i] - Z.cleared), 2600);
    AUDIO.sfx.turn();
    return;
  }
  PL.move = { fx: PL.x, fz: PL.z, tx: nx + 0.5, tz: ny + 0.5, t: 0, dur: 230 };
  PL.cx = nx; PL.cz = ny;
  markExplored();
  AUDIO.sfx.step();
}
function tryTurn(sign) {
  if (PL.move || PL.turn) return;
  const nd = (PL.dir + (sign > 0 ? 1 : 3)) % 4;
  PL.turn = { fy: PL.yaw, ty: PL.yaw + sign * Math.PI / 2, t: 0, dur: 190 };
  PL.dir = nd;
  AUDIO.sfx.turn();
}

/* ==================== PREGUNTAS ==================== */
function nextItem() {
  if (Z.qpos >= Z.queue.length) { Z.queue = buildQueue(Z.i); Z.qpos = 0; }
  return Z.queue[Z.qpos++];
}
function makeOptions(item) {
  const correct = { t: item.o[item.a], ok: true };
  const wrong = shuffle(item.o.filter((_, k) => k !== item.a).map(t => ({ t, ok: false })));
  return shuffle([correct].concat(wrong.slice(0, Math.max(1, DIFF.opts - 1))));
}
function askQuestion(guardian) {
  const item = nextItem();
  QS = {
    item, opts: makeOptions(item), sel: 0, guardian,
    expert: DIFF.hard && typeof QUESTIONS_HARD !== 'undefined' && QUESTIONS_HARD[Z.i].indexOf(item) >= 0,
    time: DIFF.time, timeMax: DIFF.time, lastTick: -1
  };
  G.state = 'question';
  AUDIO.sfx.confirm();
}

function answerQuestion(timeout) {
  const ok = !timeout && QS.opts[QS.sel].ok;
  const correctText = QS.opts.find(o => o.ok).t;
  const fastBonus = DIFF.time > 0 && QS.time > DIFF.time / 2;
  if (ok) {
    QS.guardian.cleared = true;
    Z.cleared++;
    if (fastBonus) { Z.fastAnswers++; G.fast++; }
    const gain = Math.round((10 + (QS.expert ? 10 : 0) + (fastBonus ? 5 : 0)) * DIFF.mult);
    prof.xp += gain;
    AUDIO.sfx.correct();
    const opens = Z.cleared >= DIFF.needed[Z.i] && !Z.doorOpen;
    FB = {
      correct: true,
      head: '¡CORRECTO!  +' + gain + ' XP' + (QS.expert ? '  ★ EXPERTA' : '') + (fastBonus ? '  ⚡ RÁPIDO' : ''),
      body: QS.item.e,
      onDone: () => {
        if (opens) {
          Z.doorOpen = true;
          if (Z.door) rebuildLevel();
          AUDIO.sfx.door();
          toast(Z.bossGate ? '¡El PORTAL DEL JEFE se ha abierto!' : '¡La PUERTA de la zona se ha abierto! Búscala.', 4200);
        }
        G.state = 'world';
      }
    };
  } else {
    Z.hearts--; Z.heartsLost++; G.fast = 0;
    AUDIO.sfx.wrong();
    FB = {
      correct: false,
      head: timeout ? '¡SE ACABÓ EL TIEMPO!  −1 ♥' : 'INCORRECTO  −1 ♥',
      body: 'La respuesta era: "' + correctText + '". ' + QS.item.e,
      onDone: () => {
        if (Z.hearts <= 0) triggerDefeat('world');
        else { triggerEvent(); G.state = 'world'; }
      }
    };
  }
  G.state = 'feedback';
  QS = null;
}

/* ==================== EVENTOS INUSUALES (en 3D) ==================== */
function randomFreeCell(minDist) {
  for (let i = 0; i < 300; i++) {
    const x = 1 + Math.floor(Math.random() * (COLS - 2)), y = 1 + Math.floor(Math.random() * (ROWS - 2));
    if (!passable(x, y)) continue;
    if (Math.abs(x - PL.cx) + Math.abs(y - PL.cz) < (minDist || 0)) continue;
    return { x, y };
  }
  return { x: Z.start.x, y: Z.start.y };
}
function triggerEvent() {
  const types = ['humo', 'archivos', 'glitch'].filter(t => t !== G.lastEv);
  const type = types[Math.floor(Math.random() * types.length)];
  G.lastEv = type;
  toast(STORY.events[type], 4200);
  if (type === 'humo') {
    EV = { type, t: 11000 };
  } else if (type === 'archivos') {
    const files = [];
    for (let k = 0; k < 3; k++) { const c = randomFreeCell(4); files.push({ x: c.x + 0.5, z: c.y + 0.5 }); }
    EV = { type, t: 16000, files };
  } else {
    const c = randomFreeCell(5);
    placePlayer(c.x, c.y, Math.floor(Math.random() * 4));
    glitchT = 900;
    AUDIO.sfx.hurt();
    EV = { type, t: 900 };
  }
}
function triggerDefeat(from) {
  DEFEAT = { text: STORY.defeats[Math.floor(Math.random() * STORY.defeats.length)], from };
  G.state = 'defeat';
  AUDIO.stopMusic();
  AUDIO.sfx.defeat();
}

/* ==================== COFRES, ZONA COMPLETA ==================== */
function openChest(chest) {
  chest.opened = true;
  AUDIO.sfx.chest();
  const next = CODEX_PROMPTS.find(p => !prof.codex.includes(p.id));
  if (next) { prof.codex.push(next.id); toast('¡PROMPT LEGENDARIO: "' + next.title + '"! Guardado en tu códex.', 4600); }
  else { prof.xp += 15 * DIFF.mult; toast('El cofre brilla: +' + (15 * DIFF.mult) + ' XP (ya tienes todos los prompts).', 3600); }
  saveProfile();
}

function completeZone() {
  const i = Z.i, newAch = [];
  prof.xp += 25 * DIFF.mult;
  prof.done[i] = true;
  prof.unlocked = Math.max(prof.unlocked, i + 1);
  const key = i + ':' + DIFF.id;
  if (!prof.best[key] || Z.heartsLost < prof.best[key]) prof.best[key] = Z.heartsLost;
  if (i === 0) grantAch('primer_paso', newAch);
  if (i === 2 && Z.heartsLost === 0) grantAch('regla_de_oro', newAch);
  if (i === 4 && Z.heartsLost === 0) grantAch('semaforo_interior', newAch);
  if (prof.codex.length >= CODEX_PROMPTS.length) grantAch('coleccionista', newAch);
  if (G.fast >= 5) grantAch('sin_titubeos', newAch);
  saveProfile();
  AUDIO.sfx.fanfare();
  AUDIO.stopMusic();
  RC = { zone: i, newAch, lost: Z.heartsLost };
  G.state = 'recap';
}

/* ==================== JEFE FINAL ==================== */
function startBoss() {
  BS = { hp: DIFF.bossHp, maxhp: DIFF.bossHp, queue: shuffle(BOSS_ITEMS), idx: 0, item: null, sel: 0, anim: 0, shakeT: 0,
         time: DIFF.time ? DIFF.time + 5 : 0, timeMax: DIFF.time ? DIFF.time + 5 : 0 };
  Z.hearts = DIFF.hearts;
  nextBossItem();
  G.state = 'boss';
  AUDIO.playMusic('boss');
}
function nextBossItem() {
  if (BS.idx >= BS.queue.length) { BS.queue = shuffle(BOSS_ITEMS); BS.idx = 0; }
  BS.item = BS.queue[BS.idx++];
  BS.sel = 0;
  BS.time = BS.timeMax;
}
function answerBoss(timeout) {
  const ok = !timeout && (BS.sel === 1) === BS.item.humo;
  if (ok) {
    BS.hp--; BS.anim = 500;
    AUDIO.sfx.bosshit();
    const gain = 15 * DIFF.mult;
    prof.xp += gain;
    FB = { correct: true, head: '¡GOLPE AL HUMO!  +' + gain + ' XP', body: BS.item.e,
      onDone: () => { if (BS.hp <= 0) bossDefeated(); else { nextBossItem(); G.state = 'boss'; } } };
  } else {
    Z.hearts--; BS.shakeT = 600;
    AUDIO.sfx.wrong();
    const taunt = STORY.boss.taunts[Math.floor(Math.random() * STORY.boss.taunts.length)];
    FB = { correct: false, head: timeout ? 'EL HUMO TE ENVOLVIÓ (tiempo)  −1 ♥' : 'EL HUMO TE ENVUELVE  −1 ♥',
      body: BS.item.e + '  ...El Humo susurra: "' + taunt + '"',
      onDone: () => { if (Z.hearts <= 0) triggerDefeat('boss'); else { nextBossItem(); G.state = 'boss'; } } };
  }
  G.state = 'feedback';
}
function bossDefeated() {
  const newAch = [];
  grantAch('detector_de_humo', newAch);
  prof.done[5] = true; prof.unlocked = 6;
  prof.xp += 50 * DIFF.mult;
  if (G.mode === 'adventure' || prof.done.every(Boolean)) {
    grantAch('director', newAch);
    if (DIFF.id === 'director') grantAch('maestro_director', newAch);
  }
  if (prof.codex.length >= CODEX_PROMPTS.length) grantAch('coleccionista', newAch);
  saveProfile();
  showDialog(STORY.boss.win, () => {
    VIC = { newAch, confetti: [] };
    for (let k = 0; k < 110; k++) {
      VIC.confetti.push({ x: Math.random() * W, y: -Math.random() * H, v: 40 + Math.random() * 120,
        c: ['#e34a4a', '#f2c14e', '#7ad7f0', '#7ac74f', '#c77df2'][k % 5], s: 4 + Math.random() * 6 });
    }
    G.state = 'victory';
    AUDIO.playMusic('win');
  });
}

/* ==================== MENÚ ==================== */
function menuItems() {
  const items = [{ id: 'new', label: 'NUEVA AVENTURA' }];
  if (prof.unlocked > 0 && prof.unlocked < 6) items.push({ id: 'continue', label: 'CONTINUAR — ' + STORY.zones[prof.unlocked].name.toUpperCase() });
  items.push({ id: 'levels', label: 'ELEGIR NIVEL (REPASO)' });
  items.push({ id: 'diff', label: 'DIFICULTAD: ' + DIFF.name });
  items.push({ id: 'codex', label: 'CÓDEX DE PROMPTS (' + prof.codex.length + '/' + CODEX_PROMPTS.length + ')' });
  items.push({ id: 'help', label: 'INSTRUCCIONES' });
  return items;
}
function menuSelect(id) {
  AUDIO.sfx.confirm(); TOAST = null;
  if (id === 'new') { G.mode = 'adventure'; diffIdx = DIFFS.indexOf(DIFF); G.pending = 'new'; G.state = 'diff'; }
  else if (id === 'continue') { G.mode = 'adventure'; startZone(prof.unlocked, 'adventure'); }
  else if (id === 'levels') { lvlIdx = 0; G.state = 'levelselect'; }
  else if (id === 'diff') { diffIdx = DIFFS.indexOf(DIFF); G.pending = null; G.state = 'diff'; }
  else if (id === 'codex') { cdxIdx = 0; G.state = 'codex'; }
  else if (id === 'help') { G.state = 'help'; }
}
function applyDifficulty() {
  DIFF = DIFFS[diffIdx];
  prof.diff = DIFF.id;
  saveProfile();
  AUDIO.sfx.confirm();
  if (G.pending === 'new') { G.pending = null; showDialog(STORY.opening, () => startZone(0, 'adventure')); }
  else if (G.pending === 'level') { const k = G.pendingLevel; G.pending = null; startZone(k, 'level'); }
  else { toast('Dificultad: ' + DIFF.name + ' — ' + DIFF.bullets.join(' · '), 4200); G.state = 'menu'; }
}

/* =====================================================================
   ENTRADA
   ===================================================================== */
const keys = {}, pressed = {};
let clickPt = null, clickables = [];

function key(e) { return e.key.length === 1 ? e.key.toLowerCase() : e.key; }
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].indexOf(e.key) >= 0) e.preventDefault();
  const k = key(e);
  if (!keys[k]) pressed[k] = true;
  keys[k] = true;
  AUDIO.resume();
});
window.addEventListener('keyup', e => { keys[key(e)] = false; });
function consume(k) { if (pressed[k]) { pressed[k] = false; return true; } return false; }
function anyOf() { let r = false; for (let i = 0; i < arguments.length; i++) if (consume(arguments[i])) r = true; return r; }

E3.hud.addEventListener('click', e => {
  const r = E3.hud.getBoundingClientRect();
  clickPt = { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  AUDIO.resume();
});
function clickable(x, y, w, h, fn) { clickables.push({ x, y, w, h, fn }); }
function processClicks() {
  if (clickPt) for (const c of clickables) {
    if (clickPt.x >= c.x && clickPt.x <= c.x + c.w && clickPt.y >= c.y && clickPt.y <= c.y + c.h) { c.fn(); break; }
  }
  clickPt = null; clickables = [];
}
document.querySelectorAll('#touch button').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); if (!keys[k]) pressed[k] = true; keys[k] = true; AUDIO.resume(); };
  const off = e => { e.preventDefault(); keys[k] = false; };
  b.addEventListener('touchstart', on, { passive: false });
  b.addEventListener('touchend', off, { passive: false });
  b.addEventListener('mousedown', on);
  b.addEventListener('mouseup', off);
  b.addEventListener('mouseleave', off);
});

/* =====================================================================
   ACTUALIZACIÓN
   ===================================================================== */
function update(dt) {
  tick += dt;
  if (glitchT > 0) glitchT -= dt;
  if (TOAST) { TOAST.t -= dt; if (TOAST.t <= 0) TOAST = null; }
  if (consume('m')) toast(AUDIO.toggle() ? 'Sonido: ON' : 'Sonido: OFF', 1500);

  switch (G.state) {
    case 'menu': updateMenu(); break;
    case 'diff': updateDiff(); break;
    case 'levelselect': updateLevelSelect(); break;
    case 'codex': updateCodex(); break;
    case 'help': if (anyOf(' ', 'Enter', 'Escape')) enterMenu(); break;
    case 'dialog': if (anyOf(' ', 'Enter')) advanceDialog(); break;
    case 'world': updateWorld(dt); break;
    case 'question': updateQuestion(dt); break;
    case 'feedback': if (anyOf(' ', 'Enter')) closeFeedback(); break;
    case 'recap': if (anyOf(' ', 'Enter')) advanceRecap(); break;
    case 'defeat': if (anyOf(' ', 'Enter')) retryDefeat(); break;
    case 'boss': updateBoss(dt); break;
    case 'victory': updateVictory(dt); break;
  }
}

function advanceDialog() {
  if (!DLG) return;
  DLG.i++;
  if (DLG.i >= DLG.pages.length) { const d = DLG; DLG = null; d.onDone(); } else AUDIO.sfx.move();
}
function closeFeedback() { if (!FB) return; const f = FB; FB = null; f.onDone(); }
function advanceRecap() {
  if (!RC) return;
  const i = RC.zone; RC = null;
  if (G.mode === 'adventure' && i < 5) startZone(i + 1, 'adventure');
  else if (G.mode === 'level') { enterMenu(); G.state = 'levelselect'; }
  else enterMenu();
}
function retryDefeat() {
  if (!DEFEAT) return;
  if (DEFEAT.from === 'boss') { DEFEAT = null; startBoss(); } else { DEFEAT = null; restartZone(); }
}

function updateMenu() {
  const items = menuItems();
  if (menuIdx >= items.length) menuIdx = 0;
  if (anyOf('ArrowUp', 'w')) { menuIdx = (menuIdx + items.length - 1) % items.length; AUDIO.sfx.move(); }
  if (anyOf('ArrowDown', 's')) { menuIdx = (menuIdx + 1) % items.length; AUDIO.sfx.move(); }
  if (anyOf(' ', 'Enter')) menuSelect(items[menuIdx].id);
}
function updateDiff() {
  if (anyOf('ArrowLeft', 'a', 'ArrowUp', 'w')) { diffIdx = (diffIdx + 2) % 3; AUDIO.sfx.move(); }
  if (anyOf('ArrowRight', 'd', 'ArrowDown', 's')) { diffIdx = (diffIdx + 1) % 3; AUDIO.sfx.move(); }
  for (let k = 0; k < 3; k++) if (consume(String(k + 1))) { diffIdx = k; applyDifficulty(); return; }
  if (consume('Escape')) { G.pending = null; enterMenu(); return; }
  if (anyOf(' ', 'Enter')) applyDifficulty();
}
function updateLevelSelect() {
  if (anyOf('ArrowLeft', 'a')) { lvlIdx = (lvlIdx + 5) % 6; AUDIO.sfx.move(); }
  if (anyOf('ArrowRight', 'd')) { lvlIdx = (lvlIdx + 1) % 6; AUDIO.sfx.move(); }
  if (anyOf('ArrowUp', 'w', 'ArrowDown', 's')) { lvlIdx = (lvlIdx + 3) % 6; AUDIO.sfx.move(); }
  if (consume('Escape')) { enterMenu(); return; }
  if (anyOf(' ', 'Enter')) { G.mode = 'level'; G.pending = 'level'; G.pendingLevel = lvlIdx; diffIdx = DIFFS.indexOf(DIFF); G.state = 'diff'; AUDIO.sfx.confirm(); }
}
function updateCodex() {
  if (anyOf('ArrowUp', 'w')) { cdxIdx = (cdxIdx + CODEX_PROMPTS.length - 1) % CODEX_PROMPTS.length; AUDIO.sfx.move(); }
  if (anyOf('ArrowDown', 's')) { cdxIdx = (cdxIdx + 1) % CODEX_PROMPTS.length; AUDIO.sfx.move(); }
  if (anyOf('Escape', ' ', 'Enter')) enterMenu();
}

function updateWorld(dt) {
  /* animación de paso y giro */
  if (PL.move) {
    PL.move.t += dt;
    const k = Math.min(1, PL.move.t / PL.move.dur), e = k * k * (3 - 2 * k);
    PL.x = PL.move.fx + (PL.move.tx - PL.move.fx) * e;
    PL.z = PL.move.fz + (PL.move.tz - PL.move.fz) * e;
    PL.bob = Math.sin(k * Math.PI * 2) * 0.035;
    if (k >= 1) { PL.move = null; PL.bob = 0; }
  } else if (PL.turn) {
    PL.turn.t += dt;
    const k = Math.min(1, PL.turn.t / PL.turn.dur), e = k * k * (3 - 2 * k);
    PL.yaw = PL.turn.fy + (PL.turn.ty - PL.turn.fy) * e;
    if (k >= 1) { PL.yaw = PL.dir * Math.PI / 2; PL.turn = null; }
  } else {
    if (keys['ArrowUp'] || keys['w']) tryStep(1, false);
    else if (keys['ArrowDown'] || keys['s']) tryStep(-1, false);
    else if (keys['ArrowLeft']) tryTurn(-1);
    else if (keys['ArrowRight']) tryTurn(1);
    else if (keys['q']) tryTurn(-1);
    else if (keys['e']) tryTurn(1);
    else if (keys['a']) tryStep(-1, true);
    else if (keys['d']) tryStep(1, true);
  }

  if (consume('Escape')) { saveProfile(); enterMenu(); return; }

  /* cofres adyacentes se abren solos */
  for (const c of Z.chests) {
    if (!c.opened && Math.abs(c.x - PL.cx) + Math.abs(c.y - PL.cz) <= 1) openChest(c);
  }

  /* puerta abierta: al pisarla se completa la zona */
  if (Z.door && Z.doorOpen && PL.cx === Z.door.x && PL.cz === Z.door.y) { completeZone(); return; }

  /* interacción */
  const target = lookTarget();
  if (target && anyOf(' ', 'Enter')) {
    if (target.kind === 'guardian') askQuestion(target.ent);
    else if (target.kind === 'npc') {
      const lines = STORY.zones[Z.i].npc;
      const line = lines[target.ent.li % lines.length];
      target.ent.li++;
      showDialog([{ sp: 'ALDEANO/A', t: line }], () => { G.state = 'world'; });
    } else if (target.kind === 'boss') {
      if (Z.doorOpen) showDialog(STORY.boss.intro, startBoss);
      else toast('El portal está sellado: responde a ' + DIFF.needed[Z.i] + ' guardianes primero.', 3000);
    }
  }

  /* eventos activos */
  if (EV) {
    EV.t -= dt;
    if (EV.type === 'archivos') {
      for (const f of EV.files) {
        const ang = Math.atan2(PL.z - f.z, PL.x - f.x);
        const sp = 0.0011 * dt;
        f.x += Math.cos(ang) * sp; f.z += Math.sin(ang) * sp;
        if (Math.hypot(PL.x - f.x, PL.z - f.z) < 0.42) {
          placePlayer(Z.start.x, Z.start.y);
          glitchT = 600;
          AUDIO.sfx.hurt();
          toast(STORY.hitByFile, 3800);
          EV = null;
          break;
        }
      }
    }
    if (EV && EV.t <= 0) EV = null;
  }
}

function lookTarget() {
  const f = frontCell();
  const e = entityAt(f.x, f.y);
  if (e && e.kind !== 'chest') return e;
  if (Z.door && !Z.doorOpen && f.x === Z.door.x && f.y === Z.door.y) return { kind: 'door', ent: Z.door };
  return null;
}

function updateQuestion(dt) {
  if (QS.timeMax > 0) {
    QS.time -= dt / 1000;
    const s = Math.ceil(QS.time);
    if (s <= 5 && s !== QS.lastTick && s > 0) { QS.lastTick = s; AUDIO.sfx.tick(); }
    if (QS.time <= 0) { answerQuestion(true); return; }
  }
  const n = QS.opts.length;
  if (anyOf('ArrowUp', 'w')) { QS.sel = (QS.sel + n - 1) % n; AUDIO.sfx.move(); }
  if (anyOf('ArrowDown', 's')) { QS.sel = (QS.sel + 1) % n; AUDIO.sfx.move(); }
  for (let k = 0; k < n; k++) if (consume(String(k + 1))) { QS.sel = k; answerQuestion(false); return; }
  if (anyOf(' ', 'Enter')) answerQuestion(false);
}

function updateBoss(dt) {
  if (BS.anim > 0) BS.anim -= dt;
  if (BS.shakeT > 0) BS.shakeT -= dt;
  if (BS.timeMax > 0) {
    BS.time -= dt / 1000;
    const s = Math.ceil(BS.time);
    if (s <= 5 && s > 0 && s !== BS.lastTick) { BS.lastTick = s; AUDIO.sfx.tick(); }
    if (BS.time <= 0) { answerBoss(true); return; }
  }
  if (anyOf('ArrowUp', 'w', 'ArrowLeft', 'a')) { BS.sel = 0; AUDIO.sfx.move(); }
  if (anyOf('ArrowDown', 's', 'ArrowRight', 'd')) { BS.sel = 1; AUDIO.sfx.move(); }
  if (consume('1')) { BS.sel = 0; answerBoss(false); return; }
  if (consume('2')) { BS.sel = 1; answerBoss(false); return; }
  if (anyOf(' ', 'Enter')) answerBoss(false);
}

function updateVictory(dt) {
  for (const c of VIC.confetti) { c.y += c.v * dt / 1000; if (c.y > H) { c.y = -10; c.x = Math.random() * W; } }
  if (anyOf(' ', 'Enter')) { VIC = null; BS = null; enterMenu(); }
}

/* =====================================================================
   DIBUJO — helpers 2D sobre el HUD
   ===================================================================== */
function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function text(s, x, y, size, color, align, weight) {
  ctx.fillStyle = color || '#fff';
  ctx.font = (weight || 'bold') + ' ' + (size || 16) + 'px "Courier New", monospace';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(s, x, y);
}
function wrap(s, max) {
  const words = String(s).split(' '), lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) { if (line) lines.push(line); line = w; }
    else line = (line ? line + ' ' : '') + w;
  }
  if (line) lines.push(line);
  return lines;
}
function panel(x, y, w, h, bg, border) {
  rect(x, y, w, h, bg || 'rgba(10,12,28,0.94)');
  ctx.strokeStyle = border || '#e8e8f0'; ctx.lineWidth = 3;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
}
function sprIcon(tile, x, y, size) {
  const s = 64, col = tile % 4, row = Math.floor(tile / 4);
  ctx.drawImage(E3.spriteCanvas, col * s, row * s, s, s, x, y, size, size);
}
function heartIcon(x, y, s, full) {
  const p = full ? ['#e34a4a', '#ff7b7b'] : ['#3a2330', '#4a2f3c'];
  ctx.fillStyle = p[0];
  ctx.fillRect(x, y + s * 0.15, s * 0.4, s * 0.5);
  ctx.fillRect(x + s * 0.6, y + s * 0.15, s * 0.4, s * 0.5);
  ctx.fillRect(x, y + s * 0.3, s, s * 0.35);
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.55); ctx.lineTo(x + s / 2, y + s); ctx.lineTo(x + s, y + s * 0.55);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = p[1];
  ctx.fillRect(x + s * 0.12, y + s * 0.25, s * 0.16, s * 0.16);
}

/* ==================== ESCENA 3D ==================== */
function sceneSprites() {
  const list = [];
  for (const g of Z.guardians) if (!g.cleared) list.push({ x: g.x + 0.5, z: g.y + 0.5, tile: E3.S.GUARDIAN, size: 0.82, base: 0.02 });
  for (const n of Z.npcs) list.push({ x: n.x + 0.5, z: n.y + 0.5, tile: Z.i === 0 || Z.i === 3 ? E3.S.FACILITADOR : E3.S.NPC, size: 0.8, base: 0.02 });
  for (const c of Z.chests) list.push({ x: c.x + 0.5, z: c.y + 0.5, tile: c.opened ? E3.S.CHEST_OPEN : E3.S.CHEST, size: 0.45, base: 0.0 });
  if (Z.bossGate) {
    const pulse = 0.9 + Math.sin(tick / 260) * 0.08;
    list.push({ x: Z.bossGate.x + 0.5, z: Z.bossGate.y + 0.5, tile: E3.S.PORTAL, size: (Z.doorOpen ? 0.95 : 0.7) * pulse, base: 0.1, shade: Z.doorOpen ? 1.25 : 0.5 });
  }
  if (BS && BS.hp > 0) {
    const sc = 0.75 + 0.85 * (BS.hp / BS.maxhp) + Math.sin(tick / 200) * 0.05;
    const hit = BS.anim > 0 ? 1.9 : 1;
    list.push({ x: Z.bossGate.x + 0.5, z: Z.bossGate.y + 0.5, tile: E3.S.HUMO, size: sc, base: 0.15, shade: hit });
  }
  if (EV && EV.type === 'archivos') for (const f of EV.files) list.push({ x: f.x, z: f.z, tile: E3.S.FILE, size: 0.5, base: 0.08 });
  /* BIT, el practicante, flota delante-izquierda del jugador */
  const fx = Math.sin(PL.yaw), fz = -Math.cos(PL.yaw);
  const rx = Math.cos(PL.yaw), rz = Math.sin(PL.yaw);
  list.push({
    x: PL.x + fx * 0.95 - rx * 0.42, z: PL.z + fz * 0.95 - rz * 0.42,
    tile: E3.S.BIT, size: 0.3, base: 0.42 + Math.sin(tick / 320) * 0.05, shade: 1.3
  });
  return list;
}

function renderScene() {
  const th = THEMES3D[Z.i];
  let fog = th.fog.slice(), dist = th.dist, tint = [1, 1, 1];
  if (EV && EV.type === 'humo') { fog = [0.58, 0.60, 0.63]; dist = 2.4; }
  if (glitchT > 0) tint = [1 + Math.random() * 0.5, 0.8 + Math.random() * 0.3, 1 + Math.random() * 0.5];
  if (BS && BS.shakeT > 0) tint = [1.4, 0.7, 0.7];
  const shake = (BS && BS.shakeT > 0) ? (Math.random() - 0.5) * 0.06 : 0;
  E3.render({ x: PL.x, z: PL.z, yaw: PL.yaw + shake }, sceneSprites(), { fogColor: fog, fogDist: dist, tint, bob: PL.bob });
}

/* fondo animado de los menús: paseo lento por la Aldea */
const MENU_CAM = { x: 2.2, z: 9.5, yaw: Math.PI / 2, t: 0 };
function renderMenuBackdrop(dt) {
  MENU_CAM.t += dt;
  MENU_CAM.yaw = Math.PI / 2 + Math.sin(MENU_CAM.t * 0.00022) * 0.5;
  const fx = Math.sin(MENU_CAM.yaw), fz = -Math.cos(MENU_CAM.yaw);
  const rx = Math.cos(MENU_CAM.yaw), rz = Math.sin(MENU_CAM.yaw);
  E3.render(MENU_CAM, [
    { x: 9.5, z: 9.5, tile: E3.S.GUARDIAN, size: 0.82, base: 0.02 },
    { x: 14.5, z: 9.5, tile: E3.S.NPC, size: 0.8, base: 0.02 },
    { x: 17.5, z: 9.5, tile: E3.S.CHEST, size: 0.45 },
    { x: MENU_CAM.x + fx * 0.8 + rx * 0.5, z: MENU_CAM.z + fz * 0.8 + rz * 0.5,
      tile: E3.S.BIT, size: 0.26, base: 0.06 + Math.sin(MENU_CAM.t / 340) * 0.03, shade: 1.3 }
  ], { fogColor: THEMES3D[0].fog, fogDist: 16, tint: [0.92, 0.95, 1.05] });
}
function enterMenu() {
  G.state = 'menu';
  TOAST = null;
  buildMenuBackdrop();
  AUDIO.playMusic('menu');
}
function buildMenuBackdrop() {
  const grid = STORY.zones[0].map.map(r => r.split('').map(c => (c === '#' || c === '~') ? c : '.'));
  E3.buildLevel(grid, { wall: THEMES3D[0].wall, floor: THEMES3D[0].floor, ceil: -1, doorAt: null, doorOpen: false });
}

/* =====================================================================
   DIBUJO POR ESTADO
   ===================================================================== */
function draw(dt) {
  ctx.clearRect(0, 0, W, H);
  switch (G.state) {
    case 'menu': renderMenuBackdrop(dt); drawMenu(); break;
    case 'diff': renderMenuBackdrop(dt); drawDiff(); break;
    case 'levelselect': renderMenuBackdrop(dt); drawLevelSelect(); break;
    case 'codex': renderMenuBackdrop(dt); drawCodex(); break;
    case 'help': renderMenuBackdrop(dt); drawHelp(); break;
    case 'dialog': if (Z) renderScene(); else renderMenuBackdrop(dt); drawHUD(); drawDialog(); break;
    case 'world': renderScene(); drawHUD(); drawPrompt(); break;
    case 'question': renderScene(); drawHUD(); drawQuestion(); break;
    case 'feedback': renderScene(); drawHUD(); drawFeedback(); break;
    case 'boss': renderScene(); drawBossHUD(); break;
    case 'recap': renderMenuBackdrop(dt); drawRecap(); break;
    case 'defeat': E3.clearScene([0.09, 0.03, 0.05]); drawDefeat(); break;
    case 'victory': renderMenuBackdrop(dt); drawVictory(); break;
  }
  if (glitchT > 0) {
    for (let k = 0; k < 7; k++) {
      const gy = Math.random() * H;
      rect(0, gy, W, 3 + Math.random() * 4, ['#7ad7f0', '#e34a4a', '#f2c14e'][k % 3]);
    }
  }
  if (TOAST) drawToast();
}

/* ---------- HUD del mundo ---------- */
function drawHUD() {
  if (!Z) return;
  rect(0, 0, W, 52, 'rgba(8,10,22,0.86)');
  rect(0, 50, W, 2, '#2c2c44');
  for (let k = 0; k < DIFF.hearts; k++) heartIcon(14 + k * 30, 12, 24, k < Z.hearts);
  const zd = STORY.zones[Z.i];
  text('ZONA ' + (Z.i + 1) + ' · ' + zd.name.toUpperCase(), W / 2, 8, 17, '#f2c14e', 'center');
  text(zd.topic, W / 2, 30, 12, '#9aa0b8', 'center');
  text('XP ' + prof.xp, W - 14, 6, 15, '#7ad7f0', 'right');
  text(DIFF.name, W - 14, 26, 12, DIFF.color, 'right');
  const sub = 'Guardianes ' + Z.cleared + '/' + DIFF.needed[Z.i] + ' · Códex ' + prof.codex.length + '/8 · Conf ' + confLetter();
  ctx.font = 'bold 12px "Courier New", monospace';
  const subW = ctx.measureText(sub).width + 20;
  rect(10, 58, subW, 22, 'rgba(8,10,22,0.82)');
  rect(10, 58, 4, 22, '#7ad7f0');
  text(sub, 22, 62, 12, '#c3c8dc');
  drawMinimap();
}

function drawMinimap() {
  const cs = 9, mw = COLS * cs, mh = ROWS * cs, mx = W - mw - 14, my = H - mh - 14;
  rect(mx - 4, my - 4, mw + 8, mh + 8, 'rgba(6,8,18,0.82)');
  ctx.strokeStyle = '#2c2c44'; ctx.lineWidth = 2;
  ctx.strokeRect(mx - 3, my - 3, mw + 6, mh + 6);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!Z.explored.has(x + ',' + y)) continue;
      const c = Z.grid[y][x];
      let col = '#2a3350';
      if (c === '#') col = (Z.door && Z.door.x === x && Z.door.y === y) ? '#6b4a2a' : '#4a4f6b';
      else if (c === '~') col = '#2b4f8b';
      if (Z.door && Z.door.x === x && Z.door.y === y && Z.doorOpen) col = '#f2c14e';
      rect(mx + x * cs, my + y * cs, cs - 1, cs - 1, col);
      const e = entityAt(x, y);
      if (e) {
        const ec = e.kind === 'guardian' ? '#c77df2' : e.kind === 'npc' ? '#7ac74f' : e.kind === 'chest' ? '#e0a63a' : '#e34a4a';
        rect(mx + x * cs + 2, my + y * cs + 2, cs - 5, cs - 5, ec);
      }
    }
  }
  // jugador (triángulo orientado)
  const px = mx + PL.x * cs, py = my + PL.z * cs;
  const fx = Math.sin(PL.yaw), fz = -Math.cos(PL.yaw);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(px + fx * 6, py + fz * 6);
  ctx.lineTo(px - fx * 4 - fz * 4, py - fz * 4 + fx * 4);
  ctx.lineTo(px - fx * 4 + fz * 4, py - fz * 4 - fx * 4);
  ctx.closePath(); ctx.fill();
  text('MAPA', mx, my - 20, 11, '#5c6480');
}

function drawPrompt() {
  const t = lookTarget();
  if (!t) return;
  const label = t.kind === 'guardian' ? '⚔ ESPACIO — responder al GUARDIÁN'
    : t.kind === 'npc' ? '💬 ESPACIO — hablar'
    : t.kind === 'boss' ? (Z.doorOpen ? '☠ ESPACIO — ¡enfrentar a EL HUMO!' : '🔒 Portal sellado')
    : '🔒 Puerta sellada — faltan ' + Math.max(0, DIFF.needed[Z.i] - Z.cleared) + ' guardianes';
  const w = 420;
  rect(W / 2 - w / 2, H - 52, w, 30, 'rgba(8,10,22,0.88)');
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - w / 2 + 1, H - 51, w - 2, 28);
  text(label, W / 2, H - 45, 14, '#fff', 'center');
}

/* ---------- diálogo ---------- */
function drawDialog() {
  if (!DLG) return;
  const pg = DLG.pages[DLG.i];
  panel(20, H - 160, W - 40, 146);
  const col = pg.sp === 'EL HUMO' ? '#c77df2' : pg.sp === 'BIT' ? '#7ad7f0' : '#f2c14e';
  if (pg.sp === 'BIT') sprIcon(E3.S.BIT, 28, H - 150, 46);
  else if (pg.sp === 'EL HUMO') sprIcon(E3.S.HUMO, 28, H - 150, 46);
  else sprIcon(E3.S.FACILITADOR, 28, H - 150, 46);
  text(pg.sp, 84, H - 148, 16, col);
  wrap(pg.t, 62).slice(0, 4).forEach((ln, k) => text(ln, 84, H - 122 + k * 22, 15, '#fff'));
  if (tick % 900 < 550) text('▼ ESPACIO', W - 40, H - 40, 13, '#9aa0b8', 'right');
  clickable(20, H - 160, W - 40, 146, advanceDialog);
}

/* ---------- pregunta ---------- */
function drawQuestion() {
  const qLines = wrap(QS.item.q, 62);
  const timerH = QS.timeMax > 0 ? 26 : 0;
  const oh = 44;
  const ph = Math.min(H - 96, 46 + timerH + qLines.length * 22 + 14 + QS.opts.length * (oh + 8) + 30);
  const py = H - ph - 14;
  panel(24, py, W - 48, ph, 'rgba(8,10,26,0.95)', QS.expert ? '#e34a4a' : '#e8e8f0');
  sprIcon(E3.S.GUARDIAN, 34, py + 6, 46);
  text(QS.expert ? 'GUARDIÁN EXPERTO ★' : 'GUARDIÁN DEL CONOCIMIENTO', W / 2, py + 12, 14, QS.expert ? '#e34a4a' : '#c77df2', 'center');

  if (QS.timeMax > 0) {
    const bw = W - 300, frac = Math.max(0, QS.time / QS.timeMax);
    rect(150, py + 34, bw, 12, '#22243c');
    rect(150, py + 34, bw * frac, 12, frac > 0.5 ? '#7ac74f' : frac > 0.25 ? '#f2c14e' : '#e34a4a');
    text(Math.ceil(Math.max(0, QS.time)) + 's', W - 130, py + 32, 14, frac > 0.25 ? '#fff' : '#e34a4a');
  }
  const qy = py + 46 + timerH;
  qLines.forEach((ln, k) => text(ln, 44, qy + k * 22, 16, '#f2c14e'));
  const oy = qy + qLines.length * 22 + 14;
  QS.opts.forEach((o, k) => {
    const yy = oy + k * (oh + 8), sel = k === QS.sel;
    rect(38, yy, W - 76, oh, sel ? '#2c3a6e' : '#171a30');
    if (sel) { ctx.strokeStyle = '#7ad7f0'; ctx.lineWidth = 2; ctx.strokeRect(39, yy + 1, W - 78, oh - 2); }
    rect(38, yy, 6, oh, sel ? '#7ad7f0' : '#2c2c44');
    const lines = wrap((k + 1) + ') ' + o.t, 64);
    if (lines.length === 1) text(lines[0], 56, yy + oh / 2 - 8, 14, sel ? '#fff' : '#c3c8dc');
    else lines.slice(0, 2).forEach((ln, j) => text(ln, 56, yy + 6 + j * 18, 13, sel ? '#fff' : '#c3c8dc'));
    clickable(38, yy, W - 76, oh, () => { QS.sel = k; answerQuestion(false); });
  });
  text('↑↓ elegir · ESPACIO confirmar · 1-' + QS.opts.length + ' respuesta directa', W / 2, H - 28, 12, '#9aa0b8', 'center');
}

/* ---------- feedback ---------- */
function drawFeedback() {
  if (!FB) return;
  const bh = 220;
  panel(60, (H - bh) / 2, W - 120, bh, 'rgba(8,10,26,0.96)', FB.correct ? '#7ac74f' : '#e34a4a');
  const y0 = (H - bh) / 2;
  text(FB.head, W / 2, y0 + 22, 20, FB.correct ? '#7ac74f' : '#e34a4a', 'center');
  wrap(FB.body, 56).slice(0, 6).forEach((ln, k) => text(ln, 88, y0 + 62 + k * 22, 14, '#fff'));
  if (tick % 900 < 550) text('▼ ESPACIO para continuar', W / 2, y0 + bh - 32, 13, '#9aa0b8', 'center');
  clickable(60, y0, W - 120, bh, closeFeedback);
}

/* ---------- jefe ---------- */
function drawBossHUD() {
  rect(0, 0, W, 62, 'rgba(8,6,18,0.86)');
  text('EL HUMO', W / 2, 6, 20, '#c77df2', 'center');
  const bw = 360;
  rect(W / 2 - bw / 2, 34, bw, 16, '#2a2140');
  for (let k = 0; k < BS.maxhp; k++) {
    const seg = bw / BS.maxhp;
    if (k < BS.hp) rect(W / 2 - bw / 2 + k * seg + 2, 36, seg - 4, 12, '#c77df2');
  }
  for (let k = 0; k < DIFF.hearts; k++) heartIcon(14 + k * 30, 14, 24, k < Z.hearts);
  text('XP ' + prof.xp, W - 14, 8, 15, '#7ad7f0', 'right');
  text(DIFF.name, W - 14, 28, 12, DIFF.color, 'right');

  const ph = 210;
  panel(24, H - ph - 14, W - 48, ph, 'rgba(8,6,22,0.95)', '#c77df2');
  const y0 = H - ph - 14;
  text('¿VERDAD o HUMO?', W / 2, y0 + 14, 15, '#f2c14e', 'center');
  if (BS.timeMax > 0) {
    const frac = Math.max(0, BS.time / BS.timeMax), tw = W - 200;
    rect(100, y0 + 38, tw, 10, '#22243c');
    rect(100, y0 + 38, tw * frac, 10, frac > 0.5 ? '#7ac74f' : frac > 0.25 ? '#f2c14e' : '#e34a4a');
  }
  wrap(BS.item.s, 58).forEach((ln, k) => text(ln, 48, y0 + (BS.timeMax > 0 ? 60 : 46) + k * 22, 15, '#fff'));
  const labels = ['1) Es VERDAD', '2) Es HUMO'];
  labels.forEach((lb, k) => {
    const bwid = (W - 120) / 2, xx = 48 + k * (bwid + 24), yy = y0 + ph - 62, hh = 44;
    const sel = BS.sel === k;
    rect(xx, yy, bwid, hh, sel ? (k === 0 ? '#1d4a2a' : '#4a1d38') : '#171a30');
    ctx.strokeStyle = sel ? '#fff' : '#2c2c44'; ctx.lineWidth = 2;
    ctx.strokeRect(xx + 1, yy + 1, bwid - 2, hh - 2);
    text(lb, xx + bwid / 2, yy + 13, 16, sel ? '#fff' : '#8a8aa8', 'center');
    clickable(xx, yy, bwid, hh, () => { BS.sel = k; answerBoss(false); });
  });
}

/* ---------- menú principal ---------- */
function drawMenu() {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(6,8,20,0.78)');
  grd.addColorStop(0.5, 'rgba(6,8,20,0.18)');
  grd.addColorStop(1, 'rgba(6,8,20,0.78)');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  text('LA SENDA DEL', W / 2 + 3, 39, 38, '#2b1f4a', 'center');
  text('LA SENDA DEL', W / 2, 36, 38, '#f2c14e', 'center');
  text('DIRECTOR', W / 2 + 4, 81, 52, '#2b1f4a', 'center');
  text('DIRECTOR', W / 2, 77, 52, '#7ad7f0', 'center');
  rect(W / 2 - 90, 134, 180, 26, '#c77df2');
  text('EDICIÓN 3D', W / 2, 138, 17, '#14121f', 'center');
  text('Claude Code desde cero · dungeon crawler de conocimiento', W / 2, 170, 13, '#b9c0d8', 'center');

  const items = menuItems();
  rect(W / 2 - 224, 196, 448, items.length * 34 + 16, 'rgba(8,10,24,0.78)');
  ctx.strokeStyle = '#2c2c44'; ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - 223, 197, 446, items.length * 34 + 14);
  items.forEach((it, k) => {
    const yy = 208 + k * 34, sel = k === menuIdx;
    if (sel) { rect(W / 2 - 210, yy - 5, 420, 30, '#1d2140'); rect(W / 2 - 210, yy - 5, 5, 30, '#7ad7f0'); }
    const col = it.id === 'diff' ? DIFF.color : (sel ? '#fff' : '#98a0bc');
    text((sel ? '▶ ' : '  ') + it.label, W / 2, yy, 16, col, 'center');
    clickable(W / 2 - 210, yy - 5, 420, 30, () => { menuIdx = k; menuSelect(it.id); });
  });
  text('↑↓ elegir · ESPACIO confirmar · M sonido', W / 2, H - 44, 12, '#5c6480', 'center');
  text('Basado en el guion "Claude Code sin ser programador" · Neuropista', W / 2, H - 26, 12, '#5c6480', 'center');
}

/* ---------- selección de dificultad ---------- */
function drawDiff() {
  rect(0, 0, W, H, 'rgba(6,8,20,0.78)');
  text('ELIGE EL NIVEL DE DIFICULTAD', W / 2, 26, 24, '#f2c14e', 'center');
  text('Cambia cuántas preguntas, cuánto tiempo y cuántas oportunidades tienes', W / 2, 58, 13, '#9aa0b8', 'center');
  DIFFS.forEach((d, k) => {
    const cw = 232, cx = 40 + k * (cw + 24), cy = 86, ch = 322;
    const sel = k === diffIdx;
    rect(cx, cy, cw, ch, sel ? '#1c2240' : '#12141f');
    ctx.strokeStyle = sel ? d.color : '#2c2c44'; ctx.lineWidth = sel ? 4 : 2;
    ctx.strokeRect(cx + 2, cy + 2, cw - 4, ch - 4);
    rect(cx, cy, cw, 8, d.color);
    text(d.name, cx + cw / 2, cy + 26, 22, d.color, 'center');
    text(d.tag, cx + cw / 2, cy + 54, 12, '#9aa0b8', 'center');
    for (let i = 0; i < 5; i++) heartIcon(cx + cw / 2 - 62 + i * 26, cy + 80, 20, i < d.hearts);
    d.bullets.forEach((b, j) => {
      wrap('• ' + b, 26).forEach((ln, m) => text(ln, cx + 16, cy + 116 + j * 36 + m * 16, 12, '#d5dbec'));
    });
    rect(cx + 12, cy + ch - 40, cw - 24, 2, '#2c2c44');
    text('XP ×' + d.mult, cx + cw / 2, cy + ch - 30, 15, d.color, 'center');
    if (prof.diff === d.id) text('◀ actual', cx + cw - 16, cy + 12, 11, '#7ac74f', 'right');
    clickable(cx, cy, cw, ch, () => { diffIdx = k; applyDifficulty(); });
  });
  text('←→ elegir · ESPACIO confirmar · 1-3 directo · ESC volver', W / 2, H - 60, 13, '#9aa0b8', 'center');
  const nxt = G.pending === 'new' ? 'Empezarás la aventura completa' : G.pending === 'level' ? 'Entrarás a: ' + STORY.zones[G.pendingLevel].name : 'Se aplicará a tus próximas partidas';
  text(nxt, W / 2, H - 36, 13, '#f2c14e', 'center');
}

/* ---------- selección de nivel ---------- */
function drawLevelSelect() {
  rect(0, 0, W, H, 'rgba(6,8,20,0.8)');
  text('ELIGE LA PARTE DEL CAMINO A REPASAR', W / 2, 18, 22, '#f2c14e', 'center');
  text('Dificultad actual: ' + DIFF.name + ' · podrás cambiarla al entrar · ESC volver', W / 2, 48, 12, '#9aa0b8', 'center');
  for (let k = 0; k < 6; k++) {
    const cw = 240, chh = 176, cx = 26 + (k % 3) * (cw + 21), cy = 76 + Math.floor(k / 3) * (chh + 18);
    const sel = k === lvlIdx;
    rect(cx, cy, cw, chh, sel ? '#1e2547' : '#12162a');
    ctx.strokeStyle = sel ? '#7ad7f0' : '#2c2c44'; ctx.lineWidth = sel ? 3 : 2;
    ctx.strokeRect(cx + 1, cy + 1, cw - 2, chh - 2);
    text('ZONA ' + (k + 1), cx + 14, cy + 12, 12, '#c77df2');
    wrap(STORY.zones[k].name, 20).forEach((ln, j) => text(ln, cx + 14, cy + 32 + j * 19, 16, '#fff'));
    wrap(STORY.zones[k].topic, 30).forEach((ln, j) => text(ln, cx + 14, cy + 78 + j * 16, 12, '#9aa0b8'));
    if (k === 5) text('☠ JEFE FINAL: EL HUMO', cx + 14, cy + 128, 12, '#e34a4a');
    text(prof.done[k] ? '✔ superada' : '— pendiente', cx + 14, cy + 148, 12, prof.done[k] ? '#7ac74f' : '#5c6480');
    const best = prof.best[k + ':' + DIFF.id];
    if (best !== undefined) text(best === 0 ? '★ impecable' : '♥ -' + best, cx + cw - 14, cy + 148, 12, best === 0 ? '#f2c14e' : '#8f96b0', 'right');
    clickable(cx, cy, cw, chh, () => { lvlIdx = k; G.mode = 'level'; G.pending = 'level'; G.pendingLevel = k; diffIdx = DIFFS.indexOf(DIFF); G.state = 'diff'; AUDIO.sfx.confirm(); });
  }
}

/* ---------- códex ---------- */
function drawCodex() {
  rect(0, 0, W, H, 'rgba(6,8,20,0.86)');
  text('CÓDEX DE PROMPTS LEGENDARIOS', W / 2, 16, 22, '#f2c14e', 'center');
  text('Encuéntralos en los cofres del camino · ESPACIO/ESC volver', W / 2, 46, 12, '#9aa0b8', 'center');
  CODEX_PROMPTS.forEach((p, k) => {
    const owned = prof.codex.indexOf(p.id) >= 0, sel = k === cdxIdx, yy = 80 + k * 30;
    if (sel) { rect(20, yy - 5, 300, 28, '#1d2140'); rect(20, yy - 5, 4, 28, '#7ad7f0'); }
    text((owned ? '📜 ' : '🔒 ') + (owned ? p.title : '? ? ?'), 34, yy, 15, sel ? '#fff' : owned ? '#c3c8dc' : '#555c78');
    clickable(20, yy - 5, 300, 28, () => { cdxIdx = k; });
  });
  const p = CODEX_PROMPTS[cdxIdx];
  panel(336, 76, W - 366, 330);
  if (prof.codex.indexOf(p.id) >= 0) {
    text(p.title, 356, 92, 17, '#f2c14e');
    wrap(p.text, 40).forEach((ln, k) => text(ln, 356, 124 + k * 21, 13, '#fff'));
    text('Cópialo y adapta los [corchetes] en la pestaña Code', 356, 380, 11, '#7ad7f0');
  } else {
    text('Aún no has encontrado este prompt.', 356, 130, 14, '#8a90ac');
    text('Busca los cofres brillantes en las zonas.', 356, 156, 14, '#8a90ac');
  }
  const got = prof.ach.length;
  text('Logros: ' + got + '/' + ACH_ALL.length, W / 2, H - 44, 13, '#c77df2', 'center');
  const last = ACH_ALL.filter(a => hasAch(a.id)).slice(-3).map(a => a.name).join(' · ');
  if (last) text(last, W / 2, H - 26, 12, '#8f96b0', 'center');
}

/* ---------- instrucciones ---------- */
function drawHelp() {
  rect(0, 0, W, H, 'rgba(6,8,20,0.9)');
  text('INSTRUCCIONES', W / 2, 16, 24, '#f2c14e', 'center');
  const lines = [
    ['MOVERTE', '↑ avanzar · ↓ retroceder · ←→ girar · A/D lateral (paso a paso, como los 90)'],
    ['RESPONDER', 'Ponte frente a un guardián morado y pulsa ESPACIO'],
    ['DIFICULTAD', 'APRENDIZ (5♥, 3 opciones, sin tiempo) · PROFESIONAL (3♥, 30 s) · DIRECTOR (2♥, 15 s, preguntas expertas)'],
    ['ACIERTO', '+XP (×1, ×2 o ×3 según dificultad), avanza la historia y sube tu confianza A→E'],
    ['ERROR', 'Pierdes un corazón y algo INUSUAL sucede:'],
    ['', '· El Humo llena la zona de niebla y no ves más allá de tu nariz'],
    ['', '· La carpeta caótica suelta archivos que te persiguen por el laberinto'],
    ['', '· Un glitch te teletransporta y te desorienta'],
    ['SIN CORAZONES', 'La zona se reinicia desde el principio. ¡Como en los 90!'],
    ['COFRES', 'Contienen PROMPTS LEGENDARIOS reales para tu códex'],
    ['ZONA 6', 'Jefe final EL HUMO: clasifica sus afirmaciones como VERDAD o HUMO'],
    ['OTROS', 'M sonido · ESC volver al menú (tu avance se guarda) · el MAPA está abajo a la derecha']
  ];
  lines.forEach((pair, k) => {
    const y = 62 + k * 34;
    if (pair[0]) text(pair[0], 40, y, 14, '#7ad7f0');
    wrap(pair[1], 66).forEach((ln, j) => text(ln, 190, y + j * 17, 13, '#dfe3f0'));
  });
  text('▼ ESPACIO para volver', W / 2, H - 30, 14, '#9aa0b8', 'center');
}

/* ---------- resumen de zona ---------- */
function drawRecap() {
  rect(0, 0, W, H, 'rgba(8,14,28,0.92)');
  const zd = STORY.zones[RC.zone];
  text('¡ZONA SUPERADA!', W / 2, 46, 32, '#7ac74f', 'center');
  text(zd.name, W / 2, 92, 20, '#f2c14e', 'center');
  if (zd.complete) wrap(zd.complete, 58).forEach((ln, k) => text(ln, W / 2, 128 + k * 22, 15, '#fff', 'center'));
  text('+' + (25 * DIFF.mult) + ' XP · Dificultad ' + DIFF.name + ' · Confianza: ' + confLetter(), W / 2, 214, 16, '#7ad7f0', 'center');
  text(RC.lost === 0 ? '★ ¡Sin perder corazones! Impecable.' : 'Corazones perdidos: ' + RC.lost,
       W / 2, 244, 15, RC.lost === 0 ? '#f2c14e' : '#9aa0b8', 'center');
  RC.newAch.forEach((id, k) => {
    const a = ACH_ALL.find(x => x.id === id);
    if (a) text('🏆 LOGRO: ' + a.name + ' — ' + a.desc, W / 2, 282 + k * 24, 13, '#f2c14e', 'center');
  });
  const nextLabel = (G.mode === 'adventure' && RC.zone < 5) ? 'Siguiente: ' + STORY.zones[RC.zone + 1].name : 'Volver';
  if (tick % 900 < 550) text('▼ ESPACIO — ' + nextLabel, W / 2, H - 50, 15, '#9aa0b8', 'center');
  clickable(0, 0, W, H, advanceRecap);
}

/* ---------- derrota ---------- */
function drawDefeat() {
  rect(0, 0, W, H, 'rgba(24,10,14,0.93)');
  sprIcon(E3.S.FILE, W / 2 - 60, 40, 120);
  text('HAS PERDIDO TUS OPORTUNIDADES', W / 2, 176, 26, '#e34a4a', 'center');
  wrap(DEFEAT.text, 56).forEach((ln, k) => text(ln, W / 2, 222 + k * 24, 15, '#fff', 'center'));
  text(DEFEAT.from === 'boss' ? 'El combate contra EL HUMO se reinicia.' : 'La zona se reinicia desde el principio.',
       W / 2, 322, 15, '#f2c14e', 'center');
  text('Consejo: en ' + DIFF.name + ' tienes ' + DIFF.hearts + ' corazones. Puedes bajar la dificultad desde el menú (ESC).',
       W / 2, 356, 12, '#9aa0b8', 'center');
  if (tick % 900 < 550) text('▼ ESPACIO para reintentar', W / 2, H - 56, 16, '#9aa0b8', 'center');
  clickable(0, 0, W, H, retryDefeat);
}

/* ---------- victoria ---------- */
function drawVictory() {
  rect(0, 0, W, H, 'rgba(10,16,34,0.9)');
  for (const c of VIC.confetti) rect(c.x, c.y, c.s, c.s, c.c);
  const pw = W - 180, ph = 320, px = 90, py = 34;
  rect(px, py, pw, ph, '#f6f1dc');
  ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 5;
  ctx.strokeRect(px + 10, py + 10, pw - 20, ph - 20);
  text('DIPLOMA', W / 2, py + 26, 32, '#8a6d1a', 'center');
  text('DIRECTOR/A DE PRACTICANTES DIGITALES', W / 2, py + 70, 16, '#333', 'center');
  rect(W / 2 - 110, py + 96, 220, 26, DIFF.color);
  text('DIFICULTAD ' + DIFF.name, W / 2, py + 100, 15, '#14121f', 'center');
  STORY.victory.forEach((ln, k) => text(ln, W / 2, py + 140 + k * 22, 15, '#222', 'center'));
  text('XP total: ' + prof.xp + ' · Prompts: ' + prof.codex.length + '/8 · Logros: ' + prof.ach.length + '/' + ACH_ALL.length,
       W / 2, py + 240, 13, '#8a6d1a', 'center');
  text('El Humo se ha disipado del Reino Digital', W / 2, py + 268, 13, '#555', 'center');
  VIC.newAch.forEach((id, k) => {
    const a = ACH_ALL.find(x => x.id === id);
    if (a) text('🏆 ' + a.name, W / 2, py + ph + 16 + k * 22, 15, '#f2c14e', 'center');
  });
  if (tick % 900 < 550) text('▼ ESPACIO — volver al menú', W / 2, H - 30, 15, '#9aa0b8', 'center');
  clickable(0, 0, W, H, () => { VIC = null; BS = null; enterMenu(); });
}

/* ---------- aviso flotante ---------- */
function drawToast() {
  const lines = wrap(TOAST.text, 62), hh = 18 + lines.length * 20, w = 620;
  rect(W / 2 - w / 2, 66, w, hh, 'rgba(16,14,36,0.95)');
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - w / 2 + 1, 67, w - 2, hh - 2);
  lines.forEach((ln, k) => text(ln, W / 2, 75 + k * 20, 14, '#fff', 'center'));
}

/* =====================================================================
   BUCLE PRINCIPAL
   ===================================================================== */
let last = 0;
function loop(now) {
  const dt = Math.min(60, now - last || 16);
  last = now;
  update(dt);
  draw(dt);
  processClicks();
  for (const k in pressed) pressed[k] = false;
  requestAnimationFrame(loop);
}
buildMenuBackdrop();
AUDIO.playMusic('menu');
requestAnimationFrame(loop);
