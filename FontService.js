/**
 * FontService.gs
 * Fetches the curated Arabic font list from tasneef-data (GitHub Pages).
 * No API key required. Caches result for 24 hours in ScriptCache.
 */

var FALLBACK_FONT = 'Amiri';

var QURAN_FONTS_JSON_URL = 'https://tarazis.github.io/tasneef-data/quran/quran-fonts.json';
var CACHE_KEY_FONTS = 'arabic_fonts_quran_curated';
var CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Mirror of hosted approved_fonts; used when fetch or parse fails.
 * Keep in sync with tasneef-data/quran/quran-fonts.json.
 */
var FALLBACK_APPROVED_FONTS = [
  'Amiri',
  'Amiri Quran',
  'Harmattan',
  'IBM Plex Sans Arabic',
  'Lateef',
  'Mada',
  'Noto Kufi Arabic',
  'Noto Naskh Arabic',
  'Noto Sans Arabic',
  'Scheherazade New'
];

/**
 * Fetches approved_fonts from quran-fonts.json, sorted alphabetically.
 * Cached for 24 hours. Falls back to FALLBACK_APPROVED_FONTS on error.
 * @return {Array<string>} Sorted list of font family names.
 */
function getArabicFonts() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(CACHE_KEY_FONTS);
  if (cached) {
    return JSON.parse(cached);
  }

  var fonts = loadApprovedFontsFromUrl();
  fonts.sort(function (a, b) { return a.localeCompare(b, 'en'); });

  cache.put(CACHE_KEY_FONTS, JSON.stringify(fonts), CACHE_TTL_SECONDS);
  return fonts;
}

/**
 * @return {Array<string>} Non-empty sorted unique families.
 */
function loadApprovedFontsFromUrl() {
  var fallback = FALLBACK_APPROVED_FONTS.slice().sort(function (a, b) {
    return a.localeCompare(b, 'en');
  });

  try {
    var response = UrlFetchApp.fetch(QURAN_FONTS_JSON_URL);
    var json = JSON.parse(response.getContentText());
    var raw = json && json.approved_fonts;
    if (!Array.isArray(raw) || raw.length === 0) {
      return fallback;
    }

    var seen = {};
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var name = typeof raw[i] === 'string' ? raw[i].trim() : '';
      if (name && !seen[name]) {
        seen[name] = true;
        out.push(name);
      }
    }

    if (out.length === 0) {
      return fallback;
    }

    return out;
  } catch (e) {
    return fallback;
  }
}
