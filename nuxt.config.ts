export default defineNuxtConfig({
  compatibilityDate: "2026-11-01",
  ssr: false,
  devtools: { enabled: false },
  telemetry: false,
  app: {
    head: {
      htmlAttrs: { lang: "ja" },
      title: "Fountain Pen",
      meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
    },
  },
  css: ["@fontsource-variable/m-plus-2/index.css", "@fontsource-variable/geist-mono/index.css", "~/assets/app.css"],
  devServer: { host: "localhost", port: 3000 },
  vite: {
    clearScreen: false,
    envPrefix: ["VITE_", "TAURI_"],
    server: { strictPort: true },
  },
  typescript: {
    tsConfig: { compilerOptions: { allowImportingTsExtensions: true } },
  },
});
