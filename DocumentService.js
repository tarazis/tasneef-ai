/**
 * DocumentService.gs
 * Inserts Quranic ayat into Google Docs with formatting.
 */

/** Paragraph spacing (points) for beautified insert blocks: outer margin, gap between inner paragraphs. */
var INSERT_SPACING_OUTER_PT = 12;
var INSERT_SPACING_INNER_PT = 6;

/** Blockquote table: left accent (pt); cell background. */
var BLOCKQUOTE_BORDER_LEFT_PT = 3;
var BLOCKQUOTE_CELL_BACKGROUND = '#F5F5F5';

/**
 * Resolves where to insert the next body-level block (paragraphs or table).
 * @param {Body} body
 * @param {Document} doc
 * @return {{ insertIndex: number, removeTarget: GoogleAppsScript.Document.Paragraph|null }}
 */
function resolveInsertAnchor_(body, doc) {
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

  return { insertIndex: insertIndex, removeTarget: removeTarget };
}

/**
 * Applies beautified insert formatting to a paragraph (body or table cell).
 * @param {GoogleAppsScript.Document.Paragraph} p
 * @param {Object} item - insert descriptor
 * @param {Object} formatState
 * @return {string|null} fontWarning from applyFormat
 */
function applyBeautifiedInsertToParagraph_(p, item, formatState) {
  p.setAlignment(item.align);
  p.setLeftToRight(item.rtl ? false : true);
  var fs = item.useEnglishTranslationFont
    ? formatStateForEnglishTranslation(formatState)
    : formatState;
  if (item.fontSizeAdjustPt != null && item.fontSizeAdjustPt !== 0) {
    fs = formatStateWithFontSizeAdjustment(fs, item.fontSizeAdjustPt);
  }
  var fontWarning = applyFormat(p.editAsText(), fs);
  if (item.spacingBefore != null) {
    p.setSpacingBefore(item.spacingBefore);
  }
  if (item.spacingAfter != null) {
    p.setSpacingAfter(item.spacingAfter);
  }
  return fontWarning;
}

/**
 * @param {string|null|undefined} hex
 * @return {{ red: number, green: number, blue: number }} RGB in 0–1 for Docs API
 */
function hexToDocsRgb01_(hex) {
  var h = normalizeHex6ForSettings_(hex);
  if (!h) {
    h = '#000000';
  }
  var r = parseInt(h.slice(1, 3), 16) / 255;
  var g = parseInt(h.slice(3, 5), 16) / 255;
  var b = parseInt(h.slice(5, 7), 16) / 255;
  return { red: r, green: g, blue: b };
}

/**
 * @param {number} pt
 * @param {{ red: number, green: number, blue: number }} rgb01
 * @return {Object} Docs API border object
 */
function docsTableBorderPt_(pt, rgb01) {
  return {
    dashStyle: 'SOLID',
    width: { magnitude: pt, unit: 'PT' },
    color: { color: { rgbColor: rgb01 } }
  };
}

/**
 * Resolves structural startIndex of a table for Docs API batchUpdate.
 * @param {string} docId
 * @param {number} bodyChildIndex - body.getChildIndex(table)
 * @return {number|null}
 */
function resolveTableStartIndexForDocsApi_(docId, bodyChildIndex) {
  if (typeof Docs === 'undefined' || !Docs.Documents || !Docs.Documents.get) {
    return null;
  }
  var docJson = Docs.Documents.get(docId);
  var content = docJson.body && docJson.body.content;
  if (!content || bodyChildIndex < 0) {
    return null;
  }
  var primary = bodyChildIndex + 1;
  if (primary < content.length && content[primary].table != null && content[primary].startIndex != null) {
    return content[primary].startIndex;
  }
  for (var d = -2; d <= 4; d++) {
    var j = bodyChildIndex + d;
    if (j >= 0 && j < content.length && content[j].table != null && content[j].startIndex != null) {
      return content[j].startIndex;
    }
  }
  return null;
}

/**
 * Per-side cell borders (left accent only) via Docs API; DocumentApp cannot set per side.
 * @param {GoogleAppsScript.Document.Document} doc
 * @param {GoogleAppsScript.Document.Table} table
 * @param {string|null|undefined} borderColorHex - from formatState.textColor
 */
