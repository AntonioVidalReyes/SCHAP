// CONFIG BÁSICA

let authToken = localStorage.getItem("authToken");
let currentUser = null;
let editingUserId = null;
let usersCache = [];
let formMode = "new"; // "new", "edit", "abonar"

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

// ==================== HELPERS JEFE ====================

function getBossNameFromCache(bossId) {
  if (!bossId) return "-";
  const boss = usersCache.find(u => u.id === bossId);
  return boss ? boss.name : `ID ${bossId}`;
}

function fillBossSelect(selectedBossId = null) {
  const sel = document.getElementById("user-boss");
  if (!sel) return;

  sel.innerHTML = "";

  const optNone = document.createElement("option");
  optNone.value = "";
  optNone.textContent = "Sin jefe asignado";
  sel.appendChild(optNone);

  let posiblesJefes = [];
  if (Array.isArray(usersCache) && usersCache.length > 0) {
    posiblesJefes = usersCache.filter(
      u => u.role === "administrador" || u.role === "jefe"
    );
  }

  if (posiblesJefes.length === 0) {
    sel.value = "";
    return;
  }

  posiblesJefes.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = `${u.name} (${u.role})`;
    sel.appendChild(opt);
  });

  let defaultId = selectedBossId;

  if (!defaultId) {
    const admin = posiblesJefes.find(u => u.role === "administrador");
    if (admin) defaultId = admin.id;
  }

  if (defaultId) {
    sel.value = String(defaultId);
  } else {
    sel.value = "";
  }
}

function applyBossFieldPermissions() {
  const sel = document.getElementById("user-boss");
  if (!sel) return;

  if (!currentUser) {
    sel.disabled = true;
    return;
  }

  sel.disabled = currentUser.role !== "administrador";
}

// ==================== VALIDACIÓN ÚLTIMO ADMINISTRADOR ====================

function isLastActiveAdmin(userId) {
  // Contar administradores activos
  const activeAdmins = usersCache.filter(
    u => u.role === "administrador" && u.active
  );

  // Si hay más de un admin activo, no es el último
  if (activeAdmins.length > 1) return false;

  // Si hay exactamente uno y es el usuario en cuestión, es el último
  if (activeAdmins.length === 1 && activeAdmins[0].id === userId) return true;

  return false;
}

function getUserFromCache(userId) {
  return usersCache.find(u => u.id === userId) || null;
}

// ==================== LISTA DE USUARIOS ====================

