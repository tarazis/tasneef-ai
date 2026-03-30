'use strict';

/**
 * Node tests for _buildResultCardHtml (sidebar result-card builder).
 * Tests the shared helper that both exact search and AI search tabs use.
 * Run: npm run test:card
 */

const assert = require('assert');

var _ARABIC_INDIC = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];

function toArabicIndicClient(num) {
  return String(Math.floor(Number(num) || 0)).replace(/[0-9]/g, function(d) {
    return _ARABIC_INDIC[+d];
  });
}

function escapeHtml(s) {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _buildResultCardHtml(r, font) {
  var arabicRef = escapeHtml(r.surahNameArabic || '') + ' ' + toArabicIndicClient(r.ayah);
  var englishRef = escapeHtml((r.surahNameEnglish || 'Surah') + ' ' + r.surah + ':' + r.ayah);
  var arabicHtml = escapeHtml(r.arabicText);

  if (r.matchStart != null && r.matchEnd != null && r.matchEnd > r.matchStart) {
    var before = escapeHtml(r.arabicText.substring(0, r.matchStart));
    var match  = escapeHtml(r.arabicText.substring(r.matchStart, r.matchEnd));
    var after  = escapeHtml(r.arabicText.substring(r.matchEnd));
    arabicHtml = before + '<mark>' + match + '</mark>' + after;
  }

  return '<div class="ref-arabic">' + arabicRef + '</div>' +
    '<div class="arabic" style="font-family:' + escapeHtml(font) + ',serif">' + arabicHtml + '</div>' +
    '<div class="ref-english">' + englishRef + '</div>' +
    '<button type="button" class="btn-primary btn-insert-result" ' +
      'data-surah="' + r.surah + '" data-ayah="' + r.ayah + '">Insert</button>';
}

function runTests() {
  var tests = [];

  function it(label, fn) {
    tests.push({ label: label, fn: fn });
  }

  // ─── Highlighting ──────────────────────────────────────────────────────────

  it('wraps matched substring in <mark> when matchStart/matchEnd present', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة',
      surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله الرحمن الرحيم',
      matchStart: 0, matchEnd: 3
    };
    var html = _buildResultCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('<mark>بسم</mark>') >= 0, 'matched text should be wrapped in <mark>');
    assert.ok(html.indexOf(' الله الرحمن الرحيم') >= 0, 'rest of text should follow');
  });

  it('highlights match in the middle of the text', function () {
    var r = {
      surah: 2, ayah: 255,
      surahNameArabic: 'البقرة',
      surahNameEnglish: 'Al-Baqarah',
      arabicText: 'الله لا اله الا هو',
      matchStart: 5, matchEnd: 7
    };
    var html = _buildResultCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('<mark>لا</mark>') >= 0, 'middle match should be highlighted');
  });

  it('highlights match at end of text', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة',
      surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله',
      matchStart: 4, matchEnd: 8
    };
    var html = _buildResultCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('<mark>الله</mark>') >= 0, 'match at end should be highlighted');
  });

  // ─── No highlighting ──────────────────────────────────────────────────────

  it('does not produce <mark> when matchStart/matchEnd are absent', function () {
    var r = {
      surah: 1, ayah: 2,
      surahNameArabic: 'الفاتحة',
      surahNameEnglish: 'Al-Fatihah',
      arabicText: 'الحمد لله رب العالمين'
    };
    var html = _buildResultCardHtml(r, 'Amiri');
    assert.strictEqual(html.indexOf('<mark>'), -1, 'no <mark> without match data');
  });

  it('does not produce <mark> when matchStart/matchEnd are null', function () {
    var r = {
      surah: 1, ayah: 2,
      surahNameArabic: 'الفاتحة',
      surahNameEnglish: 'Al-Fatihah',
      arabicText: 'الحمد لله رب العالمين',
      matchStart: null, matchEnd: null
    };
    var html = _buildResultCardHtml(r, 'Amiri');
    assert.strictEqual(html.indexOf('<mark>'), -1, 'no <mark> with null match data');
  });

  it('does not produce <mark> when matchEnd <= matchStart', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة',
      surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله',
      matchStart: 3, matchEnd: 3
    };
    var html = _buildResultCardHtml(r, 'Amiri');
    assert.strictEqual(html.indexOf('<mark>'), -1, 'no <mark> when matchEnd equals matchStart');
  });

  // ─── No translation ───────────────────────────────────────────────────────

  it('never renders a translation row even when translationText is present', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة',
      surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله الرحمن الرحيم',
      translationText: 'In the name of Allah, the Most Gracious, the Most Merciful'
    };
    var html = _buildResultCardHtml(r, 'Amiri');
    assert.strictEqual(html.indexOf('translation'), -1, 'no translation class in output');
    assert.strictEqual(html.indexOf('Most Gracious'), -1, 'translation text not rendered');
  });

  // ─── Card structure ────────────────────────────────────────────────────────

  it('includes Arabic reference with Arabic-Indic ayah number', function () {
    var r = {
      surah: 2, ayah: 255,
      surahNameArabic: 'البقرة',
      surahNameEnglish: 'Al-Baqarah',
      arabicText: 'الله لا اله الا هو'
    };
    var html = _buildResultCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('البقرة ٢٥٥') >= 0, 'Arabic ref with Indic digits');
  });

  it('includes English reference with Western numerals', function () {
    var r = {
      surah: 2, ayah: 255,
      surahNameArabic: 'البقرة',
      surahNameEnglish: 'Al-Baqarah',
      arabicText: 'الله لا اله الا هو'
    };
    var html = _buildResultCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('Al-Baqarah 2:255') >= 0, 'English ref present');
  });

  it('includes insert button with correct data attributes', function () {
    var r = {
      surah: 3, ayah: 18,
      surahNameArabic: 'آل عمران',
      surahNameEnglish: 'Ali Imran',
      arabicText: 'شهد الله'
    };
    var html = _buildResultCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('data-surah="3"') >= 0, 'data-surah present');
    assert.ok(html.indexOf('data-ayah="18"') >= 0, 'data-ayah present');
    assert.ok(html.indexOf('btn-insert-result') >= 0, 'insert button class present');
  });

  it('applies the specified font family', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة',
      surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله'
    };
    var html = _buildResultCardHtml(r, 'Scheherazade New');
    assert.ok(html.indexOf('font-family:Scheherazade New,serif') >= 0, 'custom font applied');
  });

  // ─── XSS safety ────────────────────────────────────────────────────────────

  it('escapes HTML in arabicText', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة',
      surahNameEnglish: 'Al-Fatihah',
      arabicText: '<script>alert("xss")</script>'
    };
    var html = _buildResultCardHtml(r, 'Amiri');
    assert.strictEqual(html.indexOf('<script>'), -1, 'script tag should be escaped');
    assert.ok(html.indexOf('&lt;script&gt;') >= 0, 'escaped script tag present');
  });

  it('escapes HTML in surahNameArabic and surahNameEnglish', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: '<b>bold</b>',
      surahNameEnglish: '<i>italic</i>',
      arabicText: 'text'
    };
    var html = _buildResultCardHtml(r, 'Amiri');
    assert.strictEqual(html.indexOf('<b>bold</b>'), -1, 'bold tag escaped in Arabic ref');
    assert.strictEqual(html.indexOf('<i>italic</i>'), -1, 'italic tag escaped in English ref');
  });

  it('escapes HTML in matched substring', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'test',
      surahNameEnglish: 'Test',
      arabicText: 'ab<img>cd',
      matchStart: 2, matchEnd: 7
    };
    var html = _buildResultCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('<mark>&lt;img&gt;</mark>') >= 0, 'HTML in match is escaped inside mark');
  });

  // ─── Edge cases ────────────────────────────────────────────────────────────

  it('falls back to "Surah" when surahNameEnglish is empty', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: '',
      surahNameEnglish: '',
      arabicText: 'بسم الله'
    };
    var html = _buildResultCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('Surah 1:1') >= 0, 'falls back to "Surah"');
  });

  // ─── Run all tests ─────────────────────────────────────────────────────────

  var ran = 0;
  var failed = 0;
  tests.forEach(function (t) {
    try {
      t.fn();
      console.log('  \u2713 ' + t.label);
      ran++;
    } catch (e) {
      console.log('  \u2717 ' + t.label + '\n      \u2192 ' + (e && e.message ? e.message : e));
      failed++;
    }
  });

  console.log('\n_buildResultCardHtml: ' + ran + ' passed, ' + failed + ' failed.');
  if (failed > 0) process.exit(1);
}

runTests();
