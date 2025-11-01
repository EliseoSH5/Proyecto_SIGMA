// public/js/operativo_alertas.js
// Alertas: lista de materiales (todas las alertas) + filtros (Pozo, Etapa[dedup por nombre], Alerta)
// + modal de detalle + botón Editar -> INFO MATERIAL + cierre de modal robusto

import { api } from "./operativo_shared.js";

// === Configura aquí la página de edición del material ===
const MATERIAL_INFO_PAGE = "/operativo_materiales.html";

// --- refs (tolerantes a null) ---
const btnFilter = document.getElementById("btnFilter");
const panel = document.getElementById("filters");

const fWell  = document.getElementById("fWell");
const fStage = document.getElementById("fStage"); // siempre habilitado
const fAlert = document.getElementById("fAlert");

const fClear = document.getElementById("fClear");
const fApply = document.getElementById("fApply");

const body = document.getElementById("alertsBody");

// Modal (IDs/clases nuevas)
const modal = document.getElementById("alertModal"); // sigma-modal-backdrop
const closeModalBtn = document.getElementById("closeModal"); // puede existir o no
const modalSubtitle = document.getElementById("modalSubtitle");
const dPrograma = document.getElementById("dPrograma");
const dCategoria = document.getElementById("dCategoria");
const dEspecificacion = document.getElementById("dEspecificacion");
const dCantidad = document.getElementById("dCantidad");
const dUnidad = document.getElementById("dUnidad");
const dProveedor = document.getElementById("dProveedor");
const dOS = document.getElementById("dOS");
const dAvanzada = document.getElementById("dAvanzada");
const dInspeccion = document.getElementById("dInspeccion");
const dLogistica = document.getElementById("dLogistica");
const dAlerta = document.getElementById("dAlerta");
const dComentario = document.getElementById("dComentario");

// Botones de reporte en el modal
const btnAvanzada = document.getElementById("btnAvanzada");
const btnInspeccion = document.getElementById("btnInspeccion");

// --- helpers ---
const ALERT_LEVELS = ["azul", "verde", "amarillo", "rojo"];

const fmtDate = (d) => {
  if (!d) return "-";
  const date = new Date(d);
  return isNaN(date)
    ? d
    : date.toLocaleDateString("es-MX", { year: "2-digit", month: "2-digit", day: "2-digit" });
};

function chipClass(alerta) {
  const a = String(alerta || "").toLowerCase();
  return {
    rojo: "alert-rojo",
    amarillo: "alert-amarillo",
    verde: "alert-verde",
    azul: "alert-azul",
  }[a] || "alert-azul";
}

const dot = (val) =>
  `<span class="alert-chip ${chipClass(val)}"></span> ${String(val || "-").toLowerCase()}`;

// Normaliza textos para clave de deduplicación (etapas)
function norm(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// Navegar a la pantalla "INFORMACIÓN MATERIAL" con material + stage
function goToMaterialInfo({ material_id, stage_id }) {
  const url = new URL(MATERIAL_INFO_PAGE, window.location.origin);
  url.searchParams.set("material", String(material_id)); // material a editar
  if (stage_id) url.searchParams.set("stage", String(stage_id));
  url.searchParams.set("action", "edit");
  window.location.href = url.toString();
}

// Apertura/cierre del modal
function safeOpenModal() {
  if (!modal) return;
  modal.classList.add("open");
  modal.style.display = "flex";
}
function safeCloseModal() {
  if (!modal) return;
  modal.classList.remove("open");
  modal.style.display = "none";
}

// ------ cerrar modal (robusto con delegación) ------
function isCloseTarget(el) {
  if (!el) return false;
  return (
    el.id === "closeModal" ||
    (typeof el.hasAttribute === "function" && el.hasAttribute("data-close")) ||
    (typeof el.getAttribute === "function" && el.getAttribute("data-action") === "close") ||
    (el.classList && el.classList.contains("js-close-modal"))
  );
}

// cierra al click en backdrop o en cualquier elemento marcado para cerrar
modal?.addEventListener("click", (e) => {
  // 1) click directo en backdrop
  if (e.target === modal) {
    safeCloseModal();
    return;
  }
  // 2) click en X o cualquier descendiente con data-close / js-close-modal / data-action="close" / #closeModal
  const candidate = e.target?.closest?.("[data-close], .js-close-modal, [data-action='close'], #closeModal");
  if (isCloseTarget(e.target) || candidate) {
    e.preventDefault();
    safeCloseModal();
  }
});

// sigue sirviendo si tienes un botón concreto con id="closeModal"
closeModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  safeCloseModal();
});

// cierra con ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") safeCloseModal();
});

