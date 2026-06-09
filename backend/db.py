from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash
import json
import time

# Instancia global de SQLAlchemy
db = SQLAlchemy()

# Usuario por defecto del sistema
DEFAULT_USER_EMAIL = "admin@sistema.local"
DEFAULT_USER_PASSWORD = "admin123"

# ==============================================================================
# MODELOS DE BASE DE DATOS
# ==============================================================================

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password = db.Column(db.String(500), nullable=False)
    role = db.Column(db.String(50), nullable=False, default='trabajador')
    bonus_hours = db.Column(db.Float, default=0.0)
    used_hours = db.Column(db.Float, default=0.0)
    active = db.Column(db.Integer, default=1)
    boss_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    must_change_password = db.Column(db.Integer, default=0)

    # Autorelación jefe/subordinados
    boss = db.relationship('User', remote_side=[id], backref=db.backref('subordinates', lazy='dynamic'))

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "bonus_hours": self.bonus_hours,
            "used_hours": self.used_hours,
            "active": self.active,
            "boss_id": self.boss_id,
            "must_change_password": self.must_change_password
        }

class Request(db.Model):
    __tablename__ = 'requests'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    date = db.Column(db.String(50), nullable=False)
    hours = db.Column(db.Float, nullable=False)
    type = db.Column(db.String(50), default='Permiso')
    comment = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(50), default='pendiente')
    created_at = db.Column(db.String(50), nullable=False)
    from_time = db.Column(db.String(20), nullable=True)
    to_time = db.Column(db.String(20), nullable=True)
    reject_reason = db.Column(db.Text, nullable=True)
    updated_at = db.Column(db.String(50), nullable=True)

    # Relación con usuario
    user = db.relationship('User', backref=db.backref('requests', cascade='all, delete-orphan', lazy='dynamic'))

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "date": self.date,
            "hours": self.hours,
            "type": self.type,
            "comment": self.comment,
            "status": self.status,
            "created_at": self.created_at,
            "from_time": self.from_time,
            "to_time": self.to_time,
            "reject_reason": self.reject_reason,
            "updated_at": self.updated_at
        }

class ConfigModel(db.Model):
    __tablename__ = 'config'
    key = db.Column(db.String(255), primary_key=True)
    value = db.Column(db.Text, nullable=False)

class Rendicion(db.Model):
    __tablename__ = 'rendiciones'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    cliente = db.Column(db.String(255), nullable=True)
    guia = db.Column(db.String(255), nullable=True)
    trabajo = db.Column(db.Text, nullable=True)
    proyecto = db.Column(db.String(255), nullable=True)
    obs = db.Column(db.Text, nullable=True)
    total_horas = db.Column(db.Float, default=0.0)
    tiempos = db.Column(db.Text, nullable=True)  # Serializado a JSON
    status = db.Column(db.String(50), default='pendiente')
    razon = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.String(50), nullable=False)
    updated_at = db.Column(db.String(50), nullable=True)

    # Relación con usuario
    user = db.relationship('User', backref=db.backref('rendiciones', cascade='all, delete-orphan', lazy='dynamic'))

    def to_dict(self):
        t_horas = self.total_horas
        if (not t_horas or t_horas == 0.0) and self.tiempos:
            try:
                tiempos_data = json.loads(self.tiempos) if isinstance(self.tiempos, str) else self.tiempos
                if isinstance(tiempos_data, dict):
                    calc_total = 0.0
                    for cat in ['alojamiento', 'feriado', 'extras', 'viaje']:
                        calc_total += float(tiempos_data.get(cat, {}).get('ajustado', 0.0))
                    if calc_total > 0:
                        t_horas = round(calc_total, 2)
            except Exception as e:
                print(f"Error computing fallback total_horas in to_dict: {e}")
        return {
            "id": self.id,
            "user_id": self.user_id,
            "cliente": self.cliente,
            "guia": self.guia,
            "trabajo": self.trabajo,
            "proyecto": self.proyecto,
            "obs": self.obs,
            "total_horas": t_horas,
            "tiempos": self.tiempos,
            "status": self.status,
            "razon": self.razon,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }

