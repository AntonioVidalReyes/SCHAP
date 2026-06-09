import datetime
import json
from datetime import timezone, timedelta
from flask import Blueprint, request, jsonify
from sqlalchemy import or_

from db import db, User, Rendicion, RendicionHito, get_utc_now_iso, convert_utc_to_local, sync_user_hours
from auth.tokens import auth_required
from utils.email_utils import (
    notificar_rendicion_creada,
    notificar_rendicion_aprobada,
    notificar_rendicion_rechazada
)

report_bp = Blueprint("report", __name__)


@report_bp.route("/rendiciones", methods=["GET"])
@auth_required()
def listar_rendiciones():
    """Lista rendiciones según el rol del usuario."""
    user = request.current_user
    pending = request.args.get("pending")
    finished = request.args.get("finished")
    
    query = db.session.query(Rendicion).join(User, Rendicion.user_id == User.id)
    
    # Construir filtro de estado
    if pending == "1":
        query = query.filter(Rendicion.status.in_(['pendiente', 'pendiente_jefe', 'pendiente_admin']))
    elif finished == "1":
        query = query.filter(Rendicion.status.in_([
            'aprobado', 'aprobado_jefe', 'aprobado_admin',
            'rechazado', 'rechazado_jefe', 'rechazado_admin',
            'rechazada'
        ]))
    
    if user["role"] == "trabajador":
        query = query.filter(Rendicion.user_id == user["id"])
    elif user["role"] == "jefe":
        query = query.filter(or_(Rendicion.user_id == user["id"], User.boss_id == user["id"]))
    else:
        # Administrador ve todas
        pass
        
    rendiciones = query.order_by(Rendicion.created_at.desc()).all()
    
    result = []
    for r in rendiciones:
        r_dict = r.to_dict()
        r_dict["user_name"] = r.user.name
        if r.created_at:
            r_dict["created_at"] = convert_utc_to_local(r.created_at)
        if r.updated_at:
            r_dict["updated_at"] = convert_utc_to_local(r.updated_at)
        result.append(r_dict)
        
    return jsonify({"rendiciones": result})


@report_bp.route("/rendiciones/<int:rend_id>", methods=["GET"])
@auth_required()
def obtener_rendicion(rend_id):
    """Obtiene una rendición con sus hitos."""
    rend = Rendicion.query.get(rend_id)
    if not rend:
        return jsonify({"error": "Rendición no encontrada"}), 404
        
    hitos = [h.to_dict() for h in rend.hitos.all()]
    
    result = rend.to_dict()
    result["user_name"] = rend.user.name
    result["user_email"] = rend.user.email
    if result.get("created_at"):
        result["created_at"] = convert_utc_to_local(result["created_at"])
    if result.get("updated_at"):
        result["updated_at"] = convert_utc_to_local(result["updated_at"])
    result["hitos"] = hitos
    
    # Parsear tiempos si existe
    if result.get("tiempos"):
        try:
            result["tiempos"] = json.loads(result["tiempos"])
        except:
            result["tiempos"] = {}
    else:
        result["tiempos"] = {}
        
    return jsonify({"rendicion": result})


@report_bp.route("/rendiciones/validar-dia", methods=["POST"])
@auth_required()
def validar_dia():
    """Valida si un día está disponible para crear hitos."""
    user = request.current_user
    data = request.get_json(silent=True) or {}
    
    day = data.get("day")
    desde = data.get("desde")
    hasta = data.get("hasta")
    tipo = data.get("tipo")
    
    if not day:
        return jsonify({"error": "Día requerido"}), 400
    
    # Verificar si hay alojamiento en ese día
    alojamiento_existente = db.session.query(RendicionHito)\
        .join(Rendicion, RendicionHito.rendicion_id == Rendicion.id)\
        .filter(
            Rendicion.user_id == user["id"],
            RendicionHito.day == day,
            RendicionHito.alojamiento == 1,
            Rendicion.status != 'rechazado'
        ).first()
        
    if alojamiento_existente:
        return jsonify({
            "disponible": False,
            "error": f"Ya existe un alojamiento para el día {day}. No se pueden agregar más hitos."
        })
        
    # Si el nuevo hito es alojamiento, verificar que no haya otros hitos ese día
    if tipo == "alojamiento":
        hitos_existentes = db.session.query(RendicionHito)\
            .join(Rendicion, RendicionHito.rendicion_id == Rendicion.id)\
            .filter(
                Rendicion.user_id == user["id"],
                RendicionHito.day == day,
                Rendicion.status != 'rechazado'
            ).first()
            
        if hitos_existentes:
            return jsonify({
                "disponible": False,
                "error": f"Ya existen hitos para el día {day}. No se puede agregar alojamiento."
            })
            
    # Verificar solapamiento de horarios
    if desde and hasta:
        solapamiento = db.session.query(RendicionHito)\
            .join(Rendicion, RendicionHito.rendicion_id == Rendicion.id)\
            .filter(
                Rendicion.user_id == user["id"],
                RendicionHito.day == day,
                Rendicion.status != 'rechazado',
                or_(
                    (RendicionHito.desde <= desde) & (RendicionHito.hasta > desde),
                    (RendicionHito.desde < hasta) & (RendicionHito.hasta >= hasta),
                    (RendicionHito.desde >= desde) & (RendicionHito.hasta <= hasta)
                )
            ).first()
            
        if solapamiento:
            return jsonify({
                "disponible": False,
                "error": f"Ya existe un hito en el horario {solapamiento.desde} - {solapamiento.hasta} para el día {day}."
            })
            
    return jsonify({"disponible": True})


