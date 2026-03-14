/**
 * GAS-native tests for Code.gs (Search tab server functions)
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
      },
      toContainKey: function (key) {
        if (!actual || !actual[key]) {
          throw new Error('Expected object to have key ' + JSON.stringify(key));
        }
      }
    };
  }

  // ── runSearchExact ────────────────────────────────────────────────────────

  results.push('\nrunSearchExact()');

  it('runSearchExact("الكرسي", simple) returns results including 2:255', function () {
    var hits = runSearchExact('الكرسي', 'simple');
    var found = false;
    for (var i = 0; i < hits.length; i++) {
      if (hits[i].surah === 2 && hits[i].ayah === 255) {
        found = true;
        break;
      }
    }
    if (!found) throw new Error('Expected 2:255 in results, got ' + hits.length + ' hits');
  });

  it('runSearchExact results have matchStart and matchEnd for highlighting', function () {
    var hits = runSearchExact('الكرسي', 'simple');
    var hit255 = null;
    for (var i = 0; i < hits.length; i++) {
      if (hits[i].surah === 2 && hits[i].ayah === 255) {
        hit255 = hits[i];
        break;
      }
    }
    if (!hit255) throw new Error('2:255 not in results');
    expect(hit255.matchStart).toBeGreaterThan(-1);
    expect(hit255.matchEnd).toBeGreaterThan(hit255.matchStart);
    var snippet = hit255.arabicText.substring(hit255.matchStart, hit255.matchEnd);
    if (snippet.indexOf('الكرسي') < 0 && snippet.indexOf('كُرْسِي') < 0) {
      throw new Error('matchStart/matchEnd should span the matched term');
    }
  });

  it('runSearchExact returns empty array for empty query', function () {
    var hits = runSearchExact('', 'simple');
    expect(hits.length).toBe(0);
  });

  it('runSearchExact("الحمد لله رب العالمين", simple) returns Al-Fatihah 1:1', function () {
    var hits = runSearchExact('الحمد لله رب العالمين', 'simple');
    var found = false;
    for (var i = 0; i < hits.length; i++) {
      if (hits[i].surah === 1 && hits[i].ayah === 1) {
        found = true;
        break;
      }
    }
    if (!found) throw new Error('Expected 1:1 in results, got ' + hits.length + ' hits');
  });

  // ── getAyahForSearchInsert ──────────────────────────────────────────────────

  results.push('\ngetAyahForSearchInsert()');

  it('getAyahForSearchInsert(2, 255, sahih) returns full ayah with translation', function () {
    var ayah = getAyahForSearchInsert(2, 255, 'sahih');
    expect(ayah).toBeTruthy();
    expect(ayah.surah).toBe(2);
    expect(ayah.ayah).toBe(255);
    expect(ayah.textUthmani).toBeTruthy();
    expect(ayah.textSimple).toBeTruthy();
    expect(ayah.textUthmani.length).toBeGreaterThan(50);
    expect(ayah.translationText.length).toBeGreaterThan(20);
  });

  it('getAyahForSearchInsert returns null for invalid surah', function () {
    var ayah = getAyahForSearchInsert(999, 1, 'sahih');
    expect(ayah === null).toBe(true);
  });

  // ── Summary ────────────────────────────────────────────────────────────────

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');

  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
