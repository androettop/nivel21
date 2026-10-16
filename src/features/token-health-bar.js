(async () => {
  try {
    /* =======================
       Feature: Token Health Bar (Puntos de golpe en los tokens)

       Muestra los PV ("actual/máximo") en chico, abajo dentro de la base de
       cada token asignado a un personaje/criatura ([char:id]). Cada usuario solo ve los PV de los
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


    // networkId -> entry snapshot ({ currentHp, maxHp, tempHp })
    let bars = new Map();
    let rebuildTimer = null;

    function rebuild() {
      rebuildTimer = null;
      const assignments = TokenManager.getAllTokenIds()
        .map((networkId) => ({ networkId, ...TokenManager.getLinkedRow(networkId) }))
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

    // Small "current/max" label at the bottom, inside the token base.
    const TEXT_COLOR = "#f2f0ea";
    const TEMP_COLOR = "#7fb8ec";
    const DOWN_COLOR = "#ff8a80";

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
      bars.forEach((hp, networkId) => {
        const visibility = TokenManager.getTokenVisibility(networkId);
        if (!visibility || (visibility.hidden && !visibility.translucent)) return;

        const rect = helpers.rectOf(networkId);
        if (!rect || rect.width < 24) return;
        if (
          rect.x > helpers.width ||
          rect.y > helpers.height ||
          rect.x + rect.width < 0 ||
          rect.y + rect.height < 0
        ) {
          return;
        }

        const main = String(hp.currentHp);
        const temp = hp.tempHp > 0 ? `+${hp.tempHp}` : "";
        const rest = `/${hp.maxHp}`;
        // Never wider than the token: shrink padding first, then the text.
        const maxWidth = rect.width * 0.9;
        let fontSize = Math.round(Math.min(Math.max(rect.width * 0.15, 9), 14));
        let wMain;
        let wTemp;
        let wRest;
        let textWidth;
        const measure = () => {
          ctx.font = `700 ${fontSize}px sans-serif`;
          wMain = ctx.measureText(main).width;
          wTemp = temp ? ctx.measureText(temp).width : 0;
          wRest = ctx.measureText(rest).width;
          textWidth = wMain + wTemp + wRest;
        };
        measure();
        const minPad = fontSize * 0.3;
        if (textWidth + minPad * 2 > maxWidth) {
          fontSize = Math.max(6, Math.floor(fontSize * (maxWidth - minPad * 2) / textWidth));
          measure();
        }
        ctx.textBaseline = "middle";

        const padX = Math.max(
          Math.min(fontSize * 0.9, (maxWidth - textWidth) / 2),
          fontSize * 0.3,
        );
        const boxW = textWidth + padX * 2;
        const boxH = fontSize * 1.25;
        const x = rect.x + (rect.width - boxW) / 2;
        const y = rect.y + rect.height - boxH - rect.height * 0.04;

        ctx.globalAlpha = visibility.translucent ? 0.5 : 1;
        roundedRect(ctx, x, y, boxW, boxH, boxH / 2);
        ctx.fillStyle = "rgba(15, 16, 18, 0.72)";
        ctx.fill();

        // Dark red fill that empties as hit points go down.
        const ratio = Math.max(0, Math.min(hp.currentHp / hp.maxHp, 1));
        if (ratio > 0) {
          ctx.save();
          roundedRect(ctx, x, y, boxW, boxH, boxH / 2);
          ctx.clip();
          ctx.fillStyle = "rgba(150, 24, 20, 0.7)";
          ctx.fillRect(x, y, boxW * ratio, boxH);
          ctx.restore();
        }

        let cursor = x + padX;
        const middle = y + boxH / 2 + 0.5;
        ctx.fillStyle = hp.currentHp <= 0 ? DOWN_COLOR : TEXT_COLOR;
        ctx.fillText(main, cursor, middle);
        cursor += wMain;
        if (temp) {
          ctx.fillStyle = TEMP_COLOR;
          ctx.fillText(temp, cursor, middle);
          cursor += wTemp;
        }
        ctx.fillStyle = TEXT_COLOR;
        ctx.fillText(rest, cursor, middle);
      });
    }

    TokenManager.onTokenMetadataChange(scheduleRebuild);
    CombatTrackingManager.onChange(scheduleRebuild);
    // Tokens added/removed without metadata changes.
    setInterval(scheduleRebuild, 3000);
    rebuild();

    // Applies live: the layer is added/removed with the setting.
    SettingsManager.watch("feature.token-health-bar.enabled", (enabled) => {
      if (enabled) {
        rebuild();
        TokenOverlayManager.addLayer("token-health-bar", draw, 10);
      } else {
        TokenOverlayManager.removeLayer("token-health-bar");
      }
    });
  } catch (error) {
    window._n21_.utils.registerFeatureError("Token Health Bar", error);
  }
})();
