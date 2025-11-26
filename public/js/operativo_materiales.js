import { api, qs, confirmDialog, escapeHtml } from './operativo_shared.js';

const stageId = qs('stage');
const wellId  = qs('well');

const materialsBody = document.getElementById('materialsBody');
const addBtn   = document.getElementById('btnAddMaterial');
const backLink = document.getElementById('backToStages');

// Failsafe: si falta stage o well, regresamos a la matriz
if (!stageId || !wellId) {
  alert('No se recibió el pozo o la etapa. Regresando a la matriz.');
  window.location.href = './operativo_matriz.html';
}

// Link para regresar a etapas del pozo
if (backLink) {
  backLink.href = `./operativo_etapas.html?well=${wellId}`;
}

const panel    = document.getElementById('filters');
const btnFilter= document.getElementById('btnFilter');
const q        = document.getElementById('q');
const programa = document.getElementById('programa');
const alerta   = document.getElementById('alerta');
const mSort    = document.getElementById('mSort');
const mOrder   = document.getElementById('mOrder');
const mClear   = document.getElementById('mClear');
const mApply   = document.getElementById('mApply');

btnFilter?.addEventListener('click', () => {
  panel.style.display = (panel.style.display === 'none' ? 'block' : 'none');
});

mClear?.addEventListener('click', () => {
  q.value = '';
  programa.value = '';
  alerta.value = '';
  mSort.value = 'id';
  mOrder.value = 'asc';
  load();
});

mApply?.addEventListener('click', () => load());

function badge(alertaVal) {
  const cls =
    alertaVal === 'azul'    ? 'alert-azul' :
    alertaVal === 'verde'   ? 'alert-verde' :
    alertaVal === 'amarillo'? 'alert-amarillo' :
                              'alert-rojo';
  return `<span class="alert-chip ${cls}"></span>`;
}

function row(m) {
  const tr = document.createElement('tr');

  // Texto seguro en columnas
  const programaSafe  = escapeHtml(m.programa  || '-');
  const categoriaSafe = escapeHtml(m.categoria || '-');
  const proveedorSafe = escapeHtml(m.proveedor || '-');

  tr.innerHTML = `
    <td><input type="checkbox"/></td>
    <td>${programaSafe}</td>
    <td>${categoriaSafe}</td>
    <td>${proveedorSafe}</td>
    <td>${badge(m.alerta || 'azul')}</td>
    <td class="actions">
      <a title="Editar" data-action="edit">✏️</a>
      <a title="Borrar" data-action="del">🗑️</a>
    </td>`;

  // Editar material: llevamos stage + well + id
  tr.querySelector('[data-action="edit"]').addEventListener('click', () => {
    window.location.href =
      `./operativo_material_form.html?stage=${stageId}&well=${wellId}&id=${m.id}`;
  });

  // Borrar material
  tr.querySelector('[data-action="del"]').addEventListener('click', async () => {
    const ok = await confirmDialog();
    if (!ok) return;
    const res = await api.del(`/api/operativo/materials/${m.id}`);
    if (res.ok) load(); else alert(res.error || 'Error');
  });

  return tr;
}

async function load() {
  const params = new URLSearchParams();
  if (q?.value)        params.set('q', q.value.trim());
  if (programa?.value) params.set('programa', programa.value);
  if (alerta?.value)   params.set('alerta', alerta.value);
  if (mSort?.value)    params.set('sort', mSort.value);
  if (mOrder?.value)   params.set('order', mOrder.value);

  const url = `/api/operativo/stages/${stageId}/materials` +
    (params.toString() ? `?${params.toString()}` : '');

  const res = await api.get(url);
  if (!res.ok) {
    alert(res.error || 'Error');
    return;
  }
  materialsBody.innerHTML = '';
  res.data.forEach(m => materialsBody.appendChild(row(m)));
}
load();

// Añadir material: también pasamos stage + well
addBtn?.addEventListener('click', () => {
  window.location.href =
    `./operativo_material_form.html?stage=${stageId}&well=${wellId}`;
});
