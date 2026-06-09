import os
import sys

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app import create_app
from db import db, User, Request, Rendicion, sync_user_hours

def run_test():
    app = create_app()
    with app.app_context():
        print("STARTING HOURS SYNC INTEGRATION TEST...")
        
        # 1. Create a temporary user with 10.0 starting bonus hours
        test_email = "temp_test_user@sistema.local"
        existing = User.query.filter_by(email=test_email).first()
        if existing:
            db.session.delete(existing)
            db.session.commit()
            
        print("Creating temporary user with 10.0 bonus hours...")
        # Simulating the creation logic in users route
        new_user = User(
            name="Test User",
            email=test_email,
            password="test_password",
            role="trabajador",
            bonus_hours=10.0,
            used_hours=0.0,
            active=1
        )
        db.session.add(new_user)
        db.session.flush()
        
        # Create initial abono request
        now_iso = "2026-06-03T12:00:00"
        init_req = Request(
            user_id=new_user.id,
            date="2026-06-03",
            hours=10.0,
            type="Abono",
            comment="Bolsa de horas inicial",
            status="aprobado",
            created_at=now_iso,
            updated_at=now_iso
        )
        db.session.add(init_req)
        db.session.commit()
        
        sync_user_hours(new_user.id)
        db.session.refresh(new_user)
        
        print(f"User created. bonus_hours={new_user.bonus_hours}, used_hours={new_user.used_hours}")
        assert new_user.bonus_hours == 10.0
        assert new_user.used_hours == 0.0
        print("✓ Step 1: User creation correct.")
        
        # 2. Add an abono of 5.0 hours
        print("Adding 5.0 hours abono...")
        abono_req = Request(
            user_id=new_user.id,
            date="2026-06-03",
            hours=5.0,
            type="Abono",
            comment="Horas extras",
            status="aprobado",
            created_at=now_iso,
            updated_at=now_iso
        )
        db.session.add(abono_req)
        db.session.commit()
        
        sync_user_hours(new_user.id)
        db.session.refresh(new_user)
        
        print(f"Hours added. bonus_hours={new_user.bonus_hours}")
        assert new_user.bonus_hours == 15.0
        print("✓ Step 2: Abono addition correct.")
        
        # 3. Request and approve a Permiso of 4.0 hours
        print("Requesting and approving 4.0 hours permiso...")
        permiso_req = Request(
            user_id=new_user.id,
            date="2026-06-04",
            hours=4.0,
            type="Permiso",
            comment="Trámite",
            status="aprobado",
            created_at=now_iso,
            updated_at=now_iso
        )
        db.session.add(permiso_req)
        db.session.commit()
        
        sync_user_hours(new_user.id)
        db.session.refresh(new_user)
        
        print(f"Permiso approved. used_hours={new_user.used_hours}, bonus_hours={new_user.bonus_hours}")
        assert new_user.used_hours == 4.0
        assert new_user.bonus_hours == 15.0
        print("✓ Step 3: Permiso approval correct.")
        
        # 4. Reject the approved Permiso
        print("Rejecting approved permiso...")
        permiso_req.status = "rechazado"
        db.session.commit()
        
        sync_user_hours(new_user.id)
        db.session.refresh(new_user)
        
        print(f"Permiso rejected. used_hours={new_user.used_hours}")
        assert new_user.used_hours == 0.0
        print("✓ Step 4: Permiso rejection correct.")
        
        # Clean up
        db.session.delete(permiso_req)
        db.session.delete(abono_req)
        db.session.delete(init_req)
        db.session.delete(new_user)
        db.session.commit()
        print("✓ Cleaned up test records.")
        print("ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_test()
