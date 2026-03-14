/**
 * GAS-native tests for FontService.gs
 *
 * Run from Apps Script editor: select runFontServiceTests, click Run.
 * View results in View → Logs.
 *
 * Without Google Fonts API key set: returns [Amiri]. With key: fetches and filters.
 * No require/Node APIs.
 */

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
      },
      toBeGreaterThan: function (n) {
        if (typeof actual !== 'number' || actual <= n) {
          throw new Error('Expected > ' + n + ' but got ' + JSON.stringify(actual));
        }
      },
      toContain: function (item) {
        if (actual.indexOf(item) < 0) {
          throw new Error('Expected array to contain ' + JSON.stringify(item));
        }
      }
    };
  }

  results.push('\ngetArabicFonts()');

  it('returns an array', function () {
    var fonts = getArabicFonts();
    if (!(fonts instanceof Array)) throw new Error('Expected array');
  });

  it('returns at least one font (Amiri fallback when no API key)', function () {
    var fonts = getArabicFonts();
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts).toContain('Amiri');
  });

  it('excludes all BAD_FONTS from the list', function () {
    var fonts = getArabicFonts();
    var bad = ['Blaka', 'Cairo', 'Rubik', 'Markazi Text', 'Reem Kufi Fun'];
    for (var i = 0; i < bad.length; i++) {
      if (fonts.indexOf(bad[i]) >= 0) {
        throw new Error('BAD_FONT ' + bad[i] + ' should not be in list');
      }
    }
  });

  it('returns list sorted alphabetically', function () {
    var fonts = getArabicFonts();
    for (var j = 1; j < fonts.length; j++) {
      if (fonts[j].localeCompare(fonts[j - 1], 'en') < 0) {
        throw new Error('List not sorted: ' + fonts[j - 1] + ' before ' + fonts[j]);
      }
    }
  });

  it('FALLBACK_FONT constant equals Amiri', function () {
    expect(FALLBACK_FONT).toBe('Amiri');
  });

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');

  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
