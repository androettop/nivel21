(async () => {
  try {
    /* =======================
       Feature: Token Conditions (Estados en los tokens)

       Muestra, sobre el borde derecho de cada token asignado a un
       personaje/criatura ([char:id]), los íconos de sus estados (los mismos
       íconos que usa Nivel20): hasta 4 filas; si hay más, se agregan columnas
       hacia la izquierda. Cada
       usuario solo los ve en los personajes/criaturas que puede ver en su
       panel (el DM los ve todos). Es solo una capa visual.
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

    if (!SettingsManager.get("feature.token-conditions.enabled")) {
      return;
    }

    const ROWS = 4;
    const images = new Map(); // url -> HTMLImageElement
    let tokenIcons = new Map(); // networkId -> [iconUrl]
    let rebuildTimer = null;

    function getImage(url) {
      let img = images.get(url);
      if (!img) {
        img = new Image();
        img.src = url;
        images.set(url, img);
      }
      return img;
    }

    function rebuild() {
      rebuildTimer = null;
      const assignments = TokenManager.getAllTokenIds()
        .map((networkId) => ({ networkId, rowId: TokenManager.getTokenTag(networkId, "char") }))
        .filter((a) => a.rowId);

      const next = new Map();
      CombatTrackingManager.mapTokensToEntries(assignments).forEach((ref, networkId) => {
        // getEntry only returns rows visible in this client's panel.
        const entry = CombatTrackingManager.getEntry(ref.type, ref.id, ref.index);
        const icons = (entry?.conditions || []).map((c) => c?.icon).filter(Boolean);
        if (icons.length) next.set(networkId, icons);
      });
      tokenIcons = next;
    }

    function scheduleRebuild() {
      if (rebuildTimer) return;
      rebuildTimer = setTimeout(rebuild, 100);
    }

    function roundedRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function draw(ctx, helpers) {
      tokenIcons.forEach((icons, networkId) => {
        const visibility = TokenManager.getTokenVisibility(networkId);
        if (!visibility || (visibility.hidden && !visibility.translucent)) return;

        const rect = helpers.rectOf(networkId);
        if (!rect || rect.width < 12) return;

        const gap = Math.max(1, rect.height * 0.02);
        const size = Math.max(10, Math.min((rect.height - gap * (ROWS - 1)) / ROWS, 32));
        // Right edge aligned with the token's box; extra columns grow left.
        const rightX = rect.x + rect.width - size;
        const startY = rect.y;
        if (rect.x > helpers.width || startY > helpers.height || startY + rect.height < 0) return;

        ctx.globalAlpha = visibility.translucent ? 0.6 : 1;
        icons.forEach((url, i) => {
          const col = Math.floor(i / ROWS);
          const row = i % ROWS;
          const x = rightX - col * (size + gap);
          const y = startY + row * (size + gap);
          const radius = size * 0.15;

          ctx.save();
          roundedRect(ctx, x, y, size, size, radius);
          ctx.fillStyle = "rgba(23, 24, 26, 0.85)";
          ctx.fill();
          ctx.clip();
          const img = getImage(url);
          if (img.complete && img.naturalWidth) ctx.drawImage(img, x, y, size, size);
          ctx.restore();

          roundedRect(ctx, x, y, size, size, radius);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
          ctx.stroke();
        });
      });
    }

    TokenManager.onTokenMetadataChange(scheduleRebuild);
    CombatTrackingManager.onChange(scheduleRebuild);
    setInterval(scheduleRebuild, 3000);
    rebuild();

    TokenOverlayManager.addLayer("token-conditions", draw, 15);
  } catch (error) {
    window._n21_.utils.registerFeatureError("Token Conditions", error);
  }
})();
