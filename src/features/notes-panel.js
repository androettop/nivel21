(async () => {
  try {
    /* =======================
       Feature: Notes Panel
    ======================= */

    const { loadManagers } = window._n21_;
    const { uuid } = window._n21_?.utils || {};

    const [MainMenuUIManager, FloatingPanelManager, SettingsManager] = await loadManagers(
      "MainMenuUIManager",
      "FloatingPanelManager",
      "SettingsManager",
    );

    // Check if feature is enabled
    if (!SettingsManager.get("feature.notes-panel.enabled")) {
      return;
    }

    if (!MainMenuUIManager || !FloatingPanelManager) {
      console.warn("[Notes Panel] Managers not available");
      return;
    }

    const MENU_ITEM_ID = "n21-notes-panel";
    const PANEL_TITLE = "Notas";
    const PANEL_ICON = "ft-file";
    const PANEL_COLOR = "#822020";
    const PANEL_CLASS = "n21-notes-floating-panel";
    const PANEL_STYLE = "min-width: 360px; min-height: 320px; width: 360px; height: 320px;";
    const STORAGE_KEY = "n21.notes";

    function getStoredContent() {
      try {
        return localStorage.getItem(STORAGE_KEY) || "";
      } catch (error) {
        console.warn("[Notes Panel] Unable to read localStorage", error);
        return "";
      }
    }

    function storeContent(value) {
      try {
        localStorage.setItem(STORAGE_KEY, value || "");
      } catch (error) {
        console.warn("[Notes Panel] Unable to write localStorage", error);
      }
    }

    function escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }

    function openNotesPanel() {
      const initialContent = getStoredContent();
      const escapedContent = escapeHtml(initialContent);
      
      const html = "<textarea class='n21-notes-textarea'>" + escapedContent + "</textarea>";

      const $panel = FloatingPanelManager.openStaticPanelWithHtml(
        PANEL_TITLE,
        PANEL_ICON,
        PANEL_COLOR,
        html,
        PANEL_CLASS,
        PANEL_STYLE,
      );

      if (!$panel || !$panel.length) return;

      const textarea = $panel.find("textarea.n21-notes-textarea")[0];
      if (!textarea) return;

      textarea.addEventListener("input", () => {
        storeContent(textarea.value);
      });

      textarea.addEventListener("change", () => {
        storeContent(textarea.value);
      });
    }

    const header = await MainMenuUIManager.addHeader("Nivel 21", {
      id: "n21-menu-header",
    });

    await MainMenuUIManager.addItem(
      {
        id: MENU_ITEM_ID,
        title: "Notas",
        iconClass: "ft-file",
        onClick: () => {
          openNotesPanel();
        },
      },
      {
        afterElement: header,
      },
    );
  } catch (error) {
    console.warn("N21: Error en feature Notes Panel:", error.message);
  }
})();
