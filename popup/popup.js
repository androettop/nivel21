// Popup UI Script for Nivel21 Extension

const FEATURE_INFO = {
  'advantage-disadvantage': {
    name: 'Tiradas con Ventaja/Desventaja',
    description: 'Modifica automáticamente tus tiradas de dados manteniendo presionadas las teclas especiales mientras haces clic en un botón de tirada.',
    screenshot: 'img/advantage-disadvantage.png',
    configurable: ['advantage', 'disadvantage']
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
    configurable: ['send']
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
    configurable: ['autocomplete']
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
    configurable: ['increaseHeight', 'decreaseHeight']
  },
  'token-move-arrows': {
    name: 'Mover Tokens con el Teclado',
    description: 'Permite mover uno o varios tokens seleccionados con las flechas del teclado.',
    screenshot: 'img/token-move-arrows.png',
    configurable: ['moveToken']
  },
  'snap-to-grid': {
    name: 'Ajustar a la Cuadrícula',
    description: 'Mantén presionado Shift al mover tokens para forzarlos a ajustarse a la cuadrícula automáticamente.',
    screenshot: 'img/snap-to-grid.png',
    configurable: ['snapModifier']
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

let currentView = 'settings';

async function init() {
  await settingsManager.load();
  
  setupNavigation();
  renderSettingsView();
  showView('settings');
}

function setupNavigation() {
  document.getElementById('nav-settings').addEventListener('click', () => showView('settings'));
  document.getElementById('nav-about').addEventListener('click', () => showView('about'));
}

function showView(view) {
  currentView = view;
  
  document.getElementById('settings-view').style.display = view === 'settings' ? 'block' : 'none';
  document.getElementById('about-view').style.display = view === 'about' ? 'block' : 'none';
  
  document.getElementById('nav-settings').classList.toggle('active', view === 'settings');
  document.getElementById('nav-about').classList.toggle('active', view === 'about');
  
  if (view === 'about') {
    renderAboutView();
  }
}

function renderSettingsView() {
  const container = document.getElementById('features-list');
  container.innerHTML = '';
  
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
      renderSettingsView();
    });
    
    header.appendChild(titleDiv);
    header.appendChild(toggle);
    featureDiv.appendChild(header);
    
    // Description
    const desc = document.createElement('div');
    desc.className = 'feature-description';
    desc.textContent = feature.description;
    featureDiv.appendChild(desc);
    
    // Key bindings (if configurable)
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
          input.classList.add('capturing');
          input.value = 'Presiona una tecla...';
          
          const captureKey = (e) => {
            e.preventDefault();
            
            let key = e.key;
            let combo = [];
            
            if (e.ctrlKey) combo.push('Ctrl');
            if (e.altKey) combo.push('Alt');
            if (e.shiftKey) combo.push('Shift');
            if (e.metaKey) combo.push('Meta');
            
            if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
              if (key.startsWith('Arrow')) {
                combo.push(key);
              } else if (key === ' ') {
                combo.push('Space');
              } else {
                combo.push(key.toUpperCase());
              }
            }
            
            const newValue = combo.join('+');
            input.value = newValue;
            input.classList.remove('capturing');
            
            settingsManager.setFeatureKey(featureId, keyName, newValue);
            settingsManager.save();
            
            document.removeEventListener('keydown', captureKey);
          };
          
          document.addEventListener('keydown', captureKey, { once: true });
        });
        
        keyRow.appendChild(label);
        keyRow.appendChild(input);
        keysDiv.appendChild(keyRow);
      });
      
      featureDiv.appendChild(keysDiv);
    }
    
    container.appendChild(featureDiv);
  });
}

function renderAboutView() {
  const container = document.getElementById('about-content');
  container.innerHTML = '';
  
  Object.keys(FEATURE_INFO).forEach(featureId => {
    const feature = FEATURE_INFO[featureId];
    const settings = settingsManager.getFeatureSettings(featureId);
    
    const featureDiv = document.createElement('div');
    featureDiv.className = 'feature';
    
    const title = document.createElement('div');
    title.className = 'feature-title';
    title.textContent = feature.name;
    
    const desc = document.createElement('div');
    desc.className = 'feature-description';
    desc.textContent = feature.description;
    
    featureDiv.appendChild(title);
    featureDiv.appendChild(desc);
    
    // Show default key bindings
    if (settings.keys) {
      Object.keys(settings.keys).forEach(keyName => {
        const hotkey = document.createElement('div');
        hotkey.className = 'hotkey';
        hotkey.innerHTML = `
          <span class="hotkey-key">${settings.keys[keyName]}</span>
          <span class="hotkey-description">${KEY_LABELS[keyName] || keyName}</span>
        `;
        featureDiv.appendChild(hotkey);
      });
    }
    
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
