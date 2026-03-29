/**
 * QuranData.gs
 * Loads Quran Arabic text and surah metadata from GitHub Pages.
 * Fetches once per session, caches in ScriptCache (6h, 100KB/key).
 * Provides lookup and in-memory search.
 */

var UTHMANI_JSON_URL = 'https://tarazis.github.io/tasneef-data/quran/uthmani.json';
var IMLAEI_JSON_URL = 'https://tarazis.github.io/tasneef-data/quran/imlaei-simple.json';
var SURAHS_META_JSON_URL = 'https://tarazis.github.io/tasneef-data/quran/quran-metadata-surah-name.json';

var CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 hours
var CACHE_KEY_SURAHS = 'quran_surahs';
var CACHE_KEY_UTHMANI_PREFIX = 'quran_uthmani_';
var CACHE_KEY_SIMPLE_PREFIX = 'quran_simple_';
var SURAHS_PER_SHARD = 10;
var SEARCH_RESULT_CAP = 50;

// Unicode ranges for Arabic diacritics/tashkeel (strip for normalization)
var TASHKEEL_RANGES = [
  [0x0610, 0x061A], // Arabic signs
  [0x064B, 0x065F], // Fatha, Damma, Kasra, etc.
  [0x0670],        // Superscript alif
  [0x06D6, 0x06DC], // Small high signs
  [0x06DF, 0x06E4], // Small high signs
  [0x06E7, 0x06E8], // Small high Yeh, Hamza
  [0x06EA, 0x06ED]  // Empty centre, etc.
];

/**
 * Fetches all three JSON files, using ScriptCache when available.
 * Shards uthmani and simple across multiple cache keys (100KB limit).
 * @return {Object} { surahs: [...], uthmani: {...}, simple: {...} }
 */
function loadQuranData() {
  var cache = CacheService.getScriptCache();

  var surahs = _getOrFetch(cache, CACHE_KEY_SURAHS, _parseJsonObject);
  if (!surahs) {
    surahs = _fetchAndParse(SURAHS_META_JSON_URL, _parseJsonObject);
    if (surahs) cache.put(CACHE_KEY_SURAHS, JSON.stringify(surahs), CACHE_TTL_SECONDS);
  }

  var uthmani = _loadShardedAyahData(cache, CACHE_KEY_UTHMANI_PREFIX, UTHMANI_JSON_URL);
  var simple = _loadShardedAyahData(cache, CACHE_KEY_SIMPLE_PREFIX, IMLAEI_JSON_URL);

  return { surahs: surahs, uthmani: uthmani, simple: simple };
}

/**
 * Extracts surah metadata from loaded data.
 * @param {Object} data - Result of loadQuranData() (or just the surahs object)
 * @return {Array<{number, nameArabic, nameEnglish, ayahCount}>}
 */
function getSurahList(data) {
  var surahsObj = (data && data.surahs) ? data.surahs : data;
  if (!surahsObj) return [];

  var list = [];
  for (var i = 1; i <= 114; i++) {
    var key = String(i);
    if (!surahsObj[key]) continue;
    var s = surahsObj[key];
    list.push({
      number: s.id,
      nameArabic: s.name_arabic || '',
      nameEnglish: s.name_simple || s.name || '',
      ayahCount: s.verses_count || 0
    });
  }
  return list;
}

/**
 * Looks up a single ayah. style is "uthmani" or "simple".
 * @param {Object} data - Result of loadQuranData()
 * @param {number} surahNum - Surah number (1–114)
 * @param {number} ayahNum - Ayah number
 * @param {string} style - "uthmani" or "simple"
 * @return {Object|null} { surah, ayah, surahNameArabic, surahNameEnglish, arabicText } or null
 */
function getAyah(data, surahNum, ayahNum, style) {
  if (!data || !surahNum || !ayahNum || !style) return null;
  var ayahData = (style === 'uthmani') ? data.uthmani : data.simple;
  if (!ayahData) return null;

  var key = surahNum + ':' + ayahNum;
  var verse = ayahData[key];
  if (!verse) return null;

  var surahMeta = (data.surahs && data.surahs[String(surahNum)]) ? data.surahs[String(surahNum)] : null;
  return {
    surah: verse.surah,
    ayah: verse.ayah,
    surahNameArabic: surahMeta ? (surahMeta.name_arabic || '') : '',
    surahNameEnglish: surahMeta ? (surahMeta.name_simple || surahMeta.name || '') : '',
    arabicText: verse.text || ''
  };
}

/**
 * In-memory exact text search. Normalizes Arabic for matching.
 * @param {Object} data - Result of loadQuranData()
 * @param {string} query - Search string
 * @param {string} style - "uthmani" or "simple"
 * @return {Array<{surah, ayah, surahNameArabic, surahNameEnglish, arabicText, matchIndex, matchStart, matchEnd}>}
 */
