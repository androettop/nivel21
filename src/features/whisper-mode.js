(() => {
  try {
    /* =======================
       Feature: Whisper Mode
       Automatically switch to private mode when typing /w
    ======================= */

    const { state } = window._n21_;

    // Stack to track manual visibility changes (max 5 elements)
    const MAX_STACK_SIZE = 5;
    state.visibilityStack = ["public"]; // Initialize with default state
    let isAutomaticChange = false;
    let currentMessage = '';

    // Get DOM elements
    function getElements() {
      return {
        visibilitySelect: document.querySelector('#room_message_visibility'),
        messageInput: document.querySelector('#room_message_message')
      };
    }

    // Add value to stack, maintaining max size
    function pushToStack(value) {
      state.visibilityStack.push(value);
      if (state.visibilityStack.length > MAX_STACK_SIZE) {
        state.visibilityStack.shift(); // Remove oldest element
      }
    }

    // Get last manual state from stack
    function getLastManualState() {
      return state.visibilityStack.length > 0 
        ? state.visibilityStack[state.visibilityStack.length - 1] 
        : 'public'; // Default to public if stack is empty
    }

    // Remove last element from stack
    function popFromStack() {
      if (state.visibilityStack.length > 0) {
        state.visibilityStack.pop();
      }
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
            const { visibilitySelect } = getElements();
            if (visibilitySelect) {
                const newValue = visibilitySelect.value;
        
                // Save to stack
                pushToStack(newValue);
            }

            // if changing to non-private and message has /w, remove the whisper prefix
            const { messageInput } = getElements();
            if (!messageInput) return;

            const newValue = visibilitySelect.value;
            const message = messageInput.value;
            if (newValue !== 'private' && startsWithWhisper(message)) {
              const newMessage = removeWhisperPrefix(message);
              messageInput.value = newMessage;
              currentMessage = newMessage;
            }
        }, 10); 
    }

    // Handle visibility select changes
    function onVisibilityChange(e) {
      const { visibilitySelect, messageInput } = getElements();
      
      if (!visibilitySelect || !messageInput) return;

      // If this is not an automatic change, save to stack
      if (!isAutomaticChange) {
        const newValue = visibilitySelect.value;
        pushToStack(newValue);
        
        // If changing to non-private and message has /w, remove the whisper prefix
        const message = messageInput.value;
        if (newValue !== 'private' && startsWithWhisper(message)) {
          const newMessage = removeWhisperPrefix(message);
          messageInput.value = newMessage;
          currentMessage = newMessage;
        }
      }
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
        isAutomaticChange = true;
        setVisibility('private');
        isAutomaticChange = false;
        
        // Remove the last manual state since we're overriding it
        popFromStack();
      }
      // Case 2: Just removed /w
      else if (!newMessageStartsWithW && oldMessageStartsWithW) {
        const previousState = getLastManualState();
        isAutomaticChange = true;
        setVisibility(previousState);
        isAutomaticChange = false;
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
          
          // Initialize stack with current value
          const initialValue = visibilitySelect.value || 'public';
          pushToStack(initialValue);
          currentMessage = messageInput.value || '';
          
          // Listen to visibility changes
          $(visibilitySelect).on('change', onVisibilityChange);
          
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
