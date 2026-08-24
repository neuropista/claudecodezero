# La Senda del Director 🎮

**Un RPG para aprender Claude Code desde cero, sin ser programador — en dos ediciones: 2D cenital y 3D en primera persona.**

Basado en el guion docente *"Claude Code sin ser programador"* (Neuropista · Andy García Peña).

![Género](https://img.shields.io/badge/g%C3%A9nero-RPG%20educativo-purple) ![Tecnología](https://img.shields.io/badge/tecnolog%C3%ADa-HTML5%20%2B%20Canvas%20%2B%20WebGL-blue) ![Idioma](https://img.shields.io/badge/idioma-espa%C3%B1ol-green) ![Dependencias](https://img.shields.io/badge/dependencias-ninguna-brightgreen)

## 🕹️ Cómo jugar

**No necesitas instalar nada.** Descarga o clona el repositorio y abre en tu navegador:

| Archivo | Edición |
|---------|---------|
| `index.html` | **2D cenital** — estilo RPG clásico de los 90, funciona en cualquier equipo |
| `index3d.html` | **3D en primera persona** — dungeon crawler con **niveles de dificultad** (requiere WebGL) |
| `vex/index.html` | **VEX: Colapso Neuronal** — roguelite de acción en WebGL2, con todo el arte y el audio generados por código (requiere WebGL2) |

```
git clone https://github.com/neuropista/claudecodezero.git
```

O sírvelo localmente:

```
python3 -m http.server 8000
# 2D:  http://localhost:8000/index.html
# 3D:  http://localhost:8000/index3d.html
# VEX: http://localhost:8000/vex/
```

## 📖 La historia

**El Humo** —el espíritu de las promesas falsas y la desinformación— ha convencido al Reino Digital de que solo los ingenieros pueden dirigir a los practicantes digitales. Tú, un perfil *no técnico*, recorrerás la Senda del Director junto a **BIT**, tu practicante incansable, para demostrar lo contrario: no necesitas programar, necesitas **dirigir, revisar y decidir**.

## 🗺️ Las 6 zonas del conocimiento

| Zona | Tema (bloque del guion) |
|------|------------------------|
| 1. Aldea Neuropista | Qué es y qué no es Claude Code, la metáfora del practicante, la regla antihumo |
| 2. Bosque de la Instalación | Instalar Claude Desktop, la pestaña Code, troubleshooting |
| 3. Cavernas del Caos | Tu primera delegación: ordenar, extraer, consolidar — *pide el plan antes de autorizar* |
| 4. Taller del Creador | Método CFN (Contexto · Formato · Norte) y mini-herramientas |
| 5. Templo del Semáforo | 🟢 Verde, 🟡 Ámbar, 🔴 Rojo: qué delegar y qué no |
| 6. Torre del Lunes | El proyecto "Mi asistente de lunes" + **jefe final: EL HUMO** |

## ⚔️ Mecánicas

- **Menú inicial**: recorre la *aventura completa* o *elige un nivel* para repasar solo esa parte del camino. Tu avance se guarda automáticamente.
- **Guardianes**: responde sus preguntas (extraídas del guion) para abrir la puerta de cada zona.
- **Acierto** ✅: ganas XP, la historia avanza y tu medidor de confianza sube de A hacia E.
- **Error** ❌: pierdes 1 de 3 corazones… y algo inusual sucede: El Humo cubre la zona de niebla, la carpeta caótica suelta archivos que te persiguen, o un *glitch* reorganiza el mapa. Sin corazones, la zona se reinicia. ¡Como en los 90!
- **Cofres** 📜: contienen los 8 *prompts legendarios* del banco de prompts real del guion — quedan guardados en tu **códex** para copiarlos y usarlos en la pestaña Code de verdad.
- **Jefe final**: clasifica las afirmaciones de El Humo como **VERDAD** o **HUMO** para disiparlo.
- **Logros** 🏆: basados en la rúbrica del proyecto integrador (Regla de Oro, Semáforo Interior, Detector de Humo…).

## 🧊 Edición 3D: dungeon crawler con dificultad

La edición 3D recorre **las mismas 6 zonas y las mismas preguntas**, pero en primera persona y con movimiento paso a paso por rejilla, como los *dungeon crawlers* de los 90 (Eye of the Beholder, Ultima Underworld). Incluye minimapa que se revela al explorar, niebla por distancia, texturas y sprites generados por código, y a **BIT** flotando siempre a tu lado.

### Elige tu nivel de dificultad

| Nivel | Corazones | Opciones | Tiempo | Guardianes | Extra | XP |
|-------|-----------|----------|--------|-----------|-------|-----|
| 🟢 **APRENDIZ** | 5 | 3 | sin límite | 3 por zona | para empezar sin miedo | ×1 |
| 🟡 **PROFESIONAL** | 3 | 4 | 30 s | 4 por zona | el reto equilibrado | ×2 |
| 🔴 **DIRECTOR** | 2 | 4 | 15 s | 5 por zona | **+18 preguntas EXPERTAS** de detalle fino del guion | ×3 |

Se elige al empezar una aventura, al entrar a un nivel de repaso, o cuando quieras desde el menú. Agotar el tiempo cuenta como error, responder con más de la mitad del tiempo restante da bonus ⚡, y las preguntas expertas valen el doble ★.

### Efectos 3D al fallar

- **El Humo**: la niebla se cierra sobre ti y no ves más allá de tu nariz.
- **La carpeta caótica**: archivos sin nombre te persiguen por los pasillos; si te alcanzan, vuelves al inicio.
- **Glitch**: te teletransporta a otro punto del mapa y te desorienta.

## ⌨️ Controles

| Tecla | Acción |
|-------|--------|
| Flechas / WASD | Moverte · navegar menús |
| ESPACIO / Enter | Hablar, responder, confirmar |
| 1–4 | Elegir respuesta directamente |
| M | Sonido on/off |
| ESC | Volver al menú (guarda tu avance) |
| Ratón / táctil | Todo se puede jugar con clics; en móvil aparece una cruceta |

**Solo en 3D** (movimiento por rejilla, paso a paso):

| Tecla | Acción |
|-------|--------|
| ↑ / ↓ | Avanzar / retroceder una casilla |
| ← / → (o Q/E) | Girar 90 grados |
| A / D | Desplazamiento lateral |
| ESPACIO | Interactuar con lo que tengas enfrente |

## 🛠️ Tecnología

HTML5 + Canvas + JavaScript puro. Sin dependencias, sin build, sin frameworks. Pixel art dibujado por código y sonido chiptune generado con WebAudio — coherente con el espíritu del guion: *funciona al abrirlo en tu navegador*.

```
index.html               → edición 2D
index3d.html             → edición 3D
css/style.css            → estética retro 2D
css/style3d.css          → estética del crawler 3D
js/engine.js             → motor 2D: render, input, audio, sprites
js/game.js               → lógica 2D
js/engine3d.js           → motor 3D en WebGL puro: shaders, texturas y
                           sprites procedurales, mallas de nivel, billboards
js/game3d.js             → lógica 3D: dificultad, rejilla, eventos, jefe
js/audio.js              → chiptune compartido (WebAudio)
js/data/questions.js     → banco de preguntas por zona + jefe final
js/data/questions_hard.js→ banco EXPERTO (dificultad DIRECTOR)
js/data/story.js         → historia, diálogos, mapas, códex y logros
vex/                     → VEX: Colapso Neuronal (juego aparte, 45 módulos ES)
```

Ninguna librería externa: el 3D está escrito directamente sobre WebGL, y todas las texturas, sprites y sonidos se generan por código al arrancar.

---

## 🧠 VEX: Colapso Neuronal

Además de las dos ediciones docentes, el repositorio incluye **[VEX: Colapso Neuronal](vex/)**, un roguelite de acción y plataformas independiente del material educativo.

Vex es una consciencia que corre dentro de una red neuronal que se apaga: cuatro biomas, 25 sectores generados por procedimiento, un jefe de tres fases por bioma y un arma de seis módulos que se combinan entre sí.

Está construido con las mismas reglas llevadas al extremo: **ni motores, ni librerías, ni un solo archivo de imagen o de audio**. Renderizador 2D propio en WebGL2 con batching por instancias, iluminación dinámica con sombras por raycast, partículas en GPU con transform feedback y cadena de post-proceso; audio íntegramente sintetizado con música adaptativa por capas; y una simulación determinista de paso fijo que graba y reproduce partidas enteras desde la semilla.

```
python3 -m http.server 8000 --directory vex   → http://localhost:8000
```

Trae sus propias auto-pruebas en `vex/pruebas/`. Los detalles técnicos, los controles y las mediciones están en **[vex/README.md](vex/README.md)**.

---

© Neuropista · Material educativo basado en el guion docente "Claude Code sin ser programador".
