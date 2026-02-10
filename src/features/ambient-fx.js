(async () => {
  try {
    /* =======================
       Feature: Ambient FX
    ======================= */

    const { loadManagers } = window._n21_;
    const [
      MainMenuUIManager,
      FloatingPanelManager,
      ChatCommandsManager,
      PlayerManager,
      ChatUIManager,
    ] = await loadManagers(
      "MainMenuUIManager",
      "FloatingPanelManager",
      "ChatCommandsManager",
      "PlayerManager",
      "ChatUIManager",
    );

    if (
      !MainMenuUIManager ||
      !FloatingPanelManager ||
      !ChatCommandsManager ||
      !PlayerManager ||
      !ChatUIManager
    ) {
      console.warn("[Ambient FX] Managers not available");
      return;
    }

    const COMMAND_NAME = "ambient-fx";
    const OVERLAY_ID = "n21-ambient-fx-overlay";
    const PANEL_TITLE = "Efectos Ambientales";
    const DEFAULT_BLEND = "multiply";
    const DEFAULT_COLOR = "#000000";
    const COMMAND_CLEAR = "clear";
    const CHAT_SELECTORS = {
      messageBox: ".room-message",
      userName: ".user-name",
    };
    const BLEND_MODES = [
      "multiply",
      "normal",
      "screen",
      "overlay",
      "darken",
      "lighten",
      "color-dodge",
      "color-burn",
      "hard-light",
      "soft-light",
      "difference",
      "exclusion",
      "hue",
      "saturation",
      "color",
      "luminosity",
    ];

    let currentColor = null;
    let currentOpacity = null;
    let currentBlend = null;

    function isTransparentValue(value) {
      if (value === undefined || value === null) return true;
      const normalized = String(value).trim().toLowerCase();
      return (
        normalized === "" ||
        normalized === "transparent" ||
        normalized === "none" ||
        normalized === "rgba(0, 0, 0, 0)" ||
        normalized === "rgba(0,0,0,0)" ||
        normalized === "rgba(0, 0, 0, 0.0)" ||
        normalized === "rgba(0,0,0,0.0)"
      );
    }

    function normalizeOpacity(value) {
      if (value === undefined || value === null) return null;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return null;
      const clamped = Math.max(0, Math.min(1, numeric));
      if (clamped === 1) return null;
      return clamped;
    }

    function normalizeBlendMode(value) {
      if (value === undefined || value === null) return null;
      const normalized = String(value).trim().toLowerCase();
      if (!normalized || normalized === DEFAULT_BLEND) return null;
      return normalized;
    }

    function isKnownBlendMode(value) {
      if (!value) return false;
      return BLEND_MODES.includes(value);
    }

    function sanitizeBlendMode(value) {
      const normalized = normalizeBlendMode(value);
      if (!normalized) return null;
      return isKnownBlendMode(normalized) ? normalized : null;
    }

    function isValidColorValue(value) {
      if (!value || isTransparentValue(value)) return false;
      const trimmed = String(value).trim();
      if (!trimmed) return false;
      if (window.CSS && typeof window.CSS.supports === "function") {
        return window.CSS.supports("color", trimmed);
      }
      return true;
    }

    function parseOpacityCommand(value) {
      if (value === undefined || value === null || value === "") return null;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return null;
      let normalized = numeric;
      if (numeric > 1) {
        normalized = numeric / 100;
      }
      normalized = Math.max(0, Math.min(1, normalized));
      if (normalized === 1) return null;
      return normalized;
    }

    function resolveSenderIdFromElement(messageElement) {
      if (!messageElement || !messageElement.closest) return null;
      const messageBox = messageElement.closest(CHAT_SELECTORS.messageBox);
      const userNameElement = messageBox?.querySelector(CHAT_SELECTORS.userName);
      const senderName = userNameElement?.textContent
        ?.replace(":", "")
        .trim();
      if (!senderName) return null;

      const players = PlayerManager.getPlayerList() || [];
      const sender = players.find((player) => {
        const playerName = String(player?.userName || "").trim();
        return playerName === senderName;
      });
      return sender?.userId || null;
    }

    function computeNextStateFromArgs(args, state) {
      const currentState = state || {};
      let nextColor = currentState.color ?? null;
      let nextOpacity = currentState.opacity ?? null;
      let nextBlend = currentState.blend ?? null;

      if (String(args[0]).trim().toLowerCase() === COMMAND_CLEAR) {
        return { color: null, opacity: null, blend: null };
      }

      if (args[0]) {
        if (isTransparentValue(args[0])) {
          nextColor = null;
        } else if (isValidColorValue(args[0])) {
          nextColor = args[0];
        }
      }

      if (args[1]) {
        const rawOpacity = String(args[1]).trim();
        const parsedOpacity = parseOpacityCommand(rawOpacity);
        if (
          parsedOpacity !== null ||
          rawOpacity === "0" ||
          rawOpacity === "1"
        ) {
          nextOpacity = parsedOpacity;
        }
      }

      if (args[2]) {
        const rawBlend = String(args[2]).trim().toLowerCase();
        if (isKnownBlendMode(rawBlend)) {
          nextBlend = rawBlend === DEFAULT_BLEND ? null : rawBlend;
        }
      }

      return { color: nextColor, opacity: nextOpacity, blend: nextBlend };
    }

    function isChatOrderReversed() {
      const selector =
        typeof ChatUIManager.getChatContainerSelector === "function"
          ? ChatUIManager.getChatContainerSelector()
          : ".room-messages-chat";
      const container = document.querySelector(selector);
      if (!container || !window.getComputedStyle) return false;
      const style = window.getComputedStyle(container);
      return style?.flexDirection === "column-reverse";
    }

    function restoreFromChatHistory() {
      const matches = [];
      const handlerName = "ambient-fx-restore";

      ChatUIManager.onMessage(
        handlerName,
        (element) => {
          const messageText = element?.textContent?.trim();
          if (!messageText) return;
          const parsed = ChatCommandsManager.parseInput(messageText);
          if (!parsed || !parsed.isCommand || parsed.name !== COMMAND_NAME) {
            return;
          }

          const senderId = resolveSenderIdFromElement(element);
          if (!senderId || !PlayerManager.isUserGameMaster(senderId)) return;

          const args = parsed.args || [];
          if (!args.length) return;
          matches.push({ element, args });
        },
        {
          priority: -100,
          onComplete: () => {
            if (matches.length) {
              matches.sort((a, b) => {
                if (a.element === b.element) return 0;
                const position = a.element.compareDocumentPosition(b.element);
                return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
              });

              if (isChatOrderReversed()) {
                matches.reverse();
              }

              let lastState = {
                color: currentColor,
                opacity: currentOpacity,
                blend: currentBlend,
              };

              for (const match of matches) {
                lastState = computeNextStateFromArgs(match.args, lastState);
              }

              applyState(lastState.color, lastState.opacity, lastState.blend);
            }
            ChatUIManager.removeHandler(handlerName);
          },
        },
      );

      ChatUIManager.processExistingMessages();
    }

    function ensureOverlay() {
      const canvas = document.querySelector("#application-canvas");
      if (!canvas || !canvas.parentElement) return null;

      let overlay = document.getElementById(OVERLAY_ID);
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = OVERLAY_ID;
        overlay.className = "n21-ambient-fx-overlay";

        const parent = canvas.parentElement;
        if (canvas.nextSibling) {
          parent.insertBefore(overlay, canvas.nextSibling);
        } else {
          parent.appendChild(overlay);
        }
      }

      return overlay;
    }

    function syncPanelInput(color) {
      const input = document.querySelector("#n21-ambient-fx-color");
      if (!input) return;

      if (!color) return;

      if (input.value !== color) {
        input.value = color;
      }
    }

    function syncOpacityInput(opacity) {
      const input = document.querySelector("#n21-ambient-fx-opacity");
      if (!input) return;

      const normalized = normalizeOpacity(opacity) ?? 1;
      const nextValue = String(Math.round(normalized * 100));
      if (input.value !== nextValue) {
        input.value = nextValue;
      }
    }

    function syncBlendModeInput(blendMode) {
      const input = document.querySelector("#n21-ambient-fx-blend");
      if (!input) return;

      const normalized = sanitizeBlendMode(blendMode) || DEFAULT_BLEND;
      if (input.value !== normalized) {
        input.value = normalized;
      }
    }

    function buildCommand(color, opacity, blend, forceClear = false) {
      if (forceClear) return `/${COMMAND_NAME} ${COMMAND_CLEAR}`;

      const normalizedOpacity = normalizeOpacity(opacity) ?? 1;
      const normalizedBlend = sanitizeBlendMode(blend) || DEFAULT_BLEND;
      const safeColor = color || DEFAULT_COLOR;

      if (
        !color &&
        normalizedOpacity === 1 &&
        normalizedBlend === DEFAULT_BLEND
      ) {
        return `/${COMMAND_NAME} ${COMMAND_CLEAR}`;
      }

      const opacityText = String(Math.round(normalizedOpacity * 100) / 100);
      return `/${COMMAND_NAME} ${safeColor} ${opacityText} ${normalizedBlend}`;
    }

    function setCommandPreview(value) {
      const input = document.querySelector("#n21-ambient-fx-command");
      if (!input) return;
      input.value = value;
    }

    function updateCommandPreviewFromState() {
      const command = buildCommand(currentColor, currentOpacity, currentBlend);
      setCommandPreview(command);
    }

    function updateCommandPreviewFromForm(forceClear = false) {
      const colorInput = document.querySelector("#n21-ambient-fx-color");
      const opacityInput = document.querySelector("#n21-ambient-fx-opacity");
      const blendInput = document.querySelector("#n21-ambient-fx-blend");

      const color = colorInput?.value || DEFAULT_COLOR;
      const opacityRaw = opacityInput?.value;
      const opacityValue = Number.isFinite(Number(opacityRaw))
        ? Number(opacityRaw) / 100
        : 1;
      const blend = blendInput?.value || DEFAULT_BLEND;

      const command = buildCommand(color, opacityValue, blend, forceClear);
      setCommandPreview(command);
    }

    function applyColor(color, opacity, blendMode) {
      const overlay = ensureOverlay();
      if (!overlay) return;

      if (!color) {
        overlay.style.backgroundColor = "";
      } else {
        overlay.style.backgroundColor = color;
      }
      const normalizedOpacity = normalizeOpacity(opacity);
      if (normalizedOpacity !== null) {
        overlay.style.opacity = String(normalizedOpacity);
      } else {
        overlay.style.opacity = "";
      }
      const normalizedBlend = sanitizeBlendMode(blendMode);
      if (normalizedBlend) {
        overlay.style.mixBlendMode = normalizedBlend;
      } else {
        overlay.style.mixBlendMode = "";
      }
      syncPanelInput(color);
      syncOpacityInput(normalizedOpacity);
      syncBlendModeInput(normalizedBlend);
      updateCommandPreviewFromState();
    }

    function buildPanelHtml(color, opacity, blendMode) {
      const valueAttribute = color ? ` value='${color}'` : "";
      const normalizedOpacity = normalizeOpacity(opacity);
      const normalizedBlend = sanitizeBlendMode(blendMode) || DEFAULT_BLEND;
      const initialOpacity =
        typeof normalizedOpacity === "number"
          ? Math.round(normalizedOpacity * 100)
          : 100;
      const commandText = buildCommand(
        color,
        normalizedOpacity,
        normalizedBlend,
      );
      return (
        "<div class='n21-ambient-fx-panel-body' style='padding: 12px;'>" +
        "<label for='n21-ambient-fx-color' style='display: block; margin-bottom: 8px; font-weight: 600;'>" +
        "Color de ambiente" +
        "</label>" +
        `<input id='n21-ambient-fx-color' type='color'${valueAttribute} ` +
        "style='border: none; padding: 0; background: transparent; margin-bottom: 12px;' />" +
        "<label for='n21-ambient-fx-opacity' style='display: block; margin-bottom: 8px; font-weight: 600;'>" +
        "Intensidad" +
        "</label>" +
        `<input id='n21-ambient-fx-opacity' type='range' min='0' max='100' step='1' value='${initialOpacity}' ` +
        "style='width: 100%; margin-bottom: 12px;' />" +
        "<label for='n21-ambient-fx-blend' style='display: block; margin-bottom: 8px; font-weight: 600;'>" +
        "Modo de fusion" +
        "</label>" +
        "<select id='n21-ambient-fx-blend' style='width: 100%;'>" +
        `<option value='multiply'${
          normalizedBlend === "multiply" ? " selected" : ""
        }>Multiplicar</option>` +
        `<option value='normal'${
          normalizedBlend === "normal" ? " selected" : ""
        }>Normal</option>` +
        `<option value='screen'${
          normalizedBlend === "screen" ? " selected" : ""
        }>Pantalla</option>` +
        `<option value='overlay'${
          normalizedBlend === "overlay" ? " selected" : ""
        }>Superponer</option>` +
        `<option value='darken'${
          normalizedBlend === "darken" ? " selected" : ""
        }>Oscurecer</option>` +
        `<option value='lighten'${
          normalizedBlend === "lighten" ? " selected" : ""
        }>Aclarar</option>` +
        `<option value='color-dodge'${
          normalizedBlend === "color-dodge" ? " selected" : ""
        }>Sobreexponer color</option>` +
        `<option value='color-burn'${
          normalizedBlend === "color-burn" ? " selected" : ""
        }>Subexponer color</option>` +
        `<option value='hard-light'${
          normalizedBlend === "hard-light" ? " selected" : ""
        }>Luz dura</option>` +
        `<option value='soft-light'${
          normalizedBlend === "soft-light" ? " selected" : ""
        }>Luz suave</option>` +
        `<option value='difference'${
          normalizedBlend === "difference" ? " selected" : ""
        }>Diferencia</option>` +
        `<option value='exclusion'${
          normalizedBlend === "exclusion" ? " selected" : ""
        }>Exclusion</option>` +
        `<option value='hue'${
          normalizedBlend === "hue" ? " selected" : ""
        }>Tono</option>` +
        `<option value='saturation'${
          normalizedBlend === "saturation" ? " selected" : ""
        }>Saturacion</option>` +
        `<option value='color'${
          normalizedBlend === "color" ? " selected" : ""
        }>Color</option>` +
        `<option value='luminosity'${
          normalizedBlend === "luminosity" ? " selected" : ""
        }>Luminosidad</option>` +
        "</select>" +
        "<button id='n21-ambient-fx-clear' class='btn btn-secondary' style='width: 100%; margin-top: 12px;'>" +
        "Limpiar efectos" +
        "</button>" +
        "<label for='n21-ambient-fx-command' style='display: block; margin: 12px 0 8px; font-weight: 600;'>" +
        "Comando para enviar al chat" +
        "</label>" +
        `<input id='n21-ambient-fx-command' type='text' readonly value='${commandText}' ` +
        "style='width: 100%;' />" +
        "</div>"
      );
    }

    function applyState(color, opacity, blendMode) {
      currentColor = isTransparentValue(color) ? null : color || null;
      currentOpacity = normalizeOpacity(opacity);
      currentBlend = sanitizeBlendMode(blendMode);
      applyColor(currentColor, currentOpacity, currentBlend);
    }

    function openPanel() {
      const panelOpacity = normalizeOpacity(currentOpacity ?? null);
      const panelBlend = sanitizeBlendMode(currentBlend ?? null);
      const html = buildPanelHtml(currentColor, panelOpacity, panelBlend);

      const $panel = FloatingPanelManager.openStaticPanelWithHtml(
        PANEL_TITLE,
        "ft-sun",
        "#822020",
        html,
        "n21-ambient-fx-panel",
        "width: 300px;",
      );

      if (!$panel || typeof $panel.find !== "function") return;

      const $input = $panel.find("#n21-ambient-fx-color");
      if (!$input.length) return;

      $input.off("input.n21AmbientFx");
      $input.on("input.n21AmbientFx", () => {
        updateCommandPreviewFromForm();
      });

      const $opacityInput = $panel.find("#n21-ambient-fx-opacity");
      if ($opacityInput.length) {
        $opacityInput.off("input.n21AmbientFx");
        $opacityInput.on("input.n21AmbientFx", () => {
          updateCommandPreviewFromForm();
        });
      }

      const $blendInput = $panel.find("#n21-ambient-fx-blend");
      if ($blendInput.length) {
        $blendInput.off("change.n21AmbientFx");
        $blendInput.on("change.n21AmbientFx", () => {
          updateCommandPreviewFromForm();
        });
      }

      const $clearButton = $panel.find("#n21-ambient-fx-clear");
      if ($clearButton.length) {
        $clearButton.off("click.n21AmbientFx");
        $clearButton.on("click.n21AmbientFx", (event) => {
          event.preventDefault();
          if ($input.length) {
            $input.val(DEFAULT_COLOR);
          }
          if ($opacityInput.length) {
            $opacityInput.val("100");
          }
          if ($blendInput.length) {
            $blendInput.val(DEFAULT_BLEND);
          }
          updateCommandPreviewFromForm(true);
        });
      }

      const $commandInput = $panel.find("#n21-ambient-fx-command");
      if ($commandInput.length) {
        $commandInput.off("click.n21AmbientFx focus.n21AmbientFx");
        $commandInput.on("click.n21AmbientFx focus.n21AmbientFx", (event) => {
          const target = event.currentTarget;
          if (target && typeof target.select === "function") {
            target.select();
          }
        });
      }

      if (currentColor && $input.val() !== currentColor) {
        $input.val(currentColor);
      }
      if (typeof panelOpacity === "number" && $opacityInput.length) {
        $opacityInput.val(String(Math.round(panelOpacity * 100)));
      }
      if ($blendInput.length) {
        $blendInput.val(panelBlend || DEFAULT_BLEND);
      }
      updateCommandPreviewFromState();
    }

    ChatCommandsManager.registerCommand(COMMAND_NAME, {
      description: "Aplicar efectos ambientales",
      params: [
        { name: "color" },
        { name: "opacity" },
        {
          name: "blend",
          getSuggestions: (fragment) => {
            if (!fragment) return BLEND_MODES;
            const lower = fragment.toLowerCase();
            return BLEND_MODES.filter((mode) => mode.startsWith(lower));
          },
        },
      ],
      validate: ({ args }) => {
        if (!args || !args.length) return false;

        const command = String(args[0] || "")
          .trim()
          .toLowerCase();
        if (command === COMMAND_CLEAR) {
          return args.length === 1;
        }

        if (!isValidColorValue(args[0])) return false;

        if (args.length > 3) return false;

        if (args[1]) {
          const rawOpacity = String(args[1]).trim();
          const parsedOpacity = parseOpacityCommand(rawOpacity);
          if (
            parsedOpacity === null &&
            rawOpacity !== "0" &&
            rawOpacity !== "1"
          ) {
            return false;
          }
        }

        if (args[2]) {
          const rawBlend = String(args[2]).trim().toLowerCase();
          if (!isKnownBlendMode(rawBlend)) return false;
        }

        return true;
      },
    });

    ChatCommandsManager.onCommand((payload) => {
      if (payload.command?.name !== COMMAND_NAME) return;

      const senderId = payload?.messageData?.raw?.user_id;
      if (!senderId || !PlayerManager.isUserGameMaster(senderId)) return;

      const args = payload.args || [];
      if (!args.length) return;

      if (String(args[0]).trim().toLowerCase() === COMMAND_CLEAR) {
        applyState(null, null, null);
        return;
      }

      let nextColor = currentColor;
      let nextOpacity = currentOpacity;
      let nextBlend = currentBlend;

      if (args[0]) {
        if (isTransparentValue(args[0])) {
          nextColor = null;
        } else if (isValidColorValue(args[0])) {
          nextColor = args[0];
        }
      }

      if (args[1]) {
        const rawOpacity = String(args[1]).trim();
        const parsedOpacity = parseOpacityCommand(rawOpacity);
        if (
          parsedOpacity !== null ||
          rawOpacity === "0" ||
          rawOpacity === "1"
        ) {
          nextOpacity = parsedOpacity;
        }
      }

      if (args[2]) {
        const rawBlend = String(args[2]).trim().toLowerCase();
        if (isKnownBlendMode(rawBlend)) {
          nextBlend = rawBlend === DEFAULT_BLEND ? null : rawBlend;
        }
      }

      applyState(nextColor, nextOpacity, nextBlend);
    });

    applyColor(currentColor, currentOpacity, currentBlend);
    restoreFromChatHistory();

    if (!PlayerManager.isGameMaster()) {
      return;
    }

    const header = await MainMenuUIManager.addHeader("Nivel 21", {
      id: "n21-menu-header",
    });

    await MainMenuUIManager.addItem(
      {
        id: "n21-ambient-fx-item",
        title: PANEL_TITLE,
        iconClass: "ft-sun",
        menuId: "ambient-fx",
        onClick: () => {
          openPanel();
        },
      },
      {
        afterElement: header,
      },
    );
  } catch (error) {
    console.error("[Ambient FX] Error:", error);
  }
})();
