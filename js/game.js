'use strict';
/* =====================================================================
   La Senda del Director — lógica del juego
   Estados: menu, levelselect, codex, help, dialog, map, question,
            feedback, recap, defeat, boss, victory
   ===================================================================== */

const TILE = 32, COLS = 20, ROWS = 11, MAPY = 40;
const W = 640, H = 392;
const E = Engine, ctx = E.ctx;
const SAVE_KEY = 'senda_director_save';

let tick = 0;
let shake = 0;

/* ---------------- Perfil persistente ---------------- */
let prof = loadProfile();

function defaultProfile() {
  return { unlocked: 0, done: [false, false, false, false, false, false], xp: 0, codex: [], ach: [] };
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
function confLetter() {
  const n = prof.done.filter(Boolean).length;
  return 'ABCDE'[Math.min(n, 4)];
}
function hasAch(id) { return prof.ach.includes(id); }
function grantAch(id, list) {
  if (!hasAch(id)) { prof.ach.push(id); if (list) list.push(id); }
}

/* ---------------- Estado global ---------------- */
const G = { state: 'menu', mode: 'adventure', lastEv: '' };

let Z = null;           // zona en curso
const P = { x: 0, y: 0, trail: [] };
let DLG = null;         // {pages, i, onDone}
let QS = null;          // pregunta activa
let FB = null;          // feedback
let EV = null;          // evento inusual
let RC = null;          // recap
let BS = null;          // jefe
let TOAST = null;       // {text, t}
let DEFEAT = null;      // {text, from}
let VIC = null;         // {confetti, newAch}
let menuIdx = 0, lvlIdx = 0, cdxIdx = 0;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function toast(t, frames) { TOAST = { text: t, t: frames || 160 }; }

/* ---------------- Zona: carga y reinicio ---------------- */
function parseZone(i) {
  const zd = STORY.zones[i];
  const grid = [];
  const z = {
    i, grid, guardians: [], chests: [], npcs: [], door: null, bossGate: null,
    start: { tx: 1, ty: 1 }, cleared: 0, heartsLost: 0, hearts: 3,
    queue: shuffle(QUESTIONS[i].map((_, k) => k)), qpos: 0, doorOpen: false
  };
  for (let y = 0; y < ROWS; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) {
      const c = zd.map[y][x];
      switch (c) {
        case 'P': z.start = { tx: x, ty: y }; row.push('.'); break;
        case 'G': z.guardians.push({ tx: x, ty: y, cleared: false }); row.push('.'); break;
        case 'C': z.chests.push({ tx: x, ty: y, opened: false }); row.push('.'); break;
        case 'N': z.npcs.push({ tx: x, ty: y, li: 0 }); row.push('.'); break;
        case 'D': z.door = { tx: x, ty: y }; row.push('.'); break;
        case 'B': z.bossGate = { tx: x, ty: y }; row.push('.'); break;
        default: row.push(c);
      }
    }
    grid.push(row);
  }
  return z;
}

function startZone(i, mode, skipIntro) {
  G.mode = mode || G.mode;
  BS = null;
  Z = parseZone(i);
  P.x = Z.start.tx * TILE + 6;
  P.y = Z.start.ty * TILE + 2;
  P.trail = [];
  EV = null; TOAST = null;
  E.playMusic(i === 2 || i === 5 ? 'cave' : 'field');
  const intro = STORY.zones[i].intro;
  if (skipIntro || !intro.length) G.state = 'map';
  else showDialog(intro, () => { G.state = 'map'; });
}

function restartZone() {
  const i = Z.i;
  Z = parseZone(i);
  P.x = Z.start.tx * TILE + 6;
  P.y = Z.start.ty * TILE + 2;
  P.trail = [];
  EV = null;
  toast('Zona reiniciada. ¡Esta vez sí!');
  G.state = 'map';
  E.playMusic(i === 2 || i === 5 ? 'cave' : 'field');
}

function showDialog(pages, onDone) {
  DLG = { pages, i: 0, onDone };
  G.state = 'dialog';
}

/* ---------------- Preguntas ---------------- */
function nextQuestionItem() {
  const bank = QUESTIONS[Z.i];
  if (Z.qpos >= Z.queue.length) { Z.queue = shuffle(bank.map((_, k) => k)); Z.qpos = 0; }
  return bank[Z.queue[Z.qpos++]];
}

function askQuestion(guardian) {
  const item = nextQuestionItem();
  const opts = shuffle(item.o.map((t, k) => ({ t, ok: k === item.a })));
  QS = { item, opts, sel: 0, guardian };
  G.state = 'question';
  E.sfx.confirm();
}

function answerQuestion() {
  const ok = QS.opts[QS.sel].ok;
  const correctText = QS.opts.find(o => o.ok).t;
  if (ok) {
    QS.guardian.cleared = true;
    Z.cleared++;
    prof.xp += 10;
    E.sfx.correct();
    const opened = Z.cleared >= STORY.needed[Z.i] && !Z.doorOpen;
    FB = {
      correct: true, head: '¡CORRECTO!  +10 XP', body: QS.item.e,
      onDone: () => {
        if (opened) {
          Z.doorOpen = true;
          E.sfx.door();
          toast(Z.bossGate ? '¡El portal del JEFE se ha abierto!' : '¡La puerta de la zona se ha abierto!', 220);
        }
        G.state = 'map';
      }
    };
  } else {
    Z.hearts--;
    Z.heartsLost++;
    E.sfx.wrong();
    FB = {
      correct: false,
      head: 'INCORRECTO  −1 ♥',
      body: 'La respuesta era: "' + correctText + '". ' + QS.item.e,
      onDone: () => {
        if (Z.hearts <= 0) triggerDefeat('map');
        else { triggerEvent(); G.state = 'map'; }
      }
    };
  }
  G.state = 'feedback';
  QS = null;
}

/* ---------------- Eventos inusuales ---------------- */
function randomFloorTile(minDist) {
  for (let tries = 0; tries < 200; tries++) {
    const tx = 1 + Math.floor(Math.random() * (COLS - 2));
    const ty = 1 + Math.floor(Math.random() * (ROWS - 2));
    if (Z.grid[ty][tx] !== '.') continue;
    if (entityAt(tx, ty)) continue;
    const d = Math.abs(tx - Math.floor(P.x / TILE)) + Math.abs(ty - Math.floor(P.y / TILE));
    if (d < (minDist || 0)) continue;
    return { tx, ty };
  }
  return { tx: Z.start.tx, ty: Z.start.ty };
}
function entityAt(tx, ty) {
  return Z.guardians.some(g => !g.cleared && g.tx === tx && g.ty === ty) ||
         Z.chests.some(c => c.tx === tx && c.ty === ty) ||
         Z.npcs.some(n => n.tx === tx && n.ty === ty) ||
         (Z.door && Z.door.tx === tx && Z.door.ty === ty) ||
         (Z.bossGate && Z.bossGate.tx === tx && Z.bossGate.ty === ty);
}

