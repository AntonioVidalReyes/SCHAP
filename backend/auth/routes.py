import random
import string
import json
import re
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
from werkzeug.security import check_password_hash, generate_password_hash

from db import db, User, ConfigModel
from auth.tokens import create_token, auth_required

auth_bp = Blueprint("auth", __name__)


def generate_recovery_code():
    """Genera un código de 6 dígitos"""
    return ''.join(random.choices(string.digits, k=6))


# Email del usuario por defecto
DEFAULT_USER_EMAIL = "admin@sistema.local"

# Almacén temporal de códigos de recuperación
# Formato: { email: { code: "123456", expires: datetime, attempts: 0 } }
recovery_codes = {}
CODE_EXPIRY_MINUTES = 15
MAX_ATTEMPTS = 3


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email y contraseña requeridos"}), 400

    user = User.query.filter_by(email=email).first()

    if not user:
        return jsonify({"error": "Credenciales inválidas"}), 401

    if not user.active:
        return jsonify({"error": "Usuario desactivado"}), 401

    # Obtener el hash almacenado
    stored_hash = user.password
    
    if not stored_hash:
        return jsonify({"error": "Error de configuración de usuario"}), 500

    # Comparar usando werkzeug.security
    password_valid = check_password_hash(stored_hash, password)
    
    if not password_valid:
        return jsonify({"error": "Credenciales inválidas"}), 401

    token = create_token(user.id)
    
    # Verificar si es el usuario por defecto
    is_default = user.email == DEFAULT_USER_EMAIL
    
    return jsonify({
        "token": token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role
        },
        "is_default_user": is_default
    })


@auth_bp.route("/register", methods=["POST"])
def register():
    """
    Registro público de usuarios.
    Solo funciona si está habilitado en la configuración.
    Los usuarios se crean como 'trabajador' y activos.
    """
    # Verificar si el registro público está habilitado
    row = ConfigModel.query.filter_by(key="public_registration").first()
    
    registration_enabled = True  # Por defecto habilitado
    if row:
        try:
            registration_enabled = json.loads(row.value)
        except:
            registration_enabled = True
    
    if not registration_enabled:
        return jsonify({"error": "El registro público está deshabilitado. Contacte al administrador."}), 403
    
    # Obtener datos del formulario
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    
    # Validaciones
    if not name or not email or not password:
        return jsonify({"error": "Nombre, email y contraseña son requeridos"}), 400
    
    if len(password) < 4:
        return jsonify({"error": "La contraseña debe tener al menos 4 caracteres"}), 400
    
    # Validar formato de email
    if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
        return jsonify({"error": "Formato de email inválido"}), 400
    
    # Verificar que el email no exista
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "El email ya está registrado"}), 400
    
    # Crear usuario
    pwd_hash = generate_password_hash(password)
    
    new_user = User(
        name=name,
        email=email,
        password=pwd_hash,
        role='trabajador',
        bonus_hours=0.0,
        used_hours=0.0,
        active=1,
        boss_id=None,
        must_change_password=0
    )
    
    db.session.add(new_user)
    db.session.commit()
    new_user_id = new_user.id
    
    # Enviar notificación por email (registro público)
    try:
        from utils.email_utils import notificar_usuario_creado
        notificar_usuario_creado(
            actor_id=new_user_id,
            user_id=new_user_id,
            email=email,
            password="(contraseña definida por usuario)",
            role="trabajador",
            es_publico=True
        )
    except Exception as e:
        print(f"Error enviando email de bienvenida: {e}")
    
    return jsonify({
        "message": "Usuario registrado correctamente. Ya puedes iniciar sesión.",
        "user_id": new_user_id
    }), 201


@auth_bp.route("/check-setup", methods=["GET"])
def check_setup():
    """
    Verifica el estado de configuración del sistema.
    Retorna si ya existe un administrador real (no el por defecto).
    """
    # Contar administradores que NO sean el usuario por defecto
    real_admins = User.query.filter(User.role == 'administrador', User.email != DEFAULT_USER_EMAIL).count()
    
    # Verificar si existe el usuario por defecto
    default_exists = User.query.filter_by(email=DEFAULT_USER_EMAIL).first() is not None
    
    return jsonify({
        "setup_complete": real_admins > 0,
        "default_user_exists": default_exists,
        "real_admins_count": real_admins
    })


