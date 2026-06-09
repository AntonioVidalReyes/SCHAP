let authToken = localStorage.getItem("authToken");
let currentUser = null;

function getAuthHeaders() {
  return authToken ? { "Authorization": "Bearer " + authToken } : {};
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

async function loadUser() {
  if (!authToken) {
    window.location.href = "index.html";
    return;
  }

  try {
    const res = await fetch(API_BASE + "/api/me", { headers: getAuthHeaders() });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      console.error("Respuesta no JSON en /api/me:", text);
      localStorage.removeItem("authToken");
      window.location.href = "index.html";
      return;
    }

    if (!res.ok) {
      console.error("/api/me error:", data);
      localStorage.removeItem("authToken");
      window.location.href = "index.html";
      return;
    }

    currentUser = data.user;
    buildHeader();
    applyRoleUI(currentUser);
    setupHeaderNav("inicio");

    document.getElementById("welcome-title").textContent =
      "Hola, " + currentUser.name;
    document.getElementById("welcome-sub").textContent =
      "Resumen de tus horas y solicitudes del año " + new Date().getFullYear();
    document.getElementById("footer-user").textContent =
      "Usuario: " + currentUser.name + " (" + currentUser.role + ")";

  } catch (err) {
    console.error("Error /api/me:", err);
    localStorage.removeItem("authToken");
    window.location.href = "index.html";
  }
}

/* ========== CARGAR DATOS ========== */

async function loadDashboardData() {
  try {
    // Cargar solicitudes (permisos y notificaciones)
    const reqRes = await fetch(API_BASE + "/api/requests?mine=1", {
      headers: getAuthHeaders()
    });
    const reqData = await reqRes.json();
    const requests = reqData.requests || [];

    // Cargar rendiciones
    const rendRes = await fetch(API_BASE + "/api/rendiciones?mine=1", {
      headers: getAuthHeaders()
    });
    const rendData = await rendRes.json();
    const rendiciones = rendData.rendiciones || [];

    // Cargar horarios
    const schedRes = await fetch(API_BASE + "/api/config/schedule", {
      headers: getAuthHeaders()
    });
    const schedData = await schedRes.json();
    const schedule = schedData.schedule || null;

    // Procesar datos
    const currentYear = new Date().getFullYear();
    const stats = calculateStats(requests, rendiciones, currentYear);

    // Renderizar KPIs
    renderKPIs(stats);

    // Renderizar tendencia anual
    renderTrendChart(requests, rendiciones, currentYear);

    // Renderizar últimas solicitudes (incluye rendiciones)
    renderLatestRequests(requests, rendiciones);

    // Renderizar horarios
    renderSchedule(schedule);

  } catch (err) {
    console.error("Error cargando dashboard:", err);
  }
}

/* ========== CALCULAR ESTADÍSTICAS ========== */

function calculateStats(requests, rendiciones, year) {
  // Filtrar por año actual
  const requestsYear = requests.filter(r => {
    const date = new Date(r.date || r.created_at);
    return date.getFullYear() === year;
  });

  const rendicionesYear = rendiciones.filter(r => {
    const date = new Date(r.created_at);
    return date.getFullYear() === year;
  });

  // Horas abonadas (bonus del usuario)
  const horasAbonadas = currentUser.bonus_hours || 0;

  // Horas rendidas aprobadas en el año
  const horasRendidas = rendicionesYear
    .filter(r => r.status === "aprobado" || r.status === "aprobado_jefe" || r.status === "aprobado_admin")
    .reduce((acc, r) => acc + (r.total_horas || 0), 0);

  // Horas usadas - usar el valor guardado en el usuario (más preciso)
  const horasUsadas = currentUser.used_hours || 0;

  // Horas disponibles = (abonadas + rendidas) - usadas
  // Puede ser negativo si el usuario ha usado más de lo que tiene
  const horasTotales = horasAbonadas + horasRendidas;
  const horasDisponibles = horasTotales - horasUsadas;

  // Solicitudes pendientes
  const pendientes = requestsYear.filter(r =>
    r.status === "pendiente" || r.status === "pendiente_jefe" || r.status === "pendiente_admin"
  );

  return {
    horasAbonadas,
    horasRendidas,
    horasTotales,
    horasUsadas,
    horasDisponibles,
    pendientesCount: pendientes.length,
    pendientesHoras: pendientes.reduce((acc, r) => acc + (r.hours || 0), 0)
  };
}

