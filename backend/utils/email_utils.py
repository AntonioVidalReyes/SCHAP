# ============================================
# EMAIL UTILS - SCHA
# ============================================
# Sistema de notificaciones por email personalizado
# 
# REGLAS DE NOTIFICACIÓN:
# - Trabajador crea algo → Notificar a: trabajador, jefe, admin
# - Jefe crea algo → Notificar a: jefe, admin
# - Admin crea algo → Notificar solo a: admin
# - Registro público → Notificar a: usuario, admin
# ============================================

import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, FROM_EMAIL, COMPANY_NAME)


# ============================================
# FUNCIÓN BASE DE ENVÍO
# ============================================

def get_smtp_config():
    """Obtiene la configuración SMTP de la base de datos o usa la de config.py / .env por defecto."""
    try:
        from db import ConfigModel
        import json
        row = ConfigModel.query.filter_by(key='smtp_config').first()
        if row:
            db_config = json.loads(row.value)
            return {
                "enabled": db_config.get("enabled", False),
                "host": db_config.get("host", ""),
                "port": int(db_config.get("port", 587)),
                "user": db_config.get("user", ""),
                "password": db_config.get("password", ""),
                "from_email": db_config.get("from_email", ""),
                "use_tls": db_config.get("use_tls", True)
            }
    except Exception as e:
        print(f"[SMTP CONFIG ERROR] Fallback a config.py: {e}")
    
    # Fallback a config.py
    import config
    return {
        "enabled": getattr(config, "EMAIL_ENABLED", False),
        "host": getattr(config, "SMTP_HOST", ""),
        "port": int(getattr(config, "SMTP_PORT", 587)),
        "user": getattr(config, "SMTP_USER", ""),
        "password": getattr(config, "SMTP_PASSWORD", ""),
        "from_email": getattr(config, "FROM_EMAIL", ""),
        "use_tls": True
    }


def send_email(to_email, subject, body):
    """
    Función base para enviar un email a un destinatario usando la configuración dinámica de la DB.
    """
    if not to_email:
        return False
        
    cfg = get_smtp_config()
    
    if not cfg["enabled"]:
        print(f"[EMAIL DEBUG] Email deshabilitado por configuración. A {to_email}: {subject}")
        return False
        
    if not cfg["host"] or not cfg["user"] or not cfg["password"]:
        print(f"[EMAIL DEBUG] SMTP no configurado completamente. Email a {to_email}: {subject}")
        print(f"[EMAIL DEBUG] Contenido: {body[:200]}...")
        return False

    try:
        msg = MIMEText(body, "html", "utf-8")
        msg["Subject"] = subject
        msg["From"] = cfg["from_email"] or cfg["user"]
        msg["To"] = to_email

        if cfg["port"] == 465:
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=10) as smtp:
                smtp.login(cfg["user"], cfg["password"])
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=10) as smtp:
                if cfg["use_tls"]:
                    smtp.starttls()
                smtp.login(cfg["user"], cfg["password"])
                smtp.send_message(msg)
        
        print(f"[EMAIL] Enviado a {to_email}: {subject}")
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] {to_email}: {e}")
        return False


# ============================================
# OBTENER INFORMACIÓN DE USUARIOS
# ============================================

def get_user_info(user_id):
    """Obtiene información de un usuario por ID."""
    if not user_id:
        return None
    try:
        from db import User
        user = User.query.get(user_id)
        if user:
            return user.to_dict()
    except Exception as e:
        print(f"[GET USER INFO ERROR] {e}")
    return None


def get_boss_info(user_id):
    """Obtiene información del jefe de un usuario."""
    user = get_user_info(user_id)
    if user and user.get("boss_id"):
        return get_user_info(user["boss_id"])
    return None


def get_all_admins():
    """Obtiene lista de todos los administradores activos."""
    try:
        from db import User
        admins = User.query.filter_by(role='administrador', active=1).all()
        return [admin.to_dict() for admin in admins]
    except Exception as e:
        print(f"[GET ALL ADMINS ERROR] {e}")
        return []


