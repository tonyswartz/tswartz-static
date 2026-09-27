const WORLD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const US_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

export async function initTravelMap(root, mode = 'world') {
  if (!root) return;
  if (mode === 'world') return initWorldMap(root);
  return initStatesMap(root);
}

async function initWorldMap(root) {
  if (root.dataset.worldReady === '1') return;
  root.dataset.worldReady = '1';

  const intro = root.querySelector('[data-travel-view="world"] .travel-intro');
  try {
    const res = await fetch('/travel/countries.json');
    if (!res.ok) throw new Error(`countries.json ${res.status}`);
    const data = await res.json();
    const visited = new Set(data.visitedIsoNums);

    renderGallery(root.querySelector('[data-gallery]'), data.countries, 'countries');
    renderContinents(
      root.querySelector('[data-continents]'),
      data.byContinent,
      data.count,
      'countries',
    );

    root._worldCleanup = await renderGlobe(root.querySelector('[data-globe]'), visited);
  } catch (err) {
    console.error('initWorldMap failed', err);
    if (intro) intro.textContent = 'Could not load travel stats — try a refresh.';
  }
}

async function initStatesMap(root) {
  if (root.dataset.statesReady === '1') return;
  root.dataset.statesReady = '1';

  const intro = root.querySelector('[data-travel-view="states"] .travel-intro');
  const mapEl = root.querySelector('[data-us-map]');
  try {
    const res = await fetch('/travel/states.json');
    if (!res.ok) throw new Error(`states.json ${res.status}`);
    const data = await res.json();
    const visited = new Set(data.visitedFips);
    const visitedStates = data.states.filter(s => visited.has(s.fips));

    renderGallery(root.querySelector('[data-states-gallery]'), visitedStates, 'states');
    const statesView = root.querySelector('[data-travel-view="states"]');
    if (statesView && data.remaining) statesView.dataset.remaining = data.remaining;
    renderContinents(
      root.querySelector('[data-states-regions]'),
      data.byRegion,
      data.count,
      'states',
    );

    try {
      root._statesCleanup = await renderUsMap(mapEl, visited);
      mapEl?.removeAttribute('aria-hidden');
    } catch (mapErr) {
      console.error('renderUsMap failed', mapErr);
      if (mapEl) {
        mapEl.innerHTML = '<p class="gallery-empty">Map could not load — regions and photos below are still current.</p>';
        mapEl.removeAttribute('aria-hidden');
      }
    }
  } catch (err) {
    console.error('initStatesMap failed', err);
    if (intro) intro.textContent = 'Could not load state stats — try a refresh.';
  }
}

