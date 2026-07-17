"""
Envelope — HTML Email Builder
Developed by Anhar Hussan (github.com/zerosocialcode)

A Flask tool for composing production-grade, table-based HTML emails
with a live preview, a reusable template library, and safe server-side
sanitization of every field that ends up in the exported markup.
"""
import json
import os
import re
import smtplib
import ssl
import uuid
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from dotenv import load_dotenv, set_key
from flask import Flask, render_template, request, Response, jsonify, abort

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "saved_templates"
TEMPLATES_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------
# Sending emails — credentials are collected once from the UI and
# persisted to a local .env file (git-ignored) so the person isn't
# asked again on future runs.
# ---------------------------------------------------------------------
ENV_PATH = BASE_DIR / ".env"
if not ENV_PATH.exists():
    ENV_PATH.touch()
load_dotenv(ENV_PATH)

DEFAULT_SMTP_HOST = "smtp.gmail.com"
DEFAULT_SMTP_PORT = "587"

FONT_STACKS = {
    "system": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    "jakarta": "'Plus Jakarta Sans', -apple-system, Helvetica, Arial, sans-serif",
    "arial": "Arial, Helvetica, sans-serif",
    "georgia": "Georgia, 'Times New Roman', serif",
    "courier": "'Courier New', Courier, monospace",
    "verdana": "Verdana, Geneva, sans-serif",
    "trebuchet": "'Trebuchet MS', Helvetica, sans-serif",
}

HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}){1,2}$")
SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")

# A small heuristic list used by the client-side spam-word checker; kept
# here too so /api/spam-check can be used headlessly (e.g. from a CI job).
SPAM_WORDS = [
    "free", "guarantee", "no obligation", "act now", "click here", "urgent",
    "winner", "cash bonus", "risk-free", "100% free", "limited time",
    "buy now", "cancel at any time", "congratulations", "double your",
    "earn extra cash", "eliminate debt", "get paid", "no credit check",
    "once in a lifetime", "order now", "please read", "satisfaction guaranteed",
    "this isn't spam", "while supplies last", "work from home",
]


def safe_color(value, default):
    """Only accept valid hex colors, otherwise fall back to default."""
    if value and HEX_RE.match(value.strip()):
        return value.strip()
    return default


def safe_url(value):
    """Very light URL sanitation - only allow http/https/mailto links."""
    if not value:
        return ""
    value = value.strip()
    if value.startswith(("http://", "https://", "mailto:")):
        return value
    if "://" not in value and "@" not in value:
        # assume they forgot the scheme
        return "https://" + value
    return ""


def safe_int(value, default, lo=None, hi=None):
    try:
        n = int(str(value).strip())
    except (TypeError, ValueError):
        return default
    if lo is not None:
        n = max(lo, n)
    if hi is not None:
        n = min(hi, n)
    return n


SOCIAL_NETWORKS = ["facebook", "x", "linkedin", "instagram", "youtube"]


