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
  var fontsKey = getGoogleFontsApiKey_();
  var materialBase =
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,1,0&icon_names=favorite';
  var template = HtmlService.createTemplateFromFile('sidebar/sidebar');
  template.googleFontsApiKeyJson = JSON.stringify(fontsKey ? String(fontsKey) : '');
  template.materialSymbolsStylesheetHref = appendGoogleFontsApiKeyToUrl_(materialBase, fontsKey);
  var html = template.evaluate()
    .setTitle('Tasneef AI')
    .setWidth(350);
  DocumentApp.getUi().showSidebar(html);
}

/**
 * Appends Google Fonts API `key` query param when Script Property is set.
 * @param {string} url
 * @param {string|null} apiKey
 * @return {string}
 */
function appendGoogleFontsApiKeyToUrl_(url, apiKey) {
  if (!url || !apiKey || !String(apiKey).trim()) return url;
  return url + '&key=' + encodeURIComponent(String(apiKey).trim());
}

/**
 * Includes an HTML file's content for use in Apps Script HTML templates.
 * Usage in templates: <?!= include_('sidebar/sidebar-css') ?>
 * Trailing underscore hides this from google.script.run (prevents source disclosure).
 * @param {string} filename - The file to include (without .html extension).
 * @return {string} The file's HTML content.
 */
function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

