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

  const res = await fetch('/travel/countries.json');
  const data = await res.json();
  const visited = new Set(data.visitedIsoNums);

  root._worldCleanup = await renderGlobe(root.querySelector('[data-globe]'), visited);
  renderGallery(root.querySelector('[data-gallery]'), data.countries);
  renderContinents(
    root.querySelector('[data-continents]'),
    data.byContinent,
    data.count,
    'countries',
  );
}

async function initStatesMap(root) {
  if (root.dataset.statesReady === '1') return;
  root.dataset.statesReady = '1';

  const res = await fetch('/travel/states.json');
  const data = await res.json();
  const visited = new Set(data.visitedFips);
  const visitedStates = data.states.filter(s => visited.has(s.fips));

  root._statesCleanup = await renderUsMap(root.querySelector('[data-us-map]'), visited);
  renderGallery(root.querySelector('[data-states-gallery]'), visitedStates);
  const statesView = root.querySelector('[data-travel-view=\"states\"]');
  if (statesView && data.remaining) statesView.dataset.remaining = data.remaining;
  renderContinents(
    root.querySelector('[data-states-regions]'),
    data.byRegion,
    data.count,
    'states',
  );
}

async function renderGlobe(container, visited) {
  if (!container) return () => {};

  const [{ geoOrthographic, geoPath, select }, topojson, world] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/d3@7/+esm'),
    import('https://cdn.jsdelivr.net/npm/topojson-client@3/+esm'),
    fetch(WORLD_URL).then(r => r.json()),
  ]);

  const width = container.clientWidth || 640;
  const height = Math.min(340, Math.round(width / 2));
  const projection = geoOrthographic()
    .scale(height * 0.44)
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

  let rotation = 0;
  let frame = null;
  const spin = () => {
    rotation = (rotation + 0.18) % 360;
    projection.rotate([-rotation, -12, 0]);
    svg.selectAll('path.region, path.sphere').attr('d', path);
    frame = requestAnimationFrame(spin);
  };

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    spin();
  }

  const observer = new ResizeObserver(() => {
    const w = container.clientWidth || width;
    const h = Math.min(340, Math.round(w / 2));
    projection.scale(h * 0.44).translate([w / 2, h / 2]);
    svg.attr('viewBox', `0 0 ${w} ${h}`);
    svg.selectAll('path.region, path.sphere').attr('d', path);
  });
  observer.observe(container);

  return () => {
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
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
  const projection = geoAlbersUsa().fitSize([width, height], topojson.feature(us, us.objects.nation));
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
    projection.fitSize([w, h], topojson.feature(us, us.objects.nation));
    svg.attr('viewBox', `0 0 ${w} ${h}`);
    svg.selectAll('path.region').attr('d', path);
  });
  observer.observe(container);

  return () => {
    observer.disconnect();
    select(container).selectAll('*').remove();
  };
}

function renderGallery(container, items) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<p class="gallery-empty">No photos yet for this view.</p>';
    return;
  }
  const cards = items.map(c => `
    <figure class="gallery-card">
      <img src="${c.thumb}" alt="${escapeHtml(c.name)}" loading="lazy" width="180" height="120">
      <span>${escapeHtml(c.name)}</span>
    </figure>
  `).join('');
  container.innerHTML = `<div class="gallery-track">${cards}${cards}</div>`;
}

function renderContinents(container, grouped, total, unit) {
  if (!container) return;
  const intro = container.closest('.travel-view')?.querySelector('.travel-intro');
  const label = unit === 'states' ? 'states' : 'countries';
  if (intro) {
    const remaining = container.closest('.travel-view')?.dataset.remaining;
    if (total && remaining) {
      intro.textContent = `${total} ${label} visited — ${remaining} is the only one left. Grouped by region below.`;
    } else if (total) {
      intro.textContent = `${total} ${label} visited — grouped by region below.`;
    } else {
      intro.textContent = `No ${label} marked yet — send me your list and I will fill this in.`;
    }
  }

  if (!total) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = Object.entries(grouped)
    .filter(([, list]) => list.length)
    .map(([region, list]) => `
      <section class="continent-block">
        <h3>${escapeHtml(region)} (${list.length})</h3>
        <ul>${list.map(name => `<li>${escapeHtml(name)}</li>`).join('')}</ul>
      </section>
    `).join('');
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

function mountTabs(root) {
  const tabs = root.querySelectorAll('[data-travel-tab]');
  if (!tabs.length) return;

  const activate = tab => {
    setActiveTab(root, tab);
    if (tab === 'world') initWorldMap(root);
    else initStatesMap(root);
  };

  tabs.forEach(btn => btn.addEventListener('click', () => activate(btn.dataset.travelTab)));
  activate(root.dataset.defaultTab || 'world');
}

export function mountTravelModal() {
  const overlay = document.getElementById('travel-overlay');
  const openers = document.querySelectorAll('[data-open-travel]');
  if (!overlay || !openers.length) return;

  const panel = overlay.querySelector('.travel-panel');
  const closeBtn = overlay.querySelector('.travel-close');

  const open = () => {
    overlay.hidden = false;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    mountTabs(panel);
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
