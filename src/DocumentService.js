/**
 * DocumentService.gs
 * Inserts Quranic ayat into Google Docs with formatting.
 */

/** Paragraph spacing (points) for beautified insert blocks: gap between inner paragraphs. */
var INSERT_SPACING_INNER_PT = 6;
/** Paragraph spacing (points) for outer gap around non-quote inserts. */
var TARGET_SPACING_PT = 8;

/** Blockquote 2×1 table: accent column width (pt); accent fill; content cell background. */
var BLOCKQUOTE_ACCENT_COL_PT = 3;
var BLOCKQUOTE_BORDER_LEFT_COLOR = '#3A8F7A';
var BLOCKQUOTE_CELL_BACKGROUND = '#F7F7F7';
/** Uniform padding (pt) on the verse content cell (replaces old 21pt left + border). */
var BLOCKQUOTE_CONTENT_CELL_PADDING_PT = 18;

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
 * Inserts a 2×1 table at the anchor: narrow green accent column + grey content cell.
 * Styled entirely with DocumentApp (no Docs REST API; works with documents.currentonly).
 * @param {Body} body
 * @param {Document} doc
 * @param {Array<Object>} paragraphsToInsert
 * @param {Object} formatState
 * @return {Object} { fontWarning: string|null }
 */
function insertBlockquoteTableAtPosition_(body, doc, paragraphsToInsert, formatState) {
  var anchor = resolveNativeInsertAnchor_(body, doc);
  var insertIndex = anchor.baseIndex;
  var removeTarget = anchor.removeTarget;

  var table = body.insertTable(insertIndex, [['', '']]);

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

  var row = table.getRow(0);
  var accentCell = row.getCell(0);
  var contentCell = row.getCell(1);

  accentCell.setBackgroundColor(BLOCKQUOTE_BORDER_LEFT_COLOR);
  if (typeof accentCell.setWidth === 'function') {
    accentCell.setWidth(BLOCKQUOTE_ACCENT_COL_PT);
  }
  accentCell.setPaddingLeft(0);
  accentCell.setPaddingTop(0);
  accentCell.setPaddingRight(0);
  accentCell.setPaddingBottom(0);
  try {
    accentCell.getChild(0).asParagraph().setText('\u200B');
  } catch (ignore) {
  }

  contentCell.setBackgroundColor(BLOCKQUOTE_CELL_BACKGROUND);
  contentCell.setPaddingLeft(BLOCKQUOTE_CONTENT_CELL_PADDING_PT);
  contentCell.setPaddingTop(BLOCKQUOTE_CONTENT_CELL_PADDING_PT);
  contentCell.setPaddingRight(BLOCKQUOTE_CONTENT_CELL_PADDING_PT);
  contentCell.setPaddingBottom(BLOCKQUOTE_CONTENT_CELL_PADDING_PT);

  var fontWarning = null;
  for (var i = 0; i < paragraphsToInsert.length; i++) {
    var item = paragraphsToInsert[i];
    var p;
    if (i === 0) {
      p = contentCell.getChild(0).asParagraph();
      p.setText(item.text);
    } else {
      p = contentCell.insertParagraph(i, item.text);
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
      doc.setCursor(
        doc.newPosition(contentCell.getChild(contentCell.getNumChildren() - 1).asParagraph(), 0)
      );
    }
  } catch (e) {
    // setCursor is unavailable in non-UI contexts (e.g. triggers); fail silently
  }

  return { fontWarning: fontWarning };
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
  return { success: true, message: message };
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
  return {
    success: true,
    message: result.fontWarning ? 'Range inserted. ' + result.fontWarning : 'Range inserted.'
  };
}
