
let authToken = localStorage.getItem("authToken");
let currentUser = null;

function getHeaders() {
    return { "Authorization": "Bearer " + authToken };
}

function getRequestIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    return id ? parseInt(id, 10) : null;
}

async function loadUser() {
    if (!authToken) {
        window.location.href = "index.html";
        return;
    }

    const res = await fetch(API_BASE + "/api/me", { headers: getHeaders() });
    const data = await res.json();
    currentUser = data.user;

    buildHeader();
    applyRoleUI(currentUser);
    setupHeaderNav("solicitudes");

    const footer = document.getElementById("footer-user");
    if (footer) {
        footer.textContent =
            "Usuario: " + currentUser.name + " (" + currentUser.role + ")";
    }
}

async function loadRequestDetail() {
    const reqId = getRequestIdFromUrl();
    if (!reqId) {
        alert("Falta el ID de la solicitud en la URL");
        return;
    }

    const res = await fetch(API_BASE + "/api/requests?mine=0", {
        headers: getHeaders()
    });

    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        console.error("Respuesta inválida de /api/requests", e, text);
        alert("No se pudo cargar la solicitud.");
        return;
    }

    if (!res.ok) {
        console.error("Error /api/requests", data);
        alert(data.error || "Error al cargar la solicitud.");
        return;
    }

    const list = data.requests || [];
    const r = list.find(item => parseInt(item.id, 10) === reqId);

    if (!r) {
        alert("No se encontró la solicitud #" + reqId);
        return;
    }

    fillHeader(r);
    fillDays(r);
    fillProgressBar(r);
    fillTimeline(r);
    await fillUserSection(r);
    fillStatus(r);
}

function fillHeader(r) {
    const numEl = document.getElementById("req-number");
    const userTitleEl = document.getElementById("req-user-name");

    if (numEl) numEl.textContent = "#" + (r.id || "-");
    if (userTitleEl) userTitleEl.textContent = r.user_name || "-";
}