async function loadUsers_list() {
  const res = await fetch(API_BASE + "/api/users", { headers: getHeaders() });
  const data = await res.json();
  const body = document.getElementById("users-body");
  body.innerHTML = "";

  usersCache = data.users || [];

  data.users.forEach(u => {
    const tr = document.createElement("tr");
    const activoTxt = u.active ? "Sí" : "No";
    const toggleLabel = u.active ? "Desactivar" : "Activar";

    const safeName = String(u.name).replace(/'/g, "\\'");
    const safeEmail = String(u.email).replace(/'/g, "\\'");
    const safeRole = String(u.role).replace(/'/g, "\\'");
    const bossIdValue = (u.boss_id !== null && u.boss_id !== undefined) ? u.boss_id : "null";

    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.name}</td>
      <td>${u.email}</td>
      <td>${u.role}</td>
      <td>${u.bonus_hours}</td>
      <td>${activoTxt}</td>
      <td class="users-table__actions-col">
        <div class="users-table__actions">
          <button type="button" class="btn btn-success btn-sm"
            onclick="abonarUser(${u.id}, '${safeName}', '${safeEmail}', ${u.bonus_hours})">
            Abonar
          </button>
          <button type="button" class="btn btn-secondary btn-sm"
            onclick="editUser(${u.id}, '${safeName}', '${safeEmail}', '${safeRole}', ${u.bonus_hours}, ${u.active}, ${bossIdValue})">
            Editar
          </button>
          <button type="button" class="btn btn-secondary btn-sm"
            onclick="toggleActive(${u.id}, ${u.active}, '${safeName}', '${safeEmail}')">
            ${toggleLabel}
          </button>
          <button type="button" class="btn btn-danger btn-sm"
            onclick="deleteUser(${u.id}, '${safeName}', '${safeEmail}')">
            Eliminar
          </button>
        </div>
      </td>
    `;
    body.appendChild(tr);
  });
}

// ==================== CAMBIAR MODO DEL FORMULARIO ====================

function setFormMode(mode) {
  // Actualizar variable global y input hidden
  formMode = mode;
  const formModeInput = document.getElementById("form-mode");
  if (formModeInput) formModeInput.value = mode;

  const userFields = document.getElementById("user-fields");
  const abonarFields = document.getElementById("abonar-fields");
  const formTitle = document.getElementById("user-form-title");
  const btnSubmit = document.getElementById("btn-submit");

  // Campos que tienen required
  const userName = document.getElementById("user-name");
  const userEmail = document.getElementById("user-email");

  if (mode === "abonar") {
    if (userFields) userFields.style.display = "none";
    if (abonarFields) abonarFields.style.display = "block";
    if (formTitle) formTitle.innerHTML = '<i class="fa fa-plus-circle text-success"></i> Abonar Horas';
    if (btnSubmit) {
      btnSubmit.textContent = "Abonar";
      btnSubmit.className = "btn btn-success";
    }
    // Quitar required de campos ocultos
    if (userName) userName.removeAttribute("required");
    if (userEmail) userEmail.removeAttribute("required");
  } else {
    if (userFields) userFields.style.display = "block";
    if (abonarFields) abonarFields.style.display = "none";
    if (formTitle) formTitle.textContent = mode === "edit" ? "Editar usuario" : "Nuevo usuario";
    if (btnSubmit) {
      btnSubmit.textContent = "Guardar";
      btnSubmit.className = "btn btn-primary";
    }
    // Restaurar required en campos visibles
    if (userName) userName.setAttribute("required", "");
    if (userEmail) userEmail.setAttribute("required", "");
  }
}

// ==================== FORMULARIO DE USUARIO ====================

function clearUserForm() {
  editingUserId = null;
  setFormMode("new");

  document.getElementById("user-id").value = "";
  document.getElementById("user-name").value = "";
  document.getElementById("user-email").value = "";
  document.getElementById("user-role").value = "trabajador";
  document.getElementById("user-bonus").value = "0";

  fillBossSelect(null);
  applyBossFieldPermissions();

  const pwdField = document.getElementById("password-field");
  if (pwdField) pwdField.classList.add("visible");

  const pwdInput = document.getElementById("user-password");
  if (pwdInput) pwdInput.value = "";

  // Limpiar campos de abonar
  document.getElementById("abonar-name").value = "";
  document.getElementById("abonar-email").value = "";
  document.getElementById("abonar-current").value = "";
  document.getElementById("abonar-hours").value = "";
  document.getElementById("abonar-comment").value = "";
  const typeSelect = document.getElementById("abonar-type");
  if (typeSelect) typeSelect.value = "Abono";

  const msg = document.getElementById("user-form-msg");
  if (msg) {
    msg.textContent = "";
    msg.className = "msg";
  }
}

function editUser(id, name, email, role, bonus, active, bossId) {
  editingUserId = id;
  setFormMode("edit");

  document.getElementById("user-id").value = id;
  document.getElementById("user-name").value = name;
  document.getElementById("user-email").value = email;
  document.getElementById("user-role").value = role;
  document.getElementById("user-bonus").value = bonus;

  fillBossSelect(bossId || null);
  applyBossFieldPermissions();

  const pwdField = document.getElementById("password-field");
  if (pwdField) pwdField.classList.remove("visible");

  const msg = document.getElementById("user-form-msg");
  if (msg) {
    msg.textContent = "";
    msg.className = "msg";
  }
}

function abonarUser(id, name, email, currentBonus) {
  // Primero establecer el modo
  setFormMode("abonar");

  // Luego asignar el ID
  editingUserId = id;

  // Llenar campos
  const userIdInput = document.getElementById("user-id");
  if (userIdInput) userIdInput.value = id;

  const abonarName = document.getElementById("abonar-name");
  if (abonarName) abonarName.value = name;

  const abonarEmail = document.getElementById("abonar-email");
  if (abonarEmail) abonarEmail.value = email;

  const abonarCurrent = document.getElementById("abonar-current");
  if (abonarCurrent) abonarCurrent.value = currentBonus.toFixed(1);

  const abonarHours = document.getElementById("abonar-hours");
  if (abonarHours) abonarHours.value = "";

  const abonarComment = document.getElementById("abonar-comment");
  if (abonarComment) abonarComment.value = "";

  // Limpiar mensaje
  const msg = document.getElementById("user-form-msg");
  if (msg) {
    msg.textContent = "";
    msg.className = "msg";
  }

  console.log("Modo abonar activado para usuario ID:", id);
}

// ==================== GUARDAR (Usuario o Abono) ====================

async function handleFormSubmit() {
  // Usar el valor del input hidden para mayor seguridad
  const mode = document.getElementById("form-mode").value;

  if (mode === "abonar") {
    await saveAbonar();
  } else {
    await saveUser();
  }
}

async function saveUser() {
  const name = document.getElementById("user-name").value.trim();
  const email = document.getElementById("user-email").value.trim();
  const role = document.getElementById("user-role").value;
  const bonus = parseFloat(document.getElementById("user-bonus").value || "0");
  const pwdInput = document.getElementById("user-password");
  const bossSelect = document.getElementById("user-boss");
  const bossValue = bossSelect ? bossSelect.value : "";
  const msg = document.getElementById("user-form-msg");

  if (msg) {
    msg.textContent = "";
    msg.className = "msg";
  }

  if (!name || !email) {
    if (msg) {
      msg.textContent = "Nombre y email son obligatorios.";
      msg.className = "msg err";
    }
    return;
  }

  const payload = {
    name,
    email,
    role,
    bonus_hours: bonus,
    boss_id: bossValue ? parseInt(bossValue, 10) : null,
    send_email: true
  };

  let url, method;
  if (editingUserId === null) {
    url = API_BASE + "/api/users_create";
    method = "POST";

    const pwd = (pwdInput && pwdInput.value.trim()) || "";
    if (!pwd) {
      if (msg) {
        msg.textContent = "Debe ingresar una contraseña para el nuevo usuario.";
        msg.className = "msg err";
      }
      return;
    }

    payload.password = pwd;

  } else {
    url = API_BASE + "/api/users/" + editingUserId;
    method = "PATCH";
  }

  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...getHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      if (msg) {
        msg.textContent = data.error || "Error al guardar.";
        msg.className = "msg err";
      }
      return;
    }

    if (msg) {
      msg.textContent =
        editingUserId === null
          ? "Usuario creado correctamente."
          : "Cambios guardados.";
      msg.className = "msg ok";
    }

    await loadUsers_list();

    if (editingUserId === null && role === "administrador") {
      const isDefaultUser = localStorage.getItem("isDefaultUser");
      if (isDefaultUser === "true") {
        await completeSetup(email, payload.password);
      }
    }

  } catch (err) {
    console.error(err);
    if (msg) {
      msg.textContent = "Error de red: " + err.message;
      msg.className = "msg err";
    }
  }
}

async function saveAbonar() {
  const msg = document.getElementById("user-form-msg");
  if (msg) {
    msg.textContent = "";
    msg.className = "msg";
  }

  // Usar editingUserId o el valor del input hidden como respaldo
  const userId = editingUserId || parseInt(document.getElementById("user-id").value);

  console.log("saveAbonar - editingUserId:", editingUserId, "userId input:", document.getElementById("user-id").value);

  if (!userId) {
    if (msg) {
      msg.textContent = "No hay usuario seleccionado.";
      msg.className = "msg err";
    }
    return;
  }

  const typeSelect = document.getElementById("abonar-type");
  const tipoAjuste = typeSelect?.value || "Abono";

  const horasInput = document.getElementById("abonar-hours");
  const horasAbonar = parseFloat(horasInput?.value || 0);
  const comentarioInput = document.getElementById("abonar-comment");
  const comentario = comentarioInput?.value?.trim() || "";

  if (!horasAbonar || horasAbonar <= 0) {
    if (msg) {
      msg.textContent = "Debe ingresar una cantidad de horas válida (mayor a 0).";
      msg.className = "msg err";
    }
    return;
  }

  try {
    const res = await fetch(API_BASE + "/api/users/" + userId + "/abonar", {
      method: "POST",
      headers: {
        ...getHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        hours: horasAbonar,
        comment: comentario || (tipoAjuste === "Regalo" ? "Regalo de horas" : "Abono de horas"),
        type: tipoAjuste
      })
    });

    const data = await res.json();

    if (!res.ok) {
      if (msg) {
        msg.textContent = data.error || "Error al abonar horas.";
        msg.className = "msg err";
      }
      return;
    }

    if (msg) {
      const txt = tipoAjuste === "Regalo" ? `Se registró el regalo de ${horasAbonar} horas.` : `Se abonaron ${horasAbonar} horas correctamente.`;
      msg.textContent = txt;
      msg.className = "msg ok";
    }

    await loadUsers_list();

    // Actualizar el campo de horas actuales
    const abonarCurrent = document.getElementById("abonar-current");
    if (abonarCurrent) {
      abonarCurrent.value = data.new_bonus.toFixed(1);
    }

    // Limpiar campos
    if (horasInput) horasInput.value = "";
    if (comentarioInput) comentarioInput.value = "";

  } catch (err) {
    console.error("Error abonando horas:", err);
    if (msg) {
      msg.textContent = "Error de red: " + err.message;
      msg.className = "msg err";
    }
  }
}

// ==================== COMPLETE SETUP ====================

async function completeSetup(newAdminEmail, newAdminPassword) {
  const confirmMsg =
    "¡Nuevo administrador creado!\n\n" +
    "El usuario temporal será eliminado y deberá iniciar sesión con las nuevas credenciales:\n\n" +
    "Email: " + newAdminEmail + "\n\n" +
    "¿Desea continuar?";

  if (!confirm(confirmMsg)) {
    return;
  }

  try {
    const loginRes = await fetch(API_BASE + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newAdminEmail, password: newAdminPassword })
    });

    const loginData = await loginRes.json();

    if (!loginRes.ok) {
      alert("Error al verificar el nuevo administrador: " + (loginData.error || "Error desconocido"));
      return;
    }

    const newToken = loginData.token;

    const setupRes = await fetch(API_BASE + "/api/complete-setup", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + newToken,
        "Content-Type": "application/json"
      }
    });

    const setupData = await setupRes.json();

    if (!setupRes.ok) {
      alert("Error al completar configuración: " + (setupData.error || "Error desconocido"));
      return;
    }

    localStorage.removeItem("authToken");
    localStorage.removeItem("isDefaultUser");

    alert("Configuración completada.\n\nEl usuario temporal ha sido eliminado.\nInicie sesión con el nuevo administrador.");

    window.location.href = "index.html";

  } catch (err) {
    console.error("Error completando setup:", err);
    alert("Error de red al completar la configuración.");
  }
}

// ==================== ELIMINAR USUARIO ====================

async function deleteUser(id, name, email) {
  const msg = document.getElementById("user-form-msg");
  if (msg) {
    msg.textContent = "";
    msg.className = "msg";
  }

  // Verificar si es el último administrador activo
  const user = getUserFromCache(id);
  if (user && user.role === "administrador" && isLastActiveAdmin(id)) {
    if (msg) {
      msg.textContent = "No se puede eliminar al único administrador activo del sistema.";
      msg.className = "msg err";
    }
    alert("No se puede eliminar al único administrador activo del sistema.\n\nDebe existir al menos un administrador activo.");
    return;
  }

  const confirmado = window.confirm(
    `¿Seguro que desea eliminar al usuario "${name}" (ID ${id})?\n\n` +
    "Se eliminarán también sus solicitudes asociadas. Esta acción no se puede deshacer."
  );
  if (!confirmado) return;

  try {
    const res = await fetch(API_BASE + "/api/users/" + id, {
      method: "DELETE",
      headers: {
        ...getHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        send_email: true
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (msg) {
        msg.textContent = data.error || "No se pudo eliminar el usuario.";
        msg.className = "msg err";
      }
      return;
    }

    if (msg) {
      msg.textContent = "Usuario eliminado correctamente.";
      msg.className = "msg ok";
    }

    await loadUsers_list();

    if (editingUserId === id) {
      clearUserForm();
    }

  } catch (err) {
    console.error(err);
    if (msg) {
      msg.textContent = "Error de red al eliminar: " + err.message;
      msg.className = "msg err";
    }
  }
}

// ==================== ACTIVAR / DESACTIVAR USUARIO ====================

async function toggleActive(id, currentActive, name, email) {
  const msg = document.getElementById("user-form-msg");
  if (msg) {
    msg.textContent = "";
    msg.className = "msg";
  }

  const newActive = !currentActive;
  const accion = newActive ? "activar" : "desactivar";

  // Si se intenta desactivar, verificar si es el último administrador activo
  if (!newActive) {
    const user = getUserFromCache(id);
    if (user && user.role === "administrador" && isLastActiveAdmin(id)) {
      if (msg) {
        msg.textContent = "No se puede desactivar al único administrador activo del sistema.";
        msg.className = "msg err";
      }
      alert("No se puede desactivar al único administrador activo del sistema.\n\nDebe existir al menos un administrador activo.");
      return;
    }
  }

  const confirmado = window.confirm(
    `¿Seguro que desea ${accion} al usuario "${name}"?`
  );
  if (!confirmado) return;

  try {
    const res = await fetch(API_BASE + "/api/users/" + id, {
      method: "PATCH",
      headers: {
        ...getHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        active: newActive,
        send_email: true
      })
    });

    const data = await res.json();

    if (!res.ok) {
      if (msg) {
        msg.textContent = data.error || "No se pudo actualizar el estado.";
        msg.className = "msg err";
      }
      return;
    }

    if (msg) {
      msg.textContent = `Usuario ${newActive ? "activado" : "desactivado"}.`;
      msg.className = "msg ok";
    }

    await loadUsers_list();

  } catch (err) {
    console.error(err);
    if (msg) {
      msg.textContent = "Error de red: " + err.message;
      msg.className = "msg err";
    }
  }
}

// ==================== HORARIOS DE TRABAJO ====================

function getScheduleFromForm() {
  const form = document.getElementById("work-schedule-form");
  if (!form) return null;

  const days = [
    "monday", "tuesday", "wednesday",
    "thursday", "friday", "saturday", "sunday"
  ];

  const schedule = {};
  days.forEach(d => {
    schedule[d] = {
      start: form.elements[`${d}_start`]?.value || "",
      end: form.elements[`${d}_end`]?.value || "",
      off: form.elements[`${d}_off`]?.checked || false
    };
  });
  return schedule;
}

function fillScheduleForm(schedule) {
  const form = document.getElementById("work-schedule-form");
  if (!form || !schedule) return;

  const days = [
    "monday", "tuesday", "wednesday",
    "thursday", "friday", "saturday", "sunday"
  ];

  days.forEach(d => {
    if (!schedule[d]) return;
    if (form.elements[`${d}_start`])
      form.elements[`${d}_start`].value = schedule[d].start || "";
    if (form.elements[`${d}_end`])
      form.elements[`${d}_end`].value = schedule[d].end || "";
    if (form.elements[`${d}_off`])
      form.elements[`${d}_off`].checked = !!schedule[d].off;
  });
}

const DEFAULT_SCHEDULE = {
  monday: { start: "08:30", end: "18:00", off: false },
  tuesday: { start: "08:30", end: "18:00", off: false },
  wednesday: { start: "08:30", end: "18:00", off: false },
  thursday: { start: "08:30", end: "18:00", off: false },
  friday: { start: "08:30", end: "18:00", off: false },
  saturday: { start: "", end: "", off: true },
  sunday: { start: "", end: "", off: true }
};

async function loadScheduleFromAPI() {
  try {
    const res = await fetch(API_BASE + "/api/config/schedule", {
      headers: getHeaders()
    });

    if (!res.ok) {
      console.warn("No se pudo cargar el horario desde la API, usando valores por defecto");
      return DEFAULT_SCHEDULE;
    }

    const data = await res.json();
    return data.schedule || DEFAULT_SCHEDULE;
  } catch (err) {
    console.error("Error cargando horario:", err);
    return DEFAULT_SCHEDULE;
  }
}

async function saveScheduleToAPI(schedule) {
  const scheduleMsg = document.getElementById("schedule-msg");

  try {
    const res = await fetch(API_BASE + "/api/config/schedule", {
      method: "POST",
      headers: {
        ...getHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ schedule })
    });

    const data = await res.json();

    if (!res.ok) {
      if (scheduleMsg) {
        scheduleMsg.textContent = data.error || "Error al guardar horario.";
        scheduleMsg.className = "msg err";
      }
      return false;
    }

    if (scheduleMsg) {
      scheduleMsg.textContent = "Horarios guardados correctamente.";
      scheduleMsg.className = "msg ok";
    }

    return true;

  } catch (err) {
    console.error("Error guardando horario:", err);
    if (scheduleMsg) {
      scheduleMsg.textContent = "Error de red: " + err.message;
      scheduleMsg.className = "msg err";
    }
    return false;
  }
}

function resetScheduleForm() {
  fillScheduleForm(DEFAULT_SCHEDULE);

  const scheduleMsg = document.getElementById("schedule-msg");
  if (scheduleMsg) {
    scheduleMsg.textContent = "";
    scheduleMsg.className = "msg";
  }
}

// ==================== FACTORES DE RENDICIÓN ====================

function initFactoresForm() {
  const factoresForm = document.getElementById("factores-form");
  if (!factoresForm) return;

  factoresForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    await saveFactoresToAPI();
  });

  const btnReset = document.getElementById("reset-factores");
  if (btnReset) {
    btnReset.addEventListener("click", function () {
      resetFactoresForm();
    });
  }
}

function getFactoresFromForm() {
  return {
    alojamiento: parseFloat(document.getElementById("factor-alojamiento")?.value) || 4.5,
    feriado: parseFloat(document.getElementById("factor-feriado")?.value) || 200,
    extras: parseFloat(document.getElementById("factor-extras")?.value) || 150,
    viaje: parseFloat(document.getElementById("factor-viaje")?.value) || 50
  };
}

function fillFactoresForm(factores) {
  if (!factores) return;

  const alojEl = document.getElementById("factor-alojamiento");
  const feriadoEl = document.getElementById("factor-feriado");
  const extrasEl = document.getElementById("factor-extras");
  const viajeEl = document.getElementById("factor-viaje");

  if (alojEl && factores.alojamiento !== undefined) alojEl.value = factores.alojamiento;
  if (feriadoEl && factores.feriado !== undefined) feriadoEl.value = factores.feriado;
  if (extrasEl && factores.extras !== undefined) extrasEl.value = factores.extras;
  if (viajeEl && factores.viaje !== undefined) viajeEl.value = factores.viaje;
}

function resetFactoresForm() {
  fillFactoresForm({
    alojamiento: 4.5,
    feriado: 200,
    extras: 150,
    viaje: 50
  });

  const msg = document.getElementById("factores-msg");
  if (msg) {
    msg.textContent = "";
    msg.className = "msg";
  }
}

async function loadFactoresFromAPI() {
  try {
    const res = await fetch(API_BASE + "/api/config/factores", {
      headers: getHeaders()
    });

    if (!res.ok) {
      console.warn("No se pudieron cargar los factores desde la API");
      return null;
    }

    const data = await res.json();
    return data.factores || null;
  } catch (err) {
    console.error("Error cargando factores:", err);
    return null;
  }
}

async function saveFactoresToAPI() {
  const factoresMsg = document.getElementById("factores-msg");
  const factores = getFactoresFromForm();

  try {
    const res = await fetch(API_BASE + "/api/config/factores", {
      method: "POST",
      headers: {
        ...getHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ factores })
    });

    const data = await res.json();

    if (!res.ok) {
      if (factoresMsg) {
        factoresMsg.textContent = data.error || "Error al guardar factores.";
        factoresMsg.className = "msg err";
      }
      return false;
    }

    if (factoresMsg) {
      factoresMsg.textContent = "Factores guardados correctamente.";
      factoresMsg.className = "msg ok";
    }

    return true;

  } catch (err) {
    console.error("Error guardando factores:", err);
    if (factoresMsg) {
      factoresMsg.textContent = "Error de red: " + err.message;
      factoresMsg.className = "msg err";
    }
    return false;
  }
}

async function loadFactoresOnInit() {
  const factores = await loadFactoresFromAPI();
  if (factores) {
    fillFactoresForm(factores);
  }
}

async function loadScheduleOnInit() {
  const schedule = await loadScheduleFromAPI();
  fillScheduleForm(schedule);
}

// ==================== INIT ====================

function initUserAdminPage() {
  const pwdField = document.getElementById("password-field");
  if (pwdField) pwdField.classList.remove("visible");

  const userForm = document.getElementById("user-form");
  if (userForm) {
    userForm.addEventListener("submit", function (e) {
      e.preventDefault();
      handleFormSubmit();
    });
  }

  const btnAddUser = document.getElementById("btn-add-user");
  if (btnAddUser) {
    btnAddUser.addEventListener("click", () => {
      clearUserForm();
    });
  }

  const btnCancel = document.getElementById("user-form-cancel");
  if (btnCancel) {
    btnCancel.addEventListener("click", (e) => {
      e.preventDefault();
      clearUserForm();
    });
  }

  const schedForm = document.getElementById("work-schedule-form");
  if (schedForm) {
    schedForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const schedule = getScheduleFromForm();
      await saveScheduleToAPI(schedule);
    });

    const btnReset = document.getElementById("reset-schedule");
    if (btnReset) {
      btnReset.addEventListener("click", function () {
        resetScheduleForm();
      });
    }
  }

  initFactoresForm();
}

/* ========== CONFIGURACIÓN DEL SISTEMA ========== */

async function loadPublicRegistration() {
  try {
    const res = await fetch(API_BASE + "/api/config/public-registration", {
      headers: getHeaders()
    });
    const data = await res.json();

    const toggle = document.getElementById("toggle-public-registration");
    const label = document.getElementById("toggle-public-registration-label");

    if (toggle && label) {
      toggle.checked = data.enabled;
      updateToggleLabel(label, data.enabled);
    }
  } catch (err) {
    console.error("Error cargando configuración de registro:", err);
  }
}

function updateToggleLabel(label, enabled) {
  if (enabled) {
    label.textContent = "Habilitado";
    label.classList.add("enabled");
  } else {
    label.textContent = "Deshabilitado";
    label.classList.remove("enabled");
  }
}

async function togglePublicRegistration(enabled) {
  const msg = document.getElementById("system-config-msg");
  if (msg) {
    msg.textContent = "";
    msg.className = "msg";
  }

  try {
    const res = await fetch(API_BASE + "/api/config/public-registration", {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify({ enabled: enabled })
    });

    const data = await res.json();

    if (!res.ok) {
      if (msg) {
        msg.textContent = data.error || "Error al guardar configuración";
        msg.classList.add("error");
      }
      // Revertir el toggle
      const toggle = document.getElementById("toggle-public-registration");
      if (toggle) toggle.checked = !enabled;
      return;
    }

    // Actualizar label
    const label = document.getElementById("toggle-public-registration-label");
    if (label) {
      updateToggleLabel(label, enabled);
    }

    if (msg) {
      msg.textContent = data.message || "Configuración guardada";
      msg.classList.add("success");
      setTimeout(() => {
        msg.textContent = "";
        msg.className = "msg";
      }, 3000);
    }
  } catch (err) {
    console.error("Error guardando configuración:", err);
    if (msg) {
      msg.textContent = "Error de conexión";
      msg.classList.add("error");
    }
    // Revertir el toggle
    const toggle = document.getElementById("toggle-public-registration");
    if (toggle) toggle.checked = !enabled;
  }
}

function initSystemConfig() {
  const toggle = document.getElementById("toggle-public-registration");
  if (toggle) {
    toggle.addEventListener("change", (e) => {
      togglePublicRegistration(e.target.checked);
    });
  }
}

// PESTAÑAS (TABS)
function initTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

      tab.classList.add("active");
      const targetId = tab.dataset.tab;
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.add("active");
      }
    });
  });
}

// SMTP CONFIG
async function loadSMTPConfig() {
  try {
    const res = await fetch(API_BASE + "/api/config/smtp", { headers: getHeaders() });
    const data = await res.json();
    if (data.smtp) {
      document.getElementById("smtp-host").value = data.smtp.host || "";
      document.getElementById("smtp-port").value = data.smtp.port || 587;
      document.getElementById("smtp-use-tls").checked = !!data.smtp.use_tls;
      document.getElementById("smtp-user").value = data.smtp.user || "";
      document.getElementById("smtp-password").value = data.smtp.password || "";
      document.getElementById("smtp-from-email").value = data.smtp.from_email || "";
      document.getElementById("smtp-enabled").checked = !!data.smtp.enabled;
    }
  } catch (err) {
    console.error("Error al cargar configuración SMTP:", err);
  }
}

async function saveSMTPConfig(e) {
  if (e) e.preventDefault();
  const msg = document.getElementById("smtp-msg");
  if (msg) {
    msg.textContent = "";
    msg.className = "msg";
  }

  const smtp = {
    host: document.getElementById("smtp-host").value.trim(),
    port: parseInt(document.getElementById("smtp-port").value, 10) || 587,
    use_tls: document.getElementById("smtp-use-tls").checked,
    user: document.getElementById("smtp-user").value.trim(),
    password: document.getElementById("smtp-password").value,
    from_email: document.getElementById("smtp-from-email").value.trim(),
    enabled: document.getElementById("smtp-enabled").checked
  };

  try {
    const res = await fetch(API_BASE + "/api/config/smtp", {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify({ smtp })
    });
    const data = await res.json();
    if (!res.ok) {
      if (msg) {
        msg.textContent = data.error || "Error al guardar SMTP.";
        msg.className = "msg err";
      }
      return;
    }
    if (msg) {
      msg.textContent = "Configuración SMTP guardada correctamente.";
      msg.className = "msg ok";
      setTimeout(() => { msg.textContent = ""; msg.className = "msg"; }, 3000);
    }
  } catch (err) {
    console.error(err);
    if (msg) {
      msg.textContent = "Error de red al guardar SMTP.";
      msg.className = "msg err";
    }
  }
}

async function testSMTPConfig() {
  const msg = document.getElementById("smtp-msg");
  if (msg) {
    msg.textContent = "";
    msg.className = "msg";
  }

  const emailDestino = prompt("Ingrese un correo electrónico para recibir el mensaje de prueba:");
  if (!emailDestino) return;

  const smtp = {
    host: document.getElementById("smtp-host").value.trim(),
    port: parseInt(document.getElementById("smtp-port").value, 10) || 587,
    use_tls: document.getElementById("smtp-use-tls").checked,
    user: document.getElementById("smtp-user").value.trim(),
    password: document.getElementById("smtp-password").value,
    from_email: document.getElementById("smtp-from-email").value.trim(),
    enabled: document.getElementById("smtp-enabled").checked
  };

  if (msg) {
    msg.textContent = "Enviando correo de prueba...";
    msg.className = "msg ok";
  }

  try {
    const res = await fetch(API_BASE + "/api/config/smtp/test", {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify({ email: emailDestino, smtp })
    });
    const data = await res.json();
    if (!res.ok) {
      if (msg) {
        msg.textContent = data.error || "Error al enviar prueba SMTP.";
        msg.className = "msg err";
      }
      return;
    }
    if (msg) {
      msg.textContent = "Correo de prueba enviado correctamente a: " + emailDestino;
      msg.className = "msg ok";
      setTimeout(() => { msg.textContent = ""; msg.className = "msg"; }, 5000);
    }
  } catch (err) {
    console.error(err);
    if (msg) {
      msg.textContent = "Error de red al enviar prueba.";
      msg.className = "msg err";
    }
  }
}

// TIMEZONE CONFIG
async function loadTimezoneConfig() {
  try {
    const res = await fetch(API_BASE + "/api/config/system_timezone", { headers: getHeaders() });
    const data = await res.json();
    if (data.value) {
      document.getElementById("system-timezone").value = data.value;
    }
  } catch (err) {
    console.error("Error al cargar Zona Horaria:", err);
  }
}

async function saveTimezoneConfig(e) {
  if (e) e.preventDefault();
  const msg = document.getElementById("timezone-msg");
  if (msg) {
    msg.textContent = "";
    msg.className = "msg";
  }

  const tz = document.getElementById("system-timezone").value;

  try {
    const res = await fetch(API_BASE + "/api/config/system_timezone", {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify({ value: tz })
    });
    const data = await res.json();
    if (!res.ok) {
      if (msg) {
        msg.textContent = data.error || "Error al guardar Zona Horaria.";
        msg.className = "msg err";
      }
      return;
    }
    if (msg) {
      msg.textContent = "Zona Horaria guardada correctamente.";
      msg.className = "msg ok";
      setTimeout(() => { msg.textContent = ""; msg.className = "msg"; }, 3000);
    }
  } catch (err) {
    console.error(err);
    if (msg) {
      msg.textContent = "Error de red al guardar Zona Horaria.";
      msg.className = "msg err";
    }
  }
}

(async function init() {
  await loadUser();
  initTabs();
  initUserAdminPage();
  await loadUsers_list();
  await loadScheduleOnInit();
  await loadFactoresOnInit();
  await loadPublicRegistration();
  initSystemConfig();
  
  // Cargar configs SMTP y Timezone
  await loadSMTPConfig();
  await loadTimezoneConfig();
  
  // Handlers formularios
  const smtpForm = document.getElementById("smtp-form");
  if (smtpForm) smtpForm.onsubmit = saveSMTPConfig;
  
  const testSmtpBtn = document.getElementById("btn-test-smtp");
  if (testSmtpBtn) testSmtpBtn.onclick = testSMTPConfig;
  
  const timezoneForm = document.getElementById("timezone-form");
  if (timezoneForm) timezoneForm.onsubmit = saveTimezoneConfig;
})();
