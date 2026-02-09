// Popup UI Script for Nivel21 Extension

const FEATURE_INFO = {
  'advantage-disadvantage': {
    name: 'Tiradas con Ventaja/Desventaja',
    description: 'Modifica automáticamente tus tiradas de dados manteniendo presionadas las teclas especiales mientras haces clic en un botón de tirada.',
    screenshot: 'img/advantage-disadvantage.png',
    configurable: [] // TODO: Implement key configuration
  },
  'multi-measurement': {
    name: 'Mediciones Persistentes',
    description: 'Mantén tus mediciones en el mapa de forma persistente. Usa el botón de anclaje en el panel de mediciones para activar o desactivar este modo.',
    screenshot: 'img/multi-measurement.png',
    configurable: []
  },
  'send-to-chat': {
    name: 'Compartir Contenido al Chat',
    description: 'Comparte rápidamente conjuros, items, reglas y otros contenidos con tu DM y compañeros. Los elementos se resaltan en azul cuando están listos para compartir.',
    screenshot: 'img/send-to-chat.png',
    configurable: [] // TODO: Implement key configuration
  },
  'parse-chat-links': {
    name: 'Enlaces en Mensajes del Chat',
    description: 'Los enlaces de reglas, objetos, conjuros y otros contenidos de Nivel20 se detectan automáticamente en el chat y se abren en ventanas internas.',
    screenshot: 'img/parse-chat-links.png',
    configurable: []
  },
  'whisper-mode': {
    name: 'Susurrar en el Chat',
    description: 'Envía mensajes privados a otros jugadores escribiendo /w nombre. El modo se cambia automáticamente a privado y solo el destinatario verá el mensaje.',
    screenshot: 'img/whisper-mode.png',
    configurable: [] // TODO: Implement key configuration
  },
  'token-hotkeys': {
    name: 'Atajos para Tokens',
    description: 'Controla rápidamente los tokens/fichas del mapa usando atajos de teclado. Selecciona un token primero para activar estos atajos.',
    screenshot: 'img/token-hotkeys.png',
    configurable: ['toggleVisibility', 'toggleLock', 'edit', 'duplicate', 'delete']
  },
  'token-height-order': {
    name: 'Altura de Tokens',
    description: 'Permite ajustar la altura de uno o varios tokens seleccionados para colocarlos encima o debajo de otros.',
    screenshot: 'img/token-height-order.png',
    configurable: [] // TODO: Implement key configuration
  },
  'token-move-arrows': {
    name: 'Mover Tokens con el Teclado',
    description: 'Permite mover uno o varios tokens seleccionados con las flechas del teclado.',
    screenshot: 'img/token-move-arrows.png',
    configurable: [] // TODO: Implement key configuration
  },
  'snap-to-grid': {
    name: 'Ajustar a la Cuadrícula',
    description: 'Mantén presionado Shift al mover tokens para forzarlos a ajustarse a la cuadrícula automáticamente.',
    screenshot: 'img/snap-to-grid.png',
    configurable: [] // TODO: Implement key configuration
  },
  'ambient-fx': {
    name: 'Efectos Ambientales',
    description: 'Crea capas de color sobre el tablero para simular horas del día, clima o eventos astronómicos. El DM puede ajustar color, intensidad y modo de fusión.',
    screenshot: 'img/ambient-fx.png',
    configurable: []
  },
  'multi-level-action-bar': {
    name: 'Carpetas anidadas',
    description: 'Organiza acciones en carpetas usando el separador " > " en el nombre. La barra se convierte en carpetas anidadas automáticamente.',
    screenshot: 'img/multi-level-action-bar.png',
    configurable: []
  }
};

const KEY_LABELS = {
  advantage: 'Ventaja',
  disadvantage: 'Desventaja',
  send: 'Compartir',
  autocomplete: 'Autocompletar',
  toggleVisibility: 'Alternar visibilidad',
  toggleLock: 'Bloquear/desbloquear',
  edit: 'Editar token',
  duplicate: 'Duplicar token',
  delete: 'Eliminar token',
  increaseHeight: 'Subir altura',
  decreaseHeight: 'Bajar altura',
  moveToken: 'Mover token',
  snapModifier: 'Modificador para ajustar'
};

async function init() {
  await settingsManager.load();
  renderUnifiedView();
}

// Active capture tracking to prevent duplicates
let activeCapture = null;

