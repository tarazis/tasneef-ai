/**
 * DocumentService.gs
 * Inserts Quranic ayat into Google Docs with formatting.
 */

/** Paragraph spacing (points) for beautified insert blocks: gap between inner paragraphs. */
var INSERT_SPACING_INNER_PT = 6;
/** Paragraph spacing (points) for outer gap around non-quote inserts. */
var TARGET_SPACING_PT = 8;

/** Blockquote table: left accent (pt); accent color (fixed, not tied to body text color). */
var BLOCKQUOTE_BORDER_LEFT_PT = 3;
var BLOCKQUOTE_BORDER_LEFT_COLOR = '#3A8F7A';
var BLOCKQUOTE_CELL_BACKGROUND = '#F7F7F7';

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
    try {
      var idx = body.getChildIndex(el);
      if (idx !== -1) return el;
    } catch (e) {
      // el is not a direct child of body — keep walking up
    }
    el = el.getParent();
  }
  return null;
}

/**
 * Returns nearest paragraph/list-item ancestor for an element.
 * @param {GoogleAppsScript.Document.Element} element
 * @return {GoogleAppsScript.Document.Element|null}
 */
function resolveParagraphLikeAncestor_(element) {
  var el = element;
  while (el) {
    var t = el.getType();
    if (t === DocumentApp.ElementType.PARAGRAPH || t === DocumentApp.ElementType.LIST_ITEM) {
      return el;
    }
    el = el.getParent();
  }
  return null;
}

/**
 * Returns element at selection end when selection exists.
 * @param {Document} doc
 * @return {GoogleAppsScript.Document.Element|null}
 */
function getSelectionEndElement_(doc) {
  var sel = doc.getSelection();
  if (!sel) return null;
  var ranges = sel.getRangeElements();
  if (!ranges || ranges.length === 0) return null;
  return ranges[ranges.length - 1].getElement();
}

/**
 * Resolves native-like insertion position.
 * Selection behavior is intentionally simple: insert after the body-level element at
 * selection end (no selected-text replacement). Cursor behavior is block-boundary only.
 * @param {Body} body
 * @param {Document} doc
 * @return {{ baseIndex: number, removeTarget: GoogleAppsScript.Document.Paragraph|null }}
 */
function resolveNativeInsertAnchor_(body, doc) {
  var sel = doc.getSelection();
  if (sel) {
    var selEnd = getSelectionEndElement_(doc);
    if (selEnd) {
      var selBodyChild = resolveBodyLevelAncestor_(body, selEnd);
      if (selBodyChild) {
        var selIdx = body.getChildIndex(selBodyChild);
        return { baseIndex: selIdx + 1, removeTarget: null };
      }
    }
  }

  var cur = doc.getCursor();
  if (!cur) {
    return resolveFallbackInsertAnchor_(body);
  }

  var cursorElement = cur.getElement();
  var cursorContainer = resolveParagraphLikeAncestor_(cursorElement);
  if (cursorContainer && typeof cur.getOffset === 'function') {
    var cursorIdx = body.getChildIndex(cursorContainer);
    var cursorText = cursorContainer.getText();
    var off = cur.getOffset();
    if (off < 0) off = 0;
    if (off > cursorText.length) off = cursorText.length;

    if (off === 0) {
      if (cursorContainer.getType() === DocumentApp.ElementType.PARAGRAPH && cursorText === '') {
        return { baseIndex: cursorIdx, removeTarget: cursorContainer.asParagraph() };
      }
      return { baseIndex: cursorIdx, removeTarget: null };
    }

    if (off === cursorText.length) {
      return { baseIndex: cursorIdx + 1, removeTarget: null };
    }
    return { baseIndex: cursorIdx + 1, removeTarget: null };
  }

  var bodyChild = resolveBodyLevelAncestor_(body, cursorElement);
  if (!bodyChild) {
    return resolveFallbackInsertAnchor_(body);
  }
  return { baseIndex: body.getChildIndex(bodyChild) + 1, removeTarget: null };
}

/**
 * When no cursor/selection: append after the last body child.
 * @param {Body} body
 * @return {{ baseIndex: number, removeTarget: GoogleAppsScript.Document.Paragraph|null }}
 */
