/**
 * DocumentService.gs
 * Inserts Quranic ayat into Google Docs with formatting.
 */

/**
 * Body child index where the trailing empty Normal paragraph should be inserted,
 * immediately after a block that starts at insertIndex with insertedParagraphCount paragraphs.
 * @param {number} insertIndex
 * @param {number} insertedParagraphCount
 * @return {number}
 */
function trailingNormalParagraphInsertIndex(insertIndex, insertedParagraphCount) {
  return insertIndex + insertedParagraphCount;
}

/**
 * Inserts an empty Normal-text paragraph below the ayah block and moves the cursor there.
 * @param {GoogleAppsScript.Document.Body} body
 * @param {number} insertIndex - body index of the first ayah paragraph inserted
 * @param {number} insertedParagraphCount - number of ayah paragraphs just inserted
 */
function _finishInsertWithNormalLineBelow(body, insertIndex, insertedParagraphCount) {
  var doc = DocumentApp.getActiveDocument();
  var nextIdx = trailingNormalParagraphInsertIndex(insertIndex, insertedParagraphCount);
  var p = body.insertParagraph(nextIdx, '');
  p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  p.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
  p.setLeftToRight(true);
  try {
    var t = p.editAsText();
    doc.setCursor(doc.newPosition(t, 0));
  } catch (e) {
    // Cursor may fail in edge cases; ayah insert still succeeded.
  }
}

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

  _finishInsertWithNormalLineBelow(body, insertIndex, paragraphsToInsert.length);

  var message = fontWarning ? 'Ayah inserted. ' + fontWarning : 'Ayah inserted.';
  return { success: true, message: message };
}

/**
 * Inserts a pre-assembled ayah range into the document.
 * If no cursor is set, appends at the end of the document.
 * @param {Object} rangeData - { surah, ayahStart, ayahEnd, arabicText, translationText, surahNameArabic, surahNameEnglish }
 * @param {Object} formatState - { fontName, fontSize, bold, textColor }
 * @param {Object} settings - { showTranslation }
 * @return {Object} { success: boolean, message?: string }
 */
function insertAyahRange(rangeData, formatState, settings) {
  if (!rangeData || !rangeData.surah || !rangeData.ayahStart) {
    return { success: false, message: 'Invalid range data.' };
  }

  var doc    = DocumentApp.getActiveDocument();
  var body   = doc.getBody();
  var cursor = doc.getCursor();

  var showTranslation = settings && settings.showTranslation !== false;
  var arabicText      = rangeData.arabicText || '';
  var translationText = rangeData.translationText || '';
  var surahNameAr     = rangeData.surahNameArabic || '';
  var surahNameEn     = rangeData.surahNameEnglish || '';
  var ayahStartAr     = toArabicIndic(rangeData.ayahStart);
  var ayahEndAr       = toArabicIndic(rangeData.ayahEnd);

  var insertIndex;
  if (cursor) {
    var cursorElement = cursor.getElement();
    var parent = cursorElement.getParent();
    while (parent && parent.getType() !== DocumentApp.ElementType.PARAGRAPH) {
      parent = parent.getParent();
    }
    var cursorParagraph = parent ? parent.asParagraph() : body.getParagraphs()[0];
    insertIndex = body.getChildIndex(cursorParagraph) + 1;
  } else {
    insertIndex = body.getNumChildren();
  }

  var paragraphsToInsert = [];
  if (showTranslation && translationText) {
    paragraphsToInsert.push({
      text: '\uFD3F ' + arabicText + ' \uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true
    });
    paragraphsToInsert.push({
      text: '\u201C' + translationText + '\u201D (' +
            surahNameEn + ' ' + rangeData.surah + ':' +
            rangeData.ayahStart + '-' + rangeData.ayahEnd + ')',
      align: DocumentApp.HorizontalAlignment.CENTER
    });
  } else {
    paragraphsToInsert.push({
      text: '\uFD3F ' + arabicText + ' \uFD3E [' +
            surahNameAr + ': ' + ayahStartAr + ' - ' + ayahEndAr + ']',
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

  _finishInsertWithNormalLineBelow(body, insertIndex, paragraphsToInsert.length);

  return { success: true, message: fontWarning ? 'Range inserted. ' + fontWarning : 'Range inserted.' };
}
