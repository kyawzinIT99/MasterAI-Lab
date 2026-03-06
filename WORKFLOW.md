# IT Solutions MM — Project Workflow & Roadmap

**Owner:** MR. KYAW ZIN TUN
**Email:** itsolutions.mm@gmail.com
**Community:** AI Automation Society
**Live URL:** https://itsolutions-mm--main-web.modal.run
**GitHub:** https://github.com/kyawzinIT99/MasterAI-Lab
**Modal Workspace:** https://modal.com/apps/itsolutions-mm/main

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML / CSS / JS |
| Animation | GSAP 3.12 + ScrollTrigger, Lenis 1.1.20 (desktop only) |
| Hosting | Modal (Python ASGI, serverless) |
| Backend | FastAPI (static files + OpenAI proxy + Telegram contact + Telegram AI webhook) |
| AI Brain | OpenAI GPT-4o — website chat widget + Telegram bot replies |
| Analytics | Google Analytics 4 (`G-0CJHM3JXHS`) |
| Telegram Bot | @MaterAITraining_bot — AI replies + contact form notifications |
| Secrets | Modal Secret vault (`openai-key`, `telegram-bot`) |
| Version Control | GitHub |

---

## Architecture — Full Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  DESKTOP BROWSER                                                │
│                                                                 │
│  index.html + css/style.css?v=8 + js/app.js?v=17               │
│    ├── Canvas: 121 JPEG frames lazy-loaded (25 ahead / 5 back)  │
│    ├── GSAP ScrollTrigger — 25+ scroll-driven sections          │
│    ├── Lenis smooth scroll — desktop only                       │
│    └── Google Analytics 4 (G-0CJHM3JXHS) — passive tracking    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  MOBILE BROWSER                                                 │
│                                                                 │
│  index.html + css/style.css?v=8 + js/app.js?v=17               │
│    ├── Canvas: HIDDEN — no frame downloads (saves ~10MB)        │
│    ├── Layout: natural CSS flow (position:relative sections)    │
│    ├── Scroll: native + IntersectionObserver for stat countup   │
│    ├── Ambient glow + cyan grid background (CSS only)           │
│    └── Google Analytics 4 (G-0CJHM3JXHS)                       │
└─────────────────────────────────────────────────────────────────┘

Both browsers:
  ├── AI Chat Widget → POST /api/chat
  │     └── FastAPI (modal_app.py)
  │           └── OpenAI GPT-4o → AI reply → browser
  │
  └── Contact Form → POST /api/contact
        └── FastAPI (modal_app.py)
              └── Telegram sendMessage → @MaterAITraining_bot → owner (chat 2010982723)

┌─────────────────────────────────────────────────────────────────┐
│  TELEGRAM USERS                                                 │
│                                                                 │
│  User messages @MaterAITraining_bot                             │
│    └── Telegram → POST /api/telegram-webhook                    │
│          └── FastAPI (modal_app.py)                             │
│                ├── Rate limit: 10 msg/min per user              │
│                ├── OpenAI GPT-4o (same AI Brain system prompt)  │
│                └── Telegram sendMessage → AI reply → user       │
└─────────────────────────────────────────────────────────────────┘

Modal serverless infra:
  modal_app.py → FastAPI ASGI → itsolutions-mm--main-web.modal.run
  Secrets: openai-key (OPENAI_API_KEY), telegram-bot (BOT_TOKEN + CHAT_ID + WEBHOOK_SECRET)
```

---

## Completed Work

### Frontend
- [x] Scroll-driven 3D canvas animation (121 JPEG frames on canvas)
- [x] GSAP ScrollTrigger section choreography (25+ sections, varied animations)
- [x] Lenis smooth scroll with nav anchor fix — desktop only
- [x] Lazy-load canvas frames: initial 20 frames, then 25-ahead / 5-behind window
- [x] Burmese / English language toggle (localStorage persistence)
- [x] OG meta tags + SVG favicon + meta description
- [x] Google Analytics 4 (`G-0CJHM3JXHS`) — tracks all visitors
- [x] Testimonials section, Cloud Native section (`#cloud-section`)
- [x] 5 testimonials total — 2 foreign company endorsements (Singapore, Bangkok) with "100% recommended"
- [x] Training Tools section redesigned as compact 2-column grid (name + difficulty + download link only)

### Mobile
- [x] Canvas hidden, Lenis disabled, frame downloads skipped (saves ~10MB)
- [x] Sections converted to natural CSS flow (no GSAP absolute positioning)
- [x] Duplicate/overlapping sections fixed — each shows once in order
- [x] Stat countup via IntersectionObserver (no ScrollTrigger needed)
- [x] Hamburger nav, full-width sections, ambient glow + grid background
- [x] `ScrollTrigger.update` on native scroll + `refresh()` after dynamic load