class RendicionHito(db.Model):
    __tablename__ = 'rendicion_hitos'
    id = db.Column(db.Integer, primary_key=True)
    rendicion_id = db.Column(db.Integer, db.ForeignKey('rendiciones.id', ondelete='CASCADE'), nullable=False)
    day = db.Column(db.String(50), nullable=True)
    desde = db.Column(db.String(20), nullable=True)
    hasta = db.Column(db.String(20), nullable=True)
    tipo = db.Column(db.String(50), nullable=True)
    alojamiento = db.Column(db.Integer, default=0)
    feriado = db.Column(db.Integer, default=0)
    valor = db.Column(db.Float, default=0.0)

    # Relación con rendiciones
    rendicion = db.relationship('Rendicion', backref=db.backref('hitos', cascade='all, delete-orphan', lazy='dynamic'))

    def to_dict(self):
        return {
            "id": self.id,
            "rendicion_id": self.rendicion_id,
            "day": self.day,
            "desde": self.desde,
            "hasta": self.hasta,
            "tipo": self.tipo,
            "alojamiento": self.alojamiento,
            "feriado": self.feriado,
            "valor": self.valor
        }

# ==============================================================================
# FUNCIONES DE AYUDA Y RETROCOMPATIBILIDAD
# ==============================================================================

def get_db():
    """
    Retorna un cursor y conexión psycopg2 directo/compatible desde el engine de SQLAlchemy.
    Útil para retrocompatibilidad mientras se refactorizan endpoints.
    """
    import psycopg2.extras
    # Obtener conexión cruda
    raw_conn = db.engine.raw_connection()
    
    # Para que actúe igual que DictConnection (retornar diccionarios en cursores)
    # Sobrescribimos el cursor para usar RealDictCursor por defecto
    original_cursor = raw_conn.cursor
    def dict_cursor(*args, **kwargs):
        kwargs.setdefault('cursor_factory', psycopg2.extras.RealDictCursor)
        return original_cursor(*args, **kwargs)
    raw_conn.cursor = dict_cursor
    
    return raw_conn

def hash_password(password: str) -> str:
    """Hash de contraseña usando werkzeug."""
    return generate_password_hash(password)

def init_db():
    """Inicializa la base de datos creando las tablas y cargando valores por defecto."""
    retries = 15
    while retries > 0:
        try:
            # Crear tablas en el contexto actual
            db.create_all()
            
            # Migración: Agregar columna updated_at a la tabla requests si no existe
            try:
                db.session.execute(db.text("ALTER TABLE requests ADD COLUMN IF NOT EXISTS updated_at VARCHAR(50)"))
                db.session.commit()
            except Exception as e:
                print(f"[MIGRATION] Error al agregar columna updated_at a requests: {e}")
                db.session.rollback()
                
            break
        except Exception as e:
            print(f"[DATABASE] Esperando a la base de datos... ({retries} reintentos). Error: {e}")
            retries -= 1
            time.sleep(3)

    # ---- Insertar configuración de horarios por defecto ----
    sched = ConfigModel.query.filter_by(key='work_schedule').first()
    if not sched:
        default_schedule = {
            "monday": {"start": "08:30", "end": "18:30", "off": False},
            "tuesday": {"start": "08:30", "end": "18:30", "off": False},
            "wednesday": {"start": "08:30", "end": "18:30", "off": False},
            "thursday": {"start": "08:30", "end": "18:30", "off": False},
            "friday": {"start": "08:30", "end": "18:30", "off": False},
            "saturday": {"start": "", "end": "", "off": True},
            "sunday": {"start": "", "end": "", "off": True}
        }
        new_sched = ConfigModel(key='work_schedule', value=json.dumps(default_schedule))
        db.session.add(new_sched)
        db.session.commit()
        print("[DATABASE] Horarios de trabajo por defecto inicializados.")

    # ---- Insertar configuración de factores por defecto ----
    factores = ConfigModel.query.filter_by(key='factores_rendicion').first()
    if not factores:
        default_factores = {
            "alojamiento": 4.5,
            "feriado": 200,
            "extras": 150,
            "viaje": 50
        }
        new_factores = ConfigModel(key='factores_rendicion', value=json.dumps(default_factores))
        db.session.add(new_factores)
        db.session.commit()
        print("[DATABASE] Factores de rendición por defecto inicializados.")

    # ---- Usuario por defecto (administrador temporal) ----
    admin_exists = User.query.filter_by(role='administrador').first()
    if not admin_exists:
        default_exists = User.query.filter_by(email=DEFAULT_USER_EMAIL).first()
        if not default_exists:
            new_admin = User(
                name="Admin Temporal",
                email=DEFAULT_USER_EMAIL,
                password=hash_password(DEFAULT_USER_PASSWORD),
                role='administrador',
                bonus_hours=0.0,
                used_hours=0.0,
                active=1,
                boss_id=None,
                must_change_password=0
            )
            db.session.add(new_admin)
            db.session.commit()
            print("=" * 50)
            print("USUARIO POR DEFECTO CREADO (SQLAlchemy)")
            print("=" * 50)
            print(f"Email: {DEFAULT_USER_EMAIL}")
            print(f"Contraseña: {DEFAULT_USER_PASSWORD}")
            print("=" * 50)

    # ---- Usuario Superusuario (oculto en la base de datos) ----
    super_exists = User.query.filter_by(role='superusuario').first()
    if not super_exists:
        new_super = User(
            name="Superusuario Sistema",
            email="super@sistema.local",
            password=hash_password("super123"),
            role='superusuario',
            bonus_hours=0.0,
            used_hours=0.0,
            active=1,
            boss_id=None,
            must_change_password=0
        )
        db.session.add(new_super)
        db.session.commit()
        print("=" * 50)
        print("USUARIO SUPERUSUARIO CREADO")
        print("=" * 50)
        print("Email: super@sistema.local")
        print("Contraseña: super123")
        print("=" * 50)

