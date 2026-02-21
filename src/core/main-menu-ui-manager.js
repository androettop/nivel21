(() => {
  /* =======================
       MainMenuUIManager - Main menu DOM utilities
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};
  const { isTabletopUrl } = window._n21_?.utils || {};

  class MainMenuUIManager extends BaseManager {
    constructor() {
      super();
      this._initialized = false;
      this._menuElement = null;
      this._menuReadyPromise = null;
      this._observer = null;
      this._menuSelector = "#main-menu-navigation";
      this._menuTimeoutMs = 10000;
    }

    async init() {
      if (this._initialized) return;
      if (typeof isTabletopUrl === "function" && !isTabletopUrl()) return;

      this._initialized = true;
      this._setupObserver();
    }

    isReady() {
      return this._initialized && !!this._menuElement;
    }

    async addHeader(label, options = {}) {
      const menu = await this._getMenuElement();
      if (!menu || !label) return null;

      const existing = this._findExistingHeader(menu, label, options.id);
      if (existing) return existing;

      const header = document.createElement("li");
      header.className = "navigation-header";
      if (options.id) {
        header.dataset.n21Id = options.id;
      }

      const span = document.createElement("span");
      span.textContent = label;

      const icon = document.createElement("i");
      icon.className = "ft-minus show-tooltip tooltipstered";
      icon.setAttribute("data-side", "right");

      header.appendChild(span);
      header.appendChild(icon);

      this._insertElement(menu, header, options.afterElement);

      return header;
    }

    async addItem(options = {}, placement = {}) {
      const menu = await this._getMenuElement();
      if (!menu) return null;

      const id = options.id;
      const parsedOrder = Number(options.order);
      const itemOrder = Number.isFinite(parsedOrder) ? parsedOrder : 500;
      if (id) {
        const existing = menu.querySelector(`[data-n21-id="${id}"]`);
        if (existing) {
          existing.dataset.n21Order = String(itemOrder);
          this._insertElement(menu, existing, placement.afterElement, itemOrder);
          return existing;
        }
      }

      const item = document.createElement("li");
      item.className = "nav-item";
      item.dataset.n21Order = String(itemOrder);
      if (id) {
        item.dataset.n21Id = id;
      }

      const link = document.createElement("a");
      link.className = "nav-link";
      link.href = options.href || "#";

      if (options.menuId) {
        link.setAttribute("data-menu-id", options.menuId);
      }

      if (typeof options.onClick === "function") {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          options.onClick(event);
        });
      }

      const icon = document.createElement("i");
      icon.className = options.iconClass || "";

      const title = document.createElement("span");
      title.className = "menu-title";
      title.textContent = options.title || "";

      link.appendChild(icon);
      link.appendChild(title);
      item.appendChild(link);

      this._insertElement(menu, item, placement.afterElement, itemOrder);

      return item;
    }

    _insertElement(menu, element, afterElement, order = 500) {
      if (afterElement && afterElement.parentElement === menu) {
        if (afterElement.classList?.contains("navigation-header")) {
          this._insertItemWithinHeader(menu, element, afterElement, order);
          return;
        }

        if (afterElement.nextSibling) {
          menu.insertBefore(element, afterElement.nextSibling);
        } else {
          menu.appendChild(element);
        }
        return;
      }

      menu.appendChild(element);
    }

    _insertItemWithinHeader(menu, element, headerElement, order) {
      let cursor = headerElement.nextElementSibling;
      let nextHeader = null;

      while (cursor) {
        if (cursor.classList?.contains("navigation-header")) {
          nextHeader = cursor;
          break;
        }

        if (cursor.classList?.contains("nav-item")) {
          const existingOrder = Number(cursor.dataset.n21Order);
          const normalizedExistingOrder = Number.isFinite(existingOrder)
            ? existingOrder
            : 500;

          if (normalizedExistingOrder > order) {
            menu.insertBefore(element, cursor);
            return;
          }
        }

        cursor = cursor.nextElementSibling;
      }

      if (nextHeader) {
        menu.insertBefore(element, nextHeader);
        return;
      }

      menu.appendChild(element);
    }

    _findExistingHeader(menu, label, id) {
      if (id) {
        const existing = menu.querySelector(`[data-n21-id="${id}"]`);
        if (existing) return existing;
      }

      const headers = menu.querySelectorAll(".navigation-header span");
      for (const headerSpan of headers) {
        if (headerSpan.textContent?.trim() === label.trim()) {
          return headerSpan.closest(".navigation-header");
        }
      }

      return null;
    }

    _setupObserver() {
      if (this._observer) return;

      this._observer = new MutationObserver(() => {
        const menu = this._findMenuElement();
        if (menu && menu !== this._menuElement) {
          this._menuElement = menu;
        }
      });

      this._observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    _findMenuElement() {
      return document.querySelector(this._menuSelector);
    }

    _waitForMenu() {
      return new Promise((resolve) => {
        const existing = this._findMenuElement();
        if (existing) {
          this._menuElement = existing;
          resolve(existing);
          return;
        }

        const start = Date.now();
        const interval = setInterval(() => {
          const menu = this._findMenuElement();
          if (menu) {
            clearInterval(interval);
            this._menuElement = menu;
            resolve(menu);
            return;
          }

          if (Date.now() - start > this._menuTimeoutMs) {
            clearInterval(interval);
            console.warn("[MainMenuUIManager] Timeout waiting for main menu");
            resolve(null);
          }
        }, 100);
      });
    }

    async _getMenuElement() {
      if (this._menuElement) return this._menuElement;
      if (!this._menuReadyPromise) {
        this._menuReadyPromise = this._waitForMenu();
      }
      return this._menuReadyPromise;
    }
  }

  const { registerManager } = window._n21_.utils;
  registerManager("MainMenuUIManager", MainMenuUIManager);
})();