@report_bp.route("/rendiciones", methods=["POST"])
@auth_required()
def crear_rendicion():
    """Crea una rendición y envía notificaciones según las reglas."""
    user = request.current_user
    data = request.get_json(silent=True) or {}

    cliente = data.get("cliente")
    guia = data.get("guia")
    trabajo = data.get("trabajo")
    proyecto = data.get("proyecto")
    obs = data.get("obs")
    hitos = data.get("hitos") or []
    total_horas = data.get("total_horas") or data.get("total_hours") or 0
    tiempos = data.get("tiempos") or {}

    if not hitos:
        return jsonify({"error": "No hay hitos en la rendición."}), 400

    if not cliente:
        return jsonify({"error": "El cliente es requerido."}), 400

    now_iso = get_utc_now_iso()

    # Validar cada hito antes de insertar
    for h in hitos:
        day = h.get("day")
        desde = h.get("desde")
        hasta = h.get("hasta")
        es_alojamiento = h.get("alojamiento")
        
        # Verificar alojamiento existente
        alojamiento_existente = db.session.query(RendicionHito)\
            .join(Rendicion, RendicionHito.rendicion_id == Rendicion.id)\
            .filter(
                Rendicion.user_id == user["id"],
                RendicionHito.day == day,
                RendicionHito.alojamiento == 1,
                Rendicion.status != 'rechazado'
            ).first()
            
        if alojamiento_existente:
            return jsonify({"error": f"Ya existe alojamiento para el día {day}."}), 400
            
        # Si es alojamiento, verificar que no haya otros hitos
        if es_alojamiento:
            hitos_existentes = db.session.query(RendicionHito)\
                .join(Rendicion, RendicionHito.rendicion_id == Rendicion.id)\
                .filter(
                    Rendicion.user_id == user["id"],
                    RendicionHito.day == day,
                    Rendicion.status != 'rechazado'
                ).first()
            if hitos_existentes:
                return jsonify({"error": f"Ya existen hitos para {day}. No se puede agregar alojamiento."}), 400
                
        # Verificar solapamiento
        if desde and hasta and not es_alojamiento:
            solapamiento = db.session.query(RendicionHito)\
                .join(Rendicion, RendicionHito.rendicion_id == Rendicion.id)\
                .filter(
                    Rendicion.user_id == user["id"],
                    RendicionHito.day == day,
                    Rendicion.status != 'rechazado',
                    or_(
                        (RendicionHito.desde <= desde) & (RendicionHito.hasta > desde),
                        (RendicionHito.desde < hasta) & (RendicionHito.hasta >= hasta),
                        (RendicionHito.desde >= desde) & (RendicionHito.hasta <= hasta)
                    )
                ).first()
            if solapamiento:
                return jsonify({"error": f"Solapamiento de horarios en {day} ({desde}-{hasta})."}), 400

    # Crear la rendición
    tiempos_json = json.dumps(tiempos) if tiempos else "{}"
    new_rend = Rendicion(
        user_id=user["id"],
        cliente=cliente,
        guia=guia,
        trabajo=trabajo,
        proyecto=proyecto,
        obs=obs,
        total_horas=round(total_horas, 2),
        tiempos=tiempos_json,
        status='pendiente',
        created_at=now_iso
    )
    db.session.add(new_rend)
    db.session.flush() # Para obtener new_rend.id
    
    # Insertar hitos
    for h in hitos:
        new_hito = RendicionHito(
            rendicion_id=new_rend.id,
            day=h.get("day"),
            desde=h.get("desde"),
            hasta=h.get("hasta"),
            tipo=h.get("tipo"),
            alojamiento=1 if h.get("alojamiento") else 0,
            feriado=1 if h.get("feriado") else 0,
            valor=h.get("valor", 0)
        )
        db.session.add(new_hito)

    db.session.commit()

    # Enviar notificaciones por email
    try:
        notificar_rendicion_creada(
            actor_id=user["id"],
            user_id=user["id"],
            cliente=cliente or "-",
            proyecto=proyecto or "-",
            total_horas=round(total_horas, 2)
        )
    except Exception as e:
        print(f"Error enviando email de rendición: {e}")

    return jsonify({
        "message": "Rendición creada y enviada para aprobación.",
        "id": new_rend.id
    }), 201


