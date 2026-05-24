#!/usr/bin/env node
/**
 * Regression check: JPEG / WebP uploads must pass validate + resize + API parse.
 *
 * Usage: node extension-lite/scripts/test-upload-fixture.mjs [path-to-image]
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareUploadFile,
  sniffImageMimeFromUint8,
} from "../lib/image-utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultFixture = join(__dirname, "../test-fixtures/princess-jpeg-as-png.png");
const webpFixture = resolve(__dirname, "../../landing/public/welcome/w1.webp");
const fixturePath = resolve(process.argv[2] || defaultFixture);

function extractBase64AndMime(dataUrl) {
  const trimmed = dataUrl.trim();
  const match = /^data:\s*([^;,]+)\s*;\s*base64\s*,\s*([\s\S]+)$/i.exec(trimmed);
  if (!match) return null;
  let mimeType = match[1].trim().toLowerCase();
  if (mimeType === "image/jpg" || mimeType === "image/pjpeg") mimeType = "image/jpeg";
  const compactB64 = match[2].replace(/\s/g, "");
  const buf = Buffer.from(compactB64, "base64");
  const sniffed = sniffImageMimeFromUint8(new Uint8Array(buf));
  if (sniffed) mimeType = sniffed;
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!allowed.has(mimeType) || !sniffed) return null;
  return { mimeType, dataLen: compactB64.length };
}

async function runCase(label, path, name, type) {
  const buf = readFileSync(path);
  const file = new File([buf], name, { type });
  const prepared = await prepareUploadFile(file);
  if (!prepared.ok) {
    console.error(`${label}: prepare failed`, prepared.error);
    process.exit(1);
  }
  const apiParsed = extractBase64AndMime(prepared.dataUrl);
  if (!apiParsed) {
    console.error(`${label}: API parse failed`);
    process.exit(1);
  }
  console.log(`${label}: ok ${apiParsed.mimeType} dataUrlLen=${prepared.dataUrl.length}`);
}

await runCase("jpg", fixturePath, "photo.jpg", "image/jpeg");
await runCase("jpeg", fixturePath, "photo.jpeg", "image/jpeg");
await runCase("webp", webpFixture, "photo.webp", "image/webp");
console.log("fixture-test: PASS");
