// HEADER GLOBAL DINÁMICO
function buildHeader() {
  const root = document.getElementById("app-header");
  if (!root) return;

  root.innerHTML = `
    <header class="main-header">
      <div class="header-left">
        <span class="brand">SCHAP</span>
        <span id="role-pill" class="role-badge"></span>
      </div>

      <nav class="top-menu">
        <button id="btn-menu-inicio" data-visible-roles="administrador,jefe,trabajador">
          <i class="fa fa-home"></i> Inicio
        </button>

        <button id="btn-menu-cal" data-visible-roles="administrador,jefe,trabajador">
          <i class="fa fa-calendar"></i> Calendario
        </button>

        <button id="btn-menu-solicitar" data-visible-roles="administrador,jefe,trabajador">
          <i class="fa fa-plus-circle"></i> Solicitar
        </button>

        <button id="btn-menu-solicitudes" data-visible-roles="administrador,jefe,trabajador">
          <i class="fa fa-envelope"></i> Solicitudes
        </button>

        <button id="btn-menu-reportes" data-visible-roles="administrador,jefe">
          <i class="fa fa-chart-bar"></i> Reportes
        </button>

        <button id="btn-menu-admin" data-visible-roles="administrador">
          <i class="fa fa-user-gear"></i> Admin
        </button>

        <button id="btn-theme-toggle" class="theme-btn" title="Cambiar modo de color">
          <i class="fa fa-moon" id="theme-toggle-icon"></i>
        </button>

        <button id="btn-menu-logout" class="danger" data-visible-roles="administrador,jefe,trabajador">
          <i class="fa fa-sign-out-alt"></i> Cerrar sesión
        </button>
      </nav>
    </header>
  `;

  // Inicializar manejadores del tema
  const themeBtn = document.getElementById("btn-theme-toggle");
  if (themeBtn) {
    themeBtn.onclick = toggleTheme;
  }
  updateThemeIcon();
}

// MARCAR BOTÓN ACTIVO + NAVEGACIÓN
function setupHeaderNav(active) {
  const mapping = {
    "inicio": "btn-menu-inicio",
    "calendario": "btn-menu-cal",
    "solicitar": "btn-menu-solicitar",
    "solicitudes": "btn-menu-solicitudes",
    "reportes": "btn-menu-reportes",
    "admin": "btn-menu-admin",
  };

  Object.values(mapping).forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.remove("active");
  });

  const activeBtn = document.getElementById(mapping[active]);
  if (activeBtn) activeBtn.classList.add("active");

  document.getElementById("btn-menu-inicio").onclick = () => location.href = "inicio.html";
  document.getElementById("btn-menu-cal").onclick = () => location.href = "panel.html";
  document.getElementById("btn-menu-solicitar").onclick = () => location.href = "solicitar.html";
  document.getElementById("btn-menu-solicitudes").onclick = () => location.href = "solicitudes.html";
  document.getElementById("btn-menu-reportes").onclick = () => location.href = "reportes.html";
  document.getElementById("btn-menu-admin").onclick = () => location.href = "admin.html";
  document.getElementById("btn-menu-logout").onclick = () => {
    localStorage.removeItem("authToken");
    location.href = "index.html";
  };
}

// APLICAR ROLES VISUALES
function applyRoleUI(user) {
  const pill = document.getElementById("role-pill");
  if (pill) {
    pill.textContent = user.role;
    pill.className = "role-badge role-" + user.role;
  }

  document.querySelectorAll("[data-visible-roles]").forEach(el => {
    const allowed = el.dataset.visibleRoles.split(",");
    if (!allowed.includes(user.role)) {
      el.classList.add("hidden");
    } else {
      el.classList.remove("hidden");
    }
  });

  // Re-estructurar el footer para que sea uniforme y dinámico
  const footer = document.querySelector("footer");
  if (footer) {
    footer.innerHTML = `
      <div class="footer-left">
        <span class="brand">SCHAP</span>
        <span class="footer-divider">|</span>
        <span class="footer-brand-text">Control de Horas Administrativas</span>
      </div>
      <div class="footer-center">
        <span id="footer-datetime"></span>
      </div>
      <div class="footer-right">
        <span id="footer-user">Usuario: -</span>
      </div>
    `;

    // Iniciar el reloj de fecha y hora del footer
    const updateFooterClock = () => {
      const el = document.getElementById("footer-datetime");
      if (!el) return;
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      el.textContent = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    };

    if (window.footerClockInterval) {
      clearInterval(window.footerClockInterval);
    }
    updateFooterClock();
    window.footerClockInterval = setInterval(updateFooterClock, 1000);
  }
}

// MANEJO DE TEMAS CLARO / OSCURO
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "light";
  if (savedTheme === "dark") {
    document.body.classList.add("dark-theme");
  } else {
    document.body.classList.remove("dark-theme");
  }
}

function toggleTheme() {
  if (document.body.classList.contains("dark-theme")) {
    document.body.classList.remove("dark-theme");
    localStorage.setItem("theme", "light");
  } else {
    document.body.classList.add("dark-theme");
    localStorage.setItem("theme", "dark");
  }
  updateThemeIcon();
}

function updateThemeIcon() {
  const icon = document.getElementById("theme-toggle-icon");
  if (!icon) return;
  if (document.body.classList.contains("dark-theme")) {
    icon.className = "fa fa-sun";
  } else {
    icon.className = "fa fa-moon";
  }
}

// Ejecutar initTheme inmediatamente para evitar destellos blancos durante la carga
initTheme();
