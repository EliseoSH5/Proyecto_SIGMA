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

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ====== Auth helper: obtener usuario actual (id, email, fullName, role) ======
let _userCache = null;
let _userPromise = null;

export async function getCurrentUser() {
  if (_userCache) return _userCache;
  if (!_userPromise) {
    _userPromise = api
      .get('/api/auth/me')
      .then((res) => {
        // Ajusta a tu respuesta real, pero normalmente es { ok, user }
        const user = res.user || res.data?.user || null;
        _userCache = user;
        return user;
      })
      .catch((err) => {
        console.error('[getCurrentUser] error:', err);
        _userCache = null;
        return null;
      });
  }
  return _userPromise;
}