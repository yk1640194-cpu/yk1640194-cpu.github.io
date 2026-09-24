(() => {
  'use strict';

  let activeCard = null;

  function addGlowLayers(root = document) {
    root.querySelectorAll('.work-media').forEach((media) => {
      if (media.querySelector('[data-card-edge-glow]')) return;
      const glow = document.createElement('span');
      glow.className = 'card-edge-glow';
      glow.dataset.cardEdgeGlow = '';
      glow.setAttribute('aria-hidden', 'true');
      media.appendChild(glow);
    });
  }

  function resetCard(card) {
    if (!card) return;
    card.style.setProperty('--edge-proximity', '0');
    card.style.setProperty('--glow-opacity', '0');
  }

  function updateCard(card, clientX, clientY) {
    const rect = card.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const dx = x - centerX;
    const dy = y - centerY;
    const scaleX = dx === 0 ? Infinity : centerX / Math.abs(dx);
    const scaleY = dy === 0 ? Infinity : centerY / Math.abs(dy);
    const edge = Math.min(Math.max(1 / Math.min(scaleX, scaleY), 0), 1);
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    const opacity = Math.min(Math.max((edge - 0.52) / 0.38, 0), 1);

    card.style.setProperty('--edge-proximity', (edge * 100).toFixed(3));
    card.style.setProperty('--cursor-angle', `${angle.toFixed(3)}deg`);
    card.style.setProperty('--glow-opacity', opacity.toFixed(3));
  }

  document.addEventListener('pointermove', (event) => {
    const card = event.target.closest?.('.work-card');
    if (!card) {
      resetCard(activeCard);
      activeCard = null;
      return;
    }
    if (activeCard && activeCard !== card) resetCard(activeCard);
    activeCard = card;
    updateCard(card, event.clientX, event.clientY);
  }, { passive: true });

  document.addEventListener('pointerout', (event) => {
    const card = event.target.closest?.('.work-card');
    if (!card || card.contains(event.relatedTarget)) return;
    resetCard(card);
    if (activeCard === card) activeCard = null;
  }, { passive: true });

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches?.('.work-media')) addGlowLayers(node.parentElement || node);
        else if (node.querySelector?.('.work-media')) addGlowLayers(node);
      }
    }
  });

  addGlowLayers();
  observer.observe(document.querySelector('[data-gallery]') || document.body, { childList: true, subtree: true });
})();