function fillDays(r) {
    const body = document.getElementById("req-days-body");
    const totalEl = document.getElementById("req-total-hours");
    if (!body) return;

    body.innerHTML = "";

    const date = (r.date || r.day || "").split("T")[0] || "-";
    const from = r.from || r.from_time || "";
    const to = r.to || r.to_time || "";
    const comment = r.comment || "-";
    const fullDay = r.full_day ? "SÍ" : "NO";
    const hours = r.hours || 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td>${date}</td>
        <td>${from || "-"}</td>
        <td>${to || "-"}</td>
        <td>${fullDay}</td>
        <td>${comment}</td>
    `;
    body.appendChild(tr);

    if (totalEl) {
        totalEl.textContent = (hours || 0) + " Horas";
    }
}

/* ========== BARRA DE PROGRESO ========== */

function isNotificacion(r) {
    // Es notificación si type es "Notificación" o status es "informativa"
    return r.type === "Notificación" || r.type === "notificacion" || r.status === "informativa";
}

function fillProgressBar(r) {
    const progressBar = document.querySelector(".req-progress-bar");
    if (!progressBar) return;

    // Limpiar barra existente
    progressBar.innerHTML = "";

    if (isNotificacion(r)) {
        // NOTIFICACIÓN: Una sola barra azul con "Finalizada"
        renderNotificacionBar(progressBar);
    } else {
        // PERMISO/RENDICIÓN: 4 secciones con estados
        renderPermisoBar(progressBar, r);
    }
}

function renderNotificacionBar(container) {
    const step = document.createElement("div");
    step.className = "req-progress-step req-progress-step--notificacion";
    step.textContent = "Finalizada";
    container.appendChild(step);
}

function renderPermisoBar(container, r) {
    const status = r.status || "pendiente";

    // Determinar el estado de cada sección
    const estados = getEstadosSecciones(status);

    // Sección 1: Creada (siempre verde)
    const step1 = document.createElement("div");
    step1.className = "req-progress-step req-progress-step--" + estados.creada;
    step1.textContent = "Creada";
    container.appendChild(step1);

    // Sección 2: Revisión (Jefe)
    const step2 = document.createElement("div");
    step2.className = "req-progress-step req-progress-step--" + estados.jefe;
    step2.textContent = getTextoJefe(status);
    container.appendChild(step2);

    // Sección 3: Revisión (Administrador)
    const step3 = document.createElement("div");
    step3.className = "req-progress-step req-progress-step--" + estados.admin;
    step3.textContent = getTextoAdmin(status);
    container.appendChild(step3);

    // Sección 4: Finalizada
    const step4 = document.createElement("div");
    step4.className = "req-progress-step req-progress-step--" + estados.finalizada;
    step4.textContent = "Finalizada";
    container.appendChild(step4);
}

function getEstadosSecciones(status) {
    // Estados posibles: 'completado' (verde), 'pendiente' (amarillo), 'rechazado' (rojo), 'inactivo' (gris)

    const estados = {
        creada: "completado",      // Siempre verde
        jefe: "inactivo",
        admin: "inactivo",
        finalizada: "inactivo"
    };

    switch (status) {
        case "pendiente":
        case "pendiente_jefe":
            // Pendiente: verde, amarillo, amarillo, gris
            estados.jefe = "pendiente";
            estados.admin = "pendiente";
            estados.finalizada = "inactivo";
            break;

        case "aprobado_jefe":
            // Aprobado jefe: verde, verde, gris, verde
            estados.jefe = "completado";
            estados.admin = "inactivo";
            estados.finalizada = "completado";
            break;

        case "rechazado_jefe":
            // Rechazado jefe: verde, rojo, gris, rojo
            estados.jefe = "rechazado";
            estados.admin = "inactivo";
            estados.finalizada = "rechazado";
            break;

        case "aprobado_admin":
        case "aprobado":
            // Aprobado administrador: verde, gris, verde, verde
            estados.jefe = "inactivo";
            estados.admin = "completado";
            estados.finalizada = "completado";
            break;

        case "rechazado_admin":
        case "rechazado":
        case "rechazada":
            // Rechazado administrador: verde, gris, rojo, rojo
            estados.jefe = "inactivo";
            estados.admin = "rechazado";
            estados.finalizada = "rechazado";
            break;

        default:
            // Por defecto: pendiente
            estados.jefe = "pendiente";
            estados.admin = "pendiente";
            estados.finalizada = "inactivo";
    }

    return estados;
}

function getTextoJefe(status) {
    switch (status) {
        case "aprobado_jefe":
            return "Aprobada (Jefe)";
        case "rechazado_jefe":
            return "Rechazada (Jefe)";
        default:
            return "Revisión (Jefe)";
    }
}

function getTextoAdmin(status) {
    switch (status) {
        case "aprobado_admin":
        case "aprobado":
            return "Aprobada (Admin)";
        case "rechazado_admin":
        case "rechazado":
        case "rechazada":
            return "Rechazada (Admin)";
        default:
            return "Revisión (Admin)";
    }
}

/* ========== TIMELINE ========== */

function fillTimeline(r) {
    const list = document.getElementById("req-timeline");
    if (!list) return;
    list.innerHTML = "";

    const createdAt = r.created_at || "";
    const status = mapStatus(r.status || "");

    if (createdAt) {
        const li1 = document.createElement("li");
        li1.textContent = formatDateTime(createdAt) + " - Creada por " + (r.user_name || "-");
        list.appendChild(li1);
    }

    const li2 = document.createElement("li");
    li2.textContent = "Estado actual: " + status;
    list.appendChild(li2);
}

function formatDateTime(dateStr) {
    if (!dateStr) return "-";
    try {
        const date = new Date(dateStr);
        return date.toLocaleString("es-CL");
    } catch {
        return dateStr;
    }
}

function mapStatus(statusRaw) {
    const map = {
        pendiente: "Pendiente",
        pendiente_jefe: "Pendiente de Jefe",
        pendiente_admin: "Pendiente de Administrador",
        aprobado_jefe: "Aprobado por Jefe",
        aprobado_admin: "Aprobado por Administrador",
        aprobado: "Aprobado",
        rechazado_jefe: "Rechazado por Jefe",
        rechazado_admin: "Rechazado por Administrador",
        rechazada: "Rechazada",
        rechazado: "Rechazado",
        informativa: "Informativa (Notificación)"
    };
    return map[statusRaw] || statusRaw || "-";
}

/* ========== SECCIÓN DE USUARIO CON SALDO ========== */

async function fillUserSection(r) {
    const nameEl = document.getElementById("req-user-name-detail");
    const emailEl = document.getElementById("req-user-email");
    const balEl = document.getElementById("req-user-balance");

    if (nameEl) nameEl.textContent = r.user_name || "-";
    if (emailEl) emailEl.textContent = r.user_email || "-";

    if (balEl) {
        // Obtener el saldo actual del usuario desde la lista de usuarios
        try {
            const res = await fetch(API_BASE + "/api/users", {
                headers: getHeaders()
            });

            if (res.ok) {
                const data = await res.json();
                const users = data.users || [];
                const user = users.find(u => u.id === r.user_id);

                console.log("Usuario encontrado:", user);
                console.log("bonus_hours:", user?.bonus_hours);
                console.log("used_hours:", user?.used_hours);

                if (user) {
                    const bonusHours = parseFloat(user.bonus_hours) || 0;
                    const usedHours = parseFloat(user.used_hours) || 0;
                    const saldoDisponible = bonusHours - usedHours;

                    console.log("Saldo calculado:", saldoDisponible);

                    // Mostrar el saldo disponible
                    balEl.textContent = saldoDisponible.toFixed(1) + " horas disponibles";
                } else {
                    balEl.textContent = "-";
                }
            } else {
                balEl.textContent = "-";
            }
        } catch (err) {
            console.error("Error obteniendo saldo del usuario:", err);
            balEl.textContent = "-";
        }
    }
}

function fillStatus(r) {
    const statusEl = document.getElementById("req-status-label");
    const reasonEl = document.getElementById("req-status-reason");

    if (statusEl) statusEl.textContent = mapStatus(r.status || "");
    if (reasonEl) reasonEl.textContent = r.reject_reason || r.razon || "-";

    // Mostrar botones de acción si corresponde
    mostrarBotonesAccion(r);
}

/* ========== BOTONES DE ACCIÓN ========== */

let solicitudActual = null;

function mostrarBotonesAccion(r) {
    const actionsDiv = document.getElementById("req-actions");

    // Solo mostrar si es jefe o admin
    if (!currentUser || (currentUser.role !== "jefe" && currentUser.role !== "administrador")) {
        actionsDiv.style.display = "none";
        return;
    }

    // NO mostrar para notificaciones (type === "Notificación" o status === "informativa")
    const esNotificacion = (r.type && r.type.toLowerCase() === "notificación") ||
        (r.type && r.type.toLowerCase() === "notificacion") ||
        r.status === "informativa";
    if (esNotificacion) {
        actionsDiv.style.display = "none";
        return;
    }

    // Solo mostrar si está pendiente
    const estadosPendientes = ["pendiente", "pendiente_jefe", "pendiente_admin"];
    if (!estadosPendientes.includes(r.status)) {
        actionsDiv.style.display = "none";
        return;
    }

    // Guardar la solicitud actual para usar en las funciones
    solicitudActual = r;

    // Mostrar los botones
    actionsDiv.style.display = "flex";

    // Configurar eventos de los botones
    document.getElementById("btn-aprobar").onclick = abrirPopupAprobar;
    document.getElementById("btn-rechazar").onclick = abrirPopupRechazar;
}

/* ========== POPUP APROBAR ========== */

function abrirPopupAprobar() {
    if (!solicitudActual) return;

    // Mostrar las horas que se descontarán
    document.getElementById("popup-horas").textContent = solicitudActual.hours || 0;

    // Mostrar popup
    document.getElementById("popup-aprobar").classList.add("active");
}

function cerrarPopupAprobar() {
    document.getElementById("popup-aprobar").classList.remove("active");
}

async function confirmarAprobacion() {
    if (!solicitudActual) return;

    const reqId = solicitudActual.id;

    // Determinar el nuevo estado según el rol
    let nuevoEstado = "aprobado";
    if (currentUser.role === "jefe") {
        nuevoEstado = "aprobado_jefe";
    }

    try {
        const res = await fetch(API_BASE + "/api/requests/" + reqId + "/status", {
            method: "PATCH",
            headers: {
                "Authorization": "Bearer " + authToken,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                status: nuevoEstado,
                reject_reason: ""
            })
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error || "Error al aprobar la solicitud.");
            return;
        }

        cerrarPopupAprobar();
        alert("Solicitud aprobada exitosamente.\nSe ha enviado un correo de notificación al trabajador.");

        // Recargar la página para ver los cambios
        window.location.reload();

    } catch (err) {
        console.error("Error aprobando solicitud:", err);
        alert("Error de red al aprobar la solicitud.");
    }
}

/* ========== POPUP RECHAZAR ========== */

function abrirPopupRechazar() {
    if (!solicitudActual) return;

    // Limpiar el textarea
    document.getElementById("razon-rechazo").value = "";

    // Mostrar popup
    document.getElementById("popup-rechazar").classList.add("active");
}

function cerrarPopupRechazar() {
    document.getElementById("popup-rechazar").classList.remove("active");
}

async function confirmarRechazo() {
    if (!solicitudActual) return;

    const razon = document.getElementById("razon-rechazo").value.trim();

    if (!razon) {
        alert("Debe indicar una razón para el rechazo.");
        return;
    }

    const reqId = solicitudActual.id;

    // Determinar el nuevo estado según el rol
    let nuevoEstado = "rechazado";
    if (currentUser.role === "jefe") {
        nuevoEstado = "rechazado_jefe";
    }

    try {
        const res = await fetch(API_BASE + "/api/requests/" + reqId + "/status", {
            method: "PATCH",
            headers: {
                "Authorization": "Bearer " + authToken,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                status: nuevoEstado,
                reject_reason: razon
            })
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error || "Error al rechazar la solicitud.");
            return;
        }

        cerrarPopupRechazar();
        alert("Solicitud rechazada.\nSe ha enviado un correo de notificación al trabajador.");

        // Recargar la página para ver los cambios
        window.location.reload();

    } catch (err) {
        console.error("Error rechazando solicitud:", err);
        alert("Error de red al rechazar la solicitud.");
    }
}

// INIT
(async function init() {
    await loadUser();
    await loadRequestDetail();
})();
