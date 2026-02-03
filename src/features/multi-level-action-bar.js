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

    // índice global de items `none` reutilizables
    const noneIndex = new Map();

    /**
     * Indexa recursivamente items de tipo `none`
     * @param {Array<Object>} list
     */
    function indexNoneItems(list) {
      for (const item of list) {
        if (item.action_type === "none") {
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
              action_type: "folder",
              elements: []
            };
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
          name: finalName
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
          name: finalName
        };

        insertIntoTree(target, parts, clonedItem);
      }
    }

    walk(items);
    return root;
  }

  // Importar funciones de core
  const { uuid } = window._n21_ || {};

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
      if(!$(element).hasClass('d-flex')) {
        $(element).addClass('d-flex');
      }
      if(!$(element).hasClass('flex-column-reverse')) {
        $(element).addClass('flex-column-reverse');
      }
    }

    // Elemento base donde todos los divs de carpetas serán hermanos
    const $baseElement = $(element);
    
    if (parentItem === null) {
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

      // Si es un folder, agregar evento de click
      if (isFolder(item)) {
        $itemElement.on('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Remover clase selected de otros folders en el mismo contenedor
          $container.find('.action-bar-element .action-bar-button.selected').removeClass('selected');
          
          // Agregar clase selected al botón clickeado
          $itemElement.find('.action-bar-button').addClass('selected');
          
          // Llamar recursivamente a createBar con los elementos del folder
          // Incrementar la profundidad para el siguiente nivel
          window.createBar($baseElement, item.elements, item, depth + 1);
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

    // Determinar clases de indicadores según el tipo
    const isItemFolder = isFolder(item);
    const indicatorClasses = isItemFolder 
      ? 'indicator-icon fa fa-chevron-down'
      : 'indicator-icon d-none';
    const selectedIndicatorClasses = isItemFolder
      ? 'selected-indicator-icon fa fa-chevron-up'
      : 'selected-indicator-icon d-none';

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
          <span class="action-bar-short-name"></span>
          <span class="action-bar-name">${escapeHtml(item.name)}</span>
        </div>
        <div class="action-bar-indicator">
          <i class="${indicatorClasses}"></i>
          <i class="${selectedIndicatorClasses}"></i>
        </div>
        <div class="action-bar-frame"></div>
      </div>
    `;

    $itemEl.html(html);

    // Agregar tooltip si existe
    if (item.tooltip_title) {
      $itemEl.find('.action-bar-button').attr('title', item.tooltip_title);
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

  console.log('[N21 Plugin] Multi-level Action Bar loaded');
})();
