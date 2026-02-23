(async () => {
  try {
    /* =======================
       Feature: Show Hidden Token
    ======================= */

    const { loadManagers } = window._n21_;

    const [CanvasDropdownManager, EditTokenUIManager, PlayerManager, SettingsManager, TokenManager] =
      await loadManagers(
        "CanvasDropdownManager",
        "EditTokenUIManager",
        "PlayerManager",
        "SettingsManager",
        "TokenManager",
      );

    if (!SettingsManager.get("feature.show-hidden-token.enabled")) {
      return;
    }

    const isCurrentUserGameMaster = PlayerManager.isGameMaster();

    const USER_MARKER_REGEX = /\[user:\s*"([^"]+)"\s*\]/i;

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

    function getUserNameFromDescription(description) {
      const text = toText(description);
      if (!text) return null;

      const match = USER_MARKER_REGEX.exec(text);
      if (!match || !match[1]) return null;

      return toText(match[1]);
    }

    function setTokenMasterFlag(networkId, enabled) {
      const token = TokenManager.getToken(networkId);
      const visibilityScript = token?.findScript?.("ri");

      if (!visibilityScript) {
        return false;
      }

      visibilityScript.isGameMaster = !!enabled;

      if (typeof visibilityScript.recompute === "function") {
        visibilityScript.recompute();
      }

      return true;
    }

    function getCurrentUserName() {
      const myUserId = PlayerManager.getMyUserId();
      const players = PlayerManager.getPlayerList() || [];

      const me = players.find((player) => {
        return String(player?.userId || "") === String(myUserId || "");
      });

      if (me?.userName) {
        return String(me.userName).trim();
      }

      return toText(window.getUserName?.());
    }

    function updateTokenAccessFromMetadata(networkId, metadataString) {
      const parsedMetadata = safeJsonParse(metadataString) || {};
      const description = toText(parsedMetadata.description);
      const currentUserName = getCurrentUserName();
      const userInDescription = getUserNameFromDescription(description);
      const shouldEnableGameMaster =
        currentUserName && userInDescription && 
        userInDescription.toLowerCase() === currentUserName.toLowerCase();

      if (shouldEnableGameMaster) {
        setTokenMasterFlag(networkId, true);
      } else {
        setTokenMasterFlag(networkId, false);
      }
    }

    function getActivePlayersList() {
      const players = PlayerManager.getPlayerList() || [];

      return players
        .filter((player) => {
          if (!player?.connected) return false;
          if (!player?.userId || !player?.userName) return false;
          return !PlayerManager.isUserGameMaster(player.userId);
        })
        .map((player) => ({
          userId: String(player.userId),
          userName: String(player.userName),
        }));
    }

    function getAssignedUserNameForToken(networkId) {
      const schema = TokenManager.getTokenSchema(networkId);
      if (!schema) return null;

      const metadataString = typeof schema.metadata === "string" ? schema.metadata : "{}";
      const parsedMetadata = safeJsonParse(metadataString) || {};
      const description = toText(parsedMetadata.description);

      return getUserNameFromDescription(description);
    }

    // Only setup metadata listeners for non-GM players
    if (!isCurrentUserGameMaster) {
      TokenManager.onTokenMetadataChange((networkId, metadataString) => {
        updateTokenAccessFromMetadata(networkId, metadataString);
      });
    }

    const activePlayers = getActivePlayersList();

    CanvasDropdownManager.registerOption({
      id: "n21-show-hidden-token-assign",
      label: "Asignar a",
      showOn: ["token"],
      order: 55,
      gameMasterOnly: true,
      isVisible: (context) => {
        if (!PlayerManager.isGameMaster()) return false;
        if (!context?.tokenNetworkId) return false;
        return true;
      },
      submenu: [
        {
          id: "n21-assign-to-nobody",
          label: "Nadie",
          onClick: async (context) => {
            if (!PlayerManager.isGameMaster()) return;

            const networkId = toText(context?.tokenNetworkId);
            if (!networkId) return;

            await EditTokenUIManager.clearTokenUserMarkers(networkId);
          },
        },
        ...activePlayers.map((player) => ({
          id: `n21-assign-to-${player.userId}`,
          label: player.userName,
          onClick: async (context) => {
            if (!PlayerManager.isGameMaster()) return;

            const networkId = toText(context?.tokenNetworkId);
            if (!networkId) return;

            // Get current assigned user
            const assignedUser = getAssignedUserNameForToken(networkId);
            const isAlreadyAssignedToThisUser =
              assignedUser && assignedUser.toLowerCase() === player.userName.toLowerCase();

            // Only assign if not already assigned to this user
            if (!isAlreadyAssignedToThisUser) {
              await EditTokenUIManager.openTokenEditForm(networkId, player.userName);
            }
          },
        })),
      ],
    });
  } catch (error) {
    console.warn("N21: Error en feature Show Hidden Token:", error.message);
  }
})();
