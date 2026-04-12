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
var BLOCKQUOTE_CELL_BACKGROUND = '#F7F7F7';

/**
 * Walks an element up to its nearest body-level ancestor (direct child of body).
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
    }
    el = el.getParent();
  }
  return null;
}

/**
 * @param {string} s
 * @return {number}
 */
function countTrailingNewlinesInString_(s) {
  var c = 0;
  var i;
  for (i = s.length - 1; i >= 0; i--) {
    if (s.charAt(i) === '\n') {
      c++;
    } else {
      break;
    }
  }
  return c;
}

/**
 * Counts empty body-level paragraphs/list items and trailing newlines on the first non-empty
 * encountered when walking backward from gapIdx (exclusive).
 * @param {Body} body
 * @param {number} gapIdx
 * @return {number}
 */
function countPrecedingBlankEquivalence_(body, gapIdx) {
  var total = 0;
  var i = gapIdx - 1;
  while (i >= 0) {
    var ch = body.getChild(i);
    var t = ch.getType();
    if (t === DocumentApp.ElementType.PARAGRAPH || t === DocumentApp.ElementType.LIST_ITEM) {
      var text = ch.asParagraph().getText();
      if (text === '') {
        total++;
        i--;
      } else {
        total += countTrailingNewlinesInString_(text);
        break;
      }
    } else {
      break;
    }
  }
  return total;
}

/**
 * @param {Body} body
 * @param {number} gapIdx
 * @param {boolean} absoluteDocStart
 * @return {number} how many empty paragraphs to insert at gapIdx
 */
function computeTopBufferParagraphsToAdd_(body, gapIdx, absoluteDocStart) {
  if (absoluteDocStart) {
    return 0;
  }
  var n = countPrecedingBlankEquivalence_(body, gapIdx);
  if (n >= 2) {
    return 0;
  }
  if (n === 1) {
    return 1;
  }
  return 2;
}

/**
 * @param {GoogleAppsScript.Document.Element} el
 * @param {number} offset
 * @return {{ host: GoogleAppsScript.Document.Paragraph, charOffset: number }|null}
 */
function resolveHostParagraphAndCharOffset_(el, offset) {
  var type = el.getType();
  if (type === DocumentApp.ElementType.TEXT) {
    var textEl = el.asText();
    var host = textEl.getParent();
    var ht = host.getType();
    if (ht !== DocumentApp.ElementType.PARAGRAPH && ht !== DocumentApp.ElementType.LIST_ITEM) {
      return null;
    }
    var local = offset;
    var acc = 0;
    var j;
    for (j = 0; j < host.getNumChildren(); j++) {
      var ch = host.getChild(j);
      if (ch.getType() === DocumentApp.ElementType.TEXT) {
        var len = ch.asText().getText().length;
        if (ch === textEl) {
          return { host: /** @type {GoogleAppsScript.Document.Paragraph} */ (host), charOffset: acc + local };
        }
        acc += len;
      }
    }
    return null;
  }
  if (type === DocumentApp.ElementType.PARAGRAPH || type === DocumentApp.ElementType.LIST_ITEM) {
    return { host: /** @type {GoogleAppsScript.Document.Paragraph} */ (el), charOffset: offset };
  }
  return null;
}

/**
 * @param {GoogleAppsScript.Document.RangeElement} re
 * @return {number}
 */
function rangeElementInsertCharOffset_(re) {
  var el = re.getElement();
  if (re.isPartial()) {
    return re.getEndOffsetInclusive() + 1;
  }
  if (el.getType() === DocumentApp.ElementType.TEXT) {
    return el.asText().getText().length;
  }
  if (el.getType() === DocumentApp.ElementType.PARAGRAPH || el.getType() === DocumentApp.ElementType.LIST_ITEM) {
    return el.asParagraph().getText().length;
  }
  return 0;
}

/**
 * Resolves cursor/selection to host paragraph (or list item as paragraph) and character offset.
 * @param {Document} doc
 * @return {{ host: GoogleAppsScript.Document.Paragraph, charOffset: number }|null}
 */
function resolveActiveHostAndOffset_(doc) {
  var sel = doc.getSelection();
  if (sel) {
    var ranges = sel.getRangeElements();
    if (ranges && ranges.length > 0) {
      var last = ranges[ranges.length - 1];
      return resolveHostParagraphAndCharOffset_(last.getElement(), rangeElementInsertCharOffset_(last));
    }
  }
  var cur = doc.getCursor();
  if (cur) {
    return resolveHostParagraphAndCharOffset_(cur.getElement(), cur.getOffset());
  }
  return null;
}

