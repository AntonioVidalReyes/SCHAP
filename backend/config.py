import os
from dotenv import load_dotenv

# Cargar variables de entorno desde el archivo .env
load_dotenv()

class Config:
    """Configuración central de la aplicación SCHAP."""

    # Seguridad
    SECRET_KEY = os.getenv("SECRET_KEY", "schap-super-secret-jwt-key-2025")

    # Base de datos PostgreSQL
    DB_HOST = os.getenv("DB_HOST", "db")
    DB_PORT = os.getenv("DB_PORT", "5432")
    DB_NAME = os.getenv("DB_NAME", "schap_db")
    DB_USER = os.getenv("DB_USER", "postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "schap_secure_password_2025")
    SQLALCHEMY_DATABASE_URI = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Empresa
    COMPANY_NAME = os.getenv("COMPANY_NAME", "SCHAP LTDA.")
    APP_NAME = os.getenv("APP_NAME", "SCHAP")

    # Configuración de email
    EMAIL_ENABLED = os.getenv("EMAIL_ENABLED", "False").lower() == "true"
    SMTP_HOST = os.getenv("SMTP_HOST", "mail.schap.cl")
    SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
    SMTP_USER = os.getenv("SMTP_USER", "notification@schap.cl")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "5~FIdBs())ifHy!S")
    FROM_EMAIL = os.getenv("SMTP_FROM", "notification@schap.cl")

# Variables a nivel de módulo para retrocompatibilidad
EMAIL_ENABLED = Config.EMAIL_ENABLED
SMTP_HOST = Config.SMTP_HOST
SMTP_PORT = Config.SMTP_PORT
SMTP_USER = Config.SMTP_USER
SMTP_PASSWORD = Config.SMTP_PASSWORD
FROM_EMAIL = Config.FROM_EMAIL
COMPANY_NAME = Config.COMPANY_NAME