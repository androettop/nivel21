(async () => {
  try {
    /* =======================
       Feature: Invisible Condition (Estado Invisible)

       Si el personaje/criatura asignado a un token ([char:id]) tiene el
       estado «Invisible» (la condición del panel de personajes, no el
       invisible del DM), el token se oculta para quienes no ven a ese
       personaje/criatura en su panel. Quienes sí lo ven (el DM siempre) lo
       ven semitransparente; el ícono del estado lo muestra la feature
       «Estados en los tokens».

       Todo ocurre solo en el cliente: no cambia nada en Nivel20 ni muestra
       nada que el servidor oculte (sin la extensión todos ven el token).
    ======================= */

    const { loadManagers } = window._n21_;

    const [
      TokenManager,
      CombatTrackingManager,
      SettingsManager,
    ] = await loadManagers(
      "TokenManager",
      "CombatTrackingManager",
      "SettingsManager",
    );

    // Applies live: disabling it reveals every token it was hiding.
    let enabled = SettingsManager.get("feature.invisible-condition.enabled");

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
        .map((networkId) => ({ networkId, ...TokenManager.getLinkedRow(networkId) }))
        .filter((a) => a.rowId);

      const next = new Map();
      if (enabled) CombatTrackingManager.mapTokensToEntries(assignments).forEach((ref, networkId) => {
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

    SettingsManager.watch("feature.invisible-condition.enabled", (value) => {
      enabled = !!value;
      scheduleSync();
    });
    TokenManager.onTokenMetadataChange(scheduleSync);
    CombatTrackingManager.onChange(scheduleSync);
    setInterval(scheduleSync, 3000);
    sync();

  } catch (error) {
    window._n21_.utils.registerFeatureError("Invisible Condition", error);
  }
})();
