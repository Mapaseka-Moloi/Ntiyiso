from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl
from typing import List
from check import check_url
import uvicorn

app = FastAPI(
    title="Bank Link Scanner API",
    description="Secure backend API for processing client-submitted URLs from mobile devices."
)

# Define what data the mobile app must send us
class ScanRequest(BaseModel):
    url: str

# Define what data the API will send back to the mobile app
class ScanResponse(BaseModel):
    scanned_url: str
    final_url: str
    redirects: List[str]
    score: int
    verdict: str
    reasons: List[str]

@app.post("/api/v1/scan", response_model=ScanResponse)
async def scan_link(payload: ScanRequest):
    """
    Endpoint for mobile apps and widgets to submit a link for analysis.
    """
    if not payload.url:
        raise HTTPException(status_code=400, detail="URL payload cannot be empty.")
    
    try:
        # Run the complete check matrix from check.py
        result = check_url(payload.url)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal scan failure: {str(e)}")

if __name__ == "__main__":
    # Runs the server locally on port 8000
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)