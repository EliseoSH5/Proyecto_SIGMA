// public/js/operativo_alertas.js
// Alertas: lista materiales (amarillo/rojo) + filtros y modal de detalle con botones de reporte

import { api } from "./operativo_shared.js";

// --- refs (tolerantes a null) ---
const btnFilter = document.getElementById("btnFilter");
const panel = document.getElementById("filters");

const fWell = document.getElementById("fWell");
const fAlert = document.getElementById("fAlert");

const fClear = document.getElementById("fClear");
const fApply = document.getElementById("fApply");

const body = document.getElementById("alertsBody");

// Modal (IDs/clases nuevas)
const modal = document.getElementById("alertModal"); // sigma-modal-backdrop
const closeModal = document.getElementById("closeModal");
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
const fmtDate = (d) => {
  if (!d) return "-";
  const date = new Date(d);
  return isNaN(date)
    ? d
    : date.toLocaleDateString("es-MX", {
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
      });
};
const dot = (val) =>
  `<span class="alert-chip ${
    val === "rojo" ? "alert-rojo" : "alert-amarillo"
  }"></span>`;

// Apertura/cierre del modal (clase .open + fallback a style.display)
function safeOpenModal() {
  if (!modal) return;
  modal.classList.add("open"); // .sigma-modal-backdrop.open { display:flex; ... }
  modal.style.display = "flex"; // fallback por si falta la regla CSS
}
function safeCloseModal() {
  if (!modal) return;
  modal.classList.remove("open");
  modal.style.display = "none";
}

// --- tabla ---
function row(it) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${it.well_name}</td>
    <td>${it.material || "-"}</td>
    <td>${dot(it.alerta)}</td>
    <td>${it.comentario || ""}</td>
    <td class="actions"><a title="Ver" data-action="view">👁️</a></td>
  `;
  tr.querySelector('[data-action="view"]')?.addEventListener("click", () =>
    openDetail(it.material_id)
  );
  return tr;
}

// --- modal detalle ---
async function openDetail(id) {
  const r = await api.get(`/api/operativo/materials/${id}`);
  if (!r.ok) {
    console.error("Material detail error:", r.error);
    alert(r.error || "No se pudo cargar el detalle");
    return;
  }
  const m = r.data || {};

  if (modalSubtitle)
    modalSubtitle.textContent = `${m.categoria || "Material"} • Proveedor: ${
      m.proveedor || "-"
    }`;
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
    dAlerta.innerHTML =
      m.alerta === "rojo"
        ? '<span class="alert-chip alert-rojo"></span> Rojo'
        : m.alerta === "amarillo"
        ? '<span class="alert-chip alert-amarillo"></span> Amarillo'
        : m.alerta === "verde"
        ? '<span class="alert-chip alert-verde"></span> Verde'
        : '<span class="alert-chip alert-azul"></span> Azul';
  }

  if (dComentario) dComentario.textContent = m.comentario || "";

  // Botón Reporte Avanzada
  if (btnAvanzada) {
    if (m.link_avanzada) {
      btnAvanzada.disabled = false;
      btnAvanzada.onclick = () =>
        window.open(m.link_avanzada, "_blank", "noopener");
    } else {
      btnAvanzada.disabled = true;
      btnAvanzada.onclick = null;
    }
  }

  // Botón Reporte Inspección
  if (btnInspeccion) {
    if (m.link_inspeccion) {
      btnInspeccion.disabled = false;
      btnInspeccion.onclick = () =>
        window.open(m.link_inspeccion, "_blank", "noopener");
    } else {
      btnInspeccion.disabled = true;
      btnInspeccion.onclick = null;
    }
  }

  safeOpenModal();
}

// cerrar modal
closeModal?.addEventListener("click", safeCloseModal);
modal?.addEventListener("click", (e) => {
  if (e.target === modal) safeCloseModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") safeCloseModal();
});

// --- filtros ---
btnFilter?.addEventListener("click", () => {
  if (!panel) return;
  panel.style.display = panel.style.display === "none" ? "block" : "none";
});
fClear?.addEventListener("click", () => {
  if (fWell) fWell.value = "";
  if (fAlert) fAlert.value = "";
});
fApply?.addEventListener("click", () => load());

// --- data ---
async function load() {
  const params = new URLSearchParams();
  if (fWell?.value) params.set("well", fWell.value);
  if (fAlert?.value) params.set("alerta", fAlert.value);

  const r = await api.get(
    "/api/operativo/alerts" + (params.toString() ? `?${params.toString()}` : "")
  );
  if (!r.ok) {
    console.error("Alerts error:", r.error);
    alert(r.error || "Error cargando alertas");
    body.innerHTML = `<tr><td colspan="5" class="muted">Sin alertas amarillas/rojas</td></tr>`;
    return;
  }

  // poblar select pozos (si viene)
  if (Array.isArray(r.wells) && fWell) {
    const current = fWell.value;
    fWell.innerHTML =
      `<option value="">Todos</option>` +
      r.wells.map((w) => `<option value="${w.id}">${w.name}</option>`).join("");
    fWell.value = current;
  }

  body.innerHTML = "";
  if (!Array.isArray(r.data) || r.data.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="muted">Sin alertas amarillas/rojas</td></tr>`;
    return;
  }
  r.data.forEach((it) => body.appendChild(row(it)));
}

// primera carga
load();
