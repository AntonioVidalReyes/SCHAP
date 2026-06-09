from flask import Blueprint, request, jsonify
from auth.tokens import auth_required
from db import db, User, Request, sync_user_hours, get_utc_now_iso
from werkzeug.security import generate_password_hash

from utils.email_utils import (
    notificar_usuario_creado,
    notificar_usuario_actualizado,
    notificar_usuario_activado,
    notificar_usuario_desactivado,
    notificar_usuario_eliminado,
    notificar_abono
)

users_bp = Blueprint("users", __name__)


def hash_password(password: str) -> str:
    return generate_password_hash(password)


@users_bp.route("/me", methods=["GET"])
@auth_required()
def get_me():
    user = request.current_user
    return jsonify({"user": user})


@users_bp.route("/users", methods=["GET"])
@auth_required()
def list_users():
    users = User.query.filter(User.role != 'superusuario').order_by(User.id).all()
    return jsonify({"users": [u.to_dict() for u in users]})


@users_bp.route("/users_create", methods=["POST"])
@auth_required(role="administrador")
def create_user():
    current_user = request.current_user
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    role = data.get("role", "trabajador")
    bonus_hours = float(data.get("bonus_hours", 0) or 0)
    boss_id = int(data["boss_id"]) if data.get("boss_id") else None
    send_email_flag = data.get("send_email", False)

    if not name or not email or not password:
        return jsonify({"error": "Faltan campos obligatorios"}), 400

    if len(password) < 4:
        return jsonify({"error": "La contraseña debe tener al menos 4 caracteres"}), 400

    # Verificar si el email ya existe
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "El email ya está registrado"}), 400

    pwd_hash = hash_password(password)

    must_change_password_val = int(data.get("must_change_password")) if "must_change_password" in data else 1

    new_user = User(
        name=name,
        email=email,
        password=pwd_hash,
        role=role,
        bonus_hours=bonus_hours,
        used_hours=0.0,
        active=1,
        boss_id=boss_id,
        must_change_password=must_change_password_val
    )
    db.session.add(new_user)
    db.session.flush() # Para obtener el ID

    # Si se crea con horas bonus, crear el abono correspondiente para historial
    if bonus_hours > 0:
        now = get_utc_now_iso()
        new_req = Request(
            user_id=new_user.id,
            date=now.split("T")[0],
            hours=bonus_hours,
            type="Abono",
            comment="Bolsa de horas inicial",
            status='aprobado',
            created_at=now,
            updated_at=now
        )
        db.session.add(new_req)
        
    db.session.commit()
    new_id = new_user.id
    
    # Sincronizar horas
    sync_user_hours(new_id)

    # Enviar email de bienvenida
    if send_email_flag:
        try:
            notificar_usuario_creado(
                actor_id=current_user["id"],
                user_id=new_id,
                email=email,
                password=password,
                role=role,
                es_publico=False
            )
        except Exception as e:
            print(f"Error enviando email de nuevo usuario: {e}")

    return jsonify({"message": "Usuario creado", "id": new_id}), 201


@users_bp.route("/users/<int:user_id>", methods=["GET"])
@auth_required()
def get_user(user_id):
    user = User.query.get(user_id)
    if not user or (user.role == 'superusuario' and request.current_user["role"] != 'superusuario'):
        return jsonify({"error": "Usuario no encontrado"}), 404

    return jsonify({"user": user.to_dict()})


