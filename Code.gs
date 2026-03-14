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
 * Returns surah list for Browse tab. Loads Quran data and extracts surah metadata.
 * @return {Array<{number, nameArabic, nameEnglish, ayahCount}>}
 */
function getSurahListForBrowse() {
  var data = loadQuranData();
  return getSurahList(data);
}

/**
 * Returns a single ayah for Browse tab. Includes both uthmani and simple text for insert.
 * @param {number} surahNum - Surah number (1–114)
 * @param {number} ayahNum - Ayah number
 * @param {string} style - "uthmani" or "simple" (for preview display)
 * @return {Object|null} { surah, ayah, surahNameArabic, surahNameEnglish, arabicText, textUthmani, textSimple } or null
 */
function getAyahForBrowse(surahNum, ayahNum, style) {
  var data = loadQuranData();
  var s = style || 'uthmani';
  var uthmani = getAyah(data, surahNum, ayahNum, 'uthmani');
  var simple = getAyah(data, surahNum, ayahNum, 'simple');
  if (!uthmani && !simple) return null;
  var base = uthmani || simple;
  var arabicText = (s === 'uthmani' && uthmani) ? uthmani.arabicText : (simple ? simple.arabicText : '');
  return {
    surah: base.surah,
    ayah: base.ayah,
    surahNameArabic: base.surahNameArabic,
    surahNameEnglish: base.surahNameEnglish,
    arabicText: arabicText,
    textUthmani: uthmani ? uthmani.arabicText : '',
    textSimple: simple ? simple.arabicText : ''
  };
}
