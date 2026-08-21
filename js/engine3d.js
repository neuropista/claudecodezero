'use strict';
/* =====================================================================
   Motor 3D mínimo en WebGL puro — "La Senda del Director 3D"
   Estilo dungeon-crawler de los 90 (Eye of the Beholder / Ultima):
   render a baja resolución escalado con pixelado, niebla por distancia,
   texturas y sprites generados por código. Sin dependencias externas.
   ===================================================================== */

const E3 = (() => {

  const scene = document.getElementById('scene');   // canvas WebGL (baja resolución)
  const hud = document.getElementById('hud');       // canvas 2D superpuesto
  const ctx = hud.getContext('2d');
  const gl = scene.getContext('webgl', { antialias: false, alpha: false, depth: true }) ||
             scene.getContext('experimental-webgl', { antialias: false, alpha: false, depth: true });

  const HW = hud.width, HH = hud.height;
  ctx.imageSmoothingEnabled = false;

  /* ==================== MATEMÁTICA DE MATRICES ==================== */
  function perspective(fovyDeg, aspect, near, far) {
    const f = 1 / Math.tan(fovyDeg * Math.PI / 360);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }
  function lookAt(ex, ey, ez, cx, cy, cz) {
    let fx = cx - ex, fy = cy - ey, fz = cz - ez;
    let rl = 1 / Math.hypot(fx, fy, fz); fx *= rl; fy *= rl; fz *= rl;
    // s = f x up  (up = 0,1,0)
    let sx = fy * 0 - fz * 1, sy = fz * 0 - fx * 0, sz = fx * 1 - fy * 0;
    rl = 1 / (Math.hypot(sx, sy, sz) || 1); sx *= rl; sy *= rl; sz *= rl;
    // u = s x f
    const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
    return new Float32Array([
      sx, ux, -fx, 0,
      sy, uy, -fy, 0,
      sz, uz, -fz, 0,
      -(sx * ex + sy * ey + sz * ez), -(ux * ex + uy * ey + uz * ez), (fx * ex + fy * ey + fz * ez), 1
    ]);
  }

  /* ==================== SHADERS ==================== */
  const VS = [
    'attribute vec3 aPos;',
    'attribute vec2 aUV;',
    'attribute float aShade;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'varying vec2 vUV;',
    'varying float vShade;',
    'varying float vDist;',
    'void main() {',
    '  vec4 p = uView * vec4(aPos, 1.0);',
    '  vDist = length(p.xyz);',
    '  gl_Position = uProj * p;',
    '  vUV = aUV;',
    '  vShade = aShade;',
    '}'
  ].join('\n');

  const FS = [
    'precision mediump float;',
    'uniform sampler2D uTex;',
    'uniform vec3 uFogColor;',
    'uniform float uFogDist;',
    'uniform vec3 uTint;',
    'varying vec2 vUV;',
    'varying float vShade;',
    'varying float vDist;',
    'void main() {',
    '  vec4 c = texture2D(uTex, vUV);',
    '  if (c.a < 0.5) discard;',
    '  vec3 col = c.rgb * vShade * uTint;',
    '  float f = clamp(vDist / uFogDist, 0.0, 1.0);',
    '  col = mix(col, uFogColor, f * f);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const A = {
    pos: gl.getAttribLocation(prog, 'aPos'),
    uv: gl.getAttribLocation(prog, 'aUV'),
    shade: gl.getAttribLocation(prog, 'aShade')
  };
  const U = {
    proj: gl.getUniformLocation(prog, 'uProj'),
    view: gl.getUniformLocation(prog, 'uView'),
    tex: gl.getUniformLocation(prog, 'uTex'),
    fogColor: gl.getUniformLocation(prog, 'uFogColor'),
    fogDist: gl.getUniformLocation(prog, 'uFogDist'),
    tint: gl.getUniformLocation(prog, 'uTint')
  };

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  /* ==================== TEXTURAS PROCEDURALES ==================== */
  const TS = 64, ATLAS_N = 4;
  function makeAtlasCanvas() {
    const c = document.createElement('canvas');
    c.width = c.height = TS * ATLAS_N;
    return c;
  }
  function tileCtx(c, index) {
    const x = (index % ATLAS_N) * TS, y = Math.floor(index / ATLAS_N) * TS;
    const g = c.getContext('2d');
    g.save();
    g.translate(x, y);
    g.beginPath(); g.rect(0, 0, TS, TS); g.clip();
    return g;
  }
  function noise(g, n, colors, alpha) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[i % colors.length];
      g.globalAlpha = alpha || 1;
      const s = 1 + Math.floor(Math.random() * 3);
      g.fillRect(Math.floor(Math.random() * TS), Math.floor(Math.random() * TS), s, s);
    }
    g.globalAlpha = 1;
  }

  /* Índices del atlas de mundo */
  const T = {
    HEDGE: 0, ROCK: 1, BRICK: 2, WOOD: 3,
    COLUMN: 4, GRASS: 5, STONE: 6, PLANK: 7,
    MARBLE: 8, WATER: 9, CEIL_DARK: 10, CEIL_STONE: 11,
    DOOR: 12, DOOR_OPEN: 13, SKY: 14, CEIL_WOOD: 15
  };

  const worldCanvas = makeAtlasCanvas();
  (function paintWorldAtlas() {
    let g;
    // 0 seto / follaje (zonas exteriores)
    g = tileCtx(worldCanvas, T.HEDGE);
    g.fillStyle = '#245c2c'; g.fillRect(0, 0, TS, TS);
    noise(g, 500, ['#2f7038', '#1c4a23', '#3a8544']);
    g.restore();
    // 1 roca (cavernas)
    g = tileCtx(worldCanvas, T.ROCK);
    g.fillStyle = '#4d4d63'; g.fillRect(0, 0, TS, TS);
    g.strokeStyle = '#2b2b38'; g.lineWidth = 2;
    for (let r = 0; r < 4; r++) {
      const off = (r % 2) * 16;
      for (let cN = 0; cN < 3; cN++) g.strokeRect(-8 + off + cN * 24, r * 16, 24, 16);
    }
    noise(g, 220, ['#5b5b73', '#3a3a4b']);
    g.restore();
    // 2 ladrillo (torre)
    g = tileCtx(worldCanvas, T.BRICK);
    g.fillStyle = '#4a3d6b'; g.fillRect(0, 0, TS, TS);
    g.fillStyle = '#392e55';
    for (let r = 0; r < 4; r++) {
      const off = (r % 2) * 16;
      for (let cN = 0; cN < 3; cN++) g.fillRect(-8 + off + cN * 24 + 2, r * 16 + 2, 20, 12);
    }
    noise(g, 160, ['#5b4c85', '#2d2440']);
    g.restore();
    // 3 madera (taller)
    g = tileCtx(worldCanvas, T.WOOD);
    g.fillStyle = '#8a5a2b'; g.fillRect(0, 0, TS, TS);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#7a4d22' : '#96652f';
      g.fillRect(i * 8, 0, 6, TS);
    }
    noise(g, 200, ['#a8763c', '#5e3a17']);
    g.restore();
    // 4 columna (templo)
    g = tileCtx(worldCanvas, T.COLUMN);
    g.fillStyle = '#c9b183'; g.fillRect(0, 0, TS, TS);
    g.fillStyle = '#e6d3a8'; g.fillRect(10, 0, 44, TS);
    g.fillStyle = '#8f7a52';
    g.fillRect(0, 0, TS, 8); g.fillRect(0, TS - 8, TS, 8);
    for (let i = 0; i < 5; i++) g.fillRect(14 + i * 9, 8, 3, TS - 16);
    noise(g, 120, ['#d8c395', '#a89263']);
    g.restore();
    // 5 césped
    g = tileCtx(worldCanvas, T.GRASS);
    g.fillStyle = '#3e8948'; g.fillRect(0, 0, TS, TS);
    noise(g, 600, ['#357a3f', '#4a9c55', '#2f7038']);
    g.restore();
    // 6 piedra de suelo
    g = tileCtx(worldCanvas, T.STONE);
    g.fillStyle = '#3b3b4d'; g.fillRect(0, 0, TS, TS);
    g.strokeStyle = '#2a2a38'; g.lineWidth = 2;
    g.strokeRect(1, 1, 30, 30); g.strokeRect(33, 1, 30, 30);
    g.strokeRect(1, 33, 30, 30); g.strokeRect(33, 33, 30, 30);
    noise(g, 260, ['#45455a', '#31313f']);
    g.restore();
    // 7 tablones de suelo
    g = tileCtx(worldCanvas, T.PLANK);
    g.fillStyle = '#6e4a2f'; g.fillRect(0, 0, TS, TS);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#644329' : '#7b5435';
      g.fillRect(0, i * 16, TS, 14);
    }
    noise(g, 180, ['#8a5f3c', '#4d3320']);
    g.restore();
    // 8 mármol
    g = tileCtx(worldCanvas, T.MARBLE);
    g.fillStyle = '#c2a878'; g.fillRect(0, 0, TS, TS);
    g.fillStyle = '#b89d6e';
    g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
    noise(g, 140, ['#d5bd91', '#a08a5d']);
    g.restore();
    // 9 agua
    g = tileCtx(worldCanvas, T.WATER);
    g.fillStyle = '#2b4f8b'; g.fillRect(0, 0, TS, TS);
    g.fillStyle = '#3f7fb8';
    for (let i = 0; i < 4; i++) g.fillRect(0, 6 + i * 16, TS, 6);
    g.fillStyle = '#bcd9f0';
    for (let i = 0; i < 4; i++) g.fillRect(8 + (i % 2) * 24, 10 + i * 16, 14, 2);
    g.restore();
    // 10 techo oscuro
    g = tileCtx(worldCanvas, T.CEIL_DARK);
    g.fillStyle = '#1c1630'; g.fillRect(0, 0, TS, TS);
    noise(g, 200, ['#241d3d', '#150f26']);
    g.restore();
    // 11 techo de piedra
    g = tileCtx(worldCanvas, T.CEIL_STONE);
    g.fillStyle = '#23232f'; g.fillRect(0, 0, TS, TS);
    g.strokeStyle = '#191922'; g.lineWidth = 3;
    g.strokeRect(2, 2, 60, 60);
    noise(g, 200, ['#2d2d3c', '#1a1a24']);
    g.restore();
    // 12 puerta cerrada
    g = tileCtx(worldCanvas, T.DOOR);
    g.fillStyle = '#3a2a18'; g.fillRect(0, 0, TS, TS);
    g.fillStyle = '#6b4a2a'; g.fillRect(5, 3, 54, 61);
    g.fillStyle = '#4a3119';
    for (let i = 0; i < 5; i++) g.fillRect(8 + i * 11, 6, 8, 55);
    g.fillStyle = '#b8b8b8'; g.fillRect(27, 30, 10, 14);
    g.fillStyle = '#8a8a8a'; g.fillRect(30, 24, 4, 8);
    g.restore();
    // 13 puerta abierta (luz dorada)
    g = tileCtx(worldCanvas, T.DOOR_OPEN);
    g.fillStyle = '#3a2a18'; g.fillRect(0, 0, TS, TS);
    const grd = g.createLinearGradient(0, TS, 0, 0);
    grd.addColorStop(0, '#f2c14e'); grd.addColorStop(1, '#fff8dc');
    g.fillStyle = grd; g.fillRect(7, 5, 50, 59);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(20, 5, 8, 59);
    g.restore();
    // 14 cielo / vacío
    g = tileCtx(worldCanvas, T.SKY);
    g.fillStyle = '#5aa9e6'; g.fillRect(0, 0, TS, TS);
    g.restore();
    // 15 techo de madera
    g = tileCtx(worldCanvas, T.CEIL_WOOD);
    g.fillStyle = '#4a2f1c'; g.fillRect(0, 0, TS, TS);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#41291a' : '#553522'; g.fillRect(0, i * 16, TS, 14); }
    g.restore();
  })();

  /* ==================== SPRITES (billboards) ==================== */
  const S = { GUARDIAN: 0, NPC: 1, CHEST: 2, CHEST_OPEN: 3, BIT: 4, HUMO: 5, FILE: 6, FACILITADOR: 7, PORTAL: 8, TROPHY: 9 };
  const spriteCanvas = makeAtlasCanvas();

  function px(g, map, pal, scale, ox, oy) {
    for (let r = 0; r < map.length; r++) {
      for (let c = 0; c < map[r].length; c++) {
        const ch = map[r][c];
        if (ch === '.') continue;
        const col = pal[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(ox + c * scale, oy + r * scale, scale, scale);
      }
    }
  }

  const PIX = {
    guardian: {
      pal: { r: '#8058c9', w: '#ffffff', d: '#5a3e94', y: '#f2c14e', k: '#2a1c4a' },
      map: ['...rrrrrr...', '..rrrrrrrr..', '.rrrrrrrrrr.', '.rrwwrrwwrr.', '.rrkwrrkwrr.', '.rrrrrrrrrr.',
            '..rrryyrrr..', '.rrrrrrrrrr.', 'rrrrrrrrrrrr', 'rrrdddddrrrr', 'rrrdddddrrrr', 'rrrrrrrrrrrr',
            '.rr.rrrr.rr.', '.rr.rrrr.rr.', '..d..dd..d..', '..d..dd..d..']
    },
    npc: {
      pal: { h: '#2b2b2b', s: '#d69a6e', e: '#1b1b1b', c: '#7a4f9e', t: '#e0a63a', p: '#4a5b34', b: '#26150c' },
      map: ['...hhhhhh...', '..hhhhhhhh..', '..ssssssss..', '..sesssses..', '..ssssssss..', '...ssssss...',
            '..cccccccc..', '.ccccttcccc.', '.ccccttcccc.', 'sccccccccccs', '.cccccccccc.',
            '..pppppppp..', '..pppppppp..', '..pp....pp..', '..pp....pp..', '..bb....bb..']
    },
    facil: {
      pal: { h: '#5a3d2b', s: '#e8b088', e: '#1b1b1b', c: '#1f7a8c', t: '#d64545', p: '#31446e', b: '#26150c' },
      map: ['...hhhhhh...', '..hhhhhhhh..', '..ssssssss..', '..sesssses..', '..ssssssss..', '...ssssss...',
            '..cccccccc..', '.cccctccccc.', '.cccctccccc.', 'sccccccccccs', '.cccccccccc.',
            '..pppppppp..', '..pppppppp..', '..pp....pp..', '..pp....pp..', '..bb....bb..']
    },
    chest: {
      pal: { o: '#8a5a2b', y: '#e0a63a', l: '#f5d76e', d: '#5c3a18' },
      map: ['............', '.oooooooooo.', 'oooooooooooo', 'oyyyyyyyyyyo', 'oooooooooooo', 'ooooollooooo',
            'ooooollooooo', 'oooooooooooo', 'oddddddddddo', 'oooooooooooo', '.oooooooooo.', '............']
    },
    chestOpen: {
      pal: { o: '#8a5a2b', y: '#e0a63a', g: '#fff2b0', w: '#ffffff' },
      map: ['....gggg....', '..gggggggg..', '.gwwwwwwwwg.', 'gwggggggggwg', 'oggggggggggo', 'oooooooooooo',
            'oyyyyyyyyyyo', 'oooooooooooo', 'oooooooooooo', 'oooooooooooo', '.oooooooooo.', '............']
    },
    bit: {
      pal: { a: '#7ad7f0', e: '#123241', m: '#f2c14e', w: '#ffffff' },
      map: ['...aaaa...', '..aaaaaa..', '.aaaaaaaa.', '.aewaaewa.', '.aaaaaaaa.', '..ammmma..',
            '.aaaaaaaa.', '.a.aaaa.a.', '...a..a...', '..a....a..']
    },
    file: {
      pal: { w: '#f2f2f2', d: '#b9b9b9', e: '#d64545', m: '#333333', k: '#111111' },
      map: ['wwwwwwwwd...', 'wwwwwwwwdd..', 'wwwwwwwwwww.', 'wwwwwwwwwww.', 'weewwwweeww.', 'weewwwweeww.',
            'wwwwwwwwwww.', 'wwmmmmmmmww.', 'wwwwwwwwwww.', 'wmmwwwwwmmw.', 'wwwwwwwwwww.', 'w.ww...ww.w.']
    },
    portal: {
      pal: { a: '#c77df2', b: '#8058c9', c: '#5a3e94', d: '#2d2440' },
      map: ['...dddddd...', '..dcccccdd..', '.dcbbbbbbcd.', 'dcbbaaaabbcd', 'dcbaaaaaabcd', 'dcbaaaaaabcd',
            'dcbaaaaaabcd', 'dcbaaaaaabcd', 'dcbbaaaabbcd', '.dcbbbbbbcd.', '..dcccccdd..', '...dddddd...']
    },
    humo: {
      pal: { g: '#6c6c80', h: '#54546a', i: '#3e3e50', e: '#e34a4a', w: '#ffffff' },
      map: ['..hhgggghh..', '.hgggggggghh', 'gggggggggggg', 'ggeegggeegg.', 'ggeegggeegg.', 'gggggggggggg',
            'ggghhhhhgggg', 'ggggggggggg.', '.hgggggggggh', '..hhggggghh.', '...iihhhii..', '....iiii....']
    }
  };

  (function paintSpriteAtlas() {
    const put = (idx, spr, scale) => {
      const g = tileCtx(spriteCanvas, idx);
      const w = spr.map[0].length * scale, h = spr.map.length * scale;
      px(g, spr.map, spr.pal, scale, Math.floor((TS - w) / 2), TS - h);
      g.restore();
    };
    put(S.GUARDIAN, PIX.guardian, 4);
    put(S.NPC, PIX.npc, 4);
    put(S.CHEST, PIX.chest, 5);
    put(S.CHEST_OPEN, PIX.chestOpen, 5);
    put(S.BIT, PIX.bit, 5);
    put(S.HUMO, PIX.humo, 5);
    put(S.FILE, PIX.file, 5);
    put(S.FACILITADOR, PIX.facil, 4);
    put(S.PORTAL, PIX.portal, 5);
  })();

  function makeTexture(canvas) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const worldTex = makeTexture(worldCanvas);
  const spriteTex = makeTexture(spriteCanvas);

  /* UV de una casilla del atlas (con margen anti-sangrado) */
  const INSET = 0.5 / (TS * ATLAS_N);
  function uvOf(idx) {
    const col = idx % ATLAS_N, row = Math.floor(idx / ATLAS_N);
    const s = 1 / ATLAS_N;
    return { u0: col * s + INSET, v0: row * s + INSET, u1: (col + 1) * s - INSET, v1: (row + 1) * s - INSET };
  }

  /* ==================== CONSTRUCCIÓN DEL NIVEL ==================== */
  const WALL_H = 1.15;
  let levelBuf = null, levelCount = 0;

  function buildLevel(grid, opt) {
    const rows = grid.length, cols = grid[0].length;
    const v = [];
    const solid = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows) ? true : (grid[y][x] === '#');
    const water = (x, y) => (x >= 0 && y >= 0 && x < cols && y < rows && grid[y][x] === '~');

    function quad(p, uv, shade) {
      // p = [ [x,y,z] x4 ] en orden antihorario visto desde fuera
      const t = [[p[0], uv.u0, uv.v1], [p[1], uv.u1, uv.v1], [p[2], uv.u1, uv.v0],
                 [p[0], uv.u0, uv.v1], [p[2], uv.u1, uv.v0], [p[3], uv.u0, uv.v0]];
      for (const [pt, u, w] of t) v.push(pt[0], pt[1], pt[2], u, w, shade);
    }

    const uvWall = uvOf(opt.wall), uvFloor = uvOf(opt.floor);
    const uvCeil = opt.ceil >= 0 ? uvOf(opt.ceil) : null;
    const uvWater = uvOf(T.WATER);
    const uvDoor = uvOf(T.DOOR), uvDoorOpen = uvOf(T.DOOR_OPEN);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = grid[y][x];
        const x0 = x, x1 = x + 1, z0 = y, z1 = y + 1;
        if (cell === '#') {
          const isDoor = opt.doorAt && opt.doorAt.x === x && opt.doorAt.y === y;
          const uw = isDoor ? (opt.doorOpen ? uvDoorOpen : uvDoor) : uvWall;
          const sh = isDoor ? 1.15 : 1;
          // caras hacia vecinos no sólidos
          if (!solid(x, y - 1)) quad([[x1, 0, z0], [x0, 0, z0], [x0, WALL_H, z0], [x1, WALL_H, z0]], uw, 0.85 * sh); // norte
          if (!solid(x, y + 1)) quad([[x0, 0, z1], [x1, 0, z1], [x1, WALL_H, z1], [x0, WALL_H, z1]], uw, 0.85 * sh); // sur
          if (!solid(x - 1, y)) quad([[x0, 0, z0], [x0, 0, z1], [x0, WALL_H, z1], [x0, WALL_H, z0]], uw, 0.65 * sh); // oeste
          if (!solid(x + 1, y)) quad([[x1, 0, z1], [x1, 0, z0], [x1, WALL_H, z0], [x1, WALL_H, z1]], uw, 0.65 * sh); // este
          if (!uvCeil) quad([[x0, WALL_H, z0], [x0, WALL_H, z1], [x1, WALL_H, z1], [x1, WALL_H, z0]], uw, 1.05); // techo del muro
        } else {
          const fUV = water(x, y) ? uvWater : uvFloor;
          const fy = water(x, y) ? -0.12 : 0;
          quad([[x0, fy, z1], [x1, fy, z1], [x1, fy, z0], [x0, fy, z0]], fUV, water(x, y) ? 0.95 : 0.78);
          if (uvCeil) quad([[x0, WALL_H, z0], [x0, WALL_H, z1], [x1, WALL_H, z1], [x1, WALL_H, z0]], uvCeil, 0.5);
        }
      }
    }
    const data = new Float32Array(v);
    if (!levelBuf) levelBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, levelBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    levelCount = data.length / 6;
    return levelCount;
  }

  /* ==================== RENDER ==================== */
  let billboardBuf = null;
  const projM = perspective(70, scene.width / scene.height, 0.05, 40);

  function bindAttribs() {
    const stride = 6 * 4;
    gl.enableVertexAttribArray(A.pos);
    gl.vertexAttribPointer(A.pos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(A.uv);
    gl.vertexAttribPointer(A.uv, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(A.shade);
    gl.vertexAttribPointer(A.shade, 1, gl.FLOAT, false, stride, 20);
  }

  /* cam: {x, z, yaw, eye}  sprites: [{x,z,tile,size,base,shade}] */
  function render(cam, sprites, fx) {
    fx = fx || {};
    const fog = fx.fogColor || [0.10, 0.11, 0.18];
    const fogDist = fx.fogDist || 12;
    const tint = fx.tint || [1, 1, 1];

    gl.viewport(0, 0, scene.width, scene.height);
    gl.clearColor(fog[0], fog[1], fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const eye = cam.eye === undefined ? 0.58 : cam.eye;
    const dx = Math.sin(cam.yaw), dz = -Math.cos(cam.yaw);
    const view = lookAt(cam.x, eye + (fx.bob || 0), cam.z, cam.x + dx, eye + (fx.bob || 0) + (fx.pitch || 0), cam.z + dz);

    gl.useProgram(prog);
    gl.uniformMatrix4fv(U.proj, false, projM);
    gl.uniformMatrix4fv(U.view, false, view);
    gl.uniform3fv(U.fogColor, fog);
    gl.uniform1f(U.fogDist, fogDist);
    gl.uniform3fv(U.tint, tint);
    gl.uniform1i(U.tex, 0);

    // mundo
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, worldTex);
    gl.bindBuffer(gl.ARRAY_BUFFER, levelBuf);
    bindAttribs();
    gl.drawArrays(gl.TRIANGLES, 0, levelCount);

    // billboards
    if (sprites && sprites.length) {
      const rx = Math.cos(cam.yaw), rz = Math.sin(cam.yaw); // vector derecha de la cámara
      const arr = [];
      const sorted = sprites.slice().sort((a, b) =>
        ((b.x - cam.x) ** 2 + (b.z - cam.z) ** 2) - ((a.x - cam.x) ** 2 + (a.z - cam.z) ** 2));
      for (const s of sorted) {
        const size = s.size || 0.7, base = s.base === undefined ? 0 : s.base, sh = s.shade === undefined ? 1 : s.shade;
        const hw = size / 2;
        const ax = s.x - rx * hw, az = s.z - rz * hw;
        const bx = s.x + rx * hw, bz = s.z + rz * hw;
        const y0 = base, y1 = base + size;
        const uv = uvOf(s.tile);
        const q = [[ax, y0, az, uv.u0, uv.v1], [bx, y0, bz, uv.u1, uv.v1], [bx, y1, bz, uv.u1, uv.v0],
                   [ax, y0, az, uv.u0, uv.v1], [bx, y1, bz, uv.u1, uv.v0], [ax, y1, az, uv.u0, uv.v0]];
        for (const p of q) arr.push(p[0], p[1], p[2], p[3], p[4], sh);
      }
      if (!billboardBuf) billboardBuf = gl.createBuffer();
      gl.bindTexture(gl.TEXTURE_2D, spriteTex);
      gl.bindBuffer(gl.ARRAY_BUFFER, billboardBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW);
      bindAttribs();
      gl.disable(gl.CULL_FACE);
      gl.drawArrays(gl.TRIANGLES, 0, arr.length / 6);
      gl.enable(gl.CULL_FACE);
    }
  }

  function clearScene(rgb) {
    gl.viewport(0, 0, scene.width, scene.height);
    gl.clearColor(rgb[0], rgb[1], rgb[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  return { gl, ctx, hud, scene, W: HW, H: HH, T, S, buildLevel, render, clearScene, spriteCanvas, worldCanvas };
})();
