import datetime
from datetime import timezone, timedelta
from flask import Blueprint, request, jsonify
from sqlalchemy import or_

from db import db, User, Request, get_utc_now_iso, convert_utc_to_local, sync_user_hours
from auth.tokens import auth_required
from utils.email_utils import (
    notificar_permiso_creado,
    notificar_permiso_aprobado,
    notificar_permiso_rechazado,
    notificar_notificacion_creada
)

request_bp = Blueprint("request", __name__)


@request_bp.route("/requests", methods=["GET"])
@auth_required()
def list_requests():
    user = request.current_user
    mine = request.args.get("mine")
    pending = request.args.get("pending")
    finished = request.args.get("finished")
    calendar = request.args.get("calendar")

    # Hacer join con el usuario para poder filtrar y tener los datos cargados
    query = db.session.query(Request).join(User, Request.user_id == User.id)

    # Filtrar según estado
    if pending == "1":
        query = query.filter(Request.status.in_(['pendiente', 'pendiente_jefe', 'pendiente_admin']))
    elif finished == "1":
        query = query.filter(Request.status.in_([
            'aprobado', 'aprobado_jefe', 'aprobado_admin',
            'rechazado', 'rechazado_jefe', 'rechazado_admin',
            'rechazada', 'informativa'
        ]))

    # Filtrar según rol/propietario
    if mine == "1":
        query = query.filter(Request.user_id == user["id"])
    elif calendar == "1":
        # Habilitar vista completa de solicitudes de todos los usuarios en el calendario
        pass
    elif user["role"] == "trabajador":
        query = query.filter(Request.user_id == user["id"])
    elif user["role"] == "jefe":
        query = query.filter(or_(Request.user_id == user["id"], User.boss_id == user["id"]))
    else:
        # Administrador y superusuario ven todo
        pass

    # Ordenar por fecha y hora de creación descendente
    requests_list = query.order_by(Request.date.desc(), Request.created_at.desc()).all()

    result = []
    for r in requests_list:
        row_dict = r.to_dict()
        if r.created_at:
            row_dict["created_at"] = convert_utc_to_local(r.created_at)
        if getattr(r, "updated_at", None):
            row_dict["updated_at"] = convert_utc_to_local(r.updated_at)
        row_dict["day"] = r.date
        row_dict["from"] = r.from_time
        row_dict["to"] = r.to_time
        
        # Datos del usuario relacionado
        row_dict["user_name"] = r.user.name
        row_dict["user_email"] = r.user.email
        row_dict["user_boss_id"] = r.user.boss_id
        row_dict["bonus_hours"] = r.user.bonus_hours
        row_dict["used_hours"] = r.user.used_hours
        
        # Calcular saldo disponible
        bonus = r.user.bonus_hours or 0.0
        used = r.user.used_hours or 0.0
        row_dict["balance"] = round(bonus - used, 2)
        
        result.append(row_dict)

    return jsonify({"requests": result})


@request_bp.route("/requests", methods=["POST"])
@auth_required()
def create_request():
    user = request.current_user
    data = request.get_json(silent=True) or {}

    date = data.get("date")
    hours = round(float(data.get("hours") or 0), 2)
    tipo = data.get("type") or "Permiso"
    comment = data.get("comment") or ""
    from_time = data.get("from") or None
    to_time = data.get("to") or None

    if not date or hours <= 0:
        return jsonify({"error": "Fecha y horas son obligatorias."}), 400

    now = get_utc_now_iso()

    new_req = Request(
        user_id=user["id"],
        date=date,
        hours=hours,
        type=tipo,
        comment=comment,
        status='pendiente',
        created_at=now,
        from_time=from_time,
        to_time=to_time
    )
    db.session.add(new_req)
    db.session.commit()

    return jsonify({"message": "Solicitud creada", "id": new_req.id}), 201


