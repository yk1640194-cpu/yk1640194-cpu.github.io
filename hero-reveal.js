(() => {
  'use strict';

  const background = document.querySelector('[data-hero-reveal-background]');
  const revealLayer = document.querySelector('[data-hero-reveal-layer]');
  const grid = document.querySelector('.hero-grid');
  const desktop = window.matchMedia('(min-width: 901px)');
  const coarsePointer = window.matchMedia('(hover: none), (pointer: coarse)');

  if (!background || !revealLayer) return;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const mouse = { x: 0, y: 0 };
  const smooth = { x: 0, y: 0 };
  const gridOffset = { x: 0, y: 0 };
  let radius = 240;
  let frameId = 0;
  let frameTick = 0;
  let rectW = 1;
  let rectH = 1;

  function resize() {
    const rect = background.getBoundingClientRect();
    rectW = Math.max(1, rect.width);
    rectH = Math.max(1, rect.height);
    // Cap the mask resolution on touch devices so the per-frame mask stays cheap.
    const cap = coarsePointer.matches ? 600 : Infinity;
    const scale = Math.min(1, cap / Math.max(rectW, rectH));
    canvas.width = Math.max(1, Math.round(rectW * scale));
    canvas.height = Math.max(1, Math.round(rectH * scale));
    radius = Math.round(Math.min(420, Math.max(160, canvas.width * 0.16)));
    if (mouse.x === 0 && mouse.y === 0) {
      mouse.x = canvas.width * 0.62;
      mouse.y = canvas.height * 0.44;
      smooth.x = mouse.x;
      smooth.y = mouse.y;
    }
  }

  function trackPointer(event) {
    const rect = background.getBoundingClientRect();
    mouse.x = Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * (canvas.width / rectW)));
    mouse.y = Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * (canvas.height / rectH)));
  }

  function draw() {
    frameTick += 1;
    // Desktop: render every frame (unchanged behaviour).
    // Touch: render every other frame to keep scrolling smooth.
    if ((desktop.matches || !coarsePointer.matches || frameTick % 2 === 0) && canvas.width > 1) {
      smooth.x += (mouse.x - smooth.x) * 0.1;
      smooth.y += (mouse.y - smooth.y) * 0.1;

      const targetGridX = (smooth.x / canvas.width - 0.5) * 16;
      const targetGridY = (smooth.y / canvas.height - 0.5) * 16;
      gridOffset.x += (targetGridX - gridOffset.x) * 0.06;
      gridOffset.y += (targetGridY - gridOffset.y) * 0.06;
      if (grid) grid.style.transform = `translate(${gridOffset.x.toFixed(2)}px, ${gridOffset.y.toFixed(2)}px) scale(1.02)`;

      context.clearRect(0, 0, canvas.width, canvas.height);
      const gradient = context.createRadialGradient(smooth.x, smooth.y, 0, smooth.x, smooth.y, radius);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.4, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.6, 'rgba(255,255,255,0.75)');
      gradient.addColorStop(0.75, 'rgba(255,255,255,0.4)');
      gradient.addColorStop(0.88, 'rgba(255,255,255,0.12)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);

      const mask = `url(${canvas.toDataURL()})`;
      revealLayer.style.maskImage = mask;
      revealLayer.style.webkitMaskImage = mask;
      revealLayer.style.maskSize = '100% 100%';
      revealLayer.style.webkitMaskSize = '100% 100%';
    }
    frameId = window.requestAnimationFrame(draw);
  }

  window.addEventListener('pointermove', trackPointer, { passive: true });
  window.addEventListener('pointerdown', trackPointer, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pagehide', () => window.cancelAnimationFrame(frameId), { once: true });
  resize();
  frameId = window.requestAnimationFrame(draw);
})();
