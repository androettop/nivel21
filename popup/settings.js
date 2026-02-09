// Settings Manager for Nivel21 Extension

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

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
      browserAPI.storage.sync.get(['nivel21Settings'], (result) => {
        if (browserAPI.runtime.lastError) {
          console.warn('N21: Error loading settings:', browserAPI.runtime.lastError);
          this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
          resolve(this.settings);
          return;
        }
        
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
          const defaultFeature = merged.features[featureId];
          const savedFeature = savedSettings.features[featureId];

          // Start with a shallow merge for top-level properties
          const mergedFeature = {
            ...defaultFeature,
            ...savedFeature
          };

          // Deep-merge nested `keys` so missing keys fall back to defaults
          if (defaultFeature.keys || savedFeature.keys) {
            mergedFeature.keys = {
              ...(defaultFeature.keys || {}),
              ...(savedFeature.keys || {})
            };
          }

          merged.features[featureId] = mergedFeature;
        }
      });
    }
    
    return merged;
  }

  async save() {
    return new Promise((resolve) => {
      browserAPI.storage.sync.set({ nivel21Settings: this.settings }, () => {
        if (browserAPI.runtime.lastError) {
          console.error('N21: Error saving settings:', browserAPI.runtime.lastError);
        }
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
