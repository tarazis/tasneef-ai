/**
 * FontService.gs
 * Fetches Arabic-capable fonts from Google Fonts API.
 * Caches result for 24 hours in ScriptCache.
 */

var FALLBACK_FONT = 'Amiri';

var FONTS_API_URL = 'https://www.googleapis.com/webfonts/v1/webfonts';
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
 * Fetches Arabic fonts from Google Fonts API, filters out BAD_FONTS,
 * returns family names sorted alphabetically. Cached for 24 hours.
 * Uses getGoogleFontsApiKey() from SettingsService — if not set, returns [FALLBACK_FONT].
 * @return {Array<string>} Sorted list of font family names.
 */
function getArabicFonts() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(CACHE_KEY_FONTS);
  if (cached) {
    return JSON.parse(cached);
  }

  var apiKey = (typeof getGoogleFontsApiKey === 'function') ? getGoogleFontsApiKey() : null;
  if (!apiKey) {
    return [FALLBACK_FONT];
  }

  var url = FONTS_API_URL + '?key=' + encodeURIComponent(apiKey) + '&subset=arabic&sort=alpha';
  var fonts = [];

  try {
    var response = UrlFetchApp.fetch(url);
    var json = JSON.parse(response.getContentText());
    var items = (json && json.items) ? json.items : [];

    var badSet = {};
    for (var b = 0; b < BAD_FONTS.length; b++) {
      badSet[BAD_FONTS[b]] = true;
    }

    for (var i = 0; i < items.length; i++) {
      var family = items[i].family;
      if (family && !badSet[family]) {
        fonts.push(family);
      }
    }

    fonts.sort(function (a, b) { return a.localeCompare(b, 'en'); });

    if (fonts.length === 0) {
      fonts = [FALLBACK_FONT];
    }

    cache.put(CACHE_KEY_FONTS, JSON.stringify(fonts), CACHE_TTL_SECONDS);
  } catch (e) {
    fonts = [FALLBACK_FONT];
  }

  return fonts;
}
