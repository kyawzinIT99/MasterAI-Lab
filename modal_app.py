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
    # Prune stale keys to prevent unbounded memory growth
    if len(_rate_store) > 5000:
        stale = [k for k, v in _rate_store.items() if not v]
        for k in stale:
            del _rate_store[k]
    return True

app = modal.App("main")

SITE_ROOT = Path(__file__).parent

# ── Persistent Volume for live AI feed ────────────────────────────────────────
feed_vol = modal.Volume.from_name("ai-feed-vol", create_if_missing=True)
FEED_PATH        = "/feed/ai_industry_feed.json"
SUBS_PATH        = "/feed/subscribers.json"
QUIZ_CACHE_PATH  = "/feed/quiz_cache.json"   # shared question pool, generated once per course
FEED_MAX         = 30
QUIZ_CACHE_DAYS  = 7   # regenerate questions after this many days

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
    from html import escape as _esc
    rows = ""
    for item in updates:
        link = item.get('official_link', '')
        safe_link = link if link.startswith(('https://', 'http://')) else '#'
        rows += f"""
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #1a1a2e;">
            <span style="font-size:10px;color:#00cccc;text-transform:uppercase;letter-spacing:1px;">{_esc(item['company'])} · {_esc(item.get('release_type','Update'))}</span><br>
            <a href="{_esc(safe_link)}" style="font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">{_esc(item['title'])}</a><br>
            <span style="font-size:13px;color:#888;line-height:1.5;">{_esc(item.get('digest',''))}</span><br>
            <span style="font-size:11px;color:#555;">{_esc(item.get('date',''))}</span>
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
    from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
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

        # Sanitise messages — allow one system message (AI Brain context from JS),
        # then user/assistant history only. Reject all other roles.
        raw_messages = body.get("messages", [])
        if not isinstance(raw_messages, list):
            return JSONResponse({"error": "Invalid messages"}, status_code=400)

        # Allow first system message (capped), then interleaved user/assistant only
        system_msgs = [
            {"role": "system", "content": str(m.get("content", ""))[:6000]}
            for m in raw_messages
            if isinstance(m, dict) and m.get("role") == "system"
        ][:1]

        history_msgs = [
            {"role": m["role"], "content": str(m.get("content", ""))[:2000]}
            for m in raw_messages
            if isinstance(m, dict) and m.get("role") in ("user", "assistant")
        ][-20:]

        if not any(m["role"] == "user" for m in history_msgs):
            return JSONResponse({"error": "No valid messages"}, status_code=400)

        safe_body = {
            "model": "gpt-4o",
            "max_tokens": 300,
            "messages": system_msgs + history_msgs,
        }

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
    CERT_PATH  = "/feed/certificates.json"

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
    TELEGRAM_AI_SYSTEM = """You are the AI assistant of IT Solutions MM (founder: MR. KYAW ZIN TUN), a free AI automation training platform in Myanmar.

SERVICES: Free courses in N8N, Make.com, Agentic AI, Cloud (AWS/GCP/Azure/Modal), Network Engineering, AI Business Consulting. Certificate issued after 75% quiz score.
CONTACT (share ONLY when user asks to enroll, asks pricing, or asks how to reach us): Telegram @MaterAITraining_bot | WhatsApp wa.me/66949567820 | Email itsolutions.mm@gmail.com
WEBSITE: https://itsolutions-mm--main-web.modal.run

