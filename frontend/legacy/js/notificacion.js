
let authToken = localStorage.getItem("authToken");
let workSchedule = null; // Horario laboral cargado desde la API

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

// ==================== CARGAR HORARIO LABORAL ====================

async function loadWorkSchedule() {
    try {
        const res = await fetch(API_BASE + "/api/config/schedule", {
            headers: getHeaders()
        });

        if (!res.ok) {
            console.warn("No se pudo cargar el horario laboral");
            return null;
        }

        const data = await res.json();
        workSchedule = data.schedule || null;
        console.log("Horario laboral cargado:", workSchedule);
        return workSchedule;
    } catch (err) {
        console.error("Error cargando horario laboral:", err);
        return null;
    }
}

// ==================== VALIDACIÓN DE HORARIOS ====================

// Convierte nombre de día en inglés (del Date) al formato del schedule
function getDayName(date) {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    return days[date.getDay()];
}

// Verifica si un día está marcado como día libre
function isDayOff(dateStr) {
    if (!workSchedule) return false;

    const date = new Date(dateStr + "T12:00:00"); // Evitar problemas de timezone
    const dayName = getDayName(date);

    if (!workSchedule[dayName]) return false;
    return !!workSchedule[dayName].off;
}

// Obtiene el horario laboral de un día específico
function getWorkHoursForDay(dateStr) {
    if (!workSchedule) return null;

    const date = new Date(dateStr + "T12:00:00");
    const dayName = getDayName(date);

    if (!workSchedule[dayName]) return null;
    if (workSchedule[dayName].off) return null;

    return {
        start: workSchedule[dayName].start || null,
        end: workSchedule[dayName].end || null
    };
}

// Verifica si una hora está dentro del horario laboral
function isTimeWithinWorkHours(dateStr, timeStr) {
    const workHours = getWorkHoursForDay(dateStr);

    if (!workHours || !workHours.start || !workHours.end) {
        return true; // Si no hay horario configurado, permitir
    }

    return timeStr >= workHours.start && timeStr <= workHours.end;
}

