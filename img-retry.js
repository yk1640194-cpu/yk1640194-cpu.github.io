(() => {
  'use strict';
  // 弱网自动恢复：GitHub Pages 在部分地区连接不稳，图片/视频偶发加载失败时自动重试
  const MAX_RETRY = 3;
  function retry(el) {
    const n = Number(el.dataset.retryCount || 0) + 1;
    if (n > MAX_RETRY) return;
    el.dataset.retryCount = String(n);
    const src = el.currentSrc || el.src || el.getAttribute('src') || '';
    if (!src || src.startsWith('blob:') || src.startsWith('data:')) return;
    setTimeout(() => {
      const next = src + (src.includes('?') ? '&' : '?') + 'retry=' + Date.now();
      el.src = next;
      if (typeof el.load === 'function') {
        try { el.load(); } catch (err) { /* ignore */ }
      }
    }, 700 * n);
  }
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (!t || !t.tagName) return;
    if (t.tagName === 'IMG' || t.tagName === 'VIDEO') retry(t);
    if (t.tagName === 'SOURCE' && t.parentElement) retry(t.parentElement);
  }, true);
})();