@auth_bp.route("/complete-setup", methods=["POST"])
@auth_required(role="administrador")
def complete_setup():
    """
    Completa la configuración inicial eliminando el usuario por defecto.
    Solo se puede llamar si ya existe otro administrador.
    """
    current_user = request.current_user
    
    # No permitir que el usuario por defecto se elimine a sí mismo directamente
    if current_user["email"] == DEFAULT_USER_EMAIL:
        return jsonify({"error": "Debe iniciar sesión con el nuevo administrador para completar la configuración"}), 400
    
    # Verificar que existe el usuario por defecto
    default_user = User.query.filter_by(email=DEFAULT_USER_EMAIL).first()
    
    if not default_user:
        return jsonify({"message": "El usuario por defecto ya fue eliminado"})
    
    # Eliminar el usuario por defecto (el cascade eliminará sus solicitudes y rendiciones)
    db.session.delete(default_user)
    db.session.commit()
    
    return jsonify({"message": "Configuración completada. Usuario por defecto eliminado."})


@auth_bp.route("/logout", methods=["POST"])
@auth_required()
def logout():
    """Logout - invalida el token del lado del cliente"""
    return jsonify({"message": "Sesión cerrada"})


# ============================================
# RECUPERACIÓN DE CONTRASEÑA
# ============================================

@auth_bp.route("/password-recovery/request", methods=["POST"])
def password_recovery_request():
    """
    Solicita un código de recuperación de contraseña.
    Envía el código por email si el usuario existe.
    """
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()

    if not email:
        return jsonify({"error": "Email requerido"}), 400

    user = User.query.filter_by(email=email).first()

    if not user:
        return jsonify({"error": "El correo electrónico no está registrado en el sistema."}), 404

    if not user.active:
        return jsonify({"error": "Usuario desactivado. Contacte al administrador."}), 403

    # Generar código
    code = generate_recovery_code()
    expires = datetime.now(timezone.utc) + timedelta(minutes=CODE_EXPIRY_MINUTES)

    # Almacenar código
    recovery_codes[email] = {
        "code": code,
        "expires": expires,
        "attempts": 0,
        "user_id": user.id
    }

    # Enviar email
    try:
        from utils.email_utils import notificar_recuperacion_password
        notificar_recuperacion_password(email, user.name, code)
    except Exception as e:
        print(f"Error enviando email de recuperación: {e}")
        # En desarrollo, mostrar código en consola
        print(f"[DEBUG] Código de recuperación para {email}: {code}")

    return jsonify({
        "message": "Si el email está registrado, recibirá un código de verificación."
    })


@auth_bp.route("/password-recovery/reset", methods=["POST"])
def password_recovery_reset():
    """
    Verifica el código y cambia la contraseña.
    """
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    code = data.get("code", "").strip()
    new_password = data.get("new_password", "")

    if not email or not code or not new_password:
        return jsonify({"error": "Todos los campos son requeridos"}), 400

    if len(new_password) < 4:
        return jsonify({"error": "La contraseña debe tener al menos 4 caracteres"}), 400

    # Verificar que existe un código para este email
    if email not in recovery_codes:
        return jsonify({"error": "No hay solicitud de recuperación pendiente para este email"}), 400

    recovery_data = recovery_codes[email]

    # Verificar intentos
    if recovery_data["attempts"] >= MAX_ATTEMPTS:
        del recovery_codes[email]
        return jsonify({"error": "Demasiados intentos fallidos. Solicite un nuevo código."}), 400

    # Verificar expiración
    if datetime.now(timezone.utc) > recovery_data["expires"]:
        del recovery_codes[email]
        return jsonify({"error": "El código ha expirado. Solicite uno nuevo."}), 400

    # Verificar código
    if code != recovery_data["code"]:
        recovery_codes[email]["attempts"] += 1
        remaining = MAX_ATTEMPTS - recovery_codes[email]["attempts"]
        return jsonify({
            "error": f"Código incorrecto. Le quedan {remaining} intento(s)."
        }), 400

    # Código válido - actualizar contraseña
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404

    pwd_hash = generate_password_hash(new_password)
    user.password = pwd_hash
    user.must_change_password = 0
    db.session.commit()

    # Limpiar código usado
    del recovery_codes[email]

    # Enviar notificación de cambio de contraseña
    try:
        from utils.email_utils import notificar_password_cambiado
        notificar_password_cambiado(
            actor_id=recovery_data["user_id"],
            user_id=recovery_data["user_id"]
        )
    except Exception as e:
        print(f"Error enviando notificación de cambio de contraseña: {e}")

    return jsonify({"message": "Contraseña actualizada correctamente"})