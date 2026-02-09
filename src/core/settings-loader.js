// Settings Loader for Content Scripts
// This module provides access to extension settings for features
// Settings are injected from content script (has storage access)

(function() {
  window._n21_ = window._n21_ || {};
  
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

  class SettingsLoader {
    constructor() {
      this.settings = null;
      this.loaded = false;
      this.loadPromise = null;
    }

    async load() {
      if (this.loadPromise) {
        return this.loadPromise;
      }

      this.loadPromise = Promise.resolve().then(() => {
        // Get settings from injected global variable
        const savedSettings = window._n21_settings;
        
        if (savedSettings) {
          this.settings = this.mergeWithDefaults(savedSettings);
        } else {
          this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        }
        
        this.loaded = true;
        return this.settings;
      });

      return this.loadPromise;
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

    isFeatureEnabled(featureId) {
      if (!this.loaded) {
        console.warn('N21: Settings not loaded yet, defaulting to enabled');
        return true;
      }
      return this.settings?.features?.[featureId]?.enabled ?? true;
    }

    getFeatureSettings(featureId) {
      if (!this.loaded) {
        return DEFAULT_SETTINGS.features[featureId];
      }
      return this.settings?.features?.[featureId] || DEFAULT_SETTINGS.features[featureId];
    }

    getFeatureKey(featureId, keyName) {
      const feature = this.getFeatureSettings(featureId);
      return feature?.keys?.[keyName];
    }
  }

  window._n21_.settingsLoader = new SettingsLoader();
  
  // Load settings immediately
  window._n21_.settingsLoader.load().catch(err => {
    console.warn('N21: Error loading settings:', err);
  });
})();
