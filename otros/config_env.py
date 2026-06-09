# config.py
# ============================================
# CONFIGURACIÓN DE ENTORNO - CPA
# ============================================
# Backend Flask

import os
from datetime import timedelta

class Config:
    """Configuración base"""
    
    # ========== SERVIDOR ==========
    HOST = os.getenv("FLASK_HOST", "127.0.0.1")
    PORT = int(os.getenv("FLASK_PORT", 3000))
    DEBUG = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    
    # ========== BASE DE DATOS ==========
    DATABASE_PATH = os.getenv("DATABASE_PATH", "database.db")
    
    # ========== SEGURIDAD ==========
    SECRET_KEY = os.getenv("SECRET_KEY", "cpa-schap-secret-key-2025")
    JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", 8))
    JWT_EXPIRATION_DELTA = timedelta(hours=JWT_EXPIRATION_HOURS)
    
    # ========== EMPRESA ==========
    COMPANY_NAME = os.getenv("COMPANY_NAME", "SCHAP")
    APP_NAME = os.getenv("APP_NAME", "CPA")
    
    # ========== EMAIL ==========
    SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
    SMTP_USER = os.getenv("SMTP_USER", "correo_sistema@tuempresa.cl")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "tu_contraseña_app")
    SMTP_FROM = os.getenv("SMTP_FROM", "noreply@tuempresa.cl")
    SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "True").lower() == "true"
    EMAIL_ENABLED = os.getenv("EMAIL_ENABLED", "False").lower() == "true"
    
    # ========== USUARIO POR DEFECTO ==========
    DEFAULT_USER_EMAIL = os.getenv("DEFAULT_USER_EMAIL", "admin@sistema.local")
    DEFAULT_USER_PASSWORD = os.getenv("DEFAULT_USER_PASSWORD", "admin123")
    DEFAULT_USER_NAME = os.getenv("DEFAULT_USER_NAME", "Administrador")
    
    # ========== HORARIOS POR DEFECTO ==========
    DEFAULT_WORK_START = os.getenv("DEFAULT_WORK_START", "08:30")
    DEFAULT_WORK_END = os.getenv("DEFAULT_WORK_END", "18:00")
    
    # ========== FACTORES POR DEFECTO ==========
    DEFAULT_FACTOR_ALOJAMIENTO = float(os.getenv("DEFAULT_FACTOR_ALOJAMIENTO", 4.5))
    DEFAULT_FACTOR_FERIADO = float(os.getenv("DEFAULT_FACTOR_FERIADO", 200))
    DEFAULT_FACTOR_EXTRAS = float(os.getenv("DEFAULT_FACTOR_EXTRAS", 150))
    DEFAULT_FACTOR_VIAJE = float(os.getenv("DEFAULT_FACTOR_VIAJE", 50))
    
    # ========== LÍMITES ==========
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", 10 * 1024 * 1024))  # 10MB
    MAX_HITOS_PER_RENDICION = int(os.getenv("MAX_HITOS_PER_RENDICION", 50))
    
    # ========== CORS ==========
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")
    
    # ========== TIMEZONE ==========
    TIMEZONE = os.getenv("TIMEZONE", "America/Santiago")
    TIMEZONE_OFFSET_HOURS = int(os.getenv("TIMEZONE_OFFSET_HOURS", -3))


class DevelopmentConfig(Config):
    """Configuración para desarrollo"""
    DEBUG = True
    EMAIL_ENABLED = False


class ProductionConfig(Config):
    """Configuración para producción"""
    DEBUG = False
    EMAIL_ENABLED = True
    
    # En producción, estas variables DEBEN estar en el entorno
    SECRET_KEY = os.getenv("SECRET_KEY")
    SMTP_USER = os.getenv("SMTP_USER")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")


class TestingConfig(Config):
    """Configuración para testing"""
    DEBUG = True
    TESTING = True
    DATABASE_PATH = ":memory:"
    EMAIL_ENABLED = False


# Seleccionar configuración según entorno
config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": DevelopmentConfig
}

def get_config():
    """Obtiene la configuración según la variable de entorno FLASK_ENV"""
    env = os.getenv("FLASK_ENV", "development")
    return config_by_name.get(env, DevelopmentConfig)