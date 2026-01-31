(() => {
	/* =======================
       Feature: Advantage / Disadvantage
    ======================= */

	const { state, events, hookGlobalFn } = window._n21_;

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
			state.hoverEl = this;
			updateOutline(this, state);
		})
		.on('mouseleave', rollButtonsSelector, function () {
			clearOutline(this);
			state.hoverEl = null;
		});

	events.on('modifiers:change', (_, state) => {
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
		if (state.shift && state.alt) {
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
		if (state.shift) {
			dicePart = `max(${dicePart},${dicePart})`;
		} else if (state.alt) {
			dicePart = `min(${dicePart},${dicePart})`;
		}

		notation = modifierPart ? `${dicePart}${modifierPart}` : dicePart;

		return [notation, ...args];
	});
})();
