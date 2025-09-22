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

btnFilter?.addEventListener('click', ()=> panel.style.display = (panel.style.display==='none'?'block':'none'));
fClear?.addEventListener('click', ()=>{
  fSearch.value=''; fType.value=''; fSort.value='id'; fOrder.value='desc'; load();
});
fApply?.addEventListener('click', ()=> load());

function row(w){
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
    </td>`;
  tr.querySelector('[data-action="view"]').addEventListener('click',()=>{
    window.location.href = `./operativo_etapas.html?well=${w.id}`;
  });
  tr.querySelector('[data-action="edit"]').addEventListener('click',()=>{
    window.location.href = `./operativo_pozo_form.html?id=${w.id}`;
  });
  tr.querySelector('[data-action="del"]').addEventListener('click', async ()=>{
    const ok = await confirmDialog();
    if(!ok) return;
    const res = await api.del(`/api/operativo/wells/${w.id}`);
    if(res.ok){ load(); } else alert(res.error || 'No se pudo borrar');
  });
  return tr;
}

async function load(){
  const params = new URLSearchParams();
  if(fSearch?.value) params.set('search', fSearch.value.trim());
  if(fType?.value) params.set('type', fType.value);
  if(fSort?.value) params.set('sort', fSort.value);
  if(fOrder?.value) params.set('order', fOrder.value);

  const url = '/api/operativo/wells' + (params.toString()?`?${params.toString()}`:'');
  const res = await api.get(url);
  if(!res.ok){ alert(res.error||'Error'); return; }
  body.innerHTML='';
  if(!res.data.length){
    empty.style.display = 'flex';
  }else{
    empty.style.display = 'none';
    res.data.forEach(w => body.appendChild(row(w)));
  }
}

addBtn.addEventListener('click', ()=>{ window.location.href = './operativo_pozo_form.html'; });
load();