function applyBlockquoteCellBordersViaDocsApi_(doc, table, borderColorHex) {
  if (typeof Docs === 'undefined' || !Docs.Documents || !Docs.Documents.batchUpdate) {
    return;
  }
  var docId = doc.getId();
  var body = doc.getBody();
  var bodyChildIndex = body.getChildIndex(table);
  var tableStart = null;
  var attempt;
  for (attempt = 0; attempt < 3; attempt++) {
    tableStart = resolveTableStartIndexForDocsApi_(docId, bodyChildIndex);
    if (tableStart != null) {
      break;
    }
    Utilities.sleep(150);
  }
  if (tableStart == null) {
    Logger.log('blockquote borders: could not resolve table start index');
    return;
  }

  var rgb = hexToDocsRgb01_(borderColorHex);
  var zero = docsTableBorderPt_(0, { red: 0, green: 0, blue: 0 });
  var leftRgb = docsTableBorderPt_(BLOCKQUOTE_BORDER_LEFT_PT, rgb);

  var tableRange = {
    tableCellLocation: {
      tableStartLocation: { index: tableStart },
      rowIndex: 0,
      columnIndex: 0
    },
    rowSpan: 1,
    columnSpan: 1
  };

  var requests = [
    {
      updateTableCellStyle: {
        tableRange: tableRange,
        tableCellStyle: {
          borderTop: zero,
          borderRight: zero,
          borderBottom: zero,
          borderLeft: zero
        },
        fields: 'borderTop,borderRight,borderBottom,borderLeft'
      }
    },
    {
      updateTableCellStyle: {
        tableRange: tableRange,
        tableCellStyle: {
          borderLeft: leftRgb
        },
        fields: 'borderLeft'
      }
    }
  ];

  try {
    Docs.Documents.batchUpdate({ requests: requests }, docId);
  } catch (e) {
    Logger.log('blockquote borders batchUpdate: ' + e);
  }
}

/**
 * Inserts a 1×1 table at the anchor, places beautified paragraphs in the cell, styles the shell.
 * @param {Body} body
 * @param {Document} doc
 * @param {Array<Object>} paragraphsToInsert
 * @param {Object} formatState
 * @return {Object} { fontWarning: string|null }
 */
function insertBlockquoteTableAtPosition_(body, doc, paragraphsToInsert, formatState) {
  var anchor = resolveInsertAnchor_(body, doc);
  var insertIndex = anchor.insertIndex;
  var removeTarget = anchor.removeTarget;

  // DocumentApp.Body.insertTable only accepts (index) or (index, String[][]); there is no (index, rows, cols).
  var table = body.insertTable(insertIndex, [['']]);

  if (removeTarget) {
    var after = body.getChild(insertIndex + 1);
    if (after === removeTarget) {
      try {
        body.removeChild(removeTarget);
      } catch (ignore) {
        // Cannot remove last section paragraph; leave empty line below table.
      }
    }
  }

  var cell = table.getRow(0).getCell(0);
  cell.setBackgroundColor(BLOCKQUOTE_CELL_BACKGROUND);
  cell.setPaddingLeft(20);
  cell.setPaddingTop(12);
  cell.setPaddingRight(12);
  cell.setPaddingBottom(12);

  var fontWarning = null;
  for (var i = 0; i < paragraphsToInsert.length; i++) {
    var item = paragraphsToInsert[i];
    var p;
    if (i === 0) {
      p = cell.getChild(0).asParagraph();
      p.setText(item.text);
    } else {
      p = cell.insertParagraph(i, item.text);
    }
    fontWarning = applyBeautifiedInsertToParagraph_(p, item, formatState) || fontWarning;
  }

  applyBlockquoteCellBordersViaDocsApi_(doc, table, formatState && formatState.textColor);

  var lastTableIndex = body.getChildIndex(table);
  var isLastInDoc = (lastTableIndex >= body.getNumChildren() - 1);

  var cursorTarget;
  if (isLastInDoc) {
    var cleanup = body.insertParagraph(lastTableIndex + 1, '');
    cleanup.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    cleanup.setLeftToRight(true);
    cleanup.setSpacingBefore(0);
    cleanup.setSpacingAfter(0);
    cursorTarget = cleanup;
  } else {
    var lastInner = cell.getChild(cell.getNumChildren() - 1).asParagraph();
    cursorTarget = lastInner;
  }

  try {
    doc.setCursor(doc.newPosition(cursorTarget, 0));
  } catch (e) {
    // setCursor is unavailable in non-UI contexts (e.g. triggers); fail silently
  }

  return { fontWarning: fontWarning };
}

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
 * @param {Array<Object>} paragraphsToInsert - Array of { text, align, rtl?, useEnglishTranslationFont?, spacingBefore?, spacingAfter?, fontSizeAdjustPt? } (spacing in pt; fontSizeAdjustPt e.g. -1 for citation one pt smaller)
 * @param {Object} formatState - { fontName, fontVariant, fontSize, bold, textColor }
 * @return {Object} { fontWarning: string|null }
 */
