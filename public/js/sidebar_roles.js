// public/js/sidebar_roles.js
import { getCurrentUser } from './operativo_shared.js';

async function applySidebarRoleRules() {
  const user = await getCurrentUser();
  console.log('[sidebar_roles] user recibido:', user);

  const role = (user?.role || 'admin').toLowerCase();
  console.log('[sidebar_roles] rol detectado:', role);

  // Solo ocultar para viewer
  if (role !== 'viewer') return;

  // Función que intenta encontrar y ocultar el link de Matriz (Operativo)
  const tryHideMatriz = () => {
    // 1) Por id explícito
    let matrizLink =
      document.getElementById('navOperativoMatriz') ||
      // 2) Por data-sub y texto del link
      Array.from(document.querySelectorAll('.sub[data-sub="operativo"] a'))
        .find(a => a.textContent.trim().toLowerCase() === 'matriz') ||
      // 3) Por href
      document.querySelector('.sub[data-sub="operativo"] a[href*="operativo_matriz.html"]');

    if (!matrizLink) {
      console.log('[sidebar_roles] todavía no encuentro el link de Matriz');
      return false;
    }

    matrizLink.style.display = 'none';
    console.log('[sidebar_roles] Matriz Operativo ocultado para viewer');
    return true;
  };

  // Intento inmediato (por si el sidebar ya está en el DOM)
  if (tryHideMatriz()) return;

  // Si el sidebar se inyecta por fetch después de DOMContentLoaded, usamos MutationObserver
  const observer = new MutationObserver((_mutations, obs) => {
    if (tryHideMatriz()) {
      obs.disconnect();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  console.log('[sidebar_roles] Observando el DOM para ocultar Matriz cuando aparezca');
}

document.addEventListener('DOMContentLoaded', () => {
  applySidebarRoleRules().catch(err => {
    console.error('[sidebar_roles] error al aplicar reglas de rol:', err);
  });
});
