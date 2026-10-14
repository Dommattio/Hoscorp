"""Servicio operativo: padrón de pacientes, profesionales, turnos, relación asistencial e identidad (JWT).
Esqueleto de la Entrega 2: solo expone /health y un endpoint de relación asistencial de prueba."""
import os
import psycopg
from fastapi import FastAPI

app = FastAPI(title="NexusMed - Servicio operativo", version="0.1.0")
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
    return {"service": "operativo", "status": "ok" if ok else "degraded", "db": "ok" if ok else "down"}


@app.get("/relaciones/{medico_id}/{paciente_id}")
def relacion_asistencial(medico_id: int, paciente_id: int):
    # Stub: en la Entrega 3 consultará la tabla real de relaciones asistenciales.
    return {"medico_id": medico_id, "paciente_id": paciente_id, "vigente": True, "stub": True}
