/**
 * DocumentService.gs
 * Inserts Quranic ayat into Google Docs with formatting.
 */

/**
 * Inserts an ayah into the document.
 * @param {Object} ayahData - { surah, ayah, surahNameArabic, surahNameEnglish, textUthmani, textSimple, translationText }
 * @param {Object} formatState - { fontName, fontSize, bold, textColor }
 * @param {Object} settings - { insertMode, showTranslation, arabicStyle }
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
    DocumentApp.getUi().toast('Place your cursor in the document before inserting.');
    return { success: false, message: 'No cursor' };
  }

  var arabicStyle = (settings && settings.arabicStyle) || 'uthmani';
  var showTranslation = settings && settings.showTranslation !== false;
  var insertMode = (settings && settings.insertMode) || 'cursor';

  var arabicText = (arabicStyle === 'uthmani' && ayahData.textUthmani)
    ? ayahData.textUthmani
    : (ayahData.textSimple || ayahData.textUthmani || '');
  var translationText = ayahData.translationText || '';
  var surahNameAr = ayahData.surahNameArabic || '';
  var surahNameEn = ayahData.surahNameEnglish || '';
  var ayahNumAr = toArabicIndic(ayahData.ayah);

  var insertIndex;
  var found = null;
  var tagParagraph = null;

  if (insertMode === 'inserttag') {
    found = body.findText('\\[insert\\]');
    if (!found) {
      DocumentApp.getUi().alert('No [insert] tag found. Inserted at cursor.');
      insertMode = 'cursor';
    } else {
      var textEl = found.getElement();
      var startOffset = found.getStartOffset();
      var endOffset = found.getEndOffsetInclusive();
      tagParagraph = textEl.getParent().asParagraph();
      textEl.asText().deleteText(startOffset, endOffset);
      insertIndex = body.getChildIndex(tagParagraph);
    }
  }

  if (insertMode === 'lastparagraph') {
    var paragraphs = body.getParagraphs();
    insertIndex = body.getChildIndex(paragraphs[paragraphs.length - 1]) + 1;
  } else if (insertMode !== 'inserttag' || !tagParagraph) {
    var cursorElement = cursor.getElement();
    var parent = cursorElement.getParent();
    while (parent && parent.getType() !== DocumentApp.ElementType.PARAGRAPH) {
      parent = parent.getParent();
    }
    var cursorParagraph = parent ? parent.asParagraph() : body.getParagraphs()[0];
    insertIndex = body.getChildIndex(cursorParagraph) + 1;
  }

  var paragraphsToInsert = [];
  if (showTranslation && translationText) {
    paragraphsToInsert.push({
      text: '\uFD3F ' + arabicText + ' \uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true
    });
    paragraphsToInsert.push({
      text: translationText + ' (' + surahNameEn + ' ' + ayahData.surah + ':' + ayahData.ayah + ')',
      align: DocumentApp.HorizontalAlignment.LEFT
    });
  } else {
    paragraphsToInsert.push({
      text: '\uFD3F ' + arabicText + ' \uFD3E \uFD3F' + surahNameAr + ': ' + ayahNumAr + '\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true
    });
  }

  if (insertMode === 'inserttag' && tagParagraph) {
    tagParagraph.clear();
    tagParagraph.appendText(paragraphsToInsert[0].text);
    tagParagraph.setAlignment(paragraphsToInsert[0].align);
    if (paragraphsToInsert[0].rtl) tagParagraph.setLeftToRight(false);
    applyFormat(tagParagraph.editAsText(), formatState);
    for (var j = 1; j < paragraphsToInsert.length; j++) {
      var p = body.insertParagraph(insertIndex + j, paragraphsToInsert[j].text);
      p.setAlignment(paragraphsToInsert[j].align);
      if (paragraphsToInsert[j].rtl) p.setLeftToRight(false);
      applyFormat(p.editAsText(), formatState);
    }
  } else {
    for (var i = 0; i < paragraphsToInsert.length; i++) {
      var p = body.insertParagraph(insertIndex + i, paragraphsToInsert[i].text);
      p.setAlignment(paragraphsToInsert[i].align);
      if (paragraphsToInsert[i].rtl) p.setLeftToRight(false);
      applyFormat(p.editAsText(), formatState);
    }
  }

  DocumentApp.getUi().toast('Ayah inserted.');
  return { success: true };
}
