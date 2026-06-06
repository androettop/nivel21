(async () => {
  try {
    /* =======================
       Feature: Turn Order (Orden de turnos por iniciativa)
    ======================= */

    const { loadManagers } = window._n21_;

    const [
      ChatManager,
      ChatUIManager,
      CanvasDropdownManager,
      PlayerManager,
      TokenManager,
      FloatingPanelManager,
      CharacterManager,
      MainMenuUIManager,
      SettingsManager,
    ] = await loadManagers(
      "ChatManager",
      "ChatUIManager",
      "CanvasDropdownManager",
      "PlayerManager",
      "TokenManager",
      "FloatingPanelManager",
      "CharacterManager",
      "MainMenuUIManager",
      "SettingsManager",
    );

    if (!SettingsManager.get("feature.turn-order.enabled")) {
      return;
    }

    const PANEL_TITLE = "Orden de turnos";
    const PANEL_ICON = "ft-list";
    const PANEL_COLOR = "#822020";
    const PANEL_CLASS = "n21-turn-panel";
    // Narrow panel: a little horizontal room (min/max-width) and a resizable
    // height (min/max-height bound the vertical drag).
    const PANEL_STYLE =
      "min-width: 180px; max-width: 260px; width: 260px; min-height: 240px; max-height: 90vh; height: 360px;";

    // Shown to players instead of the real name when a token has its name
    // hidden. Kept as a const in case it should later read e.g. "Nombre oculto".
    const HIDDEN_NAME_PLACEHOLDER = "••••••";

    const BASE62 =
      "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    /* ----------------------- helpers ----------------------- */

    function toText(value) {
      if (value === undefined || value === null) return "";
      return String(value).trim();
    }

    function safeJsonParse(value) {
      if (typeof value !== "string" || !value.trim()) return null;
      try {
        return JSON.parse(value);
      } catch (error) {
        return null;
      }
    }

    function escapeHtml(value) {
      const div = document.createElement("div");
      div.textContent = String(value ?? "");
      return div.innerHTML;
    }

    /**
     * Deterministic short id for a token networkId. Uses a 32-bit FNV-1a hash
     * encoded in Base62 so it stays the same on every client (DM and players),
     * keeping the chat command short. The hash is one-way: players resolve it
     * back to a token by hashing every known networkId (see buildShortIdMap).
     */
    function shortId(networkId) {
      const str = String(networkId);
      let hash = 0x811c9dc5;
      for (let i = 0; i < str.length; i += 1) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
      }
      let n = hash >>> 0;
      if (n === 0) return "0";
      let result = "";
      while (n > 0) {
        result = BASE62[n % 62] + result;
        n = Math.floor(n / 62);
      }
      return result;
    }

    /**
     * Resolve display info (name + image) for a token from its networkId.
     * Matches how the "Enviar al chat" token option reads the data:
     *   - name  -> metadata.name (fallback to schema.name)
     *   - image -> tokenInstance.imageUrl
     */
    function getTokenInfo(networkId) {
      const token = TokenManager.getToken(networkId);
      const tokenInstance = token?.script?.tokenInstance;
      const schema = tokenInstance?.schema;
      const metadata = safeJsonParse(schema?.metadata) || {};
      const name =
        toText(metadata.name) || toText(schema?.name) || "??";
      const imageUrl = toText(tokenInstance?.imageUrl);
      return { name, imageUrl, nameHidden: isNameHidden(schema, metadata) };
    }

    /**
     * Whether a token has its name hidden from players.
     * TODO: confirmar el campo real de "ocultar nombre" en el schema/metadata.
     */
    function isNameHidden(schema, metadata) {
      return !!(
        metadata?.hide_name ??
        metadata?.hideName ??
        schema?.hideName ??
        schema?.nameHidden
      );
    }

    /**
     * Read a tag value from a token's description metadata.
     * @param {string} networkId
     * @param {string} key - tag key (e.g. "char", "user")
     * @returns {string|null}
     */
    function getTokenTag(networkId, key) {
      const schema = TokenManager.getTokenSchema(networkId);
      if (!schema) return null;
      const metadata = safeJsonParse(schema.metadata) || {};
      const description = toText(metadata.description);
      return window._n21_.utils.parseTokenTag(description, key);
    }

    /**
     * Initial initiative for a token. If the token is assigned to a
     * character/creature (tag [char:rowId]), copy its current initiative value
     * from the tracking panel. Otherwise start at 0. The DM can always edit it
     * afterwards; this is only the initial value.
     */
    function getInitiativeForToken(networkId) {
      const charId = getTokenTag(networkId, "char");
      if (!charId) return 0;
      return CharacterManager.getCharacterInitiative(charId);
    }

    /**
     * Whether a token is assigned to the current user (tag [user:userName]).
     * Used to highlight a player's own tokens in the turn order.
     */
    function isTokenMine(networkId) {
      const assigned = getTokenTag(networkId, "user");
      if (!assigned) return false;
      const myName = PlayerManager.getMyUserName();
      return !!myName && assigned === myName;
    }

    function clampTurn(turn, length) {
      if (!length) return 0;
      if (!Number.isFinite(turn) || turn < 1) return 1;
      if (turn > length) return length;
      return turn;
    }

    /**
     * Parse a "/turno ..." command from raw message text.
     * Returns one of:
     *   { type: "roster", entries: [{ token, initiative }] }  (token = short id)
     *   { type: "turn", turn: number }
     *   { type: "end" }
     *   null (not a turno command)
     */
    function parseTurnCommand(text) {
      const trimmed = toText(text);
      if (!trimmed.startsWith("/turno")) return null;

      const parts = trimmed.split(/\s+/);
      if (parts[0] !== "/turno") return null;

      const args = parts.slice(1).filter(Boolean);
      if (!args.length) return null;

      if (args.length === 1) {
        const single = args[0].toLowerCase();
        if (single === "fin") return { type: "end" };
        if (/^\d+$/.test(single)) {
          return { type: "turn", turn: parseInt(single, 10) };
        }
      }

      if (args.every((arg) => arg.includes(":"))) {
        const entries = args.map((arg) => {
          const idx = arg.indexOf(":");
          const token = arg.slice(0, idx);
          const initiative = parseInt(arg.slice(idx + 1), 10);
          return {
            token,
            initiative: Number.isFinite(initiative) ? initiative : 0,
          };
        });
        return { type: "roster", entries };
      }

      return null;
    }

    /* ----------------------- shared rendering ----------------------- */

    function getPanel() {
      return $(`.floating-panel[data-title="${PANEL_TITLE}"]`);
    }

    function closePanel() {
      const $panel = getPanel();
      if ($panel.length) $panel.remove();
    }

    function ensurePanel() {
      let $panel = getPanel();
      if (!$panel.length) {
        $panel = FloatingPanelManager.openStaticPanelWithHtml(
          PANEL_TITLE,
          PANEL_ICON,
          PANEL_COLOR,
          "",
          PANEL_CLASS,
          PANEL_STYLE,
        );
      }
      return $panel;
    }

    /**
     * Build the inner HTML of the panel for a given state.
     * @param {Array} rows - [{ name, imageUrl, initiative }]
     * @param {number} currentTurn - 1-based turn index (0 = none)
     * @param {boolean} dirty - whether the DM has unsent changes
     * @param {boolean} editable - DM (true) vs player read-only (false)
     */
    function buildBodyHtml(rows, currentTurn, dirty, editable) {
      const topBar = editable
        ? `
          <div class="n21-turn-topbar">
            <button type="button" class="n21-turn-btn n21-turn-sort">
              <i class="ft-bar-chart-2"></i> Ordenar por iniciativa
            </button>
            <button type="button" class="n21-turn-btn n21-turn-btn--danger n21-turn-end" title="Finalizar combate">
              <i class="ft-flag"></i>
            </button>
          </div>`
        : "";

      let listHtml;
      if (!rows.length) {
        listHtml = editable
          ? `<div class="n21-turn-empty">Selecciona uno o más tokens y usa "Agregar turno" desde el menú contextual.</div>`
          : `<div class="n21-turn-empty">Sin orden de turnos activo.</div>`;
      } else {
        listHtml = rows
          .map((entry, index) => {
            const isCurrent = index + 1 === currentTurn;
            // Players see a placeholder for tokens whose name is hidden; the DM
            // always sees the real name.
            const displayName =
              !editable && entry.nameHidden ? HIDDEN_NAME_PLACEHOLDER : entry.name;
            const initCell = editable
              ? `<input type="number" class="n21-turn-init" value="${escapeHtml(
                  entry.initiative,
                )}" step="1" />`
              : `<div class="n21-turn-init-ro">${escapeHtml(
                  entry.initiative,
                )}</div>`;
            const removeBtn = editable
              ? `<button type="button" class="n21-turn-remove" title="Quitar turno">&times;</button>`
              : "";
            const imgHtml = entry.imageUrl
              ? `<img class="n21-turn-img" src="${escapeHtml(
                  entry.imageUrl,
                )}" alt="${escapeHtml(displayName)}" loading="lazy" />`
              : `<div class="n21-turn-img n21-turn-img--empty"></div>`;

            const mineIndicator = entry.mine
              ? `<span class="n21-turn-mine" title="Tu token"></span>`
              : "";

            return `
              <div class="n21-turn-row ${
                isCurrent ? "n21-turn-row--current" : ""
              } ${entry.mine ? "n21-turn-row--mine" : ""}" data-index="${index}">
                <div class="n21-turn-main">
                  <span class="n21-turn-pos">${index + 1}</span>
                  ${imgHtml}
                  <span class="n21-turn-name">${escapeHtml(displayName)}</span>
                  ${mineIndicator}
                </div>
                ${initCell}
                ${removeBtn}
              </div>`;
          })
          .join("");
      }

      const bottomBar = editable
        ? `
          <div class="n21-turn-bottombar">
            <button type="button" class="n21-turn-btn n21-turn-prev" title="Turno anterior" ${
              dirty ? "disabled" : ""
            }>&larr;</button>
            <button type="button" class="n21-turn-btn n21-turn-btn--primary n21-turn-update ${
              dirty ? "n21-turn-update--dirty" : ""
            }">Actualizar</button>
            <button type="button" class="n21-turn-btn n21-turn-next" title="Turno siguiente" ${
              dirty ? "disabled" : ""
            }>&rarr;</button>
          </div>`
        : "";

      return `
        <div class="n21-turn-content">
          ${topBar}
          <div class="n21-turn-list">${listHtml}</div>
          ${bottomBar}
        </div>`;
    }

    /* ----------------------- chat history helpers ----------------------- */

    const N21_MESSAGE_REGEX = /\[\[n21:/; // skip encoded n21 messages

    /**
     * Map every known token's short id back to its networkId so a panel can
     * resolve names/images from the shortened chat command.
     */
    function buildShortIdMap() {
      const map = new Map();
      (TokenManager.getAllTokenIds() || []).forEach((networkId) => {
        map.set(shortId(networkId), networkId);
      });
      return map;
    }

    function resolveSenderId(messageElement) {
      if (!messageElement || !messageElement.closest) return null;
      const messageBox = messageElement.closest(".room-message");
      const senderName = messageBox
        ?.querySelector(".user-name")
        ?.textContent?.replace(":", "")
        .trim();
      if (!senderName) return null;

      const players = PlayerManager.getPlayerList() || [];
      const sender = players.find(
        (player) => String(player?.userName || "").trim() === senderName,
      );
      return sender?.userId || null;
    }

    function isFromGameMaster(messageElement) {
      const senderId = resolveSenderId(messageElement);
      if (!senderId) return false;
      return PlayerManager.isUserGameMaster(senderId);
    }

    /**
     * Apply a parsed "/turno" command to a state object
     * ({ roster: [{shortId, initiative}], currentTurn, active }).
     * Returns true if the state changed.
     */
    function reduceCommand(state, parsed) {
      if (!parsed) return false;

      if (parsed.type === "end") {
        state.roster = [];
        state.currentTurn = 0;
        state.active = false;
        return true;
      }

      if (parsed.type === "roster") {
        state.roster = parsed.entries.map((entry) => ({
          shortId: entry.token,
          initiative: entry.initiative,
        }));
        state.currentTurn = clampTurn(
          state.currentTurn >= 1 ? state.currentTurn : 1,
          state.roster.length,
        );
        state.active = state.roster.length > 0;
        return true;
      }

      if (parsed.type === "turn") {
        if (!state.roster.length) return false;
        state.currentTurn = clampTurn(parsed.turn, state.roster.length);
        state.active = true;
        return true;
      }

      return false;
    }

    /**
     * Reconstruct the current turn-order state from the existing chat history by
     * replaying every "/turno" command sent by the GM (in document order).
     */
    function scanHistoryState() {
      const state = { roster: [], currentTurn: 0, active: false };
      const containers = document.querySelectorAll(
        ChatUIManager.getChatContainerSelector(),
      );
      const selector = ChatUIManager.getMessageTextSelector();

      containers.forEach((container) => {
        container.querySelectorAll(selector).forEach((element) => {
          const text = element?.textContent || "";
          if (!text.includes("/turno")) return;
          if (N21_MESSAGE_REGEX.test(text)) return;
          if (!isFromGameMaster(element)) return;
          reduceCommand(state, parseTurnCommand(text));
        });
      });

      return state;
    }

    /**
     * Add the "Orden de turnos" button to the left main menu.
     * @param {Function} onClick - opens the proper panel for this user
     */
    function addMenuButton(onClick) {
      MainMenuUIManager.addHeader("Nivel 21", { id: "n21-menu-header" }).then(
        (header) => {
          MainMenuUIManager.addItem(
            {
              id: "n21-turn-order-panel",
              title: PANEL_TITLE,
              iconClass: PANEL_ICON,
              order: 18,
              onClick,
            },
            { afterElement: header },
          );
        },
      );
    }

    /* ============================================================
       DM mode
    ============================================================ */

    function setupDmMode() {
      // In-memory state (DM is authoritative). Tokens stored by networkId;
      // name/image are resolved at render time.
      let roster = []; // [{ networkId, initiative }]
      let currentTurn = 0; // 1-based; 0 = not started
      let dirty = false;

      // Debounced chat sender: only the latest message per channel is sent after
      // a short idle period, so rapid actions (stepping turns, re-updating the
      // roster) don't spam the chat with /turno commands.
      const CHAT_DEBOUNCE_MS = 400;
      const chatTimers = new Map(); // channel -> timeoutId

      function queueChat(channel, message) {
        if (chatTimers.has(channel)) clearTimeout(chatTimers.get(channel));
        chatTimers.set(
          channel,
          setTimeout(() => {
            chatTimers.delete(channel);
            ChatManager.send(message);
          }, CHAT_DEBOUNCE_MS),
        );
      }

      function cancelChat(channel) {
        if (!chatTimers.has(channel)) return;
        clearTimeout(chatTimers.get(channel));
        chatTimers.delete(channel);
      }

      function buildRosterCommand() {
        return (
          "/turno " +
          roster.map((e) => `${shortId(e.networkId)}:${e.initiative}`).join(" ")
        );
      }

      function renderDm() {
        const $panel = ensurePanel();
        if (!$panel || !$panel.length) return;

        const rows = roster.map((e) => {
          const info = getTokenInfo(e.networkId);
          return {
            name: info.name,
            imageUrl: info.imageUrl,
            initiative: e.initiative,
            mine: isTokenMine(e.networkId),
            nameHidden: info.nameHidden,
          };
        });

        const $block = $panel.find(".floating-block").first();
        $block.html(buildBodyHtml(rows, currentTurn, dirty, true));

        bindDmEvents($panel);
      }

      function setDirty(value) {
        dirty = !!value;
        const $panel = getPanel();
        $panel
          .find(".n21-turn-update")
          .toggleClass("n21-turn-update--dirty", dirty);
        // While there are unsent changes, block turn navigation so players never
        // see a turn that differs from what the DM has applied.
        $panel.find(".n21-turn-prev, .n21-turn-next").prop("disabled", dirty);
      }

      function addTokens(networkIds) {
        let added = false;
        networkIds.forEach((networkId) => {
          const id = toText(networkId);
          if (!id) return;
          if (roster.some((e) => e.networkId === id)) return;

          const entry = { networkId: id, initiative: getInitiativeForToken(id) };

          // Insert keeping the list sorted by initiative (descending), so a
          // token with an initial initiative lands in the right spot. Ties keep
          // insertion order (inserted after equal initiatives).
          const at = roster.findIndex((e) => e.initiative < entry.initiative);
          if (at === -1) roster.push(entry);
          else roster.splice(at, 0, entry);

          added = true;
        });

        if (added) {
          dirty = true;
          renderDm();
        }
      }

      function removeTokens(networkIds) {
        const ids = new Set(networkIds.map((id) => toText(id)));
        const before = roster.length;
        roster = roster.filter((e) => !ids.has(e.networkId));
        if (roster.length !== before) {
          if (currentTurn > roster.length) currentTurn = roster.length;
          dirty = true;
          renderDm();
        }
      }

      function sortByInitiative() {
        roster.sort((a, b) => b.initiative - a.initiative);
        dirty = true;
        renderDm();
      }

      function sendRoster() {
        if (!roster.length) return;
        // Each channel debounces independently, so a pending turn change is
        // still sent (in the order it was made) instead of being dropped here.
        queueChat("roster", buildRosterCommand());
        if (currentTurn < 1) currentTurn = 1;
        dirty = false;
        renderDm();
      }

      function goToTurn(turn) {
        if (!roster.length) return;
        const next = clampTurn(turn, roster.length);
        currentTurn = next;
        queueChat("turn", `/turno ${next}`);
        renderDm();
      }

      function stepTurn(delta) {
        if (!roster.length) return;
        const base = currentTurn >= 1 ? currentTurn : 1;
        let next = base + delta;
        if (next < 1) next = roster.length; // wrap to last
        if (next > roster.length) next = 1; // wrap to first
        goToTurn(next);
      }

      function finalize() {
        // Ending combat supersedes any pending roster/turn updates.
        cancelChat("roster");
        cancelChat("turn");
        queueChat("end", "/turno fin");
        roster = [];
        currentTurn = 0;
        dirty = false;
        closePanel();
      }

      function bindDmEvents($panel) {
        $panel.off(".n21turn");

        $panel.on("click.n21turn", ".n21-turn-sort", () => sortByInitiative());
        $panel.on("click.n21turn", ".n21-turn-end", () => finalize());
        $panel.on("click.n21turn", ".n21-turn-update", () => sendRoster());
        $panel.on("click.n21turn", ".n21-turn-prev", () => stepTurn(-1));
        $panel.on("click.n21turn", ".n21-turn-next", () => stepTurn(1));

        $panel.on("click.n21turn", ".n21-turn-remove", function (event) {
          event.stopPropagation();
          const index = Number($(this).closest(".n21-turn-row").data("index"));
          if (!Number.isFinite(index) || !roster[index]) return;
          removeTokens([roster[index].networkId]);
        });

        $panel.on("input.n21turn", ".n21-turn-init", function () {
          const index = Number($(this).closest(".n21-turn-row").data("index"));
          if (!Number.isFinite(index) || !roster[index]) return;
          const value = parseInt(this.value, 10);
          roster[index].initiative = Number.isFinite(value) ? value : 0;
          setDirty(true);
        });
      }

      function collectContextNetworkIds(context) {
        const ids = [];

        const selected = Array.isArray(window.selectedSchemas)
          ? window.selectedSchemas
          : [];
        selected.forEach((schema) => {
          const id = toText(schema?.networkId);
          if (id) ids.push(id);
        });

        const clicked = toText(context?.tokenNetworkId);
        if (clicked) ids.push(clicked);

        return Array.from(new Set(ids));
      }

      // Context menu: add tokens to the turn order.
      CanvasDropdownManager.registerOption({
        id: "n21-turn-order-add",
        label: "Agregar turno",
        showOn: ["token"],
        order: 60,
        gameMasterOnly: true,
        isVisible: (context) => !!context?.tokenNetworkId,
        onClick: (context) => {
          const ids = collectContextNetworkIds(context);
          if (!ids.length) return;
          addTokens(ids);
        },
      });

      // Context menu: remove tokens from the turn order.
      CanvasDropdownManager.registerOption({
        id: "n21-turn-order-remove",
        label: "Quitar turno",
        showOn: ["token"],
        order: 61,
        gameMasterOnly: true,
        isVisible: (context) => {
          if (!context?.tokenNetworkId) return false;
          const ids = collectContextNetworkIds(context);
          return ids.some((id) => roster.some((e) => e.networkId === id));
        },
        onClick: (context) => {
          const ids = collectContextNetworkIds(context);
          if (!ids.length) return;
          removeTokens(ids);
        },
      });

      // Rebuild the DM (editable) panel from chat history on load, so an active
      // turn order reopens after a reload. Tokens may not be loaded yet, so
      // retry a few times until every short id resolves.
      let reconstructTimer = null;
      function reconstructDm(attempt = 0) {
        const state = scanHistoryState();
        if (!state.active || !state.roster.length) return;

        const map = buildShortIdMap();
        const rebuilt = state.roster
          .map((e) => {
            const networkId = map.get(e.shortId);
            return networkId ? { networkId, initiative: e.initiative } : null;
          })
          .filter(Boolean);

        if (rebuilt.length < state.roster.length && attempt < 10) {
          if (reconstructTimer) clearTimeout(reconstructTimer);
          reconstructTimer = setTimeout(() => reconstructDm(attempt + 1), 1000);
        }

        if (!rebuilt.length) return;

        roster = rebuilt;
        currentTurn = clampTurn(
          state.currentTurn >= 1 ? state.currentTurn : 1,
          roster.length,
        );
        dirty = false;
        renderDm();
      }

      // Left-menu button to (re)open the DM panel if it gets closed.
      addMenuButton(() => renderDm());

      reconstructDm();
    }

    /* ============================================================
       Player mode (read-only, reconstructed from chat history)
    ============================================================ */

    function setupPlayerMode() {
      // Reconstructed state from chat messages. Tokens stored by short id.
      let roster = []; // [{ shortId, initiative }]
      let currentTurn = 0;
      let active = false; // whether a turn order is currently active
      let needsRender = false;
      let retryTimer = null;

      function applyCommand(parsed) {
        const state = { roster, currentTurn, active };
        if (!reduceCommand(state, parsed)) return;
        roster = state.roster;
        currentTurn = state.currentTurn;
        active = state.active;
        needsRender = true;
      }

      function renderPlayer() {
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }

        if (!active || !roster.length) {
          closePanel();
          return;
        }

        const map = buildShortIdMap();
        let unresolved = 0;
        const rows = roster.map((e) => {
          const networkId = map.get(e.shortId);
          if (!networkId) {
            unresolved += 1;
            return { name: "??", imageUrl: "", initiative: e.initiative, mine: false };
          }
          const info = getTokenInfo(networkId);
          return {
            name: info.name,
            imageUrl: info.imageUrl,
            initiative: e.initiative,
            mine: isTokenMine(networkId),
            nameHidden: info.nameHidden,
          };
        });

        const $panel = ensurePanel();
        if (!$panel || !$panel.length) return;
        const $block = $panel.find(".floating-block").first();
        $block.html(buildBodyHtml(rows, currentTurn, false, false));

        // Some tokens may not be loaded yet when reconstructing from history.
        if (unresolved > 0) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            renderPlayer();
          }, 1500);
        }
      }

      function processMessageElement(element) {
        if (PlayerManager.isGameMaster()) return;

        const text = element?.textContent || "";
        if (!text.includes("/turno")) return;
        if (N21_MESSAGE_REGEX.test(text)) return;
        if (!isFromGameMaster(element)) return;

        applyCommand(parseTurnCommand(text));
      }

      // (Re)open the player panel if it gets closed. Shows the active order, or
      // an empty state when there's none.
      function openPlayerPanel() {
        if (active && roster.length) {
          renderPlayer();
          return;
        }
        const $panel = ensurePanel();
        if (!$panel || !$panel.length) return;
        $panel
          .find(".floating-block")
          .first()
          .html(buildBodyHtml([], 0, false, false));
      }

      ChatUIManager.onMessage(
        "turn-order-player",
        (element) => processMessageElement(element),
        {
          priority: 110,
          onComplete: () => {
            if (PlayerManager.isGameMaster()) return;
            if (!needsRender) return;
            needsRender = false;
            renderPlayer();
          },
        },
      );

      // Left-menu button to (re)open the player panel.
      addMenuButton(() => openPlayerPanel());

      // Reconstruct from existing chat history (late join support).
      ChatUIManager.processExistingMessages();
    }

    /* ----------------------- bootstrap ----------------------- */

    if (PlayerManager.isGameMaster()) {
      setupDmMode();
    } else {
      setupPlayerMode();
    }
  } catch (error) {
    window._n21_.utils.registerFeatureError("Turn Order", error);
  }
})();
