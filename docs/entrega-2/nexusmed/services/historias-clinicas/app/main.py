"""Servicio de historias clínicas. Esqueleto de la Entrega 2:
 - /health verifica su base (pg-clinico) y Redis.
 - /dependencias comprueba por HTTP a los otros nodos (comunicación real entre procesos).
 - /acceso-medico aplica 'falla cerrada': si el servicio operativo no responde, deniega."""
import os
import httpx
import psycopg
import redis
from fastapi import FastAPI, HTTPException

app = FastAPI(title="NexusMed - Servicio de historias clínicas", version="0.1.0")
DATABASE_URL = os.environ["DATABASE_URL"]
REDIS_URL = os.environ["REDIS_URL"]
OPERATIVO_URL = os.environ["OPERATIVO_URL"]
HOSPITAL_URL = os.environ["HOSPITAL_URL"]


def db_ok() -> bool:
    try:
        with psycopg.connect(DATABASE_URL, connect_timeout=2) as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:
        return False


def redis_ok() -> bool:
    try:
        return bool(redis.Redis.from_url(REDIS_URL, socket_connect_timeout=2).ping())
    except Exception:
        return False


def http_ok(url: str) -> bool:
    try:
        return httpx.get(url + "/health", timeout=2.0).status_code == 200
    except Exception:
        return False


@app.get("/health")
def health():
    db, rd = db_ok(), redis_ok()
    return {"service": "historias-clinicas", "status": "ok" if db and rd else "degraded",
            "db": "ok" if db else "down", "redis": "ok" if rd else "down"}


@app.get("/dependencias")
def dependencias():
    return {"operativo": "ok" if http_ok(OPERATIVO_URL) else "down",
            "hospital-simulado": "ok" if http_ok(HOSPITAL_URL) else "down"}


@app.get("/acceso-medico/{medico_id}/{paciente_id}")
def acceso_medico(medico_id: int, paciente_id: int):
    try:
        r = httpx.get(f"{OPERATIVO_URL}/relaciones/{medico_id}/{paciente_id}", timeout=2.0)
        r.raise_for_status()
    except Exception:
        raise HTTPException(status_code=503, detail="Servicio operativo no disponible: acceso denegado (falla cerrada)")
    if not r.json().get("vigente"):
        raise HTTPException(status_code=403, detail="Sin relación asistencial vigente")
    return {"acceso": "permitido"}
