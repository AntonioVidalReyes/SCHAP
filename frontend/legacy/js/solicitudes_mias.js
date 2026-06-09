let authToken = localStorage.getItem("authToken");
let currentUser = null;

// Datos
let solicitudesPendientes = [];
let solicitudesHistorial = [];

// Paginación
let paginacion = {
    pendientes: { page: 1, limit: 10, total: 0 },
    historial: { page: 1, limit: 10, total: 0 }
};

// Ordenamiento
let ordenamiento = {
    pendientes: { col: "created_at", dir: "desc" },
    historial: { col: "created_at", dir: "desc" }
};

// Búsqueda
let busqueda = {
    pendientes: "",
    historial: ""
};

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
    setupHeaderNav("solicitudes");

    document.getElementById("footer-user").textContent =
        "Usuario: " + currentUser.name + " (" + currentUser.role + ")";
}

/* ========== CARGAR SOLICITUDES ========== */

async function cargarSolicitudes() {
    try {
        // Cargar requests (permisos y notificaciones)
        const resReq = await fetch(API_BASE + "/api/requests?mine=1", {
            headers: getHeaders()
        });
        const dataReq = await resReq.json();
        const requests = dataReq.requests || [];

        // Cargar rendiciones
        let rendiciones = [];
        try {
            const resRend = await fetch(API_BASE + "/api/rendiciones", {
                headers: getHeaders()
            });
            if (resRend.ok) {
                const dataRend = await resRend.json();
                rendiciones = dataRend.rendiciones || [];
            }
        } catch (err) {
            console.warn("No se pudieron cargar rendiciones:", err);
        }

        // Combinar y normalizar
        const todas = [
            ...requests.map(r => ({
                id: r.id,
                created_at: r.created_at,
                type: r.type || "Permiso",
                cliente: "-",
                trabajo: "-",
                status: r.status,
                raw: r
            })),
            ...rendiciones.map(r => ({
                id: r.id,
                created_at: r.created_at,
                type: "Rendición",
                cliente: r.cliente || "-",
                trabajo: r.trabajo || "-",
                status: r.status,
                raw: r
            }))
        ];

        // Separar pendientes e historial
        // Los Abonos siempre van al historial (nunca están pendientes)
        solicitudesPendientes = todas.filter(s =>
            s.type !== "Abono" && (
                s.status === "pendiente" ||
                s.status === "pendiente_jefe" ||
                s.status === "pendiente_admin"
            )
        );

        solicitudesHistorial = todas.filter(s =>
            s.type === "Abono" || (
                s.status !== "pendiente" &&
                s.status !== "pendiente_jefe" &&
                s.status !== "pendiente_admin"
            )
        );

        // Actualizar totales
        paginacion.pendientes.total = solicitudesPendientes.length;
        paginacion.historial.total = solicitudesHistorial.length;

        // Renderizar
        renderTabla("pendientes");
        renderTabla("historial");

    } catch (err) {
        console.error("Error cargando solicitudes:", err);
    }
}

/* ========== RENDERIZAR TABLA ========== */

