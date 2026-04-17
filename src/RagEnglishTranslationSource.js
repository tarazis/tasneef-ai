/**
 * RagEnglishTranslationSource.js
 *
 * English translation strings for RAG reranking (server-side).
 * Swap implementation of getRagEnglishTranslationMap_() to use another source later.
 *
 * Keep TRANSLATION_JSON_URL_FOR_RAG_ in sync with sidebar/js/quran-caches.html TRANSLATION_URL.
 */

var TRANSLATION_JSON_URL_FOR_RAG_ =
  'https://tarazis.github.io/tasneef-data/quran/en-sahih-international-simple.json';

/** @type {Object<string,string>|null} */
var _ragEnglishTranslationMapCache_ = null;

/**
 * Parses flat translation JSON: keys "surah:ayah", values { t: "..." }.
 * @param {Object} obj
 * @return {Object<string,string>}
 */
function _parseRagTranslationFlat_(obj) {
  var map = {};
  if (!obj || typeof obj !== 'object') return map;
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] && obj[key].t) {
      map[key] = String(obj[key].t);
    }
  }
  return map;
}

/**
 * Pre-fetches the English translation JSON and populates the in-memory cache.
 * Call once at sidebar startup (via google.script.run) so the map is ready before any search.
 * No-op if the cache is already populated.
 */
function initRagTranslationCache() {
  if (_ragEnglishTranslationMapCache_) return;

  var t0 = Date.now();
  try {
    var response = UrlFetchApp.fetch(TRANSLATION_JSON_URL_FOR_RAG_, {
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      Logger.log('[RAG INIT] WARN: Translation JSON fetch returned HTTP ' +
        response.getResponseCode() + ' — cache not populated');
      return;
    }
    var body = JSON.parse(response.getContentText());
    _ragEnglishTranslationMapCache_ = _parseRagTranslationFlat_(body);
    Logger.log('[RAG INIT] Translation cache populated: ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    Logger.log('[RAG INIT] WARN: Translation JSON fetch failed: ' + e.message);
  }
}

/**
 * Returns the surah:ayah → English translation text map.
 * Uses the pre-populated cache if available; falls back to an inline fetch with a warning.
 * @return {Object<string,string>|null}
 */
function getRagEnglishTranslationMap_() {
  var t0 = Date.now();

  if (_ragEnglishTranslationMapCache_) {
    Logger.log('[RAG SEARCH] Translation source: ' + (Date.now() - t0) + 'ms (cache hit)');
    return _ragEnglishTranslationMapCache_;
  }

  // Cache miss — fetch inline as fallback
  Logger.log('[RAG SEARCH] Translation cache miss — fetching inline (fallback)');
  try {
    var response = UrlFetchApp.fetch(TRANSLATION_JSON_URL_FOR_RAG_, {
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      Logger.log('[RAG SEARCH] Translation source: ' + (Date.now() - t0) + 'ms (fetch failed HTTP ' +
        response.getResponseCode() + ')');
      return null;
    }
    var body = JSON.parse(response.getContentText());
    _ragEnglishTranslationMapCache_ = _parseRagTranslationFlat_(body);
    Logger.log('[RAG SEARCH] Translation source: ' + (Date.now() - t0) + 'ms (fetch — cache miss)');
    return _ragEnglishTranslationMapCache_;
  } catch (e) {
    Logger.log('[RAG SEARCH] Translation source: ' + (Date.now() - t0) + 'ms (fetch error: ' + e.message + ')');
    return null;
  }
}

/**
 * Clears the in-memory translation map (for tests only).
 */
function clearRagEnglishTranslationMapCacheForTests_() {
  _ragEnglishTranslationMapCache_ = null;
}
