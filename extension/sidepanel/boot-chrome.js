import { configureStv } from "./stv-config.js";
import { createChromePlatform } from "./platform/chrome-platform.js";
import { boot } from "./stv-core.js";

configureStv({
  platform: createChromePlatform(),
  createSupabaseClient: async () => null,
  getApiOrigin: () => localStorage.getItem("stv_api_origin") || "https://imageprompt.tools"
});

boot();
