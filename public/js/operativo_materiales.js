import { api, qs, confirmDialog } from './operativo_shared.js';

const stageId = qs('stage');
const materialsBody = document.getElementById('materialsBody');
const addBtn = document.getElementById('btnAddMaterial');
const backLink = document.getElementById('backToStages');

backLink.href = `./operativo_etapas.html?well=${qs('well')||''}`;

const panel = document.getElementById('filters');
const btnFilter = document.getElementById('btnFilter');
const q = document.getElementById('q');
const programa = document.getElementById('programa');
const alerta = document.getElementById('alerta');
const mSort = document.getElementById('mSort');
const mOrder = document.getElementById('mOrder');
const mClear = document.getElementById('mClear');
const mApply = document.getElementById('mApply');

btnFilter?.addEventListener('click', ()=> panel.style.display = (panel.style.display==='none'?'block':'none'));
mClear?.addEventListener('click', ()=>{
  q.value=''; programa.value=''; alerta.value=''; mSort.value='id'; mOrder.value='asc'; load();
});
mApply?.addEventListener('click', ()=> load());

function badge(alertaVal){
  const cls = alertaVal==='azul'?'alert-azul': alertaVal==='verde'?'alert-verde': alertaVal==='amarillo'?'alert-amarillo':'alert-rojo';
  return `<span class="alert-chip ${cls}"></span>`;
}

function row(m){
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="checkbox"/></td>
    <td>${m.programa || '-'}</td>
    <td>${m.categoria || '-'}</td>
    <td>${m.proveedor || '-'}</td>
    <td>${badge(m.alerta || 'azul')}</td>
    <td class="actions">
      <a title="Editar" data-action="edit">✏️</a>
      <a title="Borrar" data-action="del">🗑️</a>
    </td>`;
  tr.querySelector('[data-action="edit"]').addEventListener('click',()=>{
    window.location.href = `./operativo_material_form.html?stage=${stageId}&id=${m.id}`;
  });
  tr.querySelector('[data-action="del"]').addEventListener('click', async ()=>{
    const ok = await confirmDialog();
    if(!ok) return;
    const res = await api.del(`/api/operativo/materials/${m.id}`);
    if(res.ok) load(); else alert(res.error||'Error');
  });
  return tr;
}

async function load(){
  const params = new URLSearchParams();
  if(q?.value) params.set('q', q.value.trim());
  if(programa?.value) params.set('programa', programa.value);
  if(alerta?.value) params.set('alerta', alerta.value);
  if(mSort?.value) params.set('sort', mSort.value);
  if(mOrder?.value) params.set('order', mOrder.value);

  const url = `/api/operativo/stages/${stageId}/materials` + (params.toString()?`?${params.toString()}`:'');
  const res = await api.get(url);
  if(!res.ok){ alert(res.error||'Error'); return; }
  materialsBody.innerHTML='';
  res.data.forEach(m => materialsBody.appendChild(row(m)));
}
load();

addBtn.addEventListener('click',()=>{ window.location.href = `./operativo_material_form.html?stage=${stageId}`; });
