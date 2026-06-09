
from flask import Flask
from flask_cors import CORS


from db import db, init_db
from auth.routes import auth_bp
from users.routes import users_bp
from request.routes import request_bp
from report.routes import report_bp
from Config.routes import config_bp
from reports.routes import reports_bp
from audit.routes import audit_bp
from config import Config

def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app)

    # inicializa base de datos con SQLAlchemy
    db.init_app(app)
    with app.app_context():
        init_db()

    # blueprints
    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(users_bp, url_prefix="/api")
    app.register_blueprint(request_bp, url_prefix="/api")
    app.register_blueprint(report_bp, url_prefix="/api")
    app.register_blueprint(config_bp, url_prefix="/api")
    app.register_blueprint(reports_bp, url_prefix="/api")
    app.register_blueprint(audit_bp, url_prefix="/api")

    return app

if __name__ == "__main__":
    import os
    app = create_app()
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", 3000))
    debug = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    app.run(host=host, port=port, debug=debug)