def get_recipients_by_role(actor_id, target_user_id=None):
    """
    Determina los destinatarios según el rol del actor.
    
    Args:
        actor_id: ID del usuario que realiza la acción
        target_user_id: ID del usuario afectado (si es diferente al actor)
    
    Returns:
        dict con: target_user, boss, admins
    """
    actor = get_user_info(actor_id)
    target = get_user_info(target_user_id) if target_user_id else actor
    
    result = {
        "actor": actor,
        "target": target,
        "boss": None,
        "admins": []
    }
    
    if not actor:
        return result
    
    actor_role = actor.get("role", "trabajador")
    
    # Obtener jefe del usuario objetivo (no del actor)
    if target:
        result["boss"] = get_boss_info(target["id"])
    
    # Obtener admins
    result["admins"] = get_all_admins()
    
    return result


def should_notify(actor_role, recipient_role, recipient_is_target=False):
    """
    Determina si se debe notificar a un destinatario según las reglas.
    
    Reglas:
    - Trabajador crea → notificar a: trabajador, jefe, admin
    - Jefe crea → notificar a: jefe, admin
    - Admin crea → notificar solo al admin (actor)
    """
    if recipient_is_target:
        # El usuario objetivo siempre recibe notificación
        return True
    
    if actor_role == "trabajador":
        # Trabajador notifica a todos
        return True
    elif actor_role == "jefe":
        # Jefe notifica a jefe y admin
        return recipient_role in ["jefe", "administrador"]
    elif actor_role == "administrador":
        # Admin solo se notifica a sí mismo
        return recipient_role == "administrador"
    
    return True


# ============================================
# SISTEMA DE NOTIFICACIÓN CENTRALIZADO
# ============================================

def notify(
    actor_id,
    target_user_id=None,
    event_type="general",
    subject_template="",
    body_data=None,
    force_notify_target=True
):
    """
    Sistema centralizado de notificaciones.
    
    Args:
        actor_id: ID del usuario que realiza la acción
        target_user_id: ID del usuario afectado (puede ser el mismo)
        event_type: Tipo de evento para personalizar mensaje
        subject_template: Plantilla del asunto
        body_data: Diccionario con datos para el cuerpo del email
        force_notify_target: Si siempre notificar al usuario objetivo
    """
    recipients = get_recipients_by_role(actor_id, target_user_id)
    actor = recipients["actor"]
    target = recipients["target"]
    boss = recipients["boss"]
    admins = recipients["admins"]
    
    if not actor:
        print(f"[EMAIL] Actor no encontrado: {actor_id}")
        return
    
    actor_role = actor.get("role", "trabajador")
    body_data = body_data or {}
    
    # Lista de emails ya enviados (para evitar duplicados)
    sent_to = set()
    
    # 1. Notificar al usuario objetivo (si corresponde)
    if target and force_notify_target:
        body = build_email_body(event_type, "target", target, actor, body_data)
        subject = build_subject(subject_template, target, actor, body_data)
        send_email(target["email"], subject, body)
        sent_to.add(target["email"])
    
    # 2. Notificar al jefe (si corresponde según reglas)
    if boss and boss["email"] not in sent_to:
        if should_notify(actor_role, "jefe"):
            body = build_email_body(event_type, "boss", boss, actor, body_data, target)
            subject = build_subject(subject_template, boss, actor, body_data, prefix="[Notificación]")
            send_email(boss["email"], subject, body)
            sent_to.add(boss["email"])
    
    # 3. Notificar a administradores
    for admin in admins:
        if admin["email"] not in sent_to:
            if should_notify(actor_role, "administrador"):
                body = build_email_body(event_type, "admin", admin, actor, body_data, target)
                subject = build_subject(subject_template, admin, actor, body_data, prefix="[Admin]")
                send_email(admin["email"], subject, body)
                sent_to.add(admin["email"])


def build_subject(template, recipient, actor, data, prefix=""):
    """Construye el asunto del email."""
    subject = template.format(
        recipient_name=recipient.get("name", ""),
        actor_name=actor.get("name", ""),
        **data
    )
    if prefix:
        subject = f"{prefix} {subject}"
    return subject


