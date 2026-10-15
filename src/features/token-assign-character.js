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
      CombatTrackingManager,
    ] = await loadManagers(
      "TokenManager",
      "CanvasDropdownManager",
      "EditTokenUIManager",
      "PlayerManager",
      "CameraManager",
      "CharacterManager",
      "SettingsManager",
      "CombatTrackingManager",
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
     * Character row a token is linked to ([char:id] tag or Nivel20's own link).
     * @param {string} networkId
     * @returns {string|null}
     */
    function getAssignedCharacterId(networkId) {
      return TokenManager.getLinkedRowId(networkId);
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
      singleSelectionOnly: true,
      isVisible: (context) => {
        if (!PlayerManager.isGameMaster()) return false;
        if (!context?.tokenNetworkId) return false;
        return true;
      },
      submenu: (context) => {
        const networkId = toText(context?.tokenNetworkId);
        if (!networkId) return [];

        const assigned = TokenManager.getLinkedRow(networkId);
        const characters = CharacterManager.getCharacterList();

        // A token is one creature: groups ("3 x Goblin") list each of them.
        const items = [];
        characters.forEach((character) => {
          const count =
            character.type === "creature"
              ? CombatTrackingManager.getInstanceCount("creature", character.id)
              : 1;
          if (count <= 1) {
            const isAssigned = assigned?.rowId === character.id;
            items.push({
              id: `n21-assign-character-${character.id}`,
              label: isAssigned ? `✓ ${character.name}` : character.name,
              onClick: () => EditTokenUIManager.setTokenTag(networkId, ASSIGN_TAG, character.id),
            });
            return;
          }
          const baseName = character.name.replace(/^\s*\d+\s*x\s*/i, "");
          for (let n = 1; n <= count; n += 1) {
            const isAssigned = assigned?.rowId === character.id && assigned.index === n - 1;
            const label = `${baseName} ${n}`;
            items.push({
              id: `n21-assign-character-${character.id}-${n}`,
              label: isAssigned ? `✓ ${label}` : label,
              onClick: () =>
                EditTokenUIManager.setTokenTag(networkId, ASSIGN_TAG, `${character.id}#${n}`),
            });
          }
        });

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