/**
 * @param {Body} body
 * @param {Document} doc
 * @return {{
 *   gapBodyIndex: number,
 *   reuseFirstParagraphForFirstAyah: boolean,
 *   remainderText: string,
 *   remainderIsListItem: boolean,
 *   templateListItem: GoogleAppsScript.Document.ListItem|null,
 *   absoluteDocStart: boolean,
 *   hasFollowingStructural: boolean
 * }}
 */
function buildInsertPlan_(body, doc) {
  var n = body.getNumChildren();
  var hostInfo = resolveActiveHostAndOffset_(doc);
  if (!hostInfo) {
    var absStart = n === 0;
    return {
      gapBodyIndex: n,
      reuseFirstParagraphForFirstAyah: false,
      remainderText: '',
      remainderIsListItem: false,
      templateListItem: null,
      absoluteDocStart: absStart,
      hasFollowingStructural: false
    };
  }

  var host = hostInfo.host;
  var charOffset = hostInfo.charOffset;
  var bodyChild = resolveBodyLevelAncestor_(body, host);
  if (!bodyChild) {
    return {
      gapBodyIndex: n,
      reuseFirstParagraphForFirstAyah: false,
      remainderText: '',
      remainderIsListItem: false,
      templateListItem: null,
      absoluteDocStart: n === 0,
      hasFollowingStructural: false
    };
  }

  if (bodyChild.getType() === DocumentApp.ElementType.TABLE) {
    var tIdx = body.getChildIndex(bodyChild);
    var gapIdxTable = tIdx + 1;
    return {
      gapBodyIndex: gapIdxTable,
      reuseFirstParagraphForFirstAyah: false,
      remainderText: '',
      remainderIsListItem: false,
      templateListItem: null,
      absoluteDocStart: gapIdxTable === 0,
      hasFollowingStructural: gapIdxTable < n
    };
  }

  var childIdx = body.getChildIndex(bodyChild);
  var fullText = host.getText();
  var safeOffset = Math.max(0, Math.min(charOffset, fullText.length));
  var before = fullText.substring(0, safeOffset);
  var after = fullText.substring(safeOffset);

  if (n === 1 && bodyChild.getType() === DocumentApp.ElementType.PARAGRAPH &&
      fullText === '' && safeOffset === 0) {
    return {
      gapBodyIndex: 0,
      reuseFirstParagraphForFirstAyah: true,
      remainderText: '',
      remainderIsListItem: false,
      templateListItem: null,
      absoluteDocStart: true,
      hasFollowingStructural: false
    };
  }

  host.setText(before);
  var gapIdx = childIdx + 1;
  var isList = bodyChild.getType() === DocumentApp.ElementType.LIST_ITEM;
  var templateLi = isList ? bodyChild.asListItem() : null;

  return {
    gapBodyIndex: gapIdx,
    reuseFirstParagraphForFirstAyah: false,
    remainderText: after,
    remainderIsListItem: isList,
    templateListItem: templateLi,
    absoluteDocStart: gapIdx === 0 && before === '',
    hasFollowingStructural: (gapIdx < body.getNumChildren()) || (after.length > 0)
  };
}

/**
 * @param {boolean} hasFollowingStructural
 * @return {number} 1 or 2
 */
function computeBottomBufferParagraphCount_(hasFollowingStructural) {
  return hasFollowingStructural ? 2 : 1;
}

/**
 * Inserts n empty paragraphs at body index `atIndex` (each insert shifts; repeat at same index).
 * @param {Body} body
 * @param {number} atIndex
 * @param {number} n
 */
function insertEmptyParagraphBuffersAt_(body, atIndex, n) {
  var k;
  for (k = 0; k < n; k++) {
    body.insertParagraph(atIndex, '');
  }
}

/**
 * @param {Body} body
 * @param {Document} doc
 * @param {Array<Object>} paragraphsToInsert
 * @param {Object} formatState
 * @param {boolean} useBlockquote
 * @return {Object}
 */