def wrap_html_template(recipient_name, message_body):
    """Envuelve el contenido en una plantilla HTML moderna con cabecera oscura y caja de detalles."""
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
            background-color: #f8fafc;
            color: #1e293b;
            margin: 0;
            padding: 20px;
        }}
        .email-container {{
            max-width: 600px;
            margin: 20px auto;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
            overflow: hidden;
        }}
        .header {{
            background: #1e293b;
            color: #ffffff;
            padding: 24px;
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            letter-spacing: 0.05em;
        }}
        .content {{
            padding: 30px;
            line-height: 1.6;
            font-size: 15px;
        }}
        .content h3 {{
            margin-top: 0;
            color: #0f172a;
            font-size: 18px;
            border-bottom: 1px solid #f1f5f9;
            padding-bottom: 10px;
        }}
        .details-box {{
            background-color: #f1f5f9;
            border-left: 4px solid #3b82f6;
            padding: 16px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }}
        .details-box p {{
            margin: 0 0 8px 0;
        }}
        .details-box p:last-child {{
            margin-bottom: 0;
        }}
        .details-box ul {{
            margin: 0;
            padding-left: 20px;
        }}
        .details-box li {{
            margin-bottom: 6px;
        }}
        .footer {{
            background: #f8fafc;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #64748b;
            border-top: 1px solid #e2e8f0;
        }}
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            {COMPANY_NAME}
        </div>
        <div class="content">
            <h3>Hola {recipient_name},</h3>
            {message_body}
        </div>
        <div class="footer">
            Este es un correo automático enviado por el sistema de Control de Horas.<br/>
            Por favor, no respondas directamente a este mensaje.<br/><br/>
            &copy; {COMPANY_NAME}
        </div>
    </div>
</body>
</html>
"""


def build_email_body(event_type, recipient_type, recipient, actor, data, target=None):
    """
    Construye el cuerpo del email en formato HTML premium.
    """
    target = target or recipient
    message_content = get_event_body(event_type, recipient_type, recipient, actor, data, target)
    return wrap_html_template(recipient.get('name', 'Usuario'), message_content)


def get_event_body(event_type, recipient_type, recipient, actor, data, target):
    """Genera el cuerpo del mensaje según el tipo de evento en formato HTML."""
    
    # ========== USUARIOS ==========
    
    if event_type == "user_created":
        if recipient_type == "target":
            return f"""<p>¡Bienvenido a <strong>{COMPANY_NAME}</strong>!</p>
<p>Tu cuenta ha sido creada con éxito. A continuación se detallan tus credenciales de acceso:</p>
<div class="details-box">
    <p><strong>Email (Usuario):</strong> {data.get('email', '')}</p>
    <p><strong>Contraseña Temporal:</strong> <code>{data.get('password', '(definida por usuario)')}</code></p>
</div>
<p>Por motivos de seguridad, <strong>deberás cambiar tu contraseña</strong> al iniciar sesión por primera vez.</p>"""
        else:
            return f"""<p>Se ha creado un nuevo usuario en el sistema.</p>
<div class="details-box">
    <p><strong>Usuario:</strong> {target.get('name', '')}</p>
    <p><strong>Email:</strong> {data.get('email', '')}</p>
    <p><strong>Rol:</strong> {data.get('role', 'trabajador')}</p>
    <p><strong>Creado por:</strong> {actor.get('name', '')}</p>
</div>"""

    elif event_type == "user_created_public":
        if recipient_type == "target":
            return f"""<p>¡Bienvenido a <strong>{COMPANY_NAME}</strong>!</p>
<p>Tu registro ha sido completado exitosamente. Ya puedes iniciar sesión en el sistema con tus credenciales.</p>
<div class="details-box">
    <p><strong>Email (Usuario):</strong> {data.get('email', '')}</p>
</div>"""
        else:
            return f"""<p>Un nuevo usuario se ha registrado públicamente.</p>
<div class="details-box">
    <p><strong>Usuario:</strong> {target.get('name', '')}</p>
    <p><strong>Email:</strong> {data.get('email', '')}</p>
