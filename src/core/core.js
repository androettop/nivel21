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

	// expose for debugging and for features to access
	window._n21_ = {
		state: n21State,
		events: n21Events,
	};

	/* =======================
       Funciones de utilidad
    ======================= */
	// overrides a global function
	// hookFn can return: newArgs array to call original with modified args, or false to skip original
	function hookGlobalFn(fnName, hookFn) {
		const originalFn = window[fnName];
		if (typeof originalFn !== 'function') return;

		window[fnName] = (...args) => {
			const result = hookFn(...args);
			// If hookFn returns false, skip calling original function
			if (result === false) return;
			const newArgs = Array.isArray(result) ? result : args;
			return originalFn(...newArgs);
		};
	}

	// expose utility for features
	window._n21_.hookGlobalFn = hookGlobalFn;

	/* =======================
       Chat utilities
    ======================= */
	// Debounced chat message sender to avoid duplicate messages
	// Returns a function that sends messages with 200ms debounce for identical messages from same sender
	function createDebouncedChatSender(debounceMs = 200) {
		let lastMessage = '';
		let lastSender = '';
		let debounceTimer = null;

		return function sendChatMessageDebounced(messageText, options = {}) {
			const senderInfo = options.sender_info || '';
			const messageKey = `${messageText}|${senderInfo}`;
			const lastKey = `${lastMessage}|${lastSender}`;

			// Clear previous timer if it exists
			if (debounceTimer) {
				clearTimeout(debounceTimer);
			}

			// If same message from same sender, debounce it
			if (messageKey === lastKey) {
				debounceTimer = setTimeout(() => {
					sendChatMessage(messageText, options);
					lastMessage = messageText;
					lastSender = senderInfo;
				}, debounceMs);
			} else {
				// Different message or sender, send immediately
				sendChatMessage(messageText, options);
				lastMessage = messageText;
				lastSender = senderInfo;
			}
		};
	}

	// Create and expose the debounced chat sender
	window._n21_.sendChatMessageDebounced = createDebouncedChatSender();


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
})();
