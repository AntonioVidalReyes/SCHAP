
// Variable para almacenar el email durante la recuperación
let recoveryEmail = "";

function showView(id) {
  document.getElementById("view-login").style.display = (id === "login") ? "block" : "none";
  document.getElementById("view-register").style.display = (id === "register") ? "block" : "none";
  document.getElementById("view-recovery").style.display = (id === "recovery") ? "block" : "none";
  document.getElementById("view-reset").style.display = (id === "reset") ? "block" : "none";
}

// ==================== LOGIN ====================

async function login() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";

  try {
    const res = await fetch(API_BASE + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      errorEl.textContent = "Respuesta inesperada del servidor.";
      return;
    }

    if (!res.ok) {
      errorEl.textContent = data.error || "Credenciales inválidas.";
      return;
    }

    if (!data.token) {
      errorEl.textContent = "Login correcto pero sin token.";
      return;
    }

    localStorage.setItem("authToken", data.token);

    // Verificar si es usuario por defecto
    if (data.is_default_user) {
      localStorage.setItem("isDefaultUser", "true");
    } else {
      localStorage.removeItem("isDefaultUser");
    }

    window.location.href = "inicio.html";
  } catch (err) {
    errorEl.textContent = "Error de red: " + err.message;
  }
}

// ==================== REGISTRO ====================

async function registerUser() {
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const msg = document.getElementById("reg-msg");
  msg.style.color = "#e74c3c";
  msg.textContent = "";

  if (!name || !email || !password) {
    msg.textContent = "Todos los campos son obligatorios.";
    return;
  }

  try {
    const res = await fetch(API_BASE + "/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      msg.textContent = "Respuesta inesperada del servidor.";
      return;
    }

    if (!res.ok) {
      msg.textContent = data.error || "No se pudo crear el usuario.";
      return;
    }

    msg.style.color = "#27ae60";
    msg.textContent = "Usuario creado. Ahora puedes iniciar sesión.";
    setTimeout(() => {
      msg.textContent = "";
      msg.style.color = "#e74c3c";
      showView("login");
    }, 1500);
  } catch (err) {
    msg.textContent = "Error de red: " + err.message;
  }
}

// ==================== RECUPERAR CONTRASEÑA ====================

async function sendRecoveryCode() {
  const email = document.getElementById("recovery-email").value.trim();
  const msg = document.getElementById("recovery-msg");
  msg.style.color = "#e74c3c";
  msg.textContent = "";

  if (!email) {
    msg.textContent = "Ingrese su correo electrónico.";
    return;
  }

  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    msg.textContent = "Ingrese un correo electrónico válido.";
    return;
  }

  try {
    const res = await fetch(API_BASE + "/api/password-recovery/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || "No se pudo enviar el código.";
      return;
    }

    // Guardar email para el siguiente paso
    recoveryEmail = email;

    // Mostrar mensaje de éxito
    msg.style.color = "#27ae60";
    msg.textContent = "Código enviado. Revise su correo electrónico.";

    // Ir al paso 2 después de 1.5 segundos
    setTimeout(() => {
      msg.textContent = "";
      msg.style.color = "#e74c3c";
      showView("reset");
    }, 1500);

  } catch (err) {
    msg.textContent = "Error de red: " + err.message;
  }
}

