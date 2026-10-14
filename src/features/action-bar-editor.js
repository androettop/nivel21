(async () => {
  try {
    /* =======================
       Feature: Action Bar Editor (Editor de barra de acciones)

       1) En la página "Editar acciones" del personaje reemplaza la lista del
          formulario nativo por un árbol donde se puede:
            - ordenar y anidar acciones/carpetas en varios niveles arrastrando,
            - crear acciones, carpetas y subcarpetas, editarlas y borrarlas,
            - mostrar/ocultar las carpetas de la extensión (conjuros, acciones,
              rasgos, inventario) y las acciones por defecto de Nivel20.
          Al guardar, el árbol se vuelve a escribir en los MISMOS campos del
          formulario nativo (carpetas de un nivel + nombres "Sub > Acción" +
          posiciones), que es lo que Nivel20 guarda. El orden/visibilidad de lo
          que Nivel20 no guarda (carpetas de la extensión, acciones por
          defecto, armas) se guarda por personaje en este navegador.

       2) En cualquier barra de acciones del personaje aplica ese orden.
    ======================= */

    const { loadManagers } = window._n21_;

    const [ActionBarManager, CharacterSheetManager, SettingsManager] = await loadManagers(
      "ActionBarManager",
      "CharacterSheetManager",
      "SettingsManager",
    );

    if (!SettingsManager.get("feature.action-bar-editor.enabled")) {
      return;
    }

    const layoutApi = window._n21_.actionBarLayout;
    if (!layoutApi) return;

    /* ----------------------- apply the layout to bars ----------------------- */

    function resolveCharacterId(element) {
      try {
        const bar = $(element).closest(".action-bar")[0];
        const match = (bar?.getAttribute("data-sender-info") || "").match(/Character-(\d+)/);
        return match ? match[1] : null;
      } catch (_error) {
        return null;
      }
    }

    // After the injecting features (50-80), before multi-level (100).
    ActionBarManager.onCreateBar(
      "action-bar-layout",
      (element, items, parentItem = null) => {
        if (parentItem !== null || !Array.isArray(items)) return;
        const charId = resolveCharacterId(element);
        if (charId) layoutApi.apply(items, charId);
      },
      { priority: 90 },
    );

    /* ----------------------- editor page ----------------------- */

    const EDIT_PATH_RE = /\/characters\/(\d+)[^/]*\/edit_actionbar\/?$/;
    const pathMatch = EDIT_PATH_RE.exec(window.location.pathname);
    if (!pathMatch) return;
    const charId = pathMatch[1];

    const form = await waitFor(() => document.querySelector('form[action$="/update_actions"]'));
    const nativeEditor = form?.querySelector(".actions-editor");
    if (!form || !nativeEditor) return;

    const DEFAULT_IDS = new Set(["skill-checks", "saving-throws"]);
    const FIELDS = [
      "name",
      "icon_text",
      "icon_id",
      "description",
      "action_type",
      "dice_roll",
      "roll_type",
      "roll_name",
    ];
    const TOP_PREFIX_RE = /^character\[actionbar_actions_attributes\]\[[^\]]+\]$/;

    function waitFor(fn, timeout = 10000) {
      return new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          const value = fn();
          if (value || Date.now() - start > timeout) resolve(value || null);
          else setTimeout(tick, 100);
        };
        tick();
      });
    }

    function escapeHtml(value) {
      const div = document.createElement("div");
      div.textContent = String(value ?? "");
      return div.innerHTML;
    }

    /* ---------- native form fragments (cocoon nested fields) ---------- */

    function prefixOf(frag) {
      const input = frag?.querySelector('input[name$="[name]"]');
      return input ? input.name.slice(0, -"[name]".length) : null;
    }

    function fieldOf(frag, key) {
      const prefix = prefixOf(frag);
      if (!prefix) return null;
      return form.querySelector(`[name="${CSS.escape(`${prefix}[${key}]`)}"]`);
    }

    function isTopFrag(frag) {
      return TOP_PREFIX_RE.test(prefixOf(frag) || "");
    }

    function isChildOf(frag, folderFrag) {
      const prefix = prefixOf(frag) || "";
      const parent = prefixOf(folderFrag) || "";
      return !!parent && prefix.startsWith(`${parent}[actions_attributes]`);
    }

    function recordId(frag) {
      return fieldOf(frag, "id")?.value || null;
    }

    function readFields(frag) {
      const data = {};
      FIELDS.forEach((key) => {
        const field = fieldOf(frag, key);
        if (field) data[key] = field.value;
      });
      const preview = frag.querySelector(".select-icon.icon-preview .icon-content, .select-icon.icon-preview");
      data.iconStyle = frag.querySelector(".select-icon.icon-preview")?.getAttribute("style") || "";
      data.iconHtml = preview ? frag.querySelector(".select-icon.icon-preview")?.innerHTML : "";
      return data;
    }

    function writeField(frag, key, value) {
      const field = fieldOf(frag, key);
      if (!field || value === undefined || value === null) return;
      if (field.tagName === "SELECT") {
        const allowed = [...field.options].some((o) => o.value === String(value));
        if (!allowed) return;
        $(field).val(String(value)).trigger("change");
      } else {
        field.value = String(value);
      }
    }

    function copyFields(from, to, overrides = {}) {
      const data = { ...readFields(from), ...overrides };
      FIELDS.forEach((key) => writeField(to, key, data[key]));
      // Keep the chosen icon preview in sync with the copied icon_id.
      const preview = to.querySelector(".select-icon.icon-preview");
      if (preview && data.iconStyle) preview.setAttribute("style", data.iconStyle);
      if (preview && data.iconHtml) preview.innerHTML = data.iconHtml;
    }

    function destroyFrag(frag) {
      if (!frag) return;
      if (recordId(frag)) {
        const destroy = fieldOf(frag, "_destroy");
        if (destroy) destroy.value = "1";
        frag.style.display = "none";
        frag.classList.add("n21-abe-destroyed");
        nativeEditor.appendChild(frag);
      } else {
        frag.remove();
      }
    }

    function topFragments() {
      return [...nativeEditor.querySelectorAll(".action-button-form.nested-fields")].filter(
        (frag) => isTopFrag(frag) && !frag.classList.contains("n21-abe-destroyed"),
      );
    }

    function childFragments(folderFrag) {
      return [...form.querySelectorAll(".action-button-form.nested-fields")].filter(
        (frag) => isChildOf(frag, folderFrag) && !frag.classList.contains("n21-abe-destroyed"),
      );
    }

    function createTopFrag(type = "dice_roll") {
      const before = new Set(topFragments());
      nativeEditor.querySelector('a.add_fields[data-association="actionbar_action"]')?.click();
      const frag = topFragments().find((f) => !before.has(f)) || null;
      if (frag) writeField(frag, "action_type", type);
      return frag;
    }

    function createChildFrag(folderFrag) {
      const before = new Set(childFragments(folderFrag));
      folderFrag.querySelector('a.add_fields[data-association="action"]')?.click();
      return childFragments(folderFrag).find((f) => !before.has(f)) || null;
    }

    /* ---------- tree model ---------- */

    let uidCounter = 0;
    let loadProblems = false;
    const nodes = new Map(); // uid -> node
    let root = [];
    const removedFrags = [];

    function makeNode(data) {
      const node = {
        uid: `n${(uidCounter += 1)}`,
        kind: "native", // native | default | item | ext | sub (folder without record)
        type: "dice_roll", // dice_roll | none | folder
        label: "",
        icon: "",
        frag: null,
        key: null,
        enabled: true,
        collapsed: false,
        children: [],
        ...data,
      };
      nodes.set(node.uid, node);
      return node;
    }

    function nativeLabel(frag) {
      return String(fieldOf(frag, "name")?.value || "").split(" > ").pop().trim() || "Sin nombre";
    }

    /**
     * Build nested nodes from native items whose names may contain paths
     * ("Sub > Hija"). A "none" item named exactly like a sub-folder path is
     * that sub-folder's placeholder (keeps its icon and position).
     */
    function buildLevel(entries) {
      const level = [];
      const paths = new Set();
      entries.forEach(({ name }) => {
        const parts = name.split(" > ").map((p) => p.trim());
        for (let i = 1; i < parts.length; i += 1) paths.add(parts.slice(0, i).join(" > "));
      });

      const folderAt = (pathParts) => {
        let current = level;
        let folder = null;
        pathParts.forEach((part, i) => {
          const path = pathParts.slice(0, i + 1).join(" > ");
          folder = current.find((n) => n.type === "folder" && n.path === path);
          if (!folder) {
            folder = makeNode({ kind: "sub", type: "folder", label: part, path });
            current.push(folder);
          }
          current = folder.children;
        });
        return folder;
      };

      entries.forEach((entry) => {
        const parts = entry.name.split(" > ").map((p) => p.trim());
        if (entry.type === "none" && paths.has(parts.join(" > "))) {
          // Placeholder: becomes (or gives its icon to) the sub-folder.
          const folder = folderAt(parts);
          folder.frag = entry.frag;
          folder.icon = entry.icon || folder.icon;
          return;
        }
        const parent = parts.length > 1 ? folderAt(parts.slice(0, -1)).children : level;
        parent.push(entry.node);
      });
      return level;
    }

    async function buildModel() {
      let phActions = [];
      loadProblems = false;
      try {
        // Shared (cached) request with the spell/trait providers.
        const ph = await CharacterSheetManager.fetchCharacter(`/characters/${charId}.json`);
        phActions = Array.isArray(ph?.actions) ? ph.actions : [];
      } catch (_error) {
        loadProblems = true;
      }
      const iconById = new Map();
      phActions.forEach((a) => {
        iconById.set(String(a.id), a.icon);
        (a.elements || []).forEach((e) => iconById.set(String(e.id), e.icon));
      });

      const hiddenSelect = form.querySelector("#character_hidden_actions");
      const hiddenDefaults = new Set($(hiddenSelect).val() || []);

      // Native records (from the form, in their order).
      const fragEntries = topFragments().map((frag) => {
        const data = readFields(frag);
        const id = recordId(frag);
        const node = makeNode({
          kind: "native",
          type: data.action_type || "dice_roll",
          label: nativeLabel(frag),
          icon: iconById.get(String(id)) || "",
          frag,
          key: id ? `native:${id}` : null,
        });
        if (node.type === "folder") {
          const childEntries = childFragments(frag).map((child) => {
            const childData = readFields(child);
            const childId = recordId(child);
            return {
              name: childData.name || "",
              type: childData.action_type || "dice_roll",
              frag: child,
              icon: iconById.get(String(childId)) || "",
              node: makeNode({
                kind: "native",
                type: childData.action_type || "dice_roll",
                label: nativeLabel(child),
                icon: iconById.get(String(childId)) || "",
                frag: child,
              }),
            };
          });
          node.children = buildLevel(childEntries);
        }
        return { name: data.name || "", type: node.type, frag, icon: node.icon, node, id };
      });
      const nativeLevel = buildLevel(fragEntries);

      // Everything Nivel20 renders that isn't a custom record.
      const others = phActions
        .filter((a) => !/^\d+$/.test(String(a.id)))
        .map((a) =>
          makeNode({
            kind: DEFAULT_IDS.has(String(a.id)) ? "default" : "item",
            type: a.action_type === "folder" ? "folder" : a.action_type || "dice_roll",
            label: a.name,
            icon: a.icon || "",
            key: `native:${a.id}`,
            nativeId: String(a.id),
            enabled: !hiddenDefaults.has(String(a.id)),
          }),
        );

      // Folders injected by the extension.
      const layout = layoutApi.getLayout(charId);
      const hiddenExt = new Set(layout?.hidden || []);
      const ext = (await layoutApi.getProviderEntries(charId)).map((e) =>
        makeNode({
          kind: "ext",
          type: "folder",
          label: e.label,
          icon: e.icon || "",
          key: e.key,
          extOrder: e.order,
          enabled: !hiddenExt.has(e.key),
        }),
      );

      // Default order = how the bar renders today: spells first, then
      // Nivel20's items, then the other extension folders.
      root = [
        ...ext.filter((n) => n.extOrder < 20),
        ...nativeLevel,
        ...others,
        ...ext.filter((n) => n.extOrder >= 20),
      ];

      if (layout?.order?.length) {
        const rank = (n) => {
          const key = n.key || (n.kind === "sub" ? null : `native-name:${n.label}`);
          let r = key ? layout.order.indexOf(key) : -1;
          if (r === -1 && n.label) r = layout.order.indexOf(`native-name:${n.label}`);
          return r === -1 ? Infinity : r;
        };
        root = root
          .map((n, i) => ({ n, i, r: rank(n) }))
          .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
          .map((x) => x.n);
      }
    }

    /* ---------- helpers on the tree ---------- */

    function findParent(uid, list = root, parent = null) {
      for (const node of list) {
        if (node.uid === uid) return { parent, list };
        const found = findParent(uid, node.children, node);
        if (found) return found;
      }
      return null;
    }

    function isDescendant(ancestor, uid) {
      return ancestor.children.some((c) => c.uid === uid || isDescendant(c, uid));
    }

    function detach(uid) {
      const location = findParent(uid);
      if (!location) return null;
      const index = location.list.findIndex((n) => n.uid === uid);
      return location.list.splice(index, 1)[0];
    }

    function canNest(node) {
      return node.kind === "native" || node.kind === "sub";
    }

    // Only the user's own actions/folders (and sub-folders) take icons;
    // folders from the extension and Nivel20's defaults keep theirs.
    function canEditIcon(node) {
      return node.kind === "native" || node.kind === "sub";
    }

    /* ---------- rendering ---------- */

    let $card = null;
    let openUid = null;

    function typeBadge(node) {
      if (node.kind === "ext") return "Nivel21";
      if (node.kind === "default") return "Por defecto";
      if (node.kind === "item") return node.type === "folder" ? "Equipo" : "Arma";
      if (node.type === "folder") return node.kind === "sub" ? "Subcarpeta" : "Carpeta";
      if (node.type === "none") return "Sin acción";
      const roll = node.frag ? fieldOf(node.frag, "dice_roll")?.value : "";
      return roll ? `Tirada ${roll}` : "Tirada";
    }

    function iconStyle(node) {
      if (node.icon) return `background-image: url('${encodeURI(node.icon)}')`;
      // The native picker writes the chosen icon on .icon-content.
      const content = node.frag?.querySelector(".select-icon .icon-content");
      const image = content?.style?.backgroundImage;
      return image && image !== "none" ? `background-image: ${image}` : "";
    }

    function renderNode(node) {
      const isFolder = node.type === "folder";
      const editable = node.kind === "native" || node.kind === "sub";
      const toggle =
        node.kind === "ext" || node.kind === "default"
          ? `<label class="n21-abe-toggle" title="Mostrar en la barra">
               <input type="checkbox" class="n21-abe-enabled" ${node.enabled ? "checked" : ""} />
               <span>Visible</span>
             </label>`
          : "";
      const iconAttrs = canEditIcon(node)
        ? 'role="button" tabindex="0" title="Cambiar icono"'
        : "";
      const nameAttrs = editable ? 'role="button" tabindex="0" title="Renombrar"' : "";
      return `
        <li class="n21-abe-node ${isFolder ? "n21-abe-folder" : ""} ${
          node.enabled ? "" : "n21-abe-disabled"
        } ${openUid === node.uid ? "n21-abe-open" : ""}" data-uid="${node.uid}">
          <div class="n21-abe-box">
            <div class="n21-abe-row" draggable="true">
              <span class="n21-abe-handle" aria-hidden="true">⠿</span>
              ${
                isFolder && editable
                  ? `<button type="button" class="n21-abe-collapse" aria-label="${
                      node.collapsed ? "Expandir" : "Contraer"
                    }">${node.collapsed ? "▸" : "▾"}</button>`
                  : `<span class="n21-abe-collapse-spacer"></span>`
              }
              <span class="n21-abe-icon ${canEditIcon(node) ? "n21-abe-icon--editable" : ""}" style="${escapeHtml(
                iconStyle(node),
              )}" ${iconAttrs}></span>
              <span class="n21-abe-name ${editable ? "n21-abe-name--editable" : ""}" ${nameAttrs}>${escapeHtml(
                node.label,
              )}</span>
              <span class="n21-abe-badge">${escapeHtml(typeBadge(node))}</span>
              <span class="n21-abe-actions">
                ${toggle}
                ${
                  isFolder && editable
                    ? `<button type="button" class="n21-abe-btn n21-abe-add-child" title="Añadir acción dentro">+ Acción</button>
                       <button type="button" class="n21-abe-btn n21-abe-add-sub" title="Añadir subcarpeta dentro">+ Carpeta</button>`
                    : ""
                }
                ${
                  node.kind === "native"
                    ? `<button type="button" class="n21-abe-btn n21-abe-edit" aria-expanded="${
                        openUid === node.uid
                      }">${openUid === node.uid ? "Cerrar" : "Editar"}</button>`
                    : ""
                }
                ${editable ? `<button type="button" class="n21-abe-btn n21-abe-delete" title="Eliminar">✕</button>` : ""}
              </span>
              <span class="n21-abe-confirm" hidden>
                <span>¿Eliminar${node.children.length ? " con su contenido" : ""}?</span>
                <button type="button" class="n21-abe-btn n21-abe-confirm-yes">Eliminar</button>
                <button type="button" class="n21-abe-btn n21-abe-confirm-no">Cancelar</button>
              </span>
            </div>
            <div class="n21-abe-details" ${openUid === node.uid ? "" : "hidden"}></div>
          </div>
          ${
            isFolder && editable
              ? `<ul class="n21-abe-children" ${node.collapsed ? "hidden" : ""}>${node.children
                  .map(renderNode)
                  .join("")}</ul>`
              : ""
          }
        </li>`;
    }

    function render() {
      // Take edited fragments out before re-rendering so they aren't lost.
      $card.find(".n21-abe-details > .action-button-form").each(function () {
        this.style.display = "none";
        nativeEditor.appendChild(this);
      });
      $card.find(".n21-abe-tree").html(root.map(renderNode).join(""));
      if (openUid) openDetails(openUid);
    }

    function openDetails(uid) {
      const node = nodes.get(uid);
      const $details = $card.find(`.n21-abe-node[data-uid="${uid}"] > .n21-abe-box > .n21-abe-details`);
      if (!node || !$details.length) return;
      openUid = uid;
      $details.prop("hidden", false).empty();

      const frag = node.frag;
      if (!frag) return;
      frag.style.display = "";
      $details.append(frag);
      // Expand the native accordion body.
      $(frag).find(".accordion-content").addClass("show in");
      // Show only the leaf name while editing; the path is rebuilt on save.
      const nameField = fieldOf(frag, "name");
      if (nameField) nameField.value = node.label;
    }

    function closeDetails() {
      if (!openUid) return;
      const $details = $card.find(`.n21-abe-node[data-uid="${openUid}"] > .n21-abe-box > .n21-abe-details`);
      $details.find("> .action-button-form").each(function () {
        this.style.display = "none";
        nativeEditor.appendChild(this);
      });
      $details.prop("hidden", true).empty();
      openUid = null;
    }

    /* ---------- actions ---------- */

    function addNode(parentUid, type) {
      let node;
      if (type === "sub") {
        node = makeNode({ kind: "sub", type: "folder", label: "Nueva carpeta" });
      } else {
        const frag = createTopFrag(type);
        if (!frag) return;
        writeField(frag, "name", type === "folder" ? "Nueva carpeta" : "Nueva acción");
        frag.style.display = "none";
        node = makeNode({
          kind: "native",
          type,
          label: type === "folder" ? "Nueva carpeta" : "Nueva acción",
          frag,
        });
      }
      const parent = parentUid ? nodes.get(parentUid) : null;
      (parent ? parent.children : root).push(node);
      if (parent) parent.collapsed = false;
      openUid = node.kind === "native" ? node.uid : null;
      render();
    }

    function deleteNode(uid) {
      const node = nodes.get(uid);
      if (!node) return;
      if (openUid) closeDetails();
      const collect = (n) => {
        if (n.frag) removedFrags.push(n.frag);
        n.children.forEach(collect);
      };
      collect(node);
      detach(uid);
      render();
    }

    /* ---------- drag & drop ---------- */

    let dragUid = null;

    function dropPosition(event, rowEl, node) {
      const rect = rowEl.getBoundingClientRect();
      const y = (event.clientY - rect.top) / rect.height;
      const canInto =
        node.type === "folder" && (node.kind === "native" || node.kind === "sub") && canNest(nodes.get(dragUid));
      if (canInto && y > 0.3 && y < 0.7) return "into";
      return y < 0.5 ? "before" : "after";
    }

    function moveNode(targetUid, position) {
      const dragged = nodes.get(dragUid);
      const target = nodes.get(targetUid);
      if (!dragged || !target || dragged === target) return;
      if (isDescendant(dragged, targetUid)) return; // into itself
      const targetLocation = findParent(targetUid);
      // Only Nivel20's own records can live inside folders.
      const destinationParent = position === "into" ? target : targetLocation?.parent;
      if (destinationParent && !canNest(dragged)) return;

      detach(dragged.uid);
      if (position === "into") {
        target.children.push(dragged);
        target.collapsed = false;
      } else {
        const location = findParent(targetUid);
        const index = location.list.findIndex((n) => n.uid === targetUid);
        location.list.splice(position === "before" ? index : index + 1, 0, dragged);
      }
      render();
    }

    function bindEvents() {
      $card.on("click", ".n21-abe-add-root", () => addNode(null, "dice_roll"));
      $card.on("click", ".n21-abe-add-root-folder", () => addNode(null, "folder"));
      $card.on("click", ".n21-abe-add-child", function () {
        addNode($(this).closest(".n21-abe-node").attr("data-uid"), "dice_roll");
      });
      $card.on("click", ".n21-abe-add-sub", function () {
        addNode($(this).closest(".n21-abe-node").attr("data-uid"), "sub");
      });
      $card.on("click", ".n21-abe-edit", function () {
        const uid = $(this).closest(".n21-abe-node").attr("data-uid");
        if (openUid === uid) closeDetails();
        else {
          closeDetails();
          openUid = uid;
        }
        render();
      });

      // Click the icon: Nivel20's own icon picker for that action/folder.
      $card.on("click keydown", ".n21-abe-icon--editable", function (event) {
        if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        const node = nodes.get($(this).closest(".n21-abe-node").attr("data-uid"));
        if (!node) return;
        if (!node.frag && node.kind === "sub") {
          // A sub-folder's icon lives in a "Sin acción" placeholder.
          node.frag = createTopFrag("none");
          if (node.frag) writeField(node.frag, "name", node.label);
        }
        $(node.frag).find(".select-icon").first().trigger("click");
      });
      // The picker writes the icon id and fires "change": refresh the rows.
      // (it paints the preview right after the event, so wait a tick).
      $(form).on("change", ".icon-input", () => setTimeout(render, 0));

      // Click the name: rename in place.
      $card.on("click keydown", ".n21-abe-name--editable", function (event) {
        if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        const $name = $(this);
        const node = nodes.get($name.closest(".n21-abe-node").attr("data-uid"));
        if (!node) return;
        const $input = $(
          `<input type="text" class="n21-abe-rename" maxlength="80" aria-label="Nombre" />`,
        ).val(node.label);
        $name.replaceWith($input);
        $input.trigger("focus").trigger("select");
        let done = false;
        const finish = (save) => {
          if (done) return;
          done = true;
          const value = String($input.val() || "").replace(/>/g, "").trim();
          if (save && value) {
            node.label = value;
            if (node.frag && node.kind === "native") writeField(node.frag, "name", value);
          }
          render();
        };
        $input.on("keydown", (e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            finish(true);
          } else if (e.key === "Escape") {
            finish(false);
          }
        });
        $input.on("blur", () => finish(true));
      });
      // Don't start a drag from the rename field.
      $card.on("mousedown", ".n21-abe-rename", (event) => event.stopPropagation());
      // Inline confirmation (Nivel20 replaces window.confirm with its own
      // asynchronous dialogs).
      $card.on("click", ".n21-abe-delete", function () {
        const $row = $(this).closest(".n21-abe-row");
        $row.find("> .n21-abe-actions").prop("hidden", true);
        $row.find("> .n21-abe-confirm").prop("hidden", false);
        $row.find(".n21-abe-confirm-no").trigger("focus");
      });
      $card.on("click", ".n21-abe-confirm-no", function () {
        const $row = $(this).closest(".n21-abe-row");
        $row.find("> .n21-abe-confirm").prop("hidden", true);
        $row.find("> .n21-abe-actions").prop("hidden", false);
      });
      $card.on("click", ".n21-abe-confirm-yes", function () {
        deleteNode($(this).closest(".n21-abe-node").attr("data-uid"));
      });
      $card.on("click", ".n21-abe-collapse", function () {
        const node = nodes.get($(this).closest(".n21-abe-node").attr("data-uid"));
        if (!node) return;
        node.collapsed = !node.collapsed;
        render();
      });
      $card.on("change", ".n21-abe-enabled", function () {
        const node = nodes.get($(this).closest(".n21-abe-node").attr("data-uid"));
        if (!node) return;
        node.enabled = this.checked;
        $(this).closest(".n21-abe-node").toggleClass("n21-abe-disabled", !node.enabled);
      });
      // Keep labels/types in sync while editing the native fields.
      $card.on("input change", ".n21-abe-details input, .n21-abe-details select", function () {
        const $node = $(this).closest(".n21-abe-node");
        const node = nodes.get($node.attr("data-uid"));
        if (!node) return;
        if (this.name?.endsWith("[name]")) {
          node.label = this.value.split(" > ").pop().trim() || "Sin nombre";
        } else if (this.name?.endsWith("[action_type]")) {
          const wasFolder = node.type === "folder";
          node.type = this.value;
          if (wasFolder !== (node.type === "folder")) {
            render();
            return;
          }
        }
        $node.find("> .n21-abe-box > .n21-abe-row .n21-abe-name").text(node.label);
        $node.find("> .n21-abe-box > .n21-abe-row .n21-abe-badge").text(typeBadge(node));
      });

      $card.on("dragstart", ".n21-abe-row", function (event) {
        dragUid = $(this).closest(".n21-abe-node").attr("data-uid");
        event.originalEvent.dataTransfer.effectAllowed = "move";
        event.originalEvent.dataTransfer.setData("text/plain", dragUid);
        $(this).closest(".n21-abe-node").addClass("n21-abe-dragging");
      });
      $card.on("dragend", ".n21-abe-row", function () {
        dragUid = null;
        $card.find(".n21-abe-dragging").removeClass("n21-abe-dragging");
        $card.find(".n21-abe-drop-before, .n21-abe-drop-after, .n21-abe-drop-into").removeClass(
          "n21-abe-drop-before n21-abe-drop-after n21-abe-drop-into",
        );
      });
      $card.on("dragover", ".n21-abe-row", function (event) {
        if (!dragUid) return;
        const node = nodes.get($(this).closest(".n21-abe-node").attr("data-uid"));
        if (!node || node.uid === dragUid) return;
        event.preventDefault();
        const position = dropPosition(event.originalEvent, this, node);
        $(this)
          .removeClass("n21-abe-drop-before n21-abe-drop-after n21-abe-drop-into")
          .addClass(`n21-abe-drop-${position}`);
      });
      $card.on("dragleave", ".n21-abe-row", function () {
        $(this).removeClass("n21-abe-drop-before n21-abe-drop-after n21-abe-drop-into");
      });
      $card.on("drop", ".n21-abe-row", function (event) {
        event.preventDefault();
        const node = nodes.get($(this).closest(".n21-abe-node").attr("data-uid"));
        if (!node || !dragUid) return;
        const position = dropPosition(event.originalEvent, this, node);
        moveNode(node.uid, position);
      });

      // Typing in the editor shouldn't trigger page shortcuts.
      $card.on("keydown", "input, textarea", (event) => event.stopPropagation());
    }

    /* ---------- save: write the tree back into the native form ---------- */

    function ensureTop(frag, type) {
      if (frag && isTopFrag(frag)) {
        writeField(frag, "action_type", type);
        return frag;
      }
      const created = createTopFrag(type);
      if (frag) {
        copyFields(frag, created, { action_type: type });
        destroyFrag(frag);
      }
      return created;
    }

    function ensureChild(frag, folderFrag, type) {
      if (frag && isChildOf(frag, folderFrag)) {
        writeField(frag, "action_type", type);
        return frag;
      }
      const created = createChildFrag(folderFrag);
      if (!created) return null;
      if (frag) {
        copyFields(frag, created, { action_type: type });
        destroyFrag(frag);
      } else {
        writeField(created, "action_type", type);
      }
      return created;
    }

    /** A new sub-folder icon placeholder without an icon: drop it. */
    function dropIfEmptyHolder(frag) {
      if (!frag || recordId(frag) || fieldOf(frag, "icon_id")?.value) return frag;
      destroyFrag(frag);
      return null;
    }

    function serialize() {
      closeDetails();
      removedFrags.forEach(destroyFrag);
      removedFrags.length = 0;

      let topOrder = 0;
      const order = [];

      root.forEach((node) => {
        if (node.kind === "ext" || node.kind === "default" || node.kind === "item") {
          order.push(node.key);
          return;
        }

        if (node.type !== "folder") {
          const frag = ensureTop(node.frag, node.type);
          node.frag = frag;
          writeField(frag, "name", node.label);
          writeField(frag, "order", (topOrder += 1));
          const id = recordId(frag);
          order.push(id ? `native:${id}` : `native-name:${node.label}`);
          return;
        }

        if (node.kind === "sub") node.frag = dropIfEmptyHolder(node.frag);
        const folderFrag = ensureTop(node.frag, "folder");
        node.frag = folderFrag;
        writeField(folderFrag, "name", node.label);
        writeField(folderFrag, "order", (topOrder += 1));
        const id = recordId(folderFrag);
        order.push(id ? `native:${id}` : `native-name:${node.label}`);

        let childOrder = 0;
        const walk = (children, prefix) => {
          children.forEach((child) => {
            if (child.type === "folder") {
              const path = `${prefix}${child.label}`;
              // A placeholder keeps the sub-folder's icon and position.
              child.frag = dropIfEmptyHolder(child.frag);
              if (child.frag) {
                child.frag = ensureChild(child.frag, folderFrag, "none");
                writeField(child.frag, "name", path);
                writeField(child.frag, "order", (childOrder += 1));
              }
              walk(child.children, `${path} > `);
              return;
            }
            child.frag = ensureChild(child.frag, folderFrag, child.type);
            if (!child.frag) return;
            writeField(child.frag, "name", `${prefix}${child.label}`);
            writeField(child.frag, "order", (childOrder += 1));
          });
        };
        walk(node.children, "");
      });

      // Defaults hidden through Nivel20's own field.
      const hiddenSelect = form.querySelector("#character_hidden_actions");
      if (hiddenSelect) {
        const hidden = root
          .filter((n) => n.kind === "default" && !n.enabled)
          .map((n) => n.nativeId);
        $(hiddenSelect).val(hidden).trigger("change");
      }

      // What Nivel20 can't store: saved for this character in this browser.
      // Entries that couldn't be loaded this time keep their previous state.
      const previous = layoutApi.getLayout(charId) || { order: [], hidden: [] };
      const shown = new Set(root.map((n) => n.key).filter(Boolean));
      const hidden = root.filter((n) => n.kind === "ext" && !n.enabled).map((n) => n.key);
      previous.hidden.forEach((key) => {
        if (!shown.has(key) && !hidden.includes(key)) hidden.push(key);
      });
      previous.order.forEach((key) => {
        if (!shown.has(key) && !order.includes(key)) order.push(key);
      });
      layoutApi.saveLayout(charId, { order, hidden });
    }

    form.addEventListener(
      "submit",
      () => {
        try {
          serialize();
        } catch (error) {
          window._n21_.utils.registerFeatureError("Action Bar Editor", error);
        }
      },
      true,
    );

    /* ---------- mount ---------- */

    await buildModel();

    const nativeCard = nativeEditor.closest(".card");
    $card = $(`
      <div class="card n21-abe">
        <div class="card-header">
          <h4 class="card-title mb-0"><span>Barra de acciones</span></h4>
          <div class="header-actions">
            <button type="button" class="btn btn-sm btn-primary n21-abe-add-root">+ Acción</button>
            <button type="button" class="btn btn-sm btn-outline-primary n21-abe-add-root-folder">+ Carpeta</button>
          </div>
        </div>
        <p class="n21-abe-help">
          Arrastra los elementos para ordenarlos o suéltalos en el centro de una carpeta para meterlos dentro
          (puedes anidar carpetas en varios niveles). Las carpetas de Nivel21 y las acciones por defecto se
          pueden ocultar. Los cambios se aplican al pulsar «Actualizar Personaje».
        </p>
        ${
          loadProblems
            ? `<p class="n21-abe-warning">No se pudieron cargar todos los datos del personaje (Nivel20 limitó las consultas). Algunas carpetas pueden faltar: recarga la página en unos segundos antes de reorganizarlas.</p>`
            : ""
        }
        <ul class="n21-abe-tree"></ul>
      </div>`);
    nativeCard.parentElement.insertBefore($card[0], nativeCard);
    // The native list stays in the page (it's what gets submitted) but hidden.
    nativeEditor.classList.add("n21-abe-native-hidden");
    form.querySelector("#character_hidden_actions")?.closest(".card")?.classList.add("n21-abe-native-hidden");

    bindEvents();
    render();
  } catch (error) {
    window._n21_.utils.registerFeatureError("Action Bar Editor", error);
  }
})();
