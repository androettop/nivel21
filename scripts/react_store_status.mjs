#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { EMOJIS, addReaction, getMessage } from "./discord_reactions.mjs";

const [, , releaseTagArg, messageFileArg, ...storesArg] = process.argv;

if (!releaseTagArg || !messageFileArg || storesArg.length === 0) {
  console.error(
    "Usage: react_store_status.mjs <release_tag> <message_file> <firefox|chrome>...",
  );
  process.exit(1);
}

const version = releaseTagArg.replace(/^v/, "");
const message = JSON.parse(readFileSync(messageFileArg, "utf8"));

const CHROME_EXTENSION_ID = "jadlpdmjlfghndcehdhjhgndfmigbdoe";
const FIREFOX_ADDON_SLUG = "nivel21";

// Each store returns the version it's serving to users right now.
const PUBLISHED_VERSION = {
  async firefox() {
    const response = await fetch(
      `https://addons.mozilla.org/api/v5/addons/addon/${FIREFOX_ADDON_SLUG}/`,
    );
    if (!response.ok) {
      throw new Error(`AMO request failed with status ${response.status}`);
    }
    const addon = await response.json();
    return addon.current_version.version;
  },

  // The same update check Chrome runs for installed extensions.
  async chrome() {
    const url = new URL("https://clients2.google.com/service/update2/crx");
    url.searchParams.set("response", "updatecheck");
    url.searchParams.set("acceptformat", "crx3");
    url.searchParams.set("prodversion", "150.0");
    url.searchParams.set("x", `id=${CHROME_EXTENSION_ID}&uc`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Chrome update check failed with status ${response.status}`,
      );
    }
    const xml = await response.text();
    return xml.match(/<updatecheck[^>]*\sversion="([^"]+)"/)?.[1];
  },
};

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function main() {
  const { reactions = [] } = await getMessage(message);
  const reacted = new Set(
    reactions
      .filter((reaction) => reaction.me)
      .map((reaction) => `${reaction.emoji.name}:${reaction.emoji.id}`),
  );

  for (const store of storesArg) {
    if (!PUBLISHED_VERSION[store]) {
      throw new Error(`Unknown store: ${store}`);
    }
    if (reacted.has(EMOJIS[store])) {
      console.log(`${store}: already marked as published`);
      continue;
    }

    const published = await PUBLISHED_VERSION[store]();
    if (!published || compareVersions(published, version) < 0) {
      console.log(`${store}: still serving ${published}, waiting for ${version}`);
      continue;
    }

    await addReaction(message, EMOJIS[store]);
    console.log(`${store}: ${version} published, reaction added`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
