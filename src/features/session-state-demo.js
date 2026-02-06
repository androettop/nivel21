(async () => {
  try {
    /* =======================
       Feature: Session State Demo Panel
    ======================= */

    const { loadManagers } = window._n21_;
    const [SessionStateManager, PlayerManager] = await loadManagers(
      "SessionStateManager",
      "PlayerManager",
    );

    if (!SessionStateManager || !PlayerManager) {
      console.warn("[Session State Demo] Managers not available");
      return;
    }

    const STATE_KEY = "demoText";
    const DEBOUNCE_MS = 300;

    const isGM = PlayerManager.isGameMaster();

    const panel = document.createElement("div");
    panel.id = "n21-session-state-demo";
    panel.style.position = "fixed";
    panel.style.right = "16px";
    panel.style.bottom = "16px";
    panel.style.zIndex = "9999";
    panel.style.background = "rgba(20, 20, 20, 0.9)";
    panel.style.color = "#fff";
    panel.style.padding = "10px 12px";
    panel.style.borderRadius = "8px";
    panel.style.fontSize = "12px";
    panel.style.fontFamily = "Arial, sans-serif";
    panel.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.25)";
    panel.style.maxWidth = "240px";

    const title = document.createElement("div");
    title.textContent = "Session State Demo";
    title.style.fontWeight = "600";
    title.style.marginBottom = "6px";
    panel.appendChild(title);

    const display = document.createElement("div");
    display.textContent = "";
    display.style.minHeight = "16px";
    display.style.whiteSpace = "pre-wrap";
    display.style.wordBreak = "break-word";

    let input = null;
    let debounceTimer = null;

    if (isGM) {
      input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Escribe un mensaje...";
      input.style.width = "100%";
      input.style.marginBottom = "6px";
      input.style.padding = "6px 8px";
      input.style.borderRadius = "6px";
      input.style.border = "1px solid rgba(255, 255, 255, 0.2)";
      input.style.background = "rgba(255, 255, 255, 0.1)";
      input.style.color = "#fff";

      input.addEventListener("input", () => {
        const value = input.value;
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          SessionStateManager.setState({ [STATE_KEY]: value });
        }, DEBOUNCE_MS);
      });

      panel.appendChild(input);
    }

    panel.appendChild(display);
    document.body.appendChild(panel);

    function renderState(state) {
      const nextValue = state?.[STATE_KEY] || "";
      display.textContent = nextValue;

      if (input && document.activeElement !== input && input.value !== nextValue) {
        input.value = nextValue;
      }
    }

    renderState(SessionStateManager.state);

    SessionStateManager.onChange((state) => {
      renderState(state);
    });
  } catch (error) {
    console.error("[Session State Demo] Error:", error);
  }
})();