async function renderGlobe(container, visited) {
  if (!container) return () => {};

  const [{ geoOrthographic, geoPath, select }, topojson, world] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/d3@7/+esm'),
    import('https://cdn.jsdelivr.net/npm/topojson-client@3/+esm'),
    fetch(WORLD_URL).then(r => r.json()),
  ]);

  const globeWrap = container.closest('.globe-wrap') || container;
  const isExpanded = () =>
    globeWrap.classList.contains('is-expanded')
    || document.fullscreenElement === globeWrap;

  const measure = () => {
    const w = container.clientWidth || 640;
    const expanded = isExpanded();
    const h = expanded ? Math.round(Math.min(w / 2, window.innerHeight * 0.85)) : Math.min(340, Math.round(w / 2));
    const scale = expanded ? h * 0.48 : h * 0.44;
    return { w, h, scale };
  };

  let { w: width, h: height, scale } = measure();
  const projection = geoOrthographic()
    .scale(scale)
    .translate([width / 2, height / 2])
    .clipAngle(90);
  const path = geoPath(projection);
  const countries = topojson.feature(world, world.objects.countries).features;

  const svg = select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Rotating world map of visited countries');

  svg.append('path')
    .datum({ type: 'Sphere' })
    .attr('class', 'sphere')
    .attr('d', path);

  svg.append('g')
    .selectAll('path')
    .data(countries)
    .join('path')
    .attr('class', d => visited.has(d.id) ? 'region visited' : 'region unvisited')
    .attr('d', path)
    .append('title')
    .text(d => d.properties?.name || '');

  const baseLon = 100;
  const baseLat = 45;
  let rotation = 0;
  let frame = null;
  const applyRotation = () => {
    projection.rotate([baseLon - rotation, -baseLat, 0]);
    svg.selectAll('path.region, path.sphere').attr('d', path);
  };
  const spin = () => {
    rotation = (rotation + 0.18) % 360;
    applyRotation();
    frame = requestAnimationFrame(spin);
  };

  applyRotation();
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    spin();
  }

  const refreshSize = () => {
    ({ w: width, h: height, scale } = measure());
    projection.scale(scale).translate([width / 2, height / 2]);
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    svg.selectAll('path.region, path.sphere').attr('d', path);
  };

  const observer = new ResizeObserver(refreshSize);
  observer.observe(container);
  observer.observe(globeWrap);

  globeWrap.classList.add('is-interactive');
  globeWrap.setAttribute('role', 'button');
  globeWrap.setAttribute('tabindex', '0');
  globeWrap.setAttribute('aria-label', 'Expand globe to full screen');

  const exitExpanded = () => {
    globeWrap.classList.remove('is-expanded');
    document.body.style.overflow = '';
    if (document.fullscreenElement === globeWrap) {
      document.exitFullscreen?.();
    }
    refreshSize();
  };

  const onFullscreenChange = () => {
    if (document.fullscreenElement !== globeWrap) {
      globeWrap.classList.remove('is-expanded');
      document.body.style.overflow = '';
    }
    refreshSize();
  };

  const enterExpanded = () => {
    if (globeWrap.classList.contains('is-expanded') || document.fullscreenElement === globeWrap) {
      exitExpanded();
      return;
    }
    const req = globeWrap.requestFullscreen?.() ?? globeWrap.webkitRequestFullscreen?.();
    if (req && typeof req.then === 'function') {
      req.then(() => refreshSize()).catch(() => {
        globeWrap.classList.add('is-expanded');
        document.body.style.overflow = 'hidden';
        refreshSize();
      });
    } else {
      globeWrap.classList.add('is-expanded');
      document.body.style.overflow = 'hidden';
      refreshSize();
    }
  };

  globeWrap.addEventListener('click', enterExpanded);
  globeWrap.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      enterExpanded();
    }
    if (e.key === 'Escape') exitExpanded();
  });
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && globeWrap.classList.contains('is-expanded')) exitExpanded();
  });

  container.removeAttribute('aria-hidden');

  return () => {
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
    globeWrap.classList.remove('is-interactive', 'is-expanded');
    globeWrap.removeAttribute('role');
    globeWrap.removeAttribute('tabindex');
    globeWrap.removeAttribute('aria-label');
    select(container).selectAll('*').remove();
  };
}

async function renderUsMap(container, visited) {
  if (!container) return () => {};

  const [{ geoAlbersUsa, geoPath, select }, topojson, us] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/d3@7/+esm'),
    import('https://cdn.jsdelivr.net/npm/topojson-client@3/+esm'),
    fetch(US_URL).then(r => r.json()),
  ]);

  const width = container.clientWidth || 640;
  const height = Math.round(width * 0.62);
  const pad = 14;
  const nation = topojson.feature(us, us.objects.nation);
  const projection = geoAlbersUsa().fitExtent([[pad, pad], [width - pad, height - pad]], nation);
  const path = geoPath(projection);
  const states = topojson.feature(us, us.objects.states).features;

  const svg = select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'United States map of visited states');

  svg.append('g')
    .selectAll('path')
    .data(states)
    .join('path')
    .attr('class', d => visited.has(d.id) ? 'region visited' : 'region unvisited')
    .attr('d', path)
    .append('title')
    .text(d => d.properties?.name || '');

  const observer = new ResizeObserver(() => {
    const w = container.clientWidth || width;
    const h = Math.round(w * 0.62);
    projection.fitExtent([[pad, pad], [w - pad, h - pad]], nation);
    svg.attr('viewBox', `0 0 ${w} ${h}`);
    svg.selectAll('path.region').attr('d', path);
  });
  observer.observe(container);

  return () => {
    observer.disconnect();
    select(container).selectAll('*').remove();
  };
}

function galleryThumb(item, unit) {
  if (item.thumb) return item.thumb;
  if (unit === 'states') {
    return `https://picsum.photos/seed/us-${item.abbr.toLowerCase()}/360/270`;
  }
  return '';
}

function renderGallery(container, items, unit = 'countries') {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<p class="gallery-empty">No photos yet for this view.</p>';
    return;
  }
  const cards = items.map(c => {
    const thumb = galleryThumb(c, unit);
    const fallback = `https://picsum.photos/seed/${encodeURIComponent(c.name)}/360/270`;
    return `
    <figure class="gallery-card">
      <img src="${thumb}" alt="${escapeHtml(c.name)}" loading="lazy" width="180" height="120" data-fallback="${escapeHtml(fallback)}" onerror="if(this.dataset.fallback){this.onerror=null;this.src=this.dataset.fallback}">
      <span>${escapeHtml(c.name)}</span>
    </figure>
  `;
  }).join('');
  container.innerHTML = `<div class="gallery-track">${cards}${cards}</div>`;
}

