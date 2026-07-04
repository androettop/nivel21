(() => {
  /* =======================================================================
       Shared money helpers

       Centralizes the currency definitions and the `[money:...]` token
       parsing/serialization so every feature (the inventory panel that shows
       the totals, the equipment money editor that writes them…) agrees on the
       same set of currencies and the same token format.

       A money token looks like `[money:1pp 2gp 3sp]`: space-separated
       `<amount><currencyKey>` pairs, every currency optional. Declare a
       currency below with a `key` + `icon` (a bundled PNG under
       src/assets/inventory/currency/) and it works for any game system; zero /
       undeclared currencies are simply not written.

       Exposed as `window._n21_.money`.
    ======================================================================= */

  // Currencies in display / serialization order. Add or replace freely.
  const CURRENCIES = [
    { key: "pp", label: "Platino", icon: "pp.png" },
    { key: "gp", label: "Oro", icon: "gp.png" },
    { key: "ep", label: "Electro", icon: "ep.png" },
    { key: "sp", label: "Plata", icon: "sp.png" },
    { key: "cp", label: "Cobre", icon: "cp.png" },
  ];

  /** Build the bundled-asset URL for a currency icon. */
  function iconUrl(currency) {
    const base = document.documentElement?.dataset?.n21BaseUrl || "";
    const file = typeof currency === "string" ? currency : currency?.icon;
    return `${base}src/assets/inventory/currency/${file}`;
  }

  const knownKeys = () =>
    new Set(CURRENCIES.map((c) => c.key.toLowerCase()));

  /**
   * Parse the totals from a free-text string by scanning every `[money:...]`
   * token for `<amount><currencyKey>` pairs. Only declared currencies count;
   * multiple tokens sum together.
   * @param {string} text
   * @returns {Object<string, number>} key -> total
   */
  function parse(text) {
    const totals = {};
    if (typeof text !== "string" || !text) return totals;
    const known = knownKeys();
    const tokenRe = /\[money:([^\]]*)\]/gi;
    let token;
    while ((token = tokenRe.exec(text)) !== null) {
      const pairRe = /(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/g;
      let pair;
      while ((pair = pairRe.exec(token[1])) !== null) {
        const key = pair[2].toLowerCase();
        if (!known.has(key)) continue;
        totals[key] = (totals[key] || 0) + Number(pair[1]);
      }
    }
    return totals;
  }

  /**
   * Serialize totals into a `[money:...]` token (declared order, positive
   * amounts only). Returns "" when nothing is positive.
   * @param {Object<string, number>} totals
   * @returns {string}
   */
  function formatToken(totals) {
    const parts = [];
    for (const currency of CURRENCIES) {
      const amount = Number(totals?.[currency.key.toLowerCase()]) || 0;
      if (amount > 0) parts.push(`${amount}${currency.key}`);
    }
    return parts.length ? `[money:${parts.join(" ")}]` : "";
  }

  /**
   * Return `text` with its money reflecting `totals`:
   *   - replaces the first existing `[money:...]` token in place, or
   *   - appends a new token on a fresh line at the end when none exists, or
   *   - removes the existing token (tidying its line) when all totals are zero.
   * @param {string} text
   * @param {Object<string, number>} totals
   * @returns {string}
   */
  function setInText(text, totals) {
    const src = typeof text === "string" ? text : "";
    const token = formatToken(totals);
    const inline = /\[money:[^\]]*\]/i;

    if (inline.test(src)) {
      if (token) return src.replace(inline, token);
      // Removing: drop the whole line when the token stands alone on it,
      // otherwise just remove the token in place.
      const lineRe = /(?:^|\n)[ \t]*\[money:[^\]]*\][ \t]*(?=$|\n)/i;
      if (lineRe.test(src)) return src.replace(lineRe, "");
      return src.replace(inline, "");
    }

    if (!token) return src;
    const trimmed = src.replace(/\s+$/, "");
    return trimmed ? `${trimmed}\n${token}` : token;
  }

  window._n21_ = window._n21_ || {};
  window._n21_.money = { CURRENCIES, iconUrl, parse, formatToken, setInText };
})();
