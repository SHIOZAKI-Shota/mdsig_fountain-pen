export default defineNuxtPlugin(async () => {
  if (!import.meta.dev || "__TAURI_INTERNALS__" in window || !location.search.includes("mock")) return;
  const { install } = await import("../../test/mock/ipc.ts");
  install();
});
