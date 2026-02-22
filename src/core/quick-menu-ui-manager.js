(() => {
  /* =======================
       QuickMenuUIManager - Quick menu DOM utilities
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};
  const { isTabletopUrl } = window._n21_?.utils || {};

  class QuickMenuUIManager extends BaseManager {
    constructor() {
      super();
      this._initialized = false;
      this._observer = null;
      this._registrations = new Map();
      this._quickMenuSelector = "#quick-menu";
    }

    async init() {
      if (this._initialized) return;
      if (typeof isTabletopUrl === "function" && !isTabletopUrl()) return;

      this._initialized = true;
      this._setupObserver();
      this._renderAll();
    }

    isReady() {
      return this._initialized;
    }

    registerConnectedActionsToggle(options = {}) {
      const id = String(options.id || "").trim();
      if (!id) {
        console.warn("[QuickMenuUIManager] registerConnectedActionsToggle requires an id");
        return () => {};
      }

      const parsedGroupOrder = Number(options.groupOrder);
      const parsedActionOrder = Number(options.actionOrder);

      const registration = {
        id,
        groupId: String(options.groupId || "default").trim() || "default",
        groupOrder: Number.isFinite(parsedGroupOrder) ? parsedGroupOrder : null,
        actionOrder: Number.isFinite(parsedActionOrder) ? parsedActionOrder : 0,
        iconClass: options.iconClass || "",
        title: options.title || "",
        buttonClass: options.buttonClass || "",
        getState: typeof options.getState === "function" ? options.getState : () => false,
        onToggle: typeof options.onToggle === "function" ? options.onToggle : null,
      };

      this._registrations.set(id, registration);
      this._renderToggle(registration);

      return () => {
        const removed = this._registrations.get(id);
        this._registrations.delete(id);
        const quickMenu = this._findQuickMenu();
        if (!quickMenu) return;

        const existingButton = quickMenu.querySelector(`button[data-n21-quick-id="${id}"]`);
        if (existingButton) {
          const group = existingButton.closest(".menu-group");
          existingButton.remove();

          if (group && group.querySelectorAll("button.btn-quick-menu").length === 0) {
            group.remove();
          } else if (group) {
            this._updateSingleButtonClass(group);
          }
        }

        if (removed) {
          this._reorderManagedGroups(quickMenu);
        }
      };
    }

    refreshToggleState(id) {
      const registration = this._registrations.get(id);
      if (!registration) return;

      const quickMenu = this._findQuickMenu();
      if (!quickMenu) return;

      const button = quickMenu.querySelector(`button[data-n21-quick-id="${id}"]`);
      if (!button) return;

      this._setButtonSelected(button, !!registration.getState());
    }

    _setupObserver() {
      if (this._observer) return;

      this._observer = new MutationObserver(() => {
        this._renderAll();
      });

      this._observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    _findQuickMenu() {
      return document.querySelector(this._quickMenuSelector);
    }

    _renderAll() {
      const quickMenu = this._findQuickMenu();
      if (!quickMenu) return;

      if (this._registrations.size === 0) return;
      for (const registration of this._registrations.values()) {
        this._renderToggle(registration);
      }

      this._syncSingleButtonClassForConnectedGroups(quickMenu);
    }

    _renderToggle(registration) {
      const quickMenu = this._findQuickMenu();
      if (!quickMenu) return;

      const group = this._ensureGroup(quickMenu, registration.groupId, registration.groupOrder);
      if (!group) return;

      const existingButton = quickMenu.querySelector(`button[data-n21-quick-id="${registration.id}"]`);
      if (existingButton) {
        this._setButtonSelected(existingButton, !!registration.getState());
        existingButton.title = String(registration.title || "");
        existingButton.dataset.n21ActionOrder = String(registration.actionOrder);
        if (existingButton.parentElement !== group) {
          group.appendChild(existingButton);
        }
        this._insertButtonByActionOrder(group, existingButton);
        this._updateSingleButtonClass(group);
        this._processTooltip(existingButton);
        return;
      }

      const button = document.createElement("button");
      button.className = `btn-quick-menu btn btn-sm btn-primary tooltipstered ${registration.buttonClass}`.trim();
      button.setAttribute("data-side", "left");
      button.setAttribute("data-toggle", "tooltip");
      button.dataset.n21QuickId = registration.id;
      button.dataset.n21ActionOrder = String(registration.actionOrder);
      button.title = String(registration.title || "");

      const icon = document.createElement("i");
      icon.className = registration.iconClass;
      button.appendChild(icon);

      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentValue = !!registration.getState();
        const nextValue = !currentValue;

        if (registration.onToggle) {
          registration.onToggle(nextValue, event);
        }

        this._setButtonSelected(button, !!registration.getState());
      });

      this._setButtonSelected(button, !!registration.getState());

      group.appendChild(button);
      this._insertButtonByActionOrder(group, button);
      this._updateSingleButtonClass(group);
      this._processTooltip(button);
    }

    _ensureGroup(quickMenu, groupId, groupOrder) {
      if (!quickMenu) return null;

      let group = quickMenu.querySelector(`.menu-group[data-n21-group-id="${groupId}"]`);
      if (!group) {
        group = document.createElement("div");
        group.className = "menu-group connected-actions";
        group.dataset.n21GroupId = groupId;
        quickMenu.appendChild(group);
      }

      const resolvedGroupOrder = this._resolveDefaultGroupOrder(group, groupOrder);
      const nextGroupOrder = String(resolvedGroupOrder);
      if (group.dataset.n21GroupOrder !== nextGroupOrder) {
        group.dataset.n21GroupOrder = nextGroupOrder;
      }
      this._reorderManagedGroups(quickMenu);
      return group;
    }

    _resolveDefaultGroupOrder(group, explicitGroupOrder) {
      if (Number.isFinite(explicitGroupOrder)) {
        return explicitGroupOrder;
      }

      if (group?.classList?.contains("connected-actions")) {
        return 0;
      }

      return 1000;
    }

    _insertButtonByActionOrder(group, button) {
      if (!group || !button) return;

      const parsedOrder = Number(button.dataset.n21ActionOrder);
      const buttonOrder = Number.isFinite(parsedOrder) ? parsedOrder : 0;

      const allButtons = Array.from(group.querySelectorAll("button.btn-quick-menu"));
      const currentIndex = allButtons.indexOf(button);

      const buttons = allButtons
        .filter((item) => item !== button)
        .sort((a, b) => {
          const orderA = Number(a.dataset.n21ActionOrder);
          const orderB = Number(b.dataset.n21ActionOrder);
          const normalizedA = Number.isFinite(orderA) ? orderA : 0;
          const normalizedB = Number.isFinite(orderB) ? orderB : 0;
          return normalizedA - normalizedB;
        });

      let inserted = false;
      for (const existing of buttons) {
        const existingOrder = Number(existing.dataset.n21ActionOrder);
        const normalizedExisting = Number.isFinite(existingOrder) ? existingOrder : 0;
        if (buttonOrder < normalizedExisting) {
          if (button.nextElementSibling !== existing) {
            group.insertBefore(button, existing);
          }
          inserted = true;
          break;
        }
      }

      if (!inserted) {
        if (currentIndex !== allButtons.length - 1) {
          group.appendChild(button);
        }
      }
    }

    _reorderManagedGroups(quickMenu) {
      if (!quickMenu) return;

      const currentGroups = Array.from(quickMenu.querySelectorAll(".menu-group"));
      const groupMeta = this._ensureGroupMetadata(currentGroups);

      const orderedGroups = [...currentGroups].sort((a, b) => {
        const orderA = groupMeta.get(a)?.order ?? 0;
        const orderB = groupMeta.get(b)?.order ?? 0;
        if (orderA !== orderB) {
          return orderA - orderB;
        }

        const groupIdA = String(a.dataset.n21GroupId || "");
        const groupIdB = String(b.dataset.n21GroupId || "");
        return groupIdA.localeCompare(groupIdB);
      });

      let needsReorder = false;
      for (let index = 0; index < orderedGroups.length; index += 1) {
        if (orderedGroups[index] !== currentGroups[index]) {
          needsReorder = true;
          break;
        }
      }

      if (!needsReorder) return;

      for (const group of orderedGroups) {
        quickMenu.appendChild(group);
      }
    }

    _ensureGroupMetadata(groups) {
      const meta = new Map();
      let autoIndex = 0;

      for (const group of groups) {
        if (!group.dataset.n21GroupId) {
          group.dataset.n21GroupId = `auto-${autoIndex}`;
          autoIndex += 1;
        }

        const parsedOrder = Number(group.dataset.n21GroupOrder);
        let resolvedOrder = Number.isFinite(parsedOrder) ? parsedOrder : null;
        if (!Number.isFinite(resolvedOrder)) {
          resolvedOrder = group.classList.contains("connected-actions") ? 0 : 1000;
          group.dataset.n21GroupOrder = String(resolvedOrder);
        }

        meta.set(group, { order: resolvedOrder });
      }

      return meta;
    }

    _setButtonSelected(button, selected) {
      if (!button) return;
      button.classList.toggle("selected", !!selected);
    }

    _syncSingleButtonClassForConnectedGroups(quickMenu) {
      if (!quickMenu) return;

      const groups = quickMenu.querySelectorAll(".menu-group.connected-actions");
      for (const group of groups) {
        this._updateSingleButtonClass(group);
      }
    }

    _updateSingleButtonClass(group) {
      if (!group) return;

      const buttons = Array.from(group.querySelectorAll("button.btn-quick-menu"));
      const shouldMarkSingle = buttons.length === 1;

      for (let index = 0; index < buttons.length; index += 1) {
        const button = buttons[index];
        const shouldHaveClass = shouldMarkSingle && index === 0;
        if (shouldHaveClass) {
          if (!button.classList.contains("n21-single-button-group-item")) {
            button.classList.add("n21-single-button-group-item");
          }
        } else if (button.classList.contains("n21-single-button-group-item")) {
          button.classList.remove("n21-single-button-group-item");
        }
      }
    }

    _processTooltip(button) {
      if (!button) return;

      const tooltipManager = window._n21_?.managers?.TooltipManager;
      if (!tooltipManager || typeof tooltipManager.process !== "function") return;

      tooltipManager.process(button);
    }
  }

  const { registerManager } = window._n21_.utils;
  registerManager("QuickMenuUIManager", QuickMenuUIManager);
})();
