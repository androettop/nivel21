(() => {
	/* =======================
       Feature: Parse Chat Links
    ======================= */

	// Regex to find markdown links: [text](url)
	const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

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

					// Create anchor element with data attributes
					const anchor = document.createElement('a');
					anchor.textContent = match[1]; // [text]
					anchor.href = match[2]; // (url)
					anchor.setAttribute('data-floating', 'true');
					anchor.setAttribute('data-floating-title', match[1]);

					fragment.appendChild(anchor);
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
		const messageElements = document.querySelectorAll('[data-role="message-text"]');
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
	const observer = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			mutation.addedNodes.forEach((node) => {
				if (node.nodeType === Node.ELEMENT_NODE) {
					// Check if added node is a message-text element or contains one
					if (node.hasAttribute && node.hasAttribute('data-role') && node.getAttribute('data-role') === 'message-text') {
						parseMarkdownLinks(node);
					} else if (node.querySelectorAll) {
						const messageTexts = node.querySelectorAll('[data-role="message-text"]');
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

	// Start observing the document for changes
	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});
})();
