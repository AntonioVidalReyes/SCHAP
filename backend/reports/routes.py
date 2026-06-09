import io
import datetime
import json
from datetime import timezone, timedelta
from flask import Blueprint, request, jsonify, send_file
from zoneinfo import ZoneInfo

from db import db, User, Request, Rendicion, get_system_timezone
from auth.tokens import auth_required

# Importar reportlab para generar PDF
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

reports_bp = Blueprint("reports", __name__)


def obtener_saldo_a_la_fecha(user_id, fecha_limite):
    """Calcula el saldo acumulado del usuario antes de la fecha_limite (YYYY-MM-DD)."""
    # 1. Sumar abonos/regalos/permisos aprobados antes de la fecha_limite
    reqs = Request.query.filter(
        Request.user_id == user_id,
        Request.date < fecha_limite,
        Request.status.in_(['aprobado', 'aprobado_jefe', 'aprobado_admin'])
    ).all()
    
    saldo = 0.0
    for r in reqs:
        rtype = (r.type or 'Permiso').lower()
        if rtype == 'permiso':
            saldo -= r.hours
        elif rtype in ['abono', 'regalo']:
            saldo += r.hours

    # 2. Sumar rendiciones aprobadas creadas antes de la fecha_limite
    rendiciones = Rendicion.query.filter(
        Rendicion.user_id == user_id,
        Rendicion.status.in_(['aprobado', 'aprobado_jefe', 'aprobado_admin'])
    ).all()
    
    tz_name = get_system_timezone()
    for rend in rendiciones:
        utc_created = rend.created_at
        if utc_created:
            local_created = convert_utc_to_local(utc_created, tz_name)
            local_date = local_created[:10]
            if local_date < fecha_limite:
                t_horas = rend.total_horas
                if (not t_horas or t_horas == 0.0) and rend.tiempos:
                    try:
                        tiempos_data = json.loads(rend.tiempos) if isinstance(rend.tiempos, str) else rend.tiempos
                        if isinstance(tiempos_data, dict):
                            calc_total = 0.0
                            for cat in ['alojamiento', 'feriado', 'extras', 'viaje']:
                                calc_total += float(tiempos_data.get(cat, {}).get('ajustado', 0.0))
                            if calc_total > 0:
                                t_horas = round(calc_total, 2)
                    except:
                        pass
                saldo += t_horas

    return round(saldo, 2)


def convert_utc_to_local(utc_str, tz_name):
    """Convierte un timestamp UTC a la zona horaria indicada."""
    if not utc_str:
        return utc_str
    try:
        cleaned = utc_str.replace('T', ' ')
        dt = None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                dt = datetime.datetime.strptime(cleaned[:19], fmt)
                break
            except ValueError:
                continue
        if not dt:
            return utc_str
        
        dt = dt.replace(tzinfo=datetime.timezone.utc)
        local_dt = dt.astimezone(ZoneInfo(tz_name))
        return local_dt.strftime("%Y-%m-%dT%H:%M:%S")
    except Exception as e:
        print(f"[TIMEZONE CONVERT ERROR] {e}")
        return utc_str


def get_chile_time():
    """Obtiene la hora actual en la zona horaria configurada en el sistema."""
    tz_name = get_system_timezone()
    return datetime.datetime.now(ZoneInfo(tz_name))


