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
| Animation | GSAP 3.12 + ScrollTrigger, Lenis 1.1.20 |
| Hosting | Modal (Python ASGI, serverless) |
| Backend | FastAPI (static files + OpenAI proxy) |
| AI Brain | OpenAI GPT-3.5-turbo via server-side proxy |
| Secrets | Modal Secret vault (`openai-key`) |
| Version Control | GitHub |

---

## Architecture

```
Browser
  └── index.html + css/style.css + js/app.js
        └── Canvas frame animation (frames/ directory)
        └── GSAP scroll-driven sections
        └── Lenis smooth scroll
        └── AI chat widget → POST /api/chat
                                  └── FastAPI (modal_app.py)
                                        └── OpenAI API (server-side, key never exposed)
```

---

## Completed Work

- [x] Scroll-driven 3D canvas animation (video frames rendered on canvas)
- [x] GSAP ScrollTrigger section choreography (25+ sections, varied animations)
- [x] Lenis smooth scroll with nav anchor fix (`lenis.scrollTo()`)
- [x] Fixed Contact/Tools section overlap (3000vh container, repositioned sections)
- [x] AI chat widget (GPT-3.5-turbo, server-side proxy)
- [x] Removed client-side `.env` fetch — API key fully secured
- [x] XSS prevention (`escapeHtml()` on all dynamic innerHTML)
- [x] Modal deployment (FastAPI ASGI, static files baked into image)
- [x] Modal secret vault for OpenAI key
- [x] GitHub repo initialized and pushed
- [x] Contact section updated with full profile (MR. KYAW ZIN TUN)
- [x] `.gitignore` protecting `.env` and secrets

---

## Deployment Commands

```bash
# Set Modal credentials
modal token set --token-id <id> --token-secret <secret>

# Create / rotate OpenAI secret
modal secret create openai-key OPENAI_API_KEY="sk-..." --force

# Deploy
modal deploy modal_app.py

# Push to GitHub
git add -A && git commit -m "message" && git push origin main
```

---

## Next Enhancements

### Priority 1 — Content & UX
- [ ] **Mobile responsive layout** — current site is desktop-only; add breakpoints for tablet/phone
- [ ] **Contact form** — replace mailto button with a real form (sends email via n8n or Make webhook)
- [ ] **WhatsApp / Telegram button** — quick contact for Myanmar audience
- [ ] **Burmese language toggle** — EN / MM switcher for local clients

### Priority 2 — AI Brain Upgrade
- [ ] **System prompt** — give the AI Brain context about IT Solutions MM services, pricing, and FAQs so it answers like a real consultant
- [ ] **Chat history persistence** — store conversation in `localStorage` so it survives page refresh
- [ ] **Typing indicator** — animated "..." while waiting for OpenAI response
- [ ] **Upgrade to GPT-4o** — better answers for technical questions

### Priority 3 — Sections & Services
- [ ] **Cloud section** — currently nav link goes nowhere; add AWS/GCP/Azure service cards
- [ ] **Pricing page / modal** — training program pricing cards with enroll buttons
- [ ] **Portfolio / case studies** — real client results as scroll sections
- [ ] **Testimonials section** — social proof from AI Automation Society members

### Priority 4 — Performance & SEO
- [ ] **Lazy-load frames** — only load canvas frames when user starts scrolling (reduces initial load)
- [ ] **OG meta tags** — proper title, description, and preview image for link sharing
- [ ] **Favicon** — custom favicon matching IT Solutions MM brand
- [ ] **Google Analytics / Plausible** — track visitors and section engagement

### Priority 5 — Security & Ops
- [ ] **Remove `/api/debug-env`** — already done; keep it out
- [ ] **Rate limiting on `/api/chat`** — prevent API cost abuse (add per-IP limit in FastAPI)
- [ ] **OpenAI key rotation reminder** — rotate every 90 days, never share in chat

---

## File Structure

```
3D Website/
├── index.html          # Main SPA entry point
├── css/
│   └── style.css       # All styles + CSS variables
├── js/
│   └── app.js          # GSAP, Lenis, canvas, chat widget
├── frames/             # Video-to-canvas PNG frames
├── data/               # JSON data (courses, tools, training, services)
├── modal_app.py        # Modal deployment + FastAPI backend
├── WORKFLOW.md         # This file
├── .gitignore
└── .env                # Local dev only — NEVER committed
```

---

## Key Rules

1. **Never share API keys in chat** — always use `modal secret create` from terminal
2. **Rotate OpenAI key** after any accidental exposure
3. **Never commit `.env`** — it is in `.gitignore`
4. **Test locally** before deploying: open `index.html` directly in browser
5. **Version-bust assets** after changes: increment `?v=N` on CSS/JS script tags in `index.html`