// --- modal detalle ---
async function openDetail(id) {
  const r = await api.get(`/api/operativo/materials/${id}`);
  if (!r.ok) {
    console.error("Material detail error:", r.error);
    alert(r.error || "No se pudo cargar el detalle");
    return;
  }
  const m = r.data || {};

  if (modalSubtitle) modalSubtitle.textContent = `${m.categoria || "Material"} • Proveedor: ${m.proveedor || "-"}`;
  if (dPrograma) dPrograma.textContent = m.programa || "-";
  if (dCategoria) dCategoria.textContent = m.categoria || "-";
  if (dEspecificacion) dEspecificacion.textContent = m.especificacion || "-";
  if (dCantidad) dCantidad.textContent = (m.cantidad ?? "-").toString();
  if (dUnidad) dUnidad.textContent = m.unidad || "-";
  if (dProveedor) dProveedor.textContent = m.proveedor || "-";
  if (dOS) dOS.textContent = m.orden_servicio || "-";

  if (dAvanzada) dAvanzada.textContent = fmtDate(m.fecha_avanzada);
  if (dInspeccion) dInspeccion.textContent = fmtDate(m.fecha_inspeccion);

  if (dLogistica) dLogistica.textContent = m.logistica || "-";

  if (dAlerta) {
    const a = (m.alerta || "").toLowerCase();
    dAlerta.innerHTML =
      a === "rojo" ? '<span class="alert-chip alert-rojo"></span> Rojo' :
      a === "amarillo" ? '<span class="alert-chip alert-amarillo"></span> Amarillo' :
      a === "verde" ? '<span class="alert-chip alert-verde"></span> Verde' :
      '<span class="alert-chip alert-azul"></span> Azul';
  }

  if (dComentario) dComentario.textContent = m.comentario || "";

  if (btnAvanzada) {
    if (m.link_avanzada) {
      btnAvanzada.disabled = false;
      btnAvanzada.onclick = () => window.open(m.link_avanzada, "_blank", "noopener");
    } else {
      btnAvanzada.disabled = true;
      btnAvanzada.onclick = null;
    }
  }

  if (btnInspeccion) {
    if (m.link_inspeccion) {
      btnInspeccion.disabled = false;
      btnInspeccion.onclick = () => window.open(m.link_inspeccion, "_blank", "noopener");
    } else {
      btnInspeccion.disabled = true;
      btnInspeccion.onclick = null;
    }
  }

  safeOpenModal();
}

// --- fila de tabla ---
function row(it) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${it.well_name}</td>
    <td>${it.stage_name}</td>
    <td>${it.material || "-"}</td>
    <td>${dot(it.alerta)}</td>
    <td>${it.comentario || ""}</td>
    <td class="actions">
      <a title="Ver" data-action="view">👁️</a>
      <a title="Editar" data-action="edit" class="ml-2">✏️</a>
    </td>
  `;
  tr.querySelector('[data-action="view"]')?.addEventListener("click", () => openDetail(it.material_id));
  tr.querySelector('[data-action="edit"]')?.addEventListener("click", () => goToMaterialInfo(it));
  return tr;
}

// --- construir opciones de ETAPAS deduplicadas por NOMBRE ---
// Devuelve pares [key,label] donde key = nombre normalizado, label = primer nombre visto
function buildUniqueStageNames(rows) {
  const seen = new Map(); // key -> label
  for (const r of rows || []) {
    const label = r.stage_name || "Etapa";
    const key = norm(label);
    if (!seen.has(key)) seen.set(key, label);
  }
  // Mantener orden de aparición
  return Array.from(seen.entries()); // [[key,label], ...]
}

// --- filtros UI ---
btnFilter?.addEventListener("click", () => {
  if (!panel) return;
  panel.style.display = panel.style.display === "none" ? "block" : "none";
});

fClear?.addEventListener("click", async () => {
  if (fWell)  fWell.value = "";
  if (fStage) fStage.value = "";
  if (fAlert) fAlert.value = "";
  await load();
});

fApply?.addEventListener("click", () => load());

// (Opcional) refrescar en vivo al cambiar otros selects:
// fWell?.addEventListener("change", () => { fStage.value = ""; load(); });
// fAlert?.addEventListener("change", () => { load(); });

// --- carga principal ---
// 1) Pide /alerts con filtros de Pozo/Alerta (SIN stage) para obtener el universo.
// 2) Construye combo Etapas por NOMBRE (dedup) a partir de ese universo.
// 3) Aplica filtro de Etapa por NOMBRE en cliente y renderiza.
async function load() {
  const paramsForFetch = new URLSearchParams();
  if (fWell?.value)  paramsForFetch.set("well",  fWell.value);
  if (fAlert?.value) paramsForFetch.set("alerta", fAlert.value);

  const r = await api.get("/api/operativo/alerts" + (paramsForFetch.toString() ? `?${paramsForFetch.toString()}` : ""));
  if (!r.ok) {
    console.error("Alerts error:", r.error);
    alert(r.error || "Error cargando alertas");
    body.innerHTML = `<tr><td colspan="6" class="muted">Sin alertas</td></tr>`;
    return;
  }

  // Poblar Pozo
  if (Array.isArray(r.wells) && fWell) {
    const currentWell = fWell.value;
    fWell.innerHTML = `<option value="">Todos</option>` + r.wells.map((w) => `<option value="${w.id}">${w.name}</option>`).join("");
    fWell.value = currentWell;
  }

  // Construir Etapas deduplicadas por NOMBRE desde dataset (solo las que aparecen)
  const currentStageKey = fStage?.value || "";
  const stagePairs = buildUniqueStageNames(r.data); // [[key,label], ...]
  if (fStage) {
    fStage.innerHTML = `<option value="">Todas</option>` +
      stagePairs.map(([key, label]) => `<option value="${key}">${label}</option>`).join("");
    // Restaurar selección si aún existe, si no limpiar
    if (currentStageKey && stagePairs.some(([key]) => key === currentStageKey)) {
      fStage.value = currentStageKey;
    } else {
      fStage.value = "";
    }
  }

  // Filtrar por etapa (por NOMBRE normalizado) en cliente
  let rowsToRender = Array.isArray(r.data) ? r.data : [];
  if (fStage?.value) {
    const key = fStage.value;
    rowsToRender = rowsToRender.filter(it => norm(it.stage_name || "Etapa") === key);
  }

  // Render
  body.innerHTML = "";
  if (!rowsToRender.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted">Sin alertas</td></tr>`;
    return;
  }
  rowsToRender.forEach((it) => body.appendChild(row(it)));
}

// primera carga
load();
