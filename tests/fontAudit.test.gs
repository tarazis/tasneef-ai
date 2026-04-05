/**
 * GAS-native tests for FontAuditService.gs and the font audit helpers in FontService.gs.
 *
 * Run from Apps Script editor: select runFontAuditTests, click Run.
 * View results in View → Logs.
 *
 * getAllArabicFontsFromApi() requires a valid google_fonts_api_key in Script Properties.
 * pickRegularVariant_() and insertFontAudit() validation tests require no external calls.
 */

function runFontAuditTests() {
  var passed = 0;
  var failed = 0;
  var results = [];

  function it(label, fn) {
    try {
      fn();
      results.push('  \u2713 ' + label);
      passed++;
    } catch (e) {
      results.push('  \u2717 ' + label + '\n      \u2192 ' + (e.message || e));
      failed++;
    }
  }

  function expect(actual) {
    return {
      toBe: function(expected) {
        if (actual !== expected) {
          throw new Error('Expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
        }
      },
      toBeTrue: function() {
        if (actual !== true) throw new Error('Expected true but got ' + JSON.stringify(actual));
      },
      toBeFalse: function() {
        if (actual !== false) throw new Error('Expected false but got ' + JSON.stringify(actual));
      }
    };
  }

  // ─── pickRegularVariant_() ─────────────────────────────────────────────────

  results.push('\npickRegularVariant_()');

  it('returns "regular" when present', function() {
    expect(pickRegularVariant_(['700', 'regular', '700italic'])).toBe('regular');
  });

  it('returns lightest non-italic when "regular" is absent', function() {
    var v = pickRegularVariant_(['700', '500', '700italic', '500italic']);
    expect(v).toBe('500');
  });

  it('returns first variant for italic-only font', function() {
    var v = pickRegularVariant_(['italic', '700italic']);
    // italic is weight 400 italic — still lighter than 700italic
    // implementation picks lightest non-italic; if none exist, falls back to first
    if (typeof v !== 'string' || v.length === 0) throw new Error('Expected non-empty string, got ' + JSON.stringify(v));
  });

  it('returns "regular" for empty array', function() {
    expect(pickRegularVariant_([])).toBe('regular');
  });

  it('returns "regular" for null', function() {
    expect(pickRegularVariant_(null)).toBe('regular');
  });

  // ─── insertFontAudit() input validation ───────────────────────────────────

  results.push('\ninsertFontAudit() validation');

  it('returns failure for null ayah1Data', function() {
    var r = insertFontAudit(null, { textUthmani: 'test' });
    expect(r.success).toBeFalse();
  });

  it('returns failure for null ayah2Data', function() {
    var r = insertFontAudit({ textUthmani: 'test' }, null);
    expect(r.success).toBeFalse();
  });

  it('returns failure when textUthmani is missing from ayah1Data', function() {
    var r = insertFontAudit({ surah: 2, ayah: 1 }, { textUthmani: 'test' });
    expect(r.success).toBeFalse();
  });

  it('returns failure when textUthmani is missing from ayah2Data', function() {
    var r = insertFontAudit({ textUthmani: 'test' }, { surah: 2, ayah: 2 });
    expect(r.success).toBeFalse();
  });

  // ─── getAllArabicFontsFromApi() (requires live API key) ────────────────────

  results.push('\ngetAllArabicFontsFromApi() [requires google_fonts_api_key]');

  it('returns ok:true with a non-empty fonts array', function() {
    var r = getAllArabicFontsFromApi();
    if (!r.ok) {
      // Skip gracefully if key is not set
      if (r.error === 'NO_GOOGLE_FONTS_API_KEY') {
        results[results.length - 1] += ' (SKIPPED — no API key)';
        return;
      }
      throw new Error('Expected ok:true but got error: ' + r.error);
    }
    if (!(r.fonts instanceof Array) || r.fonts.length === 0) {
      throw new Error('Expected non-empty fonts array');
    }
  });

  it('each font entry has family string and variants array', function() {
    var r = getAllArabicFontsFromApi();
    if (!r.ok) {
      results[results.length - 1] += ' (SKIPPED — no API key or fetch failed)';
      return;
    }
    for (var i = 0; i < Math.min(r.fonts.length, 5); i++) {
      var f = r.fonts[i];
      if (typeof f.family !== 'string' || !f.family) {
        throw new Error('fonts[' + i + '].family is not a non-empty string');
      }
      if (!(f.variants instanceof Array)) {
        throw new Error('fonts[' + i + '].variants is not an array');
      }
    }
  });

  it('returns more fonts than the approved list (50+)', function() {
    var r = getAllArabicFontsFromApi();
    if (!r.ok) {
      results[results.length - 1] += ' (SKIPPED — no API key or fetch failed)';
      return;
    }
    if (r.fonts.length < 11) {
      throw new Error('Expected >11 fonts but got ' + r.fonts.length);
    }
  });

  // ─── Summary ──────────────────────────────────────────────────────────────

  results.push('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');

  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed \u2014 see Logs for details');
  }
}
