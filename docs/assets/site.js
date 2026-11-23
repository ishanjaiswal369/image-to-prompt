/* Image to Prompt — site behaviour.
   Controls (menu, tabs, copy, navigation) work on their own. The motion layer — preloader,
   smooth scroll, pinned sequences, reveals — only runs when the visitor allows motion and
   GSAP + ScrollTrigger have loaded; otherwise the page renders in its final, static state. */
(() => {
  "use strict";

  const html = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const DESKTOP = "(min-width: 900px) and (min-height: 620px)";

  window.__siteReady = true;
  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  if (html.classList.contains("motion") && !hasGsap) html.classList.remove("motion", "is-loading");
  const animate = html.classList.contains("motion") && hasGsap;

  let lenis = null;
  let closeMenu = () => {};

  initOutput();
  initMenu();
  initNav();
  initAnchors();
  initFooterWord();
  initArch();

  if (!animate) {
    html.classList.remove("is-loading");
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  initLenis();
  initCursor();
  initReveals();
  initParallax();
  initDemo();
  initLenses();
  initMarquee();
  initCounters();
  runPreloader();
  if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());

  /* ------------------------------------------------------------------ output: tabs, JSON, copy */
  function initOutput() {
    const out = $("[data-output]");
    if (!out) return;

    const data = {};
    $$("[data-field]").forEach((f) => { data[f.dataset.field] = $(".field__text", f).textContent.trim(); });
    const promptEl = $("[data-prompt]");
    data.promptText = promptEl.textContent.trim().replace(/\s+/g, " ");
    const json = JSON.stringify(data, null, 2);

    const pre = $("[data-json]", out);
    pre.innerHTML = json
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"(\w+)":/g, '<span class="k">"$1"</span>:');

    const tabs = $$('[role="tab"]', out);
    const copyBtn = $("[data-copy]", out);
    const copyLabel = $("[data-copy-label]", out);
    const status = $("[data-copy-status]", out);
    let current = "prompt";

    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
      current = tab.dataset.tab;
      copyLabel.textContent = current === "json" ? "Copy JSON" : "Copy prompt";
      if (focus) tab.focus();
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t));
      t.addEventListener("keydown", (e) => {
        const map = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
        if (!(e.key in map)) return;
        e.preventDefault();
        select(tabs[(map[e.key] + tabs.length) % tabs.length], true);
      });
    });

    let timer;
    copyBtn.addEventListener("click", async () => {
      const ok = await copyText(current === "json" ? json : data.promptText);
      clearTimeout(timer);
      copyBtn.classList.toggle("is-done", ok);
      copyLabel.textContent = ok ? "Copied" : "Copy failed";
      status.textContent = ok ? (current === "json" ? "JSON copied to clipboard" : "Prompt copied to clipboard") : "Copy failed";
      timer = setTimeout(() => {
        copyBtn.classList.remove("is-done");
        copyLabel.textContent = current === "json" ? "Copy JSON" : "Copy prompt";
        status.textContent = "";
      }, 1800);
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* ------------------------------------------------------------------ mobile menu */
  function initMenu() {
    const btn = $("[data-menu-toggle]");
    const menu = $("[data-menu]");
    const label = $("[data-menu-label]");
    if (!btn || !menu) return;
    let open = false;

    const set = (v) => {
      open = v;
      btn.setAttribute("aria-expanded", String(v));
      label.textContent = v ? "Close" : "Menu";
      menu.classList.toggle("is-open", v);
      html.classList.toggle("menu-open", v);
      document.body.style.overflow = v ? "hidden" : "";
      if (lenis) (v ? lenis.stop() : lenis.start());
      if (v) setTimeout(() => { const a = $("a", menu); if (a) a.focus({ preventScroll: true }); }, 400);
    };
    closeMenu = () => { if (open) set(false); };

    btn.addEventListener("click", () => set(!open));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open) { set(false); btn.focus(); }
    });
    matchMedia("(min-width: 900px)").addEventListener("change", (e) => { if (e.matches) closeMenu(); });
  }

  /* ------------------------------------------------------------------ nav: hide/show, theme, active link, progress */
  function initNav() {
    const nav = $("[data-nav]");
    const bar = $("[data-progress]");
    const darks = $$('main [data-theme="dark"]');
    const links = $$("[data-nav-link]");
    const sections = links.map((l) => document.getElementById(l.dataset.navLink));
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const vh = window.innerHeight;
      const navMid = nav.offsetHeight / 2;

      nav.classList.toggle("is-scrolled", y > 8);
      if (!html.classList.contains("menu-open")) {
        if (y > lastY + 4 && y > vh * 0.6) nav.classList.add("is-hidden");
        else if (y < lastY - 4 || y < 40) nav.classList.remove("is-hidden");
      }
      lastY = y;

      nav.classList.toggle("is-dark", darks.some((s) => {
        const r = s.getBoundingClientRect();
        return r.top <= navMid && r.bottom >= navMid;
      }));

      const line = vh * 0.42;
      let active = -1;
      sections.forEach((s, i) => {
        if (!s) return;
        const r = s.getBoundingClientRect();
        if (r.top <= line && r.bottom > line) active = i;
      });
      links.forEach((l, i) => l.classList.toggle("is-active", i === active));

      const max = document.documentElement.scrollHeight - vh;
      if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  }

  /* ------------------------------------------------------------------ in-page anchors (smooth with Lenis) */
  function initAnchors() {
    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a || a.classList.contains("skip")) return;
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      const target = id === "#top" ? document.body : document.querySelector(id);
      if (!target) return;
      closeMenu();
      if (!lenis) return; // native smooth scroll via CSS
      e.preventDefault();
      lenis.scrollTo(id === "#top" ? 0 : target, { duration: 1.5 });
      history.replaceState(null, "", id);
    });
  }

  /* ------------------------------------------------------------------ footer wordmark: split + fit to width */
  function initFooterWord() {
    const el = $("[data-footer-word]");
    if (!el) return;
    const text = el.textContent.trim();
    el.textContent = "";
    [...text].forEach((ch, i) => {
      const s = document.createElement("span");
      s.textContent = ch === " " ? " " : ch;
      s.style.setProperty("--i", i);
      el.append(s);
    });
    const fit = () => {
      el.style.fontSize = "100px";
      const cs = getComputedStyle(el);
      const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const natural = [...el.children].reduce((sum, s) => sum + s.getBoundingClientRect().width, 0);
      if (natural > 0) el.style.fontSize = `${(100 * avail / natural) * 0.995}px`;
    };
    fit();
    let t;
    window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(fit, 120); });
    if (document.fonts) document.fonts.ready.then(fit);
  }

  /* ------------------------------------------------------------------ architecture connectors, drawn in real pixels */
  function initArch() {
    const map = $(".arch__map");
    const svg = $("[data-arch-lines]");
    if (!map || !svg) return;
    const [a, b, c, d] = ["a", "b", "c", "d"].map((k) => $(`.node--${k}`, map));
    const paths = $$("path", svg);
    // offset* ignores reveal transforms, so lines land where the cards settle
    const box = (el) => ({ l: el.offsetLeft, r: el.offsetLeft + el.offsetWidth, cy: el.offsetTop + el.offsetHeight / 2 });
    const draw = () => {
      if (getComputedStyle(svg).display === "none") return;
      const A = box(a), B = box(b), C = box(c), D = box(d);
      const fork = Math.round((B.r + C.l) / 2) + 0.5;
      svg.setAttribute("viewBox", `0 0 ${map.clientWidth} ${map.clientHeight}`);
      paths[0].setAttribute("d", `M${A.r} ${A.cy} H${B.l}`);
      paths[1].setAttribute("d", `M${B.r} ${B.cy} H${fork} V${C.cy} H${C.l}`);
      paths[2].setAttribute("d", `M${fork} ${B.cy} V${D.cy} H${D.l}`);
    };
    draw();
    let t;
    window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(draw, 120); });
    if (document.fonts) document.fonts.ready.then(draw);
  }

  /* ================================================================== motion layer */

  function initLenis() {
    if (!window.Lenis) return;
    lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }

  function runPreloader() {
    const pre = $(".preloader");
    const count = $("[data-preload-count]");
    const bar = $("[data-preload-bar]");
    const state = { v: 0 };
    gsap.timeline()
      .to(state, {
        v: 100, duration: 1.3, ease: "power2.inOut",
        onUpdate: () => {
          count.textContent = String(Math.round(state.v)).padStart(3, "0");
          bar.style.transform = `scaleX(${state.v / 100})`;
        },
      })
      .to(pre, { clipPath: "inset(0% 0% 100% 0%)", duration: 1.1, ease: "expo.inOut" }, "+=0.12")
      .add(() => html.classList.add("is-ready"), "-=0.8")
      .add(() => {
        html.classList.remove("is-loading");
        gsap.set(pre, { clearProps: "all" });
        if (lenis) lenis.start();
        ScrollTrigger.refresh();
      });
  }

  function initCursor() {
    if (!matchMedia("(pointer: fine)").matches) return;
    const c = $(".cursor");
    html.classList.add("has-cursor");
    let x = -100, y = -100, cx = x, cy = y;
    window.addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; c.classList.remove("is-hidden"); }, { passive: true });
    document.addEventListener("pointerover", (e) => {
      c.classList.toggle("is-hover", !!e.target.closest("a, button, [role='tab'], .frame"));
    });
    document.documentElement.addEventListener("pointerleave", () => c.classList.add("is-hidden"));
    gsap.ticker.add(() => {
      cx += (x - cx) * 0.2;
      cy += (y - cy) * 0.2;
      c.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    });
  }

  function initReveals() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-in");
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    $$("main [data-fade], main [data-lines], main [data-rule], footer [data-fade], footer [data-lines], .arch, [data-footer-word]")
      .filter((el) => !el.closest(".hero"))
      .forEach((el) => io.observe(el));
  }

  function initParallax() {
    gsap.to(".hero__figure", {
      y: () => -window.innerHeight * 0.1,
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true },
    });
  }

  function splitWords(el) {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = "";
    return words.map((w, i) => {
      const s = document.createElement("span");
      s.className = "w";
      s.textContent = w;
      el.append(s);
      if (i < words.length - 1) el.append(" ");
      return s;
    });
  }

  /* Pinned demonstration: Image → Analysis (five fields, markers on the image) → Prompt */
  function initDemo() {
    const stage = $("[data-demo]");
    if (!stage) return;
    const section = stage.closest(".demo");
    const words = splitWords($("[data-prompt]", stage));
    const mm = gsap.matchMedia();

    mm.add(DESKTOP, () => {
      section.classList.add("is-pinned");
      const markers = $$("[data-marker]", stage);
      const fields = $$(".field", stage);
      const fieldsWrap = $("[data-fields]", stage);
      const output = $("[data-output]", stage);
      const thirds = $("[data-thirds]", stage);
      const frame = $(".demo__figure .frame", stage);
      const steps = $$("[data-step]", stage);
      const countEl = $("[data-demo-count]", stage);
      const track = $("[data-demo-track]", stage);

      gsap.set(markers, { autoAlpha: 0, scale: 0.4 });
      gsap.set(fields, { autoAlpha: 0, y: 18 });
      gsap.set(output, { autoAlpha: 0, y: 24 });
      gsap.set(thirds, { autoAlpha: 0 });
      gsap.set(words, { opacity: 0.14 });
      gsap.set(frame, { clipPath: "inset(14% 14% 14% 14%)" });

      const FIELD_START = 0.9;
      const PROMPT_AT = FIELD_START + fields.length + 0.2;
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      tl.to(frame, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.85, ease: "power2.inOut" }, 0);
      fields.forEach((f, i) => {
        const t = FIELD_START + i;
        tl.to(markers[i], { autoAlpha: 1, scale: 1, duration: 0.45, ease: "power3.out" }, t);
        tl.to(f, { autoAlpha: 1, y: 0, duration: 0.6 }, t + 0.1);
        if (i === 1) tl.to(thirds, { autoAlpha: 1, duration: 0.5 }, t);
        if (i === 2) tl.to(thirds, { autoAlpha: 0, duration: 0.5 }, t);
      });
      tl.to(fieldsWrap, { autoAlpha: 0, y: -20, duration: 0.6 }, PROMPT_AT);
      tl.to(markers, { autoAlpha: 0.4, duration: 0.5 }, PROMPT_AT);
      tl.to(output, { autoAlpha: 1, y: 0, duration: 0.6 }, PROMPT_AT + 0.25);
      tl.to(words, { opacity: 1, duration: 0.25, stagger: { each: 1.5 / words.length } }, PROMPT_AT + 0.45);
      tl.to({}, { duration: 0.7 });
      const total = tl.duration();

      const sync = (p) => {
        const t = p * total;
        const shown = Math.max(0, Math.min(fields.length, Math.floor(t - FIELD_START - 0.3) + 1));
        const step = t < FIELD_START ? 0 : t < PROMPT_AT ? 1 : 2;
        steps.forEach((s, i) => {
          s.classList.toggle("is-active", i === step);
          s.classList.toggle("is-done", i < step);
        });
        countEl.textContent = String(shown).padStart(2, "0");
        track.style.transform = `scaleX(${p})`;
      };

      ScrollTrigger.create({
        trigger: stage,
        start: "top top",
        end: () => "+=" + Math.round(window.innerHeight * 2.4),
        pin: true,
        scrub: 0.7,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        animation: tl,
        onUpdate: (self) => sync(self.progress),
      });
      sync(0);

      return () => {
        section.classList.remove("is-pinned");
        steps.forEach((s) => s.classList.remove("is-active", "is-done"));
        countEl.textContent = "05";
        track.style.transform = "";
      };
    });
  }

  /* Pinned lenses: one oversized word at a time */
  function initLenses() {
    const root = $("[data-lenses]");
    if (!root) return;
    const stage = $(".lenses__stage", root);
    const mm = gsap.matchMedia();

    mm.add(DESKTOP, () => {
      root.classList.add("is-pinned");
      const items = $$("[data-lens]", root);
      const words = items.map((i) => $(".lens__word span", i));
      const bodies = items.map((i) => $(".lens__body", i));
      const idxs = items.map((i) => $(".lens__idx", i));
      const count = $("[data-lens-count]", root);

      gsap.set(words.slice(1), { yPercent: 150 });
      gsap.set(bodies.slice(1), { autoAlpha: 0, y: 24 });
      gsap.set(idxs.slice(1), { autoAlpha: 0 });

      const tl = gsap.timeline();
      for (let i = 0; i < items.length - 1; i++) {
        const t = i + 1;
        tl.to(words[i], { yPercent: -150, duration: 1, ease: "power3.inOut" }, t)
          .to(words[i + 1], { yPercent: 0, duration: 1, ease: "power3.inOut" }, t)
          .to(bodies[i], { autoAlpha: 0, y: -16, duration: 0.45 }, t)
          .to(bodies[i + 1], { autoAlpha: 1, y: 0, duration: 0.6 }, t + 0.45)
          .to(idxs[i], { autoAlpha: 0, duration: 0.3 }, t)
          .to(idxs[i + 1], { autoAlpha: 1, duration: 0.3 }, t + 0.5);
      }
      tl.to({}, { duration: 0.8 });
      const total = tl.duration();

      ScrollTrigger.create({
        trigger: stage,
        start: "top top",
        end: () => "+=" + Math.round(window.innerHeight * 2.8),
        pin: true,
        scrub: 0.7,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        animation: tl,
        onUpdate: (self) => {
          const t = self.progress * total;
          const current = Math.max(0, Math.min(items.length - 1, Math.floor(t + 0.5) - 1));
          count.textContent = String(current + 1).padStart(2, "0");
        },
      });

      return () => {
        root.classList.remove("is-pinned");
        count.textContent = "01";
      };
    });
  }

  function initMarquee() {
    $$("[data-marquee]").forEach((row) => {
      const dir = Number(row.dataset.marquee);
      gsap.fromTo(row,
        { xPercent: dir < 0 ? 0 : -28 },
        {
          xPercent: dir < 0 ? -28 : 0,
          ease: "none",
          scrollTrigger: { trigger: row.closest("section"), start: "top bottom", end: "bottom top", scrub: 0.5 },
        });
    });
  }

  function initCounters() {
    $$("[data-count-to]").forEach((el) => {
      const to = Number(el.dataset.countTo);
      el.textContent = "0";
      ScrollTrigger.create({
        trigger: el,
        start: "top 90%",
        once: true,
        onEnter: () => {
          const o = { v: 0 };
          gsap.to(o, { v: to, duration: 1.8, ease: "power3.out", onUpdate: () => { el.textContent = String(Math.round(o.v)); } });
        },
      });
    });
  }
})();
