/**
 * DocumentService.gs
 * Inserts Quranic ayat into Google Docs with formatting.
 */

/**
 * Determines the insertion index and inserts paragraphs at the correct position.
 * Shared by insertAyah and insertAyahRange.
 *
 * Insertion rules:
 *   - Cursor on empty paragraph: insert at that position, remove the empty paragraph
 *   - Cursor on non-empty paragraph: insert in a new paragraph below it
 *   - No cursor: insert after the last non-empty paragraph; if all empty, replace the first
 *
 * Cleanup (empty Normal/LTR paragraph) is only added when the inserted content
 * ends up as the last child in the document. If any child exists after it, skip cleanup.
 *
 * After insertion, the document cursor is moved to the cleanup paragraph (if added)
 * or to the last inserted paragraph (if in the middle of the document).
 *
 * @param {Body} body - The document body
 * @param {Document} doc - The active document
 * @param {Array<Object>} paragraphsToInsert - Array of { text, align, rtl? }
 * @param {Object} formatState - { fontName, fontSize, bold, textColor }
 * @return {Object} { fontWarning: string|null }
 */
function insertParagraphsAtPosition_(body, doc, paragraphsToInsert, formatState) {
  var cursor = doc.getCursor();
  var insertIndex;
  var removeTarget = null;

  if (cursor) {
    var cursorElement = cursor.getElement();
    var cursorParagraph;

    if (cursorElement.getType() === DocumentApp.ElementType.PARAGRAPH) {
      cursorParagraph = cursorElement.asParagraph();
    } else {
      var parent = cursorElement.getParent();
      while (parent && parent.getType() !== DocumentApp.ElementType.PARAGRAPH) {
        parent = parent.getParent();
      }
      cursorParagraph = parent ? parent.asParagraph() : body.getParagraphs()[0];
    }

    if (cursorParagraph.getText() === '') {
      insertIndex = body.getChildIndex(cursorParagraph);
      removeTarget = cursorParagraph;
    } else {
      insertIndex = body.getChildIndex(cursorParagraph) + 1;
    }
  } else {
    var paragraphs = body.getParagraphs();
    var lastNonEmptyIdx = -1;
    for (var j = paragraphs.length - 1; j >= 0; j--) {
      if (paragraphs[j].getText() !== '') {
        lastNonEmptyIdx = j;
        break;
      }
    }

    if (lastNonEmptyIdx === -1) {
      insertIndex = 0;
      removeTarget = paragraphs[0];
    } else {
      insertIndex = body.getChildIndex(paragraphs[lastNonEmptyIdx]) + 1;
    }
  }

  var fontWarning = null;
  for (var i = 0; i < paragraphsToInsert.length; i++) {
    var p = body.insertParagraph(insertIndex + i, paragraphsToInsert[i].text);
    p.setAlignment(paragraphsToInsert[i].align);
    if (paragraphsToInsert[i].rtl) p.setLeftToRight(false);
    fontWarning = applyFormat(p.editAsText(), formatState) || fontWarning;
  }

  if (removeTarget) {
    body.removeChild(removeTarget);
  }

  var lastInsertedIndex = insertIndex + paragraphsToInsert.length - 1;
  var isLastInDoc = (lastInsertedIndex >= body.getNumChildren() - 1);

  var cursorTarget;
  if (isLastInDoc) {
    var cleanup = body.insertParagraph(lastInsertedIndex + 1, '');
    cleanup.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    cleanup.setLeftToRight(true);
    cursorTarget = cleanup;
  } else {
    cursorTarget = body.getChild(lastInsertedIndex).asParagraph();
  }

  try {
    doc.setCursor(doc.newPosition(cursorTarget, 0));
  } catch (e) {
    // setCursor is unavailable in non-UI contexts (e.g. triggers); fail silently
  }

  return { fontWarning: fontWarning };
}

/**
 * Inserts an ayah into the document at the cursor position.
 * If no cursor, inserts after the last non-empty paragraph.
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

  var arabicStyle = (settings && settings.arabicStyle) || 'uthmani';
  var showTranslation = settings && settings.showTranslation !== false;

  var arabicText = (arabicStyle === 'uthmani' && ayahData.textUthmani)
    ? ayahData.textUthmani
    : (ayahData.textSimple || ayahData.textUthmani || '');
  var translationText = ayahData.translationText || '';
  var surahNameAr = ayahData.surahNameArabic || '';
  var surahNameEn = ayahData.surahNameEnglish || '';
  var ayahNumAr = toArabicIndic(ayahData.ayah);

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

  var result = insertParagraphsAtPosition_(body, doc, paragraphsToInsert, formatState);
  var message = result.fontWarning ? 'Ayah inserted. ' + result.fontWarning : 'Ayah inserted.';
  return { success: true, message: message };
}

/**
 * Inserts a pre-assembled ayah range into the document.
 * If no cursor is set, inserts after the last non-empty paragraph.
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

  var showTranslation = settings && settings.showTranslation !== false;
  var arabicText      = rangeData.arabicText || '';
  var translationText = rangeData.translationText || '';
  var surahNameAr     = rangeData.surahNameArabic || '';
  var surahNameEn     = rangeData.surahNameEnglish || '';
  var ayahStartAr     = toArabicIndic(rangeData.ayahStart);
  var ayahEndAr       = toArabicIndic(rangeData.ayahEnd);

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

  var result = insertParagraphsAtPosition_(body, doc, paragraphsToInsert, formatState);
  return { success: true, message: result.fontWarning ? 'Range inserted. ' + result.fontWarning : 'Range inserted.' };
}
