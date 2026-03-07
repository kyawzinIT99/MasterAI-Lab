document.addEventListener("DOMContentLoaded", () => {
  const isMobile = window.innerWidth <= 768;

  // 1. Lenis Smooth Scroll — desktop only (Lenis intercepts touch events and blocks scroll-back on mobile)
  let lenis = null;
  if (!isMobile) {
    lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    // On mobile without Lenis, drive ScrollTrigger from native scroll events
    window.addEventListener('scroll', () => ScrollTrigger.update(), { passive: true });
  }

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
      if (lenis) {
        lenis.scrollTo(target, { offset: 0, duration: 1.4, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
      } else {
        target.scrollIntoView({ behavior: 'smooth' });
      }
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

  // Contact form — POST to backend (Telegram notification), mailto fallback
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(contactForm);
      const name = fd.get('name') || '';
      const email = fd.get('email') || '';
      const message = fd.get('message') || '';
      const submitBtn = contactForm.querySelector('[type=submit]');

      submitBtn.textContent = 'Sending…';
      submitBtn.disabled = true;

      try {
        const resp = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, message })
        });
        if (resp.ok) {
          submitBtn.textContent = '✓ Sent!';
          contactForm.reset();
          setTimeout(() => { submitBtn.textContent = 'Send Message'; submitBtn.disabled = false; }, 3000);
        } else {
          throw new Error('server error');
        }
      } catch {
        // Fallback to mailto if backend unavailable
        const subject = encodeURIComponent(`Inquiry from ${name}`);
        const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`);
        window.open(`mailto:itsolutions.mm@gmail.com?subject=${subject}&body=${body}`, '_self');
        submitBtn.textContent = 'Send Message';
        submitBtn.disabled = false;
      }
    });
  }

  // 2. Lazy Frame Loading — only load frames near the current scroll position (desktop only)
  const FRAME_COUNT = 121;
  const INITIAL_LOAD = 20;
  const frames = new Array(FRAME_COUNT).fill(null);
  const frameRequested = new Set();
  let isLoaded = false;
  const loaderText = document.getElementById('loader-percent');
  const loaderBar = document.getElementById('loader-bar');

  function requestFrame(index) {
    if (index < 0 || index >= FRAME_COUNT) return;
    if (frameRequested.has(index)) return;
    frameRequested.add(index);
    const img = new Image();
    const num = String(index + 1).padStart(4, '0');
    img.onload = () => { frames[index] = img; };
    img.onerror = () => { frames[index] = null; frameRequested.delete(index); };
    img.src = `frames/frame_${num}.jpg?v=2`;
  }

  function loadFrameWindow(centerIndex) {
    for (let d = -5; d <= 25; d++) {
      const idx = (centerIndex + d + FRAME_COUNT) % FRAME_COUNT;
      requestFrame(idx);
    }
  }

  if (isMobile) {
    // Canvas is hidden on mobile — skip all frame downloads
    document.getElementById('loader').style.display = 'none';
    isLoaded = true;
    initRender();
  } else {
    // Load first INITIAL_LOAD frames immediately to allow site to start
    let initialLoaded = 0;
    for (let i = 0; i < INITIAL_LOAD; i++) {
      frameRequested.add(i);
      const img = new Image();
      const num = String(i + 1).padStart(4, '0');
      img.onload = () => {
        initialLoaded++;
        frames[i] = img;
        const p = Math.floor((initialLoaded / INITIAL_LOAD) * 100);
        loaderText.innerText = p + '%';
        loaderBar.style.width = p + '%';
        if (initialLoaded === INITIAL_LOAD && !isLoaded) { isLoaded = true; initRender(); }
      };
      img.onerror = () => {
        initialLoaded++;
        if (initialLoaded === INITIAL_LOAD && !isLoaded) { isLoaded = true; initRender(); }
      };
      img.src = `frames/frame_${num}.jpg?v=2`;
    }

    // Safety timeout: start after 5 seconds even if not all initial frames loaded
    setTimeout(() => { if (!isLoaded) { isLoaded = true; initRender(); } }, 5000);
  }

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
    const img = frames[index];
    if (!img || !img.naturalWidth) return;
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
    if (!isMobile) {
      gsap.to('#loader', { yPercent: -100, duration: 1.2, ease: "power4.inOut" });
    }

    const scrollContainer = document.getElementById('scroll-container');

    if (!isMobile) {
      resizeCanvas();
      drawFrame(0);
      currentFrame = 0;

      // Core Frame Scrubbing
      ScrollTrigger.create({
        trigger: scrollContainer,
        start: "top top",
        end: "bottom bottom",
        scrub: 1.5,
        onUpdate: (self) => {
          const loops = 4;
          const progress = self.progress;
          let index = Math.floor(progress * FRAME_COUNT * loops) % FRAME_COUNT;
          if (isNaN(index)) index = 0;
          loadFrameWindow(index);
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
          let op = 0;
          if (p > 62 && p < 70) {
            op = 0.85;
          }
          overlay.style.opacity = op;
        }
      });
    }

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
      const children = section.querySelectorAll('.section-label, .section-heading, .section-body, .cta-button, .stat');

      if (isMobile) {
        // On mobile: natural flow layout — no absolute positioning, no scroll triggers
        gsap.set(children, { clearProps: 'all' });
        return;
      }

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
      const target = parseFloat(el.dataset.value);
      const dec = parseInt(el.dataset.decimals || "0");

      if (isMobile) {
        // On mobile: trigger count-up when stat scrolls into view
        const observer = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting && el.innerText === "0") {
              gsap.to(el, { textContent: target, duration: 2, ease: "power1.out", snap: { textContent: dec === 0 ? 1 : 0.01 } });
              observer.unobserve(el);
            }
          });
        }, { threshold: 0.5 });
        observer.observe(el);
        return;
      }

      const section = el.closest('.scroll-section');
      const enter = parseFloat(section.dataset.enter) / 100;

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

    // === LIVE STUDENT COUNT ===
    fetch('/api/student-count').then(r => r.json()).then(d => {
      const el = document.getElementById('live-student-count');
      if (el && d.count > 0) {
        gsap.to({ val: 0 }, {
          val: d.count, duration: 2, ease: 'power1.out',
          onUpdate: function() { el.textContent = Math.floor(this.targets()[0].val); }
        });
      }
    }).catch(() => {});
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

      // Render Free Courses at ~76%
      renderFreeCoursesSection(freeData, 'ai-free-course-container', 76);

      const toolsRes = await fetch('data/AI%20Training%20Tools.json');
      const toolsData = await toolsRes.json();

      // Render Training Tools at ~85%
      renderTrainingToolsSection(toolsData, 'ai-training-tools-container', 85);

      // Render Portfolio at ~88%
      const portfolioRes = await fetch('data/portfolio.json');
      const portfolioData = await portfolioRes.json();
      renderPortfolioSection(portfolioData, 'portfolio-container', 88);

      // Render AI Pulse at ~92% — accessible via nav link, clear of Portfolio (88%) and Testimonials (93%)
      const pulseRes = await fetch('/api/ai-feed');
      const pulseData = await pulseRes.json();
      renderAIPulseSection(pulseData, 'ai-pulse-container', 92);

      // Auto-refresh AI Pulse every 60 minutes
      setInterval(async () => {
        try {
          const r = await fetch('/api/ai-feed?t=' + Date.now());
          const d = await r.json();
          renderAIPulseSection(d, 'ai-pulse-container', 92);
        } catch (e) {}
      }, 60 * 60 * 1000);

      // Setup reveal animations
      setupCardReveal();

      // Recalculate scroll positions after dynamic content is in the DOM
      ScrollTrigger.refresh();

    } catch (err) {
      console.error('Failed to load services.json:', err);
    }
  }

  function renderTrainingSection(section, containerId, scrollPct) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!isMobile) {
      container.style.top = `${scrollPct}%`;
      container.style.transform = 'translateY(-50%)';
    }

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

    if (!isMobile) {
      container.style.top = `${scrollPct}%`;
      container.style.transform = 'translateY(-50%)';
    }

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

  // Maps free-course topic keywords → Learning Hub course keys
  const _hubCourseMap = {
    n8n:        ['n8n', 'n 8 n', 'workflow automation'],
    makecom:    ['make.com', 'make com', 'integromat', 'make '],
    agentic:    ['agentic', 'rag', 'llm', 'langchain', 'agent', 'gpt', 'openai', 'chatgpt', 'chatbot', 'nlp', 'generative', 'machine learning', 'deep learning', 'neural'],
    cloud:      ['aws', 'gcp', 'azure', 'cloud', 'serverless', 'docker', 'kubernetes'],
    network:    ['network', 'ccna', 'routing', 'switching', 'cisco', 'sd-wan', 'firewall'],
    consulting: ['consulting', 'business ai', 'strategy', 'ai impact', 'ai for everyone'],
  };

  function _matchHubCourse(course) {
    const haystack = (course.title + ' ' + (course.topics || []).join(' ')).toLowerCase();
    for (const [key, keywords] of Object.entries(_hubCourseMap)) {
      if (keywords.some(kw => haystack.includes(kw))) return key;
    }
    return 'agentic'; // default to Agentic AI as the closest general AI course
  }

  function renderFreeCoursesSection(data, containerId, alignPercent) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!isMobile) container.style.top = `${alignPercent}%`;

    let html = `
      <div class="service-group-header">
        <div class="service-group-subtitle">Free Education</div>
        <h2 class="service-group-title">AI Course (Free)</h2>
        <p style="font-size:0.75rem;color:rgba(0,255,255,0.55);margin-top:0.5rem;letter-spacing:0.04em;">Watch the free courses below, then test your knowledge and earn a certificate in the <button onclick="openLearningHub()" style="background:none;border:none;color:#00ffff;font-size:0.75rem;text-decoration:underline;cursor:pointer;padding:0;">Learning Hub &#8599;</button></p>
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
        const hubKey = _matchHubCourse(course);
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
            <div style="margin-top: 1rem; display: flex; gap: 0.8rem; flex-wrap:wrap;">
              <a href="${course.course_url}" target="_blank" class="service-card-cta" style="border-color:#00ff00; color:#00ff00;">Course Link ↗</a>
              ${course.video_url ? `<a href="${course.video_url}" target="_blank" class="service-card-cta" style="border-color:#ffaa00; color:#ffaa00;">YouTube ↗</a>` : ''}
              <button onclick="openLearningHub('${hubKey}')" class="service-card-cta" style="border-color:#00cccc; color:#00cccc; background:rgba(0,204,204,0.06); cursor:pointer;">Practice &amp; Get Cert &#8599;</button>
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
    if (!isMobile) container.style.top = `${alignPercent}%`;

    let html = `
      <div class="service-group-header">
        <div class="service-group-subtitle">Software Setup</div>
        <h2 class="service-group-title">Training Tools</h2>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; padding:0 5vw 1.5rem;">
    `;

    data.tools.forEach(tool => {
      html += `
        <a href="${tool.download_url}" target="_blank" style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem 1rem; border:1px solid rgba(255,255,255,0.08); border-radius:4px; text-decoration:none; background:rgba(255,255,255,0.02);">
          <span style="font-family:var(--font-display); font-size:0.85rem; font-weight:700; color:#fff; text-transform:uppercase; letter-spacing:0.05em;">${tool.name}</span>
          <span style="font-size:0.6rem; color:#00ffff; letter-spacing:0.1em; text-transform:uppercase; white-space:nowrap;">${tool.difficulty} ↗</span>
        </a>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
  }

  function renderPortfolioSection(data, containerId, scrollPct) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!isMobile) {
      container.style.top = `${scrollPct}%`;
      container.style.transform = 'translateY(-50%)';
    }

    let html = `
      <div class="service-group-header">
        <div class="service-group-subtitle">${data.subtitle}</div>
        <h2 class="service-group-title">${data.title}</h2>
      </div>
    `;

    data.cases.forEach(c => {
      const metrics = c.metrics.map(m => `<span class="topic-pill">${m}</span>`).join('');
      html += `
        <div class="service-card visible" data-id="${c.id}">
          <div class="service-card-header">
            <div>
              <div class="service-card-label">${c.label}</div>
              <div class="service-card-name">${c.name}</div>
            </div>
          </div>
          <p class="service-card-desc" style="margin-top:0.5rem;">${c.description}</p>
          <div class="service-card-topics" style="margin-top:0.8rem;">${metrics}</div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function renderAIPulseSection(data, containerId, scrollPct) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!isMobile) {
      container.style.top = `${scrollPct}%`;
      container.style.transform = 'translateY(-50%)';
    }

    const allUpdates = (data.updates || []).slice(0, (data.frontend_usage && data.frontend_usage.display_limit) || 10);
    const updatedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const typeColor = {
      'AI Research': '#00ffff', 'AI Safety Research': '#a78bfa', 'AI Models': '#34d399',
      'Open AI Models': '#34d399', 'Generative AI': '#f472b6', 'AI Infrastructure': '#fbbf24',
      'AI Hardware': '#60a5fa', 'AI API': '#00ffff', 'AI Assistant': '#a78bfa', 'AI Model': '#00ffff',
    };

    // Build unique company list for filter buttons
    const companies = ['All', ...new Set(allUpdates.map(u => u.company))];

    const filterBtnStyle = (active) =>
      `font-size:0.58rem;text-transform:uppercase;letter-spacing:0.1em;padding:0.2rem 0.6rem;border-radius:2px;border:1px solid ${active ? '#00ffff' : 'rgba(255,255,255,0.15)'};background:${active ? 'rgba(0,255,255,0.1)' : 'transparent'};color:${active ? '#00ffff' : 'var(--text-muted)'};cursor:pointer;transition:all 0.2s;`;

    let html = `
      <div class="service-group-header">
        <div class="service-group-subtitle">027 / Industry Intelligence</div>
        <h2 class="service-group-title">AI Pulse</h2>
        <div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.12em;margin-top:-0.5rem;padding-left:5vw;">
          Live feed · auto-refreshes every 60min · last loaded ${updatedAt}
        </div>
      </div>
      <div style="padding:0.5rem 5vw 1rem;display:flex;flex-wrap:wrap;gap:0.4rem;" id="pulse-filters">
        ${companies.map((c, i) => `<button onclick="pulseFilter('${c}')" id="pf-${c.replace(/\s/g,'_')}" style="${filterBtnStyle(i===0)}">${c}</button>`).join('')}
      </div>
      <div id="pulse-feed" style="padding:0 5vw 1.5rem;">
    `;

    allUpdates.forEach(item => {
      const accentColor = typeColor[item.category] || '#00ffff';
      html += `
        <a href="${item.official_link}" target="_blank" data-company="${item.company}" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1.5rem;padding:1rem 0;border-bottom:1px solid rgba(255,255,255,0.05);text-decoration:none;">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.35rem;flex-wrap:wrap;">
              <span style="font-size:0.58rem;color:${accentColor};text-transform:uppercase;letter-spacing:0.15em;border:1px solid ${accentColor}40;padding:0.1rem 0.45rem;border-radius:2px;">${item.company}</span>
              <span style="font-size:0.58rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;">${item.release_type}</span>
            </div>
            <div style="font-family:var(--font-display);font-size:0.9rem;font-weight:700;color:#fff;line-height:1.2;margin-bottom:0.25rem;">${item.title}</div>
            <div style="font-size:0.78rem;color:var(--text-muted);line-height:1.5;">${item.digest}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;padding-top:0.1rem;">
            <div style="font-size:0.58rem;color:var(--text-muted);margin-bottom:0.3rem;white-space:nowrap;">${item.date}</div>
            <span style="font-size:0.62rem;color:${accentColor};letter-spacing:0.05em;">Read ↗</span>
          </div>
        </a>
      `;
    });

    html += `</div>
      <div style="padding:0.5rem 5vw 1rem;display:flex;flex-wrap:wrap;gap:0.4rem;">
        <span style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;margin-right:0.3rem;">Sources:</span>
        ${(data.sources || []).map(s => `<span style="font-size:0.58rem;color:var(--text-muted);border:1px solid rgba(255,255,255,0.08);padding:0.1rem 0.45rem;border-radius:2px;">${s.company}</span>`).join('')}
      </div>
      <div style="padding:0.8rem 5vw 1.5rem;border-top:1px solid rgba(255,255,255,0.05);">
        <div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:0.5rem;">📬 Get weekly digest by email — every Monday</div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <input id="pulse-email" type="email" placeholder="your@email.com" style="flex:1;min-width:160px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:3px;padding:0.45rem 0.7rem;color:#fff;font-size:0.78rem;outline:none;">
          <button onclick="pulseSubscribe()" style="background:rgba(0,255,255,0.08);border:1px solid rgba(0,255,255,0.4);color:#00ffff;padding:0.45rem 1rem;border-radius:3px;font-size:0.72rem;font-family:var(--font-display);text-transform:uppercase;letter-spacing:0.08em;cursor:pointer;white-space:nowrap;">Subscribe ↗</button>
        </div>
        <div id="pulse-sub-msg" style="font-size:0.62rem;margin-top:0.4rem;min-height:1em;"></div>
      </div>`;

    container.innerHTML = html;
  }

  // AI Pulse company filter — global so onclick can reach it
  window.pulseFilter = function(company) {
    const feed = document.getElementById('pulse-feed');
    if (!feed) return;
    feed.querySelectorAll('a[data-company]').forEach(row => {
      row.style.display = (company === 'All' || row.dataset.company === company) ? 'flex' : 'none';
    });
    document.querySelectorAll('#pulse-filters button').forEach(btn => {
      const active = btn.textContent === company;
      btn.style.borderColor = active ? '#00ffff' : 'rgba(255,255,255,0.15)';
      btn.style.background = active ? 'rgba(0,255,255,0.1)' : 'transparent';
      btn.style.color = active ? '#00ffff' : 'var(--text-muted)';
    });
  };

  // AI Pulse email subscription
  window.pulseSubscribe = async function() {
    const input = document.getElementById('pulse-email');
    const msg   = document.getElementById('pulse-sub-msg');
    if (!input || !msg) return;
    const email = input.value.trim();
    if (!email) { msg.style.color = '#ff6b6b'; msg.textContent = 'Please enter your email.'; return; }
    msg.style.color = 'var(--text-muted)';
    msg.textContent = 'Subscribing...';
    try {
      const r = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const d = await r.json();
      if (d.ok) {
        msg.style.color = '#00ffff';
        msg.textContent = '✓ Subscribed! You\'ll receive the digest every Monday.';
        input.value = '';
      } else {
        msg.style.color = '#ff6b6b';
        msg.textContent = d.error || 'Something went wrong.';
      }
    } catch {
      msg.style.color = '#ff6b6b';
      msg.textContent = 'Network error. Try again.';
    }
  };

  // Certificate PDF Generator — uses jsPDF (loaded from CDN)
  window.generateCertificate = function() {
    const name = document.getElementById('cert-name').value.trim();
    const course = document.getElementById('cert-course').value;
    if (!name) { alert('Please enter your full name.'); return; }
    if (!course) { alert('Please select a course.'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297, H = 210;

    // Background
    doc.setFillColor(6, 6, 15);
    doc.rect(0, 0, W, H, 'F');

    // Cyan border
    doc.setDrawColor(0, 255, 255);
    doc.setLineWidth(0.5);
    doc.rect(8, 8, W - 16, H - 16);
    doc.setLineWidth(0.2);
    doc.rect(11, 11, W - 22, H - 22);

    // Header label
    doc.setTextColor(0, 200, 200);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('IT SOLUTIONS MM  ·  AI AUTOMATION SOCIETY', W / 2, 30, { align: 'center' });

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text('CERTIFICATE OF COMPLETION', W / 2, 60, { align: 'center' });

    // Divider
    doc.setDrawColor(0, 255, 255);
    doc.setLineWidth(0.3);
    doc.line(60, 67, W - 60, 67);

    // Body text
    doc.setTextColor(180, 180, 200);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('This is to certify that', W / 2, 85, { align: 'center' });

    // Student name
    doc.setTextColor(0, 255, 255);
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.text(name, W / 2, 105, { align: 'center' });

    // Underline name
    const nameWidth = doc.getTextWidth(name);
    doc.setDrawColor(0, 255, 255);
    doc.setLineWidth(0.2);
    doc.line((W - nameWidth) / 2, 108, (W + nameWidth) / 2, 108);

    // Course text
    doc.setTextColor(180, 180, 200);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('has successfully completed', W / 2, 122, { align: 'center' });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(course, W / 2, 136, { align: 'center' });

    // Date & issuer
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.setTextColor(120, 120, 150);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Issued: ${dateStr}`, W / 2, 158, { align: 'center' });

    // Signature line
    doc.setDrawColor(100, 100, 130);
    doc.setLineWidth(0.2);
    doc.line(W / 2 - 35, 178, W / 2 + 35, 178);
    doc.setTextColor(100, 100, 130);
    doc.setFontSize(8);
    doc.text('MR. KYAW ZIN TUN', W / 2, 183, { align: 'center' });
    doc.text('Founder · IT Solutions MM', W / 2, 188, { align: 'center' });

    // Footer
    doc.setTextColor(60, 60, 80);
    doc.setFontSize(7);
    doc.text('itsolutions.mm@gmail.com  ·  t.me/MaterAITraining_bot  ·  wa.me/66949567820', W / 2, 198, { align: 'center' });

    doc.save(`Certificate_${name.replace(/\s+/g, '_')}_${course.split(' ')[0]}.pdf`);
    document.getElementById('cert-modal').style.display = 'none';
  };

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
      if (lenis) {
        lenis.scrollTo(targetY, { duration: 1.2 });
      } else {
        window.scrollTo({ top: targetY, behavior: 'smooth' });
      }
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
1. Keep answers to 2-3 sentences maximum to save API cost.
2. ONLY share contact details (Telegram/WhatsApp/Email) when the user explicitly asks how to contact us, requests human assistance, asks about pricing, or asks to enroll. Do NOT include contact info in every reply.
3. When sharing contact, list all three: Telegram @MaterAITraining_bot, WhatsApp wa.me/66949567820, and Email itsolutions.mm@gmail.com.
4. If asked ANYTHING unrelated to AI, tech, coding, automation, or cloud — decline in exactly one sentence: "I only assist with AI and automation topics."
5. Be friendly, confident, and professional.
6. LANGUAGE: Detect the user's language automatically. If the user writes in Burmese (Myanmar script), reply entirely in Burmese. If in English, reply in English. Always match the user's language.

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

  // Chatbot memory — name stored in localStorage across sessions
  let userName = localStorage.getItem('ai_user_name') || '';
  let awaitingName = false;

  function applyUserName(name) {
    userName = name.trim();
    localStorage.setItem('ai_user_name', userName);
    // Inject name into system context so AI addresses user by name
    aiGlobalContext = aiGlobalContext.replace('--- PLATFORM KNOWLEDGE BASE ---',
      `USER NAME: ${userName}. Greet them by name on first reply and occasionally use their name naturally.\n\n--- PLATFORM KNOWLEDGE BASE ---`);
  }

  if (userName) applyUserName(userName);

  clearBtn.addEventListener('click', () => {
    localStorage.removeItem('chat_history');
    localStorage.removeItem('ai_user_name');
    userName = '';
    awaitingName = false;
    chatMessages.innerHTML = `
      <div class="message ai-message">
        <div class="msg-avatar">MR</div>
        <div class="msg-bubble">Chat cleared. What's your name? I'd love to know who I'm speaking with!</div>
      </div>`;
    awaitingName = true;
  });

  // Toggle Chat
  chatToggle.addEventListener('click', () => {
    chatWindow.classList.toggle('hidden');
    if (!chatWindow.classList.contains('hidden')) {
      chatInput.focus();
      if (!chatWindow.dataset.historyLoaded) {
        loadChatHistory();
        chatWindow.dataset.historyLoaded = '1';
        // If no name and no history — ask for name
        if (!userName && chatMessages.children.length === 0) {
          addMessage("Hello! 👋 I'm the IT Solutions MM AI Brain. What's your name?", 'ai', false);
          awaitingName = true;
        } else if (userName) {
          // Returning user — greet by name if no history loaded
          if (chatMessages.children.length === 0) {
            addMessage(`Welcome back, ${userName}! How can I help you today?`, 'ai', false);
          }
        }
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

    // If awaiting name — capture it, greet, and exit
    if (awaitingName) {
      awaitingName = false;
      applyUserName(text);
      addMessage(text, 'user');
      chatInput.value = '';
      addMessage(`Nice to meet you, ${userName}! 🙌 How can I help you with AI, automation, or cloud today?`, 'ai');
      return;
    }

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

  // ===== LEARNING HUB =====
  let hubData = null;
  let hubCurrentCourse = null;
  let hubQuizState = {};

  // Block wheel events from reaching Lenis when hub modal inner box is scrolled
  const _hubInner = document.querySelector('#hub-modal > div');
  if (_hubInner) {
    _hubInner.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  }

  // Load quiz data once
  fetch('/data/quiz.json')
    .then(r => r.json())
    .then(d => { hubData = d.courses; })
    .catch(() => {});

  window.openLearningHub = function(courseKey) {
    const modal = document.getElementById('hub-modal');
    if (!modal) return;
    // Stop Lenis so wheel events go to the modal's inner scrollable box
    if (lenis) lenis.stop();
    document.body.style.overflow = 'hidden';
    modal.style.display = 'flex';
    // Find inner scrollable box and reset its scroll, not the modal overlay
    const inner = modal.querySelector('div');
    if (inner) inner.scrollTop = 0;
    _hubShowStep('courses');
    _hubShowResumeBanner();
    // If a specific course was requested (e.g. from free course card), go straight there
    if (courseKey && hubData && hubData[courseKey]) {
      selectHubCourse(courseKey);
    }
  };

  window.closeHub = function() {
    const modal = document.getElementById('hub-modal');
    if (modal) modal.style.display = 'none';
    if (lenis) lenis.start();
    document.body.style.overflow = '';
  };

  // Show a "Welcome back — resume" banner if user has in-progress work
  function _hubShowResumeBanner() {
    const banner = document.getElementById('hub-resume-banner');
    if (!banner) return;
    const lastCourse = localStorage.getItem('hub_last_course');
    if (!lastCourse || !hubData || !hubData[lastCourse]) {
      banner.style.display = 'none';
      return;
    }
    const saved = JSON.parse(localStorage.getItem(`hub_prog_${lastCourse}`) || '[]');
    if (saved.length === 0) { banner.style.display = 'none'; return; }
    const total  = hubData[lastCourse].modules.length;
    const pct    = Math.round((saved.length / total) * 100);
    const title  = hubData[lastCourse].title || lastCourse;
    banner.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
        <div>
          <div style="font-size:0.55rem;color:#00cccc;text-transform:uppercase;letter-spacing:0.18em;margin-bottom:0.25rem;">Welcome back &#9654;</div>
          <div style="font-size:0.85rem;color:#fff;font-weight:600;">${title}</div>
          <div style="font-size:0.65rem;color:rgba(200,200,230,0.45);margin-top:0.15rem;">${pct}% modules complete · continue where you left off</div>
        </div>
        <button onclick="selectHubCourse('${lastCourse}')"
          style="flex-shrink:0;padding:0.55rem 1.2rem;background:linear-gradient(135deg,rgba(0,255,255,0.18),rgba(0,255,255,0.07));border:1px solid rgba(0,255,255,0.45);color:#00ffff;font-family:var(--font-display);font-size:0.7rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;border-radius:4px;cursor:pointer;">
          Resume &#8594;
        </button>
      </div>`;
    banner.style.display = 'block';
  }

  function _hubShowStep(step) {
    ['courses', 'learn', 'quiz', 'results'].forEach(s => {
      const el = document.getElementById(`hub-step-${s}`);
      if (el) el.style.display = 'none';
    });
    const el = document.getElementById(`hub-step-${step}`);
    if (el) el.style.display = 'block';
  }

  let _hubVideoIdx = null;   // which module is being watched

  window.selectHubCourse = function(courseKey) {
    if (!hubData || !hubData[courseKey]) return;
    hubCurrentCourse = courseKey;
    localStorage.setItem('hub_last_course', courseKey);
    _quizAutoOpened = false;  // reset so quiz can auto-open once user reaches 75%
    const course = hubData[courseKey];

    const saved = JSON.parse(localStorage.getItem(`hub_prog_${courseKey}`) || '[]');
    const moduleHTML = course.modules.map((m, i) => {
      const title    = typeof m === 'string' ? m : m.title;
      const videoUrl = typeof m === 'string' ? '' : (m.video_url || '');
      const watched  = saved.includes(i);
      const safetitle = title.replace(/'/g, "\\'");
      const watchBtn = videoUrl
        ? `<button class="hub-watch-btn${watched ? ' watched' : ''}"
                  onclick="openHubVideo(${i},'${videoUrl}','${safetitle}')">
            ${watched ? '&#10003; Watched' : '&#9654; Watch'}
           </button>`
        : `<button class="hub-watch-btn" disabled style="opacity:0.3;cursor:default;pointer-events:none;">Coming Soon</button>`;
      return `
        <div class="hub-mod-item${watched ? ' checked' : ''}" data-idx="${i}">
          <span class="hub-check-box"></span>
          <span class="hub-mod-label">${title}</span>
          ${watchBtn}
        </div>`;
    }).join('');

    document.getElementById('hub-course-title').textContent = course.title;
    document.getElementById('hub-module-list').innerHTML = moduleHTML;
    _hubUpdateProgress(courseKey);
    _hubShowStep('learn');
  };

  // Open the video modal for a module
  window.openHubVideo = function(idx, videoUrl, title) {
    _hubVideoIdx = idx;
    const modal   = document.getElementById('hub-video-modal');
    const iframe  = document.getElementById('hub-video-iframe');
    const noVideo = document.getElementById('hub-no-video');
    const titleEl = document.getElementById('hub-video-title');

    if (titleEl) titleEl.textContent = title;

    const markArea = document.getElementById('hub-mark-btn-area');
    if (videoUrl) {
      // Append ?rel=0&modestbranding=1&enablejsapi=1 for clean embed
      const src = videoUrl.includes('?') ? videoUrl + '&rel=0' : videoUrl + '?rel=0&modestbranding=1';
      if (iframe)   { iframe.src = src; iframe.style.display = 'block'; }
      if (noVideo)  noVideo.style.display = 'none';
      if (markArea) markArea.style.display = 'flex';
    } else {
      if (iframe)   { iframe.src = ''; iframe.style.display = 'none'; }
      if (noVideo)  noVideo.style.display = 'flex';
      if (markArea) markArea.style.display = 'none';
    }

    if (modal) modal.style.display = 'flex';
  };

  window.closeHubVideo = function() {
    const modal  = document.getElementById('hub-video-modal');
    const iframe = document.getElementById('hub-video-iframe');
    if (iframe) iframe.src = '';   // stops video playback
    if (modal)  modal.style.display = 'none';
  };

  // Mark current video's module as watched
  window.markModuleWatched = function() {
    if (_hubVideoIdx === null || !hubCurrentCourse) return;
    const key  = `hub_prog_${hubCurrentCourse}`;
    let saved  = JSON.parse(localStorage.getItem(key) || '[]');
    if (!saved.includes(_hubVideoIdx)) saved.push(_hubVideoIdx);
    localStorage.setItem(key, JSON.stringify(saved));

    // Update the row in the list
    const row = document.querySelector(`.hub-mod-item[data-idx="${_hubVideoIdx}"]`);
    if (row) {
      row.classList.add('checked');
      const btn = row.querySelector('.hub-watch-btn');
      if (btn) { btn.classList.add('watched'); btn.innerHTML = '&#10003; Watched'; }
    }

    _hubUpdateProgress(hubCurrentCourse);
    closeHubVideo();
  };

  let _quizAutoOpened = false;  // prevent repeated auto-open within same session

  function _hubUpdateProgress(courseKey) {
    if (!hubData) return;
    const total = hubData[courseKey].modules.length;
    const saved = JSON.parse(localStorage.getItem(`hub_prog_${courseKey}`) || '[]');
    const pct   = Math.round((saved.length / total) * 100);

    const pctEl   = document.getElementById('hub-learn-pct');
    const barEl   = document.getElementById('hub-learn-bar');
    const quizBtn = document.getElementById('hub-quiz-start-btn');

    if (pctEl) pctEl.textContent  = pct + '%';
    if (barEl) barEl.style.width  = pct + '%';

    const locked = pct < 75;
    if (quizBtn) {
      quizBtn.disabled      = locked;
      quizBtn.style.opacity = locked ? '0.35' : '1';
      quizBtn.style.cursor  = locked ? 'not-allowed' : 'pointer';
      quizBtn.title = locked
        ? `Complete at least 75% of modules to unlock the quiz (${pct}% done)`
        : 'Start the quiz';
    }

    // Auto-open quiz when user crosses 75% threshold for the first time
    if (!locked && !_quizAutoOpened) {
      _quizAutoOpened = true;
      if (quizBtn) {
        // Flash the button to draw attention, then scroll it into view
        quizBtn.style.transition = 'box-shadow 0.3s, opacity 0.3s';
        quizBtn.style.boxShadow  = '0 0 0 3px rgba(0,255,255,0.5)';
        quizBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          quizBtn.style.boxShadow = 'none';
          // Auto-start quiz after a brief pause so user sees they've unlocked it
          setTimeout(() => startHubQuiz(), 1200);
        }, 800);
      }
    }
  }

  window.startHubQuiz = function() {
    if (!hubData || !hubCurrentCourse) return;
    // Shuffle full bank (15 questions) and pick 10 — different every attempt
    const allQ = hubData[hubCurrentCourse].questions.slice();
    for (let i = allQ.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQ[i], allQ[j]] = [allQ[j], allQ[i]];
    }
    hubQuizState = {
      currentQ:  0,
      answers:   [],
      questions: allQ.slice(0, 10)   // 10 random questions each session
    };
    _hubRenderQuestion();
    _hubShowStep('quiz');
  };

  function _hubRenderQuestion() {
    const { currentQ, questions } = hubQuizState;
    if (currentQ >= questions.length) { _hubFinishQuiz(); return; }

    const q = questions[currentQ];
    const optHTML = q.options.map((opt, i) =>
      `<button class="hub-opt-btn" onclick="hubSelectAnswer(${i})">${opt}</button>`
    ).join('');

    const qnum  = document.getElementById('hub-q-num');
    const qtext = document.getElementById('hub-q-text');
    const qopts = document.getElementById('hub-q-options');
    const qbar  = document.getElementById('hub-q-bar');

    if (qnum)  qnum.textContent  = `Question ${currentQ + 1} of ${questions.length}`;
    if (qtext) qtext.textContent = q.question;
    if (qopts) qopts.innerHTML   = optHTML;
    if (qbar)  qbar.style.width  = `${(currentQ / questions.length) * 100}%`;
  }

  window.hubSelectAnswer = function(idx) {
    const { currentQ, questions } = hubQuizState;
    const q = questions[currentQ];
    hubQuizState.answers.push({ selected: idx, correct: q.correct });

    document.querySelectorAll('.hub-opt-btn').forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.correct)                 btn.classList.add('hub-opt-correct');
      if (i === idx && idx !== q.correct)  btn.classList.add('hub-opt-wrong');
    });

    setTimeout(() => {
      hubQuizState.currentQ++;
      _hubRenderQuestion();
    }, 750);
  };

  function _hubFinishQuiz() {
    const { answers, questions } = hubQuizState;
    const correct     = answers.filter(a => a.selected === a.correct).length;
    const quizPct     = Math.round((correct / questions.length) * 100);
    const course      = hubData[hubCurrentCourse];
    const saved       = JSON.parse(localStorage.getItem(`hub_prog_${hubCurrentCourse}`) || '[]');
    const learningPct = Math.round((saved.length / course.modules.length) * 100);
    const finalScore  = Math.round((learningPct * 0.75) + (quizPct * 0.25));
    const passed      = finalScore >= 70;

    document.getElementById('hub-res-score').textContent    = finalScore + '%';
    document.getElementById('hub-res-learning').textContent = learningPct + '%';
    document.getElementById('hub-res-quiz').textContent     = quizPct + '%';
    document.getElementById('hub-res-course').textContent   = course.title;

    const statusEl = document.getElementById('hub-res-status');
    if (statusEl) {
      statusEl.textContent = passed
        ? 'Congratulations! You passed. Your certificate is ready below.'
        : `Keep going — you need 70% to pass. Current score: ${finalScore}%. Retake the quiz anytime.`;
      statusEl.style.color = passed ? '#00ffff' : '#ff8c42';
    }

    const certSection = document.getElementById('hub-cert-section');
    if (certSection) certSection.style.display = passed ? 'block' : 'none';

    window._hubCertPayload = {
      learningPct, quizPct, finalScore,
      course: course.title, courseKey: hubCurrentCourse
    };
    _hubShowStep('results');
  }

  window.generateHubCert = async function() {
    const nameEl  = document.getElementById('hub-cert-name');
    const emailEl = document.getElementById('hub-cert-email');
    const btn     = document.getElementById('hub-cert-btn');
    const name    = nameEl  ? nameEl.value.trim()  : '';
    const email   = emailEl ? emailEl.value.trim() : '';

    if (!name)                          { alert('Please enter your full name.'); return; }
    if (!email || !email.includes('@')) { alert('Please enter a valid email.');  return; }

    const d = window._hubCertPayload;
    if (!d) return;

    if (btn) { btn.textContent = 'Generating\u2026'; btn.disabled = true; }

    // 1. PDF download via jsPDF
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = 297, H = 210;

      doc.setFillColor(6, 6, 15); doc.rect(0, 0, W, H, 'F');
      doc.setDrawColor(0, 255, 255); doc.setLineWidth(0.5); doc.rect(8, 8, W-16, H-16);
      doc.setLineWidth(0.2); doc.rect(11, 11, W-22, H-22);

      doc.setTextColor(0, 200, 200); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text('IT SOLUTIONS MM  \xB7  AI AUTOMATION SOCIETY', W/2, 30, { align: 'center' });

      doc.setTextColor(255, 255, 255); doc.setFontSize(28); doc.setFont('helvetica', 'bold');
      doc.text('CERTIFICATE OF COMPLETION', W/2, 60, { align: 'center' });

      doc.setDrawColor(0, 255, 255); doc.setLineWidth(0.3); doc.line(60, 67, W-60, 67);

      doc.setTextColor(180, 180, 200); doc.setFontSize(11); doc.setFont('helvetica', 'normal');
      doc.text('This is to certify that', W/2, 85, { align: 'center' });

      doc.setTextColor(0, 255, 255); doc.setFontSize(26); doc.setFont('helvetica', 'bold');
      doc.text(name, W/2, 105, { align: 'center' });
      const nw = doc.getTextWidth(name);
      doc.setDrawColor(0, 255, 255); doc.setLineWidth(0.2);
      doc.line((W-nw)/2, 108, (W+nw)/2, 108);

      doc.setTextColor(180, 180, 200); doc.setFontSize(11); doc.setFont('helvetica', 'normal');
      doc.text('has successfully completed', W/2, 122, { align: 'center' });

      doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
      doc.text(d.course, W/2, 136, { align: 'center' });

      doc.setTextColor(0, 200, 200); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text(`Score: ${d.finalScore}%  (Learning: ${d.learningPct}%  |  Quiz: ${d.quizPct}%)`, W/2, 150, { align: 'center' });

      const ds = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      doc.setTextColor(120, 120, 150); doc.setFontSize(9);
      doc.text(`Issued: ${ds}`, W/2, 162, { align: 'center' });

      doc.setDrawColor(100, 100, 130); doc.setLineWidth(0.2); doc.line(W/2-35, 178, W/2+35, 178);
      doc.setTextColor(100, 100, 130); doc.setFontSize(8);
      doc.text('MR. KYAW ZIN TUN', W/2, 183, { align: 'center' });
      doc.text('Founder \xB7 IT Solutions MM', W/2, 188, { align: 'center' });

      doc.setTextColor(60, 60, 80); doc.setFontSize(7);
      doc.text('itsolutions.mm@gmail.com  \xB7  t.me/MaterAITraining_bot  \xB7  wa.me/66949567820', W/2, 198, { align: 'center' });

      doc.save(`Certificate_${name.replace(/\s+/g, '_')}_${d.courseKey}.pdf`);
    } catch(e) { console.error('PDF error:', e); }

    // 2. Online digital certificate via backend
    try {
      const resp = await fetch('/api/certificate/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email,
          course:         d.course,
          course_key:     d.courseKey,
          score:          d.finalScore,
          learning_score: d.learningPct,
          quiz_score:     d.quizPct
        })
      });
      const result = await resp.json();
      if (result.cert_url) {
        const linkEl      = document.getElementById('hub-online-link');
        const linkSection = document.getElementById('hub-link-section');
        if (linkEl)      { linkEl.href = result.cert_url; linkEl.textContent = result.cert_url; }
        if (linkSection) linkSection.style.display = 'block';
      }
    } catch(e) { console.error('Cert API error:', e); }

    if (btn) btn.textContent = '\u2713 Certificate Generated!';
  };

});
