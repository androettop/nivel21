(async () => {
  try {
    /* =======================
       Feature: Token Show/Hide Only
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

    if (!SettingsManager.get("feature.token-show-hide-only.enabled")) {
      return;
    }

    const CHECK_MARK = " ✓";

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

    function getAccessTagsFromDescription(description) {
      const showOnly = window._n21_.utils.parseTokenTag(description, "s");
      const hideOnly = window._n21_.utils.parseTokenTag(description, "h");

      if (showOnly && hideOnly) {
        return {
          showOnly: null,
          hideOnly: null,
          hasConflict: true,
        };
      }

      return {
        showOnly,
        hideOnly,
        hasConflict: false,
      };
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

    function getTokenAccessFromSchema(networkId) {
      const schema = TokenManager.getTokenSchema(networkId);
      if (!schema) {
        return {
          showOnly: null,
          hideOnly: null,
          hasConflict: false,
        };
      }

      const metadataString = typeof schema.metadata === "string" ? schema.metadata : "{}";
      const parsedMetadata = safeJsonParse(metadataString) || {};
      const description = toText(parsedMetadata.description);

      return getAccessTagsFromDescription(description);
    }

    function logReadTags(networkId, metadataString) {
      const parsedMetadata = safeJsonParse(metadataString) || {};
      const description = toText(parsedMetadata.description);
      const { showOnly, hideOnly, hasConflict } = getAccessTagsFromDescription(description);

      if (hasConflict) {
        console.log(`[Token Show/Hide] ${networkId} tiene [s] y [h], se ignoran ambos.`);
        return;
      }

      if (showOnly) {
        console.log(`[Token Show/Hide] ${networkId} [s:${showOnly}]`);
        return;
      }

      if (hideOnly) {
        console.log(`[Token Show/Hide] ${networkId} [h:${hideOnly}]`);
      }
    }

    function applyTokenVisibility(networkId, metadataString) {
      if (PlayerManager.isGameMaster()) {
        return;
      }

      const token = TokenManager.getToken(networkId);
      if (!token) {
        return;
      }

      const parsedMetadata = safeJsonParse(metadataString) || {};
      const description = toText(parsedMetadata.description);
      const { showOnly, hideOnly, hasConflict } = getAccessTagsFromDescription(description);

      if (hasConflict) {
        return;
      }

      const currentUserName = getCurrentUserName();
      if (!currentUserName) {
        return;
      }

      if (showOnly) {
        const isCurrentUserTarget = showOnly.toLowerCase() === currentUserName.toLowerCase();
        const canSeeThrough = isCurrentUserTarget;
        token.fire("hidden", true, canSeeThrough);
        return;
      }

      if (hideOnly) {
        const isCurrentUserTarget = hideOnly.toLowerCase() === currentUserName.toLowerCase();
        if (isCurrentUserTarget) {
          token.fire("hidden", true, false);
        }
      }
    }

    TokenManager.onTokenMetadataChange((networkId, metadataString) => {
      logReadTags(networkId, metadataString);
      applyTokenVisibility(networkId, metadataString);
    });

    function buildPlayersForSubmenu(currentAssignedUser) {
      const activePlayers = getActivePlayersList();
      const playersMap = new Map();

      activePlayers.forEach((player) => {
        playersMap.set(player.userName.toLowerCase(), player);
      });

      if (currentAssignedUser) {
        const lowerName = currentAssignedUser.toLowerCase();
        if (!playersMap.has(lowerName)) {
          playersMap.set(lowerName, {
            userId: `disconnected-${currentAssignedUser}`,
            userName: currentAssignedUser,
          });
        }
      }

      return Array.from(playersMap.values());
    }

    function buildSubmenu(mode, context) {
      const networkId = toText(context?.tokenNetworkId);
      const access = networkId
        ? getTokenAccessFromSchema(networkId)
        : { showOnly: null, hideOnly: null, hasConflict: false };

      const currentAssignedUser = mode === "show" ? access.showOnly : access.hideOnly;
      const playersToShow = buildPlayersForSubmenu(currentAssignedUser);
      const targetKey = mode === "show" ? "s" : "h";

      return [
        {
          id: `n21-${mode}-only-to-nobody`,
          label: `Nadie${currentAssignedUser === null ? CHECK_MARK : ""}`,
          onClick: async (submenuContext) => {
            if (!PlayerManager.isGameMaster()) return;

            const targetNetworkId = toText(submenuContext?.tokenNetworkId);
            if (!targetNetworkId) return;

            await EditTokenUIManager.updateTokenTags(targetNetworkId, ["s", "h"]);
          },
        },
        ...playersToShow.map((player) => ({
          id: `n21-${mode}-only-to-${player.userId}`,
          label: `${player.userName}${
            currentAssignedUser &&
            currentAssignedUser.toLowerCase() === player.userName.toLowerCase()
              ? CHECK_MARK
              : ""
          }`,
          onClick: async (submenuContext) => {
            if (!PlayerManager.isGameMaster()) return;

            const targetNetworkId = toText(submenuContext?.tokenNetworkId);
            if (!targetNetworkId) return;

            await EditTokenUIManager.updateTokenTags(
              targetNetworkId,
              ["s", "h"],
              targetKey,
              player.userName,
            );
          },
        })),
      ];
    }

    CanvasDropdownManager.registerOption({
      id: "n21-show-only-to",
      label: "Mostrar solo a",
      showOn: ["token"],
      order: 54,
      gameMasterOnly: true,
      isVisible: (context) => {
        if (!PlayerManager.isGameMaster()) return false;
        if (!context?.tokenNetworkId) return false;
        return true;
      },
      submenu: (context) => buildSubmenu("show", context),
    });

    CanvasDropdownManager.registerOption({
      id: "n21-hide-only-to",
      label: "Ocultar solo a",
      showOn: ["token"],
      order: 55,
      gameMasterOnly: true,
      isVisible: (context) => {
        if (!PlayerManager.isGameMaster()) return false;
        if (!context?.tokenNetworkId) return false;
        return true;
      },
      submenu: (context) => buildSubmenu("hide", context),
    });
  } catch (error) {
    window._n21_.utils.registerFeatureError("Token Show/Hide Only", error);
  }
})();