function triggerEvent() {
  const types = ['humo', 'archivos', 'glitch'].filter(t => t !== G.lastEv);
  const type = types[Math.floor(Math.random() * types.length)];
  G.lastEv = type;
  toast(STORY.events[type], 200);
  if (type === 'humo') {
    const blobs = [];
    for (let k = 0; k < 14; k++) {
      blobs.push({ x: Math.random() * W, y: MAPY + Math.random() * (H - MAPY), r: 26 + Math.random() * 34, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 0.7 });
    }
    EV = { type, t: 460, blobs };
  } else if (type === 'archivos') {
    const files = [];
    for (let k = 0; k < 3; k++) {
      const p = randomFloorTile(5);
      files.push({ x: p.tx * TILE + 8, y: p.ty * TILE + 8, ph: Math.random() * 6 });
    }
    EV = { type, t: 540, files };
  } else {
    const p = randomFloorTile(6);
    P.x = p.tx * TILE + 6;
    P.y = p.ty * TILE + 2;
    shake = 20;
    E.sfx.hurt();
    EV = { type, t: 80 };
  }
}

function triggerDefeat(from) {
  DEFEAT = { text: STORY.defeats[Math.floor(Math.random() * STORY.defeats.length)], from };
  G.state = 'defeat';
  E.stopMusic();
  E.sfx.defeat();
}

/* ---------------- Cofres y logros ---------------- */
function openChest(chest) {
  chest.opened = true;
  E.sfx.chest();
  const next = CODEX_PROMPTS.find(p => !prof.codex.includes(p.id));
  if (next) {
    prof.codex.push(next.id);
    toast('¡PROMPT LEGENDARIO: "' + next.title + '"! Guardado en tu códex.', 240);
  } else {
    prof.xp += 15;
    toast('El cofre brilla: +15 XP (ya tienes todos los prompts).', 200);
  }
  saveProfile();
}

function completeZone() {
  const i = Z.i;
  const newAch = [];
  prof.xp += 25;
  prof.done[i] = true;
  prof.unlocked = Math.max(prof.unlocked, i + 1);
  if (i === 0) grantAch('primer_paso', newAch);
  if (i === 2 && Z.heartsLost === 0) grantAch('regla_de_oro', newAch);
  if (i === 4 && Z.heartsLost === 0) grantAch('semaforo_interior', newAch);
  if (prof.codex.length >= CODEX_PROMPTS.length) grantAch('coleccionista', newAch);
  saveProfile();
  E.sfx.fanfare();
  RC = { zone: i, newAch, lost: Z.heartsLost };
  G.state = 'recap';
  E.stopMusic();
}

/* ---------------- Jefe final ---------------- */
function startBoss() {
  BS = {
    hp: 6, maxhp: 6,
    queue: shuffle(BOSS_ITEMS), idx: 0,
    item: null, sel: 0, anim: 0
  };
  Z.hearts = 3;
  nextBossItem();
  G.state = 'boss';
  E.playMusic('boss');
}
function nextBossItem() {
  if (BS.idx >= BS.queue.length) { BS.queue = shuffle(BOSS_ITEMS); BS.idx = 0; }
  BS.item = BS.queue[BS.idx++];
  BS.sel = 0;
}
function answerBoss() {
  const saidHumo = BS.sel === 1;
  const ok = saidHumo === BS.item.humo;
  if (ok) {
    BS.hp--;
    BS.anim = 26;
    E.sfx.bosshit();
    prof.xp += 15;
    FB = {
      correct: true, head: '¡GOLPE AL HUMO!  +15 XP', body: BS.item.e,
      onDone: () => {
        if (BS.hp <= 0) bossDefeated();
        else { nextBossItem(); G.state = 'boss'; }
      }
    };
  } else {
    Z.hearts--;
    E.sfx.wrong();
    const taunt = STORY.boss.taunts[Math.floor(Math.random() * STORY.boss.taunts.length)];
    FB = {
      correct: false, head: 'EL HUMO TE ENVUELVE  −1 ♥', body: BS.item.e + '  ...El Humo susurra: "' + taunt + '"',
      onDone: () => {
        if (Z.hearts <= 0) triggerDefeat('boss');
        else { nextBossItem(); G.state = 'boss'; }
      }
    };
  }
  G.state = 'feedback';
}
function bossDefeated() {
  const newAch = [];
  grantAch('detector_de_humo', newAch);
  prof.done[5] = true;
  prof.unlocked = 6;
  prof.xp += 50;
  if (G.mode === 'adventure' || prof.done.every(Boolean)) grantAch('director', newAch);
  if (prof.codex.length >= CODEX_PROMPTS.length) grantAch('coleccionista', newAch);
  saveProfile();
  showDialog(STORY.boss.win, () => {
    VIC = { newAch, confetti: [] };
    for (let k = 0; k < 90; k++) {
      VIC.confetti.push({ x: Math.random() * W, y: -Math.random() * H, v: 1 + Math.random() * 2.4, c: ['#e34a4a', '#f2c14e', '#7ad7f0', '#7ac74f', '#c77df2'][k % 5], s: 3 + Math.random() * 4 });
    }
    G.state = 'victory';
    E.playMusic('win');
  });
}

/* ---------------- Menú ---------------- */
function menuItems() {
  const items = [{ id: 'new', label: 'NUEVA AVENTURA' }];
  if (prof.unlocked > 0 && prof.unlocked < 6) {
    items.push({ id: 'continue', label: 'CONTINUAR — ' + STORY.zones[prof.unlocked].name.toUpperCase() });
  }
  items.push({ id: 'levels', label: 'ELEGIR NIVEL (REPASO)' });
  items.push({ id: 'codex', label: 'CÓDEX DE PROMPTS (' + prof.codex.length + '/' + CODEX_PROMPTS.length + ')' });
  items.push({ id: 'help', label: 'INSTRUCCIONES' });
  return items;
}
function menuSelect(id) {
  E.sfx.confirm();
  TOAST = null;
  if (id === 'new') {
    G.mode = 'adventure';
    showDialog(STORY.opening, () => startZone(0, 'adventure'));
  } else if (id === 'continue') {
    startZone(prof.unlocked, 'adventure');
  } else if (id === 'levels') {
    lvlIdx = 0; G.state = 'levelselect';
  } else if (id === 'codex') {
    cdxIdx = 0; G.state = 'codex';
  } else if (id === 'help') {
    G.state = 'help';
  }
}

