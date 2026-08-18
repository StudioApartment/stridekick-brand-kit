(async function () {
  const content = document.getElementById('content');
  const sidenav = document.getElementById('sidenav');
  const searchInput = document.getElementById('search');
  const modal = document.getElementById('modal');
  const modalContent = document.getElementById('modal-content');
  let colorLibrary = [];
  const DONT_PATTERN = /don'?t|not to do|no's\b|what not/i;

  const homeLink = document.getElementById('home-link');
  if (homeLink) {
    homeLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      history.pushState('', document.title, window.location.pathname + window.location.search);
    });
  }

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
  } else {
    content.innerHTML = '<div class="loading-spinner" aria-label="Loading brand kit"></div>';
  }

  const { manifest, isLive } = await loadManifest();
  const colors = await colorsPromise;
  const manifestChanged = !cached || JSON.stringify(manifest) !== JSON.stringify(cached);
  if (manifestChanged) {
    render(manifest.root, colors);
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

  function kindLabel(kind) {
    return { image: 'Image', video: 'Video', pdf: 'PDF', folder: 'Folder', other: 'File' }[kind] || 'File';
  }

  function findColorHex(name) {
    const match = colorLibrary.find((c) => c.name.toLowerCase() === name.toLowerCase());
    return match && match.hex;
  }

  function findTintHex(name, pct) {
    const match = colorLibrary.find((c) => c.name.toLowerCase() === name.toLowerCase());
    const tint = match && match.tints && match.tints.find((t) => t.pct === pct);
    return (tint && tint.hex) || (match && match.hex);
  }

  // A few harmonizing backdrops per logo-ink color, so the cards for one
  // color's variants (horizontal/vertical, png/svg) don't all look
  // identical — cycled by each file's position within its family.
  function logoBackdropPalette(fileName) {
    if (/grimace/i.test(fileName)) {
      return [findColorHex('Manilla Folder'), findTintHex('Peach', 20), findTintHex('Hello Kitty', 20), findTintHex('Baja Blast', 20)];
    }
    if (/midnight/i.test(fileName)) {
      return [findColorHex('Butter'), findTintHex('Butter', 80), findColorHex('Slime'), findTintHex('Slime', 60)];
    }
    if (/white/i.test(fileName)) {
      return [findColorHex('Grimace'), findColorHex('Blueberry'), findColorHex('Ruby'), findColorHex('Terracotta')];
    }
    return null;
  }

  function logoBackdrop(fileName, index) {
    const palette = logoBackdropPalette(fileName);
    return palette && palette.length ? palette[index % palette.length] : null;
  }

  // Groups Stridekick-{Color}-{Orientation}.{ext} files so the PNG and
  // SVG of the same mark share one card instead of two separate ones.
  function groupLogoFiles(files) {
    const groups = [];
    const byBase = new Map();
    files.forEach((f) => {
      const match = f.name.match(/^(.*)\.([^.]+)$/);
      const base = match ? match[1] : f.name;
      const ext = match ? match[2].toUpperCase() : '';
      if (!byBase.has(base)) {
        const group = { base, files: [] };
        byBase.set(base, group);
        groups.push(group);
      }
      byBase.get(base).files.push({ ...f, ext });
    });
    return groups;
  }

  function logoCard(group, index) {
    const card = document.createElement('div');
    card.className = 'card';
    const primaryFile = group.files.find((f) => f.ext === 'SVG') || group.files[0];
    const backdrop = logoBackdrop(group.base, index);
    const thumbClass = 'card-thumb is-logo' + (/vertical/i.test(group.base) ? ' is-vertical' : '');
    const thumbStyle = backdrop ? ` style="background:${backdrop}"` : '';

    const parts = group.base.split('-').filter(Boolean);
    const color = parts[1] || '';
    const orientation = parts[2] || '';
    const label = orientation && color ? `${orientation} - ${color}` : group.base;

    const formatLinks = group.files
      .slice()
      .sort((a, b) => a.ext.localeCompare(b.ext))
      .map((f) => `<a href="${f.downloadUrl}" target="_blank" rel="noopener" class="format-link">${f.ext}</a>`)
      .join('');

    card.innerHTML = `
      <div class="${thumbClass}"${thumbStyle}>${primaryFile.thumbnailUrl ? `<img loading="lazy" src="${primaryFile.thumbnailUrl}" alt="" referrerpolicy="no-referrer">` : ''}</div>
      <div class="card-body">
        <div class="logo-name">${label}</div>
        <div class="format-links">${formatLinks}</div>
      </div>`;

    // Clicking the card itself (not a specific PNG/SVG link) downloads
    // both formats bundled as one zip.
    card.addEventListener('click', (e) => {
      if (e.target.closest('.format-link')) return;
      downloadLogoZip(group, label);
    });
    return card;
  }

  function base64ToBlob(base64, mimeType) {
    const bytes = atob(base64);
    const array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
    return new Blob([array], { type: mimeType });
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadLogoZip(group, label) {
    const ids = group.files.map((f) => f.id).filter(Boolean);
    const liveUrl = window.BRAND_KIT_CONFIG && window.BRAND_KIT_CONFIG.manifestUrl;
    // Zip bundling needs the Apps Script endpoint and real Drive file IDs
    // (the bundled sample data has neither) — fall back to just opening
    // one file's Drive page rather than failing silently.
    if (!liveUrl || ids.length < 2) {
      const fallback = group.files[0];
      if (fallback) window.open(fallback.viewUrl, '_blank', 'noopener');
      return;
    }
    try {
      const zipUrl = `${liveUrl}${liveUrl.includes('?') ? '&' : '?'}zip=${ids.join(',')}&name=${encodeURIComponent(label)}`;
      const res = await fetch(zipUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error('zip endpoint responded ' + res.status);
      const { zipBase64, filename } = await res.json();
      triggerDownload(base64ToBlob(zipBase64, 'application/zip'), filename || `${label}.zip`);
    } catch (e) {
      console.warn('Zip download failed, opening file in Drive instead:', e);
      window.open(group.files[0].viewUrl, '_blank', 'noopener');
    }
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

  // Groups Logotype's flat file list into one card per color+orientation
  // (pairing each mark's PNG and SVG), cycling backdrops per-color-family
  // so Grimace/Midnight/White each get their own harmonizing progression.
  function logotypeSubsectionEl(name, parentSlug, files) {
    const slug = `${parentSlug}-${slugify(name)}`;
    const wrap = document.createElement('div');
    wrap.className = 'subsection';
    wrap.id = slug;

    const h3 = document.createElement('h3');
    h3.textContent = name;
    wrap.appendChild(h3);

    const groups = groupLogoFiles(files);
    // Horizontals first as one row, then verticals as the next.
    const horizontals = groups.filter((g) => !/vertical/i.test(g.base));
    const verticals = groups.filter((g) => /vertical/i.test(g.base));
    const familyCounts = {};
    const grid = document.createElement('div');
    grid.className = 'grid logo-grid';
    [...horizontals, ...verticals].forEach((g) => {
      const familyKey = /grimace/i.test(g.base) ? 'grimace' : /midnight/i.test(g.base) ? 'midnight' : /white/i.test(g.base) ? 'white' : 'other';
      const index = familyCounts[familyKey] || 0;
      familyCounts[familyKey] = index + 1;
      grid.appendChild(logoCard(g, index));
    });
    wrap.appendChild(grid);

    return wrap;
  }

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

  // Placeholder subsection for a planned child that doesn't have a real
  // Drive folder yet — gives its nav link somewhere to actually jump to,
  // instead of leaving it disabled, for categories we want live early.
  function placeholderSubsectionEl(name, parentSlug) {
    const isDont = DONT_PATTERN.test(name);
    const slug = `${parentSlug}-${slugify(name)}`;
    const wrap = document.createElement('div');
    wrap.className = 'subsection' + (isDont ? ' is-dont' : '');
    wrap.id = slug;

    const h3 = document.createElement('h3');
    h3.textContent = (isDont ? '⚠ ' : '') + name;
    wrap.appendChild(h3);

    const note = document.createElement('p');
    note.className = 'empty-note';
    note.textContent = 'Coming soon — not added to Drive yet.';
    wrap.appendChild(note);

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
      return `<div class="tint-chip" style="background:${t.hex}" data-hex="${t.hex}" data-tooltip="${label} — ${t.hex.toUpperCase()}" aria-label="${label}, ${t.hex.toUpperCase()}, click to copy"></div>`;
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
      // Always show a PMS line, even blank, so every card has the same
      // shape until the real Pantone matches are filled in.
      color.pms ? `PMS ${color.pms}` : 'PMS',
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
    grid.id = 'colors-swatches';
    colors.forEach((c) => grid.appendChild(colorCard(c)));
    section.appendChild(grid);

    section.appendChild(placeholderSubsectionEl('Colors In Use', 'colors'));
    section.appendChild(placeholderSubsectionEl('What Not To Do', 'colors'));

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
    span.title = 'Adding soon';
    return span;
  }

  function buildSection(folder, slug) {
    const section = document.createElement('section');
    section.className = 'section';
    section.id = slug;
    const isLogo = normalize(folder.name) === 'logos marks';

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

    if (isLogo) {
      // Logos & Marks is flat in Drive (no real subfolders) — route its
      // files into the planned "Logotype" subsection instead of a bare
      // top-level grid, and give the other planned children (Symbol, Pro,
      // What Not To Do) a placeholder to jump to until they're real.
      const planned = (window.PLANNED_TAXONOMY || []).find((p) => normalize(p.name) === 'logos marks');
      (planned && planned.children || []).forEach((child) => {
        if (normalize(child.name) === 'logotype') {
          section.appendChild(logotypeSubsectionEl(child.name, slug, files));
        } else {
          section.appendChild(placeholderSubsectionEl(child.name, slug));
        }
      });
    } else {
      if (files.length) {
        const grid = document.createElement('div');
        grid.className = 'grid';
        files.forEach((f) => grid.appendChild(fileCard(f)));
        section.appendChild(grid);
      }
      (folder.folders || []).forEach((sub) => section.appendChild(subsectionEl(sub, slug)));
    }

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

    // Logos & Marks gets placeholder subsections (see buildSection) for
    // any planned child not yet in Drive, so its nav links can jump to
    // something instead of sitting disabled.
    const isLogo = slug === 'logos-marks';
    const liveSubfolders = live.folders || [];
    const matchedSub = new Set();
    (planned.children || []).forEach((sub) => {
      const liveSub = findMatch(liveSubfolders, sub.name);
      const subSlug = `${slug}-${slugify(sub.name)}`;
      if (liveSub) {
        matchedSub.add(liveSub);
        group.appendChild(navLink(`#${subSlug}`, sub.name, 'sub-link'));
      } else if (isLogo) {
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
    colorLibrary = colors || [];

    const liveFolders = root.folders || [];
    const matchedLiveFolders = new Set();
    const taxonomy = window.PLANNED_TAXONOMY || [];

    // Colors sits right after Logos & Marks (the first planned category),
    // ahead of the rest of the taxonomy.
    const [firstCategory, ...restCategories] = taxonomy;

    if (firstCategory) {
      const section = renderPlannedCategory(firstCategory, liveFolders, matchedLiveFolders);
      if (section) content.appendChild(section);
    }

    if (colors && colors.length) {
      const group = document.createElement('div');
      group.className = 'nav-group';
      group.appendChild(navLink('#colors', 'Colors'));
      group.appendChild(navLink('#colors-swatches', 'Swatches', 'sub-link'));
      group.appendChild(navLink('#colors-colors-in-use', 'Colors In Use', 'sub-link'));
      group.appendChild(navLink('#colors-what-not-to-do', 'What Not To Do', 'sub-link'));
      sidenav.appendChild(group);
      content.appendChild(buildColorsSection(colors));
    }

    restCategories.forEach((planned) => {
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