@users_bp.route("/users/<int:user_id>", methods=["PATCH"])
@auth_required(role=["administrador", "jefe"])
def update_user(user_id):
    current_user = request.current_user
    data = request.get_json() or {}
    send_email_flag = data.get("send_email", False)

    user = User.query.get(user_id)
    if not user or (user.role == 'superusuario' and current_user["role"] != 'superusuario'):
        return jsonify({"error": "Usuario no encontrado"}), 404

    # Solo el administrador o superusuario puede cambiar ciertos campos
    if current_user["role"] not in ["administrador", "superusuario"]:
        # Jefe solo puede actualizar ciertos campos de sus trabajadores
        if user.boss_id != current_user["id"] and user_id != current_user["id"]:
            return jsonify({"error": "No tiene permisos para editar este usuario"}), 403

    cambios = {}  # Para el email de notificación
    has_changes = False

    if "name" in data:
        new_name = data["name"].strip()
        if new_name != user.name:
            cambios["Nombre"] = new_name
            user.name = new_name
            has_changes = True

    if "email" in data:
        new_email = data["email"].strip().lower()
        # Verificar que el email no esté en uso por otro usuario
        existing = User.query.filter(User.email == new_email, User.id != user_id).first()
        if existing:
            return jsonify({"error": "El email ya está en uso"}), 400
        if new_email != user.email:
            cambios["Email"] = new_email
            user.email = new_email
            has_changes = True

    if "role" in data and current_user["role"] in ["administrador", "superusuario"]:
        new_role = data["role"]
        if new_role != user.role:
            cambios["Rol"] = new_role
            user.role = new_role
            has_changes = True

    if "bonus_hours" in data and current_user["role"] in ["administrador", "superusuario"]:
        new_bonus = float(data["bonus_hours"] or 0)
        if new_bonus != user.bonus_hours:
            diff = new_bonus - user.bonus_hours
            now = get_utc_now_iso()
            new_req = Request(
                user_id=user.id,
                date=now.split("T")[0],
                hours=diff,
                type="Abono",
                comment="Ajuste manual de bolsa por administrador",
                status='aprobado',
                created_at=now,
                updated_at=now
            )
            db.session.add(new_req)
            cambios["Horas bonus"] = new_bonus
            user.bonus_hours = new_bonus
            has_changes = True

    if "used_hours" in data and current_user["role"] in ["administrador", "superusuario"]:
        new_used = float(data["used_hours"] or 0)
        if new_used != user.used_hours:
            diff = new_used - user.used_hours
            now = get_utc_now_iso()
            new_req = Request(
                user_id=user.id,
                date=now.split("T")[0],
                hours=diff,
                type="Permiso",
                comment="Ajuste manual de consumo por administrador",
                status='aprobado',
                created_at=now,
                updated_at=now
            )
            db.session.add(new_req)
            user.used_hours = new_used
            has_changes = True

    if "active" in data and current_user["role"] in ["administrador", "superusuario"]:
        new_active = 1 if data["active"] else 0
        # Verificar si se intenta desactivar al último administrador activo
        if not new_active and user.role == "administrador" and user.active:
            admin_count = User.query.filter(User.role == 'administrador', User.active == 1).count()
            if admin_count <= 1:
                return jsonify({"error": "No se puede desactivar al único administrador activo del sistema"}), 400
        
        if new_active != user.active:
            user.active = new_active
            has_changes = True
            
            # Enviar email de activación/desactivación
            if send_email_flag:
                try:
                    if new_active:
                        notificar_usuario_activado(
                            actor_id=current_user["id"],
                            user_id=user_id,
                            email=user.email
                        )
                    else:
                        notificar_usuario_desactivado(
                            actor_id=current_user["id"],
                            user_id=user_id,
                            email=user.email
                        )
                except Exception as e:
                    print(f"Error enviando email de cambio de estado: {e}")

    if "boss_id" in data and current_user["role"] in ["administrador", "superusuario"]:
        new_boss_id = int(data["boss_id"]) if data["boss_id"] else None
        if new_boss_id != user.boss_id:
            cambios["Jefe asignado"] = f"ID {new_boss_id}" if new_boss_id else "Sin jefe"
            user.boss_id = new_boss_id
            has_changes = True

    if not has_changes:
        return jsonify({"message": "Sin cambios"}), 200

    db.session.commit()
    
    # Sincronizar horas tras los cambios
    sync_user_hours(user.id)

    # Enviar email de actualización (solo si hay cambios y no es cambio de active)
    if send_email_flag and cambios and "active" not in data:
        try:
            notificar_usuario_actualizado(
                actor_id=current_user["id"],
                user_id=user_id,
                cambios=cambios
            )
        except Exception as e:
            print(f"Error enviando email de actualización: {e}")

    return jsonify({"message": "Usuario actualizado"})