def get_system_timezone():
    """Obtiene la zona horaria del sistema de la base de datos (por defecto 'America/Santiago')."""
    try:
        row = ConfigModel.query.filter_by(key="system_timezone").first()
        if row:
            try:
                val = json.loads(row.value)
                if isinstance(val, dict):
                    return val.get("value", "America/Santiago")
                return val
            except:
                return row.value
    except Exception as e:
        print(f"[TIMEZONE] Error leyendo config, usando America/Santiago: {e}")
    return 'America/Santiago'

def convert_utc_to_local(utc_str):
    """Convierte un timestamp UTC a la zona horaria del sistema."""
    if not utc_str:
        return utc_str
    tz_name = get_system_timezone()
    from zoneinfo import ZoneInfo
    from datetime import datetime, timezone
    try:
        cleaned = utc_str.replace('T', ' ')
        dt = None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(cleaned[:19], fmt)
                break
            except ValueError:
                continue
        if not dt:
            return utc_str
        
        dt = dt.replace(tzinfo=timezone.utc)
        local_dt = dt.astimezone(ZoneInfo(tz_name))
        return local_dt.strftime("%Y-%m-%dT%H:%M:%S")
    except Exception as e:
        print(f"[TIMEZONE CONVERT ERROR] {e}")
        return utc_str

def get_utc_now_iso():
    """Obtiene la hora actual UTC en formato ISO."""
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

def sync_user_hours(user_id):
    """
    Recalcula y sincroniza las columnas bonus_hours y used_hours del usuario
    basándose en la suma de sus solicitudes (Permiso, Abono, Regalo) y rendiciones aprobadas.
    """
    user = User.query.get(user_id)
    if not user:
        return None

    # 1. Sumar todas las solicitudes de tipo 'Permiso' aprobadas
    permisos_sum = db.session.query(db.func.sum(Request.hours)).filter(
        Request.user_id == user_id,
        Request.type.ilike('permiso%'),
        Request.status.in_(['aprobado', 'aprobado_jefe', 'aprobado_admin'])
    ).scalar() or 0.0

    # 2. Sumar todas las solicitudes de tipo 'Abono' o 'Regalo' aprobadas o informativas
    abonos_sum = db.session.query(db.func.sum(Request.hours)).filter(
        Request.user_id == user_id,
        Request.type.in_(['Abono', 'abono', 'Regalo', 'regalo']),
        Request.status.in_(['aprobado', 'aprobado_jefe', 'aprobado_admin', 'informativa'])
    ).scalar() or 0.0

    # 3. Sumar todas las rendiciones aprobadas
    rends_sum = db.session.query(db.func.sum(Rendicion.total_horas)).filter(
        Rendicion.user_id == user_id,
        Rendicion.status.in_(['aprobado', 'aprobado_jefe', 'aprobado_admin'])
    ).scalar() or 0.0

    user.used_hours = round(float(permisos_sum), 2)
    user.bonus_hours = round(float(abonos_sum + rends_sum), 2)
    
    db.session.commit()
    return user