function insertParagraphsAtPosition_(body, doc, paragraphsToInsert, formatState) {
  var anchor = resolveInsertAnchor_(body, doc);
  var insertIndex = anchor.insertIndex;
  var removeTarget = anchor.removeTarget;

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
    fontWarning = applyBeautifiedInsertToParagraph_(p, item, formatState) || fontWarning;
  }

  var lastInsertedIndex = insertIndex + paragraphsToInsert.length - 1;
  var isLastInDoc = (lastInsertedIndex >= body.getNumChildren() - 1);

  var cursorTarget;
  if (isLastInDoc) {
    var cleanup = body.insertParagraph(lastInsertedIndex + 1, '');
    cleanup.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    cleanup.setLeftToRight(true);
    cleanup.setSpacingBefore(0);
    cleanup.setSpacingAfter(0);
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
 * @param {Object} settings - { showTranslation, arabicStyle, blockquoteInsertion }
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
      spacingBefore: INSERT_SPACING_OUTER_PT,
      spacingAfter: INSERT_SPACING_INNER_PT
    });
    paragraphsToInsert.push({
      text: '\u201C' + translationText + '\u201D',
      align: DocumentApp.HorizontalAlignment.CENTER,
      useEnglishTranslationFont: true,
      spacingAfter: INSERT_SPACING_INNER_PT
    });
    paragraphsToInsert.push({
      text: '(' + surahNameEn + qNbsp + ayahData.surah + ':' + ayahData.ayah + ')',
      align: DocumentApp.HorizontalAlignment.CENTER,
      useEnglishTranslationFont: true,
      spacingAfter: INSERT_SPACING_OUTER_PT,
      fontSizeAdjustPt: -1
    });
  } else {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      spacingBefore: INSERT_SPACING_OUTER_PT,
      spacingAfter: INSERT_SPACING_INNER_PT
    });
    paragraphsToInsert.push({
      text: '[' + surahNameAr + ':' + qNbsp + ayahNumAr + ']',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      spacingAfter: INSERT_SPACING_OUTER_PT,
      fontSizeAdjustPt: -1
    });
  }

  var useBlockquote = !settings || settings.blockquoteInsertion !== false;
  var result = useBlockquote
    ? insertBlockquoteTableAtPosition_(body, doc, paragraphsToInsert, formatState)
    : insertParagraphsAtPosition_(body, doc, paragraphsToInsert, formatState);
  var message = result.fontWarning ? 'Ayah inserted. ' + result.fontWarning : 'Ayah inserted.';
  return { success: true, message: message };
}

/**
 * Inserts a pre-assembled ayah range into the document.
 * If no cursor is set, inserts after the last non-empty paragraph.
 * @param {Object} rangeData - { surah, ayahStart, ayahEnd, arabicText, translationText, surahNameArabic, surahNameEnglish }
 * @param {Object} formatState - { fontName, fontVariant, fontSize, bold, textColor }
 * @param {Object} settings - { showTranslation, blockquoteInsertion }
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
      spacingBefore: INSERT_SPACING_OUTER_PT,
      spacingAfter: INSERT_SPACING_INNER_PT
    });
    paragraphsToInsert.push({
      text: '\u201C' + translationText + '\u201D',
      align: DocumentApp.HorizontalAlignment.CENTER,
      useEnglishTranslationFont: true,
      spacingAfter: INSERT_SPACING_INNER_PT
    });
    paragraphsToInsert.push({
      text: '(' + surahNameEn + qNbsp + rangeData.surah + ':' +
            rangeData.ayahStart + '-' + rangeData.ayahEnd + ')',
      align: DocumentApp.HorizontalAlignment.CENTER,
      useEnglishTranslationFont: true,
      spacingAfter: INSERT_SPACING_OUTER_PT,
      fontSizeAdjustPt: -1
    });
  } else {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      spacingBefore: INSERT_SPACING_OUTER_PT,
      spacingAfter: INSERT_SPACING_INNER_PT
    });
    paragraphsToInsert.push({
      text: '[' + surahNameAr + ':' + qNbsp + ayahStartAr + qNbsp + '-' + qNbsp + ayahEndAr + ']',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      spacingAfter: INSERT_SPACING_OUTER_PT,
      fontSizeAdjustPt: -1
    });
  }

  var useBlockquote = !settings || settings.blockquoteInsertion !== false;
  var result = useBlockquote
    ? insertBlockquoteTableAtPosition_(body, doc, paragraphsToInsert, formatState)
    : insertParagraphsAtPosition_(body, doc, paragraphsToInsert, formatState);
  return { success: true, message: result.fontWarning ? 'Range inserted. ' + result.fontWarning : 'Range inserted.' };
}
