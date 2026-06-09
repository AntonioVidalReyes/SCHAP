import sys
sys.path.append("/app")

from app import create_app
from db import db, User, Request, Rendicion

app = create_app()
with app.app_context():
    # Find Antonio Vidal
    user = User.query.filter(User.name.ilike("%antonio vidal%")).first()
    if not user:
        print("User Antonio Vidal not found!")
        sys.exit(1)
        
    print(f"RECONSTRUCTING CHRONOLOGICAL HISTORY FOR: {user.name}")
    
    events = []
    
    # 1. Fetch all requests
    reqs = Request.query.filter_by(user_id=user.id).all()
    for r in reqs:
        date = r.date
        hours = r.hours or 0.0
        
        impact = 0.0
        category = ""
        
        if r.type in ["Permiso", "permiso"]:
            if r.status in ["aprobado", "aprobado_jefe", "aprobado_admin"]:
                impact = -hours
                category = "Permiso (Aprobado)"
            elif r.status in ["rechazado", "rechazado_jefe", "rechazado_admin", "rechazada"]:
                category = "Permiso (Rechazado - No impacta)"
            else:
                category = f"Permiso ({r.status})"
        elif r.type in ["Abono", "abono", "Regalo", "regalo"]:
            if r.status in ["aprobado", "aprobado_jefe", "aprobado_admin", "informativa"]:
                impact = hours
                category = "Abono/Regalo"
            else:
                category = f"Abono ({r.status})"
        elif r.type in ["Notificación", "notificacion"]:
            category = f"Notificación ({r.status})"
            
        events.append({
            "id": r.id,
            "date": date,
            "type": r.type,
            "status": r.status,
            "hours": hours,
            "comment": r.comment or "",
            "category": category,
            "impact": impact,
            "is_bonus": impact > 0 or r.type in ["Abono", "abono", "Regalo", "regalo"],
            "is_used": impact < 0
        })
        
    # 2. Fetch all rendiciones
    rends = Rendicion.query.filter_by(user_id=user.id).all()
    for ren in rends:
        if ren.status in ["aprobado", "aprobado_jefe", "aprobado_admin"]:
            # A rendición adds its total_horas as bonus
            # Let's find the date of the first hito, or use created_at date
            hitos = ren.hitos.all()
            date = ren.created_at.split("T")[0]
            if hitos:
                # Use the earliest hito day as the effective date
                hitos_sorted = sorted(hitos, key=lambda h: h.day or "")
                if hitos_sorted[0].day:
                    date = hitos_sorted[0].day
                    
            events.append({
                "id": f"R-{ren.id}",
                "date": date,
                "type": "Rendición",
                "status": ren.status,
                "hours": ren.total_horas,
                "comment": f"Rendición #{ren.id} - {ren.trabajo or ''}",
                "category": "Rendición (Aprobada)",
                "impact": ren.total_horas,
                "is_bonus": True,
                "is_used": False
            })
                
    # Sort events chronologically by date and ID
    def get_sort_key(e):
        d = e["date"] or "1970-01-01"
        d = d.split(" ")[0].split("T")[0]
        eid = str(e["id"])
        return (d, eid)
        
    events.sort(key=get_sort_key)
    
    # Reconstruct running balance
    running_bonus = 0.0
    running_used = 0.0
    
    lines = []
    lines.append(f"Fecha | Tipo | ID | Estado | Horas | Bolsa Acum. | Consumo Acum. | Balance | Comentario")
    lines.append(f"---|---|---|---|---|---|---|---|---")
    
    for e in events:
        if e["type"] in ["Permiso", "permiso"] and e["status"] in ["aprobado", "aprobado_jefe", "aprobado_admin"]:
            running_used += e["hours"]
        elif e["type"] in ["Abono", "abono", "Regalo", "regalo"] and e["status"] in ["aprobado", "aprobado_jefe", "aprobado_admin", "informativa"]:
            running_bonus += e["hours"]
        elif e["type"] == "Rendición" and e["status"] in ["aprobado", "aprobado_jefe", "aprobado_admin"]:
            running_bonus += e["hours"]
            
        balance = running_bonus - running_used
        lines.append(f"{e['date']} | {e['type']} | {e['id']} | {e['status']} | {e['hours']} | {round(running_bonus, 2)} | {round(running_used, 2)} | {round(balance, 2)} | {e['comment']}")
        
    with open("/app/antonio_vidal_reconstruction.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("Reconstruction complete!")
