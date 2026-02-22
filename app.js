// ===================== GOOGLE TV APP =====================
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  const state = {
    activeTab: 'home',       // current tab
    focusZone: 'nav',        // 'nav' | 'banner' | 'content'
    navIndex: 1,             // 0=Search,1=Home,2=Movies,3=Shows,4=Shop,5=Apps
    bannerCol: 0,            // 0=Play, 1=More Info
    rowIndex: 0,             // current row in content
    colIndex: 0,             // current col in row
    overlayOpen: false,
    overlayItem: null,
    overlaySection: 'actions', // 'trailer' | 'actions' | 'providers'
    overlayCol: 0,
    settingsPanelOpen: false,
    settings: { region: 'US', providers: [] },
  };

  // Nav tabs order
  const NAV_TABS = ['search', 'home', 'movies', 'shows', 'shop', 'apps'];

  // Streaming provider search URLs keyed by TMDB provider_id
  const PROVIDER_URLS = {
    8:    t => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`,
    9:    t => `https://www.amazon.com/s?k=${encodeURIComponent(t)}&i=instant-video`,
    10:   t => `https://www.amazon.com/s?k=${encodeURIComponent(t)}&i=instant-video`,
    15:   t => `https://www.hulu.com/search?q=${encodeURIComponent(t)}`,
    337:  t => `https://www.disneyplus.com/search/${encodeURIComponent(t)}`,
    350:  t => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
    384:  t => `https://www.max.com/search?q=${encodeURIComponent(t)}`,
    386:  t => `https://www.peacocktv.com/search?q=${encodeURIComponent(t)}`,
    387:  t => `https://www.peacocktv.com/search?q=${encodeURIComponent(t)}`,
    531:  t => `https://www.paramountplus.com/search/${encodeURIComponent(t)}/`,
    1899: t => `https://www.max.com/search?q=${encodeURIComponent(t)}`,
    2:    t => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
    3:    t => `https://play.google.com/store/search?q=${encodeURIComponent(t)}&c=movies`,
    192:  t => `https://www.youtube.com/results?search_query=${encodeURIComponent(t)}`,
  };

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

  // ── Content stores ─────────────────────────────────────
  let CONTENT        = null;  // pointer to whichever tab is active
  let HOME_CONTENT   = null;
  let MOVIES_CONTENT = null;
  let SHOWS_CONTENT  = null;

  // ── Init ───────────────────────────────────────────────
  async function init() {
    const $loader      = document.getElementById('loading-screen');
    const $loaderErr   = document.getElementById('loader-error');
    const minWait      = new Promise(r => setTimeout(r, 4000));

    // Load saved settings from localStorage
    try {
      const saved = localStorage.getItem('gtv_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        state.settings.region    = parsed.region    || 'US';
        state.settings.providers = parsed.providers || [];
      }
    } catch (e) {}

    try {
      if (TMDB_KEY && TMDB_KEY !== 'YOUR_TMDB_API_KEY_HERE') {
        HOME_CONTENT = await loadContentFiltered(state.settings.region, state.settings.providers);
      } else {
        HOME_CONTENT = STATIC_CONTENT;
      }
    } catch (err) {
      console.warn('TMDB fetch failed, using static data:', err);
      HOME_CONTENT = STATIC_CONTENT;
      $loaderErr.textContent = '⚠ Could not reach TMDB – showing cached content. Add your API key in data.js to enable live data.';
      $loaderErr.classList.add('visible');
    }

    CONTENT = HOME_CONTENT;

    // Ensure loading screen shows for at least 4 seconds
    await minWait;

    // Hide loader (kept in DOM for page transition reuse)
    $loader.classList.add('hidden');

    populateBanner();
    buildRows();
    setNavFocus(state.navIndex);
    syncTabActive();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll);
    setupMouseListeners();
    setupHeroOverlay();
    setupSettingsPanel();
    setupSearchKeyboard();
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

    // Reset carousel index whenever content is replaced
    carouselIndex = 0;

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

    // Clone prev/next to remove any stale click listeners from previous calls
    const oldPrev = document.getElementById('carousel-prev');
    const oldNext = document.getElementById('carousel-next');
    const prevBtn = oldPrev.cloneNode(true);
    const nextBtn = oldNext.cloneNode(true);
    oldPrev.parentNode.replaceChild(prevBtn, oldPrev);
    oldNext.parentNode.replaceChild(nextBtn, oldNext);

    prevBtn.addEventListener('click', () => goToSlide((carouselIndex - 1 + CONTENT.heroes.length) % CONTENT.heroes.length));
    nextBtn.addEventListener('click', () => goToSlide((carouselIndex + 1) % CONTENT.heroes.length));

    updateBannerContent(0);
    resetCarouselTimer();
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
    clearInterval(carouselTimer);
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

      const labelRow = document.createElement('div');
      labelRow.className = 'row-label-row';

      const label = document.createElement('div');
      label.className = 'row-label';
      label.textContent = row.label;
      labelRow.appendChild(label);

      const scroller = document.createElement('div');
      scroller.className = 'row-scroller';

      const track = document.createElement('div');
      track.className = 'row-track';
      track.dataset.rowIndex = ri;

      row.items.forEach((item, ci) => {
        const card = createCard(item, ri, ci, row.wide);
        track.appendChild(card);
      });

      // Left / right nav buttons
      const btnPrev = document.createElement('button');
      btnPrev.className = 'row-nav-btn row-nav-prev';
      btnPrev.innerHTML = '<i class="fas fa-chevron-left"></i>';
      btnPrev.setAttribute('aria-label', 'Scroll left');

      const btnNext = document.createElement('button');
      btnNext.className = 'row-nav-btn row-nav-next';
      btnNext.innerHTML = '<i class="fas fa-chevron-right"></i>';
      btnNext.setAttribute('aria-label', 'Scroll right');

      const scrollAmt = () => scroller.clientWidth * 0.75;
      btnPrev.addEventListener('click', () => scroller.scrollBy({ left: -scrollAmt(), behavior: 'smooth' }));
      btnNext.addEventListener('click', () => scroller.scrollBy({ left:  scrollAmt(), behavior: 'smooth' }));

      // Show/hide arrows based on scroll position
      function syncArrows() {
        const atStart = scroller.scrollLeft <= 4;
        const atEnd   = scroller.scrollLeft >= scroller.scrollWidth - scroller.clientWidth - 4;
        btnPrev.classList.toggle('hidden', atStart);
        btnNext.classList.toggle('hidden', atEnd);
      }
      scroller.addEventListener('scroll', syncArrows, { passive: true });
      // Run once after paint so clientWidth is known
      requestAnimationFrame(syncArrows);

      scroller.appendChild(track);

      const rowWrap = document.createElement('div');
      rowWrap.className = 'row-wrap';
      rowWrap.appendChild(btnPrev);
      rowWrap.appendChild(scroller);
      rowWrap.appendChild(btnNext);

      section.appendChild(labelRow);
      section.appendChild(rowWrap);
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
    document.querySelectorAll('.nav-icon-btn, #profile-btn').forEach(el => el.classList.remove('focused'));
    if (idx <= 5) {
      $navTabs[idx]?.classList.add('focused');
    } else {
      const rightBtns = [
        document.getElementById('notif-btn'),
        document.getElementById('settings-btn'),
        document.getElementById('profile-btn'),
      ];
      rightBtns[idx - 6]?.classList.add('focused');
    }
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

    // Nudge the scroller just enough to reveal the card — no centering
    const cardRect    = card.getBoundingClientRect();
    const scrollRect  = scroller.getBoundingClientRect();
    const overRight   = cardRect.right  - scrollRect.right  + 64;
    const overLeft    = scrollRect.left - cardRect.left     + 64;
    if (overRight > 0) scroller.scrollLeft += overRight;
    else if (overLeft > 0) scroller.scrollLeft -= overLeft;

    // Scroll the page so the row section is visible without jumping
    const section = card.closest('.row-section');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function syncTabActive() {
    $navTabs.forEach((t, i) => {
      t.classList.toggle('active', NAV_TABS[i] === state.activeTab);
    });
  }

  // ── Keyboard Navigation ────────────────────────────────
  function onKeyDown(e) {
    if (state.settingsPanelOpen) {
      handleSettingsKeys(e);
      return;
    }

    if (state.overlayOpen) {
      handleOverlayKeys(e);
      return;
    }

    // Allow direct typing into search from physical keyboard
    if (state.focusZone === 'search' || state.activeTab === 'search') {
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        state.focusZone = 'search';
        typeSearchChar(e.key.toUpperCase());
        return;
      }
    }

    const key = e.key;

    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Enter' || key === 'Escape' || key === ' ') {
      e.preventDefault();
    }

    if (key === 'Escape') {
      if (state.focusZone !== 'search') return; // do nothing on main non-search screen
    }

    if (state.focusZone === 'search') {
      handleSearchKeys(e);
    } else if (state.focusZone === 'nav') {
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
      if (state.navIndex < 8) setNavFocus(state.navIndex + 1);
    } else if (key === 'ArrowDown') {
      if (state.activeTab === 'search') {
        state.focusZone = 'search';
        searchState.zone = 'keyboard';
        setKbFocus(0, 0);
        document.getElementById('search-input-wrap').classList.add('active');
        return;
      }
      if (state.navIndex <= 5) setBannerFocus(0);
    } else if (key === 'Enter' || key === ' ') {
      if (state.navIndex <= 5) {
        activateTab(state.navIndex);
      } else if (state.navIndex === 6) {
        showToast('🔔 No new notifications');
      } else if (state.navIndex === 7) {
        openSettings();
      } else if (state.navIndex === 8) {
        showToast('👤 Profile');
      }
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
      return;
    }
    if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' '].includes(key)) return;
    e.preventDefault();

    const sec = state.overlaySection;
    const col = state.overlayCol;

    if (key === 'ArrowDown') {
      if (sec === 'trailer') {
        const chips = document.querySelectorAll('.provider-chip');
        setOverlayFocus(chips.length ? 'providers' : 'actions', 0);
      } else if (sec === 'providers') {
        setOverlayFocus('actions', 0);
      }
    } else if (key === 'ArrowUp') {
      if (sec === 'actions') {
        const chips = document.querySelectorAll('.provider-chip');
        if (chips.length) setOverlayFocus('providers', 0);
        else if (document.querySelector('.trailer-play-btn')) setOverlayFocus('trailer', 0);
      } else if (sec === 'providers') {
        const hasTrailer = document.querySelector('.trailer-play-btn');
        setOverlayFocus(hasTrailer ? 'trailer' : 'actions', 0);
      }
    } else if (key === 'ArrowLeft') {
      if (sec === 'actions' && col > 0) setOverlayFocus('actions', col - 1);
      else if (sec === 'providers' && col > 0) setOverlayFocus('providers', col - 1);
    } else if (key === 'ArrowRight') {
      if (sec === 'actions' && col < 1) setOverlayFocus('actions', col + 1);
      else if (sec === 'providers') {
        const chips = document.querySelectorAll('.provider-chip');
        if (col < chips.length - 1) setOverlayFocus('providers', col + 1);
      }
    } else if (key === 'Enter' || key === ' ') {
      activateOverlayFocus();
    }
  }

  function setOverlayFocus(section, col) {
    state.overlaySection = section;
    state.overlayCol     = col;
    document.querySelectorAll('.ov-focused').forEach(el => el.classList.remove('ov-focused'));
    let target = null;
    if (section === 'trailer') {
      target = document.querySelector('.trailer-play-btn');
      // Button not rendered yet (async fetch pending) — silently wait
      if (!target) return;
    } else if (section === 'actions') {
      target = col === 0
        ? document.getElementById('hero-play')
        : document.getElementById('hero-watchlist');
    } else if (section === 'providers') {
      const chips = [...document.querySelectorAll('.provider-chip')];
      state.overlayCol = Math.min(col, chips.length - 1);
      target = chips[state.overlayCol];
    }
    if (target) {
      target.classList.add('ov-focused');
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function activateOverlayFocus() {
    const { overlaySection: s, overlayCol: c, overlayItem: item } = state;
    if (s === 'trailer') {
      document.querySelector('.trailer-play-btn')?.click();
    } else if (s === 'actions') {
      if (c === 0) showToast('\u25b6 Playing ' + (item?.title || ''));
      else showToast('\u2713 Added to Watchlist');
    } else if (s === 'providers') {
      const chips = [...document.querySelectorAll('.provider-chip')];
      chips[c]?.click();
    }
  }

  // ── Tab activation ─────────────────────────────────────
  // Show the loading screen for `ms` ms as a page transition effect.
  // Guard: only fires after init (loader already has 'hidden' class).
  let _transitionTimer = null;
  function showPageTransition(ms = 1500) {
    const $loader = document.getElementById('loading-screen');
    if (!$loader || !$loader.classList.contains('hidden')) return;
    clearTimeout(_transitionTimer);
    $loader.classList.remove('hidden');
    _transitionTimer = setTimeout(() => $loader.classList.add('hidden'), ms);
  }

  function activateTab(idx) {
    const tab = NAV_TABS[idx];
    state.activeTab = tab;
    syncTabActive();

    if (tab === 'search') {
      openSearchView();
    } else if (tab === 'home') {
      showPageTransition();
      closeSearchView();
      CONTENT = HOME_CONTENT;
      populateBanner();
      buildRows();
      setBannerFocus(0);
    } else if (tab === 'movies') {
      showPageTransition();
      closeSearchView();
      if (MOVIES_CONTENT) {
        CONTENT = MOVIES_CONTENT;
        populateBanner();
        buildRows();
        setBannerFocus(0);
      } else {
        loadMoviesTabContent();
      }
    } else if (tab === 'shows') {
      showPageTransition();
      closeSearchView();
      if (SHOWS_CONTENT) {
        CONTENT = SHOWS_CONTENT;
        populateBanner();
        buildRows();
        setBannerFocus(0);
      } else {
        loadShowsTabContent();
      }
    } else {
      showPageTransition();
      showToast('📺 ' + capitalise(tab));
      setBannerFocus(0);
    }
  }

  async function loadMoviesTabContent() {
    const $loader = document.getElementById('loading-screen');
    if ($loader) $loader.classList.remove('hidden');
    try {
      MOVIES_CONTENT = await loadMoviesContent(state.settings.region, state.settings.providers);
    } catch(e) {
      console.warn('Movies content load failed:', e);
      MOVIES_CONTENT = { heroes: HOME_CONTENT.heroes, rows: [] };
    }
    CONTENT = MOVIES_CONTENT;
    if ($loader) $loader.classList.add('hidden');
    populateBanner();
    buildRows();
    setBannerFocus(0);
  }

  async function loadShowsTabContent() {
    const $loader = document.getElementById('loading-screen');
    if ($loader) $loader.classList.remove('hidden');
    try {
      SHOWS_CONTENT = await loadShowsContent(state.settings.region, state.settings.providers);
    } catch(e) {
      console.warn('Shows content load failed:', e);
      SHOWS_CONTENT = { heroes: HOME_CONTENT.heroes, rows: [] };
    }
    CONTENT = SHOWS_CONTENT;
    if ($loader) $loader.classList.add('hidden');
    populateBanner();
    buildRows();
    setBannerFocus(0);
  }

  function capitalise(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ══════════════════════════════════════════════════════
  // SEARCH
  // ══════════════════════════════════════════════════════
  const searchState = {
    query:      '',
    zone:       'keyboard',   // 'keyboard' | 'results'
    kbRow:      0,
    kbCol:      0,
    resultIdx:  0,
    results:    [],
    debounce:   null,
    cols:       0,            // grid columns (computed on render)
  };

  const KB_ROWS = [
    ['A','B','C','D','E','F','G','H','I','J','K','L','M'],
    ['N','O','P','Q','R','S','T','U','V','W','X','Y','Z'],
    ['1','2','3','4','5','6','7','8','9','0',' ','BACK'],
  ];

  function openSearchView() {
    document.getElementById('search-view').classList.remove('hidden');
    document.getElementById('hero-banner').style.display = 'none';
    document.getElementById('content-area').style.display = 'none';
    clearInterval(carouselTimer);
    state.focusZone = 'search';
    searchState.zone = 'keyboard';
    searchState.kbRow = 0;
    searchState.kbCol = 0;
    setKbFocus(0, 0);
    document.getElementById('search-input-wrap').classList.add('active');
    renderSearchResults([]); // clear
    document.getElementById('search-results-label').textContent = 'Start typing to search…';
  }

  function closeSearchView() {
    document.getElementById('search-view').classList.add('hidden');
    document.getElementById('hero-banner').style.display = '';
    document.getElementById('content-area').style.display = '';
    startCarouselTimer();
    searchState.query = '';
    document.getElementById('search-input-text').textContent = '';
    document.getElementById('search-clear-btn').classList.add('hidden');
    document.getElementById('search-input-wrap').classList.remove('active');
    clearKbFocus();
    clearResultFocus();
    renderSearchResults([]);
  }

  function setKbFocus(row, col) {
    clearKbFocus();
    searchState.kbRow = row;
    searchState.kbCol = col;
    const rows = document.querySelectorAll('.kb-row');
    const keys = rows[row]?.querySelectorAll('.kb-key');
    keys?.[col]?.classList.add('kb-focused');
  }

  function clearKbFocus() {
    document.querySelectorAll('.kb-key.kb-focused').forEach(k => k.classList.remove('kb-focused'));
  }

  function clearResultFocus() {
    document.querySelectorAll('.search-result-card.sr-focused').forEach(c => c.classList.remove('sr-focused'));
  }

  function setResultFocus(idx) {
    clearResultFocus();
    searchState.resultIdx = idx;
    const cards = document.querySelectorAll('.search-result-card');
    cards[idx]?.classList.add('sr-focused');
    cards[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function handleSearchKeys(e) {
    const key = e.key;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' ','Escape','Backspace'].includes(key)) {
      e.preventDefault();
    }

    if (key === 'Escape') {
      // Go back to Home
      state.activeTab = 'home';
      state.navIndex  = 1;
      syncTabActive();
      setNavFocus(1);
      closeSearchView();
      setBannerFocus(0);
      return;
    }

    if (searchState.zone === 'keyboard') {
      handleSearchKbKeys(key);
    } else {
      handleSearchResultKeys(key);
    }
  }

  function handleSearchKbKeys(key) {
    const { kbRow, kbCol } = searchState;
    const rowLen = KB_ROWS[kbRow].length;

    if (key === 'ArrowLeft') {
      if (kbCol > 0) setKbFocus(kbRow, kbCol - 1);
    } else if (key === 'ArrowRight') {
      if (kbCol < rowLen - 1) setKbFocus(kbRow, kbCol + 1);
    } else if (key === 'ArrowUp') {
      if (kbRow > 0) {
        const newCol = Math.min(kbCol, KB_ROWS[kbRow - 1].length - 1);
        setKbFocus(kbRow - 1, newCol);
      } else {
        // Top of keyboard — go back up to nav bar
        clearKbFocus();
        document.getElementById('search-input-wrap').classList.remove('active');
        setNavFocus(0); // land on Search tab
      }
    } else if (key === 'ArrowDown') {
      if (kbRow < KB_ROWS.length - 1) {
        const newCol = Math.min(kbCol, KB_ROWS[kbRow + 1].length - 1);
        setKbFocus(kbRow + 1, newCol);
      } else if (searchState.results.length > 0) {
        // Drop into results
        searchState.zone = 'results';
        clearKbFocus();
        document.getElementById('search-input-wrap').classList.remove('active');
        setResultFocus(0);
      }
    } else if (key === 'Enter' || key === ' ') {
      pressKbKey(kbRow, kbCol);
    } else if (key === 'Backspace') {
      typeSearchChar('BACK');
    }
  }

  function handleSearchResultKeys(key) {
    const { resultIdx, results, cols } = searchState;
    const total = results.length;
    if (!total) return;

    if (key === 'ArrowRight') {
      if (resultIdx < total - 1) setResultFocus(resultIdx + 1);
    } else if (key === 'ArrowLeft') {
      if (resultIdx > 0) setResultFocus(resultIdx - 1);
    } else if (key === 'ArrowDown') {
      const next = resultIdx + cols;
      if (next < total) setResultFocus(next);
    } else if (key === 'ArrowUp') {
      const prev = resultIdx - cols;
      if (prev >= 0) {
        setResultFocus(prev);
      } else {
        // Back to keyboard
        searchState.zone = 'keyboard';
        clearResultFocus();
        document.getElementById('search-input-wrap').classList.add('active');
        setKbFocus(KB_ROWS.length - 1, searchState.kbCol);
      }
    } else if (key === 'Enter' || key === ' ') {
      const item = searchState.results[resultIdx];
      if (item) openOverlay(item);
    } else if (key === 'Escape' || key === 'Backspace') {
      searchState.zone = 'keyboard';
      clearResultFocus();
      document.getElementById('search-input-wrap').classList.add('active');
      setKbFocus(KB_ROWS.length - 1, searchState.kbCol);
    }
  }

  function pressKbKey(row, col) {
    const char = KB_ROWS[row][col];
    typeSearchChar(char);
  }

  function typeSearchChar(char) {
    if (char === 'BACK') {
      searchState.query = searchState.query.slice(0, -1);
    } else {
      searchState.query += char;
    }
    document.getElementById('search-input-text').textContent = searchState.query;
    document.getElementById('search-clear-btn').classList.toggle('hidden', !searchState.query);

    // Debounce search
    clearTimeout(searchState.debounce);
    if (!searchState.query.trim()) {
      renderSearchResults([]);
      document.getElementById('search-results-label').textContent = 'Start typing to search…';
      return;
    }
    document.getElementById('search-results-label').textContent = 'Searching…';
    searchState.debounce = setTimeout(() => runSearch(searchState.query.trim()), 500);
  }

  async function runSearch(query) {
    try {
      const data = await tmdbFetch('/search/multi', `&query=${encodeURIComponent(query)}&include_adult=false`);
      const items = (data.results || [])
        .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
        .filter(r => r.poster_path)
        .slice(0, 40)
        .map(r => {
          const isTV  = r.media_type === 'tv';
          const title = r.title || r.name || 'Unknown';
          const year  = (r.release_date || r.first_air_date || '').slice(0, 4);
          const rating = r.vote_average ? '★ ' + r.vote_average.toFixed(1) : '';
          return {
            title,
            sub:       [year, rating].filter(Boolean).join('  ·  '),
            meta:      [year, rating].filter(Boolean).join('  ·  '),
            img:       posterUrl(r.poster_path),
            backdrop:  backdropUrl(r.backdrop_path),
            desc:      r.overview || '',
            badge:     isTV ? 'TV' : 'Movie',
            id:        r.id,
            mediaType: r.media_type,
          };
        });
      searchState.results = items;
      renderSearchResults(items, query);
    } catch (err) {
      document.getElementById('search-results-label').textContent = 'Search unavailable — check API key';
    }
  }

  function renderSearchResults(items, query = '') {
    const grid  = document.getElementById('search-results-grid');
    const label = document.getElementById('search-results-label');
    grid.innerHTML = '';
    clearResultFocus();

    if (!items.length) {
      if (query) label.textContent = `No results for "${query}"`;
      return;
    }

    label.textContent = `${items.length} result${items.length !== 1 ? 's' : ''} for "${query}"`;

    items.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = 'search-result-card';
      card.tabIndex = -1;

      if (item.img) {
        const img = document.createElement('img');
        img.src = item.img;
        img.alt = item.title;
        img.loading = 'lazy';
        img.onerror = () => {
          const ph = document.createElement('div');
          ph.className = 'sr-placeholder';
          ph.innerHTML = `<span class="icon">🎬</span><span>${item.title}</span>`;
          img.replaceWith(ph);
        };
        card.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.className = 'sr-placeholder';
        ph.innerHTML = `<span class="icon">🎬</span><span>${item.title}</span>`;
        card.appendChild(ph);
      }

      const info = document.createElement('div');
      info.className = 'sr-info';
      if (item.badge) {
        const badge = document.createElement('div');
        badge.className = 'sr-badge';
        badge.textContent = item.badge;
        info.appendChild(badge);
      }
      const titleEl = document.createElement('div');
      titleEl.className = 'sr-title';
      titleEl.textContent = item.title;
      const subEl = document.createElement('div');
      subEl.className = 'sr-sub';
      subEl.textContent = item.sub;
      info.appendChild(titleEl);
      info.appendChild(subEl);
      card.appendChild(info);

      card.addEventListener('mouseenter', () => {
        searchState.zone = 'results';
        clearKbFocus();
        document.getElementById('search-input-wrap').classList.remove('active');
        setResultFocus(i);
      });
      card.addEventListener('click', () => openOverlay(item));

      grid.appendChild(card);
    });

    // Compute how many columns the grid currently has
    requestAnimationFrame(() => {
      const gridRect  = grid.getBoundingClientRect();
      const firstCard = grid.querySelector('.search-result-card');
      if (firstCard) {
        const cardRect = firstCard.getBoundingClientRect();
        searchState.cols = Math.max(1, Math.round(gridRect.width / cardRect.width));
      }
    });
  }

  function setupSearchKeyboard() {
    document.querySelectorAll('.kb-key').forEach(btn => {
      const char = btn.dataset.char;
      btn.addEventListener('click', () => {
        typeSearchChar(char);
        // Sync state position to the clicked key
        const row  = parseInt(btn.closest('.kb-row').dataset.row);
        const keys = [...btn.closest('.kb-row').querySelectorAll('.kb-key')];
        const col  = keys.indexOf(btn);
        searchState.kbRow = row;
        searchState.kbCol = col;
        searchState.zone  = 'keyboard';
        document.getElementById('search-input-wrap').classList.add('active');
        setKbFocus(row, col);
      });
    });

    document.getElementById('search-clear-btn').addEventListener('click', () => {
      searchState.query = '';
      document.getElementById('search-input-text').textContent = '';
      document.getElementById('search-clear-btn').classList.add('hidden');
      renderSearchResults([]);
      document.getElementById('search-results-label').textContent = 'Start typing to search…';
      searchState.zone = 'keyboard';
      document.getElementById('search-input-wrap').classList.add('active');
      setKbFocus(0, 0);
    });
  }

  async function openOverlay(item) {
    state.overlayOpen = true;
    state.overlayItem = item;

    // ── Immediate display ──
    const fallbackImg = item.backdrop || item.bg || item.img || '';
    $heroBg.style.backgroundImage = fallbackImg ? `url('${fallbackImg}')` : '';

    const $trailerInner = document.getElementById('overlay-trailer-inner');
    $trailerInner.innerHTML = fallbackImg
      ? `<div class="trailer-fallback" style="background-image:url('${fallbackImg}')"></div>`
      : `<div class="trailer-loading">No preview available</div>`;

    document.getElementById('hero-badge').textContent = item.badge || '';
    $heroTitle.textContent = item.title;
    $heroMeta.textContent  = item.meta || item.sub || '';
    $heroDesc.textContent  = item.desc || '';
    document.getElementById('hero-providers').innerHTML = '<div class="overlay-skeleton">Checking availability\u2026</div>';
    document.getElementById('hero-cast').innerHTML      = '<div class="overlay-skeleton">Loading cast\u2026</div>';

    $heroOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // Desired default is trailer; applied once loadTrailer renders the button
    state.overlaySection = 'trailer';
    state.overlayCol     = 0;

    // ── Fetch TMDB details ──
    const id        = item.id;
    const mediaType = item.mediaType;
    const hasKey    = TMDB_KEY && TMDB_KEY !== 'YOUR_TMDB_API_KEY_HERE';

    if (id && mediaType && hasKey) {
      const [detailsRes, videosRes, creditsRes, providersRes] = await Promise.allSettled([
        tmdbFetch(`/${mediaType}/${id}`),
        tmdbFetch(`/${mediaType}/${id}/videos`),
        tmdbFetch(`/${mediaType}/${id}/credits`),
        tmdbFetch(`/${mediaType}/${id}/watch/providers`),
      ]);

      if (!state.overlayOpen) return; // user closed while fetching

      // Full meta
      if (detailsRes.status === 'fulfilled') {
        const d      = detailsRes.value;
        const year   = (d.release_date || d.first_air_date || '').slice(0, 4);
        const rating = d.vote_average ? '\u2605 ' + d.vote_average.toFixed(1) : '';
        const type   = mediaType === 'tv' ? 'TV Series' : 'Movie';
        let runtime  = '';
        if (d.runtime) {
          const h = Math.floor(d.runtime / 60), m = d.runtime % 60;
          runtime = h ? `${h}h ${m}m` : `${m}m`;
        } else if (d.number_of_seasons) {
          runtime = d.number_of_seasons === 1 ? '1 Season' : `${d.number_of_seasons} Seasons`;
        }
        $heroMeta.textContent = [year, type, rating, runtime].filter(Boolean).join('  \u00b7  ');
      }

      // Trailer
      if (videosRes.status === 'fulfilled') {
        const vids = videosRes.value.results || [];
        // Prefer official trailers, then teasers, then any YouTube clip
        const candidates =
          vids.filter(v => v.type === 'Trailer' && v.site === 'YouTube')
              .concat(vids.filter(v => v.type === 'Teaser' && v.site === 'YouTube'))
              .concat(vids.filter(v => v.site === 'YouTube' && v.type !== 'Trailer' && v.type !== 'Teaser'));
        loadTrailer($trailerInner, candidates, fallbackImg);
      }
      // Apply focus ring now that trailer DOM is settled
      if (state.overlayOpen) {
        setOverlayFocus(document.querySelector('.trailer-play-btn') ? 'trailer' : 'actions', 0);
      }

      // Cast
      if (creditsRes.status === 'fulfilled') {
        renderCast(creditsRes.value.cast?.slice(0, 8) || []);
      } else {
        document.getElementById('hero-cast').innerHTML = '<div class="overlay-skeleton">Cast unavailable</div>';
      }

      // Providers
      if (providersRes.status === 'fulfilled') {
        const region = state.settings.region || 'US';
        renderProviders(providersRes.value.results?.[region] || providersRes.value.results?.US, item.title);
      } else {
        document.getElementById('hero-providers').innerHTML = '<div class="provider-none">Provider info unavailable</div>';
      }
    } else {
      document.getElementById('hero-providers').innerHTML =
        '<div class="provider-none">Availability data requires a TMDB API key</div>';
      document.getElementById('hero-cast').innerHTML =
        '<div class="overlay-skeleton">Cast data requires a TMDB API key</div>';
      setOverlayFocus('actions', 0);
    }
  }

  function loadTrailer(container, candidates, fallbackImg) {
    if (!candidates.length) {
      container.innerHTML = fallbackImg
        ? `<div class="trailer-fallback" style="background-image:url('${fallbackImg}')"></div>`
        : `<div class="trailer-loading">No trailer available</div>`;
      return;
    }

    const key   = candidates[0].key;
    const ytUrl = `https://www.youtube.com/watch?v=${key}`;

    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'trailer-thumb-wrap';

    // Use the TMDB backdrop as the background — always looks good, never broken
    if (fallbackImg) {
      const bg = document.createElement('div');
      bg.className = 'trailer-fallback';
      bg.style.backgroundImage = `url('${fallbackImg}')`;
      wrap.appendChild(bg);
    }

    // Play button that opens YouTube in new tab
    const link = document.createElement('a');
    link.className = 'trailer-play-btn';
    link.href = ytUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.innerHTML = `
      <div class="trailer-play-circle">&#9654;</div>
      <span class="trailer-play-label">Watch Trailer</span>
    `;
    wrap.appendChild(link);
    container.appendChild(wrap);
  }

  function renderCast(castList) {
    const $cast = document.getElementById('hero-cast');
    if (!castList?.length) {
      $cast.innerHTML = '<div class="overlay-skeleton">No cast info available</div>';
      return;
    }
    $cast.innerHTML = '';
    castList.forEach(person => {
      const el = document.createElement('div');
      el.className = 'cast-member';

      if (person.profile_path) {
        const img = document.createElement('img');
        img.className = 'cast-avatar';
        img.src = `https://image.tmdb.org/t/p/w185${person.profile_path}`;
        img.alt = person.name;
        img.loading = 'lazy';
        img.addEventListener('error', () => {
          const ph = document.createElement('div');
          ph.className = 'cast-avatar-ph';
          ph.textContent = '\uD83D\uDC64';
          img.replaceWith(ph);
        });
        el.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.className = 'cast-avatar-ph';
        ph.textContent = '\uD83D\uDC64';
        el.appendChild(ph);
      }

      const nameEl = document.createElement('div');
      nameEl.className = 'cast-name';
      nameEl.textContent = person.name;
      const charEl = document.createElement('div');
      charEl.className = 'cast-char';
      charEl.textContent = person.character || '';
      el.appendChild(nameEl);
      el.appendChild(charEl);
      $cast.appendChild(el);
    });
  }

  function renderProviders(usData, title) {
    const $prov    = document.getElementById('hero-providers');
    const $rbSec   = document.getElementById('hero-rentbuy-section');
    const $rb      = document.getElementById('hero-rentbuy');
    const flatrate = usData?.flatrate || [];
    const free     = usData?.free     || [];
    const ads      = usData?.ads      || [];
    const rent     = usData?.rent     || [];
    const buy      = usData?.buy      || [];
    const tmdbLink = usData?.link     || null;
    const EXCLUDED = /amazon channel|with ads|apple tv channel|roku channel|paramount plus premium/i;

    // Build a map tracking whether each provider is flatrate or free/ads
    const streamMap = new Map();
    flatrate.filter(p => !EXCLUDED.test(p.provider_name))
            .forEach(p => streamMap.set(p.provider_id, { ...p, streamType: 'Subscription' }));
    [...free, ...ads].filter(p => !EXCLUDED.test(p.provider_name))
                     .forEach(p => {
                       if (!streamMap.has(p.provider_id))
                         streamMap.set(p.provider_id, { ...p, streamType: 'Free' });
                     });
    const all = [...streamMap.values()];

    // ── Streaming ──
    if (!all.length) {
      $prov.innerHTML = '<div class="provider-none">Not available for streaming in your region</div>';
    } else {
      $prov.innerHTML = '';
      all.slice(0, 8).forEach(p => {
        const urlFn = PROVIDER_URLS[p.provider_id];
        const href  = urlFn ? urlFn(title) : (tmdbLink || '#');
        const chip  = document.createElement('a');
        chip.className = 'provider-chip';
        chip.href      = href;
        chip.target    = '_blank';
        chip.rel       = 'noopener noreferrer';
        chip.title     = `Watch on ${p.provider_name}`;
        const imgEl = document.createElement('img');
        imgEl.src     = `https://image.tmdb.org/t/p/w45${p.logo_path}`;
        imgEl.alt     = p.provider_name;
        imgEl.loading = 'lazy';
        const textWrap = document.createElement('div');
        textWrap.className = 'rent-chip-text';
        const nameEl = document.createElement('span');
        nameEl.className = 'rent-chip-name';
        nameEl.textContent = p.provider_name;
        const subEl = document.createElement('span');
        subEl.className = 'rent-chip-sub';
        subEl.textContent = p.streamType;
        textWrap.appendChild(nameEl);
        textWrap.appendChild(subEl);
        chip.appendChild(imgEl);
        chip.appendChild(textWrap);
        $prov.appendChild(chip);
      });
    }

    // ── Rent or Buy ──
    const rbMap = new Map();
    rent.filter(p => !EXCLUDED.test(p.provider_name))
        .forEach(p => rbMap.set(p.provider_id, { ...p, canRent: true, canBuy: false }));
    buy.filter(p => !EXCLUDED.test(p.provider_name))
       .forEach(p => {
         if (rbMap.has(p.provider_id)) rbMap.get(p.provider_id).canBuy = true;
         else rbMap.set(p.provider_id, { ...p, canRent: false, canBuy: true });
       });

    if (rbMap.size > 0) {
      $rbSec.classList.remove('hidden');
      $rb.innerHTML = '';
      [...rbMap.values()].forEach(p => {
        const urlFn = PROVIDER_URLS[p.provider_id];
        const href  = urlFn ? urlFn(title) : (tmdbLink || '#');
        const chip  = document.createElement('a');
        chip.className = 'provider-chip rent-chip';
        chip.href      = href;
        chip.target    = '_blank';
        chip.rel       = 'noopener noreferrer';
        chip.title     = `Rent or buy on ${p.provider_name}`;
        const imgEl = document.createElement('img');
        imgEl.src     = `https://image.tmdb.org/t/p/w45${p.logo_path}`;
        imgEl.alt     = p.provider_name;
        imgEl.loading = 'lazy';
        const textWrap = document.createElement('div');
        textWrap.className = 'rent-chip-text';
        const nameEl = document.createElement('span');
        nameEl.className = 'rent-chip-name';
        nameEl.textContent = p.provider_name;
        const subEl = document.createElement('span');
        subEl.className = 'rent-chip-sub';
        subEl.textContent = p.canRent && p.canBuy ? 'Rent or Buy' : p.canRent ? 'Rent' : 'Buy';
        textWrap.appendChild(nameEl);
        textWrap.appendChild(subEl);
        chip.appendChild(imgEl);
        chip.appendChild(textWrap);
        $rb.appendChild(chip);
      });
    } else {
      $rbSec.classList.add('hidden');
    }

    // Re-sync focus ring if already on providers section
    if (state.overlaySection === 'providers') {
      setOverlayFocus('providers', state.overlayCol);
    }
  }

  function openOverlayFromHero() {
    openOverlay(CONTENT.heroes[carouselIndex]);
  }

  function closeOverlay() {
    state.overlayOpen = false;
    state.overlayItem = null;
    $heroOverlay.classList.add('hidden');
    document.body.style.overflow = '';
    document.getElementById('overlay-trailer-inner').innerHTML = '';
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
    // Right nav icons
    const notifBtn    = document.getElementById('notif-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const profileBtn  = document.getElementById('profile-btn');

    notifBtn.addEventListener('mouseenter',    () => setNavFocus(6));
    notifBtn.addEventListener('click',         () => showToast('🔔 No new notifications'));
    settingsBtn.addEventListener('mouseenter', () => setNavFocus(7));
    settingsBtn.addEventListener('click',      () => openSettings());
    profileBtn.addEventListener('mouseenter',  () => setNavFocus(8));
    profileBtn.addEventListener('click',       () => showToast('👤 Profile'));  }

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
  // ── Settings keyboard navigation ─────────────────────────
  let settingsFocusIdx = 0;

  function getSettingsFocusItems() {
    return [
      document.getElementById('settings-country'),
      ...document.querySelectorAll('#settings-provider-grid .svc-chip'),
      document.getElementById('settings-apply-btn'),
      document.getElementById('settings-clear-btn'),
    ];
  }

  function setSettingsFocus(idx) {
    const items = getSettingsFocusItems();
    settingsFocusIdx = Math.max(0, Math.min(idx, items.length - 1));
    items.forEach(el => el.classList.remove('settings-nav-focus'));
    const item = items[settingsFocusIdx];
    if (item) {
      item.classList.add('settings-nav-focus');
      item.focus();
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function getChipsPerRow() {
    const chips = [...document.querySelectorAll('#settings-provider-grid .svc-chip')];
    if (chips.length < 2) return chips.length || 1;
    const firstTop = chips[0].getBoundingClientRect().top;
    let count = 0;
    for (const chip of chips) {
      if (Math.abs(chip.getBoundingClientRect().top - firstTop) < 4) count++;
      else break;
    }
    return count || 2;
  }

  function handleSettingsKeys(e) {
    const key = e.key;
    if (key === 'Escape') { e.preventDefault(); closeSettings(); return; }

    const chips    = [...document.querySelectorAll('#settings-provider-grid .svc-chip')];
    const numChips = chips.length;
    const chipsStart = 1;
    const chipsEnd   = chipsStart + numChips - 1;
    const items    = getSettingsFocusItems();
    const inChips  = settingsFocusIdx >= chipsStart && settingsFocusIdx <= chipsEnd;
    const isSelect = settingsFocusIdx === 0;
    const isAction = settingsFocusIdx > chipsEnd;

    if (key === 'ArrowRight') {
      e.preventDefault();
      if (isSelect) {
        const sel = items[0];
        if (sel.selectedIndex < sel.options.length - 1) sel.selectedIndex++;
      } else {
        setSettingsFocus(Math.min(settingsFocusIdx + 1, items.length - 1));
      }
    } else if (key === 'ArrowLeft') {
      e.preventDefault();
      if (isSelect) {
        const sel = items[0];
        if (sel.selectedIndex > 0) sel.selectedIndex--;
      } else {
        setSettingsFocus(Math.max(settingsFocusIdx - 1, 0));
      }
    } else if (key === 'ArrowDown') {
      e.preventDefault();
      if (isSelect) {
        const sel = items[0];
        if (sel.selectedIndex < sel.options.length - 1) { sel.selectedIndex++; }
        else { setSettingsFocus(chipsStart); }
      } else if (inChips) {
        const perRow = getChipsPerRow();
        const nextIdx = settingsFocusIdx + perRow;
        setSettingsFocus(nextIdx > chipsEnd ? chipsEnd + 1 : nextIdx);
      } else if (isAction) {
        setSettingsFocus(Math.min(settingsFocusIdx + 1, items.length - 1));
      }
    } else if (key === 'ArrowUp') {
      e.preventDefault();
      if (isSelect) {
        const sel = items[0];
        if (sel.selectedIndex > 0) sel.selectedIndex--;
      } else if (inChips) {
        const perRow = getChipsPerRow();
        const prevIdx = settingsFocusIdx - perRow;
        setSettingsFocus(prevIdx < chipsStart ? 0 : prevIdx);
      } else if (isAction) {
        setSettingsFocus(chipsEnd);
      }
    } else if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      const item = items[settingsFocusIdx];
      if (item) item.click();
    }
  }

  // ── Settings Panel ───────────────────────────────────────
  function openSettings() {
    state.settingsPanelOpen = true;
    document.getElementById('settings-panel').classList.remove('hidden');
    document.getElementById('settings-country').value = state.settings.region;
    renderProviderChips();
    settingsFocusIdx = 0;
    requestAnimationFrame(() => setSettingsFocus(0));
  }

  function closeSettings() {
    state.settingsPanelOpen = false;
    document.getElementById('settings-panel').classList.add('hidden');
    setNavFocus(7);
  }

  function renderProviderChips() {
    const grid = document.getElementById('settings-provider-grid');
    grid.innerHTML = '';
    STREAMING_SERVICES.forEach(svc => {
      const btn = document.createElement('button');
      btn.className = 'svc-chip' + (state.settings.providers.includes(svc.id) ? ' selected' : '');
      btn.textContent = svc.name;
      btn.dataset.id = svc.id;
      btn.addEventListener('click', () => btn.classList.toggle('selected'));
      grid.appendChild(btn);
    });
  }

  async function applySettings() {
    const region   = document.getElementById('settings-country').value;
    const selected = [...document.querySelectorAll('.svc-chip.selected')].map(b => parseInt(b.dataset.id));

    state.settings.region    = region;
    state.settings.providers = selected;
    try { localStorage.setItem('gtv_settings', JSON.stringify(state.settings)); } catch(e) {}

    closeSettings();

    const hasKey = TMDB_KEY && TMDB_KEY !== 'YOUR_TMDB_API_KEY_HERE';
    if (!hasKey) { showToast('⚙️ Settings saved'); return; }

    showToast('🔄 Updating content…');
    try {
      HOME_CONTENT   = await loadContentFiltered(region, selected);
      MOVIES_CONTENT = null; // will reload with new filters on next visit
      SHOWS_CONTENT  = null; // will reload with new filters on next visit
      CONTENT = HOME_CONTENT;
    } catch(e) {
      showToast('⚠️ Could not update — keeping current content');
      return;
    }
    populateBanner();
    buildRows();
    setBannerFocus(0);
    const label = selected.length
      ? `✓ Showing content for ${selected.length} service${selected.length > 1 ? 's' : ''}`
      : '✓ Showing all content';
    showToast(label);
  }

  function setupSettingsPanel() {
    document.getElementById('settings-close').addEventListener('click', closeSettings);
    document.getElementById('settings-backdrop').addEventListener('click', closeSettings);
    document.getElementById('settings-apply-btn').addEventListener('click', applySettings);
    document.getElementById('settings-clear-btn').addEventListener('click', () => {
      document.querySelectorAll('.svc-chip').forEach(c => c.classList.remove('selected'));
      applySettings();
    });
  }
  // ── Start ──────────────────────────────────────────────
  init();

})();
