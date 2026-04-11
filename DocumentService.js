/**
 * DocumentService.gs
 * Inserts Quranic ayat into Google Docs with formatting.
 */

/** Paragraph spacing (points) for beautified insert blocks: outer margin, gap between inner paragraphs. */
var INSERT_SPACING_OUTER_PT = 12;
var INSERT_SPACING_INNER_PT = 6;

/** Blockquote table: left accent (pt); accent color (fixed, not tied to body text color). */
var BLOCKQUOTE_BORDER_LEFT_PT = 3;
var BLOCKQUOTE_BORDER_LEFT_COLOR = '#3A8F7A';
var BLOCKQUOTE_CELL_BACKGROUND = '#F5F5F5';

/**
 * Walks an element up to its nearest body-level ancestor (direct child of body).
 * If the element is already a direct child, returns it unchanged.
 * Returns null when the element cannot be traced to a body-level child.
 * @param {Body} body
 * @param {GoogleAppsScript.Document.Element} element
 * @return {GoogleAppsScript.Document.Element|null}
 */
function resolveBodyLevelAncestor_(body, element) {
  var el = element;
  while (el) {
    if (body.getChildIndex(el) !== -1) return el;
    el = el.getParent();
  }
  return null;
}

/**
 * Resolves where to insert the next body-level block (paragraphs or table).
 * Tries getCursor() first; falls back to getSelection() (handles text-selection edge case);
 * final fallback inserts after the last non-empty paragraph.
 * When the resolved paragraph is nested (e.g. inside a blockquote table cell), walks up
 * to the body-level ancestor so getChildIndex always succeeds.
 * @param {Body} body
 * @param {Document} doc
 * @return {{ insertIndex: number, removeTarget: GoogleAppsScript.Document.Paragraph|null }}
 */
