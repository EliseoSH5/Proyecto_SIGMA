// public/js/dashboard.js
// Dashboard: tarjetas por pozo con selector de etapa y tabla de materiales

// Orden de prioridad para las alertas
const ALERT_PRIORITY = {
  rojo: 0,
  amarillo: 1,
  verde: 2,
  azul: 3,
};

const ALERT_CLASS = {
  rojo: "alert-rojo",
  amarillo: "alert-amarillo",
  verde: "alert-verde",
  azul: "alert-azul",
};

const ALERT_LABEL = {
  rojo: "Rojo",
  amarillo: "Amarillo",
  verde: "Verde",
  azul: "Azul",
};

let dashboardMode = "activos";


// Helper para consumir APIs del backend Operativo
async function fetchJson(url) {
  const res = await fetch(url, { credentials: "include" });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Error al cargar datos");
  return data.data;
}

// ====== INICIALIZAR DASHBOARD ======
document.addEventListener("DOMContentLoaded", () => {
  initDashboardToggle();
  loadWellsDashboard();
});

function initDashboardToggle() {
  const container = document.querySelector(".dashboard-toggle");
  if (!container) return;

  const buttons = container.querySelectorAll("[data-mode]");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (!mode || mode === dashboardMode) return;

      dashboardMode = mode;

      // Actualizar clases activas
      buttons.forEach((b) => {
        b.classList.toggle("active", b === btn);
      });

      // Recargar dashboard con el nuevo modo
      loadWellsDashboard();
    });
  });
}


async function loadWellsDashboard() {
  const container = document.getElementById("wellsGrid");
  if (!container) return;

  container.innerHTML =
    "<div class='cell-empty'>Cargando pozos…</div>";

  let wells = [];
  try {
    const data = await fetchJson("/api/operativo/wells?sort=name&order=asc");
    wells = Array.isArray(data) ? data : [];

    const isCompleted = (w) => {
      const p = (w.current_progress || "").toLowerCase().trim();
      return p === "pozo completado";
    };

    if (dashboardMode === "activos") {
      wells = wells.filter((w) => !isCompleted(w));
    } else if (dashboardMode === "completados") {
      wells = wells.filter(isCompleted);
    }
  } catch (e) {
    console.error(e);
    container.innerHTML =
      "<div class='cell-empty error'>No se pudieron cargar los pozos.</div>";
    return;
  }

  if (!wells.length) {
    container.innerHTML =
      dashboardMode === "activos"
        ? "<div class='cell-empty'>No hay pozos activos en proceso.</div>"
        : "<div class='cell-empty'>Aún no hay pozos completados.</div>";
    return;
  }

  container.innerHTML = "";

  for (const well of wells) {
    const card = createWellCard(well);
    container.appendChild(card);
    hydrateWellCard(card, well);
  }
}


