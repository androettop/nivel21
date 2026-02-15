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
      ChatManager,
    ] = await loadManagers(
      "MainMenuUIManager",
      "FloatingPanelManager",
      "ChatCommandsManager",
      "PlayerManager",
      "ChatUIManager",
      "ChatManager",
    );

    if (
      !MainMenuUIManager ||
      !FloatingPanelManager ||
      !ChatCommandsManager ||
      !PlayerManager ||
      !ChatUIManager ||
      !ChatManager
    ) {
      console.warn("[Ambient FX] Managers not available");
      return;
    }

    const COMMAND_NAME = "ambient-fx";
    const OVERLAY_ID = "n21-ambient-fx-overlay";
    const PREVIEW_OVERLAY_ID = "n21-ambient-fx-overlay-preview";
    const PANEL_TITLE = "Efectos Ambientales";
    const DEFAULT_BLEND = "multiply";
    const DEFAULT_COLOR = "#000000";
    const DEFAULT_OPACITY = 0;
    const COMMAND_CLEAR = "clear";
    const PREVIEW_TOGGLE_ID = "n21-ambient-fx-preview";
    const PREVIEW_DISABLE_DELAY_MS = 300;
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
    let previewEnabled = false;

    function normalizeOpacity(value) {
      if (value === undefined || value === null) return null;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return null;
      const clamped = Math.max(0, Math.min(1, numeric));
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
      if (!value) return false;
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
      const normalized = Math.max(0, Math.min(1, numeric));
      return normalized;
    }

    function parseOpacityInput(value, fallback = DEFAULT_OPACITY) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return fallback;
      return Math.max(0, Math.min(1, numeric));
    }

    function formatOpacityValue(value) {
      if (value === undefined || value === null) return "0";
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return "0";
      const clamped = Math.max(0, Math.min(1, numeric));
      const fixed = clamped.toFixed(2);
      return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
    }

    function getSenderInfo() {
      const senderInfoElement = document.getElementById(
        "room_message_sender_info",
      );
      return senderInfoElement?.value || null;
    }

    function sendCommandToChat(commandText, { debounce = false } = {}) {
      if (!commandText) return;
      const senderInfo = getSenderInfo();
      const messageOptions = { visibility: "public" };
      if (senderInfo) {
        messageOptions.sender_info = senderInfo;
      }
      if (debounce) {
        ChatManager.sendDebounced(commandText, messageOptions);
      } else {
        ChatManager.send(commandText, messageOptions);
      }
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
        return { color: null, opacity: DEFAULT_OPACITY, blend: null };
      }

      if (args[0]) {
        if (isValidColorValue(args[0])) {
          nextColor = args[0];
        }
      }

      if (args[1]) {
        const rawOpacity = String(args[1]).trim();
        const parsedOpacity = parseOpacityCommand(rawOpacity);
        if (parsedOpacity !== null) {
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

    function ensureOverlayById(id) {
      const canvas = document.querySelector("#application-canvas");
      if (!canvas || !canvas.parentElement) return null;

      let overlay = document.getElementById(id);
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = id;
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

    function ensureOverlay() {
      return ensureOverlayById(OVERLAY_ID);
    }

    function ensurePreviewLabel(overlay) {
      if (!overlay) return;
      let label = overlay.querySelector(".n21-ambient-fx-preview-label");
      if (!label) {
        label = document.createElement("div");
        label.className = "n21-ambient-fx-preview-label";
        label.textContent = "Vista previa";
        label.style.position = "absolute";
        label.style.inset = "0";
        label.style.display = "flex";
        label.style.alignItems = "center";
        label.style.justifyContent = "center";
        label.style.fontSize = "48px";
        label.style.fontWeight = "600";
        label.style.letterSpacing = "1px";
        label.style.color = "rgba(255, 255, 255, 0.7)";
        label.style.textTransform = "uppercase";
        label.style.pointerEvents = "none";
        label.style.textShadow = "0 2px 8px rgba(0, 0, 0, 0.4)";
        overlay.appendChild(label);
      }
    }

    function ensurePreviewOverlay() {
      const overlay = ensureOverlayById(PREVIEW_OVERLAY_ID);
      ensurePreviewLabel(overlay);
      return overlay;
    }

    function getPreviewOverlay() {
      return document.getElementById(PREVIEW_OVERLAY_ID);
    }

    function setPreviewVisibility(enabled) {
      const mainOverlay = ensureOverlay();
      if (mainOverlay) {
        mainOverlay.style.display = enabled ? "none" : "";
      }

      const previewOverlay = enabled ? ensurePreviewOverlay() : getPreviewOverlay();
      if (previewOverlay) {
        previewOverlay.style.display = enabled ? "" : "none";
      }
    }

    function applyOverlayStyles(overlay, color, opacity, blendMode) {
      if (!overlay) return;

      if (!color) {
        overlay.style.backgroundColor = "";
      } else {
        overlay.style.backgroundColor = color;
      }

      const normalizedOpacity = normalizeOpacity(opacity);
      overlay.style.opacity =
        normalizedOpacity !== null ? String(normalizedOpacity) : "";

      const normalizedBlend = sanitizeBlendMode(blendMode);
      overlay.style.mixBlendMode = normalizedBlend || "";
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

      const normalized = normalizeOpacity(opacity) ?? DEFAULT_OPACITY;
      const nextValue = formatOpacityValue(normalized);
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

      const normalizedOpacity = normalizeOpacity(opacity) ?? DEFAULT_OPACITY;
      const normalizedBlend = sanitizeBlendMode(blend) || DEFAULT_BLEND;
      const safeColor = color || DEFAULT_COLOR;

      const opacityText = formatOpacityValue(normalizedOpacity);
      return `/${COMMAND_NAME} ${safeColor} ${opacityText} ${normalizedBlend}`;
    }

    function getCommandFromInputs(forceClear = false) {
      const colorInput = document.querySelector("#n21-ambient-fx-color");
      const opacityInput = document.querySelector("#n21-ambient-fx-opacity");
      const blendInput = document.querySelector("#n21-ambient-fx-blend");

      const color = colorInput?.value || DEFAULT_COLOR;
      const opacityValue = parseOpacityInput(opacityInput?.value);
      const blend = blendInput?.value || DEFAULT_BLEND;

      return buildCommand(color, opacityValue, blend, forceClear);
    }

    function updatePreviewOverlayFromInputs() {
      const colorInput = document.querySelector("#n21-ambient-fx-color");
      const opacityInput = document.querySelector("#n21-ambient-fx-opacity");
      const blendInput = document.querySelector("#n21-ambient-fx-blend");

      const color = colorInput?.value || DEFAULT_COLOR;
      const opacityValue = parseOpacityInput(opacityInput?.value);
      const blend = blendInput?.value || DEFAULT_BLEND;

      const overlay = ensurePreviewOverlay();
      applyOverlayStyles(overlay, color, opacityValue, blend);
    }

    function applyColor(color, opacity, blendMode) {
      const overlay = ensureOverlay();
      if (!overlay) return;

      applyOverlayStyles(overlay, color, opacity, blendMode);

      const normalizedOpacity = normalizeOpacity(opacity);
      const normalizedBlend = sanitizeBlendMode(blendMode);
      syncPanelInput(color);
      syncOpacityInput(normalizedOpacity);
      syncBlendModeInput(normalizedBlend);

      if (previewEnabled) {
        updatePreviewOverlayFromInputs();
      }
      setPreviewVisibility(previewEnabled);
    }

    function buildPanelHtml(color, opacity, blendMode) {
      const valueAttribute = color ? ` value='${color}'` : "";
      const normalizedOpacity = normalizeOpacity(opacity);
      const normalizedBlend = sanitizeBlendMode(blendMode) || DEFAULT_BLEND;
      const initialOpacity =
        typeof normalizedOpacity === "number"
          ? formatOpacityValue(normalizedOpacity)
          : formatOpacityValue(DEFAULT_OPACITY);
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
        `<input id='n21-ambient-fx-opacity' type='range' min='0' max='1' step='0.01' value='${initialOpacity}' ` +
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
        "<label style='display: flex; gap: 8px; align-items: center; margin-top: 12px;'>" +
        `<input id='${PREVIEW_TOGGLE_ID}' type='checkbox' />` +
        "Vista previa" +
        "</label>" +
        "<div style='display: flex; gap: 8px; margin-top: 12px;'>" +
        "<button id='n21-ambient-fx-clear' class='btn btn-secondary' style='width: 50%;'>" +
        "Limpiar" +
        "</button>" +
        "<button id='n21-ambient-fx-apply' class='btn btn-primary' style='width: 50%;'>" +
        "Aplicar" +
        "</button>" +
        "</div>" +
        "</div>"
      );
    }

    function applyState(color, opacity, blendMode) {
      currentColor = color || null;
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
        "width: 300px; height: 352px; min-width: 300px; min-height: 352px; max-width: 300px; max-height: 352px;",
      );

      if (!$panel || typeof $panel.find !== "function") return;

      const $input = $panel.find("#n21-ambient-fx-color");
      if (!$input.length) return;

      $input.off("input.n21AmbientFx");
      $input.on("input.n21AmbientFx", () => {
        if (previewEnabled) {
          updatePreviewOverlayFromInputs();
        }
      });

      const $opacityInput = $panel.find("#n21-ambient-fx-opacity");
      if ($opacityInput.length) {
        $opacityInput.off("input.n21AmbientFx");
        $opacityInput.on("input.n21AmbientFx", () => {
          if (previewEnabled) {
            updatePreviewOverlayFromInputs();
          }
        });
      }

      const $blendInput = $panel.find("#n21-ambient-fx-blend");
      if ($blendInput.length) {
        $blendInput.off("change.n21AmbientFx");
        $blendInput.on("change.n21AmbientFx", () => {
          if (previewEnabled) {
            updatePreviewOverlayFromInputs();
          }
        });
      }

      const $previewToggle = $panel.find(`#${PREVIEW_TOGGLE_ID}`);
      if ($previewToggle.length) {
        $previewToggle.prop("checked", previewEnabled);
        $previewToggle.off("change.n21AmbientFx");
        $previewToggle.on("change.n21AmbientFx", () => {
          previewEnabled = Boolean($previewToggle.prop("checked"));
          setPreviewVisibility(previewEnabled);
          if (previewEnabled) {
            updatePreviewOverlayFromInputs();
          }
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
            $opacityInput.val(formatOpacityValue(DEFAULT_OPACITY));
          }
          if ($blendInput.length) {
            $blendInput.val(DEFAULT_BLEND);
          }
          if (previewEnabled) {
            setTimeout(() => {
              previewEnabled = false;
              if ($previewToggle.length) {
                $previewToggle.prop("checked", false);
              }
              setPreviewVisibility(false);
            }, PREVIEW_DISABLE_DELAY_MS);
          }
          const commandText = getCommandFromInputs(true);
          sendCommandToChat(commandText, { debounce: true });
        });
      }

      const $applyButton = $panel.find("#n21-ambient-fx-apply");
      if ($applyButton.length) {
        $applyButton.off("click.n21AmbientFx");
        $applyButton.on("click.n21AmbientFx", (event) => {
          event.preventDefault();
          if (previewEnabled) {
            setTimeout(() => {
              previewEnabled = false;
              if ($previewToggle.length) {
                $previewToggle.prop("checked", false);
              }
              setPreviewVisibility(false);
            }, PREVIEW_DISABLE_DELAY_MS);
          }
          const commandText = getCommandFromInputs(false);
          sendCommandToChat(commandText, { debounce: true });
        });
      }

      if (currentColor && $input.val() !== currentColor) {
        $input.val(currentColor);
      }
      if (typeof panelOpacity === "number" && $opacityInput.length) {
        $opacityInput.val(formatOpacityValue(panelOpacity));
      }
      if ($blendInput.length) {
        $blendInput.val(panelBlend || DEFAULT_BLEND);
      }
      setPreviewVisibility(previewEnabled);
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
          if (parsedOpacity === null) {
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
        applyState(null, DEFAULT_OPACITY, null);
        return;
      }

      let nextColor = currentColor;
      let nextOpacity = currentOpacity;
      let nextBlend = currentBlend;

      if (args[0]) {
        if (isValidColorValue(args[0])) {
          nextColor = args[0];
        }
      }

      if (args[1]) {
        const rawOpacity = String(args[1]).trim();
        const parsedOpacity = parseOpacityCommand(rawOpacity);
        if (parsedOpacity !== null) {
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