function renderUnifiedView() {
  const container = document.getElementById('features-list');
  container.innerHTML = '';
  
  // Clear any active capture when re-rendering
  if (activeCapture) {
    activeCapture.cancel();
    activeCapture = null;
  }
  
  Object.keys(FEATURE_INFO).forEach(featureId => {
    const feature = FEATURE_INFO[featureId];
    const settings = settingsManager.getFeatureSettings(featureId);
    
    const featureDiv = document.createElement('div');
    featureDiv.className = 'feature-item';
    
    // Header with toggle
    const header = document.createElement('div');
    header.className = 'feature-header';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'feature-title';
    titleDiv.textContent = feature.name;
    
    const toggle = document.createElement('label');
    toggle.className = 'toggle-switch';
    toggle.innerHTML = `
      <input type="checkbox" ${settings.enabled ? 'checked' : ''} data-feature="${featureId}">
      <span class="toggle-slider"></span>
    `;
    
    toggle.querySelector('input').addEventListener('change', async (e) => {
      settingsManager.setFeatureEnabled(featureId, e.target.checked);
      await settingsManager.save();
      renderUnifiedView();
    });
    
    header.appendChild(titleDiv);
    header.appendChild(toggle);
    featureDiv.appendChild(header);
    
    // Description
    const desc = document.createElement('div');
    desc.className = 'feature-description';
    desc.textContent = feature.description;
    featureDiv.appendChild(desc);
    
    // Key bindings (if configurable and enabled)
    if (settings.enabled && feature.configurable.length > 0) {
      const keysDiv = document.createElement('div');
      keysDiv.className = 'feature-keys';
      
      feature.configurable.forEach(keyName => {
        const keyValue = settings.keys?.[keyName] || '';
        
        const keyRow = document.createElement('div');
        keyRow.className = 'key-row';
        
        const label = document.createElement('span');
        label.className = 'key-label';
        label.textContent = KEY_LABELS[keyName] || keyName;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'key-input';
        input.value = keyValue;
        input.placeholder = 'Click para capturar';
        input.readOnly = true;
        
        input.addEventListener('click', () => {
          // Cancel any existing capture
          if (activeCapture) {
            activeCapture.cancel();
          }
          
          input.classList.add('capturing');
          input.value = 'Presiona una tecla...';
          
          let captureTimeout;
          let captureHandler;
          
          const clearCapture = () => {
            input.classList.remove('capturing');
            input.value = keyValue || '';
            if (captureTimeout) clearTimeout(captureTimeout);
            if (captureHandler) {
              document.removeEventListener('keydown', captureHandler);
            }
            if (activeCapture && activeCapture.input === input) {
              activeCapture = null;
            }
          };
          
          captureHandler = async (e) => {
            e.preventDefault();
            
            // Allow Escape to cancel
            if (e.key === 'Escape') {
              clearCapture();
              return;
            }
            
            let key = e.key;
            let combo = [];
            
            if (e.ctrlKey) combo.push('Ctrl');
            if (e.altKey) combo.push('Alt');
            if (e.shiftKey) combo.push('Shift');
            if (e.metaKey) combo.push('Meta');
            
            // Don't allow modifier-only combinations
            if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
              return;
            }
            
            // Handle special keys with proper casing
            // Normalize space key
            if (key === ' ') {
              combo.push('Space');
            } else if (key.startsWith('Arrow')) {
              combo.push(key);
            } else if (['PageUp', 'PageDown', 'Delete', 'Backspace', 'Enter', 'Tab', 'Escape'].includes(key)) {
              combo.push(key);
            } else if (key.length === 1) {
              combo.push(key.toUpperCase());
            } else {
              combo.push(key);
            }
            
            const newValue = combo.join('+');
            input.value = newValue;
            input.classList.remove('capturing');
            
            settingsManager.setFeatureKey(featureId, keyName, newValue);
            await settingsManager.save();
            
            clearCapture();
          };
          
          // Auto-cancel after 10 seconds
          captureTimeout = setTimeout(() => {
            clearCapture();
          }, 10000);
          
          // Track active capture
          activeCapture = {
            input: input,
            cancel: clearCapture
          };
          
          document.addEventListener('keydown', captureHandler);
        });
        
        keyRow.appendChild(label);
        keyRow.appendChild(input);
        keysDiv.appendChild(keyRow);
      });
      
      featureDiv.appendChild(keysDiv);
    }
    
    // Screenshot
    if (feature.screenshot) {
      const img = document.createElement('img');
      img.src = feature.screenshot;
      img.alt = feature.name;
      img.className = 'feature-screenshot';
      featureDiv.appendChild(img);
    }
    
    container.appendChild(featureDiv);
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
