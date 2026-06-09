
let authToken = localStorage.getItem("authToken");
let currentUser = null;

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
  setupHeaderNav("solicitudes");

  document.getElementById("footer-user").textContent =
    "Usuario: " + currentUser.name + " (" + currentUser.role + ")";

  // Aplicar visibilidad de cards según el rol
  applyCardVisibility();
}

function applyCardVisibility() {
  const cardPendientes = document.getElementById("card-pendientes");
  const cardRevisadas = document.getElementById("card-revisadas");

  // Los trabajadores no pueden ver solicitudes pendientes ni revisadas de otros
  if (currentUser.role === "trabajador") {
    if (cardPendientes) {
      cardPendientes.style.display = "none";
    }
    if (cardRevisadas) {
      cardRevisadas.style.display = "none";
    }
  } else {
    // Jefes y administradores pueden ver todo
    if (cardPendientes) {
      cardPendientes.style.display = "";
    }
    if (cardRevisadas) {
      cardRevisadas.style.display = "";
    }
  }
}

function setupCards() {
  const cardMias = document.getElementById("card-mias");
  const cardPendientes = document.getElementById("card-pendientes");
  const cardRevisadas = document.getElementById("card-revisadas");

  if (cardMias) {
    cardMias.onclick = () => {
      window.location.href = "solicitudes_mias.html";
    };
  }

  if (cardPendientes) {
    cardPendientes.onclick = () => {
      window.location.href = "solicitudes_pendientes.html";
    };
  }

  if (cardRevisadas) {
    cardRevisadas.onclick = () => {
      window.location.href = "solicitudes_revisadas.html";
    };
  }
}

(async function init() {
  await loadUser();
  setupCards();
})();
