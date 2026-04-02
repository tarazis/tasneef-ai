/**
 * FontService.gs
 * Fetches the curated Arabic font list from tasneef-data (GitHub Pages).
 * No API key required.
 *
 * The list is not stored in ScriptCache: a previous 24h cache caused the
 * sidebar to lag behind updates to quran-fonts.json. Each getArabicFonts()
 * call performs one UrlFetch (small payload).
 */

var FALLBACK_FONT = 'Amiri';

var QURAN_FONTS_JSON_URL = 'https://tarazis.github.io/tasneef-data/quran/quran-fonts.json';

/**
 * Mirror of hosted approved_fonts; used when fetch or parse fails.
 * Keep in sync with tasneef-data/quran/quran-fonts.json.
 */
var FALLBACK_APPROVED_FONTS = [
  'Amiri',
  'Harmattan',
  'IBM Plex Sans Arabic',
  'Lateef',
  'Mada',
  'Noto Kufi Arabic',
  'Noto Naskh Arabic',
  'Noto Sans Arabic',
  'Reem Kufi Ink',
  'Scheherazade New',
  'Tajawal'
];

/**
 * @return {Array<string>} Sorted unique font names, or empty if invalid.
 */
function buildSortedFontsFromJson(json) {
  var raw = json && json.approved_fonts;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
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
  out.sort(function (a, b) { return a.localeCompare(b, 'en'); });
  return out;
}

/**
 * @return {Array<string>} Sorted list of font family names.
 */
function getArabicFonts() {
  var fallback = FALLBACK_APPROVED_FONTS.slice().sort(function (a, b) {
    return a.localeCompare(b, 'en');
  });

  try {
    var response = UrlFetchApp.fetch(QURAN_FONTS_JSON_URL);
    var json = JSON.parse(response.getContentText());
    var list = buildSortedFontsFromJson(json);
    return list.length > 0 ? list : fallback;
  } catch (e) {
    return fallback;
  }
}