@reports_bp.route("/reportes/generar", methods=["GET"])
@auth_required()
def generar_reporte():
    """Genera un reporte PDF de solicitudes de un usuario en un rango de fechas."""
    current_user = request.current_user
    
    user_id = request.args.get("user_id", type=int)
    fecha_desde = request.args.get("desde")
    fecha_hasta = request.args.get("hasta")
    
    if not user_id or not fecha_desde or not fecha_hasta:
        return jsonify({"error": "Faltan parámetros: user_id, desde, hasta"}), 400
    
    # Verificar permisos
    if current_user["role"] == "trabajador":
        # Trabajador solo puede ver sus propios reportes
        if user_id != current_user["id"]:
            return jsonify({"error": "No tiene permisos para ver este reporte"}), 403
    elif current_user["role"] == "jefe":
        # Jefe puede ver sus reportes y los de sus trabajadores
        target_user = User.query.get(user_id)
        if not target_user:
            return jsonify({"error": "Usuario no encontrado"}), 404
        if target_user.id != current_user["id"] and target_user.boss_id != current_user["id"]:
            return jsonify({"error": "No tiene permisos para ver este reporte"}), 403
    # Administrador puede ver todos los reportes
    
    # Obtener datos del usuario
    usuario_obj = User.query.get(user_id)
    if not usuario_obj:
        return jsonify({"error": "Usuario no encontrado"}), 404
    
    usuario = usuario_obj.to_dict()
    
    # Obtener solicitudes (requests) en el rango de fechas
    requests_rows = Request.query.filter(
        Request.user_id == user_id,
        Request.date >= fecha_desde,
        Request.date <= fecha_hasta
    ).order_by(Request.date.asc(), Request.from_time.asc()).all()
    solicitudes = [r.to_dict() for r in requests_rows]
    
    # Obtener todas las rendiciones de este usuario y filtrarlas por zona horaria local en Python
    rendiciones_rows = Rendicion.query.filter(Rendicion.user_id == user_id).order_by(Rendicion.created_at.asc()).all()
    
    tz_name = get_system_timezone()
    rendiciones = []
    for r in rendiciones_rows:
        rend_dict = r.to_dict()
        utc_created = rend_dict.get('created_at')
        if utc_created:
            local_created = convert_utc_to_local(utc_created, tz_name)
            rend_dict['created_at'] = local_created
            # Comparar la porción de fecha (YYYY-MM-DD) con el rango en zona horaria local
            local_date = local_created[:10]
            if fecha_desde <= local_date <= fecha_hasta:
                rendiciones.append(rend_dict)
        else:
            rendiciones.append(rend_dict)
            
    # Convertir también solicitudes' created_at a hora local para consistencia
    for sol in solicitudes:
        if sol.get('created_at'):
            sol['created_at'] = convert_utc_to_local(sol['created_at'], tz_name)
            
    # Generar PDF
    pdf_buffer = generar_pdf_reporte(
        usuario, 
        solicitudes, 
        rendiciones, 
        fecha_desde, 
        fecha_hasta
    )
    
    return send_file(
        pdf_buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f'reporte_{usuario["name"]}_{fecha_desde}_{fecha_hasta}.pdf'
    )