/* ========== RENDERIZAR KPIs ========== */

function renderKPIs(stats) {
  // KPI 1: Horas Totales (Abonadas + Rendidas)
  document.getElementById("kpi-total").textContent = stats.horasTotales.toFixed(1);
  document.getElementById("kpi-total-detail").textContent =
    `${stats.horasAbonadas.toFixed(1)} abonadas + ${stats.horasRendidas.toFixed(1)} rendidas`;

  // KPI 2: Horas Usadas
  document.getElementById("kpi-usadas").textContent = stats.horasUsadas.toFixed(1);
  const pctUsado = stats.horasTotales > 0
    ? ((stats.horasUsadas / stats.horasTotales) * 100).toFixed(1)
    : 0;
  document.getElementById("kpi-usadas-detail").textContent = `${pctUsado}% del total`;

  // KPI 3: Horas Disponibles (puede ser negativo)
  const kpiDisponibles = document.getElementById("kpi-disponibles");
  kpiDisponibles.textContent = stats.horasDisponibles.toFixed(1);

  // Si es negativo, mostrar en rojo
  if (stats.horasDisponibles < 0) {
    kpiDisponibles.style.color = "#e74c3c";
    document.getElementById("kpi-disponibles-detail").textContent = "⚠️ Saldo negativo";
  } else {
    kpiDisponibles.style.color = "";
    document.getElementById("kpi-disponibles-detail").textContent =
      stats.pendientesCount > 0
        ? `${stats.pendientesCount} solicitudes pendientes`
        : "Sin solicitudes pendientes";
  }

  // Barra de progreso
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");
  if (progressBar && progressText) {
    const pct = stats.horasTotales > 0
      ? Math.min(100, (stats.horasUsadas / stats.horasTotales) * 100)
      : 0;
    progressBar.style.width = pct + "%";
    progressText.textContent = `${stats.horasUsadas.toFixed(1)} de ${stats.horasTotales.toFixed(1)} horas usadas`;
  }
}

/* ========== RENDERIZAR GRÁFICO DE TENDENCIA ========== */

function renderTrendChart(requests, rendiciones, year) {
  const canvas = document.getElementById("trend-chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  // Calcular datos mensuales
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const horasUsadasMes = new Array(12).fill(0);
  const horasRendidasMes = new Array(12).fill(0);

  // Sumar horas usadas por mes (excluye notificaciones y abonos)
  requests.forEach(r => {
    const date = new Date(r.date || r.created_at);
    if (date.getFullYear() === year) {
      const month = date.getMonth();
      if (r.status === "aprobado" || r.status === "aprobado_jefe" || r.status === "aprobado_admin") {
        if (r.type?.toLowerCase() !== "notificación" && r.type !== "Abono") {
          horasUsadasMes[month] += r.hours || 0;
        }
      }
    }
  });

  // Sumar horas rendidas por mes
  rendiciones.forEach(r => {
    const date = new Date(r.created_at);
    if (date.getFullYear() === year) {
      const month = date.getMonth();
      if (r.status === "aprobado" || r.status === "aprobado_jefe" || r.status === "aprobado_admin") {
        horasRendidasMes[month] += r.total_horas || 0;
      }
    }
  });

  // Dibujar gráfico
  const width = canvas.width;
  const height = canvas.height;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Limpiar
  ctx.clearRect(0, 0, width, height);

  // Encontrar máximo
  const maxUsadas = Math.max(...horasUsadasMes, 1);
  const maxRendidas = Math.max(...horasRendidasMes, 1);
  const maxValue = Math.max(maxUsadas, maxRendidas, 10);

  // Dibujar líneas de fondo
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();

    // Etiqueta
    const value = Math.round(maxValue - (maxValue / 4) * i);
    ctx.fillStyle = "#999";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(value.toString(), padding - 5, y + 3);
  }

  // Dibujar etiquetas de meses
  const barWidth = chartWidth / 12;
  ctx.fillStyle = "#666";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  meses.forEach((mes, i) => {
    const x = padding + barWidth * i + barWidth / 2;
    ctx.fillText(mes, x, height - 10);
  });

  // Dibujar barras de horas usadas
  ctx.fillStyle = "#e74c3c";
  horasUsadasMes.forEach((val, i) => {
    const x = padding + barWidth * i + 5;
    const barH = (val / maxValue) * chartHeight;
    const y = padding + chartHeight - barH;
    ctx.fillRect(x, y, barWidth / 2 - 3, barH);
  });

  // Dibujar barras de horas rendidas
  ctx.fillStyle = "#27ae60";
  horasRendidasMes.forEach((val, i) => {
    const x = padding + barWidth * i + barWidth / 2 + 2;
    const barH = (val / maxValue) * chartHeight;
    const y = padding + chartHeight - barH;
    ctx.fillRect(x, y, barWidth / 2 - 3, barH);
  });

  // Leyenda
  ctx.fillStyle = "#e74c3c";
  ctx.fillRect(width - 150, 10, 12, 12);
  ctx.fillStyle = "#333";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Horas usadas", width - 133, 20);

  ctx.fillStyle = "#27ae60";
  ctx.fillRect(width - 150, 28, 12, 12);
  ctx.fillStyle = "#333";
  ctx.fillText("Horas rendidas", width - 133, 38);
}

