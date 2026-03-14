/**
 * GAS-native tests for QuranData.gs
 *
 * Run from Apps Script editor: select runQuranDataTests, click Run.
 * View results in View → Logs.
 *
 * Makes real network requests to GitHub Pages. No require/Node APIs.
 */

function runQuranDataTests() {
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
      toContainKey: function (key) {
        if (!actual || !actual[key]) {
          throw new Error('Expected object to have key ' + JSON.stringify(key));
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
  });

  it('returns empty string for empty input', function () {
    expect(normalizeArabic('')).toBe('');
    expect(normalizeArabic(null)).toBe('');
  });

  // ── loadQuranData, getSurahList (network) ──────────────────────────────────

  results.push('\nloadQuranData() / getSurahList()');

  it('loadQuranData returns surahs, uthmani, simple', function () {
    var data = loadQuranData();
    expect(data).toContainKey('surahs');
    expect(data).toContainKey('uthmani');
    expect(data).toContainKey('simple');
  });

  it('getSurahList returns 114 entries', function () {
    var data = loadQuranData();
    var list = getSurahList(data);
    expect(list.length).toBe(114);
  });

  it('getSurahList entries have number, nameArabic, nameEnglish, ayahCount', function () {
    var data = loadQuranData();
    var list = getSurahList(data);
    var first = list[0];
    expect(first.number).toBe(1);
    expect(first.nameArabic).toBe('الفاتحة');
    expect(first.nameEnglish).toBe('Al-Fatihah');
    expect(first.ayahCount).toBe(7);
  });

  // ── getAyah ───────────────────────────────────────────────────────────────

  results.push('\ngetAyah()');

  it('getAyah(2, 255, uthmani) returns Ayat al-Kursi', function () {
    var data = loadQuranData();
    var ayah = getAyah(data, 2, 255, 'uthmani');
    if (!ayah) throw new Error('getAyah returned null');
    expect(ayah.surah).toBe(2);
    expect(ayah.ayah).toBe(255);
    if (!ayah.arabicText || ayah.arabicText.length < 50) {
      throw new Error('Expected non-empty Ayat al-Kursi text');
    }
  });

  it('getAyah returns null for invalid surah', function () {
    var data = loadQuranData();
    var ayah = getAyah(data, 999, 1, 'uthmani');
    expect(ayah === null).toBe(true);
  });

  // ── searchQuran ───────────────────────────────────────────────────────────

  results.push('\nsearchQuran()');

  it('searchQuran("الكرسي", uthmani) returns results including 2:255', function () {
    var data = loadQuranData();
    var hits = searchQuran(data, 'الكرسي', 'uthmani');
    var found = false;
    for (var i = 0; i < hits.length; i++) {
      if (hits[i].surah === 2 && hits[i].ayah === 255) { found = true; break; }
    }
    if (!found) throw new Error('Expected 2:255 in results, got ' + hits.length + ' hits');
  });

  it('searchQuran("mercy", simple) returns no results (Arabic only)', function () {
    var data = loadQuranData();
    var hits = searchQuran(data, 'mercy', 'simple');
    expect(hits.length).toBe(0);
  });

  it('searchQuran caps at 50 results', function () {
    var data = loadQuranData();
    var hits = searchQuran(data, 'و', 'uthmani');
    if (hits.length > 50) throw new Error('Expected max 50 results, got ' + hits.length);
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');

  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
