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
        .sms-text { color: #e5e5ea; user-select: text; -webkit-user-select: text; }
        .custom-input { width: 100%; background: #2c2c2e; border: 1px solid #3a3a3c; border-radius: 8px; padding: 12px; color: white; font-size: 13px; outline: none; box-sizing: border-box; margin-bottom: 10px; }
        .custom-input:focus { border-color: #ff7b00; }
        .paste-btn { background: #2c2c2e; color: #ff7b00; border: 1px dashed #ff7b00; padding: 9px; border-radius: 8px; width: 100%; font-size: 11px; font-weight: bold; cursor: pointer; margin-bottom: 12px; }
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
        .lang-bar { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-bottom: 12px; }
        .lang-btn { background: #1c1c1e; color: #ffffff; border: 1px solid #3a3a3c; border-radius: 14px; padding: 5px 10px; font-size: 11px; cursor: pointer; }
        .lang-btn.active { background: #ffffff; color: #000000; border-color: #ffffff; font-weight: bold; }
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
                <div class="whatsapp-style-icon"><img src="/static/icon.png"></div>
            </div>

            <div id="homeHint" style="margin-top: auto; font-size: 11px; color: #8e8e93; text-align: center;"></div>
        </div>

        <!-- VIEW B: STANDALONE APP SCANNER SUITE -->
        <div class="app-screen" id="appScreen">
            <div class="app-header">
                <button class="back-btn" onclick="closeSecurityApp()">✕</button>
                <div style="width: 20px;"></div>
            </div>

            <div id="langBar" class="lang-bar"></div>

            <div class="input-card">
                <div id="linkLabel" style="font-size: 11px; color: #8e8e93; margin-bottom: 4px;"></div>
                <input type="text" id="linkInput" class="custom-input" autocomplete="off" autocapitalize="off" spellcheck="false" onkeydown="if (event.key === 'Enter') runSecurityScan()">
                <button class="paste-btn" id="pasteBtn" onclick="pasteFromClipboard()"></button>
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

        // ---- Languages ----
        const LANGS = { en: "English", zu: "isiZulu", sn: "chiShona", ve: "Tshivenḓa", st: "Sesotho" };
        let lang = "en";

        const I18N = {
            en: {
                hint: "Tap the shield to check a link",
                linkLabel: "PASTE THE LINK YOU WANT TO CHECK:",
                placeholder: "Paste link here",
                paste: "Paste from clipboard",
                empty: "Please paste a link first.",
                scan: "Scan Message Link",
                scanning: "Checking this link...",
                dangerTitle: "⚠️ Do not open this link",
                dangerIntro: "This message looks like a scam. Why we think so:",
                todoLabel: "What to do:",
                todo: "Do not tap the link or enter any details. If the message says it is from a company, contact them using their official app or phone number.",
                safeTitle: "✅ No red flags found",
                safeBody: "This link passed our checks. Stay cautious with unexpected messages.",
                unknownTitle: "❓ Could not verify",
                unknownBody: "Unexpected result from the scanner. Treat this link as unsafe.",
                failTitle: "❓ Scan failed",
                failBody: "Could not reach the scanning service. Do not open this link until it is verified.",
                r_https: "This link is not secure, so anything you type on the page could be seen by others.",
                r_tld: "The website address ends in a style that scammers often use.",
                r_internal: "We could not safely reach this website to check it, so we cannot confirm it is real.",
                r_redirect: "The link sends you through other websites first, which scammers do to hide where it really goes.",
                r_ip: "The link uses a string of numbers instead of a real website name.",
                r_short: "The link is shortened, which hides where it really leads.",
                r_imitate: "The address copies or imitates a well-known company or service.",
                r_official: "The address is made to look official, with words like secure, refund or parcel.",
                r_new: "This website was set up very recently, which is common with scam sites.",
                r_other: "Something else about this link looked unusual."
            },
            zu: {
                hint: "Thinta isithonjana ukuze uhlole isixhumanisi",
                linkLabel: "NAMATHISELA ISIXHUMANISI OSIFUNA UKUSIHLOLA:",
                placeholder: "Namathisela isixhumanisi lapha",
                paste: "Namathisela okukopishiwe",
                empty: "Sicela unamathisele isixhumanisi kuqala.",
                scan: "Hlola Isixhumanisi",
                scanning: "Siyasihlola lesi sixhumanisi...",
                dangerTitle: "⚠️ Ungasivuli lesi sixhumanisi",
                dangerIntro: "Lo myalezo ufana nenkohliso. Sicabanga kanjalo ngoba:",
                todoLabel: "Yini okufanele uyenze:",
                todo: "Ungasithinti isixhumanisi futhi ungafaki imininingwane yakho. Uma umyalezo uthi uvela enkampanini, xhumana nabo usebenzisa i-app yabo esemthethweni noma inombolo yabo yocingo.",
                safeTitle: "✅ Asikho isixwayiso esitholakele",
                safeBody: "Lesi sixhumanisi sidlule ukuhlolwa kwethu. Qaphela imilayezo ongayilindele.",
                unknownTitle: "❓ Asikwazanga ukuqinisekisa",
                unknownBody: "Umphumela ongalindelekile ovela kusihloli. Sithathe lesi sixhumanisi njengesingaphephile.",
                failTitle: "❓ Ukuhlola kuhlulekile",
                failBody: "Asikwazanga ukufinyelela insizakalo yokuhlola. Ungasivuli lesi sixhumanisi kuze kuqinisekiswe.",
                r_https: "Lesi sixhumanisi asiphephile, ngakho noma yini oyibhalayo ekhasini ingabonwa abanye.",
                r_tld: "Ikheli lewebhusayithi liphela ngendlela evame ukusetshenziswa ngabakhohlisi.",
                r_internal: "Asikwazanga ukufinyelela le webhusayithi ngokuphephile ukuyihlola, ngakho asikwazi ukuqinisekisa ukuthi iyiqiniso.",
                r_redirect: "Isixhumanisi sikuthumela kumawebhusayithi amanye kuqala, abakhohlisi bakwenza lokhu ukufihla lapho siya khona.",
                r_ip: "Isixhumanisi sisebenzisa uchungechunge lwezinombolo esikhundleni segama lewebhusayithi langempela.",
                r_short: "Isixhumanisi sifinyeziwe, okufihla lapho siya khona ngempela.",
                r_imitate: "Ikheli lilingisa inkampani noma insizakalo eyaziwayo.",
                r_official: "Ikheli lenzelwe ukubukeka lisemthethweni, ngamagama afana nokuphepha, imbuyiselo noma iphasela.",
                r_new: "Le webhusayithi isanda kwenziwa, okuvamile ezindaweni zabakhohlisi.",
                r_other: "Okunye ngalesi sixhumanisi kubukeka kungavamile."
            },
            sn: {
                hint: "Dzvanya chiratidzo kuti utarise link",
                linkLabel: "ISA LINK YAUNODA KUTARISA:",
                placeholder: "Isa link pano",
                paste: "Isa chakakopiwa",
                empty: "Ndapota isa link kutanga.",
                scan: "Tarisa Link",
                scanning: "Tiri kutarisa link iyi...",
                dangerTitle: "⚠️ Usavhure link iyi",
                dangerIntro: "Meseji iyi inooneka seyekunyepera. Tinofunga kudaro nekuti:",
                todoLabel: "Zvaunofanira kuita:",
                todo: "Usadzvanya link kana kuisa ruzivo rwako. Kana meseji ichiti inobva kukambani, taurirana navo uchishandisa app yavo yepamutemo kana nhamba yavo yefoni.",
                safeTitle: "✅ Hapana zvinotyisa zvawanikwa",
                safeBody: "Link iyi yapfuura kuongororwa kwedu. Chengeta hanya nemameseji asina kutarisirwa.",
                unknownTitle: "❓ Hatina kukwanisa kusimbisa",
                unknownBody: "Mhedzisiro isina kutarisirwa kubva kuchiongorori. Torera link iyi seisina kuchengeteka.",
                failTitle: "❓ Kutarisa kwakundikana",
                failBody: "Hatina kukwanisa kusvika kubasa rekutarisa. Usavhure link iyi kusvika yasimbiswa.",
                r_https: "Link iyi haina kuchengeteka, saka chero zvaunonyora papeji zvinogona kuonekwa nevamwe.",
                r_tld: "Kero yewebsite iyi inopera nemhando inowanzoshandiswa nevanyepi.",
                r_internal: "Hatina kukwanisa kusvika pawebsite iyi zvakachengeteka kuti titarise, saka hatigone kusimbisa kuti ndeyechokwadi.",
                r_redirect: "Link iyi inokutumira kumawebsite mamwe kutanga, izvo vanyepi vanoita kuvanza kwainoenda chaizvo.",
                r_ip: "Link iyi inoshandisa nhamba panzvimbo yezita rewebsite chairo.",
                r_short: "Link iyi yaderedzwa, izvo zvinovanza kwainoenda chaizvo.",
                r_imitate: "Kero iyi inotevedzera kambani kana sevhisi inozivikanwa.",
                r_official: "Kero iyi yakagadzirwa kuti iite seyepamutemo, ichishandisa mazwi akaita se secure, refund kana parcel.",
                r_new: "Website iyi yangogadzirwa, izvo zvinowanzoitika nemawebsite ekunyepera.",
                r_other: "Chimwe chinhu pamusoro pelink iyi chakaita chisina kujairika."
            },
            ve: {
                hint: "Thintha tshiga u lingedza link",
                linkLabel: "LINK NE NA ṰOḒA U I LINGEDZA:",
                placeholder: "Paste link afha",
                paste: "Paste link yo kopiwaho",
                empty: "Ni humbelwa u paste link u thoma.",
                scan: "Lingedza Link",
                scanning: "Ri khou lingedza link iyi...",
                dangerTitle: "⚠️ Ni songo vula link iyi",
                dangerIntro: "Mulaedza uyu u nga vha u tshi ṱoḓa u ni khakhisa. Zwiitisi zwashu:",
                todoLabel: "Zwine na fanela u zwi ita:",
                todo: "Ni songo thintha link kana u fha mafhungo aṋu. Vhudzani na khamphani nga app kana nomboro yavho ya vhukuma.",
                safeTitle: "✅ A hu na khombo yo wanalaho",
                safeBody: "Link iyi yo fhita u lingedzwa hashu. Ni dzhiele nṱha mimulaedza i sa lindelwi.",
                unknownTitle: "❓ Ro vhuya ra sa kone u khwaṱhisedza",
                unknownBody: "Ni dzhie link iyi sa i si na tsireledzo.",
                failTitle: "❓ U lingedza ho kundelwa",
                failBody: "Ni songo vula link iyi u swika i tshi khwaṱhisedzwa.",
                r_https: "Link iyi a i na tsireledzo, nga zwenezwo zwine na nwala kha peji zwi nga vhonwa nga vhaṅwe.",
                r_tld: "Adiresi ya webusaithi i fhela nga ndila ine ya shumiswa nga vhakhakhisi.",
                r_internal: "A ro ngo kona u swika kha webusaithi iyi u i lingedza, nga zwenezwo a ri koni u khwaṱhisedza uri ndi ya vhukuma.",
                r_redirect: "Link iyi i ni rumela kha dziwebusaithi dziṅwe u thoma, vhakhakhisi vha ita izwi u dzumba hune ya ya hone.",
                r_ip: "Link iyi i shumisa nomboro hu si dzina la vhukuma la webusaithi.",
                r_short: "Link iyi yo pfufhifhadzwa, zwine zwa dzumba hune ya ya hone.",
                r_imitate: "Adiresi iyi i fanyisa khamphani kana tshumelo ine ya divhewa.",
                r_official: "Adiresi iyi yo itwa u vhonala i tshi nga ya vhukuma, nga maipfi a sa secure, refund kana parcel.",
                r_new: "Webusaithi iyi yo itwa zwino-zwino, zwine zwa vha zwa ḓoweleaho kha dziwebusaithi dza vhukhakhisi.",
                r_other: "Zwiṅwe nga ha link iyi zwi vhonala zwi si zwa ḓoweleaho."
            },
            st: {
                hint: "Tobetsa letshwao ho hlahloba link",
                linkLabel: "KENYA LINK EO U LEBANG HO E HLAHLOBA:",
                placeholder: "Beha link mona",
                paste: "Beha se kopitsoeng",
                empty: "Ka kopo beha link pele.",
                scan: "Hlahloba Link",
                scanning: "Re hlahloba link ena...",
                dangerTitle: "⚠️ Se bule link ena",
                dangerIntro: "Molaetsa ona o shebahala joaloka thetso. Re nahana jwalo hobane:",
                todoLabel: "Seo u lokelang ho se etsa:",
                todo: "Se tobetse link kapa ho kenya lintlha tsa hao. Haeba molaetsa o re o tsoa k'hamphaning, ikopanye le bona ka app ea bona ea semmuso kapa nomoro ea bona ea mohala.",
                safeTitle: "✅ Ha ho letšoao la kotsi le fumanoeng",
                safeBody: "Link ena e feletse ha re hlahloba. Hlokomela melaetsa eo u sa e lebelang.",
                unknownTitle: "❓ Re hlolehile ho netefatsa",
                unknownBody: "Sephetho se sa lebelloang se tsoa ho sehlahlobi. Nka link ena e se sireletsehang.",
                failTitle: "❓ Tlhahlobo e hlolehile",
                failBody: "Re hlolehile ho fihla tšebeletsong ea tlhahlobo. Se bule link ena ho fihlela e netefatsoa.",
                r_https: "Link ena ha e sireletsehe, kahoo eng kapa eng eo u e ngolang leqepheng e ka bonoa ke ba bang.",
                r_tld: "Aterese ea webosaete e fela ka mokhoa o atisang ho sebelisoa ke batho ba thetsang.",
                r_internal: "Ha rea khona ho fihla webosaeteng ena ka mokhoa o sireletsehileng ho e hlahloba, kahoo ha re khone ho netefatsa hore ke ea 'nete.",
                r_redirect: "Link ena e u isa liwebosaeteng tse ling pele, batho ba thetsang ba etsa sena ho pata moo e eang teng.",
                r_ip: "Link ena e sebelisa nomoro sebakeng sa lebitso la 'nete la webosaete.",
                r_short: "Link ena e khutsufalitsoe, e leng se patang moo e eang teng.",
                r_imitate: "Aterese ena e etsisa k'hamphani kapa tšebeletso e tsebahalang.",
                r_official: "Aterese ena e entsoe hore e shebahale e le ea semmuso, ka mantsoe a kang secure, refund kapa parcel.",
                r_new: "Webosaete ena e sa tsoa etsoa, e leng se atileng liwebosaeteng tsa thetso.",
                r_other: "Ntho e 'ngoe ka link ena e shebahala e sa tloaelehang."
            }
        };

        function t(key) {
            return (I18N[lang] && I18N[lang][key]) || I18N.en[key];
        }

        // Scanner reason keywords (lowercase) -> translation key
        const REASON_KEYS = [
            [["not https", "http only", "insecure"], "r_https"],
            [["tld", "top-level", "abused"], "r_tld"],
            [["internal", "non-public", "private address"], "r_internal"],
            [["redirect"], "r_redirect"],
            [["ip address", "ip-based"], "r_ip"],
            [["shorten", "shortener"], "r_short"],
            [["punycode", "homograph", "lookalike", "look-alike", "typosquat", "impersonat", "brand"], "r_imitate"],
            [["hyphen", "subdomain", "keyword"], "r_official"],
            [["new domain", "recently registered", "domain age"], "r_new"]
        ];

        function friendlyReasons(reasons) {
            const out = [];
            for (const r of reasons) {
                const text = String(r).toLowerCase();
                let key = "r_other";
                for (const [words, k] of REASON_KEYS) {
                    if (words.some(function (w) { return text.includes(w); })) { key = k; break; }
                }
                const msg = t(key);
                if (!out.includes(msg)) out.push(msg);
            }
            return out;
        }

async function pasteFromClipboard() {
            const input = document.getElementById("linkInput");
            try {
                input.value = (await navigator.clipboard.readText()).trim();
            } catch (e) {
                // Clipboard blocked: let the user paste by hand (Ctrl+V / long-press)
            }
            input.focus();
        }

        function applyLanguage() {
            document.getElementById("linkInput").placeholder = t("placeholder");
            document.getElementById("pasteBtn").textContent = t("paste");
            document.getElementById("homeHint").textContent = t("hint");
            document.getElementById("linkLabel").textContent = t("linkLabel");
            document.getElementById("scanBtn").textContent = t("scan");
            document.getElementById("verdictBox").style.display = "none";
            document.querySelectorAll(".lang-btn").forEach(function (b) {
                b.classList.toggle("active", b.dataset.code === lang);
            });
        }

        function setLanguage(code) {
            lang = code;
            try { localStorage.setItem("ntiyisoLang", code); } catch (e) {}
            applyLanguage();
        }

        function buildLangBar() {
            const bar = document.getElementById("langBar");
            for (const code in LANGS) {
                const b = document.createElement("button");
                b.className = "lang-btn";
                b.dataset.code = code;
                b.textContent = LANGS[code];
                b.onclick = function () { setLanguage(code); };
                bar.appendChild(b);
            }
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
            const input = document.getElementById("linkInput");
            let targetUrl = input.value.trim();
            if (!targetUrl) {
                showBox(vBox, "2px solid #8e8e93", esc(t("empty")));
                input.focus();
                return;
            }
            // No scheme typed? Assume https so the scanner gets a full URL.
            const lower = targetUrl.toLowerCase();
            if (!lower.startsWith("http://") && !lower.startsWith("https://")) targetUrl = "https://" + targetUrl;


            btn.disabled = true;
            vBox.style.display = "block";
            vBox.style.background = "#1c1c1e";
            vBox.style.border = "1px solid #2c2c2e";
            vBox.style.color = "#8e8e93";
            vBox.textContent = t("scanning");

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
                    for (const r of friendlyReasons(reasons)) {
                        reasonsHtml += '<div class="reason-item">• ' + esc(r) + "</div>";
                    }
                    showBox(vBox, "2px solid #ff7b00",
                        "<strong>" + esc(t("dangerTitle")) + "</strong><br>" + esc(t("dangerIntro")) +
                        reasonsHtml +
                        '<div style="margin-top: 10px;"><strong>' + esc(t("todoLabel")) + "</strong> " + esc(t("todo")) + "</div>");
                } else if (SAFE_VERDICTS.includes(verdict)) {
                    showBox(vBox, "2px solid #ffffff",
                        "<strong>" + esc(t("safeTitle")) + "</strong><br>" + esc(t("safeBody")));
                } else {
                    showBox(vBox, "2px solid #8e8e93",
                        "<strong>" + esc(t("unknownTitle")) + "</strong><br>" + esc(t("unknownBody")));
                }
            } catch (e) {
                showBox(vBox, "2px solid #8e8e93",
                    "<strong>" + esc(t("failTitle")) + "</strong><br>" + esc(t("failBody")));
            } finally {
                btn.disabled = false;
            }
        }

        if (new URLSearchParams(window.location.search).has("demo")) {
            document.getElementById("smsSelect").style.display = "block";
        }

        buildLangBar();
        try {
            const saved = localStorage.getItem("ntiyisoLang");
            if (saved && I18N[saved]) lang = saved;
        } catch (e) {}
        applyLanguage();
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