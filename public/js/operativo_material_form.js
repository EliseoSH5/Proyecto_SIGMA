import { api, qs } from "./operativo_shared.js";

const stageId = qs("stage");
const id = qs("id");

const btnSave = document.getElementById("btnSave");
const btnCancel = document.getElementById("btnCancel");
btnCancel.href = `./operativo_materiales.html?stage=${stageId}`;

async function hydrate() {
  if (!id) return;
  const res = await api.get(`/api/operativo/materials/${id}`);
  if (!res.ok) return;
  const m = res.data;
  document.getElementById("programa").value = m.programa || "Programa";
  document.getElementById("categoria").value = m.categoria || "";
  document.getElementById("especificacion").value = m.especificacion || "";
  document.getElementById("cantidad").value = m.cantidad || 1;
  document.getElementById("unidad").value = m.unidad || "";
  document.getElementById("proveedor").value = m.proveedor || "";
  document.getElementById("ordenServicio").value = m.orden_servicio || "";
  document.getElementById("fechaAvanzada").value =
    m.fecha_avanzada?.slice(0, 10) || "";
  document.getElementById("linkAvanzada").value = m.link_avanzada || "";
  document.getElementById("fechaInspeccion").value =
    m.fecha_inspeccion?.slice(0, 10) || "";
  document.getElementById("linkInspeccion").value = m.link_inspeccion || "";
  document.getElementById("logistica").value = m.logistica || "En transito";
  document.getElementById('alerta').value = (m.alerta || 'azul');

}
hydrate();

btnSave.addEventListener("click", async () => {
  const data = {
    stage_id: Number(stageId),
    programa: document.getElementById("programa").value,
    categoria: document.getElementById("categoria").value.trim(),
    especificacion: document.getElementById("especificacion").value.trim(),
    cantidad: Number(document.getElementById("cantidad").value || 0),
    unidad: document.getElementById("unidad").value.trim(),
    proveedor: document.getElementById("proveedor").value.trim(),
    orden_servicio: document.getElementById("ordenServicio").value.trim(),
    fecha_avanzada: document.getElementById("fechaAvanzada").value || null,
    link_avanzada: document.getElementById("linkAvanzada").value.trim(),
    fecha_inspeccion: document.getElementById("fechaInspeccion").value || null,
    link_inspeccion: document.getElementById("linkInspeccion").value.trim(),
    logistica: document.getElementById("logistica").value,
    alerta: document.getElementById('alerta').value,
    comentario: document.getElementById("comentario")?.value || "",
  };
  let res;
  if (id) {
    res = await api.put(`/api/operativo/materials/${id}`, data);
  } else {
    res = await api.post(`/api/operativo/stages/${stageId}/materials`, data);
  }
  if (!res.ok) {
    alert(res.error || "Error");
    return;
  }
  window.location.href = `./operativo_materiales.html?stage=${stageId}`;
});