def build_context(form):
    """Turn incoming form data into a clean context dict for the template.
    Every field is optional - missing/empty fields simply omit that piece
    of the email.
    """
    get = form.get

    ctx = {}

    # ---- Email meta (inbox preview) ----
    ctx["subject_line"] = get("subject_line", "").strip()
    ctx["from_name"] = get("from_name", "").strip()
    ctx["preheader"] = get("preheader", "").strip()

    # ---- Global / container ----
    ctx["container_width"] = safe_int(get("container_width"), 600, 320, 800)
    ctx["container_bg"] = safe_color(get("container_bg"), "#ffffff")
    ctx["page_bg"] = safe_color(get("page_bg"), "#f4f4f7")
    ctx["border_radius"] = safe_int(get("border_radius"), 0, 0, 40)
    ctx["font_family"] = FONT_STACKS.get(get("font_family", "system"), FONT_STACKS["system"])
    ctx["body_padding"] = safe_int(get("body_padding"), 32, 0, 80)

    # ---- Header / Logo ----
    ctx["show_header"] = get("show_header") == "on"
    ctx["logo_url"] = safe_url(get("logo_url", ""))
    ctx["logo_alt"] = get("logo_alt", "").strip() or "Logo"
    ctx["logo_width"] = safe_int(get("logo_width"), 140, 20, 400)
    ctx["header_bg"] = safe_color(get("header_bg"), "#ffffff")
    ctx["header_text"] = get("header_text", "").strip()
    ctx["header_text_color"] = safe_color(get("header_text_color"), "#111111")
    ctx["header_align"] = get("header_align", "center")

    # ---- Hero image (full-width banner) ----
    ctx["show_hero"] = get("show_hero") == "on"
    ctx["hero_url"] = safe_url(get("hero_url", ""))
    ctx["hero_alt"] = get("hero_alt", "").strip() or "Banner image"
    ctx["hero_link"] = safe_url(get("hero_link", ""))

    # ---- Body text ----
    ctx["show_body"] = get("show_body") == "on"
    ctx["body_heading"] = get("body_heading", "").strip()
    ctx["body_heading_color"] = safe_color(get("body_heading_color"), "#111111")
    ctx["body_text"] = get("body_text", "").strip()
    ctx["body_text_color"] = safe_color(get("body_text_color"), "#444444")
    ctx["body_font_size"] = safe_int(get("body_font_size"), 16, 10, 28)
    ctx["body_align"] = get("body_align", "left")

    # ---- Two-column block ----
    ctx["show_columns"] = get("show_columns") == "on"
    ctx["col1_image"] = safe_url(get("col1_image", ""))
    ctx["col1_alt"] = get("col1_alt", "").strip() or "Image"
    ctx["col1_heading"] = get("col1_heading", "").strip()
    ctx["col1_text"] = get("col1_text", "").strip()
    ctx["col2_image"] = safe_url(get("col2_image", ""))
    ctx["col2_alt"] = get("col2_alt", "").strip() or "Image"
    ctx["col2_heading"] = get("col2_heading", "").strip()
    ctx["col2_text"] = get("col2_text", "").strip()

    # ---- Buttons (primary + optional secondary) ----
    ctx["show_button"] = get("show_button") == "on"
    ctx["button_text"] = get("button_text", "").strip()
    ctx["button_url"] = safe_url(get("button_url", ""))
    ctx["button_bg"] = safe_color(get("button_bg"), "#1a73e8")
    ctx["button_text_color"] = safe_color(get("button_text_color"), "#ffffff")
    ctx["button_align"] = get("button_align", "center")
    ctx["button_radius"] = safe_int(get("button_radius"), 4, 0, 30)

    ctx["show_button2"] = get("show_button2") == "on"
    ctx["button2_text"] = get("button2_text", "").strip()
    ctx["button2_url"] = safe_url(get("button2_url", ""))
    ctx["button2_bg"] = safe_color(get("button2_bg"), "#ffffff")
    ctx["button2_text_color"] = safe_color(get("button2_text_color"), "#1a73e8")
    ctx["button2_border"] = safe_color(get("button2_border"), "#1a73e8")

    # ---- Divider ----
    ctx["show_divider"] = get("show_divider") == "on"
    ctx["divider_color"] = safe_color(get("divider_color"), "#e0e0e0")

    # ---- Spacer ----
    ctx["show_spacer"] = get("show_spacer") == "on"
    ctx["spacer_height"] = safe_int(get("spacer_height"), 24, 4, 120)

    # ---- Social icons ----
    ctx["show_social"] = get("show_social") == "on"
    ctx["social_bg"] = safe_color(get("social_bg"), "#ffffff")
    ctx["social_icon_color"] = safe_color(get("social_icon_color"), "#5b5fef")
    ctx["social_links"] = {}
    for net in SOCIAL_NETWORKS:
        url = safe_url(get(f"social_{net}", ""))
        if url:
            ctx["social_links"][net] = url

    # ---- Footer ----
    ctx["show_footer"] = get("show_footer") == "on"
    ctx["footer_text"] = get("footer_text", "").strip()
    ctx["footer_text_color"] = safe_color(get("footer_text_color"), "#8a8a8a")
    ctx["footer_bg"] = safe_color(get("footer_bg"), "#fafafa")
    ctx["footer_link_text"] = get("footer_link_text", "").strip()
    ctx["footer_link_url"] = safe_url(get("footer_link_url", ""))
    ctx["footer_align"] = get("footer_align", "center")
    ctx["footer_address"] = get("footer_address", "").strip()

    ctx["dark_mode_meta"] = get("dark_mode_meta") == "on"

    return ctx


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/preview", methods=["POST"])
def preview():
    ctx = build_context(request.form)
    html = render_template("email_template.html", **ctx)
    return html


@app.route("/download", methods=["POST"])
def download():
    ctx = build_context(request.form)
    html = render_template("email_template.html", **ctx)
    filename = (request.form.get("filename", "").strip() or "email").rsplit(".", 1)[0]
    filename = re.sub(r"[^a-zA-Z0-9_-]+", "-", filename) or "email"
    return Response(
        html,
        mimetype="text/html",
        headers={"Content-Disposition": f"attachment; filename={filename}.html"},
    )


@app.route("/api/spam-check", methods=["POST"])
def spam_check():
    """Very lightweight heuristic scan, mirrors the client-side checker."""
    data = request.get_json(silent=True) or {}
    text = " ".join([
        str(data.get("subject", "")),
        str(data.get("preheader", "")),
        str(data.get("body", "")),
    ]).lower()
    hits = sorted({w for w in SPAM_WORDS if w in text})
    all_caps_words = len(re.findall(r"\b[A-Z]{4,}\b", data.get("subject", "") or ""))
    exclaim = (data.get("subject", "") or "").count("!")
    score = len(hits) * 8 + all_caps_words * 6 + max(0, exclaim - 1) * 5
    return jsonify({"score": min(100, score), "flagged_phrases": hits,
                     "all_caps_words": all_caps_words, "exclamations": exclaim})


