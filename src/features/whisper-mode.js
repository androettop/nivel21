(() => {
  try {
    /* =======================
       Feature: Whisper Mode
       Automatically switch to private mode when typing /w
    ======================= */

    const { state } = window._n21_;

    let currentMessage = '';

    // Get DOM elements
    function getElements() {
      return {
        visibilitySelect: document.querySelector('#room_message_visibility'),
        messageInput: document.querySelector('#room_message_message')
      };
    }

    // Check if message starts with /w
    function startsWithWhisper(message) {
      return message.trim().startsWith('/w');
    }

    // Set visibility by clicking the appropriate button
    function setVisibility(value) {
      const button = document.querySelector(`.chat-visibility-change[data-value="${value}"]`);
      if (button) {
        button.click();
      } else {
        console.warn('[Whisper Mode] Visibility button not found:', value);
      }
    }

    // Remove /w and username from message, keeping the rest
    function removeWhisperPrefix(message) {
      const trimmed = message.trim();
      if (!startsWithWhisper(trimmed)) return message;
      
      // Match /w followed by optional username and space, capture the rest
      // Pattern: /w [username] [rest of message]
      const match = trimmed.match(/^\/w(?:\s+\S+)?(?:\s+(.*))?$/);
      if (match && match[1]) {
        return match[1]; // Return the rest of the message
      }
      return ''; // No message after /w and username
    }

    // Handle visibility button clicks
    function onVisibilityButtonClick(e) {
        setTimeout(() => {
            const { visibilitySelect, messageInput } = getElements();
            if (!visibilitySelect || !messageInput) return;

            const newValue = visibilitySelect.value;
            const message = messageInput.value;
            
            // If changing to non-private and message has /w, remove the whisper prefix
            if (newValue !== 'private' && startsWithWhisper(message)) {
              const newMessage = removeWhisperPrefix(message);
              messageInput.value = newMessage;
              currentMessage = newMessage;
            }
        }, 10); 
    }

    // Handle message input changes
    function onMessageInput(e) {
      const { visibilitySelect, messageInput } = getElements();
      
      if (!visibilitySelect || !messageInput) return;

      const newMessage = messageInput.value;
      const newMessageStartsWithW = startsWithWhisper(newMessage);
      const oldMessageStartsWithW = startsWithWhisper(currentMessage);

      // Case 1: Just started typing /w
      if (newMessageStartsWithW && !oldMessageStartsWithW) {
        setVisibility('private');
      }
      // Case 2: Just removed /w
      else if (!newMessageStartsWithW && oldMessageStartsWithW) {
        setVisibility('public');
      }

      currentMessage = newMessage;
    }

    // Initialize the feature
    function init() {
      $(document).on('click', '.chat-visibility-change', onVisibilityButtonClick);

      // Wait for elements to be available
      const checkInterval = setInterval(() => {
        const { visibilitySelect, messageInput } = getElements();
        
        if (visibilitySelect && messageInput) {
          clearInterval(checkInterval);
          
          currentMessage = messageInput.value || '';
          
          // Listen to message input changes
          messageInput.addEventListener('input', onMessageInput);
        }
      }, 100);

      // Stop checking after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
      }, 10000);
    }

    // Start initialization
    init();

  } catch (error) {
    console.error('[Whisper Mode] Error:', error);
  }
})();