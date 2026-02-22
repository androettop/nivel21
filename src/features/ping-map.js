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
    const SEND_DEBOUNCE_MS = 2000;
    const PING_ANIMATION_MS = 100000;
    const PING_RING_COUNT = 3;
    const PING_RING_DELAY_MS = 200;
    const OVERLAY_ID = "n21-ping-overlay";
    const BASE_PING_SIZE_PX = 800;
    const BASE_EMOJI_SIZE_PX = 440;
    const AUTO_PING_COLOR = "#ffffff";

    const PING_PRESETS = [//❗❌⚠️✅❓
      { id: "danger", label: "❗ Peligro", emoji: "❗", color: "#e74c3c" },
        { id: "cancel", label: "❌ Cruz", emoji: "❌", color: "#7f8c8d" },
        { id: "warning", label: "⚠️ Advertencia", emoji: "⚠️", color: "#f39c12" },
        { id: "success", label: "✅ Éxito", emoji: "✅", color: "#27ae60" },
        { id: "question", label: "❓ Pregunta", emoji: "❓", color: "#2980b9" },
    ];

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
        .match(/^\/ping\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)(?:\s+(\S+))?(?:\s+(\S+))?\s*$/i);

      if (!match) return null;

      const x = Number(match[1]);
      const z = Number(match[2]);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

      const color = normalizeColorToken(match[3] || "");
      const emoji = match[4] || "";

      return { x, z, color, emoji };
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

    function getEmojiSizePx() {
      return BASE_EMOJI_SIZE_PX / getCurrentOrthoHeight();
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

      if (activePing.emojiElement) {
        const emojiSizePx = getEmojiSizePx();
        activePing.emojiElement.style.fontSize = `${emojiSizePx}px`;
      }

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

    function registerActivePing(marker, worldX, worldZ, emojiElement = null) {
      const pingId = ++pingSequence;
      activePings.set(pingId, {
        marker,
        worldX,
        worldZ,
        emojiElement,
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

    function normalizeColorToken(value) {
      const text = String(value || "").trim().toLowerCase();
      if (!text) return null;
      if (/\s/.test(text)) return null;

      if (window.CSS && typeof window.CSS.supports === "function") {
        if (!window.CSS.supports("color", text)) return null;
      }

      return text;
    }

    function colorToAlphaVariant(color, alpha) {
      const hexMatch = String(color || "")
        .trim()
        .toLowerCase()
        .match(/^#([0-9a-f]{6})$/);

      if (!hexMatch) return color;

      const hex = hexMatch[1];
      const red = parseInt(hex.slice(0, 2), 16);
      const green = parseInt(hex.slice(2, 4), 16);
      const blue = parseInt(hex.slice(4, 6), 16);

      return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    }

    function getConfiguredPingColorToken() {
      const colorSetting = SettingsManager.get("ping-map.custom-color");
      const color = normalizeColorToken(colorSetting);
      if (!color) return null;
      if (color === AUTO_PING_COLOR) return null;
      return color;
    }

    function getPingColorFromSenderName(senderName, customColorToken = null) {
      if (customColorToken) {
        return {
          border: customColorToken,
          fill: colorToAlphaVariant(customColorToken, 0.4),
        };
      }

      const normalizedName = String(senderName || "").trim().toLowerCase() || "unknown";
      const hash = hashString(normalizedName);
      const hue = Math.abs(hash) % 360;

      return {
        border: `hsl(${hue}, 65%, 55%)`,
        fill: `hsla(${hue}, 65%, 55%, 0.4)`,
      };
    }

    function showPingAtScreen(screenX, screenY, worldX, worldZ, pingColor, emoji = "") {
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

      let emojiElement = null;
      if (emoji) {
        emojiElement = document.createElement("div");
        emojiElement.className = "n21-ping-emoji";
        emojiElement.textContent = emoji;
        emojiElement.style.fontSize = `${getEmojiSizePx()}px`;
        marker.appendChild(emojiElement);
      }

      overlay.appendChild(marker);

      const pingId = registerActivePing(marker, worldX, worldZ, emojiElement);

      setTimeout(() => {
        unregisterActivePing(pingId);
        marker.remove();
      }, PING_ANIMATION_MS + PING_RING_DELAY_MS * (PING_RING_COUNT - 1));
    }

    function showPingAtWorld(worldX, worldZ, pingColor, emoji = "") {
      const screenPosition = getScreenPositionFromWorld(worldX, worldZ);
      if (!screenPosition) return;

      showPingAtScreen(screenPosition.x, screenPosition.y, worldX, worldZ, pingColor, emoji);
    }

    function sendPingCommand(worldX, worldZ, presetId = null) {
      const now = Date.now();
      if (now - lastPingSentAt < SEND_DEBOUNCE_MS) return;
      lastPingSentAt = now;

      const x = formatCoordinate(worldX);
      const z = formatCoordinate(worldZ);
      const senderInfo = getSenderInfo();

      let color = null;
      let emoji = null;

      if (presetId) {
        const preset = PING_PRESETS.find((p) => p.id === presetId);
        if (preset) {
          color = preset.color;
          emoji = preset.emoji;
        }
      } else {
        const customColor = getConfiguredPingColorToken();
        if (customColor) {
          color = customColor;
        }
      }

      const messageOptions = { visibility: "public" };
      if (senderInfo) {
        messageOptions.sender_info = senderInfo;
      }

      let commandArgs = `/${PING_COMMAND} ${x} ${z}`;
      if (color) {
        commandArgs += ` ${color}`;
      }
      if (emoji) {
        commandArgs += ` ${emoji}`;
      }

      ChatManager.send(commandArgs, messageOptions);
    }

    CanvasDropdownManager.registerOption({
      id: "n21-ping-map",
      label: "Ping",
      showOn: ["always"],
      order: 5,
      submenu: [
        {
          id: "n21-ping-simple",
          label: "Simple Ping",
          onClick: (context) => {
            const position = getWorldPositionFromContext(context);
            if (!position) return;
            sendPingCommand(position.x, position.z, null);
          },
        },
        ...PING_PRESETS.map((preset) => ({
          id: `n21-ping-${preset.id}`,
          label: preset.label,
          onClick: (context) => {
            const position = getWorldPositionFromContext(context);
            if (!position) return;
            sendPingCommand(position.x, position.z, preset.id);
          },
        })),
      ],
    });

    ChatManager.onMessage((messageData) => {
      const message = messageData?.message;
      const ping = parsePingMessage(message);
      if (!ping) return true;

      const senderName = messageData?.senderName || "unknown";
      const pingColor = getPingColorFromSenderName(senderName, ping.color);

      showPingAtWorld(ping.x, ping.z, pingColor, ping.emoji);
      return true;
    });
  } catch (error) {
    console.warn("N21: Error en feature Ping Map:", error.message);
  }
})();
