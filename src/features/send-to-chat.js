(() => {
	/* =======================
       Feature: Send to Chat
    ======================= */

	const { state, events, hookGlobalFn, sendChatMessageDebounced } = window._n21_;

	const floatingElementsSelector = '[data-floating]';
	let hoverEl = null;

	// Helper function to get icon URL from floating element
	function getIconUrlFromElement(element) {
		const img = element.querySelector('img');
		return img ? img.src : null;
	}

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

	// Helper function to get sender info from hovered element or its parents
	function getSenderInfoFromElement(element) {
		if (!element) return null;
		
		// Search up the DOM tree for an element with data-sender-info (includes element itself)
		const $elementWithSenderInfo = $(element).closest('[data-sender-info]');
		if ($elementWithSenderInfo.length > 0) {
			return $elementWithSenderInfo.attr('data-sender-info');
		}
		
		return null;
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
			// Try to get sender info from hovered element first
			let senderInfo = getSenderInfoFromElement(hoverEl);
			
			// Fallback to the room message sender info if not found in element
			if (!senderInfo) {
				const senderInfoElement = document.getElementById('room_message_sender_info');
				senderInfo = senderInfoElement?.value;
			}

			if (title) {
				// Format message as markdown link
				const messageText = `[${title}](${url})`;

				// Prepare options for the message
				const messageOptions = senderInfo ? { sender_info: senderInfo } : {};

				// Try to get icon from the hovered element
				if (hoverEl) {
					const iconUrl = getIconUrlFromElement(hoverEl);
					if (iconUrl) {
						messageOptions.icon = iconUrl;
					}
				}

				sendChatMessageDebounced(messageText, messageOptions);
			}

			// Return false to prevent calling original function
			return false;
		}

		// Return arguments array to call original function with same args
		return [url, title, icon, color];
	});
})();