</div>
<p>El usuario ha quedado activo con rol de <strong>trabajador</strong>.</p>"""

    elif event_type == "user_updated":
        cambios = data.get('cambios', {})
        cambios_html = "".join([f"<li><strong>{k}:</strong> {v}</li>" for k, v in cambios.items()])
        
        if recipient_type == "target":
            return f"""<p>Tu información de usuario ha sido actualizada.</p>
<p><strong>Cambios realizados:</strong></p>
<div class="details-box">
    <ul>{cambios_html}</ul>
</div>
<p>Si no reconoces estos cambios, por favor contacta al administrador de inmediato.</p>"""
        else:
            return f"""<p>Se ha actualizado la información del usuario <strong>{target.get('name', '')}</strong>.</p>
<p>Modificado por: <strong>{actor.get('name', '')}</strong></p>
<div class="details-box">
    <strong>Cambios realizados:</strong>
    <ul>{cambios_html}</ul>
</div>"""

    elif event_type == "user_activated":
        if recipient_type == "target":
            return f"""<p>Tu cuenta en <strong>{COMPANY_NAME}</strong> ha sido <strong>ACTIVADA</strong>.</p>
<p>Ya puedes acceder al sistema con tus credenciales habituales.</p>"""
        else:
            return f"""<p>Se ha activado un usuario.</p>
<div class="details-box">
    <p><strong>Usuario:</strong> {target.get('name', '')}</p>
    <p><strong>Email:</strong> {data.get('email', '')}</p>
    <p><strong>Activado por:</strong> {actor.get('name', '')}</p>
</div>"""

    elif event_type == "user_deactivated":
        if recipient_type == "target":
            return f"""<p>Tu cuenta en <strong>{COMPANY_NAME}</strong> ha sido <strong>DESACTIVADA</strong>.</p>
<p>No podrás acceder al sistema hasta que sea reactivada. Si crees que esto es un error, por favor contacta al administrador.</p>"""
        else:
            return f"""<p>Se ha desactivado un usuario.</p>
<div class="details-box">
    <p><strong>Usuario:</strong> {target.get('name', '')}</p>
    <p><strong>Email:</strong> {data.get('email', '')}</p>
    <p><strong>Desactivado por:</strong> {actor.get('name', '')}</p>
</div>"""

    elif event_type == "user_deleted":
        if recipient_type == "target":
            return f"""<p>Tu cuenta en <strong>{COMPANY_NAME}</strong> ha sido eliminada del sistema.</p>
<p>Si crees que esto es un error, por favor contacta al administrador.</p>"""
        else:
            return f"""<p>Se ha eliminado un usuario del sistema.</p>
<div class="details-box">
    <p><strong>Usuario:</strong> {target.get('name', '')}</p>
    <p><strong>Email:</strong> {data.get('email', '')}</p>
    <p><strong>Eliminado por:</strong> {actor.get('name', '')}</p>
</div>"""

    # ========== PERMISOS ==========
    
    elif event_type == "permiso_created":
        detalle = data.get('detalle', '')
        total_horas = data.get('total_horas', 0)
        
        if recipient_type == "target":
            return f"""<p>Tu solicitud de permiso ha sido registrada y está <strong>pendiente de aprobación</strong>.</p>
<div class="details-box">
    <strong>Detalle de días/horas solicitados:</strong>
    {detalle}
    <p style="margin-top: 10px;"><strong>Total:</strong> {total_horas} horas</p>
</div>
<p>Te enviaremos otra notificación una vez que tu jefe o administrador revise la solicitud.</p>"""
        elif recipient_type == "boss":
            return f"""<p>El trabajador <strong>{target.get('name', '')}</strong> ha registrado una solicitud de permiso que requiere tu aprobación.</p>
<div class="details-box">
    <strong>Detalle de días/horas solicitados:</strong>
    {detalle}
    <p style="margin-top: 10px;"><strong>Total:</strong> {total_horas} horas</p>
</div>
<p>Por favor, revisa y gestiona la solicitud en el sistema.</p>"""
        else:  # admin
            return f"""<p>Nueva solicitud de permiso pendiente de aprobación.</p>
