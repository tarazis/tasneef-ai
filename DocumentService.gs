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

  var element;
  if (insertMode === 'inserttag') {
    var found = body.findText('\\[insert\\]');
    if (found) {
      element = found.getElement();
    } else {
      DocumentApp.getUi().alert('No [insert] tag found. Inserted at cursor.');
      element = cursor.insertInlineImage(Blob.createFromText('')).getParent().getParent();
      // Actually we need to insert at cursor - findText returns a Range
      // Let me re-read the task: "Replace that range with the ayah"
      // So we use the range from findText to replace. If not found, fall back to cursor.
      element = null;
    }
  }

  if (insertMode === 'inserttag' && !found) {
    insertMode = 'cursor';
  }

  var insertPosition;
  if (insertMode === 'inserttag' && found) {
    var container = found.getElement();
    var startOffset = found.getStartOffset();
    var endOffset = found.getEndOffsetInclusive();
    var text = container.asText();
    text.deleteText(startOffset, endOffset);
    insertPosition = body.getChildIndex(container.getParent());
    // Actually replacing [insert] with text is tricky - we need to insert at that position
    // Google Docs API: we can append to body or insert at position
    // For replace: we deleted the text. Now we need to insert. The container might be a paragraph.
    // Let me simplify: for inserttag we find the paragraph containing [insert], clear it, and insert our content.
    var paragraph = container.getParent().asParagraph();
    paragraph.clear();
    insertPosition = paragraph;
  } else if (insertMode === 'newline') {
    var cursorElement = cursor.getElement();
    var paragraph = cursorElement.getParent().asParagraph();
    var newParagraph = paragraph.appendParagraph('');
    insertPosition = newParagraph;
  } else {
    // cursor mode
    insertPosition = cursor.insertText(' ').getParent();
    insertPosition = insertPosition.getParent().asParagraph();
    insertPosition.editAsText().deleteText(0, 0); // undo the space, we'll add our content
    // Actually inserting at cursor: cursor.insertText() inserts at cursor. We need to insert paragraphs.
    // Google Docs: getCursor() returns Position. position.insertText('x') inserts text.
    // For multiple paragraphs we need body.insertParagraph(childIndex, paragraph).
    // Simpler: get the paragraph the cursor is in, append our content there or create new paragraphs.
    var cursorParagraph = cursor.getElement().getParent().asParagraph();
    insertPosition = cursorParagraph;
  }

  // Build content and insert
  if (showTranslation && translationText) {
    // Paragraph 1: ﴿ arabicText ﴾ — center
    var p1 = body.insertParagraph(body.getChildIndex(insertPosition), '\uFD3F ' + arabicText + ' \uFD3E');
    p1.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    applyFormat(p1.editAsText(), formatState);

    // Paragraph 2: translation
    var p2 = body.insertParagraph(body.getChildIndex(insertPosition) + 1, translationText);
    p2.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
    applyFormat(p2.editAsText(), formatState);

    // Paragraph 3: [SurahName surah:ayah]
    var refStr = '[' + surahNameEn + ' ' + ayahData.surah + ':' + ayahData.ayah + ']';
    var p3 = body.insertParagraph(body.getChildIndex(insertPosition) + 2, refStr);
    p3.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
    applyFormat(p3.editAsText(), formatState);
  } else {
    // Single paragraph: ﴿ arabicText ﴾ [surahNameAr:ayahAr]
    var singleText = '\uFD3F ' + arabicText + ' \uFD3E [' + surahNameAr + ': ' + ayahNumAr + ']';
    var p = body.insertParagraph(body.getChildIndex(insertPosition), singleText);
    p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    applyFormat(p.editAsText(), formatState);
  }

  return { success: true };
}
