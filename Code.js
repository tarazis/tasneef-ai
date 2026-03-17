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
 * Fetches a single ayah for insertion. Used after user clicks Insert on a result.
 * For exact_search results (which only have Arabic from GitHub), this fetches
 * the full data (Arabic + translation) from quranapi.
 * @param {number} surahNum - Surah number (1-114)
 * @param {number} ayahNum - Ayah number
 * @param {string} style - "uthmani" or "simple"
 * @return {Object|null} Full ayah data for insertion
 */
function getAyahForInsert(surahNum, ayahNum, style) {
  if (!surahNum || !ayahNum) return null;
  return getAyahFromQuranApi(surahNum, ayahNum, style || 'uthmani');
}
