(() => {
  /* =======================
     Multi-level Action Bar
    ======================= */

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
          el => el.name === segment && el.action_type === "folder"
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
              elements: []
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

        const parts = item.name.split(" > ").map(p => p.trim());

        if (parts.length === 1) {
          root.push(item);
          continue;
        }

        const finalName = parts.pop();
        const clonedItem = {
          ...item,
          name: finalName,
          tooltip_title: finalName
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

        const parts = item.name.split(" > ").map(p => p.trim());

        if (parts.length === 1) {
          target.push(item);
          continue;
        }

        const finalName = parts.pop();
        const clonedItem = {
          ...item,
          name: finalName,
          tooltip_title: finalName
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
      return list.filter(item => !usedAsFolder.has(item.id)).map(item => {
        if (isFolder(item) && item.elements) {
          return {
            ...item,
            elements: filterUsedItems(item.elements)
          };
        }
        return item;
      });
    }
  }

  // Importar funciones de core
  const { uuid } = window._n21_?.utils || {};

  function isFolder(item) {
    return item.action_type === "folder";
  }

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

  // Almacenar la función original createBar si existe
  const originalCreateBar = window.createBar;

  /**
   * Sobrescribe window.createBar para soportar navegación multinivel
   * 
   * @param {jQuery} element - Elemento jQuery donde se renderizarán los items
   * @param {Array<Object>} items - Array de items a renderizar
   * @param {Object|null} parentItem - Item padre (folder) o null si es nivel raíz
   * @param {number} depth - Profundidad actual de la carpeta (0 para raíz)
   */
  window.createBar = function(element, items, parentItem = null, depth = 0) {
    // Normalizar items solo en el nivel raíz
    const normalizedItems = parentItem === null ? normalizeActionItems(items) : items;

    // Si hay items, quitar la clase d-none del elemento
    if (normalizedItems && normalizedItems.length > 0) {
      $(element).removeClass('d-none');
      if(!$(element).hasClass('n21-d-flex')) {
        $(element).addClass('n21-d-flex');
      }
      if(!$(element).hasClass('flex-column-reverse')) {
        $(element).addClass('flex-column-reverse');
      }
    }

    // Elemento base donde todos los divs de carpetas serán hermanos
    const $baseElement = $(element);
    
    if (parentItem === null) {
      // Vaciar el elemento antes de renderizar desde el nivel raíz
      $baseElement.empty();
      
      // Nivel raíz: crear contenedor con clase folder-root
      const $rootContainer = $('<div>')
        .addClass('folder-root d-flex justify-content-center')
        .attr('data-folder-depth', 0);
      $baseElement.append($rootContainer);
      
      // Renderizar items en el contenedor root
      renderItems($rootContainer, normalizedItems, $baseElement, depth);
    } else {
      // Eliminar todos los divs con profundidad >= depth (el actual y los inferiores)
      if (depth >= 1) {
        $baseElement.find('[data-folder-depth]').filter(function() {
          return parseInt($(this).attr('data-folder-depth')) >= depth;
        }).remove();
      }

      // Crear un contenedor hermano con clase folder-{id}, d-flex y profundidad
      const $childContainer = $('<div>')
        .addClass(`folder-${parentItem.id} d-flex justify-content-center`)
        .attr('data-folder-depth', depth);
      $baseElement.append($childContainer);
      
      // Renderizar items en el nuevo contenedor
      renderItems($childContainer, normalizedItems, $baseElement, depth);
    }
    
    return $baseElement;
  };

  /**
   * Renderiza los items en un contenedor
   * 
   * @param {jQuery} $container - Contenedor donde renderizar
   * @param {Array<Object>} items - Items a renderizar
   * @param {jQuery} $baseElement - Elemento base para crear carpetas hermanas
   * @param {number} depth - Profundidad actual
   */
  function renderItems($container, items, $baseElement, depth) {
    // Limpiar el contenedor antes de renderizar
    $container.empty();

    // Renderizar los items
    items.forEach(item => {
      const $itemElement = createItemElement(item, $container);
      $container.append($itemElement);

      const $button = $itemElement.find('.action-bar-button');
      
      // Agregar evento de click según el tipo
      if (isFolder(item)) {
        $itemElement.on('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Remover clase selected de otros folders en el mismo contenedor
          $container.find('.action-bar-element .action-bar-button.selected').removeClass('selected');
          
          // Agregar clase selected al botón clickeado
          $button.addClass('selected');
          
          // Llamar recursivamente a createBar con los elementos del folder
          // Incrementar la profundidad para el siguiente nivel
          window.createBar($baseElement, item.elements, item, depth + 1);
        });
      } else if (item.action_type === 'dice_roll') {
        $itemElement.on('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Preparar opciones de lanzamiento
          const diceExpression = item.dice_roll;
          
          if (!item.roll_options) {
            item.roll_options = {};
          }
          
          if (!item.roll_options.roll_name) {
            item.roll_options.roll_name = item.name;
          }
          
          if (!item.roll_options.sender_info) {
            const $actionBar = $button.closest('.action-bar');
            if ($actionBar.length) {
              item.roll_options.sender_info = $actionBar.attr('data-sender-info');
            }
          }
          
          if (!item.roll_options.icon) {
            item.roll_options.icon = item.icon;
          }
          
          if (!item.roll_options.parent_icon) {
            item.roll_options.parent_icon = item.parent_icon;
          }
          
          // Llamar a la función global diceRoll
          if (typeof window.diceRoll === 'function') {
            window.diceRoll(diceExpression, item.roll_options);
          }
        });
      }
    });
  }

  /**
   * Crea un elemento jQuery para un item individual
   * 
   * @param {Object} item - Item a renderizar
   * @param {jQuery} $container - Contenedor padre
   * @returns {jQuery}
   */
  function createItemElement(item, $container) {
    const $itemEl = $('<div>')
      .addClass('action-bar-element')
      .attr('data-item-id', item.id)
      .attr('data-action-type', item.action_type);

    // Construir el HTML del tooltip
    let tooltipHtml = `<h5>${item.tooltip_title || item.name}</h5>`;
    
    if (item.description) {
      tooltipHtml += `<p>${item.description}</p>`;
    }

    // Determinar clases de indicadores según el tipo
    const isItemFolder = isFolder(item);
    let indicatorClasses = isItemFolder 
      ? 'fa fa-chevron-down'
      : 'd-none';
    let selectedIndicatorClasses = isItemFolder
      ? 'fa fa-chevron-up'
      : 'd-none';

    // Procesar según el tipo de acción
    if (item.action_type === 'dice_roll') {
      if (item.dice_roll) {
        tooltipHtml += `<p><strong>Lanzar ${item.dice_roll}</strong></p>`;
      }
    } else if (item.action_type === 'folder') {
      if (item.elements && item.elements.length > 0) {
        tooltipHtml += '<p><strong>Click para ver más opciones</strong></p>';
        indicatorClasses = 'fa fa-chevron-down';
        selectedIndicatorClasses = 'fa fa-chevron-up';
      }
    }

    // Crear estructura HTML del item
    const imageStyle = item.icon 
      ? `background: url('${encodeURI(item.icon)}') no-repeat;`
      : '';

    const html = `
      <div class="action-bar-button tooltipstered" data-toggle="tooltip">
        <div class="action-bar-bg"></div>
        <div class="action-bar-image" style="${imageStyle}"></div>
        <div class="action-bar-hover"></div>
        <div class="action-bar-text">
          <span class="action-bar-short-name">${item.text ? escapeHtml(item.text) : ''}</span>
          <span class="action-bar-name">${!item.text ? escapeHtml(item.name) : ''}</span>
        </div>
        <div class="action-bar-indicator">
          <i class="indicator-icon ${indicatorClasses}"></i>
          <i class="selected-indicator-icon ${selectedIndicatorClasses}"></i>
        </div>
        <div class="action-bar-frame"></div>
      </div>
    `;

    $itemEl.html(html);

    // Procesar el tooltip
    const $button = $itemEl.find('.action-bar-button');
    $button.attr('title', tooltipHtml);
    if (typeof window.processTooltip === 'function') {
      window.processTooltip($button[0]);
    }

    // Si no es un folder y tiene acción, agregar el manejador original
    if (!isItemFolder && originalCreateBar) {
      // Aquí se podría llamar a la lógica original de createBar para items no-folder
      // Por ahora solo establecemos un data attribute que podría ser usado externamente
      $itemEl.attr('data-action', JSON.stringify(item));
    }

    return $itemEl;
  }

  /**
   * Escapa HTML para prevenir XSS
   * 
   * @param {string} text
   * @returns {string}
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Manejador para limpiar clases conflictivas al hacer toggle de action bar
  $(document).on('click', '[data-toggle="action-bar"]', function() {
    const $actionBar = $(this).closest('.action-bar-wrapper').find('.action-bar');
    
    setTimeout(() => {
      if ($actionBar.hasClass('d-none') && $actionBar.hasClass('d-flex')) {
        $actionBar.removeClass('d-flex');
      }
    }, 50);
  });

  console.log('[N21 Plugin] Multi-level Action Bar loaded');
})();
