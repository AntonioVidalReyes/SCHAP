
let authToken = localStorage.getItem("authToken");
let currentUser = null;
let workSchedule = null;

// Factores por defecto (se cargan desde admin si están configurados)
let factores = {
    alojamiento: 4.5,       // Horas fijas por día de alojamiento
    feriado: 2.0,           // 200%
    extrasLunesSabado: 1.5, // 150%
    viaje: 0.5              // 50%
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
    setupHeaderNav("solicitar");

    document.getElementById("footer-user").textContent =
        "Usuario: " + currentUser.name + " (" + currentUser.role + ")";
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

/* ========== CARGAR FACTORES DESDE ADMIN ========== */

async function loadFactores() {
    try {
        const res = await fetch(API_BASE + "/api/config/factores", {
            headers: getHeaders()
        });

        if (res.ok) {
            const data = await res.json();
            const factoresData = data.factores || data.value || null;

            if (factoresData) {
                // Mapear los nombres de la API a los nombres internos
                factores.alojamiento = parseFloat(factoresData.alojamiento) || 4.5;
                factores.feriado = (parseFloat(factoresData.feriado) || 200) / 100; // Convertir % a decimal
                factores.extrasLunesSabado = (parseFloat(factoresData.extras) || 150) / 100; // Convertir % a decimal
                factores.viaje = (parseFloat(factoresData.viaje) || 50) / 100; // Convertir % a decimal

                console.log("Factores cargados desde API:", factores);
            }
        }
    } catch (err) {
        console.warn("Usando factores por defecto:", err);
    }

    // Actualizar labels en la tabla de tiempos con los factores
    actualizarLabelsFactores();
}

function actualizarLabelsFactores() {
    const labelAloj = document.getElementById("label-factor-aloj");
    const labelFeriado = document.getElementById("label-factor-feriado");
    const labelExtras = document.getElementById("label-factor-extras");
    const labelViaje = document.getElementById("label-factor-viaje");

    if (labelAloj) labelAloj.textContent = factores.alojamiento + " hrs/día";
    if (labelFeriado) labelFeriado.textContent = (factores.feriado * 100) + "%";
    if (labelExtras) labelExtras.textContent = (factores.extrasLunesSabado * 100) + "%";
    if (labelViaje) labelViaje.textContent = (factores.viaje * 100) + "%";
}

/* ========== UTILIDADES DE HORARIO ========== */

function getDayName(dateStr) {
    const date = new Date(dateStr + "T12:00:00");
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    return days[date.getDay()];
}

function getDayNumber(dateStr) {
    const date = new Date(dateStr + "T12:00:00");
    return date.getDay(); // 0 = domingo, 6 = sábado
}

function getWorkHoursForDay(dateStr) {
    if (!workSchedule) return { start: "09:00", end: "18:00" };
    const dayName = getDayName(dateStr);
    if (!workSchedule[dayName]) return { start: "09:00", end: "18:00" };
    if (workSchedule[dayName].off) return null;
    return {
        start: workSchedule[dayName].start || "09:00",
        end: workSchedule[dayName].end || "18:00"
    };
}

function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
}

function minutesToHours(minutes) {
    return Math.round((minutes / 60) * 100) / 100;
}

function calculateHours(from, to) {
    const fromMin = timeToMinutes(from);
    const toMin = timeToMinutes(to);
    if (toMin <= fromMin) return 0;
    return minutesToHours(toMin - fromMin);
}

function calculateExtraHours(dateStr, from, to) {
    const workHours = getWorkHoursForDay(dateStr);

    // Si es día libre, todas las horas son extras
    if (!workHours) {
        return calculateHours(from, to);
    }

    const fromMin = timeToMinutes(from);
    const toMin = timeToMinutes(to);
    const workStartMin = timeToMinutes(workHours.start);
    const workEndMin = timeToMinutes(workHours.end);

    let extraMinutes = 0;

    // Horas antes del inicio laboral
    if (fromMin < workStartMin) {
        extraMinutes += Math.min(toMin, workStartMin) - fromMin;
    }

    // Horas después del fin laboral
    if (toMin > workEndMin) {
        extraMinutes += toMin - Math.max(fromMin, workEndMin);
    }

    return minutesToHours(extraMinutes);
}

