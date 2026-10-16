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
      CameraManager,
      MainMenuUIManager,
      SettingsManager,
      CombatTrackingManager,
      DiceManager,
    ] = await loadManagers(
      "ChatManager",
      "ChatUIManager",
      "CanvasDropdownManager",
      "PlayerManager",
      "TokenManager",
      "FloatingPanelManager",
      "CharacterManager",
      "CameraManager",
      "MainMenuUIManager",
      "SettingsManager",
      "CombatTrackingManager",
      "DiceManager",
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
      const charId = TokenManager.getLinkedRowId(networkId);
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
     *   { type: "roster", entries: [{ token, initiative }], timerSeconds }  (token = short id)
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
        // The roster also carries the seconds per turn as "tiempo:N" (no
        // extra chat message for the timer). Absent = no timer.
        let timerSeconds = 0;
        const tokens = args.filter((arg) => {
          const [key, value] = arg.split(":");
          if (key.toLowerCase() !== "tiempo") return true;
          const seconds = parseInt(value, 10);
          timerSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
          return false;
        });
        const entries = tokens.map((arg) => {
          const idx = arg.indexOf(":");
          const token = arg.slice(0, idx);
          const initiative = parseInt(arg.slice(idx + 1), 10);
          return {
            token,
            initiative: Number.isFinite(initiative) ? initiative : 0,
          };
        });
        return { type: "roster", entries, timerSeconds };
      }

      return null;
    }

    /* ----------------------- turn timer ----------------------- */

    // Purely visual countdown shared by DM and players. The DM picks the
    // seconds per turn (sent inside the roster as "tiempo:N"); every client restarts its local
    // countdown when the turn changes. Reaching 0 does nothing but turn red.
    const TIMER_STORAGE_KEY = "_n21_turn-order.timer-seconds";
    const TIMER_WARN_SECONDS = 10;
    const timer = { seconds: 0, startedAt: Date.now(), running: false };
    let timerInterval = null;

    function loadStoredTimerSeconds() {
      try {
        const value = parseInt(localStorage.getItem(TIMER_STORAGE_KEY), 10);
        return Number.isFinite(value) && value > 0 ? value : 0;
      } catch (error) {
        return 0;
      }
    }

    function storeTimerSeconds(seconds) {
      try {
        localStorage.setItem(TIMER_STORAGE_KEY, String(seconds));
      } catch (error) {}
    }

    function formatClock(totalSeconds) {
      const value = Math.max(0, Math.ceil(totalSeconds));
      const minutes = Math.floor(value / 60);
      const seconds = value % 60;
      return `${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    function getTimerRemaining() {
      if (!timer.seconds) return 0;
      const elapsed = (Date.now() - timer.startedAt) / 1000;
      return Math.max(0, timer.seconds - elapsed);
    }

    // The chat history has no timestamps, so after a reload the countdown
    // would restart. Each client remembers when (by its own clock, so clock
    // or time zone differences between users don't matter) the current turn
    // started, plus how many /turno messages the chat had then. After a
    // reload the start is reused only if it is still the same turn and the
    // number of /turno messages barely changed (not a later round).
    const TURN_START_KEY = `_n21_turn-order.turn-start:${window.location.pathname}`;
    const TURN_START_MAX_NEW_MESSAGES = 2;

    function saveTurnStart(turnKey, messageCount) {
      try {
        localStorage.setItem(
          TURN_START_KEY,
          JSON.stringify({ turnKey, messageCount, startedAt: timer.startedAt }),
        );
      } catch (error) {}
    }

    /** Stored start of this turn, or null if it isn't known. */
    function loadTurnStart(turnKey, messageCount) {
      try {
        const saved = JSON.parse(localStorage.getItem(TURN_START_KEY) || "null");
        if (!saved || saved.turnKey !== turnKey || !turnKey) return null;
        // The count can differ a little between a live chat and the history
        // rendered on load; a whole new round adds many more messages.
        if (Math.abs(messageCount - saved.messageCount) > TURN_START_MAX_NEW_MESSAGES) return null;
        return Number.isFinite(saved.startedAt) && saved.startedAt <= Date.now()
          ? saved.startedAt
          : null;
      } catch (error) {
        return null;
      }
    }

    function updateTimerDom() {
      const $timer = getPanel().find(".n21-turn-timer");
      if (!$timer.length) return;

      const active = timer.running && timer.seconds > 0;
      const remaining = active ? getTimerRemaining() : timer.seconds;
      const ratio = timer.seconds > 0 ? remaining / timer.seconds : 0;

      $timer.find(".n21-turn-timer-value").text(
        timer.seconds > 0 ? formatClock(remaining) : "Sin temporizador",
      );
      $timer
        .find(".n21-turn-timer-fill")
        .css("width", `${Math.round(ratio * 1000) / 10}%`);
      $timer.toggleClass("n21-turn-timer--off", !timer.seconds);
      $timer.toggleClass(
        "n21-turn-timer--warn",
        active && remaining > 0 && remaining <= TIMER_WARN_SECONDS,
      );
      $timer.toggleClass("n21-turn-timer--zero", active && remaining <= 0);
    }

    function syncTimerInterval() {
      const shouldTick = timer.running && timer.seconds > 0;
      if (shouldTick && !timerInterval) {
        timerInterval = setInterval(updateTimerDom, 250);
      } else if (!shouldTick && timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      updateTimerDom();
    }

    function restartTimer() {
      timer.startedAt = Date.now();
      syncTimerInterval();
    }

    function setTimerRunning(running) {
      timer.running = !!running;
      syncTimerInterval();
    }

    function buildTimerHtml(editable) {
      if (!editable && !timer.seconds) return "";
      const config = editable
        ? `<label class="n21-turn-timer-config" title="Segundos por turno (0 = sin temporizador)">
             <input type="number" class="n21-turn-timer-input" min="0" step="5" value="${escapeHtml(
               timer.seconds,
             )}" />
             <span>s</span>
           </label>`
        : "";
      const restartAttr = editable
        ? 'role="button" tabindex="0" title="Reiniciar el temporizador del turno actual"'
        : "";
      return `
        <div class="n21-turn-timer">
          <div class="n21-turn-timer-row">
            <i class="ft-clock"></i>
            <span class="n21-turn-timer-value ${
              editable ? "n21-turn-timer-value--action" : ""
            }" ${restartAttr}></span>
            ${config}
          </div>
          <div class="n21-turn-timer-bar"><div class="n21-turn-timer-fill"></div></div>
        </div>`;
    }

    /* ----------------------- shared rendering ----------------------- */

    function getPanel() {
      return $(`.floating-panel[data-title="${PANEL_TITLE}"]`);
    }

    function closePanel() {
      const $panel = getPanel();
      if ($panel.length) $panel.remove();
      setHighlight(null);
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
      bindHighlightHover($panel);
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
            <button type="button" class="n21-turn-btn n21-turn-sort" title="Ordenar por iniciativa">
              <i class="ft-bar-chart-2"></i> Ordenar
            </button>
            <button type="button" class="n21-turn-btn n21-turn-read-init"
              title="Usar la última tirada de «Iniciativa» del chat de cada personaje y tirar la de las criaturas">
              <i class="fa fa-cube"></i>
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
              } ${entry.mine ? "n21-turn-row--mine" : ""}" data-index="${index}" data-network-id="${escapeHtml(
                entry.networkId || "",
              )}">
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
          ${buildTimerHtml(editable)}
          <div class="n21-turn-list">${listHtml}</div>
          ${bottomBar}
        </div>`;
    }

    /* ----------------------- token hover highlight ----------------------- */

    // A yellow box drawn over the hovered row's token, on a canvas overlay that
    // follows the token every frame (same idea as the ping overlay).
    const HIGHLIGHT_COLOR = "#ffd400";
    const HIGHLIGHT_OVERLAY_ID = "n21-turn-highlight-overlay";

    let highlightNetworkId = null;
    let highlightFrame = null;

    function ensureHighlightCanvas() {
      const appCanvas = document.querySelector("#application-canvas");
      if (!appCanvas || !appCanvas.parentElement) return null;

      let canvas = document.getElementById(HIGHLIGHT_OVERLAY_ID);
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.id = HIGHLIGHT_OVERLAY_ID;
        canvas.className = "n21-turn-highlight-overlay";

        const parent = appCanvas.parentElement;
        if (appCanvas.nextSibling) {
          parent.insertBefore(canvas, appCanvas.nextSibling);
        } else {
          parent.appendChild(canvas);
        }
      }
      return canvas;
    }

    function drawHighlight() {
      const canvas = ensureHighlightCanvas();
      if (!canvas) {
        highlightFrame = null;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // The row can disappear under the cursor (panel closed or redrawn)
      // without a mouseleave: stop as soon as no row is hovered.
      if (highlightNetworkId && !document.querySelector(".n21-turn-row:hover")) {
        highlightNetworkId = null;
      }
      const networkId = highlightNetworkId;
      // Never reveal where a token hidden from this user is.
      if (networkId && !TokenManager.isLocallyHidden(networkId)) {
        const pos = TokenManager.getTokenPosition(networkId);
        const scale = TokenManager.getTokenScale(networkId) || { x: 1, z: 1 };
        if (pos) {
          const halfX = Math.abs(scale.x || 1) / 2;
          const halfZ = Math.abs(scale.z || 1) / 2;

          const corners = [
            [pos.x - halfX, pos.z - halfZ],
            [pos.x + halfX, pos.z - halfZ],
            [pos.x + halfX, pos.z + halfZ],
            [pos.x - halfX, pos.z + halfZ],
          ]
            .map(([wx, wz]) => CameraManager.worldToScreen(wx, wz, 0))
            .filter(Boolean);

          if (corners.length === 4) {
            // Border thickness scales with how big a cell is on screen, so it
            // stays ~3px at normal zoom and grows/shrinks with it.
            const topEdgePx = Math.hypot(
              corners[1].x - corners[0].x,
              corners[1].y - corners[0].y,
            );
            const pxPerCell = topEdgePx / (Math.abs(scale.x) || 1);
            const lineWidth = Math.max(2, pxPerCell * 0.06);

            // The token's real outline on the board (a trapezoid with a
            // tilted camera, a square from above).
            ctx.lineWidth = lineWidth;
            ctx.lineJoin = "round";
            ctx.strokeStyle = HIGHLIGHT_COLOR;
            ctx.beginPath();
            corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.closePath();
            ctx.stroke();
          }
        }
      }

      if (highlightNetworkId) {
        highlightFrame = requestAnimationFrame(drawHighlight);
      } else {
        highlightFrame = null;
      }
    }

    function setHighlight(networkId) {
      highlightNetworkId = networkId || null;
      if (highlightNetworkId && highlightFrame === null) {
        highlightFrame = requestAnimationFrame(drawHighlight);
      }
    }

    function bindHighlightHover($panel) {
      if (!$panel || !$panel.length) return;
      if ($panel.data("n21HighlightBound")) return;
      $panel.data("n21HighlightBound", true);

      $panel.on("mouseenter.n21turnhl", ".n21-turn-row", function () {
        const networkId = $(this).attr("data-network-id");
        setHighlight(networkId || null);
      });
      $panel.on("mouseleave.n21turnhl", ".n21-turn-row", function () {
        setHighlight(null);
      });

      // Click a row: center this user's camera on that token (local only).
      $panel.on("click.n21turnhl", ".n21-turn-row", function (event) {
        if ($(event.target).closest("input, button, select, a").length) return;
        const networkId = $(this).attr("data-network-id");
        if (!networkId || TokenManager.isLocallyHidden(networkId)) return;
        const pos = TokenManager.getTokenPosition(networkId);
        if (pos) CameraManager.centerOn(pos.x, pos.z);
      });
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
        state.timerSeconds = parsed.timerSeconds || 0;
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

    function isChatOrderReversed() {
      const container = document.querySelector(
        ChatUIManager.getChatContainerSelector(),
      );
      if (!container || !window.getComputedStyle) return false;
      return window.getComputedStyle(container).flexDirection === "column-reverse";
    }

    /**
     * Reconstruct the current turn-order state from the existing chat history by
     * replaying every "/turno" command sent by the GM in chronological order.
     * The chat list is rendered newest-first (column-reverse), so DOM order must
     * be flipped before replaying — otherwise the oldest roster would win.
     */
    function scanHistoryState() {
      const state = {
        roster: [],
        currentTurn: 0,
        active: false,
        timerSeconds: 0,
      };
      const containers = document.querySelectorAll(
        ChatUIManager.getChatContainerSelector(),
      );
      const selector = ChatUIManager.getMessageTextSelector();

      const matches = [];
      containers.forEach((container) => {
        container.querySelectorAll(selector).forEach((element) => {
          const text = element?.textContent || "";
          if (!text.includes("/turno")) return;
          if (N21_MESSAGE_REGEX.test(text)) return;
          if (!isFromGameMaster(element)) return;
          const parsed = parseTurnCommand(text);
          if (parsed) matches.push({ element, parsed });
        });
      });

      // Document order, then flip if the chat renders newest-first.
      matches.sort((a, b) => {
        if (a.element === b.element) return 0;
        const position = a.element.compareDocumentPosition(b.element);
        return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });
      if (isChatOrderReversed()) matches.reverse();

      matches.forEach((m) => reduceCommand(state, m.parsed));
      state.messageCount = matches.length;
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
      timer.seconds = loadStoredTimerSeconds();

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
            // Always send turn-order messages publicly so every player receives
            // them, even when the DM has the chat configured as private.
            ChatManager.send(message, { visibility: "public" });
          }, CHAT_DEBOUNCE_MS),
        );
      }

      function cancelChat(channel) {
        if (!chatTimers.has(channel)) return;
        clearTimeout(chatTimers.get(channel));
        chatTimers.delete(channel);
      }

      function buildRosterCommand() {
        const entries = roster.map((e) => `${shortId(e.networkId)}:${e.initiative}`);
        if (timer.seconds > 0) entries.push(`tiempo:${timer.seconds}`);
        return "/turno " + entries.join(" ");
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
            networkId: e.networkId,
          };
        });

        const $block = $panel.find(".floating-block").first();
        $block.html(buildBodyHtml(rows, currentTurn, dirty, true));

        bindDmEvents($panel);
        updateTimerDom();
      }

      // Key of "whose turn it is", to restart the timer only on real changes.
      function currentTurnKey() {
        const entry = roster[currentTurn - 1];
        return entry ? `${currentTurn}|${shortId(entry.networkId)}` : "";
      }

      /** Restart the countdown for a new turn and remember when it began. */
      function startTurnTimer() {
        restartTimer();
        saveTurnStart(currentTurnKey(), scanHistoryState().messageCount);
      }

      function setTimerSeconds(seconds) {
        const value = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
        if (value === timer.seconds) return;
        timer.seconds = value;
        storeTimerSeconds(value);
        // While a combat is running the roster is re-sent with the new value
        // (a single message); otherwise it goes out with the next "Actualizar".
        if (timer.running && !dirty) {
          queueChat("roster", buildRosterCommand());
          startTurnTimer();
        } else {
          updateTimerDom();
        }
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

      /* ---------- initiative from the chat / rolled for creatures ---------- */

      const INITIATIVE_ROLL = /iniciativa/i;
      const ROLL_WAIT_MS = 8000;
      let readingInitiatives = false;

      function normalizeName(value) {
        return toText(value)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase();
      }

      /** Row (character/creature) linked to a roster token, or null. */
      function rosterRow(entry) {
        const rowId = TokenManager.getLinkedRowId(entry.networkId);
        return rowId ? CombatTrackingManager.resolveRow(rowId) : null;
      }

      /** Wait for a new "Iniciativa" roll in the chat after `countBefore`. */
      function waitForNewRoll(countBefore) {
        return new Promise((resolve) => {
          const started = Date.now();
          (function check() {
            const rolls = ChatUIManager.getRolls(INITIATIVE_ROLL);
            if (rolls.length > countBefore) {
              resolve(rolls[rolls.length - 1]);
              return;
            }
            if (Date.now() - started > ROLL_WAIT_MS) {
              resolve(null);
              return;
            }
            setTimeout(check, 250);
          })();
        });
      }

      async function readInitiatives() {
        if (readingInitiatives || !roster.length) return;
        readingInitiatives = true;
        try {
          // Characters: their latest "Iniciativa" roll in the chat.
          const latest = new Map();
          ChatUIManager.getRolls(INITIATIVE_ROLL).forEach((roll) => {
            latest.set(normalizeName(roll.senderName), roll.total);
          });
          const creatures = [];
          roster.forEach((entry) => {
            const row = rosterRow(entry);
            if (row?.type === "creature") {
              creatures.push({ entry, row });
              return;
            }
            const names = [
              row ? CombatTrackingManager.getEntry(row.type, row.id)?.name : null,
              getTokenInfo(entry.networkId).name,
            ].map(normalizeName);
            const name = names.find((n) => n && latest.has(n));
            if (name) entry.initiative = latest.get(name);
          });
          dirty = true;
          renderDm();

          // Creatures: rolled one at a time, so each result maps to its token.
          for (const { entry, row } of creatures) {
            // Same roll as "Inic." in the combat tracking panel.
            const initiative = CombatTrackingManager.getInitiativeRoll(row.type, row.id);
            if (!initiative) continue;
            const senderInfo = CombatTrackingManager.getEntry(row.type, row.id)?.senderInfo;
            const countBefore = ChatUIManager.getRolls(INITIATIVE_ROLL).length;
            const rolled = DiceManager.roll(initiative.notation, {
              name: initiative.name,
              senderInfo,
            });
            if (!rolled) break;
            const roll = await waitForNewRoll(countBefore);
            if (!roll) break;
            entry.initiative = roll.total;
            dirty = true;
            renderDm();
          }
          sortByInitiative();
        } finally {
          readingInitiatives = false;
        }
      }

      function sortByInitiative() {
        roster.sort((a, b) => b.initiative - a.initiative);
        dirty = true;
        renderDm();
      }

      function sendRoster() {
        if (!roster.length) return;
        const previousKey = timer.running ? currentTurnKey() : null;
        // Each channel debounces independently, so a pending turn change is
        // still sent (in the order it was made) instead of being dropped here.
        queueChat("roster", buildRosterCommand());
        if (currentTurn < 1) currentTurn = 1;
        dirty = false;
        renderDm();
        if (currentTurnKey() !== previousKey) startTurnTimer();
        setTimerRunning(true);
      }

      function goToTurn(turn) {
        if (!roster.length) return;
        const next = clampTurn(turn, roster.length);
        currentTurn = next;
        queueChat("turn", `/turno ${next}`);
        renderDm();
        startTurnTimer();
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
        setTimerRunning(false);
        closePanel();
      }

      /**
       * Turn changes reach players through the chat: ask first and only
       * apply the change if it will be sent.
       */
      async function withChatConsent(action) {
        const send = await window._n21_.chatConsent?.confirm("turn-order", {
          title: "¿Enviar el orden de turnos al chat?",
          description: "El orden de turnos se sincroniza con los jugadores mediante mensajes en el chat.",
          required: true,
        });
        if (send === false) return false;
        action();
        return true;
      }

      function bindDmEvents($panel) {
        $panel.off(".n21turn");

        $panel.on("click.n21turn", ".n21-turn-sort", () => sortByInitiative());
        $panel.on("click.n21turn", ".n21-turn-read-init", () => readInitiatives());
        $panel.on("click.n21turn", ".n21-turn-end", () => withChatConsent(() => finalize()));
        $panel.on("click.n21turn", ".n21-turn-update", () => withChatConsent(() => sendRoster()));
        $panel.on("click.n21turn", ".n21-turn-prev", () => withChatConsent(() => stepTurn(-1)));
        $panel.on("click.n21turn", ".n21-turn-next", () => withChatConsent(() => stepTurn(1)));

        $panel.on("click.n21turn", ".n21-turn-remove", function (event) {
          event.stopPropagation();
          const index = Number($(this).closest(".n21-turn-row").data("index"));
          if (!Number.isFinite(index) || !roster[index]) return;
          removeTokens([roster[index].networkId]);
        });

        $panel.on("change.n21turn", ".n21-turn-timer-input", async function () {
          const value = parseInt(this.value, 10);
          // Only a running combat broadcasts the change right away.
          if (!timer.running || dirty) {
            setTimerSeconds(value);
            return;
          }
          const applied = await withChatConsent(() => setTimerSeconds(value));
          if (!applied) this.value = timer.seconds;
        });

        // Clicking the countdown restarts the current turn's timer for everyone
        // (re-sending the current turn).
        $panel.on(
          "click.n21turn keydown.n21turn",
          ".n21-turn-timer-value--action",
          (event) => {
            if (event.type === "keydown" && !["Enter", " "].includes(event.key)) {
              return;
            }
            if (!timer.running || !timer.seconds) return;
            withChatConsent(() => goToTurn(currentTurn));
          },
        );

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
        if (state.timerSeconds) {
          timer.seconds = state.timerSeconds;
          storeTimerSeconds(state.timerSeconds);
        }
        if (!timer.running) {
          timer.running = true;
          const savedStart = loadTurnStart(currentTurnKey(), state.messageCount);
          if (savedStart) {
            timer.startedAt = savedStart;
            syncTimerInterval();
          } else {
            startTurnTimer();
          }
        }
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
      // Messages already seen, so re-scans of the history don't restart the
      // timer; only a new turn/timer message does.
      const seenMessages = new WeakSet();
      let restartTimerPending = false;
      const LIVE_TURN_WINDOW_MS = 5000;
      let lastLiveTurnMessageAt = 0;

      // Recompute the whole state from chat history (order-corrected). This is
      // idempotent, so it's safe no matter how many times the chat history is
      // re-scanned (e.g. when other features call processExistingMessages).
      function rebuildFromHistory() {
        const previousKey = currentTurn >= 1
          ? `${currentTurn}|${roster[currentTurn - 1]?.shortId || ""}`
          : "";
        const state = scanHistoryState();
        roster = state.roster;
        currentTurn = state.currentTurn;
        active = state.active;

        const nextKey = currentTurn >= 1
          ? `${currentTurn}|${roster[currentTurn - 1]?.shortId || ""}`
          : "";
        const timerChanged = timer.seconds !== state.timerSeconds;
        timer.seconds = state.timerSeconds;
        timer.running = active;
        if (restartTimerPending || timerChanged || nextKey !== previousKey) {
          if (Date.now() - lastLiveTurnMessageAt < LIVE_TURN_WINDOW_MS) {
            // A turn change that just arrived: the countdown starts now.
            timer.startedAt = Date.now();
            saveTurnStart(nextKey, state.messageCount);
          } else {
            // Replaying the history (page load): resume this turn if known.
            timer.startedAt = loadTurnStart(nextKey, state.messageCount) || Date.now();
          }
        }
        restartTimerPending = false;
        syncTimerInterval();
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
            networkId,
          };
        });

        const $panel = ensurePanel();
        if (!$panel || !$panel.length) return;
        const $block = $panel.find(".floating-block").first();
        $block.html(buildBodyHtml(rows, currentTurn, false, false));
        updateTimerDom();

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

        // A new turn message (even the same turn re-sent) restarts the countdown.
        if (!seenMessages.has(element)) {
          seenMessages.add(element);
          const parsed = parseTurnCommand(text);
          if (parsed?.type === "turn") {
            restartTimerPending = true;
          }
        }

        // A relevant message appeared in this batch; recompute on onComplete.
        needsRender = true;
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

      // Live /turno messages (not the history replayed on load).
      ChatManager.onMessage((message) => {
        if (/^\s*\/turno\b/.test(toText(message?.message))) lastLiveTurnMessageAt = Date.now();
      });

      ChatUIManager.onMessage(
        "turn-order-player",
        (element) => processMessageElement(element),
        {
          priority: 110,
          onComplete: () => {
            if (PlayerManager.isGameMaster()) return;
            if (!needsRender) return;
            needsRender = false;
            rebuildFromHistory();
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
