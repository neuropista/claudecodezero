# La Senda del Director 🎮

**Un RPG 2D estilo años 90 para aprender Claude Code desde cero, sin ser programador.**

Basado en el guion docente *"Claude Code sin ser programador"* (Neuropista · Andy García Peña).

![Género](https://img.shields.io/badge/g%C3%A9nero-RPG%20educativo-purple) ![Tecnología](https://img.shields.io/badge/tecnolog%C3%ADa-HTML5%20%2B%20Canvas-blue) ![Idioma](https://img.shields.io/badge/idioma-espa%C3%B1ol-green)

## 🕹️ Cómo jugar

**No necesitas instalar nada**: descarga o clona este repositorio y abre `index.html` en tu navegador (Chrome, Edge, Firefox o Safari).

```
git clone https://github.com/neuropista/claudecodezero.git
```

O si prefieres servirlo localmente:

```
python3 -m http.server 8000
# luego abre http://localhost:8000
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

## ⌨️ Controles

| Tecla | Acción |
|-------|--------|
| Flechas / WASD | Moverte · navegar menús |
| ESPACIO / Enter | Hablar, responder, confirmar |
| 1–4 | Elegir respuesta directamente |
| M | Sonido on/off |
| ESC | Volver al menú (guarda tu avance) |
| Ratón / táctil | Todo se puede jugar con clics; en móvil aparece una cruceta |

## 🛠️ Tecnología

HTML5 + Canvas + JavaScript puro. Sin dependencias, sin build, sin frameworks. Pixel art dibujado por código y sonido chiptune generado con WebAudio — coherente con el espíritu del guion: *funciona al abrirlo en tu navegador*.

```
index.html          → punto de entrada
css/style.css       → estética retro (scanlines, pixelado, cruceta táctil)
js/engine.js        → motor: render, input, audio chiptune, sprites
js/game.js          → estados del juego, mapas, eventos, jefe, guardado
js/data/questions.js→ banco de preguntas por zona + jefe final
js/data/story.js    → historia, diálogos, mapas, códex y logros
```

---

© Neuropista · Material educativo basado en el guion docente "Claude Code sin ser programador".
