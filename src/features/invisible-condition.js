(async () => {
  try {
    /* =======================
       Feature: Invisible Condition (Estado Invisible)

       Si el personaje/criatura asignado a un token ([char:id]) tiene el
       estado «Invisible» (la condición del panel de personajes, no el
       invisible del DM), el token se oculta para quienes no ven a ese
       personaje/criatura en su panel. Quienes sí lo ven (el DM siempre) lo
       ven semitransparente con un icono que indica que es invisible por el
       estado.

       Todo ocurre solo en el cliente: no cambia nada en Nivel20 ni muestra
       nada que el servidor oculte (sin la extensión todos ven el token).
    ======================= */

    const { loadManagers } = window._n21_;

    const [
      TokenManager,
      CombatTrackingManager,
      TokenOverlayManager,
      SettingsManager,
    ] = await loadManagers(
      "TokenManager",
      "CombatTrackingManager",
      "TokenOverlayManager",
      "SettingsManager",
    );

    if (!SettingsManager.get("feature.invisible-condition.enabled")) {
      return;
    }

    const SOURCE = "invisible-condition";
    const CONDITION_NAME = "invisible";

    // networkId -> "hidden" | "translucent" (tokens we currently override)
    let overridden = new Map();
    let syncTimer = null;

    function isInvisible(ref) {
      return CombatTrackingManager.getConditions(ref.type, ref.id, ref.index).some(
        (condition) => CombatTrackingManager.normalizeText(condition?.name) === CONDITION_NAME,
      );
    }

    function sync() {
      syncTimer = null;
      const assignments = TokenManager.getAllTokenIds()
        .map((networkId) => ({ networkId, rowId: TokenManager.getTokenTag(networkId, "char") }))
        .filter((a) => a.rowId);

      const next = new Map();
      CombatTrackingManager.mapTokensToEntries(assignments).forEach((ref, networkId) => {
        if (!isInvisible(ref)) return;
        const canSee = CombatTrackingManager.isRowVisible(ref.type, ref.id);
        next.set(networkId, canSee ? "translucent" : "hidden");
      });

      // Clear tokens that are no longer invisible (or unassigned/removed).
      overridden.forEach((_mode, networkId) => {
        if (next.has(networkId)) return;
        TokenManager.setLocalVisibilityOverride(networkId, SOURCE, null);
        TokenManager.setSelectionBlocked(networkId, SOURCE, false);
      });

      next.forEach((mode, networkId) => {
        TokenManager.setLocalVisibilityOverride(networkId, SOURCE, mode);
        TokenManager.setSelectionBlocked(networkId, SOURCE, mode === "hidden");
      });

      overridden = next;
    }

    function scheduleSync() {
      if (syncTimer) return;
      syncTimer = setTimeout(sync, 100);
    }

    // "Eye off" badge (feather icon) on tokens this client sees translucent.
    const EYE_OFF = new Path2D(
      "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22",
    );

    function drawBadges(ctx, helpers) {
      overridden.forEach((mode, networkId) => {
        if (mode !== "translucent") return;
        const rect = helpers.rectOf(networkId);
        if (!rect || rect.width < 12) return;

        const radius = Math.max(9, Math.min(rect.width * 0.14, 18));
        const cx = rect.x + rect.width - radius * 0.6;
        const cy = rect.y + radius * 0.6;

        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(23, 24, 26, 0.92)";
        ctx.fill();
        ctx.lineWidth = Math.max(1, radius * 0.1);
        ctx.strokeStyle = "#b9a3e3";
        ctx.stroke();

        const size = radius * 1.2;
        ctx.save();
        ctx.translate(cx - size / 2, cy - size / 2);
        ctx.scale(size / 24, size / 24);
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#ece6f8";
        ctx.stroke(EYE_OFF);
        ctx.restore();
      });
    }

    TokenManager.onTokenMetadataChange(scheduleSync);
    CombatTrackingManager.onChange(scheduleSync);
    setInterval(scheduleSync, 3000);
    sync();

    TokenOverlayManager.addLayer(SOURCE, drawBadges, 20);
  } catch (error) {
    window._n21_.utils.registerFeatureError("Invisible Condition", error);
  }
})();
