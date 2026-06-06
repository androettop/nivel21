(async () => {
  try {
    /* =======================
       Feature: Token Assign Character

       El DM puede asignar un token a un personaje del panel de personajes
       mediante el menú contextual (click derecho). La asignación se guarda como
       un tag corto en la descripción del token: [char:rowId], donde rowId es el
       data-row-id del personaje en el panel.

       Cuando cualquier usuario hace click (izquierdo) sobre un token con un
       personaje asignado, se selecciona automáticamente ese personaje en el
       panel (equivalente a hacer click en su fila). Si la fila no existe, no
       sucede nada.
    ======================= */

    const { loadManagers } = window._n21_;

    const [
      TokenManager,
      CanvasDropdownManager,
      EditTokenUIManager,
      PlayerManager,
      CameraManager,
      CharacterManager,
      SettingsManager,
    ] = await loadManagers(
      "TokenManager",
      "CanvasDropdownManager",
      "EditTokenUIManager",
      "PlayerManager",
      "CameraManager",
      "CharacterManager",
      "SettingsManager",
    );

    if (!SettingsManager.get("feature.token-assign-character.enabled")) {
      return;
    }

    const ASSIGN_TAG = "char";

    // Click qualification thresholds (mirror CanvasDropdownManager so a drag
    // doesn't count as a click).
    const CLICK_MAX_MOVE_PX = 4;

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
     * Read the assigned character row id from a token's description tag.
     * @param {string} networkId
     * @returns {string|null}
     */
    function getAssignedCharacterId(networkId) {
      const schema = TokenManager.getTokenSchema(networkId);
      if (!schema) return null;

      const metadataString = typeof schema.metadata === "string" ? schema.metadata : "{}";
      const metadata = safeJsonParse(metadataString) || {};
      const description = toText(metadata.description);

      return window._n21_.utils.parseTokenTag(description, ASSIGN_TAG);
    }

    /**
     * Resolve a token networkId from a raycasted entity.
     * @param {Object} entity
     * @returns {string|null}
     */
    function getTokenNetworkId(entity) {
      if (!entity) return null;

      const direct = entity?.script?.networkId;
      if (typeof direct === "string") return direct;

      const nested = entity?.script?.networkId?.networkId;
      return typeof nested === "string" ? nested : null;
    }

    /* ======================= DM side: assignment menu ======================= */

    CanvasDropdownManager.registerOption({
      id: "n21-assign-character",
      label: "Asignar a personaje",
      showOn: ["token"],
      order: 61,
      gameMasterOnly: true,
      isVisible: (context) => {
        if (!PlayerManager.isGameMaster()) return false;
        if (!context?.tokenNetworkId) return false;
        return true;
      },
      submenu: (context) => {
        const networkId = toText(context?.tokenNetworkId);
        if (!networkId) return [];

        const assigned = getAssignedCharacterId(networkId);
        const characters = CharacterManager.getCharacterList();

        const items = characters.map((character) => ({
          id: `n21-assign-character-${character.id}`,
          label: assigned === character.id ? `✓ ${character.name}` : character.name,
          onClick: () => {
            EditTokenUIManager.setTokenTag(networkId, ASSIGN_TAG, character.id);
          },
        }));

        if (assigned) {
          items.push({
            id: "n21-assign-character-clear",
            label: "Quitar asignación",
            onClick: () => {
              EditTokenUIManager.removeTokenTag(networkId, ASSIGN_TAG);
            },
          });
        }

        if (!items.length) {
          items.push({
            id: "n21-assign-character-empty",
            label: "Sin personajes",
            onClick: () => {},
          });
        }

        return items;
      },
    });

    /* ======================= Click side: select character ======================= */

    let clickStart = null;

    $(document).on("mousedown.n21AssignCharacter", "canvas", (event) => {
      if (event.button !== 0) {
        clickStart = null;
        return;
      }
      clickStart = { x: event.clientX, y: event.clientY };
    });

    $(document).on("mouseup.n21AssignCharacter", "canvas", (event) => {
      if (event.button !== 0 || !clickStart) {
        clickStart = null;
        return;
      }

      const distance = Math.hypot(
        event.clientX - clickStart.x,
        event.clientY - clickStart.y,
      );
      clickStart = null;
      if (distance > CLICK_MAX_MOVE_PX) return;

      const canvas = event.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const raycast = CameraManager.rayCast(
        event.clientX - rect.left,
        event.clientY - rect.top,
      );

      const entity = raycast?.entity?.name === "Token" ? raycast.entity : null;
      if (!entity) return;

      const networkId = getTokenNetworkId(entity);
      if (!networkId) return;

      const characterId = getAssignedCharacterId(networkId);
      if (!characterId) return;

      CharacterManager.selectCharacter(characterId);
    });
  } catch (error) {
    window._n21_.utils.registerFeatureError("Token Assign Character", error);
  }
})();
