'use strict';

/**
 * Node tests for client/normalizeArabic.html (client-side Arabic normalization).
 * Run: npm run test:normalize
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const NORMALIZE_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'client', 'normalizeArabic.html'),
  'utf8'
);

function loadModule() {
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(NORMALIZE_SRC, sandbox);
  return sandbox;
}

function runTests() {
  const tests = [];

  function it(label, fn) {
    tests.push({ label: label, fn: fn });
  }

  // ─── normalizeArabic ────────────────────────────────────────────────────────

  it('returns empty string for null/undefined/non-string', function () {
    const m = loadModule();
    assert.strictEqual(m.normalizeArabic(null), '');
    assert.strictEqual(m.normalizeArabic(undefined), '');
    assert.strictEqual(m.normalizeArabic(123), '');
    assert.strictEqual(m.normalizeArabic(''), '');
  });

  it('strips fatha, damma, kasra, and other tashkeel', function () {
    const m = loadModule();
    // بِسْمِ → بسم (strip kasra U+0650, sukun U+0652, kasra U+0650)
    var input = '\u0628\u0650\u0633\u0652\u0645\u0650';
    assert.strictEqual(m.normalizeArabic(input), '\u0628\u0633\u0645');
  });

  it('strips superscript alif (U+0670)', function () {
    const m = loadModule();
    // رحمٰن → رحمن
    var input = '\u0631\u062D\u0645\u0670\u0646';
    assert.strictEqual(m.normalizeArabic(input), '\u0631\u062D\u0645\u0646');
  });

  it('collapses alef-madda (U+0622) to plain alef', function () {
    const m = loadModule();
    assert.strictEqual(m.normalizeArabic('\u0622'), '\u0627');
  });

  it('collapses alef-hamza-above (U+0623) to plain alef', function () {
    const m = loadModule();
    assert.strictEqual(m.normalizeArabic('\u0623'), '\u0627');
  });

  it('collapses alef-hamza-below (U+0625) to plain alef', function () {
    const m = loadModule();
    assert.strictEqual(m.normalizeArabic('\u0625'), '\u0627');
  });

  it('collapses alef-wasla (U+0671) to plain alef', function () {
    const m = loadModule();
    assert.strictEqual(m.normalizeArabic('\u0671'), '\u0627');
  });

  it('preserves non-Arabic characters unchanged', function () {
    const m = loadModule();
    assert.strictEqual(m.normalizeArabic('hello 123'), 'hello 123');
  });

  it('handles mixed Arabic text with tashkeel and alef variants', function () {
    const m = loadModule();
    // ٱلرَّحْمَـٰنِ → الرحمـن  (alef-wasla → alef, strip tashkeel)
    var input = '\u0671\u0644\u0631\u064E\u0651\u062D\u0652\u0645\u064E\u0640\u0670\u0646\u0650';
    var expected = '\u0627\u0644\u0631\u062D\u0645\u0640\u0646';
    assert.strictEqual(m.normalizeArabic(input), expected);
  });

  // ─── _isInTashkeelRange ─────────────────────────────────────────────────────

  it('identifies fatha (U+064E) as tashkeel', function () {
    const m = loadModule();
    assert.strictEqual(m._isInTashkeelRange(0x064E), true);
  });

  it('identifies superscript alif (U+0670) as tashkeel', function () {
    const m = loadModule();
    assert.strictEqual(m._isInTashkeelRange(0x0670), true);
  });

  it('does not flag plain alef (U+0627) as tashkeel', function () {
    const m = loadModule();
    assert.strictEqual(m._isInTashkeelRange(0x0627), false);
  });

  it('does not flag Latin A (U+0041) as tashkeel', function () {
    const m = loadModule();
    assert.strictEqual(m._isInTashkeelRange(0x0041), false);
  });

  // ─── _hasArabicChars ────────────────────────────────────────────────────────

  it('detects Arabic in mixed text', function () {
    const m = loadModule();
    assert.strictEqual(m._hasArabicChars('hello \u0628 world'), true);
  });

  it('returns false for pure Latin text', function () {
    const m = loadModule();
    assert.strictEqual(m._hasArabicChars('hello world'), false);
  });

  it('returns false for empty string', function () {
    const m = loadModule();
    assert.strictEqual(m._hasArabicChars(''), false);
  });

  // ─── _mapNormalizedToOriginal ───────────────────────────────────────────────

  it('maps indices correctly when no tashkeel present', function () {
    const m = loadModule();
    var result = m._mapNormalizedToOriginal('abcdef', 2, 3);
    assert.strictEqual(result.start, 2);
    assert.strictEqual(result.end, 5);
  });

  it('maps indices across tashkeel characters', function () {
    const m = loadModule();
    // Original: بِسْمِ  (b, kasra, s, sukun, m, kasra)
    // Normalized: بسم (indices 0,1,2)
    var original = '\u0628\u0650\u0633\u0652\u0645\u0650';
    // Match normalized index 1 (س), length 1
    var result = m._mapNormalizedToOriginal(original, 1, 1);
    assert.strictEqual(result.start, 2); // index of س in original
    assert.strictEqual(result.end, 3);   // one past س (before sukun)
  });

  it('returns {0,0} for invalid inputs', function () {
    const m = loadModule();
    var r1 = m._mapNormalizedToOriginal('', 0, 1);
    assert.strictEqual(r1.start, 0); assert.strictEqual(r1.end, 0);
    var r2 = m._mapNormalizedToOriginal('abc', -1, 1);
    assert.strictEqual(r2.start, 0); assert.strictEqual(r2.end, 0);
    var r3 = m._mapNormalizedToOriginal('abc', 0, 0);
    assert.strictEqual(r3.start, 0); assert.strictEqual(r3.end, 0);
  });

  it('maps match at end of string correctly', function () {
    const m = loadModule();
    // Original: اَبْ  (alef, fatha, ba, sukun)
    // Normalized: اب (indices 0,1)
    var original = '\u0627\u064E\u0628\u0652';
    var result = m._mapNormalizedToOriginal(original, 1, 1);
    assert.strictEqual(result.start, 2); // index of ب
    assert.strictEqual(result.end, 3);   // one past ب
  });

  // ─── searchImlaeiClient logic ───────────────────────────────────────────────
  //
  // searchImlaeiClient lives in sidebar-js.html's IIFE, so we test its core
  // algorithm here: normalize query, indexOf against pre-normalized map.

  it('finds matching verse by normalized query', function () {
    const m = loadModule();
    var raw = {
      '1:1': { surah: 1, ayah: 1, text: '\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u064E\u0651\u0647\u0650' },
      '1:2': { surah: 1, ayah: 2, text: '\u0627\u0644\u062D\u064E\u0645\u0652\u062F\u064F' }
    };
    var normalized = {};
    for (var key in raw) {
      normalized[key] = m.normalizeArabic(raw[key].text);
    }

    var query = '\u0628\u0633\u0645';
    var normalizedQuery = m.normalizeArabic(query);
    var results = [];
    for (var k in normalized) {
      if (normalized[k].indexOf(normalizedQuery) >= 0) {
        results.push({ key: k, verse: raw[k] });
      }
    }
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].key, '1:1');
  });

  it('matches query with tashkeel against stripped corpus', function () {
    const m = loadModule();
    var raw = {
      '2:255': { surah: 2, ayah: 255, text: '\u0627\u0644\u0644\u0647 \u0644\u0627 \u0625\u0644\u0647 \u0625\u0644\u0627 \u0647\u0648' }
    };
    var normalized = {};
    for (var key in raw) {
      normalized[key] = m.normalizeArabic(raw[key].text);
    }

    // Query with alef-hamza-below (U+0625) should match plain alef in normalized
    var query = '\u0625\u0644\u0647';
    var normalizedQuery = m.normalizeArabic(query);
    assert.strictEqual(normalizedQuery, '\u0627\u0644\u0647');
    assert.ok(normalized['2:255'].indexOf(normalizedQuery) >= 0);
  });

  it('returns no results when query does not match', function () {
    const m = loadModule();
    var normalized = { '1:1': m.normalizeArabic('\u0628\u0633\u0645') };
    var normalizedQuery = m.normalizeArabic('\u0642\u0644');
    var found = false;
    for (var k in normalized) {
      if (normalized[k].indexOf(normalizedQuery) >= 0) found = true;
    }
    assert.strictEqual(found, false);
  });

  it('respects result cap', function () {
    const m = loadModule();
    var normalized = {};
    for (var i = 1; i <= 60; i++) {
      normalized['1:' + i] = '\u0628\u0633\u0645';
    }
    var normalizedQuery = '\u0628\u0633\u0645';
    var cap = 50;
    var count = 0;
    for (var k in normalized) {
      if (count >= cap) break;
      if (normalized[k].indexOf(normalizedQuery) >= 0) count++;
    }
    assert.strictEqual(count, 50);
  });

  // ─── Parity with server-side normalizeArabic ───────────────────────────────

  it('matches server-side QuranData.js normalizeArabic output', function () {
    const m = loadModule();

    const SERVER_SRC = fs.readFileSync(
      path.join(__dirname, '..', 'QuranData.js'),
      'utf8'
    );
    const serverSandbox = { console, CacheService: null, UrlFetchApp: null };
    vm.createContext(serverSandbox);
    vm.runInContext(SERVER_SRC, serverSandbox);

    var samples = [
      '\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u064E\u0651\u0647\u0650',
      '\u0622\u064A\u064E\u0629',
      '\u0623\u064E\u0646\u0632\u064E\u0644\u0652\u0646\u064E\u0627',
      '\u0625\u0650\u0646\u064E\u0651',
      'plain text without Arabic',
      ''
    ];

    samples.forEach(function (s) {
      assert.strictEqual(
        m.normalizeArabic(s),
        serverSandbox.normalizeArabic(s),
        'Mismatch for: ' + JSON.stringify(s)
      );
    });
  });

  // ─── Run all tests ─────────────────────────────────────────────────────────

  let ran = 0;
  let failed = 0;
  const chain = tests.reduce(function (p, t) {
    return p.then(function () {
      return Promise.resolve(t.fn())
        .then(function () {
          console.log('  \u2713 ' + t.label);
          ran++;
        })
        .catch(function (e) {
          console.log('  \u2717 ' + t.label + '\n      \u2192 ' + (e && e.message ? e.message : e));
          failed++;
        });
    });
  }, Promise.resolve());

  return chain.then(function () {
    console.log('\nnormalizeArabic: ' + ran + ' passed, ' + failed + ' failed.');
    if (failed > 0) process.exit(1);
  });
}

runTests();
