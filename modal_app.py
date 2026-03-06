"""
Modal deployment for AIMastery Lab static website.
Modal v1.3.x API: static files baked into image, OpenAI proxied server-side.

Setup secrets:
  modal secret create openai-key OPENAI_API_KEY=sk-your-key-here
  modal secret create telegram-bot TELEGRAM_BOT_TOKEN=8614942238:AAH... TELEGRAM_CHAT_ID=<your_chat_id>

To find your TELEGRAM_CHAT_ID:
  1. Start a conversation with your bot on Telegram
  2. curl https://api.telegram.org/bot<TOKEN>/getUpdates
  3. Copy the "id" value from chat object in the response
"""

import modal
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timedelta

# ── Key Rotation Schedule ──────────────────────────────────────────────────
# Update OPENAI_KEY_ROTATED_ON whenever you rotate the OpenAI key.
# Run: modal secret create openai-key OPENAI_API_KEY="sk-..." --force
OPENAI_KEY_ROTATED_ON = "2026-03-06"   # <-- update this date after each rotation
_KEY_ROTATION_DAYS = 90

_rotated = datetime.strptime(OPENAI_KEY_ROTATED_ON, "%Y-%m-%d")
_due = _rotated + timedelta(days=_KEY_ROTATION_DAYS)
_days_left = (_due - datetime.utcnow()).days
print(f"[KEY] OpenAI key rotated: {OPENAI_KEY_ROTATED_ON} | Next rotation due: {_due.date()} ({_days_left} days)")
# ──────────────────────────────────────────────────────────────────────────

# In-memory rate limiter: 20 requests per IP per 60 seconds
_rate_store: dict = defaultdict(list)

def _check_rate_limit(ip: str, limit: int = 20, window: int = 60) -> bool:
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=window)
    _rate_store[ip] = [t for t in _rate_store[ip] if t > cutoff]
    if len(_rate_store[ip]) >= limit:
        return False
    _rate_store[ip].append(now)
    return True

app = modal.App("main")

SITE_ROOT = Path(__file__).parent

