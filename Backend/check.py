#!/usr/bin/env python3
import http.client
import ipaddress
import json
import os
import re
import socket
import ssl
import sys
import urllib.request
from datetime import datetime, timezone
from urllib.parse import urlparse, urljoin

# Configurable definitions for modern phishing indicator detection
SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "bitly.com"}
RISKY_TLDS = {"zip", "mov", "xyz", "top", "click", "icu", "tk", "cc", "live"}

def normalize(raw_url):
    """
    Cleans up whitespace and safely prepends a scheme if the client 
    copied the text without an explicit http:// or https:// prefix.
    """
    raw_url = raw_url.strip()
    if not raw_url.startswith(("http://", "https://")):
        return "https://" + raw_url
    return raw_url

def static_checks(url):
    """Parses visual indicators on strings for high-level risk evaluation."""
    score, reasons = 0, []
    p = urlparse(url)
    host = (p.hostname or "").lower()

    if p.scheme != "https":
        score += 2
        reasons.append("Not HTTPS")
    if "@" in p.netloc:
        score += 4
        reasons.append("Contains '@' symbol (used to mask real destination domain)")
    if re.fullmatch(r"[\d.]+", host):
        score += 3
        reasons.append("Uses raw numeric IP address instead of a standard domain")
    if "xn--" in host:
        score += 3
        reasons.append("Punycode domain signature detected (potential lookalike spoof)")
    if host.count(".") >= 4:
        score += 2
        reasons.append("Excessive subdomains found in path architecture")
    if host in SHORTENERS:
        score += 1
        reasons.append("URL shortener service detected")
    if host.rsplit(".", 1)[-1] in RISKY_TLDS:
        score += 1
        reasons.append("Top-Level Domain (TLD) matches heavily abused spaces")
    return score, reasons

def is_public_ip(host):
    """Prevents Server-Side Request Forgery by blocking loopback/private routing targets."""
    try:
        for info in socket.getaddrinfo(host, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False
        return True
    except socket.gaierror:
        return False 

def follow_redirects(url, max_hops=5):
    """Traces redirection pathways securely up to a strict boundary limit."""
    chain = [url]
    for _ in range(max_hops):
        p = urlparse(chain[-1])
        if p.scheme not in ("http", "https") or not p.hostname:
            return chain, "Unsupported application routing scheme"
        if not is_public_ip(p.hostname):
            return chain, "Blocked: Target maps to internal/non-public address routing"

        Conn = http.client.HTTPSConnection if p.scheme == "https" else http.client.HTTPConnection
        try:
            # Low timeouts protect workers from hanging pipelines
            conn = Conn(p.hostname, p.port, timeout=4)
            path = (p.path or "/") + (f"?{p.query}" if p.query else "")
            conn.request("HEAD", path, headers={"User-Agent": "UrlVerifier/1.0"})
            resp = conn.getresponse()
            location = resp.getheader("Location")
            conn.close()
        except (OSError, ssl.SSLError) as e:
            return chain, f"Network route connection failed: {str(e)}"

        if resp.status in (301, 302, 303, 307, 308) and location:
            chain.append(urljoin(chain[-1], location))
        else:
            return chain, None
    return chain, "Too many redirection layers handled"

def cert_check(host):
    """Validates structural soundness of SSL configurations on target host targets."""
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=4) as s:
            with ctx.wrap_socket(s, server_hostname=host):
                return None
    except ssl.SSLCertVerificationError as e:
        return f"SSL Certificate Verification Alert: {e.verify_message}"
    except OSError:
        return None

def domain_age_days(host):
    """
    Queries standard RDAP registries to determine domain registration ages.
    Includes fallback matching logic for regional suffixes like co.za / co.uk.
    """
    parts = host.split(".")
    if len(parts) >= 3 and parts[-2] in {"co", "com", "org", "net", "gov", "ac"}:
        domain = ".".join(parts[-3:])
    else:
        domain = ".".join(parts[-2:])

    try:
        req = urllib.request.Request(
            f"https://rdap.org/domain/{domain}",
            headers={"User-Agent": "UrlVerifier/1.0"}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.load(response)
        for ev in data.get("events", []):
            if ev.get("eventAction") == "registration":
                d = datetime.fromisoformat(ev["eventDate"].replace("Z", "+00:00"))
                return (datetime.now(timezone.utc) - d).days
    except Exception:
        pass
    return None

def check_url(raw):
    """Orchestrates comprehensive scanning routines to generate risk verdicts."""
    url = normalize(raw)
    score, reasons = static_checks(url)

    chain, problem = follow_redirects(url)
    if problem:
        score += 2
        reasons.append(problem)
    if len(chain) > 3:
        score += 1
        reasons.append(f"Excessive dynamic redirection paths ({len(chain)} hops recorded)")

    final = chain[-1]
    fhost = (urlparse(final).hostname or "").lower()

    if final != url:
        s, r = static_checks(final)
        score += s
        reasons += [f"[Final Destination] {x}" for x in r]

    if fhost and urlparse(final).scheme == "https":
        msg = cert_check(fhost)
        if msg:
            score += 4
            reasons.append(msg)

    age = domain_age_days(fhost) if fhost else None
    if age is not None and age < 30:
        score += 3
        reasons.append(f"Domain registered recently ({age} days ago)")

    if score >= 6:
        verdict = "DANGEROUS"
    elif score >= 3:
        verdict = "SUSPICIOUS"
    else:
        verdict = "LOOKS OK"

    return {
        "scanned_url": url,
        "final_url": final,
        "redirects": chain,
        "score": score,
        "verdict": verdict,
        "reasons": reasons
    }
if __name__ == "__main__":
    # Fixed argument logic: Fall back to a test address if no explicit argument parameter is passed
    if len(sys.argv) > 1:
        target_link = sys.argv[1]
    else:
        target_link = "http://buffalo-parcel-secure.xyz/track"
        
    print(json.dumps(check_url(target_link), indent=2))
