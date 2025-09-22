import { api, qs, confirmDialog } from './operativo_shared.js';

const wellId = qs('well');
const body = document.getElementById('stagesBody');

let saving = false;
let snapshotIds = []; // para revertir si falla


function trForStage(s){
  const tr = document.createElement('tr');
  tr.setAttribute('draggable','true');
  tr.dataset.id = s.id;
  tr.innerHTML = `
    <td class="drag-handle">☰</td>
    <td>${s.stage_name||'-'}</td>
    <td>${s.pipe||'-'}</td>
    <td>${s.progress||'En proceso'}</td>
    <td class="actions">
      <a title="Ver materiales" data-action="view">👁️</a>
      <a title="Editar" data-action="edit">✏️</a>
      <a title="Borrar" data-action="del">🗑️</a>
    </td>`;

  tr.querySelector('[data-action="view"]').addEventListener('click',()=>{
    window.location.href = `./operativo_materiales.html?stage=${s.id}&well=${wellId}`;
  });
  tr.querySelector('[data-action="edit"]').addEventListener('click',async ()=>{
    const nn = prompt('Nuevo nombre de etapa', s.stage_name||'');
    if(nn===null) return;
    const res = await api.put(`/api/operativo/stages/${s.id}`, { stage_name: nn });
    if(res.ok) load(); else alert(res.error||'Error');
  });
  tr.querySelector('[data-action="del"]').addEventListener('click', async ()=>{
    const ok = await confirmDialog();
    if(!ok) return;
    const res = await api.del(`/api/operativo/stages/${s.id}`);
    if(res.ok) load(); else alert(res.error||'Error');
  });

  // DnD
  tr.addEventListener('dragstart', (e)=>{
    tr.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    snapshotIds = currentIds(); // guarda orden actual
  });
  tr.addEventListener('dragend', async ()=>{
    tr.classList.remove('dragging');
    await autosaveOrder(); // <--- GUARDADO AUTOMÁTICO AQUÍ
  });

  return tr;
}

body.addEventListener('dragover', (e)=>{
  e.preventDefault();
  const dragging = body.querySelector('tr.dragging');
  if(!dragging) return;
  const after = getDragAfterElement(body, e.clientY);
  if (after == null) body.appendChild(dragging);
  else body.insertBefore(dragging, after);
});

function getDragAfterElement(container, y){
  const els = [...container.querySelectorAll('tr:not(.dragging)')];
  return els.reduce((closest, child)=>{
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if(offset < 0 && offset > closest.offset){
      return { offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function currentIds(){
  return Array.from(body.querySelectorAll('tr')).map(tr => Number(tr.dataset.id));
}

/** Guarda automáticamente el orden si cambió */
async function autosaveOrder(){
  if(saving) return; // evita solapes
  const ids = currentIds();
  if(ids.length && snapshotIds.join(',') === ids.join(',')) return; // no cambió

  saving = true;
  showSaving(true);
  const res = await api.post(`/api/operativo/wells/${wellId}/stages/reorder`, { order: ids });
  saving = false;

  if(res.ok){
    showSaved();
  }else{
    alert(res.error || 'No se pudo guardar el orden');
    // revertir DOM al snapshot
    restoreOrder(snapshotIds);
    showSaving(false);
  }
}

function restoreOrder(ids){
  const rowsById = {};
  Array.from(body.querySelectorAll('tr')).forEach(tr => rowsById[Number(tr.dataset.id)] = tr);
  body.innerHTML = '';
  ids.forEach(id => rowsById[id] && body.appendChild(rowsById[id]));
}

function showSaving(on){
  let badge = document.getElementById('orderStatus');
  if(!badge){
    badge = document.createElement('div');
    badge.id = 'orderStatus';
    badge.style.marginLeft = '8px';
    badge.className = 'small muted';
    // intenta colocarlo junto a los controles de orden si existen
    const toolbar = document.querySelector('.toolbar div');
    (toolbar||document.body).appendChild(badge);
  }
  badge.textContent = on ? 'Guardando…' : '';
}

function showSaved(){
  const badge = document.getElementById('orderStatus');
  if(!badge) return;
  badge.textContent = 'Guardado ✓';
  setTimeout(()=>{ badge.textContent = ''; }, 1000);
}

async function load(){
  const url = `/api/operativo/wells/${wellId}/stages`;  // sin query ?order
  const res = await api.get(url);
  if(!res.ok){ alert(res.error||'Error'); return; }
  body.innerHTML='';
  res.data.forEach(s => body.appendChild(trForStage(s)));
}


load();