### Backend (modal_app.py)
- [x] FastAPI ASGI on Modal serverless — static files baked into image
- [x] `/api/chat` — OpenAI GPT-4o proxy, rate limited 20 req/IP/60s
- [x] `/api/contact` — contact form → Telegram notification to owner
- [x] `/api/telegram-webhook` — GPT-4o AI Brain replies to @MaterAITraining_bot users
- [x] Telegram webhook registered: `setWebhook` → `/api/telegram-webhook`
- [x] Rate limiting on Telegram webhook: 10 msg/min per user chat_id
- [x] Modal secret vault: `openai-key`, `telegram-bot`
- [x] XSS prevention, no API keys exposed to browser
- [x] `/api/chat` — model injection blocked: model locked to `gpt-4o`, `max_tokens` hard-capped at 300
- [x] `/api/contact` — rate limited: 5 submissions/IP/10min to prevent spam floods
- [x] `/api/telegram-webhook` — `X-Telegram-Bot-Api-Secret-Token` header verified (fake calls silently rejected)
- [x] Telegram webhook re-registered with `secret_token` parameter

### AI Brain
- [x] GPT-4o system prompt: IT Solutions MM identity, services, FAQ rules
- [x] Website chat widget: history in localStorage (30 msg), typing indicator, clear button
- [x] Telegram bot: same AI Brain, auto-replies to user messages
- [x] Off-topic questions declined in one sentence (cost control)
- [x] Max 2-3 sentences per reply (cost control)

---

## Deployment Commands

```bash
# Set Modal credentials
modal token set --token-id <id> --token-secret <secret>

# Create / rotate OpenAI secret
modal secret create openai-key OPENAI_API_KEY="sk-..." --force

# Create / rotate Telegram bot secret (include webhook secret)
modal secret create telegram-bot \
  TELEGRAM_BOT_TOKEN="<bot_token>" \
  TELEGRAM_CHAT_ID="2010982723" \
  TELEGRAM_WEBHOOK_SECRET="<webhook_secret>" --force

# Deploy site + backend
modal deploy modal_app.py

# Re-register Telegram webhook after deploy (always include secret_token)
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://itsolutions-mm--main-web.modal.run/api/telegram-webhook&secret_token=<webhook_secret>"

# Push to GitHub
git add -A && git commit -m "message" && git push origin main
```

---

## Telegram Bot Info

| Field | Value |
|-------|-------|
| Bot name | MasterAi.bot |
| Username | @MaterAITraining_bot |
| Bot ID | 8614942238 |
| Owner chat ID | 2010982723 |
| Secret name | `telegram-bot` |
| Webhook URL | `https://itsolutions-mm--main-web.modal.run/api/telegram-webhook` |
| Purpose | AI replies to users + contact form notifications to owner |

---

## File Structure

```
3D Website/
├── index.html              # Main SPA entry point
├── css/
│   └── style.css?v=8       # All styles + mobile flow overrides
├── data/
│   ├── services.json           # AI training + network services
│   ├── ai_learning_hub_dataset.json  # Free courses
│   ├── AI Training Tools.json  # Tools list
│   ├── portfolio.json          # Case studies (update with real client results)
├── js/
│   └── app.js?v=17         # GSAP, Lenis, lazy frames, chat widget, portfolio
├── frames/                 # 121 JPEG frames (canvas animation)
├── data/                   # JSON (courses, tools, training, services, ai-brain)
│   └── ai-brain/           # FAQ, courses, installation, troubleshooting JSON
├── modal_app.py            # Modal + FastAPI: static + 3 API endpoints
├── WORKFLOW.md             # This file
├── .gitignore
└── .env                    # Local dev only — NEVER committed
```

---

## Next Enhancements

### Priority 3 — Sections & Services
- [ ] **Pricing page / modal** — training program pricing cards with enroll buttons
- [x] ~~Portfolio / case studies~~ — DONE (`data/portfolio.json`, rendered at 88% scroll)

### Priority 5 — Security & Ops
- [x] ~~OpenAI key rotation tracking~~ — DONE (`OPENAI_KEY_ROTATED_ON` in `modal_app.py`, logs days remaining on every deploy)
- [x] ~~Telegram bot token rotation~~ — DOCUMENTED (BotFather → revoke → `modal secret create --force` → re-register webhook)

---

## Key Rules

1. **Never share API keys or bot tokens in chat** — always use `modal secret create` from terminal
2. **Rotate OpenAI key** after any accidental exposure
3. **Rotate Telegram bot token** via @BotFather if accidentally shared — old token dies immediately; re-register webhook after rotation
4. **Never commit `.env`** — it is in `.gitignore`
5. **Version-bust assets** after changes: increment `?v=N` on CSS/JS script tags in `index.html`
6. **Current versions:** `css/style.css?v=8`, `js/app.js?v=17`
7. **Telegram webhook** must be re-registered after bot token rotation — always include `secret_token` param
8. **Concurrent users** — Modal auto-scales (100 req/container), static assets unlimited, OpenAI quota is the only real cap
9. **Security hardened** — model injection blocked, contact spam limited, webhook secret verified
