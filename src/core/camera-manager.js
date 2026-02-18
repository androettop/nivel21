(() => {
  /* =======================
       CameraManager - Camera utilities abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  /**
   * CameraManager provides access to camera coordinate transformations
   * Abstracts the native camera from nivel20
   */
  class CameraManager extends BaseManager {
    /**
     * Get the Main Camera entity
     * @private
     * @returns {Object|null} The Main Camera entity or null if not available
     */
    _getMainCameraEntity() {
      const root = window.app?.root;
      if (!root || typeof root.find !== "function") return null;

      const found = root.find((e) => e && e.name === "Main Camera");
      return Array.isArray(found) ? found[0] : found;
    }

    /**
     * Get the native camera instance
     * @returns {Object|null} The native camera or null if not available
     */
    _getNative() {
      const mainCamera = this._getMainCameraEntity();
      return mainCamera?.camera || null;
    }

    /**
     * Get the dragSelect script from the main camera
     * @private
     * @returns {Object|null} The dragSelect script or null if not available
     */
    _getDragSelect() {
      const mainCamera = this._getMainCameraEntity();
      return mainCamera?.script?.dragSelect || null;
    }

    /**
     * Perform a raycast from screen coordinates to detect selectable entities
     * @param {number} screenX - Screen X coordinate
     * @param {number} screenY - Screen Y coordinate
     * @returns {Object|null} Raycast result with entity information or null if no hit
     */
    rayCast(screenX, screenY) {
      const dragSelect = this._getDragSelect();
      if (!dragSelect || typeof dragSelect.rayCast !== "function") return null;

      return dragSelect.rayCast(screenX, screenY);
    }

    /**
     * Check if the manager is ready for use
     * @returns {boolean} True if the camera is available
     */
    isReady() {
      return this._getNative() !== null;
    }
  }

  // Register CameraManager
  const { registerManager } = window._n21_.utils;
  registerManager("CameraManager", CameraManager);
})();
