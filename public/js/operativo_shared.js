// Utilidad para leer query string
export function qs(name){
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}
export const api = {
  async get(url){ const r = await fetch(url,{credentials:'include'}); return r.json();},
  async post(url,body){ const r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(body)}); return r.json();},
  async put(url,body){ const r = await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(body)}); return r.json();},
  async del(url){ const r = await fetch(url,{method:'DELETE',credentials:'include'}); return r.json();},
};
export function confirmDialog(){
  const modal = document.getElementById('confirmModal');
  return new Promise((resolve)=>{
    modal.classList.add('open');
    const onClick=(e)=>{
      const act=e.target.getAttribute('data-action');
      if(act){ modal.classList.remove('open'); modal.removeEventListener('click',onClick); resolve(act==='ok'); }
    };
    modal.addEventListener('click',onClick);
  });
}
