// Settings Loader for Content Scripts
// This module provides access to extension settings for features

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

      this.loadPromise = new Promise((resolve, reject) => {
        // Try to load from chrome.storage
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
          try {
            chrome.storage.sync.get(['nivel21Settings'], (result) => {
              if (chrome.runtime.lastError) {
                console.warn('N21: Error loading settings:', chrome.runtime.lastError);
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
          console.log('N21: Chrome storage not available, using defaults');
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
            merged.features[featureId] = {
              ...merged.features[featureId],
              ...savedSettings.features[featureId]
            };
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
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
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
