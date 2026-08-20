'use strict';
/* =====================================================================
   Motor mínimo estilo 16-bits: canvas, input, audio chiptune y sprites
   ===================================================================== */

const Engine = (() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  /* ---------------- Input ---------------- */
  const keys = {};
  const pressed = {};

  function resumeAudio() {
    if (actx && actx.state === 'suspended') actx.resume();
    if (!actx) ac();
  }

  window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!keys[k]) pressed[k] = true;
    keys[k] = true;
    resumeAudio();
  });
  window.addEventListener('keyup', e => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys[k] = false;
  });

  function consume(k) { if (pressed[k]) { pressed[k] = false; return true; } return false; }
  function anyOf(...ks) { return ks.some(k => consume(k)); }
  function clearPressed() { for (const k in pressed) pressed[k] = false; }

  /* Botones táctiles */
  document.querySelectorAll('#touch button').forEach(b => {
    const k = b.dataset.k;
    const on = e => { e.preventDefault(); if (!keys[k]) pressed[k] = true; keys[k] = true; resumeAudio(); };
    const off = e => { e.preventDefault(); keys[k] = false; };
    b.addEventListener('touchstart', on, { passive: false });
    b.addEventListener('touchend', off, { passive: false });
    b.addEventListener('mousedown', on);
    b.addEventListener('mouseup', off);
    b.addEventListener('mouseleave', off);
  });

  /* Mouse / tap sobre el canvas */
  let clickPt = null;
  let clickables = [];
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    clickPt = {
      x: (e.clientX - r.left) * canvas.width / r.width,
      y: (e.clientY - r.top) * canvas.height / r.height
    };
    resumeAudio();
  });
  function addClickable(x, y, w, h, fn) { clickables.push({ x, y, w, h, fn }); }
  function processClicks() {
    if (clickPt) {
      for (const c of clickables) {
        if (clickPt.x >= c.x && clickPt.x <= c.x + c.w && clickPt.y >= c.y && clickPt.y <= c.y + c.h) { c.fn(); break; }
      }
    }
    clickPt = null;
    clickables = [];
  }

  /* ---------------- Audio (WebAudio, chiptune) ---------------- */
  let actx = null;
  let soundOn = true;

  function ac() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    return actx;
  }

  function beep(freq, dur = 0.12, type = 'square', vol = 0.13, when = 0) {
    if (!soundOn) return;
    const a = ac();
    if (!a) return;
    try {
      const o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.value = freq;
      const t0 = a.currentTime + when;
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g); g.connect(a.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* audio no disponible */ }
  }

  const sfx = {
    move:    () => beep(660, 0.05, 'square', 0.06),
    confirm: () => { beep(523, 0.08); beep(784, 0.1, 'square', 0.13, 0.08); },
    correct: () => { beep(523, 0.09); beep(659, 0.09, 'square', 0.13, 0.09); beep(784, 0.12, 'square', 0.13, 0.18); beep(1047, 0.22, 'square', 0.11, 0.28); },
    wrong:   () => { beep(220, 0.16, 'sawtooth', 0.11); beep(150, 0.3, 'sawtooth', 0.11, 0.15); },
    chest:   () => { beep(880, 0.07); beep(1175, 0.16, 'square', 0.11, 0.08); },
    door:    () => { beep(392, 0.1, 'triangle', 0.15); beep(523, 0.1, 'triangle', 0.15, 0.1); beep(659, 0.2, 'triangle', 0.15, 0.2); },
    hurt:    () => beep(110, 0.28, 'sawtooth', 0.15),
    bosshit: () => { beep(300, 0.1, 'triangle', 0.2); beep(200, 0.16, 'triangle', 0.2, 0.1); },
    fanfare: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => beep(f, 0.15, 'square', 0.11, i * 0.13)),
    defeat:  () => [392, 330, 262, 196].forEach((f, i) => beep(f, 0.22, 'triangle', 0.14, i * 0.18))
  };

  /* Música de fondo: secuenciador simple por zona */
  const N = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, G5: 784, A3: 220, G3: 196, E3: 165, R: 0 };
  const MUSIC = {
    menu:  [N.C4, N.R, N.E4, N.R, N.G4, N.R, N.E4, N.R, N.A4, N.R, N.G4, N.R, N.E4, N.R, N.D4, N.R],
    field: [N.C4, N.E4, N.G4, N.E4, N.F4, N.A4, N.C5, N.A4, N.G4, N.B4, N.D5, N.B4, N.C5, N.G4, N.E4, N.C4],
    cave:  [N.A3, N.R, N.C4, N.R, N.E4, N.R, N.C4, N.R, N.G3, N.R, N.B4, N.R, N.E4, N.R, N.R, N.R],
    boss:  [N.E3, N.E4, N.E3, N.E4, N.F4, N.E4, N.D4, N.E4, N.E3, N.E4, N.G4, N.F4, N.E4, N.D4, N.C4, N.D4],
    win:   [N.C4, N.E4, N.G4, N.C5, N.G4, N.C5, N.E5, N.C5, N.D5, N.B4, N.G4, N.B4, N.C5, N.R, N.R, N.R]
  };
  let musicSeq = null, musicStep = 0, musicTimer = null;
  function playMusic(name) {
    musicSeq = MUSIC[name] || null;
    musicStep = 0;
    if (!musicTimer) {
      musicTimer = setInterval(() => {
        if (!soundOn || !musicSeq || !actx || actx.state !== 'running') return;
        const f = musicSeq[musicStep % musicSeq.length];
        if (f) beep(f, 0.15, 'triangle', 0.038);
        musicStep++;
      }, 170);
    }
  }
  function stopMusic() { musicSeq = null; }
  function toggleSound() { soundOn = !soundOn; return soundOn; }

  /* ---------------- Dibujo ---------------- */
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

  function text(str, x, y, size = 13, color = '#fff', align = 'left', weight = 'bold') {
    ctx.fillStyle = color;
    ctx.font = weight + ' ' + size + 'px "Courier New", monospace';
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(str, x, y);
  }

  function wrap(str, maxChars) {
    const words = String(str).split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > maxChars) { if (line) lines.push(line); line = w; }
      else line = (line ? line + ' ' : '') + w;
    }
    if (line) lines.push(line);
    return lines;
  }

  function sprite(spr, x, y, px, palOverride) {
    const pal = palOverride || spr.pal;
    const map = spr.map;
    for (let r = 0; r < map.length; r++) {
      const row = map[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        const col = pal[ch];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x + c * px, y + r * px, px, px);
      }
    }
  }

  /* ---------------- Sprites (pixel maps) ---------------- */
  const SPRITES = {
    hero: {
      pal: { h: '#5a3d2b', s: '#e8b088', e: '#1b1b1b', c: '#1f7a8c', t: '#d64545', p: '#31446e', b: '#26150c' },
      map: [
        '...hhhh...',
        '..hhhhhh..',
        '..ssssss..',
        '..sesses..',
        '..ssssss..',
        '...ssss...',
        '..cccccc..',
        '.cccttccc.',
        '.sccttccs.',
        '..cccccc..',
        '..pppppp..',
        '..pp..pp..',
        '..bb..bb..'
      ]
    },
    bit: {
      pal: { a: '#7ad7f0', e: '#123241', m: '#f2c14e' },
      map: [
        '..aaaa..',
        '.aaaaaa.',
        '.aeaaea.',
        '.aaaaaa.',
        '..amma..',
        '.a....a.',
        '..a..a..'
      ]
    },
    guardian: {
      pal: { r: '#8058c9', w: '#ffffff', d: '#5a3e94' },
      map: [
        '...rrrr...',
        '..rrrrrr..',
        '..rwrrwr..',
        '..rrrrrr..',
        '.rrrrrrrr.',
        '.rrrrrrrr.',
        '.r.rrrr.r.',
        '.r.rrrr.r.',
        '...rrrr...',
        '..rrrrrr..',
        '.rdrrrrdr.',
        '.rrrrrrrr.'
      ]
    },
    npc: {
      pal: { h: '#2b2b2b', s: '#d69a6e', e: '#1b1b1b', c: '#7a4f9e', t: '#e0a63a', p: '#4a5b34', b: '#26150c' },
      map: [
        '...hhhh...',
        '..hhhhhh..',
        '..ssssss..',
        '..sesses..',
        '..ssssss..',
        '...ssss...',
        '..cccccc..',
        '.cccttccc.',
        '.sccttccs.',
        '..cccccc..',
        '..pppppp..',
        '..pp..pp..',
        '..bb..bb..'
      ]
    },
    chestClosed: {
      pal: { o: '#8a5a2b', y: '#e0a63a', l: '#f5d76e' },
      map: [
        '.oooooooo.',
        'oooooooooo',
        'oyyyyyyyyo',
        'oooooooooo',
        'oooolloooo',
        'oooolloooo',
        'oooooooooo',
        '.oooooooo.'
      ]
    },
    chestOpen: {
      pal: { o: '#8a5a2b', y: '#e0a63a', g: '#fff2b0' },
      map: [
        '.gggggggg.',
        'g........g',
        'o.gggggg.o',
        'oooooooooo',
        'oyyyyyyyyo',
        'oooooooooo',
        'oooooooooo',
        '.oooooooo.'
      ]
    },
    fileMon: {
      pal: { w: '#f2f2f2', d: '#c9c9c9', e: '#d64545', m: '#333333' },
      map: [
        'wwwwwwd.',
        'wwwwwwdd',
        'wwwwwwww',
        'wewwewww',
        'wwwwwwww',
        'wwmmmwww',
        'wwwwwwww',
        'w.w..w.w'
      ]
    },
    heart: {
      pal: { r: '#e34a4a', d: '#8f1f1f' },
      map: [
        '.rr.rr.',
        'rrrrrrr',
        'rrrrrrr',
        '.rrrrr.',
        '..rrr..',
        '...r...'
      ]
    }
  };

  return {
    canvas, ctx,
    keys, consume, anyOf, clearPressed,
    addClickable, processClicks,
    sfx, beep, playMusic, stopMusic, toggleSound,
    get soundOn() { return soundOn; },
    rect, text, wrap, sprite, SPRITES
  };
})();
