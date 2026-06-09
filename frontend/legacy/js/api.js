window.API_BASE = "http://127.0.0.1:3000";

(function() {
  const originalFetch = window.fetch;

  window.fetch = async function(url, options = {}) {
    const origin = window.location.origin;
    // Detectar si estamos en local (abriendo archivo local o live server en VSCode)
    const isLocalFile = origin.startsWith("file://") || 
                        origin.includes("localhost:5500") || 
                        origin.includes("127.0.0.1:5500");

    let cleanUrl = url;

    // Si no estamos en desarrollo local directo, reescribir URLs para pasar por el Proxy de Nginx
    if (!isLocalFile && typeof url === "string") {
      if (url.includes("127.0.0.1:3000/api")) {
        cleanUrl = url.replace(/https?:\/\/127\.0\.0\.1:3000\/api/, "/api");
      } else if (url.includes("localhost:3000/api")) {
        cleanUrl = url.replace(/https?:\/\/localhost:3000\/api/, "/api");
      }
    }

    // Asegurar estructura de cabeceras
    options.headers = options.headers || {};
    
    // Inyectar Token de Autenticación automáticamente si existe
    const token = localStorage.getItem("authToken");
    if (token) {
      if (typeof options.headers.set === "function") {
        if (!options.headers.has("Authorization")) {
          options.headers.set("Authorization", "Bearer " + token);
        }
      } else if (Array.isArray(options.headers)) {
        const hasAuth = options.headers.some(h => h[0].toLowerCase() === 'authorization');
        if (!hasAuth) {
          options.headers.push(['Authorization', 'Bearer ' + token]);
        }
      } else {
        if (!options.headers["Authorization"] && !options.headers["authorization"]) {
          options.headers["Authorization"] = "Bearer " + token;
        }
      }
    }

    try {
      const response = await originalFetch(cleanUrl, options);

      // Interceptar expiración de sesión (401 o 403)
      if (response.status === 401) {
        localStorage.removeItem("authToken");
        localStorage.removeItem("isDefaultUser");
        
        // Redirigir a login si no estamos ya en la página de login
        if (!window.location.pathname.endsWith("index.html") && 
            !window.location.pathname.endsWith("/") &&
            window.location.pathname !== "") {
          window.location.href = "index.html";
        }
      }

      return response;
    } catch (error) {
      console.error("[FETCH INTERCEPTOR ERROR]:", error);
      throw error;
    }
  };

  // Exportar también una interfaz opcional
  window.api = {
    get: (endpoint) => fetch(endpoint),
    post: (endpoint, data) => fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }),
    patch: (endpoint, data) => fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }),
    delete: (endpoint, data) => fetch(endpoint, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
  };
})();
