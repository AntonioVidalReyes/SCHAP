
let authToken = localStorage.getItem("authToken");
let currentUser = null;

// Datos
let usuarios = [];
let usuarioSeleccionado = null;

// Paginación
let paginacion = { page: 1, limit: 10, total: 0 };

// Ordenamiento
let ordenamiento = { col: "name", dir: "asc" };

// Búsqueda
let busqueda = "";

function getHeaders(json = false) {
    const headers = { "Authorization": "Bearer " + authToken };
    if (json) headers["Content-Type"] = "application/json";
    return headers;
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
    setupHeaderNav("reportes");

    document.getElementById("footer-user").textContent =
        "Usuario: " + currentUser.name + " (" + currentUser.role + ")";
}

/* ========== CARGAR USUARIOS ========== */

async function cargarUsuarios() {
    try {
        const res = await fetch(API_BASE + "/api/users", {
            headers: getHeaders()
        });
        const data = await res.json();
        let allUsers = data.users || [];

        // Filtrar usuarios según el rol
        if (currentUser.role === "trabajador") {
            // Trabajador solo se ve a sí mismo
            usuarios = allUsers.filter(u => u.id === currentUser.id);
        } else if (currentUser.role === "jefe") {
            // Jefe ve a sí mismo y a sus trabajadores a cargo
            usuarios = allUsers.filter(u =>
                u.id === currentUser.id || u.boss_id === currentUser.id
            );
        } else {
            // Administrador ve a todos
            usuarios = allUsers;
        }

        // Cargar solicitudes pendientes de cada usuario
        await cargarSolicitudesPendientes();

        // Actualizar total
        paginacion.total = usuarios.length;

        // Renderizar
        renderTablaUsuarios();

    } catch (err) {
        console.error("Error cargando usuarios:", err);
    }
}

async function cargarSolicitudesPendientes() {
    try {
        // Cargar todas las requests
        const res = await fetch(API_BASE + "/api/requests", {
            headers: getHeaders()
        });
        const data = await res.json();
        const requests = data.requests || [];

        // Contar pendientes por usuario
        const pendientesPorUsuario = {};
        requests.forEach(r => {
            const estadosPendientes = ["pendiente", "pendiente_jefe", "pendiente_admin"];
            if (estadosPendientes.includes(r.status)) {
                pendientesPorUsuario[r.user_id] = (pendientesPorUsuario[r.user_id] || 0) + 1;
            }
        });

        // Actualizar usuarios con la info de pendientes
        usuarios.forEach(u => {
            u.solicitudes_pendientes = pendientesPorUsuario[u.id] || 0;
        });

    } catch (err) {
        console.warn("Error cargando solicitudes pendientes:", err);
    }
}

/* ========== RENDERIZAR TABLA USUARIOS ========== */