function renderContinents(container, grouped, total, unit) {
  if (!container) return;
  const view = container.closest('.travel-view');
  const intro = view?.querySelector('.travel-intro');
  const label = unit === 'states' ? 'states' : 'countries';
  const labelSingular = unit === 'states' ? 'state' : 'country';
  const remaining = view?.dataset.remaining;

  if (intro) {
    if (total && remaining) {
      intro.innerHTML = `
        <div class="travel-stat">
          <span class="travel-stat-number">${total}</span>
          <span class="travel-stat-label">${label} visited</span>
          <span class="travel-stat-note">${escapeHtml(remaining)} is the only one left.</span>
        </div>`;
    } else if (total) {
      intro.innerHTML = `
        <div class="travel-stat">
          <span class="travel-stat-number">${total}</span>
          <span class="travel-stat-label">${label} visited</span>
        </div>`;
    } else {
      intro.textContent = `No ${label} marked yet — send me your list and I will fill this in.`;
    }
  }

  if (!total) {
    container.innerHTML = '';
    return;
  }

  const blocks = Object.entries(grouped)
    .filter(([, list]) => list.length)
    .map(([region, list]) => `
      <section class="continent-block">
        <h3><span class="continent-name">${escapeHtml(region)}</span> <span class="continent-count">${list.length}</span></h3>
        <ul>${list.map(name => `<li>${escapeHtml(name)}</li>`).join('')}</ul>
      </section>
    `).join('');

  container.innerHTML = blocks;
  container.dataset.unit = labelSingular;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function setActiveTab(root, tab) {
  root.querySelectorAll('[data-travel-tab]').forEach(btn => {
    const active = btn.dataset.travelTab === tab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  root.querySelectorAll('[data-travel-view]').forEach(view => {
    view.hidden = view.dataset.travelView !== tab;
  });
}

function activateTab(root, tab) {
  const onStatesPage = document.body.classList.contains('states-page');
  const onTravelPage = document.body.classList.contains('travel-page') && !onStatesPage;

  if (onStatesPage && tab === 'world') {
    window.location.href = '/travel/';
    return;
  }
  if (onTravelPage && tab === 'states') {
    window.location.href = '/travel/states/';
    return;
  }

  root.dataset.activeTab = tab;
  setActiveTab(root, tab);
  if (tab === 'world') initWorldMap(root);
  else initStatesMap(root);
}

function mountTabs(root) {
  if (!root?.querySelector('[data-travel-tab]')) return;
  if (root.dataset.tabsMounted === '1') return;
  root.dataset.tabsMounted = '1';

  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-travel-tab]');
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();
    activateTab(root, btn.dataset.travelTab);
  });

  activateTab(root, root.dataset.defaultTab || 'world');
}

export function mountTravelModal() {
  const overlay = document.getElementById('travel-overlay');
  const openers = document.querySelectorAll('[data-open-travel]');
  if (!overlay || !openers.length) return;

  const panel = overlay.querySelector('.travel-panel');
  const closeBtn = overlay.querySelector('.travel-close');

  mountTabs(panel);

  const open = () => {
    overlay.hidden = false;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    const tab = panel.dataset.activeTab || panel.querySelector('[data-travel-tab].is-active')?.dataset.travelTab || 'world';
    if (tab === 'world') initWorldMap(panel);
    else initStatesMap(panel);
    closeBtn?.focus();
  };

  const close = () => {
    overlay.classList.remove('is-open');
    overlay.hidden = true;
    document.body.style.overflow = '';
    if (typeof panel?._worldCleanup === 'function') panel._worldCleanup();
    if (typeof panel?._statesCleanup === 'function') panel._statesCleanup();
    panel.dataset.worldReady = '';
    panel.dataset.statesReady = '';
  };

  openers.forEach(el => el.addEventListener('click', e => {
    e.preventDefault();
    open();
  }));

  closeBtn?.addEventListener('click', close);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
  });
}

const panel = document.querySelector('.travel-panel');
if (panel) {
  if (document.body.classList.contains('states-page')) {
    panel.dataset.defaultTab = 'states';
    mountTabs(panel);
  } else if (document.body.classList.contains('travel-page')) {
    mountTabs(panel);
  } else {
    mountTravelModal();
  }
}
