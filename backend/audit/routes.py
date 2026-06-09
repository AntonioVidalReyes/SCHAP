from flask import Blueprint, jsonify, request
from auth.tokens import auth_required
from db import db, Request, Rendicion, RendicionHito, User, get_utc_now_iso, hash_password, sync_user_hours
from db import convert_utc_to_local
import json

audit_bp = Blueprint("audit", __name__)

@audit_bp.route("/admin/audit-logs", methods=["GET"])
@auth_required(role="superusuario")
def get_audit_logs():
    """
    Obtiene el historial de auditoría unificado de todas las solicitudes y rendiciones del sistema.
    Solo accesible para el rol de 'superusuario'.
    Se excluyen las solicitudes pertenecientes al propio superusuario para mantener su anonimato.
    """
    try:
        # 1. Obtener todas las solicitudes (requests: Permiso, Notificación, Abono) exceptuando superusuarios
        requests = Request.query.join(User).filter(User.role != 'superusuario').all()
        
        # 2. Obtener todas las rendiciones de proyecto exceptuando superusuarios
        rendiciones = Rendicion.query.join(User).filter(User.role != 'superusuario').all()
        
        audit_events = []
        
        # Normalizar Requests
        for r in requests:
            audit_events.append({
                "id": r.id,
                "type": r.type or "Permiso",
                "user_id": r.user_id,
                "user_name": r.user.name,
                "user_email": r.user.email,
                "hours": r.hours,
                "created_at": convert_utc_to_local(r.created_at) if r.created_at else r.date,
                "status": r.status,
                "updated_at": convert_utc_to_local(r.updated_at) if r.updated_at else None,
                "comment": r.comment or "",
                "details": f"Horario: {r.from_time or ''} - {r.to_time or ''}" if (r.from_time and r.to_time) else "Día completo" if getattr(r, 'full_day', False) else r.comment or "",
                "reject_reason": r.reject_reason or "",
                "target_url": f"/abonos/{r.id}" if r.type == "Abono" else f"/solicitudes/{r.id}"
            })
            
        # Normalizar Rendiciones
        for ren in rendiciones:
            audit_events.append({
                "id": ren.id,
                "type": "Rendición",
                "user_id": ren.user_id,
                "user_name": ren.user.name,
                "user_email": ren.user.email,
                "hours": ren.total_horas,
                "created_at": convert_utc_to_local(ren.created_at) if ren.created_at else None,
                "status": ren.status,
                "updated_at": convert_utc_to_local(ren.updated_at) if ren.updated_at else None,
                "comment": ren.trabajo or "",
                "details": f"Cliente: {ren.cliente or '-'} | Proyecto: {ren.proyecto or '-'}",
                "reject_reason": ren.razon or "",
                "target_url": f"/rendiciones/{ren.id}"
            })
            
        # Ordenar cronológicamente descendente
        # Si no hay created_at, usamos un timestamp vacío
        audit_events.sort(key=lambda x: x["created_at"] or "", reverse=True)
        
        return jsonify({"logs": audit_events})
    except Exception as e:
        print(f"[AUDIT LOGS ERROR] {e}")
        return jsonify({"error": f"Error al consultar logs de auditoría: {str(e)}"}), 500


