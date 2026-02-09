// Settings Manager for Nivel21 Extension

const DEFAULT_SETTINGS = {
  features: {
    'advantage-disadvantage': {
      enabled: true,
      keys: {
        advantage: 'Shift',
        disadvantage: 'Alt'
      }
    },
    'multi-measurement': {
      enabled: true
    },
    'send-to-chat': {
      enabled: true,
      keys: {
        send: 'Shift+Click'
      }
    },
    'parse-chat-links': {
      enabled: true
    },
    'whisper-mode': {
      enabled: true,
      keys: {
        autocomplete: 'Tab'
      }
    },
    'token-hotkeys': {
      enabled: true,
      keys: {
        toggleVisibility: 'Ctrl+H',
        toggleLock: 'Ctrl+B',
        edit: 'Ctrl+E',
        duplicate: 'Ctrl+D',
        delete: 'Delete'
      }
    },
    'token-height-order': {
      enabled: true,
      keys: {
        increaseHeight: 'PageUp',
        decreaseHeight: 'PageDown'
      }
    },
    'token-move-arrows': {
      enabled: true,
      keys: {
        moveToken: 'ArrowKeys'
      }
    },
    'snap-to-grid': {
      enabled: true,
      keys: {
        snapModifier: 'Shift'
      }
    },
    'ambient-fx': {
      enabled: true
    },
    'multi-level-action-bar': {
      enabled: true
    }
  }
};

class SettingsManager {
  constructor() {
    this.settings = null;
  }

  async load() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['nivel21Settings'], (result) => {
        if (result.nivel21Settings) {
          this.settings = this.mergeWithDefaults(result.nivel21Settings);
        } else {
          this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        }
        resolve(this.settings);
      });
    });
  }

  mergeWithDefaults(savedSettings) {
    const merged = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    
    if (savedSettings && savedSettings.features) {
      Object.keys(savedSettings.features).forEach(featureId => {
        if (merged.features[featureId]) {
          merged.features[featureId] = {
            ...merged.features[featureId],
            ...savedSettings.features[featureId]
          };
        }
      });
    }
    
    return merged;
  }

  async save() {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ nivel21Settings: this.settings }, () => {
        resolve();
      });
    });
  }

  getFeatureSettings(featureId) {
    return this.settings?.features?.[featureId] || DEFAULT_SETTINGS.features[featureId];
  }

  setFeatureEnabled(featureId, enabled) {
    if (this.settings.features[featureId]) {
      this.settings.features[featureId].enabled = enabled;
    }
  }

  setFeatureKey(featureId, keyName, keyValue) {
    if (this.settings.features[featureId]?.keys) {
      this.settings.features[featureId].keys[keyName] = keyValue;
    }
  }
}

const settingsManager = new SettingsManager();
