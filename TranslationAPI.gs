/**
 * TranslationAPI.gs
 * Fetches English translations from quranapi.pages.dev.
 * Single ayah: GET /api/{surah}/{ayah}.json
 * Batch: parallel UrlFetchApp.fetchAll() for multiple ayat.
 */

var TRANSLATION_API_BASE = 'https://quranapi.pages.dev/api';

/**
 * Fetches English translation for a single ayah.
 * @param {number} surahNum - Surah number (1–114)
 * @param {number} ayahNum - Ayah number
 * @param {string} edition - Translation edition (e.g. "sahih"). API uses default English if not in path.
 * @return {string} The translation text, or empty string on failure.
 */
function getTranslation(surahNum, ayahNum, edition) {
  if (!surahNum || !ayahNum) return '';
  var url = TRANSLATION_API_BASE + '/' + surahNum + '/' + ayahNum + '.json';
  try {
    var response = UrlFetchApp.fetch(url);
    var json = JSON.parse(response.getContentText());
    return (json && json.english) ? String(json.english) : '';
  } catch (e) {
    return '';
  }
}

/**
 * Fetches translations for multiple ayat in parallel.
 * @param {Array<{surah: number, ayah: number}>} references - Array of surah/ayah pairs
 * @param {string} edition - Translation edition (reserved for future API support)
 * @return {Object} Map of "surah:ayah" -> translationText
 */
function getTranslationsBatch(references, edition) {
  var result = {};
  if (!references || !references.length) return result;

  var requests = [];
  var keyList = [];

  for (var i = 0; i < references.length; i++) {
    var ref = references[i];
    var s = ref.surah;
    var a = ref.ayah;
    if (!s || !a) continue;
    var url = TRANSLATION_API_BASE + '/' + s + '/' + a + '.json';
    requests.push({ url: url, muteHttpExceptions: true });
    keyList.push(s + ':' + a);
  }

  if (requests.length === 0) return result;

  var responses = UrlFetchApp.fetchAll(requests);

  for (var j = 0; j < responses.length; j++) {
    var key = keyList[j];
    var resp = responses[j];
    var text = '';
    try {
      if (resp.getResponseCode() === 200) {
        var json = JSON.parse(resp.getContentText());
        text = (json && json.english) ? String(json.english) : '';
      }
    } catch (e) {}
    result[key] = text;
  }

  return result;
}
