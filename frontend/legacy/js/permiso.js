
let authToken = localStorage.getItem("authToken");
let currentUser = null;
let workSchedule = null;
let permisosPendientes = [];

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
    setupHeaderNav("solicitar");

    document.getElementById("footer-user").textContent =
        "Usuario: " + currentUser.name + " (" + currentUser.role + ")";
}

/* ========== CARGAR PERMISOS PENDIENTES ========== */

async function loadPermisosPendientes() {
    try {
        const res = await fetch(API_BASE + "/api/requests?mine=1", {
            headers: getHeaders()
        });

        if (!res.ok) {
            console.warn("No se pudieron cargar los permisos");
            return;
        }

        const data = await res.json();
        const requests = data.requests || [];

        // Filtrar solo permisos pendientes (no notificaciones, no abonos)
        permisosPendientes = requests.filter(r =>
            r.type === "Permiso" &&
            (r.status === "pendiente" || r.status === "pendiente_jefe" || r.status === "pendiente_admin")
        );

        console.log("Permisos pendientes:", permisosPendientes.length);
    } catch (err) {
        console.error("Error cargando permisos pendientes:", err);
    }
}

/* ========== CARGAR HORARIO LABORAL ========== */

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

/* ========== POPUPS ========== */

function showPopup(options) {
    return new Promise((resolve) => {
        // Crear overlay
        const overlay = document.createElement("div");
        overlay.className = "popup-overlay active";
        overlay.id = "custom-popup-overlay";

        // Determinar icono y colores según tipo
        let iconClass = "fa-info-circle";
        let iconColor = "#3498db";
        let headerBg = "#f8f9fa";

        if (options.type === "error") {
            iconClass = "fa-times-circle";
            iconColor = "#e74c3c";
            headerBg = "#fdf2f2";
        } else if (options.type === "warning") {
            iconClass = "fa-exclamation-triangle";
            iconColor = "#f39c12";
            headerBg = "#fef9e7";
        } else if (options.type === "success") {
            iconClass = "fa-check-circle";
            iconColor = "#27ae60";
            headerBg = "#eafaf1";
        }

        overlay.innerHTML = `
            <div class="popup-modal">
                <div class="popup-header" style="background: ${headerBg};">
                    <h3><i class="fa ${iconClass}" style="color: ${iconColor}; margin-right: 10px;"></i>${options.title || "Mensaje"}</h3>
                    ${!options.hideClose ? '<button class="popup-close" onclick="closePopup()">&times;</button>' : ''}
                </div>
                <div class="popup-body">
                    <div style="text-align: center; padding: 10px 0;">
                        ${options.message || ""}
                    </div>
                    ${options.countdown ? `<div id="popup-countdown" style="text-align: center; margin-top: 15px; font-size: 14px; color: #666;"></div>` : ''}
                </div>
                <div class="popup-footer" style="justify-content: center;">
                    ${options.showCancel ? `<button class="btn-cancelar" id="popup-btn-cancel">Cancelar</button>` : ''}
                    ${options.showOk !== false ? `<button class="btn-confirmar" id="popup-btn-ok" style="background: ${iconColor};">${options.okText || "Aceptar"}</button>` : ''}
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Eventos de botones
        const btnOk = document.getElementById("popup-btn-ok");
        const btnCancel = document.getElementById("popup-btn-cancel");

        if (btnOk) {
            btnOk.onclick = () => {
                closePopup();
                resolve(true);
            };
        }

        if (btnCancel) {
            btnCancel.onclick = () => {
                closePopup();
                resolve(false);
            };
        }

        // Countdown si se especifica
        if (options.countdown) {
            let seconds = options.countdown;
            const countdownEl = document.getElementById("popup-countdown");

            const updateCountdown = () => {
                if (countdownEl) {
                    countdownEl.innerHTML = `<em>Enviando solicitud en ${seconds} segundo${seconds !== 1 ? 's' : ''}...</em>`;
                }
            };

            updateCountdown();

            const interval = setInterval(() => {
                seconds--;
                if (seconds <= 0) {
                    clearInterval(interval);
                    closePopup();
                    resolve(true);
                } else {
                    updateCountdown();
                }
            }, 1000);

            // Si hay botón cancelar, detener el countdown
            if (btnCancel) {
                btnCancel.onclick = () => {
                    clearInterval(interval);
                    closePopup();
                    resolve(false);
                };
            }
        }
    });
}

function closePopup() {
    const overlay = document.getElementById("custom-popup-overlay");
    if (overlay) {
        overlay.remove();
    }
}

/* ========== VALIDACIÓN DE HORARIOS ========== */

function getDayName(dateStr) {
    const date = new Date(dateStr + "T12:00:00");
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    return days[date.getDay()];
}

function getDayNameSpanish(dateStr) {
    const date = new Date(dateStr + "T12:00:00");
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    return days[date.getDay()];
}

function isDayOff(dateStr) {
    if (!workSchedule) return false;
    const dayName = getDayName(dateStr);
    if (!workSchedule[dayName]) return false;
    return !!workSchedule[dayName].off;
}

function getWorkHoursForDay(dateStr) {
    if (!workSchedule) return null;
    const dayName = getDayName(dateStr);
    if (!workSchedule[dayName]) return null;
    if (workSchedule[dayName].off) return null;
    return {
        start: workSchedule[dayName].start || null,
        end: workSchedule[dayName].end || null
    };
}

function validateRow(row) {
    const errors = [];

    if (!workSchedule) {
        return { valid: true, errors: [] };
    }

    // Verificar si es día libre
    if (isDayOff(row.day)) {
        const dayName = getDayNameSpanish(row.day);
        errors.push(`${row.day}: ${dayName} está marcado como día libre.`);
        return { valid: false, errors };
    }

    // Si es día completo, no validar horas específicas
    if (row.full_day) {
        return { valid: true, errors: [] };
    }

    const workHours = getWorkHoursForDay(row.day);

    if (workHours && workHours.start && workHours.end) {
        if (row.from < workHours.start) {
            errors.push(`${row.day}: La hora de inicio (${row.from}) es anterior al inicio de la jornada laboral (${workHours.start}).`);
        }

        if (row.to > workHours.end) {
            errors.push(`${row.day}: La hora de fin (${row.to}) es posterior al fin de la jornada laboral (${workHours.end}).`);
        }

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
    const tbody = document.getElementById("perm-body");
    const tr = document.createElement("tr");
    tr.className = "perm-row";

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

    // Cuando cambia el día, validar y establecer límites
    inpDay.addEventListener("change", (e) => {
        const dateStr = e.target.value;
        if (!dateStr) return;

        // Verificar si es día libre
        if (isDayOff(dateStr)) {
            const dayName = getDayNameSpanish(dateStr);
            showPopup({
                type: "warning",
                title: "Día no laborable",
                message: `<strong>${dayName}</strong> está marcado como día libre en la configuración de horarios.`
            });
            return;
        }

        // Establecer límites de hora según el horario laboral
        const workHours = getWorkHoursForDay(dateStr);
        if (workHours && workHours.start && workHours.end) {
            inpFrom.min = workHours.start;
            inpFrom.max = workHours.end;
            inpTo.min = workHours.start;
            inpTo.max = workHours.end;

            // Sugerir el horario laboral si está vacío
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
    document.querySelectorAll("#perm-body tr").forEach((tr) => {
        const day = tr.querySelector(".inp-day").value;
        const from = tr.querySelector(".inp-from").value;
        const to = tr.querySelector(".inp-to").value;
        const full = tr.querySelector(".inp-full").checked;
        const comment = tr.querySelector(".inp-comment").value.trim();

        if (!day) return;

        if (!full && (!from || !to)) return;

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

/* ---------- calcular horas totales ---------- */

function calcularHorasTotales(rows) {
    let totalHoras = 0;

    for (const row of rows) {
        if (row.full_day) {
            // Día completo: calcular según horario laboral o usar 8 horas por defecto
            const workHours = getWorkHoursForDay(row.day);
            if (workHours && workHours.start && workHours.end) {
                const horasDia = calcularDiferenciaHoras(workHours.start, workHours.end);
                totalHoras += horasDia;
            } else {
                totalHoras += 8; // Por defecto 8 horas
            }
        } else {
            // Calcular diferencia entre from y to
            const horas = calcularDiferenciaHoras(row.from, row.to);
            totalHoras += horas;
        }
    }

    return totalHoras;
}

function calcularDiferenciaHoras(desde, hasta) {
    if (!desde || !hasta) return 0;

    const [hDesde, mDesde] = desde.split(":").map(Number);
    const [hHasta, mHasta] = hasta.split(":").map(Number);

    const minutosDesde = hDesde * 60 + mDesde;
    const minutosHasta = hHasta * 60 + mHasta;

    const diferenciaMinutos = minutosHasta - minutosDesde;
    return diferenciaMinutos / 60;
}

/* ---------- refrescar datos del usuario ---------- */

async function refreshUserData() {
    try {
        const res = await fetch(API_BASE + "/api/me", { headers: getHeaders() });
        const data = await res.json();
        if (res.ok && data.user) {
            currentUser = data.user;
        }
    } catch (err) {
        console.error("Error actualizando datos del usuario:", err);
    }
}

/* ---------- guardar / cancelar ---------- */

async function saveRequests() {
    const rows = collectRows();

    if (rows.length === 0) {
        await showPopup({
            type: "error",
            title: "Datos incompletos",
            message: "Debe agregar al menos una fila con datos válidos."
        });
        return;
    }

    // Validar horarios
    if (workSchedule) {
        const allErrors = [];

        for (const row of rows) {
            const validation = validateRow(row);
            if (!validation.valid) {
                allErrors.push(...validation.errors);
            }
        }

        if (allErrors.length > 0) {
            await showPopup({
                type: "error",
                title: "Errores de validación de horario",
                message: allErrors.map(e => `• ${e}`).join("<br>")
            });
            return;
        }
    }

    // Calcular saldo actual del usuario
    const saldoActual = (currentUser.bonus_hours || 0) - (currentUser.used_hours || 0);

    // Verificar si el saldo actual ya es negativo - NO PERMITIR SOLICITUD
    if (saldoActual < 0) {
        await showPopup({
            type: "error",
            title: "No puede solicitar permisos",
            message: `
                Su saldo de horas actual es <strong>negativo (${saldoActual.toFixed(1)} horas)</strong>.<br><br>
                Contacte a su administrador para regularizar su situación.
            `
        });
        return;
    }

    // Calcular horas totales de la solicitud
    const totalHorasSolicitud = calcularHorasTotales(rows);

    // Calcular saldo después de la solicitud
    const saldoDespues = saldoActual - totalHorasSolicitud;

    // Si el saldo quedará negativo, verificar permisos pendientes y advertir
    if (saldoDespues < 0) {
        // Verificar si tiene permisos pendientes (solo cuando pasará a negativo)
        if (permisosPendientes.length > 0) {
            await showPopup({
                type: "warning",
                title: "Permiso pendiente",
                message: `
                    Ya tiene <strong>${permisosPendientes.length} permiso(s) pendiente(s)</strong> de aprobación.<br><br>
                    Debe esperar a que su solicitud actual sea aprobada o rechazada antes de enviar una nueva que supere su saldo disponible.
                `
            });
            return;
        }

        // Advertir y esperar 10 segundos
        const continuar = await showPopup({
            type: "warning",
            title: "Advertencia de saldo",
            message: `
                Esta solicitud <strong>superará su saldo</strong> de horas disponibles.<br><br>
                <table style="width: 100%; text-align: left; margin: 10px 0;">
                    <tr><td>Saldo actual:</td><td><strong>${saldoActual.toFixed(1)} h</strong></td></tr>
                    <tr><td>Solicitando:</td><td><strong>${totalHorasSolicitud.toFixed(1)} h</strong></td></tr>
                    <tr><td>Saldo resultante:</td><td><strong style="color: #e74c3c;">${saldoDespues.toFixed(1)} h</strong></td></tr>
                </table>
            `,
            countdown: 10,
            showCancel: true,
            okText: "Enviar ahora"
        });

        if (!continuar) {
            return; // Usuario canceló
        }
    }

    // Enviar solicitud
    try {
        const res = await fetch(API_BASE + "/api/requests/batch", {
            method: "POST",
            headers: getHeaders(true),
            body: JSON.stringify({ rows }),
        });
        const data = await res.json();

        if (!res.ok) {
            await showPopup({
                type: "error",
                title: "Error al guardar",
                message: data.error || "No se pudieron guardar las solicitudes."
            });
            return;
        }

        await showPopup({
            type: "success",
            title: "Solicitud enviada",
            message: data.message || "Sus solicitudes de permiso han sido enviadas correctamente.<br><br>Recibirá una notificación cuando sean revisadas."
        });

        // Actualizar usuario y permisos pendientes
        await refreshUserData();
        await loadPermisosPendientes();

        // Limpiar la tabla
        document.getElementById("perm-body").innerHTML = "";

    } catch (err) {
        console.error(err);
        await showPopup({
            type: "error",
            title: "Error de red",
            message: "No se pudo conectar con el servidor.<br><br>" + err.message
        });
    }
}

function cancelRequests() {
    document.getElementById("perm-body").innerHTML = "";
}

/* ---------- eventos ---------- */

document.getElementById("btn-add-row").onclick = addRow;
document.getElementById("btn-save").onclick = saveRequests;
document.getElementById("btn-cancel").onclick = cancelRequests;

/* ---------- init ---------- */

(async function init() {
    await loadUser();
    await loadWorkSchedule();
    await loadPermisosPendientes();
})();
