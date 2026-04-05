/**
 * FontAuditService.gs
 * TEMP dev tool — inserts the first two ayahs of Al-Baqara (2:1, 2:2) once per
 * Arabic font available in the Google Fonts API, each preceded by a label paragraph.
 * This file is NOT for merge; the branch will be discarded after font curation.
 */

/**
 * Inserts a font audit block into the active document.
 * For each Arabic font in the Google Fonts API, appends:
 *   1. A label paragraph: "── Family Name ──" (Normal, LTR, no Arabic font)
 *   2. Ayah 2:1 paragraph (RTL, CENTER, 18pt, that font)
 *   3. Ayah 2:2 paragraph (RTL, CENTER, 18pt, that font)
 * Finishes with a cleanup paragraph.
 *
 * @param {Object} ayah1Data - { textUthmani, surahNameArabic, surahNameEnglish, surah, ayah }
 * @param {Object} ayah2Data - { textUthmani, surahNameArabic, surahNameEnglish, surah, ayah }
 * @return {{ success: boolean, fontsInserted: number, message: string }}
 */
function insertFontAudit(ayah1Data, ayah2Data) {
  if (!ayah1Data || !ayah1Data.textUthmani || !ayah2Data || !ayah2Data.textUthmani) {
    return { success: false, fontsInserted: 0, message: 'Invalid ayah data.' };
  }

  var fontsResult = getAllArabicFontsFromApi();
  if (!fontsResult.ok) {
    return { success: false, fontsInserted: 0, message: fontsResult.error || 'Failed to fetch fonts.' };
  }

  var fonts = fontsResult.fonts;
  if (!fonts.length) {
    return { success: false, fontsInserted: 0, message: 'No fonts returned from Google Fonts API.' };
  }

  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();

  var text1 = '\uFD3F ' + ayah1Data.textUthmani + ' \uFD3E';
  var text2 = '\uFD3F ' + ayah2Data.textUthmani + ' \uFD3E';

  for (var i = 0; i < fonts.length; i++) {
    var family = fonts[i].family;
    var variant = pickRegularVariant_(fonts[i].variants);
    var fs = { fontName: family, fontVariant: variant, fontSize: 18, bold: false, textColor: '#000000' };

    // Label paragraph — intentionally no Arabic font so it stays legible
    var label = body.appendParagraph('\u2500\u2500 ' + family + ' \u2500\u2500');
    label.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
    label.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    label.setLeftToRight(true);

    // Ayah 2:1
    var p1 = body.appendParagraph(text1);
    p1.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    p1.setLeftToRight(false);
    applyFormat(p1.editAsText(), fs);

    // Ayah 2:2
    var p2 = body.appendParagraph(text2);
    p2.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    p2.setLeftToRight(false);
    applyFormat(p2.editAsText(), fs);
  }

  // Cleanup paragraph
  var cleanup = body.appendParagraph('');
  cleanup.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  cleanup.setLeftToRight(true);

  try {
    doc.setCursor(doc.newPosition(cleanup, 0));
  } catch (e) {
    // Non-UI context; ignore
  }

  return { success: true, fontsInserted: fonts.length, message: 'Inserted ' + fonts.length + ' fonts.' };
}
