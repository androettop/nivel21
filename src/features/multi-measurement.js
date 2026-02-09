(async () => {
  try {
    const { loadManagers, settingsLoader } = window._n21_;
    
    // Wait for settings to load
    await settingsLoader.load();
    
    // Check if feature is enabled
    if (!settingsLoader.isFeatureEnabled('multi-measurement')) {
      console.log('N21: Feature Multi-measurement is disabled');
      return;
    }

    // Esperar a que MeasurementManager y TooltipManager estén listos
    const [MeasurementManager, TooltipManager] = await loadManagers(
      "MeasurementManager",
      "TooltipManager",
    );

    // Estado local de persistencia de mediciones
    let persistentMeasurements = false;

    // Obtener el entity manager y hookear requestDestroy
    const entityManager = MeasurementManager.getEntityManager();
    if (entityManager) {
      const originalRequestDestroy = entityManager.requestDestroy.bind(entityManager);

      entityManager.requestDestroy = function (...args) {
        const firstParam = args[0];

        // Mantener mediciones si persistentMeasurements está activado
        if (
          firstParam &&
          typeof firstParam === "string" &&
          firstParam.includes("MEASUREMENT") &&
          persistentMeasurements
        ) {
          return false;
        }

        // Si no, devolver los parámetros tal cual (llamar función original)
        return originalRequestDestroy(...args);
      };
    }

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
      button.setAttribute("title", "Persistir mediciones");
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
    console.warn("N21: Error en feature Multi Measurement:", error.message);
  }
})();
