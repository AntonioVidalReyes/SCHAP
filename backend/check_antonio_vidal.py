import os
import sys

sys.path.append("/app")

from app import create_app
from db import db, User, Request, Rendicion, RendicionHito

app = create_app()
with app.app_context():
    # Find Antonio Vidal
    user = User.query.filter(User.name.ilike("%antonio vidal%")).first()
    if not user:
        with open("/app/antonio_vidal_output.txt", "w", encoding="utf-8") as f:
            f.write("USER NOT FOUND")
        sys.exit(1)
        
    lines = []
    lines.append(f"USER FOUND: {user.name} (ID {user.id}) Email: {user.email}")
    lines.append(f"Accumulated hours in DB: bonus_hours={user.bonus_hours}, used_hours={user.used_hours}")
    lines.append(f"Current balance: {user.bonus_hours - user.used_hours}")
    
    lines.append("\n--- REQUESTS ---")
    reqs = Request.query.filter_by(user_id=user.id).order_by(Request.date, Request.id).all()
    for r in reqs:
        # Request attributes
        lines.append(f"ID: {r.id} | Type: {r.type} | Status: {r.status} | Date: {r.date} | Times: {r.from_time or ''}-{r.to_time or ''} | Hours: {r.hours} | Comment: {r.comment or ''}")
        
    lines.append("\n--- RENDICIONES ---")
    rends = Rendicion.query.filter_by(user_id=user.id).order_by(Rendicion.created_at, Rendicion.id).all()
    for ren in rends:
        lines.append(f"Rendicion ID: {ren.id} | Status: {ren.status} | Total Hours: {ren.total_horas} | Work: {ren.trabajo or ''} | Date: {ren.created_at}")
        hitos = RendicionHito.query.filter_by(rendicion_id=ren.id).order_by(RendicionHito.day).all()
        for h in hitos:
            lines.append(f"  Hito: Day={h.day} | Times={h.desde or ''}-{h.hasta or ''} | Type={h.tipo} | Hours={h.valor}")

    with open("/app/antonio_vidal_output.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
