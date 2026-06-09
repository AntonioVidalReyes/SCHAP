
let authToken = localStorage.getItem("authToken");
let currentUser = null;

function getHeaders() {
    return { "Authorization": "Bearer " + authToken };
}

function getRendicionIdFromUrl() {
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
        footer.textContent = "Usuario: " + currentUser.name + " (" + currentUser.role + ")";
    }
}

async function loadRendicionDetail() {
    const rendId = getRendicionIdFromUrl();
    if (!rendId) {
        alert("Falta el ID de la rendición en la URL");
        return;
    }

    try {
        console.log("Cargando rendición ID:", rendId);
        console.log("URL:", API_BASE + "/api/rendiciones/" + rendId);

        const res = await fetch(API_BASE + "/api/rendiciones/" + rendId, {
            headers: getHeaders()
        });

        console.log("Response status:", res.status);
        console.log("Response ok:", res.ok);

        const text = await res.text();
        console.log("Response text:", text);

        let data;
        try {
            data = JSON.parse(text);
        } catch (parseErr) {
            console.error("Error parseando JSON:", parseErr);
            alert("Error: La respuesta del servidor no es JSON válido");
            return;
        }

        console.log("Respuesta del servidor:", data);

        if (!res.ok) {
            alert(data.error || "Error al cargar la rendición.");
            return;
        }

        const r = data.rendicion;

        if (!r) {
            alert("No se encontró la rendición #" + rendId);
            return;
        }

        console.log("Rendición cargada:", r);
        console.log("Status:", r.status);
        console.log("Tiempos:", r.tiempos);

        fillHeader(r);
        fillHitos(r);
        fillTiempos(r);
        fillProgressBar(r);
        fillTimeline(r);
        fillEstado(r);

    } catch (err) {
        console.error("Error cargando rendición:", err);
        console.error("Error name:", err.name);
        console.error("Error message:", err.message);
        console.error("Error stack:", err.stack);
        alert("Error de red al cargar la rendición: " + err.message);
    }
}

/* ========== LLENAR ENCABEZADO ========== */

function fillHeader(r) {
    document.getElementById("rend-number").textContent = r.id || "-";
    document.getElementById("rend-user-name").textContent = r.user_name || "-";
    document.getElementById("rend-cliente").textContent = r.cliente || "-";
    document.getElementById("rend-guia").textContent = r.guia || "-";
    document.getElementById("rend-trabajo").textContent = r.trabajo || "-";
    document.getElementById("rend-proyecto").textContent = r.proyecto || "-";
    document.getElementById("rend-obs").textContent = r.obs || "-";
}

/* ========== LLENAR HITOS ========== */