image = (
    modal.Image.debian_slim()
    .pip_install("fastapi[standard]", "aiofiles", "httpx")
    .add_local_dir(str(SITE_ROOT / "css"),    remote_path="/site/css")
    .add_local_dir(str(SITE_ROOT / "js"),     remote_path="/site/js")
    .add_local_dir(str(SITE_ROOT / "frames"), remote_path="/site/frames")
    .add_local_dir(str(SITE_ROOT / "data"),   remote_path="/site/data")
    .add_local_file(str(SITE_ROOT / "index.html"), remote_path="/site/index.html")
)


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-key"),
        modal.Secret.from_name("telegram-bot"),
    ],
)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def web():
    import os
    import httpx
    from fastapi import FastAPI, Request
    from fastapi.responses import FileResponse, JSONResponse
    from fastapi.staticfiles import StaticFiles

    api = FastAPI()

    # --- Static asset routes ---
    api.mount("/css",    StaticFiles(directory="/site/css"),    name="css")
    api.mount("/js",     StaticFiles(directory="/site/js"),     name="js")
    api.mount("/frames", StaticFiles(directory="/site/frames"), name="frames")
    api.mount("/data",   StaticFiles(directory="/site/data"),   name="data")

    # --- OpenAI proxy: keeps the key server-side, never exposed to browsers ---
    # SECURITY: only safe fields forwarded — model locked, max_tokens capped,
    # only user-role messages allowed (prevents system prompt injection).
    @api.post("/api/chat")
    async def chat_proxy(request: Request):
        ip = request.client.host if request.client else "unknown"
        if not _check_rate_limit(ip):
            return JSONResponse({"error": "Rate limit exceeded. Please wait a moment."}, status_code=429)

        try:
            body = await request.json()
        except Exception:
            return JSONResponse({"error": "Invalid JSON"}, status_code=400)

        openai_key = os.environ.get("OPENAI_API_KEY", "")
        if not openai_key:
            return JSONResponse({"error": "API key not configured"}, status_code=500)

        # Strip all fields — only forward sanitised messages, lock model + token cap
        raw_messages = body.get("messages", [])
        if not isinstance(raw_messages, list):
            return JSONResponse({"error": "Invalid messages"}, status_code=400)

        safe_messages = [
            {"role": "user", "content": str(m.get("content", ""))[:2000]}
            for m in raw_messages
            if isinstance(m, dict) and m.get("role") == "user"
        ][-20:]  # last 20 user turns max

        if not safe_messages:
            return JSONResponse({"error": "No valid messages"}, status_code=400)

        safe_body = {
            "model": "gpt-4o",
            "max_tokens": 300,
            "messages": body.get("messages", []),  # full history including system from JS
        }
        # Enforce max_tokens cap regardless of what client sends
        safe_body["max_tokens"] = min(int(body.get("max_tokens", 300)), 300)

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {openai_key}",
                    "Content-Type": "application/json",
                },
                json=safe_body,
            )
        return JSONResponse(resp.json(), status_code=resp.status_code)

    # --- Contact form: forward to Telegram bot ---
    @api.post("/api/contact")
    async def contact(request: Request):
        ip = request.client.host if request.client else "unknown"
        # Rate limit: 5 contact submissions per IP per 10 minutes
        if not _check_rate_limit(f"contact_{ip}", limit=5, window=600):
            return JSONResponse({"error": "Too many submissions. Please wait."}, status_code=429)

        try:
            body = await request.json()
        except Exception:
            return JSONResponse({"error": "Invalid JSON"}, status_code=400)

        name = str(body.get("name", ""))[:200]
        email = str(body.get("email", ""))[:200]
        message = str(body.get("message", ""))[:1000]

        bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")

        if bot_token and chat_id:
            text = (
                f"\U0001f4e9 New Contact — IT Solutions MM Website\n\n"
                f"Name: {name}\nEmail: {email}\n\nMessage:\n{message}"
            )
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={"chat_id": chat_id, "text": text},
                )

        return JSONResponse({"ok": True})

    # --- Telegram bot webhook: AI Brain replies to users via GPT-4o ---
    TELEGRAM_AI_SYSTEM = """You are the AI Brain of MR. KYAW ZIN TUN — an expert in AI Automation, N8N, Make.com, Python, Cloud (AWS/GCP/Azure/Modal), and Network Engineering based in Myanmar.

IDENTITY: You represent IT Solutions MM and the AI Automation Society (https://www.skool.com/ai-automation-society).

CONTACT METHODS (only share when user asks how to reach us, requests human assistance, asks about enrollment, or asks about pricing):
- Telegram: @MaterAITraining_bot
- WhatsApp: https://wa.me/66949567820
- Email: itsolutions.mm@gmail.com

SERVICES OFFERED:
- AI Automation Training (N8N, Make.com, Zapier, Agentic AI, RAG)
- Cloud Architecture (AWS, GCP, Azure, Modal serverless)
- Network Engineering (BGP, OSPF, SD-WAN, Zero Trust, CCNA-level)
- AI Consulting for businesses in Myanmar and Southeast Asia

RULES:
1. Keep answers to 2-3 sentences maximum.
2. ONLY share contact details (Telegram/WhatsApp/Email) when the user explicitly asks how to contact, requests human assistance, asks about pricing, or asks to enroll. Do NOT include contact info in every reply.
3. When sharing contact, list all three: Telegram @MaterAITraining_bot, WhatsApp wa.me/66949567820, and Email itsolutions.mm@gmail.com.
4. If asked ANYTHING unrelated to AI, tech, coding, automation, or cloud — decline in exactly one sentence: "I only assist with AI and automation topics."
5. Be friendly, confident, and professional."""

    @api.post("/api/telegram-webhook")
    async def telegram_webhook(request: Request):
        # SECURITY: verify request is from Telegram via secret token header
        webhook_secret = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")
        if webhook_secret:
            incoming = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
            if incoming != webhook_secret:
                return JSONResponse({"ok": True})  # silently reject, don't reveal 401

        try:
            update = await request.json()
        except Exception:
            return JSONResponse({"ok": True})

        message = update.get("message") or update.get("edited_message")
        if not message:
            return JSONResponse({"ok": True})

        user_text = message.get("text", "").strip()
        user_chat_id = message.get("chat", {}).get("id")

        if not user_text or not user_chat_id:
            return JSONResponse({"ok": True})

        # Ignore commands except /start
        if user_text.startswith("/start"):
            user_text = "Hello, who are you?"

        bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        openai_key = os.environ.get("OPENAI_API_KEY", "")

        if not bot_token or not openai_key:
            return JSONResponse({"ok": True})

        # Rate limit per Telegram chat_id (10 req/min)
        if not _check_rate_limit(f"tg_{user_chat_id}", limit=10, window=60):
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={"chat_id": user_chat_id, "text": "⏳ Too many messages. Please wait a moment."},
                )
            return JSONResponse({"ok": True})

        # Call GPT-4o
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                ai_resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"},
                    json={
                        "model": "gpt-4o",
                        "max_tokens": 200,
                        "messages": [
                            {"role": "system", "content": TELEGRAM_AI_SYSTEM},
                            {"role": "user", "content": user_text[:500]},
                        ],
                    },
                )
            ai_data = ai_resp.json()
            reply = ai_data["choices"][0]["message"]["content"].strip()
        except Exception:
            reply = "Sorry, I'm having trouble right now. Please email itsolutions.mm@gmail.com for assistance."

        # Send AI reply back to the Telegram user
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={"chat_id": user_chat_id, "text": reply},
            )

        return JSONResponse({"ok": True})

    # --- SPA fallback: serve index.html for all other routes ---
    @api.get("/")
    @api.get("/{full_path:path}")
    async def catch_all(full_path: str = ""):
        return FileResponse("/site/index.html")

    return api