// Crea la estructura visual de la tarjeta de un pozo
function createWellCard(well) {
  const card = document.createElement("section");
  card.className = "well-card";

  const header = document.createElement("header");
  header.className = "well-card-header";

  const title = document.createElement("h3");
  title.className = "well-card-title";
  title.textContent = well.name || `Pozo #${well.id}`;

  const select = document.createElement("select");
  select.className = "well-stage-select";
  select.innerHTML = `<option value="">Selecciona etapa…</option>`;

  header.appendChild(title);
  header.appendChild(select);

  const body = document.createElement("div");
  body.className = "well-card-body";

  const table = document.createElement("table");
  table.className = "well-materials-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Material</th>
        <th>Proveedor</th>
        <th>Estatus</th>
        <th style="width:26px;">Alerta</th>
      </tr>
    </thead>
    <tbody class="materials-body">
      <tr><td colspan="4" class="cell-empty">Selecciona una etapa…</td></tr>
    </tbody>
  `;

  body.appendChild(table);

  card.appendChild(header);
  card.appendChild(body);

  // Guardar referencias internas
  card._stageSelect = select;
  card._tbody = table.querySelector(".materials-body");

  return card;
}

// Carga las etapas del pozo y enlaza el cambio de etapa con la tabla
async function hydrateWellCard(card, well) {
  const select = card._stageSelect;
  const tbody = card._tbody;
  if (!select || !tbody) return;

  let stages = [];
  try {
    const data = await fetchJson(`/api/operativo/wells/${well.id}/stages`);
    stages = Array.isArray(data) ? data : [];
  } catch (e) {
    console.error(e);
    tbody.innerHTML =
      `<tr><td colspan="4" class="cell-empty error">No se pudieron cargar las etapas.</td></tr>`;
    return;
  }

  if (!stages.length) {
    select.innerHTML = `<option value="">Sin etapas</option>`;
    tbody.innerHTML =
      `<tr><td colspan="4" class="cell-empty">Este pozo no tiene etapas.</td></tr>`;
    return;
  }

  select.innerHTML = stages
    .map(
      (s) =>
        `<option value="${s.id}">${s.stage_name || `Etapa ${s.order_index}`}</option>`
    )
    .join("");

  // Cargar la primera etapa por defecto
  const first = stages[0];
  if (first) {
    select.value = String(first.id);
    loadMaterialsForStage(first.id, tbody);
  }

  select.addEventListener("change", () => {
    const stageId = Number(select.value);
    if (!stageId) {
      tbody.innerHTML =
        `<tr><td colspan="4" class="cell-empty">Selecciona una etapa…</td></tr>`;
      return;
    }
    loadMaterialsForStage(stageId, tbody);
  });
}

// Carga los materiales de una etapa y los ordena por color de alerta
async function loadMaterialsForStage(stageId, tbody) {
  tbody.innerHTML =
    `<tr><td colspan="4" class="cell-empty">Cargando materiales…</td></tr>`;

  let materials = [];
  try {
    const data = await fetchJson(`/api/operativo/stages/${stageId}/materials`);
    materials = Array.isArray(data) ? data : [];
  } catch (e) {
    console.error(e);
    tbody.innerHTML =
      `<tr><td colspan="4" class="cell-empty error">No se pudieron cargar los materiales.</td></tr>`;
    return;
  }

  if (!materials.length) {
    tbody.innerHTML =
      `<tr><td colspan="4" class="cell-empty">Sin materiales en esta etapa.</td></tr>`;
    return;
  }

  // Ordenar por prioridad de alerta: rojo, amarillo, verde, azul
  materials.sort((a, b) => {
    const ak = (a.alerta || "").toLowerCase();
    const bk = (b.alerta || "").toLowerCase();
    const pa = ALERT_PRIORITY[ak] ?? 99;
    const pb = ALERT_PRIORITY[bk] ?? 99;
    return pa - pb;
  });

  const rows = materials
    .map((m) => {
      const alertaKey = (m.alerta || "").toLowerCase();
      const alertClass = ALERT_CLASS[alertaKey] || "";
      const alertLabel = ALERT_LABEL[alertaKey] || "";

      // Material: usamos especificacion y, si existe, material_name
      const material =
        (m.especificacion || m.material_name || "").trim() || "—";

      // Proveedor: primero proveedor, luego compania como respaldo
      const proveedor = (m.proveedor || m.compania || "").trim() || "—";

      // Estatus: puedes ajustar a logistica, comentario, etc.
      const estatus = (m.logistica || m.comentario || "").trim() || "—";

      return `
        <tr>
          <td>${escapeHtml(material)}</td>
          <td>${escapeHtml(proveedor)}</td>
          <td>${escapeHtml(estatus)}</td>
          <td class="cell-alert">
            ${alertLabel
          ? `<span class="alert-dot ${alertClass}" title="${alertLabel}"></span>`
          : ""
        }
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.innerHTML = rows;
}

// Pequeño escape para evitar problemas con caracteres especiales
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
