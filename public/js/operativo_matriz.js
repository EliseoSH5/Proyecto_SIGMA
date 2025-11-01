import { api, confirmDialog } from './operativo_shared.js';

const body = document.getElementById('wellsBody');
const empty = document.getElementById('emptyState');
const addBtn = document.getElementById('btnAdd');

const panel = document.getElementById('filters');
const btnFilter = document.getElementById('btnFilter');
const fSearch = document.getElementById('fSearch');
const fType = document.getElementById('fType');
const fSort = document.getElementById('fSort');
const fOrder = document.getElementById('fOrder');
const fClear = document.getElementById('fClear');
const fApply = document.getElementById('fApply');

btnFilter?.addEventListener('click', () => panel.style.display = (panel.style.display === 'none' ? 'block' : 'none'));
fClear?.addEventListener('click', () => {
  fSearch.value = ''; fType.value = ''; fSort.value = 'id'; fOrder.value = 'desc'; load();
});
fApply?.addEventListener('click', () => load());

function row(w) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="checkbox"/></td>
    <td>${w.team || '-'}</td>
    <td>${w.name}</td>
    <td>${w.current_progress || `Etapa ${w.first_stage || ''} - en proceso`}</td>
    <td class="actions">
      <a title="Ver etapas" data-action="view">👁️</a>
      <a title="Editar pozo" data-action="edit">✏️</a>
      <a title="Borrar" data-action="del">🗑️</a>
      <a title="Descargar Excel" data-action="xlsx">⬇️</a>
    </td>`;

  // Ver etapas
  tr.querySelector('[data-action="view"]').addEventListener('click', () => {
    window.location.href = `./operativo_etapas.html?well=${w.id}`;
  });

  // Editar pozo
  tr.querySelector('[data-action="edit"]').addEventListener('click', () => {
    window.location.href = `./operativo_pozo_form.html?id=${w.id}`;
  });

  // Borrar pozo
  tr.querySelector('[data-action="del"]').addEventListener('click', async () => {
    const ok = await confirmDialog();
    if (!ok) return;
    const res = await api.del(`/api/operativo/wells/${w.id}`);
    if (res.ok) { load(); } else alert(res.error || 'No se pudo borrar');
  });

  // Descargar Excel (solo este pozo)
  tr.querySelector('[data-action="xlsx"]').addEventListener('click', async (e) => {
    e.preventDefault();
    const btn = e.currentTarget;

    // Respeta filtro de alerta si existe en la vista
    const fAlert = document.getElementById('fAlert');
    const qs = new URLSearchParams();
    qs.set('well', String(w.id));
    if (fAlert?.value) qs.set('alerta', fAlert.value);

    const url = `/api/operativo/planeacion/export?${qs.toString()}`;

    // Nombre seguro para el archivo
    const safeName = String(w.name || 'pozo')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\-]+/g, '_').replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '').slice(0, 50);

    try {
      btn.textContent = '⏳';
      btn.classList.add('disabled'); // opcional: .disabled { pointer-events:none; opacity:.6; }

      const resp = await fetch(url, { method: 'GET' });
      if (!resp.ok) {
        let msg = `Error ${resp.status}`;
        try {
          const j = await resp.json();
          if (j?.error) msg = j.error;
        } catch {}
        throw new Error(msg);
      }

      const blob = await resp.blob();
      if (!blob || blob.size === 0) throw new Error('Archivo vacío');

      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `planeacion_${safeName}_${stamp}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (err) {
      console.error('[Export pozo] fallo:', err);
      alert(err.message || 'No se pudo descargar el Excel');
    } finally {
      btn.textContent = '⬇️';
      btn.classList.remove('disabled');
    }
  });

  return tr;
}


async function load() {
  const params = new URLSearchParams();
  if (fSearch?.value) params.set('search', fSearch.value.trim());
  if (fType?.value) params.set('type', fType.value);
  if (fSort?.value) params.set('sort', fSort.value);
  if (fOrder?.value) params.set('order', fOrder.value);

  const url = '/api/operativo/wells' + (params.toString() ? `?${params.toString()}` : '');
  const res = await api.get(url);
  if (!res.ok) { alert(res.error || 'Error'); return; }
  body.innerHTML = '';
  if (!res.data.length) {
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
    res.data.forEach(w => body.appendChild(row(w)));
  }
}

addBtn.addEventListener('click', () => { window.location.href = './operativo_pozo_form.html'; });
load();

// --- Exportar Excel (Planeación Operativa) ---
// Enganche robusto: espera DOM, usa delegación y evita submit accidental.
(function initExportExcel() {
  function buildUrl() {
    const fWell = document.getElementById("fWell");
    const fStage = document.getElementById("fStage");
    const fAlert = document.getElementById("fAlert");

    const qs = new URLSearchParams();
    if (fWell && fWell.value) qs.set("well", fWell.value);

    // En matriz probablemente stage es ID numérico; solo lo mando si es número
    if (fStage && fStage.value && /^\d+$/.test(String(fStage.value))) {
      qs.set("stage", String(fStage.value));
    }

    if (fAlert && fAlert.value) qs.set("alerta", fAlert.value);

    return `/api/operativo/planeacion/export${qs.toString() ? `?${qs.toString()}` : ""}`;
  }

  async function doDownload(e) {
    if (e) e.preventDefault(); // evitar submits si está dentro de <form>
    const btn = document.getElementById("btnExportXlsx");
    try {
      if (btn) {
        btn.disabled = true;
        btn.dataset.prevText = btn.textContent;
        btn.textContent = "Generando...";
      }

      const url = buildUrl();
      console.log("[Export] GET", url);
      const resp = await fetch(url, { method: "GET" });

      if (!resp.ok) {
        let msg = `Error ${resp.status}`;
        try {
          const j = await resp.json();
          if (j?.error) msg = j.error;
        } catch { }
        throw new Error(msg);
      }

      const blob = await resp.blob();
      if (blob.size === 0) throw new Error("Archivo vacío");

      const a = document.createElement("a");
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = `planeacion_operativa_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);

      console.log("[Export] Descarga OK");
    } catch (err) {
      console.error("[Export] Falló:", err);
      alert(err.message || "No se pudo descargar el Excel");
    } finally {
      if (btn) {
        btn.textContent = btn.dataset.prevText || "Descargar Excel";
        btn.disabled = false;
      }
    }
  }

  // 1) Cuando el DOM esté listo, engancha click directo si el botón ya existe
  window.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btnExportXlsx");
    if (btn && !btn.dataset.exportBound) {
      btn.addEventListener("click", doDownload);
      btn.dataset.exportBound = "1";
    }
  });

  // 2) Delegación: si el botón se renderiza luego, también funcionará
  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("#btnExportXlsx");
    if (btn) return doDownload(e);
  });
})();

