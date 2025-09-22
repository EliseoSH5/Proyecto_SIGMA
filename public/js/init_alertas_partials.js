// public/js/init_alertas_partials.js
import { loadSidebar } from "./loadSidebar.js";
import { loadTopbar } from "./loadTopbar.js";

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadSidebar("sidebar-container"); // inyecta sidebar en el contenedor
    await loadTopbar(".main");              // inyecta topbar al inicio de .main
  } catch (e) {
    console.warn("No se pudieron cargar los partials:", e);
  }
});
