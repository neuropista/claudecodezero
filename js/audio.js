'use strict';
/* Audio chiptune con WebAudio — sin archivos externos */
const AUDIO = (() => {
  let actx = null, soundOn = true;
  function ac() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    return actx;
  }
  function resume() { const a = ac(); if (a && a.state === 'suspended') a.resume(); }
  function beep(freq, dur, type, vol, when) {
    if (!soundOn) return;
    const a = ac(); if (!a) return;
    try {
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      const t0 = a.currentTime + (when || 0);
      g.gain.setValueAtTime(vol === undefined ? 0.12 : vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + (dur || 0.12));
      o.connect(g); g.connect(a.destination);
      o.start(t0); o.stop(t0 + (dur || 0.12) + 0.02);
    } catch (e) { /* audio no disponible */ }
  }
  const sfx = {
    step:    () => beep(180, 0.06, 'square', 0.05),
    turn:    () => beep(320, 0.05, 'triangle', 0.05),
    move:    () => beep(660, 0.05, 'square', 0.06),
    confirm: () => { beep(523, 0.08); beep(784, 0.1, 'square', 0.12, 0.08); },
    correct: () => { beep(523, 0.09); beep(659, 0.09, 'square', 0.12, 0.09); beep(784, 0.12, 'square', 0.12, 0.18); beep(1047, 0.22, 'square', 0.1, 0.28); },
    wrong:   () => { beep(220, 0.16, 'sawtooth', 0.1); beep(150, 0.3, 'sawtooth', 0.1, 0.15); },
    chest:   () => { beep(880, 0.07); beep(1175, 0.16, 'square', 0.1, 0.08); },
    door:    () => { beep(392, 0.1, 'triangle', 0.14); beep(523, 0.1, 'triangle', 0.14, 0.1); beep(659, 0.2, 'triangle', 0.14, 0.2); },
    hurt:    () => beep(110, 0.28, 'sawtooth', 0.14),
    bosshit: () => { beep(300, 0.1, 'triangle', 0.18); beep(200, 0.16, 'triangle', 0.18, 0.1); },
    tick:    () => beep(1200, 0.04, 'square', 0.05),
    fanfare: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => beep(f, 0.15, 'square', 0.1, i * 0.13)),
    defeat:  () => [392, 330, 262, 196].forEach((f, i) => beep(f, 0.22, 'triangle', 0.13, i * 0.18))
  };
  const N = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, G5: 784, A3: 220, G3: 196, E3: 165, R: 0 };
  const MUSIC = {
    menu:  [N.C4, N.R, N.E4, N.R, N.G4, N.R, N.E4, N.R, N.A4, N.R, N.G4, N.R, N.E4, N.R, N.D4, N.R],
    field: [N.C4, N.E4, N.G4, N.E4, N.F4, N.A4, N.C5, N.A4, N.G4, N.B4, N.D5, N.B4, N.C5, N.G4, N.E4, N.C4],
    cave:  [N.A3, N.R, N.C4, N.R, N.E4, N.R, N.C4, N.R, N.G3, N.R, N.B4, N.R, N.E4, N.R, N.R, N.R],
    boss:  [N.E3, N.E4, N.E3, N.E4, N.F4, N.E4, N.D4, N.E4, N.E3, N.E4, N.G4, N.F4, N.E4, N.D4, N.C4, N.D4],
    win:   [N.C4, N.E4, N.G4, N.C5, N.G4, N.C5, N.E5, N.C5, N.D5, N.B4, N.G4, N.B4, N.C5, N.R, N.R, N.R]
  };
  let seq = null, step = 0, timer = null;
  function playMusic(name) {
    seq = MUSIC[name] || null; step = 0;
    if (!timer) {
      timer = setInterval(() => {
        if (!soundOn || !seq || !actx || actx.state !== 'running') return;
        const f = seq[step % seq.length];
        if (f) beep(f, 0.15, 'triangle', 0.035);
        step++;
      }, 170);
    }
  }
  return {
    sfx, beep, playMusic, resume,
    stopMusic: () => { seq = null; },
    toggle: () => { soundOn = !soundOn; if (soundOn) resume(); return soundOn; },
    get on() { return soundOn; }
  };
})();
