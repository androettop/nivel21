(async () => {
  try {
    /* =======================
       Feature: Ping Map
    ======================= */

    const { loadManagers } = window._n21_;

    const [
      CanvasDropdownManager,
      CameraManager,
      ChatManager,
      SettingsManager,
    ] = await loadManagers(
      "CanvasDropdownManager",
      "CameraManager",
      "ChatManager",
      "SettingsManager",
    );

    if (!SettingsManager.get("feature.ping-map.enabled")) {
      return;
    }

    const PING_COMMAND = "ping";
    const SEND_DEBOUNCE_MS = 1000;
    const PING_ANIMATION_MS = 1000;
    const PING_RING_COUNT = 3;
    const PING_RING_DELAY_MS = 200;
    const OVERLAY_ID = "n21-ping-overlay";
    const BASE_PING_SIZE_PX = 800;

    let lastPingSentAt = 0;
    let pingSyncFrame = null;
    let pingSequence = 0;
    const activePings = new Map();

    function truncateToDecimals(value, decimals) {
      const factor = 10 ** decimals;
      return Math.trunc(Number(value) * factor) / factor;
    }

    function formatCoordinate(value) {
      const truncated = truncateToDecimals(value, 4);
      return truncated.toFixed(4).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
    }

    function parsePingMessage(messageText) {
      if (typeof messageText !== "string") return null;

      const match = messageText
        .trim()
        .match(/^\/ping\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*$/i);

      if (!match) return null;

      const x = Number(match[1]);
      const z = Number(match[2]);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

      return { x, z };
    }

    function getWorldPositionFromContext(context) {
      const canvasCoords = context?.canvasCoords;
      const x = Number(canvasCoords?.x);
      const y = Number(canvasCoords?.y);

      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

      const worldPoint = CameraManager.screenToWorld(x, y, 0);
      if (!worldPoint) return null;

      const worldX = Number(worldPoint.x);
      const worldZ = Number(worldPoint.z);
      if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return null;

      return {
        x: worldX,
        z: worldZ,
      };
    }

    function getSenderInfo() {
      const senderInfoElement = document.getElementById("room_message_sender_info");
      return senderInfoElement?.value || null;
    }

    function ensureOverlay() {
      const canvas = document.querySelector("#application-canvas");
      if (!canvas || !canvas.parentElement) return null;

      let overlay = document.getElementById(OVERLAY_ID);
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = OVERLAY_ID;
        overlay.className = "n21-ping-overlay";

        const parent = canvas.parentElement;
        if (canvas.nextSibling) {
          parent.insertBefore(overlay, canvas.nextSibling);
        } else {
          parent.appendChild(overlay);
        }
      }

      return overlay;
    }

    function getCurrentOrthoHeight() {
      const cameraSettings = CameraManager.getCurrentCameraSettings();
      const orthoHeight = Number(cameraSettings?.orthoHeight);

      if (!Number.isFinite(orthoHeight) || orthoHeight <= 0) {
        return 1;
      }

      return orthoHeight;
    }

    function getPingSizePx() {
      return BASE_PING_SIZE_PX / getCurrentOrthoHeight();
    }

    function getScreenPositionFromWorld(worldX, worldZ) {
      const screenPoint = CameraManager.worldToScreen(worldX, worldZ, 0);
      if (!screenPoint) return null;

      const screenX = Number(screenPoint.x);
      const screenY = Number(screenPoint.y);
      if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return null;

      return { x: screenX, y: screenY };
    }

    function updatePingMarkerScreenPosition(activePing) {
      if (!activePing?.marker?.isConnected) return false;

      const screenPosition = getScreenPositionFromWorld(activePing.worldX, activePing.worldZ);
      if (!screenPosition) return false;

      activePing.marker.style.left = `${screenPosition.x}px`;
      activePing.marker.style.top = `${screenPosition.y}px`;

      const pingSizePx = getPingSizePx();
      activePing.marker.style.width = `${pingSizePx}px`;
      activePing.marker.style.height = `${pingSizePx}px`;

      return true;
    }

    function stopPingPositionSyncIfNeeded() {
      if (activePings.size > 0) return;
      if (pingSyncFrame === null) return;

      cancelAnimationFrame(pingSyncFrame);
      pingSyncFrame = null;
    }

    function startPingPositionSync() {
      if (pingSyncFrame !== null) return;

      const sync = () => {
        for (const [pingId, activePing] of activePings.entries()) {
          const updated = updatePingMarkerScreenPosition(activePing);
          if (!updated) {
            activePings.delete(pingId);
          }
        }

        if (activePings.size > 0) {
          pingSyncFrame = requestAnimationFrame(sync);
          return;
        }

        pingSyncFrame = null;
      };

      pingSyncFrame = requestAnimationFrame(sync);
    }

    function registerActivePing(marker, worldX, worldZ) {
      const pingId = ++pingSequence;
      activePings.set(pingId, {
        marker,
        worldX,
        worldZ,
      });

      startPingPositionSync();
      return pingId;
    }

    function unregisterActivePing(pingId) {
      activePings.delete(pingId);
      stopPingPositionSyncIfNeeded();
    }

    function hashString(value) {
      let hash = 0;
      const text = String(value || "");

      for (let index = 0; index < text.length; index += 1) {
        hash = (hash << 5) - hash + text.charCodeAt(index);
        hash |= 0;
      }

      return hash;
    }

    function getPingColorFromSenderName(senderName) {
      const normalizedName = String(senderName || "").trim().toLowerCase() || "unknown";
      const hash = hashString(normalizedName);
      const hue = Math.abs(hash) % 360;

      return {
        border: `hsl(${hue}, 65%, 55%)`,
        fill: `hsla(${hue}, 65%, 55%, 0.4)`,
      };
    }

    function showPingAtScreen(screenX, screenY, worldX, worldZ, pingColor) {
      const overlay = ensureOverlay();
      if (!overlay) return;

      if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return;

      const marker = document.createElement("div");
      marker.className = "n21-ping-marker";
      marker.style.left = `${screenX}px`;
      marker.style.top = `${screenY}px`;
      marker.style.width = `${getPingSizePx()}px`;
      marker.style.height = `${getPingSizePx()}px`;
      marker.style.setProperty("--n21-ping-border", pingColor?.border || "#840b0b");
      marker.style.setProperty("--n21-ping-fill", pingColor?.fill || "#ce0606");

      for (let index = 0; index < PING_RING_COUNT; index += 1) {
        const ring = document.createElement("div");
        ring.className = "n21-ping-ring";
        ring.style.animationDelay = `${index * PING_RING_DELAY_MS}ms`;
        marker.appendChild(ring);
      }

      overlay.appendChild(marker);

      const pingId = registerActivePing(marker, worldX, worldZ);

      setTimeout(() => {
        unregisterActivePing(pingId);
        marker.remove();
      }, PING_ANIMATION_MS + PING_RING_DELAY_MS * (PING_RING_COUNT - 1));
    }

    function showPingAtWorld(worldX, worldZ, pingColor) {
      const screenPosition = getScreenPositionFromWorld(worldX, worldZ);
      if (!screenPosition) return;

      showPingAtScreen(screenPosition.x, screenPosition.y, worldX, worldZ, pingColor);
    }

    function sendPingCommand(worldX, worldZ) {
      const now = Date.now();
      if (now - lastPingSentAt < SEND_DEBOUNCE_MS) return;
      lastPingSentAt = now;

      const x = formatCoordinate(worldX);
      const z = formatCoordinate(worldZ);
      const senderInfo = getSenderInfo();

      const messageOptions = { visibility: "public" };
      if (senderInfo) {
        messageOptions.sender_info = senderInfo;
      }

      ChatManager.send(`/${PING_COMMAND} ${x} ${z}`, messageOptions);
    }

    CanvasDropdownManager.registerOption({
      id: "n21-ping-map",
      label: "Ping",
      showOn: ["always"],
      order: 5,
      onClick: (context) => {
        const position = getWorldPositionFromContext(context);
        if (!position) return;

        sendPingCommand(position.x, position.z);
      },
    });

    ChatManager.onMessage((messageData) => {
      const message = messageData?.message;
      const ping = parsePingMessage(message);
      if (!ping) return true;

      const senderName = messageData?.senderName || "unknown";
      const pingColor = getPingColorFromSenderName(senderName);

      showPingAtWorld(ping.x, ping.z, pingColor);
      return true;
    });
  } catch (error) {
    console.warn("N21: Error en feature Ping Map:", error.message);
  }
})();
