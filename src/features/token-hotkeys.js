(() => {
	/* =======================
       Feature: Token Hotkeys
    ======================= */

	const selectedTokenWrapper = '.selected-token-wrapper';

	// Add hotkey labels to buttons if they don't exist
	function addHotKeyLabels() {
		const buttons = [
			{ selector: '.btn-toggle-token-visibility', label: 'H' },
			{ selector: '.btn-toggle-token-lock', label: 'B' },
			{ selector: '.btn-remove-selected-token', label: 'Supr.' }
		];

		buttons.forEach(({ selector, label }) => {
			const button = document.querySelector(selector);
			if (button) {
				// Check if label already exists
				const existingLabel = button.querySelector('.n21-hotkey-label');
				if (!existingLabel) {
					const span = document.createElement('span');
					span.className = 'n21-hotkey-label';
					span.textContent = `(${label})`;
					button.appendChild(span);
				}
			}
		});
	}

	// Check if selected token wrapper is visible
	function isTokenWrapperActive() {
		const wrapper = document.querySelector(selectedTokenWrapper);
		return wrapper && !wrapper.classList.contains('hidden');
	}

	// Handle keydown for token hotkeys
	$(document).on('keydown', (e) => {
		// Only process if token wrapper is active
		if (!isTokenWrapperActive()) return;

		// Avoid triggering hotkeys while typing in input fields or textareas
		if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

		let targetButton = null;

		if (e.key === 'h' || e.key === 'H') {
			// H - Toggle token visibility
			targetButton = document.querySelector('.btn-toggle-token-visibility');
		} else if (e.key === 'b' || e.key === 'B') {
			// B - Toggle token lock
			targetButton = document.querySelector('.btn-toggle-token-lock');
		} else if (e.key === 'Delete') {
			// Delete - Remove selected token
			targetButton = document.querySelector('.btn-remove-selected-token');
		}

		if (targetButton) {
			e.preventDefault();
			targetButton.click();
		}
	});

	// Initialize hotkey labels on page load
	addHotKeyLabels();
})();
