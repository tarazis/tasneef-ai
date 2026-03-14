/**
 * GAS-native tests for TranslationAPI.gs
 *
 * Run from Apps Script editor: select runTranslationAPITests, click Run.
 * View results in View → Logs.
 *
 * Makes real network requests to quranapi.pages.dev. No require/Node APIs.
 */

function runTranslationAPITests() {
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
      toBeTruthy: function () {
        if (!actual) throw new Error('Expected truthy but got ' + JSON.stringify(actual));
      },
      toBeGreaterThan: function (n) {
        if (typeof actual !== 'number' || actual <= n) {
          throw new Error('Expected > ' + n + ' but got ' + JSON.stringify(actual));
        }
      }
    };
  }

  // ── getTranslation ───────────────────────────────────────────────────────

  results.push('\ngetTranslation()');

  it('getTranslation(2, 255, sahih) returns Sahih International translation', function () {
    var text = getTranslation(2, 255, 'sahih');
    expect(text.length).toBeGreaterThan(50);
    expect(text.indexOf('Allah') >= 0 || text.indexOf('god') >= 0).toBe(true);
  });

  it('getTranslation(1, 1, sahih) returns first verse translation', function () {
    var text = getTranslation(1, 1, 'sahih');
    expect(text.length).toBeGreaterThan(10);
  });

  it('getTranslation(999, 1, sahih) returns empty string', function () {
    var text = getTranslation(999, 1, 'sahih');
    expect(text).toBe('');
  });

  // ── getTranslationsBatch ──────────────────────────────────────────────────

  results.push('\ngetTranslationsBatch()');

  it('getTranslationsBatch returns map of surah:ayah -> text', function () {
    var refs = [{ surah: 1, ayah: 1 }, { surah: 2, ayah: 255 }];
    var map = getTranslationsBatch(refs, 'sahih');
    expect(map['1:1']).toBeTruthy();
    expect(map['2:255']).toBeTruthy();
    expect(map['1:1'].length).toBeGreaterThan(10);
  });

  it('getTranslationsBatch returns empty object for empty input', function () {
    var map = getTranslationsBatch([], 'sahih');
    var keys = 0;
    for (var k in map) keys++;
    expect(keys).toBe(0);
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');

  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
