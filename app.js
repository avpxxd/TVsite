// ===================== GOOGLE TV APP =====================
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  const state = {
    activeTab: 'home',       // current tab
    focusZone: 'nav',        // 'nav' | 'banner' | 'content'
    navIndex: 1,             // 0=Search,1=Home,2=Live,3=Shop,4=Discover,5=Apps
    bannerCol: 0,            // 0=Play, 1=More Info
    rowIndex: 0,             // current row in content
    colIndex: 0,             // current col in row
    overlayOpen: false,
    overlayItem: null,
  };

  // Nav tabs order
  const NAV_TABS = ['search', 'home', 'live', 'shop', 'discover', 'apps'];

  // ── DOM refs ───────────────────────────────────────────
  const $topnav        = document.getElementById('topnav');
  const $navTabs       = [...document.querySelectorAll('.nav-tab')];
  const $bannerBg      = document.getElementById('banner-bg');
  const $bannerTitle   = document.getElementById('banner-title');
  const $bannerMeta    = document.getElementById('banner-meta');
  const $bannerDesc    = document.getElementById('banner-desc');
  const $bannerBadge   = document.getElementById('banner-badge');
  const $bannerEl      = document.getElementById('hero-banner');
  const $contentArea   = document.getElementById('content-area');
  const $heroBg        = document.getElementById('hero-bg');
  const $heroOverlay   = document.getElementById('hero-overlay');
  const $heroBack      = document.getElementById('hero-back');
  const $heroTitle     = document.getElementById('hero-title');
  const $heroMeta      = document.getElementById('hero-meta');
  const $heroDesc      = document.getElementById('hero-desc');
  const $heroPlay      = document.getElementById('hero-play');
  const $heroWatchlist = document.getElementById('hero-watchlist');
  const $toast         = document.getElementById('toast');

  // ── Live content store ─────────────────────────────────
  let CONTENT = null;

  // ── Init ───────────────────────────────────────────────
  async function init() {
    const $loader      = document.getElementById('loading-screen');
    const $loaderErr   = document.getElementById('loader-error');

    try {
      if (TMDB_KEY && TMDB_KEY !== 'YOUR_TMDB_API_KEY_HERE') {
        CONTENT = await loadContent();
      } else {
        CONTENT = STATIC_CONTENT;
      }
    } catch (err) {
      console.warn('TMDB fetch failed, using static data:', err);
      CONTENT = STATIC_CONTENT;
      $loaderErr.textContent = '⚠ Could not reach TMDB – showing cached content. Add your API key in data.js to enable live data.';
      $loaderErr.classList.add('visible');
      await new Promise(r => setTimeout(r, 2200));
    }

    // Hide loader
    $loader.classList.add('hidden');
    setTimeout(() => $loader.remove(), 500);

    populateBanner();
    buildRows();
    setNavFocus(state.navIndex);
    syncTabActive();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll);
    setupMouseListeners();
    setupHeroOverlay();
    startClock();
  }

  function startClock() {
    const $clock = document.getElementById('nav-clock');
    function tick() {
      const now = new Date();
      let h = now.getHours() % 12 || 12;
      let m = String(now.getMinutes()).padStart(2, '0');
      $clock.textContent = h + ':' + m;
    }
    tick();
    setInterval(tick, 10000);
  }

  // ── Carousel ───────────────────────────────────────────
  let carouselIndex = 0;
  let carouselTimer = null;
  const CAROUSEL_INTERVAL = 6000;

  function populateBanner() {
    const slidesEl  = document.getElementById('banner-slides');
    const dotsEl    = document.getElementById('carousel-dots');
    const prevBtn   = document.getElementById('carousel-prev');
    const nextBtn   = document.getElementById('carousel-next');

    // Build slides
    slidesEl.innerHTML = '';
    dotsEl.innerHTML   = '';
    CONTENT.heroes.forEach((h, i) => {
      const slide = document.createElement('div');
      slide.className = 'banner-slide' + (i === 0 ? ' active' : '');
      slide.style.backgroundImage = `url('${h.bg}')`;
      slidesEl.appendChild(slide);

      const dot = document.createElement('div');
      dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
      dot.addEventListener('click', () => goToSlide(i));
      dotsEl.appendChild(dot);
    });

    prevBtn.addEventListener('click', () => goToSlide((carouselIndex - 1 + CONTENT.heroes.length) % CONTENT.heroes.length));
    nextBtn.addEventListener('click', () => goToSlide((carouselIndex + 1) % CONTENT.heroes.length));

    updateBannerContent(0);
    startCarouselTimer();
  }

  function goToSlide(idx) {
    if (idx === carouselIndex) return;
    const slides = document.querySelectorAll('.banner-slide');
    const dots   = document.querySelectorAll('.carousel-dot');

    slides[carouselIndex].classList.remove('active');
    dots[carouselIndex].classList.remove('active');

    carouselIndex = idx;

    slides[carouselIndex].classList.add('active');
    dots[carouselIndex].classList.add('active');

    updateBannerContent(carouselIndex);
    resetCarouselTimer();
  }

  function updateBannerContent(idx) {
    const h = CONTENT.heroes[idx];
    const content = document.getElementById('banner-content');

    // fade text out then in
    content.classList.add('transitioning');
    setTimeout(() => {
      $bannerTitle.textContent = h.title;
      $bannerMeta.textContent  = h.meta;
      $bannerDesc.textContent  = h.desc;
      $bannerBadge.textContent = h.badge;
      content.classList.remove('transitioning');
    }, 350);
  }

  function startCarouselTimer() {
    carouselTimer = setInterval(() => {
      goToSlide((carouselIndex + 1) % CONTENT.heroes.length);
    }, CAROUSEL_INTERVAL);
  }

  function resetCarouselTimer() {
    clearInterval(carouselTimer);
    startCarouselTimer();
  }

  // ── Build rows ─────────────────────────────────────────
  function buildRows() {
    $contentArea.innerHTML = '';
    CONTENT.rows.forEach((row, ri) => {
      const section = document.createElement('div');
      section.className = 'row-section';
      section.dataset.rowIndex = ri;

      const label = document.createElement('div');
      label.className = 'row-label';
      label.textContent = row.label;

      const scroller = document.createElement('div');
      scroller.className = 'row-scroller';

      const track = document.createElement('div');
      track.className = 'row-track';
      track.dataset.rowIndex = ri;

      row.items.forEach((item, ci) => {
        const card = createCard(item, ri, ci, row.wide);
        track.appendChild(card);
      });

      scroller.appendChild(track);
      section.appendChild(label);
      section.appendChild(scroller);
      $contentArea.appendChild(section);
    });
  }

  function createCard(item, ri, ci, wide) {
    const card = document.createElement('div');
    card.className = 'card focusable' + (wide ? ' wide' : '');
    card.dataset.row = ri;
    card.dataset.col = ci;
    card.tabIndex = -1;

    // Image or placeholder
    if (item.img) {
      const img = document.createElement('img');
      img.className = 'card-img';
      img.src = item.img;
      img.alt = item.title;
      img.loading = 'lazy';
      img.onerror = () => {
        img.replaceWith(makePlaceholder(item.title));
      };
      card.appendChild(img);
    } else {
      card.appendChild(makePlaceholder(item.title));
    }

    // Badge
    if (item.badge) {
      const badge = document.createElement('div');
      badge.className = 'card-badge ' + (item.badge === 'TOP' ? 'top' : item.badge === 'NEW' ? 'new' : '');
      badge.textContent = item.badge;
      card.appendChild(badge);
    }

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'card-overlay';
    overlay.innerHTML = `<div class="card-title">${item.title}</div><div class="card-sub">${item.sub || ''}</div>`;
    card.appendChild(overlay);

    // Progress bar
    if (item.progress) {
      const pbar = document.createElement('div');
      pbar.className = 'card-progress';
      pbar.innerHTML = `<div class="card-progress-fill" style="width:${item.progress}%"></div>`;
      card.appendChild(pbar);
    }

    // Mouse events
    card.addEventListener('mouseenter', () => {
      if (!state.overlayOpen) {
        moveFocusToCard(ri, ci);
      }
    });

    card.addEventListener('click', () => {
      if (!state.overlayOpen) {
        openOverlay(item);
      }
    });

    return card;
  }

  function makePlaceholder(title) {
    const ph = document.createElement('div');
    ph.className = 'card-img-placeholder';
    const emojis = ['🎬','📺','🎭','🎥','🌟','🚀','👾','🎞️'];
    ph.innerHTML = `<span class="icon">${emojis[Math.floor(Math.random()*emojis.length)]}</span><span>${title}</span>`;
    return ph;
  }

  // ── Focus management ───────────────────────────────────
  function allCards() {
    return [...document.querySelectorAll('.card')];
  }

  function getCard(ri, ci) {
    return document.querySelector(`.card[data-row="${ri}"][data-col="${ci}"]`);
  }

  function rowLength(ri) {
    return CONTENT.rows[ri]?.items.length ?? 0;
  }

  function clearAllFocus() {
    document.querySelectorAll('.focused').forEach(el => el.classList.remove('focused'));
  }

  function setNavFocus(idx) {
    clearAllFocus();
    state.focusZone = 'nav';
    state.navIndex = idx;
    $navTabs.forEach(t => t.classList.remove('focused'));
    $navTabs[idx]?.classList.add('focused');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setBannerFocus(col) {
    clearAllFocus();
    state.focusZone = 'banner';
    if (col !== undefined) state.bannerCol = col;
    $bannerEl.classList.add('focused');
    // Highlight the active button
    const $bp = document.getElementById('banner-play');
    const $bi = document.getElementById('banner-info');
    $bp.classList.toggle('btn-focused', state.bannerCol === 0);
    $bi.classList.toggle('btn-focused', state.bannerCol === 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function moveFocusToCard(ri, ci) {
    clearAllFocus();
    state.focusZone = 'content';
    state.rowIndex = ri;
    state.colIndex = ci;
    const card = getCard(ri, ci);
    if (card) {
      card.classList.add('focused');
      scrollCardIntoView(card);
    }
  }

  function scrollCardIntoView(card) {
    if (!card) return;
    const scroller = card.closest('.row-scroller');
    if (!scroller) return;
    const cardRect = card.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const offset = cardRect.left - scrollerRect.left + scroller.scrollLeft;
    const center = offset - scrollerRect.width / 2 + card.offsetWidth / 2;
    scroller.scrollTo({ left: Math.max(0, center), behavior: 'smooth' });

    const section = card.closest('.row-section');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function syncTabActive() {
    $navTabs.forEach((t, i) => {
      t.classList.toggle('active', NAV_TABS[i] === state.activeTab);
    });
  }

  // ── Keyboard Navigation ────────────────────────────────
  function onKeyDown(e) {
    if (state.overlayOpen) {
      handleOverlayKeys(e);
      return;
    }

    const key = e.key;

    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Enter' || key === 'Escape' || key === ' ') {
      e.preventDefault();
    }

    if (key === 'Escape') {
      // do nothing on main screen (no overlay)
      return;
    }

    if (state.focusZone === 'nav') {
      handleNavKeys(key);
    } else if (state.focusZone === 'banner') {
      handleBannerKeys(key);
    } else if (state.focusZone === 'content') {
      handleContentKeys(key);
    }
  }

  function handleNavKeys(key) {
    if (key === 'ArrowLeft') {
      if (state.navIndex > 0) setNavFocus(state.navIndex - 1);
    } else if (key === 'ArrowRight') {
      if (state.navIndex < NAV_TABS.length - 1) setNavFocus(state.navIndex + 1);
    } else if (key === 'ArrowDown') {
      setBannerFocus(0);
    } else if (key === 'Enter' || key === ' ') {
      activateTab(state.navIndex);
    }
  }

  function handleBannerKeys(key) {
    if (key === 'ArrowLeft') {
      if (state.bannerCol === 1) {
        setBannerFocus(0); // More Info -> Play
      } else {
        goToSlide((carouselIndex - 1 + CONTENT.heroes.length) % CONTENT.heroes.length);
      }
    } else if (key === 'ArrowRight') {
      if (state.bannerCol === 0) {
        setBannerFocus(1); // Play -> More Info
      } else {
        goToSlide((carouselIndex + 1) % CONTENT.heroes.length);
      }
    } else if (key === 'ArrowUp') {
      setNavFocus(state.navIndex);
    } else if (key === 'ArrowDown') {
      moveFocusToCard(0, 0);
    } else if (key === 'Enter' || key === ' ') {
      if (state.bannerCol === 0) {
        showToast('▶ Playing ' + CONTENT.heroes[carouselIndex].title);
      } else {
        openOverlayFromHero();
      }
    }
  }

  function handleContentKeys(key) {
    const ri = state.rowIndex;
    const ci = state.colIndex;
    const maxCol = rowLength(ri) - 1;
    const maxRow = CONTENT.rows.length - 1;

    if (key === 'ArrowRight') {
      if (ci < maxCol) moveFocusToCard(ri, ci + 1);
    } else if (key === 'ArrowLeft') {
      if (ci > 0) moveFocusToCard(ri, ci - 1);
      else if (ci === 0) setBannerFocus(0); // go back to banner on far left of row 0? or just stay
    } else if (key === 'ArrowDown') {
      if (ri < maxRow) {
        const newCol = Math.min(ci, rowLength(ri + 1) - 1);
        moveFocusToCard(ri + 1, newCol);
      }
    } else if (key === 'ArrowUp') {
      if (ri > 0) {
        const newCol = Math.min(ci, rowLength(ri - 1) - 1);
        moveFocusToCard(ri - 1, newCol);
      } else {
        setBannerFocus(1);
      }
    } else if (key === 'Enter' || key === ' ') {
      const item = CONTENT.rows[ri]?.items[ci];
      if (item) openOverlay(item);
    } else if (key === 'Escape' || key === 'Backspace') {
      setBannerFocus(0);
    }
  }

  function handleOverlayKeys(e) {
    const key = e.key;
    if (key === 'Escape' || key === 'Backspace') {
      e.preventDefault();
      closeOverlay();
    } else if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      if (state.overlayItem) showToast('▶ Playing ' + state.overlayItem.title);
    }
  }

  // ── Tab activation ─────────────────────────────────────
  function activateTab(idx) {
    const tab = NAV_TABS[idx];
    state.activeTab = tab;
    syncTabActive();

    if (tab === 'search') {
      showToast('🔍 Search — type to find content');
    } else {
      showToast('📺 ' + capitalise(tab));
    }
    setBannerFocus(0);
  }

  function capitalise(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ── Overlay ────────────────────────────────────────────
  function openOverlay(item) {
    state.overlayOpen = true;
    state.overlayItem = item;
    $heroBg.style.backgroundImage = `url('${item.img || CONTENT.heroes[carouselIndex].bg}')`;
    $heroTitle.textContent   = item.title;
    $heroMeta.textContent    = item.sub || CONTENT.heroes[carouselIndex].meta;
    $heroDesc.textContent    = item.desc || 'Enjoy this incredible title. Add it to your watchlist or press play to start watching right now.';
    $heroOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function openOverlayFromHero() {
    const h = CONTENT.heroes[carouselIndex];
    openOverlay({
      title: h.title,
      sub: h.meta,
      desc: h.desc,
      img: h.bg
    });
  }

  function closeOverlay() {
    state.overlayOpen = false;
    state.overlayItem = null;
    $heroOverlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function setupHeroOverlay() {
    $heroBack.addEventListener('click', closeOverlay);
    $heroPlay.addEventListener('click', () => {
      if (state.overlayItem) showToast('▶ Playing ' + state.overlayItem.title);
    });
    $heroWatchlist.addEventListener('click', () => {
      if (state.overlayItem) showToast('✓ Added to Watchlist');
    });

    // Banner play/info buttons
    const $bp = document.getElementById('banner-play');
    const $bi = document.getElementById('banner-info');
    $bp.addEventListener('click', (e) => { e.stopPropagation(); showToast('▶ Playing ' + CONTENT.heroes[carouselIndex].title); });
    $bi.addEventListener('click', (e) => { e.stopPropagation(); openOverlayFromHero(); });

    // Banner is one clickable block
    $bannerEl.addEventListener('click', (e) => {
      if (e.target.closest('.carousel-arrow') || e.target.closest('#carousel-dots')) return;
      openOverlayFromHero();
    });
    $bannerEl.addEventListener('mouseenter', () => setBannerFocus(0));
  }

  // ── Mouse listeners ────────────────────────────────────
  function setupMouseListeners() {
    $navTabs.forEach((tab, i) => {
      tab.addEventListener('mouseenter', () => setNavFocus(i));
      tab.addEventListener('click', () => {
        setNavFocus(i);
        activateTab(i);
      });
    });
  }

  // ── Scroll handling ────────────────────────────────────
  function onScroll() {
    if (window.scrollY > 10) {
      $topnav.classList.add('opaque');
    } else {
      $topnav.classList.remove('opaque');
    }
  }

  // ── Toast ──────────────────────────────────────────────
  let toastTimer;
  function showToast(msg) {
    clearTimeout(toastTimer);
    $toast.textContent = msg;
    $toast.classList.add('show');
    toastTimer = setTimeout(() => $toast.classList.remove('show'), 2500);
  }

  // ── Start ──────────────────────────────────────────────
  init();

})();
