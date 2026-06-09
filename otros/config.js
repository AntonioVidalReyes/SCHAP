// ============================================
// CONFIGURACIÓN DE ENTORNO
// ============================================
// Modificar estos valores según el entorno (desarrollo, producción, etc.)

const ENV = {
    // ========== API ==========
    API_HOST: "127.0.0.1",
    API_PORT: 3000,
    API_PROTOCOL: "http",

    // ========== APLICACIÓN ==========
    APP_NAME: "SCHA CPA",
    APP_VERSION: "1.0.0",
    APP_YEAR: new Date().getFullYear(),

    // ========== EMPRESA ==========
    COMPANY_NAME: "SCHA",
    COMPANY_EMAIL: "contacto@scha.cl",
    COMPANY_PHONE: "+56 9 1234 5678",

    // ========== SESIÓN ==========
    SESSION_TIMEOUT_MINUTES: 480,           // 8 horas
    SESSION_WARNING_MINUTES: 15,            // Avisar 15 min antes de expirar
    TOKEN_KEY: "authToken",                 // Nombre de la key en localStorage
    USER_KEY: "currentUser",                // Key para datos del usuario

    // ========== UI / UX ==========
    ITEMS_PER_PAGE: 10,                     // Items por página en tablas
    ITEMS_PER_PAGE_OPTIONS: [10, 25, 50],   // Opciones de paginación
    TOAST_DURATION_MS: 3000,                // Duración de notificaciones
    DEBOUNCE_DELAY_MS: 300,                 // Delay para búsquedas

    // ========== FECHAS ==========
    DATE_FORMAT: "es-CL",                   // Formato de fecha regional
    TIMEZONE: "America/Santiago",           // Zona horaria
    FIRST_DAY_OF_WEEK: 1,                   // 0 = Domingo, 1 = Lunes

    // ========== HORARIOS POR DEFECTO ==========
    DEFAULT_WORK_START: "08:30",
    DEFAULT_WORK_END: "18:30",
    DEFAULT_WORK_DAYS: ["monday", "tuesday", "wednesday", "thursday", "friday"],

    // ========== FACTORES POR DEFECTO ==========
    DEFAULT_FACTOR_ALOJAMIENTO: 4.5,        // Horas por día
    DEFAULT_FACTOR_FERIADO: 200,            // Porcentaje
    DEFAULT_FACTOR_EXTRAS: 150,             // Porcentaje
    DEFAULT_FACTOR_VIAJE: 50,               // Porcentaje

    // ========== LÍMITES ==========
    MAX_FILE_SIZE_MB: 10,                   // Tamaño máximo de archivos
    MAX_COMMENT_LENGTH: 500,                // Longitud máxima de comentarios
    MAX_HITOS_PER_RENDICION: 50,            // Máximo de hitos por rendición
    MIN_PASSWORD_LENGTH: 6,                 // Longitud mínima de contraseña

    // ========== ROLES ==========
    ROLES: {
        ADMIN: "administrador",
        JEFE: "jefe",
        TRABAJADOR: "trabajador"
    },

    // ========== ESTADOS DE SOLICITUDES ==========
    STATUS: {
        PENDIENTE: "pendiente",
        PENDIENTE_JEFE: "pendiente_jefe",
        PENDIENTE_ADMIN: "pendiente_admin",
        APROBADO: "aprobado",
        APROBADO_JEFE: "aprobado_jefe",
        APROBADO_ADMIN: "aprobado_admin",
        RECHAZADO: "rechazado",
        RECHAZADO_JEFE: "rechazado_jefe",
        RECHAZADO_ADMIN: "rechazado_admin",
        INFORMATIVA: "informativa"
    },

    // ========== TIPOS DE SOLICITUD ==========
    REQUEST_TYPES: {
        PERMISO: "Permiso",
        NOTIFICACION: "Notificación",
        RENDICION: "Rendición"
    },

    // ========== COLORES DEL SISTEMA ==========
    COLORS: {
        PRIMARY: "#3498db",
        SUCCESS: "#27ae60",
        WARNING: "#f39c12",
        DANGER: "#e74c3c",
        INFO: "#17a2b8",
        PENDIENTE: "#f1c40f",
        APROBADO: "#2ecc71",
        RECHAZADO: "#e74c3c",
        NOTIFICACION: "#3498db"
    },

    // ========== DEBUG ==========
    DEBUG_MODE: false,                      // Activar logs de debug
    LOG_API_CALLS: false                    // Loggear llamadas a la API
};

// ============================================
// PROPIEDADES COMPUTADAS (no modificar)
// ============================================

// URL base de la API
ENV.API_BASE = `${ENV.API_PROTOCOL}://${ENV.API_HOST}:${ENV.API_PORT}`;

// Copyright
ENV.COPYRIGHT = `© ${ENV.APP_YEAR} ${ENV.COMPANY_NAME} ${ENV.APP_NAME}`;

// ============================================
// FUNCIONES HELPER
// ============================================

/**
 * Obtiene los headers de autenticación
 * @param {boolean} json - Si incluir Content-Type JSON
 * @returns {Object} Headers para fetch
 */
function getAuthHeaders(json = false) {
    const token = localStorage.getItem(ENV.TOKEN_KEY);
    const headers = {};

    if (token) {
        headers["Authorization"] = "Bearer " + token;
    }

    if (json) {
        headers["Content-Type"] = "application/json";
    }

    return headers;
}

/**
 * Verifica si el usuario está autenticado
 * @returns {boolean}
 */
function isAuthenticated() {
    return !!localStorage.getItem(ENV.TOKEN_KEY);
}

/**
 * Obtiene el token actual
 * @returns {string|null}
 */
function getToken() {
    return localStorage.getItem(ENV.TOKEN_KEY);
}

