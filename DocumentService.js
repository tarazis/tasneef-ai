/**
 * DocumentService.gs
 * Inserts Quranic ayat into Google Docs with formatting.
 */

/** Space (pt) before the Arabic ayah paragraph on insert. */
var INSERT_SPACE_BEFORE_ARABIC_PT = 12;
/** Space (pt) between Arabic ayah and English translation when both are inserted. */
var INSERT_SPACE_ARABIC_TO_TRANSLATION_PT = 6;

/**
 * Determines the insertion index and inserts paragraphs at the correct position.
 * Shared by insertAyah and insertAyahRange.
 *
 * Insertion rules:
 *   - Cursor on empty paragraph: reuse it for the first item, insert remaining after it
 *   - Cursor on non-empty paragraph: insert in a new paragraph below it
 *   - No cursor: insert after the last non-empty paragraph; if all empty, reuse the first
 *
 * Cleanup (empty Normal/LTR paragraph) is only added when the inserted content
 * ends up as the last child in the document. If any child exists after it, skip cleanup.
 *
 * After insertion, the document cursor is moved to the cleanup paragraph (if added)
 * or to the last inserted paragraph (if in the middle of the document).
 *
 * @param {Body} body - The document body
 * @param {Document} doc - The active document
 * @param {Array<Object>} paragraphsToInsert - Array of { text, align, rtl?, useEnglishTranslationFont?, spacingBefore?, spacingAfter? } (spacing in pt; omit keys to leave Doc defaults)
 * @param {Object} formatState - { fontName, fontVariant, fontSize, bold, textColor }
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
    var item = paragraphsToInsert[i];
    var p;
    if (i === 0 && removeTarget) {
      p = removeTarget;
      p.setText(item.text);
    } else {
      p = body.insertParagraph(insertIndex + i, item.text);
    }
    p.setAlignment(item.align);
    p.setLeftToRight(item.rtl ? false : true);
    if (typeof item.spacingBefore === 'number') {
      p.setSpacingBefore(item.spacingBefore);
    }
    if (typeof item.spacingAfter === 'number') {
      p.setSpacingAfter(item.spacingAfter);
    }
    var fs = item.useEnglishTranslationFont
      ? formatStateForEnglishTranslation(formatState)
      : formatState;
    fontWarning = applyFormat(p.editAsText(), fs) || fontWarning;
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
 * @param {Object} formatState - { fontName, fontVariant, fontSize, bold, textColor }
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

  /** U+00A0: ornate Quranic parens (matches preview); Arabic :/ayah and range hyphen; English name/num only. */
  var qNbsp = '\u00A0';
  var paragraphsToInsert = [];
  if (showTranslation && translationText) {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      spacingBefore: INSERT_SPACE_BEFORE_ARABIC_PT,
      spacingAfter: INSERT_SPACE_ARABIC_TO_TRANSLATION_PT
    });
    paragraphsToInsert.push({
      text: '\u201C' + translationText + '\u201D',
      align: DocumentApp.HorizontalAlignment.CENTER,
      useEnglishTranslationFont: true
    });
    paragraphsToInsert.push({
      text: '(' + surahNameEn + qNbsp + ayahData.surah + ':' + ayahData.ayah + ')',
      align: DocumentApp.HorizontalAlignment.CENTER,
      useEnglishTranslationFont: true
    });
  } else if (showTranslation) {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E [' + surahNameAr + ':' + qNbsp + ayahNumAr + ']',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true
    });
  } else {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      spacingBefore: INSERT_SPACE_BEFORE_ARABIC_PT
    });
    paragraphsToInsert.push({
      text: '[' + surahNameAr + ':' + qNbsp + ayahNumAr + ']',
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
 * @param {Object} formatState - { fontName, fontVariant, fontSize, bold, textColor }
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

  var qNbsp = '\u00A0';
  var paragraphsToInsert = [];
  if (showTranslation && translationText) {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      spacingBefore: INSERT_SPACE_BEFORE_ARABIC_PT,
      spacingAfter: INSERT_SPACE_ARABIC_TO_TRANSLATION_PT
    });
    paragraphsToInsert.push({
      text: '\u201C' + translationText + '\u201D',
      align: DocumentApp.HorizontalAlignment.CENTER,
      useEnglishTranslationFont: true
    });
    paragraphsToInsert.push({
      text: '(' + surahNameEn + qNbsp + rangeData.surah + ':' +
            rangeData.ayahStart + '-' + rangeData.ayahEnd + ')',
      align: DocumentApp.HorizontalAlignment.CENTER,
      useEnglishTranslationFont: true
    });
  } else if (showTranslation) {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E [' +
            surahNameAr + ':' + qNbsp + ayahStartAr + qNbsp + '-' + qNbsp + ayahEndAr + ']',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true
    });
  } else {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      spacingBefore: INSERT_SPACE_BEFORE_ARABIC_PT
    });
    paragraphsToInsert.push({
      text: '[' + surahNameAr + ':' + qNbsp + ayahStartAr + qNbsp + '-' + qNbsp + ayahEndAr + ']',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true
    });
  }

  var result = insertParagraphsAtPosition_(body, doc, paragraphsToInsert, formatState);
  return { success: true, message: result.fontWarning ? 'Range inserted. ' + result.fontWarning : 'Range inserted.' };
}