function insertAyahPayloadShared_(body, doc, paragraphsToInsert, formatState, useBlockquote) {
  var plan = buildInsertPlan_(body, doc);
  var gapIdx = plan.gapBodyIndex;
  var topN = computeTopBufferParagraphsToAdd_(body, gapIdx, plan.absoluteDocStart);
  insertEmptyParagraphBuffersAt_(body, gapIdx, topN);
  gapIdx += topN;

  var fontWarning = null;
  var pendingBorders = null;
  var table = null;
  var i;
  var item;
  var p;
  var curIdx;

  if (useBlockquote) {
    table = body.insertTable(gapIdx, [['']]);
    if (plan.reuseFirstParagraphForFirstAyah) {
      try {
        var displaced = body.getChild(gapIdx + 1);
        if (displaced.getType() === DocumentApp.ElementType.PARAGRAPH &&
            displaced.asParagraph().getText() === '') {
          body.removeChild(displaced);
        }
      } catch (ignoreRm) {
      }
    }
    try {
      if (typeof table.setBorderWidth === 'function') {
        table.setBorderWidth(0);
      }
    } catch (ignore) {
    }
    var cell = table.getRow(0).getCell(0);
    cell.setPaddingLeft(21);
    cell.setPaddingTop(6);
    cell.setPaddingRight(18);
    cell.setPaddingBottom(6);

    for (i = 0; i < paragraphsToInsert.length; i++) {
      item = paragraphsToInsert[i];
      if (i === 0) {
        p = cell.getChild(0).asParagraph();
        p.setText(item.text);
      } else {
        p = cell.insertParagraph(i, item.text);
      }
      fontWarning = applyBeautifiedInsertToParagraph_(p, item, formatState) || fontWarning;
    }

    gapIdx = body.getChildIndex(table) + 1;
    var docId = doc.getId();
    var bodyChildIndex = body.getChildIndex(table);
    var tableOrdinal = 0;
    for (var ci = 0; ci <= bodyChildIndex; ci++) {
      if (body.getChild(ci).getType() === DocumentApp.ElementType.TABLE) {
        tableOrdinal++;
      }
    }
    pendingBorders = { docId: docId, tableOrdinal: tableOrdinal };
  } else {
    curIdx = gapIdx;
    for (i = 0; i < paragraphsToInsert.length; i++) {
      item = paragraphsToInsert[i];
      if (i === 0 && plan.reuseFirstParagraphForFirstAyah) {
        p = body.getChild(gapIdx).asParagraph();
        p.setText(item.text);
        curIdx = gapIdx + 1;
      } else {
        p = body.insertParagraph(curIdx, item.text);
        curIdx++;
      }
      fontWarning = applyBeautifiedInsertToParagraph_(p, item, formatState) || fontWarning;
    }
    gapIdx = curIdx;
  }

  var bottomN = computeBottomBufferParagraphCount_(plan.hasFollowingStructural);
  insertEmptyParagraphBuffersAt_(body, gapIdx, bottomN);
  var cursorPara = body.getChild(gapIdx + bottomN - 1).asParagraph();

  var remainderInsertIdx = gapIdx + bottomN;
  if (plan.remainderText.length > 0) {
    if (plan.remainderIsListItem && plan.templateListItem) {
      var newLi = body.insertListItem(remainderInsertIdx, plan.templateListItem);
      newLi.setText(plan.remainderText);
    } else {
      body.insertParagraph(remainderInsertIdx, plan.remainderText);
    }
  }

  try {
    doc.setCursor(doc.newPosition(cursorPara, 0));
  } catch (e) {
  }

  return { fontWarning: fontWarning, pendingBorders: pendingBorders };
}

/**
 * Applies beautified insert formatting to a paragraph (body or table cell).
 * @param {GoogleAppsScript.Document.Paragraph} p
 * @param {Object} item
 * @param {Object} formatState
 * @return {string|null}
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
 * @return {{ red: number, green: number, blue: number }}
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
 * @param {{ red: number, green: number, blue: number}} rgb01
 * @return {Object}
 */
function docsTableBorderPt_(pt, rgb01) {
  return {
    dashStyle: 'SOLID',
    width: { magnitude: pt, unit: 'PT' },
    color: { color: { rgbColor: rgb01 } }
  };
}

/**
 * @param {string} docId
 * @param {number} tableOrdinal
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
 * @param {string} docId
 * @param {number} tableOrdinal
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
 * @param {Body} body
 * @param {Document} doc
 * @param {Array<Object>} paragraphsToInsert
 * @param {Object} formatState
 * @return {Object}
 */
