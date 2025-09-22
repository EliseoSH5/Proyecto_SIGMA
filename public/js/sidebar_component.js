// public/js/sidebar_component.js
export function initSidebar() {
  // 1) Toggle de dropdowns
  document.querySelectorAll('.sidebar .item.has-sub').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const key = trigger.getAttribute('data-menu');
      const sub = document.querySelector(`.sidebar .sub[data-sub="${key}"]`);
      if (!sub) return;
      const isOpen = sub.style.display === 'block';
      // cierra todos y abre solo este (opcional)
      document.querySelectorAll('.sidebar .sub').forEach(s => s.style.display = 'none');
      document.querySelectorAll('.sidebar .item.has-sub').forEach(i => i.classList.remove('open'));
      if (!isOpen) {
        sub.style.display = 'block';
        trigger.classList.add('open');
      }
    });
  });

  // 2) Marcar enlace activo según la URL actual
  const here = location.pathname.split('/').pop() || 'dashboard.html';
  const links = document.querySelectorAll('.sidebar .sub a, .sidebar .menu > a.item');
  let matched = false;

  links.forEach(a => {
    const href = a.getAttribute('href');
    if (!href) return;
    const file = href.split('/').pop();
    if (file === here) {
      a.classList.add('active');
      matched = true;
      // abre el submenú al que pertenece
      const sub = a.closest('.sub');
      const trigger = sub ? document.querySelector(`.sidebar .item.has-sub[data-menu="${sub.getAttribute('data-sub')}"]`) : null;
      if (sub) sub.style.display = 'block';
      if (trigger) trigger.classList.add('open');
    }
  });

  // Si no matcheó ningún sub, podríamos marcar Dashboard por defecto
  if (!matched) {
    const dash = document.querySelector('.sidebar .menu > a.item[href="./dashboard.html"]');
    dash?.classList.add('active');
  }
}
