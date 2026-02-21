(async () => {
  try {
    /* =======================
     Multi-level Action Bar
    ======================= */

    const { loadManagers } = window._n21_;
    const { uuid } = window._n21_?.utils || {};

    const [ActionBarManager, TooltipManager, SettingsManager] =
      await loadManagers(
        "ActionBarManager",
        "TooltipManager",
        "SettingsManager",
      );

    // Check if feature is enabled
    if (!SettingsManager.get("feature.multi-level-action-bar.enabled")) {
      return;
    }

    /**
     * Check if an item is a folder
     */
    function isFolder(item) {
      return item.action_type === "folder";
    }

    /**
     * Create a folder item from a base item
     */
    function createFolderFromItem(baseItem, name) {
      return {
        id: uuid ? uuid() : Math.random().toString(36).slice(2),
        name,
        text: null,
        icon: baseItem.icon,
        description: null,
        action_type: "folder",
        hidden: false,
        order: null,
        source_name: null,
        tooltip_title: name,
        owned: baseItem.owned,
        elements: [],
      };
    }

    /**
     * Escape HTML for XSS prevention
     */
    function escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }

    /**
     * Normaliza un árbol de ActionItems convirtiendo
     * "A > B > C" en carpetas anidadas
     *
     * @param {Array<Object>} items
     * @returns {Array<Object>}
     */
    function normalizeActionItems(items) {
      const root = [];

      // índice global de items `none`/`folder` reutilizables
      const noneIndex = new Map();

      // IDs de items que fueron convertidos en folders y deben ser eliminados
      const usedAsFolder = new Set();

      /**
       * Indexa recursivamente items de tipo `none` y `folder`
       * @param {Array<Object>} list
       */
      function indexNoneItems(list) {
        for (const item of list) {
          if (item.action_type === "none" || item.action_type === "folder") {
            noneIndex.set(item.name, item);
          }
          if (isFolder(item)) {
            indexNoneItems(item.elements);
          }
        }
      }

      indexNoneItems(items);

      /**
       * Inserta un item en el árbol según path
       * @param {Array<Object>} tree
       * @param {Array<string>} path
       * @param {Object} item
       */
      function insertIntoTree(tree, path, item) {
        let currentLevel = tree;

        for (const segment of path) {
          let folder = currentLevel.find(
            (el) => el.name === segment && el.action_type === "folder",
          );

          if (!folder) {
            const reusable = noneIndex.get(segment);

            if (reusable) {
              folder = {
                ...reusable,
                id: uuid ? uuid() : Math.random().toString(36).slice(2),
                name: segment,
                tooltip_title: segment,
                action_type: "folder",
                elements: [],
              };
              // Marcar este item como usado para ser eliminado del árbol
              usedAsFolder.add(reusable.id);
              noneIndex.delete(segment);
            } else {
              folder = createFolderFromItem(item, segment);
            }

            currentLevel.push(folder);
          }

          currentLevel = folder.elements;
        }

        currentLevel.push(item);
      }

      /**
       * Recorre items raíz
       * @param {Array<Object>} list
       */
      function walk(list) {
        for (const item of list) {
          if (isFolder(item)) {
            const folder = { ...item, elements: [] };
            root.push(folder);
            walkInto(item.elements, folder.elements);
            continue;
          }

          const parts = item.name.split(" > ").map((p) => p.trim());

          if (parts.length === 1) {
            root.push(item);
            continue;
          }

          const finalName = parts.pop();
          const clonedItem = {
            ...item,
            name: finalName,
            tooltip_title: finalName,
          };

          insertIntoTree(root, parts, clonedItem);
        }
      }

      /**
       * Recorre niveles internos
       * @param {Array<Object>} source
       * @param {Array<Object>} target
       */
      function walkInto(source, target) {
        for (const item of source) {
          if (isFolder(item)) {
            const folder = { ...item, elements: [] };
            target.push(folder);
            walkInto(item.elements, folder.elements);
            continue;
          }

          const parts = item.name.split(" > ").map((p) => p.trim());

          if (parts.length === 1) {
            target.push(item);
            continue;
          }

          const finalName = parts.pop();
          const clonedItem = {
            ...item,
            name: finalName,
            tooltip_title: finalName,
          };

          insertIntoTree(target, parts, clonedItem);
        }
      }

      walk(items);

      // Filtrar items que fueron convertidos en folders
      return filterUsedItems(root);

      /**
       * Filtra recursivamente items que fueron usados como folders
       * @param {Array<Object>} list
       * @returns {Array<Object>}
       */
      function filterUsedItems(list) {
        return list
          .filter((item) => !usedAsFolder.has(item.id))
          .map((item) => {
            if (isFolder(item) && item.elements) {
              return {
                ...item,
                elements: filterUsedItems(item.elements),
              };
            }
            return item;
          });
      }
    }

    /**
     * Render the action bar with multi-level support
     */
    function renderBar(element, items, parentItem, depth) {
      const $baseElement = $(element);

      // If items exist, setup flex layout
      if (items && items.length > 0) {
        $baseElement.removeClass("d-none");
        if (!$baseElement.hasClass("n21-d-flex")) {
          $baseElement.addClass("n21-d-flex");
        }
        if (!$baseElement.hasClass("flex-column-reverse")) {
          $baseElement.addClass("flex-column-reverse");
        }
      }

      if (parentItem === null) {
        // Root level: clear and create root container
        $baseElement.empty();

        const $rootContainer = $("<div>")
          .addClass("folder-root d-flex justify-content-center")
          .attr("data-folder-depth", 0);
        $baseElement.append($rootContainer);

        renderItems($rootContainer, items, $baseElement, depth);
      } else {
        // Nested level: remove containers at this depth and below
        if (depth >= 1) {
          $baseElement
            .find("[data-folder-depth]")
            .filter(function () {
              return parseInt($(this).attr("data-folder-depth")) >= depth;
            })
            .remove();
        }

        // Create sibling container for this folder
        const $childContainer = $("<div>")
          .addClass(`folder-${parentItem.id} d-flex justify-content-center`)
          .attr("data-folder-depth", depth);
        $baseElement.append($childContainer);

        renderItems($childContainer, items, $baseElement, depth);
      }

      return $baseElement;
    }

    /**
     * Render items into a container
     */
    function renderItems($container, items, $baseElement, depth) {
      $container.empty();

      items.forEach((item) => {
        const $itemElement = createItemElement(item);
        $container.append($itemElement);

        const $button = $itemElement.find(".action-bar-button");

        if (isFolder(item)) {
          $itemElement.on("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const isSelected = $button.hasClass("selected");

            // Remove selected from siblings
            $container
              .find(".action-bar-element .action-bar-button.selected")
              .removeClass("selected");

            if (isSelected) {
              // Collapse this folder: remove deeper containers
              $baseElement
                .find("[data-folder-depth]")
                .filter(function () {
                  return (
                    parseInt($(this).attr("data-folder-depth")) >= depth + 1
                  );
                })
                .remove();
              return;
            }

            $button.addClass("selected");

            // Recursively render folder contents
            window.createBar($baseElement, item.elements, item, depth + 1);
          });
        } else if (item.action_type === "dice_roll") {
          $itemElement.on("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const diceExpression = item.dice_roll;

            if (!item.roll_options) {
              item.roll_options = {};
            }

            if (!item.roll_options.roll_name) {
              item.roll_options.roll_name = item.name;
            }

            if (!item.roll_options.sender_info) {
              const $actionBar = $button.closest(".action-bar");
              if ($actionBar.length) {
                item.roll_options.sender_info =
                  $actionBar.attr("data-sender-info");
              }
            }

            if (!item.roll_options.icon) {
              item.roll_options.icon = item.icon;
            }

            if (!item.roll_options.parent_icon) {
              item.roll_options.parent_icon = item.parent_icon;
            }

            if (typeof window.diceRoll === "function") {
              window.diceRoll(diceExpression, item.roll_options);
            }
          });
        }
      });
    }

    /**
     * Create an element for a single item
     */
    function createItemElement(item) {
      const $itemEl = $("<div>")
        .addClass("action-bar-element")
        .attr("data-item-id", item.id)
        .attr("data-action-type", item.action_type);

      // Build tooltip HTML
      let tooltipHtml = `<h5>${item.tooltip_title || item.name}</h5>`;

      if (item.description) {
        tooltipHtml += `<p>${item.description}</p>`;
      }

      // Determine indicator classes
      const isItemFolder = isFolder(item);
      let indicatorClasses = isItemFolder ? "fa fa-chevron-down" : "d-none";
      let selectedIndicatorClasses = isItemFolder
        ? "fa fa-chevron-up"
        : "d-none";

      if (item.action_type === "dice_roll") {
        if (item.dice_roll) {
          tooltipHtml += `<p><strong>Lanzar ${item.dice_roll}</strong></p>`;
        }
      } else if (item.action_type === "folder") {
        if (item.elements && item.elements.length > 0) {
          tooltipHtml += "<p><strong>Click para ver más opciones</strong></p>";
        }
      }

      const imageStyle = item.icon
        ? `background: url('${encodeURI(item.icon)}') no-repeat;`
        : "";

      const html = `
      <div class="action-bar-button tooltipstered" data-toggle="tooltip">
        <div class="action-bar-bg"></div>
        <div class="action-bar-image" style="${imageStyle}"></div>
        <div class="action-bar-hover"></div>
        <div class="action-bar-text">
          <span class="action-bar-short-name">${item.text ? escapeHtml(item.text) : ""}</span>
          <span class="action-bar-name">${!item.text ? escapeHtml(item.name) : ""}</span>
        </div>
        <div class="action-bar-indicator">
          <i class="indicator-icon ${indicatorClasses}"></i>
          <i class="selected-indicator-icon ${selectedIndicatorClasses}"></i>
        </div>
        <div class="action-bar-frame"></div>
      </div>
    `;

      $itemEl.html(html);

      // Process tooltip
      const $button = $itemEl.find(".action-bar-button");
      $button.attr("title", tooltipHtml);
      TooltipManager.process($button[0]);

      // Store item data for external use
      if (!isItemFolder) {
        $itemEl.attr("data-action", JSON.stringify(item));
      }

      return $itemEl;
    }

    // Register interceptor to handle multi-level action bar
    ActionBarManager.onCreateBar(
      "multi-level-action-bar",
      (element, items, parentItem = null, depth = 0) => {
        // Normalize items only at root level
        const normalizedItems =
          parentItem === null ? normalizeActionItems(items) : items;

        // Render with multi-level support
        return renderBar(element, normalizedItems, parentItem, depth);
      },
      { priority: 100 },
    );

    /**
     * Watch for action bars rendered inside .content-body
     * and build them from their stored elements data.
     */
    function initPanelActionsObserver() {
      const $panels = $(".content-body");
      if (!$panels.length) return;

      function buildPanelActionBar($actionBar, attempt = 0) {
        if ($actionBar.hasClass("n21-action-bar")) return;

        const elements = $actionBar.data("elements");
        if (!Array.isArray(elements)) {
          if (attempt < 5) {
            setTimeout(() => buildPanelActionBar($actionBar, attempt + 1), 50);
          }
          return;
        }

        const $primaryBar = $actionBar
          .find(".action-bar-row.primary-bar")
          .first();
        if (!$primaryBar.length) return;

        $actionBar.addClass("n21-action-bar");
        const normalizedItems = normalizeActionItems(elements);
        window.createBar($primaryBar[0], normalizedItems, null, 0);
      }

      $panels.each(function () {
        const $panel = $(this);

        // Initialize any existing action bars
        $panel.find(".action-bar").each(function () {
          buildPanelActionBar($(this));
        });

        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (!(node instanceof HTMLElement)) return;

              if (node.matches && node.matches(".action-bar")) {
                buildPanelActionBar($(node));
                return;
              }

              const $nestedActionBars = $(node).find(".action-bar");
              if ($nestedActionBars.length) {
                $nestedActionBars.each(function () {
                  buildPanelActionBar($(this));
                });
              }
            });
          });
        });

        observer.observe($panel[0], { childList: true, subtree: true });
      });
    }

    // Handler for cleaning conflicting classes on action bar toggle
    $(document).on("click", '[data-toggle="action-bar"]', function () {
      const $actionBar = $(this)
        .closest(".action-bar-wrapper")
        .find(".action-bar");

      setTimeout(() => {
        if ($actionBar.hasClass("d-none") && $actionBar.hasClass("d-flex")) {
          $actionBar.removeClass("d-flex");
        }
      }, 50);
    });

    initPanelActionsObserver();

    console.log("[N21 Plugin] Multi-level Action Bar loaded");
  } catch (error) {
    console.warn("[Multi-level Action Bar] Error:", error);
  }
})();
