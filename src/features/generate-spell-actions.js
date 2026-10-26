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

  // Per-level folder icons are bundled extension assets (src/assets/spell-levels/lvlN.png,
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
    // Roman numeral per level; cantrips get a hollow square.
    return `${extensionBaseUrl()}src/assets/spell-levels/lvl${lvl}.png`;
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
  // Spells castable with a higher slot. There's no structured flag, so we
  // look for the upcast clause the descriptions use: "**Con un espacio de
  // conjuro de nivel superior.**" (sometimes without bold, or "Con un espacio
  // de nivel superior"), or the 2014 "**En niveles superiores.**". Checked
  // against every D&D 2024 spell in Nivel20 (132 matches, no false positives).
  const UPCAST_RE =
    /(?:Con un espacio de (?:conjuro )?(?:de )?nivel superior|En niveles superiores)\s*\**\s*[.:]/i;

  /**
   * Decompose an attack string "{tipo} {dado} {tipo_daño}" into parts.
   * @returns {{atkType:string, dice:string|null, dmgType:string|null}|null}
   */
  function parseAttackString(attack) {
    if (!attack || typeof attack !== "string") return null;
    // "2d10+4d6", "2d10 + 2d10" and "10d6+40" are all one damage roll.
    const m = attack.match(/^(.*?)\s*(\d+d\d+(?:\s*[+-]\s*\d+(?:d\d+)?)*)\s*(.*)$/);
    if (!m) {
      return { atkType: attack.trim(), dice: null, dmgType: null };
    }
    let dice = m[2].replace(/\s+/g, "");
    let dmgType = m[3].trim() || null;
    // Typed groups: "5d6 fuego + 5d6 radiante" (Golpe flamígero).
    const typed = dmgType && dmgType.match(/^(\S+)\s*\+\s*(\d+d\d+)\s*(.*)$/);
    if (typed) {
      dice += `+${typed[2]}`;
      dmgType = typed[3] ? `${typed[1]} y ${typed[3]}` : typed[1];
    }
    return { atkType: m[1].trim(), dice, dmgType };
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
  /** Whether a spell requires concentration ("Concentración, hasta 1 hora"). */
  function isConcentration(spell) {
    return /^\s*concentraci[oó]n/i.test(spell?.duration || "") || spell?.concentration === true;
  }

  /**
   * "Lanzar" action: posts the casting to chat and, for concentration
   * spells, sets the Concentración status (handled by the spell action bar).
   */
  function makeCastElement(spell, name, order, sourceName) {
    return {
      ...makeBaseElement(name, spell.icon_url, order, sourceName),
      action_type: "spell_cast",
      description: buildHeaderDescription(spell),
      tooltip_title: `Lanzar ${spell.name}`,
      n21_spell_name: spell.name,
      n21_spell_level: spell.level ?? null,
      n21_concentration: isConcentration(spell),
      // Casting a leveled spell spends a slot of its level.
      n21_consume_slot: (spell.level | 0) > 0,
    };
  }

  function buildSpellElements(ctx) {
    const { spell } = ctx;
    const baseLevel = spell.n21BaseLevel ?? (spell.level | 0);
    const upcastable = baseLevel > 0 && UPCAST_RE.test(spell.description || "");
    const increases = upcastable ? getUpcastIncreases(spell) : { perLevel: [], tiers: [] };
    // Every element of a spell knows its level (used to grey out spells
    // without slots left).
    const elements = tagLevel(buildSpellElementsInner(ctx), spell.level | 0);
    elements.forEach((el) => {
      el.n21_spell_id = spell.id ?? null;
      el.n21_spell_base_level = baseLevel;
      el.n21_upcastable = upcastable;
      if (spell.n21BaseLevel != null) el.n21_upcast_of = spell.id ?? spell.name;
      setScaling(el, increases);
    });
    if ((spell.level | 0) > baseLevel) elements.forEach((el) => scaleElement(el, spell.level | 0));
    return elements;
  }

  /* ----- Upcast dice scaling ----- */

  // Two ways a 2024 spell grows its dice with the slot:
  //  - per level: "El daño aumenta en 1d6 por cada nivel por encima de 1 que
  //    tenga el espacio" -> every "aumenta(n) [en] XdY" of a sentence that
  //    talks about "cada nivel". Some list several (Mano arcana, Muro de hielo).
  //  - by tiers: "Si usas un espacio de conjuro de niveles 5 o 6, [...] el
  //    daño adicional aumenta a 2d4" (Arma elemental) -> the dice become XdY.
  // Checked against every D&D 2024 spell in Nivel20.
  const INCREASE_RE = /aumentan?\s+(?:en\s+)?(\d+)d(\d+)/gi;
  const TIER_LEVELS_RE = /nivel(?:es)?\s+(\d+)(?:\s*(?:o|a)\s*(\d+))?(\s*o\s+superior)?/i;
  const TIER_DICE_RE = /aumentan?\s+a\s+(\d+)d(\d+)/i;
  const FIRST_DICE_RE = /(\d+)d(\d+)/;

  /**
   * How the dice grow with the slot, from the upcast clause:
   * { perLevel: [{count, faces}], tiers: [{min, max, count, faces}] }.
   */
  function getUpcastIncreases(spell) {
    const result = { perLevel: [], tiers: [] };
    const description = spell.description || "";
    const index = description.search(UPCAST_RE);
    if (index === -1) return result;
    description
      .slice(index)
      .split(/\.\s/)
      .forEach((sentence) => {
        if (/cada nivel/i.test(sentence)) {
          for (const m of sentence.matchAll(INCREASE_RE)) {
            result.perLevel.push({ count: Number(m[1]), faces: Number(m[2]) });
          }
          return;
        }
        const levels = sentence.match(TIER_LEVELS_RE);
        const dice = sentence.match(TIER_DICE_RE);
        if (!levels || !dice) return;
        const min = Number(levels[1]);
        result.tiers.push({
          min,
          max: levels[3] ? 9 : Number(levels[2] || min),
          count: Number(dice[1]),
          faces: Number(dice[2]),
        });
      });
    return result;
  }

  /**
   * Remember how a damage / healing roll grows with the slot: the first
   * increase with the same die as the roll (a critical adds it twice). When
   * the spell does grow its dice but none matches the roll, flag it instead.
   */
  function setScaling(el, increases) {
    const type = el.roll_options?.roll_type;
    if (el.action_type !== "dice_roll" || (type !== "damage" && type !== "healing")) return;
    if (!increases.perLevel.length && !increases.tiers.length) return;
    const dice = String(el.dice_roll || "").match(FIRST_DICE_RE);
    const faces = dice ? Number(dice[2]) : null;
    const factor = /> Crítico$/.test(el.name || "") ? 2 : 1;
    const increase = increases.perLevel.find((inc) => inc.faces === faces);
    const tiers = increases.tiers.filter((tier) => tier.faces === faces);
    if (increase) {
      el.n21_scaling = { count: increase.count * factor, faces };
    } else if (tiers.length) {
      el.n21_scaling = {
        faces,
        tiers: tiers.map((tier) => ({ ...tier, count: tier.count * factor })),
      };
    } else {
      el.n21_scaling_failed = true;
    }
  }

  /** Change every dice group with `faces` sides: "2d8 + 3" -> "4d8 + 3". */
  function mapDice(notation, faces, fn) {
    if (!notation) return notation;
    return notation.replace(/(\d+)d(\d+)/g, (match, n, f) =>
      Number(f) === faces ? `${fn(Number(n))}d${f}` : match,
    );
  }

  const SCALED_NOTE = "Dados calculados por Nivel21 a partir de la descripción del conjuro.";
  const NOT_SCALED_NOTE = "Nivel21 no pudo calcular los dados de este nivel: se tiran los del nivel base.";

  /**
   * Scale a spell element to a higher slot level (in place) and return it.
   * Only damage / healing rolls change: groups of the matching die grow by the
   * per-level increase (Tormenta de hielo only grows its d10, Jallarzi both of
   * its d10 groups) or become the dice of the slot's tier. The description
   * gets a short note saying the dice were computed.
   */
  function scaleElement(el, slotLevel) {
    const steps = slotLevel - (el.n21_spell_base_level | 0);
    if (!(steps > 0)) return el;
    const scaling = el.n21_scaling;
    let fn = null;
    if (scaling?.tiers) {
      const tier = scaling.tiers.find((t) => slotLevel >= t.min && slotLevel <= t.max);
      if (tier) fn = () => tier.count;
    } else if (scaling) {
      fn = (n) => n + scaling.count * steps;
    }
    let note = null;
    if (fn) {
      el.dice_roll = mapDice(el.dice_roll, scaling.faces, fn);
      if (el.dice_roll_formula) el.dice_roll_formula = mapDice(el.dice_roll_formula, scaling.faces, fn);
      el.n21_scaled = true;
      note = SCALED_NOTE;
    } else if (el.n21_scaling_failed) {
      note = NOT_SCALED_NOTE;
    }
    if (note) el.description = `${el.description || ""}<p><em>${note}</em></p>\n`;
    return el;
  }

  function tagLevel(elements, level) {
    elements.forEach((el) => {
      el.n21_spell_level = level;
    });
    return elements;
  }

  function buildSpellElementsInner(ctx) {
    const elements = buildSpellElementsRaw(ctx);
    const { spell, sourceName, nextOrder } = ctx;
    const concentration = isConcentration(spell);
    const header = elements[0];

    // Spells without any roll: the button itself casts.
    if (elements.length === 1 && header?.action_type === "none") {
      return [makeCastElement(spell, spell.name, header.order, sourceName)];
    }

    // A single roll (healing, utility die) is already the cast button.
    if (elements.length === 1) {
      header.n21_concentration = concentration;
      header.n21_spell_name = spell.name;
      header.n21_spell_level = spell.level ?? null;
      header.n21_consume_slot = (spell.level | 0) > 0;
      return elements;
    }

    // Attack/damage folders get a first "Lanzar" action.
    // Spells with an attack roll are cast with that roll: the attack buttons
    // set concentration and spend the slot, and no "Lanzar" is added.
    const attacks = elements.slice(1).filter((el) => el.roll_options?.roll_type === "attack");
    if (attacks.length) {
      attacks.forEach((el) => {
        el.n21_concentration = concentration;
        el.n21_spell_name = spell.name;
        el.n21_spell_level = spell.level ?? null;
        el.n21_consume_slot = (spell.level | 0) > 0;
      });
      return elements;
    }

    const cast = makeCastElement(spell, `${spell.name} > Lanzar`, (header.order ?? 0) + 0.5, sourceName);
    return [header, cast, ...elements.slice(1)];
  }

  function buildSpellElementsRaw(ctx) {
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

  /**
   * Spell slot levels (1-9) the character has, regular or pact, from
   * `resources.spell_slots` / `resources.pact_spell_slots` ({"1": "4", ...}).
   * @returns {number[]} Sorted ascending.
   */
  function getSlotLevels(ph) {
    const levels = new Set();
    for (const key of ["spell_slots", "pact_spell_slots"]) {
      const slots = ph?.resources?.[key];
      if (!slots || typeof slots !== "object") continue;
      for (const [id, count] of Object.entries(slots)) {
        const level = Number(id);
        if (level >= 1 && level <= 9 && Number(count) > 0) levels.add(level);
      }
    }
    return [...levels].sort((a, b) => a - b);
  }

  function makeFolder(level, order, elements, sourceName) {
    const name = level === 0 ? "Trucos" : `Conjuros de nivel ${level}`;
    return {
      id: null,
      name,
      // The icon already shows the level: a zero-width text keeps the bar
      // from printing the long name over it.
      text: "\u200b",
      icon: folderIcon(level),
      description: null,
      action_type: "folder",
      hidden: false,
      order,
      source_name: sourceName,
      tooltip_title: name,
      owned: false,
      elements,
      n21_spell_level: level,
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

    // Upcastable spells are also listed in every higher level the character
    // has slots for, cast (and spending a slot) at that level.
    const slotLevels = getSlotLevels(ph);
    const upcasts = [];
    for (const [level, entries] of byLevel) {
      if (level < 1) continue;
      for (const entry of entries) {
        if (!UPCAST_RE.test(entry.spell.description || "")) continue;
        for (const slotLevel of slotLevels) {
          if (slotLevel > level) upcasts.push({ slotLevel, entry });
        }
      }
    }
    upcasts.sort((a, b) => a.entry.spell.level - b.entry.spell.level);
    for (const { slotLevel, entry } of upcasts) {
      if (!byLevel.has(slotLevel)) byLevel.set(slotLevel, []);
      byLevel.get(slotLevel).push({
        ...entry,
        spell: {
          ...entry.spell,
          name: `${entry.spell.name} (nivel ${slotLevel})`,
          level: slotLevel,
          n21BaseLevel: entry.spell.level,
        },
      });
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
    module.exports = { buildSpellActions, scaleElement, getSlotLevels };
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
      window._n21_.spellActions = { buildSpellActions, scaleElement, getSlotLevels };
    } catch (error) {
      window._n21_.utils?.registerFeatureError?.(featureName, error);
    }
  }
})();
