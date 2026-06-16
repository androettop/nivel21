(() => {
  /* =======================================================================
       Feature: Generate Trait Actions

       Builds a Nivel20 "actions" payload (the same shape found under
       `printable_hash.actions`) from a character's traits ("rasgos"), all
       grouped into a single "Rasgos" folder. Traits are display-only: they
       carry a header description but no roll and no action when clicked.

       Each trait gets an icon based on its source:
         - Class traits (printable_hash.professions[].feats[]) -> class icon
           (the profession's `portrait_url`).
         - Race traits (printable_hash.race_feats[])           -> race icon
           (`race.portrait_url`).
         - Everything else (feats / other_feats / custom_feats) -> character
           icon (`info.image_url`).

       This file is environment-agnostic: the pure `buildTraitActions(ph)`
       function has no DOM/network dependencies (so it can be unit-tested
       under Node), while the browser wiring is guarded behind a `window`
       check.
    ======================================================================= */

  /**
   * Whether a trait should be shown. We hide only traits explicitly flagged
   * as hidden / not-visible; the various sources use different conventions
   * (`hidden: '0'` strings, `visible: ''` empties, booleans…), so we test for
   * the explicit "off" values and default to visible otherwise.
   */
  function isVisibleTrait(feat) {
    const hidden = feat?.hidden;
    if (hidden === true || hidden === 1 || hidden === "1" || hidden === "True")
      return false;
    const visible = feat?.visible;
    if (visible === false || visible === "False" || visible === "false")
      return false;
    return true;
  }

  /**
   * Default description renderer: the trait text is Markdown, but action
   * descriptions are displayed as HTML. Without a real Markdown renderer
   * (Node / unit tests) we just escape-ish and keep line breaks.
   */
  function defaultRenderDescription(text) {
    const html = String(text)
      .replace(/\r\n|\r/g, "\n")
      .replace(/\n/g, "<br>");
    return `<p>${html}</p>\n`;
  }

  /**
   * The type label used as the parent folder for the misc feats group. Nivel20
   * calls origin feats "Origen", but we display that group as "Dotes".
   */
  function traitTypeName(feat) {
    const category = feat?.category || "";
    if (category === "Origen") return "Dotes";
    return category;
  }

  /**
   * Build the HTML description block shown for a trait (from its Markdown).
   * Nivel20 shows the short `summary`, falling back to the full `description`.
   */
  function buildTraitDescription(feat, render) {
    const text = feat?.summary || feat?.description || "";
    if (!text) return null;
    return (render || defaultRenderDescription)(text);
  }

  /** Minimal HTML-text escaping for the level entries. */
  function escapeHtmlText(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * Pick the level entry to display for a trait: the highest `required_level`
   * that the character has reached (its profession level). When the reference
   * level is unknown, fall back to the highest entry overall. Mirrors how the
   * Nivel20 sheet renders `character-feat-levels`.
   */
  function bestLevelEntry(levels, refLevel) {
    if (!Array.isArray(levels) || !levels.length) return null;
    const lvl = Number(refLevel);
    let best = null;
    for (const entry of levels) {
      const req = Number(entry?.required_level);
      if (Number.isFinite(lvl) && Number.isFinite(req) && req > lvl) continue;
      if (!best || Number(entry?.required_level) >= Number(best.required_level)) {
        best = entry;
      }
    }
    return best;
  }

  /** The `character-feat-levels` list HTML for a trait, or "" when none apply. */
  function buildLevelsHtml(feat, refLevel) {
    const entry = bestLevelEntry(feat?.levels, refLevel);
    if (!entry?.name) return "";
    return (
      "<ul class='character-feat-levels'>\n<li>\n" +
      escapeHtmlText(entry.name) +
      "\n</li>\n</ul>\n"
    );
  }

  /** Build a feat (race / origin / other) detail URL for the floating panel. */
  function featFloatingUrl(gameSystem, id) {
    return `https://nivel20.com/games/${gameSystem}/feats/${id}?floating=true`;
  }

  /** Build a class-trait detail URL for the floating panel. */
  function professionTraitFloatingUrl(gameSystem, professionId, id) {
    return (
      `https://nivel20.com/games/${gameSystem}/professions/${professionId}` +
      `/profession_traits/${id}?floating=true`
    );
  }

  /**
   * Resolve the current Nivel20 game-system slug from the page URL
   * (e.g. `/games/dnd-2024/...` -> "dnd-2024"). Falls back to "dnd-2024"
   * outside the browser or on URLs without a game segment.
   */
  function resolveGameSystem() {
    try {
      const m = window.location.pathname.match(/^\/games\/([^/]+)/);
      if (m) return m[1];
    } catch (_) {
      /* not in a browser */
    }
    return "dnd-2024";
  }

  /**
   * A trait element. Both variants use the "floating-panel" action type so a
   * click opens a floating panel (and shift-click sends it to chat):
   *   - `url`: opens that detail page in the panel (class / race-less feats).
   *   - `content`: opens a static panel rendering the given HTML (race traits,
   *     which have no detail page — just their description).
   * Traits with neither (e.g. custom feats with no id / no description) become
   * display-only headers with no action.
   */
  function makeTraitElement(
    feat,
    icon,
    order,
    sourceName,
    { url, render, refLevel, isStatic, typeName } = {},
  ) {
    const traitName = feat?.name || "";
    // "Tipo > Nombre": the multi-level action bar turns the " > " into a nested
    // folder, so traits get grouped under a per-type folder (class / race / …).
    const displayName = typeName ? `${typeName} > ${traitName}` : traitName;
    // Summary (HTML) followed by the applicable level info, like the sheet.
    const descHtml =
      (buildTraitDescription(feat, render) || "") +
      buildLevelsHtml(feat, refLevel);
    const description = descHtml || null;

    const base = {
      id: null,
      name: displayName,
      text: "",
      icon: icon || "",
      description,
      action_type: "none",
      hidden: false,
      order,
      source_name: sourceName,
      tooltip_title: traitName,
      owned: false,
    };

    if (url) {
      base.action_type = "floating-panel";
      base.url = url;
      base.title = traitName; // panel window title: just the trait name
    } else if (isStatic && description) {
      // No detail page: open a static panel rendering the same HTML content.
      base.action_type = "floating-panel";
      base.content = description;
      base.title = traitName;
    }

    return base;
  }

  /**
   * Build the traits "actions" payload from a character `printable_hash`.
   * @param {Object} ph - The character's printable_hash.
   * @param {Object} [options]
   * @param {string} [options.gameSystem="dnd-2024"] - The Nivel20 game-system
   *   slug, used to build the feat detail URLs opened in the floating panel.
   * @param {(markdown: string) => string} [options.renderDescription] - Renders
   *   the trait's Markdown description to HTML (trait data is Markdown, but
   *   action descriptions display as HTML). Defaults to a line-break-only
   *   renderer for non-browser use.
   * @returns {Array<Object>} `[]` when there are no traits, otherwise a
   *   single-element array holding the "Rasgos" folder.
   */
  function buildTraitActions(ph, options = {}) {
    const { gameSystem = "dnd-2024", renderDescription } = options;
    const render = renderDescription || defaultRenderDescription;
    const sourceName = ph?.info?.name || "";
    const characterIcon = ph?.info?.image_url || "";
    const raceIcon = ph?.race?.portrait_url || characterIcon;
    const raceName = ph?.race?.name || ph?.info?.race || "";

    const elements = [];
    let order = 0;
    const nextOrder = () => ++order;

    const hasId = (feat) => feat?.id != null && feat.id !== "";

    const pushFeat = (feat, icon, panel) => {
      if (!isVisibleTrait(feat)) return;
      if (!feat?.name) return;
      elements.push(
        makeTraitElement(feat, icon, nextOrder(), sourceName, {
          ...panel,
          render,
        }),
      );
    };

    // Class traits: one icon per profession (class); their detail page lives
    // under that profession's profession_traits.
    const professions = Array.isArray(ph?.professions) ? ph.professions : [];
    for (const profession of professions) {
      const classIcon = profession?.portrait_url || characterIcon;
      const typeName = profession?.name || "";
      // Class-feat level requirements are relative to the profession's level.
      const refLevel = profession?.level;
      const feats = Array.isArray(profession?.feats) ? profession.feats : [];
      for (const feat of feats) {
        const url =
          hasId(feat) && hasId(profession)
            ? professionTraitFloatingUrl(gameSystem, profession.id, feat.id)
            : null;
        pushFeat(feat, classIcon, { url, refLevel, typeName });
      }
    }

    // Race traits: race icon. They have no detail page, so we show their
    // description in a static (HTML content) panel instead of a link.
    const raceFeats = Array.isArray(ph?.race_feats) ? ph.race_feats : [];
    for (const feat of raceFeats) {
      pushFeat(feat, raceIcon, { isStatic: true, typeName: raceName });
    }

    // Everything else: character icon, grouped under their category ("Dotes"…).
    const charLevel = ph?.info?.level;
    const otherSources = [ph?.feats, ph?.other_feats, ph?.custom_feats];
    for (const source of otherSources) {
      if (!Array.isArray(source)) continue;
      for (const feat of source) {
        const url = hasId(feat) ? featFloatingUrl(gameSystem, feat.id) : null;
        pushFeat(feat, characterIcon, {
          url,
          refLevel: charLevel,
          isStatic: !url, // custom feats (no id) -> static panel from content
          typeName: traitTypeName(feat),
        });
      }
    }

    if (!elements.length) return [];

    const name = "Rasgos";
    return [
      {
        id: null,
        name,
        text: "",
        icon: characterIcon,
        description: null,
        action_type: "folder",
        hidden: false,
        order: null,
        source_name: sourceName,
        tooltip_title: name,
        owned: false,
        elements,
      },
    ];
  }

  // ----- Exports -----

  // Node (unit testing): export the pure generator.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildTraitActions };
  }

  // Browser: wire the feature into the extension namespace.
  if (typeof window !== "undefined" && window._n21_) {
    const featureName = "generate-trait-actions";
    try {
      const { loadManagers } = window._n21_;

      /**
       * Generate the traits actions JSON for a character and return it.
       * Logs the JSON and (best-effort) copies it to the clipboard.
       *
       * Usage from the console (on any Nivel20 page):
       *   await window._n21_.features.generateTraitActions()
       *   await window._n21_.features.generateTraitActions({ url: ".../characters/1913190-eiron" })
       */
      async function generateTraitActions(opts = {}) {
        const [sheet, markdown] = await loadManagers(
          "CharacterSheetManager",
          "MarkdownEditorManager",
        );
        const ph = await sheet.fetchCharacter(opts.url);
        const actions = buildTraitActions(ph, {
          gameSystem: opts.gameSystem || resolveGameSystem(),
          renderDescription: (md) => markdown.render(md),
        });
        const json = JSON.stringify(actions, null, 2);
        console.log(json);
        try {
          await navigator.clipboard.writeText(json);
          console.log("[N21] Trait actions JSON copied to clipboard.");
        } catch (_) {
          /* clipboard may be unavailable without a user gesture; ignore */
        }
        return actions;
      }

      window._n21_.features = window._n21_.features || {};
      window._n21_.features.generateTraitActions = generateTraitActions;
      // Also expose the pure builder (and helpers) for advanced/manual use.
      window._n21_.traitActions = { buildTraitActions, resolveGameSystem };
    } catch (error) {
      window._n21_.utils?.registerFeatureError?.(featureName, error);
    }
  }
})();
