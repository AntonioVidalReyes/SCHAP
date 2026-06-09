// js/historial_abonos.js
// Página para ver el historial de abonos de horas

let authToken = localStorage.getItem("authToken");
let currentUser = null;

// Datos
let todosLosAbonos = [];
let usuariosMap = {};

// Paginación
let paginacion = { page: 1, limit: 10, total: 0 };

// Ordenamiento
let ordenamiento = { col: "created_at", dir: "desc" };

// Búsqueda y filtros
let busqueda = "";
let filtroRol = "";

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
    setupHeaderNav("admin");

    document.getElementById("footer-user").textContent =
        "Usuario: " + currentUser.name + " (" + currentUser.role + ")";
}

/* ========== CARGAR USUARIOS ========== */

async function cargarUsuarios() {
    try {
        const res = await fetch(API_BASE + "/api/users", { headers: getHeaders() });
        const data = await res.json();

        usuariosMap = {};
        (data.users || []).forEach(u => {
            usuariosMap[u.id] = u;
        });
    } catch (err) {
        console.error("Error cargando usuarios:", err);
    }
}

/* ========== CARGAR ABONOS ========== */

async function cargarAbonos() {
    try {
        // Primero cargar usuarios
        await cargarUsuarios();

        // Obtener todas las solicitudes tipo "Abono"
        const res = await fetch(API_BASE + "/api/requests?mine=0", {
            headers: getHeaders()
        });
        const data = await res.json();

        // Filtrar solo los abonos
        const abonos = (data.requests || []).filter(r => r.type === "Abono");

        // Mapear con datos de usuario
        todosLosAbonos = abonos.map(abono => {
            const user = usuariosMap[abono.user_id] || {};
            const horasAbono = parseFloat(abono.hours) || 0;
            const horasTotales = parseFloat(user.bonus_hours) || 0;
            const horasAntes = horasTotales - horasAbono;

            return {
                id: abono.id,
                created_at: abono.created_at || abono.date,
                user_id: abono.user_id,
                name: user.name || abono.user_name || "-",
                email: user.email || abono.user_email || "-",
                role: user.role || "-",
                horas_antes: horasAntes,
                horas_abono: horasAbono,
                horas_total: horasTotales,
                motivo: abono.comment || "-"
            };
        });

        // Actualizar total
        paginacion.total = todosLosAbonos.length;

        // Renderizar
        renderTabla();

    } catch (err) {
        console.error("Error cargando abonos:", err);
    }
}

/* ========== RENDERIZAR TABLA ========== */

function renderTabla() {
    const tbody = document.getElementById("tbody-abonos");
    const search = busqueda.toLowerCase();

    // Filtrar por búsqueda
    let filtrados = todosLosAbonos.filter(s => {
        if (!search) return true;
        return (
            (s.name || "").toLowerCase().includes(search) ||
            (s.email || "").toLowerCase().includes(search) ||
            (s.role || "").toLowerCase().includes(search) ||
            (s.motivo || "").toLowerCase().includes(search) ||
            formatFecha(s.created_at).toLowerCase().includes(search)
        );
    });

    // Filtrar por rol
    if (filtroRol) {
        filtrados = filtrados.filter(s => s.role === filtroRol);
    }

    // Ordenar
    filtrados.sort((a, b) => {
        let valA = a[ordenamiento.col];
        let valB = b[ordenamiento.col];

        if (["horas_antes", "horas_abono", "horas_total"].includes(ordenamiento.col)) {
            valA = parseFloat(valA) || 0;
            valB = parseFloat(valB) || 0;
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
        tr.innerHTML = `<td colspan="8">No se encontraron abonos registrados.</td>`;
        tbody.appendChild(tr);
    } else {
        paginados.forEach(s => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${formatFecha(s.created_at)}</td>
                <td>${escapeHtml(s.name)}</td>
                <td>${escapeHtml(s.email)}</td>
                <td><span class="rol-badge rol-${s.role}">${capitalizar(s.role)}</span></td>
                <td class="horas-cell horas-antes">${s.horas_antes.toFixed(1)}</td>
                <td class="horas-cell horas-abono">+${s.horas_abono.toFixed(1)}</td>
                <td class="horas-cell horas-total">${s.horas_total.toFixed(1)}</td>
                <td class="motivo-cell" title="${escapeHtml(s.motivo)}">${escapeHtml(s.motivo)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Actualizar info
    const infoEl = document.getElementById("info-abonos");
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
    const container = document.getElementById("pagination-abonos");
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
    document.querySelectorAll(".abonos-table th.sortable").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.dataset.col;

            if (ordenamiento.col === col) {
                ordenamiento.dir = ordenamiento.dir === "asc" ? "desc" : "asc";
            } else {
                ordenamiento.col = col;
                ordenamiento.dir = "asc";
            }

            // Actualizar clases visuales
            document.querySelectorAll(".abonos-table th.sortable").forEach(t => {
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
    document.getElementById("search-abonos").addEventListener("input", (e) => {
        busqueda = e.target.value;
        paginacion.page = 1;
        renderTabla();
    });

    // Filtro por rol
    document.getElementById("filter-rol").addEventListener("change", (e) => {
        filtroRol = e.target.value;
        paginacion.page = 1;
        renderTabla();
    });

    // Límite por página
    document.getElementById("limit-abonos").addEventListener("change", (e) => {
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

function escapeHtml(str) {
    if (!str || str === "-") return "-";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function capitalizar(str) {
    if (!str || str === "-") return "-";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ========== INIT ========== */

(async function init() {
    await loadUser();
    setupOrdenamiento();
    setupBusquedaYFiltros();
    await cargarAbonos();
})();
