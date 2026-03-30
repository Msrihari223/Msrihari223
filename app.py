# ╔══════════════════════════════════════════════════════════════╗
# ║         SafeSpace — Cyberbullying Detection Backend          ║
# ║         Flask REST API  |  SQLite DB  |  Logging            ║
# ╚══════════════════════════════════════════════════════════════╝

from flask import Flask
from flask_cors import CORS
from database.db import init_db
from routes.predict  import predict_bp
from routes.alerts   import alerts_bp
from routes.reports  import reports_bp
from routes.health   import health_bp
import logging, os

# ── App setup ────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)  # Allow frontend (any origin) to call this API

# ── Logging to file + console ─────────────────────────────────────
os.makedirs("logs", exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(levelname)s]  %(message)s",
    handlers=[
        logging.FileHandler("logs/safespace.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# ── Initialize SQLite database ────────────────────────────────────
init_db()

# ── Register Blueprints (route groups) ────────────────────────────
app.register_blueprint(health_bp)     # GET  /api/health
app.register_blueprint(predict_bp)   # POST /api/predict   POST /api/batch
app.register_blueprint(alerts_bp)    # GET  /api/alerts    PUT /api/alerts/<id>
app.register_blueprint(reports_bp)   # GET  /api/reports   POST /api/reports/submit

# ── Run ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("""
╔══════════════════════════════════════════════════╗
║   🛡️  SafeSpace API  →  http://localhost:8080 ║
╠══════════════════════════════════════════════════╣
║  GET   /api/health                               ║
║  POST  /api/predict          ← single message   ║
║  POST  /api/batch            ← bulk messages    ║
║  GET   /api/alerts           ← moderator feed   ║
║  PUT   /api/alerts/<id>      ← update status    ║
║  GET   /api/reports          ← all incidents    ║
║  POST  /api/reports/submit   ← student report  ║
╚══════════════════════════════════════════════════╝
    """)
    app.run(debug=True, port=8080)
