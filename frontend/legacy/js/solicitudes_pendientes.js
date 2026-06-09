// js/solicitudes_pendientes.js
// Página para que Jefe y Administrador vean solicitudes pendientes de aprobación

let authToken = localStorage.getItem("authToken");
let currentUser = null;

// Datos
let solicitudesPendientes = [];

// Paginación
let paginacion = { page: 1, limit: 10, total: 0 };

// Ordenamiento
let ordenamiento = { col: "created_at", dir: "desc" };

// Búsqueda y filtros
let busqueda = "";
let filtroTipo = "";

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

    // Solo jefe y administrador pueden ver esta página
    if (currentUser.role !== "jefe" && currentUser.role !== "administrador") {
        alert("No tienes permisos para acceder a esta página.");
        window.location.href = "panel.html";
        return;
    }

    buildHeader();
    applyRoleUI(currentUser);
    setupHeaderNav("solicitudes");

    document.getElementById("footer-user").textContent =
        "Usuario: " + currentUser.name + " (" + currentUser.role + ")";
}

/* ========== CARGAR SOLICITUDES PENDIENTES ========== */

async function cargarSolicitudesPendientes() {
    try {
        // Cargar requests (permisos y notificaciones) pendientes
        // El backend filtra según el rol del usuario
        const resReq = await fetch(API_BASE + "/api/requests?pending=1", {
            headers: getHeaders()
        });
        const dataReq = await resReq.json();
        const requests = dataReq.requests || [];

        // Cargar rendiciones pendientes
        let rendiciones = [];
        try {
            const resRend = await fetch(API_BASE + "/api/rendiciones?pending=1", {
                headers: getHeaders()
            });
            if (resRend.ok) {
                const dataRend = await resRend.json();
                rendiciones = dataRend.rendiciones || [];
            }
        } catch (err) {
            console.warn("No se pudieron cargar rendiciones:", err);
        }

        // Filtrar solo pendientes de requests
        const requestsPendientes = requests.filter(r =>
            r.status === "pendiente" ||
            r.status === "pendiente_jefe" ||
            r.status === "pendiente_admin"
        );

        // Filtrar solo pendientes de rendiciones
        const rendicionesPendientes = rendiciones.filter(r =>
            r.status === "pendiente" ||
            r.status === "pendiente_jefe" ||
            r.status === "pendiente_admin"
        );

        // Combinar y normalizar
        solicitudesPendientes = [
            ...requestsPendientes.map(r => ({
                id: r.id,
                created_at: r.created_at,
                type: r.type || "Permiso",
                cliente: "-",
                proyecto: "-",
                status: r.status,
                user_name: r.user_name || "-",
                user_id: r.user_id,
                raw: r
            })),
            ...rendicionesPendientes.map(r => ({
                id: r.id,
                created_at: r.created_at,
                type: "Rendición",
                cliente: r.cliente || "-",
                proyecto: r.proyecto || "-",
                status: r.status,
                user_name: r.user_name || "-",
                user_id: r.user_id,
                raw: r
            }))
        ];

        // Actualizar total
        paginacion.total = solicitudesPendientes.length;

        // Renderizar
        renderTabla();

    } catch (err) {
        console.error("Error cargando solicitudes:", err);
    }
}

/* ========== RENDERIZAR TABLA ========== */