function isValidExtraTime(dateStr, from, to) {
    const workHours = getWorkHoursForDay(dateStr);

    // Si es día libre, es válido
    if (!workHours) return true;

    const fromMin = timeToMinutes(from);
    const toMin = timeToMinutes(to);
    const workStartMin = timeToMinutes(workHours.start);
    const workEndMin = timeToMinutes(workHours.end);

    // Válido si está completamente fuera del horario laboral
    return (toMin <= workStartMin) || (fromMin >= workEndMin);
}

/* ========== VALIDACIÓN DE DÍAS Y HORARIOS ========== */

function hayAlojamientoEnDia(dateStr, trActual) {
    // Verificar si hay un alojamiento calculado en ese día
    const filas = document.querySelectorAll(".hito-row.calculada");

    for (const tr of filas) {
        if (tr === trActual) continue;
        const trDay = tr.querySelector(".inp-day").value;
        if (trDay === dateStr && tr.dataset.tipoCalculado === "alojamiento") {
            return true;
        }
    }

    return false;
}

function hayHorasExtrasEnDia(dateStr, trActual) {
    // Verificar si hay horas extras (extra o feriado) calculadas en ese día
    const filas = document.querySelectorAll(".hito-row.calculada");

    for (const tr of filas) {
        if (tr === trActual) continue;
        const trDay = tr.querySelector(".inp-day").value;
        const tipoCalc = tr.dataset.tipoCalculado;
        // extra y feriado son tipos de horas extras
        if (trDay === dateStr && (tipoCalc === "extra" || tipoCalc === "feriado")) {
            return true;
        }
    }

    return false;
}

function verificarSolapamiento(dateStr, desde, hasta, trActual) {
    // Verificar solapamiento con otros hitos del mismo día
    const filas = document.querySelectorAll(".hito-row.calculada");

    const desdeMin = timeToMinutes(desde);
    const hastaMin = timeToMinutes(hasta);

    for (const tr of filas) {
        if (tr === trActual) continue;

        const trDay = tr.querySelector(".inp-day").value;
        if (trDay !== dateStr) continue;

        // No verificar solapamiento con alojamiento (tiene horario fijo pero permite viaje)
        if (tr.dataset.tipoCalculado === "alojamiento") continue;

        const trDesde = tr.querySelector(".inp-from").value;
        const trHasta = tr.querySelector(".inp-to").value;

        const trDesdeMin = timeToMinutes(trDesde);
        const trHastaMin = timeToMinutes(trHasta);

        // Verificar solapamiento
        if (desdeMin < trHastaMin && hastaMin > trDesdeMin) {
            return {
                solapado: true,
                mensaje: `Solapamiento con otro hito (${trDesde} - ${trHasta})`
            };
        }
    }

    return { solapado: false };
}

/* ========== MANEJO DE FILAS DE HITOS ========== */

