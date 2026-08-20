'use strict';
/* =====================================================================
   Historia, mapas, códex y logros — "La Senda del Director"
   Mapas: 20 columnas x 11 filas.
   Leyenda: # muro · . suelo · ~ agua/humo · P inicio · G guardián
            C cofre · N aldeano · F facilitador · D puerta · B jefe
   ===================================================================== */

const STORY = {

  opening: [
    { sp: 'BIT', t: '¡Bip-bip! Despierta... ¡El Humo ha cubierto el Reino Digital! La gente cree que solo los "ingenieros de sistemas" pueden dirigir a los practicantes digitales.' },
    { sp: 'BIT', t: 'Yo soy BIT, tu practicante incansable. Sé leer, crear y modificar archivos... pero necesito a alguien que me DIRIJA. Alguien como tú.' },
    { sp: 'BIT', t: 'Recorre las 6 zonas del conocimiento, responde a los guardianes y demuestra que no hace falta programar para ser DIRECTOR. ¡Cuidado: cada error alimenta a El Humo!' },
    { sp: 'BIT', t: 'Tienes 3 corazones por zona. Si los pierdes todos... la carpeta caótica te absorbe y la zona se reinicia. ¡Vamos!' }
  ],

  zones: [
    {
      name: 'Aldea Neuropista',
      topic: 'Qué es y qué no es Claude Code',
      theme: { f1: '#3e8948', f2: '#357a3f', wall: 'tree', wc1: '#265c2e', wc2: '#6b4226', water: '#3f7fb8' },
      intro: [
        { sp: 'FACILITADOR', t: 'Bienvenido/a a la Aldea Neuropista. Aquí empezó todo: "eso de Claude Code es para ingenieros"... un pensamiento con fecha de vencimiento.' },
        { sp: 'FACILITADOR', t: 'Los guardianes morados custodian el conocimiento del territorio: qué es, qué no es, y la metáfora del practicante. Acércate y pulsa ESPACIO para responder.' },
        { sp: 'BIT', t: 'Responde bien a 5 guardianes y la puerta del este se abrirá. ¡Los cofres guardan PROMPTS LEGENDARIOS para tu códex!' }
      ],
      npc: [
        'Soy enfermera y pensaba que esto era para programadores. Ahora Claude Code me consolida los turnos del mes. ¡Nadie escribió código!',
        'Trabajo en retail. Mi practicante digital ordenó 3 años de facturas en una tarde. Yo solo revisé su plan y dije "adelante".',
        'Recuerda la Gran Idea: tú diriges, revisas y decides. Quien sabe delegar bien, multiplica su capacidad.'
      ],
      complete: 'Has entendido el territorio: Claude Code no es magia ni es solo para programadores. ¡La senda hacia el Bosque de la Instalación se abre!',
      map: [
        '####################',
        '#..N.....#.....#...#',
        '#.##..G..#..G..#.#.#',
        '#.##.....#.....#.#.#',
        '#P....##....##...#.#',
        '#.....##.G..##.....D',
        '#.##.....#.....###.#',
        '#.##..G..#..C..###.#',
        '#........#.......N.#',
        '#.........G........#',
        '####################'
      ]
    },
    {
      name: 'Bosque de la Instalación',
      topic: 'Instalar Claude Desktop y abrir la pestaña Code',
      theme: { f1: '#2e6b3a', f2: '#285e33', wall: 'tree', wc1: '#1d4426', wc2: '#5a3d2b', water: '#3f7fb8' },
      intro: [
        { sp: 'BIT', t: 'El Bosque de la Instalación... aquí muchos viajeros se pierden. Es el momento de mayor deserción emocional, ¡pero no el tuyo!' },
        { sp: 'BIT', t: 'El río de las Descargas Falsas cruza el bosque. Recuerda: SOLO se descarga desde la página oficial. Los guardianes probarán tu checklist.' }
      ],
      npc: [
        'Mi laptop es de la empresa y TI no me dejaba instalar... usé claude.ai web como plan B y completé la instalación después. ¡No me quedé atrás!'
      ],
      complete: '¡Instalación verificada! ✅ Listo. La pestaña Code está abierta: tu lugar de trabajo te espera en las Cavernas del Caos.',
      map: [
        '####################',
        '#P...#....~~....G..#',
        '#....#.G..~~.......#',
        '#.##.#....~~..##.#.#',
        '#.##......~~..##.#.#',
        '#..G..........G..#.#',
        '#.#......~~......#.#',
        '#.#..##..~~..##....D',
        '#....##..~~..##.G#.#',
        '#.C......~~....N.#.#',
        '####################'
      ]
    },
    {
      name: 'Cavernas del Caos',
      topic: 'Tu primera delegación: ordenar, extraer, consolidar',
      theme: { f1: '#3b3b4d', f2: '#343445', wall: 'rock', wc1: '#23232f', wc2: '#4d4d63', water: '#2b3a6b' },
      intro: [
        { sp: 'BIT', t: 'Las Cavernas del Caos: aquí viven las carpetas "Descargas_Caos" con archivos como IMG_2043.png y documento_final_v3_FINAL.docx...' },
        { sp: 'BIT', t: 'Es hora de tu primera delegación. La regla de oro brilla en las paredes: PIDE EL PLAN ANTES DE AUTORIZAR. No la olvides o el caos te tragará.' }
      ],
      npc: [
        'Yo autoricé sin leer el plan una vez... una sola vez. Ahora reviso todo. El practicante es brillante, pero el criterio lo pongo yo.'
      ],
      complete: '¡El caos retrocede! Sabes delegar con supervisión: plan primero, confirmación después. El Taller del Creador te espera.',
      map: [
        '####################',
        '#P.....#.....#...C.#',
        '#..##..#..G..#..##.#',
        '#..##.....#........#',
        '#.....##..#....##..#',
        '#..G..##..#.G..##..#',
        '#.....#........#...#',
        '#.##..#..##..#.##.D#',
        '#.##.....##..#.....#',
        '#....N....G..#..G..#',
        '####################'
      ]
    },
    {
      name: 'Taller del Creador',
      topic: 'Método CFN: crea tu mini-herramienta',
      theme: { f1: '#6e4a2f', f2: '#644329', wall: 'wood', wc1: '#4a2f1c', wc2: '#8a5a2b', water: '#3f7fb8' },
      intro: [
        { sp: 'FACILITADOR', t: 'El Taller del Creador. Aquí ocurre el salto identitario: pasar de "organizo archivos" a "CONSTRUYO herramientas".' },
        { sp: 'FACILITADOR', t: 'Tres letras mágicas mueven este taller: C-F-N. Contexto, Formato, Norte. Los guardianes las custodian celosamente.' },
        { sp: 'BIT', t: '¡Lo que hagas aquí lo contarás después! Páginas, calculadoras, tableros... sin escribir una línea de código.' }
      ],
      npc: [
        'Soy Rosa. Ayer "especifiqué un requerimiento" para mi cotizador. El facilitador dijo que eso lo cobra caro un consultor. ¡Y yo lo hice gratis!'
      ],
      complete: '¡Tu identidad ha cambiado! Ya no solo organizas: construyes. El Templo del Semáforo pondrá a prueba tu criterio.',
      map: [
        '####################',
        '#P..#.....#....#...#',
        '#...#..G..#..G.#.#.#',
        '#.#.#.....#....#.#.#',
        '#.#...##.....#...#.#',
        '#.#.G.##..C..#.G...#',
        '#.#....#.....#...#.#',
        '#...##.#..#..###.#.#',
        '#.#.##....#....#.#D#',
        '#.#....N..#..G.....#',
        '####################'
      ]
    },
    {
      name: 'Templo del Semáforo',
      topic: 'Verde, ámbar, rojo: qué delegar y qué no',
      theme: { f1: '#c2a878', f2: '#b89d6e', wall: 'column', wc1: '#8f7a52', wc2: '#e6d3a8', water: '#3f7fb8' },
      intro: [
        { sp: 'BIT', t: 'El Templo del Semáforo. Tres luces antiguas iluminan sus salas: 🟢 verde, 🟡 ámbar y 🔴 roja.' },
        { sp: 'BIT', t: 'Aquí no se mide tu velocidad sino tu CRITERIO: saber cuándo delegar, cuándo supervisar paso a paso... y cuándo decir NO (todavía).' }
      ],
      npc: [
        'Guardo la tarjeta del semáforo bajo la almohada: "cualquier cosa que no podrías explicar si sale mal"... es ROJA. Así de simple.'
      ],
      complete: 'Tu semáforo interior está calibrado. Solo queda la Torre del Lunes... y su inquilino: EL HUMO. Prepárate.',
      map: [
        '####################',
        '#...#...P....#.....#',
        '#.G.#.#.....#...G..#',
        '#....#..###..#.....#',
        '#.##...#...#...##..#',
        '#..G..#.....#......#',
        '#.##...#...#...##..#',
        '#..C.#..###..#.N...#',
        '#.G..#.......#..G..#',
        '#........D.........#',
        '####################'
      ]
    },
    {
      name: 'Torre del Lunes',
      topic: 'El asistente de lunes + jefe final: EL HUMO',
      theme: { f1: '#2d2440', f2: '#282039', wall: 'brick', wc1: '#1c1630', wc2: '#4a3d6b', water: '#2b3a6b' },
      intro: [
        { sp: 'BIT', t: 'La Torre del Lunes... En su cima vive EL HUMO: el espíritu de las promesas falsas, el "aprende a programar en una tarde", el "la IA nunca falla"...' },
        { sp: 'BIT', t: 'Tres guardianes custodian el proyecto integrador: "Mi asistente de lunes". Respóndeles y el portal del jefe se abrirá.' },
        { sp: 'BIT', t: 'Contra El Humo necesitarás TODO lo aprendido. Distinguirás VERDAD de HUMO. ¡Es la batalla final, Director!' }
      ],
      npc: [
        'Completé 4 de 5 casillas de la rúbrica... ¡logro completo! Mi instructivo del día 5 es mi certificado práctico. ¡Tú puedes!'
      ],
      complete: '',
      map: [
        '####################',
        '#........B.........#',
        '#....##......##....#',
        '#..G.##..##..##.G..#',
        '#....#....#...#....#',
        '#.##...##...##...#.#',
        '#....#....G...#....#',
        '#.#....##..##....#.#',
        '#.#.C..##..##..N.#.#',
        '#........P.........#',
        '####################'
      ]
    }
  ],

  /* Guardianes requeridos por zona para abrir la puerta */
  needed: [5, 5, 5, 5, 5, 3],

  events: {
    humo: '¡EL HUMO se espesa! La niebla de la confusión cubre la zona...',
    archivos: '¡La CARPETA CAÓTICA despierta! ¡Archivos sin nombre te persiguen! ¡Corre!',
    glitch: '¡GLITCH! El mapa se reorganiza... has perdido el rumbo.'
  },

  hitByFile: '¡"documento_final_v3_FINAL.docx" te alcanzó! Vuelves al inicio de la zona...',

  defeats: [
    'La carpeta "Descargas_Caos" te ha absorbido. Entre 60 archivos sin nombre, escuchas la voz de BIT: "¡Pide el plan y vuelve a intentarlo!"',
    'documento_final_v3_FINAL(2).docx te envolvió en sus versiones infinitas... El Humo ríe. Pero un Director aprende del error y reinicia.',
    'Te quedaste sin oportunidades. El Humo susurra: "esto era para ingenieros"... MENTIRA. Respira, revisa y vuelve a la carga.'
  ],

  boss: {
    name: 'EL HUMO',
    intro: [
      { sp: 'EL HUMO', t: 'Jajaja... ¿TÚ? ¿Un perfil "no técnico" queriendo ser Director? Sin saber programar no eres NADIE...' },
      { sp: 'BIT', t: '¡No lo escuches! ¡Es puro humo! Clasifica sus afirmaciones: VERDAD o HUMO. Cada acierto lo debilita. ¡6 golpes y se disipa!' }
    ],
    taunts: [
      '¿Lo ves? Necesitas un ingeniero...',
      'Tu criterio se nubla... delícioso...',
      'Acepta todo sin revisar... confía en míii...',
      'La terminal te espera, mortal...'
    ],
    win: [
      { sp: 'EL HUMO', t: 'Nooo... mi niebla... se disipa... ¿Cómo puede un no-programador... tener tanto... CRITERIO...?' },
      { sp: 'BIT', t: '¡Lo lograste! El Humo se ha disipado. El Reino Digital vuelve a ver con claridad. ¡Eres oficialmente DIRECTOR/A!' }
    ]
  },

  victory: [
    'Hoy no aprendiste una herramienta.',
    'Cambiaste de rol: dejaste de ser usuario',
    'y empezaste a ser DIRECTOR.',
    'La práctica de esta semana decide si ese rol se queda.'
  ]
};