/**
 * Guarda el token de autenticación
 * @param {string} token
 */
function setToken(token) {
    localStorage.setItem(ENV.TOKEN_KEY, token);
}

/**
 * Elimina el token (logout)
 */
function clearToken() {
    localStorage.removeItem(ENV.TOKEN_KEY);
    localStorage.removeItem(ENV.USER_KEY);
    localStorage.removeItem("isDefaultUser");
}

/**
 * Redirige al login si no está autenticado
 */
function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = "index.html";
        return false;
    }
    return true;
}

/**
 * Formatea una fecha según la configuración regional
 * @param {string|Date} dateStr
 * @param {Object} options - Opciones de formato
 * @returns {string}
 */
function formatDate(dateStr, options = {}) {
    if (!dateStr) return "";

    const date = new Date(dateStr);
    if (isNaN(date)) return dateStr;

    const defaultOptions = {
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...options
    };

    return date.toLocaleDateString(ENV.DATE_FORMAT, defaultOptions);
}

/**
 * Formatea fecha y hora
 * @param {string|Date} dateStr
 * @returns {string}
 */
function formatDateTime(dateStr) {
    if (!dateStr) return "";

    const date = new Date(dateStr);
    if (isNaN(date)) return dateStr;

    return date.toLocaleString(ENV.DATE_FORMAT, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

/**
 * Formatea un número con decimales
 * @param {number} num
 * @param {number} decimals
 * @returns {string}
 */
function formatNumber(num, decimals = 1) {
    return (num || 0).toFixed(decimals);
}

/**
 * Verifica si un estado es "aprobado"
 * @param {string} status
 * @returns {boolean}
 */
function isApproved(status) {
    return [
        ENV.STATUS.APROBADO,
        ENV.STATUS.APROBADO_JEFE,
        ENV.STATUS.APROBADO_ADMIN
    ].includes(status);
}

/**
 * Verifica si un estado es "rechazado"
 * @param {string} status
 * @returns {boolean}
 */
function isRejected(status) {
    return [
        ENV.STATUS.RECHAZADO,
        ENV.STATUS.RECHAZADO_JEFE,
        ENV.STATUS.RECHAZADO_ADMIN,
        "rechazada"
    ].includes(status);
}

/**
 * Verifica si un estado es "pendiente"
 * @param {string} status
 * @returns {boolean}
 */
function isPending(status) {
    return [
        ENV.STATUS.PENDIENTE,
        ENV.STATUS.PENDIENTE_JEFE,
        ENV.STATUS.PENDIENTE_ADMIN
    ].includes(status);
}

/**
 * Obtiene el color según el estado
 * @param {string} status
 * @returns {string}
 */
function getStatusColor(status) {
    if (isApproved(status)) return ENV.COLORS.APROBADO;
    if (isRejected(status)) return ENV.COLORS.RECHAZADO;
    if (isPending(status)) return ENV.COLORS.PENDIENTE;
    if (status === ENV.STATUS.INFORMATIVA) return ENV.COLORS.NOTIFICACION;
    return ENV.COLORS.PRIMARY;
}

/**
 * Traduce el estado a texto legible
 * @param {string} status
 * @returns {string}
 */
function getStatusText(status) {
    const map = {
        [ENV.STATUS.PENDIENTE]: "Pendiente",
        [ENV.STATUS.PENDIENTE_JEFE]: "Pendiente (Jefe)",
        [ENV.STATUS.PENDIENTE_ADMIN]: "Pendiente (Admin)",
        [ENV.STATUS.APROBADO]: "Aprobado",
        [ENV.STATUS.APROBADO_JEFE]: "Aprobado (Jefe)",
        [ENV.STATUS.APROBADO_ADMIN]: "Aprobado (Admin)",
        [ENV.STATUS.RECHAZADO]: "Rechazado",
        [ENV.STATUS.RECHAZADO_JEFE]: "Rechazado (Jefe)",
        [ENV.STATUS.RECHAZADO_ADMIN]: "Rechazado (Admin)",
        [ENV.STATUS.INFORMATIVA]: "Informativa",
        "rechazada": "Rechazada"
    };
    return map[status] || status || "-";
}

/**
 * Log de debug (solo si DEBUG_MODE está activo)
 * @param  {...any} args
 */
function debugLog(...args) {
    if (ENV.DEBUG_MODE) {
        console.log("[DEBUG]", ...args);
    }
}

/**
 * Log de llamadas API (solo si LOG_API_CALLS está activo)
 * @param {string} method
 * @param {string} url
 * @param {Object} data
 */
function logApiCall(method, url, data = null) {
    if (ENV.LOG_API_CALLS) {
        console.log(`[API] ${method} ${url}`, data || "");
    }
}

/**
 * Trunca un texto a una longitud máxima
 * @param {string} str
 * @param {number} maxLength
 * @returns {string}
 */
function truncate(str, maxLength = 50) {
    if (!str) return "";
    return str.length > maxLength ? str.substring(0, maxLength) + "..." : str;
}

/**
 * Muestra una notificación toast
 * @param {string} message
 * @param {string} type - "success", "error", "warning", "info"
 */
function showToast(message, type = "info") {
    // Crear toast si no existe
    let toast = document.getElementById("app-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "app-toast";
        toast.className = "app-toast";
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = `app-toast app-toast--${type} app-toast--visible`;

    setTimeout(() => {
        toast.classList.remove("app-toast--visible");
    }, ENV.TOAST_DURATION_MS);
}

// ============================================
// EXPORTAR PARA USO GLOBAL
// ============================================

// Hacer ENV disponible globalmente
window.ENV = ENV;

// Compatibilidad con código existente
const API_BASE = ENV.API_BASE;