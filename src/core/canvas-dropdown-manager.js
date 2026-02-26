(() => {
  /* =======================
       CanvasDropdownManager - Context dropdown for canvas right-click
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  const RIGHT_CLICK_MAX_DURATION_MS = 250;
  const RIGHT_CLICK_MAX_MOVE_PX = 4;
  const LONG_PRESS_DURATION_MS = 500;
  const LONG_PRESS_MAX_MOVE_PX = 10;
  const TOUCH_CONTEXTMENU_SUPPRESS_MS = 1200;

  class CanvasDropdownManager extends BaseManager {
    constructor() {
      super();
      this._ready = false;
      this._options = new Map();
      this._$menu = null;
      this._cameraManager = null;
      this._playerManager = null;
      this._rightClickState = null;
      this._rightClickStateTimeout = null;
      this._touchLongPressState = null;
      this._touchLongPressTimer = null;
      this._touchMenuOpenedAt = 0;
    }

    async init() {
      if (this._ready) return;

      try {
        const { loadManagers } = window._n21_;
        const [CameraManager, PlayerManager] = await loadManagers("CameraManager", "PlayerManager");

        this._cameraManager = CameraManager;
        this._playerManager = PlayerManager;
        this._createMenu();
        this._bindEvents();

        this._ready = true;
      } catch (error) {
        console.warn("[CanvasDropdownManager] Failed to initialize:", error.message);
      }
    }

    isReady() {
      return this._ready;
    }

    registerOption(option) {
      const hasSubmenu = (Array.isArray(option.submenu) && option.submenu.length > 0) || 
                         typeof option.submenu === "function";

      if (!option || !option.id) {
        console.warn("[CanvasDropdownManager] Invalid option registration");
        return () => {};
      }

      if (!hasSubmenu && typeof option.onClick !== "function") {
        console.warn("[CanvasDropdownManager] Option without submenu must have onClick");
        return () => {};
      }

      const normalized = {
        id: option.id,
        label: String(option.label || option.id),
        order: Number.isFinite(option.order) ? option.order : 100,
        showOn: this._normalizeShowOn(option.showOn || option.contexts || "always"),
        onClick: option.onClick,
        isVisible: typeof option.isVisible === "function" ? option.isVisible : null,
        gameMasterOnly: !!option.gameMasterOnly,
        submenu: typeof option.submenu === "function" ? option.submenu : (
          Array.isArray(option.submenu) ? option.submenu.map((sub) => ({
            id: sub.id,
            label: String(sub.label || sub.id),
            onClick: sub.onClick,
          })) : null
        ),
      };

      this._options.set(normalized.id, normalized);

      return () => {
        this.unregisterOption(normalized.id);
      };
    }

    unregisterOption(optionId) {
      this._options.delete(optionId);
    }

    _normalizeShowOn(showOn) {
      const values = Array.isArray(showOn) ? showOn : [showOn];
      const allowed = new Set(["always", "token", "map"]);

      const normalized = values
        .map((value) => String(value || "").toLowerCase())
        .filter((value) => allowed.has(value));

      return normalized.length ? normalized : ["always"];
    }

    _createMenu() {
      if (this._$menu) return;

      const $existing = $("#n21-canvas-dropdown-menu");
      if ($existing.length) {
        this._$menu = $existing;
        return;
      }

      this._$menu = $(
        "<div id='n21-canvas-dropdown-menu' class='n21-canvas-dropdown-menu' role='menu' aria-hidden='true'></div>",
      );

      $(document.body).append(this._$menu);
    }

    _bindEvents() {
      $(document).on("mousedown.n21CanvasDropdown", "canvas", (event) => {
        if (event.button !== 2) {
          this._clearRightClickState();
          return;
        }

        this._setRightClickState(event);
      });

      $(document).on("mousemove.n21CanvasDropdown", (event) => {
        this._updateRightClickMovement(event);
      });

      $(document).on("contextmenu.n21CanvasDropdown", "canvas", (event) => {
        const rightClickQualified = this._rightClickState && this._isQualifiedRightClick(event);
        const touchMenuRecentlyOpened = Date.now() - this._touchMenuOpenedAt < TOUCH_CONTEXTMENU_SUPPRESS_MS;

        if (rightClickQualified || touchMenuRecentlyOpened) {
          event.preventDefault();
        }
      });

      $(document).on("mouseup.n21CanvasDropdown", "canvas", (event) => {
        if (event.button !== 2) {
          return;
        }

        if (!this._isQualifiedRightClick(event)) {
          this._clearRightClickState();
          return;
        }

        const opened = this._openMenuAt(event.currentTarget, event.clientX, event.clientY);
        if (opened) {
          event.preventDefault();
        }

        this._clearRightClickState();
      });

      $(document).on("mouseup.n21CanvasDropdown", (event) => {
        if (event.button === 2) {
          this._clearRightClickState();
        }
      });

      $(document).on("touchstart.n21CanvasDropdown", "canvas", (event) => {
        const touch = event.originalEvent?.touches?.[0];
        if (!touch || event.originalEvent?.touches?.length !== 1) {
          this._clearTouchLongPressState();
          return;
        }

        this._setTouchLongPressState(event.currentTarget, touch);
      });

      $(document).on("touchmove.n21CanvasDropdown", (event) => {
        this._updateTouchLongPressMovement(event);
      });

      $(document).on("touchend.n21CanvasDropdown touchcancel.n21CanvasDropdown", () => {
        this._clearTouchLongPressState();
      });

      $(document).on("mousedown.n21CanvasDropdown", (event) => {
        if (!this._$menu?.length || !this._$menu.is(":visible")) return;

        if (this._$menu[0].contains(event.target)) return;

        this.hide();
      });

      $(document).on("touchstart.n21CanvasDropdown", (event) => {
        if (!this._$menu?.length || !this._$menu.is(":visible")) return;

        if (this._$menu[0].contains(event.target)) return;

        this.hide();
      });

      $(document).on("keydown.n21CanvasDropdown", (event) => {
        if (event.key === "Escape") {
          this.hide();
        }
      });

      $(window).on("blur.n21CanvasDropdown resize.n21CanvasDropdown", () => {
        this.hide();
        this._clearRightClickState();
        this._clearTouchLongPressState();
      });
    }

    _setRightClickState(event) {
      this._clearRightClickState();

      this._rightClickState = {
        startedAt: Date.now(),
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };

      this._rightClickStateTimeout = setTimeout(() => {
        this._clearRightClickState();
      }, RIGHT_CLICK_MAX_DURATION_MS + 1000);
    }

    _updateRightClickMovement(event) {
      if (!this._rightClickState) return;

      const deltaX = event.clientX - this._rightClickState.startX;
      const deltaY = event.clientY - this._rightClickState.startY;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance > RIGHT_CLICK_MAX_MOVE_PX) {
        this._rightClickState.moved = true;
      }
    }

    _isQualifiedRightClick(event) {
      const state = this._rightClickState;
      if (!state) return false;

      const durationMs = Date.now() - state.startedAt;
      if (durationMs > RIGHT_CLICK_MAX_DURATION_MS) return false;
      if (state.moved) return false;

      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      const distance = Math.hypot(deltaX, deltaY);

      return distance <= RIGHT_CLICK_MAX_MOVE_PX;
    }

    _setTouchLongPressState(canvas, touch) {
      this._clearTouchLongPressState();

      this._touchLongPressState = {
        canvas,
        touchId: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
      };

      this._touchLongPressTimer = setTimeout(() => {
        const state = this._touchLongPressState;
        if (!state) return;

        const opened = this._openMenuAt(state.canvas, state.currentX, state.currentY);
        if (opened) {
          this._touchMenuOpenedAt = Date.now();
        }

        this._clearTouchLongPressState();
      }, LONG_PRESS_DURATION_MS);
    }

    _updateTouchLongPressMovement(event) {
      const state = this._touchLongPressState;
      if (!state) return;

      const touch = this._findTouchById(event.originalEvent?.touches, state.touchId)
        || this._findTouchById(event.originalEvent?.changedTouches, state.touchId);

      if (!touch) {
        this._clearTouchLongPressState();
        return;
      }

      state.currentX = touch.clientX;
      state.currentY = touch.clientY;

      const deltaX = state.currentX - state.startX;
      const deltaY = state.currentY - state.startY;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance > LONG_PRESS_MAX_MOVE_PX) {
        this._clearTouchLongPressState();
      }
    }

    _findTouchById(touchList, touchId) {
      if (!touchList || typeof touchId !== "number") return null;

      for (let index = 0; index < touchList.length; index += 1) {
        if (touchList[index].identifier === touchId) {
          return touchList[index];
        }
      }

      return null;
    }

    _clearRightClickState() {
      if (this._rightClickStateTimeout) {
        clearTimeout(this._rightClickStateTimeout);
        this._rightClickStateTimeout = null;
      }

      this._rightClickState = null;
    }

    _clearTouchLongPressState() {
      if (this._touchLongPressTimer) {
        clearTimeout(this._touchLongPressTimer);
        this._touchLongPressTimer = null;
      }

      this._touchLongPressState = null;
    }

    _buildContext(event) {
      const canvas = event.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const canvasCoords = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      const raycastResult = this._cameraManager?.rayCast(
        canvasCoords.x,
        canvasCoords.y,
      );

      const tokenEntity = raycastResult?.entity?.name === "Token" ? raycastResult.entity : null;
      const tokenNetworkId = this._getTokenNetworkId(tokenEntity);
      const contextType = tokenEntity ? "token" : "map";

      return {
        type: contextType,
        token: tokenEntity,
        tokenNetworkId,
        raycastResult,
        event,
        canvas,
        canvasCoords,
      };
    }

    _openMenuAt(canvas, clientX, clientY) {
      const context = this._buildContext({
        currentTarget: canvas,
        clientX,
        clientY,
      });

      const options = this._getVisibleOptions(context);

      if (!options.length) {
        this.hide();
        return false;
      }

      this._showAt(clientX, clientY, options, context);
      return true;
    }

    _getTokenNetworkId(tokenEntity) {
      if (!tokenEntity) return null;

      const direct = tokenEntity?.script?.networkId;
      if (typeof direct === "string") return direct;

      const nested = tokenEntity?.script?.networkId?.networkId;
      return typeof nested === "string" ? nested : null;
    }

    _getVisibleOptions(context) {
      const options = Array.from(this._options.values());

      return options
        .filter((option) => {
          if (option.gameMasterOnly && !this._isCurrentUserGameMaster()) {
            return false;
          }

          const visibleByContext =
            option.showOn.includes("always") || option.showOn.includes(context.type);

          if (!visibleByContext) return false;

          if (option.isVisible) {
            try {
              return !!option.isVisible(context);
            } catch (error) {
              return false;
            }
          }

          return true;
        })
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return a.label.localeCompare(b.label);
        });
    }

    _isCurrentUserGameMaster() {
      try {
        return !!this._playerManager?.isGameMaster?.();
      } catch (error) {
        return false;
      }
    }

    _showAt(x, y, options, context) {
      if (!this._$menu?.length) return;

      this._$menu.empty();

      options.forEach((option) => {
        const $item = $(
          `<div class='n21-canvas-dropdown-item-wrapper'></div>`,
        );

        const $button = $(
          `<button type='button' class='n21-canvas-dropdown-item' role='menuitem'>${this._escapeHtml(
            option.label,
          )}</button>`,
        );

        if (option.submenu) {
          $button.addClass("n21-has-submenu");

          const $submenu = $(
            `<div class='n21-canvas-dropdown-submenu' role='menu'></div>`,
          );

          // Resolve submenu: if it's a function, call it with context; otherwise use it directly
          let submenuItems = option.submenu;
          if (typeof option.submenu === "function") {
            try {
              submenuItems = option.submenu(context) || [];
            } catch (error) {
              console.warn(`[CanvasDropdownManager] Error resolving dynamic submenu \"${option.id}\":`, error);
              submenuItems = [];
            }
          }

          (Array.isArray(submenuItems) ? submenuItems : []).forEach((subOption) => {
            const $subButton = $(
              `<button type='button' class='n21-canvas-dropdown-item' role='menuitem'>${this._escapeHtml(
                subOption.label,
              )}</button>`,
            );

            $subButton.on("click", () => {
              this.hide();
              try {
                subOption.onClick(context);
              } catch (error) {
                console.warn(`[CanvasDropdownManager] Error on submenu \"${subOption.id}\":`, error);
              }
            });

            $submenu.append($subButton);
          });

          $item.append($button, $submenu);
        } else {
          $button.on("click", () => {
            this.hide();
            try {
              option.onClick(context);
            } catch (error) {
              console.warn(`[CanvasDropdownManager] Error on option \"${option.id}\":`, error);
            }
          });

          $item.append($button);
        }

        this._$menu.append($item);
      });

      this._$menu.css({
        left: `${x}px`,
        top: `${y}px`,
        display: "block",
      });

      const menuRect = this._$menu[0].getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - menuRect.width - 8);
      const maxTop = Math.max(8, window.innerHeight - menuRect.height - 8);

      this._$menu.css({
        left: `${Math.min(Math.max(8, x), maxLeft)}px`,
        top: `${Math.min(Math.max(8, y), maxTop)}px`,
      });

      this._$menu.attr("aria-hidden", "false");
    }

    hide() {
      if (!this._$menu?.length) return;
      this._$menu.hide().attr("aria-hidden", "true");
    }

    _escapeHtml(value) {
      const div = document.createElement("div");
      div.textContent = String(value || "");
      return div.innerHTML;
    }
  }

  const { registerManager } = window._n21_.utils;
  registerManager("CanvasDropdownManager", CanvasDropdownManager);
})();
