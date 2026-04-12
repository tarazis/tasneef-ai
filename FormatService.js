/**
 * FormatService.gs
 * Applies formatting to Google Docs text elements.
 * Quran Arabic is always Amiri regular non-bold; font fallback to Amiri with toast on failure.
 * Weighted Google Fonts use setFontFamily("Family;WEIGHT") with setItalic for italic tokens.
 */

var ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
var FALLBACK_FONT = 'Amiri';
/** Google Docs font family for inserted English translation and English citation (Google Fonts name). */
var ENGLISH_TRANSLATION_INSERT_FONT = 'Figtree';

/** Fixed typography for inserted Quran Arabic (Amiri only; client formatState is ignored for family/variant/bold). */
var INSERT_QURAN_FONT_SIZE_PT = 16;
var INSERT_QURAN_TEXT_COLOR = '#202124';

/** Fixed typography for inserted translation and English citation (same color as Quran body). */
var INSERT_TRANSLATION_FONT_SIZE_PT = 12;
var INSERT_CITATION_FONT_SIZE_PT = 11;

function shallowCopyFormatState_(formatState) {
  var out = {};
  if (!formatState) {
    return out;
  }
  for (var k in formatState) {
    if (Object.prototype.hasOwnProperty.call(formatState, k)) {
      out[k] = formatState[k];
    }
  }
  return out;
}

/**
 * Parses a Google Fonts API variant token (e.g. regular, italic, 500, 700italic).
 * Regular = weight 400 (Docs / CSS convention).
 * @param {string} token
 * @return {{ weight: number, italic: boolean }}
 */
function parseGoogleFontVariant(token) {
  if (token == null || typeof token !== 'string') {
    return { weight: 400, italic: false };
  }
  var t = token.replace(/\s/g, '');
  if (t === '') return { weight: 400, italic: false };
  if (t === 'regular') return { weight: 400, italic: false };
  if (t === 'italic') return { weight: 400, italic: true };
  var italic = /italic$/i.test(t);
  if (italic) {
    t = t.replace(/italic$/i, '');
  }
  var w = parseInt(t, 10);
  if (!isNaN(w)) {
    return { weight: w, italic: italic };
  }
  return { weight: 400, italic: false };
}

function formatStateForInsertQuranArabic_(formatState) {
  var out = shallowCopyFormatState_(formatState);
  out.fontName = FALLBACK_FONT;
  out.fontVariant = 'regular';
  out.bold = false;
  out.fontSize = INSERT_QURAN_FONT_SIZE_PT;
  out.textColor = INSERT_QURAN_TEXT_COLOR;
  return out;
}

function formatStateForInsertTranslationEnglish_() {
  return {
    fontName: ENGLISH_TRANSLATION_INSERT_FONT,
    fontVariant: 'regular',
    bold: false,
    fontSize: INSERT_TRANSLATION_FONT_SIZE_PT,
    textColor: INSERT_QURAN_TEXT_COLOR
  };
}

function formatStateForInsertCitationEnglish_() {
  return {
    fontName: ENGLISH_TRANSLATION_INSERT_FONT,
    fontVariant: 'regular',
    bold: false,
    fontSize: INSERT_CITATION_FONT_SIZE_PT,
    textColor: INSERT_QURAN_TEXT_COLOR
  };
}

/**
 * Resolves DocumentApp format state for one beautified insert paragraph.
 * @param {Object} item - insert descriptor with insertTextRole: 'quran' | 'translation' | 'citation'
 * @param {Object|null|undefined} formatState - Sidebar state (ignored for Quran Arabic; Amiri regular is enforced)
 * @return {Object}
 */
function formatStateForBeautifiedInsertParagraph(item, formatState) {
  var role = item && item.insertTextRole;
  if (role === 'translation') {
    return formatStateForInsertTranslationEnglish_();
  }
  if (role === 'citation') {
    return formatStateForInsertCitationEnglish_();
  }
  return formatStateForInsertQuranArabic_(formatState);
}

/**
 * Builds the font family string Google Docs accepts for weighted Google Fonts.
 * @param {string} family
 * @param {number} weight
 * @return {string}
 */
function buildGoogleDocsWeightedFontFamily(family, weight) {
  var f = family || FALLBACK_FONT;
  if (weight == null || weight === 400) {
    return f;
  }
  return f + ';' + weight;
}

/**
 * Converts a Western number to Arabic-Indic numerals.
 * @param {number} num - Western number (e.g. 255)
 * @return {string} Arabic-Indic string (e.g. "٢٥٥")
 */
function toArabicIndic(num) {
  if (num == null || isNaN(num)) return String(num);
  var s = String(Math.floor(num));
  var result = '';
  for (var i = 0; i < s.length; i++) {
    var d = parseInt(s.charAt(i), 10);
    result += (d >= 0 && d <= 9) ? ARABIC_INDIC[d] : s.charAt(i);
  }
  return result;
}

/**
 * Applies format state to a Google Docs Text element.
 * Falls back to Amiri if font fails.
 * @param {GoogleAppsScript.Document.Text} textElement - The text element to format
 * @param {Object} formatState - { fontName, fontVariant, fontSize, bold, textColor }
 * @return {string|null} Warning message if font fallback occurred, null otherwise
 */
function applyFormat(textElement, formatState) {
  if (!textElement || !formatState) return null;

  var fontWarning = null;
  var family = formatState.fontName || FALLBACK_FONT;
  var parsed = parseGoogleFontVariant(formatState.fontVariant != null ? formatState.fontVariant : 'regular');
  var fontSpec = buildGoogleDocsWeightedFontFamily(family, parsed.weight);

  try {
    textElement.setFontFamily(fontSpec);
  } catch (e) {
    textElement.setFontFamily(FALLBACK_FONT);
    fontWarning = 'Font "' + family + '" not available. Using Amiri.';
  }

  try {
    textElement.setItalic(parsed.italic);
  } catch (ignore) {
    // older containers may omit; ignore
  }

  if (formatState.fontSize != null) {
    textElement.setFontSize(formatState.fontSize);
  }

  var boldApply = formatState.bold === true;
  if (boldApply && parsed.weight >= 700) {
    boldApply = false;
  }
  if (formatState.bold != null) {
    textElement.setBold(boldApply);
  }

  if (formatState.textColor) {
    textElement.setForegroundColor(formatState.textColor);
  }

  return fontWarning;
}
