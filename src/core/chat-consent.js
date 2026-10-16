(() => {
  /* =======================================================================
       Shared chat consent

       Before the extension sends something to the chat, the user is asked
       (once per action type, unless they keep answering each time):
         - "Enviar" / "No enviar"
         - "No volver a preguntar": remembers the answer in the setting
           `chat-consent.<key>` (Preguntar / Enviar siempre / No enviar),
           which can be changed later in Configuración > Chat.

       When `required` is true the message IS the action (turn order, weather,
       ping...): not sending it means the change isn't applied, and the dialog
       says so.

       Exposed as `window._n21_.chatConsent.confirm(key, options)`
         -> Promise<boolean> (true = send)
    ======================================================================= */

  const DIALOG_ID = "n21-chat-consent";
  let queue = Promise.resolve();

  function settings() {
    return window._n21_?.managers?.SettingsManager || null;
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function toast(text) {
    const el = document.createElement("div");
    el.className = "n21-chat-consent-toast";
    el.setAttribute("role", "status");
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add("n21-chat-consent-toast--out"), 4500);
    setTimeout(() => el.remove(), 5000);
  }

  function showDialog(key, { title, description, required }) {
    return new Promise((resolve) => {
      document.getElementById(DIALOG_ID)?.remove();
      const overlay = document.createElement("div");
      overlay.id = DIALOG_ID;
      overlay.className = "n21-chat-consent";
      overlay.innerHTML = `
        <div class="n21-chat-consent-box" role="dialog" aria-modal="true" aria-labelledby="${DIALOG_ID}-title">
          <h5 id="${DIALOG_ID}-title">${escapeHtml(title || "¿Enviar al chat?")}</h5>
          ${description ? `<p>${escapeHtml(description)}</p>` : ""}
          ${
            required
              ? "<p class=\"n21-chat-consent-warning\">Si no se envía, el cambio no se aplica.</p>"
              : ""
          }
          <label class="n21-chat-consent-remember">
            <input type="checkbox" /> No volver a preguntar
          </label>
          <div class="n21-chat-consent-actions">
            <button type="button" class="n21-chat-consent-no">No enviar</button>
            <button type="button" class="n21-chat-consent-yes">Enviar</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const finish = (send) => {
        const remember = overlay.querySelector("input[type=checkbox]").checked;
        overlay.remove();
        document.removeEventListener("keydown", onKey, true);
        if (remember) {
          settings()?.set(`chat-consent.${key}`, send ? "always" : "never");
          toast("Puedes cambiar esta opción en la configuración de Nivel 21 (pestaña Chat).");
        }
        resolve(send);
      };
      const onKey = (event) => {
        event.stopPropagation();
        if (event.key === "Escape") finish(false);
        if (event.key === "Enter") finish(true);
      };
      document.addEventListener("keydown", onKey, true);
      overlay.querySelector(".n21-chat-consent-yes").addEventListener("click", () => finish(true));
      overlay.querySelector(".n21-chat-consent-no").addEventListener("click", () => finish(false));
      overlay.querySelector(".n21-chat-consent-yes").focus();
    });
  }

  /**
   * @param {string} key - Action type (see chat-consent.* settings)
   * @param {{title?: string, description?: string, required?: boolean}} [options]
   * @returns {Promise<boolean>} Whether to send the message
   */
  function confirm(key, options = {}) {
    const value = settings()?.get(`chat-consent.${key}`) || "ask";
    if (value === "always") return Promise.resolve(true);
    if (value === "never") {
      if (options.required) {
        toast("No se aplicó: el envío al chat está desactivado en la configuración de Nivel 21.");
      }
      return Promise.resolve(false);
    }
    // One dialog at a time.
    const result = queue.then(() => showDialog(key, options));
    queue = result.catch(() => {});
    return result;
  }

  window._n21_.chatConsent = { confirm };
})();
