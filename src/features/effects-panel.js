(async () => {
  try {
    /* =======================
       Feature: Effects Panel (Efectos)

       Panel abierto desde el menú rápido (barra derecha) para lanzar efectos
       sobre el tablero: el "Tipo de efecto" define la forma (aliento, haz,
       cohete, explosión...) y el color, la paleta (fuego, ácido, magia...).

       Elegir un color arma el efecto: los de "Apuntar" se arrastran desde el
       origen hasta el objetivo y los de "Punto" se lanzan con un clic. Cada
       efecto se envía al chat como `/efecto tipo color x z [x2 z2]` y todos
       los que tienen la extensión lo ven en su tablero.

       El color "Personalizado" tiene 5 tonos editables (del inicio al final
       del efecto) y la opción "Luminoso"; viaja en el comando como
       `#rrggbb,#rrggbb,...[,luz]` para que todos vean los mismos colores.
    ======================= */

    const { loadManagers } = window._n21_;
    const effects = window._n21_?.effects;

    const [
      QuickMenuUIManager,
      FloatingPanelManager,
      ChatManager,
      ChatCommandsManager,
      CameraManager,
      SettingsManager,
    ] = await loadManagers(
      "QuickMenuUIManager",
      "FloatingPanelManager",
      "ChatManager",
      "ChatCommandsManager",
      "CameraManager",
      "SettingsManager",
    );

    if (!SettingsManager.get("feature.effects-panel.enabled")) return;
    if (!effects) return;

    const COMMAND_NAME = "efecto";
    const TOGGLE_ID = "n21-effects-panel-toggle";
    const PANEL_TITLE = "Efectos";
    const PANEL_CLASS = "n21-effects-panel";
    const PANEL_STYLE = "width: 344px; min-width: 344px; max-width: 344px; height: auto; min-height: 0;";
    const SEND_DEBOUNCE_MS = 400;
    const MIN_AIM_DISTANCE = 0.3; // cells
    const MAX_COORD = 100000;

    const CUSTOM_KEY = "personalizado";
    const CUSTOM_STORAGE_KEY = "n21.effects.custom";
    const CUSTOM_GLOW_TOKEN = "luz";
    const CUSTOM_DEFAULT = {
      colors: ["#ffffff", "#d9b8ff", "#a066ff", "#6a2bd9", "#2e0d6b"],
      glow: true,
    };
    const HEX_COLOR = /^#[0-9a-f]{6}$/i;

    // Line icons (24x24, stroke = currentColor) for each effect type.
    const TYPE_ICONS = {
      aliento: '<path d="M3 12h3"/><path d="M6 12l14-6"/><path d="M6 12l14 6"/><path d="M20 6c1.5 3 1.5 9 0 12"/>',
      haz: '<circle cx="4" cy="12" r="2"/><path d="M6 12h15"/><path d="M8 9.5h11M8 14.5h11" opacity=".5"/>',
      cohete: '<circle cx="17" cy="7" r="3.5"/><path d="M14.5 9.5L4 20M12 7.5L5 14.5M16.5 12L9.5 19"/>',
      flecha: '<path d="M4 20L19 5"/><path d="M13 5h6v6"/><path d="M4 20v-4M4 20h4M7 17v-4M7 17h4"/>',
      bala: '<path d="M3 12h3"/><path d="M8 9.5h7l4 2.5-4 2.5H8z"/><path d="M11 9.5v5"/>',
      pocion: '<path d="M10 3h4M10.5 3v5.5L6 15a5 5 0 0 0 4 8h4a5 5 0 0 0 4-8l-4.5-6.5V3"/><path d="M7.5 16h9"/>',
      espadazo: '<path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6M16 16l4 4M19 21l2-2"/>',
      punetazo: '<path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3"/><circle cx="12" cy="12" r="2.5"/>',
      "lluvia-flechas": '<path d="M6 3v13M12 5v15M18 3v13"/><path d="M4 13l2 3 2-3M10 17l2 3 2-3M16 13l2 3 2-3"/>',
      explosion: '<path d="M12 2l2 6 6-3-3 6 5 2-5 2 3 6-6-3-2 6-2-6-6 3 3-6-5-2 5-2-3-6 6 3z"/>',
      nova: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="10" opacity=".5"/>',
      quemar: '<path d="M12 22c4 0 7-2.5 7-7 0-4-3-6-4-10-1.5 2-2 3.5-2 5-1.5-1-2.5-3-2.5-5C7 7 5 10.5 5 15c0 4.5 3 7 7 7z"/>',
      brillo: '<path d="M12 3l1.8 7.2L21 12l-7.2 1.8L12 21l-1.8-7.2L3 12l7.2-1.8z"/>',
      burbujeo: '<circle cx="8" cy="15" r="5"/><circle cx="17" cy="8" r="3.5"/><circle cx="17" cy="18" r="2"/>',
      salpicadura: '<path d="M12 4c2.5 3.5 4 6 4 8a4 4 0 0 1-8 0c0-2 1.5-4.5 4-8z"/><path d="M4 18l2-1M20 18l-2-1M3 11l2 1M21 11l-2 1"/>',
    };

    function typeIcon(key) {
      return `<svg class="n21-effects-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TYPE_ICONS[key] || ""}</svg>`;
    }

    const typeByKey = new Map(effects.TYPES.map((t) => [t.key, t]));
    const paletteByKey = new Map(effects.PALETTES.map((p) => [p.key, p]));

    let selectedType = effects.TYPES[0].key;
    let armedPalette = null;
    let drag = null; // { pointerId, from }
    let lastSentAt = 0;
    let custom = loadCustom();

    function boardCanvas() {
      return document.querySelector("#application-canvas");
    }

    effects.mount(
      () => boardCanvas()?.parentElement || null,
      (x, z) => CameraManager.worldToScreen(x, z, 0),
    );

    /* ---------------------------- custom color ---------------------------- */

    function loadCustom() {
      try {
        const stored = JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY) || "null");
        if (
          Array.isArray(stored?.colors) &&
          stored.colors.length === CUSTOM_DEFAULT.colors.length &&
          stored.colors.every((c) => HEX_COLOR.test(c))
        ) {
          return { colors: stored.colors, glow: !!stored.glow };
        }
      } catch (_error) {
        // Unavailable or corrupt storage: use the default.
      }
      return { colors: [...CUSTOM_DEFAULT.colors], glow: CUSTOM_DEFAULT.glow };
    }

    function storeCustom() {
      try {
        localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(custom));
      } catch (_error) {
        // Only a convenience: the colors still work for this session.
      }
    }

    function encodeCustom(palette) {
      const parts = palette.colors.map((c) => c.toLowerCase());
      if (palette.glow) parts.push(CUSTOM_GLOW_TOKEN);
      return parts.join(",");
    }

    /** "#rrggbb,#rrggbb,...[,luz]" -> { colors, glow } or null. */
    function decodeCustom(token) {
      const parts = String(token).toLowerCase().split(",");
      const glow = parts[parts.length - 1] === CUSTOM_GLOW_TOKEN;
      if (glow) parts.pop();
      if (parts.length < 2 || parts.length > 8 || !parts.every((c) => HEX_COLOR.test(c))) return null;
      return { colors: parts, glow };
    }

    /** What the renderer takes for a palette key (custom -> its colors). */
    function paletteValue(key) {
      return key === CUSTOM_KEY ? { colors: [...custom.colors], glow: custom.glow } : key;
    }

    /* ---------------------------- chat ---------------------------- */

    function formatCoordinate(value) {
      return (Math.round(Number(value) * 100) / 100).toString();
    }

    function getSenderInfo() {
      return document.getElementById("room_message_sender_info")?.value || null;
    }

    function parseEffectMessage(text) {
      if (typeof text !== "string") return null;
      const num = "(-?\\d+(?:\\.\\d+)?)";
      const match = text
        .trim()
        .match(new RegExp(`^/${COMMAND_NAME}\\s+(\\S+)\\s+(\\S+)\\s+${num}\\s+${num}(?:\\s+${num}\\s+${num})?\\s*$`, "i"));
      if (!match) return null;

      const type = typeByKey.get(match[1].toLowerCase());
      const paletteToken = match[2].toLowerCase();
      const palette = paletteByKey.has(paletteToken) ? paletteToken : decodeCustom(paletteToken);
      if (!type || !palette) return null;

      const coords = match.slice(3).filter((v) => v !== undefined).map(Number);
      if (coords.some((v) => !Number.isFinite(v) || Math.abs(v) > MAX_COORD)) return null;

      const from = { x: coords[0], z: coords[1] };
      const to = coords.length === 4 ? { x: coords[2], z: coords[3] } : null;
      if (type.aim && !to) return null;
      return { type: type.key, palette, from, to };
    }

    function sendEffect(typeKey, paletteKey, from, to) {
      const now = Date.now();
      if (now - lastSentAt < SEND_DEBOUNCE_MS) return;
      lastSentAt = now;

      const paletteToken = paletteKey === CUSTOM_KEY ? encodeCustom(custom) : paletteKey;
      let command = `/${COMMAND_NAME} ${typeKey} ${paletteToken} ${formatCoordinate(from.x)} ${formatCoordinate(from.z)}`;
      if (to) command += ` ${formatCoordinate(to.x)} ${formatCoordinate(to.z)}`;

      const options = { visibility: "public" };
      const senderInfo = getSenderInfo();
      if (senderInfo) options.sender_info = senderInfo;

      // The effect reaches everyone (and shows) through this message.
      window._n21_.chatConsent
        ?.confirm("efectos", {
          title: "¿Enviar el efecto al chat?",
          description: "Los efectos se muestran a todos mediante un mensaje en el chat.",
          required: true,
        })
        .then((send) => {
          if (send) ChatManager.send(command, options);
        });
    }

    ChatManager.onMessage((messageData) => {
      const effect = parseEffectMessage(messageData?.message);
      if (effect) effects.play(effect);
      return true;
    });

    ChatCommandsManager.registerCommand(COMMAND_NAME, {
      description: "Lanzar un efecto en el tablero (tipo, color, origen y objetivo)",
      params: [
        {
          name: "tipo",
          getSuggestions: (fragment) =>
            effects.TYPES.map((t) => t.key).filter((k) => k.startsWith(String(fragment || "").toLowerCase())),
        },
        {
          name: "color",
          getSuggestions: (fragment) =>
            effects.PALETTES.map((p) => p.key).filter((k) => k.startsWith(String(fragment || "").toLowerCase())),
          // Or custom tones: #rrggbb,#rrggbb,...[,luz]
        },
        { name: "x" },
        { name: "z" },
        { name: "x2" },
        { name: "z2" },
      ],
      validate: ({ input }) => !!parseEffectMessage(input),
    });

    /* ---------------------------- board input ---------------------------- */

    function worldFromEvent(event) {
      const canvas = boardCanvas();
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const point = CameraManager.screenToWorld(event.clientX - rect.left, event.clientY - rect.top, 0);
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
      return { x: point.x, z: point.z };
    }

    function block(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function isArmedBoardEvent(event) {
      return !!armedPalette && event.target === boardCanvas() && (event.button === 0 || event.button === undefined);
    }

    function onPointerDown(event) {
      if (!isArmedBoardEvent(event)) return;
      block(event);
      const from = worldFromEvent(event);
      if (!from) return;

      const type = typeByKey.get(selectedType);
      if (!type.aim) {
        sendEffect(type.key, armedPalette, from, null);
        return;
      }
      drag = { pointerId: event.pointerId, from };
      effects.setPreview({ type: type.key, palette: paletteValue(armedPalette), from, to: from });
    }

    function onPointerMove(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      block(event);
      const to = worldFromEvent(event);
      if (!to) return;
      effects.setPreview({ type: selectedType, palette: paletteValue(armedPalette), from: drag.from, to });
    }

    function onPointerUp(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      block(event);
      const { from } = drag;
      const to = worldFromEvent(event);
      drag = null;
      effects.setPreview(null);
      if (!to || Math.hypot(to.x - from.x, to.z - from.z) < MIN_AIM_DISTANCE) return;
      sendEffect(selectedType, armedPalette, from, to);
    }

    function cancelDrag() {
      if (!drag) return;
      drag = null;
      effects.setPreview(null);
    }

    // Capture on window so the board never sees the clicks (no panning or
    // token selection) while an effect is armed.
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", cancelDrag, true);
    for (const type of ["mousedown", "mouseup", "click", "touchstart", "touchend"]) {
      window.addEventListener(
        type,
        (event) => {
          if (drag || isArmedBoardEvent(event)) block(event);
        },
        { capture: true, passive: false },
      );
    }

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !armedPalette) return;
      cancelDrag();
      setArmed(null);
    });

    /* ---------------------------- panel ---------------------------- */

    function escapeHtml(value) {
      const div = document.createElement("div");
      div.textContent = String(value ?? "");
      return div.innerHTML;
    }

    function swatchBackground(palette) {
      const colors = palette.colors;
      if (palette.random) return `conic-gradient(${colors.join(", ")}, ${colors[0]})`;
      return `radial-gradient(circle at 35% 35%, ${colors[0]}, ${colors[2]} 55%, ${colors[colors.length - 2]})`;
    }

    function typeHint(type) {
      return type.aim ? "Apuntar" : "Punto";
    }

    function buildPanelHtml() {
      const type = typeByKey.get(selectedType);
      // Grouped by how they're cast, so each option only needs its name.
      const options = [true, false]
        .map((aim) => {
          const items = effects.TYPES.filter((t) => t.aim === aim)
            .map(
              (t) => `
                <li class="n21-effects-option" role="option" tabindex="-1" data-type="${t.key}" aria-selected="${t.key === selectedType}">
                  ${typeIcon(t.key)}<span>${escapeHtml(t.label)}</span>
                </li>`,
            )
            .join("");
          return `<li class="n21-effects-group" role="presentation">${aim ? "Apuntar" : "Punto"}</li>${items}`;
        })
        .join("");
      const colors = effects.PALETTES.map(
        (p) => `
          <button type="button" class="n21-effects-color" data-palette="${p.key}" aria-pressed="false">
            <span class="n21-effects-swatch" style="background: ${swatchBackground(p)}"></span>
            <span>${escapeHtml(p.label)}</span>
          </button>`,
      ).join("");
      const tones = custom.colors
        .map(
          (color, i) =>
            `<input type="color" class="n21-effects-tone" data-index="${i}" value="${color}" aria-label="Tono ${i + 1} de ${custom.colors.length}" />`,
        )
        .join("");

      return `
        <div class="n21-effects">
          <div class="n21-effects-field">
            <span class="n21-effects-label" id="n21-effects-type-label">Tipo de efecto</span>
            <div class="n21-effects-select">
              <button type="button" class="n21-effects-select-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="n21-effects-type-label">
                <span class="n21-effects-select-icon">${typeIcon(type.key)}</span>
                <span class="n21-effects-select-name">${escapeHtml(type.label)}</span>
                <span class="n21-effects-hint-tag">${typeHint(type)}</span>
                <i class="ft-chevron-down" aria-hidden="true"></i>
              </button>
              <ul class="n21-effects-options" role="listbox" hidden>${options}</ul>
            </div>
          </div>
          <div class="n21-effects-colors">${colors}
            <button type="button" class="n21-effects-color" data-palette="${CUSTOM_KEY}" aria-pressed="false">
              <span class="n21-effects-swatch n21-effects-swatch--custom" style="background: ${swatchBackground(custom)}"></span>
              <span>Personalizado</span>
            </button>
          </div>
          <div class="n21-effects-custom" hidden>
            <div class="n21-effects-tones">${tones}</div>
            <div class="n21-effects-tones-scale" aria-hidden="true"><span>Inicio</span><span>Final</span></div>
            <label class="n21-effects-check">
              <input type="checkbox" class="n21-effects-glow" ${custom.glow ? "checked" : ""} />
              Luminoso (se suma a la luz, como el fuego)
            </label>
          </div>
          <p class="n21-effects-help" aria-live="polite"></p>
        </div>`;
    }

    function getPanel() {
      return document.querySelector(`.floating-panel.${PANEL_CLASS}`);
    }

    function updateHelp() {
      const panel = getPanel();
      const help = panel?.querySelector(".n21-effects-help");
      if (!help) return;
      const type = typeByKey.get(selectedType);
      if (!armedPalette) {
        help.textContent = "Elige un color para lanzar el efecto.";
      } else if (type.aim) {
        help.textContent = "Arrastra en el tablero desde el origen hasta el objetivo. Esc para terminar.";
      } else {
        help.textContent = "Haz clic en el tablero para lanzarlo. Esc para terminar.";
      }
    }

    function setArmed(paletteKey) {
      const valid = paletteByKey.has(paletteKey) || paletteKey === CUSTOM_KEY;
      armedPalette = paletteKey && valid ? paletteKey : null;
      document.body.classList.toggle("n21-effects-armed", !!armedPalette);
      const panel = getPanel();
      panel?.querySelectorAll(".n21-effects-color").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.palette === armedPalette));
      });
      const editor = panel?.querySelector(".n21-effects-custom");
      if (editor) {
        editor.hidden = armedPalette !== CUSTOM_KEY;
        // The panel keeps the height it opened with: let it follow the editor.
        panel.style.height = "auto";
      }
      updateHelp();
    }

    function updateCustom(panel) {
      custom = {
        colors: Array.from(panel.querySelectorAll(".n21-effects-tone")).map((input) => input.value.toLowerCase()),
        glow: !!panel.querySelector(".n21-effects-glow")?.checked,
      };
      storeCustom();
      const swatch = panel.querySelector(".n21-effects-swatch--custom");
      if (swatch) swatch.style.background = swatchBackground(custom);
    }

    function setType(typeKey) {
      if (!typeByKey.has(typeKey)) return;
      selectedType = typeKey;
      cancelDrag();
      const panel = getPanel();
      if (!panel) return;
      const type = typeByKey.get(typeKey);
      panel.querySelector(".n21-effects-select-icon").innerHTML = typeIcon(type.key);
      panel.querySelector(".n21-effects-select-name").textContent = type.label;
      panel.querySelector(".n21-effects-select-btn .n21-effects-hint-tag").textContent = typeHint(type);
      panel.querySelectorAll(".n21-effects-option").forEach((option) => {
        option.setAttribute("aria-selected", String(option.dataset.type === typeKey));
      });
      updateHelp();
    }

    function setListOpen(panel, open) {
      const button = panel.querySelector(".n21-effects-select-btn");
      const list = panel.querySelector(".n21-effects-options");
      list.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
      panel.style.height = "auto";
      if (open) {
        (list.querySelector('[aria-selected="true"]') || list.firstElementChild)?.focus();
      }
    }

    function bindPanel(panel) {
      if (panel.dataset.n21EffectsBound) return;
      panel.dataset.n21EffectsBound = "1";

      const button = panel.querySelector(".n21-effects-select-btn");
      const list = panel.querySelector(".n21-effects-options");

      button.addEventListener("click", () => setListOpen(panel, list.hidden));

      list.addEventListener("click", (event) => {
        const option = event.target.closest(".n21-effects-option");
        if (!option) return;
        setType(option.dataset.type);
        setListOpen(panel, false);
        button.focus();
      });

      list.addEventListener("keydown", (event) => {
        const options = Array.from(list.querySelectorAll(".n21-effects-option"));
        const index = options.indexOf(document.activeElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : -1;
          options[(index + step + options.length) % options.length]?.focus();
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (index >= 0) setType(options[index].dataset.type);
          setListOpen(panel, false);
          button.focus();
        } else if (event.key === "Escape") {
          event.stopPropagation();
          setListOpen(panel, false);
          button.focus();
        }
      });

      document.addEventListener("mousedown", (event) => {
        if (!list.hidden && !event.target.closest?.(".n21-effects-select")) setListOpen(panel, false);
      });

      panel.querySelector(".n21-effects-colors").addEventListener("click", (event) => {
        const color = event.target.closest(".n21-effects-color");
        if (!color) return;
        setArmed(armedPalette === color.dataset.palette ? null : color.dataset.palette);
      });

      panel.querySelector(".n21-effects-custom").addEventListener("input", () => updateCustom(panel));
      panel.querySelector(".n21-effects-custom").addEventListener("change", () => updateCustom(panel));
    }

    function openPanel() {
      const $panel = FloatingPanelManager.openStaticPanelWithHtml(
        PANEL_TITLE,
        "ft-zap",
        "#822020",
        buildPanelHtml(),
        `${PANEL_CLASS} n21-fixed-panel`,
        PANEL_STYLE,
      );
      const panel = $panel?.[0];
      if (!panel) return;
      bindPanel(panel);
      setArmed(armedPalette);
      setType(selectedType);
    }

    function closePanel() {
      getPanel()?.remove();
    }

    // The panel can also be closed with its own button: keep the toggle and
    // the armed state in sync with whether it's on screen.
    function syncWithPanel() {
      if (!getPanel()) {
        cancelDrag();
        if (armedPalette) setArmed(null);
      }
      QuickMenuUIManager.refreshToggleState(TOGGLE_ID);
    }

    const panelsHolder = document.getElementById("floating-panels-holder");
    new MutationObserver(syncWithPanel).observe(panelsHolder || document.body, {
      childList: true,
      subtree: !panelsHolder,
    });

    QuickMenuUIManager.registerConnectedActionsToggle({
      id: TOGGLE_ID,
      groupId: "nivel21",
      groupOrder: 10,
      actionOrder: 30,
      iconClass: "ft-zap",
      title: "Efectos",
      getState: () => !!getPanel(),
      onToggle: (open) => {
        if (open) openPanel();
        else closePanel();
      },
    });
  } catch (error) {
    window._n21_.utils.registerFeatureError("Effects Panel", error);
  }
})();