/* ---------- Códex: prompts legendarios (banco de prompts, sección 9) ---------- */
const CODEX_PROMPTS = [
  { id: 'estructura', title: 'Estructura Maestra',
    text: 'Analiza la carpeta [nombre] y proponme una estructura de subcarpetas lógica para mi trabajo como [tu rol]. Muéstrame el plan antes de mover nada.' },
  { id: 'renombrado', title: 'Renombrado Legendario',
    text: 'Renombra todos los archivos de esta carpeta con el formato [AAAA-MM-DD]_[tema]_[descripción breve]. Lista primero los cambios que harás y espera mi confirmación.' },
  { id: 'extractor', title: 'Ojo Extractor',
    text: 'Lee los PDF de esta carpeta y extrae [datos que necesitas]. Crea un Excel con una fila por documento y márcame en otra columna cualquier dato que no hayas podido encontrar.' },
  { id: 'resumen', title: 'Resumen Ejecutivo',
    text: 'A partir de estos [informes/notas/actas], redacta un resumen ejecutivo de 1 página en Word para [audiencia], con los 3 hallazgos principales y 2 recomendaciones.' },
  { id: 'calculadora', title: 'Calculadora Personal',
    text: 'Crea una página HTML que funcione al abrirla en mi navegador: una calculadora de [lo que calculas en tu trabajo], en español, con diseño limpio y moderno. Sabré que funciona cuando pueda [prueba concreta].' },
  { id: 'tablero', title: 'Tablero Visual',
    text: 'Crea un tablero visual en HTML para hacer seguimiento de [qué]. Debe permitir marcar avances y verse bien en el celular. Hazme máximo 3 preguntas antes de empezar.' },
  { id: 'iteracion', title: 'Iteración Fina',
    text: 'Me gusta lo que hiciste, pero necesito 2 cambios: [cambio 1] y [cambio 2]. Mantén todo lo demás igual.' },
  { id: 'instructivo', title: 'Instructivo Semanal',
    text: 'Genera un instructivo en Word, paso a paso y sin tecnicismos, de cómo repetir esta tarea cada semana, pensado para alguien que nunca ha usado Claude Code.' }
];

/* ---------- Logros (rúbrica de la sección 8) ---------- */
const ACHIEVEMENTS = [
  { id: 'primer_paso', name: 'Primer Paso', desc: 'Completaste la Aldea Neuropista' },
  { id: 'regla_de_oro', name: 'Regla de Oro', desc: 'Cavernas del Caos sin perder corazones: pediste el plan antes de ejecutar' },
  { id: 'semaforo_interior', name: 'Semáforo Interior', desc: 'Templo del Semáforo sin perder corazones' },
  { id: 'detector_de_humo', name: 'Detector de Humo', desc: 'Venciste a EL HUMO' },
  { id: 'coleccionista', name: 'Coleccionista', desc: 'Reuniste los 8 prompts legendarios' },
  { id: 'director', name: 'Director/a Certificado/a', desc: 'Completaste la aventura completa' }
];
