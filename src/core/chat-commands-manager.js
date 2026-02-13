(() => {
  /* =======================
       ChatCommandsManager - Command parsing and autocomplete
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  const SELECTORS = {
    textInput: "#room_message_message",
    submitButton: '.chat-input[type="submit"]',
  };

  function normalizeCommandName(name) {
    if (!name) return "";
    return String(name).trim().replace(/^\/+/, "").toLowerCase();
  }

  function parseArgumentTokens(input, startIndex) {
    const tokens = [];
    if (!input) return tokens;

    let i = Math.max(0, startIndex || 0);

    while (i < input.length) {
      while (i < input.length && /\s/.test(input[i])) i += 1;
      if (i >= input.length) break;

      const start = i;
      const firstChar = input[i];

      if (firstChar === '"' || firstChar === "'") {
        const quoteChar = firstChar;
        i += 1;
        const valueStart = i;
        while (i < input.length && input[i] !== quoteChar) i += 1;
        const valueEnd = i;
        if (i < input.length && input[i] === quoteChar) i += 1;

        tokens.push({
          value: input.slice(valueStart, valueEnd),
          start,
          end: i,
          quoted: true,
          quoteChar,
        });
        continue;
      }

      while (i < input.length && !/\s/.test(input[i])) i += 1;
      tokens.push({
        value: input.slice(start, i),
        start,
        end: i,
        quoted: false,
        quoteChar: null,
      });
    }

    return tokens;
  }

  function parseCommandInput(input) {
    if (typeof input !== "string") return null;

    let i = 0;
    while (i < input.length && /\s/.test(input[i])) i += 1;
    if (i >= input.length || input[i] !== "/") return null;

    const commandStart = i;
    i += 1;
    const nameStart = i;
    while (i < input.length && !/\s/.test(input[i])) i += 1;

    const rawName = input.slice(nameStart, i);
    if (!rawName) return null;

    const argsStart = i;
    const argTokens = parseArgumentTokens(input, argsStart);

    return {
      input,
      isCommand: true,
      name: normalizeCommandName(rawName),
      rawName,
      commandToken: {
        start: commandStart,
        end: i,
        value: rawName,
      },
      argsStart,
      argTokens,
      args: argTokens.map((token) => token.value),
    };
  }

  function formatSuggestion(value, param, fallbackQuoteChar) {
    const text = String(value ?? "");
    if (!text) return "";

    const quoteChar = param?.quoteChar || fallbackQuoteChar || '"';
    const shouldQuote =
      param?.quoteIfNeeded === true ? text.includes(" ") : false;

    if (shouldQuote) {
      return `${quoteChar}${text}${quoteChar}`;
    }

    return text;
  }

  class ChatCommandsManager extends BaseManager {
    constructor() {
      super();
      this._initialized = false;
      this._commands = new Map();
      this._listeners = [];
      this._chatManager = null;
      this._chatUiManager = null;
      this._inputField = null;
      this._autocompleteState = {
        baseInput: "",
        baseCursor: 0,
        candidates: [],
        index: 0,
        lastWasTab: false,
        suppressInput: false,
        commandName: null,
        paramIndex: null,
      };
    }

    async init() {
      if (this._initialized) return;

      const { loadManagers } = window._n21_;
      const [ChatManager, ChatUIManager] = await loadManagers(
        "ChatManager",
        "ChatUIManager",
      );

      this._chatManager = ChatManager;
      this._chatUiManager = ChatUIManager;

      this._setupChatListener();
      this._setupAutocomplete();

      this._initialized = true;
    }

    isReady() {
      return this._initialized;
    }

    registerCommand(name, options = {}) {
      const normalized = normalizeCommandName(name);
      if (!normalized) return;

      this._commands.set(normalized, {
        name: normalized,
        rawName: String(name).trim().replace(/^\/+/, ""),
        description: options.description || "",
        params: Array.isArray(options.params) ? options.params : [],
        validate: typeof options.validate === "function" ? options.validate : null,
        onBeforeSend:
          typeof options.onBeforeSend === "function"
            ? options.onBeforeSend
            : null,
      });
    }

    unregisterCommand(name) {
      const normalized = normalizeCommandName(name);
      if (!normalized) return;
      this._commands.delete(normalized);
    }

    getCommand(name) {
      const normalized = normalizeCommandName(name);
      if (!normalized) return null;
      return this._commands.get(normalized) || null;
    }

    onCommand(callback) {
      if (typeof callback !== "function") return;

      this._listeners.push(callback);

      return () => {
        const index = this._listeners.indexOf(callback);
        if (index > -1) {
          this._listeners.splice(index, 1);
        }
      };
    }

    parseInput(input) {
      return parseCommandInput(input);
    }

    getRestText(parsed, fromArgIndex = 0) {
      if (!parsed || !parsed.argTokens?.length) return "";
      if (fromArgIndex >= parsed.argTokens.length) return "";

      const token = parsed.argTokens[fromArgIndex];
      return parsed.input.slice(token.end).trimStart();
    }

    _setupChatListener() {
      if (!this._chatManager) return;

      this._chatManager.onMessage((messageData, rawData) => {
        const parsed = this.parseInput(messageData.message);
        if (!parsed || !parsed.isCommand) return true;

        const command = this.getCommand(parsed.name);
        if (!command) return true;

        const payload = {
          ...parsed,
          command,
          messageData,
          rawData,
        };

        for (const listener of this._listeners) {
          try {
            listener(payload);
          } catch (error) {
            console.warn("[ChatCommandsManager] Listener error:", error);
          }
        }

        return true;
      });
    }

    _setupAutocomplete() {
      if (this._inputField) return;

      const inputField = document.querySelector(SELECTORS.textInput);
      if (!inputField) {
        setTimeout(() => this._setupAutocomplete(), 500);
        return;
      }

      this._inputField = inputField;

      inputField.addEventListener("input", () => {
        if (this._autocompleteState.suppressInput) {
          this._autocompleteState.suppressInput = false;
          return;
        }

        this._autocompleteState.baseInput = inputField.value;
        this._autocompleteState.baseCursor =
          typeof inputField.selectionStart === "number"
            ? inputField.selectionStart
            : inputField.value.length;
        this._autocompleteState.candidates = [];
        this._autocompleteState.index = 0;
        this._autocompleteState.lastWasTab = false;
        this._autocompleteState.commandName = null;
        this._autocompleteState.paramIndex = null;
      });

      inputField.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") {
          this._autocompleteState.lastWasTab = false;
          if (event.key === "Enter") {
            const allowed = this._handleCommandSubmit(event, "enter");
            if (!allowed) return;
          }
          return;
        }

        const currentValue = inputField.value;

        if (!this._autocompleteState.lastWasTab) {
          this._autocompleteState.baseInput = currentValue;
          this._autocompleteState.baseCursor =
            typeof inputField.selectionStart === "number"
              ? inputField.selectionStart
              : currentValue.length;
        }

        const baseValue = this._autocompleteState.baseInput || currentValue;
        const parsed = this.parseInput(baseValue);
        if (!parsed || !parsed.isCommand) return;

        const command = this.getCommand(parsed.name);
        if (!command || !command.params?.length) return;

        event.preventDefault();

        const cursor =
          typeof this._autocompleteState.baseCursor === "number"
            ? this._autocompleteState.baseCursor
            : baseValue.length;

        const argTokens = parsed.argTokens || [];
        let paramIndex = argTokens.length;
        let activeToken = null;

        for (let idx = 0; idx < argTokens.length; idx += 1) {
          const token = argTokens[idx];
          const nextToken = argTokens[idx + 1] || null;

          if (cursor >= token.start && cursor <= token.end) {
            paramIndex = idx;
            activeToken = token;
            break;
          }

          if (cursor < token.start) {
            paramIndex = idx;
            break;
          }

          if (nextToken && cursor > token.end && cursor < nextToken.start) {
            paramIndex = idx + 1;
            break;
          }
        }

        if (cursor <= parsed.argsStart) {
          paramIndex = 0;
        }

        if (paramIndex >= command.params.length) {
          return;
        }

        const param = command.params[paramIndex];
        if (!param) return;
        if (typeof param.getSuggestions !== "function") return;

        const fragment = activeToken ? activeToken.value : "";
        const rawSuggestions = param.getSuggestions(fragment, {
          command,
          paramIndex,
          input: baseValue,
          args: parsed.args,
        });

        const suggestions = Array.isArray(rawSuggestions)
          ? rawSuggestions
              .filter((item) => typeof item === "string")
              .filter((item) =>
                fragment
                  ? item.toLowerCase().startsWith(fragment.toLowerCase())
                  : true,
              )
          : [];

        if (!suggestions.length) return;

        const sameCandidates =
          this._autocompleteState.candidates.length === suggestions.length &&
          this._autocompleteState.candidates.every(
            (name, idx) => name === suggestions[idx],
          );

        if (
          !this._autocompleteState.lastWasTab ||
          !sameCandidates ||
          this._autocompleteState.commandName !== parsed.name ||
          this._autocompleteState.paramIndex !== paramIndex
        ) {
          this._autocompleteState.candidates = suggestions;
          this._autocompleteState.index = 0;
          this._autocompleteState.commandName = parsed.name;
          this._autocompleteState.paramIndex = paramIndex;
          this._autocompleteState.baseInput = baseValue;
        } else {
          this._autocompleteState.index =
            (this._autocompleteState.index + 1) % suggestions.length;
        }

        const selected = suggestions[this._autocompleteState.index];
        const formatted = formatSuggestion(selected, param, activeToken?.quoteChar);

        let newValue = baseValue;
        let newCursor = cursor;

        if (activeToken) {
          const before = baseValue.slice(0, activeToken.start);
          const after = baseValue.slice(activeToken.end);
          newValue = `${before}${formatted}${after}`;
          newCursor = before.length + formatted.length;
        } else {
          let insertPos = cursor;
          if (insertPos < parsed.argsStart) insertPos = parsed.argsStart;

          let before = baseValue.slice(0, insertPos);
          const after = baseValue.slice(insertPos);

          if (before.length && !/\s$/.test(before) && before[before.length - 1] !== "/") {
            before += " ";
          }

          let replacement = formatted;
          if (after.length && !/^\s/.test(after)) {
            replacement += " ";
          }

          newValue = `${before}${replacement}${after}`;
          newCursor = before.length + replacement.length;
        }

        this._autocompleteState.suppressInput = true;
        this._autocompleteState.lastWasTab = true;
        inputField.value = newValue;
        inputField.setSelectionRange(newCursor, newCursor);
      });

      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!target || !target.matches) return;
        if (!target.matches(SELECTORS.submitButton)) return;
        this._handleCommandSubmit(event, "click");
      });
    }

    _handleCommandSubmit(event, source) {
      if (!this._inputField) return true;

      const message = this._inputField.value;
      const parsed = this.parseInput(message);
      if (!parsed || !parsed.isCommand) return true;

      const command = this.getCommand(parsed.name);
      if (!command) return true;

      const context = {
        inputField: this._inputField,
        command,
        parsed,
        args: parsed.args || [],
        input: message,
        source,
      };

      if (!this._validateCommand(context)) {
        event.preventDefault();
        event.stopPropagation();
        this._shakeInput(this._inputField);
        return false;
      }

      if (command.onBeforeSend) {
        const result = command.onBeforeSend(context);
        if (result === false) {
          event.preventDefault();
          event.stopPropagation();
          return false;
        }
      }

      return true;
    }

    _validateCommand(context) {
      if (!context.command?.validate) return true;

      try {
        const result = context.command.validate(context);
        if (result && typeof result === "object") {
          return result.valid !== false;
        }
        return result !== false;
      } catch (error) {
        console.warn("[ChatCommandsManager] Validation error:", error);
        return false;
      }
    }

    _shakeInput(inputField) {
      if (!inputField || !inputField.classList) return;
      inputField.classList.add("n21-shake");
      setTimeout(() => {
        inputField.classList.remove("n21-shake");
      }, 500);
    }
  }

  const { registerManager } = window._n21_.utils;
  registerManager("ChatCommandsManager", ChatCommandsManager);
})();
