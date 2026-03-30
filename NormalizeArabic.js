/**
 * NormalizeArabic.gs
 * Server-side Arabic text normalization for search comparison.
 * Strips tashkeel/diacritics and normalizes alef variants.
 *
 * The client-side counterpart lives in client/normalizeArabic.html.
 * Both implementations MUST stay in sync — parity is enforced by
 * tests/normalizeArabic.test.js.
 */

var TASHKEEL_RANGES = [
  [0x0610, 0x061A], // Arabic signs
  [0x064B, 0x065F], // Fatha, Damma, Kasra, etc.
  [0x0670],         // Superscript alif
  [0x06D6, 0x06DC], // Small high signs
  [0x06DF, 0x06E4], // Small high signs
  [0x06E7, 0x06E8], // Small high Yeh, Hamza
  [0x06EA, 0x06ED]  // Empty centre, etc.
];

/**
 * @param {number} code - Unicode code point
 * @return {boolean} true if the code point is a tashkeel/diacritic
 */
function _isInTashkeelRange(code) {
  for (var r = 0; r < TASHKEEL_RANGES.length; r++) {
    var range = TASHKEEL_RANGES[r];
    if (range.length === 1) {
      if (code === range[0]) return true;
    } else if (code >= range[0] && code <= range[1]) return true;
  }
  return false;
}

/**
 * Normalizes Arabic text for search: strips tashkeel, normalizes alef variants.
 * @param {string} text - Raw Arabic text
 * @return {string}
 */
function normalizeArabic(text) {
  if (!text || typeof text !== 'string') return '';
  var result = '';
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    if (_isInTashkeelRange(code)) continue;
    var ch = text.charAt(i);
    if (ch === '\u0622' || ch === '\u0623' || ch === '\u0625' || ch === '\u0671') ch = '\u0627'; // آ أ إ ٱ → ا
    result += ch;
  }
  return result;
}
