/**
 * GAS-native tests for QuranAPI.gs
 *
 * Run from Apps Script editor: select runQuranAPITests, click Run.
 * View results in View → Logs.
 *
 * Makes real network requests to quranapi.pages.dev. No require/Node APIs.
 */

function runQuranAPITests() {
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

  // ── getSurahListFromQuranApi ───────────────────────────────────────────────

  results.push('\ngetSurahListFromQuranApi()');

  it('getSurahListFromQuranApi returns 114 surahs', function () {
    var list = getSurahListFromQuranApi();
    expect(list.length).toBe(114);
  });

  it('getSurahListFromQuranApi first surah has correct structure', function () {
    var list = getSurahListFromQuranApi();
    expect(list.length).toBeGreaterThan(0);
    var s = list[0];
    expect(s.number).toBe(1);
    expect(s.nameArabic).toBeTruthy();
    expect(s.nameEnglish).toBeTruthy();
    expect(s.ayahCount).toBe(7);
  });

  it('getSurahListFromQuranApi surah 2 has 286 ayat', function () {
    var list = getSurahListFromQuranApi();
    var s2 = list[1];
    expect(s2.number).toBe(2);
    expect(s2.ayahCount).toBe(286);
  });

  // ── getAyahFromQuranApi ────────────────────────────────────────────────────

  results.push('\ngetAyahFromQuranApi()');

  it('getAyahFromQuranApi(1, 2, uthmani) returns Arabic + translation', function () {
    var ayah = getAyahFromQuranApi(1, 2, 'uthmani');
    expect(ayah).toBeTruthy();
    expect(ayah.arabicText).toBeTruthy();
    expect(ayah.textUthmani).toBeTruthy();
    expect(ayah.textSimple).toBeTruthy();
    expect(ayah.translationText).toBeTruthy();
    expect(ayah.translationText.indexOf('Allah') >= 0 || ayah.translationText.indexOf('praise') >= 0).toBe(true);
  });

  it('getAyahFromQuranApi(2, 255, simple) returns Ayat al-Kursi', function () {
    var ayah = getAyahFromQuranApi(2, 255, 'simple');
    expect(ayah).toBeTruthy();
    expect(ayah.surah).toBe(2);
    expect(ayah.ayah).toBe(255);
    expect(ayah.arabicText).toBeTruthy();
    expect(ayah.translationText).toBeTruthy();
  });

  it('getAyahFromQuranApi(999, 1) returns null', function () {
    var ayah = getAyahFromQuranApi(999, 1, 'uthmani');
    expect(ayah).toBe(null);
  });

  it('getAyahFromQuranApi(1, 0) returns null', function () {
    var ayah = getAyahFromQuranApi(1, 0, 'uthmani');
    expect(ayah).toBe(null);
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');

  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
