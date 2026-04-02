/**
 * FontService.gs
 * Fetches Arabic-capable fonts from the Google Fonts API (subset=arabic).
 * API key from User Properties (SettingsService); fallback key if unset.
 * Cached for 24 hours in ScriptCache.
 */

var FALLBACK_FONT = 'Amiri';

var GOOGLE_FONTS_API_BASE = 'https://www.googleapis.com/webfonts/v1/webfonts?subset=arabic&key=';
var CACHE_KEY_FONTS = 'arabic_fonts';
var CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/** Hardcoded fallback when no key is stored in User Properties. */
var GOOGLE_FONTS_API_KEY_FALLBACK = 'AIzaSyAx8SG23WQKR38AZeBq0iiVXAIneckwmP8';

/**
 * Curated list used when fetch fails.
 */
var FALLBACK_FONT_LIST = [
  'Amiri', 'IBM Plex Sans Arabic', 'Lateef', 'Noto Kufi Arabic',
  'Noto Naskh Arabic', 'Noto Sans Arabic', 'Scheherazade New', 'Tajawal'
];

/**
 * Fetches Arabic fonts from Google Fonts API. Returns family names sorted alphabetically.
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
    var apiKey = getGoogleFontsApiKey() || GOOGLE_FONTS_API_KEY_FALLBACK;
    var url = GOOGLE_FONTS_API_BASE + encodeURIComponent(apiKey);
    var response = UrlFetchApp.fetch(url);
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

    for (var i = 0; i < items.length; i++) {
      var family = items[i].family || (typeof items[i] === 'string' ? items[i] : null);
      if (family) {
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
