/**
 * FontService.gs
 * Curated list from quran-fonts.json; full variant metadata via Google Fonts API.
 */

var FALLBACK_FONT = 'Amiri';

var QURAN_FONTS_JSON_URL = 'https://tarazis.github.io/tasneef-data/quran/quran-fonts.json';
var GOOGLE_WEBFONTS_API = 'https://www.googleapis.com/webfonts/v1/webfonts';

/**
 * Mirror of hosted approved_fonts; used when fetch or parse fails.
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
 * Parses a Google Fonts API variant token (e.g. regular, italic, 500, 700italic).
 * Regular = weight 400 (Docs / CSS convention).
 * @param {string} token
 * @return {{ weight: number, italic: boolean }}
 */
function parseGoogleFontVariant(token) {
  if (token == null || typeof token !== 'string') {
    return { weight: 400, italic: false };
  }
  var t = token.replace(/\s/g, '');
  if (t === '') return { weight: 400, italic: false };
  if (t === 'regular') return { weight: 400, italic: false };
  if (t === 'italic') return { weight: 400, italic: true };
  var italic = /italic$/i.test(t);
  if (italic) {
    t = t.replace(/italic$/i, '');
  }
  var w = parseInt(t, 10);
  if (!isNaN(w)) {
    return { weight: w, italic: italic };
  }
  return { weight: 400, italic: false };
}

/**
 * Sort variant tokens for stable UI order (by weight, then italic).
 * @param {Array<string>} variants
 * @return {Array<string>}
 */
function sortFontVariantTokens_(variants) {
  var arr = variants.slice();
  arr.sort(function (a, b) {
    var pa = parseGoogleFontVariant(a);
    var pb = parseGoogleFontVariant(b);
    if (pa.weight !== pb.weight) return pa.weight - pb.weight;
    return (pa.italic ? 1 : 0) - (pb.italic ? 1 : 0);
  });
  return arr;
}

/**
 * @return {Array<string>} Sorted unique font names, or empty if invalid.
 */
function buildSortedFontsFromJson_(json) {
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
 * @return {Array<string>} Sorted list of font family names (approved only).
 */
function getArabicFonts_() {
  var fallback = FALLBACK_APPROVED_FONTS.slice().sort(function (a, b) {
    return a.localeCompare(b, 'en');
  });

  try {
    var response = UrlFetchApp.fetch(QURAN_FONTS_JSON_URL);
    var json = JSON.parse(response.getContentText());
    var list = buildSortedFontsFromJson_(json);
    return list.length > 0 ? list : fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * Fetches Google Fonts metadata (arabic subset) intersected with quran-fonts approved_fonts.
 * Requires Script Properties google_fonts_api_key via getGoogleFontsApiKey_().
 * @return {{ ok: boolean, error: string|null, catalog: Array<{family: string, variants: string[]}> }}
 */
function getCuratedFontCatalog() {
  var empty = { ok: false, error: null, catalog: [] };
  var apiKey = getGoogleFontsApiKey_();
  if (!apiKey || String(apiKey).trim().length === 0) {
    empty.error = 'NO_GOOGLE_FONTS_API_KEY';
    return empty;
  }

  var approved = [];
  try {
    var rQ = UrlFetchApp.fetch(QURAN_FONTS_JSON_URL);
    approved = buildSortedFontsFromJson_(JSON.parse(rQ.getContentText()));
  } catch (e) {
    approved = FALLBACK_APPROVED_FONTS.slice().sort(function (a, b) {
      return a.localeCompare(b, 'en');
    });
  }

  var approvedSet = {};
  for (var a = 0; a < approved.length; a++) {
    approvedSet[approved[a]] = true;
  }

  try {
    var url = GOOGLE_WEBFONTS_API +
      '?key=' + encodeURIComponent(String(apiKey).trim()) +
      '&subset=arabic&sort=alpha';
    var rG = UrlFetchApp.fetch(url);
    var data = JSON.parse(rG.getContentText());
    var items = data.items || [];
    var catalog = [];
    for (var i = 0; i < items.length; i++) {
      var fam = items[i].family;
      if (!fam || !approvedSet[fam]) continue;
      var v = items[i].variants;
      if (!v || !v.length) continue;
      catalog.push({
        family: fam,
        variants: sortFontVariantTokens_(v.slice())
      });
    }
    catalog.sort(function (x, y) {
      return x.family.localeCompare(y.family, 'en');
    });
    return { ok: true, error: null, catalog: catalog };
  } catch (e) {
    empty.error = 'Failed to load font catalog.';
    return empty;
  }
}
