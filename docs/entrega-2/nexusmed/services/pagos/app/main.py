"""Servicio de pagos simulado. Aislado: red y base PostgreSQL propias, sin acceso a datos clínicos."""
import os
import psycopg
from fastapi import FastAPI

app = FastAPI(title="NexusMed - Servicio de pagos", version="0.1.0")
DATABASE_URL = os.environ["DATABASE_URL"]


def db_ok() -> bool:
    try:
        with psycopg.connect(DATABASE_URL, connect_timeout=2) as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:
        return False


@app.get("/health")
def health():
    ok = db_ok()
    return {"service": "pagos", "status": "ok" if ok else "degraded", "db": "ok" if ok else "down"}