@users_bp.route("/users/<int:user_id>", methods=["DELETE"])
@auth_required(role="administrador")
def delete_user(user_id):
    current_user = request.current_user
    data = request.get_json() or {}
    send_email_flag = data.get("send_email", False)

    user = User.query.get(user_id)
    if not user or (user.role == 'superusuario' and current_user["role"] != 'superusuario'):
        return jsonify({"error": "Usuario no encontrado"}), 404

    # Verificar si es el último administrador activo
    if user.role == "administrador" and user.active:
        admin_count = User.query.filter(User.role == 'administrador', User.active == 1).count()
        if admin_count <= 1:
            return jsonify({"error": "No se puede eliminar al único administrador activo del sistema"}), 400

    # Enviar email de notificación ANTES de eliminar
    if send_email_flag:
        try:
            notificar_usuario_eliminado(
                actor_id=current_user["id"],
                user_id=user_id,
                email=user.email,
                name=user.name
            )
        except Exception as e:
            print(f"Error enviando email de eliminación: {e}")

    db.session.delete(user)
    db.session.commit()

    return jsonify({"message": "Usuario eliminado"})


@users_bp.route("/users/<int:user_id>/password", methods=["PATCH"])
@auth_required()
def change_password(user_id):
    """Permite al usuario cambiar su propia contraseña o al admin/superuser cambiar la de cualquiera."""
    current_user = request.current_user
    
    user = User.query.get(user_id)
    if not user or (user.role == 'superusuario' and current_user["role"] != 'superusuario'):
        return jsonify({"error": "Usuario no encontrado"}), 404

    # Solo el propio usuario o un administrador/superusuario puede cambiar la contraseña
    if current_user["id"] != user_id and current_user["role"] not in ["administrador", "superusuario"]:
        return jsonify({"error": "No tiene permisos para cambiar esta contraseña"}), 403

    data = request.get_json() or {}
    new_password = data.get("password", "")

    if not new_password or len(new_password) < 4:
        return jsonify({"error": "La contraseña debe tener al menos 4 caracteres"}), 400

    pwd_hash = hash_password(new_password)
    user.password = pwd_hash
    user.must_change_password = 0
    db.session.commit()

    return jsonify({"message": "Contraseña actualizada"})


@users_bp.route("/users/<int:user_id>/abonar", methods=["POST"])
@auth_required(role="administrador")
def abonar_hours(user_id):
    """
    Abona horas a un usuario.
    Suma las horas al bonus_hours y crea un registro tipo 'Abono' para historial.
    """
    from datetime import datetime, timezone
    
    current_user = request.current_user
    data = request.get_json(silent=True) or {}
    hours = data.get("hours")
    comment = data.get("comment") or "Abono de horas"
    adjustment_type = data.get("type") or "Abono"

    if adjustment_type not in ["Abono", "Regalo"]:
        adjustment_type = "Abono"

    if not hours or float(hours) <= 0:
        return jsonify({"error": "Debe especificar una cantidad de horas válida"}), 400

    hours = round(float(hours), 2)

    user = User.query.get(user_id)
    if not user or (user.role == 'superusuario' and current_user["role"] != 'superusuario'):
        return jsonify({"error": "Usuario no encontrado"}), 404

    current_bonus = user.bonus_hours or 0.0
    current_used = user.used_hours or 0.0

    # Crear registro de Abono/Regalo para historial
    now = get_utc_now_iso()
    
    new_req = Request(
        user_id=user_id,
        date=now.split("T")[0],
        hours=hours,
        type=adjustment_type,
        comment=comment,
        status='aprobado',
        created_at=now,
        updated_at=now
    )
    db.session.add(new_req)
    db.session.commit()

    # Recalcular y sincronizar horas
    sync_user_hours(user_id)

    # Enviar notificación de abono
    try:
        nuevo_saldo = user.bonus_hours - user.used_hours
        notificar_abono(
            actor_id=current_user["id"],
            user_id=user_id,
            horas=hours,
            comentario=comment,
            saldo=round(nuevo_saldo, 2)
        )
    except Exception as e:
        print(f"Error enviando email de abono: {e}")

    return jsonify({
        "message": f"Se abonaron {hours} horas correctamente",
        "user_id": user_id,
        "hours_added": hours,
        "previous_bonus": current_bonus,
        "new_bonus": user.bonus_hours
    })