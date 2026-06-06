(async () => {
  try {
    /* =======================
       Feature: Token Assign Player

       El DM puede asignar un token a un jugador conectado mediante el menú
       contextual (click derecho). La asignación se guarda como un tag corto en
       la descripción del token: [user:nombreJugador].

       Cada jugador que NO sea DM escucha los cambios de los tokens y quita el
       tag "selectable" de todos los tokens asignados a OTRO jugador. Los tokens
       sin jugador asignado se ignoran. La recuperación del "selectable" cuando
       cambia la asignación la maneja Nivel20 automáticamente.
    ======================= */

    const { loadManagers } = window._n21_;

    const [
      TokenManager,
      CanvasDropdownManager,
      EditTokenUIManager,
      PlayerManager,
      SettingsManager,
    ] = await loadManagers(
      "TokenManager",
      "CanvasDropdownManager",
      "EditTokenUIManager",
      "PlayerManager",
      "SettingsManager",
    );

    if (!SettingsManager.get("feature.token-assign-player.enabled")) {
      return;
    }

    const ASSIGN_TAG = "user";

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

    /**
     * Read the assigned player name from a token's description tag.
     * @param {string} networkId
     * @returns {string|null} The assigned user name or null if none
     */
    function getAssignedUserName(networkId) {
      const schema = TokenManager.getTokenSchema(networkId);
      if (!schema) return null;

      const metadataString = typeof schema.metadata === "string" ? schema.metadata : "{}";
      const metadata = safeJsonParse(metadataString) || {};
      const description = toText(metadata.description);

      return window._n21_.utils.parseTokenTag(description, ASSIGN_TAG);
    }

    /**
     * Get the list of connected players that a token can be assigned to.
     * Excludes Game Masters.
     * @returns {Array} Array of player objects
     */
    function getAssignablePlayers() {
      const players = PlayerManager.getPlayerList() || [];
      return players.filter(
        (player) =>
          player &&
          player.connected &&
          player.userName &&
          !PlayerManager.isUserGameMaster(player.userId),
      );
    }

    /* ======================= DM side: assignment menu ======================= */

    CanvasDropdownManager.registerOption({
      id: "n21-assign-player",
      label: "Asignar a jugador",
      showOn: ["token"],
      order: 60,
      gameMasterOnly: true,
      isVisible: (context) => {
        if (!PlayerManager.isGameMaster()) return false;
        if (!context?.tokenNetworkId) return false;
        return true;
      },
      submenu: (context) => {
        const networkId = toText(context?.tokenNetworkId);
        if (!networkId) return [];

        const assigned = getAssignedUserName(networkId);
        const players = getAssignablePlayers();

        const items = players.map((player) => ({
          id: `n21-assign-player-${player.userId}`,
          label: assigned === player.userName ? `✓ ${player.userName}` : player.userName,
          onClick: () => {
            EditTokenUIManager.setTokenUserMarker(networkId, player.userName);
          },
        }));

        if (assigned) {
          items.push({
            id: "n21-assign-player-clear",
            label: "Quitar asignación",
            onClick: () => {
              EditTokenUIManager.clearTokenUserMarkers(networkId);
            },
          });
        }

        if (!items.length) {
          items.push({
            id: "n21-assign-player-empty",
            label: "Sin jugadores conectados",
            onClick: () => {},
          });
        }

        return items;
      },
    });

    /* ======================= Player side: selectable sync ======================= */

    // Tokens whose "selectable" tag WE removed, so we can restore it when the
    // assignment changes back to us (or is cleared). We only ever restore what
    // we removed ourselves, never granting access to tokens we never touched.
    const removedByUs = new Set();

    /**
     * For non-DM players: keep the "selectable" tag in sync with the token's
     * player assignment.
     *  - Assigned to another player -> remove "selectable" (and remember it).
     *  - Assigned to me / unassigned -> restore "selectable" if we removed it.
     *
     * This is idempotent and self-healing: the metadata update and Nivel20's
     * automatic tag reset arrive as separate events in no guaranteed order, so
     * re-running this on either event eventually converges to the correct state.
     * @param {string} networkId
     */
    function syncSelectableForToken(networkId) {
      if (!networkId) return;
      // The DM keeps full control over every token.
      if (PlayerManager.isGameMaster()) return;

      const token = TokenManager.getToken(networkId);
      const tags = token?.tags;
      if (!tags) return;

      const assigned = getAssignedUserName(networkId);
      const myName = PlayerManager.getMyUserName();
      const belongsToOther = assigned && (!myName || assigned !== myName);

      if (belongsToOther) {
        // Guard against re-entrancy: only remove (and thus re-fire the tags
        // listener) when "selectable" is actually present.
        if (tags.has?.("selectable")) {
          tags.remove("selectable");
          removedByUs.add(networkId);
        }
        return;
      }

      // Assigned to me or unassigned: restore "selectable" only if we are the
      // ones who removed it earlier.
      if (removedByUs.has(networkId)) {
        if (!tags.has?.("selectable")) {
          tags.add?.("selectable");
        }
        removedByUs.delete(networkId);
      }
    }

    // React to token metadata changes (covers existing tokens on load and any
    // future assignment changes). Only non-DM players act on this.
    TokenManager.onTokenMetadataChange((networkId) => {
      syncSelectableForToken(networkId);
    });

    // React to tag changes too: when a token's state changes (e.g. toggling
    // visibility) Nivel20 resets its tags and re-adds "selectable". Re-running
    // the sync re-applies the correct state.
    TokenManager.onTokenTagsChange((networkId) => {
      syncSelectableForToken(networkId);
    });
  } catch (error) {
    window._n21_.utils.registerFeatureError("Token Assign Player", error);
  }
})();