def generar_pdf_reporte(usuario, solicitudes, rendiciones, fecha_desde, fecha_hasta):
    """Genera el PDF del reporte."""
    buffer = io.BytesIO()
    
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.5*inch,
        leftMargin=0.5*inch,
        topMargin=0.5*inch,
        bottomMargin=0.5*inch
    )
    
    styles = getSampleStyleSheet()
    
    # Estilos personalizados
    style_title = ParagraphStyle(
        'Title',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#333333'),
        spaceAfter=20
    )
    
    style_info = ParagraphStyle(
        'Info',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#333333'),
        alignment=TA_RIGHT
    )
    
    style_section = ParagraphStyle(
        'Section',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#333333'),
        spaceBefore=15,
        spaceAfter=10
    )
    
    style_footer = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#3498db'),
        alignment=TA_CENTER,
        spaceBefore=20
    )
    
    elements = []
    
    # ===== ENCABEZADO =====
    fecha_actual = get_chile_time().strftime("%d-%m-%Y %H:%M:%S")
    
    # Crear tabla para el encabezado (título a la izquierda, info a la derecha)
    header_data = [
        [
            Paragraph("Reporte", style_title),
            Paragraph(
                f"<b>Persona:</b> {usuario['name']}<br/>"
                f"<b>Correo:</b> {usuario['email']}<br/>"
                f"<b>Fecha:</b> {fecha_actual}",
                style_info
            )
        ]
    ]
    
    header_table = Table(header_data, colWidths=[3*inch, 4.5*inch])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))
    
    elements.append(header_table)
    elements.append(Spacer(1, 20))
    
    # ===== TABLA DE SOLICITUDES =====
    # Encabezados de la tabla
    table_headers = ['#', 'Tipo', 'Estado', 'Comentario', 'Día', 'Desde', 'Hasta', 
                     'Saldo\nActual', 'Horas', 'Saldo\nFinal']
    
    table_data = [table_headers]
    
    # Contadores
    total_permisos = 0
    total_notificaciones = 0
    total_rendiciones = 0
    total_regalos = 0
    
    horas_permisos = 0
    horas_notificaciones = 0
    horas_rendiciones = 0
    horas_regalos = 0
    
    # Calcular saldo inicial (antes del rango)
    saldo_actual = obtener_saldo_a_la_fecha(usuario['id'], fecha_desde)
    
    # Unificar transacciones y ordenarlas cronológicamente
    transacciones = []
    
    for sol in solicitudes:
        tipo = sol.get('type') or 'Permiso'
        estado = formatear_estado(sol.get('status', ''))
        comentario = sol.get('comment') or sol.get('obs') or ''
        dia = sol.get('date') or ''
        desde = sol.get('from_time') or ''
        hasta = sol.get('to_time') or ''
        horas = sol.get('hours') or 0
        sort_key = f"{dia} {desde or '00:00'}"
        
        transacciones.append({
            "id": sol.get('id', ''),
            "tipo": tipo,
            "estado": estado,
            "comentario": comentario,
            "dia": dia,
            "desde": desde,
            "hasta": hasta,
            "horas": horas,
            "sort_key": sort_key
        })
        
    for rend in rendiciones:
        tipo = 'Rendición'
        estado = formatear_estado(rend.get('status', ''))
        comentario = rend.get('obs') or ''
        created_local = rend.get('created_at') or ''
        dia = created_local[:10] if created_local else ''
        desde = '-'
        hasta = '-'
        horas = rend.get('total_horas') or 0
        sort_key = created_local.replace('T', ' ')[:16] if created_local else ''
        
        transacciones.append({
            "id": rend.get('id', ''),
            "tipo": tipo,
            "estado": estado,
            "comentario": comentario,
            "dia": dia,
            "desde": desde,
            "hasta": hasta,
            "horas": horas,
            "sort_key": sort_key
        })
        
    # Ordenar cronológicamente
    transacciones.sort(key=lambda t: t["sort_key"])
    
    # Procesar transacciones en la tabla principal
    for t in transacciones:
        id_str = str(t["id"])
        tipo = t["tipo"]
        estado = t["estado"]
        comentario = t["comentario"]
        dia_fmt = formatear_fecha(t["dia"])
        desde = t["desde"]
        hasta = t["hasta"]
        horas = t["horas"]
        
        saldo_final = saldo_actual
        if estado.lower() == 'aprobada':
            if tipo.lower() == 'permiso':
                saldo_final = round(saldo_actual - horas, 2)
                total_permisos += 1
                horas_permisos += horas
            elif tipo.lower() in ['abono', 'regalo']:
                saldo_final = round(saldo_actual + horas, 2)
                if tipo.lower() == 'regalo':
                    total_regalos += 1
                    horas_regalos += horas
            elif tipo.lower() == 'rendición':
                saldo_final = round(saldo_actual + horas, 2)
                total_rendiciones += 1
                horas_rendiciones += horas
        elif tipo.lower() in ['notificación', 'notificacion']:
            total_notificaciones += 1
            horas_notificaciones += horas
            
        # Truncar comentario si es muy largo
        if len(comentario) > 50:
            comentario = comentario[:47] + "..."
            
        row = [
            id_str,
            tipo,
            estado,
            comentario,
            dia_fmt,
            desde,
            hasta,
            str(saldo_actual),
            str(horas),
            str(saldo_final)
        ]
        table_data.append(row)
        
        # Actualizar saldo para la siguiente fila
        if estado.lower() == 'aprobada':
            saldo_actual = saldo_final
            
    # Crear tabla
    col_widths = [0.4*inch, 0.6*inch, 0.7*inch, 2.2*inch, 0.7*inch, 0.6*inch, 0.6*inch, 0.5*inch, 0.5*inch, 0.5*inch]
    
    main_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    # Estilos de la tabla
    table_style = TableStyle([
        # Encabezado
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f5e6d3')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#333333')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, 0), 'MIDDLE'),
        
        # Cuerpo
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ALIGN', (0, 1), (0, -1), 'CENTER'),  # #
        ('ALIGN', (4, 1), (9, -1), 'CENTER'),  # Día, Desde, Hasta, Saldos, Horas
        ('VALIGN', (0, 1), (-1, -1), 'MIDDLE'),
        
        # Bordes
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#dddddd')),
        ('LINEBELOW', (0, 0), (-1, 0), 1, colors.HexColor('#999999')),
        
        # Padding
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
    ])
    
    # Alternar colores de filas
    for i in range(1, len(table_data)):
        if i % 2 == 0:
            table_style.add('BACKGROUND', (0, i), (-1, i), colors.HexColor('#f9f9f9'))
            
    # Colorear filas según tipo y estado
    for i, row in enumerate(table_data[1:], start=1):
        tipo = row[1].lower()
        estado = row[2].lower()
        
        if 'notificación' in tipo or 'notificacion' in tipo:
            table_style.add('BACKGROUND', (0, i), (-1, i), colors.HexColor('#e3f2fd'))
        elif 'aprobada' in estado:
            table_style.add('BACKGROUND', (0, i), (-1, i), colors.HexColor('#e8f5e9'))
        elif 'rechazada' in estado:
            table_style.add('BACKGROUND', (0, i), (-1, i), colors.HexColor('#fce4ec'))
            
    main_table.setStyle(table_style)
    elements.append(main_table)
    
    # ===== RESUMEN =====
    elements.append(Spacer(1, 20))
    
    resumen_left = f"""
    <b>Total de Rendiciones:</b> {total_rendiciones}<br/>
    <b>Total de Notificaciones:</b> {total_notificaciones}<br/>
    <b>Total de Permisos:</b> {total_permisos}<br/>
    <b>Total de Regalos:</b> {total_regalos}
    """
    
    resumen_right = f"""
    <b>Total de horas Rendiciones:</b> {round(horas_rendiciones, 2)}<br/>
    <b>Total de horas Notificaciones:</b> {round(horas_notificaciones, 2)}<br/>
    <b>Total de horas Permisos:</b> {round(horas_permisos, 2)}<br/>
    <b>Total de horas Regalos:</b> {round(horas_regalos, 2)}
    """
    
    style_resumen = ParagraphStyle(
        'Resumen',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#333333'),
        leading=14
    )
    
    resumen_data = [
        [
            Paragraph(resumen_left, style_resumen),
            Paragraph(resumen_right, style_resumen)
        ]
    ]
    
    resumen_table = Table(resumen_data, colWidths=[3.75*inch, 3.75*inch])
    resumen_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))
    elements.append(resumen_table)
    
    # ===== FOOTER CON RANGO DE FECHAS =====
    elements.append(Spacer(1, 20))
    
    # Convertir fechas a formato legible
    desde_fmt = formatear_fecha(fecha_desde)
    hasta_fmt = formatear_fecha(fecha_hasta)
    
    footer_text = f"Solicitudes desde {desde_fmt} 08:30:00 hasta {hasta_fmt} 13:00:00"
    elements.append(Paragraph(footer_text, style_footer))
    
    # Construir PDF
    doc.build(elements)
    
    buffer.seek(0)
    return buffer


def formatear_estado(status):
    """Formatea el estado para mostrar en el reporte."""
    estados = {
        'pendiente': 'Pendiente',
        'pendiente_jefe': 'Pendiente',
        'pendiente_admin': 'Pendiente',
        'aprobado': 'Aprobada',
        'aprobado_jefe': 'Aprobada',
        'aprobado_admin': 'Aprobada',
        'rechazado': 'Rechazada',
        'rechazado_jefe': 'Rechazada',
        'rechazado_admin': 'Rechazada',
        'rechazada': 'Rechazada',
        'informativa': 'Aprobada'
    }
    return estados.get(status, status)


def formatear_fecha(fecha_str):
    """Convierte fecha de YYYY-MM-DD a DD-MM-YYYY."""
    if not fecha_str:
        return '-'
    try:
        if 'T' in fecha_str:
            fecha_str = fecha_str.split('T')[0]
        partes = fecha_str.split('-')
        if len(partes) == 3:
            return f"{partes[2]}-{partes[1]}-{partes[0]}"
        return fecha_str
    except:
        return fecha_str