/**
 * QuranAPI.gs
 * Fetches ayah data (Arabic + translation) from quranapi.pages.dev.
 * Single API call returns both; used for Browse and AI Search.
 * Exact Search still uses QuranData (GitHub) - quranapi has no search endpoint.
 */

var QURAN_API_BASE = 'https://quranapi.pages.dev/api';

/**
 * Fetches surah list from quranapi.
 * @return {Array<{number, nameArabic, nameEnglish, ayahCount}>}
 */
function getSurahListFromQuranApi() {
  try {
    var response = UrlFetchApp.fetch(QURAN_API_BASE + '/surah.json');
    var arr = JSON.parse(response.getContentText());
    if (!Array.isArray(arr)) return [];
    var list = [];
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      list.push({
        number: i + 1,
        nameArabic: s.surahNameArabic || '',
        nameEnglish: s.surahNameTranslation || s.surahName || '',
        ayahCount: s.totalAyah || 0
      });
    }
    return list;
  } catch (e) {
    return [];
  }
}

/**
 * Fetches a single ayah from quranapi (Arabic + translation in one call).
 * @param {number} surahNum - Surah number (1–114)
 * @param {number} ayahNum - Ayah number
 * @param {string} style - "uthmani" (arabic1) or "simple" (arabic2)
 * @return {Object|null} { surah, ayah, surahNameArabic, surahNameEnglish, arabicText, textUthmani, textSimple, translationText } or null
 */
function getAyahFromQuranApi(surahNum, ayahNum, style) {
  if (!surahNum || !ayahNum) return null;
  try {
    var url = QURAN_API_BASE + '/' + surahNum + '/' + ayahNum + '.json';
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) return null;
    var json = JSON.parse(response.getContentText());
    if (!json) return null;

    var arabic1 = json.arabic1 || '';
    var arabic2 = json.arabic2 || '';
    var s = style || 'uthmani';
    var arabicText = (s === 'uthmani') ? arabic1 : arabic2;
    if (!arabicText) arabicText = arabic1 || arabic2;

    return {
      surah: json.surahNo || surahNum,
      ayah: json.ayahNo || ayahNum,
      surahNameArabic: json.surahNameArabic || '',
      surahNameEnglish: json.surahNameTranslation || json.surahName || '',
      arabicText: arabicText,
      textUthmani: arabic1,
      textSimple: arabic2,
      translationText: json.english || ''
    };
  } catch (e) {
    return null;
  }
}