@report_bp.route("/rendiciones/<int:rend_id>/status", methods=["PATCH"])
@auth_required(role=["administrador", "jefe"])
def actualizar_rendicion_status(rend_id):
    """Actualiza estado de rendición y suma horas si se aprueba."""
    current_user = request.current_user
    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    razon = data.get("razon") or ""

    if new_status not in ("pendiente", "aprobado_jefe", "aprobado", "rechazado_jefe", "rechazado"):
        return jsonify({"error": "Estado inválido"}), 400

    rend = Rendicion.query.get(rend_id)
    if not rend:
        return jsonify({"error": "Rendición no encontrada"}), 404

    # Verificar permisos si es jefe
    if current_user["role"] == "jefe":
        if rend.user.boss_id != current_user["id"]:
            return jsonify({"error": "No autorizado para esta rendición"}), 403

    old_status = rend.status
    user = rend.user
    total_horas = rend.total_horas or 0.0
    if (not total_horas or total_horas == 0.0) and rend.tiempos:
        try:
            tiempos_data = json.loads(rend.tiempos) if isinstance(rend.tiempos, str) else rend.tiempos
            if isinstance(tiempos_data, dict):
                calc_total = 0.0
                for cat in ['alojamiento', 'feriado', 'extras', 'viaje']:
                    calc_total += float(tiempos_data.get(cat, {}).get('ajustado', 0.0))
                if calc_total > 0:
                    total_horas = round(calc_total, 2)
                    rend.total_horas = total_horas
        except Exception as e:
            print(f"Error correcting total_horas on approval: {e}")

    now_iso = get_utc_now_iso()
    
    rend.status = new_status
    rend.razon = razon
    rend.updated_at = now_iso

    db.session.commit()

    # Recalculate and sync user hours
    sync_user_hours(user.id)

    nuevo_saldo = (user.bonus_hours or 0.0) - (user.used_hours or 0.0)

    # Enviar notificaciones por email
    try:
        is_approval = new_status in ["aprobado", "aprobado_jefe", "aprobado_admin"]
        is_rejection = new_status in ["rechazado", "rechazado_jefe", "rechazado_admin"]
        
        if is_approval:
            notificar_rendicion_aprobada(
                actor_id=current_user["id"],
                user_id=user.id,
                total_horas=total_horas,
                saldo=round(nuevo_saldo, 2)
            )
        elif is_rejection:
            notificar_rendicion_rechazada(
                actor_id=current_user["id"],
                user_id=user.id,
                total_horas=total_horas,
                razon=razon
            )
    except Exception as e:
        print(f"Error enviando email de cambio de estado: {e}")

    return jsonify({"message": "Estado de rendición actualizado"})


@report_bp.route("/rendiciones/hitos-dia/<day>", methods=["GET"])
@auth_required()
def obtener_hitos_dia(day):
    """Obtiene los hitos de un día específico para el usuario actual."""
    user = request.current_user
    
    hitos_list = db.session.query(RendicionHito)\
        .join(Rendicion, RendicionHito.rendicion_id == Rendicion.id)\
        .filter(
            Rendicion.user_id == user["id"],
            RendicionHito.day == day,
            Rendicion.status != 'rechazado'
        ).order_by(RendicionHito.desde).all()
        
    hitos = []
    for h in hitos_list:
        h_dict = h.to_dict()
        h_dict["status"] = h.rendicion.status
        hitos.append(h_dict)
        
    tiene_alojamiento = any(h.get("alojamiento") == 1 for h in hitos)
    
    return jsonify({
        "hitos": hitos,
        "tiene_alojamiento": tiene_alojamiento,
        "bloqueado": tiene_alojamiento
    })