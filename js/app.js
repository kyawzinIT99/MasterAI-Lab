document.addEventListener("DOMContentLoaded", () => {
  // 1. Lenis Smooth Scroll
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // Nav links: use lenis.scrollTo() so transforms and absolute positioning are handled correctly.
  document.querySelectorAll('.nav-links a, .mobile-nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      // Close mobile nav if open
      document.getElementById('hamburger').classList.remove('open');
      document.getElementById('mobile-nav').classList.remove('open');
      lenis.scrollTo(target, { offset: 0, duration: 1.4, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    });
  });

  // Hamburger menu toggle
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobile-nav');
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileNav.classList.toggle('open');
  });

  // Language Toggle (EN / Burmese)
  let currentLang = localStorage.getItem('preferred_lang') || 'en';
  const langBtn = document.getElementById('lang-toggle');

  function applyLang(lang) {
    currentLang = lang;
    langBtn.textContent = lang === 'en' ? 'MM' : 'EN';
    langBtn.classList.toggle('active-mm', lang === 'mm');
    document.querySelectorAll('[data-en]').forEach(el => {
      const val = el.dataset[lang] || el.dataset['en'];
      if (!val) return;
      if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SPAN' || el.tagName === 'P' || el.tagName === 'H1' || el.tagName === 'H2') {
        el.textContent = val;
      }
    });
    // Placeholder translations for form inputs
    document.querySelectorAll('[data-en-placeholder]').forEach(el => {
      const key = lang === 'mm' ? 'mmPlaceholder' : 'enPlaceholder';
      el.placeholder = el.dataset[key] || el.dataset['enPlaceholder'];
    });
    localStorage.setItem('preferred_lang', lang);
  }

  langBtn.addEventListener('click', () => applyLang(currentLang === 'en' ? 'mm' : 'en'));
  if (currentLang === 'mm') applyLang('mm');

  // Contact form — submit via mailto
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(contactForm);
      const name = fd.get('name') || '';
      const email = fd.get('email') || '';
      const message = fd.get('message') || '';
      const subject = encodeURIComponent(`Inquiry from ${name}`);
      const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`);
      window.open(`mailto:itsolutions.mm@gmail.com?subject=${subject}&body=${body}`, '_self');
    });
  }

  // 2. Preload Frames — start rendering after INITIAL_LOAD, continue rest in background
  const FRAME_COUNT = 121;
  const INITIAL_LOAD = 40; // start site after first 40 frames — faster initial load
  const frames = [];
  let loadedFrames = 0;
  let isLoaded = false;
  const loaderText = document.getElementById('loader-percent');
  const loaderBar = document.getElementById('loader-bar');

  for (let i = 1; i <= FRAME_COUNT; i++) {
    const img = new Image();
    const num = String(i).padStart(4, '0');

    img.onload = () => {
      loadedFrames++;
      const p = Math.floor((loadedFrames / FRAME_COUNT) * 100);
      loaderText.innerText = p + '%';
      loaderBar.style.width = p + '%';
      // Start after INITIAL_LOAD frames; rest keep loading in background
      if (loadedFrames === INITIAL_LOAD && !isLoaded) {
        isLoaded = true;
        initRender();
      }
    };

    img.onerror = () => {
      loadedFrames++;
      if (loadedFrames === INITIAL_LOAD && !isLoaded) {
        isLoaded = true;
        initRender();
      }
    };

    // ALWAYS set src AFTER onload/onerror
    img.src = `frames/frame_${num}.jpg?v=2`;
    frames.push(img);
  }

  // Safety timeout: if frames take more than 8 seconds, just start
  setTimeout(() => {
    if (!isLoaded) {
      isLoaded = true;
      initRender();
    }
  }, 8000);

  // 3. Canvas Rendering Logic
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const canvasWrap = document.getElementById('canvas-wrap');
  let currentFrame = -1;

  function resizeCanvas() {
    canvas.width = (window.innerWidth / 2) * Math.min(window.devicePixelRatio, 2);
    canvas.height = window.innerHeight * Math.min(window.devicePixelRatio, 2);
    if (currentFrame >= 0) drawFrame(currentFrame);
  }
  window.addEventListener('resize', resizeCanvas);

  function drawFrame(index) {
    if (!frames[index]) return;
    const img = frames[index];
    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    // Cover scale factor
    const scale = Math.max(cw / iw, ch / ih) * 1.0;
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  // 4. Main Init after load complete
  function initRender() {
    gsap.to('#loader', { yPercent: -100, duration: 1.2, ease: "power4.inOut" });
    resizeCanvas();
    drawFrame(0);
    currentFrame = 0;

    const scrollContainer = document.getElementById('scroll-container');

    // Core Frame Scrubbing
    ScrollTrigger.create({
      trigger: scrollContainer,
      start: "top top",
      end: "bottom bottom",
      scrub: 1.5, // Added smoothing to the scrub
      onUpdate: (self) => {
        // Less overall loops keeps the video moving slower, more cinematic
        const loops = 4;
        const progress = self.progress;

        // Frame looping
        let index = Math.floor(progress * FRAME_COUNT * loops) % FRAME_COUNT;
        if (isNaN(index)) index = 0;

        if (index !== currentFrame) {
          currentFrame = index;
          requestAnimationFrame(() => drawFrame(currentFrame));
        }
      }
    });

    // Dark Overlay logic for readability when stats or specific marquees show up
    const overlay = document.getElementById('dark-overlay');
    ScrollTrigger.create({
      trigger: scrollContainer,
      start: "top top", end: "bottom bottom", scrub: true,
      onUpdate: (self) => {
        const p = self.progress * 100;
        // Fade to dark overlay around stats section (enter 64, leave 68)
        let op = 0;
        if (p > 62 && p < 70) {
          op = 0.85; // dark mode backdrop for counters
        }
        overlay.style.opacity = op;
      }
    });

    // Marquee logic
    document.querySelectorAll('.marquee-wrap').forEach(el => {
      const spd = parseFloat(el.dataset.scrollSpeed);
      gsap.to(el.querySelector('.marquee-text'), {
        xPercent: spd, ease: "none",
        scrollTrigger: { trigger: scrollContainer, start: "top top", end: "bottom bottom", scrub: true }
      });
    });

    // Section GSAP Animations
    document.querySelectorAll('.scroll-section').forEach(section => {
      const type = section.dataset.animation;
      const persist = section.dataset.persist === "true";
      const enter = parseFloat(section.dataset.enter) / 100;
      const leave = parseFloat(section.dataset.leave) / 100;

      // Position the section natively in ABSOLUTE space down the monster scroll container
      // Centered at the midpoint of enter & leave
      const mid = (enter + leave) / 2;
      section.style.top = `${mid * 100}%`;
      section.style.transform = `translateY(-50%)`;

      const tl = gsap.timeline({ paused: true });
      const children = section.querySelectorAll('.section-label, .section-heading, .section-body, .cta-button, .stat');
      gsap.set(children, { visibility: 'visible' });

      switch (type) {
        case "fade-up":
          tl.from(children, { y: 50, opacity: 0, stagger: 0.12, duration: 0.9, ease: "power3.out" });
          break;
        case "slide-left":
          tl.from(children, { x: -80, opacity: 0, stagger: 0.14, duration: 0.9, ease: "power3.out" });
          break;
        case "slide-right":
          tl.from(children, { x: 80, opacity: 0, stagger: 0.14, duration: 0.9, ease: "power3.out" });
          break;
        case "scale-up":
          tl.from(children, { scale: 0.85, opacity: 0, stagger: 0.12, duration: 1.0, ease: "power2.out" });
          break;
        case "rotate-in":
          tl.from(children, { y: 40, rotation: 3, opacity: 0, stagger: 0.1, duration: 0.9, ease: "power3.out" });
          break;
        case "stagger-up":
          tl.from(children, { y: 60, opacity: 0, stagger: 0.15, duration: 0.8, ease: "power3.out" });
          break;
        case "clip-reveal":
          tl.from(children, { clipPath: "inset(100% 0 0 0)", opacity: 0, stagger: 0.15, duration: 1.2, ease: "power4.inOut" });
          break;
      }

      // Play/reverse based on scroll bounds
      ScrollTrigger.create({
        trigger: scrollContainer,
        start: "top top", end: "bottom bottom",
        onUpdate: (self) => {
          const p = self.progress;
          if (p >= enter && p <= leave) {
            if (tl.progress() === 0) tl.play();
          } else {
            if (!persist && p < enter && tl.progress() > 0) tl.reverse();
            if (!persist && p > leave && tl.progress() > 0) tl.reverse(); // fade out above and below target area
          }
        }
      });
    });

    // Stat Count ups
    document.querySelectorAll(".stat-number").forEach(el => {
      const section = el.closest('.scroll-section');
      const enter = parseFloat(section.dataset.enter) / 100;

      const target = parseFloat(el.dataset.value);
      const dec = parseInt(el.dataset.decimals || "0");

      ScrollTrigger.create({
        trigger: scrollContainer,
        start: "top top", end: "bottom bottom",
        onUpdate: (self) => {
          if (self.progress >= enter && el.innerText === "0") {
            gsap.to(el, {
              textContent: target,
              duration: 2, ease: "power1.out",
              snap: { textContent: dec === 0 ? 1 : 0.01 }
            });
          }
        }
      });
    });

    // Start Hero animation on load
    gsap.from(".hero-standalone .section-label, .hero-standalone .hero-tagline, .hero-standalone .scroll-indicator", {
      y: 20, opacity: 0, duration: 1, stagger: 0.2, ease: "power2.out", delay: 0.5
    });
    gsap.from(".hero-standalone .line", {
      yPercent: 100, duration: 1, stagger: 0.2, ease: "power4.out", delay: 0.2
    });

    // === DYNAMIC SECTIONS FROM JSON ===
    loadDynamicSections();
  }

  async function loadDynamicSections() {
    try {
      const res = await fetch('data/services.json');
      const data = await res.json();

      // Render AI Training at ~60% scroll
      renderTrainingSection(data.ai_training, 'ai-training-container', 60);

      // Render Network Services at ~72% scroll
      renderServicesSection(data.network_services, 'network-services-container', 72);

      const freeRes = await fetch('data/ai_learning_hub_dataset.json');
      const freeData = await freeRes.json();

      // Render Free Courses at ~76% scroll
      renderFreeCoursesSection(freeData, 'ai-free-course-container', 76);

      const toolsRes = await fetch('data/AI%20Training%20Tools.json');
      const toolsData = await toolsRes.json();

      // Render Training Tools at ~85% scroll (spaced past Free Courses)
      renderTrainingToolsSection(toolsData, 'ai-training-tools-container', 85);

      // Setup reveal animations
      setupCardReveal();

    } catch (err) {
      console.error('Failed to load services.json:', err);
    }
  }

  function renderTrainingSection(section, containerId, scrollPct) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.style.top = `${scrollPct}%`;
    container.style.transform = 'translateY(-50%)';

    let html = `
      <div class="service-group-header">
        <div class="service-group-subtitle">${section.subtitle}</div>
        <h2 class="service-group-title">${section.title}</h2>
      </div>
    `;

    section.courses.forEach(course => {
      html += `
        <div class="service-card" data-id="${course.id}">
          <div class="service-card-header">
            <div>
              <div class="service-card-label">${course.label}</div>
              <div class="service-card-name">${course.name}</div>
            </div>
            <div class="service-card-price">
              $${course.price.toLocaleString()}
              <span class="price-period">${course.duration} · ${course.level}</span>
            </div>
          </div>
          <p class="service-card-desc">${course.description}</p>
          <div class="service-card-topics">
            ${course.topics.map(t => `<span class="topic-pill">${t}</span>`).join('')}
          </div>
          <a href="mailto:itsolutions.mm@gmail.com?subject=Inquiry%20-%20${encodeURIComponent(course.name)}" class="service-card-cta">Inquire Now →</a>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function renderServicesSection(section, containerId, scrollPct) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.style.top = `${scrollPct}%`;
    container.style.transform = 'translateY(-50%)';

    let html = `
      <div class="service-group-header">
        <div class="service-group-subtitle">${section.subtitle}</div>
        <h2 class="service-group-title">${section.title}</h2>
      </div>
    `;

    section.services.forEach(svc => {
      html += `
        <div class="service-card" data-id="${svc.id}">
          <div class="service-card-header">
            <div>
              <div class="service-card-label">${svc.label}</div>
              <div class="service-card-name">${svc.name}</div>
            </div>
            <div class="service-card-price">
              $${svc.price.toLocaleString()}
              <span class="price-period">${svc.period}</span>
            </div>
          </div>
          <p class="service-card-desc">${svc.description}</p>
          <div class="service-card-topics">
            ${svc.includes.map(t => `<span class="topic-pill">${t}</span>`).join('')}
          </div>
          <a href="mailto:itsolutions.mm@gmail.com?subject=Service%20Inquiry%20-%20${encodeURIComponent(svc.name)}" class="service-card-cta">Get a Quote →</a>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function renderFreeCoursesSection(data, containerId, alignPercent) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.style.top = `${alignPercent}%`;

    let html = `
      <div class="service-group-header">
        <div class="service-group-subtitle">Free Education</div>
        <h2 class="service-group-title">AI Course (Free)</h2>
      </div>
    `;

    data.learning_paths.forEach(pathObj => {
      html += `
        <div class="service-category-binder" style="margin-top:2rem; margin-bottom:1rem; border-left: 2px solid #00ffff; padding-left:1rem;">
          <h3 style="color:#00ffff; font-family:var(--font-display); font-size:1.2rem; letter-spacing:0.1em; text-transform:uppercase;">${pathObj.path}</h3>
          <p style="color:var(--text-muted); font-size:0.8rem;">${pathObj.description}</p>
        </div>
      `;
      pathObj.courses.forEach(course => {
        html += `
          <div class="service-card visible">
            <div class="service-card-header">
              <div>
                <div class="service-card-label">${course.provider} | ${course.difficulty} • ${course.duration}</div>
                <div class="service-card-name" style="font-size:1.1rem;">${course.title}</div>
              </div>
              <div class="service-card-price" style="color:#00ff00;">
                FREE ${course.certificate ? '<span style="font-size:0.5em; vertical-align:middle; margin-left:5px; border:1px solid #00ff00; padding:2px 4px; border-radius:3px;">CERT</span>' : ''}
              </div>
            </div>
            <div class="service-card-topics" style="margin-top:1rem;">
              ${course.topics.map(t => `<span class="topic-pill">${t}</span>`).join('')}
            </div>
            <div style="margin-top: 1rem; display: flex; gap: 1rem;">
              <a href="${course.course_url}" target="_blank" class="service-card-cta" style="border-color:#00ff00; color:#00ff00;">Course Link ↗</a>
              ${course.video_url ? `<a href="${course.video_url}" target="_blank" class="service-card-cta" style="border-color:#ffaa00; color:#ffaa00;">YouTube Playlist ↗</a>` : ''}
            </div>
          </div>
        `;
      });
    });

    container.innerHTML = html;
  }

  function renderTrainingToolsSection(data, containerId, alignPercent) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.style.top = `${alignPercent}%`;

    let html = `
      <div class="service-group-header">
        <div class="service-group-subtitle">Software Setup</div>
        <h2 class="service-group-title">Training Tools</h2>
      </div>
    `;

    data.tools.forEach(tool => {
      html += `
        <div class="service-card visible">
          <div class="service-card-header">
            <div>
              <div class="service-card-label">${tool.category} | ${tool.difficulty}</div>
              <div class="service-card-name" style="font-size:1.1rem;">${tool.name}</div>
            </div>
          </div>
          <p class="service-card-desc" style="margin-top:0.5rem; color:var(--text-color);">${tool.description}</p>
          <div class="service-card-topics" style="margin-top:1rem;">
            ${tool.supported_os.map(os => `<span class="topic-pill">${os}</span>`).join('')}
          </div>
          <div style="margin-top: 1rem; display: flex; gap: 1rem;">
            <a href="${tool.download_url}" target="_blank" class="service-card-cta" style="border-color:#00ffff; color:#00ffff;">Download ${tool.name} ↗</a>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function setupCardReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.service-card').forEach(card => {
      observer.observe(card);
    });
  }

  // --- Spacebar Chronological Navigation ---
  window.addEventListener('keydown', (e) => {
    // Only intercept space if we aren't typing in an input
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();

      // Gather all scroll trigger points
      const sections = Array.from(document.querySelectorAll('.scroll-section, [data-enter]'));
      const enterPoints = sections.map(s => parseFloat(s.dataset.enter)).filter(n => !isNaN(n));
      const stops = [...new Set(enterPoints)].sort((a, b) => a - b);

      const maxScroll = document.body.scrollHeight - window.innerHeight;
      const currentPercent = (window.scrollY / maxScroll) * 100;

      let targetP = 0;
      if (e.shiftKey) {
        // Go back (Shift+Space)
        const pastStops = stops.filter(p => p < currentPercent - 1);
        if (pastStops.length > 0) targetP = pastStops[pastStops.length - 1];
      } else {
        // Go forward (Space)
        const futureStops = stops.filter(p => p > currentPercent + 1);
        if (futureStops.length > 0) targetP = futureStops[0];
        else targetP = 100; // Go to very bottom if no more sections
      }

      const targetY = (targetP / 100) * maxScroll;
      lenis.scrollTo(targetY, { duration: 1.2 });
    }
  });

  // --- MR. KYAW ZIN AI Brain (ChatGPT feature) ---
  const chatToggle = document.getElementById('ai-chat-toggle');
  const chatWindow = document.getElementById('ai-chat-window');
  const closeChat = document.getElementById('close-chat');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const chatMessages = document.getElementById('chat-messages');

  let aiGlobalContext = `You are the AI Brain of MR. KYAW ZIN TUN — an expert in AI Automation, N8N, Make.com, Python, Cloud (AWS/GCP/Azure/Modal), and Network Engineering based in Myanmar.

IDENTITY: You represent IT Solutions MM and the AI Automation Society (https://www.skool.com/ai-automation-society). Contact: itsolutions.mm@gmail.com.

SERVICES OFFERED:
- AI Automation Training (N8N, Make.com, Zapier, Agentic AI, RAG)
- Cloud Architecture (AWS, GCP, Azure, Modal serverless)
- Network Engineering (BGP, OSPF, SD-WAN, Zero Trust, CCNA-level)
- AI Consulting for businesses in Myanmar and Southeast Asia

RULES:
1. Keep answers to 2-3 sentences maximum to save API cost.
2. Always recommend itsolutions.mm@gmail.com for detailed inquiries or training enrollment.
3. If asked about pricing, say "Contact itsolutions.mm@gmail.com for a custom quote."
4. If asked ANYTHING unrelated to AI, tech, coding, automation, or cloud — decline in exactly one sentence: "I only assist with AI and automation topics."
5. Be friendly, confident, and professional.

--- PLATFORM KNOWLEDGE BASE ---

`;

  // Pre-fetch local datasets to feed into AI Brain
  Promise.all([
    fetch('data/ai-brain/faq_dataset.json').then(r => r.json()),
    fetch('data/ai-brain/courses.json').then(r => r.json()),
    fetch('data/ai-brain/installation.json').then(r => r.json()),
    fetch('data/ai-brain/troubleshooting.json').then(r => r.json())
  ]).then(([faqs, courses, installs, troubles]) => {

    aiGlobalContext += "FAQ:\n";
    faqs.forEach(f => { aiGlobalContext += `Q: ${f.question} - A: ${f.answer}\n`; });

    aiGlobalContext += "\nCOURSES:\n";
    courses.forEach(c => { aiGlobalContext += `- ${c.title} (${c.level}): Modules include ${c.modules.join(', ')}\n`; });

    aiGlobalContext += "\nINSTALLATION GUIDES:\n";
    installs.forEach(i => { aiGlobalContext += `- ${i.tool} Download: ${i.download} Steps: ${i.steps.join(' -> ')}\n`; });

    aiGlobalContext += "\nTROUBLESHOOTING:\n";
    troubles.forEach(t => { aiGlobalContext += `- If ${t.problem}, then ${t.solution}\n`; });

    console.log("AI Brain local context loaded successfully.");
  }).catch(err => console.error("Failed to load AI brain datasets:", err));

  // Add clear history button to chat header
  const clearBtn = document.createElement('button');
  clearBtn.className = 'chat-clear-btn';
  clearBtn.title = 'Clear chat history';
  clearBtn.textContent = 'Clear';
  closeChat.parentNode.insertBefore(clearBtn, closeChat);

  // Chat history — save/restore from localStorage
  function saveMsgToHistory(text, sender) {
    const history = JSON.parse(localStorage.getItem('chat_history') || '[]');
    history.push({ text, sender, ts: Date.now() });
    if (history.length > 30) history.splice(0, history.length - 30);
    localStorage.setItem('chat_history', JSON.stringify(history));
  }

  function loadChatHistory() {
    const history = JSON.parse(localStorage.getItem('chat_history') || '[]');
    history.forEach(msg => addMessage(msg.text, msg.sender, false));
    if (history.length > 0) {
      const divider = document.createElement('div');
      divider.style.cssText = 'font-size:0.55rem;color:rgba(255,255,255,0.2);text-align:center;text-transform:uppercase;letter-spacing:0.1em;padding:4px 0;';
      divider.textContent = '— previous session —';
      chatMessages.insertBefore(divider, chatMessages.firstChild);
    }
  }

  clearBtn.addEventListener('click', () => {
    localStorage.removeItem('chat_history');
    chatMessages.innerHTML = `
      <div class="message ai-message">
        <div class="msg-avatar">MR</div>
        <div class="msg-bubble">Chat cleared. How can I help you with AI and automation?</div>
      </div>`;
  });

  // Toggle Chat
  chatToggle.addEventListener('click', () => {
    chatWindow.classList.toggle('hidden');
    if (!chatWindow.classList.contains('hidden')) {
      chatInput.focus();
      // Load history on first open
      if (!chatWindow.dataset.historyLoaded) {
        loadChatHistory();
        chatWindow.dataset.historyLoaded = '1';
      }
    }
  });

  closeChat.addEventListener('click', () => {
    chatWindow.classList.add('hidden');
  });

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // save=true by default; pass false when restoring history to avoid re-saving
  function addMessage(text, sender, save = true) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}-message`;
    const avatarTxt = sender === 'ai' ? 'MR' : 'U';
    let displayTxt;
    if (sender === 'ai') {
      const safe = escapeHtml(text);
      displayTxt = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      displayTxt = displayTxt.replace(/```([^`]*)```/gs, '<pre><code>$1</code></pre>');
    } else {
      displayTxt = escapeHtml(text);
    }
    msgDiv.innerHTML = `
      <div class="msg-avatar">${avatarTxt}</div>
      <div class="msg-bubble">${displayTxt}</div>
    `;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (save) saveMsgToHistory(text, sender);
    return msgDiv;
  }

  async function handleChatSend() {
    const text = chatInput.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    chatInput.value = '';

    // Animated typing indicator instead of "..."
    const aiMsgElem = document.createElement('div');
    aiMsgElem.className = 'message ai-message';
    aiMsgElem.innerHTML = `<div class="msg-avatar">MR</div><div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
    chatMessages.appendChild(aiMsgElem);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    const bubble = aiMsgElem.querySelector('.msg-bubble');

    // --- 1. Check Local Cache First ---
    const cacheKey = `ai_cache_${text.toLowerCase()}`;
    const cachedResponse = localStorage.getItem(cacheKey);

    if (cachedResponse) {
      // Cached value is already escaped+processed HTML from a prior API call
      setTimeout(() => { bubble.innerHTML = cachedResponse; }, 500);
      return;
    }

    // --- 2. Call server-side proxy (keeps OpenAI key off the client) ---
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: aiGlobalContext },
            { role: 'user', content: text }
          ]
        })
      });
      const data = await response.json();
      if (data.choices && data.choices.length > 0) {
        let aiText = escapeHtml(data.choices[0].message.content);
        aiText = aiText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        aiText = aiText.replace(/```([^`]*)```/g, '<pre style="background:rgba(0,0,0,0.5);padding:10px;border-radius:5px;"><code>$1</code></pre>');

        // --- 3. Save to Local Cache ---
        localStorage.setItem(cacheKey, aiText);

        bubble.innerHTML = aiText;
      } else {
        throw new Error("Invalid API response");
      }
    } catch (e) {
      console.error(e);
      bubble.innerText = "Wow, my connection encountered an error! Perhaps the API limit was reached.";
    }
  }

  sendBtn.addEventListener('click', handleChatSend);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleChatSend();
  });

});
