(() => {
  /* =======================
       CanvasDropdownManager - Context dropdown for canvas right-click
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  const RIGHT_CLICK_MAX_DURATION_MS = 250;
  const RIGHT_CLICK_MAX_MOVE_PX = 4;

  class CanvasDropdownManager extends BaseManager {
    constructor() {
      super();
      this._ready = false;
      this._options = new Map();
      this._$menu = null;
      this._cameraManager = null;
      this._rightClickState = null;
      this._rightClickStateTimeout = null;
    }

    async init() {
      if (this._ready) return;

      try {
        const { loadManagers } = window._n21_;
        const [CameraManager] = await loadManagers("CameraManager");

        this._cameraManager = CameraManager;
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
      if (!option || !option.id || typeof option.onClick !== "function") {
        console.warn("[CanvasDropdownManager] Invalid option registration");
        return () => {};
      }

      const normalized = {
        id: option.id,
        label: String(option.label || option.id),
        order: Number.isFinite(option.order) ? option.order : 100,
        showOn: this._normalizeShowOn(option.showOn || option.contexts || "always"),
        onClick: option.onClick,
        isVisible: typeof option.isVisible === "function" ? option.isVisible : null,
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
        if (!this._rightClickState) {
          return;
        }

        if (this._isQualifiedRightClick(event)) {
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

        const context = this._buildContext(event);
        const options = this._getVisibleOptions(context);

        if (!options.length) {
          this.hide();
          this._clearRightClickState();
          return;
        }

        event.preventDefault();
        this._showAt(event.clientX, event.clientY, options, context);
        this._clearRightClickState();
      });

      $(document).on("mouseup.n21CanvasDropdown", (event) => {
        if (event.button === 2) {
          this._clearRightClickState();
        }
      });

      $(document).on("mousedown.n21CanvasDropdown", (event) => {
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

    _clearRightClickState() {
      if (this._rightClickStateTimeout) {
        clearTimeout(this._rightClickStateTimeout);
        this._rightClickStateTimeout = null;
      }

      this._rightClickState = null;
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

    _showAt(x, y, options, context) {
      if (!this._$menu?.length) return;

      this._$menu.empty();

      options.forEach((option) => {
        const $button = $(
          `<button type='button' class='n21-canvas-dropdown-item' role='menuitem'>${this._escapeHtml(
            option.label,
          )}</button>`,
        );

        $button.on("click", () => {
          this.hide();
          try {
            option.onClick(context);
          } catch (error) {
            console.warn(`[CanvasDropdownManager] Error on option \"${option.id}\":`, error);
          }
        });

        this._$menu.append($button);
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
