// ===================== GOOGLE TV APP =====================
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  const state = {
    activeTab: 'home',
    focusZone: 'nav',
    navIndex: 1,
    bannerCol: 0,
    rowIndex: 0,
    colIndex: 0,
    overlayOpen: false,
    overlayItem: null,
    overlaySection: 'actions',
    overlayCol: 0,
    settingsPanelOpen: false,
    notifPanelOpen: false,
    profileDropdownOpen: false,
    tmdbConfirmModalOpen: false,
    settings: { region: 'US', providers: [] },
  };

  // ── TMDB Auth ────────────────────────────────────────────
  const tmdbAuth = {
    sessionId:   null,
    accountId:   null,
    accountName: null,
    username:    null,
    watchlist:   new Set(), // set of `${mediaType}-${id}` keys
    ratings:     {},        // key -> score (1-10)
  };

  async function tmdbAuthFetch(endpoint, method = 'GET', body = null) {
    const url = `${TMDB_BASE}${endpoint}?api_key=${TMDB_KEY}&session_id=${tmdbAuth.sessionId}`;
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    return res.json();
  }

  let _pendingTmdbToken = null;

  async function tmdbLogin() {
    try {
      const data = await tmdbFetch('/authentication/token/new');
      _pendingTmdbToken = data.request_token;
      // Open TMDB auth in a new tab — no redirect URL needed
      window.open(`https://www.themoviedb.org/authenticate/${_pendingTmdbToken}`, '_blank');
      // Show the confirmation modal
      state.tmdbConfirmModalOpen = true;
      document.getElementById('tmdb-confirm-modal').classList.remove('hidden');
      requestAnimationFrame(() => setTmdbConfirmFocus(0));
      closeProfileDropdown();
    } catch(e) {
      showToast('⚠ Could not reach TMDB auth');
    }
  }

  async function tmdbConfirmLogin() {
    state.tmdbConfirmModalOpen = false;
    document.getElementById('tmdb-confirm-modal').classList.add('hidden');
    if (!_pendingTmdbToken) { showToast('⚠ No pending login'); return; }
    await tmdbCreateSession(_pendingTmdbToken);
    _pendingTmdbToken = null;
  }

  function tmdbCancelLogin() {
    _pendingTmdbToken = null;
    state.tmdbConfirmModalOpen = false;
    document.getElementById('tmdb-confirm-modal').classList.add('hidden');
  }

  async function tmdbCreateSession(requestToken) {
    try {
      const url = `${TMDB_BASE}/authentication/session/new?api_key=${TMDB_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_token: requestToken }),
      });
      const data = await res.json();
      if (data.success) {
        tmdbAuth.sessionId = data.session_id;
        localStorage.setItem('tmdb_session', data.session_id);
        await tmdbLoadAccount();
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
      } else {
        showToast('⚠ TMDB login failed');
      }
    } catch(e) {
      showToast('⚠ TMDB session error');
    }
  }

  async function tmdbLoadAccount() {
    try {
      const data = await tmdbAuthFetch('/account');
      tmdbAuth.accountId   = data.id;
      tmdbAuth.accountName = data.name || data.username;
      tmdbAuth.username    = data.username;
      updateProfileUI();
      await tmdbLoadWatchlist();
      await tmdbLoadRatings();
      showToast(`✓ Logged in as ${tmdbAuth.accountName}`);
      buildRecommendedRow();
    } catch(e) {
      console.warn('Could not load TMDB account:', e);
    }
  }

  async function tmdbLoadWatchlist() {
    try {
      const [mv, tv] = await Promise.all([
        tmdbAuthFetch(`/account/${tmdbAuth.accountId}/watchlist/movies`),
        tmdbAuthFetch(`/account/${tmdbAuth.accountId}/watchlist/tv`),
      ]);
      tmdbAuth.watchlist.clear();
      (mv.results || []).forEach(m => tmdbAuth.watchlist.add(`movie-${m.id}`));
      (tv.results || []).forEach(t => tmdbAuth.watchlist.add(`tv-${t.id}`));
    } catch(e) {}
  }

  async function tmdbLoadRatings() {
    try {
      const [mv, tv] = await Promise.all([
        tmdbAuthFetch(`/account/${tmdbAuth.accountId}/rated/movies`),
        tmdbAuthFetch(`/account/${tmdbAuth.accountId}/rated/tv`),
      ]);
      tmdbAuth.ratings = {};
      (mv.results || []).forEach(m => { tmdbAuth.ratings[`movie-${m.id}`] = m.rating; });
      (tv.results || []).forEach(t => { tmdbAuth.ratings[`tv-${t.id}`]    = t.rating; });
    } catch(e) {}
  }

  async function tmdbToggleWatchlist(item) {
    if (!tmdbAuth.sessionId) {
      showToast('🔒 Log in with TMDB to use Watchlist');
      return;
    }
    const key = `${item.mediaType}-${item.id}`;
    const add = !tmdbAuth.watchlist.has(key);
    try {
      await tmdbAuthFetch(`/account/${tmdbAuth.accountId}/watchlist`, 'POST', {
        media_type: item.mediaType,
        media_id:   item.id,
        watchlist:  add,
      });
      if (add) tmdbAuth.watchlist.add(key);
      else     tmdbAuth.watchlist.delete(key);
      updateWatchlistBtn(item);
      showToast(add ? `✓ Added to Watchlist` : `✓ Removed from Watchlist`);
      // Refresh recommendations on the home tab
      buildRecommendedRow();
    } catch(e) {
      showToast('⚠ Watchlist update failed');
    }
  }

  async function tmdbRateItem(item, score) {
    if (!tmdbAuth.sessionId) {
      showToast('🔒 Log in with TMDB to rate titles');
      return;
    }
    const key = `${item.mediaType}-${item.id}`;
    try {
      if (score === 0) {
        await tmdbAuthFetch(`/${item.mediaType}/${item.id}/rating`, 'DELETE');
        delete tmdbAuth.ratings[key];
        showToast('✓ Rating removed');
      } else {
        await tmdbAuthFetch(`/${item.mediaType}/${item.id}/rating`, 'POST', { value: score });
        tmdbAuth.ratings[key] = score;
        showToast(`✓ Rated ${score}/10`);
      }
      updateStarsUI(item);
    } catch(e) {
      showToast('⚠ Rating failed');
    }
  }

  function tmdbLogout() {
    tmdbAuth.sessionId   = null;
    tmdbAuth.accountId   = null;
    tmdbAuth.accountName = null;
    tmdbAuth.username    = null;
    tmdbAuth.watchlist.clear();
    tmdbAuth.ratings = {};
    localStorage.removeItem('tmdb_session');
    updateProfileUI();
    closeProfileDropdown();
    showToast('👋 Logged out of TMDB');
    document.getElementById('rec-row-section')?.remove();
  }

  const AVATAR_COLORS = [
    'linear-gradient(135deg,#e53935,#ff6b6b)',   // red
    'linear-gradient(135deg,#e8710a,#ffab40)',   // orange
    'linear-gradient(135deg,#f9a825,#ffee58)',   // yellow
    'linear-gradient(135deg,#2e7d32,#66bb6a)',   // green
    'linear-gradient(135deg,#00838f,#4dd0e1)',   // cyan
    'linear-gradient(135deg,#1565c0,#42a5f5)',   // blue
    'linear-gradient(135deg,#6a1b9a,#ce93d8)',   // purple
    'linear-gradient(135deg,#c2185b,#f48fb1)',   // pink
  ];
  let _avatarColor = null;

  function updateProfileUI() {
    const loggedIn = !!tmdbAuth.sessionId;
    const $btn     = document.getElementById('profile-btn');
    const $userRow = document.getElementById('profile-dropdown-user');
    const $loginBtn  = document.getElementById('tmdb-login-btn');
    const $logoutBtn = document.getElementById('tmdb-logout-btn');
    const $avatarLg  = document.getElementById('profile-avatar-lg');
    const $name      = document.getElementById('profile-name');
    const $uname     = document.getElementById('profile-username');

    if (loggedIn) {
      // Pick a random color once per session
      if (!_avatarColor) {
        _avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      }
      const initials = (tmdbAuth.accountName || tmdbAuth.username || '?').slice(0,2).toUpperCase();
      $btn.textContent = initials;
      $btn.style.background = _avatarColor;
      $avatarLg.textContent = initials;
      $avatarLg.style.background = _avatarColor;
      $name.textContent  = tmdbAuth.accountName || tmdbAuth.username;
      $uname.textContent = '@' + (tmdbAuth.username || '');
      $userRow.classList.remove('hidden');
      $loginBtn.classList.add('hidden');
      $logoutBtn.classList.remove('hidden');
    } else {
      _avatarColor = null;
      $btn.textContent = '';
      $btn.style.background = '#3a3a3a';
      $userRow.classList.add('hidden');
      $loginBtn.classList.remove('hidden');
      $logoutBtn.classList.add('hidden');
    }
  }

  function updateWatchlistBtn(item) {
    const inList = item && tmdbAuth.watchlist.has(`${item.mediaType}-${item.id}`);
    $heroWatchlist.classList.toggle('in-list', inList);
    $heroWatchlist.innerHTML = inList
      ? '<i class="fas fa-check"></i> In Watchlist'
      : '<i class="fas fa-plus"></i> Watchlist';
  }

  function updateStarsUI(item) {
    const key    = item ? `${item.mediaType}-${item.id}` : null;
    const score  = key ? (tmdbAuth.ratings[key] || 0) : 0;
    const stars  = document.querySelectorAll('.star-btn');
    const $label = document.getElementById('hero-rating-label');
    const $clear = document.getElementById('hero-rating-clear');
    stars.forEach(s => {
      const v = parseInt(s.dataset.value);
      s.classList.toggle('rated', score > 0 && v <= score);
    });
    if (score > 0) {
      $label.textContent = `Your rating: ${score}/10`;
      $clear.classList.remove('hidden');
    } else {
      $label.textContent = tmdbAuth.sessionId ? 'Tap a star to rate' : 'Log in to rate';
      $clear.classList.add('hidden');
    }
  }

  function openProfileDropdown() {
    state.profileDropdownOpen = true;
    document.getElementById('profile-dropdown').classList.remove('hidden');
    requestAnimationFrame(() => setProfileDropdownFocus(0));
  }

  function closeProfileDropdown() {
    state.profileDropdownOpen = false;
    document.getElementById('profile-dropdown').classList.add('hidden');
  }

  function toggleProfileDropdown() {
    if (state.profileDropdownOpen) closeProfileDropdown();
    else openProfileDropdown();
  }

  // Nav tabs order
  const NAV_TABS = ['search', 'home', 'movies', 'shows', 'shop', 'library'];

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

    // Handle TMDB auth callback — restore saved session on page load
    try {
      const savedSession = localStorage.getItem('tmdb_session');
      if (savedSession) {
        tmdbAuth.sessionId = savedSession;
        await tmdbLoadAccount();
      }
    } catch(e) {}

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
    setupNotifPanel();
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
    // Kick off Recommended For You row asynchronously (home tab only)
    buildRecommendedRow();
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

  // ── Recommended For You row ─────────────────────────────────────────────
  const REC_ROW_ID = 'rec-row-section';

  function buildRecommendedRowSkeleton() {
    // Only show on home tab
    if (state.activeTab !== 'home') return;

    // Remove any existing rec row
    document.getElementById(REC_ROW_ID)?.remove();

    // Not logged in or no watchlist → stay hidden
    if (!tmdbAuth.sessionId || tmdbAuth.watchlist.size === 0) return;

    const section = document.createElement('div');
    section.className = 'row-section';
    section.id = REC_ROW_ID;

    const labelRow = document.createElement('div');
    labelRow.className = 'row-label-row';
    const label = document.createElement('div');
    label.className = 'row-label';
    label.innerHTML = '<i class="fas fa-wand-magic-sparkles" style="color:#a78bfa;margin-right:8px;font-size:16px"></i>Recommended For You';
    labelRow.appendChild(label);

    const scroller = document.createElement('div');
    scroller.className = 'row-scroller';
    const track = document.createElement('div');
    track.className = 'row-track rec-row-track';

    // Skeleton placeholders
    for (let i = 0; i < 8; i++) {
      const skel = document.createElement('div');
      skel.className = 'card rec-skeleton';
      track.appendChild(skel);
    }

    const rowWrap = document.createElement('div');
    rowWrap.className = 'row-wrap';
    rowWrap.appendChild(scroller);
    scroller.appendChild(track);

    section.appendChild(labelRow);
    section.appendChild(rowWrap);

    // Insert as the very first child of content-area
    $contentArea.insertBefore(section, $contentArea.firstChild);
  }

  async function buildRecommendedRow() {
    // Only on home tab
    if (state.activeTab !== 'home') return;
    if (!tmdbAuth.sessionId || tmdbAuth.watchlist.size === 0) {
      document.getElementById(REC_ROW_ID)?.remove();
      return;
    }

    // Show skeleton first
    buildRecommendedRowSkeleton();

    try {
      // Shuffle watchlist so we get different seeds on every load
      const allSeeds = [...tmdbAuth.watchlist]
        .map(key => {
          const [mediaType, ...rest] = key.split('-');
          return { mediaType, id: rest.join('-') };
        })
        .sort(() => Math.random() - 0.5);

      const seeds = allSeeds.slice(0, 8);

      // Fetch recommendations for each seed in parallel, random page for variety
      const results = await Promise.allSettled(
        seeds.map(s => {
          const page = Math.floor(Math.random() * 3) + 1;
          return tmdbFetch(`/${s.mediaType}/${s.id}/recommendations`, `&page=${page}`);
        })
      );

      const seen  = new Set();
      const items = [];

      // Collect all valid candidates first, then shuffle before capping
      for (const res of results) {
        if (res.status !== 'fulfilled') continue;
        for (const r of (res.value.results || [])) {
          if (!r.id) continue;
          const mt  = r.media_type || (r.first_air_date !== undefined ? 'tv' : 'movie');
          const key = `${mt}-${r.id}`;
          if (tmdbAuth.watchlist.has(key)) continue;
          if (seen.has(key)) continue;
          if (r.adult) continue;
          seen.add(key);
          items.push(toCard({ ...r, media_type: mt }));
        }
      }

      // Shuffle so the order is different each time, then take 20
      items.sort(() => Math.random() - 0.5);
      items.splice(20);

      const section = document.getElementById(REC_ROW_ID);
      if (!section) return; // tab changed while fetching

      if (!items.length) {
        section.remove();
        return;
      }

      // Replace skeleton track with real cards
      const track = section.querySelector('.rec-row-track');
      if (!track) return;
      track.innerHTML = '';
      items.forEach((item, ci) => {
        const card = createCard(item, -1, ci, false);
        card.addEventListener('click', () => openOverlay(item));
        track.appendChild(card);
      });

      // Wire up nav arrows now that cards are present
      const scroller  = section.querySelector('.row-scroller');
      const rowWrap   = section.querySelector('.row-wrap');
      const btnPrev   = document.createElement('button');
      btnPrev.className = 'row-nav-btn row-nav-prev';
      btnPrev.innerHTML = '<i class="fas fa-chevron-left"></i>';
      btnPrev.setAttribute('aria-label', 'Scroll left');
      const btnNext   = document.createElement('button');
      btnNext.className = 'row-nav-btn row-nav-next';
      btnNext.innerHTML = '<i class="fas fa-chevron-right"></i>';
      btnNext.setAttribute('aria-label', 'Scroll right');
      const scrollAmt = () => scroller.clientWidth * 0.75;
      btnPrev.addEventListener('click', () => scroller.scrollBy({ left: -scrollAmt(), behavior: 'smooth' }));
      btnNext.addEventListener('click', () => scroller.scrollBy({ left:  scrollAmt(), behavior: 'smooth' }));
      function syncArrows() {
        const atStart = scroller.scrollLeft <= 4;
        const atEnd   = scroller.scrollLeft >= scroller.scrollWidth - scroller.clientWidth - 4;
        btnPrev.classList.toggle('hidden', atStart);
        btnNext.classList.toggle('hidden', atEnd);
      }
      scroller.addEventListener('scroll', syncArrows, { passive: true });
      rowWrap.insertBefore(btnPrev, scroller);
      rowWrap.appendChild(btnNext);
      requestAnimationFrame(syncArrows);

    } catch(e) {
      document.getElementById(REC_ROW_ID)?.remove();
    }
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
    if (ri === -1) return document.querySelectorAll(`#${REC_ROW_ID} .card`).length;
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
    if (state.notifPanelOpen) {
      if (e.key === 'Escape') { e.preventDefault(); closeNotifPanel(); }
      return;
    }

    if (state.settingsPanelOpen) {
      handleSettingsKeys(e);
      return;
    }

    if (state.tmdbConfirmModalOpen) {
      handleTmdbConfirmKeys(e);
      return;
    }

    if (state.profileDropdownOpen) {
      handleProfileDropdownKeys(e);
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
      if (state.focusZone === 'library') { setNavFocus(state.navIndex); return; }
      if (state.focusZone !== 'search') return;
    }

    if (state.focusZone === 'search') {
      handleSearchKeys(e);
    } else if (state.focusZone === 'nav') {
      handleNavKeys(key);
    } else if (state.focusZone === 'banner') {
      handleBannerKeys(key);
    } else if (state.focusZone === 'content') {
      handleContentKeys(key);
    } else if (state.focusZone === 'library') {
      handleLibraryKeys(key);
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
      if (state.activeTab === 'library') {
        setLibraryFocus(0);
        return;
      }
      if (state.navIndex <= 5) setBannerFocus(0);
    } else if (key === 'Enter' || key === ' ') {
      if (state.navIndex <= 5) {
        activateTab(state.navIndex);
      } else if (state.navIndex === 6) {
        openNotifPanel();
      } else if (state.navIndex === 7) {
        openSettings();
      } else if (state.navIndex === 8) {
        toggleProfileDropdown();
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
      const hasRecRow = !!document.getElementById(REC_ROW_ID);
      moveFocusToCard(hasRecRow ? -1 : 0, 0);
    } else if (key === 'Enter' || key === ' ') {
      if (state.bannerCol === 0) {
        const hero = CONTENT.heroes[carouselIndex];
        if (!hero) return;
        const mediaType = hero.mediaType || hero.media_type || 'movie';
        const win = window.open('', '_blank');
        if (!win) { showToast('Allow popups to watch the trailer'); return; }
        tmdbFetch(`/${mediaType}/${hero.id}/videos`).then(data => {
          const vids = data.results || [];
          const trailer =
            vids.find(v => v.type === 'Trailer' && v.site === 'YouTube') ||
            vids.find(v => v.type === 'Teaser'  && v.site === 'YouTube') ||
            vids.find(v => v.site === 'YouTube');
          if (trailer) {
            win.location.href = `https://www.youtube.com/watch?v=${trailer.key}`;
          } else {
            win.close();
            showToast('No trailer available');
          }
        }).catch(() => { win.close(); showToast('Could not load trailer'); });
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
    const hasRecRow = !!document.getElementById(REC_ROW_ID);

    if (key === 'ArrowRight') {
      if (ci < maxCol) moveFocusToCard(ri, ci + 1);
    } else if (key === 'ArrowLeft') {
      if (ci > 0) moveFocusToCard(ri, ci - 1);
      else if (ci === 0) setBannerFocus(0);
    } else if (key === 'ArrowDown') {
      if (ri === -1) {
        // rec row → first real row
        moveFocusToCard(0, Math.min(ci, rowLength(0) - 1));
      } else if (ri < maxRow) {
        const newCol = Math.min(ci, rowLength(ri + 1) - 1);
        moveFocusToCard(ri + 1, newCol);
      }
    } else if (key === 'ArrowUp') {
      if (ri === 0 && hasRecRow) {
        // first real row → rec row
        moveFocusToCard(-1, Math.min(ci, rowLength(-1) - 1));
      } else if (ri === 0 || ri === -1) {
        setBannerFocus(1);
      } else {
        const newCol = Math.min(ci, rowLength(ri - 1) - 1);
        moveFocusToCard(ri - 1, newCol);
      }
    } else if (key === 'Enter' || key === ' ') {
      if (ri === -1) {
        // rec row cards have a direct click listener
        getCard(-1, ci)?.click();
      } else {
        const item = CONTENT.rows[ri]?.items[ci];
        if (item) openOverlay(item);
      }
    } else if (key === 'Escape' || key === 'Backspace') {
      setBannerFocus(0);
    }
  }

  // ── TMDB Confirm Modal keyboard nav ────────────────────────────────────────
  let tmdbConfirmFocusIdx = 0;

  function getTmdbConfirmBtns() {
    return [
      document.getElementById('tmdb-confirm-ok'),
      document.getElementById('tmdb-confirm-cancel'),
    ];
  }

  function setTmdbConfirmFocus(idx) {
    const btns = getTmdbConfirmBtns();
    tmdbConfirmFocusIdx = Math.max(0, Math.min(idx, btns.length - 1));
    btns.forEach(b => b.classList.remove('confirm-btn-focused'));
    btns[tmdbConfirmFocusIdx]?.classList.add('confirm-btn-focused');
    btns[tmdbConfirmFocusIdx]?.focus();
  }

  function handleTmdbConfirmKeys(e) {
    const key = e.key;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' ','Escape','Tab'].includes(key)) e.preventDefault();
    if (key === 'Escape') { tmdbCancelLogin(); return; }
    const btns = getTmdbConfirmBtns();
    if (key === 'ArrowRight' || key === 'ArrowDown') {
      setTmdbConfirmFocus(Math.min(tmdbConfirmFocusIdx + 1, btns.length - 1));
    } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
      setTmdbConfirmFocus(Math.max(tmdbConfirmFocusIdx - 1, 0));
    } else if (key === 'Enter' || key === ' ') {
      btns[tmdbConfirmFocusIdx]?.click();
    }
  }

  // ── Library keyboard nav ───────────────────────────────
  let libraryFocusIdx = 0;

  function getLibraryCards() {
    return [...document.querySelectorAll('#library-grid .card')];
  }

  function setLibraryFocus(idx) {
    const cards = getLibraryCards();
    if (!cards.length) return;
    libraryFocusIdx = Math.max(0, Math.min(idx, cards.length - 1));
    state.focusZone = 'library';
    cards.forEach(c => c.classList.remove('focused'));
    const card = cards[libraryFocusIdx];
    card.classList.add('focused');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function getLibraryColsPerRow() {
    const cards = getLibraryCards();
    if (cards.length < 2) return 1;
    const firstTop = cards[0].getBoundingClientRect().top;
    let count = 0;
    for (const c of cards) {
      if (Math.abs(c.getBoundingClientRect().top - firstTop) < 4) count++;
      else break;
    }
    return count || 1;
  }

  function handleLibraryKeys(key) {
    const cards = getLibraryCards();
    if (!cards.length) {
      if (key === 'Escape') setNavFocus(state.navIndex);
      return;
    }
    const cols = getLibraryColsPerRow();
    const max  = cards.length - 1;

    if (key === 'ArrowRight') {
      if (libraryFocusIdx < max) setLibraryFocus(libraryFocusIdx + 1);
    } else if (key === 'ArrowLeft') {
      if (libraryFocusIdx > 0) setLibraryFocus(libraryFocusIdx - 1);
    } else if (key === 'ArrowDown') {
      const next = libraryFocusIdx + cols;
      if (next <= max) setLibraryFocus(next);
    } else if (key === 'ArrowUp') {
      const prev = libraryFocusIdx - cols;
      if (prev >= 0) setLibraryFocus(prev);
      else setNavFocus(state.navIndex);
    } else if (key === 'Enter' || key === ' ') {
      cards[libraryFocusIdx]?.click();
    } else if (key === 'Escape') {
      setNavFocus(state.navIndex);
    }
  }

  // ── Profile dropdown keyboard nav ────────────────────
  let profileFocusIdx = 0;

  function getProfileDropdownBtns() {
    return [...document.querySelectorAll('#profile-dropdown button:not(.hidden)')];
  }

  function setProfileDropdownFocus(idx) {
    const btns = getProfileDropdownBtns();
    profileFocusIdx = Math.max(0, Math.min(idx, btns.length - 1));
    btns.forEach(b => b.classList.remove('profile-dd-focused'));
    btns[profileFocusIdx]?.classList.add('profile-dd-focused');
    btns[profileFocusIdx]?.focus();
  }

  function handleProfileDropdownKeys(e) {
    const key = e.key;
    if (['ArrowUp','ArrowDown','Enter',' ','Escape','Tab'].includes(key)) e.preventDefault();
    if (key === 'Escape') { closeProfileDropdown(); setNavFocus(8); return; }
    const btns = getProfileDropdownBtns();
    if      (key === 'ArrowDown') setProfileDropdownFocus(Math.min(profileFocusIdx + 1, btns.length - 1));
    else if (key === 'ArrowUp')   setProfileDropdownFocus(Math.max(profileFocusIdx - 1, 0));
    else if (key === 'Enter' || key === ' ') btns[profileFocusIdx]?.click();
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
        setOverlayFocus('actions', 0);
      } else if (sec === 'actions') {
        const chips = document.querySelectorAll('.provider-chip');
        if (chips.length) setOverlayFocus('providers', 0);
      }
    } else if (key === 'ArrowUp') {
      if (sec === 'actions') {
        if (document.querySelector('.trailer-play-btn')) setOverlayFocus('trailer', 0);
      } else if (sec === 'providers') {
        setOverlayFocus('actions', 0);
      }
    } else if (key === 'ArrowLeft') {
      if (sec === 'providers' && col > 0) setOverlayFocus('providers', col - 1);
    } else if (key === 'ArrowRight') {
      if (sec === 'providers') {
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
      target = document.getElementById('hero-watchlist');
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
      const link = document.querySelector('.trailer-play-btn');
      if (link?.href) window.open(link.href, '_blank', 'noopener,noreferrer');
    } else if (s === 'actions') {
      document.getElementById('hero-watchlist')?.click();
    } else if (s === 'providers') {
      const chips = [...document.querySelectorAll('.provider-chip')];
      chips[c]?.click();
    }
  }

  // ── Tab activation ─────────────────────────────────────
  // Show the loading screen for `ms` ms as a page transition effect.
  let _transitionTimer = null;
  function showPageTransition(ms = 1000) {
    const $loader = document.getElementById('loading-screen');
    if (!$loader) return;
    clearTimeout(_transitionTimer);
    $loader.classList.remove('hidden');
    _transitionTimer = setTimeout(() => $loader.classList.add('hidden'), ms);
  }

  // Returns a promise that resolves after the loader has had time to fade in.
  function startTransition(ms = 1000) {
    showPageTransition(ms);
    return new Promise(resolve => setTimeout(resolve, 500));
  }

  async function activateTab(idx) {
    const tab = NAV_TABS[idx];
    state.activeTab = tab;
    syncTabActive();

    if (tab === 'search') {
      openSearchView();
    } else if (tab === 'home') {
      await startTransition();
      closeSearchView();
      closeLibraryView();
      closeShopView();
      CONTENT = HOME_CONTENT;
      populateBanner();
      buildRows();
      setBannerFocus(0);
    } else if (tab === 'movies') {
      await startTransition();
      closeSearchView();
      closeLibraryView();
      closeShopView();
      if (MOVIES_CONTENT) {
        CONTENT = MOVIES_CONTENT;
        populateBanner();
        buildRows();
        setBannerFocus(0);
      } else {
        loadMoviesTabContent();
      }
    } else if (tab === 'shows') {
      await startTransition();
      closeSearchView();
      closeLibraryView();
      closeShopView();
      if (SHOWS_CONTENT) {
        CONTENT = SHOWS_CONTENT;
        populateBanner();
        buildRows();
        setBannerFocus(0);
      } else {
        loadShowsTabContent();
      }
    } else if (tab === 'library') {
      await startTransition();
      closeSearchView();
      closeShopView();
      openLibraryView();
    } else if (tab === 'shop') {
      await startTransition();
      closeSearchView();
      closeLibraryView();
      openShopView();
    } else {
      await startTransition();
      showToast('📺 ' + capitalise(tab));
      setBannerFocus(0);
    }
  }

  function openLibraryView() {
    document.getElementById('hero-banner').style.display  = 'none';
    document.getElementById('content-area').style.display = 'none';
    document.getElementById('library-view').classList.remove('hidden');
    renderLibrary();
  }

  function closeLibraryView() {
    document.getElementById('library-view').classList.add('hidden');
    document.getElementById('hero-banner').style.display  = '';
    document.getElementById('content-area').style.display = '';
  }

  function openShopView() {
    document.getElementById('hero-banner').style.display  = 'none';
    document.getElementById('content-area').style.display = 'none';
    document.getElementById('shop-view').classList.remove('hidden');
    document.getElementById('shop-empty').classList.add('visible');
  }

  function closeShopView() {
    document.getElementById('shop-view').classList.add('hidden');
    document.getElementById('hero-banner').style.display  = '';
    document.getElementById('content-area').style.display = '';
  }

  async function renderLibrary() {
    const $empty   = document.getElementById('library-empty');
    const $grid    = document.getElementById('library-grid');
    const $heading = document.getElementById('library-empty-heading');
    const $sub     = document.getElementById('library-empty-sub');
    const $loginBtn = document.getElementById('library-login-btn');

    $grid.innerHTML = '';
    $empty.classList.remove('visible');

    if (!tmdbAuth.sessionId) {
      $heading.textContent = "You're Not Logged In";
      $sub.textContent     = 'Log in to TMDB to use Watchlist.';
      $loginBtn.classList.remove('hidden');
      $empty.classList.add('visible');
      return;
    }

    $loginBtn.classList.add('hidden');

    // Reload watchlist from TMDB to get full item details
    try {
      const [mv, tv] = await Promise.all([
        tmdbAuthFetch(`/account/${tmdbAuth.accountId}/watchlist/movies`),
        tmdbAuthFetch(`/account/${tmdbAuth.accountId}/watchlist/tv`),
      ]);
      const movies = (mv.results || []).map(m => toCard(m));
      const shows  = (tv.results || []).map(t => toCard({ ...t, media_type: 'tv' }));
      const all    = [...movies, ...shows];

      // Refresh the in-memory set too
      tmdbAuth.watchlist.clear();
      movies.forEach(m => tmdbAuth.watchlist.add(`movie-${m.id}`));
      shows.forEach(t  => tmdbAuth.watchlist.add(`tv-${t.id}`));

      if (!all.length) {
        $heading.textContent = "Nothing's here yet!";
        $sub.textContent     = 'Add shows or movies to your Watchlist and they will appear here!';
        $empty.classList.add('visible');
        return;
      }

      all.forEach(item => {
        const card = createCard(item, 0, 0, false);
        // Override click to open overlay directly
        card.addEventListener('click', () => openOverlay(item));
        $grid.appendChild(card);
      });
    } catch(e) {
      $heading.textContent = 'Could not load Watchlist';
      $sub.textContent     = 'Please try again later.';
      $empty.classList.add('visible');
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

    // Update watchlist & rating UI immediately
    updateWatchlistBtn(item);
    updateStarsUI(item);

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
        const genres = (d.genres || []).slice(0, 3).map(g => g.name).join(', ');
        $heroMeta.textContent = [year, type, rating, runtime, genres].filter(Boolean).join('  \u00b7  ');
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
    $heroWatchlist.addEventListener('click', () => {
      if (state.overlayItem) tmdbToggleWatchlist(state.overlayItem);
    });

    // Rating stars
    const stars = document.querySelectorAll('.star-btn');
    stars.forEach(star => {
      star.addEventListener('mouseenter', () => {
        const v = parseInt(star.dataset.value);
        stars.forEach(s => s.classList.toggle('hovered', parseInt(s.dataset.value) <= v));
      });
      star.addEventListener('mouseleave', () => {
        stars.forEach(s => s.classList.remove('hovered'));
      });
      star.addEventListener('click', () => {
        if (state.overlayItem) tmdbRateItem(state.overlayItem, parseInt(star.dataset.value));
      });
    });
    document.getElementById('hero-rating-clear').addEventListener('click', () => {
      if (state.overlayItem) tmdbRateItem(state.overlayItem, 0);
    });

    // Banner play/info buttons
    const $bp = document.getElementById('banner-play');
    const $bi = document.getElementById('banner-info');
    $bp.addEventListener('click', async (e) => {
      e.stopPropagation();
      const hero = CONTENT.heroes[carouselIndex];
      if (!hero) return;
      const mediaType = hero.mediaType || hero.media_type || 'movie';
      // Open the window NOW (synchronously in the click handler) so browsers
      // don't treat it as a blocked popup after the async fetch resolves.
      const win = window.open('', '_blank');
      if (!win) { showToast('Allow popups to watch the trailer'); return; }
      try {
        const data = await tmdbFetch(`/${mediaType}/${hero.id}/videos`);
        const vids = data.results || [];
        const trailer =
          vids.find(v => v.type === 'Trailer' && v.site === 'YouTube') ||
          vids.find(v => v.type === 'Teaser'  && v.site === 'YouTube') ||
          vids.find(v => v.site === 'YouTube');
        if (trailer) {
          win.location.href = `https://www.youtube.com/watch?v=${trailer.key}`;
        } else {
          win.close();
          showToast('No trailer available');
        }
      } catch {
        win.close();
        showToast('Could not load trailer');
      }
    });
    $bi.addEventListener('click', (e) => { e.stopPropagation(); openOverlayFromHero(); });

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
    notifBtn.addEventListener('click',         () => openNotifPanel());
    settingsBtn.addEventListener('mouseenter', () => setNavFocus(7));
    settingsBtn.addEventListener('click',      () => openSettings());
    profileBtn.addEventListener('mouseenter',  () => setNavFocus(8));
    profileBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleProfileDropdown(); });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#profile-wrap')) closeProfileDropdown();
    });

    document.getElementById('tmdb-login-btn').addEventListener('click', () => { closeProfileDropdown(); tmdbLogin(); });
    document.getElementById('tmdb-logout-btn').addEventListener('click', tmdbLogout);
    document.getElementById('tmdb-confirm-ok').addEventListener('click', tmdbConfirmLogin);
    document.getElementById('tmdb-confirm-cancel').addEventListener('click', tmdbCancelLogin);
    document.getElementById('library-login-btn').addEventListener('click', () => tmdbLogin());
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
  // ── Settings keyboard navigation ─────────────────────────
  const COUNTRIES = [
    { code: 'CA', label: '🇨🇦 Canada' },
    { code: 'GB', label: '🇬🇧 United Kingdom' },
    { code: 'US', label: '🇺🇸 United States' },
  ];
  let countryIdx = COUNTRIES.findIndex(c => c.code === 'US');

  function getCountryCode() {
    return COUNTRIES[countryIdx].code;
  }

  function setCountryByCode(code) {
    const idx = COUNTRIES.findIndex(c => c.code === code);
    countryIdx = idx >= 0 ? idx : 0;
    document.getElementById('country-label').textContent = COUNTRIES[countryIdx].label;
  }

  function stepCountry(dir) {
    countryIdx = (countryIdx + dir + COUNTRIES.length) % COUNTRIES.length;
    const label = document.getElementById('country-label');
    label.textContent = COUNTRIES[countryIdx].label;
    // brief pop animation
    label.style.transition = 'none';
    label.style.opacity = '0.4';
    requestAnimationFrame(() => {
      label.style.transition = 'opacity 0.15s';
      label.style.opacity = '1';
    });
  }

  let settingsFocusIdx = 0;

  function getSettingsFocusItems() {
    return [
      document.getElementById('settings-country-picker'),
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
        stepCountry(1);
      } else {
        setSettingsFocus(Math.min(settingsFocusIdx + 1, items.length - 1));
      }
    } else if (key === 'ArrowLeft') {
      e.preventDefault();
      if (isSelect) {
        stepCountry(-1);
      } else {
        setSettingsFocus(Math.max(settingsFocusIdx - 1, 0));
      }
    } else if (key === 'ArrowDown') {
      e.preventDefault();
      if (isSelect) {
        setSettingsFocus(chipsStart);
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
        // already at top, nowhere to go
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

  // ── Notifications / Tips Panel ──────────────────────────
  function openNotifPanel() {
    state.notifPanelOpen = true;
    document.getElementById('notif-panel').classList.remove('hidden');
    // Stop the ring animation and hide the badge once the user opens the panel
    const bell = document.querySelector('.bell-ring');
    if (bell) bell.style.animation = 'none';
    const badge = document.querySelector('.notif-badge');
    if (badge) badge.style.opacity = '0';
  }

  function closeNotifPanel() {
    state.notifPanelOpen = false;
    document.getElementById('notif-panel').classList.add('hidden');
    setNavFocus(6);
  }

  function setupNotifPanel() {
    document.getElementById('notif-close').addEventListener('click', closeNotifPanel);
    document.getElementById('notif-backdrop').addEventListener('click', closeNotifPanel);
  }

  // ── Settings Panel ───────────────────────────────────────
  function openSettings() {
    state.settingsPanelOpen = true;
    document.getElementById('settings-panel').classList.remove('hidden');
    setCountryByCode(state.settings.region);
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
    const region   = getCountryCode();
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
    document.getElementById('country-prev').addEventListener('click', () => stepCountry(-1));
    document.getElementById('country-next').addEventListener('click', () => stepCountry(1));
    document.getElementById('settings-clear-btn').addEventListener('click', () => {
      document.querySelectorAll('.svc-chip').forEach(c => c.classList.remove('selected'));
      applySettings();
    });
  }
  // ── Start ──────────────────────────────────────────────
  init();

})();