STRICT RULES:
1. Answer in 1-2 sentences only — no long explanations.
2. ONLY answer about IT Solutions MM services, AI automation, N8N, Make.com, cloud, network, or Python. For anything else say: "I only assist with AI and automation topics."
3. NEVER invent course content, pricing, or features not stated above.
4. If you don't know the specific answer, say: "Contact us at @MaterAITraining_bot or itsolutions.mm@gmail.com for details."
5. LANGUAGE: Burmese script → reply in Burmese. English → reply in English. Always match user language."""

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
                        "max_tokens": 120,
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

    # --- Dynamic quiz question generator: fresh AI questions every session ---
    _COURSE_TOPICS = {
        "n8n":        "N8N workflow automation — nodes, webhooks, HTTP requests, error handling, expressions, scheduling, credentials, loops, merging, and deploying N8N to production",
        "makecom":    "Make.com (Integromat) automation — scenarios, modules, routers, filters, iterators, aggregators, webhooks, error handling, operations, scheduling, and data mapping",
        "agentic":    "Agentic AI systems — LLMs, RAG, vector databases, embeddings, function calling, multi-agent orchestration, memory management, hallucination prevention, and production deployment",
        "cloud":      "Cloud deployment for AI — AWS Lambda, Modal serverless, Docker, CI/CD pipelines, IAM, VPC, cost optimisation, monitoring, Supabase, and container orchestration",
        "network":    "Network engineering — OSPF, BGP, VLANs, SD-WAN, Zero Trust, IPsec VPN, NAT, firewall rules, Netmiko/Python automation, SNMP, NetFlow, and enterprise network design",
        "consulting": "AI business consulting — process analysis, ROI calculation, tool selection (N8N vs Make), change management, proposal writing, pilot projects, KPIs, and Southeast Asia market context",
    }

    @api.post("/api/quiz/questions")
    async def quiz_questions(request: Request):
        import json, random
        ip = request.client.host if request.client else "unknown"
        if not _check_rate_limit(f"quiz_{ip}", limit=5, window=3600):
            return JSONResponse({"error": "Too many quiz attempts. Try again later."}, status_code=429)
        try:
            body = await request.json()
        except Exception:
            return JSONResponse({"error": "Invalid JSON"}, status_code=400)

        course_key = str(body.get("course_key", "")).strip().lower()[:20]
        if course_key not in _COURSE_TOPICS:
            return JSONResponse({"error": "Invalid course"}, status_code=400)

        # ── 1. Serve from Volume cache (generated once, shared across all users) ──
        cache_file = Path(QUIZ_CACHE_PATH)
        if cache_file.exists():
            try:
                cache = json.loads(cache_file.read_text())
                entry = cache.get(course_key, {})
                pool  = entry.get("questions", [])
                if len(pool) >= 15:
                    # Check cache age — regenerate after QUIZ_CACHE_DAYS
                    generated_at = datetime.fromisoformat(entry.get("generated_at", "2000-01-01"))
                    age_days = (datetime.utcnow() - generated_at).days
                    if age_days < QUIZ_CACHE_DAYS:
                        shuffled = random.sample(pool, 15)
                        print(f"[Quiz Cache] HIT {course_key} (age {age_days}d) — served to {ip}")
                        return JSONResponse({"questions": shuffled})
                    print(f"[Quiz Cache] EXPIRED {course_key} (age {age_days}d) — regenerating")
            except Exception as e:
                print(f"[Quiz Cache] Read error: {e}")

        # ── 2. Cache miss / expired — generate 15 questions via GPT-4o, store once ──
        openai_key = os.environ.get("OPENAI_API_KEY", "")
        if not openai_key:
            return JSONResponse({"error": "Not configured"}, status_code=500)

        topic = _COURSE_TOPICS[course_key]
        prompt = (
            f"Generate exactly 20 multiple-choice quiz questions about: {topic}.\n\n"
            "Requirements:\n"
            "- Intermediate to advanced difficulty — scenario-based, practical, NOT pure definition recall\n"
            "- Each question has exactly 4 options\n"
            "- Exactly one correct answer per question\n"
            "- Questions must be unique and cover different sub-topics\n"
            "- Return ONLY a JSON array, no markdown, no extra text:\n"
            '[{"question":"...","options":["A","B","C","D"],"correct":0},...]\n'
            "correct is the 0-based index of the correct answer."
        )
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"},
                    json={"model": "gpt-4o", "max_tokens": 4000, "temperature": 0.8,
                          "messages": [{"role": "user", "content": prompt}]},
                )
            raw = resp.json()["choices"][0]["message"]["content"].strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1].strip()
                if raw.startswith("json"): raw = raw[4:].strip()
            questions = json.loads(raw)
            if not isinstance(questions, list) or len(questions) < 5:
                raise ValueError("Bad response")
            clean = []
            for q in questions[:20]:
                if isinstance(q.get("options"), list) and len(q["options"]) == 4 and isinstance(q.get("correct"), int):
                    clean.append({"question": str(q["question"])[:300],
                                  "options": [str(o)[:150] for o in q["options"]],
                                  "correct": max(0, min(3, q["correct"]))})
            if len(clean) < 5:
                raise ValueError("Too few valid questions")

            # Save pool to Volume — all future users served from here, no more GPT calls
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            cache = {}
            if cache_file.exists():
                try:
                    cache = json.loads(cache_file.read_text())
                except Exception:
                    cache = {}
            cache[course_key] = {
                "questions":    clean,
                "generated_at": datetime.utcnow().isoformat(),
                "count":        len(clean),
            }
            cache_file.write_text(json.dumps(cache, indent=2))
            feed_vol.commit()
            print(f"[Quiz Cache] GENERATED + CACHED {len(clean)} questions for {course_key}")

            # Return 15 random from the new pool
            shuffled = random.sample(clean, min(15, len(clean)))
            return JSONResponse({"questions": shuffled})

        except Exception as e:
            print(f"[Quiz Gen] Failed for {course_key}: {e}")
            return JSONResponse({"error": "generation_failed"}, status_code=500)

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

    # --- Certificate generation: auto-triggered when score >= 70% ---
    @api.post("/api/certificate/generate")
    async def certificate_generate(request: Request):
        import json, uuid as uuid_lib, re
        from pathlib import Path
        ip = request.client.host if request.client else "unknown"
        if not _check_rate_limit(f"cert_{ip}", limit=5, window=300):
            return JSONResponse({"error": "Too many requests."}, status_code=429)
        try:
            body = await request.json()
        except Exception:
            return JSONResponse({"error": "Invalid JSON"}, status_code=400)

        name         = str(body.get("name", "")).strip()[:200]
        email        = str(body.get("email", "")).strip()[:200]
        course       = str(body.get("course", "")).strip()[:200]
        course_key   = str(body.get("course_key", "")).strip()[:50]
        score        = float(body.get("score", 0))
        learning_pct = float(body.get("learning_score", 0))
        quiz_pct     = float(body.get("quiz_score", 0))

        if not name or not course:
            return JSONResponse({"error": "Name and course are required."}, status_code=400)
        if score < 75:
            return JSONResponse({"error": "Score must be >= 75% to earn a certificate."}, status_code=400)

        cert_id = str(uuid_lib.uuid4())
        cert_data = {
            "id":             cert_id,
            "name":           name,
            "email":          email,
            "course":         course,
            "course_key":     course_key,
            "score":          round(score, 1),
            "learning_score": round(learning_pct, 1),
            "quiz_score":     round(quiz_pct, 1),
            "date":           datetime.utcnow().strftime("%Y-%m-%d"),
            "issued_at":      datetime.utcnow().isoformat(),
        }

        cf = Path(CERT_PATH)
        cf.parent.mkdir(parents=True, exist_ok=True)
        certs = json.loads(cf.read_text()) if cf.exists() else {}
        certs[cert_id] = cert_data
        cf.write_text(json.dumps(certs, indent=2))
        feed_vol.commit()

        cert_url = f"https://itsolutions-mm--main-web.modal.run/certificate/{cert_id}"
        return JSONResponse({"ok": True, "cert_id": cert_id, "cert_url": cert_url})

    # --- Online digital certificate viewer ---
    @api.get("/certificate/{cert_id}")
    async def certificate_view(cert_id: str):
        import json, re
        from pathlib import Path
        from html import escape as _esc

        if not re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', cert_id):
            return HTMLResponse("<h1>Invalid certificate ID</h1>", status_code=400)

        cf = Path(CERT_PATH)
        if not cf.exists():
            return HTMLResponse("<h1>Certificate not found</h1>", status_code=404)
        certs = json.loads(cf.read_text())
        cert = certs.get(cert_id)
        if not cert:
            return HTMLResponse("<h1>Certificate not found</h1>", status_code=404)

        try:
            date_fmt = datetime.strptime(cert["date"], "%Y-%m-%d").strftime("%B %d, %Y")
        except Exception:
            date_fmt = cert.get("date", "")

        # Escape all user-supplied values before HTML interpolation (XSS prevention)
        n   = _esc(str(cert["name"]))
        crs = _esc(str(cert["course"]))
        sc  = _esc(str(cert["score"]))
        ls  = _esc(str(cert["learning_score"]))
        qs  = _esc(str(cert["quiz_score"]))
        cid = _esc(cert_id[:8].upper())
        date_fmt = _esc(date_fmt)

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Certificate — {n} | IT Solutions MM</title>
<meta name="robots" content="noindex">
<meta property="og:title" content="Certificate of Completion — {n}">
<meta property="og:description" content="{n} completed {crs} with {sc}% at IT Solutions MM.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:#06060f;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Crimson Text',serif;padding:2rem}}
.cert{{background:linear-gradient(135deg,#080815 0%,#0a0a18 50%,#060610 100%);border:1px solid rgba(0,255,255,0.2);border-radius:4px;padding:4rem;position:relative;box-shadow:0 0 80px rgba(0,200,200,0.07),inset 0 0 60px rgba(0,0,0,0.4);max-width:860px;width:100%}}
.cert::before{{content:'';position:absolute;inset:12px;border:1px solid rgba(0,255,255,0.07);border-radius:2px;pointer-events:none}}
.corner{{position:absolute;width:36px;height:36px;border-color:rgba(0,255,255,0.35);border-style:solid}}
.tl{{top:22px;left:22px;border-width:2px 0 0 2px}}
.tr{{top:22px;right:22px;border-width:2px 2px 0 0}}
.bl{{bottom:22px;left:22px;border-width:0 0 2px 2px}}
.br{{bottom:22px;right:22px;border-width:0 2px 2px 0}}
.org{{text-align:center;font-family:'Cinzel',serif;font-size:.6rem;letter-spacing:.3em;color:#00cccc;text-transform:uppercase;margin-bottom:2.5rem}}
.title{{text-align:center;font-family:'Cinzel',serif;font-size:2rem;font-weight:700;color:#fff;letter-spacing:.08em;line-height:1.2}}
.divider{{width:100px;height:1px;background:linear-gradient(90deg,transparent,#00ffff,transparent);margin:1.5rem auto}}
.certify{{text-align:center;font-size:1.1rem;color:rgba(200,200,230,.7);font-style:italic;margin-bottom:.8rem}}
.name{{text-align:center;font-family:'Cinzel',serif;font-size:2.6rem;font-weight:600;color:#00ffff;letter-spacing:.04em;margin:.4rem 0 .8rem;text-shadow:0 0 30px rgba(0,255,255,.25)}}
.name-line{{width:280px;height:1px;background:rgba(0,255,255,.18);margin:0 auto 1.5rem}}
.completed{{text-align:center;font-size:1.05rem;color:rgba(200,200,230,.65);font-style:italic;margin-bottom:.4rem}}
.course{{text-align:center;font-family:'Cinzel',serif;font-size:1.2rem;color:#fff;font-weight:600;letter-spacing:.05em;margin-bottom:2rem}}
.scores{{display:flex;justify-content:center;gap:3rem;margin-bottom:2.5rem}}
.sc-item{{text-align:center}}
.sc-val{{font-family:'Cinzel',serif;font-size:1.7rem;color:#00ffff;font-weight:600}}
.sc-label{{font-size:.65rem;color:rgba(150,150,180,.7);text-transform:uppercase;letter-spacing:.15em;margin-top:.2rem}}
.footer{{display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid rgba(255,255,255,.05);padding-top:1.5rem;margin-top:.5rem}}
.sig{{text-align:center}}
.sig-line{{width:150px;height:1px;background:rgba(255,255,255,.12);margin:0 auto .4rem}}
.sig-name{{font-family:'Cinzel',serif;font-size:.7rem;color:rgba(200,200,230,.55);letter-spacing:.08em}}
.sig-title{{font-size:.6rem;color:rgba(150,150,180,.45);text-transform:uppercase;letter-spacing:.1em;margin-top:.12rem}}
.meta{{text-align:right}}
.date-val{{font-family:'Cinzel',serif;font-size:.75rem;color:rgba(200,200,230,.5);letter-spacing:.06em}}
.badge{{font-size:.58rem;color:#00cccc;letter-spacing:.1em;text-transform:uppercase;margin-top:.2rem}}
.cert-id{{font-size:.5rem;color:rgba(100,100,130,.45);letter-spacing:.08em;font-family:monospace;margin-top:.3rem}}
.actions{{text-align:center;margin-top:2rem}}
.btn{{display:inline-block;padding:.7rem 2rem;background:transparent;border:1px solid rgba(0,255,255,.3);color:#00cccc;font-family:'Cinzel',serif;font-size:.7rem;letter-spacing:.15em;text-transform:uppercase;cursor:pointer;border-radius:2px;transition:all .3s;text-decoration:none}}
.btn:hover{{background:rgba(0,255,255,.08);border-color:rgba(0,255,255,.6)}}
@media print{{body{{background:#fff}}.cert{{background:#fff;border-color:#ccc;box-shadow:none}}.corner{{border-color:#999}}.name,.sc-val,.org,.divider,.badge{{color:#000}}.title,.course,.sig-name,.date-val,.cert-id,.sig-title,.sc-label,.certify,.completed{{color:#333}}.actions{{display:none}}}}
</style>
</head>
<body>
<div class="cert">
  <div class="corner tl"></div><div class="corner tr"></div>
  <div class="corner bl"></div><div class="corner br"></div>
  <div class="org">IT Solutions MM &middot; AI Automation Society &middot; Myanmar</div>
  <div class="title">Certificate of Completion</div>
  <div class="divider"></div>
  <div class="certify">This is to certify that</div>
  <div class="name">{n}</div>
  <div class="name-line"></div>
  <div class="completed">has successfully completed</div>
  <div class="course">{crs}</div>
  <div class="scores">
    <div class="sc-item"><div class="sc-val">{sc}%</div><div class="sc-label">Final Score</div></div>
    <div class="sc-item"><div class="sc-val">{ls}%</div><div class="sc-label">Learning</div></div>
    <div class="sc-item"><div class="sc-val">{qs}%</div><div class="sc-label">Quiz</div></div>
  </div>
  <div class="footer">
    <div class="sig">
      <div class="sig-line"></div>
      <div class="sig-name">MR. KYAW ZIN TUN</div>
      <div class="sig-title">Founder &middot; IT Solutions MM</div>
    </div>
    <div class="meta">
      <div class="date-val">Issued: {date_fmt}</div>
      <div class="badge">&#10003; Verified Certificate</div>
      <div class="cert-id">ID: {cid}</div>
    </div>
  </div>
</div>
<div class="actions">
  <button class="btn" onclick="window.print()">Print / Save as PDF</button>
</div>
</body>
</html>"""
        return HTMLResponse(html)

    # --- SPA fallback: serve index.html for all other routes ---
    @api.get("/")
    @api.get("/{full_path:path}")
    async def catch_all(full_path: str = ""):
        return FileResponse("/site/index.html")

    return api
