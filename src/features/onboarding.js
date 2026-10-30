(async () => {
  try {
    /* =======================
       Feature: Onboarding (Configuración inicial)

       The first time someone opens a tabletop with Nivel21, a dialog walks
       them through the style questions (movement, action bar, chat, camera,
       dice) and presents the main features. Every answer is applied right
       away. It shows again on the next visit unless it was finished or
       closed with "No volver a mostrar" checked. It can be opened again from the
       settings panel (`window._n21_.onboarding.open()`).
    ======================= */

    const { loadManagers } = window._n21_;

    const [SettingsManager, PlayerManager] = await loadManagers(
      "SettingsManager",
      "PlayerManager",
    );

    const guide = window._n21_.settingsGuide;
    const { escapeHtml, assetUrl } = guide;

    const DONE_KEY = "_n21_onboarding.done";
    const DIALOG_ID = "n21-onboarding";
    // Let the tabletop finish loading before covering it.
    const SHOW_DELAY_MS = 2500;

    function isDone() {
      try {
        return localStorage.getItem(DONE_KEY) === "1";
      } catch (error) {
        return true;
      }
    }

    function markDone() {
      try {
        localStorage.setItem(DONE_KEY, "1");
      } catch (error) {}
    }

    function buildPages(isGameMaster) {
      const highlights = isGameMaster ? guide.highlights.gm : guide.highlights.player;
      return [
        { type: "welcome" },
        ...guide.stepsFor(isGameMaster).map((step) => ({ type: "step", step })),
        { type: "highlights", ids: highlights },
        { type: "done" },
      ];
    }

    function buildWelcomeHtml(isGameMaster, dontShowAgain) {
      return `
        <div class="n21-onboarding-hero">
          <img src="${escapeHtml(assetUrl("icons/icon128.png"))}" alt="" />
          <h3>¡Bienvenido a Nivel21!</h3>
          <p>Nivel21 suma decenas de funciones a la mesa de Nivel20${
            isGameMaster ? ", tanto para ti como DM como para tus jugadores" : ""
          }.</p>
          <p>En unos pocos pasos la dejamos a tu gusto y te mostramos lo más importante. Puedes cambiar todo después desde <b>Nivel 21 › Configuración</b>, en el menú de la izquierda.</p>
          <label class="n21-onboarding-dismiss">
            <input type="checkbox" class="n21-onboarding-dismiss-input"${dontShowAgain ? " checked" : ""} />
            No volver a mostrar
          </label>
        </div>`;
    }

    function buildHighlightsHtml(ids) {
      const cards = ids
        .map((id) => {
          const feature = guide.features[id];
          if (!feature) return "";
          const label =
            SettingsManager.getAllSettings()[guide.featureSetting(id)]?.label || id;
          const image = feature.image
            ? `<img src="${escapeHtml(assetUrl(feature.image))}" alt="" loading="lazy" />`
            : "";
          const hasTutorial = !!guide.tutorialFor(id);
          return `
            <button type="button" class="n21-onboarding-card" data-tutorial="${escapeHtml(id)}"${
              hasTutorial ? "" : " disabled"
            }>
              ${image}
              <span>
                <b>${escapeHtml(label)}</b>
                <span class="n21-onboarding-card-text">${escapeHtml(feature.description)}</span>
                ${hasTutorial ? '<span class="n21-onboarding-card-more">Ver cómo se usa ›</span>' : ""}
              </span>
            </button>`;
        })
        .join("");
      return `
        <h4 class="n21-style-step-title"><i class="ft-star"></i> Lo que puedes hacer</h4>
        <p class="n21-style-step-description">Algunas de las funciones de Nivel21. Toca una para ver cómo se usa. Encuentras todas en Configuración › Funciones.</p>
        <div class="n21-onboarding-cards">${cards}</div>`;
    }

    function buildTutorialHtml(id) {
      const tutorial = guide.tutorialFor(id);
      const feature = guide.features[id] || {};
      const label =
        SettingsManager.getAllSettings()[guide.featureSetting(id)]?.label || id;
      const steps = tutorial.steps
        .map((step) => `<li>${escapeHtml(step)}</li>`)
        .join("");
      return `
        <button type="button" class="n21-onboarding-link n21-onboarding-tutorial-back">
          <i class="ft-arrow-left"></i> Volver a las funciones
        </button>
        <h4 class="n21-style-step-title">${escapeHtml(label)}</h4>
        <p class="n21-style-step-description">${escapeHtml(feature.description || "")}</p>
        ${
          tutorial.media
            ? guide
                .buildMediaHtml(tutorial.media, label)
                .replace('class="n21-style-media"', 'class="n21-style-media n21-onboarding-tutorial-media"')
            : ""
        }
        <ol class="n21-onboarding-tutorial-steps">${steps}</ol>`;
    }

    function buildDoneHtml() {
      return `
        <div class="n21-onboarding-hero">
          <i class="ft-check-circle n21-onboarding-done-icon"></i>
          <h3>¡Todo listo!</h3>
          <p>Ya puedes jugar. Para cambiar cualquier cosa, o repetir esta configuración, abre <b>Nivel 21 › Configuración</b> en el menú de la izquierda.</p>
        </div>`;
    }

    function open() {
      document.getElementById(DIALOG_ID)?.remove();

      const isGameMaster = !!PlayerManager.isGameMaster();
      const pages = buildPages(isGameMaster);
      let index = 0;
      // Feature whose tutorial is open on the highlights page.
      let tutorialId = null;
      // "No volver a mostrar": applied when the dialog is closed.
      let dontShowAgain = false;

      const overlay = document.createElement("div");
      overlay.id = DIALOG_ID;
      overlay.className = "n21-onboarding";
      overlay.innerHTML = `
        <div class="n21-onboarding-box" role="dialog" aria-modal="true" aria-label="Configuración inicial de Nivel21">
          <button type="button" class="n21-onboarding-close" title="Cerrar" aria-label="Cerrar">&times;</button>
          <div class="n21-onboarding-page"></div>
          <div class="n21-onboarding-footer">
            <button type="button" class="n21-onboarding-btn n21-onboarding-back">Atrás</button>
            <div class="n21-onboarding-dots"></div>
            <button type="button" class="n21-onboarding-btn n21-onboarding-btn--primary n21-onboarding-next">Siguiente</button>
          </div>
        </div>`;

      const $page = overlay.querySelector(".n21-onboarding-page");
      const $back = overlay.querySelector(".n21-onboarding-back");
      const $next = overlay.querySelector(".n21-onboarding-next");
      const $dots = overlay.querySelector(".n21-onboarding-dots");

      function render() {
        const page = pages[index];
        if (page.type === "welcome") $page.innerHTML = buildWelcomeHtml(isGameMaster, dontShowAgain);
        else if (page.type === "step") $page.innerHTML = guide.buildStepHtml(page.step);
        else if (page.type === "highlights") {
          $page.innerHTML = tutorialId
            ? buildTutorialHtml(tutorialId)
            : buildHighlightsHtml(page.ids);
        }
        else $page.innerHTML = buildDoneHtml();
        $page.scrollTop = 0;

        $back.style.visibility = index === 0 ? "hidden" : "visible";
        $next.textContent =
          index === 0 ? "Empezar" : index === pages.length - 1 ? "Terminar" : "Siguiente";
        $dots.innerHTML = pages
          .map((_, i) => `<span class="${i === index ? "is-active" : ""}"></span>`)
          .join("");
      }

      function close({ finished = false } = {}) {
        if (finished || dontShowAgain) markDone();
        overlay.remove();
        document.removeEventListener("keydown", onKeydown, true);
      }

      function onKeydown(event) {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }

      // Re-render the current question after each answer.
      guide.bindStepEvents($page, () => render());

      $page.addEventListener("change", (event) => {
        if (!event.target.matches(".n21-onboarding-dismiss-input")) return;
        dontShowAgain = event.target.checked;
      });

      $page.addEventListener("click", (event) => {
        const card = event.target.closest(".n21-onboarding-card[data-tutorial]");
        if (card && !card.disabled) {
          tutorialId = card.dataset.tutorial;
          render();
          return;
        }
        if (event.target.closest(".n21-onboarding-tutorial-back")) {
          tutorialId = null;
          render();
        }
      });

      $back.addEventListener("click", () => {
        // From a tutorial, "Atrás" goes back to the list of features.
        if (tutorialId) tutorialId = null;
        else if (index > 0) index -= 1;
        render();
      });
      $next.addEventListener("click", () => {
        if (index === pages.length - 1) {
          close({ finished: true });
          return;
        }
        tutorialId = null;
        index += 1;
        render();
      });
      overlay.querySelector(".n21-onboarding-close").addEventListener("click", () => close());
      document.addEventListener("keydown", onKeydown, true);

      document.body.appendChild(overlay);
      render();
    }

    window._n21_.onboarding = { open };

    // Nivel20 may greet with its own dialog (news, etc.): wait until it's
    // closed so the setup isn't hidden under it.
    function openWhenIdle() {
      if (isDone()) return;
      if (document.querySelector(".modal.show")) {
        setTimeout(openWhenIdle, 1000);
        return;
      }
      open();
    }

    const isTabletop = /^\/tabletop(?:\/|$)/.test(window.location.pathname);
    if (isTabletop && !isDone()) setTimeout(openWhenIdle, SHOW_DELAY_MS);
  } catch (error) {
    window._n21_.utils.registerFeatureError("Onboarding", error);
  }
})();
