"""Punto de entrada del backend Dentamia: python run.py"""
import os

import uvicorn

if __name__ == "__main__":
    # 8001: el 8000 puede estar ocupado por otro proyecto local
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8001")),
        reload=True,
    )