function resolveInsertAnchor_(body, doc) {
  var cursorElement = null;
  var cursor = doc.getCursor();
  if (cursor) {
    cursorElement = cursor.getElement();
  } else {
    var selection = doc.getSelection();
    if (selection) {
      var ranges = selection.getRangeElements();
      if (ranges && ranges.length > 0) {
        cursorElement = ranges[0].getElement();
      }
    }
  }

  var insertIndex;
  var removeTarget = null;

  if (cursorElement) {
    var cursorParagraph;

    if (cursorElement.getType() === DocumentApp.ElementType.PARAGRAPH) {
      cursorParagraph = cursorElement.asParagraph();
    } else {
      var parent = cursorElement.getParent();
      while (parent && parent.getType() !== DocumentApp.ElementType.PARAGRAPH) {
        parent = parent.getParent();
      }
      cursorParagraph = parent ? parent.asParagraph() : null;
    }

    var bodyChild = cursorParagraph
      ? resolveBodyLevelAncestor_(body, cursorParagraph)
      : resolveBodyLevelAncestor_(body, cursorElement);

    if (bodyChild) {
      if (bodyChild.getType() === DocumentApp.ElementType.PARAGRAPH &&
          bodyChild.asParagraph().getText() === '') {
        insertIndex = body.getChildIndex(bodyChild);
        removeTarget = bodyChild.asParagraph();
      } else {
        insertIndex = body.getChildIndex(bodyChild) + 1;
      }
    } else {
      insertIndex = body.getNumChildren();
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
  function q(x) {
    return Math.round(x * 1e6) / 1e6;
  }
  return { red: q(r), green: q(g), blue: q(b) };
}

/**
 * @param {number} pt
 * @param {{ red: number, green: number, blue: number }} rgb01
 * @return {Object} Docs API TableCellBorder (OptionalColor nested per docs OptionalColor schema)
 */
function docsTableBorderPt_(pt, rgb01) {
  return {
    dashStyle: 'SOLID',
    width: { magnitude: pt, unit: 'PT' },
    color: { color: { rgbColor: rgb01 } }
  };
}

/**
 * Resolves structural startIndex of a table for Docs API batchUpdate using
 * ordinal position (Nth table in the document) rather than array-index heuristics.
 * Returns null when the expected table is not yet visible (triggers caller retry).
 * @param {string} docId
 * @param {number} tableOrdinal - 1-based ordinal: "this is the Nth table in the body"
 * @return {number|null}
 */
function resolveTableStartIndexForDocsApi_(docId, tableOrdinal) {
  if (typeof Docs === 'undefined' || !Docs.Documents || !Docs.Documents.get) {
    return null;
  }
  var docJson;
  try {
    docJson = Docs.Documents.get(docId);
  } catch (e) {
    Logger.log('resolveTableStartIndexForDocsApi_: Documents.get failed: ' + e);
    return null;
  }
  var content = docJson.body && docJson.body.content;
  if (!content || tableOrdinal < 1) {
    return null;
  }
  var tablesFound = 0;
  for (var i = 0; i < content.length; i++) {
    if (content[i].table != null && content[i].startIndex != null) {
      tablesFound++;
      if (tablesFound === tableOrdinal) {
        return content[i].startIndex;
      }
    }
  }
  return null;
}

/**
 * Per-side cell borders (left accent only) via Docs API; DocumentApp cannot set per side.
 * Advanced Docs (get/batchUpdate) needs https://www.googleapis.com/auth/documents in appsscript.json;
 * drive.file can yield 404 on documents.get for the active editor doc.
 * Call only after the document has been flushed (auto-flush on function return, or saveAndClose).
 * @param {string} docId
 * @param {number} tableOrdinal - 1-based ordinal position of the target table among all body tables
 */
function applyBlockquoteCellBordersViaDocsApi_(docId, tableOrdinal) {
  if (typeof Docs === 'undefined' || !Docs.Documents || !Docs.Documents.batchUpdate) {
    return;
  }
  var tableStart = null;
  var attempt;
  for (attempt = 0; attempt < 5; attempt++) {
    tableStart = resolveTableStartIndexForDocsApi_(docId, tableOrdinal);
    if (tableStart != null) {
      break;
    }
    Utilities.sleep(200);
  }
  if (tableStart == null) {
    Logger.log('blockquote borders: could not resolve table start index');
    return;
  }

  var rgb = hexToDocsRgb01_(BLOCKQUOTE_BORDER_LEFT_COLOR);
  var black01 = { red: 0, green: 0, blue: 0 };
  var zero = docsTableBorderPt_(0, black01);
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

  var bgRgb = hexToDocsRgb01_(BLOCKQUOTE_CELL_BACKGROUND);

  var requests = [
    {
      updateTableCellStyle: {
        tableRange: tableRange,
        tableCellStyle: {
          borderTop: zero,
          borderRight: zero,
          borderBottom: zero,
          borderLeft: leftRgb,
          backgroundColor: { color: { rgbColor: bgRgb } }
        },
        fields: 'borderTop,borderRight,borderBottom,borderLeft,backgroundColor'
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
 * Border styling is NOT applied here — the caller receives pendingBorders and must invoke
 * applyBlockquoteBorders() in a separate server call so that the auto-flush between calls
 * makes the table visible to the Docs REST API without needing saveAndClose().
 * @param {Body} body
 * @param {Document} doc
 * @param {Array<Object>} paragraphsToInsert
 * @param {Object} formatState
 * @return {Object} { fontWarning: string|null, pendingBorders: {docId: string, tableOrdinal: number}|null }
 */
function insertBlockquoteTableAtPosition_(body, doc, paragraphsToInsert, formatState) {
  var anchor = resolveInsertAnchor_(body, doc);
  var insertIndex = anchor.insertIndex;
  var removeTarget = anchor.removeTarget;

  // Top buffer paragraph (structural). Skip when inserting at position 0 (empty doc).
  var tableOffset = 0;
  if (insertIndex > 0) {
    body.insertParagraph(insertIndex, '');
    tableOffset = 1;
  }

  var table = body.insertTable(insertIndex + tableOffset, [['']]);

  // Hide default table chrome immediately to minimize unstyled flash.
  try {
    if (typeof table.setBorderWidth === 'function') {
      table.setBorderWidth(0);
    }
  } catch (ignore) {
  }

  var removeTargetStillExists = false;
  if (removeTarget) {
    var after = body.getChild(insertIndex + tableOffset + 1);
    if (after === removeTarget) {
      try {
        body.removeChild(removeTarget);
      } catch (ignore) {
        removeTargetStillExists = true;
      }
    }
  }

  var cell = table.getRow(0).getCell(0);
  cell.setPaddingLeft(21);
  cell.setPaddingTop(6);
  cell.setPaddingRight(18);
  cell.setPaddingBottom(6);

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

  var tableIdx = body.getChildIndex(table);
  var typingParagraph;
  if (removeTargetStillExists) {
    typingParagraph = removeTarget;
  } else {
    typingParagraph = body.insertParagraph(tableIdx + 1, '');
  }
  typingParagraph.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  typingParagraph.setLeftToRight(true);

  try {
    doc.setCursor(doc.newPosition(typingParagraph, 0));
  } catch (e) {
    // setCursor is unavailable in non-UI contexts (e.g. triggers); fail silently
  }

  var docId = doc.getId();
  var bodyChildIndex = body.getChildIndex(table);
  var tableOrdinal = 0;
  for (var ci = 0; ci <= bodyChildIndex; ci++) {
    if (body.getChild(ci).getType() === DocumentApp.ElementType.TABLE) {
      tableOrdinal++;
    }
  }

  return {
    fontWarning: fontWarning,
    pendingBorders: { docId: docId, tableOrdinal: tableOrdinal }
  };
}

/**
 * Public entry point for the client to apply blockquote cell borders via a second RPC.
 * Called after insertAyah/insertAyahRange returns pendingBorders; the auto-flush between
 * the two server calls ensures the Docs REST API can see the newly inserted table.
 * @param {string} docId
 * @param {number} tableOrdinal - 1-based ordinal position of the target table
 */
function applyBlockquoteBorders(docId, tableOrdinal) {
  applyBlockquoteCellBordersViaDocsApi_(docId, tableOrdinal);
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
  var out = { success: true, message: message };
  if (result.pendingBorders) {
    out.pendingBorders = result.pendingBorders;
  }
  return out;
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
  var out = { success: true, message: result.fontWarning ? 'Range inserted. ' + result.fontWarning : 'Range inserted.' };
  if (result.pendingBorders) {
    out.pendingBorders = result.pendingBorders;
  }
  return out;
}