async function resetPassword() {
  const code = document.getElementById("reset-code").value.trim();
  const password = document.getElementById("reset-password").value;
  const passwordConfirm = document.getElementById("reset-password-confirm").value;
  const msg = document.getElementById("reset-msg");
  msg.style.color = "#e74c3c";
  msg.textContent = "";

  // Validaciones
  if (!code) {
    msg.textContent = "Ingrese el código de verificación.";
    return;
  }

  if (code.length !== 6) {
    msg.textContent = "El código debe tener 6 dígitos.";
    return;
  }

  if (!password || password.length < 4) {
    msg.textContent = "La contraseña debe tener al menos 4 caracteres.";
    return;
  }

  if (password !== passwordConfirm) {
    msg.textContent = "Las contraseñas no coinciden.";
    return;
  }

  try {
    const res = await fetch(API_BASE + "/api/password-recovery/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: recoveryEmail,
        code: code,
        new_password: password
      })
    });

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || "No se pudo cambiar la contraseña.";
      return;
    }

    // Éxito
    msg.style.color = "#27ae60";
    msg.textContent = "¡Contraseña actualizada! Ahora puede iniciar sesión.";

    // Limpiar campos
    document.getElementById("reset-code").value = "";
    document.getElementById("reset-password").value = "";
    document.getElementById("reset-password-confirm").value = "";
    recoveryEmail = "";

    // Volver al login después de 2 segundos
    setTimeout(() => {
      msg.textContent = "";
      msg.style.color = "#e74c3c";
      showView("login");
    }, 2000);

  } catch (err) {
    msg.textContent = "Error de red: " + err.message;
  }
}

// ==================== VERIFICAR ESTADO DEL SISTEMA ====================

async function checkSystemSetup() {
  const defaultCredentials = document.getElementById("default-credentials");
  const postSetupLinks = document.getElementById("post-setup-links");
  const registerLink = document.getElementById("register-link");

  try {
    const res = await fetch(API_BASE + "/api/check-setup");
    const data = await res.json();

    if (data.setup_complete) {
      // Ya hay un admin real configurado
      // Ocultar credenciales por defecto
      if (defaultCredentials) {
        defaultCredentials.style.display = "none";
      }
      // Mostrar enlaces de recuperación
      if (postSetupLinks) {
        postSetupLinks.style.display = "block";
      }

      // Verificar si el registro público está habilitado
      try {
        const regRes = await fetch(API_BASE + "/api/config/public-registration");
        const regData = await regRes.json();

        if (registerLink) {
          registerLink.style.display = regData.enabled ? "block" : "none";
        }
      } catch (err) {
        console.log("No se pudo verificar estado de registro público");
        // Por defecto mostrar el enlace
        if (registerLink) {
          registerLink.style.display = "block";
        }
      }
    } else {
      // Solo existe usuario por defecto, mostrar ayuda
      if (defaultCredentials) {
        defaultCredentials.style.display = "block";
      }
      // Ocultar enlaces de registro y recuperación
      if (postSetupLinks) {
        postSetupLinks.style.display = "none";
      }
    }
  } catch (err) {
    console.log("No se pudo verificar el estado del sistema:", err);
    // En caso de error, ocultar todo por seguridad
    if (defaultCredentials) {
      defaultCredentials.style.display = "none";
    }
    if (postSetupLinks) {
      postSetupLinks.style.display = "none";
    }
  }
}

// ==================== INICIALIZACIÓN ====================

// Botones
document.getElementById("btn-login").onclick = login;
document.getElementById("btn-register").onclick = registerUser;
document.getElementById("btn-send-code").onclick = sendRecoveryCode;
document.getElementById("btn-reset-password").onclick = resetPassword;

// Enlaces de navegación
document.getElementById("link-show-register").onclick = e => { e.preventDefault(); showView("register"); };
document.getElementById("link-show-login").onclick = e => { e.preventDefault(); showView("login"); };
document.getElementById("link-show-recovery").onclick = e => { e.preventDefault(); showView("recovery"); };
document.getElementById("link-back-login").onclick = e => { e.preventDefault(); showView("login"); };
document.getElementById("link-back-login-2").onclick = e => { e.preventDefault(); showView("login"); };

// Permitir login con Enter
document.getElementById("login-password").addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    login();
  }
});

document.getElementById("login-email").addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    document.getElementById("login-password").focus();
  }
});

// Permitir enviar código con Enter
document.getElementById("recovery-email").addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    sendRecoveryCode();
  }
});

// Permitir reset con Enter en el último campo
document.getElementById("reset-password-confirm").addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    resetPassword();
  }
});

// Inicializar
showView("login");
checkSystemSetup();
