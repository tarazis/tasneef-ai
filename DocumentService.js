/**
 * DocumentService.gs
 * Inserts Quranic ayat into Google Docs with formatting.
 */

/**
 * Determines the insertion index and handles paragraph positioning.
 * Shared by insertAyah and insertAyahRange.
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

  // ── DEBUG: dump document state before insertion ──
  var allChildren = [];
  for (var d = 0; d < body.getNumChildren(); d++) {
    var child = body.getChild(d);
    var type = child.getType().toString();
    var text = (type === 'PARAGRAPH') ? child.asParagraph().getText() : '(non-paragraph)';
    allChildren.push('  [' + d + '] ' + type + ': "' + (text.length > 60 ? text.substring(0, 60) + '…' : text) + '"');
  }
  Logger.log('[INSERT-DEBUG] Document children BEFORE insertion:\n' + allChildren.join('\n'));

  if (cursor) {
    var cursorElement = cursor.getElement();
    var cursorElementType = cursorElement.getType().toString();

    Logger.log('[INSERT-DEBUG] CASE: CURSOR EXISTS');
    Logger.log('[INSERT-DEBUG] cursorElement type: ' + cursorElementType);
    Logger.log('[INSERT-DEBUG] cursorElement text: "' + (cursorElement.getText ? cursorElement.getText() : 'N/A') + '"');

    var cursorParagraph;
    if (cursorElement.getType() === DocumentApp.ElementType.PARAGRAPH) {
      cursorParagraph = cursorElement.asParagraph();
      Logger.log('[INSERT-DEBUG] cursorElement IS the paragraph');
    } else {
      var parent = cursorElement.getParent();
      Logger.log('[INSERT-DEBUG] parent type: ' + (parent ? parent.getType().toString() : 'null'));
      while (parent && parent.getType() !== DocumentApp.ElementType.PARAGRAPH) {
        Logger.log('[INSERT-DEBUG] walking up from ' + parent.getType().toString());
        parent = parent.getParent();
      }
      cursorParagraph = parent ? parent.asParagraph() : body.getParagraphs()[0];
    }
    var cursorParaIndex = body.getChildIndex(cursorParagraph);
    var cursorParaText = cursorParagraph.getText();

    Logger.log('[INSERT-DEBUG] resolved cursorParagraph index: ' + cursorParaIndex);
    Logger.log('[INSERT-DEBUG] resolved cursorParagraph text: "' + (cursorParaText.length > 60 ? cursorParaText.substring(0, 60) + '…' : cursorParaText) + '"');
    Logger.log('[INSERT-DEBUG] cursorParagraph isEmpty: ' + (cursorParaText === ''));

    if (cursorParagraph.getText() === '') {
      insertIndex = body.getChildIndex(cursorParagraph);
      removeTarget = cursorParagraph;
      Logger.log('[INSERT-DEBUG] SUB-CASE: empty paragraph → insertIndex=' + insertIndex + ', will remove empty');
    } else {
      insertIndex = body.getChildIndex(cursorParagraph) + 1;
      Logger.log('[INSERT-DEBUG] SUB-CASE: non-empty paragraph → insertIndex=' + insertIndex);
    }
  } else {
    Logger.log('[INSERT-DEBUG] CASE: NO CURSOR');
    var paragraphs = body.getParagraphs();
    var lastNonEmptyIdx = -1;
    for (var j = paragraphs.length - 1; j >= 0; j--) {
      if (paragraphs[j].getText() !== '') {
        lastNonEmptyIdx = j;
        break;
      }
    }

    Logger.log('[INSERT-DEBUG] lastNonEmptyIdx (in paragraphs array): ' + lastNonEmptyIdx);

    if (lastNonEmptyIdx === -1) {
      insertIndex = 0;
      removeTarget = paragraphs[0];
      Logger.log('[INSERT-DEBUG] SUB-CASE: all empty → insertIndex=0, will remove first empty');
    } else {
      var lastNonEmptyChildIdx = body.getChildIndex(paragraphs[lastNonEmptyIdx]);
      insertIndex = lastNonEmptyChildIdx + 1;
      Logger.log('[INSERT-DEBUG] last non-empty para text: "' + paragraphs[lastNonEmptyIdx].getText().substring(0, 60) + '"');
      Logger.log('[INSERT-DEBUG] last non-empty childIndex: ' + lastNonEmptyChildIdx + ' → insertIndex=' + insertIndex);
    }
  }

  Logger.log('[INSERT-DEBUG] FINAL insertIndex=' + insertIndex + ', removeTarget=' + (removeTarget ? 'yes' : 'no'));
  Logger.log('[INSERT-DEBUG] paragraphsToInsert count: ' + paragraphsToInsert.length);

  var fontWarning = null;
  for (var i = 0; i < paragraphsToInsert.length; i++) {
    Logger.log('[INSERT-DEBUG] inserting paragraph ' + i + ' at index ' + (insertIndex + i) + ': "' + paragraphsToInsert[i].text.substring(0, 50) + '…"');
    var p = body.insertParagraph(insertIndex + i, paragraphsToInsert[i].text);
    p.setAlignment(paragraphsToInsert[i].align);
    if (paragraphsToInsert[i].rtl) p.setLeftToRight(false);
    fontWarning = applyFormat(p.editAsText(), formatState) || fontWarning;
  }

  if (removeTarget) {
    Logger.log('[INSERT-DEBUG] removing empty paragraph target');
    body.removeChild(removeTarget);
  }

  var lastInsertedIndex = insertIndex + paragraphsToInsert.length - 1;
  var isLastInDoc = (lastInsertedIndex >= body.getNumChildren() - 1);
  Logger.log('[INSERT-DEBUG] lastInsertedIndex=' + lastInsertedIndex + ', numChildren=' + body.getNumChildren() + ', isLastInDoc=' + isLastInDoc);

  var cursorTarget;
  if (isLastInDoc) {
    Logger.log('[INSERT-DEBUG] cleanup paragraph at index: ' + (lastInsertedIndex + 1));
    var cleanup = body.insertParagraph(lastInsertedIndex + 1, '');
    cleanup.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    cleanup.setLeftToRight(true);
    cursorTarget = cleanup;
  } else {
    Logger.log('[INSERT-DEBUG] skipping cleanup — content exists after insertion');
    cursorTarget = body.getChild(lastInsertedIndex).asParagraph();
  }

  try {
    doc.setCursor(doc.newPosition(cursorTarget, 0));
    Logger.log('[INSERT-DEBUG] cursor moved to target paragraph');
  } catch (e) {
    Logger.log('[INSERT-DEBUG] could not move cursor: ' + e.message);
  }

  // ── DEBUG: dump document state after insertion ──
  var afterChildren = [];
  for (var a = 0; a < body.getNumChildren(); a++) {
    var ac = body.getChild(a);
    var aType = ac.getType().toString();
    var aText = (aType === 'PARAGRAPH') ? ac.asParagraph().getText() : '(non-paragraph)';
    afterChildren.push('  [' + a + '] ' + aType + ': "' + (aText.length > 60 ? aText.substring(0, 60) + '…' : aText) + '"');
  }
  Logger.log('[INSERT-DEBUG] Document children AFTER insertion:\n' + afterChildren.join('\n'));

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
