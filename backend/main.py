from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.whatsapp import router as whatsapp_router

app = FastAPI(
    title="Scam Shield API",
    description="Backend for Scam Shield WhatsApp message detection",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(whatsapp_router)ssssssssssssssssssssssss


@app.get("/")
def root():
    return {"message": "Scam Shield API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}