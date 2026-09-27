const WORLD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export async function initTravelMap(root) {
  if (!root || root.dataset.travelReady === '1') return;
  root.dataset.travelReady = '1';

  const res = await fetch('/travel/countries.json');
  const data = await res.json();
  const visited = new Set(data.visitedIsoNums);

  root._travelCleanup = await renderGlobe(root.querySelector('[data-globe]'), visited);
  renderGallery(root.querySelector('[data-gallery]'), data.countries);
  renderContinents(root.querySelector('[data-continents]'), data.byContinent, data.count);
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
    .attr('class', d => visited.has(d.id) ? 'country visited' : 'country unvisited')
    .attr('d', path)
    .append('title')
    .text(d => d.properties?.name || '');

  let rotation = 0;
  let frame = null;
  const spin = () => {
    rotation = (rotation + 0.18) % 360;
    projection.rotate([-rotation, -12, 0]);
    svg.selectAll('path.country, path.sphere').attr('d', path);
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
    svg.selectAll('path.country, path.sphere').attr('d', path);
  });
  observer.observe(container);

  return () => {
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
  };
}

function renderGallery(container, countries) {
  if (!container) return;
  const cards = countries.map(c => `
    <figure class="gallery-card">
      <img src="${c.thumb}" alt="${escapeHtml(c.name)}" loading="lazy" width="180" height="120">
      <span>${escapeHtml(c.name)}</span>
    </figure>
  `).join('');
  container.innerHTML = `<div class="gallery-track">${cards}${cards}</div>`;
}

function renderContinents(container, byContinent, total) {
  if (!container) return;
  const intro = container.closest('.travel-panel')?.querySelector('.travel-intro');
  if (intro) intro.textContent = `${total} countries visited — grouped by continent below.`;

  container.innerHTML = Object.entries(byContinent)
    .filter(([, list]) => list.length)
    .map(([continent, list]) => `
      <section class="continent-block">
        <h3>${escapeHtml(continent)} (${list.length})</h3>
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
    initTravelMap(panel);
    closeBtn?.focus();
  };

  const close = () => {
    overlay.classList.remove('is-open');
    overlay.hidden = true;
    document.body.style.overflow = '';
    if (typeof panel?._travelCleanup === 'function') panel._travelCleanup();
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

if (document.body.classList.contains('travel-page')) {
  initTravelMap(document.querySelector('.travel-panel'));
} else {
  mountTravelModal();
}
