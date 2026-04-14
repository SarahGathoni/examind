"""
ExamMind Database Seed Script
==============================
Run once to create tables and seed initial data.

Usage:
    cd backend
    python seed.py
"""

import sys
import os

# Ensure backend/ is on the path
sys.path.insert(0, os.path.dirname(__file__))

from app.database import Base, engine, SessionLocal
from app.models import Institution, User, School
from app.security import hash_password


def seed():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # ── System Admin ──────────────────────────────────────────────────────
        existing_sysadmin = db.query(User).filter(User.email == "admin@examind.io").first()
        if not existing_sysadmin:
            sysadmin = User(
                email="admin@examind.io",
                password_hash=hash_password("Admin@1234"),
                full_name="ExamMind Admin",
                role="system_admin",
                is_active=True,
            )
            db.add(sysadmin)
            db.flush()
            print(f"  ✓ System admin created: admin@examind.io / Admin@1234")
        else:
            print(f"  - System admin already exists, skipping")

        # ── Sample Institution ─────────────────────────────────────────────────
        inst = db.query(Institution).filter(Institution.code == "KABARAK").first()
        if not inst:
            inst = Institution(
                name="Kabarak University",
                code="KABARAK",
                country="Kenya",
            )
            db.add(inst)
            db.flush()
            print(f"  ✓ Institution created: Kabarak University (KABARAK)")
        else:
            print(f"  - Kabarak University already exists, skipping")

        # ── Institution Admin ─────────────────────────────────────────────────
        inst_admin = db.query(User).filter(User.email == "admin@kabarak.ac.ke").first()
        if not inst_admin:
            inst_admin = User(
                email="admin@kabarak.ac.ke",
                password_hash=hash_password("Admin@1234"),
                full_name="Kabarak Admin",
                role="admin",
                institution_id=inst.id,
                is_active=True,
            )
            db.add(inst_admin)
            db.flush()
            print(f"  ✓ Institution admin created: admin@kabarak.ac.ke / Admin@1234")
        else:
            print(f"  - Institution admin already exists, skipping")

        # ── Schools ────────────────────────────────────────────────────────────
        school_names = ["School of Nursing", "School of Medicine", "School of Engineering"]
        schools = {}
        for name in school_names:
            school = db.query(School).filter(
                School.name == name, School.institution_id == inst.id
            ).first()
            if not school:
                school = School(name=name, institution_id=inst.id)
                db.add(school)
                db.flush()
                print(f"  ✓ School created: {name}")
            else:
                print(f"  - School '{name}' already exists, skipping")
            schools[name] = school

        # ── Sample Users ───────────────────────────────────────────────────────
        sample_users = [
            {
                "email": "examiner@kabarak.ac.ke",
                "full_name": "Dr. Mary Wanjiru",
                "role": "examiner",
                "password": "Exam@1234",
                "school": "School of Nursing",
            },
            {
                "email": "moderator@kabarak.ac.ke",
                "full_name": "Dr. Bryant Sang",
                "role": "moderator",
                "password": "Mod@1234",
                "school": "School of Medicine",
            },
            {
                "email": "hod@kabarak.ac.ke",
                "full_name": "Prof. Valerie Suge",
                "role": "hod",
                "password": "Hod@1234",
                "school": "School of Nursing",
            },
        ]

        for u_data in sample_users:
            existing = db.query(User).filter(User.email == u_data["email"]).first()
            if not existing:
                school = schools.get(u_data["school"])
                user = User(
                    email=u_data["email"],
                    password_hash=hash_password(u_data["password"]),
                    full_name=u_data["full_name"],
                    role=u_data["role"],
                    institution_id=inst.id,
                    school_id=school.id if school else None,
                    is_active=True,
                )
                db.add(user)
                print(f"  ✓ User created: {u_data['email']} / {u_data['password']} ({u_data['role']})")
            else:
                print(f"  - User '{u_data['email']}' already exists, skipping")

        db.commit()

        print("\n" + "="*60)
        print("SEED COMPLETE — Login credentials:")
        print("="*60)
        print(f"  System Admin:       admin@examind.io          / Admin@1234")
        print(f"  Institution Admin:  admin@kabarak.ac.ke       / Admin@1234")
        print(f"  Examiner:           examiner@kabarak.ac.ke    / Exam@1234")
        print(f"  Moderator:          moderator@kabarak.ac.ke   / Mod@1234")
        print(f"  HOD:                hod@kabarak.ac.ke         / Hod@1234")
        print("="*60)

    except Exception as e:
        db.rollback()
        print(f"\n❌ Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
