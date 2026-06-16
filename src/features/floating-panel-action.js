(async () => {
  try {
    /* =======================================================================
         Feature: Floating Panel Action

         Behaviour for the custom "floating-panel" action type used by some
         action-bar items (e.g. character traits). Clicking such an item opens
         its content in a floating panel through the FloatingPanelManager, so
         the send-to-chat feature can intercept a modifier-click and divert it
         to chat instead of opening it.

         Two variants, mirroring how the items are built:
           - `url`     -> opens that page in the panel.
           - `content` -> opens a static HTML panel.

         The items themselves are rendered elsewhere (e.g. the multi-level
         action bar). This feature only adds the click behaviour and the
         data-floating-* attributes that the send-to-chat hover preview reads.
      ======================================================================= */

    const { loadManagers } = window._n21_;

    const [FloatingPanelManager, SettingsManager] = await loadManagers(
      "FloatingPanelManager",
      "SettingsManager",
    );

    if (!SettingsManager.get("feature.floating-panel-action.enabled")) {
      return;
    }

    const ITEM_SELECTOR =
      '.action-bar-element[data-action-type="floating-panel"]';

    /** Read the action item stored on an action-bar element by the renderer. */
    function readItem($element) {
      const raw = $element.attr("data-action");
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (_) {
        return null;
      }
    }

    /**
     * Expose the data-floating-* attributes the send-to-chat feature looks for,
     * so hovering one previews (and a modifier-click sends) its content. URL
     * panels use data-floating(+url); static HTML panels use
     * data-static-floating(+content).
     */
    function decorate(element) {
      const $element = $(element);
      const $button = $element.find(".action-bar-button").first();
      if (!$button.length || $button.attr("data-floating-decorated")) return;

      const item = readItem($element);
      if (!item) return;

      $button.attr("data-floating-title", item.title || item.name || "");
      if (item.icon) $button.attr("data-floating-icon", item.icon);

      if (item.url) {
        $button.attr("data-floating", "");
        $button.attr("data-floating-url", item.url);
      } else if (item.content) {
        $button.attr("data-static-floating", "");
        $button.attr("data-floating-content", item.content);
      }

      $button.attr("data-floating-decorated", "true");
    }

    /** Decorate every floating-panel item found inside (or equal to) `root`. */
    function decorateAll(root) {
      if (root instanceof HTMLElement && root.matches?.(ITEM_SELECTOR)) {
        decorate(root);
      }
      root.querySelectorAll?.(ITEM_SELECTOR).forEach(decorate);
    }

    // Decorate eagerly (and as items appear) so the send-to-chat hover preview
    // works on the very first hover instead of only after a re-render.
    decorateAll(document);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) decorateAll(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Open the panel on click, through the manager so send-to-chat can divert
    // it (shift-click) to chat instead of opening it.
    $(document).on("click", ITEM_SELECTOR, function (e) {
      const item = readItem($(this));
      if (!item) return;

      e.preventDefault();
      e.stopPropagation();

      const title = item.title || item.name || "";
      if (item.url) {
        FloatingPanelManager.openUrlPanel(item.url, title, item.icon);
      } else if (item.content) {
        // Give the panel a sane starting size; without it the panel sizes to
        // its content, so long descriptions open very tall. The content scrolls
        // inside instead (see the n21-floating-panel-action CSS rule).
        FloatingPanelManager.openStaticPanel(
          title,
          item.icon,
          "#822020",
          item.content,
          "",
          "height: 240px;",
        );
      }
    });
  } catch (error) {
    window._n21_.utils.registerFeatureError("Floating Panel Action", error);
  }
})();