<div class="details-box">
    <p><strong>Solicitante:</strong> {target.get('name', '')}</p>
    <strong>Detalle de días/horas solicitados:</strong>
    {detalle}
    <p style="margin-top: 10px;"><strong>Total:</strong> {total_horas} horas</p>
</div>"""

    elif event_type == "permiso_approved":
        horas = data.get('horas', 0)
        saldo = data.get('saldo', 0)
        aprobador = actor.get('name', '')
        
        if recipient_type == "target":
            return f"""<p>Tu solicitud de permiso ha sido <strong>APROBADA</strong>.</p>
<div class="details-box">
    <p><strong>Horas descontadas:</strong> {horas} horas</p>
    <p><strong>Saldo restante disponible:</strong> {saldo} horas</p>
</div>
<p>Aprobado por: <strong>{aprobador}</strong></p>"""
        else:
            return f"""<p>Se ha aprobado una solicitud de permiso.</p>
<div class="details-box">
    <p><strong>Usuario:</strong> {target.get('name', '')}</p>
    <p><strong>Horas descontadas:</strong> {horas} horas</p>
    <p><strong>Saldo restante disponible:</strong> {saldo} horas</p>
    <p><strong>Aprobado por:</strong> {aprobador}</p>
</div>"""

    elif event_type == "permiso_rejected":
        horas = data.get('horas', 0)
        razon = data.get('razon', 'No especificada')
        rechazador = actor.get('name', '')
        
        if recipient_type == "target":
            return f"""<p>Tu solicitud de permiso ha sido <strong>RECHAZADA</strong>.</p>
<div class="details-box">
    <p><strong>Horas solicitadas:</strong> {horas} horas</p>
    <p><strong>Razón del rechazo:</strong> {razon}</p>
</div>
<p>Rechazado por: <strong>{rechazador}</strong></p>
<p>Si tienes dudas, puedes ponerte en contacto con tu jefe directo o administrador.</p>"""
        else:
            return f"""<p>Se ha rechazado una solicitud de permiso.</p>
<div class="details-box">
    <p><strong>Usuario:</strong> {target.get('name', '')}</p>
    <p><strong>Horas solicitadas:</strong> {horas} horas</p>
    <p><strong>Razón del rechazo:</strong> {razon}</p>
    <p><strong>Rechazado por:</strong> {rechazador}</p>
</div>"""

    # ========== NOTIFICACIONES (DÍAS) ==========
    
    elif event_type == "notificacion_created":
        detalle = data.get('detalle', '')
        total_horas = data.get('total_horas', 0)
        
        if recipient_type == "target":
            return f"""<p>Has registrado las siguientes notificaciones de días en el sistema:</p>
<div class="details-box">
    {detalle}
    <p style="margin-top: 10px;"><strong>Total:</strong> {total_horas} horas</p>
</div>
<p>Estas notificaciones son informativas y no requieren aprobación.</p>"""
        else:
            return f"""<p>Se ha registrado una notificación de días.</p>
<div class="details-box">
    <p><strong>Usuario:</strong> {target.get('name', '')}</p>
    {detalle}
    <p style="margin-top: 10px;"><strong>Total:</strong> {total_horas} horas</p>
</div>
<p>Esta notificación es informativa y no requiere aprobación.</p>"""

    # ========== RENDICIONES ==========
    
    elif event_type == "rendicion_created":
        cliente = data.get('cliente', '-')
        proyecto = data.get('proyecto', '-')
        total_horas = data.get('total_horas', 0)
        
        if recipient_type == "target":
            return f"""<p>Tu rendición ha sido registrada y está <strong>pendiente de aprobación</strong>.</p>
<div class="details-box">
    <p><strong>Cliente:</strong> {cliente}</p>
    <p><strong>Proyecto:</strong> {proyecto}</p>
    <p><strong>Total horas:</strong> {total_horas} horas</p>
</div>
<p>Te notificaremos cuando sea revisada.</p>"""
        elif recipient_type == "boss":
            return f"""<p>El trabajador <strong>{target.get('name', '')}</strong> ha registrado una rendición de horas que requiere tu aprobación.</p>
