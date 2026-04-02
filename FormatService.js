/**
 * FormatService.gs
 * Applies formatting to Google Docs text elements.
 * Font fallback to Amiri with toast on failure.
 * Weighted Google Fonts use setFontFamily("Family;WEIGHT") with setItalic for italic tokens.
 */

var ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
var FALLBACK_FONT = 'Amiri';

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
