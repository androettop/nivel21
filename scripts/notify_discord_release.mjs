#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

async function fetchImage(url, index) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download image ${index + 1}: ${url} (${response.status})`,
    );
  }

  const contentType =
    response.headers.get("content-type") || "application/octet-stream";
  const data = await response.arrayBuffer();
  const extension = contentType.includes("png")
    ? "png"
    : contentType.includes("jpeg") || contentType.includes("jpg")
      ? "jpg"
      : contentType.includes("gif")
        ? "gif"
        : contentType.includes("webp")
          ? "webp"
          : "bin";

  return {
    filename: `image_${index + 1}.${extension}`,
    blob: new Blob([Buffer.from(data)], { type: contentType }),
  };
}

async function postDiscordMessage() {
  const payload = JSON.stringify({ content: message });

  if (imageUrls.length === 0) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: payload,
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed with status ${response.status}`);
    }

    return;
  }

  const images = await Promise.all(
    imageUrls.map((url, index) => fetchImage(url, index)),
  );

  const form = new FormData();
  form.set("payload_json", payload);
  images.forEach((image, index) => {
    form.set(`files[${index}]`, image.blob, image.filename);
  });

  const response = await fetch(webhookUrl, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(
      `Discord webhook with attachments failed with status ${response.status}`,
    );
  }
}

postDiscordMessage()
  .then(() => {
    console.log("Discord notification sent");
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