function fillHitos(r) {
    const tbody = document.getElementById("rend-hitos-body");
    tbody.innerHTML = "";

    const hitos = r.hitos || [];

    if (hitos.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="5" style="text-align:center;color:#888;">Sin hitos</td>`;
        tbody.appendChild(tr);
        return;
    }

    hitos.forEach(h => {
        const tr = document.createElement("tr");

        // Formatear día con nombre
        const diaFormateado = formatDiaConNombre(h.day);

        // Determinar tipo
        let tipo = h.tipo || "-";
        if (tipo === "extra") tipo = "Hora extra";
        if (tipo === "viaje") tipo = "Viaje";
        if (tipo === "feriado") tipo = "Feriado";
        if (tipo === "alojamiento") tipo = "Alojamiento";

        // Extras
        let extras = [];
        if (h.alojamiento) extras.push("Alojamiento");
        if (h.feriado) extras.push("Feriado");
        const extrasStr = extras.length > 0 ? extras.join(", ") : "-";

        tr.innerHTML = `
            <td>${diaFormateado}</td>
            <td>${h.desde || "-"}</td>
            <td>${h.hasta || "-"}</td>
            <td>${tipo}</td>
            <td>${extrasStr}</td>
        `;
        tbody.appendChild(tr);
    });
}

function formatDiaConNombre(dateStr) {
    if (!dateStr) return "-";
    try {
        const date = new Date(dateStr + "T12:00:00");
        const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
        const dia = String(date.getDate()).padStart(2, "0");
        const mes = String(date.getMonth() + 1).padStart(2, "0");
        const año = date.getFullYear();
        const nombreDia = dias[date.getDay()];
        return `${dia}-${mes}-${año} (${nombreDia})`;
    } catch {
        return dateStr;
    }
}

/* ========== LLENAR TIEMPOS ========== */

function fillTiempos(r) {
    const tiempos = r.tiempos || {};

    // Alojamiento
    const aloj = tiempos.alojamiento || {};
    document.getElementById("tiempo-aloj-real").textContent = aloj.real || 0;
    document.getElementById("tiempo-aloj-ajus").textContent = aloj.ajustado || 0;

    // Feriado / Domingo
    const feriado = tiempos.feriado || {};
    document.getElementById("tiempo-feriado-real").textContent = feriado.real || 0;
    document.getElementById("tiempo-feriado-ajus").textContent = feriado.ajustado || 0;

    // Horas extras semana (usamos extras)
    const extras = tiempos.extras || {};
    document.getElementById("tiempo-extra-semana-real").textContent = extras.real || 0;
    document.getElementById("tiempo-extra-semana-ajus").textContent = extras.ajustado || 0;

    // Viaje
    const viaje = tiempos.viaje || {};
    document.getElementById("tiempo-viaje-real").textContent = viaje.real || 0;
    document.getElementById("tiempo-viaje-ajus").textContent = viaje.ajustado || 0;

    // Total
    const total = r.total_horas || 0;
    document.getElementById("tiempo-total-ajus").textContent = total + " Horas";
}

/* ========== BARRA DE PROGRESO ========== */

function fillProgressBar(r) {
    const progressBar = document.getElementById("rend-progress-bar");
    progressBar.innerHTML = "";

    const status = r.status || "pendiente";
    const estados = getEstadosSecciones(status);

    // Sección 1: Creada
    const step1 = document.createElement("div");
    step1.className = "rend-progress-step rend-progress-step--" + estados.creada;
    step1.textContent = "Creada";
    progressBar.appendChild(step1);

    // Sección 2: Revisión (Jefe)
    const step2 = document.createElement("div");
    step2.className = "rend-progress-step rend-progress-step--" + estados.jefe;
    step2.textContent = getTextoJefe(status);
    progressBar.appendChild(step2);

    // Sección 3: Revisión (Administrador)
    const step3 = document.createElement("div");
    step3.className = "rend-progress-step rend-progress-step--" + estados.admin;
    step3.textContent = getTextoAdmin(status);
    progressBar.appendChild(step3);

    // Sección 4: Finalizada
    const step4 = document.createElement("div");
    step4.className = "rend-progress-step rend-progress-step--" + estados.finalizada;
    step4.textContent = "Finalizada";
    progressBar.appendChild(step4);
}

function getEstadosSecciones(status) {
    const estados = {
        creada: "completado",
        jefe: "inactivo",
        admin: "inactivo",
        finalizada: "inactivo"
    };

    switch (status) {
        case "pendiente":
        case "pendiente_jefe":
            estados.jefe = "pendiente";
            estados.admin = "pendiente";
            break;

        case "aprobado_jefe":
            estados.jefe = "completado";
            estados.admin = "inactivo";
            estados.finalizada = "completado";
            break;

        case "rechazado_jefe":
            estados.jefe = "rechazado";
            estados.admin = "inactivo";
            estados.finalizada = "rechazado";
            break;

        case "aprobado_admin":
        case "aprobado":
            estados.jefe = "inactivo";
            estados.admin = "completado";
            estados.finalizada = "completado";
            break;

        case "rechazado_admin":
        case "rechazado":
        case "rechazada":
            estados.jefe = "inactivo";
            estados.admin = "rechazado";
            estados.finalizada = "rechazado";
            break;

        default:
            estados.jefe = "pendiente";
            estados.admin = "pendiente";
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
    const timeline = document.getElementById("rend-timeline");
    timeline.innerHTML = "";

    const historial = r.historial || [];

    // Si hay historial del backend, usarlo
    if (historial.length > 0) {
        historial.forEach(h => {
            const li = document.createElement("li");
            li.textContent = `${formatDateTime(h.fecha)} - ${h.accion} por ${h.usuario}`;
            timeline.appendChild(li);
        });
    } else {
        // Generar historial básico desde los datos disponibles
        const status = r.status || "pendiente";

        // Mostrar en orden cronológico inverso (más reciente primero)
        const eventos = [];

        // Evento de rechazo/aprobación si aplica
        if (status === "rechazado_jefe" || status === "rechazado_admin" || status === "rechazado" || status === "rechazada") {
            const quien = status.includes("jefe") ? "Jefe" : "Administrador";
            eventos.push({
                fecha: r.updated_at || r.created_at,
                texto: `Rechazada por ${quien}`
            });
        } else if (status === "aprobado_jefe" || status === "aprobado_admin" || status === "aprobado") {
            const quien = status.includes("jefe") ? "Jefe" : "Administrador";
            eventos.push({
                fecha: r.updated_at || r.created_at,
                texto: `Aprobada por ${quien}`
            });
        }

        // Evento de creación
        eventos.push({
            fecha: r.created_at,
            texto: `Creada por ${r.user_name || "Usuario"}`
        });

        // Renderizar
        eventos.forEach(e => {
            const li = document.createElement("li");
            li.textContent = `${formatDateTime(e.fecha)} - ${e.texto}`;
            timeline.appendChild(li);
        });
    }
}

function formatDateTime(dateStr) {
    if (!dateStr) return "-";
    try {
        const date = new Date(dateStr);
        const dia = String(date.getDate()).padStart(2, "0");
        const mes = String(date.getMonth() + 1).padStart(2, "0");
        const año = date.getFullYear();
        const hora = String(date.getHours()).padStart(2, "0");
        const min = String(date.getMinutes()).padStart(2, "0");
        const seg = String(date.getSeconds()).padStart(2, "0");
        return `${dia}-${mes}-${año} ${hora}:${min}:${seg}`;
    } catch {
        return dateStr;
    }
}

/* ========== ESTADO ========== */

function fillEstado(r) {
    const estadoEl = document.getElementById("rend-estado");
    const razonEl = document.getElementById("rend-razon");

    const statusMap = {
        pendiente: "Pendiente",
        pendiente_jefe: "Pendiente de Jefe",
        pendiente_admin: "Pendiente de Admin",
        aprobado_jefe: "Aprobada por Jefe",
        aprobado_admin: "Aprobada",
        aprobado: "Aprobada",
        rechazado_jefe: "Rechazada por Jefe",
        rechazado_admin: "Rechazada",
        rechazado: "Rechazada",
        rechazada: "Rechazada"
    };

    estadoEl.textContent = statusMap[r.status] || r.status || "-";
    razonEl.textContent = r.razon || r.reject_reason || "-";

    // Mostrar botones de acción si el usuario es jefe/admin y la rendición está pendiente
    mostrarBotonesAccion(r);
}

/* ========== BOTONES DE ACCIÓN ========== */

let rendicionActual = null;

function mostrarBotonesAccion(r) {
    const actionsDiv = document.getElementById("rend-actions");

    // Solo mostrar si es jefe o admin
    if (!currentUser || (currentUser.role !== "jefe" && currentUser.role !== "administrador")) {
        actionsDiv.style.display = "none";
        return;
    }

    // Solo mostrar si está pendiente
    const estadosPendientes = ["pendiente", "pendiente_jefe", "pendiente_admin"];
    if (!estadosPendientes.includes(r.status)) {
        actionsDiv.style.display = "none";
        return;
    }

    // Guardar la rendición actual para usar en las funciones
    rendicionActual = r;

    // Mostrar los botones
    actionsDiv.style.display = "flex";

    // Configurar eventos de los botones
    document.getElementById("btn-aprobar").onclick = abrirPopupAprobar;
    document.getElementById("btn-rechazar").onclick = abrirPopupRechazar;
}

/* ========== POPUP APROBAR ========== */

function abrirPopupAprobar() {
    if (!rendicionActual) return;

    // Mostrar las horas que se sumarán
    document.getElementById("popup-horas").textContent = rendicionActual.total_horas || 0;

    // Mostrar popup
    document.getElementById("popup-aprobar").classList.add("active");
}

function cerrarPopupAprobar() {
    document.getElementById("popup-aprobar").classList.remove("active");
}

async function confirmarAprobacion() {
    if (!rendicionActual) return;

    const rendId = rendicionActual.id;

    // Determinar el nuevo estado según el rol
    let nuevoEstado = "aprobado";
    if (currentUser.role === "jefe") {
        nuevoEstado = "aprobado_jefe";
    }

    try {
        const res = await fetch(API_BASE + "/api/rendiciones/" + rendId + "/status", {
            method: "PATCH",
            headers: {
                "Authorization": "Bearer " + authToken,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                status: nuevoEstado,
                razon: ""
            })
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error || "Error al aprobar la rendición.");
            return;
        }

        cerrarPopupAprobar();
        alert("Rendición aprobada exitosamente.\nSe ha enviado un correo de notificación al trabajador.");

        // Recargar la página para ver los cambios
        window.location.reload();

    } catch (err) {
        console.error("Error aprobando rendición:", err);
        alert("Error de red al aprobar la rendición.");
    }
}

/* ========== POPUP RECHAZAR ========== */

function abrirPopupRechazar() {
    if (!rendicionActual) return;

    // Limpiar el textarea
    document.getElementById("razon-rechazo").value = "";

    // Mostrar popup
    document.getElementById("popup-rechazar").classList.add("active");
}

function cerrarPopupRechazar() {
    document.getElementById("popup-rechazar").classList.remove("active");
}

async function confirmarRechazo() {
    if (!rendicionActual) return;

    const razon = document.getElementById("razon-rechazo").value.trim();

    if (!razon) {
        alert("Debe indicar una razón para el rechazo.");
        return;
    }

    const rendId = rendicionActual.id;

    // Determinar el nuevo estado según el rol
    let nuevoEstado = "rechazado";
    if (currentUser.role === "jefe") {
        nuevoEstado = "rechazado_jefe";
    }

    try {
        const res = await fetch(API_BASE + "/api/rendiciones/" + rendId + "/status", {
            method: "PATCH",
            headers: {
                "Authorization": "Bearer " + authToken,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                status: nuevoEstado,
                razon: razon
            })
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error || "Error al rechazar la rendición.");
            return;
        }

        cerrarPopupRechazar();
        alert("Rendición rechazada.\nSe ha enviado un correo de notificación al trabajador.");

        // Recargar la página para ver los cambios
        window.location.reload();

    } catch (err) {
        console.error("Error rechazando rendición:", err);
        alert("Error de red al rechazar la rendición.");
    }
}

/* ========== INIT ========== */

(async function init() {
    await loadUser();
    await loadRendicionDetail();
})();
