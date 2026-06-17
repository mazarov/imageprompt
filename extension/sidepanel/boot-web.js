import { configureStv } from "./stv-config.js";
import { createWebPlatform } from "./platform/web-platform.js";
import { boot } from "./stv-core.js";

configureStv({
  platform: createWebPlatform(),
  createSupabaseClient: async () => null,
  getApiOrigin: () => window.location.origin,
  getClientSource: () => "embed_stv",
});

boot();
