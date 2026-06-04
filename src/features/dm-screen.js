(async () => {
  try {
    /* =======================
       Feature: DM Screen
    ======================= */

    const { loadManagers } = window._n21_;
    const { uuid } = window._n21_?.utils || {};

    const [
      MainMenuUIManager,
      FloatingPanelManager,
      SettingsManager,
      PlayerManager,
      MarkdownEditorManager,
    ] = await loadManagers(
      "MainMenuUIManager",
      "FloatingPanelManager",
      "SettingsManager",
      "PlayerManager",
      "MarkdownEditorManager",
    );

    if (!SettingsManager.get("feature.dm-screen.enabled")) {
      return;
    }

    // DM Screen is a GM-only reference tool.
    if (!PlayerManager.isGameMaster()) {
      return;
    }

    if (!MainMenuUIManager || !FloatingPanelManager || !MarkdownEditorManager) {
      console.warn("[DM Screen] Managers not available");
      return;
    }

    const MENU_ITEM_ID = "n21-dm-screen";
    const PANEL_TITLE = "Pantalla de DM";
    const PANEL_ICON = "ft-book";
    const PANEL_COLOR = "#822020";
    const PANEL_CLASS = "n21-dm-screen-panel";
    const PANEL_STYLE =
      "min-width: 720px; min-height: 480px; width: 980px; height: 620px;";
    const STORAGE_KEY = "n21.dm-screen.cards";

    const NEW_CARD_ID = "__new__";

    const DEFAULT_CARDS = [
      {
        id: "default-setting-a-dc",
        title: "Establecer una CD",
        content:
          "| Dificultad | CD |\n| --- | --- |\n| Muy fácil | 5 |\n| Fácil | 10 |\n| Moderada | 15 |\n| Difícil | 20 |\n| Muy difícil | 25 |\n| Casi imposible | 30 |",
      },
      {
        id: "default-cover",
        title: "Cobertura",
        content:
          "| Cobertura | Efecto |\n| --- | --- |\n| Media cobertura | +2 a la CA y a las salvaciones de Destreza |\n| Tres cuartos de cobertura | +5 a la CA y a las salvaciones de Destreza |\n| Cobertura total | No puede ser objetivo directo de un ataque o conjuro |",
      },
      {
        id: "default-damage-severity",
        title: "Severidad del daño",
        content:
          "| Nivel | Revés | Peligroso | Mortal |\n| --- | --- | --- | --- |\n| 1-4 | 1d10 | 2d10 | 4d10 |\n| 5-10 | 2d10 | 4d10 | 10d10 |\n| 11-16 | 4d10 | 10d10 | 18d10 |\n| 17-20 | 10d10 | 18d10 | 24d10 |",
      },
      {
        id: "default-object-ac",
        title: "CA de objetos",
        content:
          "| Material | CA |\n| --- | --- |\n| Tela, papel, cuerda | 11 |\n| Cristal, vidrio, hielo | 13 |\n| Madera, hueso | 15 |\n| Piedra | 17 |\n| Hierro, acero | 19 |\n| Mitral | 21 |\n| Adamantina | 23 |",
      },
      {
        id: "default-object-hp",
        title: "PG de objetos",
        content:
          "| Tamaño | Frágil | Resistente |\n| --- | --- | --- |\n| Diminuto (botella, cerradura) | 2 (1d4) | 5 (2d4) |\n| Pequeño (cofre, laúd) | 3 (1d6) | 10 (3d6) |\n| Mediano (barril, candelabro) | 4 (1d8) | 18 (4d8) |\n| Grande (carro, ventana) | 5 (1d10) | 27 (5d10) |",
      },
      {
        id: "default-jumping",
        title: "Saltos",
        content:
          "**Salto de longitud**\n\nCon una carrera previa de 3 m (10 pies), saltas un número de pies hasta tu puntuación de Fuerza. Sin carrera, cubres la mitad de esa distancia.\n\n**Salto de altura**\n\nCon una carrera previa de 3 m (10 pies), saltas 3 + tu modificador de Fuerza pies hacia arriba. Sin carrera, cubres la mitad de esa altura.",
      },
      {
        id: "default-combat-actions",
        title: "Acciones en combate",
        content:
          "- **Atacar**\n- **Lanzar un conjuro**\n- **Esquivar**\n- **Destrabarse**\n- **Esconderse**\n- **Correr** (Dash)\n- **Ayudar**\n- **Preparar** una acción\n- **Usar un objeto**\n- **Buscar**",
      },
    ];

    function escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text == null ? "" : String(text);
      return div.innerHTML;
    }

    function safeJsonParse(value) {
      if (typeof value !== "string" || !value.trim()) return null;
      try {
        return JSON.parse(value);
      } catch (error) {
        return null;
      }
    }

    function getCards() {
      const raw = (() => {
        try {
          return localStorage.getItem(STORAGE_KEY);
        } catch (error) {
          console.warn("[DM Screen] Unable to read localStorage", error);
          return null;
        }
      })();

      if (raw === null) {
        // First run: seed with the default D&D cards.
        const seeded = DEFAULT_CARDS.map((card) => ({ ...card }));
        saveCards(seeded);
        return seeded;
      }

      const parsed = safeJsonParse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (card) => card && typeof card === "object",
      );
    }

    function saveCards(cards) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cards || []));
      } catch (error) {
        console.warn("[DM Screen] Unable to write localStorage", error);
      }
    }

    function newId() {
      return typeof uuid === "function" ? uuid() : `card-${Date.now()}`;
    }

    // ---- Panel state ----
    let editingId = null; // card id currently being edited, or NEW_CARD_ID
    let activeEditor = null; // EasyMDE instance for the open edit form

    function buildReadCard(card) {
      const bodyHtml = MarkdownEditorManager.render(card.content || "");
      return (
        `<div class="n21-dm-card" data-id="${escapeHtml(card.id)}" draggable="true">` +
        `<div class="n21-dm-card-actions">` +
        `<button type="button" class="n21-dm-icon-btn n21-dm-card-edit" title="Editar"><i class="fa fa-pencil"></i></button>` +
        `<button type="button" class="n21-dm-icon-btn n21-dm-card-delete" title="Borrar"><i class="ft-trash-2"></i></button>` +
        `</div>` +
        `<div class="n21-dm-card-title">${escapeHtml(card.title)}</div>` +
        `<div class="n21-dm-card-body">${bodyHtml}</div>` +
        `</div>`
      );
    }

    function destroyActiveEditor() {
      if (activeEditor) {
        MarkdownEditorManager.destroy(activeEditor);
        activeEditor = null;
      }
    }

    function renderGrid($panel) {
      const $grid = $panel.find(".n21-dm-grid");
      if (!$grid.length) return;

      destroyActiveEditor();

      const cards = getCards();
      const parts = [];

      for (const card of cards) {
        if (editingId && editingId === card.id) {
          parts.push(buildEditForm(card));
        } else {
          parts.push(buildReadCard(card));
        }
      }

      if (editingId === NEW_CARD_ID) {
        parts.push(buildEditForm({ id: NEW_CARD_ID, title: "", content: "" }));
      }

      $grid.html(parts.join(""));

      // Attach the markdown editor to the open edit form, if any.
      if (editingId) {
        const textarea = $grid.find(
          `.n21-dm-card-editing[data-id="${cssEscape(editingId)}"] .n21-dm-content-input`,
        )[0];
        if (textarea) {
          activeEditor = MarkdownEditorManager.attach(textarea);
        }
      }
    }

    function buildEditForm(card) {
      return (
        `<div class="n21-dm-card n21-dm-card-editing" data-id="${escapeHtml(card.id)}">` +
        `<input type="text" class="n21-dm-title-input" placeholder="Título" value="${escapeHtml(card.title)}" />` +
        `<textarea class="n21-dm-content-input">${escapeHtml(card.content)}</textarea>` +
        `<div class="n21-dm-edit-actions">` +
        `<button type="button" class="n21-dm-btn n21-dm-save">Guardar</button>` +
        `<button type="button" class="n21-dm-btn n21-dm-cancel">Cancelar</button>` +
        `</div>` +
        `</div>`
      );
    }

    function cssEscape(value) {
      const str = String(value);
      if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(str);
      }
      return str.replace(/["\\]/g, "\\$&");
    }

    function readEditForm($card) {
      const title = $card.find(".n21-dm-title-input").val() || "";
      const textarea = $card.find(".n21-dm-content-input")[0];
      const content = MarkdownEditorManager.getValue(activeEditor, textarea);
      return { title: title.trim(), content: content || "" };
    }

    function handleSave($panel, $card) {
      const id = $card.attr("data-id");
      const { title, content } = readEditForm($card);

      if (!title && !content.trim()) {
        // Nothing to save; just cancel.
        editingId = null;
        renderGrid($panel);
        return;
      }

      const cards = getCards();

      if (id === NEW_CARD_ID) {
        cards.push({ id: newId(), title: title || "Sin título", content });
      } else {
        const existing = cards.find((c) => c.id === id);
        if (existing) {
          existing.title = title || "Sin título";
          existing.content = content;
        }
      }

      saveCards(cards);
      editingId = null;
      renderGrid($panel);
    }

    function handleDelete($panel, $card) {
      const id = $card.attr("data-id");
      const cards = getCards();
      const target = cards.find((c) => c.id === id);
      const name = target?.title || "esta tarjeta";

      if (!window.confirm(`¿Borrar "${name}"?`)) return;

      const next = cards.filter((c) => c.id !== id);
      saveCards(next);
      if (editingId === id) editingId = null;
      renderGrid($panel);
    }

    function handleRestore($panel) {
      if (
        !window.confirm(
          "¿Restaurar las tarjetas predeterminadas? Se perderán los cambios y las tarjetas personalizadas.",
        )
      ) {
        return;
      }

      const restored = DEFAULT_CARDS.map((card) => ({ ...card }));
      saveCards(restored);
      editingId = null;
      renderGrid($panel);
    }

    function reorderCards(sourceId, targetId, after) {
      if (!sourceId || !targetId || sourceId === targetId) return;

      const cards = getCards();
      const fromIdx = cards.findIndex((c) => c.id === sourceId);
      if (fromIdx === -1) return;

      const [moved] = cards.splice(fromIdx, 1);

      let toIdx = cards.findIndex((c) => c.id === targetId);
      if (toIdx === -1) {
        cards.push(moved);
      } else {
        cards.splice(after ? toIdx + 1 : toIdx, 0, moved);
      }

      saveCards(cards);
    }

    function clearDropMarkers($panel) {
      $panel
        .find(".n21-dm-drop-before, .n21-dm-drop-after")
        .removeClass("n21-dm-drop-before n21-dm-drop-after");
    }

    function bindDragEvents($panel) {
      let draggedId = null;

      $panel.on("dragstart", ".n21-dm-card", function (e) {
        const $card = $(this);
        // Don't drag the card while it's being edited.
        if ($card.hasClass("n21-dm-card-editing")) {
          e.preventDefault();
          return;
        }
        draggedId = $card.attr("data-id");
        $card.addClass("n21-dm-dragging");
        const dt = e.originalEvent.dataTransfer;
        if (dt) {
          dt.effectAllowed = "move";
          try {
            dt.setData("text/plain", draggedId);
          } catch (error) {
            /* some browsers require setData; ignore failures */
          }
        }
      });

      $panel.on("dragend", ".n21-dm-card", function () {
        draggedId = null;
        $panel.find(".n21-dm-dragging").removeClass("n21-dm-dragging");
        clearDropMarkers($panel);
      });

      $panel.on("dragover", ".n21-dm-card", function (e) {
        if (!draggedId) return;
        const $card = $(this);
        if ($card.attr("data-id") === draggedId) return;
        e.preventDefault();
        const oe = e.originalEvent;
        if (oe.dataTransfer) oe.dataTransfer.dropEffect = "move";
        const rect = this.getBoundingClientRect();
        const after = oe.clientX > rect.left + rect.width / 2;
        clearDropMarkers($panel);
        $card.addClass(after ? "n21-dm-drop-after" : "n21-dm-drop-before");
      });

      $panel.on("dragleave", ".n21-dm-card", function () {
        $(this).removeClass("n21-dm-drop-before n21-dm-drop-after");
      });

      $panel.on("drop", ".n21-dm-card", function (e) {
        if (!draggedId) return;
        e.preventDefault();
        const $target = $(this);
        const targetId = $target.attr("data-id");
        if (!targetId || targetId === draggedId) {
          clearDropMarkers($panel);
          return;
        }
        const rect = this.getBoundingClientRect();
        const after = e.originalEvent.clientX > rect.left + rect.width / 2;
        reorderCards(draggedId, targetId, after);
        draggedId = null;
        renderGrid($panel);
      });
    }

    function bindPanelEvents($panel) {
      bindDragEvents($panel);

      // Add a new card.
      $panel.on("click", ".n21-dm-add-card", () => {
        editingId = NEW_CARD_ID;
        renderGrid($panel);
      });

      // Restore default cards.
      $panel.on("click", ".n21-dm-restore", () => {
        handleRestore($panel);
      });

      // Edit an existing card.
      $panel.on("click", ".n21-dm-card-edit", function () {
        const $card = $(this).closest(".n21-dm-card");
        editingId = $card.attr("data-id");
        renderGrid($panel);
      });

      // Delete a card.
      $panel.on("click", ".n21-dm-card-delete", function () {
        const $card = $(this).closest(".n21-dm-card");
        handleDelete($panel, $card);
      });

      // Save / cancel edit form.
      $panel.on("click", ".n21-dm-save", function () {
        const $card = $(this).closest(".n21-dm-card");
        handleSave($panel, $card);
      });

      $panel.on("click", ".n21-dm-cancel", () => {
        editingId = null;
        renderGrid($panel);
      });
    }

    function openDmScreenPanel() {
      const html =
        `<div class="n21-dm-screen">` +
        `<div class="n21-dm-toolbar">` +
        `<button type="button" class="n21-dm-btn n21-dm-add-card">+ Nueva tarjeta</button>` +
        `<button type="button" class="n21-dm-btn n21-dm-restore">Restaurar tarjetas</button>` +
        `</div>` +
        `<div class="n21-dm-grid"></div>` +
        `</div>`;

      const $panel = FloatingPanelManager.openStaticPanelWithHtml(
        PANEL_TITLE,
        PANEL_ICON,
        PANEL_COLOR,
        html,
        PANEL_CLASS,
        PANEL_STYLE,
      );

      if (!$panel || !$panel.length) return;

      // Avoid double-binding if the panel already existed.
      if (!$panel.data("n21DmBound")) {
        $panel.data("n21DmBound", true);
        editingId = null;
        bindPanelEvents($panel);
      }

      renderGrid($panel);
    }

    const header = await MainMenuUIManager.addHeader("Nivel 21", {
      id: "n21-menu-header",
    });

    await MainMenuUIManager.addItem(
      {
        id: MENU_ITEM_ID,
        title: PANEL_TITLE,
        iconClass: PANEL_ICON,
        order: 15,
        onClick: () => {
          openDmScreenPanel();
        },
      },
      {
        afterElement: header,
      },
    );
  } catch (error) {
    window._n21_.utils.registerFeatureError("DM Screen", error);
  }
})();
