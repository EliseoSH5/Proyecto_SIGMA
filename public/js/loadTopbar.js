// public/js/loadTopbar.js
export async function loadTopbar(containerSelector = ".main") {
  try {
    const res = await fetch("./partials/topbar.html", { cache: "no-cache" });
    const html = await res.text();

    // Inserta el topbar al principio del contenedor principal (después lo puedes mover si quieres)
    const container = document.querySelector(containerSelector);
    if (!container)
      return console.warn(
        "loadTopbar: contenedor no encontrado:",
        containerSelector
      );

    // Si ya hay un topbar, lo reemplazamos para mantener una sola fuente de verdad
    const old = container.querySelector(".topbar");
    if (old) old.remove();

    // Insertar al inicio de .main
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html.trim();
    const topbarEl = wrapper.firstElementChild;
    container.prepend(topbarEl);

    // Hidratar datos del usuario si tienes sesión guardada
    hydrateTopbarSafe();

    // (Opcional) listeners del topbar
    const bell = document.getElementById("notifBell");
    bell?.addEventListener("click", () => {
      // abre panel/alertas — ajústalo a tu UX
      window.location.href = "./operativo_alertas.html";
    });
  } catch (e) {
    console.error("Error cargando topbar:", e);
  }
}

// ---- util: hidratar datos de usuario de forma segura
function hydrateTopbarSafe() {
  try {
    const raw = localStorage.getItem("sigma_user");
    if (!raw) return;

    const u = JSON.parse(raw);

    // Si no existe name, deriva uno a partir del correo
    function nameFromEmail(email) {
      if (!email) return "Usuario";
      const user = email.split("@")[0];
      // Capitalizar primera letra
      return user.charAt(0).toUpperCase() + user.slice(1);
    }

    const email = u?.email || "correo@ejemplo.com";
    const name = u?.name || nameFromEmail(email);

    const fullName = document.getElementById("fullName");
    const emailLabel = document.getElementById("emailLabel");
    const avatar = document.getElementById("avatar");

    if (fullName) fullName.textContent = name;
    if (emailLabel) emailLabel.textContent = email;
    if (avatar) avatar.textContent = initialsFrom(name);
  } catch (e) {
    console.warn("No se pudo hidratar topbar:", e);
  }
}

function initialsFrom(name) {
  if (!name || typeof name !== "string") return "US";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "US";
}
