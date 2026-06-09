#!/usr/bin/env python3
# ============================================
# RESET DATABASE - SCHAP CPA
# ============================================
# Elimina la base de datos existente y crea una nueva
# con el usuario administrador por defecto
#
# Uso: python reset_db.py
# ============================================

import os
import sqlite3
import hashlib
import json
from datetime import datetime, timezone, timedelta

# Cargar variables de entorno desde .env
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("Advertencia: python-dotenv no instalado, usando valores por defecto")

# ============================================
# CONFIGURACIÓN DESDE .env
# ============================================

DATABASE_PATH = os.getenv("DATABASE_PATH", "database.db")
DEFAULT_ADMIN_EMAIL = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@sistema.local")
DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")
DEFAULT_ADMIN_NAME = os.getenv("DEFAULT_ADMIN_NAME", "Administrador")

DEFAULT_WORK_START = os.getenv("DEFAULT_WORK_START", "08:30")
DEFAULT_WORK_END = os.getenv("DEFAULT_WORK_END", "18:00")

DEFAULT_FACTOR_ALOJAMIENTO = float(os.getenv("DEFAULT_FACTOR_ALOJAMIENTO", "4.5"))
DEFAULT_FACTOR_FERIADO = float(os.getenv("DEFAULT_FACTOR_FERIADO", "200"))
DEFAULT_FACTOR_EXTRAS = float(os.getenv("DEFAULT_FACTOR_EXTRAS", "150"))
DEFAULT_FACTOR_VIAJE = float(os.getenv("DEFAULT_FACTOR_VIAJE", "50"))

# ============================================
# FUNCIONES
# ============================================

def get_chile_time():
    """Obtiene la hora actual en Chile (UTC-3)"""
    chile_tz = timezone(timedelta(hours=-3))
    return datetime.now(chile_tz).strftime("%Y-%m-%dT%H:%M:%S")


def hash_password(password):
    """Genera hash SHA256 de la contraseña"""
    return hashlib.sha256(password.encode()).hexdigest()


def delete_database():
    """Elimina la base de datos si existe"""
    if os.path.exists(DATABASE_PATH):
        os.remove(DATABASE_PATH)
        print(f"✓ Base de datos eliminada: {DATABASE_PATH}")
    else:
        print(f"○ No existía base de datos: {DATABASE_PATH}")


def create_tables(conn):
    """Crea todas las tablas necesarias"""
    cur = conn.cursor()
    
    # Tabla: users
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'trabajador',
            boss_id INTEGER,
            bonus_hours REAL DEFAULT 0,
            used_hours REAL DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at TEXT,
            FOREIGN KEY (boss_id) REFERENCES users(id)
        )
    """)
    
    # Tabla: requests (permisos y notificaciones)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            hours REAL DEFAULT 0,
            type TEXT DEFAULT 'Permiso',
            comment TEXT,
            status TEXT DEFAULT 'pendiente',
            reject_reason TEXT,
            from_time TEXT,
            to_time TEXT,
            full_day INTEGER DEFAULT 0,
            created_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    
    # Tabla: rendiciones
    cur.execute("""
        CREATE TABLE IF NOT EXISTS rendiciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            cliente TEXT,
            guia TEXT,
            trabajo TEXT,
            proyecto TEXT,
            obs TEXT,
            total_horas REAL DEFAULT 0,
            tiempos TEXT,
            status TEXT DEFAULT 'pendiente',
            razon TEXT,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    
    # Tabla: rendicion_hitos
    cur.execute("""
        CREATE TABLE IF NOT EXISTS rendicion_hitos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rendicion_id INTEGER NOT NULL,
            day TEXT,
            desde TEXT,
            hasta TEXT,
            tipo TEXT,
            valor REAL DEFAULT 0,
            alojamiento INTEGER DEFAULT 0,
            feriado INTEGER DEFAULT 0,
            FOREIGN KEY (rendicion_id) REFERENCES rendiciones(id) ON DELETE CASCADE
        )
    """)
    
    # Tabla: config (horarios, factores, etc.)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    
    conn.commit()
    print("✓ Tablas creadas correctamente")


