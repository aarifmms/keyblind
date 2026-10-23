import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": import.meta.dirname + "/src",
    },
  },
  test: {
    env: {
      CONTROL_PLANE_KEY_ENC_KEY: "keyblind-test-enc-key",
    },
  },
});