/* =====================================================================
   ACTUALIZACIÓN
   ===================================================================== */
function update() {
  tick++;
  if (shake > 0) shake--;
  if (TOAST && --TOAST.t <= 0) TOAST = null;
  if (E.consume('m')) { const on = E.toggleSound(); toast(on ? 'Sonido: ON' : 'Sonido: OFF', 90); }

  switch (G.state) {
    case 'menu': updateMenu(); break;
    case 'levelselect': updateLevelSelect(); break;
    case 'codex': updateCodex(); break;
    case 'help': if (E.anyOf(' ', 'Enter', 'Escape')) G.state = 'menu'; break;
    case 'dialog': updateDialog(); break;
    case 'map': updateMap(); break;
    case 'question': updateQuestion(); break;
    case 'feedback': if (E.anyOf(' ', 'Enter')) { const f = FB; FB = null; f.onDone(); } break;
    case 'recap': updateRecap(); break;
    case 'defeat': updateDefeat(); break;
    case 'boss': updateBoss(); break;
    case 'victory': updateVictory(); break;
  }
}

function updateMenu() {
  const items = menuItems();
  if (E.anyOf('ArrowUp', 'w')) { menuIdx = (menuIdx + items.length - 1) % items.length; E.sfx.move(); }
  if (E.anyOf('ArrowDown', 's')) { menuIdx = (menuIdx + 1) % items.length; E.sfx.move(); }
  if (menuIdx >= items.length) menuIdx = 0;
  if (E.anyOf(' ', 'Enter')) menuSelect(items[menuIdx].id);
}

function updateLevelSelect() {
  if (E.anyOf('ArrowLeft', 'a')) { lvlIdx = (lvlIdx + 5) % 6; E.sfx.move(); }
  if (E.anyOf('ArrowRight', 'd')) { lvlIdx = (lvlIdx + 1) % 6; E.sfx.move(); }
  if (E.anyOf('ArrowUp', 'w', 'ArrowDown', 's')) { lvlIdx = (lvlIdx + 3) % 6; E.sfx.move(); }
  if (E.consume('Escape')) { G.state = 'menu'; return; }
  if (E.anyOf(' ', 'Enter')) { E.sfx.confirm(); startZone(lvlIdx, 'level'); }
}

function updateCodex() {
  if (E.anyOf('ArrowUp', 'w')) { cdxIdx = (cdxIdx + CODEX_PROMPTS.length - 1) % CODEX_PROMPTS.length; E.sfx.move(); }
  if (E.anyOf('ArrowDown', 's')) { cdxIdx = (cdxIdx + 1) % CODEX_PROMPTS.length; E.sfx.move(); }
  if (E.anyOf('Escape', ' ', 'Enter')) G.state = 'menu';
}

function updateDialog() {
  if (E.anyOf(' ', 'Enter')) {
    DLG.i++;
    if (DLG.i >= DLG.pages.length) { const d = DLG; DLG = null; d.onDone(); }
    else E.sfx.move();
  }
}

function updateMap() {
  /* movimiento */
  let dx = 0, dy = 0;
  const SP = 2.6;
  if (E.keys['ArrowLeft'] || E.keys['a']) dx = -SP;
  if (E.keys['ArrowRight'] || E.keys['d']) dx = SP;
  if (E.keys['ArrowUp'] || E.keys['w']) dy = -SP;
  if (E.keys['ArrowDown'] || E.keys['s']) dy = SP;
  if (dx || dy) {
    P.trail.push({ x: P.x, y: P.y });
    if (P.trail.length > 40) P.trail.shift();
  }
  if (dx && !collides(P.x + dx, P.y)) P.x += dx;
  if (dy && !collides(P.x, P.y + dy)) P.y += dy;

  if (E.consume('Escape')) { saveProfile(); TOAST = null; E.playMusic('menu'); G.state = 'menu'; return; }

  const pcx = P.x + 10, pcy = P.y + 14;

  /* cofres: se abren al acercarse */
  for (const c of Z.chests) {
    if (!c.opened && dist(pcx, pcy, c.tx * TILE + 16, c.ty * TILE + 16) < 42) openChest(c);
  }

  /* puerta abierta: completar zona al tocarla */
  if (Z.door && Z.doorOpen && dist(pcx, pcy, Z.door.tx * TILE + 16, Z.door.ty * TILE + 16) < 30) {
    completeZone();
    return;
  }

  /* interacción con ESPACIO */
  const near = nearestInteractive();
  if (near && E.anyOf(' ', 'Enter')) {
    if (near.kind === 'guardian') askQuestion(near.ent);
    else if (near.kind === 'npc') {
      const lines = STORY.zones[Z.i].npc;
      const line = lines[near.ent.li % lines.length];
      near.ent.li++;
      showDialog([{ sp: 'ALDEANO/A', t: line }], () => { G.state = 'map'; });
    } else if (near.kind === 'boss') {
      if (Z.doorOpen) showDialog(STORY.boss.intro, startBoss);
      else toast('El portal está sellado: responde a los ' + STORY.needed[Z.i] + ' guardianes primero.', 180);
    } else if (near.kind === 'door') {
      toast('Sellada. Guardianes restantes: ' + (STORY.needed[Z.i] - Z.cleared), 160);
    }
  }

  /* eventos activos */
  if (EV) {
    EV.t--;
    if (EV.type === 'humo') {
      for (const b of EV.blobs) {
        b.x += b.vx; b.y += b.vy;
        if (b.x < -50) b.x = W + 50; if (b.x > W + 50) b.x = -50;
        if (b.y < MAPY - 40) b.y = H + 40; if (b.y > H + 40) b.y = MAPY - 40;
      }
    } else if (EV.type === 'archivos') {
      for (const f of EV.files) {
        const ang = Math.atan2(pcy - f.y - 8, pcx - f.x - 8);
        f.x += Math.cos(ang) * 1.15 + Math.sin(tick / 8 + f.ph) * 0.5;
        f.y += Math.sin(ang) * 1.15 + Math.cos(tick / 9 + f.ph) * 0.5;
        if (dist(f.x + 8, f.y + 8, pcx, pcy) < 18) {
          P.x = Z.start.tx * TILE + 6;
          P.y = Z.start.ty * TILE + 2;
          P.trail = [];
          shake = 25;
          E.sfx.hurt();
          toast(STORY.hitByFile, 200);
          EV = null;
          break;
        }
      }
    }
    if (EV && EV.t <= 0) EV = null;
  }
}

