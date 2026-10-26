(async () => {
  try {
    const { loadManagers } = window._n21_;

    // Esperar a que MeasurementManager y TooltipManager estén listos
    const [MeasurementManager, TooltipManager, SettingsManager, CameraManager, PlayerManager] = await loadManagers(
      "MeasurementManager",
      "TooltipManager",
      "SettingsManager",
      "CameraManager",
      "PlayerManager",
    );

    // Check if feature is enabled
    if (!SettingsManager.get("feature.multi-measurement.enabled")) {
      return;
    }

    // Estado local de persistencia de mediciones
    let persistentMeasurements = Boolean(
      SettingsManager.get("multi-measurement.default-persistent"),
    );

    // Obtener el entity manager y hookear requestDestroy
    const entityManager = MeasurementManager.getEntityManager();
    let originalRequestDestroy = null;
    if (entityManager) {
      originalRequestDestroy =
        entityManager.requestDestroy.bind(entityManager);

      entityManager.requestDestroy = function (...args) {
        const networkId = args[0];

        const measurement = entityManager.findByNetworkId(networkId);
        const itNeverPersists = measurement?.color === "FAFAFA";

        // Mantener mediciones si persistentMeasurements está activado
        if (
          networkId &&
          typeof networkId === "string" &&
          networkId.includes("MEASUREMENT") &&
          persistentMeasurements &&
          !itNeverPersists
        ) {
          return false;
        }

        // Si no, devolver los parámetros tal cual (llamar función original)
        return originalRequestDestroy(...args);
      };
    }

    /* Borrar mediciones fijadas: con el ancla activa, el click derecho en el
       modo medición borra la medición propia que esté debajo del cursor, y
       manteniéndolo pulsado se borran las que se vayan tocando. Sin el ancla,
       el click derecho hace lo de siempre (Nivel20 borra las mediciones). */

    const HIT_TOLERANCE = 0.3; // casillas
    const CONE_HALF_ANGLE = Math.atan(0.5); // ancho igual al largo

    function distanceToSegment(p, a, b) {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSq = dx * dx + dz * dz;
      const t = lengthSq ? Math.min(Math.max(((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq, 0), 1) : 0;
      return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
    }

    function hitsMeasurement(m, p) {
      if (distanceToSegment(p, m.start, m.end) <= HIT_TOLERANCE) return true;
      if (!m.showShape) return false;
      const length = Math.hypot(m.end.x - m.start.x, m.end.z - m.start.z);
      const dx = p.x - m.start.x;
      const dz = p.z - m.start.z;
      const distance = Math.hypot(dx, dz);
      switch (m.shape) {
        case "circle":
          return distance <= length;
        case "square":
          return Math.abs(dx) <= length && Math.abs(dz) <= length;
        case "line":
          return distanceToSegment(p, m.start, m.end) <= 0.5;
        case "cone": {
          if (distance > length || !distance) return distance === 0;
          const cos = (dx * (m.end.x - m.start.x) + dz * (m.end.z - m.start.z)) / (distance * length);
          return Math.acos(Math.min(Math.max(cos, -1), 1)) <= CONE_HALF_ANGLE;
        }
        default:
          return false;
      }
    }

    function getCanvas() {
      return document.querySelector("#application-canvas");
    }

    function eraseAt(clientX, clientY) {
      const canvas = getCanvas();
      if (!canvas || !originalRequestDestroy) return;
      const rect = canvas.getBoundingClientRect();
      const point = CameraManager.screenToWorld(clientX - rect.left, clientY - rect.top, 0);
      if (!point) return;
      const me = String(PlayerManager.getMyUserId() || "");
      MeasurementManager.getMeasurements().forEach((m) => {
        if (!me || m.ownerUserId !== me || m.color === "FAFAFA") return;
        if (hitsMeasurement(m, point)) originalRequestDestroy(m.networkId);
      });
    }

    let erasing = false;

    function isEraserOn(event) {
      return (
        persistentMeasurements &&
        MeasurementManager.isActive() &&
        event.target === getCanvas()
      );
    }

    // Fase de captura en window: Nivel20 no recibe este click derecho (ni
    // borra mediciones ni gira la cámara).
    ["pointerdown", "mousedown"].forEach((type) => {
      window.addEventListener(
        type,
        (event) => {
          if (event.button !== 2 || !isEraserOn(event)) return;
          event.stopImmediatePropagation();
          event.preventDefault();
          erasing = true;
          eraseAt(event.clientX, event.clientY);
        },
        true,
      );
    });
    ["pointermove", "mousemove"].forEach((type) => {
      window.addEventListener(
        type,
        (event) => {
          if (!erasing) return;
          if (!(event.buttons & 2)) {
            erasing = false;
            return;
          }
          if (type === "pointermove") eraseAt(event.clientX, event.clientY);
        },
        true,
      );
    });
    ["pointerup", "mouseup"].forEach((type) => {
      window.addEventListener(
        type,
        (event) => {
          if (event.button !== 2 || !erasing) return;
          event.stopImmediatePropagation();
          if (type === "mouseup") erasing = false;
        },
        true,
      );
    });

    // Crear y agregar botón de persistencia en el UI
    function setupPersistenceButton() {
      const measurementDiv = document.querySelector(
        '[data-mode="measurement"]',
      );
      if (!measurementDiv) return;

      const modeTitle = measurementDiv.querySelector('[class*="mode-title"]');
      if (!modeTitle) return;

      // Evitar agregar múltiples botones
      if (
        modeTitle.nextElementSibling &&
        modeTitle.nextElementSibling.classList.contains("btn-mode-persist")
      )
        return;

      // Crear el botón
      const button = document.createElement("button");
      button.className = "btn btn-sm btn-mode-persist tooltipstered";
      button.setAttribute("title", "Fijar mediciones (click derecho sobre una para borrarla)");
      button.setAttribute("data-toggle", "tooltip");

      TooltipManager.process(button);

      // Agregar la clase inicial según el estado
      if (persistentMeasurements) {
        button.classList.add("btn-primary");
      } else {
        button.classList.add("btn-dice");
      }

      // Crear el icono
      const icon = document.createElement("i");
      icon.className = "fa fa-anchor";
      button.appendChild(icon);

      // Event listener para cambiar el estado
      button.addEventListener("click", (e) => {
        e.preventDefault();
        persistentMeasurements = !persistentMeasurements;

        // Actualizar clases del botón
        if (persistentMeasurements) {
          button.classList.remove("btn-dice");
          button.classList.add("btn-primary");
        } else {
          button.classList.remove("btn-primary");
          button.classList.add("btn-dice");
        }
      });

      // Insertar el botón como hermano de modeTitle (después de él)
      modeTitle.parentNode.insertBefore(button, modeTitle.nextSibling);
    }

    // Observar cambios en el DOM para agregar el botón cuando aparezca el elemento
    const observer = new MutationObserver(() => {
      setupPersistenceButton();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // Intentar agregar el botón inicialmente
    setupPersistenceButton();
  } catch (error) {
    window._n21_.utils.registerFeatureError("Multi Measurement", error);
  }
})();
