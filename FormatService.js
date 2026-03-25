/**
 * FormatService.gs
 * Applies formatting to Google Docs text elements.
 * Font fallback to Amiri with toast on failure.
 */

var ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
var FALLBACK_FONT = 'Amiri';

/**
 * Converts a Western number to Arabic-Indic numerals.
 * @param {number} num - Western number (e.g., 255)
 * @return {string} Arabic-Indic string (e.g., "٢٥٥")
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
 * @param {Object} formatState - { fontName, fontSize, bold, textColor }
 * @return {string|null} Warning message if font fallback occurred, null otherwise
 */
function applyFormat(textElement, formatState) {
  if (!textElement || !formatState) return null;

  var fontWarning = null;
  var fontName = formatState.fontName || FALLBACK_FONT;
  try {
    textElement.setFontFamily(fontName);
  } catch (e) {
    textElement.setFontFamily(FALLBACK_FONT);
    fontWarning = 'Font "' + fontName + '" not available. Using Amiri.';
  }

  if (formatState.fontSize != null) {
    textElement.setFontSize(formatState.fontSize);
  }
  if (formatState.bold != null) {
    textElement.setBold(formatState.bold);
  }
  if (formatState.textColor) {
    textElement.setForegroundColor(formatState.textColor);
  }

  return fontWarning;
}