<div class="details-box">
    <p><strong>Cliente:</strong> {cliente}</p>
    <p><strong>Proyecto:</strong> {proyecto}</p>
    <p><strong>Total horas:</strong> {total_horas} horas</p>
</div>
<p>Por favor, revisa y aprueba la rendición en el sistema.</p>"""
        else: # admin
            return f"""<p>Nueva rendición de horas pendiente de aprobación en el sistema.</p>
<div class="details-box">
    <p><strong>Usuario:</strong> {target.get('name', '')}</p>
    <p><strong>Cliente:</strong> {cliente}</p>
    <p><strong>Proyecto:</strong> {proyecto}</p>
    <p><strong>Total horas:</strong> {total_horas} horas</p>
</div>"""

    elif event_type == "rendicion_approved":
        total_horas = data.get('total_horas', 0)
        saldo = data.get('saldo', 0)
        aprobador = actor.get('name', '')
        
        if recipient_type == "target":
            return f"""<p>Tu rendición de horas ha sido <strong>APROBADA</strong>.</p>
<div class="details-box">
    <p><strong>Horas sumadas a tu saldo:</strong> +{total_horas} horas</p>
    <p><strong>Nuevo saldo disponible:</strong> {saldo} horas</p>
</div>
<p>Aprobada por: <strong>{aprobador}</strong></p>"""
        else:
            return f"""<p>Se ha aprobado una rendición de horas.</p>
<div class="details-box">
    <p><strong>Usuario:</strong> {target.get('name', '')}</p>
    <p><strong>Horas sumadas:</strong> +{total_horas} horas</p>
    <p><strong>Nuevo saldo disponible:</strong> {saldo} horas</p>
    <p><strong>Aprobada por:</strong> {aprobador}</p>
</div>"""

    elif event_type == "rendicion_rejected":
        total_horas = data.get('total_horas', 0)
        razon = data.get('razon', 'No especificada')
        rechazador = actor.get('name', '')
        
        if recipient_type == "target":
            return f"""<p>Tu rendición de horas ha sido <strong>RECHAZADA</strong>.</p>
<div class="details-box">
    <p><strong>Horas rendidas:</strong> {total_horas} horas</p>
    <p><strong>Razón del rechazo:</strong> {razon}</p>
</div>
<p>Rechazada por: <strong>{rechazador}</strong></p>
<p>Si tienes dudas, puedes ponerte en contacto con tu jefe directo o administrador.</p>"""
        else:
            return f"""<p>Se ha rechazado una rendición de horas.</p>
<div class="details-box">
    <p><strong>Usuario:</strong> {target.get('name', '')}</p>
    <p><strong>Horas rendidas:</strong> {total_horas} horas</p>
    <p><strong>Razón del rechazo:</strong> {razon}</p>
    <p><strong>Rechazada por:</strong> {rechazador}</p>
</div>"""

    # ========== ABONOS ==========
    
    elif event_type == "abono_created":
        horas = data.get('horas', 0)
        comentario = data.get('comentario', '')
        saldo = data.get('saldo', 0)
        tipo_ajuste = data.get('type') or 'Abono'
        tipo_label = "Regalo" if tipo_ajuste == "Regalo" else "Abono"
        
        if recipient_type == "target":
            return f"""<p>Se ha realizado un <strong>{tipo_label}</strong> de horas a tu cuenta.</p>
<div class="details-box">
    <p><strong>Horas añadidas:</strong> +{horas} horas</p>
    <p><strong>Concepto:</strong> {comentario if comentario else 'Sin comentario'}</p>
    <p><strong>Nuevo saldo disponible:</strong> {saldo} horas</p>
</div>
<p>Registrado por: <strong>{actor.get('name', '')}</strong></p>"""
        else:
            return f"""<p>Se ha registrado un <strong>{tipo_label}</strong> de horas en el sistema.</p>
<div class="details-box">
    <p><strong>Usuario:</strong> {target.get('name', '')}</p>
    <p><strong>Horas añadidas:</strong> +{horas} horas</p>
    <p><strong>Concepto:</strong> {comentario if comentario else 'Sin comentario'}</p>
    <p><strong>Nuevo saldo disponible:</strong> {saldo} horas</p>
    <p><strong>Registrado por:</strong> {actor.get('name', '')}</p>
