import sys
sys.path.append("/app")
from app import create_app
from db import db, User, Request

app = create_app()
with app.app_context():
    users = User.query.filter_by(active=1).all()
    for u in users:
        print(f"User: {u.name} (ID: {u.id}, Role: {u.role})")
        # Find all abonos/regalos
        abonos = Request.query.filter(
            Request.user_id == u.id,
            Request.type.in_(["Abono", "abono", "Regalo", "regalo"])
        ).order_by(Request.date).all()
        if abonos:
            for ab in abonos:
                print(f"  - Date: {ab.date} | Hours: {ab.hours} | Comment: {ab.comment} | Status: {ab.status}")
        else:
            print("  - No abonos/regalos found")
        print("-" * 50)
