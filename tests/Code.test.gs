/**
 * GAS-native tests for Code.gs (Unified sidebar bridge functions)
 *
 * Run from Apps Script editor: select runCodeTests, click Run.
 * View results in View → Logs.
 *
 * Makes real network requests. No require/Node APIs.
 */

function runCodeTests() {
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

  // ── getAyahForInsert ──────────────────────────────────────────────────────

  results.push('\ngetAyahForInsert()');

  it('returns full ayah data for 2:255 (uthmani)', function () {
    var ayah = getAyahForInsert(2, 255, 'uthmani');
    expect(ayah).toBeTruthy();
    expect(ayah.surah).toBe(2);
    expect(ayah.ayah).toBe(255);
    expect(ayah.arabicText).toBeTruthy();
    expect(ayah.textUthmani).toBeTruthy();
    expect(ayah.textSimple).toBeTruthy();
    expect(ayah.translationText).toBeTruthy();
  });

  it('returns full ayah data for 1:1 (simple)', function () {
    var ayah = getAyahForInsert(1, 1, 'simple');
    expect(ayah).toBeTruthy();
    expect(ayah.surah).toBe(1);
    expect(ayah.ayah).toBe(1);
    expect(ayah.arabicText).toBeTruthy();
  });

  it('returns null for invalid surah', function () {
    var ayah = getAyahForInsert(999, 1, 'uthmani');
    expect(ayah === null).toBe(true);
  });

  it('returns null for invalid ayah', function () {
    var ayah = getAyahForInsert(1, 999, 'uthmani');
    expect(ayah === null).toBe(true);
  });

  it('returns null for missing parameters', function () {
    var ayah = getAyahForInsert(null, null, 'uthmani');
    expect(ayah === null).toBe(true);
  });

  it('defaults to uthmani when style is not provided', function () {
    var ayah = getAyahForInsert(1, 1);
    expect(ayah).toBeTruthy();
    expect(ayah.arabicText).toBeTruthy();
  });

  // ── Summary ────────────────────────────────────────────────────────────────

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');

  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