// Valida una fila completa
function validateRow(row) {
    const errors = [];

    // Si no hay horario configurado, no validar
    if (!workSchedule) {
        return { valid: true, errors: [] };
    }

    // Verificar si es día libre
    if (isDayOff(row.day)) {
        const date = new Date(row.day + "T12:00:00");
        const dayNames = {
            sunday: "Domingo",
            monday: "Lunes",
            tuesday: "Martes",
            wednesday: "Miércoles",
            thursday: "Jueves",
            friday: "Viernes",
            saturday: "Sábado"
        };
        const dayName = dayNames[getDayName(date)];
        errors.push(`${row.day}: ${dayName} está marcado como día libre.`);
        return { valid: false, errors };
    }

    // Si es día completo, no validar horas
    if (row.full_day) {
        return { valid: true, errors: [] };
    }

    const workHours = getWorkHoursForDay(row.day);

    if (workHours && workHours.start && workHours.end) {
        // Validar hora de inicio
        if (row.from < workHours.start) {
            errors.push(`${row.day}: La hora de inicio (${row.from}) es anterior al inicio de la jornada laboral (${workHours.start}).`);
        }

        // Validar hora de fin
        if (row.to > workHours.end) {
            errors.push(`${row.day}: La hora de fin (${row.to}) es posterior al fin de la jornada laboral (${workHours.end}).`);
        }

        // Validar que inicio sea antes que fin
        if (row.from >= row.to) {
            errors.push(`${row.day}: La hora de inicio debe ser anterior a la hora de fin.`);
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/* ---------- manejo de filas ---------- */

function addRow() {
    const tbody = document.getElementById("not-body");
    const tr = document.createElement("tr");
    tr.className = "not-row";

    tr.innerHTML = `
        <td>
            <input type="date" class="inp-day">
        </td>
        <td>
            <input type="time" class="inp-from">
        </td>
        <td>
            <input type="time" class="inp-to">
        </td>
        <td style="text-align:center;">
            <input type="checkbox" class="inp-full">
        </td>
        <td>
            <textarea class="inp-comment" placeholder="Comentarios"></textarea>
        </td>
        <td style="text-align:center;">
            <button class="btn btn-danger btn-sm btn-remove">
                <i class="fa fa-times"></i>
            </button>
        </td>
    `;

    const inpDay = tr.querySelector(".inp-day");
    const inpFrom = tr.querySelector(".inp-from");
    const inpTo = tr.querySelector(".inp-to");
    const inpFull = tr.querySelector(".inp-full");

    // Cuando cambia el día, actualizar los límites de hora
    inpDay.addEventListener("change", (e) => {
        const dateStr = e.target.value;
        if (!dateStr) return;

        // Verificar si es día libre
        if (isDayOff(dateStr)) {
            const date = new Date(dateStr + "T12:00:00");
            const dayNames = {
                sunday: "Domingo",
                monday: "Lunes",
                tuesday: "Martes",
                wednesday: "Miércoles",
                thursday: "Jueves",
                friday: "Viernes",
                saturday: "Sábado"
            };
            const dayName = dayNames[getDayName(date)];
            alert(`⚠️ ${dayName} está marcado como día libre en la configuración de horarios.`);
            return;
        }

        // Establecer límites de hora según el horario laboral
        const workHours = getWorkHoursForDay(dateStr);
        if (workHours && workHours.start && workHours.end) {
            inpFrom.min = workHours.start;
            inpFrom.max = workHours.end;
            inpTo.min = workHours.start;
            inpTo.max = workHours.end;

            // Si los campos están vacíos, sugerir el horario laboral
            if (!inpFrom.value) inpFrom.value = workHours.start;
            if (!inpTo.value) inpTo.value = workHours.end;
        }
    });

    // Día completo -> deshabilita desde/hasta
    inpFull.addEventListener("change", (e) => {
        const full = e.target.checked;
        inpFrom.disabled = full;
        inpTo.disabled = full;
        if (full) {
            inpFrom.value = "";
            inpTo.value = "";
        }
    });

    // eliminar fila
    tr.querySelector(".btn-remove").onclick = () => tr.remove();

    tbody.appendChild(tr);
}

function collectRows() {
    const rows = [];
    document.querySelectorAll("#not-body tr").forEach((tr) => {
        const day = tr.querySelector(".inp-day").value;
        const from = tr.querySelector(".inp-from").value;
        const to = tr.querySelector(".inp-to").value;
        const full = tr.querySelector(".inp-full").checked;
        const comment = tr.querySelector(".inp-comment").value.trim();

        if (!day) return; // ignorar filas sin fecha

        if (!full && (!from || !to)) return; // si no es día completo, requiere horas

        rows.push({
            day,
            from,
            to,
            full_day: full,
            comment,
        });
    });
    return rows;
}

/* ---------- guardar / cancelar ---------- */
async function saveRequests() {
    const msg = document.getElementById("not-msg");
    msg.textContent = "";
    msg.className = "not-msg";

    let rows = collectRows() || [];

    // Si viene como objeto tipo {0: {...}, 1: {...}}, lo pasamos a array
    if (!Array.isArray(rows)) {
        rows = Object.values(rows);
    }

    // Filtramos filas sin día
    rows = rows.filter(r => r && r.day);

    if (rows.length === 0) {
        msg.textContent = "Debe agregar al menos una fila con datos válidos.";
        msg.classList.add("err");
        return;
    }

    // ==================== VALIDAR HORARIOS ====================
    if (workSchedule) {
        const allErrors = [];

        for (const row of rows) {
            const validation = validateRow(row);
            if (!validation.valid) {
                allErrors.push(...validation.errors);
            }
        }

        if (allErrors.length > 0) {
            msg.innerHTML = `
                <strong>Errores de validación de horario:</strong><br>
                ${allErrors.map(e => `• ${e}`).join("<br>")}
            `;
            msg.classList.add("err");
            return;
        }
    }

    console.log("Rows que se envían al backend:", rows);

    try {
        const res = await fetch(API_BASE + "/api/notificaciones/batch", {
            method: "POST",
            headers: {
                ...getHeaders(),
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ rows }),
        });

        let data = null;
        try {
            data = await res.json();
        } catch (e) {
            console.warn("No se pudo parsear JSON de la respuesta:", e);
        }

        if (!res.ok) {
            const msgError =
                (data && data.error) ||
                `Error del servidor (${res.status}) al guardar las notificaciones.`;
            msg.textContent = msgError;
            msg.classList.add("err");
            return;
        }

        msg.textContent =
            (data && data.message) ||
            "Solicitudes guardadas correctamente.";
        msg.classList.add("ok");

        document.getElementById("not-body").innerHTML = "";

    } catch (err) {
        console.error("Error de red en saveRequests:", err);
        msg.textContent = "Error de red: " + err.message;
        msg.classList.add("err");
    }
}

function cancelRequests() {
    document.getElementById("not-body").innerHTML = "";
    const msg = document.getElementById("not-msg");
    msg.textContent = "";
    msg.className = "not-msg";
}

/* ---------- eventos ---------- */

document.getElementById("btn-add-row").onclick = addRow;
document.getElementById("btn-save").onclick = saveRequests;
document.getElementById("btn-cancel").onclick = cancelRequests;

/* ---------- init ---------- */

(async function init() {
    await loadUser();
    await loadWorkSchedule(); // Cargar horario laboral al inicio
})();
