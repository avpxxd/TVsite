// ===================== TMDB DATA LOADER =====================
// Get a free API key at: https://www.themoviedb.org/settings/api
const TMDB_KEY  = 'fbbda9d787cf6990da601ed605eca606';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG       = 'https://image.tmdb.org/t/p';

async function tmdbFetch(endpoint, params = '') {
  const url = `${TMDB_BASE}${endpoint}?api_key=${TMDB_KEY}&language=en-US${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${endpoint} failed (${res.status})`);
  return res.json();
}

function posterUrl(path)   { return path ? `${IMG}/w500${path}`    : ''; }
function backdropUrl(path) { return path ? `${IMG}/original${path}` : ''; }

function toHero(item) {
  const isTV  = !!item.name;
  const title = item.title || item.name;
  const year  = (item.release_date || item.first_air_date || '').slice(0, 4);
  const rating = item.vote_average ? '★ ' + item.vote_average.toFixed(1) : '';
  const type  = isTV ? 'TV Series' : 'Movie';
  return {
    title,
    meta:      [year, type, rating].filter(Boolean).join('  ·  '),
    desc:      item.overview || '',
    bg:        backdropUrl(item.backdrop_path),
    badge:     'Trending',
    id:        item.id,
    mediaType: isTV ? 'tv' : 'movie',
  };
}

function toCard(item, badge = '') {
  const isTV  = item.media_type === 'tv' || !!item.name;
  const title = item.title || item.name || 'Unknown';
  const year  = (item.release_date || item.first_air_date || '').slice(0, 4);
  const rating = item.vote_average ? '★ ' + item.vote_average.toFixed(1) : '';
  const sub   = [year, rating].filter(Boolean).join('  ·  ');
  const autoBadge = badge || (item.vote_average >= 8.0 ? 'TOP' : '');
  return {
    title,
    sub,
    img:      posterUrl(item.poster_path),
    backdrop: backdropUrl(item.backdrop_path),
    badge:    autoBadge,
    desc:     item.overview || '',
    meta:     sub,
    id:       item.id,
    mediaType: isTV ? 'tv' : 'movie',
  };
}