</div>"""

    # ========== CONTRASEÑAS ==========
    
    elif event_type == "password_recovery":
        return f"""<p>Has solicitado recuperar tu contraseña.</p>
<p>Tu código de verificación es: <strong>{data.get('code', '')}</strong></p>
<p>Este código expirará en 15 minutos. Si no solicitaste este código, puedes ignorar este mensaje.</p>"""

    elif event_type == "password_changed":
        if recipient_type == "target":
            return f"""Tu contraseña ha sido actualizada exitosamente.

Si no realizaste este cambio, contacta inmediatamente al administrador."""
        else:
            return f"""El usuario {target.get('name', '')} ha cambiado su contraseña."""

    # ========== DEFAULT ==========
    
    return data.get('mensaje', 'Notificación del sistema.')


# ============================================
# FUNCIONES DE ALTO NIVEL (INTERFAZ PÚBLICA)
# ============================================

def notificar_usuario_creado(actor_id, user_id, email, password, role="trabajador", es_publico=False):
    """Notifica la creación de un usuario."""
    event_type = "user_created_public" if es_publico else "user_created"
    
    if es_publico:
        # Registro público: notificar a usuario y admin
        notify(
            actor_id=user_id,  # El actor es el mismo usuario
            target_user_id=user_id,
            event_type=event_type,
            subject_template=f"Bienvenido a {COMPANY_NAME}",
            body_data={"email": email, "password": password, "role": role}
        )
    else:
        # Creado por admin: seguir reglas normales
        notify(
            actor_id=actor_id,
            target_user_id=user_id,
            event_type=event_type,
            subject_template="Nuevo usuario creado",
            body_data={"email": email, "password": password, "role": role}
        )


def notificar_usuario_actualizado(actor_id, user_id, cambios):
    """Notifica la actualización de un usuario."""
    notify(
        actor_id=actor_id,
        target_user_id=user_id,
        event_type="user_updated",
        subject_template="Usuario actualizado",
        body_data={"cambios": cambios}
    )


def notificar_usuario_activado(actor_id, user_id, email):
    """Notifica la activación de un usuario."""
    notify(
        actor_id=actor_id,
        target_user_id=user_id,
        event_type="user_activated",
        subject_template="Cuenta activada",
        body_data={"email": email}
    )


def notificar_usuario_desactivado(actor_id, user_id, email):
    """Notifica la desactivación de un usuario."""
    notify(
        actor_id=actor_id,
        target_user_id=user_id,
        event_type="user_deactivated",
        subject_template="Cuenta desactivada",
        body_data={"email": email}
    )


def notificar_usuario_eliminado(actor_id, user_id, email, name):
    """Notifica la eliminación de un usuario."""
    # Guardar info antes de que se elimine
    user_info = {"id": user_id, "name": name, "email": email}
    
    notify(
        actor_id=actor_id,
        target_user_id=user_id,
        event_type="user_deleted",
        subject_template="Cuenta eliminada",
        body_data={"email": email}
    )


def notificar_permiso_creado(actor_id, user_id, permisos):
    """Notifica la creación de un permiso."""
    # Construir detalle HTML
    lineas = []
    total_horas = 0
    for p in permisos:
        fecha = p.get("date", p.get("day", ""))
        desde = p.get("from_time", p.get("from", ""))
        hasta = p.get("to_time", p.get("to", ""))
        horas = p.get("hours", 0)
        full_day = p.get("full_day", False)
        
        if full_day:
            lineas.append(f"<li>{fecha}: Día completo ({horas}h)</li>")
        elif desde and hasta:
            lineas.append(f"<li>{fecha}: {desde} - {hasta} ({horas}h)</li>")
        else:
            lineas.append(f"<li>{fecha}: {horas}h</li>")
        total_horas += horas
    
    detalle = "<ul>" + "".join(lineas) + "</ul>"
    
    notify(
        actor_id=actor_id,
        target_user_id=user_id,
        event_type="permiso_created",
        subject_template="Solicitud de permiso registrada",
        body_data={"detalle": detalle, "total_horas": total_horas}
    )


def notificar_permiso_aprobado(actor_id, user_id, horas, saldo):
    """Notifica la aprobación de un permiso."""
    notify(
        actor_id=actor_id,
        target_user_id=user_id,
        event_type="permiso_approved",
        subject_template="Permiso aprobado",
        body_data={"horas": horas, "saldo": saldo}
    )


def notificar_permiso_rechazado(actor_id, user_id, horas, razon=""):
    """Notifica el rechazo de un permiso."""
    notify(
        actor_id=actor_id,
        target_user_id=user_id,
        event_type="permiso_rejected",
        subject_template="Permiso rechazado",
        body_data={"horas": horas, "razon": razon}
    )


def notificar_notificacion_creada(actor_id, user_id, notificaciones):
    """Notifica la creación de notificaciones de días."""
    lineas = []
    total_horas = 0
    for n in notificaciones:
        fecha = n.get("date", "")
        desde = n.get("from_time", n.get("from", ""))
        hasta = n.get("to_time", n.get("to", ""))
        horas = n.get("hours", 0)
        
        if desde and hasta:
            lineas.append(f"<li>{fecha}: {desde} - {hasta} ({horas}h)</li>")
        else:
            lineas.append(f"<li>{fecha}: {horas}h</li>")
        total_horas += horas
    
    detalle = "<ul>" + "".join(lineas) + "</ul>"
    
    notify(
        actor_id=actor_id,
        target_user_id=user_id,
        event_type="notificacion_created",
        subject_template="Días notificados",
        body_data={"detalle": detalle, "total_horas": total_horas}
    )


def notificar_rendicion_creada(actor_id, user_id, cliente, proyecto, total_horas):
    """Notifica la creación de una rendición."""
    notify(
        actor_id=actor_id,
        target_user_id=user_id,
        event_type="rendicion_created",
        subject_template="Rendición registrada",
        body_data={"cliente": cliente, "proyecto": proyecto, "total_horas": total_horas}
    )


def notificar_rendicion_aprobada(actor_id, user_id, total_horas, saldo):
    """Notifica la aprobación de una rendición."""
    notify(
        actor_id=actor_id,
        target_user_id=user_id,
        event_type="rendicion_approved",
        subject_template="Rendición aprobada",
        body_data={"total_horas": total_horas, "saldo": saldo}
    )


def notificar_rendicion_rechazada(actor_id, user_id, total_horas, razon=""):
    """Notifica el rechazo de una rendición."""
    notify(
        actor_id=actor_id,
        target_user_id=user_id,
        event_type="rendicion_rejected",
        subject_template="Rendición rechazada",
        body_data={"total_horas": total_horas, "razon": razon}
    )


def notificar_abono(actor_id, user_id, horas, comentario, saldo):
    """Notifica un abono de horas."""
    notify(
        actor_id=actor_id,
        target_user_id=user_id,
        event_type="abono_created",
        subject_template=f"Abono de horas: +{horas}h",
        body_data={"horas": horas, "comentario": comentario, "saldo": saldo}
    )


def notificar_recuperacion_password(email, name, code):
    """Envía código de recuperación de contraseña."""
    content = f"""<p>Has solicitado recuperar tu contraseña en <strong>{COMPANY_NAME}</strong>.</p>
<p>Tu código de verificación es el siguiente:</p>
<div class="details-box" style="text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #1e293b;">
    {code}
</div>
<p>Este código expirará en <strong>15 minutos</strong> y puede ser usado solo una vez.</p>
<p>Si no solicitaste recuperar tu contraseña, puedes ignorar este correo de forma segura.</p>"""
    
    html_body = wrap_html_template(name, content)
    send_email(email, f"Código de recuperación - {COMPANY_NAME}", html_body)


def notificar_password_cambiado(actor_id, user_id):
    """Notifica cambio de contraseña."""
    notify(
        actor_id=actor_id,
        target_user_id=user_id,
        event_type="password_changed",
        subject_template="Contraseña actualizada",
        body_data={}
    )