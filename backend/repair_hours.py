import os
import sys

# Add current directory to path so python can find backend modules
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app import create_app
from db import db, User, sync_user_hours

def main():
    app = create_app()
    with app.app_context():
        print("REPAIRING USER HOURS...")
        users = User.query.all()
        for u in users:
            if u.role == 'superusuario':
                continue
            
            old_bonus = u.bonus_hours
            old_used = u.used_hours
            
            # Sync user hours
            sync_user_hours(u.id)
            
            # Refresh user from database
            db.session.refresh(u)
            
            print(f"User: {u.name} ({u.email})")
            print(f"  bonus_hours: {old_bonus} -> {u.bonus_hours}")
            print(f"  used_hours:  {old_used} -> {u.used_hours}")
            print(f"  Net Balance: {round(u.bonus_hours - u.used_hours, 2)}")
            print("-" * 40)
        
        print("REPAIR COMPLETE.")

if __name__ == "__main__":
    main()
