(() => {
  /* =======================================================================
       Settings guide

       What the first-run setup and the settings panel show, in one place:
         - styleSteps: questions that set how Nivel21 behaves for each user
           (movement, action bar, chat, camera, dice). Each one maps its
           answers to settings, so both the setup and the "Mi estilo" tab
           read and write the same values.
         - features: description, image and group of every "feature.*"
           setting, for the "Funciones" tab.
         - highlights: the main features presented at the end of the setup.

       Exposed as `window._n21_.settingsGuide`.
    ======================================================================= */

  function assetUrl(path) {
    const base = document.documentElement?.dataset?.n21BaseUrl || "";
    return path ? base + path : "";
  }

  const IMG = (name) => `popup/img/${name}`;

  // Looping videos in src/assets/onboarding/<name>.webm. Only the recorded
  // ones are listed; the rest show their still image.
  const RECORDED_VIDEOS = new Set([
    "movement-direct",
    "movement-preview",
    "ambient-fx",
    "character-frame",
    "dm-screen",
    "effects-panel",
    "multi-measurement",
    "notes-panel",
    "ping-map",
    "tabbed-action-bar",
    "token-assign-character",
    "token-aura",
    "turn-order",
  ]);

  function animated(name, poster) {
    return RECORDED_VIDEOS.has(name)
      ? { type: "video", src: `src/assets/onboarding/${name}.webm`, poster }
      : { type: "image", src: poster };
  }

  const CHAT_CONSENT_SETTINGS = [
    "chat-consent.spell-cast",
    "chat-consent.ambient-fx",
    "chat-consent.turn-order",
    "chat-consent.ping",
    "chat-consent.efectos",
    "chat-consent.send-to-chat",
    "chat-consent.token-notes",
  ];

  /**
   * Each step has either `choices` (pick one: each sets `settings`) and/or
   * `controls` (individual settings shown as switches or selects).
   * `gmOnly` steps are skipped for players.
   */
  const styleSteps = [
    {
      id: "movement",
      icon: "ft-move",
      requires: "token-drag-measurement",
      title: "¿Cómo quieres mover los tokens?",
      description:
        "Al arrastrar un token, Nivel21 muestra la distancia recorrida. Elige si el token se mueve mientras lo arrastras o si primero ves el recorrido y se mueve al soltarlo.",
      choices: [
        {
          id: "direct",
          label: "Mover al arrastrar",
          description: "El token sigue al cursor, como en Nivel20.",
          media: animated("movement-direct", IMG("token-drag-measurement.png")),
          settings: { "token-drag-measurement.preview-move": false },
        },
        {
          id: "preview",
          label: "Previsualizar el recorrido",
          description:
            "Ves la ruta y la distancia; el token se mueve recién al soltarlo.",
          media: animated("movement-preview", IMG("token-drag-measurement.png")),
          settings: { "token-drag-measurement.preview-move": true },
        },
      ],
      controls: [
        { setting: "token-drag-measurement.show-distance", label: "Mostrar la distancia al mover" },
        { setting: "token-drag-measurement.soft-snap", label: "Ajustar a casillas enteras (Shift para moverlo libre)" },
      ],
    },
    {
      id: "action-bar",
      icon: "ft-grid",
      title: "¿Qué barra de acciones prefieres?",
      description:
        "Nivel21 agrega conjuros, acciones estándar, rasgos e inventario a la barra de acciones del personaje.",
      choices: [
        {
          id: "classic",
          label: "Clásica",
          description: "La barra de Nivel20, con carpetas para cada grupo.",
          media: { type: "image", src: IMG("spell-action-bar.png") },
          settings: { "feature.tabbed-action-bar.enabled": false },
        },
        {
          id: "tabbed",
          label: "Con pestañas",
          description: "Separada en Acciones, Conjuros, Inventario y Rasgos.",
          media: { type: "image", src: IMG("tabbed-action-bar.png") },
          settings: { "feature.tabbed-action-bar.enabled": true },
        },
      ],
    },
    {
      id: "chat",
      icon: "ft-message-square",
      title: "¿Qué hacemos antes de escribir en el chat?",
      description:
        "Algunas funciones se comunican por el chat: el orden de turnos, los pings, los efectos, los conjuros lanzados y lo que compartes.",
      choices: [
        {
          id: "ask",
          label: "Preguntarme cada vez",
          description: "Confirmas cada mensaje antes de que se envíe.",
          icon: "ft-help-circle",
          settings: Object.fromEntries(CHAT_CONSENT_SETTINGS.map((name) => [name, "ask"])),
        },
        {
          id: "always",
          label: "Enviar siempre",
          description: "Sin confirmaciones: se envía directamente.",
          icon: "fa fa-paper-plane",
          settings: Object.fromEntries(CHAT_CONSENT_SETTINGS.map((name) => [name, "always"])),
        },
      ],
    },
    {
      id: "camera",
      icon: "ft-video",
      title: "Cámara y clima",
      description:
        "Evita girar el tablero por accidente y elige si ver el clima animado, que exige más a equipos modestos.",
      controls: [
        {
          setting: "camera-rotation-lock.locked",
          requires: "camera-rotation-lock",
          label: "Bloquear la rotación de la cámara",
          hint: "Se puede cambiar en cualquier momento desde el menú rápido.",
        },
        {
          setting: "ambient-fx.animated-weather",
          requires: "ambient-fx",
          label: "Mostrar el clima animado (lluvia, nieve…)",
        },
      ],
    },
    {
      id: "dice",
      icon: "fa fa-cube",
      requires: "advantage-disadvantage",
      title: "Ventaja y desventaja",
      description:
        "Mantén una tecla apretada al hacer clic en una tirada para lanzarla con ventaja o con desventaja.",
      media: { type: "image", src: IMG("advantage-disadvantage.png") },
      controls: [
        { setting: "advantage-disadvantage.advantage-modifier", label: "Tecla para ventaja" },
        { setting: "advantage-disadvantage.disadvantage-modifier", label: "Tecla para desventaja" },
      ],
    },
  ];

  const GROUPS = [
    { id: "board", label: "Tablero y tokens" },
    { id: "combat", label: "Combate" },
    { id: "character", label: "Personaje y barra de acciones" },
    { id: "chat", label: "Chat y dados" },
    { id: "dm", label: "Herramientas del DM" },
  ];

  /** Keyed by feature id: the setting is `feature.<id>.enabled`. */
  const features = {
    "token-drag-measurement": {
      group: "board",
      image: IMG("token-drag-measurement.png"),
      description: "Muestra la distancia recorrida al arrastrar un token y, si quieres, el recorrido antes de moverlo.",
    },
    "token-drag-speed": {
      group: "board",
      image: IMG("token-drag-speed.png"),
      description: "Acelera la animación al arrastrar tokens por el mapa.",
    },
    "token-move-arrows": {
      group: "board",
      image: IMG("token-move-arrows.png"),
      description: "Mueve los tokens seleccionados con las flechas del teclado; los muros los detienen.",
    },
    "token-hotkeys": {
      group: "board",
      image: IMG("token-hotkeys.png"),
      description: "Atajos de teclado para ocultar, bloquear, editar, duplicar o borrar el token seleccionado.",
    },
    "multi-measurement": {
      group: "board",
      image: IMG("multi-measurement.png"),
      description: "Deja las mediciones fijas en el mapa con el botón de anclaje.",
    },
    "ping-map": {
      group: "board",
      image: IMG("ping-map.png"),
      description: "Señala un punto del mapa con un marcador animado que ven todos.",
    },
    "token-health-bar": {
      group: "board",
      image: IMG("token-status.png"),
      description: "Muestra los puntos de golpe dentro de los tokens asignados a un personaje o criatura.",
    },
    "token-conditions": {
      group: "board",
      image: IMG("token-status.png"),
      description: "Muestra los iconos de los estados del personaje o criatura sobre su token.",
    },
    "invisible-condition": {
      group: "board",
      description: "Oculta el token de un personaje con el estado Invisible a quienes no deberían verlo.",
    },
    "camera-rotation-lock": {
      group: "board",
      image: IMG("camera-utilities.png"),
      description: "Agrega al menú rápido un botón para bloquear la rotación de la cámara.",
    },
    "turn-order": {
      group: "combat",
      image: IMG("turn-order.png"),
      description: "Panel de iniciativa con turnos, asaltos y temporizador, sincronizado con todos los jugadores.",
    },
    "character-frame": {
      group: "combat",
      image: IMG("character-frame.png"),
      description: "Muestra arriba a la izquierda el personaje seleccionado: retrato, CA, vida, recursos y estados.",
    },
    "effects-panel": {
      group: "combat",
      image: IMG("effects-panel.png"),
      description: "Lanza efectos animados en el tablero: alientos, haces, explosiones y más.",
    },
    "creature-resources": {
      group: "combat",
      image: IMG("creature-resources.png"),
      description: "Casillas propias para las criaturas: espacios de conjuro, acciones legendarias, usos de rasgos…",
    },
    "spell-action-bar": {
      group: "character",
      image: IMG("spell-action-bar.png"),
      description: "Agrega los conjuros del personaje a su barra de acciones, con una carpeta por nivel.",
    },
    "actions-bar": {
      group: "character",
      image: IMG("actions-bar.png"),
      description: "Agrega una carpeta con las acciones comunes de combate: Carrera, Destrabarse, Esquivar…",
    },
    "traits-action-bar": {
      group: "character",
      image: IMG("traits-action-bar.png"),
      description: "Agrega una carpeta con los rasgos de clase, raza y dotes del personaje.",
    },
    "inventory-panel": {
      group: "character",
      image: IMG("inventory-panel.png"),
      description: "Botón de inventario en la barra de acciones que abre los objetos del personaje.",
    },
    "tabbed-action-bar": {
      group: "character",
      image: IMG("tabbed-action-bar.png"),
      description: "Separa la barra de acciones en pestañas: Acciones, Conjuros, Inventario y Rasgos.",
    },
    "multi-level-action-bar": {
      group: "character",
      image: IMG("multi-level-action-bar.png"),
      description: "Permite carpetas dentro de carpetas en la barra de acciones usando « > » en el nombre.",
    },
    "action-bar-editor": {
      group: "character",
      image: IMG("action-bar-editor.png"),
      description: "Ordena y anida las acciones arrastrándolas, y cambia sus iconos y nombres.",
    },
    "floating-panel-action": {
      group: "character",
      description: "Abre en una ventana flotante el contenido de algunas acciones, como los rasgos.",
    },
    "resource-actions": {
      group: "character",
      description: "Acciones que suman, restan o fijan un recurso al usarlas, con [resource Nombre -1].",
    },
    "money-editor": {
      group: "character",
      image: IMG("money-editor.png"),
      description: "Muestra y edita el dinero del equipo con la etiqueta [money:…].",
    },
    "notes-panel": {
      group: "character",
      image: IMG("notes-panel.png"),
      description: "Panel flotante para tomar notas durante la partida, guardadas en tu navegador.",
    },
    "advantage-disadvantage": {
      group: "chat",
      image: IMG("advantage-disadvantage.png"),
      description: "Tira con ventaja o desventaja manteniendo una tecla al hacer clic en una tirada.",
    },
    "dice-visibility": {
      group: "chat",
      image: IMG("dice-visibility.png"),
      description: "Elige quién ve tus tiradas, aparte de la visibilidad del chat.",
    },
    "send-to-chat": {
      group: "chat",
      image: IMG("send-to-chat.png"),
      description: "Comparte conjuros, objetos y reglas en el chat con una tecla y un clic.",
    },
    "parse-chat-links": {
      group: "chat",
      image: IMG("parse-chat-links.png"),
      description: "Abre los enlaces de Nivel20 del chat en ventanas flotantes.",
    },
    "whisper-mode": {
      group: "chat",
      image: IMG("whisper-mode.png"),
      description: "Mensajes privados escribiendo /w nombre en el chat.",
    },
    "dm-screen": {
      group: "dm",
      gmOnly: true,
      image: IMG("dm-screen.png"),
      description: "Pantalla con tarjetas de referencia rápida: CDs, cobertura, daño y más.",
    },
    "ambient-fx": {
      group: "dm",
      gmOnly: true,
      image: IMG("ambient-fx.png"),
      description: "Capa de color y clima sobre el tablero para la hora del día o eventos.",
    },
    "token-aura": {
      group: "dm",
      gmOnly: true,
      image: IMG("token-aura.png"),
      description: "Auras de color alrededor de los tokens para zonas de efecto o rangos.",
    },
    "token-layers": {
      group: "dm",
      gmOnly: true,
      image: IMG("token-layers.png"),
      description: "Capas para poner unos tokens por encima o por debajo de otros.",
    },
    "token-assign-player": {
      group: "dm",
      gmOnly: true,
      image: IMG("assign-to-player.png"),
      description: "Asigna un token a un jugador para que solo él pueda moverlo.",
    },
    "token-assign-character": {
      group: "dm",
      gmOnly: true,
      image: IMG("assign-to-character.png"),
      description: "Vincula un token a un personaje o criatura del panel de personajes.",
    },
    "token-notes": {
      group: "dm",
      gmOnly: true,
      image: IMG("token-notes.png"),
      description: "Notas en los tokens que puedes compartir con los jugadores.",
    },
    "straighten-camera": {
      group: "dm",
      gmOnly: true,
      image: IMG("camera-utilities.png"),
      description: "Endereza la cámara o céntrala para todos desde el menú contextual.",
    },
  };

  /**
   * Short how-to for the features presented in the setup: a few steps and a
   * looping video (its poster, the feature's screenshot, shows until the
   * video exists).
   */
  const tutorials = {
    "turn-order": [
      "DM: haz click derecho en uno o varios tokens y elige «Agregar turno». Si el token está asignado a un personaje, su iniciativa se completa sola.",
      "Con el botón del dado se leen las iniciativas tiradas en el chat y se tiran las de las criaturas; «Ordenar» los acomoda.",
      "«Actualizar» empieza el combate. Las flechas pasan de turno y el contador de asaltos avanza solo.",
      "Todos ven el panel en «Orden de turnos», en el menú de la izquierda. Pasa el mouse por una fila para resaltar ese token en el mapa.",
    ],
    "character-frame": [
      "Selecciona un token asignado a un personaje o criatura: arriba a la izquierda aparece su marco.",
      "Haz click en la vida para curar, dañar o dar puntos temporales.",
      "Recursos: click para gastar y click derecho para recuperar. Estados: «+» para agregar y click derecho para quitar.",
      "El retrato abre su hoja de personaje.",
    ],
    "tabbed-action-bar": [
      "Actívala en «Mi estilo» o en Configuración › Funciones.",
      "Las pestañas separan Acciones, Conjuros, Inventario y Rasgos; «Todos» las muestra lado a lado.",
      "Arrastra las pestañas para reordenarlas y usa click derecho para ocultarlas de «Todos».",
      "Abajo eliges el modo de las tiradas de d20: V (ventaja), N (normal) o D (desventaja).",
    ],
    "multi-measurement": [
      "Abre la herramienta de medición de Nivel20.",
      "Activa el botón de anclaje del panel de mediciones.",
      "Cada medición que hagas queda fija en el mapa hasta que la borres.",
    ],
    "ping-map": [
      "Haz click derecho en cualquier punto del mapa.",
      "Elige «Ping»: aparece un marcador animado que ven todos los jugadores.",
      "Puedes cambiar su color en Configuración › Avanzado.",
    ],
    "send-to-chat": [
      "Mantén apretada la tecla para compartir (Shift por defecto).",
      "Pasa el mouse sobre un conjuro, objeto o regla: se resalta en azul.",
      "Haz click y se comparte en el chat para todos.",
    ],
    "whisper-mode": [
      "En el chat escribe /w seguido del nombre del jugador, por ejemplo: /w Lucius ¿estás listo?",
      "Con Tab se autocompletan los nombres de los usuarios conectados.",
      "Solo el destinatario ve el mensaje, resaltado en verde. Necesita tener la extensión.",
    ],
    "notes-panel": [
      "Abre «Notas» desde Nivel 21, en el menú de la izquierda.",
      "Escribe lo que quieras: se guarda solo en tu navegador.",
      "Las notas siguen ahí la próxima vez que entres.",
    ],
    "token-assign-character": [
      "DM: haz click derecho en un token y elige «Asignar a personaje».",
      "Elige el personaje o la criatura de la lista. Los tokens que agregas desde la carpeta de personajes se vinculan solos.",
      "Al hacer click en el token se selecciona su personaje: su vida, estados y acciones quedan a mano.",
    ],
    "token-aura": [
      "DM: haz click derecho en un token y elige «Modificar aura».",
      "Elige forma (círculo, rectángulo, cono o línea), color y tamaño en casillas.",
      "«Solo aura» oculta el token a los jugadores y deja ver solo el área.",
    ],
    "effects-panel": [
      "Abre «Efectos» desde el menú rápido de la derecha.",
      "Elige el tipo de efecto (aliento, haz, explosión…) y su color.",
      "Los de «Apuntar» se arrastran del origen al objetivo; los de «Punto» se lanzan con un click. Todos los que tienen la extensión los ven.",
    ],
    "dm-screen": [
      "Abre «Pantalla de DM» desde Nivel 21, en el menú de la izquierda.",
      "Consulta las tarjetas: CDs, cobertura, severidad del daño, objetos y más.",
      "Crea tus propias tarjetas y reordénalas arrastrándolas.",
    ],
    "ambient-fx": [
      "DM: abre «Efectos ambientales» desde Nivel 21, en el menú de la izquierda.",
      "Elige un color e intensidad para la hora del día o un evento.",
      "Agrega clima animado: lluvia, tormenta, nieve, niebla, nubes o brasas.",
    ],
  };

  function tutorialFor(id) {
    const steps = tutorials[id];
    if (!steps) return null;
    const image = features[id]?.image;
    return { steps, media: image ? animated(id, image) : null };
  }

  /* ----------------------- shared step UI ----------------------- */

  function settings() {
    return window._n21_?.managers?.SettingsManager || null;
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function featureSetting(id) {
    return `feature.${id}.enabled`;
  }

  /** Whether every setting of a choice already has the choice's value. */
  function isChoiceActive(choice) {
    const manager = settings();
    return Object.entries(choice.settings).every(
      ([name, value]) => manager.get(name) === value,
    );
  }

  function featureLabel(id) {
    return settings()?.getAllSettings()[featureSetting(id)]?.label || id;
  }

  function isFeatureOn(id) {
    return !id || settings().get(featureSetting(id)) !== false;
  }

  function buildMediaHtml(media, alt) {
    if (!media) return "";
    const src = escapeHtml(assetUrl(media.src));
    if (media.type === "video") {
      const poster = media.poster ? ` poster="${escapeHtml(assetUrl(media.poster))}"` : "";
      return `<video class="n21-style-media" src="${src}"${poster} autoplay loop muted playsinline></video>`;
    }
    return `<img class="n21-style-media" src="${src}" alt="${escapeHtml(alt)}" loading="lazy" />`;
  }

  function buildControlHtml(control, { stepOff = false } = {}) {
    const manager = settings();
    const setting = manager.getAllSettings()[control.setting];
    if (!setting) return "";
    const value = manager.get(control.setting);
    const disabled = !isFeatureOn(control.requires);
    const name = escapeHtml(control.setting);
    // When the whole step is off, its own note already says why.
    const hint = disabled && !stepOff
      ? `<small class="n21-style-hint n21-style-hint--off">Requiere activar «${escapeHtml(featureLabel(control.requires))}» en Funciones.</small>`
      : control.hint && !disabled
        ? `<small class="n21-style-hint">${escapeHtml(control.hint)}</small>`
        : "";

    if (setting.type === "select") {
      const options = (setting.options || [])
        .map(
          (option) =>
            `<option value="${escapeHtml(option.value)}"${
              String(option.value) === String(value) ? " selected" : ""
            }>${escapeHtml(option.label)}</option>`,
        )
        .join("");
      return `
        <label class="n21-style-control n21-style-control--select">
          <span>${escapeHtml(control.label)}${hint}</span>
          <select data-style-setting="${name}"${disabled ? " disabled" : ""}>${options}</select>
        </label>`;
    }

    return `
      <label class="n21-style-control">
        <input type="checkbox" class="n21-switch" data-style-setting="${name}"${
          value ? " checked" : ""
        }${disabled ? " disabled" : ""} />
        <span>${escapeHtml(control.label)}${hint}</span>
      </label>`;
  }

  /** One style question, as used by the setup and the "Mi estilo" tab. */
  function buildStepHtml(step, { compact = false } = {}) {
    const off = !isFeatureOn(step.requires);
    const anyActive = (step.choices || []).some(isChoiceActive);
    const choices = (step.choices || [])
      .map((choice) => {
        const active = !off && isChoiceActive(choice);
        const visual = choice.media
          ? buildMediaHtml(choice.media, choice.label)
          : choice.icon
            ? `<div class="n21-style-choice-icon"><i class="${escapeHtml(choice.icon)}"></i></div>`
            : "";
        return `
          <button type="button" class="n21-style-choice${active ? " is-active" : ""}"
            data-step="${escapeHtml(step.id)}" data-choice="${escapeHtml(choice.id)}"
            aria-pressed="${active}"${off ? " disabled" : ""}>
            ${visual}
            <span class="n21-style-choice-label">${escapeHtml(choice.label)}</span>
            <span class="n21-style-choice-description">${escapeHtml(choice.description)}</span>
          </button>`;
      })
      .join("");
    const controls = (step.controls || [])
      .map((control) => buildControlHtml({ requires: step.requires, ...control }, { stepOff: off }))
      .join("");

    return `
      <section class="n21-style-step${compact ? " n21-style-step--compact" : ""}" data-step="${escapeHtml(step.id)}">
        <h4 class="n21-style-step-title"><i class="${escapeHtml(step.icon)}"></i> ${escapeHtml(step.title)}</h4>
        <p class="n21-style-step-description">${escapeHtml(step.description)}</p>
        ${
          off
            ? `<p class="n21-style-hint n21-style-hint--off">Requiere activar «${escapeHtml(
                featureLabel(step.requires),
              )}» en Funciones.</p>`
            : ""
        }
        ${
          !choices && step.media
            ? buildMediaHtml(step.media, step.title).replace(
                'class="n21-style-media"',
                'class="n21-style-media n21-style-media--single"',
              )
            : ""
        }
        ${choices ? `<div class="n21-style-choices">${choices}</div>` : ""}
        ${
          choices && !off && !anyActive
            ? '<p class="n21-style-hint">Ahora tienes una combinación personalizada (ver Configuración › Avanzado). Elige una opción para aplicarla a todo.</p>'
            : ""
        }
        ${controls ? `<div class="n21-style-controls">${controls}</div>` : ""}
      </section>`;
  }

  /**
   * Apply clicks and changes inside `root` (a DOM element or jQuery object)
   * to the settings. `onChange` runs after each change, to re-render.
   */
  function bindStepEvents(root, onChange) {
    const element = root?.jquery ? root[0] : root;
    if (!element || element.dataset.n21StyleBound) return;
    element.dataset.n21StyleBound = "1";

    element.addEventListener("click", (event) => {
      const button = event.target.closest(".n21-style-choice");
      if (!button || button.disabled) return;
      const step = styleSteps.find((s) => s.id === button.dataset.step);
      const choice = step?.choices?.find((c) => c.id === button.dataset.choice);
      if (!choice) return;
      Object.entries(choice.settings).forEach(([name, value]) => settings().set(name, value));
      onChange?.();
    });

    element.addEventListener("change", (event) => {
      const input = event.target.closest("[data-style-setting]");
      if (!input) return;
      const value = input.type === "checkbox" ? input.checked : input.value;
      settings().set(input.dataset.styleSetting, value);
      onChange?.();
    });
  }

  /** Steps this user is asked about. */
  function stepsFor(isGameMaster) {
    return styleSteps.filter((step) => isGameMaster || !step.gmOnly);
  }

  /** Features presented at the end of the first-run setup. */
  const highlights = {
    player: [
      "turn-order",
      "character-frame",
      "tabbed-action-bar",
      "multi-measurement",
      "ping-map",
      "send-to-chat",
      "whisper-mode",
      "notes-panel",
    ],
    gm: [
      "turn-order",
      "character-frame",
      "token-assign-character",
      "token-aura",
      "effects-panel",
      "dm-screen",
      "ambient-fx",
      "ping-map",
    ],
  };

  window._n21_ = window._n21_ || {};
  window._n21_.settingsGuide = {
    assetUrl,
    styleSteps,
    groups: GROUPS,
    features,
    highlights,
    featureSetting,
    escapeHtml,
    buildMediaHtml,
    buildStepHtml,
    bindStepEvents,
    stepsFor,
    tutorialFor,
  };
})();
