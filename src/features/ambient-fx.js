(async () => {
  try {
    /* =======================
       Feature: Ambient FX
    ======================= */

    const { loadManagers } = window._n21_;
    const [
      MainMenuUIManager,
      FloatingPanelManager,
      SessionStateManager,
      PlayerManager,
    ] = await loadManagers(
      "MainMenuUIManager",
      "FloatingPanelManager",
      "SessionStateManager",
      "PlayerManager",
    );

    if (
      !MainMenuUIManager ||
      !FloatingPanelManager ||
      !SessionStateManager ||
      !PlayerManager
    ) {
      console.warn("[Ambient FX] Managers not available");
      return;
    }

    const STATE_KEY = "ambientFxColor";
    const OPACITY_KEY = "ambientFxOpacity";
    const BLEND_KEY = "ambientFxBlendMode";
    const OVERLAY_ID = "n21-ambient-fx-overlay";
    const PANEL_TITLE = "Efectos Ambientales";
    const FORM_DEBOUNCE_MS = 150;
    let formDebounceTimer = null;

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

    function getStateColor(state) {
      const color = state?.[STATE_KEY];
      return isTransparentValue(color) ? null : color;
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
      if (!normalized || normalized === "multiply") return null;
      return normalized;
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

      const normalized = normalizeBlendMode(blendMode) || "multiply";
      if (input.value !== normalized) {
        input.value = normalized;
      }
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
      const normalizedBlend = normalizeBlendMode(blendMode);
      if (normalizedBlend) {
        overlay.style.mixBlendMode = normalizedBlend;
      } else {
        overlay.style.mixBlendMode = "";
      }
      syncPanelInput(color);
      syncOpacityInput(normalizedOpacity);
      syncBlendModeInput(normalizedBlend);
    }

    function buildPanelHtml(color, opacity, blendMode) {
      const valueAttribute = color ? ` value='${color}'` : "";
      const normalizedOpacity = normalizeOpacity(opacity);
      const normalizedBlend = normalizeBlendMode(blendMode) || "multiply";
      const initialOpacity =
        typeof normalizedOpacity === "number"
          ? Math.round(normalizedOpacity * 100)
          : 100;
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
        "</div>"
      );
    }

    function scheduleStateUpdate(nextState) {
      if (formDebounceTimer) {
        clearTimeout(formDebounceTimer);
      }

      formDebounceTimer = setTimeout(() => {
        SessionStateManager.setState(nextState);
      }, FORM_DEBOUNCE_MS);
    }

    function openPanel() {
      const currentColor = getStateColor(SessionStateManager.state);
      const currentOpacity = normalizeOpacity(
        SessionStateManager.state?.[OPACITY_KEY],
      );
      const currentBlend = normalizeBlendMode(
        SessionStateManager.state?.[BLEND_KEY],
      );
      const html = buildPanelHtml(currentColor, currentOpacity, currentBlend);

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
      $input.on("input.n21AmbientFx", (event) => {
        const value = event.target.value;
        if (isTransparentValue(value)) {
          scheduleStateUpdate({ [STATE_KEY]: null });
          return;
        }
        scheduleStateUpdate({ [STATE_KEY]: value });
      });

      const $opacityInput = $panel.find("#n21-ambient-fx-opacity");
      if ($opacityInput.length) {
        $opacityInput.off("input.n21AmbientFx");
        $opacityInput.on("input.n21AmbientFx", (event) => {
          const raw = Number(event.target.value);
          const nextOpacity = Number.isFinite(raw) ? raw / 100 : 1;
          if (nextOpacity >= 1) {
            scheduleStateUpdate({ [OPACITY_KEY]: null });
            return;
          }
          scheduleStateUpdate({ [OPACITY_KEY]: nextOpacity });
        });
      }

      const $blendInput = $panel.find("#n21-ambient-fx-blend");
      if ($blendInput.length) {
        $blendInput.off("change.n21AmbientFx");
        $blendInput.on("change.n21AmbientFx", (event) => {
          const value = event.target.value;
          const normalized = normalizeBlendMode(value);
          if (!normalized) {
            scheduleStateUpdate({ [BLEND_KEY]: null });
            return;
          }
          scheduleStateUpdate({ [BLEND_KEY]: normalized });
        });
      }

      const $clearButton = $panel.find("#n21-ambient-fx-clear");
      if ($clearButton.length) {
        $clearButton.off("click.n21AmbientFx");
        $clearButton.on("click.n21AmbientFx", (event) => {
          event.preventDefault();
          scheduleStateUpdate({
            [STATE_KEY]: null,
            [OPACITY_KEY]: null,
            [BLEND_KEY]: null,
          });
        });
      }

      if (currentColor && $input.val() !== currentColor) {
        $input.val(currentColor);
      }
      if (typeof currentOpacity === "number" && $opacityInput.length) {
        $opacityInput.val(String(Math.round(currentOpacity * 100)));
      }
      if ($blendInput.length) {
        $blendInput.val(currentBlend || "multiply");
      }
    }

    applyColor(
      getStateColor(SessionStateManager.state),
      normalizeOpacity(SessionStateManager.state?.[OPACITY_KEY]),
      normalizeBlendMode(SessionStateManager.state?.[BLEND_KEY]),
    );

    SessionStateManager.onChange((state) => {
      applyColor(
        getStateColor(state),
        normalizeOpacity(state?.[OPACITY_KEY]),
        normalizeBlendMode(state?.[BLEND_KEY]),
      );
    });

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