def create_default_admin(conn):
    """Crea el usuario administrador por defecto"""
    cur = conn.cursor()
    
    now = get_chile_time()
    password_hash = hash_password(DEFAULT_ADMIN_PASSWORD)
    
    cur.execute("""
        INSERT INTO users (email, password, name, role, bonus_hours, used_hours, active, created_at)
        VALUES (?, ?, ?, 'administrador', 40, 0, 1, ?)
    """, (DEFAULT_ADMIN_EMAIL, password_hash, DEFAULT_ADMIN_NAME, now))
    
    conn.commit()
    print(f"✓ Usuario administrador creado:")
    print(f"  Email: {DEFAULT_ADMIN_EMAIL}")
    print(f"  Contraseña: {DEFAULT_ADMIN_PASSWORD}")


def create_default_schedule(conn):
    """Crea el horario laboral por defecto"""
    cur = conn.cursor()
    
    schedule = {
        "monday": {"start": DEFAULT_WORK_START, "end": DEFAULT_WORK_END, "off": False},
        "tuesday": {"start": DEFAULT_WORK_START, "end": DEFAULT_WORK_END, "off": False},
        "wednesday": {"start": DEFAULT_WORK_START, "end": DEFAULT_WORK_END, "off": False},
        "thursday": {"start": DEFAULT_WORK_START, "end": DEFAULT_WORK_END, "off": False},
        "friday": {"start": DEFAULT_WORK_START, "end": DEFAULT_WORK_END, "off": False},
        "saturday": {"start": "", "end": "", "off": True},
        "sunday": {"start": "", "end": "", "off": True}
    }
    
    cur.execute("""
        INSERT OR REPLACE INTO config (key, value) VALUES ('schedule', ?)
    """, (json.dumps(schedule),))
    
    conn.commit()
    print(f"✓ Horario laboral configurado: {DEFAULT_WORK_START} - {DEFAULT_WORK_END} (L-V)")


def create_default_factores(conn):
    """Crea los factores de rendición por defecto"""
    cur = conn.cursor()
    
    factores = {
        "alojamiento": DEFAULT_FACTOR_ALOJAMIENTO,
        "feriado": DEFAULT_FACTOR_FERIADO,
        "extras": DEFAULT_FACTOR_EXTRAS,
        "viaje": DEFAULT_FACTOR_VIAJE
    }
    
    cur.execute("""
        INSERT OR REPLACE INTO config (key, value) VALUES ('factores_rendicion', ?)
    """, (json.dumps(factores),))
    
    conn.commit()
    print(f"✓ Factores de rendición configurados:")
    print(f"  Alojamiento: {DEFAULT_FACTOR_ALOJAMIENTO} hrs/día")
    print(f"  Feriado: {DEFAULT_FACTOR_FERIADO}%")
    print(f"  Extras L-S: {DEFAULT_FACTOR_EXTRAS}%")
    print(f"  Viaje: {DEFAULT_FACTOR_VIAJE}%")


def main():
    """Función principal"""
    print("")
    print("=" * 50)
    print("  RESET DATABASE - SCHAP CPA")
    print("=" * 50)
    print("")
    
    # Confirmar acción
    confirm = input("¿Eliminar y recrear la base de datos? (s/N): ")
    if confirm.lower() != 's':
        print("\n✗ Operación cancelada")
        return
    
    print("")
    
    # 1. Eliminar BD existente
    delete_database()
    
    # 2. Crear nueva conexión
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    
    try:
        # 3. Crear tablas
        create_tables(conn)
        
        # 4. Crear admin por defecto
        create_default_admin(conn)
        
        # 5. Crear horario por defecto
        create_default_schedule(conn)
        
        # 6. Crear factores por defecto
        create_default_factores(conn)
        
        print("")
        print("=" * 50)
        print("  ✓ BASE DE DATOS CREADA EXITOSAMENTE")
        print("=" * 50)
        print("")
        print("Inicie el servidor con: python app.py")
        print("")
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
