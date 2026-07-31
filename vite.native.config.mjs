import { defineConfig } from "vite";

export default defineConfig({
  root: "native-spike",
  build: {
    emptyOutDir: true,
    outDir: "../dist-native",
  },
});
