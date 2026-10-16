(() => {
  /* =======================
       CameraManager - Camera utilities abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};
  const { loadManagers } = window._n21_ || {};

  /**
   * CameraManager provides access to camera coordinate transformations
   * Abstracts the native camera from nivel20
   */
  class CameraManager extends BaseManager {
    constructor() {
      super();
      this._appRootManager = null;
    }

    /**
     * Initialize the manager - wait for AppRootManager to be ready
     */
    async init() {
      super.init();
      try {
        const [appRootManager] = await loadManagers("AppRootManager");
        this._appRootManager = appRootManager;
      } catch (error) {
        console.warn("N21: Failed to load AppRootManager:", error);
      }
    }

    /**
     * Get the native cameraManager from nivel20
     * @returns {Object|null} The native cameraManager or null if not available
     */
    _getNativeManager() {
      return this._appRootManager?.getNativeManager("cameraManager") || null;
    }

    /**
     * Get the Main Camera entity
     * @private
     * @returns {Object|null} The Main Camera entity or null if not available
     */
    _getMainCameraEntity() {
      const app = this._appRootManager?.getAppObject();
      const root = app?.root;
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
     * Convert screen/canvas coordinates to world coordinates
     * @param {number} screenX - Screen X coordinate relative to canvas
     * @param {number} screenY - Screen Y coordinate relative to canvas
     * @param {number} depth - Depth value (defaults to 0)
     * @returns {Object|null} World point or null if unavailable
     */
    screenToWorld(screenX, screenY, depth = 0) {
      const nativeCamera = this._getNative();
      if (!nativeCamera || typeof nativeCamera.screenToWorld !== "function") return null;

      // The native call takes a distance from the camera, not a board height:
      // with a tilted (3D) camera "depth 0" is a point in the air. Cast the
      // ray through the pixel and intersect it with the board plane instead
      // (same result as before with the top-down camera).
      const near = nativeCamera.screenToWorld(screenX, screenY, nativeCamera.nearClip ?? 0.1);
      const far = nativeCamera.screenToWorld(screenX, screenY, nativeCamera.farClip ?? 1000);
      if (near && far) {
        const dy = far.y - near.y;
        if (Math.abs(dy) > 1e-9) {
          const t = (depth - near.y) / dy;
          if (t >= 0) {
            return {
              x: near.x + (far.x - near.x) * t,
              y: depth,
              z: near.z + (far.z - near.z) * t,
            };
          }
        }
      }
      return nativeCamera.screenToWorld(screenX, screenY, depth);
    }

    /**
     * Convert world coordinates to screen/canvas coordinates
     * @param {number} worldX - World X coordinate
     * @param {number} worldZ - World Z coordinate
     * @param {number} worldY - World Y coordinate (defaults to 0)
     * @returns {Object|null} Screen point {x, y} or null if unavailable
     */
    worldToScreen(worldX, worldZ, worldY = 0) {
      const nativeCamera = this._getNative();
      if (!nativeCamera || typeof nativeCamera.worldToScreen !== "function") return null;

      return nativeCamera.worldToScreen({
        x: worldX,
        y: worldY,
        z: worldZ,
      });
    }

    /**
     * Get current camera settings from native cameraManager
     * @returns {Object|null} Camera settings or null if unavailable
     */
    getCurrentCameraSettings() {
      const nativeManager = this._getNativeManager();
      if (!nativeManager || typeof nativeManager.getCurrentCameraSettings !== "function") {
        return null;
      }

      return nativeManager.getCurrentCameraSettings();
    }

    /**
     * Move camera using provided settings
     * @param {Object} settings - Camera settings object
     * @returns {boolean} True if request was sent
     */
    moveCamera(settings) {
      if (!settings || typeof settings !== "object") return false;

      const nativeManager = this._getNativeManager();
      if (!nativeManager || typeof nativeManager.moveCamera !== "function") return false;

      nativeManager.moveCamera(settings);
      return true;
    }

    /**
     * How the board plane looks on screen around a point: where it lands and
     * how one cell along world X and world Z is drawn (screen vectors). Lets
     * overlays be drawn "painted on the floor" with a tilted (3D) camera.
     * `scale` is the pixels per cell of the top-down camera, so
     * `affine(...)` is the identity in plain 2D.
     * @returns {{origin:{x,y}, ax:{x,y}, az:{x,y}, scale:number}|null}
     */
    getGroundBasis(worldX, worldZ) {
      const o = this.worldToScreen(worldX, worldZ, 0);
      const px = this.worldToScreen(worldX + 1, worldZ, 0);
      const pz = this.worldToScreen(worldX, worldZ + 1, 0);
      if (!o || !px || !pz) return null;
      const canvas = document.querySelector("#application-canvas");
      const height = canvas?.getBoundingClientRect().height || 0;
      const orthoHeight = Number(this.getCurrentCameraSettings()?.orthoHeight) || 0;
      const scale = height && orthoHeight ? height / (2 * orthoHeight) : Math.hypot(px.x - o.x, px.y - o.y);
      if (!Number.isFinite(scale) || scale <= 0) return null;
      return {
        origin: { x: o.x, y: o.y },
        ax: { x: px.x - o.x, y: px.y - o.y },
        az: { x: pz.x - o.x, y: pz.y - o.y },
        scale,
      };
    }

    /**
     * 2D affine [a, b, c, d] that maps "top-down" screen pixels around a
     * board point to how they look with the current camera (identity in 2D).
     */
    getGroundAffine(worldX, worldZ) {
      const basis = this.getGroundBasis(worldX, worldZ);
      if (!basis) return null;
      const k = basis.scale;
      return {
        origin: basis.origin,
        matrix: [basis.ax.x / k, basis.ax.y / k, basis.az.x / k, basis.az.y / k],
      };
    }

    /**
     * Center this user's camera on a board point, keeping zoom and angle.
     * Only moves the local camera.
     * @returns {boolean}
     */
    centerOn(worldX, worldZ) {
      const settings = this.getCurrentCameraSettings();
      if (!settings || !Number.isFinite(worldX) || !Number.isFinite(worldZ)) return false;
      return this.moveCamera({
        ...settings,
        pivotPoint: { ...(settings.pivotPoint || {}), x: worldX, z: worldZ },
      });
    }

    /**
     * Move other players' camera to current camera using native window.camera API
     * @returns {boolean} True if request was sent
     */
    moveOthersToCurrent() {
      if (typeof window.camera?.moveOthersToCurrent !== "function") return false;

      window.camera.moveOthersToCurrent();
      return true;
    }

    /**
     * Reset camera orbit yaw to zero
     * @returns {boolean} True if yaw was updated
     */
    straightenCameraYaw() {
      const nativeManager = this._getNativeManager();
      const orbitCamera = nativeManager?.orbitCamera;

      if (!orbitCamera) return false;
      orbitCamera.yaw = 0;
      // Straightening is allowed while rotation is locked: lock at 0.
      if (this._lockedYaw !== null && this._lockedYaw !== undefined) this._lockedYaw = 0;
      return true;
    }

    /**
     * Current camera rotation (yaw) in degrees, or null if unavailable.
     * @returns {number|null}
     */
    getCameraYaw() {
      const yaw = Number(this._getNativeManager()?.orbitCamera?.yaw);
      return Number.isFinite(yaw) ? yaw : null;
    }

    /**
     * Whether the camera is not rotated (yaw ~ 0, any number of full turns).
     * @returns {boolean}
     */
    isCameraStraight() {
      const yaw = this.getCameraYaw();
      if (yaw === null) return true;
      const normalized = ((yaw % 360) + 360) % 360;
      return normalized < 0.5 || normalized > 359.5;
    }

    /**
     * Lock (or unlock) the camera rotation: while locked, any yaw change
     * (mouse, touch, keyboard...) is undone every frame, so the board can't be
     * rotated by accident. Pan and zoom keep working.
     * @param {boolean} locked
     */
    setRotationLocked(locked) {
      if (!locked) {
        this._lockedYaw = null;
        if (this._lockFrame) cancelAnimationFrame(this._lockFrame);
        this._lockFrame = null;
        return;
      }
      if (this._lockedYaw === null || this._lockedYaw === undefined) {
        this._lockedYaw = this.getCameraYaw() ?? 0;
      }
      if (this._lockFrame) return;
      const enforce = () => {
        this._lockFrame = null;
        if (this._lockedYaw === null || this._lockedYaw === undefined) return;
        const orbitCamera = this._getNativeManager()?.orbitCamera;
        if (orbitCamera) {
          const yaw = Number(orbitCamera.yaw);
          if (Number.isFinite(yaw) && Math.abs(yaw - this._lockedYaw) > 0.001) {
            orbitCamera.yaw = this._lockedYaw;
          }
        }
        this._lockFrame = requestAnimationFrame(enforce);
      };
      this._lockFrame = requestAnimationFrame(enforce);
    }

    /** @returns {boolean} */
    isRotationLocked() {
      return this._lockedYaw !== null && this._lockedYaw !== undefined;
    }

    /**
     * Check if the manager is ready for use
     * @returns {boolean} True if the camera is available
     */
    isReady() {
      return this._getNative() !== null && this._getNativeManager() !== null;
    }
  }

  // Register CameraManager
  const { registerManager } = window._n21_.utils;
  registerManager("CameraManager", CameraManager);
})();
