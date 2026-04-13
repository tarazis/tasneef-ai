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
 * Fetches and returns surah:ayah → English translation text map, or null on failure.
 * Result is cached for the remainder of the Apps Script execution (warm instance).
 * @return {Object<string,string>|null}
 */
function getRagEnglishTranslationMap_() {
  if (_ragEnglishTranslationMapCache_) {
    return _ragEnglishTranslationMapCache_;
  }

  try {
    var response = UrlFetchApp.fetch(TRANSLATION_JSON_URL_FOR_RAG_, {
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      return null;
    }
    var body = JSON.parse(response.getContentText());
    _ragEnglishTranslationMapCache_ = _parseRagTranslationFlat_(body);
    return _ragEnglishTranslationMapCache_;
  } catch (e) {
    return null;
  }
}

/**
 * Clears the in-memory translation map (for tests only).
 */
function clearRagEnglishTranslationMapCacheForTests_() {
  _ragEnglishTranslationMapCache_ = null;
}