/* ========== RENDERIZAR ÚLTIMAS SOLICITUDES ========== */

function renderLatestRequests(requests, rendiciones) {
  // Combinar solicitudes y rendiciones en un solo array
  const allItems = [];

  // Agregar solicitudes (permisos y notificaciones)
  requests.forEach(r => {
    allItems.push({
      id: r.id,
      tipo: r.type || "Permiso",
      categoria: r.type?.toLowerCase() === "notificación" ? "notificacion" : "permiso",
      horas: r.hours || 0,
      fecha: r.date || r.created_at,
      comentario: r.comment || "",
      status: r.status
    });
  });

  // Agregar rendiciones
  rendiciones.forEach(r => {
    allItems.push({
      id: r.id,
      tipo: "Rendición",
      categoria: "rendicion",
      horas: r.total_horas || 0,
      fecha: r.created_at,
      comentario: r.cliente || r.trabajo || "",
      status: r.status
    });
  });

  // Filtrar aprobadas
  const aprobadas = allItems
    .filter(r => r.status === "aprobado" || r.status === "aprobado_jefe" || r.status === "aprobado_admin")
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 5);

  // Filtrar rechazadas
  const rechazadas = allItems
    .filter(r => r.status === "rechazado" || r.status === "rechazado_jefe" || r.status === "rechazado_admin" || r.status === "rechazada")
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 5);

  const listAprobadas = document.getElementById("list-aprobadas");
  const listRechazadas = document.getElementById("list-rechazadas");

  // Renderizar aprobadas
  listAprobadas.innerHTML = "";
  if (aprobadas.length === 0) {
    listAprobadas.innerHTML = '<li class="empty">No hay solicitudes aprobadas</li>';
  } else {
    aprobadas.forEach(r => {
      const li = document.createElement("li");
      const icono = getIconoCategoria(r.categoria);
      const colorClass = getColorCategoria(r.categoria);

      li.innerHTML = `
        <div class="req-icon approved ${colorClass}"><i class="fa ${icono}"></i></div>
        <div class="req-info">
          <div class="req-title">${r.tipo} · ${r.horas.toFixed(1)}h</div>
          <div class="req-meta">${formatDate(r.fecha)} ${r.comentario ? "· " + truncate(r.comentario, 30) : ""}</div>
        </div>
      `;
      listAprobadas.appendChild(li);
    });
  }

  // Renderizar rechazadas
  listRechazadas.innerHTML = "";
  if (rechazadas.length === 0) {
    listRechazadas.innerHTML = '<li class="empty">No hay solicitudes rechazadas</li>';
  } else {
    rechazadas.forEach(r => {
      const li = document.createElement("li");
      const icono = getIconoCategoria(r.categoria);

      li.innerHTML = `
        <div class="req-icon rejected"><i class="fa ${icono}"></i></div>
        <div class="req-info">
          <div class="req-title">${r.tipo} · ${r.horas.toFixed(1)}h</div>
          <div class="req-meta">${formatDate(r.fecha)} ${r.comentario ? "· " + truncate(r.comentario, 30) : ""}</div>
        </div>
      `;
      listRechazadas.appendChild(li);
    });
  }
}

function getIconoCategoria(categoria) {
  switch (categoria) {
    case "notificacion":
      return "fa-bell";
    case "rendicion":
      return "fa-file-invoice";
    case "permiso":
    default:
      return "fa-clock";
  }
}

function getColorCategoria(categoria) {
  switch (categoria) {
    case "notificacion":
      return "notificacion";
    case "rendicion":
      return "rendicion";
    case "permiso":
    default:
      return "";
  }
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.substring(0, len) + "..." : str;
}

