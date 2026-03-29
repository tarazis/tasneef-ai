/**
 * FontService.gs
 * Fetches Arabic-capable fonts from tasneef-data (GitHub Pages).
 * No API key required. Caches result for 24 hours in ScriptCache.
 */

var FALLBACK_FONT = 'Amiri';

var FONTS_JSON_URL = 'https://tarazis.github.io/tasneef-data/fonts.json';
var CACHE_KEY_FONTS = 'arabic_fonts';
var CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

var BAD_FONTS = [
  'Blaka', 'Blaka Hollow', 'Blaka Ink', 'Aref Ruqaa Ink',
  'El Messiri', 'Alexandria', 'Lalezar', 'Playpen Sans Arabic', 'Mada',
  'Rubik', 'Cairo', 'Almarai', 'Cairo Play', 'Readex Pro', 'Changa',
  'Baloo Bhaijaan 2', 'Lemonada', 'Markazi Text', 'Kufam',
  'Badeen Display', 'Marhey', 'Handjet', 'Oi', 'Reem Kufi Fun',
  'Vibes', 'Qahiri'
];

/**
 * Curated list used when fetch fails. Excludes BAD_FONTS.
 */
var FALLBACK_FONT_LIST = (function () {
  var list = [
    'Amiri', 'IBM Plex Sans Arabic', 'Lateef', 'Noto Kufi Arabic',
    'Noto Naskh Arabic', 'Noto Sans Arabic', 'Scheherazade New', 'Tajawal'
  ];
  return list.filter(function (f) { return BAD_FONTS.indexOf(f) < 0; });
})();

/**
 * Fetches Arabic fonts from tasneef-data URL. No API key required.
 * Filters out BAD_FONTS, returns family names sorted alphabetically.
 * Cached for 24 hours. Falls back to FALLBACK_FONT_LIST on error.
 * @return {Array<string>} Sorted list of font family names.
 */
function getArabicFonts() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(CACHE_KEY_FONTS);
  if (cached) {
    return JSON.parse(cached);
  }

  var fonts = [];

  try {
    var response = UrlFetchApp.fetch(FONTS_JSON_URL);
    var json = JSON.parse(response.getContentText());

    // Support both array of strings and { items: [{ family: "..." }] }
    var items = [];
    if (Array.isArray(json)) {
      items = json.map(function (f) { return typeof f === 'string' ? { family: f } : f; });
    } else if (json && json.items && Array.isArray(json.items)) {
      items = json.items;
    } else if (json && json.fonts && Array.isArray(json.fonts)) {
      items = json.fonts.map(function (f) { return typeof f === 'string' ? { family: f } : f; });
    }

    var badSet = {};
    for (var b = 0; b < BAD_FONTS.length; b++) {
      badSet[BAD_FONTS[b]] = true;
    }

    for (var i = 0; i < items.length; i++) {
      var family = items[i].family || (typeof items[i] === 'string' ? items[i] : null);
      if (family && !badSet[family]) {
        fonts.push(family);
      }
    }

    fonts.sort(function (a, b) { return a.localeCompare(b, 'en'); });

    if (fonts.length === 0) {
      fonts = FALLBACK_FONT_LIST.slice();
    }

    cache.put(CACHE_KEY_FONTS, JSON.stringify(fonts), CACHE_TTL_SECONDS);
  } catch (e) {
    fonts = FALLBACK_FONT_LIST.slice();
  }

  return fonts;
}
