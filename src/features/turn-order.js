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
      SettingsManager,
    ] = await loadManagers(
      "ChatManager",
      "ChatUIManager",
      "CanvasDropdownManager",
      "PlayerManager",
      "TokenManager",
      "FloatingPanelManager",
      "SettingsManager",
    );

    if (!SettingsManager.get("feature.turn-order.enabled")) {
      return;
    }

    const PANEL_TITLE = "Orden de turnos";
    const PANEL_ICON = "fas fa-list-ol";
    const PANEL_COLOR = "#3a4a6b";
    const PANEL_CLASS = "n21-turn-panel n21-fixed-panel";
    const PANEL_STYLE =
      "min-width: 300px; max-width: 360px; min-height: 240px;";

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
      return { name, imageUrl };
    }

    /**
     * Initiative lookup from the session status by token name.
     * TODO: leer del status de la sesión por nombre del token.
     * Por ahora la iniciativa siempre arranca en 0.
     */
    function getInitiativeFromSession(_name) {
      return 0;
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
            <button type="button" class="btn btn-sm btn-secondary n21-turn-sort">
              <i class="fas fa-sort-amount-down"></i> Ordenar por iniciativa
            </button>
            <button type="button" class="btn btn-sm btn-danger n21-turn-end" title="Finalizar combate">
              <i class="fas fa-flag-checkered"></i>
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
            const initCell = editable
              ? `<input type="number" class="form-control n21-turn-init" value="${escapeHtml(
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
                )}" alt="${escapeHtml(entry.name)}" loading="lazy" />`
              : `<div class="n21-turn-img n21-turn-img--empty"></div>`;

            return `
              <div class="n21-turn-row ${
                isCurrent ? "n21-turn-row--current" : ""
              }" data-index="${index}">
                <div class="n21-turn-main ${editable ? "n21-turn-main--clickable" : ""}">
                  <span class="n21-turn-pos">${index + 1}</span>
                  ${imgHtml}
                  <span class="n21-turn-name">${escapeHtml(entry.name)}</span>
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
            <button type="button" class="btn btn-sm btn-secondary n21-turn-prev" title="Turno anterior">&larr;</button>
            <button type="button" class="btn btn-sm btn-primary n21-turn-update ${
              dirty ? "n21-turn-update--dirty" : ""
            }">Actualizar</button>
            <button type="button" class="btn btn-sm btn-secondary n21-turn-next" title="Turno siguiente">&rarr;</button>
          </div>`
        : "";

      return `
        <div class="n21-turn-content">
          ${topBar}
          <div class="n21-turn-list">${listHtml}</div>
          ${bottomBar}
        </div>`;
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
          };
        });

        const $block = $panel.find(".floating-block").first();
        $block.html(buildBodyHtml(rows, currentTurn, dirty, true));

        bindDmEvents($panel);
      }

      function setDirty(value) {
        dirty = !!value;
        getPanel()
          .find(".n21-turn-update")
          .toggleClass("n21-turn-update--dirty", dirty);
      }

      function addTokens(networkIds) {
        let added = false;
        networkIds.forEach((networkId) => {
          const id = toText(networkId);
          if (!id) return;
          if (roster.some((e) => e.networkId === id)) return;

          const info = getTokenInfo(id);
          roster.push({
            networkId: id,
            initiative: getInitiativeFromSession(info.name),
          });
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
        ChatManager.send(buildRosterCommand());
        if (currentTurn < 1) currentTurn = 1;
        dirty = false;
        renderDm();
      }

      function goToTurn(turn) {
        if (!roster.length) return;
        const next = clampTurn(turn, roster.length);
        currentTurn = next;
        ChatManager.send(`/turno ${next}`);
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
        ChatManager.send("/turno fin");
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

        $panel.on("click.n21turn", ".n21-turn-main--clickable", function () {
          const index = Number($(this).closest(".n21-turn-row").data("index"));
          if (!Number.isFinite(index)) return;
          goToTurn(index + 1);
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
    }

    /* ============================================================
       Player mode (read-only, reconstructed from chat history)
    ============================================================ */

    function setupPlayerMode() {
      const N21_MESSAGE_REGEX = /\[\[n21:/; // skip encoded n21 messages

      // Reconstructed state from chat messages. Tokens stored by short id.
      let roster = []; // [{ shortId, initiative }]
      let currentTurn = 0;
      let active = false; // whether a turn order is currently active
      let needsRender = false;
      let retryTimer = null;

      /**
       * Map every known token's short id back to its networkId so the read-only
       * panel can resolve names/images from the shortened chat command.
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

      function applyCommand(parsed) {
        if (!parsed) return;

        if (parsed.type === "end") {
          roster = [];
          currentTurn = 0;
          active = false;
          needsRender = true;
          return;
        }

        if (parsed.type === "roster") {
          roster = parsed.entries.map((entry) => ({
            shortId: entry.token,
            initiative: entry.initiative,
          }));
          currentTurn = clampTurn(
            currentTurn >= 1 ? currentTurn : 1,
            roster.length,
          );
          active = roster.length > 0;
          needsRender = true;
          return;
        }

        if (parsed.type === "turn") {
          if (!roster.length) return;
          currentTurn = clampTurn(parsed.turn, roster.length);
          active = true;
          needsRender = true;
        }
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
            return { name: "??", imageUrl: "", initiative: e.initiative };
          }
          const info = getTokenInfo(networkId);
          return {
            name: info.name,
            imageUrl: info.imageUrl,
            initiative: e.initiative,
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
