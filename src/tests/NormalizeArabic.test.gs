/**
 * GAS-native tests for NormalizeArabic.gs
 *
 * Run from Apps Script editor: select runNormalizeArabicTests, click Run.
 * View results in View → Logs.
 *
 * No network requests. Tests pure normalization logic only.
 */

function runNormalizeArabicTests() {
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
      }
    };
  }

  // ── normalizeArabic (no network) ─────────────────────────────────────────

  results.push('\nnormalizeArabic()');

  it('strips tashkeel from Arabic text', function () {
    var withTashkeel = 'ٱللَّهُ';
    var norm = normalizeArabic(withTashkeel);
    expect(norm.indexOf('\u064B')).toBe(-1);
    expect(norm.length).toBeGreaterThan(0);
  });

  it('normalizes alef variants to plain alef', function () {
    expect(normalizeArabic('أ')).toBe('ا');
    expect(normalizeArabic('إ')).toBe('ا');
    expect(normalizeArabic('آ')).toBe('ا');
    expect(normalizeArabic('\u0671')).toBe('ا'); // Uthmanic Alif ٱ
  });

  it('returns empty string for empty input', function () {
    expect(normalizeArabic('')).toBe('');
    expect(normalizeArabic(null)).toBe('');
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');

  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
