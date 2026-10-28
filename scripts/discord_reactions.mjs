// Custom emojis from the Nivel21 server, added to the release announcement
// as each step of the release is done.
export const EMOJIS = {
  github: "github_ready:1469761185443221677",
  firefox: "firefox_ready:1469761212735688766",
  chrome: "chrome_ready:1469761153105137907",
};

const API_URL = "https://discord.com/api/v10";

function botHeaders() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is required");
  }
  return { Authorization: `Bot ${token}` };
}

export async function getMessage({ channelId, messageId }) {
  const response = await fetch(
    `${API_URL}/channels/${channelId}/messages/${messageId}`,
    { headers: botHeaders() },
  );
  if (!response.ok) {
    throw new Error(`Discord get message failed with status ${response.status}`);
  }
  return response.json();
}

export async function addReaction({ channelId, messageId }, emoji) {
  const response = await fetch(
    `${API_URL}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    { method: "PUT", headers: botHeaders() },
  );
  if (!response.ok) {
    throw new Error(`Discord reaction failed with status ${response.status}`);
  }
}