function updateQuestion() {
  const n = QS.opts.length;
  if (E.anyOf('ArrowUp', 'w')) { QS.sel = (QS.sel + n - 1) % n; E.sfx.move(); }
  if (E.anyOf('ArrowDown', 's')) { QS.sel = (QS.sel + 1) % n; E.sfx.move(); }
  for (let k = 0; k < n; k++) if (E.consume(String(k + 1))) { QS.sel = k; answerQuestion(); return; }
  if (E.anyOf(' ', 'Enter')) answerQuestion();
}

function updateRecap() {
  if (E.anyOf(' ', 'Enter')) {
    const i = RC.zone;
    RC = null;
    if (G.mode === 'adventure' && i < 5) startZone(i + 1, 'adventure');
    else if (G.mode === 'level') { E.playMusic('menu'); G.state = 'levelselect'; }
    else { E.playMusic('menu'); G.state = 'menu'; }
  }
}

function updateDefeat() {
  if (E.anyOf(' ', 'Enter')) {
    if (DEFEAT.from === 'boss') { DEFEAT = null; startBoss(); }
    else { DEFEAT = null; restartZone(); }
  }
}

function updateBoss() {
  if (BS.anim > 0) BS.anim--;
  if (E.anyOf('ArrowUp', 'w', 'ArrowLeft', 'a')) { BS.sel = 0; E.sfx.move(); }
  if (E.anyOf('ArrowDown', 's', 'ArrowRight', 'd')) { BS.sel = 1; E.sfx.move(); }
  if (E.consume('1')) { BS.sel = 0; answerBoss(); return; }
  if (E.consume('2')) { BS.sel = 1; answerBoss(); return; }
  if (E.anyOf(' ', 'Enter')) answerBoss();
}

function updateVictory() {
  for (const c of VIC.confetti) {
    c.y += c.v;
    if (c.y > H) { c.y = -10; c.x = Math.random() * W; }
  }
  if (E.anyOf(' ', 'Enter')) { VIC = null; BS = null; E.playMusic('menu'); G.state = 'menu'; }
}

/* ---------------- Colisiones ---------------- */
function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

function solidTile(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
  const c = Z.grid[ty][tx];
  if (c === '#' || c === '~') return true;
  if (Z.door && Z.door.tx === tx && Z.door.ty === ty && !Z.doorOpen) return true;
  if (Z.bossGate && Z.bossGate.tx === tx && Z.bossGate.ty === ty) return true;
  if (Z.guardians.some(g => !g.cleared && g.tx === tx && g.ty === ty)) return true;
  if (Z.chests.some(ch => !ch.opened && ch.tx === tx && ch.ty === ty)) return true;
  if (Z.npcs.some(np => np.tx === tx && np.ty === ty)) return true;
  return false;
}
function collides(px, py) {
  const x0 = px + 3, x1 = px + 17, y0 = py + 14, y1 = py + 25;
  return solidTile(Math.floor(x0 / TILE), Math.floor(y0 / TILE)) ||
         solidTile(Math.floor(x1 / TILE), Math.floor(y0 / TILE)) ||
         solidTile(Math.floor(x0 / TILE), Math.floor(y1 / TILE)) ||
         solidTile(Math.floor(x1 / TILE), Math.floor(y1 / TILE));
}

function nearestInteractive() {
  const pcx = P.x + 10, pcy = P.y + 14;
  let best = null, bd = 46;
  for (const g of Z.guardians) {
    if (g.cleared) continue;
    const d = dist(pcx, pcy, g.tx * TILE + 16, g.ty * TILE + 16);
    if (d < bd) { bd = d; best = { kind: 'guardian', ent: g }; }
  }
  for (const n of Z.npcs) {
    const d = dist(pcx, pcy, n.tx * TILE + 16, n.ty * TILE + 16);
    if (d < bd) { bd = d; best = { kind: 'npc', ent: n }; }
  }
  if (Z.bossGate) {
    const d = dist(pcx, pcy, Z.bossGate.tx * TILE + 16, Z.bossGate.ty * TILE + 16);
    if (d < bd) { bd = d; best = { kind: 'boss', ent: Z.bossGate }; }
  }
  if (Z.door && !Z.doorOpen) {
    const d = dist(pcx, pcy, Z.door.tx * TILE + 16, Z.door.ty * TILE + 16);
    if (d < bd) { bd = d; best = { kind: 'door', ent: Z.door }; }
  }
  return best;
}

/* =====================================================================
   DIBUJO
   ===================================================================== */
function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  E.rect(-10, -10, W + 20, H + 20, '#0b0b14');

  switch (G.state) {
    case 'menu': drawMenu(); break;
    case 'levelselect': drawLevelSelect(); break;
    case 'codex': drawCodex(); break;
    case 'help': drawHelp(); break;
    case 'dialog': drawWorldBase(); drawDialog(); break;
    case 'map': drawWorldBase(); drawHint(); break;
    case 'question': drawWorldBase(); drawQuestion(); break;
    case 'feedback': drawFeedback(); break;
    case 'recap': drawRecap(); break;
    case 'defeat': drawDefeat(); break;
    case 'boss': drawBoss(); break;
    case 'victory': drawVictory(); break;
  }

  if (TOAST) drawToast();
  ctx.restore();
}

