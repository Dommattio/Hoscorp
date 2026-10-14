"""API hospitalaria simulada: datos ficticios y fallas inyectables (parámetro ?fail=true)."""
from fastapi import FastAPI, HTTPException

app = FastAPI(title="NexusMed - Hospital simulado", version="0.1.0")

ANTECEDENTES = {
    "EXT-001": [
        {"idExterno": "A-1001", "tipo": "diagnostico", "fecha": "2025-03-10", "contenido": "Hipertensión leve (dato ficticio)"},
        {"idExterno": "A-1002", "tipo": "resultado", "fecha": "2025-06-02", "contenido": "Hemograma normal (dato ficticio)"},
    ]
}


@app.get("/health")
def health():
    return {"service": "hospital-simulado", "status": "ok"}


@app.get("/pacientes/{id_externo}/antecedentes")
def antecedentes(id_externo: str, fail: bool = False):
    if fail:
        raise HTTPException(status_code=503, detail="Falla inyectada")
    return {"idExternoPaciente": id_externo, "registros": ANTECEDENTES.get(id_externo, [])}