function resolveFallbackInsertAnchor_(body) {
  var n = body.getNumChildren();
  if (n === 1) {
    var only = body.getChild(0);
    if (only.getType() === DocumentApp.ElementType.PARAGRAPH &&
        only.asParagraph().getText() === '') {
      return { baseIndex: 0, removeTarget: only.asParagraph() };
    }
  }
  return { baseIndex: n, removeTarget: null };
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
  var fs = formatStateForBeautifiedInsertParagraph(item, formatState);
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
    return {
      success: false,
      message: 'Docs API unavailable for blockquote styling.'
    };
  }
  var tableStart = null;
  var maxAttempts = 10;
  var attempt;
  for (attempt = 0; attempt < maxAttempts; attempt++) {
    tableStart = resolveTableStartIndexForDocsApi_(docId, tableOrdinal);
    if (tableStart != null) {
      break;
    }
    Utilities.sleep(200);
  }
  if (tableStart == null) {
    Logger.log('blockquote borders: could not resolve table start index');
    return {
      success: false,
      message: 'Ayah inserted but styling could not be applied after retries.',
      attempts: maxAttempts
    };
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
    return { success: true };
  } catch (e) {
    Logger.log('blockquote borders batchUpdate: ' + e);
    return {
      success: false,
      message: 'Ayah inserted but styling could not be applied.',
      error: String(e)
    };
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
  var anchor = resolveNativeInsertAnchor_(body, doc);
  var insertIndex = anchor.baseIndex;
  var removeTarget = anchor.removeTarget;

  var table = body.insertTable(insertIndex, [['']]);

  // Hide default table chrome immediately to minimize unstyled flash.
  try {
    if (typeof table.setBorderWidth === 'function') {
      table.setBorderWidth(0);
    }
  } catch (ignore) {
  }

  var removeTargetStillExists = false;
  if (removeTarget) {
    var after = body.getChild(insertIndex + 1);
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
  cell.setPaddingTop(18);
  cell.setPaddingRight(18);
  cell.setPaddingBottom(18);

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
  var cursorParagraph = null;
  var nextIdxBq = tableIdx + 1;
  var nextElBq = nextIdxBq < body.getNumChildren() ? body.getChild(nextIdxBq) : null;
  if (nextElBq && nextElBq.getType() === DocumentApp.ElementType.PARAGRAPH) {
    cursorParagraph = nextElBq.asParagraph();
  } else if (removeTargetStillExists && removeTarget) {
    cursorParagraph = removeTarget;
  }

  try {
    if (cursorParagraph) {
      doc.setCursor(doc.newPosition(cursorParagraph, 0));
    } else {
      // No following paragraph exists: keep cursor in the inserted block.
      doc.setCursor(doc.newPosition(cell.getChild(cell.getNumChildren() - 1).asParagraph(), 0));
    }
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
 * Inserts beautified paragraphs with the same native insertion-position rules as
 * blockquote inserts (block-boundary cursor insertion, selection-end insertion,
 * fallback at document end).
 * Cursor moves to the following body paragraph when one exists; otherwise it stays on
 * the last inserted paragraph.
 *
 * @param {Body} body
 * @param {Document} doc
 * @param {Array<Object>} paragraphsToInsert
 * @param {Object} formatState
 * @return {Object} { fontWarning: string|null }
 */
function insertParagraphsAtPosition_(body, doc, paragraphsToInsert, formatState) {
  var anchor = resolveNativeInsertAnchor_(body, doc);
  var idx = anchor.baseIndex;
  var removeTarget = anchor.removeTarget;

  var contentStart = idx;
  var effectiveSpacingBefore = TARGET_SPACING_PT;
  var effectiveSpacingAfter = TARGET_SPACING_PT;
  var fontWarning = null;
  var i;
  var item;
  var p;

  for (i = 0; i < paragraphsToInsert.length; i++) {
    item = paragraphsToInsert[i];
    if (i === 0 && removeTarget && body.getChild(contentStart) === removeTarget) {
      p = removeTarget;
      p.setText(item.text);
    } else {
      p = body.insertParagraph(contentStart + i, item.text);
    }
    if (i === 0) {
      p.setSpacingBefore(effectiveSpacingBefore);
    }
    if (i === paragraphsToInsert.length - 1) {
      p.setSpacingAfter(effectiveSpacingAfter);
    }
    fontWarning = applyBeautifiedInsertToParagraph_(p, item, formatState) || fontWarning;
  }

  var bottomIdx = contentStart + paragraphsToInsert.length;
  var cursorParagraph = p;
  var cursorOffset = p ? p.getText().length : 0;
  if (bottomIdx < body.getNumChildren()) {
    var nextElPlain = body.getChild(bottomIdx);
    if (nextElPlain.getType() === DocumentApp.ElementType.PARAGRAPH) {
      cursorParagraph = nextElPlain.asParagraph();
      cursorOffset = 0;
    }
  }

  try {
    if (cursorParagraph) {
      doc.setCursor(doc.newPosition(cursorParagraph, cursorOffset));
    }
  } catch (e) {
    // setCursor is unavailable in non-UI contexts (e.g. triggers); fail silently
  }

  return { fontWarning: fontWarning };
}

/**
 * Public entry point for the client to apply blockquote cell borders via a second RPC.
 * Called after insertAyah/insertAyahRange returns pendingBorders; the auto-flush between
 * the two server calls ensures the Docs REST API can see the newly inserted table.
 * @param {string} docId
 * @param {number} tableOrdinal - 1-based ordinal position of the target table
 */
function applyBlockquoteBorders(docId, tableOrdinal) {
  return applyBlockquoteCellBordersViaDocsApi_(docId, tableOrdinal);
}

/**
 * Inserts an ayah into the document using resolveNativeInsertAnchor_
 * (block-boundary cursor insertion, selection-end insertion, doc-end fallback).
 * @param {Object} ayahData - { surah, ayah, surahNameArabic, surahNameEnglish, textUthmani, textSimple, translationText }
 * @param {Object} formatState - legacy payload; Quran Arabic forced to Amiri regular in FormatService
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
  var surahNameEn = ayahData.surahNameEnglish || '';

  /** U+00A0: ornate Quranic parens (matches preview); Arabic :/ayah and range hyphen; English name/num only. */
  var qNbsp = '\u00A0';
  var paragraphsToInsert = [];
  if (showTranslation && translationText) {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      insertTextRole: 'quran',
      spacingAfter: INSERT_SPACING_INNER_PT
    });
    paragraphsToInsert.push({
      text: '\u201C' + translationText + '\u201D',
      align: DocumentApp.HorizontalAlignment.CENTER,
      insertTextRole: 'translation',
      spacingAfter: INSERT_SPACING_INNER_PT
    });
    paragraphsToInsert.push({
      text: '(' + surahNameEn + qNbsp + ayahData.surah + ':' + ayahData.ayah + ')',
      align: DocumentApp.HorizontalAlignment.CENTER,
      insertTextRole: 'citation'
    });
  } else {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      insertTextRole: 'quran'
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
 * Inserts a pre-assembled ayah range using the same anchor rules as insertAyah.
 * @param {Object} rangeData - { surah, ayahStart, ayahEnd, arabicText, translationText, surahNameArabic, surahNameEnglish }
 * @param {Object} formatState - legacy payload; Quran Arabic forced to Amiri regular in FormatService
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
  var surahNameEn     = rangeData.surahNameEnglish || '';

  var qNbsp = '\u00A0';
  var paragraphsToInsert = [];
  if (showTranslation && translationText) {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      insertTextRole: 'quran',
      spacingAfter: INSERT_SPACING_INNER_PT
    });
    paragraphsToInsert.push({
      text: '\u201C' + translationText + '\u201D',
      align: DocumentApp.HorizontalAlignment.CENTER,
      insertTextRole: 'translation',
      spacingAfter: INSERT_SPACING_INNER_PT
    });
    paragraphsToInsert.push({
      text: '(' + surahNameEn + qNbsp + rangeData.surah + ':' +
            rangeData.ayahStart + '-' + rangeData.ayahEnd + ')',
      align: DocumentApp.HorizontalAlignment.CENTER,
      insertTextRole: 'citation'
    });
  } else {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      insertTextRole: 'quran'
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