@request_bp.route("/requests/batch", methods=["POST"])
@auth_required()
def create_request_batch():
    """
    Solicitudes de permiso (horas libres).
    Requieren aprobación del jefe o administrador.
    Envía email al usuario, jefe y administrador.
    """
    user = request.current_user
    data = request.get_json(silent=True) or {}
    rows = data.get("rows") or []

    if not isinstance(rows, list) or not rows:
        return jsonify({"error": "Se requiere una lista de filas."}), 400

    created = []
    now_iso = get_utc_now_iso()

    for item in rows:
        day = item.get("day")
        from_time = item.get("from")
        to_time = item.get("to")
        full_day = bool(item.get("full_day"))
        comment = item.get("comment") or ""

        if not day:
            continue

        hours = 0.0
        if full_day:
            hours = 8.0
            from_time = "09:00"
            to_time = "18:00"
        else:
            if not from_time or not to_time:
                continue
            try:
                t1 = datetime.datetime.strptime(from_time, "%H:%M")
                t2 = datetime.datetime.strptime(to_time, "%H:%M")
                diff = (t2 - t1).total_seconds() / 3600.0
                if diff <= 0:
                    continue
                hours = round(diff, 2)
            except ValueError:
                continue

        new_req = Request(
            user_id=user["id"],
            date=day,
            hours=hours,
            type="Permiso",
            comment=comment,
            status='pendiente',
            created_at=now_iso,
            from_time=from_time,
            to_time=to_time
        )
        db.session.add(new_req)
        # Flush para obtener el ID antes del commit definitivo
        db.session.flush()

        created.append({
            "id": new_req.id,
            "date": day,
            "hours": hours,
            "comment": comment,
            "from_time": from_time,
            "to_time": to_time,
            "full_day": full_day
        })

    db.session.commit()

    # Enviar notificaciones por email
    if created:
        try:
            permisos_data = []
            for r in created:
                permisos_data.append({
                    "date": r["date"],
                    "from_time": r["from_time"],
                    "to_time": r["to_time"],
                    "hours": r["hours"],
                    "full_day": r.get("full_day", False)
                })
            
            notificar_permiso_creado(
                actor_id=user["id"],
                user_id=user["id"],
                permisos=permisos_data
            )
        except Exception as e:
            print(f"Error enviando email de permiso: {e}")

    return jsonify(
        {"message": f"Se crearon {len(created)} solicitudes.", "created": created}
    ), 201


@request_bp.route("/notificaciones/batch", methods=["POST"])
@auth_required()
def create_notifications_batch():
    """
    Notificaciones de días (solo informativas, sin aprobación).
    Inserta en la tabla requests con type='Notificación'
    y status='informativa'. Envía mail según las reglas de notificación.
    """
    user = request.current_user

    try:
        data = request.get_json(force=True) or {}
    except Exception as e:
        print(">>> ERROR parseando JSON:", e)
        return jsonify({"error": "JSON inválido"}), 400

    rows = data.get("rows") or []

    if isinstance(rows, dict):
        rows = list(rows.values())

    if not isinstance(rows, list):
        return jsonify({"error": "El campo 'rows' debe ser una lista."}), 400

    if not rows:
        return jsonify({"error": "Se requiere una lista de filas."}), 400

    created = []
    now_iso = get_utc_now_iso()

    for item in rows:
        day = item.get("day")
        from_time = item.get("from")
        to_time = item.get("to")
        full_day = bool(item.get("full_day"))
        comment = item.get("comment") or ""

        if not day:
            continue

        hours = 0.0
        if full_day:
            hours = 8.0
            from_time = "09:00"
            to_time = "18:00"
        else:
            if not from_time or not to_time:
                continue
            try:
                t1 = datetime.datetime.strptime(from_time, "%H:%M")
                t2 = datetime.datetime.strptime(to_time, "%H:%M")
                diff = (t2 - t1).total_seconds() / 3600.0
                if diff <= 0:
                    continue
                hours = round(diff, 2)
            except ValueError:
                continue

        new_req = Request(
            user_id=user["id"],
            date=day,
            hours=hours,
            type="Notificación",
            comment=comment,
            status='informativa',
            created_at=now_iso,
            from_time=from_time,
            to_time=to_time
        )
        db.session.add(new_req)
        db.session.flush()

        created.append({
            "id": new_req.id,
            "date": day,
            "hours": hours,
            "comment": comment,
            "from_time": from_time,
            "to_time": to_time
        })

    db.session.commit()

    # Enviar notificaciones por email
    if created:
        try:
            notificaciones_data = []
            for r in created:
                notificaciones_data.append({
                    "date": r["date"],
                    "from_time": r["from_time"],
                    "to_time": r["to_time"],
                    "hours": r["hours"]
                })
            
            notificar_notificacion_creada(
                actor_id=user["id"],
                user_id=user["id"],
                notificaciones=notificaciones_data
            )
        except Exception as e:
            print(f"Error enviando email de notificación: {e}")

    return jsonify(
        {"message": f"Se registraron {len(created)} días notificados.", "created": created}
    ), 201


