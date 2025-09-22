// public/js/loadSidebar.js
import { initSidebar } from './sidebar_component.js';

export async function loadSidebar(containerId = "sidebar-container") {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn("loadSidebar: contenedor no encontrado:", containerId);
    return;
  }
  try {
    const res = await fetch("./partials/sidebar.html", { cache: "no-cache" });
    const html = await res.text();
    container.innerHTML = html;

    // Inicializar comportamiento del sidebar (toggles, active link)
    initSidebar();
  } catch (err) {
    console.error("Error cargando sidebar:", err);
  }
}
