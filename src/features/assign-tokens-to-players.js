(async () => {
  try {
    /* =======================
       Feature: Assign Tokens to Players
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

    if (!SettingsManager.get("feature.assign-tokens-to-players.enabled")) {
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

    const CHECK_MARK = " ✓";

    function buildSubmenu(context) {
      const activePlayers = getActivePlayersList();
      const networkId = toText(context?.tokenNetworkId);
      const currentAssignedUser = networkId ? getAssignedUserNameForToken(networkId) : null;

      // Build player list: active players + assigned user (if not in active list)
      const playersMap = new Map();

      // Add active players
      activePlayers.forEach((player) => {
        playersMap.set(player.userName.toLowerCase(), player);
      });

      // Add assigned user if not already in the list
      if (currentAssignedUser) {
        const lowerName = currentAssignedUser.toLowerCase();
        if (!playersMap.has(lowerName)) {
          playersMap.set(lowerName, {
            userId: `disconnected-${currentAssignedUser}`,
            userName: currentAssignedUser,
            isDisconnected: true,
          });
        }
      }

      const playersToShow = Array.from(playersMap.values());

      return [
        {
          id: "n21-assign-to-nobody",
          label: `Nadie${currentAssignedUser === null ? CHECK_MARK : ""}`,
          onClick: async (context) => {
            if (!PlayerManager.isGameMaster()) return;

            const networkId = toText(context?.tokenNetworkId);
            if (!networkId) return;

            await EditTokenUIManager.clearTokenUserMarkers(networkId);
          },
        },
        ...playersToShow.map((player) => ({
          id: `n21-assign-to-${player.userId}`,
          label: `${player.userName}${
            currentAssignedUser &&
            currentAssignedUser.toLowerCase() === player.userName.toLowerCase()
              ? CHECK_MARK
              : ""
          }`,
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
      ];
    }

    // Register option with dynamic submenu
    CanvasDropdownManager.registerOption({
      id: "n21-assign-tokens-to-players",
      label: "Asignar a",
      showOn: ["token"],
      order: 55,
      gameMasterOnly: true,
      isVisible: (context) => {
        if (!PlayerManager.isGameMaster()) return false;
        if (!context?.tokenNetworkId) return false;
        return true;
      },
      submenu: buildSubmenu,
    });
  } catch (error) {
    console.warn("N21: Error en feature Assign Tokens to Players:", error.message);
  }
})();
