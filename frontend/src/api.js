// Centralized API handler for React SCHAP SPA

// During production (Docker), API requests are proxied via Nginx (/api), 
// but in development we can fallback to the proxy or backend port.
export const API_BASE = window.location.origin.includes('localhost:5173') || window.location.origin.includes('127.0.0.1:5173')
  ? '' // Uses Vite Proxy in development
  : ''; // Relative paths for Nginx in production

async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  
  options.headers = options.headers || {};
  
  const token = localStorage.getItem("authToken");
  if (token) {
    options.headers["Authorization"] = `Bearer ${token}`;
  }
  
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, options);
    
    if (response.status === 401) {
      localStorage.removeItem("authToken");
      localStorage.removeItem("isDefaultUser");
      
      // Redirect to login page if we aren't there
      if (!window.location.pathname.endsWith("/login") && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    
    return response;
  } catch (error) {
    console.error("[API ERROR]:", error);
    throw error;
  }
}

export const api = {
  get: (endpoint, headers = {}) => request(endpoint, { method: 'GET', headers }),
  post: (endpoint, body, headers = {}) => request(endpoint, { method: 'POST', body, headers }),
  patch: (endpoint, body, headers = {}) => request(endpoint, { method: 'PATCH', body, headers }),
  delete: (endpoint, body, headers = {}) => request(endpoint, { method: 'DELETE', body, headers })
};

export default api;
