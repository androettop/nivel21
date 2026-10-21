// Nivel20 version gate (page context, self-contained).
//
// Runs before any code that depends on Nivel20's internals. If the tabletop
// reports a version newer than the last one the extension was built for, it
// asks the user whether to load the extension anyway. The answer can be
// remembered; it's forgotten as soon as a supported version is detected, so
// the warning shows again with the next unsupported version.
//
// Result: document.documentElement.dataset.n21VersionOk = "1" | "0", then a
// "n21VersionChecked" event on document.
(function () {
  // Last Nivel20 tabletop version the extension was tested with.
  const MAX_SUPPORTED_VERSION = "v3.7.13";
  const CHOICE_KEY = "_n21_unsupported-version-choice"; // "load" | "skip"
  const WAIT_FOR_CONFIG_MS = 3000;

  function done(load) {
    document.documentElement.dataset.n21VersionOk = load ? "1" : "0";
    document.dispatchEvent(new CustomEvent("n21VersionChecked"));
  }

  function storage(action, value) {
    try {
      if (action === "get") return localStorage.getItem(CHOICE_KEY);
      if (action === "set") localStorage.setItem(CHOICE_KEY, value);
      if (action === "clear") localStorage.removeItem(CHOICE_KEY);
    } catch (_error) {}
    return null;
  }

  /** "v3.7.11" -> [3, 7, 11]; null if it can't be parsed. */
  function parseVersion(value) {
    const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(value || "").trim());
    if (!match) return null;
    return [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)];
  }

  function isNewer(version, reference) {
    for (let i = 0; i < 3; i += 1) {
      if (version[i] !== reference[i]) return version[i] > reference[i];
    }
    return false;
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function showDialog(version) {
    const style = document.createElement("style");
    style.textContent = `
      #n21-version-gate { position: fixed; inset: 0; z-index: 2147483000; display: flex;
        align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.45);
        font-family: system-ui, sans-serif; }
      #n21-version-gate .n21-vg-box { width: min(460px, calc(100vw - 32px)); padding: 16px;
        border: 1px solid #3a3d42; border-radius: 10px; background: #1d1e21; color: #ecebe8;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); font-size: 14px; line-height: 1.45; }
      #n21-version-gate h5 { margin: 0 0 8px; font-size: 16px; font-weight: 700; color: inherit; }
      #n21-version-gate p { margin: 0 0 8px; }
      #n21-version-gate label { display: flex; align-items: center; gap: 6px; margin: 10px 0 12px;
        cursor: pointer; }
      #n21-version-gate .n21-vg-actions { display: flex; justify-content: flex-end; gap: 8px; }
      #n21-version-gate button { height: 34px; padding: 0 14px; border: 1px solid #3a3d42;
        border-radius: 6px; background: rgba(255, 255, 255, 0.06); color: inherit; font-size: 14px;
        font-weight: 600; cursor: pointer; }
      #n21-version-gate .n21-vg-load { background: #6e1a16; border-color: #a3271f; }
    `;
    const overlay = document.createElement("div");
    overlay.id = "n21-version-gate";
    overlay.innerHTML = `
      <div class="n21-vg-box" role="dialog" aria-modal="true" aria-labelledby="n21-vg-title">
        <h5 id="n21-vg-title">Nivel21 no se cargó automáticamente</h5>
        <p>Nivel20 se actualizó a la versión <b>${escapeHtml(version)}</b> y la extensión
          solo está preparada hasta la <b>${escapeHtml(MAX_SUPPORTED_VERSION)}</b>.
          Algunas funciones podrían fallar o comportarse de forma inesperada.</p>
        <p>Puedes cargarla de todos modos o esperar a una actualización de Nivel21.</p>
        <label><input type="checkbox" /> No volver a mostrar para esta versión no compatible</label>
        <div class="n21-vg-actions">
          <button type="button" class="n21-vg-skip">No cargar</button>
          <button type="button" class="n21-vg-load">Cargar de todos modos</button>
        </div>
      </div>`;
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    const finish = (load) => {
      if (overlay.querySelector("input[type=checkbox]").checked) {
        storage("set", load ? "load" : "skip");
      }
      overlay.remove();
      style.remove();
      done(load);
    };
    overlay.querySelector(".n21-vg-load").addEventListener("click", () => finish(true));
    overlay.querySelector(".n21-vg-skip").addEventListener("click", () => finish(false));
  }

  function check(version) {
    const current = parseVersion(version);
    const supported = parseVersion(MAX_SUPPORTED_VERSION);
    // Not the tabletop, or an unknown format: nothing to compare, load.
    if (!current || !supported || !isNewer(current, supported)) {
      storage("clear");
      done(true);
      return;
    }
    const remembered = storage("get");
    if (remembered === "load" || remembered === "skip") {
      done(remembered === "load");
      return;
    }
    if (document.body) showDialog(version);
    else document.addEventListener("DOMContentLoaded", () => showDialog(version), { once: true });
  }

  // vttConfig only exists on the tabletop; wait briefly for it there.
  const isTabletop = /^\/tabletop(?:\/|$)/.test(window.location.pathname);
  const start = Date.now();
  (function waitForConfig() {
    const version = window.vttConfig?.version;
    if (version || !isTabletop || Date.now() - start > WAIT_FOR_CONFIG_MS) {
      check(version);
      return;
    }
    setTimeout(waitForConfig, 100);
  })();
})();
