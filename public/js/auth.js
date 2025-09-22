// auth.js — login real contra backend
const btn = document.getElementById('btnLogin');

btn?.addEventListener('click', async () => {
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value?.trim();
  const remember = document.getElementById('remember')?.checked;

  if (!email || !password) {
    alert('Ingresa correo y contraseña');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // importante para la cookie httpOnly
      body: JSON.stringify({ email, password, remember })
    });
    const data = await res.json();
    if (!data.ok) return alert(data.error || 'No se pudo iniciar sesión');

    const user = { fullName: data.user.fullName, email: data.user.email };
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem('sigma_user', JSON.stringify(user));
    (remember ? sessionStorage : localStorage).removeItem('sigma_user');

    window.location.href = './dashboard.html';
  } catch (e) {
    console.error(e);
    alert('Error de conexión con el servidor');
  }
});
