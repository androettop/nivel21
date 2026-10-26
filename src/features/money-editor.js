(async () => {
  try {
    /* =======================================================================
         Feature: Money Editor

         Adds a small currency editor below the markdown editor of the character
         "equipment" field ("Otras posesiones"). Each declared currency gets a
         number input; changing any of them rewrites the `[money:...]` token in
         the editor's text (positive amounts only, in currency order).

         If the text has no `[money:...]` token yet, one is appended on a new
         line at the end; if every amount drops to zero, the token is removed.

         The equipment field uses the platform markdown editor (EasyMDE), so the
         value is read/written through that instance (falling back to the raw
         textarea) — writing the textarea alone would be discarded on submit.

         The form is detected by its hidden `character[attribute]` = "equipment"
         input, so it works both in the modal and the floating-panel variants.
      ======================================================================= */

    const { loadManagers } = window._n21_;

    const [MarkdownEditorManager, SettingsManager] = await loadManagers(
      "MarkdownEditorManager",
      "SettingsManager",
    );

    if (!SettingsManager.get("feature.money-editor.enabled")) {
      return;
    }

    const money = window._n21_.money;
    if (!money) return;

    // Marks a form we've already augmented so we never inject twice.
    const DONE_ATTR = "data-n21-money-editor";

    /** Minimal HTML escaping for text interpolated into markup. */
    function escapeHtml(value) {
      const div = document.createElement("div");
      div.textContent = String(value ?? "");
      return div.innerHTML;
    }

    /**
     * The EasyMDE instance bound to the equipment textarea, if any. EasyMDE
     * stores it on the textarea via jQuery data("simplemde"); it may not exist
     * yet the instant the form is inserted, so callers re-read it lazily.
     */
    function getInstance(textarea) {
      if (typeof window.$ !== "function") return null;
      return window.$(textarea).data("simplemde") || null;
    }

    /** Current amounts entered in the coin inputs, keyed by currency. */
    function readInputs($fields) {
      const totals = {};
      $fields.find("input[data-currency]").each(function () {
        const key = this.getAttribute("data-currency");
        const amount = Number(this.value);
        if (Number.isFinite(amount) && amount > 0) totals[key] = amount;
      });
      return totals;
    }

    /** Build the coin editor markup (one number input per currency). */
    function buildEditorHtml() {
      const fields = money.CURRENCIES.map(
        (currency) =>
          `<label class="n21-money-editor-field" title="${escapeHtml(
            currency.label,
          )}">` +
          `<img class="n21-money-editor-icon" src="${money.iconUrl(
            currency,
          )}" alt="${escapeHtml(currency.key)}">` +
          `<input type="number" min="0" step="1" inputmode="numeric" ` +
          `data-currency="${escapeHtml(currency.key)}">` +
          `</label>`,
      ).join("");
      return (
        '<div class="n21-money-editor">' +
        '<div class="n21-money-editor-title">Monedas</div>' +
        `<div class="n21-money-editor-fields">${fields}</div>` +
        "</div>"
      );
    }

    /** Read the editor's current text (EasyMDE instance or textarea fallback). */
    function readText(textarea) {
      const instance = getInstance(textarea);
      if (instance) return MarkdownEditorManager.getValue(instance, textarea);
      // Before EasyMDE initializes, the seed value lives on data-value.
      return textarea.getAttribute("data-value") || textarea.value || "";
    }

    /** Write text back through the EasyMDE instance (or textarea fallback). */
    function writeText(textarea, text) {
      const instance = getInstance(textarea);
      MarkdownEditorManager.setValue(instance, text, textarea);
    }

    /** Set the coin inputs from the totals parsed out of the current text. */
    function syncInputsFromText($fields, textarea) {
      const totals = money.parse(readText(textarea));
      $fields.find("input[data-currency]").each(function () {
        const key = this.getAttribute("data-currency");
        const amount = Number(totals[key]) || 0;
        this.value = amount ? String(amount) : "";
      });
    }

    /** Inject the coin editor into an equipment edit form (idempotent). */
    function processForm(form) {
      if (!form || form.getAttribute(DONE_ATTR)) return;

      const textarea = form.querySelector('textarea[name="character[value]"]');
      if (!textarea) return;

      form.setAttribute(DONE_ATTR, "true");

      const $editor = window.$(buildEditorHtml());
      const $fields = $editor; // fields live inside; queried via find()

      // Place it right after the markdown editor UI (falling back to the
      // textarea's form-group / the textarea itself).
      const anchor =
        form.querySelector(".EasyMDEContainer") ||
        textarea.closest(".form-group") ||
        textarea;
      window.$(anchor).after($editor);

      // Seed the inputs from whatever is currently in the field.
      syncInputsFromText($fields, textarea);

      // EasyMDE may still be initializing, and it gets the field's text a bit
      // after it exists: once it's there, follow its text (the seed and any
      // edit made by hand) except for the changes the coin inputs write.
      let writing = false;
      let attempts = 0;
      const settle = setInterval(() => {
        attempts += 1;
        const instance = getInstance(textarea);
        if (instance || attempts >= 20) {
          clearInterval(settle);
          syncInputsFromText($fields, textarea);
          MarkdownEditorManager.onChange(instance, textarea, () => {
            if (!writing) syncInputsFromText($fields, textarea);
          });
        }
      }, 100);

      // On any coin change, rewrite the [money:...] token in the editor text.
      $editor.on("input change", "input[data-currency]", () => {
        const totals = readInputs($fields);
        writing = true;
        try {
          writeText(textarea, money.setInText(readText(textarea), totals));
        } finally {
          writing = false;
        }
      });
    }

    /* ------------------ Render [money:...] tokens as icons ---------------- */

    // Nodes whose text we must NOT touch: the markdown editor source (CodeMirror
    // splits the token into spans anyway, and the textarea holds the raw value).
    const SKIP_SELECTOR = "textarea, .CodeMirror, .EasyMDEContainer, script, style";

    /** Whether a text node lives inside an editor / skip zone. */
    function inSkipZone(node) {
      let el = node.parentElement;
      while (el) {
        if (el.classList?.contains("n21-money-inline")) return true;
        if (el.matches?.(SKIP_SELECTOR)) return true;
        el = el.parentElement;
      }
      return false;
    }

    /** Build an inline element rendering `totals` as amount + coin icons. */
    function buildInlineMoney(totals) {
      const parts = [];
      for (const currency of money.CURRENCIES) {
        const amount = totals[currency.key.toLowerCase()];
        if (!amount) continue;
        parts.push(
          `<span class="n21-money-coin" title="${escapeHtml(currency.label)}">` +
            `<span class="n21-money-coin-amount">${escapeHtml(amount)}</span>` +
            `<img class="n21-money-coin-icon" src="${money.iconUrl(
              currency,
            )}" alt="${escapeHtml(currency.key)}">` +
            `</span>`,
        );
      }
      if (!parts.length) return null;
      const span = document.createElement("span");
      span.className = "n21-money-inline";
      span.innerHTML = parts.join("");
      return span;
    }

    /** Replace every `[money:...]` token in a text node with coin icons. */
    function renderMoneyInTextNode(node) {
      const text = node.nodeValue;
      const re = /\[money:[^\]]*\]/g;
      let match;
      let last = 0;
      const frag = document.createDocumentFragment();
      while ((match = re.exec(text)) !== null) {
        if (match.index > last) {
          frag.appendChild(
            document.createTextNode(text.slice(last, match.index)),
          );
        }
        const rendered = buildInlineMoney(money.parse(match[0]));
        // Keep the raw text when the token has no positive amounts.
        frag.appendChild(rendered || document.createTextNode(match[0]));
        last = match.index + match[0].length;
      }
      if (last < text.length) {
        frag.appendChild(document.createTextNode(text.slice(last)));
      }
      node.parentNode?.replaceChild(frag, node);
    }

    /** Render money tokens found in text nodes within (or equal to) a node. */
    function renderMoney(node) {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        if (node.nodeValue.includes("[money:") && !inSkipZone(node)) {
          renderMoneyInTextNode(node);
        }
        return;
      }
      if (
        node.nodeType !== Node.ELEMENT_NODE &&
        node.nodeType !== Node.DOCUMENT_NODE
      ) {
        return;
      }

      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
        acceptNode(textNode) {
          if (!textNode.nodeValue || !textNode.nodeValue.includes("[money:")) {
            return NodeFilter.FILTER_REJECT;
          }
          return inSkipZone(textNode)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        },
      });

      const targets = [];
      let current;
      while ((current = walker.nextNode())) targets.push(current);
      targets.forEach(renderMoneyInTextNode);
    }

    /** Find equipment edit forms within (or equal to) a root node. */
    function scan(root) {
      if (!(root instanceof HTMLElement)) return;

      const check = (input) => {
        if ((input.value || "").toLowerCase() !== "equipment") return;
        const form = input.closest("form");
        if (form) processForm(form);
      };

      if (
        root.matches?.('input[name="character[attribute]"]')
      ) {
        check(root);
      }
      root
        .querySelectorAll?.('input[name="character[attribute]"]')
        .forEach(check);
    }

    // Process any form already present, then watch for ones added later
    // (the editor usually opens in a modal / floating panel on demand).
    scan(document.body);
    renderMoney(document.body);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          scan(node);
          renderMoney(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (error) {
    window._n21_.utils.registerFeatureError("Money Editor", error);
  }
})();
