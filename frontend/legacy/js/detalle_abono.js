// ========== DETALLE ABONO - JAVASCRIPT ==========

let authToken = localStorage.getItem("authToken");
let currentUser = null;
let abonoData = null;

function getHeaders() {
    return { "Authorization": "Bearer " + authToken };
}

// ========== CARGAR USUARIO ==========

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

// ========== CARGAR DETALLE DEL ABONO ==========

async function loadAbonoDetail() {
    const params = new URLSearchParams(window.location.search);
    const abonoId = params.get("id");

    if (!abonoId) {
        alert("No se especificó el ID del abono.");
        goBack();
        return;
    }

    try {
        // Cargar datos del request (abono)
        const res = await fetch(API_BASE + "/api/requests?mine=0", { headers: getHeaders() });
        const data = await res.json();
        const requests = data.requests || [];

        // Buscar el abono específico
        abonoData = requests.find(r => r.id === parseInt(abonoId) && r.type === "Abono");

        if (!abonoData) {
            alert("Abono no encontrado.");
            goBack();
            return;
        }

        // Renderizar datos
        renderAbonoDetail();

        // Cargar datos del usuario para el saldo
        await loadUserData(abonoData.user_id);

    } catch (err) {
        console.error("Error cargando abono:", err);
        alert("Error al cargar el detalle del abono.");
        goBack();
    }
}

// ========== CARGAR DATOS DEL USUARIO ==========

async function loadUserData(userId) {
    try {
        const res = await fetch(API_BASE + "/api/users/" + userId, { headers: getHeaders() });
        const data = await res.json();

        if (res.ok && data.user) {
            const user = data.user;
            const saldo = (user.bonus_hours || 0) - (user.used_hours || 0);
            document.getElementById("user-saldo").textContent = saldo.toFixed(1) + " horas disponibles";
        }
    } catch (err) {
        console.error("Error cargando datos del usuario:", err);
    }
}

// ========== RENDERIZAR DETALLE ==========

function renderAbonoDetail() {
    // Encabezado
    document.getElementById("abono-id").textContent = abonoData.id;
    document.getElementById("abono-user").textContent = abonoData.user_name || "Usuario";

    // Información del abono
    document.getElementById("abono-fecha").textContent = formatDateShort(abonoData.date || abonoData.created_at);
    document.getElementById("abono-horas").textContent = (abonoData.hours || 0).toFixed(1);
    document.getElementById("abono-comentario").textContent = abonoData.comment || "-";

    // Progreso
    document.getElementById("abono-creado").textContent = formatDateTime(abonoData.created_at);
    document.getElementById("abono-creador").textContent = abonoData.user_name || "Usuario";

    // Usuario
    document.getElementById("user-nombre").textContent = abonoData.user_name || "-";
    document.getElementById("user-email").textContent = abonoData.user_email || "-";
}

// ========== HELPERS ==========

function formatDateShort(dateStr) {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    if (isNaN(date)) return dateStr;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatDateTime(dateStr) {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    if (isNaN(date)) return dateStr;

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const ampm = hours >= 12 ? "p. m." : "a. m.";
    const hours12 = hours % 12 || 12;

    return `${day}-${month}-${year}, ${hours12}:${minutes}:${seconds} ${ampm}`;
}

function goBack() {
    // Intentar volver a la página anterior o a mis solicitudes
    if (document.referrer && document.referrer.includes(window.location.origin)) {
        window.history.back();
    } else {
        window.location.href = "solicitudes_mias.html";
    }
}

// ========== INIT ==========

(async function init() {
    await loadUser();
    await loadAbonoDetail();
})();
