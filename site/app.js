(async function () {
  const content = document.getElementById('content');
  const sidenav = document.getElementById('sidenav');
  const searchInput = document.getElementById('search');
  const modal = document.getElementById('modal');
  const modalContent = document.getElementById('modal-content');
  const headerLogo = document.getElementById('header-logo');
  const headerLogoFallback = document.getElementById('header-logo-fallback');

  const manifest = await loadManifest();
  render(manifest.root);
  setHeaderLogo(manifest.root);

  async function loadManifest() {
    // 1. Live Apps Script endpoint (set in config.js) — always current.
    const liveUrl = window.BRAND_KIT_CONFIG && window.BRAND_KIT_CONFIG.manifestUrl;
    if (liveUrl) {
      try {
        const res = await fetch(liveUrl, { cache: 'no-store' });
        if (res.ok) return await res.json();
        console.warn('manifestUrl responded but not OK, falling back:', res.status);
      } catch (e) {
        console.warn('manifestUrl fetch failed, falling back:', e);
      }
    }
    // 2. A manifest.json committed alongside the site (e.g. by the
    //    GitHub Actions sync workflow, if you're using that instead).
    try {
      const res = await fetch('data/manifest.json', { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (e) { /* fall through */ }
    // 3. Bundled sample data, so the site never shows a blank page.
    const res = await fetch('data/manifest.sample.json');
    return await res.json();
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

  // Finds a header logo from Logos > Logotype > Horizontal (preferring a
  // file with "purple" in the name), falling back one level up if that
  // exact structure isn't there yet.
  function findHeaderLogoFile(root) {
    const logos = findMatch(root.folders, 'Logos');
    const logotype = logos && findMatch(logos.folders, 'Logotype');
    const horizontal = logotype && findMatch(logotype.folders, 'Horizontal');
    const pool = (horizontal && horizontal.files && horizontal.files.length)
      ? horizontal.files
      : (logotype && logotype.files) || [];
    if (!pool.length) return null;
    return pool.find((f) => /purple/i.test(f.name)) || pool[0];
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
      <div class="card-thumb">${file.thumbnailUrl ? `<img loading="lazy" src="${file.thumbnailUrl}" alt="">` : ''}</div>
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
      preview = `<img src="${file.thumbnailUrl}" alt="${file.name}">`;
    } else if (file.kind === 'video') {
      preview = `<iframe src="${file.viewUrl}" allow="autoplay" width="640" height="480" frameborder="0"></iframe>`;
    } else {
      preview = `<div class="card-thumb"><img src="${file.thumbnailUrl}" alt=""></div>`;
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

    if (!live) {
      sidenav.appendChild(navDisabled(planned.name));
      (planned.children || []).forEach((sub) => {
        sidenav.appendChild(navDisabled(sub.name, 'sub-link'));
      });
      return null;
    }

    matchedLiveFolders.add(live);
    sidenav.appendChild(navLink(`#${slug}`, planned.name));

    const liveSubfolders = live.folders || [];
    const matchedSub = new Set();
    (planned.children || []).forEach((sub) => {
      const liveSub = findMatch(liveSubfolders, sub.name);
      const subSlug = `${slug}-${slugify(sub.name)}`;
      if (liveSub) {
        matchedSub.add(liveSub);
        sidenav.appendChild(navLink(`#${subSlug}`, sub.name, 'sub-link'));
      } else {
        sidenav.appendChild(navDisabled(sub.name, 'sub-link'));
      }
    });

    // Any real subfolder not covered by the planned list still gets a
    // nav link — new folders in Drive are never hidden by this file
    // being out of date.
    liveSubfolders.filter((f) => !matchedSub.has(f)).forEach((f) => {
      sidenav.appendChild(navLink(`#${slug}-${slugify(f.name)}`, f.name, 'sub-link'));
    });

    return buildSection(live, slug);
  }

  function render(root) {
    content.innerHTML = '';
    sidenav.innerHTML = '';

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
    liveFolders.filter((f) => !matchedLiveFolders.has(f)).forEach((folder) => {
      const slug = slugify(folder.name);
      sidenav.appendChild(navLink(`#${slug}`, folder.name));
      (folder.folders || []).forEach((sub) => {
        sidenav.appendChild(navLink(`#${slug}-${slugify(sub.name)}`, sub.name, 'sub-link'));
      });
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
