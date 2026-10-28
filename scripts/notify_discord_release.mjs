#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMOJIS, addReaction } from "./discord_reactions.mjs";

const [, , releaseTagArg, releaseDescriptionArg] = process.argv;

if (!releaseTagArg || releaseDescriptionArg === undefined) {
  console.error(
    "Usage: notify_discord_release.mjs <release_tag> <release_description>",
  );
  process.exit(1);
}

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
if (!webhookUrl) {
  console.error("DISCORD_WEBHOOK_URL is required");
  process.exit(1);
}

// wait=true makes Discord return the created message, so it can be reacted to
// later. Saved where the release workflow attaches it to the release.
const postUrl = new URL(webhookUrl);
postUrl.searchParams.set("wait", "true");
const messageFile = process.env.DISCORD_MESSAGE_FILE || "discord-message.json";

const releaseTag = releaseTagArg;
const releaseDescription = releaseDescriptionArg;

function stripImagesAndCollectUrls(text) {
  const urls = [];
  const htmlImgRegex = /<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
  const mdImgRegex = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g;

  let match;
  while ((match = htmlImgRegex.exec(text)) !== null) {
    urls.push(match[1]);
  }

  while ((match = mdImgRegex.exec(text)) !== null) {
    urls.push(match[1]);
  }

  let clean = text
    .replace(/<img[^>]*\ssrc=["'][^"']+["'][^>]*>/gi, "")
    .replace(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g, "")
    .replace(/<\/?br\s*\/?>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const dedupUrls = [...new Set(urls)];
  return { cleanDescription: clean, imageUrls: dedupUrls };
}

const { cleanDescription, imageUrls } =
  stripImagesAndCollectUrls(releaseDescription);

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFilePath);
const templatePath = join(currentDir, "discord-template.md");

const template = readFileSync(templatePath, "utf8").trim();

const message = template
  .replaceAll("{tag}", releaseTag)
  .replaceAll("{description}", cleanDescription);

const IMAGE_TYPES = [
  { extension: "png", type: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { extension: "jpg", type: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { extension: "gif", type: "image/gif", magic: [0x47, 0x49, 0x46, 0x38] },
  { extension: "webp", type: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] },
];

// GitHub serves release assets as application/octet-stream, so the
// content-type can't be trusted: look at the file itself, then the URL.
function detectImageType(bytes, url, contentType) {
  const byMagic = IMAGE_TYPES.find((image) =>
    image.magic.every((byte, i) => bytes[i] === byte),
  );
  if (byMagic) return byMagic;

  const urlExtension = new URL(url).pathname.split(".").pop().toLowerCase();
  const byUrl = IMAGE_TYPES.find(
    (image) =>
      image.extension === urlExtension ||
      (image.extension === "jpg" && urlExtension === "jpeg"),
  );
  if (byUrl) return byUrl;

  return { extension: "bin", type: contentType || "application/octet-stream" };
}

async function fetchImage(url, index) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download image ${index + 1}: ${url} (${response.status})`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const { extension, type } = detectImageType(
    bytes,
    url,
    response.headers.get("content-type"),
  );

  return {
    filename: `image_${index + 1}.${extension}`,
    blob: new Blob([Buffer.from(bytes)], { type }),
  };
}

async function postDiscordMessage() {
  // SUPPRESS_EMBEDS: no link preview card for the release URL. Attached
  // images are files, not embeds, so they still show.
  const payload = JSON.stringify({ content: message, flags: 1 << 2 });

  if (imageUrls.length === 0) {
    const response = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: payload,
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed with status ${response.status}`);
    }

    return response.json();
  }

  const images = await Promise.all(
    imageUrls.map((url, index) => fetchImage(url, index)),
  );

  const form = new FormData();
  form.set("payload_json", payload);
  images.forEach((image, index) => {
    form.set(`files[${index}]`, image.blob, image.filename);
  });

  const response = await fetch(postUrl, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(
      `Discord webhook with attachments failed with status ${response.status}`,
    );
  }

  return response.json();
}

postDiscordMessage()
  .then(async (sent) => {
    console.log("Discord notification sent");

    const message = { channelId: sent.channel_id, messageId: sent.id };
    writeFileSync(messageFile, JSON.stringify(message));
    await addReaction(message, EMOJIS.github);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
