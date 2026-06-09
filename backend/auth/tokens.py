from datetime import datetime, timezone, timedelta
import jwt
from functools import wraps
from flask import request, jsonify
from config import Config


def create_token(user_id):
    """Genera un JWT para el usuario con expiración de 1 hora."""
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1)
    }
    return jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")


def decode_token(token):
    """Decodifica un JWT y retorna el payload."""
    try:
        return jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
    except jwt.exceptions.ExpiredSignatureError:
        return None
    except jwt.exceptions.InvalidTokenError:
        return None
    except Exception:
        return None


def auth_required(role=None):
    """
    Decorador que verifica el token JWT.
    Si se pasa 'role', también verifica que el usuario tenga ese rol.
    'role' puede ser un string o una lista de strings.
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            from db import User
            
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                return jsonify({"error": "Token requerido"}), 401

            token = auth_header.replace("Bearer ", "")
            payload = decode_token(token)
            if not payload:
                return jsonify({"error": "Token inválido o expirado"}), 401

            user_id = payload.get("user_id")
            user_obj = User.query.get(user_id)
            if not user_obj:
                return jsonify({"error": "Usuario no encontrado"}), 401

            user = user_obj.to_dict()
            
            if not user.get("active"):
                return jsonify({"error": "Usuario desactivado"}), 403

            if role:
                roles_permitidos = role if isinstance(role, list) else [role]
                if user["role"] not in roles_permitidos and user["role"] != "superusuario":
                    return jsonify({"error": "No tiene permisos para esta acción"}), 403

            request.current_user = user
            return f(*args, **kwargs)
        return wrapper
    return decorator