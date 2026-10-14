(async () => {
  try {
    /* =======================
       Feature: Token Health Bar (Barras de vida en los tokens)

       Dibuja una barra de vida debajo de cada token asignado a un
       personaje/criatura ([char:id]). Cada usuario solo ve las barras de los
       personajes/criaturas que puede ver en su propio panel de personajes (el
       DM los ve todos). No se envía nada a Nivel20: es solo una capa visual.
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

    if (!SettingsManager.get("feature.token-health-bar.enabled")) {
      return;
    }

    // networkId -> entry snapshot ({ currentHp, maxHp, tempHp })
    let bars = new Map();
    let rebuildTimer = null;

    function rebuild() {
      rebuildTimer = null;
      const assignments = TokenManager.getAllTokenIds()
        .map((networkId) => ({ networkId, rowId: TokenManager.getTokenTag(networkId, "char") }))
        .filter((a) => a.rowId);

      const next = new Map();
      CombatTrackingManager.mapTokensToEntries(assignments).forEach((ref, networkId) => {
        // getEntry only returns rows visible in this client's panel.
        const entry = CombatTrackingManager.getEntry(ref.type, ref.id, ref.index);
        if (!entry || !(entry.maxHp > 0)) return;
        next.set(networkId, {
          currentHp: entry.currentHp,
          maxHp: entry.maxHp,
          tempHp: entry.tempHp,
        });
      });
      bars = next;
    }

    function scheduleRebuild() {
      if (rebuildTimer) return;
      rebuildTimer = setTimeout(rebuild, 100);
    }

    function barColor(ratio) {
      if (ratio > 0.5) return "#3fa34d";
      if (ratio > 0.25) return "#e0a020";
      return "#d23a2f";
    }

    function draw(ctx, helpers) {
      bars.forEach((hp, networkId) => {
        const visibility = TokenManager.getTokenVisibility(networkId);
        if (!visibility || (visibility.hidden && !visibility.translucent)) return;

        const rect = helpers.rectOf(networkId);
        if (!rect || rect.width < 8) return;
        if (
          rect.x > helpers.width ||
          rect.y > helpers.height ||
          rect.x + rect.width < 0 ||
          rect.y + rect.height < 0
        ) {
          return;
        }

        const width = rect.width * 0.9;
        const height = Math.max(4, Math.min(rect.width * 0.08, 12));
        const x = rect.x + (rect.width - width) / 2;
        const y = rect.y + rect.height + Math.max(2, height * 0.4);
        const ratio = Math.max(0, Math.min(hp.currentHp / hp.maxHp, 1));
        const tempRatio = Math.max(0, Math.min(hp.tempHp / hp.maxHp, 1));

        ctx.globalAlpha = visibility.translucent ? 0.5 : 1;
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(x - 1, y - 1, width + 2, height + 2);
        ctx.fillStyle = "#3a3c40";
        ctx.fillRect(x, y, width, height);
        ctx.fillStyle = barColor(ratio);
        ctx.fillRect(x, y, width * ratio, height);
        if (tempRatio > 0) {
          ctx.fillStyle = "#4a90d9";
          ctx.fillRect(x, y, width * tempRatio, Math.max(2, height * 0.35));
        }
      });
    }

    TokenManager.onTokenMetadataChange(scheduleRebuild);
    CombatTrackingManager.onChange(scheduleRebuild);
    // Tokens added/removed without metadata changes.
    setInterval(scheduleRebuild, 3000);
    rebuild();

    TokenOverlayManager.addLayer("token-health-bar", draw, 10);
  } catch (error) {
    window._n21_.utils.registerFeatureError("Token Health Bar", error);
  }
})();
