
let authToken = localStorage.getItem("authToken");
let currentUser = null;
let currentEventRequestId = null;
let calendar = null;
let workSchedule = null; // Horario laboral desde la API

function getHeaders() {
  return { "Authorization": "Bearer " + authToken };
}

/* ========== USER LOGUEADO ========== */

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
  setupHeaderNav("calendario");

  const footerUser = document.getElementById("footer-user");
  if (footerUser) {
    footerUser.textContent =
      "Usuario: " + currentUser.name + " (" + currentUser.role + ")";
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

/* ========== GENERAR EVENTOS DE HORARIO LABORAL ========== */

// Genera eventos de fondo para mostrar horarios laborales
function generateWorkScheduleEvents(startDate, endDate) {
  if (!workSchedule) return [];

  const events = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  while (current <= end) {
    const dayName = dayNames[current.getDay()];
    const daySchedule = workSchedule[dayName];

    if (daySchedule && !daySchedule.off && daySchedule.start && daySchedule.end) {
      const dateStr = current.toISOString().split("T")[0];

      // Evento de horario laboral (fondo verde claro)
      events.push({
        start: `${dateStr}T${daySchedule.start}:00`,
        end: `${dateStr}T${daySchedule.end}:00`,
        display: "background",
        backgroundColor: "rgba(46, 204, 113, 0.15)",
        classNames: ["work-hours-bg"]
      });
    }

    // Avanzar al siguiente día
    current.setDate(current.getDate() + 1);
  }

  return events;
}

/* ========== CARGA DE SOLICITUDES → EVENTOS ========== */

async function loadRequestsEvents() {
  // Siempre cargar todas las solicitudes (mine=0) para que todos vean el calendario completo
  const res = await fetch(API_BASE + "/api/requests?mine=0", {
    headers: getHeaders()
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!res.ok) return [];

  return (data.requests || [])
    // Filtrar tipo Abono - no se muestra en calendario
    .filter(r => r.type !== "Abono")
    .map(r => {
      /* ================== FECHA / HORA ================== */

      let startISO = null;
      let endISO = null;

      // 1) Caso notificación / registros con day / from / to
      if (r.day && r.from) {
        const day = r.day;
        let fromTime = r.from;
        let toTime = r.to || "";

        if (fromTime.length === 5) fromTime += ":00";
        if (toTime && toTime.length === 5) toTime += ":00";

        startISO = `${day}T${fromTime}`;

        if (toTime) {
          endISO = `${day}T${toTime}`;
        } else {
          const hours = r.hours || 1;
          const [fh, fm] = r.from.split(":").map(x => parseInt(x, 10) || 0);
          const startMin = fh * 60 + fm;
          const endMin = startMin + hours * 60;
          const endH = Math.floor(endMin / 60) % 24;
          const endM = endMin % 60;

          endISO = `${day}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;
        }

      } else {
        const rawDateTime = r.date || r.created_at || "";
        if (!rawDateTime) return null;

        if (rawDateTime.length > 10) {
          let datePart = "";
          let timePart = "";

          if (rawDateTime.includes("T")) {
            [datePart, timePart] = rawDateTime.split("T");
          } else if (rawDateTime.includes(" ")) {
            [datePart, timePart] = rawDateTime.split(" ");
          } else {
            datePart = rawDateTime.slice(0, 10);
            timePart = rawDateTime.slice(11);
          }

          datePart = datePart || rawDateTime.slice(0, 10);
          timePart = (timePart || "").trim();
          if (!timePart) timePart = "00:00:00";
          if (timePart.length === 5) timePart += ":00";

          startISO = `${datePart}T${timePart}`;
        } else {
          startISO = `${rawDateTime}T09:00:00`;
        }

        const hours = r.hours || 1;
        const [sh, sm, ss] = startISO.split("T")[1].split(":").map(x => parseInt(x, 10) || 0);
        const baseDay = startISO.split("T")[0];

        const startMin = sh * 60 + sm;
        const endMin = startMin + hours * 60;
        const endH = Math.floor(endMin / 60) % 24;
        const endM = endMin % 60;

        endISO = `${baseDay}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
      }

      /* ================== COLORES ================== */

      let color;

      if (r.type === "notificacion" || r.type === "Notificación" || r.status === "informativa") {
        color = "#3498db"; // azul
      } else if (r.status === "pendiente" || r.status === "pendiente_jefe") {
        color = "#f1c40f"; // amarillo
      } else if (r.status === "rechazado" || r.status === "rechazada") {
        color = "#e74c3c"; // rojo
      } else {
        color = "#2ecc71"; // verde (aprobado / por defecto)
      }

      /* ================== TÍTULO ================== */

      // Siempre mostrar el nombre del usuario para que todos puedan identificar de quién es
      const userName = r.user_name || "Usuario";
      const comment = r.comment || "Permiso";
      const title = `${userName} - ${comment}`;

      return {
        title,
        start: startISO,
        end: endISO,
        backgroundColor: color,
        borderColor: color,
        textColor: (r.status === "pendiente" || r.status === "pendiente_jefe") ? "#1e293b" : "#ffffff",
        extendedProps: {
          requestId: r.id,
          rawDate: r.day || r.date || r.created_at || "",
          hours: r.hours || 0,
          status: r.status || "",
          type: r.type || "",
          comment: r.comment || "",
          userName: r.user_name || "",
          createdAt: r.created_at || ""
        }
      };
    })
    .filter(e => e !== null);
}

/* ========== POPUP DE DETALLE DE EVENTO ========== */

function ensureEventDetailPopup() {
  let overlay = document.getElementById("event-detail-overlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "event-detail-overlay";
  overlay.className = "event-overlay";

  const box = document.createElement("div");
  box.className = "event-modal";

  box.innerHTML = `
    <div class="event-modal__header">
      <h4 id="ev-title" class="event-modal__title"></h4>
      <button type="button" id="ev-close" class="event-modal__close">&times;</button>
    </div>
    <div id="ev-body" class="event-modal__body"></div>
    <div class="event-modal__footer">
      <button type="button" id="ev-detail" class="btn btn-secondary btn-sm">
        Ver detalles
      </button>
      <button type="button" id="ev-ok" class="btn btn-primary btn-sm">
        Cerrar
      </button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById("ev-close").onclick = hideEventDetailPopup;
  document.getElementById("ev-ok").onclick = hideEventDetailPopup;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) hideEventDetailPopup();
  });

  const btnDetail = document.getElementById("ev-detail");
  btnDetail.onclick = () => {
    if (currentEventRequestId) {
      window.location.href =
        "detalle_solicitud.html?id=" + encodeURIComponent(currentEventRequestId);
    }
  };

  return overlay;
}

function showEventDetailPopup(event) {
  const overlay = ensureEventDetailPopup();

  const titleEl = document.getElementById("ev-title");
  const bodyEl = document.getElementById("ev-body");

  const start = event.start;
  const end = event.end || start;
  const props = event.extendedProps || {};

  currentEventRequestId = props.requestId || null;

  const fmtDate = d => d.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  const fmtTime = d => d.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit"
  });

  const fechaStr = fmtDate(start);
  const horaStr = `${fmtTime(start)} - ${fmtTime(end)}`;

  const statusMap = {
    pendiente: "Pendiente",
    pendiente_jefe: "Pendiente de jefe",
    aprobado: "Aprobado",
    rechazada: "Rechazado",
    rechazado: "Rechazado",
    informativa: "Informativa"
  };
  const estado = statusMap[props.status] || (props.status || "-");

  const tipo = props.type || "Permiso / Notificación";
  const horas = props.hours ? props.hours + " horas" : "-";
  const comentario = props.comment || "(Sin comentario)";
  const usuario = props.userName || (currentUser ? currentUser.name : "-") || "-";

  if (titleEl) titleEl.textContent = tipo;

  if (bodyEl) {
    bodyEl.innerHTML = `
      <div><strong>Usuario:</strong> ${usuario}</div>
      <div><strong>Fecha:</strong> ${fechaStr}</div>
      <div><strong>Horario:</strong> ${horaStr}</div>
      <div><strong>Horas:</strong> ${horas}</div>
      <div><strong>Estado:</strong> ${estado}</div>
      <div style="margin-top:6px;">
        <strong>Comentario:</strong><br>${comentario}
      </div>
    `;
  }

  overlay.classList.add("event-overlay--visible");
}

function hideEventDetailPopup() {
  const overlay = document.getElementById("event-detail-overlay");
  if (overlay) {
    overlay.classList.remove("event-overlay--visible");
  }
}

/* ========== CALENDARIO ========== */

function initCalendar(requestEvents) {
  const calendarEl = document.getElementById("calendar");

  // Calcular rango de fechas para generar eventos de horario
  const today = new Date();
  const startRange = new Date(today);
  startRange.setMonth(startRange.getMonth() - 1); // 1 mes antes
  const endRange = new Date(today);
  endRange.setMonth(endRange.getMonth() + 3); // 3 meses después

  // Generar eventos de fondo solo para horarios laborales
  const workHoursEvents = generateWorkScheduleEvents(startRange, endRange);

  // Combinar todos los eventos
  const allEvents = [
    ...workHoursEvents,    // Horarios laborales (fondo)
    ...requestEvents       // Solicitudes/notificaciones (eventos normales)
  ];

  console.log("Eventos de horario laboral:", workHoursEvents.length);
  console.log("Eventos de solicitudes:", requestEvents.length);

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "timeGridWeek",
    locale: "es",
    firstDay: 1,
    headerToolbar: false,
    slotMinTime: "00:00:00",  // Mostrar desde las 00:00
    slotMaxTime: "23:59:59",  // Mostrar hasta las 23:59
    events: allEvents,
    eventClick: function (info) {
      // Solo mostrar popup para eventos que no son de fondo
      if (info.event.display === "background") return;
      info.jsEvent.preventDefault();
      showEventDetailPopup(info.event);
    },
    // Actualizar eventos de fondo cuando cambia la vista
    datesSet: function (info) {
      updateWorkScheduleBackground(info.start, info.end);
    }
  });

  calendar.render();
  updateRangeLabel();

  // Agregar leyenda
  addScheduleLegend();

  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnToday = document.getElementById("btn-today");
  const btnMonth = document.getElementById("btn-month");
  const btnWeek = document.getElementById("btn-week");
  const btnDay = document.getElementById("btn-day");

  if (btnPrev) btnPrev.onclick = () => { calendar.prev(); updateRangeLabel(); };
  if (btnNext) btnNext.onclick = () => { calendar.next(); updateRangeLabel(); };
  if (btnToday) btnToday.onclick = () => { calendar.today(); updateRangeLabel(); };

  if (btnMonth) btnMonth.onclick = () => {
    calendar.changeView("dayGridMonth");
    setActiveViewButton("btn-month");
    updateRangeLabel();
  };
  if (btnWeek) btnWeek.onclick = () => {
    calendar.changeView("timeGridWeek");
    setActiveViewButton("btn-week");
    updateRangeLabel();
  };
  if (btnDay) btnDay.onclick = () => {
    calendar.changeView("timeGridDay");
    setActiveViewButton("btn-day");
    updateRangeLabel();
  };
}

// Actualiza los eventos de fondo cuando cambia el rango de fechas
function updateWorkScheduleBackground(start, end) {
  if (!calendar || !workSchedule) return;

  // Remover eventos de fondo anteriores
  const existingBgEvents = calendar.getEvents().filter(e => e.display === "background");
  existingBgEvents.forEach(e => e.remove());

  // Agregar nuevos eventos de fondo (solo horarios laborales)
  const workHoursEvents = generateWorkScheduleEvents(start, end);

  workHoursEvents.forEach(eventData => {
    calendar.addEvent(eventData);
  });
}

// Agrega una leyenda visual al calendario
function addScheduleLegend() {
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) return;

  // Verificar si ya existe la leyenda
  if (document.getElementById("calendar-legend")) return;

  const legend = document.createElement("div");
  legend.id = "calendar-legend";
  legend.className = "calendar-legend";
  legend.innerHTML = `
    <div class="legend-title">Leyenda:</div>
    <div class="legend-items">
      <div class="legend-item">
        <span class="legend-color" style="background: rgba(46, 204, 113, 0.3);"></span>
        <span>Horario laboral</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background: #3498db;"></span>
        <span>Notificación</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background: #f1c40f;"></span>
        <span>Pendiente</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background: #2ecc71;"></span>
        <span>Aprobado</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background: #e74c3c;"></span>
        <span>Rechazado</span>
      </div>
    </div>
  `;

  // Insertar antes del calendario
  calendarEl.parentNode.insertBefore(legend, calendarEl);

  // Agregar estilos si no existen
  if (!document.getElementById("calendar-legend-styles")) {
    const styles = document.createElement("style");
    styles.id = "calendar-legend-styles";
    styles.textContent = `
      .calendar-legend {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px 16px;
        background: #f8f9fa;
        border-radius: 8px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }
      .legend-title {
        font-weight: 600;
        color: #333;
      }
      .legend-items {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
      }
      .legend-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: #555;
      }
      .legend-color {
        width: 16px;
        height: 16px;
        border-radius: 4px;
        border: 1px solid rgba(0,0,0,0.1);
      }
      
      /* Estilos para eventos de fondo */
      .fc .work-hours-bg {
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(styles);
  }
}

function setActiveViewButton(id) {
  ["btn-month", "btn-week", "btn-day"].forEach(btnId => {
    const b = document.getElementById(btnId);
    if (b) b.classList.toggle("active", btnId === id);
  });
}

function updateRangeLabel() {
  if (!calendar) return;
  const view = calendar.view;
  const start = view.currentStart;
  const end = new Date(view.currentEnd.getTime() - 86400000);
  const fmt = d => d.toLocaleDateString("es-CL", {
    day: "2-digit", month: "short", year: "numeric"
  });

  const label = document.getElementById("range-label");
  if (label) {
    label.innerText = fmt(start) + " - " + fmt(end);
  }
}

/* ========== INIT ========== */

(async function init() {
  await loadUser();
  await loadWorkSchedule(); // Cargar horario laboral
  const events = await loadRequestsEvents();
  initCalendar(events);
})();