function insertBlockquoteTableAtPosition_(body, doc, paragraphsToInsert, formatState) {
  return insertAyahPayloadShared_(body, doc, paragraphsToInsert, formatState, true);
}

/**
 * @param {string} docId
 * @param {number} tableOrdinal
 */
function applyBlockquoteBorders(docId, tableOrdinal) {
  applyBlockquoteCellBordersViaDocsApi_(docId, tableOrdinal);
}

/**
 * @param {Body} body
 * @param {Document} doc
 * @param {Array<Object>} paragraphsToInsert
 * @param {Object} formatState
 * @return {Object}
 */
function insertParagraphsAtPosition_(body, doc, paragraphsToInsert, formatState) {
  return insertAyahPayloadShared_(body, doc, paragraphsToInsert, formatState, false);
}

/**
 * @param {Object} ayahData
 * @param {Object} formatState
 * @param {Object} settings
 * @return {Object}
 */
function insertAyah(ayahData, formatState, settings) {
  if (!ayahData || !ayahData.surah || !ayahData.ayah) {
    return { success: false, message: 'Invalid ayah data' };
  }

  var doc = DocumentApp.getActiveDocument();
  if (!doc) {
    return { success: false, message: 'No active document' };
  }
  var body = doc.getBody();

  var arabicStyle = (settings && settings.arabicStyle) || 'uthmani';
  var showTranslation = settings && settings.showTranslation !== false;

  var arabicText = (arabicStyle === 'uthmani' && ayahData.textUthmani)
    ? ayahData.textUthmani
    : (ayahData.textSimple || ayahData.textUthmani || '');
  var translationText = ayahData.translationText || '';
  var surahNameEn = ayahData.surahNameEnglish || '';

  var qNbsp = '\u00A0';
  var paragraphsToInsert = [];
  if (showTranslation && translationText) {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      insertTextRole: 'quran',
      spacingBefore: INSERT_SPACING_OUTER_PT,
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
      insertTextRole: 'citation',
      spacingAfter: INSERT_SPACING_OUTER_PT
    });
  } else {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      insertTextRole: 'quran',
      spacingBefore: INSERT_SPACING_OUTER_PT,
      spacingAfter: INSERT_SPACING_OUTER_PT
    });
  }

  var useBlockquote = !settings || settings.blockquoteInsertion !== false;
  var result = insertAyahPayloadShared_(body, doc, paragraphsToInsert, formatState, useBlockquote);
  var message = result.fontWarning ? 'Ayah inserted. ' + result.fontWarning : 'Ayah inserted.';
  var out = { success: true, message: message };
  if (result.pendingBorders) {
    out.pendingBorders = result.pendingBorders;
  }
  return out;
}

/**
 * @param {Object} rangeData
 * @param {Object} formatState
 * @param {Object} settings
 * @return {Object}
 */
function insertAyahRange(rangeData, formatState, settings) {
  if (!rangeData || !rangeData.surah || !rangeData.ayahStart) {
    return { success: false, message: 'Invalid range data.' };
  }

  var doc = DocumentApp.getActiveDocument();
  if (!doc) {
    return { success: false, message: 'No active document' };
  }
  var body = doc.getBody();

  var showTranslation = settings && settings.showTranslation !== false;
  var arabicText = rangeData.arabicText || '';
  var translationText = rangeData.translationText || '';
  var surahNameEn = rangeData.surahNameEnglish || '';

  var qNbsp = '\u00A0';
  var paragraphsToInsert = [];
  if (showTranslation && translationText) {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      insertTextRole: 'quran',
      spacingBefore: INSERT_SPACING_OUTER_PT,
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
      insertTextRole: 'citation',
      spacingAfter: INSERT_SPACING_OUTER_PT
    });
  } else {
    paragraphsToInsert.push({
      text: '\uFD3F' + qNbsp + arabicText + qNbsp + '\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      insertTextRole: 'quran',
      spacingBefore: INSERT_SPACING_OUTER_PT,
      spacingAfter: INSERT_SPACING_OUTER_PT
    });
  }

  var useBlockquote = !settings || settings.blockquoteInsertion !== false;
  var result = insertAyahPayloadShared_(body, doc, paragraphsToInsert, formatState, useBlockquote);
  var out = { success: true, message: result.fontWarning ? 'Range inserted. ' + result.fontWarning : 'Range inserted.' };
  if (result.pendingBorders) {
    out.pendingBorders = result.pendingBorders;
  }
  return out;
}
