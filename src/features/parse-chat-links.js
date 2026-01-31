(() => {
	/* =======================
       Feature: Parse Chat Links
    ======================= */

	// Regex to find markdown links: [text](url)
	const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

	// Selector for message text elements (both data-role and class variants)
	const messageTextSelector = '[data-role="message-text"], .message-text';

	// Selector for chat container
	const chatContainerSelector = '.room-messages-chat';

	// Check if URL is from nivel20.com
	function isNivel20Url(url) {
		try {
			const parsedUrl = new URL(url, window.location.origin);
			return parsedUrl.hostname === 'nivel20.com';
		} catch (e) {
			// If it's a relative URL, assume it's from nivel20.com
			return url.startsWith('/');
		}
	}

	// Function to parse markdown links in text node and replace with anchor elements
	function parseMarkdownLinks(node) {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent;

			// Check if text contains markdown links
			if (markdownLinkRegex.test(text)) {
				const fragment = document.createDocumentFragment();
				let lastIndex = 0;
				let match;

				// Reset regex
				markdownLinkRegex.lastIndex = 0;

				while ((match = markdownLinkRegex.exec(text)) !== null) {
					// Add text before the link
					if (match.index > lastIndex) {
						fragment.appendChild(
							document.createTextNode(text.substring(lastIndex, match.index))
						);
					}

					// Only create anchor if URL is from nivel20.com
					if (isNivel20Url(match[2])) {
						// Create anchor element with data attributes
						const anchor = document.createElement('a');
						anchor.textContent = match[1]; // [text]
						anchor.href = match[2]; // (url)
						anchor.setAttribute('data-floating', 'true');
						anchor.setAttribute('data-floating-title', match[1]);

						fragment.appendChild(anchor);
					} else {
						// If not a nivel20.com link, keep as plain text
						fragment.appendChild(
							document.createTextNode(match[0])
						);
					}

					lastIndex = markdownLinkRegex.lastIndex;
				}

				// Add remaining text after last link
				if (lastIndex < text.length) {
					fragment.appendChild(
						document.createTextNode(text.substring(lastIndex))
					);
				}

				// Replace the text node with the fragment
				node.parentNode.replaceChild(fragment, node);
			}
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			// Recursively process child nodes, but skip certain elements
			const childNodes = Array.from(node.childNodes);
			for (const child of childNodes) {
				// Don't parse inside already processed links or script tags
				if (child.nodeName !== 'A' && child.nodeName !== 'SCRIPT') {
					parseMarkdownLinks(child);
				}
			}
		}
	}

	// Function to process all message-text elements
	function processMessageTexts() {
		const chatContainer = document.querySelector(chatContainerSelector);
		if (!chatContainer) return;

		const messageElements = chatContainer.querySelectorAll(messageTextSelector);
		messageElements.forEach((element) => {
			parseMarkdownLinks(element);
		});

		// Update events for newly created links
		if (window.bindFloatingLinks) {
			window.bindFloatingLinks();
		}
	}

	// Initial parse on page load
	processMessageTexts();

	// Also observe for new messages added dynamically
	const chatContainer = document.querySelector(chatContainerSelector);
	if (chatContainer) {
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (node.nodeType === Node.ELEMENT_NODE) {
						// Check if added node is a message-text element or contains one
						if (node.hasAttribute && node.hasAttribute('data-role') && node.getAttribute('data-role') === 'message-text') {
							parseMarkdownLinks(node);
						} else if (node.classList && node.classList.contains('message-text')) {
							parseMarkdownLinks(node);
						} else if (node.querySelectorAll) {
							const messageTexts = node.querySelectorAll(messageTextSelector);
							messageTexts.forEach((element) => {
								parseMarkdownLinks(element);
							});
						}
					}
				});
			});

			// Update events for newly created links
			if (window.bindFloatingLinks) {
				window.bindFloatingLinks();
			}
		});

		// Start observing the chat container for changes
		observer.observe(chatContainer, {
			childList: true,
			subtree: true,
		});
	}
})();
