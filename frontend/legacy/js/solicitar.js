
let authToken = localStorage.getItem("authToken");

function getHeaders() {
    return { "Authorization": "Bearer " + authToken };
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
    setupHeaderNav("solicitar");

    document.getElementById("footer-user").textContent =
        "Usuario: " + currentUser.name + " (" + currentUser.role + ")";
}

function setupCards() {
    document.getElementById("card-permiso").onclick = () => {
        window.location.href = "permiso.html";
    };

    document.getElementById("card-rendicion").onclick = () => {
        window.location.href = "rendicion.html";
    };

    document.getElementById("card-notificacion").onclick = () => {
        window.location.href = "notificacion.html";
    };
}

(async function init() {
    await loadUser();
    setupCards();
})();
