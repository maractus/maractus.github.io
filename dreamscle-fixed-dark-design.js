(() => {
  "use strict";

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = document.body;
  const header = document.querySelector('#site-header');
  const year = document.querySelector('#year');
  if (year) year.textContent = new Date().getFullYear();

  const loader = document.querySelector('#site-loader');
  function hideLoader() {
    if (!loader) return;
    loader.classList.add('loader-hidden');
    setTimeout(() => loader.remove(), 850);
  }
  window.addEventListener('load', () => setTimeout(hideLoader, 900));
  setTimeout(hideLoader, 4200);

  const updateHeader = () => header?.classList.toggle('scrolled', window.scrollY > 24);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });
  document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

  document.querySelectorAll('.work-card').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--y', `${event.clientY - rect.top}px`);
    });
  });

  document.querySelectorAll('.magnetic').forEach((button) => {
    button.addEventListener('pointermove', (event) => {
      if (body.classList.contains('motion-paused') || prefersReducedMotion) return;
      const rect = button.getBoundingClientRect();
      const x = (event.clientX - rect.left - rect.width / 2) * 0.16;
      const y = (event.clientY - rect.top - rect.height / 2) * 0.16;
      button.style.transform = `translate(${x}px, ${y}px)`;
    });
    button.addEventListener('pointerleave', () => { button.style.transform = ''; });
  });

  initDreamscleCanvasParticles();

  function initDreamscleCanvasParticles() {
    const settings = {
      word: "dreamscle",
      textScale: 0.78,
      mobileTextScale: 0.86,
      particleSize: 5.8,
      mobileParticleSize: 4.6,
      particleAmount: 1200,
      mobileParticleAmount: 600,
      hardParticleCap: 1400,
      mobileHardParticleCap: 700,
      sampleStep: 7,
      noiseSeconds: 1.2,
      formSeconds: 3.2,
      holdSeconds: 2.0,
      disperseSeconds: 2.8,
      verticalPosition: 0.23,
      safePadding: 72,
      ...(window.DREAMSCLE_PARTICLE_SETTINGS || {})
    };

    const canvas = document.getElementById("webgl-bg");
    const toggleButton = document.querySelector(".motion-toggle");
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    const reduceMotion = prefersReducedMotion;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];
    let running = !reduceMotion;
    let startTime = performance.now();
    let raf = null;
    let pointerX = 0;
    let pointerY = 0;
    let pointerActive = false;

    const rand = (min, max) => min + Math.random() * (max - min);
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    function getParticleSize() {
      return window.innerWidth < 700 ? settings.mobileParticleSize : settings.particleSize;
    }

    function getTextScale() {
      return window.innerWidth < 700 ? settings.mobileTextScale : settings.textScale;
    }

    function getParticleAmount() {
      // This is the value you edit to reduce lag.
      // It is read every time particles rebuild, so changing window.DREAMSCLE_PARTICLE_SETTINGS
      // before this script loads will actually change the rendered particle count.
      const isMobile = window.innerWidth < 700;
      const requested = Number(isMobile ? settings.mobileParticleAmount : settings.particleAmount);
      const cap = Number(isMobile ? settings.mobileHardParticleCap : settings.hardParticleCap);
      return Math.max(150, Math.min(Math.floor(requested || 900), Math.floor(cap || requested || 900)));
    }

    function resizeCanvas() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuildParticles();
    }

    function buildTextTargets() {
      const off = document.createElement("canvas");
      const offCtx = off.getContext("2d", { willReadFrequently: true });
      const fontFamily = "Inter, Arial Black, Impact, sans-serif";
      const baseFontSize = 300;
      const padding = 260;

      offCtx.font = `900 ${baseFontSize}px ${fontFamily}`;
      offCtx.textAlign = "center";
      offCtx.textBaseline = "middle";
      const metrics = offCtx.measureText(settings.word);
      const rawWidth = Math.ceil(metrics.width);

      off.width = rawWidth + padding * 2;
      off.height = baseFontSize + padding * 2;
      offCtx.clearRect(0, 0, off.width, off.height);
      offCtx.font = `900 ${baseFontSize}px ${fontFamily}`;
      offCtx.textAlign = "center";
      offCtx.textBaseline = "middle";
      offCtx.fillStyle = "#fff";
      offCtx.fillText(settings.word, off.width / 2, off.height / 2);

      const image = offCtx.getImageData(0, 0, off.width, off.height);
      const data = image.data;
      const step = Math.max(3, settings.sampleStep);
      const points = [];
      let minX = off.width, minY = off.height, maxX = 0, maxY = 0;

      for (let y = 0; y < off.height; y += step) {
        for (let x = 0; x < off.width; x += step) {
          const alpha = data[(y * off.width + x) * 4 + 3];
          if (alpha > 64) {
            points.push({ x, y });
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      const textW = Math.max(1, maxX - minX);
      const textH = Math.max(1, maxY - minY);
      const safeW = Math.max(1, width - settings.safePadding * 2);
      const targetW = safeW * getTextScale();
      const scale = targetW / textW;
      const targetH = textH * scale;
      const centerX = width * 0.5;
      const centerY = clamp(height * settings.verticalPosition, settings.safePadding + targetH / 2, height - settings.safePadding - targetH / 2);

      return points.map((p) => ({
        x: centerX + (p.x - minX - textW / 2) * scale,
        y: centerY + (p.y - minY - textH / 2) * scale
      }));
    }

    function makeNoisePoint() {
      return {
        x: rand(-width * 0.05, width * 1.05),
        y: rand(-height * 0.05, height * 1.05)
      };
    }

    function rebuildParticles() {
      const targets = buildTextTargets();
      const maxParticles = Math.max(150, Math.floor(getParticleAmount()));
      let chosen = targets;
      if (targets.length > maxParticles) {
        // Evenly reduce the particle set so particleAmount is a real performance control.
        const stride = targets.length / maxParticles;
        chosen = [];
        for (let i = 0; i < maxParticles; i++) {
          chosen.push(targets[Math.min(targets.length - 1, Math.floor(i * stride))]);
        }
      }

      particles = chosen.map((target, i) => {
        const a = makeNoisePoint();
        const b = makeNoisePoint();
        const hueShift = i / Math.max(1, chosen.length - 1);
        return {
          startX: a.x,
          startY: a.y,
          targetX: target.x,
          targetY: target.y,
          endX: b.x,
          endY: b.y,
          wobble: rand(0, Math.PI * 2),
          speed: rand(0.6, 1.45),
          size: getParticleSize() * rand(0.65, 1.35),
          hueShift,
          noiseDriftX: rand(-22, 22),
          noiseDriftY: rand(-14, 14)
        };
      });
    }

    function getPhase(elapsed) {
      const noise = settings.noiseSeconds;
      const form = settings.formSeconds;
      const hold = settings.holdSeconds;
      const disperse = settings.disperseSeconds;
      const total = noise + form + hold + disperse;
      const t = elapsed % total;
      if (t < noise) return { name: "noise", progress: 0 };
      if (t < noise + form) return { name: "form", progress: (t - noise) / form };
      if (t < noise + form + hold) return { name: "hold", progress: 1 };
      return { name: "disperse", progress: (t - noise - form - hold) / disperse };
    }

    function drawParticle(p, x, y, phaseName, elapsed) {
      const pulse = Math.sin(elapsed * 2.8 * p.speed + p.wobble) * 0.5 + 0.5;
      const size = phaseName === "hold" ? p.size * (1.08 + pulse * 0.16) : p.size;
      const hot = Math.floor(255 - p.hueShift * 50);
      const green = Math.floor(230 - p.hueShift * 40);
      const blue = Math.floor(120 + p.hueShift * 135);
      ctx.shadowBlur = phaseName === "noise" ? 4 : 9;
      ctx.shadowColor = `rgba(${hot}, ${green}, ${blue}, 0.75)`;
      ctx.fillStyle = `rgba(${hot}, ${green}, ${blue}, ${phaseName === "noise" ? 0.72 : 0.95})`;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      const core = size * 0.48;
      ctx.shadowBlur = 0;
      ctx.fillStyle = phaseName === "noise" ? "rgba(255,255,255,.38)" : "rgba(255,255,255,.86)";
      ctx.fillRect(x - core / 2, y - core / 2, core, core);
    }

    function render(now) {
      if (!running && !reduceMotion) return;
      const elapsed = (now - startTime) / 1000;
      const phase = reduceMotion ? { name: "hold", progress: 1 } : getPhase(elapsed);
      ctx.clearRect(0, 0, width, height);

      if (phase.name === "form" || phase.name === "hold") {
        const opacity = phase.name === "hold" ? 0.55 : easeInOutCubic(phase.progress) * 0.45;
        const gradient = ctx.createRadialGradient(width * 0.5, height * settings.verticalPosition, 10, width * 0.5, height * settings.verticalPosition, width * 0.42);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${opacity * 0.28})`);
        gradient.addColorStop(0.35, `rgba(255, 60, 207, ${opacity * 0.22})`);
        gradient.addColorStop(0.72, `rgba(81, 215, 255, ${opacity * 0.14})`);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      for (const p of particles) {
        let x, y;
        if (phase.name === "noise") {
          const drift = elapsed * p.speed;
          x = p.startX + Math.sin(drift + p.wobble) * p.noiseDriftX;
          y = p.startY + Math.cos(drift * 1.15 + p.wobble) * p.noiseDriftY;
        } else if (phase.name === "form" || phase.name === "hold") {
          const t = phase.name === "hold" ? 1 : easeInOutCubic(phase.progress);
          x = p.startX + (p.targetX - p.startX) * t;
          y = p.startY + (p.targetY - p.startY) * t;
          if (phase.name === "hold") {
            x += Math.sin(elapsed * 2.2 + p.wobble) * 1.4;
            y += Math.cos(elapsed * 2.0 + p.wobble) * 1.2;
          }
        } else {
          const t = easeInOutCubic(phase.progress);
          x = p.targetX + (p.endX - p.targetX) * t;
          y = p.targetY + (p.endY - p.targetY) * t;
        }

        if (pointerActive) {
          const dx = x - pointerX;
          const dy = y - pointerY;
          const distSq = dx * dx + dy * dy;
          if (distSq < 11000) {
            const dist = Math.sqrt(distSq) || 1;
            const push = (1 - dist / 105) * 34;
            x += (dx / dist) * push;
            y += (dy / dist) * push;
          }
        }
        drawParticle(p, x, y, phase.name, elapsed);
      }
      if (running || reduceMotion) raf = requestAnimationFrame(render);
    }

    function start() {
      running = true;
      body.classList.remove('motion-paused');
      startTime = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(render);
    }

    function pause() {
      running = false;
      body.classList.add('motion-paused');
      cancelAnimationFrame(raf);
    }

    // Optional live control from the browser console:
    // setDreamscleParticleAmount(900)
    window.setDreamscleParticleAmount = function(amount) {
      const value = Math.max(150, Math.floor(Number(amount) || settings.particleAmount));
      settings.particleAmount = value;
      settings.mobileParticleAmount = Math.min(value, settings.mobileParticleAmount);
      rebuildParticles();
      if (!running && !reduceMotion) render(performance.now());
      return `Dreamscle particleAmount is now ${value}`;
    };

    window.addEventListener("load", () => {
      resizeCanvas();
      if (reduceMotion) {
        render(performance.now());
        toggleButton?.setAttribute("hidden", "true");
      } else {
        start();
      }
    });

    window.addEventListener("resize", () => {
      resizeCanvas();
      if (!running && !reduceMotion) render(performance.now());
    });

    canvas.addEventListener("pointermove", (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerActive = true;
    });
    canvas.addEventListener("pointerleave", () => { pointerActive = false; });

    toggleButton?.addEventListener("click", () => {
      if (running) {
        pause();
        toggleButton.textContent = "Resume motion";
        toggleButton.setAttribute("aria-pressed", "true");
      } else {
        start();
        toggleButton.textContent = "Pause motion";
        toggleButton.setAttribute("aria-pressed", "false");
      }
    });
  }
})();
