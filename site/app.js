(async function () {
  const content = document.getElementById('content');
  const sidenav = document.getElementById('sidenav');
  const searchInput = document.getElementById('search');
  const modal = document.getElementById('modal');
  const modalContent = document.getElementById('modal-content');
  const headerLogo = document.getElementById('header-logo');
  const headerLogoFallback = document.getElementById('header-logo-fallback');

  const CACHE_KEY = 'brandKitManifestCache';

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeCache(manifest) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(manifest));
    } catch (e) { /* storage unavailable/full — not worth failing over */ }
  }

  const colorsPromise = loadColors();
  const cached = readCache();

  // Show cached data immediately (no spinner, no wait) while a fresh copy
  // loads in the background. First-ever visit has nothing cached yet, so
  // it shows a spinner instead of the plain "Loading…" text.
  if (cached) {
    render(cached.root, await colorsPromise);
    setHeaderLogo(cached.root);
  } else {
    content.innerHTML = '<div class="loading-spinner" aria-label="Loading brand kit"></div>';
  }

  const { manifest, isLive } = await loadManifest();
  const colors = await colorsPromise;
  const manifestChanged = !cached || JSON.stringify(manifest) !== JSON.stringify(cached);
  if (manifestChanged) {
    render(manifest.root, colors);
    setHeaderLogo(manifest.root);
  }
  // Only cache real data (live endpoint or a committed manifest.json) —
  // caching the bundled sample fallback would make a slow/offline visit
  // permanently stick with placeholder content on the next load.
  if (isLive) writeCache(manifest);

  async function loadColors() {
    try {
      const res = await fetch('data/colors.json', { cache: 'no-store' });
      if (res.ok) return (await res.json()).colors || [];
    } catch (e) { /* no colors.json yet */ }
    return [];
  }

  async function loadManifest() {
    // 1. Live Apps Script endpoint (set in config.js) — always current.
    const liveUrl = window.BRAND_KIT_CONFIG && window.BRAND_KIT_CONFIG.manifestUrl;
    if (liveUrl) {
      try {
        // Apps Script cold-starts can be slow, and a hung request would
        // otherwise leave the page stuck loading forever — cap it so we
        // always fall through to the other sources.
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(liveUrl, { cache: 'no-store', signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) return { manifest: await res.json(), isLive: true };
        console.warn('manifestUrl responded but not OK, falling back:', res.status);
      } catch (e) {
        console.warn('manifestUrl fetch failed or timed out, falling back:', e);
      }
    }
    // 2. A manifest.json committed alongside the site (e.g. by the
    //    GitHub Actions sync workflow, if you're using that instead).
    try {
      const res = await fetch('data/manifest.json', { cache: 'no-store' });
      if (res.ok) return { manifest: await res.json(), isLive: true };
    } catch (e) { /* fall through */ }
    // 3. Bundled sample data, so the site never shows a blank page.
    const res = await fetch('data/manifest.sample.json');
    return { manifest: await res.json(), isLive: false };
  }

  function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function normalize(name) {
    return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function findMatch(folders, name) {
    const target = normalize(name);
    return (folders || []).find((f) => normalize(f.name) === target);
  }

  // Finds a header logo, preferring the horizontal Grimace (purple) mark.
  // Handles both a flat "Logos & Marks" folder (files directly inside)
  // and the nested Logos > Logotype > Horizontal structure.
  function findHeaderLogoFile(root) {
    const logos = findMatch(root.folders, 'Logos & Marks') || findMatch(root.folders, 'Logos');
    if (!logos) return null;

    let pool = logos.files || [];
    if (!pool.length) {
      const logotype = findMatch(logos.folders, 'Logotype');
      const horizontal = logotype && findMatch(logotype.folders, 'Horizontal');
      pool = (horizontal && horizontal.files && horizontal.files.length)
        ? horizontal.files
        : (logotype && logotype.files) || [];
    }
    if (!pool.length) return null;

    const horizontalFiles = pool.filter((f) => /horizontal/i.test(f.name));
    const candidates = horizontalFiles.length ? horizontalFiles : pool;
    return candidates.find((f) => /grimace|purple/i.test(f.name) && /\.svg$/i.test(f.name))
      || candidates.find((f) => /grimace|purple/i.test(f.name))
      || candidates[0];
  }

  function setHeaderLogo(root) {
    const file = findHeaderLogoFile(root);
    if (file && file.thumbnailUrl) {
      // If the image fails to load for any reason (deleted file, a
      // network hiccup), fall back to the text mark instead of leaving
      // a broken-image icon in the header.
      headerLogo.onerror = () => {
        headerLogo.hidden = true;
        headerLogoFallback.hidden = false;
      };
      headerLogo.alt = file.name;
      headerLogo.src = file.thumbnailUrl;
      headerLogo.hidden = false;
      headerLogoFallback.hidden = true;
    } else {
      headerLogo.hidden = true;
      headerLogoFallback.hidden = false;
    }
  }

  function kindLabel(kind) {
    return { image: 'Image', video: 'Video', pdf: 'PDF', folder: 'Folder', other: 'File' }[kind] || 'File';
  }

  function fileCard(file) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-thumb">${file.thumbnailUrl ? `<img loading="lazy" src="${file.thumbnailUrl}" alt="" referrerpolicy="no-referrer">` : ''}</div>
      <div class="card-body">
        <div class="card-name" title="${file.name}">${file.name}</div>
        <div class="card-kind">${kindLabel(file.kind)}</div>
      </div>`;
    card.addEventListener('click', () => openModal(file));
    return card;
  }

  function openModal(file) {
    let preview = '';
    if (file.kind === 'image') {
      preview = `<img src="${file.thumbnailUrl}" alt="${file.name}" referrerpolicy="no-referrer">`;
    } else if (file.kind === 'video') {
      preview = `<iframe src="${file.viewUrl}" allow="autoplay" width="640" height="480" frameborder="0"></iframe>`;
    } else {
      preview = `<div class="card-thumb"><img src="${file.thumbnailUrl}" alt="" referrerpolicy="no-referrer"></div>`;
    }
    modalContent.innerHTML = `
      <h3>${file.name}</h3>
      ${preview}
      <div class="modal-actions">
        <a class="btn" href="${file.downloadUrl}" target="_blank" rel="noopener">Download</a>
        <a class="btn secondary" href="${file.viewUrl}" target="_blank" rel="noopener">Open in Drive</a>
      </div>`;
    modal.hidden = false;
  }

  modal.addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close')) modal.hidden = true;
  });

  function subsectionEl(folder, parentSlug) {
    const slug = `${parentSlug}-${slugify(folder.name)}`;
    const wrap = document.createElement('div');
    wrap.className = 'subsection' + (folder.isDont ? ' is-dont' : '');
    wrap.id = slug;

    const h3 = document.createElement('h3');
    h3.textContent = (folder.isDont ? '⚠ ' : '') + folder.name;
    wrap.appendChild(h3);

    if (folder.description) {
      const p = document.createElement('p');
      p.className = 'section-desc';
      p.textContent = folder.description;
      wrap.appendChild(p);
    }

    const files = folder.files || [];
    if (files.length) {
      const grid = document.createElement('div');
      grid.className = 'grid';
      files.forEach((f) => grid.appendChild(fileCard(f)));
      wrap.appendChild(grid);
    } else if (!(folder.folders && folder.folders.length)) {
      const note = document.createElement('p');
      note.className = 'empty-note';
      note.textContent = 'No assets yet.';
      wrap.appendChild(note);
    }

    (folder.folders || []).forEach((sub) => wrap.appendChild(subsectionEl(sub, slug)));
    return wrap;
  }

  function hexToRgbString(rgb) {
    return rgb ? `RGB ${rgb.join('/')}` : '';
  }

  function readableTextColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#171E43' : '#ffffff';
  }

  // Tint shades are sampled directly from the swatch sheet's pixels
  // (see site/data/colors.json), not computed — this just renders them.
  function tintRow(color) {
    if (!color.tints || !color.tints.length) return '';
    const chips = color.tints.map((t) => {
      const label = t.label || `${color.name} ${t.pct}%`;
      return `<div class="tint-chip" style="background:${t.hex}" data-hex="${t.hex}" title="${label} — ${t.hex.toUpperCase()} (click to copy)"></div>`;
    }).join('');
    return `<div class="tint-row">${chips}</div>`;
  }

  function colorCard(color) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'color-card';
    card.style.setProperty('--swatch', color.hex);
    card.style.setProperty('--swatch-text', readableTextColor(color.hex));
    const codeLines = [
      color.hex.toUpperCase(),
      hexToRgbString(color.rgb),
      color.cmyk ? `CMYK ${color.cmyk.join('/')}` : '',
      color.pms ? `PMS ${color.pms}` : '',
    ].filter(Boolean);
    card.innerHTML = `
      <div class="color-swatch">
        <div class="color-name">${color.name}</div>
        ${tintRow(color)}
      </div>
      <div class="color-body">
        ${codeLines.map((line) => `<div class="color-code">${line}</div>`).join('')}
      </div>`;
    card.title = 'Click to copy hex';
    card.addEventListener('click', () => {
      navigator.clipboard?.writeText(color.hex).catch(() => {});
      card.classList.add('copied');
      setTimeout(() => card.classList.remove('copied'), 900);
    });
    card.querySelectorAll('.tint-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(chip.dataset.hex).catch(() => {});
      });
    });
    return card;
  }

  function buildColorsSection(colors) {
    const section = document.createElement('section');
    section.className = 'section';
    section.id = 'colors';

    const h2 = document.createElement('h2');
    h2.textContent = 'Colors';
    section.appendChild(h2);

    const p = document.createElement('p');
    p.className = 'section-desc';
    p.textContent = 'Click a swatch to copy its hex code.';
    section.appendChild(p);

    const grid = document.createElement('div');
    grid.className = 'color-grid';
    colors.forEach((c) => grid.appendChild(colorCard(c)));
    section.appendChild(grid);

    return section;
  }

  function navLink(href, text, extraClass) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    if (extraClass) a.className = extraClass;
    return a;
  }

  function navDisabled(text, extraClass) {
    const span = document.createElement('span');
    span.textContent = text;
    span.className = 'nav-disabled' + (extraClass ? ' ' + extraClass : '');
    span.title = 'Not added to Drive yet';
    return span;
  }

  function buildSection(folder, slug) {
    const section = document.createElement('section');
    section.className = 'section';
    section.id = slug;

    const h2 = document.createElement('h2');
    h2.textContent = folder.name;
    section.appendChild(h2);

    if (folder.description) {
      const p = document.createElement('p');
      p.className = 'section-desc';
      p.textContent = folder.description;
      section.appendChild(p);
    }

    const files = folder.files || [];
    if (files.length) {
      const grid = document.createElement('div');
      grid.className = 'grid';
      files.forEach((f) => grid.appendChild(fileCard(f)));
      section.appendChild(grid);
    }

    (folder.folders || []).forEach((sub) => section.appendChild(subsectionEl(sub, slug)));
    return section;
  }

  // Renders one planned category against whatever's actually live in
  // Drive: matched categories get real nav links + content; unmatched
  // ones (and their planned children) render greyed out and unlinked.
  function renderPlannedCategory(planned, liveFolders, matchedLiveFolders) {
    const slug = slugify(planned.name);
    const live = findMatch(liveFolders, planned.name);
    const group = document.createElement('div');
    group.className = 'nav-group';

    if (!live) {
      group.appendChild(navDisabled(planned.name));
      (planned.children || []).forEach((sub) => {
        group.appendChild(navDisabled(sub.name, 'sub-link'));
      });
      sidenav.appendChild(group);
      return null;
    }

    matchedLiveFolders.add(live);
    group.appendChild(navLink(`#${slug}`, planned.name));

    const liveSubfolders = live.folders || [];
    const matchedSub = new Set();
    (planned.children || []).forEach((sub) => {
      const liveSub = findMatch(liveSubfolders, sub.name);
      const subSlug = `${slug}-${slugify(sub.name)}`;
      if (liveSub) {
        matchedSub.add(liveSub);
        group.appendChild(navLink(`#${subSlug}`, sub.name, 'sub-link'));
      } else {
        group.appendChild(navDisabled(sub.name, 'sub-link'));
      }
    });

    // Any real subfolder not covered by the planned list still gets a
    // nav link — new folders in Drive are never hidden by this file
    // being out of date.
    liveSubfolders.filter((f) => !matchedSub.has(f)).forEach((f) => {
      group.appendChild(navLink(`#${slug}-${slugify(f.name)}`, f.name, 'sub-link'));
    });

    sidenav.appendChild(group);
    return buildSection(live, slug);
  }

  function render(root, colors) {
    content.innerHTML = '';
    sidenav.innerHTML = '';

    if (colors && colors.length) {
      sidenav.appendChild(navLink('#colors', 'Colors'));
      content.appendChild(buildColorsSection(colors));
    }

    const liveFolders = root.folders || [];
    const matchedLiveFolders = new Set();
    const taxonomy = window.PLANNED_TAXONOMY || [];

    taxonomy.forEach((planned) => {
      const section = renderPlannedCategory(planned, liveFolders, matchedLiveFolders);
      if (section) content.appendChild(section);
    });

    // Real top-level folders that aren't part of the planned taxonomy at
    // all (e.g. a brand-new category) still render normally, appended
    // after the planned ones.
    // Skip a live "Colors" folder — the curated colors.json section above
    // already covers it and shares the same #colors anchor.
    liveFolders.filter((f) => !matchedLiveFolders.has(f) && normalize(f.name) !== 'colors').forEach((folder) => {
      const slug = slugify(folder.name);
      const group = document.createElement('div');
      group.className = 'nav-group';
      group.appendChild(navLink(`#${slug}`, folder.name));
      (folder.folders || []).forEach((sub) => {
        group.appendChild(navLink(`#${slug}-${slugify(sub.name)}`, sub.name, 'sub-link'));
      });
      sidenav.appendChild(group);
      content.appendChild(buildSection(folder, slug));
    });
  }

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    document.querySelectorAll('.card').forEach((card) => {
      const name = card.querySelector('.card-name').textContent.toLowerCase();
      card.style.display = !q || name.includes(q) ? '' : 'none';
    });
  });
})();
