(() => {
	/* =======================
       Global state & events
    ======================= */
	const n21State = {
		shift: false,
		alt: false,
		hoverEl: null,
	};

	// simple internal event bus
	const n21Events = $({});

	// expose for debugging if needed
	window._n21_ = {
		state: n21State,
		events: n21Events,
	};

	/* =======================
       Funciones de utilidad
    ======================= */
	// overrides a global function
	// hookFn must return the new arguments array
	function hookGlobalFn(fnName, hookFn) {
		const originalFn = window[fnName];
		if (typeof originalFn !== 'function') return;

		window[fnName] = (...args) => {
			const newArgs = hookFn(...args);
			return originalFn(...newArgs);
		};
	}

	/* =======================
       General input handling
    ======================= */
	$(document).on('keydown keyup', (e) => {
		const pressed = e.type === 'keydown';
		let changed = false;

		/* --- Modifier keys --- */
		if (e.key === 'Shift' && n21State.shift !== pressed) {
			n21State.shift = pressed;
			changed = true;
		}

		if (e.key === 'Alt' && n21State.alt !== pressed) {
			n21State.alt = pressed;
			changed = true;
		}

		if (changed) {
			e.preventDefault();
			n21Events.trigger('modifiers:change', [{ ...n21State }]);
		}
	});

	/* =======================
       Feature: Advantage / Disadvantage
    ======================= */

	function updateOutline(el, state) {
		if (!el) return;

		const $el = $(el);

		$el.removeClass('n21-advantage n21-disadvantage');

		/* --- cancel out if both pressed --- */
		if (state.shift && state.alt) return;

		if (state.shift) {
			$el.addClass('n21-advantage');
		} else if (state.alt) {
			$el.addClass('n21-disadvantage');
		}
	}

	function clearOutline(el) {
		if (!el) return;
		$(el).removeClass('n21-advantage n21-disadvantage');
	}

	const rollButtonsSelector = '.action-bar-button, [data-dice-roll]';

	$(document)
		.on('mouseenter', rollButtonsSelector, function () {
			n21State.hoverEl = this;
			updateOutline(this, n21State);
		})
		.on('mouseleave', rollButtonsSelector, function () {
			clearOutline(this);
			n21State.hoverEl = null;
		});

	n21Events.on('modifiers:change', (_, state) => {
		updateOutline(state.hoverEl, state);
	});

	hookGlobalFn('diceRoll', (notation, ...args) => {
		// already modified → do nothing
		if (
			typeof notation === 'string' &&
			(notation.toLowerCase().includes('max') ||
				notation.toLowerCase().includes('min'))
		) {
			return [notation, ...args];
		}

		/* --- cancel out --- */
		if (n21State.shift && n21State.alt) {
			return [notation, ...args];
		}

		if (typeof notation !== 'string') {
			return [notation, ...args];
		}

		/* --- detect dice + modifier --- */
		const match = notation.match(/^(\d+d\d+)\s*([+-])\s*(\d+)$/);

		let dicePart = notation;
		let modifierPart = '';

		if (match) {
			dicePart = match[1];
			modifierPart = `${match[2]}${match[3]}`;
		}

		/* --- apply advantage / disadvantage --- */
		if (n21State.shift) {
			dicePart = `max(${dicePart},${dicePart})`;
		} else if (n21State.alt) {
			dicePart = `min(${dicePart},${dicePart})`;
		}

		notation = modifierPart ? `${dicePart}${modifierPart}` : dicePart;

		return [notation, ...args];
	});

	/* =======================
       Future features go here
    ======================= */
})();
