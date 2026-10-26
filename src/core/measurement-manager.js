(() => {
  /* =======================
       MeasurementManager - Global measurement abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};
  const { loadManagers } = window._n21_ || {};

  // Native measurement templates used to draw each aura shape kind.
  const AURA_TEMPLATES = {
    cone: "coneTemplate",
    box: "boxTemplate",
    line: "lineTemplate",
  };

  /**
   * MeasurementManager provides a unified interface for managing measurements
   * Abstracts the native measurementManager from nivel20
   */
  class MeasurementManager extends BaseManager {
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
     * Get the native measurementManager instance
     * @returns {Object|null} The native measurementManager or null if not available
     */
    _getNative() {
      return this._appRootManager?.getNativeManager("measurementManager") || null;
    }

    /**
     * Get the entity manager from the native measurementManager
     * @returns {Object|null} The entityManager or null if not available
     */
    getEntityManager() {
      return this._getNative()?.entityManager || null;
    }

    /**
     * Check if the native measurement manager is active
     * @returns {boolean} True if active
     */
    isActive() {
      return this._getNative()?.active === true;
    }

    /**
     * Set active state on the native measurement manager
     * @param {boolean} active - Whether to activate the manager
     * @returns {boolean} True if the state was applied
     */
    setActive(active) {
      const native = this._getNative();
      if (!native || typeof native.setActive !== "function") return false;

      native.setActive(!!active);
      return true;
    }

    /**
     * Get the current shape configuration from the native manager
     * @returns {Object|null} The shape config or null if unavailable
     */
    getShapeConfig() {
      const native = this._getNative();
      if (!native?.shapeConfig) return null;

      return { ...native.shapeConfig };
    }

    /**
     * Set the shape configuration on the native manager
     * @param {Object} config - Shape configuration
     * @returns {boolean} True if the config was applied
     */
    setShapeConfig(config, partial = true) {
      const native = this._getNative();
      if (!native || typeof native.setShapeConfig !== "function") return false;

      if (partial) {
        native.setShapeConfig({ ...native.shapeConfig, ...config });
      } else {
        native.setShapeConfig(config);
      }
      return true;
    }

    /**
     * Trigger the native onMouseDown handler with a full event-like payload
     * @param {Object} data - Mouse data with canvas-relative coordinates
     * @returns {boolean} True if the handler was called
     */
    triggerMouseDown(data) {
      const native = this._getNative();
      if (!native || typeof native.onMouseDown !== "function") return false;

      if (!data || typeof data.x !== "number" || typeof data.y !== "number") {
        return false;
      }

      const payload = {
        x: data.x,
        y: data.y,
        dx: data.dx ?? 0,
        dy: data.dy ?? 0,
        button: data.button ?? 0,
        wheelDelta: data.wheelDelta ?? 0,
        ctrlKey: !!data.ctrlKey,
        altKey: !!data.altKey,
        shiftKey: !!data.shiftKey,
        metaKey: !!data.metaKey,
        buttons: Array.isArray(data.buttons) ? data.buttons : [true, false, false],
        element: data.element || {},
        event: data.event || null,
      };

      native.onMouseDown(payload);
      return true;
    }

    /**
     * The scene's measurement units, as Nivel20 shows them in measurements:
     * `units` per grid square ("pies", "m"…; null without a grid config).
     * @returns {{units: string|null, unitScale: number|null}}
     */
    getSceneUnits() {
      const config = this._getNative()?.room?.state?.measurementsConfig;
      const unitScale = Number(config?.unitScale);
      return {
        units: config?.units ? String(config.units) : null,
        unitScale: Number.isFinite(unitScale) && unitScale > 0 ? unitScale : null,
      };
    }

    /**
     * Measurements on the board (board coordinates).
     * @returns {Array<{networkId, ownerUserId, shape, showShape, color,
     *   start: {x, z}, end: {x, z}}>}
     */
    getMeasurements() {
      const schemas = this.getEntityManager()?.schema?.();
      if (!schemas || typeof schemas.values !== "function") return [];
      const point = (p) => ({ x: Number(p?.x) || 0, z: Number(p?.z) || 0 });
      return [...schemas.values()].map((s) => ({
        networkId: s.networkId,
        ownerUserId: s.ownerUserId != null ? String(s.ownerUserId) : null,
        shape: s.shape || "none",
        showShape: !!s.showShape,
        color: s.color,
        start: point(s.start),
        end: point(s.end),
      }));
    }

    /**
     * Check if the manager is ready for use
     * @returns {boolean} True if the manager and entityManager are available
     */
    isReady() {
      return this.getEntityManager() !== null;
    }

    /**
     * Remove measurements owned by the current player
     * @returns {number} Number of measurements removed
     */
    removeOwnedMeasurements() {
      const native = this._getNative();
      if (!native || typeof native.removeOwnedMeasurements !== "function")
        return 0;

      native.removeOwnedMeasurements();
      return 1;
    }

    /**
     * Create an aura shape from one of Nivel20's measurement templates.
     * - "cone": circles (angle 360) and cones
     * - "box":  squares / rectangles
     * - "line": lines
     * @param {"cone"|"box"|"line"} [kind="cone"]
     * @returns {Object|null} The aura shape entity or null if creation failed
     */
    createAuraShape(kind = "cone") {
      const native = this._getNative();
      const templateName = AURA_TEMPLATES[kind];
      const template = templateName && native?.shapeTemplate?.[templateName];
      if (!template || !native.app) return null;

      try {
        const shape = template.instantiateEntity(native.app);
        shape.setName("TokenAura");
        shape.setLocalEulerAngles(90, 0, 0);
        shape.n21AuraKind = kind;
        return shape;
      } catch (error) {
        return null;
      }
    }

    /**
     * Kind of an aura shape created with createAuraShape.
     * @param {Object} shape
     * @returns {"cone"|"box"|"line"|null}
     */
    getAuraShapeKind(shape) {
      return shape?.n21AuraKind || (shape ? "cone" : null);
    }

    /**
     * Set the local scale of a shape
     * @param {Object} shape - The shape entity
     * @param {number} x - X scale
     * @param {number} y - Y scale
     * @param {number} z - Z scale
     * @returns {boolean} True if scale was set successfully
     */
    setShapeScale(shape, x, y, z) {
      if (!shape || typeof shape.setLocalScale !== "function") return false;
      
      try {
        shape.setLocalScale(x, y, z);
        return true;
      } catch (error) {
        return false;
      }
    }

    /**
     * Configure aura material parameters on a shape
     * @param {Object} shape - The shape entity
     * @param {Object} config - Configuration object
     * @param {number} config.radius - Radius (circle/cone) or length (line) in cells
     * @param {number} [config.width] - Box width / line width in cells
     * @param {number} [config.height] - Box height in cells
     * @param {number} [config.angle=360] - Cone opening angle in degrees
     * @param {number} [config.direction=0] - Cone/line direction in degrees,
     *   0 = up (north), clockwise
     * @param {Array<number>} config.borderColor - [r, g, b, a] for border
     * @param {Array<number>} config.fillColor - [r, g, b, a] for fill
     * @returns {boolean} True if material was configured successfully
     */
    configureAuraMaterial(shape, config) {
      if (!shape || !shape.render || !shape.render.material) return false;
      if (!config) return false;

      const kind = this.getAuraShapeKind(shape);

      try {
        const material = shape.render.material;
        shape.render.castShadows = false;

        // The native shaders measure rotation counter-clockwise from the
        // west; convert from a compass bearing (0 = north, clockwise).
        const rotation = (((270 - (config.direction || 0)) % 360) + 360) % 360;

        if (kind === "box") {
          const width = Math.max(config.width || 1, 0.01);
          const height = Math.max(config.height || 1, 0.01);
          // 64 shader px per cell keeps the border as thick as other auras.
          material.setParameter("uSize", [width * 64, height * 64]);
          material.setParameter("uBorderPx", 2);
          material.setParameter("uRotation", 0);
        } else {
          if (typeof config.radius !== "number") return false;
          const size = config.radius * 2;
          material.setParameter("uBorderPx", 2 / size);
          material.setParameter("uFigureSize", [63.9, 63.9]);
          material.setParameter("uRotation", rotation);
          if (kind === "line") {
            const width = Math.max(config.width || 1, 0.01);
            material.setParameter("uWidth", (width * 64) / size);
          } else {
            material.setParameter("uAngle", config.angle || 360);
          }
        }

        if (config.borderColor && Array.isArray(config.borderColor)) {
          material.setParameter("uGeomBorderColor", config.borderColor);
        }

        if (config.fillColor && Array.isArray(config.fillColor)) {
          material.setParameter("uGeomFillColor", config.fillColor);
        }

        return true;
      } catch (error) {
        return false;
      }
    }

  }

  // Register MeasurementManager
  const { registerManager } = window._n21_.utils;
  registerManager("MeasurementManager", MeasurementManager);
})();