function addHitoRow() {
    const tbody = document.getElementById("hitos-body");
    const tr = document.createElement("tr");
    tr.className = "hito-row";

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
        <td>
            <select class="inp-tipo">
                <option value="">-- Seleccione --</option>
                <option value="extra">Horas Extras</option>
                <option value="viaje">Viaje</option>
            </select>
        </td>
        <td class="extras-cell">
            <label class="chk-label chk-aloj" style="display:none;">
                <input type="checkbox" class="inp-aloj"> Alojamiento
            </label>
            <label class="chk-label chk-feriado" style="display:none;">
                <input type="checkbox" class="inp-feriado"> Feriado
            </label>
        </td>
        <td class="actions-cell">
            <button class="btn btn-primary btn-sm btn-calc" title="Calcular">
                <i class="fa fa-calculator"></i>
            </button>
            <button class="btn btn-danger btn-sm btn-remove" title="Eliminar">
                <i class="fa fa-times"></i>
            </button>
        </td>
    `;

    const inpDay = tr.querySelector(".inp-day");
    const inpFrom = tr.querySelector(".inp-from");
    const inpTo = tr.querySelector(".inp-to");
    const inpTipo = tr.querySelector(".inp-tipo");
    const inpAloj = tr.querySelector(".inp-aloj");
    const inpFeriado = tr.querySelector(".inp-feriado");
    const chkAlojLabel = tr.querySelector(".chk-aloj");
    const chkFeriadoLabel = tr.querySelector(".chk-feriado");
    const btnCalc = tr.querySelector(".btn-calc");
    const btnRemove = tr.querySelector(".btn-remove");

    // Cambio de tipo
    inpTipo.addEventListener("change", () => {
        const tipo = inpTipo.value;

        // Resetear checkboxes
        inpAloj.checked = false;
        inpFeriado.checked = false;
        inpFrom.disabled = false;
        inpTo.disabled = false;

        if (tipo === "extra") {
            // Mostrar opciones de alojamiento y feriado
            chkAlojLabel.style.display = "inline-block";
            chkFeriadoLabel.style.display = "inline-block";
        } else if (tipo === "viaje") {
            // Ocultar opciones extras para viaje
            chkAlojLabel.style.display = "none";
            chkFeriadoLabel.style.display = "none";
        } else {
            chkAlojLabel.style.display = "none";
            chkFeriadoLabel.style.display = "none";
        }
    });

    // Alojamiento seleccionado
    inpAloj.addEventListener("change", () => {
        if (inpAloj.checked) {
            // Desmarcar feriado
            inpFeriado.checked = false;

            // Fijar horas según horario laboral del día
            const dateStr = inpDay.value;
            if (dateStr) {
                const workHours = getWorkHoursForDay(dateStr);
                if (workHours) {
                    inpFrom.value = workHours.start;
                    inpTo.value = workHours.end;
                }
            }
            inpFrom.disabled = true;
            inpTo.disabled = true;
        } else {
            inpFrom.disabled = false;
            inpTo.disabled = false;
            inpFrom.value = "";
            inpTo.value = "";
        }
    });

    // Feriado seleccionado
    inpFeriado.addEventListener("change", () => {
        if (inpFeriado.checked) {
            // Desmarcar alojamiento
            inpAloj.checked = false;
            inpFrom.disabled = false;
            inpTo.disabled = false;
        }
    });

    // Cambio de día
    inpDay.addEventListener("change", () => {
        const dateStr = inpDay.value;
        if (!dateStr) return;

        // Si alojamiento está marcado, actualizar horas
        if (inpAloj.checked) {
            const workHours = getWorkHoursForDay(dateStr);
            if (workHours) {
                inpFrom.value = workHours.start;
                inpTo.value = workHours.end;
            }
        }
    });

    // Botón calcular
    btnCalc.addEventListener("click", () => {
        calcularHito(tr);
    });

    // Botón eliminar
    btnRemove.addEventListener("click", () => {
        tr.remove();
        recalcularTotales();
    });

    tbody.appendChild(tr);
}

/* ========== CALCULAR HITO INDIVIDUAL ========== */

function calcularHito(tr) {
    const inpDay = tr.querySelector(".inp-day");
    const inpFrom = tr.querySelector(".inp-from");
    const inpTo = tr.querySelector(".inp-to");
    const inpTipo = tr.querySelector(".inp-tipo");
    const inpAloj = tr.querySelector(".inp-aloj");
    const inpFeriado = tr.querySelector(".inp-feriado");

    const dateStr = inpDay.value;
    const from = inpFrom.value;
    const to = inpTo.value;
    const tipo = inpTipo.value;
    const esAlojamiento = inpAloj.checked;
    const esFeriado = inpFeriado.checked;

    // Validaciones básicas
    if (!dateStr) {
        alert("Debe seleccionar un día.");
        return;
    }

    if (!tipo) {
        alert("Debe seleccionar un tipo (Horas Extras o Viaje).");
        return;
    }

    if (!from || !to) {
        alert("Debe ingresar hora desde y hasta.");
        return;
    }

    if (timeToMinutes(from) >= timeToMinutes(to)) {
        alert("La hora 'Desde' debe ser anterior a la hora 'Hasta'.");
        return;
    }

    // VALIDACIÓN: Si ya hay alojamiento y se quiere agregar horas extras (no viaje)
    if (hayAlojamientoEnDia(dateStr, tr) && tipo === "extra" && !esAlojamiento) {
        alert(`⚠️ Ya existe un alojamiento para el día ${dateStr}.\nNo se pueden agregar horas extras en ese día (solo viaje).`);
        return;
    }

    // VALIDACIÓN: Si es alojamiento, no puede haber horas extras ese día (viaje sí)
    if (esAlojamiento && hayHorasExtrasEnDia(dateStr, tr)) {
        alert(`⚠️ Ya existen horas extras para el día ${dateStr}.\nNo se puede agregar alojamiento si hay horas extras.`);
        return;
    }

    // VALIDACIÓN: Verificar solapamiento de horarios (no aplica para alojamiento)
    if (!esAlojamiento) {
        const solapamiento = verificarSolapamiento(dateStr, from, to, tr);
        if (solapamiento.solapado) {
            alert(`⚠️ ${solapamiento.mensaje}`);
            return;
        }
    }

    const dayNumber = getDayNumber(dateStr);
    const esDomingo = dayNumber === 0;

    // Procesar según tipo
    if (tipo === "viaje") {
        // VIAJE: calcular horas y enviar a fila viaje
        const horas = calculateHours(from, to);

        // Validar que sea fuera de horario laboral
        if (!isValidExtraTime(dateStr, from, to)) {
            alert("Las horas de viaje deben ser fuera del horario laboral.");
            return;
        }

        agregarHorasViaje(horas);
        marcarFilaCalculada(tr, "viaje", horas);

    } else if (tipo === "extra") {

        if (esAlojamiento) {
            // ALOJAMIENTO: cuenta como 1 día completo
            agregarDiaAlojamiento(1);
            marcarFilaCalculada(tr, "alojamiento", 1);

        } else if (esFeriado || esDomingo) {
            // FERIADO o DOMINGO: horas con factor 200%
            const horas = calculateHours(from, to);

            agregarHorasFeriado(horas);
            marcarFilaCalculada(tr, "feriado", horas);

        } else {
            // HORAS EXTRAS normales (Lunes a Sábado)
            // Validar que sea Lunes a Sábado
            if (dayNumber < 1 || dayNumber > 6) {
                alert("Las horas extras normales solo aplican de Lunes a Sábado.\nPara domingos use la opción 'Feriado'.");
                return;
            }

            const horasExtras = calculateExtraHours(dateStr, from, to);

            if (horasExtras <= 0) {
                alert("Las horas extras deben ser fuera del horario laboral.\nEl horario ingresado está dentro de la jornada laboral.");
                return;
            }

            agregarHorasExtrasLunesSabado(horasExtras);
            marcarFilaCalculada(tr, "extra", horasExtras);
        }
    }

    recalcularTotales();
}

/* ========== AGREGAR HORAS A RECUADROS ========== */

function agregarHorasViaje(horas) {
    const realEl = document.getElementById("real-viaje");
    const ajusEl = document.getElementById("ajus-viaje");

    const currentReal = parseFloat(realEl.value) || 0;
    const newReal = currentReal + horas;

    realEl.value = newReal.toFixed(2);
    ajusEl.value = (newReal * factores.viaje).toFixed(2);
}

function agregarDiaAlojamiento(dias) {
    const realEl = document.getElementById("real-aloj");
    const ajusEl = document.getElementById("ajus-aloj");

    const currentReal = parseFloat(realEl.value) || 0;
    const newReal = currentReal + dias;

    realEl.value = newReal.toFixed(0);
    ajusEl.value = (newReal * factores.alojamiento).toFixed(2);
}

function agregarHorasFeriado(horas) {
    const realEl = document.getElementById("real-feriado");
    const ajusEl = document.getElementById("ajus-feriado");

    const currentReal = parseFloat(realEl.value) || 0;
    const newReal = currentReal + horas;

    realEl.value = newReal.toFixed(2);
    ajusEl.value = (newReal * factores.feriado).toFixed(2);
}

function agregarHorasExtrasLunesSabado(horas) {
    const realEl = document.getElementById("real-extra-finde");
    const ajusEl = document.getElementById("ajus-extra-finde");

    const currentReal = parseFloat(realEl.value) || 0;
    const newReal = currentReal + horas;

    realEl.value = newReal.toFixed(2);
    ajusEl.value = (newReal * factores.extrasLunesSabado).toFixed(2);
}

/* ========== MARCAR FILA COMO CALCULADA ========== */

function marcarFilaCalculada(tr, tipo, valor) {
    tr.classList.add("calculada");
    tr.dataset.tipoCalculado = tipo;
    tr.dataset.valorCalculado = valor;

    // Deshabilitar inputs de la fila
    tr.querySelectorAll("input, select").forEach(el => {
        el.disabled = true;
    });

    // Cambiar botón calcular por check
    const btnCalc = tr.querySelector(".btn-calc");
    btnCalc.innerHTML = '<i class="fa fa-check"></i>';
    btnCalc.classList.remove("btn-primary");
    btnCalc.classList.add("btn-success");
    btnCalc.disabled = true;
}

/* ========== RECALCULAR TOTALES ========== */

function recalcularTotales() {
    let totalViaje = 0;
    let totalAloj = 0;
    let totalFeriado = 0;
    let totalExtras = 0;

    document.querySelectorAll(".hito-row.calculada").forEach(tr => {
        const tipo = tr.dataset.tipoCalculado;
        const valor = parseFloat(tr.dataset.valorCalculado) || 0;

        switch (tipo) {
            case "viaje":
                totalViaje += valor;
                break;
            case "alojamiento":
                totalAloj += valor;
                break;
            case "feriado":
                totalFeriado += valor;
                break;
            case "extra":
                totalExtras += valor;
                break;
        }
    });

    // Actualizar campos reales
    document.getElementById("real-viaje").value = totalViaje.toFixed(2);
    document.getElementById("real-aloj").value = totalAloj.toFixed(0);
    document.getElementById("real-feriado").value = totalFeriado.toFixed(2);
    document.getElementById("real-extra-finde").value = totalExtras.toFixed(2);

    // Calcular ajustados
    const ajusViaje = totalViaje * factores.viaje;
    const ajusAloj = totalAloj * factores.alojamiento;
    const ajusFeriado = totalFeriado * factores.feriado;
    const ajusExtras = totalExtras * factores.extrasLunesSabado;

    document.getElementById("ajus-viaje").value = ajusViaje.toFixed(2);
    document.getElementById("ajus-aloj").value = ajusAloj.toFixed(2);
    document.getElementById("ajus-feriado").value = ajusFeriado.toFixed(2);
    document.getElementById("ajus-extra-finde").value = ajusExtras.toFixed(2);

    // Totales (alojamiento son días, se suma el ajustado)
    const totalReal = totalViaje + totalFeriado + totalExtras;
    const totalAjus = ajusViaje + ajusAloj + ajusFeriado + ajusExtras;

    document.getElementById("real-total").value = totalReal.toFixed(2);
    document.getElementById("ajus-total").value = totalAjus.toFixed(2);
}

/* ========== RESET TIEMPOS ========== */

function resetTiempos() {
    document.getElementById("real-viaje").value = "0";
    document.getElementById("real-aloj").value = "0";
    document.getElementById("real-feriado").value = "0";
    document.getElementById("real-extra-finde").value = "0";

    document.getElementById("ajus-viaje").value = "0";
    document.getElementById("ajus-aloj").value = "0";
    document.getElementById("ajus-feriado").value = "0";
    document.getElementById("ajus-extra-finde").value = "0";

    document.getElementById("real-total").value = "0";
    document.getElementById("ajus-total").value = "0";
}

/* ========== GUARDAR RENDICIÓN ========== */

async function saveRendicion() {
    const msg = document.getElementById("rend-msg");
    msg.textContent = "";
    msg.className = "rend-msg";

    // Recopilar datos generales
    const cliente = document.getElementById("cli").value.trim();
    const guia = document.getElementById("guia").value.trim();
    const trabajo = document.getElementById("trabajo").value.trim();
    const proyecto = document.getElementById("proyecto").value.trim();
    const obs = document.getElementById("obs").value.trim();

    if (!cliente) {
        msg.textContent = "Debe ingresar el cliente.";
        msg.classList.add("err");
        return;
    }

    // Recopilar hitos calculados
    const hitos = [];
    document.querySelectorAll(".hito-row.calculada").forEach(tr => {
        hitos.push({
            day: tr.querySelector(".inp-day").value,
            desde: tr.querySelector(".inp-from").value,
            hasta: tr.querySelector(".inp-to").value,
            tipo: tr.dataset.tipoCalculado,
            valor: parseFloat(tr.dataset.valorCalculado) || 0,
            alojamiento: tr.querySelector(".inp-aloj").checked ? 1 : 0,
            feriado: tr.querySelector(".inp-feriado").checked ? 1 : 0
        });
    });

    if (hitos.length === 0) {
        msg.textContent = "Debe agregar y calcular al menos un hito.";
        msg.classList.add("err");
        return;
    }

    // Obtener totales
    const totalHoras = parseFloat(document.getElementById("ajus-total").value) || 0;

    const payload = {
        cliente,
        guia,
        trabajo,
        proyecto,
        obs,
        hitos,
        total_horas: totalHoras,
        tiempos: {
            viaje: {
                real: parseFloat(document.getElementById("real-viaje").value) || 0,
                ajustado: parseFloat(document.getElementById("ajus-viaje").value) || 0
            },
            alojamiento: {
                real: parseFloat(document.getElementById("real-aloj").value) || 0,
                ajustado: parseFloat(document.getElementById("ajus-aloj").value) || 0
            },
            feriado: {
                real: parseFloat(document.getElementById("real-feriado").value) || 0,
                ajustado: parseFloat(document.getElementById("ajus-feriado").value) || 0
            },
            extras: {
                real: parseFloat(document.getElementById("real-extra-finde").value) || 0,
                ajustado: parseFloat(document.getElementById("ajus-extra-finde").value) || 0
            }
        }
    };

    try {
        const res = await fetch(API_BASE + "/api/rendiciones", {
            method: "POST",
            headers: getHeaders(true),
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
            msg.textContent = data.error || "Error al guardar la rendición.";
            msg.classList.add("err");
            return;
        }

        msg.textContent = data.message || "Rendición guardada correctamente.";
        msg.classList.add("ok");

        // Limpiar formulario después de 2 segundos
        setTimeout(() => {
            limpiarFormulario();
        }, 2000);

    } catch (err) {
        console.error(err);
        msg.textContent = "Error de red: " + err.message;
        msg.classList.add("err");
    }
}

function limpiarFormulario() {
    document.getElementById("cli").value = "";
    document.getElementById("guia").value = "";
    document.getElementById("trabajo").value = "";
    document.getElementById("proyecto").value = "";
    document.getElementById("obs").value = "";
    document.getElementById("hitos-body").innerHTML = "";
    resetTiempos();
    document.getElementById("rend-msg").textContent = "";
    document.getElementById("rend-msg").className = "rend-msg";
}

function cancelRendicion() {
    if (confirm("¿Está seguro de cancelar? Se perderán los datos ingresados.")) {
        limpiarFormulario();
    }
}

/* ========== EVENTOS ========== */

document.getElementById("btn-add-hito").onclick = addHitoRow;
document.getElementById("btn-save").onclick = saveRendicion;
document.getElementById("btn-cancel").onclick = cancelRendicion;

/* ========== INIT ========== */

(async function init() {
    await loadUser();
    await loadWorkSchedule();
    await loadFactores();
})();