function renderTablaUsuarios() {
    const tbody = document.getElementById("tbody-usuarios");
    const search = busqueda.toLowerCase();

    // Filtrar por búsqueda
    let filtrados = usuarios.filter(u => {
        if (!search) return true;
        return (
            String(u.id).includes(search) ||
            (u.name || "").toLowerCase().includes(search) ||
            (u.email || "").toLowerCase().includes(search) ||
            (u.role || "").toLowerCase().includes(search)
        );
    });

    // Ordenar
    filtrados.sort((a, b) => {
        let valA = a[ordenamiento.col];
        let valB = b[ordenamiento.col];

        if (ordenamiento.col === "id") {
            valA = parseInt(valA) || 0;
            valB = parseInt(valB) || 0;
        } else {
            valA = String(valA || "").toLowerCase();
            valB = String(valB || "").toLowerCase();
        }

        if (ordenamiento.dir === "asc") {
            return valA > valB ? 1 : valA < valB ? -1 : 0;
        } else {
            return valA < valB ? 1 : valA > valB ? -1 : 0;
        }
    });

    // Actualizar total filtrado
    const totalFiltrado = filtrados.length;

    // Paginar
    const inicio = (paginacion.page - 1) * paginacion.limit;
    const fin = inicio + paginacion.limit;
    const paginados = filtrados.slice(inicio, fin);

    // Renderizar filas
    tbody.innerHTML = "";

    if (paginados.length === 0) {
        const tr = document.createElement("tr");
        tr.className = "no-results";
        tr.innerHTML = `<td colspan="7">No se encontraron resultados.</td>`;
        tbody.appendChild(tr);
    } else {
        paginados.forEach(u => {
            const isSelected = usuarioSeleccionado && usuarioSeleccionado.id === u.id;
            const tr = document.createElement("tr");
            tr.className = isSelected ? "selected" : "";
            tr.onclick = () => seleccionarUsuario(u);

            // Calcular horas disponibles
            const bonus = u.bonus_hours || 0;
            const used = u.used_hours || 0;
            const horas = Math.round((bonus - used) * 10) / 10;

            // Pendientes
            const pendientes = u.solicitudes_pendientes || 0;
            const pendientesText = pendientes > 0 ? "SI" : "NO";

            tr.innerHTML = `
                <td><input type="checkbox" ${isSelected ? "checked" : ""} onclick="event.stopPropagation(); seleccionarUsuario(${JSON.stringify(u).replace(/"/g, '&quot;')})"></td>
                <td>${u.id}</td>
                <td>${u.name || "-"}</td>
                <td>${u.email || "-"}</td>
                <td>${u.role || "-"}</td>
                <td>${horas}</td>
                <td>${pendientesText}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Actualizar info
    const infoEl = document.getElementById("info-usuarios");
    if (totalFiltrado === 0) {
        infoEl.textContent = "Mostrando 0 al 0 de 0 resultados";
    } else {
        const desde = inicio + 1;
        const hasta = Math.min(fin, totalFiltrado);
        infoEl.textContent = `Mostrando ${desde} al ${hasta} de ${totalFiltrado} resultados`;
    }

    // Renderizar paginación
    renderPaginacion(totalFiltrado);
}

/* ========== SELECCIONAR USUARIO ========== */

function seleccionarUsuario(usuario) {
    if (usuarioSeleccionado && usuarioSeleccionado.id === usuario.id) {
        // Deseleccionar
        usuarioSeleccionado = null;
    } else {
        usuarioSeleccionado = usuario;
    }

    actualizarUsuarioSeleccionado();
    renderTablaUsuarios();
}

function actualizarUsuarioSeleccionado() {
    const nombreEl = document.getElementById("selected-nombre");
    const emailEl = document.getElementById("selected-email");
    const rolEl = document.getElementById("selected-rol");
    const btnGenerar = document.getElementById("btn-generar");

    if (usuarioSeleccionado) {
        nombreEl.textContent = usuarioSeleccionado.name || "-";
        emailEl.textContent = usuarioSeleccionado.email || "-";
        rolEl.textContent = usuarioSeleccionado.role || "-";
        btnGenerar.disabled = false;
    } else {
        nombreEl.textContent = "-";
        emailEl.textContent = "-";
        rolEl.textContent = "-";
        btnGenerar.disabled = true;
    }
}

/* ========== PAGINACIÓN ========== */

function renderPaginacion(total) {
    const container = document.getElementById("pagination-usuarios");
    const totalPages = Math.ceil(total / paginacion.limit) || 1;

    container.innerHTML = "";

    // Botón primera página
    const btnFirst = document.createElement("button");
    btnFirst.innerHTML = "«";
    btnFirst.disabled = paginacion.page === 1;
    btnFirst.onclick = () => irAPagina(1);
    container.appendChild(btnFirst);

    // Botón anterior
    const btnPrev = document.createElement("button");
    btnPrev.innerHTML = "<";
    btnPrev.disabled = paginacion.page === 1;
    btnPrev.onclick = () => irAPagina(paginacion.page - 1);
    container.appendChild(btnPrev);

    // Números de página
    const maxVisible = 5;
    let startPage = Math.max(1, paginacion.page - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement("button");
        btn.textContent = i;
        btn.className = i === paginacion.page ? "active" : "";
        btn.onclick = () => irAPagina(i);
        container.appendChild(btn);
    }

    // Botón siguiente
    const btnNext = document.createElement("button");
    btnNext.innerHTML = ">";
    btnNext.disabled = paginacion.page === totalPages;
    btnNext.onclick = () => irAPagina(paginacion.page + 1);
    container.appendChild(btnNext);

    // Botón última página
    const btnLast = document.createElement("button");
    btnLast.innerHTML = "»";
    btnLast.disabled = paginacion.page === totalPages;
    btnLast.onclick = () => irAPagina(totalPages);
    container.appendChild(btnLast);
}

function irAPagina(page) {
    paginacion.page = page;
    renderTablaUsuarios();
}

/* ========== ORDENAMIENTO ========== */

function setupOrdenamiento() {
    document.querySelectorAll(".rep-table th.sortable").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.dataset.col;

            if (ordenamiento.col === col) {
                ordenamiento.dir = ordenamiento.dir === "asc" ? "desc" : "asc";
            } else {
                ordenamiento.col = col;
                ordenamiento.dir = "asc";
            }

            // Actualizar clases visuales
            document.querySelectorAll(".rep-table th.sortable").forEach(t => {
                t.classList.remove("asc", "desc");
            });
            th.classList.add(ordenamiento.dir);

            // Re-renderizar
            paginacion.page = 1;
            renderTablaUsuarios();
        });
    });
}

/* ========== BÚSQUEDA ========== */

function setupBusqueda() {
    document.getElementById("search-usuarios").addEventListener("input", (e) => {
        busqueda = e.target.value;
        paginacion.page = 1;
        renderTablaUsuarios();
    });

    document.getElementById("limit-usuarios").addEventListener("change", (e) => {
        paginacion.limit = parseInt(e.target.value);
        paginacion.page = 1;
        renderTablaUsuarios();
    });
}

/* ========== GENERAR REPORTE ========== */

function setupGenerarReporte() {
    document.getElementById("btn-generar").addEventListener("click", generarReporte);
}

async function generarReporte() {
    if (!usuarioSeleccionado) {
        alert("Debe seleccionar un usuario.");
        return;
    }

    const fechaDesde = document.getElementById("fecha-desde").value;
    const fechaHasta = document.getElementById("fecha-hasta").value;

    if (!fechaDesde || !fechaHasta) {
        alert("Debe seleccionar las fechas Desde y Hasta.");
        return;
    }

    if (fechaDesde > fechaHasta) {
        alert("La fecha Desde no puede ser mayor que la fecha Hasta.");
        return;
    }

    try {
        // Llamar al backend para generar el reporte PDF
        const params = new URLSearchParams({
            user_id: usuarioSeleccionado.id,
            desde: fechaDesde,
            hasta: fechaHasta
        });

        const res = await fetch(API_BASE + "/api/reportes/generar?" + params.toString(), {
            headers: getHeaders()
        });

        if (!res.ok) {
            const data = await res.json();
            alert(data.error || "Error al generar el reporte.");
            return;
        }

        // Descargar el PDF
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `reporte_${usuarioSeleccionado.name.replace(/\s+/g, "_")}_${fechaDesde}_${fechaHasta}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

    } catch (err) {
        console.error("Error generando reporte:", err);
        alert("Error de red al generar el reporte.");
    }
}

/* ========== INIT ========== */

(async function init() {
    await loadUser();
    setupOrdenamiento();
    setupBusqueda();
    setupGenerarReporte();
    await cargarUsuarios();
})();
