import json
from flask import Blueprint, request, jsonify

from db import db, ConfigModel
from auth.tokens import auth_required

config_bp = Blueprint("config", __name__)


@config_bp.route("/config/schedule", methods=["GET"])
@auth_required()
def get_schedule():
    """
    Obtiene el horario laboral configurado.
    Cualquier usuario autenticado puede leerlo.
    """
    row = ConfigModel.query.filter_by(key="work_schedule").first()

    if row:
        try:
            schedule = json.loads(row.value)
            return jsonify({"schedule": schedule})
        except json.JSONDecodeError:
            return jsonify({"schedule": None})
    
    return jsonify({"schedule": None})


@config_bp.route("/config/schedule", methods=["POST"])
@auth_required(role=["administrador"])
def save_schedule():
    """
    Guarda el horario laboral.
    Solo administradores pueden modificarlo.
    """
    data = request.get_json(silent=True) or {}
    schedule = data.get("schedule")

    if not schedule or not isinstance(schedule, dict):
        return jsonify({"error": "Horario inválido"}), 400

    schedule_json = json.dumps(schedule)

    row = ConfigModel.query.filter_by(key="work_schedule").first()
    if row:
        row.value = schedule_json
    else:
        new_row = ConfigModel(key="work_schedule", value=schedule_json)
        db.session.add(new_row)
    
    db.session.commit()

    return jsonify({"message": "Horario guardado correctamente"})


@config_bp.route("/config/<key>", methods=["GET"])
@auth_required()
def get_config_value(key):
    """
    Obtiene un valor de configuración por clave.
    """
    row = ConfigModel.query.filter_by(key=key).first()

    if row:
        try:
            value = json.loads(row.value)
            return jsonify({"key": key, "value": value})
        except json.JSONDecodeError:
            return jsonify({"key": key, "value": row.value})
    
    return jsonify({"key": key, "value": None})


@config_bp.route("/config/<key>", methods=["POST"])
@auth_required(role=["administrador"])
def set_config_value(key):
    """
    Guarda un valor de configuración.
    Solo administradores.
    """
    data = request.get_json(silent=True) or {}
    value = data.get("value")

    if value is None:
        return jsonify({"error": "Valor requerido"}), 400

    value_json = json.dumps(value) if not isinstance(value, str) else value

    row = ConfigModel.query.filter_by(key=key).first()
    if row:
        row.value = value_json
    else:
        new_row = ConfigModel(key=key, value=value_json)
        db.session.add(new_row)
        
    db.session.commit()

    return jsonify({"message": f"Configuración '{key}' guardada"})


@config_bp.route("/config/factores", methods=["GET"])
@auth_required()
def get_factores():
    """
    Obtiene los factores de rendición configurados.
    Cualquier usuario autenticado puede leerlos.
    """
    row = ConfigModel.query.filter_by(key="factores_rendicion").first()

    # Valores por defecto
    default_factores = {
        "alojamiento": 4.5,
        "feriado": 200,
        "extras": 150,
        "viaje": 50
    }

    if row:
        try:
            factores = json.loads(row.value)
            return jsonify({"factores": factores})
        except json.JSONDecodeError:
            return jsonify({"factores": default_factores})
    
    return jsonify({"factores": default_factores})


@config_bp.route("/config/factores", methods=["POST"])
@auth_required(role=["administrador"])
def save_factores():
    """
    Guarda los factores de rendición.
    Solo administradores pueden modificarlos.
    """
    data = request.get_json(silent=True) or {}
    factores = data.get("factores")

    if not factores or not isinstance(factores, dict):
        return jsonify({"error": "Factores inválidos"}), 400

    # Validar campos requeridos
    campos_requeridos = ["alojamiento", "feriado", "extras", "viaje"]
    for campo in campos_requeridos:
        if campo not in factores:
            return jsonify({"error": f"Falta el campo '{campo}'"}), 400

    factores_json = json.dumps(factores)

    row = ConfigModel.query.filter_by(key="factores_rendicion").first()
    if row:
        row.value = factores_json
    else:
        new_row = ConfigModel(key="factores_rendicion", value=factores_json)
        db.session.add(new_row)
        
    db.session.commit()

    return jsonify({"message": "Factores guardados correctamente"})


# ============================================
# CONFIGURACIÓN DE REGISTRO PÚBLICO
# ============================================

@config_bp.route("/config/public-registration", methods=["GET"])
def get_public_registration():
    """
    Obtiene si el registro público está habilitado.
    Este endpoint NO requiere autenticación.
    """
    row = ConfigModel.query.filter_by(key="public_registration").first()

    if row:
        try:
            enabled = json.loads(row.value)
            return jsonify({"enabled": enabled})
        except json.JSONDecodeError:
            return jsonify({"enabled": False})
    
    # Por defecto habilitado
    return jsonify({"enabled": True})


@config_bp.route("/config/public-registration", methods=["POST"])
@auth_required(role=["administrador"])
def set_public_registration():
    """
    Habilita o deshabilita el registro público.
    Solo administradores.
    """
    data = request.get_json(silent=True) or {}
    enabled = data.get("enabled")

    if enabled is None:
        return jsonify({"error": "Campo 'enabled' requerido"}), 400

    row = ConfigModel.query.filter_by(key="public_registration").first()
    if row:
        row.value = json.dumps(bool(enabled))
    else:
        new_row = ConfigModel(key="public_registration", value=json.dumps(bool(enabled)))
        db.session.add(new_row)
        
    db.session.commit()

    status = "habilitado" if enabled else "deshabilitado"
    return jsonify({"message": f"Registro público {status}", "enabled": bool(enabled)})