function renderTabla(seccion) {
    const tbody = document.getElementById(`tbody-${seccion}`);
    const datos = seccion === "pendientes" ? solicitudesPendientes : solicitudesHistorial;
    const pag = paginacion[seccion];
    const orden = ordenamiento[seccion];
    const search = busqueda[seccion].toLowerCase();

    // Filtrar por búsqueda
    let filtrados = datos.filter(s => {
        if (!search) return true;
        return (
            String(s.id).includes(search) ||
            (s.type || "").toLowerCase().includes(search) ||
            (s.cliente || "").toLowerCase().includes(search) ||
            (s.trabajo || "").toLowerCase().includes(search) ||
            (s.status || "").toLowerCase().includes(search) ||
            formatFecha(s.created_at).toLowerCase().includes(search)
        );
    });

    // Ordenar
    filtrados.sort((a, b) => {
        let valA = a[orden.col];
        let valB = b[orden.col];

        if (orden.col === "id") {
            valA = parseInt(valA) || 0;
            valB = parseInt(valB) || 0;
        } else if (orden.col === "created_at") {
            valA = new Date(valA || 0).getTime();
            valB = new Date(valB || 0).getTime();
        } else {
            valA = String(valA || "").toLowerCase();
            valB = String(valB || "").toLowerCase();
        }

        if (orden.dir === "asc") {
            return valA > valB ? 1 : valA < valB ? -1 : 0;
        } else {
            return valA < valB ? 1 : valA > valB ? -1 : 0;
        }
    });

    // Actualizar total filtrado
    const totalFiltrado = filtrados.length;

    // Paginar
    const inicio = (pag.page - 1) * pag.limit;
    const fin = inicio + pag.limit;
    const paginados = filtrados.slice(inicio, fin);

    // Renderizar filas
    tbody.innerHTML = "";

    if (paginados.length === 0) {
        const tr = document.createElement("tr");
        tr.className = "no-results";
        tr.innerHTML = `<td colspan="7">No se encontraron resultados.</td>`;
        tbody.appendChild(tr);
    } else {
        paginados.forEach(s => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${s.id}</td>
                <td>${formatFecha(s.created_at)}</td>
                <td><span class="tipo-badge tipo-${s.type.toLowerCase()}">${s.type}</span></td>
                <td>${s.cliente}</td>
                <td>${s.trabajo}</td>
                <td><span class="estado-badge estado-${s.status.toLowerCase().replace('_', '-')}">${formatEstado(s.status)}</span></td>
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
    const infoEl = document.getElementById(`info-${seccion}`);
    if (totalFiltrado === 0) {
        infoEl.textContent = "Mostrando 0 al 0 de 0 resultados";
    } else {
        const desde = inicio + 1;
        const hasta = Math.min(fin, totalFiltrado);
        infoEl.textContent = `Mostrando ${desde} al ${hasta} de ${totalFiltrado} resultados`;
    }

    // Renderizar paginación
    renderPaginacion(seccion, totalFiltrado);
}

/* ========== PAGINACIÓN ========== */

function renderPaginacion(seccion, total) {
    const container = document.getElementById(`pagination-${seccion}`);
    const pag = paginacion[seccion];
    const totalPages = Math.ceil(total / pag.limit) || 1;

    container.innerHTML = "";

    // Botón primera página
    const btnFirst = document.createElement("button");
    btnFirst.innerHTML = "«";
    btnFirst.disabled = pag.page === 1;
    btnFirst.onclick = () => irAPagina(seccion, 1);
    container.appendChild(btnFirst);

    // Botón anterior
    const btnPrev = document.createElement("button");
    btnPrev.innerHTML = "<";
    btnPrev.disabled = pag.page === 1;
    btnPrev.onclick = () => irAPagina(seccion, pag.page - 1);
    container.appendChild(btnPrev);

    // Números de página
    const maxVisible = 5;
    let startPage = Math.max(1, pag.page - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement("button");
        btn.textContent = i;
        btn.className = i === pag.page ? "active" : "";
        btn.onclick = () => irAPagina(seccion, i);
        container.appendChild(btn);
    }

    // Botón siguiente
    const btnNext = document.createElement("button");
    btnNext.innerHTML = ">";
    btnNext.disabled = pag.page === totalPages;
    btnNext.onclick = () => irAPagina(seccion, pag.page + 1);
    container.appendChild(btnNext);

    // Botón última página
    const btnLast = document.createElement("button");
    btnLast.innerHTML = "»";
    btnLast.disabled = pag.page === totalPages;
    btnLast.onclick = () => irAPagina(seccion, totalPages);
    container.appendChild(btnLast);
}

function irAPagina(seccion, page) {
    paginacion[seccion].page = page;
    renderTabla(seccion);
}

/* ========== ORDENAMIENTO ========== */

function setupOrdenamiento() {
    document.querySelectorAll(".sol-table th.sortable").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.dataset.col;
            const tabla = th.closest(".sol-section");
            const seccion = tabla.querySelector("tbody").id.replace("tbody-", "");

            const orden = ordenamiento[seccion];

            if (orden.col === col) {
                orden.dir = orden.dir === "asc" ? "desc" : "asc";
            } else {
                orden.col = col;
                orden.dir = "asc";
            }

            // Actualizar clases visuales
            tabla.querySelectorAll("th.sortable").forEach(t => {
                t.classList.remove("asc", "desc");
            });
            th.classList.add(orden.dir);

            // Re-renderizar
            paginacion[seccion].page = 1;
            renderTabla(seccion);
        });
    });
}

/* ========== BÚSQUEDA ========== */

function setupBusqueda() {
    // Pendientes
    document.getElementById("search-pendientes").addEventListener("input", (e) => {
        busqueda.pendientes = e.target.value;
        paginacion.pendientes.page = 1;
        renderTabla("pendientes");
    });

    // Historial
    document.getElementById("search-historial").addEventListener("input", (e) => {
        busqueda.historial = e.target.value;
        paginacion.historial.page = 1;
        renderTabla("historial");
    });
}

/* ========== LÍMITE POR PÁGINA ========== */

function setupLimites() {
    // Pendientes
    document.getElementById("limit-pendientes").addEventListener("change", (e) => {
        paginacion.pendientes.limit = parseInt(e.target.value);
        paginacion.pendientes.page = 1;
        renderTabla("pendientes");
    });

    // Historial
    document.getElementById("limit-historial").addEventListener("change", (e) => {
        paginacion.historial.limit = parseInt(e.target.value);
        paginacion.historial.page = 1;
        renderTabla("historial");
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
        pendiente_jefe: "Pendiente Jefe",
        pendiente_admin: "Pendiente Admin",
        aprobado: "Aprobada",
        aprobado_jefe: "Aprobada Jefe",
        aprobado_admin: "Aprobada",
        rechazado: "Rechazada",
        rechazado_jefe: "Rechazada Jefe",
        rechazado_admin: "Rechazada",
        rechazada: "Rechazada",
        informativa: "Aprobada"
    };
    return map[status] || status;
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
    setupBusqueda();
    setupLimites();
    await cargarSolicitudes();
})();