@audit_bp.route("/admin/import/<import_type>", methods=["POST"])
@auth_required(role="superusuario")
def import_data(import_type):
    """
    Importador masivo por lotes.
    Solo accesible para superusuario.
    Toma una lista JSON en el body: {"data": [...]}
    Implementa control transaccional estricto (todo o nada).
    """
    body = request.get_json(silent=True) or {}
    data = body.get("data")
    if not isinstance(data, list):
        return jsonify({"error": "Se requiere una lista en el campo 'data'."}), 400

    if not data:
        return jsonify({"error": "La lista 'data' está vacía."}), 400

    try:
        if import_type == "users":
            imported_count = 0
            created_users_map = {}
            
            # --- PRIMERA PASADA: Crear todos los usuarios sin boss_id ---
            for idx, item in enumerate(data):
                row_num = idx + 1
                name = item.get("name", "").strip()
                email = item.get("email", "").strip().lower()
                password = str(item.get("password", "")).strip()
                role = item.get("role", "trabajador").strip().lower()
                bonus_hours = float(item.get("bonus_hours", 0.0) or 0.0)
                used_hours = float(item.get("used_hours", 0.0) or 0.0)
                active = int(item.get("active", 1) if item.get("active") is not None else 1)
                must_change_password = int(item.get("must_change_password", 0) if item.get("must_change_password") is not None else 0)

                if not name:
                    db.session.rollback()
                    return jsonify({"error": f"Fila {row_num}: El nombre es obligatorio."}), 400
                if not email:
                    db.session.rollback()
                    return jsonify({"error": f"Fila {row_num}: El email es obligatorio."}), 400
                if role not in ["trabajador", "jefe", "administrador", "superusuario"]:
                    db.session.rollback()
                    return jsonify({"error": f"Fila {row_num}: El rol '{role}' no es válido."}), 400

                # Verificar duplicados en la base de datos o en el mismo lote
                existing_user = User.query.filter_by(email=email).first()
                if existing_user or email in created_users_map:
                    db.session.rollback()
                    return jsonify({"error": f"Fila {row_num}: El email '{email}' ya está registrado o duplicado en el lote."}), 400

                final_password = password if password else "scha123"
                hashed_pwd = hash_password(final_password)

                new_user = User(
                    name=name,
                    email=email,
                    password=hashed_pwd,
                    role=role,
                    bonus_hours=bonus_hours,
                    used_hours=used_hours,
                    active=active,
                    boss_id=None,
                    must_change_password=must_change_password
                )
                db.session.add(new_user)
                db.session.flush() # get new_user.id
                
                # Crear abono inicial si tiene horas bonus
                if bonus_hours > 0:
                    now = get_utc_now_iso()
                    new_req = Request(
                        user_id=new_user.id,
                        date=now.split("T")[0],
                        hours=bonus_hours,
                        type="Abono",
                        comment="Carga inicial de horas (Importación)",
                        status='aprobado',
                        created_at=now,
                        updated_at=now
                    )
                    db.session.add(new_req)

                # Crear permiso inicial si tiene horas consumidas
                if used_hours > 0:
                    now = get_utc_now_iso()
                    new_req = Request(
                        user_id=new_user.id,
                        date=now.split("T")[0],
                        hours=used_hours,
                        type="Permiso",
                        comment="Consumo inicial de horas (Importación)",
                        status='aprobado',
                        created_at=now,
                        updated_at=now
                    )
                    db.session.add(new_req)

                created_users_map[email] = new_user
                imported_count += 1

            # Flush para que el ORM asigne IDs temporales a los nuevos registros
            db.session.flush()

            # --- SEGUNDA PASADA: Resolver y vincular boss_id ---
            for idx, item in enumerate(data):
                row_num = idx + 1
                email = item.get("email", "").strip().lower()
                boss_email = item.get("boss_email", "").strip().lower()

                if boss_email:
                    # Buscar al jefe en la base de datos (incluyendo recién creados)
                    boss_user = User.query.filter_by(email=boss_email).first()
                    if not boss_user:
                        db.session.rollback()
                        return jsonify({"error": f"Fila {row_num}: El jefe con email '{boss_email}' no existe en el sistema ni en el lote a importar."}), 400
                    
                    user_to_update = created_users_map.get(email)
                    if user_to_update:
                        user_to_update.boss_id = boss_user.id

            db.session.commit()
            
            # Sincronizar horas para todos los usuarios
            for u in User.query.all():
                sync_user_hours(u.id)
                
            return jsonify({"message": f"Se importaron {imported_count} colaboradores con éxito."}), 201

        elif import_type == "requests":
            imported_count = 0
            for idx, item in enumerate(data):
                row_num = idx + 1
                email = item.get("user_email")
                if not email:
                    email = item.get("email")
                email = (email or "").strip().lower()
                req_type = item.get("type", "Permiso").strip()
                date = item.get("date", "").strip()
                hours = float(item.get("hours", 0.0) or 0.0)
                comment = item.get("comment", "").strip()
                status = item.get("status", "pendiente").strip().lower()
                from_time = item.get("from_time") or None
                to_time = item.get("to_time") or None
                created_at = item.get("created_at") or get_utc_now_iso()
                updated_at = item.get("updated_at") or None
                reject_reason = item.get("reject_reason") or None

                if not email:
                    db.session.rollback()
                    return jsonify({"error": f"Fila {row_num}: El email del colaborador es obligatorio."}), 400
                if not date:
                    db.session.rollback()
                    return jsonify({"error": f"Fila {row_num}: La fecha es obligatoria (formato AAAA-MM-DD)."}), 400
                if hours <= 0:
                    db.session.rollback()
                    return jsonify({"error": f"Fila {row_num}: Las horas deben ser mayor a 0."}), 400
                if req_type not in ["Permiso", "Notificación", "Abono"]:
                    db.session.rollback()
                    return jsonify({"error": f"Fila {row_num}: El tipo '{req_type}' no es válido (debe ser Permiso, Notificación o Abono)."}), 400

                # Buscar el usuario
                user = User.query.filter_by(email=email).first()
                if not user:
                    db.session.rollback()
                    return jsonify({"error": f"Fila {row_num}: El colaborador con email '{email}' no existe."}), 400

                # Si es Abono o Notificación, el estado por defecto o forzado debe ser 'informativa'
                if req_type in ["Abono", "Notificación"]:
                    status = "informativa"

                # Evitar duplicar registros si ya existen
                existing_req = Request.query.filter_by(
                    user_id=user.id,
                    date=date,
                    hours=hours,
                    type=req_type,
                    from_time=from_time,
                    to_time=to_time,
                    comment=comment
                ).first()

                if not existing_req:
                    new_req = Request(
                        user_id=user.id,
                        date=date,
                        hours=hours,
                        type=req_type,
                        comment=comment,
                        status=status,
                        created_at=created_at,
                        updated_at=updated_at,
                        from_time=from_time,
                        to_time=to_time,
                        reject_reason=reject_reason
                    )
                    db.session.add(new_req)
                    imported_count += 1

            db.session.commit()
            
            # Sincronizar horas para todos los usuarios
            for u in User.query.all():
                sync_user_hours(u.id)
                
            return jsonify({"message": f"Se importaron {imported_count} registros de solicitudes/abonos con éxito."}), 201

        elif import_type == "rendiciones":
            imported_count = 0
            for idx, item in enumerate(data):
                row_num = idx + 1
                email = item.get("user_email")
                if not email:
                    email = item.get("email")
                email = (email or "").strip().lower()
                cliente = item.get("cliente", "").strip()
                guia = item.get("guia", "").strip()
                trabajo = item.get("trabajo", "").strip()
                proyecto = item.get("proyecto", "").strip()
                obs = item.get("obs", "").strip()
                total_horas = float(item.get("total_horas", 0.0) or 0.0)
                status = item.get("status", "pendiente").strip().lower()
                razon = item.get("razon", "").strip() or None
                created_at = item.get("created_at") or get_utc_now_iso()
                updated_at = item.get("updated_at") or None
                hitos = item.get("hitos", [])

                if not email:
                    db.session.rollback()
                    return jsonify({"error": f"Fila {row_num}: El email del colaborador es obligatorio."}), 400


                # Buscar el usuario
                user = User.query.filter_by(email=email).first()
                if not user:
                    db.session.rollback()
                    return jsonify({"error": f"Fila {row_num}: El colaborador con email '{email}' no existe."}), 400

                # Validar hitos si existen
                hitos_obj_list = []
                calc_total_horas = 0.0
                tiempos_dict = {
                    "alojamiento": {"ajustado": 0.0, "real": 0.0},
                    "feriado": {"ajustado": 0.0, "real": 0.0},
                    "extras": {"ajustado": 0.0, "real": 0.0},
                    "viaje": {"ajustado": 0.0, "real": 0.0}
                }

                for h_idx, h in enumerate(hitos):
                    h_day = h.get("day", "").strip()
                    h_desde = h.get("desde", "").strip()
                    h_hasta = h.get("hasta", "").strip()
                    h_tipo = h.get("tipo", "extras").strip().lower()
                    h_alojamiento = int(h.get("alojamiento", 0))
                    h_feriado = int(h.get("feriado", 0))
                    h_valor = float(h.get("valor", 0.0) or 0.0)

                    if not h_day:
                        db.session.rollback()
                        return jsonify({"error": f"Fila {row_num}, Hito {h_idx+1}: El día del hito es obligatorio."}), 400
                    if h_tipo not in ["alojamiento", "feriado", "extras", "viaje"]:
                        db.session.rollback()
                        return jsonify({"error": f"Fila {row_num}, Hito {h_idx+1}: El tipo '{h_tipo}' no es válido."}), 400

                    tiempos_dict[h_tipo]["real"] += h_valor
                    tiempos_dict[h_tipo]["ajustado"] += h_valor
                    calc_total_horas += h_valor

                    h_db = RendicionHito(
                        day=h_day,
                        desde=h_desde,
                        hasta=h_hasta,
                        tipo=h_tipo,
                        alojamiento=h_alojamiento,
                        feriado=h_feriado,
                        valor=h_valor
                    )
                    hitos_obj_list.append(h_db)

                # Si no se pasó total_horas, usar las calculadas
                if total_horas <= 0:
                    total_horas = round(calc_total_horas, 2)

                new_rend = Rendicion(
                    user_id=user.id,
                    cliente=cliente,
                    guia=guia,
                    trabajo=trabajo,
                    proyecto=proyecto,
                    obs=obs,
                    total_horas=total_horas,
                    tiempos=json.dumps(tiempos_dict),
                    status=status,
                    razon=razon,
                    created_at=created_at,
                    updated_at=updated_at
                )
                db.session.add(new_rend)
                db.session.flush()

                # Asociar hitos
                for h_db in hitos_obj_list:
                    h_db.rendicion_id = new_rend.id
                    db.session.add(h_db)

                imported_count += 1

            db.session.commit()
            
            # Sincronizar horas para todos los usuarios
            for u in User.query.all():
                sync_user_hours(u.id)
                
            return jsonify({"message": f"Se importaron {imported_count} rendiciones de proyecto con éxito."}), 201

        else:
            return jsonify({"error": f"Tipo de importación '{import_type}' no soportado."}), 400

    except Exception as e:
        db.session.rollback()
        print(f"[IMPORT ERROR] {e}")
        return jsonify({"error": f"Fallo al procesar la importación: {str(e)}"}), 500

