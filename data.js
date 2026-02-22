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
  // Random page (2-8) so the home screen shows different content on every load
  const p = Math.floor(Math.random() * 7) + 2;

  const [
    trendingMovies,
    popularMovies,
    popularTV,
    topRatedMovies,
    topRatedTV,
    upcoming,
    trendingAll,
    freeMovies,
    freeTV,
    comedyMovies,
    comedyTV,
    horrorMovies,
    scifiMovies,
    scifiTV,
    romanceMovies,
    thrillerMovies,
    actionMovies,
    crimeTV,
    animationMovies,
  ] = await Promise.all([
    tmdbFetch('/trending/movie/week', `&page=${p}`),
    tmdbFetch('/movie/popular',    `&page=${p}`),
    tmdbFetch('/tv/popular',       `&page=${p}`),
    tmdbFetch('/movie/top_rated',  `&page=${p}`),
    tmdbFetch('/tv/top_rated',     `&page=${p}`),
    tmdbFetch('/movie/upcoming',  `&page=${fp}`),
    tmdbFetch('/trending/all/week', `&page=${p}`),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&watch_region=US&with_watch_monetization_types=free|ads&page=${fp}`),
    tmdbFetch('/discover/tv',    `&sort_by=popularity.desc&watch_region=US&with_watch_monetization_types=free|ads&page=${fp}`),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&with_genres=35&page=${p}`),
    tmdbFetch('/discover/tv',    `&sort_by=popularity.desc&with_genres=35&page=${p}`),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&with_genres=27&page=${p}`),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&with_genres=878&page=${p}`),
    tmdbFetch('/discover/tv',    `&sort_by=popularity.desc&with_genres=10765&page=${p}`),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&with_genres=10749&page=${p}`),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&with_genres=53&page=${p}`),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&with_genres=28&page=${p}`),
    tmdbFetch('/discover/tv',    `&sort_by=popularity.desc&with_genres=80&page=${p}`),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&with_genres=16&page=${p}`),
  ]);

  const heroes = trendingMovies.results
    .filter(m => m.backdrop_path)
    .slice(0, 6)
    .map(toHero);

  // Interleave free movies and free TV for a mixed row
  const freeItems = [];
  const fm = freeMovies.results.slice(0, 10);
  const ft = freeTV.results.slice(0, 10);
  for (let i = 0; i < Math.max(fm.length, ft.length); i++) {
    if (fm[i]) freeItems.push(toCard(fm[i], 'FREE'));
    if (ft[i]) freeItems.push(toCard({ ...ft[i], media_type: 'tv' }, 'FREE'));
  }

  // Interleave comedy movies + TV
  const comedyItems = [];
  const cm = comedyMovies.results.slice(0, 10);
  const ct = comedyTV.results.slice(0, 10);
  for (let i = 0; i < Math.max(cm.length, ct.length); i++) {
    if (cm[i]) comedyItems.push(toCard(cm[i]));
    if (ct[i]) comedyItems.push(toCard({ ...ct[i], media_type: 'tv' }));
  }

  // Interleave sci-fi movies + TV
  const scifiItems = [];
  const sm = scifiMovies.results.slice(0, 10);
  const st = scifiTV.results.slice(0, 10);
  for (let i = 0; i < Math.max(sm.length, st.length); i++) {
    if (sm[i]) scifiItems.push(toCard(sm[i]));
    if (st[i]) scifiItems.push(toCard({ ...st[i], media_type: 'tv' }));
  }

  const rows = [
    { label: 'Popular Movies',       items: popularMovies.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Popular TV Shows',     items: popularTV.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Free to Watch',        items: freeItems.slice(0, 15) },
    { label: 'Action Movies',        items: actionMovies.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Comedy',               items: comedyItems.slice(0, 15) },
    { label: 'Horror Movies',        items: horrorMovies.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Romance Movies',       items: romanceMovies.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Sci-Fi & Fantasy',     items: scifiItems.slice(0, 15) },
    { label: 'Thriller & Suspense',  items: thrillerMovies.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Crime TV',             items: crimeTV.results.slice(0, 15).map(m => toCard({ ...m, media_type: 'tv' })) },
    { label: 'Animation',            items: animationMovies.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Top Rated Movies',     items: topRatedMovies.results.slice(0, 15).map(m => toCard(m, 'TOP')) },
    { label: 'Top Rated TV',         items: topRatedTV.results.slice(0, 15).map(m => toCard(m, 'TOP')) },
    { label: 'Upcoming Movies',      items: upcoming.results.slice(0, 15).map(m => toCard(m, 'NEW')) },
    { label: 'Fan Favorites',        items: trendingAll.results.filter(m => m.media_type !== 'person').slice(0, 15).map(m => toCard(m)) },
  ];

  return { heroes, rows };
}

// ── Streaming services list ───────────────────────────────────────────────────
const STREAMING_SERVICES = [
  { id: 8,   name: 'Netflix' },
  { id: 9,   name: 'Prime Video' },
  { id: 337, name: 'Disney+' },
  { id: 384, name: 'Max' },
  { id: 386, name: 'Peacock' },
  { id: 531, name: 'Paramount+' },
  { id: 350, name: 'Apple TV+' },
  { id: 283, name: 'Crunchyroll' },
  { id: 43,  name: 'Starz' },
  { id: 37,  name: 'Showtime' },
];

// ── Filtered content loader ───────────────────────────────────────────────────
// When providerIds is empty, falls back to the regular unfiltered endpoints.
async function loadContentFiltered(region = 'US', providerIds = []) {
  if (!providerIds.length) return loadContent();

  // Random page (2-8) so the home screen shows different content on every load
  const p  = Math.floor(Math.random() * 7) + 2;
  const fp = Math.floor(Math.random() * 4) + 1; // free/upcoming have fewer pages

  // Disney+ (337) and Hulu (15) are merged — always include Hulu when Disney+ is selected
  const effectiveIds = providerIds.includes(337) && !providerIds.includes(15)
    ? [...providerIds, 15]
    : providerIds;

  const provStr   = effectiveIds.join('|');
  const provParam = `&watch_region=${region}&with_watch_providers=${provStr}&with_watch_monetization_types=flatrate`;

  const freeParam = `&sort_by=popularity.desc&watch_region=${region}&with_watch_monetization_types=free|ads&page=${fp}`;

  const [
    trendingMovies,
    popMovies,
    popTV,
    topMovies,
    topTV,
    freeMovies,
    freeTV,
    comedyMovies,
    comedyTV,
    horrorMovies,
    actionMovies,
    scifiMovies,
    scifiTV,
    romanceMovies,
    thrillerMovies,
    dramaTV,
    crimeTV,
    animationMovies,
  ] = await Promise.all([
    tmdbFetch('/trending/movie/week', `&page=${p}`),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&page=${p}${provParam}`),
    tmdbFetch('/discover/tv',    `&sort_by=popularity.desc&page=${p}${provParam}`),
    tmdbFetch('/discover/movie', `&sort_by=vote_average.desc&vote_count.gte=200&page=${p}${provParam}`),
    tmdbFetch('/discover/tv',    `&sort_by=vote_average.desc&vote_count.gte=100&page=${p}${provParam}`),
    tmdbFetch('/discover/movie', freeParam),
    tmdbFetch('/discover/tv',    freeParam),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&with_genres=35&page=${p}${provParam}`),
    tmdbFetch('/discover/tv',    `&sort_by=popularity.desc&with_genres=35&page=${p}${provParam}`),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&with_genres=27&page=${p}${provParam}`),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&with_genres=28&page=${p}${provParam}`),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&with_genres=878&page=${p}${provParam}`),
    tmdbFetch('/discover/tv',    `&sort_by=popularity.desc&with_genres=10765&page=${p}${provParam}`),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&with_genres=10749&page=${p}${provParam}`),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&with_genres=53&page=${p}${provParam}`),
    tmdbFetch('/discover/tv',    `&sort_by=popularity.desc&with_genres=18&page=${p}${provParam}`),
    tmdbFetch('/discover/tv',    `&sort_by=popularity.desc&with_genres=80&page=${p}${provParam}`),
    tmdbFetch('/discover/movie', `&sort_by=popularity.desc&with_genres=16&page=${p}${provParam}`),
  ]);

  const heroes = trendingMovies.results
    .filter(m => m.backdrop_path)
    .slice(0, 6)
    .map(toHero);

  // Interleave free movies and free TV for a mixed row
  const freeItems = [];
  const fm = freeMovies.results.slice(0, 10);
  const ft = freeTV.results.slice(0, 10);
  for (let i = 0; i < Math.max(fm.length, ft.length); i++) {
    if (fm[i]) freeItems.push(toCard(fm[i], 'FREE'));
    if (ft[i]) freeItems.push(toCard({ ...ft[i], media_type: 'tv' }, 'FREE'));
  }

  // Interleave comedy movies + TV
  const comedyItems = [];
  const cm = comedyMovies.results.slice(0, 10);
  const ct = comedyTV.results.slice(0, 10);
  for (let i = 0; i < Math.max(cm.length, ct.length); i++) {
    if (cm[i]) comedyItems.push(toCard(cm[i]));
    if (ct[i]) comedyItems.push(toCard({ ...ct[i], media_type: 'tv' }));
  }

  // Interleave sci-fi movies + TV
  const scifiItems = [];
  const sm = scifiMovies.results.slice(0, 10);
  const st = scifiTV.results.slice(0, 10);
  for (let i = 0; i < Math.max(sm.length, st.length); i++) {
    if (sm[i]) scifiItems.push(toCard(sm[i]));
    if (st[i]) scifiItems.push(toCard({ ...st[i], media_type: 'tv' }));
  }

  const rows = [
    { label: 'Popular on Your Streaming Services',  items: popMovies.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'TV Shows on Your Streaming Services', items: popTV.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Free to Watch',                       items: freeItems.slice(0, 15) },
    { label: 'Action Movies',                       items: actionMovies.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Comedy',                              items: comedyItems.slice(0, 15) },
    { label: 'Horror Movies',                       items: horrorMovies.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Romance Movies',                      items: romanceMovies.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Sci-Fi & Fantasy',                    items: scifiItems.slice(0, 15) },
    { label: 'Thriller & Suspense',                 items: thrillerMovies.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Drama TV Shows',                      items: dramaTV.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Crime TV',                            items: crimeTV.results.slice(0, 15).map(m => toCard({ ...m, media_type: 'tv' })) },
    { label: 'Animation',                           items: animationMovies.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Top Rated Movies',                    items: topMovies.results.slice(0, 15).map(m => toCard(m, 'TOP')) },
    { label: 'Top Rated TV',                        items: topTV.results.slice(0, 15).map(m => toCard(m, 'TOP')) },
  ].filter(row => row.items.length > 0);

  return { heroes, rows };
}

// ── Movies-only content loader ────────────────────────────────────────────────
async function loadMoviesContent(region = 'US', providerIds = []) {
  const effectiveIds = providerIds.includes(337) && !providerIds.includes(15)
    ? [...providerIds, 15] : providerIds;
  const hasFilter = effectiveIds.length > 0;

  const regionParam = `&watch_region=${region}`;
  const provStr  = effectiveIds.join('|');
  const provParam = hasFilter
    ? `${regionParam}&with_watch_providers=${provStr}&with_watch_monetization_types=flatrate`
    : regionParam;
  const genreBase = `&sort_by=popularity.desc${provParam}`;

  // Other services = all known services minus the selected ones
  const ALL_IDS  = STREAMING_SERVICES.map(s => s.id);
  const otherIds = hasFilter ? ALL_IDS.filter(id => !effectiveIds.includes(id)) : [];
  const otherParam = otherIds.length
    ? `&sort_by=popularity.desc&watch_region=${region}&with_watch_providers=${otherIds.join('|')}&with_watch_monetization_types=flatrate`
    : null;

  const rentParam = `&sort_by=popularity.desc${regionParam}&with_watch_monetization_types=rent|buy`;
  const freeParam = `&sort_by=popularity.desc${regionParam}&with_watch_monetization_types=free|ads`;

  const baseFetches = [
    tmdbFetch('/trending/movie/week'),
    tmdbFetch('/movie/now_playing', regionParam),
    hasFilter
      ? tmdbFetch('/discover/movie', `&sort_by=popularity.desc${provParam}`)
      : tmdbFetch('/movie/popular'),
    hasFilter
      ? tmdbFetch('/discover/movie', `&sort_by=vote_average.desc&vote_count.gte=200${provParam}`)
      : tmdbFetch('/movie/top_rated'),
    tmdbFetch('/movie/upcoming', regionParam),
    tmdbFetch('/discover/movie', `&with_genres=28${genreBase}`),
    tmdbFetch('/discover/movie', `&with_genres=35${genreBase}`),
    tmdbFetch('/discover/movie', `&with_genres=27${genreBase}`),
    tmdbFetch('/discover/movie', `&with_genres=10749${genreBase}`),
    tmdbFetch('/discover/movie', `&with_genres=878${genreBase}`),
    tmdbFetch('/discover/movie', `&with_genres=53${genreBase}`),
    tmdbFetch('/discover/movie', `&with_genres=16${genreBase}`),
    tmdbFetch('/discover/movie', rentParam),
    tmdbFetch('/discover/movie', freeParam),
    ...(otherParam ? [tmdbFetch('/discover/movie', otherParam)] : []),
  ];

  const results = await Promise.all(baseFetches);
  const [trending, nowPlaying, popular, topRated, upcoming,
         action, comedy, horror, romance, scifi, thriller, animation,
         rentBuy, freeMovies] = results;
  const otherServices = otherParam ? results[14] : null;

  const heroes = trending.results
    .filter(m => m.backdrop_path)
    .slice(0, 6)
    .map(toHero);

  const rows = [
    { label: hasFilter ? 'Popular on Your Services' : 'Popular Movies',
      items: popular.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'In Theatres Now',
      items: nowPlaying.results.slice(0, 15).map(m => toCard(m, 'NEW')) },
    { label: 'Action',
      items: action.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Comedy',
      items: comedy.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Horror',
      items: horror.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Romance',
      items: romance.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Sci-Fi',
      items: scifi.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Thriller & Suspense',
      items: thriller.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Animation',
      items: animation.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Free to Watch',
      items: freeMovies.results.slice(0, 15).map(m => toCard(m, 'FREE')) },
    ...(otherServices?.results.length
      ? [{ label: 'Also Streaming — Not on Your Services',
           items: otherServices.results.slice(0, 15).map(m => toCard(m)) }]
      : []),
    { label: 'Available to Rent or Buy',
      items: rentBuy.results.slice(0, 15).map(m => toCard(m)) },
    { label: 'Top Rated',
      items: topRated.results.slice(0, 15).map(m => toCard(m, 'TOP')) },
    { label: 'Coming Soon',
      items: upcoming.results.slice(0, 15).map(m => toCard(m, 'NEW')) },
  ].filter(row => row.items.length > 0);

  return { heroes, rows };
}

// ── Shows-only content loader ────────────────────────────────────────────────
async function loadShowsContent(region = 'US', providerIds = []) {
  const effectiveIds = providerIds.includes(337) && !providerIds.includes(15)
    ? [...providerIds, 15] : providerIds;
  const hasFilter = effectiveIds.length > 0;

  const regionParam = `&watch_region=${region}`;
  const provStr   = effectiveIds.join('|');
  const provParam = hasFilter
    ? `${regionParam}&with_watch_providers=${provStr}&with_watch_monetization_types=flatrate`
    : regionParam;
  const genreBase = `&sort_by=popularity.desc${provParam}`;

  const ALL_IDS  = STREAMING_SERVICES.map(s => s.id);
  const otherIds = hasFilter ? ALL_IDS.filter(id => !effectiveIds.includes(id)) : [];
  const otherParam = otherIds.length
    ? `&sort_by=popularity.desc&watch_region=${region}&with_watch_providers=${otherIds.join('|')}&with_watch_monetization_types=flatrate`
    : null;

  // "New Episodes" = shows sorted by first_air_date that aired in the last 90 days
  const today     = new Date();
  const pastDate  = new Date(today - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayStr  = today.toISOString().slice(0, 10);
  const newEpParam = `&sort_by=first_air_date.desc&first_air_date.gte=${pastDate}&first_air_date.lte=${todayStr}${provParam}`;

  const rentParam = `&sort_by=popularity.desc${regionParam}&with_watch_monetization_types=rent|buy`;
  const freeParam = `&sort_by=popularity.desc${regionParam}&with_watch_monetization_types=free|ads`;

  const baseFetches = [
    tmdbFetch('/trending/tv/week'),
    tmdbFetch('/discover/tv', newEpParam),
    hasFilter
      ? tmdbFetch('/discover/tv', `&sort_by=popularity.desc${provParam}`)
      : tmdbFetch('/tv/popular'),
    hasFilter
      ? tmdbFetch('/discover/tv', `&sort_by=vote_average.desc&vote_count.gte=100${provParam}`)
      : tmdbFetch('/tv/top_rated'),
    tmdbFetch('/discover/tv', `&with_genres=35${genreBase}`),
    tmdbFetch('/discover/tv', `&with_genres=18${genreBase}`),
    tmdbFetch('/discover/tv', `&with_genres=27${genreBase}`),
    tmdbFetch('/discover/tv', `&with_genres=10765${genreBase}`),
    tmdbFetch('/discover/tv', `&with_genres=80${genreBase}`),
    tmdbFetch('/discover/tv', `&with_genres=10759${genreBase}`),
    tmdbFetch('/discover/tv', `&with_genres=16${genreBase}`),
    tmdbFetch('/discover/tv', freeParam),
    tmdbFetch('/discover/tv', rentParam),
    ...(otherParam ? [tmdbFetch('/discover/tv', otherParam)] : []),
  ];

  const results = await Promise.all(baseFetches);
  const [trending, newEpisodes, popular, topRated,
         comedy, drama, horror, scifi, crime, action, animation,
         freeShows, rentBuy] = results;
  const otherServices = otherParam ? results[13] : null;

  const heroes = trending.results
    .filter(m => m.backdrop_path)
    .slice(0, 6)
    .map(h => toHero({ ...h, media_type: 'tv' }));

  const rows = [
    { label: hasFilter ? 'Popular on Your Services' : 'Popular Shows',
      items: popular.results.slice(0, 15).map(m => toCard({ ...m, media_type: 'tv' })) },
    { label: 'New Episodes & Seasons',
      items: newEpisodes.results.slice(0, 15).map(m => toCard({ ...m, media_type: 'tv' }, 'NEW')) },
    { label: 'Drama',
      items: drama.results.slice(0, 15).map(m => toCard({ ...m, media_type: 'tv' })) },
    { label: 'Comedy',
      items: comedy.results.slice(0, 15).map(m => toCard({ ...m, media_type: 'tv' })) },
    { label: 'Action & Adventure',
      items: action.results.slice(0, 15).map(m => toCard({ ...m, media_type: 'tv' })) },
    { label: 'Sci-Fi & Fantasy',
      items: scifi.results.slice(0, 15).map(m => toCard({ ...m, media_type: 'tv' })) },
    { label: 'Crime & Mystery',
      items: crime.results.slice(0, 15).map(m => toCard({ ...m, media_type: 'tv' })) },
    { label: 'Horror',
      items: horror.results.slice(0, 15).map(m => toCard({ ...m, media_type: 'tv' })) },
    { label: 'Animation',
      items: animation.results.slice(0, 15).map(m => toCard({ ...m, media_type: 'tv' })) },
    { label: 'Free to Watch',
      items: freeShows.results.slice(0, 15).map(m => toCard({ ...m, media_type: 'tv' }, 'FREE')) },
    ...(otherServices?.results.length
      ? [{ label: 'Also Streaming — Not on Your Services',
           items: otherServices.results.slice(0, 15).map(m => toCard({ ...m, media_type: 'tv' })) }]
      : []),
    { label: 'Buy the Season',
      items: rentBuy.results.slice(0, 15).map(m => toCard({ ...m, media_type: 'tv' })) },
    { label: 'Top Rated',
      items: topRated.results.slice(0, 15).map(m => toCard({ ...m, media_type: 'tv' }, 'TOP')) },
  ].filter(row => row.items.length > 0);

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