# ---------------------------------------------------------------------
# Sending — one-time SMTP credential setup, then direct send from the
# builder. Credentials live only in the local .env file, never in a
# response body.
# ---------------------------------------------------------------------

@app.route("/api/email-config", methods=["GET"])
def email_config():
    email = os.environ.get("SENDER_EMAIL", "")
    return jsonify({
        "configured": bool(email and os.environ.get("SENDER_APP_PASSWORD")),
        "email": email,
    })


@app.route("/api/email-config", methods=["POST"])
def save_email_config():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip()
    app_password = (payload.get("app_password") or "").strip()
    smtp_host = (payload.get("smtp_host") or "").strip() or DEFAULT_SMTP_HOST
    smtp_port = (payload.get("smtp_port") or "").strip() or DEFAULT_SMTP_PORT

    if not email or "@" not in email:
        return jsonify({"error": "Enter a valid email address."}), 400
    if not app_password:
        return jsonify({"error": "Enter an app password."}), 400

    set_key(str(ENV_PATH), "SENDER_EMAIL", email)
    set_key(str(ENV_PATH), "SENDER_APP_PASSWORD", app_password)
    set_key(str(ENV_PATH), "SMTP_HOST", smtp_host)
    set_key(str(ENV_PATH), "SMTP_PORT", smtp_port)
    os.environ["SENDER_EMAIL"] = email
    os.environ["SENDER_APP_PASSWORD"] = app_password
    os.environ["SMTP_HOST"] = smtp_host
    os.environ["SMTP_PORT"] = smtp_port

    return jsonify({"configured": True, "email": email})


@app.route("/send", methods=["POST"])
def send_email():
    sender_email = os.environ.get("SENDER_EMAIL", "")
    sender_password = os.environ.get("SENDER_APP_PASSWORD", "")
    if not sender_email or not sender_password:
        return jsonify({"error": "No sender account configured yet."}), 400

    to_email = (request.form.get("send_to", "") or "").strip()
    if not to_email or "@" not in to_email:
        return jsonify({"error": "Enter a valid recipient email address."}), 400

    smtp_host = os.environ.get("SMTP_HOST", DEFAULT_SMTP_HOST)
    smtp_port = safe_int(os.environ.get("SMTP_PORT", DEFAULT_SMTP_PORT), 587, 1, 65535)

    ctx = build_context(request.form)
    html = render_template("email_template.html", **ctx)
    subject = ctx["subject_line"] or "(no subject)"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f'{ctx["from_name"]} <{sender_email}>' if ctx["from_name"] else sender_email
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html"))

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
            server.starttls(context=context)
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, [to_email], msg.as_string())
    except smtplib.SMTPAuthenticationError:
        return jsonify({"error": "Login failed — check the email and app password."}), 401
    except (smtplib.SMTPException, OSError) as exc:
        return jsonify({"error": f"Could not send email: {exc}"}), 502

    return jsonify({"sent": True, "to": to_email})


# ---------------------------------------------------------------------
# Template library — simple JSON-file storage, one file per template.
# Good enough for a single-user/local workflow; swap for a real DB if
# this ever needs to serve multiple concurrent authors.
# ---------------------------------------------------------------------

def _template_path(template_id):
    if not SAFE_ID_RE.match(template_id or ""):
        abort(400)
    return TEMPLATES_DIR / f"{template_id}.json"


@app.route("/api/templates", methods=["GET"])
def list_templates():
    items = []
    for f in sorted(TEMPLATES_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(f.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        items.append({
            "id": f.stem,
            "name": data.get("name", f.stem),
            "updated_at": data.get("updated_at", ""),
        })
    return jsonify(items)


@app.route("/api/templates", methods=["POST"])
def save_template():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip() or "Untitled template"
    fields = payload.get("fields") or {}
    template_id = payload.get("id") or uuid.uuid4().hex[:12]
    if not SAFE_ID_RE.match(template_id):
        template_id = uuid.uuid4().hex[:12]
    record = {
        "name": name,
        "fields": fields,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    _template_path(template_id).write_text(json.dumps(record, indent=2))
    return jsonify({"id": template_id, **record})


@app.route("/api/templates/<template_id>", methods=["GET"])
def load_template(template_id):
    path = _template_path(template_id)
    if not path.exists():
        abort(404)
    return jsonify({"id": template_id, **json.loads(path.read_text())})


@app.route("/api/templates/<template_id>", methods=["DELETE"])
def delete_template(template_id):
    path = _template_path(template_id)
    if path.exists():
        path.unlink()
    return jsonify({"deleted": template_id})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
