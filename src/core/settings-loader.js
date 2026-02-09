// Settings Loader for Content Scripts
// This module provides access to extension settings for features

(function() {
  window._n21_ = window._n21_ || {};
  
  // Cross-browser compatibility
  const browserAPI = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
  
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

      this.loadPromise = new Promise((resolve, reject) => {
        // Try to load from browser storage
        if (browserAPI && browserAPI.storage && browserAPI.storage.sync) {
          try {
            browserAPI.storage.sync.get(['nivel21Settings'], (result) => {
              if (browserAPI.runtime.lastError) {
                console.warn('N21: Error loading settings:', browserAPI.runtime.lastError);
                this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                this.loaded = true;
                resolve(this.settings);
                return;
              }
              
              if (result.nivel21Settings) {
                this.settings = this.mergeWithDefaults(result.nivel21Settings);
              } else {
                this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
              }
              this.loaded = true;
              resolve(this.settings);
            });
          } catch (err) {
            console.warn('N21: Error accessing storage:', err);
            this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            this.loaded = true;
            resolve(this.settings);
          }
        } else {
          // Fallback to default settings
          console.log('N21: Browser storage not available, using defaults');
          this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
          this.loaded = true;
          resolve(this.settings);
        }
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

    // Listen for settings changes
    onSettingsChanged(callback) {
      if (browserAPI && browserAPI.storage && browserAPI.storage.onChanged) {
        browserAPI.storage.onChanged.addListener((changes, areaName) => {
          if (areaName === 'sync' && changes.nivel21Settings) {
            this.settings = this.mergeWithDefaults(changes.nivel21Settings.newValue);
            callback(this.settings);
          }
        });
      }
    }
  }

  window._n21_.settingsLoader = new SettingsLoader();
  
  // Load settings immediately
  window._n21_.settingsLoader.load().catch(err => {
    console.warn('N21: Error loading settings:', err);
  });
})();
