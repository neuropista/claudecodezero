# VEX — Colapso Neuronal

Roguelite de acción y plataformas que corre en el navegador. **Cero motores, cero
librerías, cero assets externos y cero paso de compilación**: todo el arte y todo
el audio se generan por código en tiempo de ejecución.

![Tecnología](https://img.shields.io/badge/tecnolog%C3%ADa-WebGL2%20%2B%20Web%20Audio-blue)
![Dependencias](https://img.shields.io/badge/dependencias-0-brightgreen)
![Assets](https://img.shields.io/badge/assets-0%20archivos-brightgreen)
![Módulos](https://img.shields.io/badge/m%C3%B3dulos-45-informational)
![Idioma](https://img.shields.io/badge/idioma-espa%C3%B1ol-green)

---

## Cómo jugar

### La forma fácil: un solo archivo

Descarga **[`vex.html`](vex.html)** y ábrelo con doble clic. Ya está: el juego
entero —código, arte y sonido— cabe en ese archivo, no necesita servidor ni
conexión.

> **Cuidado:** `index.html` **no** funciona por sí solo. Carga sus 45 módulos
> desde `src/`, y además el navegador bloquea los módulos ES cuando se abre un
> archivo con doble clic (protocolo `file://`). Si lo intentas, la propia página
> te lo explicará y te mandará aquí.

### La forma normal: servir la carpeta

Para tocar el código, hay que servirlo por HTTP. Desde la raíz del repositorio:

```bash
python3 -m http.server 8000 --directory vex
# abre http://localhost:8000
```

O sirviendo todo el repositorio:

```bash
python3 -m http.server 8000
# abre http://localhost:8000/vex/
```

Así los módulos se cargan sueltos, sin ningún paso de compilación: lo que edites
en `src/` se ve al recargar.

Hace falta un navegador con **WebGL2**: Chrome, Edge, Firefox o Safari 15+.
El audio arranca con la primera tecla o el primer clic (política de autoplay).

### Controles

| Acción | Teclado | Mando |
|---|---|---|
| Mover | `A`/`D` o flechas | stick izquierdo |
| Saltar / doble salto | `Espacio`, `K` | A |
| Dash (con invulnerabilidad) | `Mayús`, `L` | LB / LT |
| Disparar | clic izquierdo, `J` | RB / RT |
| Apuntar | ratón | stick derecho |
| Parry (ventana corta) | `F`, `X` | B |
| Gancho de energía | clic derecho, `E` | X |
| Cambiar módulo | `Q`, `Tab` | Y |
| Bajar de plataforma | `S` + salto | abajo + A |
| Pausa | `Esc`, `P` | Start |

Depuración: `F1` estadísticas · `F2` recarga de shaders en caliente ·
`F3` reproducir la repetición · `F4` avance tick a tick · `F5` geometría de sombras.

---

## El juego

**Vex** es una consciencia que corre dentro de una red neuronal que se está
apagando. La partida atraviesa cuatro biomas —Corteza Externa, Campo Sináptico,
Núcleo Térmico y El Vacío— y 25 sectores generados por procedimiento, cada bioma
cerrado por el **Fragmento Primario**, un jefe de tres fases con dos ojos
orbitales que son sus puntos débiles.

### Cómo funciona el combate

Tres reglas atraviesan a todos los enemigos y son las que le dan ritmo:

**Aguante.** Además de vida, cada enemigo tiene una postura. El daño acumulado
la rompe y lo deja **aturdido** casi un segundo, quieto y recibiendo un 60 % más
de daño. Si le das respiro, la recupera. El combate deja de ser vaciar una barra
y pasa a ser buscar el momento de romperla.

**Puntos débiles.** Cada tipo tiene un sitio donde duele de verdad: la espalda
del guardián (×3), el ojo del dron, el núcleo del bombardero. Acertar ahí
multiplica el daño y rompe el aguante casi el doble de rápido. Cuando estás
cerca, el punto se marca con un destello tenue para que se aprenda.

**Telegrafía.** Todo ataque comprometido dibuja **su área real** antes de salir:
una franja para las embestidas, un cono para los abanicos, un círculo para las
explosiones. La barra de relleno avanza con el temporizador real del ataque, así
que dice a la vez *dónde* y *cuándo*. Y mientras el enemigo está comprometido,
**se le puede cortar el ataque con un parry**: queda aturdido y sales ganando el
intercambio. Un bombardero devuelto sale disparado hacia donde apuntabas y
explota para el otro bando.

### El bestiario

| Enemigo | Qué te obliga a hacer |
|---|---|
| **Dron Centinela** | Fuego de supresión a media distancia: te obliga a moverte |
| **Rastreador** | Persigue por el suelo, salta huecos y muros y embiste |
| **Volador Sináptico** | Vuela en onda y se te tira encima si te quedas quieto |
| **Guardián con Escudo** | Bloquea de frente: hay que rodearlo y darle en la espalda |
| **Enjambre** | Llena el espacio; hay que limpiarlo rápido |
| **Bombardero Inestable** | Te expulsa del sitio donde estás; o lo devuelves |
| **Torreta** | Corta líneas de tiro desde una posición fija |
| **Tejedor** | Salen de dos en dos y tienden un cable de energía entre ellos: hay que decidir a cuál matas primero |
| **Espejo** | Te devuelve tus propios disparos salvo en la ventana en la que abre la placa |
| **Divisor** | Se parte en dos al morir, y otra vez: gestión de ritmo |

**Élites.** No son "el mismo con más vida": cada uno lleva un modificador que
cambia cómo hay que matarlo, con su color propio. *Blindado* aguanta el daño
pero se le rompe antes la postura; *Veloz* es rápido y frágil; *Volátil* estalla
al morir; *Regenerador* se cura si le das respiro.

### El arma modular

No son seis armas: son seis **modificadores que se acumulan** sobre el mismo
disparo, con tres ranuras. De ahí salen comportamientos que no están programados
uno a uno:

| Módulo | Efecto | Ejemplo de combinación |
|---|---|---|
| **Perforante** | Atraviesa 3 objetivos, más alcance | + Cadena → *Pararrayos*: el arco salta desde cada cuerpo perforado |
| **Rebote** | Rebota contra la geometría | + Escopeta → *Tormenta de Esquirlas*: una sala cerrada es una trampa |
| **Buscador** | Fija el objetivo que tienes en la línea de tiro y gana daño cuanto más lo persigue | + Orbital → *Enjambre Cazador*: los nodos esperan girando y salen a por su presa |
| **Escopeta** | 5 fragmentos en abanico, menos alcance | + Perforante → *Lanza de Fragmentos*: recupera el alcance |
| **Orbital** | El disparo queda orbitando y golpea por contacto | + Cadena → *Reactor*: anillo que electrifica por contacto |
| **Cadena eléctrica** | El primer impacto **marca**; el segundo detona la marca y salta a los vecinos | + Rebote → el arco persigue por toda la sala |

Once combinaciones tienen nombre propio y aparecen en pantalla al montarlas.

**Disparo cargado.** La carga sube sola **mientras no disparas**. No hay botón
nuevo: premia abrir con un golpe fuerte y reposicionarte en vez de mantener el
gatillo, y encaja con el sobrecalentamiento, que castiga lo contrario. Cargado,
cada módulo amplifica lo suyo: la escopeta concentra el abanico en un proyectil
macizo, el orbital despliega la corona entera de golpe, el buscador saca tres
cabezas y la cadena salta al doble de enemigos.

### Sensación de juego

Coyote time, buffer de salto, salto de altura variable, aceleración y fricción
distintas en suelo y aire, giro en seco acelerado, hit-stop en los impactos,
sacudida de cámara por trauma decreciente, squash & stretch con muelle
amortiguado, estelas de dash, y **tiempo bala** al matar al último enemigo de una
sala.

El parry no es un botón de emergencia: devuelve proyectiles con más daño hacia
donde apuntas, corta ataques comprometidos y **te devuelve el dash**, así que
encadenar parry → dash → disparo cargado es la forma agresiva de jugar.

Los enemigos se empujan entre sí para no apilarse en el mismo píxel: una oleada
de diez se lee como diez cosas y no como un bulto.

El escenario incluye rampas, plataformas de un solo sentido, cintas
transportadoras, plataformas móviles con arrastre correcto del jugador, gel con
flotabilidad, bloques frágiles que se rompen (y recalculan sombras y colisión de
partículas al hacerlo), pinchos, láseres telegrafiados y torretas.

---

## Arquitectura

45 módulos ES nativos, ~11 300 líneas, sin dependencias circulares.

```
vex/
├── index.html               página principal, carga los módulos de src/
├── vex.html                 el juego entero en un archivo (doble clic)
├── herramientas/            generador de vex.html
├── pruebas/                 auto-pruebas ejecutables en el navegador
└── src/
    ├── core/                math · rng · ecs · events · input · loop · replay · settings
    ├── render/              gl · shaders · atlas · spriteart · font · camera · batch
    │                        particles · lighting · postfx · parallax · renderer
    ├── audio/               synth · buses · sfx · music · audio
    ├── game/                tiles · physics · level · components · player · weapons
    │                        enemies · boss · hazards · pickups · progression
    │                        fx · broadphase · world · draw
    ├── ui/                  hud · menus · debug · textcache
    └── main.js
```

### ECS con arrays tipados

`core/ecs.js` es un almacén *structure-of-arrays*: cada componente es un array
tipado plano indexado por id de entidad. Las entidades se reciclan con una lista
libre, llevan generación para detectar referencias colgantes y se iteran por una
lista densa que se compacta con swap-remove. Después de construirlo **no vuelve a
asignar memoria**.

### Simulación determinista

- Paso fijo a 60 Hz con acumulador; el render interpola aparte con `alpha`.
- Toda la aleatoriedad sale de un **xorshift128+** propio (`core/rng.js`),
  implementado sobre pares de enteros de 32 bits. `Math.random` está prohibido en
  cualquier código que afecte al estado.
- La generación de cada sala usa una semilla derivada del índice de sala, **no**
  del flujo de aleatoriedad del juego: así el nivel no depende de lo que haya
  hecho el jugador hasta ese momento.
- El apuntado se cuantiza a 4096 pasos antes de entrar en la simulación, que es
  lo que permite que la repetición coincida exactamente.
- El juego graba el input de cada tick y firma el estado cada 30 ticks. Al
  reproducir compara las firmas: cualquier fuga de no-determinismo aparece como
  desajuste con el tick exacto.

### Renderizador (WebGL2, escrito desde cero)

- **Batching por instancias**: 16 flotantes por sprite en un único buffer
  intercalado. Todo el juego cabe en **una draw call por capa** (mundo, emisiva,
  interfaz).
- **Atlas generado en runtime**: 53 grupos de sprites (personaje, enemigos,
  jefes, proyectiles, tiles de 4 biomas, props, efectos e iconos) dibujados con
  Canvas2D procedural y empaquetados con un algoritmo de estanterías.
- **Fuente de trazos** definida en código sobre una rejilla de 5×7, con acentos y
  signos de apertura del español. El texto se dibuja recorriendo códigos de
  carácter, sin construir cadenas por fotograma.
- **Iluminación 2D dinámica** con sombras duras: para cada luz se calcula su
  polígono de visibilidad por barrido angular sobre los extremos de los
  segmentos del nivel (extraídos del grid y fusionados en tramos), y se dibuja
  como abanico de triángulos con atenuación radial. Rejilla espacial para el
  descarte de segmentos.
- **Cadena de post-proceso**: bloom (umbral con codo suave → pirámide de 5
  niveles con desenfoque separable → recomposición), aberración cromática,
  viñeta, grano, distorsión de barril tipo CRT con líneas de barrido, glitch por
  bandas, pulso de daño y flash de impacto. Todo con interruptores en opciones.
- **Partículas en GPU**: posición, velocidad, vida y **rebote contra la geometría
  del nivel** se calculan en el vertex shader y se escriben con *transform
  feedback*. La CPU sólo escribe partículas nuevas en un buffer circular.
- **Parallax de 4 capas** resuelto en una sola pasada a pantalla completa, con
  patrón distinto por bioma.
- **Recarga de shaders en caliente** (`F2`): reimporta el módulo de GLSL y
  recompila los programas sin perder la partida.

### Audio (Web Audio, sintetizado)

- Sintetizador propio: osciladores, ADSR, filtros biquad, ruido blanco y rosa
  generados con el PRNG, FM simple, delay con filtro en el lazo y **reverb por
  convolución con un impulso generado a mano** (ruido con decaimiento
  exponencial, oscurecimiento progresivo del espectro y reflexiones tempranas).
- 20 efectos procedurales **con variación por evento**: cada disparo cambia de
  altura, timbre, corte de filtro y panorama. Nunca suenan dos veces igual.
- **Música adaptativa por capas**: cada bioma tiene su tempo, escala y progresión
  armónica, y cinco capas (pad, bajo, arpegio, percusión y lead) que entran y
  salen según la tensión: exploración → combate → jefe → victoria. Los cruces se
  aplican **al empezar el siguiente compás**, nunca a mitad.
- Ducking de la música bajo los golpes fuertes, buses separados de música, SFX y
  master con sliders en opciones, y silencio total al perder el foco.

---

## Auto-pruebas

El juego trae su propia batería de pruebas, ejecutable en el navegador:

```
http://localhost:8000/pruebas/
```

Comprueba en 12 grupos: el PRNG (determinismo, uniformidad, chi²), el almacén de
entidades, la generación de salas, el arranque del motor, el **determinismo de la
simulación** (1800 ticks, dos partidas idénticas comparadas por firma), la
**grabación y repetición**, las combinaciones de módulos, las tres fases del
jefe, la síntesis de audio (render offline con `OfflineAudioContext`), los
**sistemas de enemigos** (aguante, puntos débiles, escudo, espejo, tejedores,
divisor, élites, parry y separación), los **sistemas del arma** (carga, fijado de
blanco, marcas de cadena y combos) y el presupuesto de CPU.

Hay además dos bancos de trabajo: `pruebas/render.html` (carga del renderizador)
y `pruebas/audio.html` (análisis de RMS, pico y espectro de cada efecto).

### Resultados medidos

Verificado en Chromium 1194 con rasterización por software (SwiftShader), a
1920×1080:

| Medida | Resultado |
|---|---|
| Determinismo (misma semilla + mismas entradas) | idéntico en 3600 ticks |
| Repetición grabada y reproducida | 900 ticks, **0 desajustes** |
| Simulación | **~1,2 ms** por tick con 319 enemigos activos |
| CPU total del motor por frame | **1,98 ms** (presupuesto: 8 ms) |
| Entidades simultáneas | **431** |
| Partículas vivas en GPU | **10 342** |
| Draw calls por frame | **3** |
| Luces por frame / con sombra proyectada | 128 / 6 |
| Efectos de audio | 24, ninguno mudo, ninguno saturado |
| Comprobaciones de la batería | **71 / 71** |

> **Nota honesta sobre los 60 fps.** Este entorno de verificación no tiene GPU:
> todo se rasteriza por software, así que el coste de GPU (relleno del
> post-proceso, partículas, luces) **no se ha podido medir en hardware real**.
> Lo que sí está medido es el trabajo de CPU del motor, que es 0,94 ms por frame
> a 1080p con 431 entidades y más de 10 000 partículas — un 12 % del presupuesto
> de 8 ms. El diseño está pensado para el resto (una draw call por capa, atlas
> único, partículas íntegramente en GPU, seis luces con sombra como máximo), pero
> la cifra de fps en una GPU concreta habría que medirla en esa GPU.

---

## Sobre el archivo único

`vex.html` lo genera `herramientas/empaquetar.mjs`, que ordena los 45 módulos por
dependencias, sustituye cada `import` por una llamada a un registro mínimo y los
concatena. No minifica ni transpila: el código de dentro es el mismo que el de
`src/`, sólo reordenado.

```bash
node herramientas/empaquetar.mjs   # regenera vex.html desde src/
```

**Esto no es un paso de compilación del juego.** El juego corre sin él: sirve la
carpeta y listo. El empaquetado existe únicamente porque `file://` bloquea los
módulos ES por CORS, así que es la única manera de repartir el juego como un
archivo suelto que se abra con doble clic. Si tocas `src/`, acuérdate de
regenerarlo.

Dentro del paquete hay una diferencia, y sólo una: `F2` recompila los shaders
desde el módulo ya cargado en vez de releerlo del disco, así que no hay recarga
en vivo. El propio aviso en pantalla lo dice cuando ocurre.

---

## Decisiones que merecen una nota

**El hit-stop se congelaba solo.** Un parón de 18 ms es más largo que un tick de
16,7 ms. Al dispararse en cada impacto y con fuego sostenido se rearmaba en cada
tick, y la simulación avanzaba a la mitad de velocidad (o se paraba del todo si
el daño venía de fuera del tick). Ahora tiene recarga por ticks, techo de
duración y una garantía dura de que nunca se encadenan más de 14 ticks
congelados. Está cubierto por una prueba de regresión.

**Las luces enterradas en la roca.** Una luz puntual dentro de un sólido genera
un polígono de visibilidad degenerado que se ve como una franja vertical: parece
un fallo del shader y no lo es. El generador ancla las luces a superficies y, por
si acaso, hay un saneador final que empuja fuera cualquiera que quede dentro.

**La luz satura en vez de sumar sin límite.** El compositor aplica
`ambiente + L/(1+0.62·L)` en vez de `ambiente + L`. Sin eso, un bioma con muchas
luces solapadas se quemaba entero y el bloom lo remataba.

**La separación de enemigos corrige posición, no velocidad.** El primer intento
sumaba un impulso a la velocidad, y el `approach()` de cada IA lo cancelaba al
tick siguiente: doce enemigos generados en el mismo punto seguían a 2 px de
distancia. Corrigiendo la posición directamente —y sacando la fase antes del
movimiento— la misma prueba pasa de 0 px a 27 px. Además, dos enemigos
exactamente superpuestos no tienen dirección de empuje definida, así que se usa
un ángulo derivado del id para que una pila perfecta también se deshaga.

**El jugador es una entidad del ECS como cualquier otra.** La clase `Jugador`
sólo guarda el estado de control (temporizadores, banderas) y lee y escribe en
los arrays del almacén.

**Los efectos visuales usan un generador aparte.** `fx.js` tira del generador
cosmético, no del de la simulación: así se puede desactivar entero sin romper el
determinismo ni la repetición.

---

## Licencia

Mismo tratamiento que el resto del repositorio. Todo el arte y el audio son
generados por el código incluido aquí; no hay material de terceros.
