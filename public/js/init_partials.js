// public/js/init_partials.js
import { loadSidebar } from "./loadSidebar.js";
import { loadTopbar } from "./loadTopbar.js";

// al cargar DOM
window.addEventListener("DOMContentLoaded", () => {
  // inyecta el sidebar en el contenedor
  loadSidebar("sidebar-container");

  // inyecta el topbar al inicio de .main (si quieres en todas)
  loadTopbar(".main");
});
