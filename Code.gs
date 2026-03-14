/**
 * Adds the Tasneef AI menu to the Google Docs UI when the document opens.
 * @param {Object} e - The onOpen event object.
 */
function onOpen(e) {
  DocumentApp.getUi()
    .createMenu('Tasneef AI')
    .addItem('Open Sidebar', 'showSidebar')
    .addToUi();
}

/**
 * Opens the Tasneef AI sidebar.
 */
function showSidebar() {
  var html = HtmlService.createTemplateFromFile('sidebar/sidebar')
    .evaluate()
    .setTitle('Tasneef Quran')
    .setWidth(350);
  DocumentApp.getUi().showSidebar(html);
}

/**
 * Includes an HTML file's content for use in Apps Script HTML templates.
 * Usage in templates: <?!= include('sidebar/sidebar-css') ?>
 * @param {string} filename - The file to include (without .html extension).
 * @return {string} The file's HTML content.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Returns surah list for Browse tab. Uses quranapi.pages.dev.
 * @return {Array<{number, nameArabic, nameEnglish, ayahCount}>}
 */
function getSurahListForBrowse() {
  return getSurahListFromQuranApi();
}

/**
 * Returns a single ayah for Browse tab. Uses quranapi (Arabic + translation in one call).
 * @param {number} surahNum - Surah number (1–114)
 * @param {number} ayahNum - Ayah number
 * @param {string} style - "uthmani" or "simple" (for preview display)
 * @return {Object|null} { surah, ayah, surahNameArabic, surahNameEnglish, arabicText, textUthmani, textSimple, translationText } or null
 */
function getAyahForBrowse(surahNum, ayahNum, style) {
  return getAyahFromQuranApi(surahNum, ayahNum, style || 'uthmani');
}
