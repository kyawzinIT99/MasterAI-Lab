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

# ── Persistent Volume for live AI feed ────────────────────────────────────────
feed_vol = modal.Volume.from_name("ai-feed-vol", create_if_missing=True)
FEED_PATH  = "/feed/ai_industry_feed.json"
SUBS_PATH  = "/feed/subscribers.json"
FEED_MAX   = 30

# Sources to scrape every 6 hours
_FEED_SOURCES = [
    {"company": "OpenAI",         "url": "https://openai.com/blog",                                  "category": "AI API"},
    {"company": "Anthropic",      "url": "https://www.anthropic.com/news",                           "category": "AI Safety Research"},
    {"company": "Google DeepMind","url": "https://deepmind.google/discover/blog",                    "category": "AI Research"},
    {"company": "Meta AI",        "url": "https://ai.meta.com/blog",                                 "category": "Open AI Models"},
    {"company": "xAI",            "url": "https://x.ai/blog",                                        "category": "AI Research"},
    {"company": "Mistral AI",     "url": "https://mistral.ai/news",                                  "category": "AI Models"},
    {"company": "HuggingFace",    "url": "https://huggingface.co/blog",                              "category": "AI Infrastructure"},
    {"company": "NVIDIA AI",      "url": "https://blogs.nvidia.com/blog/category/deep-learning",     "category": "AI Hardware"},
]

# ── Scraper image (lighter — no static assets needed) ─────────────────────────
scraper_image = (
    modal.Image.debian_slim()
    .pip_install("httpx")
)

# ── Scheduled scraper: runs every 6 hours, zero human effort ──────────────────
@app.function(
    image=scraper_image,
    schedule=modal.Cron("0 */6 * * *"),
    volumes={"/feed": feed_vol},
    secrets=[
        modal.Secret.from_name("openai-key"),
        modal.Secret.from_name("firecrawl"),
    ],
    timeout=300,
)
def scrape_ai_feed():
    import os, json
    import httpx

    fc_key = os.environ["FIRECRAWL_API_KEY"]
    oai    = os.environ["OPENAI_API_KEY"]
    today  = datetime.utcnow().strftime("%Y-%m-%d")

    # Load existing feed from volume, or bootstrap empty
    feed_file = Path(FEED_PATH)
    feed_file.parent.mkdir(parents=True, exist_ok=True)
    if feed_file.exists():
        data = json.loads(feed_file.read_text())
    else:
        data = {"updates": []}

    existing = {u["title"].lower() for u in data.get("updates", [])}
    new_updates = []

    for src in _FEED_SOURCES:
        try:
            # Use Firecrawl REST API directly — immune to SDK version changes
            fc_resp = httpx.post(
                "https://api.firecrawl.dev/v1/scrape",
                headers={"Authorization": f"Bearer {fc_key}", "Content-Type": "application/json"},
                json={"url": src["url"], "formats": ["markdown"]},
                timeout=40,
            )
            fc_data = fc_resp.json()
            content = (fc_data.get("data", {}).get("markdown") or "")[:3000]
            if not content:
                print(f"[AI Feed] ✗ {src['company']}: empty content")
                continue

            resp = httpx.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {oai}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o",
                    "max_tokens": 120,
                    "messages": [
                        {"role": "system", "content": (
                            "Extract the single most recent AI product/model announcement from this blog page. "
                            "Reply with JSON only, no markdown: "
                            "{\"title\": \"...\", \"digest\": \"one sentence max\", \"release_type\": \"Model Update|Platform Update|Research Update|Update\"}. "
                            "If no clear announcement found, reply {\"title\": null}."
                        )},
                        {"role": "user", "content": content},
                    ],
                },
                timeout=25,
            )
            raw = resp.json()["choices"][0]["message"]["content"].strip()
            # Strip code fences if model wraps in ```json
            if raw.startswith("```"):
                raw = raw.split("```")[1].strip()
                if raw.startswith("json"):
                    raw = raw[4:].strip()
            item = json.loads(raw)

            if not item.get("title") or item["title"].lower() in existing:
                continue

            new_updates.append({
                "company":      src["company"],
                "model":        src["company"],
                "category":     src["category"],
                "release_type": item.get("release_type", "Update"),
                "title":        item["title"][:120],
                "digest":       item.get("digest", "")[:220],
                "official_link": src["url"],
                "date":         today,
            })
            existing.add(item["title"].lower())
            print(f"[AI Feed] ✓ {src['company']}: {item['title'][:60]}")

        except Exception as e:
            print(f"[AI Feed] ✗ {src['company']}: {e}")

    if new_updates:
        data["updates"] = (new_updates + data.get("updates", []))[:FEED_MAX]
        feed_file.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        feed_vol.commit()
        print(f"[AI Feed] Saved {len(new_updates)} new updates. Total: {len(data['updates'])}")
    else:
        print("[AI Feed] No new updates this cycle.")

