/**
 * IndexedDB blob store for extension-lite history images.
 * Shared by background.js (service worker) and popup.js (side panel) — same extension origin.
 * Keeps base64 image data out of chrome.storage.local (5 MB quota); stores Blobs keyed by refId.
 */

const DB_NAME = "aid_images_v1";
const DB_VERSION = 1;
const STORE = "images";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function store(mode) {
  return openDb().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

export async function putImageBlob(refId, blob) {
  if (!refId || !(blob instanceof Blob)) return;
  const os = await store("readwrite");
  await new Promise((resolve, reject) => {
    const r = os.put(blob, refId);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

export async function getImageBlob(refId) {
  if (!refId) return null;
  const os = await store("readonly");
  return new Promise((resolve) => {
    const r = os.get(refId);
    r.onsuccess = () => resolve(r.result instanceof Blob ? r.result : null);
    r.onerror = () => resolve(null);
  });
}

export async function deleteImage(refId) {
  if (!refId) return;
  const os = await store("readwrite");
  await new Promise((resolve) => {
    const r = os.delete(refId);
    r.onsuccess = () => resolve();
    r.onerror = () => resolve();
  });
}

export async function getAllRefIds() {
  const os = await store("readonly");
  return new Promise((resolve) => {
    const r = os.getAllKeys();
    r.onsuccess = () => resolve(Array.isArray(r.result) ? r.result.map(String) : []);
    r.onerror = () => resolve([]);
  });
}

export async function pruneImages(keepRefIds) {
  const keep = new Set(keepRefIds || []);
  const all = await getAllRefIds();
  await Promise.all(all.filter((id) => !keep.has(id)).map((id) => deleteImage(id)));
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

// FileReader is unavailable in MV3 service workers, so build the data URL manually.
export async function blobToDataUrl(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  const type = blob.type || "image/jpeg";
  return `data:${type};base64,${btoa(binary)}`;
}

export async function getImageDataUrl(refId) {
  const blob = await getImageBlob(refId);
  if (!blob) return null;
  return blobToDataUrl(blob);
}
