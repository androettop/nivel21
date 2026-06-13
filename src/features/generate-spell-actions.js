(() => {
  /* =======================================================================
       Feature: Generate Spell Actions

       Builds a Nivel20 "actions" payload (the same shape found under
       `printable_hash.actions`) from a character's spell books, with one
       folder per spell level. Spell elements get the appropriate rolls:
       attack spells get advantage / normal / disadvantage attack rolls plus
       damage and critical; save / damage spells get a damage roll; healing
       and simple utility spells become a single roll; everything else is just
       a header.

       This file is environment-agnostic: the pure `buildSpellActions(ph)`
       function has no DOM/network dependencies (so it can be unit-tested
       under Node), while the browser wiring that fetches the character sheet
       is guarded behind a `window` check.
    ======================================================================= */

  // ----- Platform constants (icons reused by Nivel20 for each roll role) -----

  // Per-level folder icons are bundled extension assets (src/assets/lvlN.png,
  // level 0 = trucos, up to level 9). They live in the extension package, so
  // their URL is built from the extension's base URL (which carries the
  // extension id). The content script exposes that base via a shared-DOM data
  // attribute; outside the browser (Node unit tests) the base is empty.
  function extensionBaseUrl() {
    return (
      (typeof document !== "undefined" &&
        document.documentElement?.dataset?.n21BaseUrl) ||
      ""
    );
  }

  function folderIcon(level) {
    const lvl = Math.min(Math.max(level | 0, 0), 9);
    return `${extensionBaseUrl()}src/assets/lvl${lvl}.png`;
  }

  const ROLE_ICONS = {
    attackAdvantage:
      "https://nivel20.com/images/7112/medium-749cc544662137abc13fb96ed70bdf5a1b127612.png?1709970382",
    attack:
      "https://nivel20.com/images/86/medium-f80e36f12565902b24b7ccdacd9e8a264a2e8cc6.png?1637056627",
    attackDisadvantage:
      "https://nivel20.com/images/7113/medium-4c63e5bcaa54ac0ac8029bea5badb3d63325ffca.png?1709970387",
    damage:
      "https://nivel20.com/images/33/medium-7aa567b6a48d512ddb7f7a128fcbdb276800e108.png?1637056502",
    critical:
      "https://nivel20.com/images/34/medium-68ad0ad54f6c5f689bd6bdf4d34eb2f70fff7838.png?1637056503",
    // Nivel20 reuses the critical icon for the "hurt target" damage variant.
    damageHurt:
      "https://nivel20.com/images/34/medium-68ad0ad54f6c5f689bd6bdf4d34eb2f70fff7838.png?1637056503",
  };

  // ----- Text parsing helpers -----

  // Only add the casting mod to damage when the spell says the damage is
  // "{dado} MÁS tu modificador por aptitud mágica" (e.g. Arma espiritual).
  // Spells that merely mention the modifier in another sense — like Estallido
  // mágico, where it caps the *number of dice* ("...es igual a tu modificador
  // por aptitud mágica") — must NOT get the bonus.
  const MOD_PHRASE_RE =
    /m[aá]s\s+(?:tu|el|su)\s+modificador por aptitud m[aá]gica/i;
  // Strips the "upcasting / cantrip scaling" tail so we don't pick its dice.
  const SCALING_RE =
    /(?:\*+\s*)?(?:Mejora de truco|Con un espacio de conjuro|Mejora de conjuro)/i;

  /**
   * Decompose an attack string "{tipo} {dado} {tipo_daño}" into parts.
   * @returns {{atkType:string, dice:string|null, dmgType:string|null}|null}
   */
  function parseAttackString(attack) {
    if (!attack || typeof attack !== "string") return null;
    const m = attack.match(/^(.*?)\s*(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*(.*)$/);
    if (!m) {
      return { atkType: attack.trim(), dice: null, dmgType: null };
    }
    return {
      atkType: m[1].trim(),
      dice: m[2].replace(/\s+/g, ""),
      dmgType: m[3].trim() || null,
    };
  }

  /** Whether an attack type denotes a spell attack roll (vs. a saving throw). */
  function isAttackRollType(atkType) {
    return /a distancia|cuerpo a cuerpo/i.test(atkType || "");
  }

  /** The portion of the description before any scaling/upcasting clause. */
  function baseDescription(description) {
    if (!description) return "";
    const idx = description.search(SCALING_RE);
    return idx === -1 ? description : description.slice(0, idx);
  }

  /**
   * Resolve the base damage of a spell: prefer the structured attack string,
   * otherwise pull the first "{dado} de daño {tipo}" out of the description.
   * @returns {{dice:string, type:string|null}|null}
   */
  function getDamage(spell, attackParts) {
    if (attackParts?.dice) {
      return { dice: attackParts.dice, type: attackParts.dmgType };
    }
    const text = baseDescription(spell.description || "");
    const m = text.match(/(\d+d\d+)\s+de da[ñn]o\s+(\w+)/i);
    if (m) return { dice: m[1], type: m[2] };
    return null;
  }

  /**
   * Detect a healing roll: "recupera ... puntos de golpe igual a {dado}".
   * @returns {{dice:string}|null}
   */
  function getHealing(spell) {
    const text = baseDescription(spell.description || "");
    if (!/recupera/i.test(text)) return null;
    const m = text.match(/puntos de golpe[^.]*?(\d+d\d+)/i);
    return m ? { dice: m[1] } : null;
  }

  /**
   * Detect a utility die that the spell adds to another roll, e.g. Guía /
   * Bendición ("añade 1d4 a una prueba", "sumará 1d4 al resultado").
   * @returns {{dice:string}|null}
   */
  function getUtilityDie(spell) {
    const text = baseDescription(spell.description || "");
    const m = text.match(/(?:a[ñn]ade|sumar[aá]|suma|tira)\s+(\d+d\d+)/i);
    return m ? { dice: m[1] } : null;
  }

  /**
   * Detect a "hurt target" extra damage variant, used by spells such as
   * "Tañido por los muertos": "...no tiene todos sus puntos de golpe ...
   * aumenta a {dado}".
   * @returns {{dice:string}|null}
   */
  function getHurtDamage(spell) {
    const text = baseDescription(spell.description || "");
    if (!/no tiene todos sus puntos de golpe/i.test(text)) return null;
    const m = text.match(/aumenta a\s+(\d+d\d+)/i);
    return m ? { dice: m[1] } : null;
  }

  /** Double the die count of a dice expression: "4d6" -> "8d6". */
  function doubleDice(dice) {
    return dice.replace(/^(\d+)d(\d+)/, (_, n, faces) => `${2 * Number(n)}d${faces}`);
  }

  /** Convert a range like "120 pies" to "24 casillas"; pass through otherwise. */
  function rangeToCasillas(range) {
    if (!range) return range || "";
    const m = range.match(/^(\d+(?:[.,]\d+)?)\s*pies$/i);
    if (!m) return range;
    const feet = parseFloat(m[1].replace(",", "."));
    const casillas = Math.round(feet / 5);
    return `${casillas} casilla${casillas === 1 ? "" : "s"}`;
  }

  /** Format a duration, splitting a leading "Concentración" into its own part. */
  function formatDuration(duration) {
    if (!duration) return duration || "";
    return duration.replace(/^Concentración\s+/i, "Concentración - ");
  }

  /** The HTML header description block shown for a spell. */
  function buildHeaderDescription(spell) {
    const parts = [
      spell.spell_school_name,
      spell.short_casting_time || spell.casting_time,
      formatDuration(spell.duration),
      rangeToCasillas(spell.range),
    ].filter((p) => p != null && p !== "");
    const meta = parts.join(" - ");
    const summary = spell.summary || spell.description || "";
    return `<p>${meta}</p>\n\n<p>${summary}</p>\n`;
  }

  // ----- Element factories -----

  function makeBaseElement(name, icon, order, sourceName) {
    return {
      id: null,
      name,
      text: "",
      icon,
      description: null,
      action_type: "none",
      hidden: false,
      order,
      source_name: sourceName,
      tooltip_title: name,
      owned: false,
    };
  }

  function makeHeaderElement(spell, order, sourceName) {
    const el = makeBaseElement(spell.name, spell.icon_url, order, sourceName);
    el.description = buildHeaderDescription(spell);
    return el;
  }

  function makeDiceRollElement(opts) {
    const { name, icon, order, sourceName, diceRoll, formula, rollName, rollType, description } = opts;
    return {
      id: null,
      name,
      text: "",
      icon,
      description: description ?? null,
      action_type: "dice_roll",
      hidden: false,
      order,
      source_name: sourceName,
      tooltip_title: name,
      owned: false,
      dice_roll: diceRoll,
      dice_roll_formula: formula,
      roll_options: { roll_name: rollName, roll_type: rollType },
    };
  }

  /** Build a "+ mod" suffix pair (resolved, templated) or empty strings. */
  function modSuffix(hasMod, mod, slug) {
    if (!hasMod) return { resolved: "", template: "" };
    return {
      resolved: ` + ${mod}`,
      template: ` + {{abilities.${slug}.mod}}`,
    };
  }

  /**
   * Build every action element for a single spell.
   * @param {Object} ctx - { spell, slug, mod, attackBonus, sourceName, nextOrder }
   * @returns {Array<Object>}
   */
  function buildSpellElements(ctx) {
    const { spell, slug, mod, attackBonus, sourceName, nextOrder } = ctx;
    const name = spell.name;
    const attackParts = parseAttackString(spell.attack);
    const isAttack = isAttackRollType(attackParts?.atkType);
    const damage = getDamage(spell, attackParts);
    const healing = damage ? null : getHealing(spell);
    const hasMod = MOD_PHRASE_RE.test(spell.description || "");

    const elements = [];

    // Single-element spells (no header): healing rolls.
    if (healing) {
      const m = modSuffix(true, mod, slug); // healing always adds the casting mod
      const el = makeDiceRollElement({
        name,
        icon: spell.icon_url,
        order: nextOrder(),
        sourceName,
        diceRoll: `${healing.dice}${m.resolved}`,
        formula: `${healing.dice}${m.template}`,
        rollName: "",
        rollType: "healing",
        description: buildHeaderDescription(spell),
      });
      elements.push(el);
      return elements;
    }

    // Single-element spells (no header): utility dice added to other rolls.
    if (!damage && !isAttack) {
      const utility = getUtilityDie(spell);
      if (utility) {
        elements.push(
          makeDiceRollElement({
            name,
            icon: spell.icon_url,
            order: nextOrder(),
            sourceName,
            diceRoll: utility.dice,
            formula: utility.dice,
            rollName: "",
            rollType: "default",
            description: buildHeaderDescription(spell),
          }),
        );
        return elements;
      }
      // No roll at all: just a header.
      elements.push(makeHeaderElement(spell, nextOrder(), sourceName));
      return elements;
    }

    // Header for multi-element spells (attack and/or damage).
    elements.push(makeHeaderElement(spell, nextOrder(), sourceName));

    // Attack rolls (advantage / normal / disadvantage).
    if (isAttack) {
      const tpl = `{{abilities.${slug}.mod + info.proficiency_bonus}}`;
      const bonus = attackBonus;
      elements.push(
        makeDiceRollElement({
          name: `${name} > Ataque con ventaja`,
          icon: ROLE_ICONS.attackAdvantage,
          order: nextOrder(),
          sourceName,
          diceRoll: `MAX(1d20, 1d20) + ${bonus}`,
          formula: `MAX(1d20, 1d20) + ${tpl}`,
          rollName: name,
          rollType: "attack",
        }),
        makeDiceRollElement({
          name: `${name} > Ataque`,
          icon: ROLE_ICONS.attack,
          order: nextOrder(),
          sourceName,
          diceRoll: `1d20 + ${bonus}`,
          formula: `1d20 + ${tpl}`,
          rollName: name,
          rollType: "attack",
        }),
        makeDiceRollElement({
          name: `${name} > Ataque con desventaja`,
          icon: ROLE_ICONS.attackDisadvantage,
          order: nextOrder(),
          sourceName,
          diceRoll: `MIN(1d20, 1d20) + ${bonus}`,
          formula: `MIN(1d20, 1d20) + ${tpl}`,
          rollName: name,
          rollType: "attack",
        }),
      );
    }

    // Damage roll (+ critical for attack spells).
    if (damage) {
      const m = modSuffix(hasMod, mod, slug);
      elements.push(
        makeDiceRollElement({
          name: `${name} > Daño`,
          icon: ROLE_ICONS.damage,
          order: nextOrder(),
          sourceName,
          diceRoll: `${damage.dice}${m.resolved}`,
          formula: `${damage.dice}${m.template}`,
          rollName: name,
          rollType: "damage",
        }),
      );

      // "Hurt target" extra damage variant (e.g. Tañido por los muertos).
      const hurt = getHurtDamage(spell);
      if (hurt) {
        elements.push(
          makeDiceRollElement({
            name: `${name} > Daño (herido)`,
            icon: ROLE_ICONS.damageHurt,
            order: nextOrder(),
            sourceName,
            diceRoll: `${hurt.dice}${m.resolved}`,
            formula: `${hurt.dice}${m.template}`,
            rollName: name,
            rollType: "damage",
          }),
        );
      }

      if (isAttack) {
        elements.push(
          makeDiceRollElement({
            name: `${name} > Crítico`,
            icon: ROLE_ICONS.critical,
            order: nextOrder(),
            sourceName,
            diceRoll: `${doubleDice(damage.dice)}${m.resolved}`,
            formula: `${doubleDice(damage.dice)}${m.template}`,
            rollName: name,
            rollType: "damage",
          }),
        );
      }
    }

    return elements;
  }

  /**
   * Whether a spell should be turned into actions: the ones the character
   * actually has available — flagged `included`, or granted spells that are
   * always available (`included === false` with no `prepared` state).
   * @param {Object} spell
   * @returns {boolean}
   */
  function shouldIncludeSpell(spell) {
    if (spell.included === true) return true;
    if (spell.included === false && spell.prepared == null) return true;
    return false;
  }

  function makeFolder(level, order, elements, sourceName) {
    const name = level === 0 ? "Trucos" : `Nivel ${level}`;
    return {
      id: null,
      name,
      text: "",
      icon: folderIcon(level),
      description: null,
      action_type: "folder",
      hidden: false,
      order,
      source_name: sourceName,
      tooltip_title: name,
      owned: false,
      elements,
    };
  }

  /**
   * Build the spells "actions" payload from a character `printable_hash`.
   * @param {Object} ph - The character's printable_hash.
   * @param {Object} [options]
   * @param {boolean} [options.includedOnly=true] - When true (default), keep
   *   spells the character has available: `included === true`, or granted
   *   spells (`included === false` with `prepared === null`). When false,
   *   include every spell in the books.
   * @returns {Array<Object>} Array of folder objects (one per spell level).
   */
  function buildSpellActions(ph, options = {}) {
    const { includedOnly = true } = options;
    const sourceName = ph?.info?.name || "";
    const books = Array.isArray(ph?.spell_books) ? ph.spell_books : [];

    // Group spells (with their book's casting context) by spell level.
    const byLevel = new Map();
    for (const book of books) {
      const bookCtx = {
        slug: book.spell_ability_slug,
        mod: book.spell_ability_mod,
        attackBonus: book.spell_attack_bonus,
      };
      const buckets = [book.spells, book.focus_spells];
      for (const bucket of buckets) {
        if (!Array.isArray(bucket)) continue;
        for (const pair of bucket) {
          const level = pair[0];
          const spells = pair[1] || [];
          for (const spell of spells) {
            if (includedOnly && !shouldIncludeSpell(spell)) continue;
            if (!byLevel.has(level)) byLevel.set(level, []);
            byLevel.get(level).push({ spell, ...bookCtx });
          }
        }
      }
    }

    const levels = [...byLevel.keys()].sort((a, b) => a - b);
    const actions = [];
    let folderOrder = 0;
    for (const level of levels) {
      let elemOrder = 0;
      const nextOrder = () => ++elemOrder;
      const elements = [];
      for (const entry of byLevel.get(level)) {
        elements.push(
          ...buildSpellElements({ ...entry, sourceName, nextOrder }),
        );
      }
      actions.push(makeFolder(level, ++folderOrder, elements, sourceName));
    }
    return actions;
  }

  // ----- Exports -----

  // Node (unit testing): export the pure generator.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildSpellActions };
  }

  // Browser: wire the feature into the extension namespace.
  if (typeof window !== "undefined" && window._n21_) {
    const featureName = "generate-spell-actions";
    try {
      const { loadManagers } = window._n21_;

      /**
       * Generate the spells actions JSON for a character and return it.
       * Logs the JSON and (best-effort) copies it to the clipboard.
       *
       * Usage from the console (on any Nivel20 page):
       *   await window._n21_.features.generateSpellActions()                  // current character page
       *   await window._n21_.features.generateSpellActions({ url: ".../characters/2111310-caelum" })
       *   await window._n21_.features.generateSpellActions({ includedOnly: false })
       */
      async function generateSpellActions(opts = {}) {
        const [sheet] = await loadManagers("CharacterSheetManager");
        const ph = await sheet.fetchCharacter(opts.url);
        const actions = buildSpellActions(ph, opts);
        const json = JSON.stringify(actions, null, 2);
        console.log(json);
        try {
          await navigator.clipboard.writeText(json);
          console.log("[N21] Spell actions JSON copied to clipboard.");
        } catch (_) {
          /* clipboard may be unavailable without a user gesture; ignore */
        }
        return actions;
      }

      window._n21_.features = window._n21_.features || {};
      window._n21_.features.generateSpellActions = generateSpellActions;
      // Also expose the pure builder for advanced/manual use.
      window._n21_.spellActions = { buildSpellActions };
    } catch (error) {
      window._n21_.utils?.registerFeatureError?.(featureName, error);
    }
  }
})();
