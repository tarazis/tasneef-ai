/**
 * DocumentService.gs
 * Inserts Quranic ayat into Google Docs with formatting.
 */

/**
 * Inserts an ayah into the document at the cursor position.
 * @param {Object} ayahData - { surah, ayah, surahNameArabic, surahNameEnglish, textUthmani, textSimple, translationText }
 * @param {Object} formatState - { fontName, fontSize, bold, textColor }
 * @param {Object} settings - { showTranslation, arabicStyle }
 * @return {Object} { success: boolean, message?: string }
 */
function insertAyah(ayahData, formatState, settings) {
  if (!ayahData || !ayahData.surah || !ayahData.ayah) {
    return { success: false, message: 'Invalid ayah data' };
  }

  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();
  var cursor = doc.getCursor();
  if (!cursor) {
    return { success: false, message: 'Place your cursor in the document before inserting.' };
  }

  var arabicStyle = (settings && settings.arabicStyle) || 'uthmani';
  var showTranslation = settings && settings.showTranslation !== false;

  var arabicText = (arabicStyle === 'uthmani' && ayahData.textUthmani)
    ? ayahData.textUthmani
    : (ayahData.textSimple || ayahData.textUthmani || '');
  var translationText = ayahData.translationText || '';
  var surahNameAr = ayahData.surahNameArabic || '';
  var surahNameEn = ayahData.surahNameEnglish || '';
  var ayahNumAr = toArabicIndic(ayahData.ayah);

  var cursorElement = cursor.getElement();
  var parent = cursorElement.getParent();
  while (parent && parent.getType() !== DocumentApp.ElementType.PARAGRAPH) {
    parent = parent.getParent();
  }
  var cursorParagraph = parent ? parent.asParagraph() : body.getParagraphs()[0];
  var insertIndex = body.getChildIndex(cursorParagraph) + 1;

  var paragraphsToInsert = [];
  if (showTranslation && translationText) {
    paragraphsToInsert.push({
      text: '\uFD3F ' + arabicText + ' \uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true
    });
    paragraphsToInsert.push({
      text: '\u201C' + translationText + '\u201D (' + surahNameEn + ' ' + ayahData.surah + ':' + ayahData.ayah + ')',
      align: DocumentApp.HorizontalAlignment.CENTER
    });
  } else {
    paragraphsToInsert.push({
      text: '\uFD3F ' + arabicText + ' \uFD3E [' + surahNameAr + ': ' + ayahNumAr + ']',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true
    });
  }

  var fontWarning = null;
  for (var i = 0; i < paragraphsToInsert.length; i++) {
    var p = body.insertParagraph(insertIndex + i, paragraphsToInsert[i].text);
    p.setAlignment(paragraphsToInsert[i].align);
    if (paragraphsToInsert[i].rtl) p.setLeftToRight(false);
    fontWarning = applyFormat(p.editAsText(), formatState) || fontWarning;
  }

  var message = fontWarning ? 'Ayah inserted. ' + fontWarning : 'Ayah inserted.';
  return { success: true, message: message };
}