async function loadContent() {
  const [
    trendingMovies,
    nowPlaying,
    popularMovies,
    popularTV,
    topRatedMovies,
    topRatedTV,
    upcoming,
    trendingAll,
  ] = await Promise.all([
    tmdbFetch('/trending/movie/week'),
    tmdbFetch('/movie/now_playing'),
    tmdbFetch('/movie/popular'),
    tmdbFetch('/tv/popular'),
    tmdbFetch('/movie/top_rated'),
    tmdbFetch('/tv/top_rated'),
    tmdbFetch('/movie/upcoming'),
    tmdbFetch('/trending/all/week'),
  ]);

  const heroes = trendingMovies.results
    .filter(m => m.backdrop_path)
    .slice(0, 6)
    .map(toHero);

  const rows = [
    { label: 'Now Playing',       items: nowPlaying.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Popular Movies',    items: popularMovies.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Popular TV Shows',  items: popularTV.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Top Rated Movies',  items: topRatedMovies.results.slice(0, 15).map(m => toCard(m, 'TOP')) },
    { label: 'Top Rated TV',      items: topRatedTV.results.slice(0, 15).map(m => toCard(m, 'TOP')) },
    { label: 'Upcoming Movies',   items: upcoming.results.slice(0, 15).map(m => toCard(m, 'NEW')) },
    { label: 'Fan Favorites',     items: trendingAll.results.filter(m => m.media_type !== 'person').slice(0, 15).map(m => toCard(m)) },
  ];

  return { heroes, rows };
}

// ── Fallback static data (used if no API key is set) ──────────────────────────
const STATIC_CONTENT = {
  heroes: [
    {
      title: "Dune: Part Two",
      meta: "2024  ·  2h 46m  ·  PG-13  ·  ★ 8.6",
      desc: "Paul Atreides unites with Chani and the Fremen while plotting revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the known universe.",
      bg: "https://image.tmdb.org/t/p/original/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg",
      badge: "Now Streaming"
    },
    {
      title: "Deadpool & Wolverine",
      meta: "2024  ·  2h 7m  ·  R  ·  ★ 7.8",
      desc: "Marvel's favorite merc with a mouth teams up with the gruff Wolverine in a wild multiverse adventure that breaks every rule — and the fourth wall.",
      bg: "https://image.tmdb.org/t/p/original/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg",
      badge: "Now Streaming"
    },
    {
      title: "Inside Out 2",
      meta: "2024  ·  1h 40m  ·  PG  ·  ★ 7.9",
      desc: "Riley enters her teenage years and Headquarters must make room for a new emotion: Anxiety. Joy and the crew must work together before Anxiety takes control.",
      bg: "https://image.tmdb.org/t/p/original/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg",
      badge: "Top Pick"
    },
    {
      title: "Alien: Romulus",
      meta: "2024  ·  1h 59m  ·  R  ·  ★ 7.3",
      desc: "A group of young space colonizers come face to face with the most terrifying life form in the universe while scavenging an abandoned space station.",
      bg: "https://image.tmdb.org/t/p/original/b33nnKl1GSFbao4l3fZDDqsMx0F.jpg",
      badge: "Featured"
    },
    {
      title: "Oppenheimer",
      meta: "2023  ·  3h 0m  ·  R  ·  ★ 8.4",
      desc: "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II, and the haunting moral consequences that followed.",
      bg: "https://image.tmdb.org/t/p/original/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
      badge: "Award Winner"
    },
  ],
  rows: [
    {
      label: "Continue Watching",
      wide: true,
      items: [
        { title: "Oppenheimer", sub: "2h 32m left", img: "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", badge: "", progress: 42 },
        { title: "The Bear", sub: "Season 3, Ep 4", img: "https://image.tmdb.org/t/p/w500/sHFlbKS3WLqMnp9t2ghADIJFnuQ.jpg", badge: "", progress: 67 },
        { title: "Killers of the Flower Moon", sub: "1h 55m left", img: "https://image.tmdb.org/t/p/w500/dB6aPBNJGFNpM8Sw0VHKRA9CXBD.jpg", badge: "", progress: 20 },
        { title: "Shogun", sub: "Season 1, Ep 7", img: "https://image.tmdb.org/t/p/w500/tkPBDue6ZFMOlCRDWxAqxVWFQHJ.jpg", badge: "", progress: 55 },
        { title: "Poor Things", sub: "48m left", img: "https://image.tmdb.org/t/p/w500/kCGlIMHnOm8JPXIHClkPlnD9oke.jpg", badge: "", progress: 78 },
      ]
    },
    {
      label: "Top Picks For You",
      items: [
        { title: "Deadpool & Wolverine", sub: "2024 · Action", img: "https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg", badge: "NEW" },
        { title: "Alien: Romulus", sub: "2024 · Sci-Fi", img: "https://image.tmdb.org/t/p/w500/b33nnKl1GSFbao4l3fZDDqsMx0F.jpg", badge: "NEW" },
        { title: "Longlegs", sub: "2024 · Thriller", img: "https://image.tmdb.org/t/p/w500/fcG8KsKKnMEkNBLzRTYvGBbYPqm.jpg", badge: "" },
        { title: "A Quiet Place: Day One", sub: "2024 · Horror", img: "https://image.tmdb.org/t/p/w500/xQB0ewmzFCqI5h7mWBNHNYHirOH.jpg", badge: "" },
        { title: "Inside Out 2", sub: "2024 · Animation", img: "https://image.tmdb.org/t/p/w500/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg", badge: "TOP" },
        { title: "Furiosa", sub: "2024 · Action", img: "https://image.tmdb.org/t/p/w500/iADOJ8Zymht2JPMoy3R7xceZprc.jpg", badge: "" },
        { title: "Kingdom of the Planet of the Apes", sub: "2024 · Sci-Fi", img: "https://image.tmdb.org/t/p/w500/gKkl37BQuKTanygYQG1pyYgLVgf.jpg", badge: "" },
      ]
    },
    {
      label: "Trending Movies",
      items: [
        { title: "Civil War", sub: "2024 · Drama", img: "https://image.tmdb.org/t/p/w500/sh7Rg8Er3tFcN9BpKIPU9xn8mmX.jpg", badge: "TOP" },
        { title: "The Substance", sub: "2024 · Horror", img: "https://image.tmdb.org/t/p/w500/lqoMzCcZYEFK729d6qzt349fB4o.jpg", badge: "NEW" },
        { title: "Joker: Folie à Deux", sub: "2024 · Thriller", img: "https://image.tmdb.org/t/p/w500/uxmNbiHCMcMuDjD0GKTBFgNkIGt.jpg", badge: "" },
        { title: "Venom: The Last Dance", sub: "2024 · Action", img: "https://image.tmdb.org/t/p/w500/aosm8tevFEiegOcCrdRNuHPNHFG.jpg", badge: "" },
        { title: "Terrifier 3", sub: "2024 · Horror", img: "https://image.tmdb.org/t/p/w500/j4JqWz2rUlANW5g4nnMPmKRFqlP.jpg", badge: "" },
        { title: "Megalopolis", sub: "2024 · Drama", img: "https://image.tmdb.org/t/p/w500/sutlmgVoqzLSwADCr5B5EgmTY5U.jpg", badge: "" },
        { title: "Trap", sub: "2024 · Thriller", img: "https://image.tmdb.org/t/p/w500/e1Q4lonFVgKX0JZOP4LnMjDkKOL.jpg", badge: "" },
      ]
    },
    {
      label: "Popular TV Shows",
      items: [
        { title: "House of the Dragon", sub: "Season 2 · HBO", img: "https://image.tmdb.org/t/p/w500/1X4h40fcB4WWUmIBK0auT4zRBAV.jpg", badge: "NEW" },
        { title: "The Rings of Power", sub: "Season 2 · Prime", img: "https://image.tmdb.org/t/p/w500/mYLOqiStMxDK3fYZFirgrMt8z5d.jpg", badge: "" },
        { title: "Andor", sub: "Season 2 · Disney+", img: "https://image.tmdb.org/t/p/w500/59SVNwLfoMnZPPB6ukW6dlPxAdI.jpg", badge: "NEW" },
        { title: "The Boys", sub: "Season 4 · Prime", img: "https://image.tmdb.org/t/p/w500/2zmTngn1tYC1AvfnrFLhxeD82hz.jpg", badge: "" },
        { title: "Fallout", sub: "Season 1 · Prime", img: "https://image.tmdb.org/t/p/w500/AnsSKR8AXmJSaU5LHhJpFODsRk.jpg", badge: "TOP" },
        { title: "The Penguin", sub: "Season 1 · Max", img: "https://image.tmdb.org/t/p/w500/b2umBlFKcfFLBWhKNWcQjnHPBUI.jpg", badge: "" },
        { title: "Tulsa King", sub: "Season 2 · Paramount+", img: "https://image.tmdb.org/t/p/w500/4gCRTKFIBn1fqTnGLvg0dFDyTW0.jpg", badge: "" },
      ]
    },
    {
      label: "Because You Watched Dune",
      items: [
        { title: "Arrival", sub: "2016 · Sci-Fi", img: "https://image.tmdb.org/t/p/w500/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg", badge: "" },
        { title: "Blade Runner 2049", sub: "2017 · Sci-Fi", img: "https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg", badge: "" },
        { title: "Interstellar", sub: "2014 · Sci-Fi", img: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", badge: "" },
        { title: "Avatar: The Way of Water", sub: "2022 · Sci-Fi", img: "https://image.tmdb.org/t/p/w500/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg", badge: "" },
        { title: "Prometheus", sub: "2012 · Sci-Fi", img: "https://image.tmdb.org/t/p/w500/bkRAbdKnIBuGmzJpwEoFLrMEQ11.jpg", badge: "" },
        { title: "The Martian", sub: "2015 · Sci-Fi", img: "https://image.tmdb.org/t/p/w500/5BHuvQ6p9kfc091Z8RiFNhCwL4b.jpg", badge: "" },
      ]
    },
    {
      label: "Free to Watch",
      items: [
        { title: "Twisters", sub: "2024 · Action", img: "https://image.tmdb.org/t/p/w500/pjnD08FlMAIXsfOLKQbvmO0f0MD.jpg", badge: "FREE" },
        { title: "Ghostbusters: Frozen Empire", sub: "2024 · Comedy", img: "https://image.tmdb.org/t/p/w500/sg4XTKkWvWPv25g9v5bDlS5BcWO.jpg", badge: "FREE" },
        { title: "Migration", sub: "2023 · Animation", img: "https://image.tmdb.org/t/p/w500/ldfCF9RhR40mppkzmVFHPn3ZwTV.jpg", badge: "FREE" },
        { title: "Argylle", sub: "2024 · Action", img: "https://image.tmdb.org/t/p/w500/95GBGbDnLb5BHWaG0xgPMNjXIEf.jpg", badge: "FREE" },
        { title: "The Beekeeper", sub: "2024 · Action", img: "https://image.tmdb.org/t/p/w500/A7EByudX0eOzlkQ2FIbogzyazm2.jpg", badge: "FREE" },
        { title: "Anyone But You", sub: "2023 · Romance", img: "https://image.tmdb.org/t/p/w500/lurEK87kukWNaHd0zYnsi3yzJrs.jpg", badge: "FREE" },
        { title: "Wonka", sub: "2023 · Fantasy", img: "https://image.tmdb.org/t/p/w500/qhb1qOilapbapxWQn9jtRCMwLJV.jpg", badge: "FREE" },
      ]
    }
  ]
};