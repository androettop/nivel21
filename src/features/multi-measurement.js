(() => {
	// Constante interna para acceder al prototipo del entity manager
	const entityManagerProto = fogOfWar.wallsManager.entityManager.__proto__;

    // Estado global de n21
    const n21State = window._n21_.state;


	// Guardar el método original
	const originalRequestDestroy = entityManagerProto.requestDestroy;

	// Hookear requestDestroy
	entityManagerProto.requestDestroy = function(...args) {
		const firstParam = args[0];

		// Mantener mediciones si persistentMeasurements está activado
		if (firstParam && typeof firstParam === 'string' && firstParam.includes('MEASUREMENT') && n21State.persistentMeasurements) {
			return false;
		}

		// Si no, devolver los parámetros tal cual (llamar función original)
		return originalRequestDestroy.apply(this, args);
	};

	// Crear y agregar botón de persistencia en el UI
	function setupPersistenceButton() {
		const measurementDiv = document.querySelector('[data-mode="measurement"]');
		if (!measurementDiv) return;

		const modeTitle = measurementDiv.querySelector('[class*="mode-title"]');
		if (!modeTitle) return;

		// Evitar agregar múltiples botones
		if (modeTitle.nextElementSibling && modeTitle.nextElementSibling.classList.contains('btn-mode-persist')) return;

		// Crear el botón
		const button = document.createElement('button');
		button.className = 'btn btn-sm btn-mode-persist tooltipstered';
		button.setAttribute('data-toggle', 'tooltip');
		button.setAttribute('title', 'Persistir mediciones');
		
		// Agregar la clase inicial según el estado
		if (n21State.persistentMeasurements) {
			button.classList.add('btn-primary');
		} else {
			button.classList.add('btn-dice');
		}

		// Crear el icono
		const icon = document.createElement('i');
		icon.className = 'fa fa-anchor';
		button.appendChild(icon);

		// Event listener para cambiar el estado
		button.addEventListener('click', (e) => {
			e.preventDefault();
			n21State.persistentMeasurements = !n21State.persistentMeasurements;
			
			// Actualizar clases del botón
			if (n21State.persistentMeasurements) {
				button.classList.remove('btn-dice');
				button.classList.add('btn-primary');
			} else {
				button.classList.remove('btn-primary');
				button.classList.add('btn-dice');
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
})();