/* ========== RENDERIZAR HORARIOS ========== */

function renderSchedule(schedule) {
  const container = document.getElementById("schedule-container");
  if (!container) return;

  if (!schedule) {
    container.innerHTML = '<p class="empty">Horarios no configurados</p>';
    return;
  }

  const dias = [
    { key: "monday", label: "Lunes" },
    { key: "tuesday", label: "Martes" },
    { key: "wednesday", label: "Miércoles" },
    { key: "thursday", label: "Jueves" },
    { key: "friday", label: "Viernes" },
    { key: "saturday", label: "Sábado" },
    { key: "sunday", label: "Domingo" }
  ];

  let html = '<table class="schedule-table">';
  html += '<thead><tr><th>Día</th><th>Entrada</th><th>Salida</th><th>Estado</th></tr></thead>';
  html += '<tbody>';

  dias.forEach(dia => {
    const d = schedule[dia.key] || {};
    const isOff = d.off;
    const start = d.start || "-";
    const end = d.end || "-";

    html += `
      <tr class="${isOff ? 'day-off' : ''}">
        <td>${dia.label}</td>
        <td>${isOff ? '-' : start}</td>
        <td>${isOff ? '-' : end}</td>
        <td>${isOff ? '<span class="badge off">No laboral</span>' : '<span class="badge working">Laboral</span>'}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

/* ========== VERIFICAR USUARIO POR DEFECTO ========== */

function checkIfDefaultUser() {
  const isDefault = localStorage.getItem("isDefaultUser");
  if (isDefault === "true") {
    const overlay = document.getElementById("setup-overlay");
    if (overlay) {
      overlay.classList.add("active");
    }
  }
}

function closeSetupAndGoToAdmin() {
  const overlay = document.getElementById("setup-overlay");
  if (overlay) {
    overlay.classList.remove("active");
  }
  window.location.href = "admin.html";
}

/* ========== CAMBIO DE CONTRASEÑA OBLIGATORIO ========== */

function checkMustChangePassword() {
  // Verificar si el usuario debe cambiar su contraseña
  if (currentUser && currentUser.must_change_password) {
    showPasswordChangePopup();
  }
}

function showPasswordChangePopup() {
  const overlay = document.getElementById("password-change-overlay");
  if (overlay) {
    overlay.classList.add("active");
    // Enfocar el primer campo
    setTimeout(() => {
      const input = document.getElementById("new-password");
      if (input) input.focus();
    }, 100);
  }
}

async function submitPasswordChange() {
  const newPassword = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;
  const errorDiv = document.getElementById("password-error");

  // Limpiar error
  errorDiv.style.display = "none";
  errorDiv.textContent = "";

  // Validaciones
  if (!newPassword || newPassword.length < 4) {
    errorDiv.textContent = "La contraseña debe tener al menos 4 caracteres.";
    errorDiv.style.display = "block";
    return;
  }

  if (newPassword !== confirmPassword) {
    errorDiv.textContent = "Las contraseñas no coinciden.";
    errorDiv.style.display = "block";
    return;
  }

  try {
    const res = await fetch(API_BASE + "/api/users/" + currentUser.id + "/password", {
      method: "PATCH",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password: newPassword })
    });

    const data = await res.json();

    if (!res.ok) {
      errorDiv.textContent = data.error || "Error al cambiar la contraseña.";
      errorDiv.style.display = "block";
      return;
    }

    // Éxito - cerrar popup y actualizar usuario
    currentUser.must_change_password = 0;

    const overlay = document.getElementById("password-change-overlay");
    if (overlay) {
      overlay.classList.remove("active");
    }

    // Mostrar mensaje de éxito
    alert("¡Contraseña actualizada correctamente!\n\nSu nueva contraseña ha sido guardada.");

  } catch (err) {
    console.error("Error cambiando contraseña:", err);
    errorDiv.textContent = "Error de red. Por favor intente nuevamente.";
    errorDiv.style.display = "block";
  }
}

/* ========== INIT ========== */

(async function init() {
  await loadUser();
  await loadDashboardData();

  // Verificar si debe cambiar contraseña (prioridad sobre setup)
  if (currentUser && currentUser.must_change_password) {
    checkMustChangePassword();
  } else {
    // Verificar si es usuario por defecto
    setTimeout(checkIfDefaultUser, 500);
  }
})();
