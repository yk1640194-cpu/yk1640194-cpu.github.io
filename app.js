(function () {
  function cloneData(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn("本地草稿保存失败，页面仍可继续浏览。", error);
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn("本地草稿清理失败，页面仍可继续浏览。", error);
    }
  }

  const packagedContent = cloneData(window.portfolioContent);
  const savedContent = storageGet("portfolioContentDraft");
  let savedData = null;
  try {
    savedData = savedContent ? JSON.parse(savedContent) : null;
  } catch (error) {
    storageRemove("portfolioContentDraft");
  }
  const data =
    savedData && savedData.packageVersion === packagedContent.packageVersion ? savedData : packagedContent;
  if (!data.gallery.categories.includes("TVC广告")) {
    const aiVideoIndex = data.gallery.categories.indexOf("AI视频");
    data.gallery.categories.splice(aiVideoIndex + 1, 0, "TVC广告");
    if (data === savedData) storageSet("portfolioContentDraft", JSON.stringify(data));
  }
  if (data.gallery.categories.includes("3D生成")) {
    data.gallery.categories = data.gallery.categories.filter((category) => category !== "3D生成");
    if (data === savedData) storageSet("portfolioContentDraft", JSON.stringify(data));
  }
  const morelMediaVersion = 1;
  const morelProject = data.gallery.projects.find((project) => {
    const normalizedTitle = String(project.title || "").replace(/[《》\s]/g, "");
    return project.category === "视觉设计" && normalizedTitle === "新作品21";
  });
  if (morelProject && morelProject.morelMediaVersion !== morelMediaVersion) {
    morelProject.mediaKeys = [
      { name: "白底图.png", type: "image", src: "assets/portfolio-media/morel-white.png" },
      { name: "主图01.png", type: "image", src: "assets/portfolio-media/morel-main-01.png" },
      { name: "主图02.png", type: "image", src: "assets/portfolio-media/morel-main-02.png" },
      { name: "主图03.png", type: "image", src: "assets/portfolio-media/morel-main-03.png" },
      { name: "主图04.png", type: "image", src: "assets/portfolio-media/morel-main-04.png" },
      { name: "详情页.jpg", type: "image", src: "assets/portfolio-media/morel-detail.jpg" },
    ];
    morelProject.mediaKey = "";
    morelProject.mediaName = morelProject.mediaKeys.map((media) => media.name).join("、");
    morelProject.mediaType = "image";
    morelProject.image = "";
    morelProject.video = "";
    morelProject.morelMediaVersion = morelMediaVersion;
    if (data === savedData) storageSet("portfolioContentDraft", JSON.stringify(data));
  }
  const mediaUrls = new Map();
  let activeCategory = data.gallery.allLabel;
  let lightboxScale = 1;
  let lightboxX = 0;
  let lightboxY = 0;
  let lightboxDragging = false;
  let lightboxDragStart = { x: 0, y: 0 };
  let lightboxList = [];
  let lightboxIndex = 0;
  let lightboxTapStart = { x: 0, y: 0 };
  let modalScale = 1;
  let modalX = 0;
  let modalY = 0;
  let modalDragging = false;
  let modalDragStart = { x: 0, y: 0 };
  let heroDragging = false;
  let heroMoved = false;
  let heroDragStart = { x: 0, y: 0 };
  let heroResizing = false;
  let heroResizeStart = { x: 0, scale: 1 };
  const aiVideoCategory = "AI视频";
  const detailCategories = new Set(["视觉设计", "概念设计", "3D生成"]);
  const isLocalPreview = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  const canEdit =
    isLocalPreview || new URLSearchParams(window.location.search).get("edit") === "1" || window.location.hash === "#edit";
  const oldAboutLeadPlaceholder = "这里写你的核心介绍，例如：我是一名专注 AIGC 视觉创作的设计师。";
  const oldGalleryTitlePattern = /^在这里展示你的作品[。.]?$/;
  const ffmpegVersion = "0.12.15";
  const ffmpegCoreVersion = "0.12.10";
  let ffmpegLoader = null;

  if (!data.hero.brand || data.hero.brand === "DAVS RAIN") {
    data.hero.brand = "Inspired Creation";
    saveDraft();
  }

  if (data.about?.lead === oldAboutLeadPlaceholder) {
    data.about.lead = "";
    saveDraft();
  }

  if (oldGalleryTitlePattern.test(String(data.gallery?.title || "").trim())) {
    data.gallery.title = "";
    saveDraft();
  }

  data.hero.visualOffset ||= { x: 0, y: 0 };
  data.hero.visualScale ||= 1;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function setText(selector, value) {
    const el = $(selector);
    if (el) el.textContent = value || "";
  }

  function saveDraft() {
    storageSet("portfolioContentDraft", JSON.stringify(data));
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("portfolio-media", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function dbPut(key, file) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(file, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbGet(key) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("files", "readonly");
        const request = tx.objectStore("files").get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      return null;
    }
  }

  async function dbDelete(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        if (existing.dataset.loaded === "true") resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve();
      };
      script.onerror = () => reject(new Error(`无法加载 ${src}`));
      document.head.appendChild(script);
    });
  }

  async function getFfmpeg() {
    if (!ffmpegLoader) {
      ffmpegLoader = (async () => {
        await loadScript(`https://unpkg.com/@ffmpeg/ffmpeg@${ffmpegVersion}/dist/umd/ffmpeg.js`);
        await loadScript("https://unpkg.com/@ffmpeg/util@0.12.2/dist/umd/index.js");
        const { FFmpeg } = window.FFmpegWASM || {};
        const { toBlobURL } = window.FFmpegUtil || {};
        if (!FFmpeg || !toBlobURL) throw new Error("视频转码组件加载失败");

        const ffmpeg = new FFmpeg();
        const coreBase = `https://unpkg.com/@ffmpeg/core@${ffmpegCoreVersion}/dist/umd`;
        await ffmpeg.load({
          coreURL: await toBlobURL(`${coreBase}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm")
        });
        return ffmpeg;
      })();
    }
    return ffmpegLoader;
  }

  async function createCompatibleVideoFile(file, onStatus) {
    if (!isVideoFile(file)) return file;
    onStatus?.("正在加载视频兼容组件...");
    const ffmpeg = await getFfmpeg();
    const { fetchFile } = window.FFmpegUtil || {};
    if (!fetchFile) throw new Error("视频读取组件加载失败");

    const inputName = `input-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const outputName = `output-${Date.now()}.mp4`;
    onStatus?.("正在转换为可播放 MP4...");
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.exec([
      "-i",
      inputName,
      "-vf",
      "scale=trunc(min(1920\\,iw)/2)*2:-2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      outputName
    ]);
    const outputData = await ffmpeg.readFile(outputName);
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});

    const baseName = file.name.replace(/\.[^.]+$/, "");
    onStatus?.("兼容 MP4 已生成");
    const bytes = outputData.buffer.slice(outputData.byteOffset, outputData.byteOffset + outputData.byteLength);
    return new File([bytes], `${baseName}-compatible.mp4`, { type: "video/mp4" });
  }

  function isVideoFile(file) {
    return file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
  }

  function isAiVideoProject(project) {
    return project.category === aiVideoCategory;
  }

  function isVideoMedia(media) {
    return media?.type === "video" || /\.(mp4|mov|m4v|webm)$/i.test(media?.name || "");
  }
  function hasTraceMedia(project) {
    return (isAiVideoProject(project) || project.category === "TVC广告") &&
      projectMedias(project).some((media) => !isVideoMedia(media));
  }

  function projectMedias(project) {
    if (project.mediaKeys?.length) return project.mediaKeys;
    if (project.mediaKey) {
      return [{ key: project.mediaKey, name: project.mediaName || project.title || "", type: project.mediaType || "" }];
    }
    return [];
  }

  function primaryMedia(project) {
    const medias = projectMedias(project);
    if (isAiVideoProject(project)) return medias.find(isVideoMedia) || medias[0] || null;
    return medias[0] || null;
  }

  function mediaObjectUrl(media) {
    if (media?.src) return media.src;
    return media?.key ? mediaUrls.get(media.key) || "" : "";
  }

  function safeFileName(name, fallback = "media") {
    const base = (name || fallback)
      .replace(/\.[^.]+$/, "")
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .trim();
    return (base || fallback).slice(0, 80);
  }

  function fileExtension(file, fallback = "bin") {
    const fromName = file?.name?.match(/\.([a-z0-9]+)$/i)?.[1];
    if (fromName) return fromName.toLowerCase();
    const fromType = file?.type?.split("/")[1];
    return (fromType || fallback).replace("jpeg", "jpg").toLowerCase();
  }

  const crcTable = Array.from({ length: 256 }, (_, index) => {
    let c = index;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
  }

  function zipStore(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const { time, day } = dosDateTime();

    const writeUint16 = (view, at, value) => view.setUint16(at, value, true);
    const writeUint32 = (view, at, value) => view.setUint32(at, value >>> 0, true);

    files.forEach((file) => {
      const nameBytes = encoder.encode(file.path.replace(/\\/g, "/"));
      const dataBytes = file.bytes instanceof Uint8Array ? file.bytes : encoder.encode(String(file.bytes));
      const crc = crc32(dataBytes);

      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      writeUint32(localView, 0, 0x04034b50);
      writeUint16(localView, 4, 20);
      writeUint16(localView, 6, 0x0800);
      writeUint16(localView, 8, 0);
      writeUint16(localView, 10, time);
      writeUint16(localView, 12, day);
      writeUint32(localView, 14, crc);
      writeUint32(localView, 18, dataBytes.length);
      writeUint32(localView, 22, dataBytes.length);
      writeUint16(localView, 26, nameBytes.length);
      local.set(nameBytes, 30);
      chunks.push(local, dataBytes);

      const headerOffset = offset;
      offset += local.length + dataBytes.length;

      const dir = new Uint8Array(46 + nameBytes.length);
      const dirView = new DataView(dir.buffer);
      writeUint32(dirView, 0, 0x02014b50);
      writeUint16(dirView, 4, 20);
      writeUint16(dirView, 6, 20);
      writeUint16(dirView, 8, 0x0800);
      writeUint16(dirView, 10, 0);
      writeUint16(dirView, 12, time);
      writeUint16(dirView, 14, day);
      writeUint32(dirView, 16, crc);
      writeUint32(dirView, 20, dataBytes.length);
      writeUint32(dirView, 24, dataBytes.length);
      writeUint16(dirView, 28, nameBytes.length);
      writeUint32(dirView, 42, headerOffset);
      dir.set(nameBytes, 46);
      central.push(dir);
    });

    const centralOffset = offset;
    central.forEach((chunk) => {
      chunks.push(chunk);
      offset += chunk.length;
    });

    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    writeUint32(endView, 0, 0x06054b50);
    writeUint16(endView, 8, files.length);
    writeUint16(endView, 10, files.length);
    writeUint32(endView, 12, offset - centralOffset);
    writeUint32(endView, 16, centralOffset);
    chunks.push(end);

    return new Blob(chunks, { type: "application/zip" });
  }

  async function getStoredFile(key) {
    if (!key) return null;
    const dbFile = await dbGet(key);
    if (dbFile) return dbFile;
    const url = mediaUrls.get(key);
    if (!url) return null;
    const response = await fetch(url);
    return response.blob();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function currentCssText() {
    return Array.from(document.styleSheets)
      .map((sheet) => {
        try {
          return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
        } catch {
          return "";
        }
      })
      .filter(Boolean)
      .join("\n");
  }

  function staticMediaSrc(project) {
    const media = primaryMedia(project);
    return media?.src || project.image || project.video || "";
  }

  function staticMediaType(project) {
    const media = primaryMedia(project);
    if (media) return isVideoMedia(media) ? "video" : "image";
    return project.video ? "video" : "image";
  }

  function renderStaticMedia(src, type, title, preview = false) {
    if (!src) return `<div class="work-placeholder"><span>${escapeHtml(title)}</span></div>`;
    if (type === "video") {
      return `<video src="${escapeHtml(src)}" ${preview ? "muted preload=\"metadata\"" : "controls playsinline preload=\"metadata\""}></video>`;
    }
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="lazy">`;
  }

  function renderStaticProject(project, index) {
    const src = staticMediaSrc(project);
    const type = staticMediaType(project);
    const cardClass = detailCategories.has(project.category) ? "work-card work-card--visual" : "work-card";
    return `
      <button class="${cardClass}" type="button" data-project-index="${index}">
        <div class="work-media">
          ${renderStaticMedia(src, type, project.title, true)}
          <span class="work-view">View Details</span>
        </div>
        <p>${escapeHtml(project.category)}</p>
        <h4>${escapeHtml(project.title)}</h4>
      </button>
    `;
  }

  function buildStaticPortfolioHtml(staticData) {
    const css = currentCssText();
    const projects = staticData.gallery.projects || [];
    const categories = staticData.gallery.categories || [];
    const grouped = categories
      .map((category) => {
        const items = projects.filter((project) => project.category === category);
        if (!items.length) return "";
        return `
          <section class="work-group" data-work-group="${escapeHtml(category)}">
            <h3>${escapeHtml(category)}</h3>
            <div class="work-grid">${items.map((project) => renderStaticProject(project, projects.indexOf(project))).join("")}</div>
          </section>
        `;
      })
      .join("");

    const appScript = `
      const portfolioData = ${JSON.stringify(staticData)};
      const detailCategories = new Set(["视觉设计", "概念设计", "3D生成"]);
      const aiVideoCategory = "AI视频";
      const $ = (selector) => document.querySelector(selector);
      const $$ = (selector) => Array.from(document.querySelectorAll(selector));
      function isVideoMedia(media){ return media?.type === "video" || /\\.(mp4|mov|m4v|webm)$/i.test(media?.name || media?.src || ""); }
      function projectMedias(project){ return project.mediaKeys?.length ? project.mediaKeys : []; }
      function primaryMedia(project){ const medias = projectMedias(project); return project.category === aiVideoCategory ? (medias.find(isVideoMedia) || medias[0] || null) : (medias[0] || null); }
      function mediaSrc(project){ const media = primaryMedia(project); return media?.src || project.image || project.video || ""; }
      function mediaType(project){ const media = primaryMedia(project); return media ? (isVideoMedia(media) ? "video" : "image") : (project.video ? "video" : "image"); }
      function renderMedia(src,type,title){ if(!src) return '<div class="work-placeholder"><span>媒体未导出成功</span><strong>'+title+'</strong></div>'; return type === "video" ? '<video src="'+src+'" controls playsinline preload="metadata"></video>' : '<img src="'+src+'" alt="'+title+'">'; }
      function openModal(project){
        const modal = $('[data-modal]');
        const media = $('[data-modal-media]');
        const medias = projectMedias(project);
        const traceImages = project.category === aiVideoCategory ? medias.filter((item)=>!isVideoMedia(item)) : [];
        const video = project.category === aiVideoCategory ? (medias.find(isVideoMedia) || null) : null;
        if (project.category === aiVideoCategory && traceImages.length) {
          media.innerHTML = '<div class="ai-video-detail"><div class="ai-video-stage">'+renderMedia(video?.src || project.video, "video", project.title)+'</div><p class="trace-title">工作留痕</p><div class="visual-detail-grid trace-grid">'+traceImages.map((item)=>'<button class="visual-detail-item" type="button" data-lightbox="'+item.src+'"><img src="'+item.src+'" alt="'+project.title+'"></button>').join("")+'</div></div>';
        } else if (detailCategories.has(project.category) && medias.length > 1) {
          media.innerHTML = '<div class="visual-detail-grid">'+medias.map((item)=> isVideoMedia(item) ? '<div class="visual-detail-item">'+renderMedia(item.src,"video",project.title)+'</div>' : '<button class="visual-detail-item" type="button" data-lightbox="'+item.src+'"><img src="'+item.src+'" alt="'+project.title+'"></button>').join("")+'</div>';
        } else {
          media.innerHTML = renderMedia(mediaSrc(project), mediaType(project), project.title);
        }
        $('[data-modal-category]').textContent = project.category || "";
        $('[data-modal-title]').textContent = project.title || "";
        $('[data-modal-desc]').textContent = project.description || "";
        modal.hidden = false;
        document.body.classList.add("modal-open");
      }
      function closeModal(){ $('[data-modal]').hidden = true; $('[data-modal-media]').innerHTML = ""; document.body.classList.remove("modal-open"); }
      function openLightbox(src){ $('[data-media-lightbox-body]').innerHTML = '<img src="'+src+'" alt="作品图片">'; $('[data-media-lightbox]').hidden = false; document.body.classList.add("lightbox-open"); }
      function closeLightbox(){ $('[data-media-lightbox]').hidden = true; $('[data-media-lightbox-body]').innerHTML = ""; document.body.classList.remove("lightbox-open"); }
      $$('[data-project-index]').forEach((button)=>button.addEventListener("click",()=>openModal(portfolioData.gallery.projects[Number(button.dataset.projectIndex)])));
      document.addEventListener("click",(event)=>{ const light = event.target.closest('[data-lightbox]'); if(light){ event.stopPropagation(); openLightbox(light.dataset.lightbox); } if(event.target.matches('[data-modal]')) closeModal(); if(event.target.matches('[data-media-lightbox]')) closeLightbox(); });
      $('[data-modal-close]').addEventListener("click", closeModal);
      $('[data-media-lightbox-close]').addEventListener("click", closeLightbox);
      document.addEventListener("keydown",(event)=>{ if(event.key === "Escape"){ closeLightbox(); closeModal(); }});
    `;

    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(staticData.siteName || "AIGC Portfolio")}</title>
    <style>${css}</style>
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="#home" aria-label="回到首页"><span class="brand-mark"></span><span>${escapeHtml(staticData.siteName || "Portfolio")}</span></a>
      <nav class="main-nav" aria-label="主导航">
        <a href="#about">${escapeHtml(staticData.navigation?.about || "关于我")}</a>
        <a href="#gallery">${escapeHtml(staticData.navigation?.gallery || "查看作品")}</a>
      </nav>
      <span class="ai-chip"><span></span>${escapeHtml(staticData.hero?.badge || "Generative AI")}</span>
    </header>
    <main>
      <section class="hero" id="home">
        <div class="hero-visual hero-visual--filled">${staticData.hero?.visualImage ? `<img src="${escapeHtml(staticData.hero.visualImage)}" alt="">` : ""}</div>
        <div class="hero-content">
          <p class="section-label">${escapeHtml(staticData.hero?.kicker || "AIGC Portfolio")}</p>
          <h1>${escapeHtml(staticData.hero?.title || "")}</h1>
          <p>${escapeHtml(staticData.hero?.subtitle || "")}</p>
          <div class="hero-actions"><a class="button button-dark" href="#gallery">${escapeHtml(staticData.hero?.primaryButton || "查看作品")}</a></div>
        </div>
      </section>
      <section class="about" id="about">
        <div class="about-copy"><p class="section-label">${escapeHtml(staticData.about?.label || "About")}</p><h2>${escapeHtml(staticData.about?.title || "关于我")}</h2>${staticData.about?.lead ? `<p>${escapeHtml(staticData.about.lead)}</p>` : ""}<p>${escapeHtml(staticData.about?.body || "")}</p></div>
        <div class="profile-card"><div class="profile-placeholder profile-placeholder--filled">${staticData.about?.profileImage ? `<img src="${escapeHtml(staticData.about.profileImage)}" alt="关于我图片">` : ""}</div></div>
      </section>
      <section class="gallery" id="gallery">
        <div class="section-header"><p class="section-label">${escapeHtml(staticData.gallery?.label || "精选作品")}</p><h2>${escapeHtml(staticData.gallery?.title || "")}</h2></div>
        <div class="tabs">${[staticData.gallery?.allLabel || "全部", ...categories].map((category, index) => `<button class="${index === 0 ? "active" : ""}" type="button">${escapeHtml(category)}</button>`).join("")}</div>
        <div class="work-sections">${grouped}</div>
      </section>
      <section class="skills" id="skills"><p class="section-label">${escapeHtml(staticData.skills?.label || "Toolkit")}</p><h2>${escapeHtml(staticData.skills?.title || "技能与工具")}</h2><div class="skills-grid">${(staticData.skills?.items || []).map((item) => `<article><h3>${escapeHtml(item.name)}</h3><span>${escapeHtml(item.level)}</span><p>${escapeHtml(item.description)}</p></article>`).join("")}</div></section>
    </main>
    <div class="modal" data-modal hidden><article class="modal-card"><button class="modal-close" type="button" data-modal-close aria-label="关闭详情">×</button><div class="modal-media" data-modal-media></div><div class="modal-copy"><p data-modal-category></p><h3 data-modal-title></h3><p data-modal-desc></p></div></article></div>
    <div class="media-lightbox" data-media-lightbox hidden><button class="modal-close" type="button" data-media-lightbox-close aria-label="关闭放大图片">×</button><div class="media-lightbox-body" data-media-lightbox-body></div></div>
    <script>${appScript}</script>
  </body>
</html>`;
  }

  async function exportPublishPackage(button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "正在打包...";

    try {
      const staticData = cloneData(data);
      const files = [];
      const addText = (path, text) => files.push({ path, bytes: new TextEncoder().encode(text) });
      const addBlob = async (path, blob) => {
        files.push({ path, bytes: new Uint8Array(await blob.arrayBuffer()) });
      };

      const attachMedia = async (key, name, prefix) => {
        const file = await getStoredFile(key);
        if (!file) return "";
        const assetPath = `assets/portfolio-media/${prefix}-${safeFileName(name || key)}.${fileExtension(file)}`;
        await addBlob(assetPath, file);
        return assetPath;
      };

      if (staticData.hero?.heroMediaKey) {
        const src = await attachMedia(staticData.hero.heroMediaKey, staticData.hero.heroMediaName, "hero");
        if (src) {
          staticData.hero.visualImage = src;
          staticData.hero.heroMediaKey = "";
        }
      }

      if (staticData.about?.profileMediaKey) {
        const src = await attachMedia(staticData.about.profileMediaKey, staticData.about.profileMediaName, "profile");
        if (src) {
          staticData.about.profileImage = src;
          staticData.about.profileMediaKey = "";
        }
      }

      for (const [projectIndex, project] of (staticData.gallery.projects || []).entries()) {
        const medias = project.mediaKeys?.length
          ? project.mediaKeys
          : project.mediaKey
            ? [{ key: project.mediaKey, name: project.mediaName || project.title, type: project.mediaType || "" }]
            : [];

        for (const [mediaIndex, media] of medias.entries()) {
          if (media.src || !media.key) continue;
          const src = await attachMedia(media.key, media.name || project.title, `work-${projectIndex + 1}-${mediaIndex + 1}`);
          if (src) media.src = src;
        }

        if (medias.length) {
          project.mediaKeys = medias;
          const primary = isAiVideoProject(project) ? medias.find(isVideoMedia) || medias[0] : medias[0];
          if (primary?.src) {
            if (isVideoMedia(primary)) project.video = primary.src;
            else project.image = primary.src;
            project.mediaKey = "";
          }
        }
      }

      addText("index.html", buildStaticPortfolioHtml(staticData));

      const zip = zipStore(files);
      const url = URL.createObjectURL(zip);
      const link = document.createElement("a");
      link.href = url;
      link.download = `aigc-portfolio-publish-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      button.textContent = "发布包已下载";
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 1800);
    } catch (error) {
      console.warn(error);
      button.textContent = "导出失败，请重试";
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 2200);
    }
  }

  function getProjectId(project, index) {
    if (!project.id) project.id = Number.isInteger(index) ? `project-${index + 1}` : `project-${Date.now()}`;
    return project.id;
  }

  async function hydrateMedia() {
    if (data.hero.heroMediaKey && !data.hero.visualImage) {
      const file = await dbGet(data.hero.heroMediaKey);
      if (file) mediaUrls.set(data.hero.heroMediaKey, URL.createObjectURL(file));
    }

    if (data.about.profileMediaKey && !data.about.profileImage) {
      const file = await dbGet(data.about.profileMediaKey);
      if (file) mediaUrls.set(data.about.profileMediaKey, URL.createObjectURL(file));
    }

    await Promise.all(
      data.gallery.projects.map(async (project) => {
        if (project.mediaKeys?.length) {
          await Promise.all(
            project.mediaKeys.map(async (media) => {
              if (media.src) return;
              const file = await dbGet(media.key);
              if (file) mediaUrls.set(media.key, URL.createObjectURL(file));
            })
          );
        }
        if (!project.mediaKey || project.image || project.video) return;
        const file = await dbGet(project.mediaKey);
        if (file) mediaUrls.set(project.mediaKey, URL.createObjectURL(file));
      })
    );
  }

  function createPlaceholder(title, category) {
    const el = document.createElement("div");
    el.className = "work-placeholder";
    el.innerHTML = `<span>${category}</span><strong>${title}</strong>`;
    return el;
  }

  function createMediaUnavailable(title, message = "媒体文件没有加载成功") {
    const el = document.createElement("div");
    el.className = "work-placeholder media-unavailable";
    el.innerHTML = `<span>${message}</span><strong>${title || "作品媒体"}</strong>`;
    return el;
  }

  function createVideoFallback(src, title, repair) {
    const fallback = document.createElement("div");
    fallback.className = "video-fallback";
    fallback.innerHTML = `
      <strong>这个视频暂时无法播放</strong>
      <span data-video-fallback-status>正在尝试自动转成网页可播放格式...</span>
    `;
    if (repair) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "自动修复播放";
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        button.disabled = true;
        const status = fallback.querySelector("[data-video-fallback-status]");
        try {
          const repairedMedia = await repair((message) => {
            status.textContent = message;
          });
          if (repairedMedia instanceof HTMLElement && fallback.parentElement) {
            fallback.parentElement.replaceChildren(repairedMedia);
          } else {
            status.textContent = "修复完成，请重新打开这个作品。";
          }
        } catch (error) {
          console.warn(error);
          status.textContent = "自动修复失败，请换一个 MP4(H.264/AAC) 视频重新导入。";
          button.disabled = false;
        }
      });
      fallback.appendChild(button);
      requestAnimationFrame(() => button.click());
    } else {
      fallback.querySelector("[data-video-fallback-status]").textContent =
        "文件已导入，但浏览器不支持当前编码。请把原视频转换为 MP4(H.264/AAC) 后重新导入。";
    }
    if (src) {
      const link = document.createElement("a");
      link.href = src;
      link.download = title || "portfolio-video";
      link.textContent = "下载原视频";
      link.addEventListener("click", (event) => event.stopPropagation());
      fallback.appendChild(link);
    }
    return fallback;
  }

  function createVideo(src, title, options = {}) {
    const video = document.createElement("video");
    video.src = src;
    video.controls = options.controls !== false;
    video.playsInline = true;
    video.preload = "metadata";
    if (options.poster) video.poster = options.poster;
    if (options.controls === false) {
      video.muted = true;
      video.setAttribute("aria-label", title || "作品视频预览");
    }
    if (options.fallback !== false) {
      video.addEventListener(
        "error",
        () => {
          const parent = video.parentElement;
          if (!parent || parent.querySelector(".video-fallback")) return;
          video.hidden = true;
          parent.appendChild(createVideoFallback(src, title, options.repair));
        },
        { once: true }
      );
    }
    applyMediaOrientation(video);
    return video;
  }

  async function replaceProjectMediaWithCompatibleVideo(project, media, onStatus) {
    if (!media?.key) throw new Error("没有找到要修复的视频文件");
    const file = await dbGet(media.key);
    if (!file) throw new Error("本地视频文件不存在，请重新导入");

    const compatibleFile = await createCompatibleVideoFile(file, onStatus);
    const oldKey = media.key;
    const nextKey = `${getProjectId(project)}-${Date.now()}-${Math.random().toString(36).slice(2)}-${compatibleFile.name}`;
    await dbPut(nextKey, compatibleFile);
    await removeMediaKey(oldKey);

    media.key = nextKey;
    media.name = compatibleFile.name;
    media.type = "video";
    media.transcodeError = "";
    if (project.mediaKey === oldKey || !project.mediaKey) {
      project.mediaKey = nextKey;
      project.mediaName = compatibleFile.name;
      project.mediaType = "video";
    }
    if (project.mediaKeys?.length) {
      project.mediaName = project.mediaKeys.map((item) => item.name).join("、");
    }
    project.image = "";
    project.video = "";
    mediaUrls.set(nextKey, URL.createObjectURL(compatibleFile));
    saveDraft();
    return mediaUrls.get(nextKey);
  }

  function mediaSrc(project) {
    const media = primaryMedia(project);
    if (media?.key || media?.src) return mediaObjectUrl(media);
    return project.mediaKey ? mediaUrls.get(project.mediaKey) : "";
  }

  function hasDetailLayout(project) {
    return detailCategories.has(project.category);
  }

  function supportsMultipleMedia(project) {
    return isAiVideoProject(project) || hasDetailLayout(project);
  }

  function hasExpandedDetail(project) {
    return hasDetailLayout(project) || (isAiVideoProject(project) && projectMedias(project).length > 1) || hasTraceMedia(project);
  }

  function applyMediaOrientation(media) {
    const update = () => {
      const width = media.videoWidth || media.naturalWidth;
      const height = media.videoHeight || media.naturalHeight;
      if (!width || !height) return;

      const target = media.closest(".work-media, .modal-media, .ai-video-stage, .visual-detail-item, .hero-visual, .profile-placeholder");
      if (!target) return;

      const isPortrait = height > width * 1.08;
      target.classList.toggle("media--portrait", isPortrait);
      target.classList.toggle("media--landscape", !isPortrait);
    };

    requestAnimationFrame(update);

    if (media.tagName === "VIDEO") {
      if (media.readyState >= 1) update();
      media.addEventListener("loadedmetadata", update, { once: true });
      return;
    }

    if (media.complete) update();
    media.addEventListener("load", update, { once: true });
  }

  function createMedia(project, options = {}) {
    const showControls = options.controls !== false;
    const firstMedia = primaryMedia(project);
    const src = firstMedia ? mediaObjectUrl(firstMedia) : mediaSrc(project);
    const firstMediaType = firstMedia?.type;
    const kind = project.mediaType || (project.video ? "video" : "image");
    const mediaRecord =
      firstMedia ||
      (project.mediaKey
        ? { key: project.mediaKey, name: project.mediaName || project.title || "video", type: project.mediaType || kind }
        : null);

    if (firstMedia && !src && !project.video && !project.image) {
      return createMediaUnavailable(project.title, "本地媒体未找到，请重新导入");
    }

    if (src || project.video || project.image) {
      if (firstMediaType === "video" || kind === "video" || project.video) {
        return createVideo(src || project.video, project.title, {
          controls: showControls,
          fallback: showControls,
          poster: project.image || "",
          repair:
            showControls && mediaRecord?.key
              ? async (status) => {
                  const nextSrc = await replaceProjectMediaWithCompatibleVideo(project, mediaRecord, status);
                  renderGallery();
                  return createVideo(nextSrc, project.title, { controls: true, fallback: false, poster: project.image || "" });
                }
              : null
        });
      }

      const img = document.createElement("img");
      img.src = src || project.image;
      img.alt = project.title;
      applyMediaOrientation(img);
      return img;
    }

    return createPlaceholder(project.title, project.category);
  }

  function renderHeroVisual() {
    const visual = $("[data-hero-visual]");
    const src = data.hero.heroMediaKey ? mediaUrls.get(data.hero.heroMediaKey) : data.hero.visualImage;
    visual.style.setProperty("--hero-visual-x", `${data.hero.visualOffset?.x || 0}px`);
    visual.style.setProperty("--hero-visual-y", `${data.hero.visualOffset?.y || 0}px`);
    visual.style.setProperty("--hero-visual-scale", data.hero.visualScale || 1);
    visual.replaceChildren();
    visual.classList.toggle("hero-visual--filled", Boolean(src));
    if (canEdit) {
      visual.setAttribute("role", "button");
      visual.setAttribute("tabindex", "0");
      visual.setAttribute("aria-label", "");
    } else {
      visual.removeAttribute("role");
      visual.removeAttribute("tabindex");
      visual.removeAttribute("aria-label");
    }

    if (src) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = data.hero.visualPlaceholder || "";
      visual.appendChild(img);
      if (canEdit) {
        const resizeHandle = document.createElement("button");
        resizeHandle.type = "button";
        resizeHandle.className = "hero-visual-resize";
        resizeHandle.setAttribute("aria-label", "");
        visual.appendChild(resizeHandle);
      }
      return;
    }

    if (canEdit) {
      const span = document.createElement("span");
      span.textContent = data.hero.visualPlaceholder || "";
      visual.appendChild(span);
    }
  }

  function createTraceImageItem(project, media, list, index) {
    const item = document.createElement("button");
    item.className = "visual-detail-item";
    item.type = "button";
    item.setAttribute("aria-label", `放大查看 ${media.name || project.title}`);

    const src = mediaObjectUrl(media);
    if (!src) {
      item.appendChild(createMediaUnavailable(project.title, "本地图片未找到，请重新导入"));
      return item;
    }

    const img = document.createElement("img");
    img.src = src;
    img.alt = project.title;
    applyMediaOrientation(img);
    item.addEventListener("click", () => openMediaLightbox(list ? list[index] : { src, type: "image", alt: project.title }, list));
    item.appendChild(img);
    return item;
  }

  function createAiVideoDetailMedia(project) {
    const medias = projectMedias(project);
    const videoMedia = medias.find(isVideoMedia);
    const traceImages = medias.filter((media) => !isVideoMedia(media));
    const wrap = document.createElement("div");
    wrap.className = "ai-video-detail";

    const videoStage = document.createElement("div");
    videoStage.className = "ai-video-stage";
    const videoSrc = mediaObjectUrl(videoMedia);
    if (videoSrc) {
      videoStage.appendChild(
        createVideo(videoSrc, videoMedia.name || project.title, {
          repair: async (status) => {
            const nextSrc = await replaceProjectMediaWithCompatibleVideo(project, videoMedia, status);
            renderGallery();
            return createVideo(nextSrc, videoMedia.name || project.title, { controls: true, fallback: false });
          }
        })
      );
    } else {
      videoStage.appendChild(createMediaUnavailable(project.title, "本地视频未找到，请重新导入"));
    }
    wrap.appendChild(videoStage);

    if (traceImages.length) {
      const title = document.createElement("p");
      title.className = "trace-title";
      title.textContent = "工作留痕";
      const grid = document.createElement("div");
      grid.className = "visual-detail-grid trace-grid";
      const lightboxItems = traceImages.map((media) => ({ src: mediaObjectUrl(media), type: "image", alt: project.title }));
      traceImages.forEach((media, idx) => grid.appendChild(createTraceImageItem(project, media, lightboxItems, idx)));
      wrap.append(title, grid);
    }

    return wrap;
  }

  function createDetailMedia(project) {
    if ((isAiVideoProject(project) && projectMedias(project).length > 1) || hasTraceMedia(project)) {
      return createAiVideoDetailMedia(project);
    }

    if (hasDetailLayout(project) && project.mediaKeys?.length > 1) {
      const wrap = document.createElement("div");
      wrap.className = "visual-detail-grid";
      const lightboxItems = project.mediaKeys
        .filter((m) => m.type !== "video" && mediaObjectUrl(m))
        .map((m) => ({ src: mediaObjectUrl(m), type: "image", alt: project.title }));
      let lightboxPos = -1;
      project.mediaKeys.forEach((media) => {
        const item = document.createElement(media.type === "video" ? "div" : "button");
        item.className = "visual-detail-item";
        if (media.type !== "video") {
          item.type = "button";
          item.setAttribute("aria-label", `放大查看 ${media.name || project.title}`);
        }
        const src = mediaObjectUrl(media);
        if (media.type === "video") {
          item.appendChild(
            src
              ? createVideo(src, media.name || project.title, {
                  repair: async (status) => {
                    const nextSrc = await replaceProjectMediaWithCompatibleVideo(project, media, status);
                    renderGallery();
                    return createVideo(nextSrc, media.name || project.title, { controls: true, fallback: false });
                  }
                })
              : createMediaUnavailable(project.title, "本地视频未找到，请重新导入")
          );
        } else {
          if (!src) {
            item.appendChild(createMediaUnavailable(project.title, "本地图片未找到，请重新导入"));
            wrap.appendChild(item);
            return;
          }
          const img = document.createElement("img");
          img.src = src;
          img.alt = project.title;
          applyMediaOrientation(img);
          lightboxPos += 1;
          item.addEventListener("click", () => openMediaLightbox(lightboxItems[lightboxPos] || { src, type: "image", alt: project.title }, lightboxItems));
          item.appendChild(img);
        }
        wrap.appendChild(item);
      });
      return wrap;
    }

    return createMedia(project);
  }

  function openMediaLightbox(media, list) {
    lightboxList = Array.isArray(list) && list.length ? list : [media];
    lightboxIndex = Math.max(0, lightboxList.findIndex((item) => item.src === media.src));
    renderMediaLightbox();
  }

  function renderMediaLightbox() {
    const lightbox = $("[data-media-lightbox]");
    const body = $("[data-media-lightbox-body]");
    body.replaceChildren();
    resetLightboxZoom();
    lightbox.querySelectorAll(".lightbox-nav, .lightbox-counter").forEach((el) => el.remove());
    const media = lightboxList[lightboxIndex] || lightboxList[0];
    if (!media) return;
    if (media.type === "video") {
      const video = createVideo(media.src, media.alt || "作品视频");
      video.autoplay = true;
      applyMediaOrientation(video);
      body.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.src = media.src;
      img.alt = media.alt || "作品图片";
      applyMediaOrientation(img);
      body.appendChild(img);
    }
    if (lightboxList.length > 1) {
      const prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "lightbox-nav lightbox-nav--prev";
      prevBtn.setAttribute("aria-label", "上一张");
      prevBtn.textContent = "‹";
      prevBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        stepMediaLightbox(-1);
      });
      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "lightbox-nav lightbox-nav--next";
      nextBtn.setAttribute("aria-label", "下一张");
      nextBtn.textContent = "›";
      nextBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        stepMediaLightbox(1);
      });
      const counter = document.createElement("span");
      counter.className = "lightbox-counter";
      counter.textContent = `${lightboxIndex + 1} / ${lightboxList.length}`;
      lightbox.append(prevBtn, nextBtn, counter);
    }
    lightbox.hidden = false;
    document.body.classList.add("lightbox-open");
  }

  function stepMediaLightbox(delta) {
    if (lightboxList.length < 2) return;
    lightboxIndex = (lightboxIndex + delta + lightboxList.length) % lightboxList.length;
    renderMediaLightbox();
  }

  function renderLightboxZoom() {
    const body = $("[data-media-lightbox-body]");
    if (!body) return;
    body.style.setProperty("--zoom-scale", lightboxScale.toFixed(3));
    body.style.setProperty("--zoom-x", `${lightboxX}px`);
    body.style.setProperty("--zoom-y", `${lightboxY}px`);
    body.classList.toggle("is-zoomed", lightboxScale > 1.01);
    body.classList.toggle("is-dragging", lightboxDragging);
  }

  function resetLightboxZoom() {
    lightboxScale = 1;
    lightboxX = 0;
    lightboxY = 0;
    lightboxDragging = false;
    renderLightboxZoom();
  }

  function zoomAroundPointer(target, previousScale, nextScale, currentX, currentY, event) {
    if (!event || !target) return { x: currentX, y: currentY };
    const rect = target.getBoundingClientRect();
    const pointX = event.clientX - rect.left - rect.width / 2;
    const pointY = event.clientY - rect.top - rect.height / 2;
    return {
      x: pointX - ((pointX - currentX) / previousScale) * nextScale,
      y: pointY - ((pointY - currentY) / previousScale) * nextScale
    };
  }

  function zoomLightbox(delta, event) {
    const previousScale = lightboxScale;
    lightboxScale = Math.min(6, Math.max(1, lightboxScale + delta));
    if (lightboxScale <= 1.01) {
      lightboxScale = 1;
      lightboxX = 0;
      lightboxY = 0;
    } else if (previousScale === 1) {
      const nextPosition = zoomAroundPointer($("[data-media-lightbox-body]"), previousScale, lightboxScale, 0, 0, event);
      lightboxX = nextPosition.x;
      lightboxY = nextPosition.y;
    } else {
      const nextPosition = zoomAroundPointer(
        $("[data-media-lightbox-body]"),
        previousScale,
        lightboxScale,
        lightboxX,
        lightboxY,
        event
      );
      lightboxX = nextPosition.x;
      lightboxY = nextPosition.y;
    }
    renderLightboxZoom();
  }

  function renderModalZoom() {
    const media = $("[data-modal-media]");
    if (!media) return;
    media.style.setProperty("--zoom-scale", modalScale.toFixed(3));
    media.style.setProperty("--zoom-x", `${modalX}px`);
    media.style.setProperty("--zoom-y", `${modalY}px`);
    media.classList.toggle("is-zoomed", modalScale > 1.01);
    media.classList.toggle("is-dragging", modalDragging);
  }

  function resetModalZoom() {
    modalScale = 1;
    modalX = 0;
    modalY = 0;
    modalDragging = false;
    renderModalZoom();
  }

  function zoomModalMedia(delta, event) {
    const previousScale = modalScale;
    modalScale = Math.min(6, Math.max(1, modalScale + delta));
    if (modalScale <= 1.01) {
      modalScale = 1;
      modalX = 0;
      modalY = 0;
    } else if (previousScale === 1) {
      const nextPosition = zoomAroundPointer($("[data-modal-media]"), previousScale, modalScale, 0, 0, event);
      modalX = nextPosition.x;
      modalY = nextPosition.y;
    } else {
      const nextPosition = zoomAroundPointer($("[data-modal-media]"), previousScale, modalScale, modalX, modalY, event);
      modalX = nextPosition.x;
      modalY = nextPosition.y;
    }
    renderModalZoom();
  }

  function closeMediaLightbox() {
    const lightbox = $("[data-media-lightbox]");
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    $("[data-media-lightbox-body]").replaceChildren();
    document.body.classList.remove("lightbox-open");
    resetLightboxZoom();
  }

  function renderProfileMedia() {
    const profile = $("[data-profile-placeholder]");
    const src = data.about.profileMediaKey ? mediaUrls.get(data.about.profileMediaKey) : data.about.profileImage;
    profile.replaceChildren();
    profile.classList.toggle("profile-placeholder--filled", Boolean(src));
    if (canEdit) {
      profile.setAttribute("role", "button");
      profile.setAttribute("tabindex", "0");
      profile.setAttribute("aria-label", "导入关于我图片");
    } else {
      profile.removeAttribute("role");
      profile.removeAttribute("tabindex");
      profile.removeAttribute("aria-label");
    }

    if (src) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = data.about.profilePlaceholder || "关于我图片";
      profile.appendChild(img);
      return;
    }

    if (canEdit) {
      const span = document.createElement("span");
      span.textContent = data.about.profilePlaceholder;
      profile.appendChild(span);
    }
  }

  async function saveProfileImage(file) {
    if (!file.type.startsWith("image/")) return;
    const key = `profile-${Date.now()}-${file.name}`;
    await dbPut(key, file);
    if (data.about.profileMediaKey && mediaUrls.has(data.about.profileMediaKey)) {
      URL.revokeObjectURL(mediaUrls.get(data.about.profileMediaKey));
      mediaUrls.delete(data.about.profileMediaKey);
      await dbDelete(data.about.profileMediaKey);
    }
    data.about.profileMediaKey = key;
    data.about.profileMediaName = file.name;
    data.about.profileImage = "";
    mediaUrls.set(key, URL.createObjectURL(file));
    saveDraft();
    renderPage();
    if (!$("[data-editor]").hidden) renderEditor();
  }

  async function saveHeroImage(file) {
    if (!file.type.startsWith("image/")) return;
    const key = `hero-${Date.now()}-${file.name}`;
    await dbPut(key, file);
    if (data.hero.heroMediaKey) {
      await removeMediaKey(data.hero.heroMediaKey);
    }
    data.hero.heroMediaKey = key;
    data.hero.heroMediaName = file.name;
    data.hero.visualImage = "";
    mediaUrls.set(key, URL.createObjectURL(file));
    saveDraft();
    renderPage();
    if (!$("[data-editor]").hidden) renderEditor();
  }

  function updateHeroVisualPosition(x, y, persist = false) {
    data.hero.visualOffset ||= { x: 0, y: 0 };
    data.hero.visualOffset.x = Math.round(x);
    data.hero.visualOffset.y = Math.round(y);
    const visual = $("[data-hero-visual]");
    visual.style.setProperty("--hero-visual-x", `${data.hero.visualOffset.x}px`);
    visual.style.setProperty("--hero-visual-y", `${data.hero.visualOffset.y}px`);
    if (persist) saveDraft();
  }

  function updateHeroVisualScale(scale, persist = false) {
    data.hero.visualScale = Math.min(2.4, Math.max(0.45, Number(scale) || 1));
    const visual = $("[data-hero-visual]");
    visual.style.setProperty("--hero-visual-scale", data.hero.visualScale);
    if (persist) saveDraft();
  }

  function resetHeroVisualPosition() {
    updateHeroVisualScale(1);
    updateHeroVisualPosition(0, 0, true);
    renderPage();
    if (!$("[data-editor]").hidden) renderEditor();
  }

  function openModal(project) {
    const modal = $("[data-modal]");
    const media = $("[data-modal-media]");
    resetModalZoom();
    modal.classList.toggle("modal--visual", hasExpandedDetail(project));
    media.classList.remove("media--portrait", "media--landscape");
    media.replaceChildren(createDetailMedia(project));
    setText("[data-modal-category]", project.category);
    setText("[data-modal-title]", project.title);
    setText("[data-modal-desc]", project.description);
    modal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    $("[data-modal]").hidden = true;
    $("[data-modal-media]").replaceChildren();
    document.body.classList.remove("modal-open");
    resetModalZoom();
  }

  function renderTags(container, tags) {
    container.replaceChildren(
      ...tags.map((tag) => {
        const span = document.createElement("span");
        span.textContent = tag;
        return span;
      })
    );
  }

  function renderGallery(nextCategory = activeCategory) {
    activeCategory = nextCategory;
    const gallery = $("[data-gallery]");
    gallery.replaceChildren();

    data.gallery.categories.forEach((category) => {
      const projects = data.gallery.projects.filter((project) => project.category === category);
      if (!projects.length || (activeCategory !== data.gallery.allLabel && activeCategory !== category)) return;

      const section = document.createElement("section");
      section.className = "gallery-group";
      section.innerHTML = `<h3>${category}</h3>`;

      const grid = document.createElement("div");
      grid.className = "gallery-grid";

      projects.forEach((project) => {
        const card = document.createElement("article");
        card.className = `work-card ${hasDetailLayout(project) ? "work-card--visual" : ""}`;
        card.setAttribute("role", "button");
        card.tabIndex = 0;

        const media = document.createElement("div");
        media.className = "work-media";
        media.appendChild(createMedia(project, { controls: false }));
        const overlay = document.createElement("span");
        overlay.className = "work-view";
        overlay.textContent = "View Details";
        media.appendChild(overlay);

        const info = document.createElement("div");
        info.className = "work-info";
        info.innerHTML = `<span>${project.category}</span><strong>${project.title}</strong>`;

        card.append(media, info);
        card.addEventListener("click", () => openModal(project));
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openModal(project);
          }
        });
        grid.appendChild(card);
      });

      section.appendChild(grid);
      gallery.appendChild(section);
    });

    if (!gallery.children.length) {
      const empty = document.createElement("div");
      empty.className = "gallery-empty";
      empty.textContent = "还没有这个分类的作品。点击左上角 + 菜单新增作品。";
      gallery.appendChild(empty);
    }
  }

  function renderTabs() {
    const tabs = $("[data-category-tabs]");
    const labels = [data.gallery.allLabel, ...data.gallery.categories];

    tabs.replaceChildren(
      ...labels.map((label) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.className = label === activeCategory ? "active" : "";
        button.addEventListener("click", () => {
          $$(".tabs button").forEach((item) => item.classList.remove("active"));
          button.classList.add("active");
          renderGallery(label);
        });
        return button;
      })
    );
  }

  function renderEditor() {
    const body = $("[data-editor-body]");
    body.replaceChildren(
      createMainEditor(),
      createProjectToolbar(),
      ...data.gallery.projects.map((project, index) => {
        const item = document.createElement("article");
        item.className = "editor-item";
        item.innerHTML = `
          <div class="editor-item-head">
            <h3 class="editor-section-title">作品 ${index + 1}</h3>
            <button type="button" data-delete-project>删除</button>
          </div>
          <label>作品标题<input value="${project.title || ""}" data-field="title"></label>
          <label>分类<select data-field="category">${data.gallery.categories
            .map((category) => `<option ${category === project.category ? "selected" : ""}>${category}</option>`)
            .join("")}</select></label>
          <label>作品简介<textarea data-field="description">${project.description || ""}</textarea></label>
          <label>${supportsMultipleMedia(project) ? "导入视频和工作留痕图片（可多选）" : "导入图片或视频"}<input type="file" accept="image/*,video/*" ${supportsMultipleMedia(project) ? "multiple" : ""} data-field="media"></label>
          <p class="editor-media-name">${mediaLabel(project)}</p>
          <button type="button" class="editor-clear-media" data-transcode-media>兼容处理视频</button>
          <button type="button" class="editor-clear-media" data-clear-media>清除媒体</button>
        `;

        item.querySelector("[data-delete-project]").addEventListener("click", async () => {
          await clearProjectMedia(project);
          data.gallery.projects.splice(index, 1);
          saveDraft();
          renderTabs();
          renderGallery();
          renderEditor();
        });

        item.querySelector("[data-clear-media]").addEventListener("click", async () => {
          await clearProjectMedia(project);
          saveDraft();
          renderGallery();
          renderEditor();
        });

        item.querySelector("[data-transcode-media]").addEventListener("click", async () => {
          const statusEl = item.querySelector(".editor-media-name");
          try {
            await makeProjectVideosCompatible(project, index, statusEl);
          } catch (error) {
            console.warn(error);
            statusEl.textContent = "兼容处理失败，请重新导入 MP4(H.264/AAC)";
          }
        });

        item.querySelectorAll("[data-field]").forEach((control) => {
          control.addEventListener("input", () => {
            const field = control.dataset.field;
            if (field === "media") return;
            project[field] = control.value;
            saveDraft();
            renderTabs();
            renderGallery();
            if (field === "category") renderEditor();
          });
        });

        item.querySelector('[data-field="media"]').addEventListener("change", async (event) => {
          const files = Array.from(event.target.files);
          if (!files.length) return;
          const id = getProjectId(project, index);
          const mediaNameEl = item.querySelector(".editor-media-name");
          mediaNameEl.textContent = "正在处理媒体，请稍等...";
          await clearProjectMedia(project);
          const savedMedia = [];
          for (const [fileIndex, file] of files.entries()) {
            let fileToSave = file;
            let transcodeError = "";
            if (isVideoFile(file)) {
              try {
                fileToSave = await createCompatibleVideoFile(file, (status) => {
                  mediaNameEl.textContent = `${status}（${fileIndex + 1}/${files.length}）`;
                });
              } catch (error) {
                transcodeError = "自动转码失败，已保留原视频";
                mediaNameEl.textContent = transcodeError;
                console.warn(error);
              }
            }
            const key = `${id}-${Date.now()}-${Math.random().toString(36).slice(2)}-${fileToSave.name}`;
            await dbPut(key, fileToSave);
            mediaUrls.set(key, URL.createObjectURL(fileToSave));
            savedMedia.push({
              key,
              name: fileToSave.name,
              originalName: file.name,
              type: isVideoFile(fileToSave) ? "video" : "image",
              transcodeError
            });
          }
          if (isAiVideoProject(project)) {
            savedMedia.sort((a, b) => Number(!isVideoMedia(a)) - Number(!isVideoMedia(b)));
          }
          const primary = savedMedia[0];
          project.mediaKey = primary.key;
          project.mediaName = savedMedia.map((media) => media.name).join("、");
          project.mediaType = primary.type;
          project.mediaKeys = savedMedia;
          project.image = "";
          project.video = "";
          saveDraft();
          renderTabs();
          renderGallery();
          renderEditor();
        });

        return item;
      })
    );
  }

  async function clearProjectMedia(project) {
    const keys = new Set();
    if (project.mediaKey) keys.add(project.mediaKey);
    project.mediaKeys?.forEach((media) => {
      if (media.key) keys.add(media.key);
    });
    await Promise.all([...keys].map((key) => removeMediaKey(key)));
    project.mediaKey = "";
    project.mediaName = "";
    project.mediaType = "";
    project.mediaKeys = [];
    project.image = "";
    project.video = "";
  }

  async function makeProjectVideosCompatible(project, index, statusEl) {
    const medias = project.mediaKeys?.length
      ? project.mediaKeys
      : project.mediaKey
        ? [{ key: project.mediaKey, name: project.mediaName || "video", type: project.mediaType || "video" }]
        : [];
    const videoMedias = medias.filter((media) => media.type === "video" || /\.(mp4|mov|m4v|webm)$/i.test(media.name || ""));
    if (!videoMedias.length) {
      statusEl.textContent = "这个作品里没有视频文件";
      return;
    }

    for (const [videoIndex, media] of videoMedias.entries()) {
      const file = await dbGet(media.key);
      if (!file) {
        media.transcodeError = "本地视频未找到，请重新导入";
        continue;
      }
      statusEl.textContent = `正在兼容处理视频（${videoIndex + 1}/${videoMedias.length}）...`;
      const compatibleFile = await createCompatibleVideoFile(file, (status) => {
        statusEl.textContent = `${status}（${videoIndex + 1}/${videoMedias.length}）`;
      });
      const nextKey = `${getProjectId(project, index)}-${Date.now()}-${Math.random().toString(36).slice(2)}-${compatibleFile.name}`;
      const oldKey = media.key;
      await dbPut(nextKey, compatibleFile);
      await removeMediaKey(oldKey);
      media.key = nextKey;
      media.name = compatibleFile.name;
      media.type = "video";
      media.transcodeError = "";
      mediaUrls.set(nextKey, URL.createObjectURL(compatibleFile));
      if (project.mediaKey === oldKey || videoMedias.length === 1) {
        project.mediaKey = nextKey;
        project.mediaName = compatibleFile.name;
        project.mediaType = "video";
      }
    }

    project.mediaName = (project.mediaKeys?.length ? project.mediaKeys : medias).map((media) => media.name).join("、");
    saveDraft();
    renderGallery();
    renderEditor();
  }

  async function removeMediaKey(key) {
    if (mediaUrls.has(key)) URL.revokeObjectURL(mediaUrls.get(key));
    mediaUrls.delete(key);
    await dbDelete(key);
  }

  function mediaLabel(project) {
    if (project.mediaKeys?.length) return `已导入 ${project.mediaKeys.length} 个文件：${project.mediaKeys.map((media) => media.name).join("、")}`;
    return project.mediaName || project.image || project.video || "尚未导入媒体";
  }

  function createProjectToolbar() {
    const toolbar = document.createElement("div");
    toolbar.className = "editor-project-toolbar";
    const defaultCategory =
      activeCategory && activeCategory !== data.gallery.allLabel ? activeCategory : data.gallery.categories[0];
    toolbar.innerHTML = `
      <label>新增到哪个分类
        <select data-new-project-category>
          ${data.gallery.categories
            .map((category) => `<option ${category === defaultCategory ? "selected" : ""}>${category}</option>`)
            .join("")}
        </select>
      </label>
      <button type="button" class="button button-dark" data-add-project>新增作品</button>
      <p>新增后可以编辑标题、分类、简介，并导入图片或视频。</p>
    `;

    toolbar.querySelector("[data-add-project]").addEventListener("click", () => {
      const category = toolbar.querySelector("[data-new-project-category]").value;
      const nextNumber = String(data.gallery.projects.length + 1).padStart(2, "0");
      const project = {
        id: `project-${Date.now()}`,
        title: `《新作品 ${nextNumber}》`,
        category,
        description: "这里写作品简介、使用工具、项目目标或你的创作职责。",
        image: "",
        video: ""
      };
      data.gallery.projects.push(project);
      activeCategory = category;
      saveDraft();
      renderTabs();
      renderGallery();
      renderEditor();
    });

    return toolbar;
  }

  function createMainEditor() {
    const item = document.createElement("article");
    item.className = "editor-item";
    item.innerHTML = `
      <h3 class="editor-section-title">页面文字</h3>
      <label>左上角站点名<input value="${data.siteName || ""}" data-site-field="siteName"></label>
      <label>首页中心品牌<input value="${data.hero.brand || ""}" data-main-field="hero.brand"></label>
      <label>右上角标签<input value="${data.hero.badge || ""}" data-main-field="hero.badge"></label>
      <label>首页大标题<input value="${data.hero.title || ""}" data-main-field="hero.title"></label>
      <label>首页副标题<textarea data-main-field="hero.subtitle">${data.hero.subtitle || ""}</textarea></label>
      <input type="file" accept="image/*" data-hero-image hidden>
      <input type="range" min="0.45" max="2.4" step="0.01" value="${data.hero.visualScale || 1}" data-hero-scale hidden>
      <button type="button" class="editor-clear-media" data-clear-hero-image hidden></button>
      <button type="button" class="editor-clear-media" data-reset-hero-position hidden>重置主视觉位置</button>
      <label>关于标题<input value="${data.about.title || ""}" data-main-field="about.title"></label>
      <label>关于核心介绍（留空则不显示）<textarea data-main-field="about.lead">${data.about.lead || ""}</textarea></label>
      <label>关于介绍<textarea data-main-field="about.body">${data.about.body || ""}</textarea></label>
      <label>关于图片<input type="file" accept="image/*" data-profile-image></label>
      <p class="editor-media-name">${data.about.profileMediaName || data.about.profileImage || "尚未导入关于我图片"}</p>
      <button type="button" class="editor-clear-media" data-clear-profile-image>清除关于图片</button>
      <h3 class="editor-section-title">关于信息表</h3>
      <div class="editor-list" data-about-facts-editor></div>
      <button type="button" class="button button-light" data-add-about-fact>新增信息</button>
      <h3 class="editor-section-title">作品展示</h3>
      <label>作品区标题（留空则不显示）<input value="${data.gallery.title || ""}" data-main-field="gallery.title"></label>
      <h3 class="editor-section-title">技能与工具</h3>
      <label>区块小标题<input value="${data.skills.label || ""}" data-main-field="skills.label"></label>
      <label>区块标题<input value="${data.skills.title || ""}" data-main-field="skills.title"></label>
      <div class="editor-list" data-skills-editor></div>
      <button type="button" class="button button-light" data-add-skill>新增技能</button>

      <h3 class="editor-section-title">联系我</h3>
      <label>区块小标题<input value="${data.contact.label || ""}" data-main-field="contact.label"></label>
      <label>联系标题<input value="${data.contact.title || ""}" data-main-field="contact.title"></label>
      <label>联系说明<textarea data-main-field="contact.text">${data.contact.text || ""}</textarea></label>
      <div class="editor-list" data-contact-links-editor></div>
      <button type="button" class="button button-light" data-add-contact-link>新增联系方式</button>
      <label>底部标签（用逗号分隔）<input value="${(data.contact.tags || []).join(", ")}" data-contact-tags-field></label>
      <label>页脚文字<input value="${data.contact.copyright || ""}" data-main-field="contact.copyright"></label>
    `;

    const factsEditor = item.querySelector("[data-about-facts-editor]");
    (data.about.facts || []).forEach((fact, index) => {
      const row = document.createElement("div");
      row.className = "editor-list-row";
      row.innerHTML = `
        <div class="editor-item-head"><strong>信息 ${index + 1}</strong><button type="button" data-delete-about-fact>删除</button></div>
        <label>左侧名称<input value="${fact[0] || ""}" data-about-fact-field="term"></label>
        <label>右侧内容<input value="${fact[1] || ""}" data-about-fact-field="value"></label>
      `;
      row.querySelectorAll("[data-about-fact-field]").forEach((control) => {
        control.addEventListener("input", () => {
          data.about.facts[index][control.dataset.aboutFactField === "term" ? 0 : 1] = control.value;
          saveDraft();
          renderPage();
        });
      });
      row.querySelector("[data-delete-about-fact]").addEventListener("click", () => {
        data.about.facts.splice(index, 1);
        saveDraft();
        renderPage();
        renderEditor();
      });
      factsEditor.appendChild(row);
    });

    item.querySelector("[data-add-about-fact]").addEventListener("click", () => {
      data.about.facts.push(["新信息", "填写内容"]);
      saveDraft();
      renderPage();
      renderEditor();
    });

    const skillsEditor = item.querySelector("[data-skills-editor]");
    (data.skills.items || []).forEach((skill, index) => {
      const row = document.createElement("div");
      row.className = "editor-list-row";
      row.innerHTML = `
        <div class="editor-item-head"><strong>技能 ${index + 1}</strong><button type="button" data-delete-skill>删除</button></div>
        <label>名称<input value="${skill.name || ""}" data-skill-field="name"></label>
        <label>熟练度<input value="${skill.level || ""}" data-skill-field="level"></label>
        <label>说明<textarea data-skill-field="description">${skill.description || ""}</textarea></label>
      `;
      row.querySelectorAll("[data-skill-field]").forEach((control) => {
        control.addEventListener("input", () => {
          data.skills.items[index][control.dataset.skillField] = control.value;
          saveDraft();
          renderPage();
        });
      });
      row.querySelector("[data-delete-skill]").addEventListener("click", () => {
        data.skills.items.splice(index, 1);
        saveDraft();
        renderPage();
        renderEditor();
      });
      skillsEditor.appendChild(row);
    });

    item.querySelector("[data-add-skill]").addEventListener("click", () => {
      data.skills.items.push({ name: "新技能", level: "熟练", description: "写你掌握的具体流程或能力。" });
      saveDraft();
      renderPage();
      renderEditor();
    });

    const linksEditor = item.querySelector("[data-contact-links-editor]");
    (data.contact.links || []).forEach((link, index) => {
      const row = document.createElement("div");
      row.className = "editor-list-row";
      row.innerHTML = `
        <div class="editor-item-head"><strong>联系方式 ${index + 1}</strong><button type="button" data-delete-contact-link>删除</button></div>
        <label>显示文字<input value="${link.label || ""}" data-contact-link-field="label"></label>
        <label>链接地址<input value="${link.href || ""}" data-contact-link-field="href" placeholder="mailto:、https:// 或留空"></label>
      `;
      row.querySelectorAll("[data-contact-link-field]").forEach((control) => {
        control.addEventListener("input", () => {
          data.contact.links[index][control.dataset.contactLinkField] = control.value;
          saveDraft();
          renderPage();
        });
      });
      row.querySelector("[data-delete-contact-link]").addEventListener("click", () => {
        data.contact.links.splice(index, 1);
        saveDraft();
        renderPage();
        renderEditor();
      });
      linksEditor.appendChild(row);
    });

    item.querySelector("[data-add-contact-link]").addEventListener("click", () => {
      data.contact.links.push({ label: "新的联系方式", href: "" });
      saveDraft();
      renderPage();
      renderEditor();
    });

    item.querySelector("[data-contact-tags-field]").addEventListener("input", (event) => {
      data.contact.tags = event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean);
      saveDraft();
      renderPage();
    });

    item.querySelectorAll("[data-main-field]").forEach((control) => {
      control.addEventListener("input", () => {
        const [group, field] = control.dataset.mainField.split(".");
        data[group][field] = control.value;
        saveDraft();
        renderPage();
      });
    });

    item.querySelector("[data-site-field]").addEventListener("input", (event) => {
      data.siteName = event.target.value;
      saveDraft();
      renderPage();
    });

    item.querySelector("[data-hero-image]").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (file) await saveHeroImage(file);
    });

    item.querySelector("[data-clear-hero-image]").addEventListener("click", async () => {
      if (data.hero.heroMediaKey) {
        await removeMediaKey(data.hero.heroMediaKey);
      }
      data.hero.heroMediaKey = "";
      data.hero.heroMediaName = "";
      data.hero.visualImage = "";
      data.hero.visualOffset = { x: 0, y: 0 };
      data.hero.visualScale = 1;
      saveDraft();
      renderPage();
      renderEditor();
    });

    item.querySelector("[data-hero-scale]").addEventListener("input", (event) => {
      updateHeroVisualScale(event.target.value, true);
    });

    item.querySelector("[data-reset-hero-position]").addEventListener("click", resetHeroVisualPosition);

    item.querySelector("[data-profile-image]").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (file) await saveProfileImage(file);
    });

    item.querySelector("[data-clear-profile-image]").addEventListener("click", async () => {
      if (data.about.profileMediaKey) {
        if (mediaUrls.has(data.about.profileMediaKey)) URL.revokeObjectURL(mediaUrls.get(data.about.profileMediaKey));
        mediaUrls.delete(data.about.profileMediaKey);
        await dbDelete(data.about.profileMediaKey);
      }
      data.about.profileMediaKey = "";
      data.about.profileMediaName = "";
      data.about.profileImage = "";
      saveDraft();
      renderPage();
      renderEditor();
    });

    return item;
  }

  function openEditor() {
    renderEditor();
    $("[data-editor]").hidden = false;
    $("[data-editor-backdrop]").hidden = false;
  }

  function closeEditor() {
    $("[data-editor]").hidden = true;
    $("[data-editor-backdrop]").hidden = true;
  }

  function renderPage() {
    setText("[data-site-name]", data.siteName || "AIGC Portfolio");
    setText("[data-menu-label]", data.navigation.menuLabel);
    setText("[data-nav-about]", data.navigation.about);
    setText("[data-nav-gallery]", data.navigation.gallery);
    setText("[data-hero-kicker]", data.hero.kicker);
    setText("[data-hero-brand]", data.hero.brand || "Inspired Creation");
    setText("[data-hero-badge]", data.hero.badge || "Generative AI");
    setText("[data-hero-title]", data.hero.title);
    setText("[data-hero-subtitle]", data.hero.subtitle);
    setText(".button-dark", data.hero.primaryButton);
    renderHeroVisual();
    renderTags($("[data-hero-tags]"), data.hero.tags);

    setText("[data-about-label]", data.about.label);
    setText("[data-about-title]", data.about.title);
    setText("[data-about-lead]", data.about.lead);
    $("[data-about-lead]").hidden = !data.about.lead;
    setText("[data-about-body]", data.about.body);
    renderProfileMedia();
    const facts = $("[data-profile-facts]");
    facts.replaceChildren(
      ...data.about.facts.map(([term, value]) => {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = `<dt>${term}</dt><dd>${value}</dd>`;
        return wrapper;
      })
    );
    setText("[data-gallery-label]", data.gallery.label);
    setText("[data-gallery-title]", data.gallery.title);
    $("[data-gallery-title]").hidden = !data.gallery.title;
    renderTabs();
    renderGallery();

    setText("[data-skills-label]", data.skills.label);
    setText("[data-skills-title]", data.skills.title);
    const skills = $("[data-skills]");
    skills.replaceChildren(
      ...data.skills.items.map((skill) => {
        const card = document.createElement("article");
        card.className = "skill-card";
        card.innerHTML = `<div><strong>${skill.name}</strong><span>${skill.level}</span></div><p>${skill.description}</p>`;
        return card;
      })
    );

    setText("[data-contact-label]", data.contact.label);
    setText("[data-contact-title]", data.contact.title);
    setText("[data-contact-text]", data.contact.text);
    setText("[data-copyright]", data.contact.copyright);

    const links = $("[data-contact-links]");
    if (links) {
      links.replaceChildren(
        ...data.contact.links.map((link) => {
          const el = link.href ? document.createElement("a") : document.createElement("span");
          el.textContent = link.label;
          if (link.href) el.href = link.href;
          return el;
        })
      );
    }
    const contactTags = $("[data-contact-tags]");
    if (contactTags) renderTags(contactTags, data.contact.tags);
  }

  async function init() {
    data.gallery.projects.forEach(getProjectId);
    await hydrateMedia();
    renderPage();

    document.body.classList.toggle("edit-enabled", canEdit);
    if (!canEdit) {
      $("[data-editor-open]").hidden = true;
      $("[data-editor]").remove();
      $("[data-editor-backdrop]").remove();
      $("[data-hero-image-picker]").remove();
      $("[data-profile-image-picker]").remove();
    }

    if (canEdit) {
      const profilePicker = $("[data-profile-image-picker]");
      const heroPicker = $("[data-hero-image-picker]");
      heroPicker.addEventListener("change", async () => {
        const file = heroPicker.files[0];
        if (file) await saveHeroImage(file);
        heroPicker.value = "";
      });
      $("[data-hero-visual]").addEventListener("click", () => {
        if (heroMoved) {
          heroMoved = false;
          return;
        }
        heroPicker.click();
      });
      $("[data-hero-visual]").addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        if (event.target.closest(".hero-visual-resize")) {
          event.preventDefault();
          event.stopPropagation();
          heroResizing = true;
          heroMoved = true;
          heroResizeStart = { x: event.clientX, scale: data.hero.visualScale || 1 };
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
        heroDragging = true;
        heroMoved = false;
        const offset = data.hero.visualOffset || { x: 0, y: 0 };
        heroDragStart = { x: event.clientX - offset.x, y: event.clientY - offset.y };
        event.currentTarget.setPointerCapture(event.pointerId);
      });
      $("[data-hero-visual]").addEventListener("pointermove", (event) => {
        if (heroResizing) {
          const nextScale = heroResizeStart.scale + (event.clientX - heroResizeStart.x) / 260;
          updateHeroVisualScale(nextScale);
          return;
        }
        if (!heroDragging) return;
        const nextX = event.clientX - heroDragStart.x;
        const nextY = event.clientY - heroDragStart.y;
        if (Math.abs(nextX - (data.hero.visualOffset?.x || 0)) > 2 || Math.abs(nextY - (data.hero.visualOffset?.y || 0)) > 2) {
          heroMoved = true;
        }
        updateHeroVisualPosition(nextX, nextY);
      });
      $("[data-hero-visual]").addEventListener("pointerup", (event) => {
        if (!heroDragging && !heroResizing) return;
        heroDragging = false;
        heroResizing = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        saveDraft();
      });
      $("[data-hero-visual]").addEventListener("pointercancel", () => {
        heroDragging = false;
        heroResizing = false;
      });
      $("[data-hero-visual]").addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          heroPicker.click();
        }
      });
      profilePicker.addEventListener("change", async () => {
        const file = profilePicker.files[0];
        if (file) await saveProfileImage(file);
        profilePicker.value = "";
      });
      $("[data-profile-placeholder]").addEventListener("click", () => profilePicker.click());
      $("[data-profile-placeholder]").addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          profilePicker.click();
        }
      });
      $("[data-editor-open]").addEventListener("click", openEditor);
      $("[data-editor-close]").addEventListener("click", closeEditor);
      $("[data-editor-backdrop]").addEventListener("click", closeEditor);
      $("[data-export-site]").addEventListener("click", (event) => exportPublishPackage(event.currentTarget));
      $("[data-editor-reset]").addEventListener("click", () => {
        storageRemove("portfolioContentDraft");
        location.reload();
      });
    }

    $("[data-modal-close]").addEventListener("click", closeModal);
    $("[data-modal]").addEventListener("click", (event) => {
      if (event.target.matches("[data-modal]")) closeModal();
    });
    $("[data-modal-media]").addEventListener(
      "wheel",
      (event) => {
        if ($("[data-modal]").hidden || !event.target.matches("[data-modal-media] > img, [data-modal-media] > video")) return;
        event.preventDefault();
        zoomModalMedia(event.deltaY < 0 ? 0.22 : -0.22, event);
      },
      { passive: false }
    );
    $("[data-modal-media]").addEventListener("pointerdown", (event) => {
      if (modalScale <= 1.01 || !event.target.matches("[data-modal-media] > img, [data-modal-media] > video")) return;
      event.preventDefault();
      modalDragging = true;
      modalDragStart = { x: event.clientX - modalX, y: event.clientY - modalY };
      renderModalZoom();
      event.currentTarget.setPointerCapture(event.pointerId);
    });
    $("[data-modal-media]").addEventListener("pointermove", (event) => {
      if (!modalDragging) return;
      modalX = event.clientX - modalDragStart.x;
      modalY = event.clientY - modalDragStart.y;
      renderModalZoom();
    });
    $("[data-modal-media]").addEventListener("pointerup", (event) => {
      modalDragging = false;
      renderModalZoom();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    });
    $("[data-modal-media]").addEventListener("pointercancel", () => {
      modalDragging = false;
      renderModalZoom();
    });
    $("[data-media-lightbox-close]").addEventListener("click", closeMediaLightbox);
    let lightboxSwipeX = 0;
    let lightboxSwipeY = 0;
    $("[data-media-lightbox]").addEventListener(
      "touchstart",
      (event) => {
        lightboxSwipeX = event.touches[0].clientX;
        lightboxSwipeY = event.touches[0].clientY;
      },
      { passive: true }
    );
    $("[data-media-lightbox]").addEventListener(
      "touchend",
      (event) => {
        if (lightboxList.length < 2 || lightboxScale > 1.01) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - lightboxSwipeX;
        const dy = touch.clientY - lightboxSwipeY;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          stepMediaLightbox(dx < 0 ? 1 : -1);
        }
      },
      { passive: true }
    );
    $("[data-media-lightbox]").addEventListener("click", (event) => {
      if (event.target.matches("[data-media-lightbox]")) closeMediaLightbox();
    });
    $("[data-media-lightbox-body]").addEventListener("click", (event) => {
      if (event.target.matches("[data-media-lightbox-body]")) closeMediaLightbox();
    });
    $("[data-media-lightbox-body]").addEventListener(
      "wheel",
      (event) => {
        if ($("[data-media-lightbox]").hidden) return;
        event.preventDefault();
        zoomLightbox(event.deltaY < 0 ? 0.22 : -0.22, event);
      },
      { passive: false }
    );
    $("[data-media-lightbox-body]").addEventListener("pointerdown", (event) => {
      lightboxTapStart = { x: event.clientX, y: event.clientY };
      if (lightboxScale <= 1.01 || !event.target.matches("img, video")) return;
      event.preventDefault();
      lightboxDragging = true;
      lightboxDragStart = { x: event.clientX - lightboxX, y: event.clientY - lightboxY };
      renderLightboxZoom();
      event.currentTarget.setPointerCapture(event.pointerId);
    });
    $("[data-media-lightbox-body]").addEventListener("pointermove", (event) => {
      if (!lightboxDragging) return;
      lightboxX = event.clientX - lightboxDragStart.x;
      lightboxY = event.clientY - lightboxDragStart.y;
      renderLightboxZoom();
    });
    $("[data-media-lightbox-body]").addEventListener("pointerup", (event) => {
      const moved = Math.hypot(event.clientX - lightboxTapStart.x, event.clientY - lightboxTapStart.y);
      lightboxDragging = false;
      if (event.target.matches("img, video") && moved < 8) {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        closeMediaLightbox();
        return;
      }
      renderLightboxZoom();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    });
    $("[data-media-lightbox-body]").addEventListener("pointercancel", () => {
      lightboxDragging = false;
      renderLightboxZoom();
    });
      if (event.key === "ArrowLeft" && !$("[data-media-lightbox]").hidden) {
        stepMediaLightbox(-1);
        return;
      }
      if (event.key === "ArrowRight" && !$("[data-media-lightbox]").hidden) {
        stepMediaLightbox(1);
        return;
      }
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!$("[data-media-lightbox]").hidden) {
          closeMediaLightbox();
          return;
        }
        if (!$("[data-modal]").hidden) closeModal();
        if (canEdit && !$("[data-editor]").hidden) closeEditor();
      }
    });
  }

  init();
})();