/* ------- mundo ------- */
function drawWorldBase() {
  if (!Z) return;
  const th = STORY.zones[Z.i].theme;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      drawTile(Z.grid[y][x], x, y, th);
    }
  }
  if (Z.door) drawDoor(Z.door, th);
  if (Z.bossGate) drawPortal(Z.bossGate);
  for (const c of Z.chests) {
    E.sprite(c.opened ? E.SPRITES.chestOpen : E.SPRITES.chestClosed, c.tx * TILE + 6, MAPY + c.ty * TILE + 10, 2);
  }
  for (const n of Z.npcs) {
    E.sprite(E.SPRITES.npc, n.tx * TILE + 6, MAPY + n.ty * TILE + 2, 2);
  }
  for (const g of Z.guardians) {
    if (g.cleared) continue;
    const bob = Math.sin(tick / 14 + g.tx) * 2;
    E.sprite(E.SPRITES.guardian, g.tx * TILE + 6, MAPY + g.ty * TILE + 4 + bob, 2);
    E.text('?', g.tx * TILE + 16, MAPY + g.ty * TILE - 10 + bob, 14, '#f2c14e', 'center');
  }
  /* Bit sigue al jugador */
  const bp = P.trail.length > 22 ? P.trail[P.trail.length - 22] : { x: P.x - 18, y: P.y + 6 };
  E.sprite(E.SPRITES.bit, bp.x + 2, MAPY + bp.y + 8 + Math.sin(tick / 10) * 2, 2);
  /* jugador */
  E.sprite(E.SPRITES.hero, P.x, MAPY + P.y, 2);
  /* archivos caóticos */
  if (EV && EV.type === 'archivos') {
    for (const f of EV.files) E.sprite(E.SPRITES.fileMon, f.x, MAPY + f.y, 2);
  }
  /* humo */
  if (EV && EV.type === 'humo') {
    ctx.globalAlpha = 0.55;
    for (const b of EV.blobs) {
      ctx.fillStyle = '#9aa0a8';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  /* glitch */
  if (EV && EV.type === 'glitch') {
    for (let k = 0; k < 8; k++) {
      const gy = MAPY + Math.random() * (H - MAPY);
      E.rect(0, gy, W, 3, ['#7ad7f0', '#e34a4a', '#f2c14e'][k % 3]);
    }
  }
  drawHUD();
}

function drawTile(c, x, y, th) {
  const px = x * TILE, py = MAPY + y * TILE;
  E.rect(px, py, TILE, TILE, (x + y) % 2 === 0 ? th.f1 : th.f2);
  if (c === '#') {
    if (th.wall === 'tree') {
      E.rect(px, py, TILE, TILE, th.f2);
      E.rect(px + 13, py + 18, 6, 12, th.wc2);
      ctx.fillStyle = th.wc1;
      ctx.beginPath(); ctx.arc(px + 16, py + 12, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2f7038';
      ctx.beginPath(); ctx.arc(px + 11, py + 9, 6, 0, Math.PI * 2); ctx.fill();
    } else if (th.wall === 'rock') {
      E.rect(px, py, TILE, TILE, th.wc1);
      E.rect(px + 3, py + 3, TILE - 6, TILE - 6, th.wc2);
      E.rect(px + 8, py + 10, 6, 3, th.wc1);
      E.rect(px + 18, py + 20, 7, 3, th.wc1);
    } else if (th.wall === 'brick') {
      E.rect(px, py, TILE, TILE, th.wc2);
      ctx.strokeStyle = th.wc1; ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, TILE - 2, 15);
      ctx.strokeRect(px + 1, py + 16, 15, 15);
      ctx.strokeRect(px + 16, py + 16, 15, 15);
    } else if (th.wall === 'wood') {
      E.rect(px, py, TILE, TILE, th.wc2);
      for (let k = 0; k < 4; k++) E.rect(px + k * 8, py, 2, TILE, th.wc1);
    } else { /* column */
      E.rect(px, py, TILE, TILE, th.f2);
      E.rect(px + 6, py + 2, 20, 28, th.wc2);
      E.rect(px + 4, py, 24, 5, th.wc1);
      E.rect(px + 4, py + 27, 24, 5, th.wc1);
    }
  } else if (c === '~') {
    E.rect(px, py, TILE, TILE, th.water);
    const w = Math.floor(tick / 24 + x + y) % 2;
    E.rect(px + 4 + w * 8, py + 10, 10, 2, '#bcd9f0');
    E.rect(px + 14 - w * 6, py + 22, 10, 2, '#bcd9f0');
  }
}

function drawDoor(d, th) {
  const px = d.tx * TILE, py = MAPY + d.ty * TILE;
  E.rect(px, py, TILE, TILE, '#3a2a18');
  E.rect(px + 4, py + 4, TILE - 8, TILE - 4, Z.doorOpen ? '#f2c14e' : '#6b4a2a');
  E.rect(px + 8, py + 8, TILE - 16, TILE - 8, Z.doorOpen ? '#fff2b0' : '#241708');
  if (!Z.doorOpen) {
    E.rect(px + 13, py + 16, 6, 8, '#b8b8b8');
    E.rect(px + 15, py + 13, 2, 5, '#b8b8b8');
  } else if (tick % 30 < 15) {
    E.text('!', px + 16, py - 12, 14, '#f2c14e', 'center');
  }
}

function drawPortal(b) {
  const px = b.tx * TILE + 16, py = MAPY + b.ty * TILE + 16;
  const open = Z.doorOpen;
  for (let k = 3; k >= 0; k--) {
    const r = 6 + k * 4 + Math.sin(tick / 8 + k) * 2;
    ctx.fillStyle = open ? ['#c77df2', '#8058c9', '#5a3e94', '#2d2440'][k] : ['#555', '#444', '#333', '#222'][k];
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
  }
  if (open && tick % 26 < 13) E.text('¡JEFE!', px, py - 26, 11, '#c77df2', 'center');
}

function drawHUD() {
  E.rect(0, 0, W, MAPY, '#12121e');
  E.rect(0, MAPY - 2, W, 2, '#2c2c44');
  for (let k = 0; k < 3; k++) {
    if (k < Z.hearts) E.sprite(E.SPRITES.heart, 10 + k * 26, 10, 3);
    else E.sprite(E.SPRITES.heart, 10 + k * 26, 10, 3, { r: '#3a2330', d: '#3a2330' });
  }
  const zd = STORY.zones[Z.i];
  E.text('ZONA ' + (Z.i + 1) + ' · ' + zd.name.toUpperCase(), W / 2, 6, 13, '#f2c14e', 'center');
  let tp = zd.topic;
  if (tp.length > 34) tp = tp.slice(0, 33) + '…';
  E.text(tp, W / 2, 22, 10, '#9aa0b8', 'center');
  E.text('XP ' + prof.xp + ' · Conf ' + confLetter(), W - 12, 6, 12, '#7ad7f0', 'right');
  E.text('Códex ' + prof.codex.length + '/8 · Guard. ' + Z.cleared + '/' + STORY.needed[Z.i], W - 12, 22, 10, '#9aa0b8', 'right');
}

function drawHint() {
  const near = nearestInteractive();
  if (near) {
    const label = near.kind === 'guardian' ? 'ESPACIO: responder al guardián'
      : near.kind === 'npc' ? 'ESPACIO: hablar'
      : near.kind === 'boss' ? (Z.doorOpen ? 'ESPACIO: ¡enfrentar a EL HUMO!' : 'ESPACIO: examinar el portal')
      : 'ESPACIO: examinar la puerta';
    E.rect(W / 2 - 150, H - 24, 300, 20, 'rgba(10,10,20,0.85)');
    E.text(label, W / 2, H - 21, 11, '#fff', 'center');
  }
}

/* ------- paneles ------- */
function panel(x, y, w, h, bg) {
  E.rect(x, y, w, h, bg || 'rgba(12,14,34,0.96)');
  ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 2;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
}

function drawDialog() {
  const pg = DLG.pages[DLG.i];
  panel(14, H - 128, W - 28, 116);
  const col = pg.sp === 'EL HUMO' ? '#c77df2' : pg.sp === 'BIT' ? '#7ad7f0' : '#f2c14e';
  E.text(pg.sp, 28, H - 116, 13, col);
  const lines = E.wrap(pg.t, 66);
  lines.slice(0, 4).forEach((ln, k) => E.text(ln, 28, H - 96 + k * 17, 12, '#fff'));
  if (tick % 40 < 24) E.text('▼ ESPACIO', W - 40, H - 28, 11, '#9aa0b8', 'right');
  E.addClickable(14, H - 128, W - 28, 116, () => {
    if (!DLG) return;
    DLG.i++;
    if (DLG.i >= DLG.pages.length) { const d = DLG; DLG = null; d.onDone(); }
  });
}

function updateRecapClick() {
  if (!RC) return;
  const i = RC.zone; RC = null;
  if (G.mode === 'adventure' && i < 5) startZone(i + 1, 'adventure');
  else if (G.mode === 'level') { E.playMusic('menu'); G.state = 'levelselect'; }
  else { E.playMusic('menu'); G.state = 'menu'; }
}

function drawQuestion() {
  panel(10, 100, W - 20, H - 112);
  E.text('GUARDIÁN DEL CONOCIMIENTO', W / 2, 112, 12, '#c77df2', 'center');
  const qLines = E.wrap(QS.item.q, 70);
  qLines.forEach((ln, k) => E.text(ln, 26, 132 + k * 16, 12, '#f2c14e'));
  const oy = 132 + qLines.length * 16 + 10;
  QS.opts.forEach((o, k) => {
    const yy = oy + k * 34;
    const seld = k === QS.sel;
    E.rect(22, yy, W - 44, 30, seld ? '#2c3a6e' : '#181a30');
    if (seld) { ctx.strokeStyle = '#7ad7f0'; ctx.lineWidth = 2; ctx.strokeRect(23, yy + 1, W - 46, 28); }
    const letter = String(k + 1) + ') ';
    const lines = E.wrap(letter + o.t, 72);
    if (lines.length === 1) E.text(lines[0], 32, yy + 9, 11, seld ? '#fff' : '#c8c8d8');
    else {
      E.text(lines[0], 32, yy + 3, 10, seld ? '#fff' : '#c8c8d8');
      E.text(lines[1] || '', 32, yy + 15, 10, seld ? '#fff' : '#c8c8d8');
    }
    E.addClickable(22, yy, W - 44, 30, () => { QS.sel = k; answerQuestion(); });
  });
  E.text('↑↓ elegir · ESPACIO confirmar · 1-4 directo', W / 2, H - 32, 10, '#9aa0b8', 'center');
}

function drawFeedback() {
  if (Z && !BS) drawWorldBase();
  else if (BS) drawBossScene(false);
  panel(40, 120, W - 80, 170);
  E.text(FB.head, W / 2, 136, 16, FB.correct ? '#7ac74f' : '#e34a4a', 'center');
  const lines = E.wrap(FB.body, 60);
  lines.slice(0, 6).forEach((ln, k) => E.text(ln, 58, 166 + k * 17, 11, '#fff'));
  if (tick % 40 < 24) E.text('▼ ESPACIO para continuar', W / 2, 268, 11, '#9aa0b8', 'center');
  E.addClickable(40, 120, W - 80, 170, () => { if (!FB) return; const f = FB; FB = null; f.onDone(); });
}

/* ------- menú y pantallas ------- */
function drawMenu() {
  /* cielo estrellado */
  for (let k = 0; k < 60; k++) {
    const sx = (k * 97) % W, sy = (k * 53) % 200;
    if ((k + Math.floor(tick / 30)) % 7 !== 0) E.rect(sx, sy, 2, 2, '#3c3c5c');
  }
  E.text('LA SENDA DEL', W / 2 + 3, 43, 34, '#3a2a5e', 'center');
  E.text('LA SENDA DEL', W / 2, 40, 34, '#f2c14e', 'center');
  E.text('DIRECTOR', W / 2 + 3, 81, 42, '#3a2a5e', 'center');
  E.text('DIRECTOR', W / 2, 78, 42, '#7ad7f0', 'center');
  E.text('— Claude Code desde cero · RPG de conocimiento —', W / 2, 128, 12, '#9aa0b8', 'center');

  /* héroe y bit caminando */
  const hx = (tick * 1.2) % (W + 80) - 40;
  E.sprite(E.SPRITES.hero, hx, 152, 2);
  E.sprite(E.SPRITES.bit, hx - 24, 162 + Math.sin(tick / 10) * 3, 2);

  const items = menuItems();
  items.forEach((it, k) => {
    const yy = 205 + k * 28;
    const sel = k === menuIdx;
    if (sel) E.rect(W / 2 - 180, yy - 4, 360, 24, '#1d2140');
    E.text((sel ? '▶ ' : '  ') + it.label, W / 2, yy, 14, sel ? '#fff' : '#8a8aa8', 'center');
    E.addClickable(W / 2 - 180, yy - 4, 360, 24, () => { menuIdx = k; menuSelect(it.id); });
  });
  E.text('Flechas/WASD mover · ESPACIO acción · M sonido', W / 2, H - 38, 10, '#5c5c7a', 'center');
  E.text('Basado en el guion "Claude Code sin ser programador" · Neuropista', W / 2, H - 22, 10, '#5c5c7a', 'center');
}

function drawLevelSelect() {
  E.text('ELIGE LA PARTE DEL CAMINO A REPASAR', W / 2, 16, 16, '#f2c14e', 'center');
  E.text('Cada zona repasa un bloque del conocimiento. ESC: volver', W / 2, 40, 10, '#9aa0b8', 'center');
  for (let k = 0; k < 6; k++) {
    const cx = 18 + (k % 3) * 206, cy = 62 + Math.floor(k / 3) * 150;
    const sel = k === lvlIdx;
    E.rect(cx, cy, 196, 138, sel ? '#232a52' : '#161a30');
    ctx.strokeStyle = sel ? '#7ad7f0' : '#2c2c44'; ctx.lineWidth = 2;
    ctx.strokeRect(cx + 1, cy + 1, 194, 136);
    E.text('ZONA ' + (k + 1), cx + 10, cy + 10, 11, '#c77df2');
    E.wrap(STORY.zones[k].name, 22).forEach((ln, j) => E.text(ln, cx + 10, cy + 26 + j * 15, 12, '#fff'));
    E.wrap(STORY.zones[k].topic, 30).forEach((ln, j) => E.text(ln, cx + 10, cy + 62 + j * 13, 10, '#9aa0b8'));
    if (k === 5) E.text('¡JEFE FINAL: EL HUMO!', cx + 10, cy + 102, 10, '#e34a4a');
    E.text(prof.done[k] ? '✔ superada' : '— pendiente', cx + 10, cy + 118, 10, prof.done[k] ? '#7ac74f' : '#5c5c7a');
    E.addClickable(cx, cy, 196, 138, () => { lvlIdx = k; E.sfx.confirm(); startZone(k, 'level'); });
  }
}

function drawCodex() {
  E.text('CÓDEX DE PROMPTS LEGENDARIOS', W / 2, 14, 16, '#f2c14e', 'center');
  E.text('Ábrelos con los cofres del camino · ESPACIO/ESC: volver', W / 2, 38, 10, '#9aa0b8', 'center');
  CODEX_PROMPTS.forEach((p, k) => {
    const owned = prof.codex.includes(p.id);
    const sel = k === cdxIdx;
    const yy = 60 + k * 24;
    if (sel) E.rect(10, yy - 3, 240, 22, '#1d2140');
    E.text((owned ? '📜 ' : '🔒 ') + (owned ? p.title : '???'), 16, yy, 12, sel ? '#fff' : owned ? '#c8c8d8' : '#55556a');
    E.addClickable(10, yy - 3, 240, 22, () => { cdxIdx = k; });
  });
  const p = CODEX_PROMPTS[cdxIdx];
  panel(262, 58, W - 276, 262);
  if (prof.codex.includes(p.id)) {
    E.text(p.title, 278, 72, 13, '#f2c14e');
    E.wrap(p.text, 42).forEach((ln, k) => E.text(ln, 278, 96 + k * 16, 10, '#fff'));
    E.text('Cópialo y adapta los [corchetes] en la pestaña Code', 278, 296, 9, '#7ad7f0');
  } else {
    E.text('Aún no has encontrado este prompt.', 278, 96, 11, '#8a8aa8');
    E.text('Busca los cofres brillantes en las zonas.', 278, 116, 11, '#8a8aa8');
  }
}

function drawHelp() {
  E.text('INSTRUCCIONES', W / 2, 16, 18, '#f2c14e', 'center');
  const lines = [
    'MOVERTE: flechas o WASD. BIT, tu practicante, te sigue.',
    'RESPONDER: acércate a un guardián morado y pulsa ESPACIO.',
    'Cada zona pide varias respuestas correctas para abrir su puerta.',
    '',
    'ACIERTO: +10 XP, avanza la historia, sube tu confianza (A→E).',
    'ERROR: pierdes 1 de 3 corazones... y algo INUSUAL sucede:',
    '  · El Humo cubre la zona con niebla.',
    '  · La carpeta caótica suelta archivos que te persiguen.',
    '  · Un glitch reorganiza el mapa y te pierde.',
    'Sin corazones: la zona se reinicia. ¡Como en los 90!',
    '',
    'COFRES: contienen PROMPTS LEGENDARIOS reales para tu códex.',
    'ZONA 6: el jefe final EL HUMO. Clasifica VERDAD o HUMO.',
    '',
    'M: sonido on/off · ESC: volver al menú (tu avance se guarda).'
  ];
  lines.forEach((ln, k) => E.text(ln, 60, 52 + k * 19, 12, ln.startsWith(' ') ? '#9aa0b8' : '#fff'));
  E.text('▼ ESPACIO para volver', W / 2, H - 24, 11, '#9aa0b8', 'center');
}

function drawRecap() {
  const zd = STORY.zones[RC.zone];
  E.rect(0, 0, W, H, '#0e1424');
  E.text('¡ZONA SUPERADA!', W / 2, 50, 26, '#7ac74f', 'center');
  E.text(zd.name, W / 2, 90, 16, '#f2c14e', 'center');
  if (zd.complete) E.wrap(zd.complete, 60).forEach((ln, k) => E.text(ln, W / 2, 122 + k * 17, 12, '#fff', 'center'));
  E.text('+25 XP de bonificación · Confianza: ' + confLetter(), W / 2, 190, 13, '#7ad7f0', 'center');
  E.text(RC.lost === 0 ? '¡Sin perder corazones! Impecable.' : 'Corazones perdidos: ' + RC.lost, W / 2, 214, 12, RC.lost === 0 ? '#7ac74f' : '#9aa0b8', 'center');
  RC.newAch.forEach((id, k) => {
    const a = ACHIEVEMENTS.find(x => x.id === id);
    E.text('🏆 LOGRO: ' + a.name + ' — ' + a.desc, W / 2, 244 + k * 20, 11, '#f2c14e', 'center');
  });
  const nextLabel = (G.mode === 'adventure' && RC.zone < 5) ? 'Siguiente: ' + STORY.zones[RC.zone + 1].name : 'Volver';
  if (tick % 40 < 24) E.text('▼ ESPACIO — ' + nextLabel, W / 2, H - 40, 12, '#9aa0b8', 'center');
  E.addClickable(0, 0, W, H, updateRecapClick);
}

function drawDefeat() {
  E.rect(0, 0, W, H, '#180a0e');
  E.sprite(E.SPRITES.fileMon, W / 2 - 32, 46, 8);
  E.text('HAS PERDIDO TUS OPORTUNIDADES', W / 2, 130, 20, '#e34a4a', 'center');
  E.wrap(DEFEAT.text, 58).forEach((ln, k) => E.text(ln, W / 2, 170 + k * 18, 12, '#fff', 'center'));
  E.text(DEFEAT.from === 'boss' ? 'El combate contra EL HUMO se reinicia.' : 'La zona se reinicia desde el principio.', W / 2, 260, 12, '#f2c14e', 'center');
  if (tick % 40 < 24) E.text('▼ ESPACIO para reintentar', W / 2, H - 50, 13, '#9aa0b8', 'center');
  E.addClickable(0, 0, W, H, () => { if (DEFEAT.from === 'boss') { DEFEAT = null; startBoss(); } else { DEFEAT = null; restartZone(); } });
}

/* ------- jefe ------- */
function drawBossScene(withUI) {
  E.rect(0, 0, W, H, '#141021');
  /* nube de humo */
  const cx = W / 2 + (BS.anim > 0 ? (Math.random() - 0.5) * 10 : 0);
  const cy = 92;
  const sc = 0.55 + 0.45 * (BS.hp / BS.maxhp);
  for (let k = 5; k >= 0; k--) {
    const ang = tick / 20 + k * 1.1;
    ctx.fillStyle = ['#5c5c6e', '#4c4c5e', '#3e3e50', '#343446', '#2b2b3c', '#232334'][k];
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * 18 * sc, cy + Math.sin(ang * 1.3) * 10 * sc, (46 - k * 5) * sc, 0, Math.PI * 2);
    ctx.fill();
  }
  /* ojos */
  ctx.fillStyle = BS.anim > 0 ? '#fff' : '#e34a4a';
  ctx.fillRect(cx - 16 * sc, cy - 6 * sc, 9 * sc, 5 * sc);
  ctx.fillRect(cx + 8 * sc, cy - 6 * sc, 9 * sc, 5 * sc);
  E.text('EL HUMO', W / 2, 12, 16, '#c77df2', 'center');
  /* vida del jefe */
  for (let k = 0; k < BS.maxhp; k++) {
    E.rect(W / 2 - BS.maxhp * 12 + k * 24, 34, 18, 8, k < BS.hp ? '#c77df2' : '#33283f');
  }
  /* corazones del jugador */
  for (let k = 0; k < 3; k++) {
    if (k < Z.hearts) E.sprite(E.SPRITES.heart, 12 + k * 26, 10, 3);
    else E.sprite(E.SPRITES.heart, 12 + k * 26, 10, 3, { r: '#3a2330', d: '#3a2330' });
  }
  E.text('XP ' + prof.xp, W - 12, 10, 12, '#7ad7f0', 'right');
  /* héroe y bit */
  E.sprite(E.SPRITES.hero, W / 2 - 60, 150, 3);
  E.sprite(E.SPRITES.bit, W / 2 - 100, 168 + Math.sin(tick / 10) * 3, 2);
  if (!withUI) return;
  /* afirmación */
  panel(14, 208, W - 28, H - 220);
  E.text('¿VERDAD o HUMO?', W / 2, 220, 13, '#f2c14e', 'center');
  E.wrap(BS.item.s, 66).forEach((ln, k) => E.text(ln, 30, 244 + k * 16, 12, '#fff'));
  const labels = ['1) Es VERDAD', '2) Es HUMO'];
  labels.forEach((lb, k) => {
    const xx = 40 + k * ((W - 80) / 2), yy = H - 66;
    const sel = BS.sel === k;
    E.rect(xx, yy, (W - 80) / 2 - 20, 34, sel ? (k === 0 ? '#1d4a2a' : '#4a1d38') : '#181a30');
    ctx.strokeStyle = sel ? '#fff' : '#2c2c44'; ctx.lineWidth = 2;
    ctx.strokeRect(xx + 1, yy + 1, (W - 80) / 2 - 22, 32);
    E.text(lb, xx + ((W - 80) / 2 - 20) / 2, yy + 10, 13, sel ? '#fff' : '#8a8aa8', 'center');
    E.addClickable(xx, yy, (W - 80) / 2 - 20, 34, () => { BS.sel = k; answerBoss(); });
  });
}
function drawBoss() { drawBossScene(true); }