@config_bp.route("/config/smtp", methods=["GET"])
@auth_required(role=["administrador"])
def get_smtp_config():
    """Obtiene la configuración SMTP guardada en la DB."""
    row = ConfigModel.query.filter_by(key="smtp_config").first()
    
    default_smtp = {
        "enabled": False,
        "host": "",
        "port": 587,
        "user": "",
        "password": "",
        "from_email": "",
        "use_tls": True
    }
    
    if row:
        try:
            cfg = json.loads(row.value)
            if cfg.get("password"):
                cfg["password"] = "********"
            return jsonify({"smtp": cfg})
        except:
            return jsonify({"smtp": default_smtp})
    return jsonify({"smtp": default_smtp})


@config_bp.route("/config/smtp", methods=["POST"])
@auth_required(role=["administrador"])
def save_smtp_config():
    """Guarda la configuración SMTP."""
    data = request.get_json(silent=True) or {}
    smtp_data = data.get("smtp")
    
    if not smtp_data or not isinstance(smtp_data, dict):
        return jsonify({"error": "Configuración SMTP inválida"}), 400
        
    # Conservar contraseña anterior si viene enmascarada
    row = ConfigModel.query.filter_by(key="smtp_config").first()
    
    existing_pwd = ""
    if row:
        try:
            cfg = json.loads(row.value)
            existing_pwd = cfg.get("password", "")
        except:
            pass
            
    if smtp_data.get("password") == "********":
        smtp_data["password"] = existing_pwd
        
    smtp_json = json.dumps(smtp_data)
    
    if row:
        row.value = smtp_json
    else:
        new_row = ConfigModel(key="smtp_config", value=smtp_json)
        db.session.add(new_row)
        
    db.session.commit()
    
    return jsonify({"message": "Configuración SMTP guardada correctamente"})


@config_bp.route("/config/smtp/test", methods=["POST"])
@auth_required(role=["administrador"])
def test_smtp_config():
    """Envía un email de prueba para validar la configuración SMTP."""
    data = request.get_json(silent=True) or {}
    test_email_addr = data.get("email")
    smtp_data = data.get("smtp")
    
    if not test_email_addr:
        return jsonify({"error": "Debe especificar un correo de prueba"}), 400
        
    if not smtp_data or not isinstance(smtp_data, dict):
        return jsonify({"error": "Configuración SMTP inválida"}), 400
        
    # Conservar contraseña anterior si viene enmascarada
    if smtp_data.get("password") == "********":
        row = ConfigModel.query.filter_by(key="smtp_config").first()
        if row:
            try:
                cfg = json.loads(row.value)
                smtp_data["password"] = cfg.get("password", "")
            except:
                pass
                
    import smtplib
    from email.mime.text import MIMEText
    try:
        msg = MIMEText("Esta es una prueba de envío de correo electrónico de SCHAP.", "plain", "utf-8")
        msg["Subject"] = "SCHAP - Prueba de Envío"
        msg["From"] = smtp_data.get("from_email") or smtp_data.get("user")
        msg["To"] = test_email_addr
        
        port = int(smtp_data.get("port", 587))
        host = smtp_data.get("host", "")
        user = smtp_data.get("user", "")
        password = smtp_data.get("password", "")
        use_tls = smtp_data.get("use_tls", True)
        
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=10) as smtp:
                smtp.login(user, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=10) as smtp:
                if use_tls:
                    smtp.starttls()
                smtp.login(user, password)
                smtp.send_message(msg)
                
        return jsonify({"message": "Correo de prueba enviado con éxito"})
    except Exception as e:
        return jsonify({"error": f"Error al enviar correo de prueba: {str(e)}"}), 500


@config_bp.route("/config/reset-system", methods=["POST"])
@auth_required(role=["administrador"])
def reset_system():
    """
    Elimina todas las tablas de la base de datos, las vuelve a crear,
    inicializa los datos por defecto y reinicia la aplicación.
    Solo para administradores.
    """
    import os
    import time
    import threading
    from db import init_db
    
    try:
        # Asegurar liberar cualquier transacción y conexión activa para evitar bloqueos
        db.session.rollback()
        db.session.remove()
        db.engine.dispose()
        
        # 1. Eliminar todas las tablas
        db.drop_all()
        
        # 2. Inicializar la base de datos de nuevo (crea tablas y datos por defecto)
        init_db()
        
        # 3. Lanzar un hilo para reiniciar el contenedor backend después de responder
        def restart_backend():
            time.sleep(1)
            print("[RESET] Forzando salida del backend (Docker reiniciará el contenedor)...")
            os._exit(0)
            
        threading.Thread(target=restart_backend).start()
        
        return jsonify({"message": "Sistema y base de datos restablecidos de fábrica correctamente. Reiniciando backend..."})
    except Exception as e:
        print(f"[RESET ERROR] Fallo al restablecer sistema: {e}")
        return jsonify({"error": f"Error al restablecer el sistema: {str(e)}"}), 500