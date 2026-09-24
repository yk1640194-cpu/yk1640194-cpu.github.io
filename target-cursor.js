(function () {
  const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (!pointerQuery.matches) return;

  const targetSelector = [
    'a[href]',
    'button:not([disabled])',
    '[role="button"]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '.work-card',
  ].join(',');

  const cursor = document.createElement('div');
  cursor.className = 'target-cursor';
  cursor.dataset.targetCursor = '';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.innerHTML = `
    <span class="target-cursor-dot"></span>
    <span class="target-cursor-frame" data-target-cursor-frame data-targeting="false">
      <i class="target-cursor-corner target-cursor-corner--tl"></i>
      <i class="target-cursor-corner target-cursor-corner--tr"></i>
      <i class="target-cursor-corner target-cursor-corner--br"></i>
      <i class="target-cursor-corner target-cursor-corner--bl"></i>
    </span>`;
  document.body.appendChild(cursor);
  document.documentElement.classList.add('has-target-cursor');

  const dot = cursor.querySelector('.target-cursor-dot');
  const frame = cursor.querySelector('[data-target-cursor-frame]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const dotPosition = { ...pointer };
  const frameBox = { x: pointer.x - 14, y: pointer.y - 14, width: 28, height: 28 };
  let activeTarget = null;

  function lerp(from, to, amount) {
    return from + (to - from) * amount;
  }

  function desiredFrame() {
    if (activeTarget && activeTarget.isConnected) {
      const rect = activeTarget.getBoundingClientRect();
      return { x: rect.left - 5, y: rect.top - 5, width: rect.width + 10, height: rect.height + 10 };
    }
    return { x: pointer.x - 14, y: pointer.y - 14, width: 28, height: 28 };
  }

  function render() {
    const dotEase = reducedMotion ? 1 : 0.42;
    const frameEase = reducedMotion ? 1 : activeTarget ? 0.34 : 0.28;
    const desired = desiredFrame();

    dotPosition.x = lerp(dotPosition.x, pointer.x, dotEase);
    dotPosition.y = lerp(dotPosition.y, pointer.y, dotEase);
    frameBox.x = lerp(frameBox.x, desired.x, frameEase);
    frameBox.y = lerp(frameBox.y, desired.y, frameEase);
    frameBox.width = lerp(frameBox.width, desired.width, frameEase);
    frameBox.height = lerp(frameBox.height, desired.height, frameEase);

    dot.style.transform = `translate3d(${dotPosition.x}px, ${dotPosition.y}px, 0)`;
    frame.style.left = `${frameBox.x}px`;
    frame.style.top = `${frameBox.y}px`;
    frame.style.width = `${frameBox.width}px`;
    frame.style.height = `${frameBox.height}px`;
    requestAnimationFrame(render);
  }

  function setTarget(target) {
    if (target === activeTarget) return;
    activeTarget = target;
    const targeting = Boolean(target);
    frame.dataset.targeting = String(targeting);
    frame.classList.toggle('is-targeting', targeting);
  }

  document.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    cursor.classList.add('is-visible');
    const target = event.target.closest?.(targetSelector) || null;
    setTarget(target);
  }, { passive: true });

  document.addEventListener('pointerdown', () => cursor.classList.add('is-pressed'));
  document.addEventListener('pointerup', () => cursor.classList.remove('is-pressed'));
  document.addEventListener('pointercancel', () => cursor.classList.remove('is-pressed'));
  document.documentElement.addEventListener('mouseleave', () => {
    cursor.classList.remove('is-visible');
    setTarget(null);
  });

  render();
})();
