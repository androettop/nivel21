(() => {
	/* =======================
       Feature: Send to Chat
    ======================= */

	const { state, events, hookGlobalFn } = window._n21_;

	const floatingElementsSelector = '[data-floating]';
	let hoverEl = null;

	// Helper function to update visual feedback
	function updateChatFilter(el, isShiftPressed) {
		if (!el) return;

		const $el = $(el);

		if (isShiftPressed) {
			$el.addClass('n21-send-to-chat');
		} else {
			$el.removeClass('n21-send-to-chat');
		}
	}

	// Helper function to clear visual feedback
	function clearChatFilter(el) {
		if (!el) return;
		$(el).removeClass('n21-send-to-chat');
	}

	// Track hovered floating element
	$(document)
		.on('mouseenter', floatingElementsSelector, function () {
			hoverEl = this;
			updateChatFilter(this, state.shift);
		})
		.on('mouseleave', floatingElementsSelector, function () {
			clearChatFilter(this);
			hoverEl = null;
		});

	// Update visual feedback when shift modifier changes
	events.on('modifiers:change', (_, newState) => {
		updateChatFilter(hoverEl, newState.shift);
	});

	// Hook loadInFloatingPanel to intercept and send to chat if shift is pressed
	hookGlobalFn('loadInFloatingPanel', (url, title, icon, color) => {
		// If shift is pressed, send message to chat instead
		if (state.shift) {
			const senderInfoElement = document.getElementById('room_message_sender_info');
			const senderInfo = senderInfoElement?.value;

			if (title) {
				// Format message as markdown link
				const messageText = `[${title}](${url})`;
				sendChatMessage(messageText, senderInfo ? { sender_info: senderInfo } : {});
			}

			// Return false to prevent calling original function
			return false;
		}

		// Return arguments array to call original function with same args
		return [url, title, icon, color];
	});
})();