# ── Weekly email digest: every Monday 08:00 UTC, zero human effort ───────────
@app.function(
    image=scraper_image,
    schedule=modal.Cron("0 8 * * 1"),
    volumes={"/feed": feed_vol},
    secrets=[modal.Secret.from_name("gmail")],
    timeout=120,
)
def send_weekly_digest():
    import os, json, smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from pathlib import Path

    gmail_from = os.environ["GMAIL_FROM"]
    gmail_pass = os.environ["GMAIL_APP_PASSWORD"]

    # Load subscribers
    subs_file = Path(SUBS_PATH)
    if not subs_file.exists():
        print("[Digest] No subscribers yet.")
        return
    subscribers = json.loads(subs_file.read_text())
    if not subscribers:
        print("[Digest] Subscriber list empty.")
        return

    # Load latest feed
    feed_file = Path(FEED_PATH)
    if not feed_file.exists():
        print("[Digest] No feed data.")
        return
    feed = json.loads(feed_file.read_text())
    updates = feed.get("updates", [])[:10]
    if not updates:
        print("[Digest] Feed has no updates.")
        return

    # Build HTML email
    rows = ""
    for item in updates:
        rows += f"""
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #1a1a2e;">
            <span style="font-size:10px;color:#00cccc;text-transform:uppercase;letter-spacing:1px;">{item['company']} · {item.get('release_type','Update')}</span><br>
            <a href="{item['official_link']}" style="font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">{item['title']}</a><br>
            <span style="font-size:13px;color:#888;line-height:1.5;">{item.get('digest','')}</span><br>
            <span style="font-size:11px;color:#555;">{item.get('date','')}</span>
          </td>
        </tr>"""

    html = f"""
    <html><body style="margin:0;padding:0;background:#06060f;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px;">
      <tr><td style="padding:30px 0 20px;border-bottom:2px solid #00ffff;">
        <span style="font-size:10px;color:#00ffff;letter-spacing:3px;text-transform:uppercase;">IT Solutions MM · AI Automation Society</span><br>
        <span style="font-size:24px;font-weight:bold;color:#ffffff;">AI Pulse Weekly Digest</span><br>
        <span style="font-size:12px;color:#555;">Top AI industry updates this week</span>
      </td></tr>
      {rows}
      <tr><td style="padding:24px 0;font-size:11px;color:#444;border-top:1px solid #1a1a2e;">
        IT Solutions MM · itsolutions.mm@gmail.com<br>
        <a href="https://itsolutions-mm--main-web.modal.run" style="color:#00cccc;">Visit Website</a>
        · <a href="https://t.me/MaterAITraining_bot" style="color:#00cccc;">Telegram Bot</a>
      </td></tr>
    </table></body></html>"""

    sent = 0
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(gmail_from, gmail_pass)
        for email in subscribers:
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = "🤖 AI Pulse Weekly — IT Solutions MM"
                msg["From"] = f"IT Solutions MM <{gmail_from}>"
                msg["To"] = email
                msg.attach(MIMEText(html, "html"))
                smtp.sendmail(gmail_from, email, msg.as_string())
                sent += 1
            except Exception as e:
                print(f"[Digest] Failed {email}: {e}")
    print(f"[Digest] Sent to {sent}/{len(subscribers)} subscribers.")

# ── Web image (static site + API) ─────────────────────────────────────────────
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
    volumes={"/feed": feed_vol},
    secrets=[
        modal.Secret.from_name("openai-key"),
        modal.Secret.from_name("telegram-bot"),
        modal.Secret.from_name("gmail"),
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

    # --- Email digest subscription ---
    @api.post("/api/subscribe")
    async def subscribe(request: Request):
        import json, re
        from pathlib import Path
        ip = request.client.host if request.client else "unknown"
        if not _check_rate_limit(f"sub_{ip}", limit=3, window=300):
            return JSONResponse({"error": "Too many requests."}, status_code=429)
        try:
            body = await request.json()
        except Exception:
            return JSONResponse({"error": "Invalid JSON"}, status_code=400)
        email = str(body.get("email", "")).strip()[:200]
        if not re.match(r'^[^@]+@[^@]+\.[^@]+$', email):
            return JSONResponse({"error": "Invalid email."}, status_code=400)
        sf = Path(SUBS_PATH)
        subs = json.loads(sf.read_text()) if sf.exists() else []
        if email not in subs:
            subs.append(email)
            sf.write_text(json.dumps(subs))
            feed_vol.commit()
        return JSONResponse({"ok": True})

    # --- Contact form: forward to Telegram bot ---
    COUNT_PATH = "/feed/student_count.json"

    @api.get("/api/student-count")
    async def student_count():
        import json
        from pathlib import Path
        f = Path(COUNT_PATH)
        if f.exists():
            return JSONResponse(json.loads(f.read_text()))
        return JSONResponse({"count": 0})

    @api.post("/api/contact")
    async def contact(request: Request):
        import json
        from pathlib import Path
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

        # Increment live student inquiry counter
        try:
            cf = Path(COUNT_PATH)
            data = json.loads(cf.read_text()) if cf.exists() else {"count": 0}
            data["count"] = data.get("count", 0) + 1
            cf.write_text(json.dumps(data))
            feed_vol.commit()
        except Exception:
            pass

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
5. Be friendly, confident, and professional.
6. LANGUAGE: Detect the user's language automatically. If the user writes in Burmese (Myanmar script), reply entirely in Burmese. If in English, reply in English. Match the user's language always."""

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

    # --- AI Pulse feed: serve live JSON from volume, fallback to baked file ---
    @api.get("/api/ai-feed")
    async def ai_feed_endpoint():
        import json
        live = Path(FEED_PATH)
        if live.exists():
            return JSONResponse(json.loads(live.read_text()))
        baked = Path("/site/data/Update AI feed.json")
        if baked.exists():
            return JSONResponse(json.loads(baked.read_text()))
        return JSONResponse({"updates": [], "sources": []})

    # --- SPA fallback: serve index.html for all other routes ---
    @api.get("/")
    @api.get("/{full_path:path}")
    async def catch_all(full_path: str = ""):
        return FileResponse("/site/index.html")

    return api