function renderTabla() {
    const tbody = document.getElementById("tbody-pendientes");
    const search = busqueda.toLowerCase();

    // Filtrar por búsqueda
    let filtrados = solicitudesPendientes.filter(s => {
        if (!search) return true;
        return (
            String(s.id).includes(search) ||
            (s.type || "").toLowerCase().includes(search) ||
            (s.cliente || "").toLowerCase().includes(search) ||
            (s.proyecto || "").toLowerCase().includes(search) ||
            (s.status || "").toLowerCase().includes(search) ||
            (s.user_name || "").toLowerCase().includes(search) ||
            formatFecha(s.created_at).toLowerCase().includes(search)
        );
    });

    // Filtrar por tipo
    if (filtroTipo) {
        filtrados = filtrados.filter(s => s.type === filtroTipo);
    }

    // Ordenar
    filtrados.sort((a, b) => {
        let valA = a[ordenamiento.col];
        let valB = b[ordenamiento.col];

        if (ordenamiento.col === "id") {
            valA = parseInt(valA) || 0;
            valB = parseInt(valB) || 0;
        } else if (ordenamiento.col === "created_at") {
            valA = new Date(valA || 0).getTime();
            valB = new Date(valB || 0).getTime();
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
        tr.innerHTML = `<td colspan="8">No se encontraron resultados.</td>`;
        tbody.appendChild(tr);
    } else {
        paginados.forEach(s => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${s.id}</td>
                <td>${formatFecha(s.created_at)}</td>
                <td><span class="tipo-badge tipo-${normalizarTipo(s.type)}">${s.type}</span></td>
                <td>${s.cliente}</td>
                <td>${s.proyecto}</td>
                <td><span class="estado-badge estado-${s.status.toLowerCase().replace('_', '-')}">${formatEstado(s.status)}</span></td>
                <td>${s.user_name}</td>
                <td>
                    <button class="btn-ver" onclick="verDetalle('${s.type}', ${s.id})" title="Ver detalle">
                        <i class="fa fa-eye"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Actualizar info
    const infoEl = document.getElementById("info-pendientes");
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

/* ========== PAGINACIÓN ========== */

function renderPaginacion(total) {
    const container = document.getElementById("pagination-pendientes");
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
    renderTabla();
}

/* ========== ORDENAMIENTO ========== */

function setupOrdenamiento() {
    document.querySelectorAll(".pend-table th.sortable").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.dataset.col;

            if (ordenamiento.col === col) {
                ordenamiento.dir = ordenamiento.dir === "asc" ? "desc" : "asc";
            } else {
                ordenamiento.col = col;
                ordenamiento.dir = "asc";
            }

            // Actualizar clases visuales
            document.querySelectorAll(".pend-table th.sortable").forEach(t => {
                t.classList.remove("asc", "desc");
            });
            th.classList.add(ordenamiento.dir);

            // Re-renderizar
            paginacion.page = 1;
            renderTabla();
        });
    });
}

/* ========== BÚSQUEDA Y FILTROS ========== */

function setupBusquedaYFiltros() {
    // Búsqueda
    document.getElementById("search-pendientes").addEventListener("input", (e) => {
        busqueda = e.target.value;
        paginacion.page = 1;
        renderTabla();
    });

    // Filtro por tipo
    document.getElementById("filter-tipo").addEventListener("change", (e) => {
        filtroTipo = e.target.value;
        paginacion.page = 1;
        renderTabla();
    });

    // Límite por página
    document.getElementById("limit-pendientes").addEventListener("change", (e) => {
        paginacion.limit = parseInt(e.target.value);
        paginacion.page = 1;
        renderTabla();
    });
}

/* ========== UTILIDADES ========== */

function formatFecha(dateStr) {
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

function formatEstado(status) {
    const map = {
        pendiente: "Pendiente",
        pendiente_jefe: "Pendiente",
        pendiente_admin: "Pendiente",
        aprobado: "Aprobada",
        aprobado_jefe: "Aprobada Jefe",
        aprobado_admin: "Aprobada",
        rechazado: "Rechazada",
        rechazado_jefe: "Rechazada",
        rechazado_admin: "Rechazada",
        rechazada: "Rechazada",
        informativa: "Informativa"
    };
    return map[status] || status;
}

function normalizarTipo(tipo) {
    if (!tipo) return "permiso";
    return tipo.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // Eliminar tildes
}

function verDetalle(tipo, id) {
    if (tipo === "Rendición") {
        window.location.href = `detalle_rendicion.html?id=${id}`;
    } else if (tipo === "Abono") {
        window.location.href = `detalle_abono.html?id=${id}`;
    } else {
        window.location.href = `detalle_solicitud.html?id=${id}`;
    }
}

/* ========== INIT ========== */

(async function init() {
    await loadUser();
    setupOrdenamiento();
    setupBusquedaYFiltros();
    await cargarSolicitudesPendientes();
})();
