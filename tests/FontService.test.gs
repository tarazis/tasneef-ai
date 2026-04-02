/**
 * GAS-native tests for FontService.gs
 *
 * Run from Apps Script editor: select runFontServiceTests, click Run.
 * View results in View → Logs.
 *
 * Fetches from tasneef-data/quran/quran-fonts.json (no API key, no ScriptCache).
 * Update EXPECTED_APPROVED_FONTS_SORTED when hosted approved_fonts changes.
 * No require/Node APIs.
 */

/** Sorted copy of tasneef-data/quran/quran-fonts.json approved_fonts */
var EXPECTED_APPROVED_FONTS_SORTED = [
  'Amiri',
  'Harmattan',
  'IBM Plex Sans Arabic',
  'Lateef',
  'Mada',
  'Noto Kufi Arabic',
  'Noto Naskh Arabic',
  'Noto Sans Arabic',
  'Reem Kufi Ink',
  'Scheherazade New',
  'Tajawal'
];

function runFontServiceTests() {
  var passed = 0;
  var failed = 0;
  var results = [];

  function it(label, fn) {
    try {
      fn();
      results.push('  ✓ ' + label);
      passed++;
    } catch (e) {
      results.push('  ✗ ' + label + '\n      → ' + (e.message || e));
      failed++;
    }
  }

  function expect(actual) {
    return {
      toBe: function (expected) {
        if (actual !== expected) {
          throw new Error('Expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
        }
      }
    };
  }

  function expectArraysEqual(a, b) {
    if (!a || !b || a.length !== b.length) {
      throw new Error('Expected equal length arrays, got ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
    }
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        throw new Error('Mismatch at ' + i + ': ' + JSON.stringify(a[i]) + ' vs ' + JSON.stringify(b[i]));
      }
    }
  }

  results.push('\nparseGoogleFontVariant()');

  it('regular is weight 400 not italic', function () {
    var p = parseGoogleFontVariant('regular');
    if (p.weight !== 400 || p.italic !== false) throw new Error(JSON.stringify(p));
  });

  it('700italic is weight 700 italic', function () {
    var p = parseGoogleFontVariant('700italic');
    if (p.weight !== 700 || p.italic !== true) throw new Error(JSON.stringify(p));
  });

  results.push('\ngetCuratedFontCatalog()');

  it('getCuratedFontCatalog returns ok boolean and catalog array', function () {
    var cur = getCuratedFontCatalog();
    if (typeof cur.ok !== 'boolean') throw new Error('missing ok');
    if (!(cur.catalog instanceof Array)) throw new Error('catalog must be array');
  });

  results.push('\ngetArabicFonts()');

  it('returns an array', function () {
    var fonts = getArabicFonts();
    if (!(fonts instanceof Array)) throw new Error('Expected array');
  });

  it('matches sorted curated list from quran-fonts.json', function () {
    var fonts = getArabicFonts();
    expectArraysEqual(fonts, EXPECTED_APPROVED_FONTS_SORTED);
  });

  it('FALLBACK_FONT constant equals Amiri', function () {
    expect(FALLBACK_FONT).toBe('Amiri');
  });

  it('FALLBACK_APPROVED_FONTS matches expected curated set (unsorted ok)', function () {
    var sorted = FALLBACK_APPROVED_FONTS.slice().sort(function (a, b) {
      return a.localeCompare(b, 'en');
    });
    expectArraysEqual(sorted, EXPECTED_APPROVED_FONTS_SORTED);
  });

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');

  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
