import { api, qs } from './operativo_shared.js';

const stagesBox = document.getElementById('stages');
const numSel = document.getElementById('numEtapas');
const btnSave = document.getElementById('btnSave');

let editingId = qs('id');
let existingStages = []; // guardamos etapas existentes con id

function rowTemplate(stage = {}){
  const row = document.createElement('div');
  row.className='grid cols-4';
  row.style.marginBottom='8px';
  row.dataset.stageId = Number.isInteger(stage.id) ? String(stage.id) : ''; // <-- conservar id si hay
  row.innerHTML = `
    <input class="input" placeholder="26°" value="${stage.stage_name||''}"/>
    <input class="input" placeholder="20°" value="${stage.pipe||''}"/>
    <input class="input" type="number" min="0" step="0.1" placeholder="10.6" value="${stage.drill_time??''}"/>
    <input class="input" type="number" min="0" step="0.1" placeholder="8.4" value="${stage.stage_change??''}"/>
  `;
  return row;
}

function renderStageRows(n){
  stagesBox.innerHTML = '';
  // 1) pintar hasta n usando las existentes primero
  for(let i=0;i<n;i++){
    const s = existingStages[i] || {};
    stagesBox.appendChild(rowTemplate(s));
  }
  // 2) si n > existentes, se generan nuevas filas vacías (sin id)
  // (ya se cubre en el for con objeto {} al no existir s)
}

numSel.addEventListener('change', ()=> renderStageRows(parseInt(numSel.value,10)));

async function hydrateIfEditing(){
  if(!editingId) { renderStageRows(parseInt(numSel.value,10)); return; }
  const res = await api.get(`/api/operativo/wells/${editingId}`);
  if(!res.ok){ alert(res.error||'Error'); return; }
  const w = res.data;
  document.getElementById('tipoPozo').value = w.type;
  document.getElementById('equipo').value = w.team||'';
  document.getElementById('nombre').value = w.name||'';
  document.getElementById('fechaInicio').value = w.start_date?.slice(0,10)||'';

  // conservar etapas existentes con sus IDs
  existingStages = Array.isArray(w.stages) ? w.stages : [];
  // sugerir numEtapas al mayor entre selección y existentes
  const suggested = Math.max(Number(numSel.value||1), existingStages.length||1);
  numSel.value = suggested;
  renderStageRows(suggested);
}
hydrateIfEditing();

btnSave.addEventListener('click', async ()=>{
  const payload = {
    type: document.getElementById('tipoPozo').value,
    team: document.getElementById('equipo').value.trim(),
    name: document.getElementById('nombre').value.trim(),
    start_date: document.getElementById('fechaInicio').value || null,
    stages_count: parseInt(numSel.value,10),
    stages: Array.from(stagesBox.children).map(row => {
      const [stage_name, pipe, drill_time, stage_change] = Array.from(row.querySelectorAll('input')).map(i=>i.value);
      const idAttr = row.dataset.stageId;
      const data = {
        stage_name,
        pipe,
        drill_time: drill_time? Number(drill_time): null,
        stage_change: stage_change? Number(stage_change): null
      };
      if(idAttr){ data.id = Number(idAttr); } // <-- enviar id si existe para UPDATE
      return data;
    })
  };

  if(!payload.name){ alert('Nombre es requerido'); return; }

  let res;
  if(editingId){
    res = await api.put(`/api/operativo/wells/${editingId}`, payload);
  }else{
    res = await api.post('/api/operativo/wells', payload);
  }
  if(!res.ok){ alert(res.error||'Error'); return; }
  window.location.href = `./operativo_matriz.html`;
});
