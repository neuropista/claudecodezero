'use strict';
/* =====================================================================
   Banco EXPERTO — solo aparece en dificultad DIRECTOR
   Preguntas de detalle fino del guion docente
   "Claude Code sin ser programador" (Neuropista · v1.0)
   ===================================================================== */

const QUESTIONS_HARD = [

  /* ---- ZONA 1 · Aldea Neuropista ---- */
  [
    { q: 'La "nota antihumo" del guion dice que la sesión NO promete enseñar a programar. ¿Qué promete exactamente?',
      o: ['Algo más útil: aprender a delegar trabajo digital real a un agente que sí sabe programar',
          'Aprender los fundamentos de HTML en 3 horas',
          'Certificar a los participantes como desarrolladores junior',
          'Automatizar por completo el trabajo del participante'],
      a: 0,
      e: 'Y esa distinción se repite explícitamente al menos tres veces durante la sesión.' },
    { q: 'La versión de terminal para desarrolladores y la pestaña Code, ¿en qué se diferencian según el guion?',
      o: ['Mismo cerebro, puerta distinta: cambia la interfaz, no la capacidad',
          'La terminal es más potente y da mejores respuestas',
          'La pestaña Code es una versión de prueba limitada',
          'Son dos productos de empresas diferentes'],
      a: 0,
      e: '"Mismo cerebro, puerta distinta". Los no técnicos entran por la pestaña Code.' },
    { q: 'La encuesta de línea base A–E de la bienvenida pregunta concretamente…',
      o: ['"¿Qué tan capaz te sientes hoy de pedirle a una IA que trabaje directamente sobre tus archivos?"',
          '"¿Cuántos lenguajes de programación conoces?"',
          '"¿Cuántas horas usas la computadora al día?"',
          '"¿Qué antivirus tienes instalado?"'],
      a: 0,
      e: 'Se guarda el resultado para comparar el antes y el después al cierre de la sesión.' }
  ],

  /* ---- ZONA 2 · Bosque de la Instalación ---- */
  [
    { q: 'En la demo de apertura, ¿cómo debe estar preparada la carpeta "Descargas_Caos"?',
      o: ['Con 40–60 archivos mezclados: PDFs, imágenes, Excel, Word y capturas con nombres confusos',
          'Con exactamente 10 archivos ordenados alfabéticamente',
          'Vacía, para que el agente la llene',
          'Con documentos confidenciales reales, para que sea creíble'],
      a: 0,
      e: 'Y la demo se ensaya al menos una vez el día anterior con esa misma carpeta.' },
    { q: '¿Cuál es el requisito mínimo de sistema en Mac?',
      o: ['macOS 11 o superior',
          'macOS 10.9 o superior',
          'Cualquier Mac con procesador Intel',
          'Solo Macs con chip M1 o M2'],
      a: 0,
      e: 'Windows 10 o superior; macOS 11 o superior. Además, permisos para instalar aplicaciones.' },
    { q: 'Según el checklist del facilitador, ¿cuándo se comparten las tarjetas del semáforo y el banco de prompts?',
      o: ['En el momento indicado de la sesión, nunca antes',
          'En el correo previo, 48 horas antes',
          'Solo al final, como material de despedida',
          'Nunca: son material exclusivo del facilitador'],
      a: 0,
      e: 'Se tienen listos para compartir por chat, pero se entregan en su momento para no adelantar el contenido.' }
  ],

  /* ---- ZONA 3 · Cavernas del Caos ---- */
  [
    { q: 'En el menú del Laboratorio 1, ¿cuántos ejercicios elige cada participante?',
      o: ['Dos de los cuatro disponibles',
          'Los cuatro, obligatoriamente',
          'Uno solo, el más corto',
          'Ninguno: el facilitador los asigna'],
      a: 0,
      e: 'Cada quien elige 2 del menú: Ordena mi caos, Extrae y consolida, Del desorden al informe, o Conversor exprés.' },
    { q: 'Durante el laboratorio, ¿a quiénes prioriza el facilitador en su recorrido?',
      o: ['A quienes marcaron A o B en la encuesta de línea base',
          'A quienes ya terminaron sus ejercicios',
          'A los que tienen más experiencia técnica',
          'A nadie: se atiende por orden de llegada al chat'],
      a: 0,
      e: 'Recorre en orden, 3 minutos por persona, priorizando a quienes se sentían menos capaces al inicio.' },
    { q: 'El ejercicio B pide crear un Excel con la tabla. ¿Qué lleva la hoja adicional?',
      o: ['El resumen del agente sobre qué tipo de información tienes acumulada',
          'Una copia de seguridad de los archivos originales',
          'Los datos personales de los clientes encontrados',
          'El código fuente que usó para leer los PDF'],
      a: 0,
      e: 'Extraer no es solo copiar datos: el agente también te devuelve una lectura de tu propio acervo.' }
  ],

  /* ---- ZONA 4 · Taller del Creador ---- */
  [
    { q: 'En la galería relámpago, el facilitador nombra en voz alta…',
      o: ['La habilidad demostrada, no solo el producto creado',
          'El nombre del archivo generado',
          'Cuántos minutos tardó cada participante',
          'Los errores cometidos durante la creación'],
      a: 0,
      e: '"Lo que acaba de hacer Rosa es especificar un requerimiento — eso cobra caro un consultor".' },
    { q: '¿Cuánto dura la intervención de cada voluntario en la galería relámpago?',
      o: ['90 segundos, 4 voluntarios en los últimos 8 minutos',
          '5 minutos por persona, sin límite de voluntarios',
          '15 minutos en total para todo el grupo',
          'No hay galería: los trabajos se envían por correo'],
      a: 0,
      e: 'Cuatro voluntarios comparten pantalla 90 segundos cada uno mostrando su creación.' },
    { q: 'El "salto identitario" del Laboratorio 2 consiste en pasar de…',
      o: ['"organizo archivos" a "construyo herramientas"',
          '"uso el mouse" a "uso el teclado"',
          '"trabajo solo" a "trabajo en equipo"',
          '"uso la web" a "uso la terminal"'],
      a: 0,
      e: 'Aquí ocurre la transformación que los participantes contarán después.' }
  ],

  /* ---- ZONA 5 · Templo del Semáforo ---- */
  [
    { q: 'Consolidar información de clientes en un solo archivo. ¿Qué color del semáforo?',
      o: ['🟡 Ámbar: volumen alto y cambios difíciles de deshacer, con plan y aprobación paso a paso',
          '🟢 Verde: es solo copiar y pegar',
          '🔴 Rojo: nunca se puede tocar información de clientes',
          'Depende del tamaño del archivo, no del contenido'],
      a: 0,
      e: 'El guion la lista como ejemplo ámbar, junto a renombrar en lote y modificar documentos oficiales.' },
    { q: 'La regla resumen del semáforo rojo, en una frase, es…',
      o: ['"Cualquier cosa que no podrías explicar si sale mal"',
          '"Cualquier cosa que tome más de una hora"',
          '"Cualquier cosa que no entiendas técnicamente"',
          '"Cualquier cosa que no esté en la nube"'],
      a: 0,
      e: 'Es el criterio que engloba datos confidenciales, originales únicos e impacto legal o económico.' },
    { q: '¿Qué hace el facilitador con los casos reales que escriben los participantes?',
      o: ['Lee 3 en voz alta y los clasifica en vivo con el grupo',
          'Los archiva sin comentarlos',
          'Los corrige por escrito después de la sesión',
          'Los convierte en la evaluación final calificada'],
      a: 0,
      e: 'Clasificar en vivo convierte el semáforo en un criterio compartido, no en una tarjeta más.' }
  ],

  /* ---- ZONA 6 · Torre del Lunes ---- */
  [
    { q: '¿Cuánto tiempo diario dedica el participante al proyecto integrador?',
      o: ['20 a 30 minutos por día, durante 5 días',
          '3 horas diarias durante una semana',
          'Un único día completo de trabajo',
          'El tiempo que quiera: no hay plan'],
      a: 0,
      e: 'Cinco retos de 20–30 minutos: sostenible, y por eso el hábito se queda.' },
    { q: 'Día 3 del proyecto: mejorar tu mini-herramienta. ¿Qué consolida ese reto?',
      o: ['Iteración y retroalimentación: pedir 2 cambios concretos con el método CFN',
          'La instalación de la aplicación',
          'La organización de carpetas',
          'La creación de herramientas para terceros'],
      a: 0,
      e: 'La evidencia a guardar es la versión 2 de tu herramienta.' },
    { q: '¿Qué documento se convierte en el "certificado práctico" del participante?',
      o: ['El instructivo del día 5, compartido en el espacio del grupo',
          'La captura del antes y el después del día 1',
          'El Excel consolidado del día 2',
          'Un diploma que emite el facilitador'],
      a: 0,
      e: 'Quien completa 4 de 5 casillas comparte su instructivo: ese documento es su certificado práctico.' }
  ]
];