function searchQuran(data, query, style) {
  if (!data || !query || typeof query !== 'string') return [];
  query = query.trim();
  if (!query) return [];

  var ayahData = (style === 'uthmani') ? data.uthmani : data.simple;
  if (!ayahData) return [];

  var normalizedQuery = normalizeArabic(query);
  var results = [];
  var isArabic = _hasArabicChars(query);

  for (var key in ayahData) {
    if (results.length >= SEARCH_RESULT_CAP) break;
    var verse = ayahData[key];
    var text = verse.text || '';
    var normText = normalizeArabic(text);

    var matchIndex = -1;
    var matchLen = 0;
    if (isArabic) {
      var idx = normText.indexOf(normalizedQuery);
      if (idx >= 0) {
        matchIndex = idx;
        matchLen = normalizedQuery.length;
      }
    } else {
      var lowerQuery = query.toLowerCase();
      var lowerText = text.toLowerCase();
      var idx = lowerText.indexOf(lowerQuery);
      if (idx >= 0) {
        matchIndex = idx;
        matchLen = lowerQuery.length;
      }
    }

    if (matchIndex >= 0) {
      var surahMeta = (data.surahs && data.surahs[String(verse.surah)]) ? data.surahs[String(verse.surah)] : null;
      var mapped = isArabic ? _mapNormalizedToOriginal(text, matchIndex, matchLen) : { start: matchIndex, end: matchIndex + matchLen };
      results.push({
        surah: verse.surah,
        ayah: verse.ayah,
        surahNameArabic: surahMeta ? (surahMeta.name_arabic || '') : '',
        surahNameEnglish: surahMeta ? (surahMeta.name_simple || surahMeta.name || '') : '',
        arabicText: text,
        matchIndex: matchIndex,
        matchStart: mapped.start,
        matchEnd: mapped.end
      });
    }
  }

  return results;
}

/**
 * Maps normalized text indices to original text indices.
 * Used for highlighting matches when normalized text has fewer chars (tashkeel stripped).
 * @param {string} original - Original Arabic text
 * @param {number} normStart - Start index in normalized text
 * @param {number} normLen - Length of match in normalized text
 * @return {{start: number, end: number}} Indices in original text
 */
function _mapNormalizedToOriginal(original, normStart, normLen) {
  if (!original || normStart < 0 || normLen <= 0) return { start: 0, end: 0 };
  var normIdx = 0;
  var origStart = -1;
  var origEnd = -1;
  for (var i = 0; i < original.length; i++) {
    if (_isInTashkeelRange(original.charCodeAt(i))) continue;
    if (normIdx === normStart) origStart = i;
    normIdx++;
    if (normIdx === normStart + normLen) {
      origEnd = i + 1;
      break;
    }
  }
  if (origStart < 0) origStart = 0;
  if (origEnd < 0) origEnd = original.length;
  return { start: origStart, end: origEnd };
}

/**
 * Normalizes Arabic text for search: strips tashkeel, normalizes alef variants.
 * @param {string} text - Raw Arabic text
 * @return {string}
 */
function normalizeArabic(text) {
  if (!text || typeof text !== 'string') return '';
  var result = '';
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    if (_isInTashkeelRange(code)) continue;
    var ch = text.charAt(i);
    if (ch === '\u0622' || ch === '\u0623' || ch === '\u0625' || ch === '\u0671') ch = '\u0627'; // آ أ إ ٱ → ا
    result += ch;
  }
  return result;
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function _isInTashkeelRange(code) {
  for (var r = 0; r < TASHKEEL_RANGES.length; r++) {
    var range = TASHKEEL_RANGES[r];
    if (range.length === 1) {
      if (code === range[0]) return true;
    } else if (code >= range[0] && code <= range[1]) return true;
  }
  return false;
}

function _hasArabicChars(str) {
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c >= 0x0600 && c <= 0x06FF) return true;
  }
  return false;
}

function _getOrFetch(cache, key, parser) {
  var cached = cache.get(key);
  if (cached) return parser(cached);
  return null;
}

function _fetchAndParse(url, parser) {
  var response = UrlFetchApp.fetch(url);
  return parser(response.getContentText());
}

function _parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function _loadShardedAyahData(cache, prefix, url) {
  var merged = {};
  var shardIndex = 0;
  var found = true;

  while (found) {
    var key = prefix + shardIndex;
    var cached = cache.get(key);
    if (cached) {
      var shard = _parseJsonObject(cached);
      if (shard) {
        for (var k in shard) merged[k] = shard[k];
      }
      shardIndex++;
    } else {
      found = false;
    }
  }

  if (shardIndex > 0) return merged;

  var full = _fetchAndParse(url, _parseJsonObject);
  if (!full) return {};

  var keys = [];
  for (var k in full) keys.push(k);
  keys.sort();

  var shards = [];
  var current = {};
  var currentSize = 0;
  var maxSize = 80000; // stay under 100KB cache key limit

  for (var i = 0; i < keys.length; i++) {
    var ky = keys[i];
    var val = full[ky];
    var entry = JSON.stringify(ky) + ':' + JSON.stringify(val);
    if (currentSize + entry.length > maxSize && Object.keys(current).length > 0) {
      shards.push(current);
      current = {};
      currentSize = 0;
    }
    current[ky] = val;
    currentSize += entry.length;
  }
  if (Object.keys(current).length > 0) shards.push(current);

  for (var s = 0; s < shards.length; s++) {
    cache.put(prefix + s, JSON.stringify(shards[s]), CACHE_TTL_SECONDS);
    for (var kk in shards[s]) merged[kk] = shards[s][kk];
  }

  return merged;
}
