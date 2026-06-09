
# Backend SCHAP (esqueleto refactorizado)

Estructura principal:

- app.py               -> punto de entrada, registra blueprints
- config.py            -> configuración (SECRET_KEY, DB, SMTP)
- db.py                -> conexión e inicialización de base de datos
- auth/
    - tokens.py        -> manejo de tokens y decorador auth_required
    - routes.py        -> /api/login, /api/register, /api/me
- users/
    - routes.py        -> /api/users, /api/users/<id>
- requests_mod/
    - routes.py        -> /api/requests, /api/requests/batch, /api/requests/<id>/status, /api/stats
- utils/
    - email_utils.py   -> función send_email

## Cómo usar

1. Crear entorno virtual e instalar dependencias:

    pip install flask flask-cors itsdangerous werkzeug

2. Ejecutar:

    python app.py

3. El API quedará disponible en:

    http://127.0.0.1:3000/api/...

Puedes conectar el frontend actual apuntando la constante API_BASE a:
    const API_BASE = "http://127.0.0.1:3000/api";
