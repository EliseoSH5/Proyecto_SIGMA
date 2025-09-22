// dashboard.js — Validación de sesión + UI del dashboard (vinculado al backend)

// A) Verificar sesión real en el servidor (cookie httpOnly) y pintar datos del usuario
(async () => {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await res.json();
    if (!data.ok) throw new Error('No autorizado');

    const fullName = data.user.fullName || 'Usuario';
    const email = data.user.email || 'mail@example.com';

    // Pinta datos en el topbar
    const fullNameEl = document.getElementById('fullName');
    const emailEl = document.getElementById('emailLabel');
    const avatarEl = document.getElementById('avatar');

    if (fullNameEl) fullNameEl.textContent = fullName;
    if (emailEl) emailEl.textContent = email;
    if (avatarEl) avatarEl.textContent = initials(fullName || email);

  } catch (e) {
    // Sin sesión => volver al login
    window.location.href = './login.html';
  }
})();

// B) Utilidad para iniciales del avatar
function initials(name) {
  if (!name) return 'US';
  const p = name.trim().split(/\s+/);
  const a = (p[0] || '')[0] || '';
  const b = (p[1] || '')[0] || (p[0] || '')[1] || '';
  return (a + b).toUpperCase();
}

// C) Desplegables del sidebar (abre/cierra submenús)
document.querySelectorAll('.menu .item').forEach((it) => {
  it.addEventListener('click', () => {
    const next = it.nextElementSibling;
    if (next && next.classList.contains('sub')) {
      it.classList.toggle('open');
      // Puedes usar solo clase, pero como el CSS ya contempla .item.open + .sub { display:block }
      // dejamos display inline para UX inmediato:
      next.style.display = next.style.display === 'block' ? 'none' : 'block';
    }
  });
});

// D) Logout real (limpia cookie en servidor + limpia storages + redirige a login)
const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (_) {
      // aunque falle la llamada, limpiamos cliente para evitar quedarse "colgado"
    }
    sessionStorage.removeItem('sigma_user');
    localStorage.removeItem('sigma_user');
    window.location.href = './login.html';
  });
}