/* ------- victoria ------- */
function drawVictory() {
  E.rect(0, 0, W, H, '#101828');
  for (const c of VIC.confetti) E.rect(c.x, c.y, c.s, c.s, c.c);
  panel(70, 30, W - 140, 250, '#f6f1dc');
  ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 4;
  ctx.strokeRect(78, 38, W - 156, 234);
  E.text('DIPLOMA', W / 2, 52, 26, '#8a6d1a', 'center');
  E.text('DIRECTOR/A DE PRACTICANTES DIGITALES', W / 2, 88, 13, '#333', 'center');
  E.text('Nivel de confianza alcanzado: E (¡desde la A!)', W / 2, 112, 11, '#555', 'center');
  STORY.victory.forEach((ln, k) => E.text(ln, W / 2, 140 + k * 18, 12, '#222', 'center'));
  E.text('XP total: ' + prof.xp + ' · Prompts: ' + prof.codex.length + '/8 · Logros: ' + prof.ach.length + '/' + ACHIEVEMENTS.length, W / 2, 222, 11, '#8a6d1a', 'center');
  E.text('El Humo se ha disipado del Reino Digital', W / 2, 248, 11, '#555', 'center');
  VIC.newAch.forEach((id, k) => {
    const a = ACHIEVEMENTS.find(x => x.id === id);
    E.text('🏆 ' + a.name, W / 2, 292 + k * 18, 12, '#f2c14e', 'center');
  });
  if (tick % 40 < 24) E.text('▼ ESPACIO — volver al menú', W / 2, H - 26, 12, '#9aa0b8', 'center');
  E.addClickable(0, 0, W, H, () => { VIC = null; E.playMusic('menu'); G.state = 'menu'; });
}

function drawToast() {
  const lines = E.wrap(TOAST.text, 64);
  const hh = 14 + lines.length * 15;
  E.rect(W / 2 - 250, 46, 500, hh, 'rgba(20,16,40,0.94)');
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - 249, 47, 498, hh - 2);
  lines.forEach((ln, k) => E.text(ln, W / 2, 53 + k * 15, 11, '#fff', 'center'));
}

/* ---------------- Bucle principal ---------------- */
function loop() {
  update();
  draw();
  E.processClicks();
  E.clearPressed();
  requestAnimationFrame(loop);
}
E.playMusic('menu');
loop();