@request_bp.route("/requests/<int:req_id>/status", methods=["PATCH"])
@auth_required(role=["administrador", "jefe"])
def update_request_status(req_id):
    """
    Actualiza el estado de una solicitud.
    Si se aprueba, descuenta las horas del saldo del usuario.
    Si se rechaza una solicitud previamente aprobada, devuelve las horas.
    """
    current_user = request.current_user
    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    reject_reason = data.get("reject_reason") or ""
    
    valid_statuses = [
        "pendiente", "pendiente_jefe", "pendiente_admin",
        "aprobado", "aprobado_jefe", "aprobado_admin",
        "rechazado", "rechazado_jefe", "rechazado_admin"
    ]
    
    if new_status not in valid_statuses:
        return jsonify({"error": "Estado inválido"}), 400

    req = Request.query.get(req_id)
    if not req:
        return jsonify({"error": "Solicitud no encontrada"}), 404
        
    # Verificar que el jefe sólo pueda modificar solicitudes propias o de sus subordinados directos
    if current_user["role"] == "jefe":
        if req.user.boss_id != current_user["id"] and req.user_id != current_user["id"]:
            return jsonify({"error": "No tiene permisos para modificar solicitudes de usuarios que no están a su cargo."}), 403
    
    old_status = req.status
    hours = req.hours or 0.0
    req_type = req.type or ""
    
    is_approval = new_status in ["aprobado", "aprobado_jefe", "aprobado_admin"]
    is_rejection = new_status in ["rechazado", "rechazado_jefe", "rechazado_admin"]
    
    was_approved = old_status in ["aprobado", "aprobado_jefe", "aprobado_admin"]
    was_pending = old_status in ["pendiente", "pendiente_jefe", "pendiente_admin"]
    
    is_permiso = req_type.lower() not in ["notificación", "notificacion", "informativa"]
    
    user = req.user
    
    req.status = new_status
    req.reject_reason = reject_reason
    req.updated_at = get_utc_now_iso()
    
    db.session.commit()
    
    # Recalculate and sync user hours
    sync_user_hours(user.id)
    
    saldo_final = (user.bonus_hours or 0.0) - (user.used_hours or 0.0)
    
    # Enviar email de notificación
    try:
        if is_approval:
            notificar_permiso_aprobado(
                actor_id=current_user["id"],
                user_id=user.id,
                horas=hours,
                saldo=round(saldo_final, 2)
            )
        elif is_rejection:
            notificar_permiso_rechazado(
                actor_id=current_user["id"],
                user_id=user.id,
                horas=hours,
                razon=reject_reason
            )
    except Exception as e:
        print(f"Error enviando email de cambio de estado: {e}")

    return jsonify({"message": "Estado actualizado"})


@request_bp.route("/stats", methods=["GET"])
@auth_required()
def stats():
    user = request.current_user
    user_obj = User.query.get(user["id"])
    if not user_obj:
        return jsonify({"error": "Usuario no encontrado"}), 404
        
    bonus_hours = round(float(user_obj.bonus_hours or 0.0), 2)
    used_hours = round(float(user_obj.used_hours or 0.0), 2)
    left = round(max(0.0, bonus_hours - used_hours), 2)
    
    return jsonify(
        {
            "bonus_hours": bonus_hours,
            "used_hours": used_hours,
            "left_hours": left,
        }
    )