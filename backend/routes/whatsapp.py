from fastapi import APIRouter
from pydantic import BaseModel

from services.message_analyzer import analyze_message
from services.url_checker import analyze_urls
from services.risk_engine import calculate_risk

router = APIRouter()


class MessageRequest(BaseModel):
    message: str


@router.post("/check-message")
def check_message(request: MessageRequest):

    message_analysis = analyze_message(request.message)

    url_analysis = analyze_urls(request.message)

    risk_result = calculate_risk(
        message_analysis,
        url_analysis
    )

    return {
        "message": request.message,
        "message_analysis": message_analysis,
        "url_analysis": url_analysis,
        "risk": risk_result
    }