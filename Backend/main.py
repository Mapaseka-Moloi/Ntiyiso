#!/usr/bin/env python3
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List
import uvicorn

# Import your scanning logic from check.py
from check import check_url

logger = logging.getLogger("link_scanner")

app = FastAPI(
    title="Bank Link Scanner API",
    description="Secure backend API for processing client-submitted URLs from mobile devices."
)


# Put your icon in a "static" folder next to this file (static/icon.png)
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR, check_dir=False), name="static")


class ScanRequest(BaseModel):
    url: str


class ScanResponse(BaseModel):
    scanned_url: str
    final_url: str
    redirects: List[str]
    score: int
    verdict: str
    reasons: List[str]


# Plain `def` (not `async def`) so FastAPI runs the blocking network
# calls inside check_url in a threadpool instead of freezing the event loop.
@app.post("/api/v1/scan", response_model=ScanResponse)
def scan_link(payload: ScanRequest):
    if not payload.url or not payload.url.strip():
        raise HTTPException(status_code=400, detail="URL payload cannot be empty.")
    try:
        return check_url(payload.url.strip())
    except Exception:
        logger.exception("Scan failed for %r", payload.url)
        raise HTTPException(status_code=500, detail="Internal scan failure.")


WIDGET_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ntiyiso Security Suite</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #121212;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }
        .phone-frame {
            width: 360px;
            height: 700px;
            background: #000000;
            border: 12px solid #222222;
            border-radius: 40px;
            padding: 24px;
            box-sizing: border-box;
            color: #ffffff;
            display: flex;
            flex-direction: column;
            box-shadow: 0 25px 50px rgba(0,0,0,0.9);
            overflow-y: auto;
        }
        .screen-header {
            text-align: center;
            font-size: 11px;
            color: #444444;
            margin-bottom: 15px;
            letter-spacing: 1px;
            font-weight: bold;
            text-transform: uppercase;
        }
        #homeScreen {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        .app-icon-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            margin-top: 60px;
            cursor: pointer;
        }
        .whatsapp-style-icon {
            width: 72px;
            height: 72px;
            background: #ffffff;
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            box-shadow: 0 8px 16px rgba(255, 255, 255, 0.15);
            transition: transform 0.2s;
        }
        .whatsapp-style-icon { overflow: hidden; }
        .whatsapp-style-icon img { width: 100%; height: 100%; object-fit: cover; }
        .whatsapp-style-icon:active { transform: scale(0.92); }
        .icon-label {
            font-size: 13px;
            color: #ffffff;
            font-weight: 600;
            margin-top: 10px;
            letter-spacing: 0.5px;
        }
        .app-screen {
            display: none;
            flex-direction: column;
            height: 100%;
            animation: fadeIn 0.3s ease;
        }
        .app-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #222222;
            padding-bottom: 12px;
            margin-bottom: 20px;
        }
        .back-btn {
            background: none;
            border: none;
            color: #ff7b00;
            font-size: 20px;
            cursor: pointer;
            padding: 0;
        }
        .app-title { font-size: 16px; font-weight: bold; letter-spacing: 0.5px; }
        .sms-selector {
            background: #1c1c1e;
            color: #ffffff;
            border: 1px solid #3a3a3c;
            padding: 10px;
            border-radius: 8px;
            width: 100%;
            font-size: 12px;
            margin-bottom: 15px;
            outline: none;
        }
        .sms-container {
            background: #1c1c1e;
            border-radius: 14px;
            padding: 14px;
            margin-bottom: 20px;
            border-left: 4px solid #0a84ff;
            font-size: 13px;
            line-height: 1.4;
        }
        .sms-sender {
            font-weight: bold;
            color: #ffffff;
            margin-bottom: 4px;
            display: flex;
            justify-content: space-between;
        }
        .sms-time { color: #666666; font-weight: normal; font-size: 11px; }
        .sms-text { color: #e5e5ea; }
        .input-card {
            background: #1c1c1e;
            border: 1px solid #2c2c2e;
            border-radius: 16px;
            padding: 16px;
            margin-bottom: 20px;
        }
        .scan-btn {
            background: #ff7b00;
            color: #ffffff;
            border: none;
            padding: 14px;
            border-radius: 10px;
            font-weight: bold;
            cursor: pointer;
            width: 100%;
            font-size: 14px;
            letter-spacing: 0.5px;
        }
        .scan-btn:disabled { opacity: 0.6; cursor: wait; }
        .verdict-display {
            margin-top: 15px;
            padding: 14px;
            border-radius: 12px;
            display: none;
            font-size: 12px;
            line-height: 1.5;
            box-sizing: border-box;
            word-break: break-word;
        }
        .reason-item { margin: 6px 0 0 14px; font-size: 11px; color: #cccccc; }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>
</head>
<body>

    <div class="phone-frame">

        <!-- VIEW A: PHONE HOME SCREEN WITH APP ICON -->
        <div id="homeScreen">
            <div class="screen-header">HOME SCREEN</div>

            <!-- Test-only control: hidden from users, visible at /widget?demo=1 -->
            <select class="sms-selector" id="smsSelect" onchange="changeSmsSituation()" style="display: none;">
                <option value="buffalo">Message 1 - Buffalo Logistics</option>
                <option value="sars">Message 2 - SARS-eFiling</option>
                <option value="sapo">Message 3 - SAPO Tracking</option>
                <option value="good">Message 4 - Ntiyiso Bank</option>
            </select>

            <div class="sms-container">
                <div class="sms-sender">
                    <span id="smsSender">Buffalo Logistics</span>
                    <span class="sms-time">Just Now</span>
                </div>
                <div class="sms-text" id="smsBody"></div>
            </div>

            <div class="app-icon-container" onclick="openSecurityApp()">
                <div class="whatsapp-style-icon"><img src="/static/icon.png" alt="Ntiyiso Shield"></div>
            </div>

            <div style="margin-top: auto; font-size: 11px; color: #8e8e93; text-align: center;">Tap the icon to launch application suite</div>
        </div>

        <!-- VIEW B: STANDALONE APP SCANNER SUITE -->
        <div class="app-screen" id="appScreen">
            <div class="app-header">
                <button class="back-btn" onclick="closeSecurityApp()">✕</button>
                <div style="width: 20px;"></div>
            </div>

            <div class="input-card">
                <div style="font-size: 11px; color: #8e8e93; margin-bottom: 4px;">LINK FROM LATEST MESSAGE:</div>
                <div id="scanTarget" style="font-size: 12px; color: #64d2ff; word-break: break-all; margin-bottom: 14px;"></div>
                <button class="scan-btn" id="scanBtn" onclick="runSecurityScan()">Scan Message Link</button>
                <div id="verdictBox" class="verdict-display"></div>
            </div>
        </div>

    </div>

    <script>
        const scenarios = {
            buffalo: {
                sender: "Buffalo Logistics",
                text: "Your parcel has arrived at our sorting hub. To secure delivery, update payment immediately:",
                url: "http://buffalo-parcel-secure.xyz"
            },
            sars: {
                sender: "SARS-eFiling",
                text: "Dear taxpayer, you have an outstanding refund trace of R4,250.60. Claim your payout status now at:",
                url: "https://sars-efiling-refund.top"
            },
            sapo: {
                sender: "SAPO Tracking",
                text: "SAPO Alert: Your package address update failed. Penalties accrue within 48h. Clear details at:",
                url: "http://sapo-delivery-status.click"
            },
            good: {
                sender: "Ntiyiso Bank",
                text: "Security verification notice. Confirm account profile setup using safe link architecture:",
                url: "https://google.com"
            }
        };

        // Verdicts the backend returns. Adjust to match check.py exactly.
        const DANGER_VERDICTS = ["DANGEROUS", "SUSPICIOUS"];
        const SAFE_VERDICTS = ["SAFE", "CLEAN"];

        // Escape anything that came from the server before putting it in innerHTML
        function esc(s) {
            return String(s).replace(/[&<>"']/g, function (c) {
                return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
            });
        }

        function currentScenario() {
            return scenarios[document.getElementById("smsSelect").value];
        }

        function renderSms() {
            const s = currentScenario();
            document.getElementById("smsSender").textContent = s.sender;
            document.getElementById("smsBody").innerHTML =
                esc(s.text) + "<br>" +
                '<strong style="color: #64d2ff; word-break: break-all;">' + esc(s.url) + "</strong>";
        }

        function openSecurityApp() {
            document.getElementById("homeScreen").style.display = "none";
            document.getElementById("appScreen").style.display = "flex";
            document.getElementById("verdictBox").style.display = "none";
            document.getElementById("scanTarget").textContent = currentScenario().url;
        }

        function closeSecurityApp() {
            document.getElementById("appScreen").style.display = "none";
            document.getElementById("homeScreen").style.display = "flex";
            document.getElementById("verdictBox").style.display = "none";
        }

        function changeSmsSituation() {
            renderSms();
            document.getElementById("verdictBox").style.display = "none";
        }

        function showBox(vBox, border, html) {
            vBox.style.display = "block";
            vBox.style.background = "#1c1c1e";
            vBox.style.border = border;
            vBox.style.color = "#ffffff";
            vBox.innerHTML = html;
        }

        async function runSecurityScan() {
            const vBox = document.getElementById("verdictBox");
            const btn = document.getElementById("scanBtn");
            const targetUrl = currentScenario().url;

            btn.disabled = true;
            vBox.style.display = "block";
            vBox.style.background = "#1c1c1e";
            vBox.style.border = "1px solid #2c2c2e";
            vBox.style.color = "#8e8e93";
            vBox.textContent = "Performing structural analysis routines...";

            try {
                const response = await fetch("/api/v1/scan", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: targetUrl })
                });

                // Fail closed: a server error must never look like "clean"
                if (!response.ok) {
                    throw new Error("Scan service returned " + response.status);
                }

                const data = await response.json();
                const verdict = String(data.verdict || "").toUpperCase();
                const reasons = Array.isArray(data.reasons) ? data.reasons : [];

                if (DANGER_VERDICTS.includes(verdict)) {
                    let reasonsHtml = "";
                    for (const r of reasons) {
                        reasonsHtml += '<div class="reason-item">🛑 ' + esc(r) + "</div>";
                    }
                    showBox(vBox, "2px solid #ff7b00",
                        "<strong>⚠️ HIGH RISK ALERT</strong><br>" +
                        "Target: " + esc(data.final_url || targetUrl) + reasonsHtml);
                } else if (SAFE_VERDICTS.includes(verdict)) {
                    showBox(vBox, "2px solid #ffffff",
                        "<strong>✅ NO RED FLAGS FOUND</strong><br>" +
                        "This link passed our checks. Stay cautious with unexpected messages.");
                } else {
                    showBox(vBox, "2px solid #8e8e93",
                        "<strong>❓ COULD NOT VERIFY</strong><br>" +
                        "Unexpected result from the scanner. Treat this link as unsafe.");
                }
            } catch (e) {
                showBox(vBox, "2px solid #8e8e93",
                    "<strong>❓ SCAN FAILED</strong><br>" +
                    "Could not reach the scanning service. Do not open this link until it is verified.");
            } finally {
                btn.disabled = false;
            }
        }

        if (new URLSearchParams(window.location.search).has("demo")) {
            document.getElementById("smsSelect").style.display = "block";
        }

        renderSms();
    </script>
</body>
</html>
"""


@app.get("/widget", response_class=HTMLResponse)
def get_widget_simulation():
    return WIDGET_HTML


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)