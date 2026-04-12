'use strict';

/**
 * Node tests for the shared sidebar card-building and pagination utilities:
 *   buildCardHtml, isConsecutiveRange, buildRangeData, pagReset/pagRenderPage/pagClear.
 *
 * These functions live inside the IIFE in sidebar/sidebar-js.html. This file
 * duplicates their implementations so they can be tested in Node without a DOM.
 *
 * Run: npm run test:card
 */

const assert = require('assert');

// ─── Helpers duplicated from sidebar-js.html ────────────────────────────────

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

function wrapArabicPreviewWithQuranicBraces(innerHtmlFragment) {
  var nb = '\u00A0';
  return '\uFD3F' + nb + innerHtmlFragment + nb + '\uFD3E';
}

function parseGoogleFontVariantClient(token) {
  if (token == null || typeof token !== 'string') return { weight: 400, italic: false };
  var t = token.replace(/\s/g, '');
  if (t === '') return { weight: 400, italic: false };
  if (t === 'regular') return { weight: 400, italic: false };
  if (t === 'italic') return { weight: 400, italic: true };
  var italic = /italic$/i.test(t);
  if (italic) t = t.replace(/italic$/i, '');
  var w = parseInt(t, 10);
  if (!isNaN(w)) return { weight: w, italic: italic };
  return { weight: 400, italic: false };
}

var INSERT_PREVIEW_ARABIC_PT = 16;
var INSERT_PREVIEW_ARABIC_COLOR = '#202124';

function arabicPreviewFontStyle(fs) {
  var fam = (fs && fs.fontName) || 'Amiri';
  var safeFam = String(fam).replace(/['\\<>]/g, '');
  var p = parseGoogleFontVariantClient(fs && fs.fontVariant ? fs.fontVariant : 'regular');
  var w = p.weight;
  return 'font-family:\'' + safeFam + '\',serif;font-weight:' + w +
    ';font-style:' + (p.italic ? 'italic' : 'normal') +
    ';font-size:' + INSERT_PREVIEW_ARABIC_PT + 'pt;color:' + INSERT_PREVIEW_ARABIC_COLOR;
}

// ─── isConsecutiveRange ───────────────────────────────────────────────────────

function isConsecutiveRange(results) {
  if (!results || results.length < 2) return false;
  var first = results[0];
  for (var i = 1; i < results.length; i++) {
    if (results[i].surah !== first.surah) return false;
    if (results[i].ayah !== first.ayah + i) return false;
  }
  return true;
}

// ─── buildRangeData ───────────────────────────────────────────────────────────

function buildRangeData(results) {
  var first = results[0];
  var last  = results[results.length - 1];
  var nb = '\u00A0';
  var concatenated = results.map(function(r) {
    return r.arabicText + nb + '(' + toArabicIndicClient(r.ayah) + ')';
  }).join(' ');
  return {
    surah:            first.surah,
    ayahStart:        first.ayah,
    ayahEnd:          last.ayah,
    surahNameArabic:  first.surahNameArabic  || '',
    surahNameEnglish: first.surahNameEnglish || '',
    arabicText:       concatenated,
    translationText:  results.map(function(r) { return r.translationText || ''; }).join(' ')
  };
}

// ─── buildCardHtml ────────────────────────────────────────────────────────────

function buildCardHtml(cardData, fontOrFs) {
  var arabicRef, englishRef, arabicHtml;
  var arabicCss;
  if (fontOrFs && typeof fontOrFs === 'object' && fontOrFs.fontName) {
    arabicCss = arabicPreviewFontStyle(fontOrFs);
  } else {
    var f = (typeof fontOrFs === 'string' && fontOrFs) ? fontOrFs : 'Amiri';
    arabicCss = 'font-family:\'' + String(f).replace(/['\\<>]/g, '') + '\',serif;font-weight:400;font-style:normal';
  }

  var translationBlock = '';
  if (cardData.translationText) {
    translationBlock =
      '<a class="btn-toggle-translation" role="button" tabindex="0">Show translation</a>' +
      '<div class="translation hidden">' + escapeHtml(cardData.translationText) + '</div>';
  }

  if (cardData.isRange) {
    arabicRef = escapeHtml(cardData.surahNameArabic || '') +
                ' ' + toArabicIndicClient(cardData.ayahStart) +
                ' - ' + toArabicIndicClient(cardData.ayahEnd);
    englishRef = escapeHtml(
      (cardData.surahNameEnglish || 'Surah') + ' ' +
      cardData.surah + ':' + cardData.ayahStart + '-' + cardData.ayahEnd
    );
    arabicHtml = wrapArabicPreviewWithQuranicBraces(escapeHtml(cardData.arabicText));

    return '<div class="ref-arabic">' + arabicRef + '</div>' +
      '<div class="arabic range-block" style="' + escapeHtml(arabicCss) + '">' + arabicHtml + '</div>' +
      '<div class="ref-english">' + englishRef + '</div>' +
      translationBlock +
      '<button type="button" class="btn-primary btn-insert-result" ' +
        'data-surah="' + cardData.surah + '" ' +
        'data-ayah-start="' + cardData.ayahStart + '" ' +
        'data-ayah-end="' + cardData.ayahEnd + '">Insert</button>';
  }

  arabicRef = escapeHtml(cardData.surahNameArabic || '') + ' ' + toArabicIndicClient(cardData.ayah);
  englishRef = escapeHtml((cardData.surahNameEnglish || 'Surah') + ' ' + cardData.surah + ':' + cardData.ayah);
  arabicHtml = escapeHtml(cardData.arabicText);

  if (cardData.matchStart != null && cardData.matchEnd != null && cardData.matchEnd > cardData.matchStart) {
    var before = escapeHtml(cardData.arabicText.substring(0, cardData.matchStart));
    var match  = escapeHtml(cardData.arabicText.substring(cardData.matchStart, cardData.matchEnd));
    var after  = escapeHtml(cardData.arabicText.substring(cardData.matchEnd));
    arabicHtml = before + '<mark>' + match + '</mark>' + after;
  }

  arabicHtml = wrapArabicPreviewWithQuranicBraces(arabicHtml);

  return '<div class="ref-arabic">' + arabicRef + '</div>' +
    '<div class="arabic" style="' + escapeHtml(arabicCss) + '">' + arabicHtml + '</div>' +
    '<div class="ref-english">' + englishRef + '</div>' +
    translationBlock +
    '<button type="button" class="btn-primary btn-insert-result" ' +
      'data-surah="' + cardData.surah + '" data-ayah="' + cardData.ayah + '">Insert</button>';
}

// ─── Minimal DOM stub for pagination tests ────────────────────────────────────

function makeEl(tag) {
  var children = [];
  var text = '';
  var classSet = new Set();
  return {
    tagName: tag,
    get textContent() { return text; },
    set textContent(v) { text = v; },
    get innerHTML() { return children.map(function(c) { return c._raw || ''; }).join(''); },
    set innerHTML(v) {
      // Clear in-place to preserve the `children` reference used by _children
      children.length = 0;
      if (v) children.push({ _raw: v });
    },
    classList: {
      add: function(c) { classSet.add(c); },
      remove: function(c) { classSet.delete(c); },
      contains: function(c) { return classSet.has(c); }
    },
    appendChild: function(child) { children.push(child); },
    querySelector: function(sel) {
      // only handles '.classname' lookups for these tests
      var cls = sel.replace('.', '');
      for (var i = 0; i < children.length; i++) {
        if (children[i] && children[i]._className === cls) return children[i];
      }
      return null;
    },
    // _children always reflects the live children array
    get _children() { return children; }
  };
}

function makeBtn(cls, text) {
  return { _className: cls, type: 'button', textContent: text, _events: {}, addEventListener: function(ev, fn) { this._events[ev] = fn; }, remove: function() {} };
}

// ─── Pagination stub ──────────────────────────────────────────────────────────

var PAGE_SIZE = 10;
var _pagState = {};

function pagReset(tabId, results) {
  _pagState[tabId] = { results: results || [], page: 0 };
}

function pagClear(tabId) {
  _pagState[tabId] = { results: [], page: 0 };
}

function pagAppendShowMoreButton(tabId, containerEl, emptyEl, emptyMsg, remaining) {
  var showMore = makeBtn('btn-show-more', 'Show more (' + remaining + ' remaining)');
  (function(tid, cEl, eEl, msg) {
    showMore.addEventListener('click', function() {
      pagRenderPage(tid, cEl, eEl, msg);
    });
  }(tabId, containerEl, emptyEl, emptyMsg));
  containerEl.appendChild(showMore);
}

function pagRenderPage(tabId, containerEl, emptyEl, emptyMsg) {
  var state = _pagState[tabId];
  if (!state) { state = { results: [], page: 0 }; _pagState[tabId] = state; }

  if (state.page === 0) {
    containerEl.innerHTML = '';
  }

  if (state.results.length === 0 && state.page === 0) {
    emptyEl.textContent = emptyMsg;
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  var oldBtn = containerEl.querySelector('.btn-show-more');
  if (oldBtn) oldBtn.remove();

  var start = state.page * PAGE_SIZE;
  var end = Math.min(start + PAGE_SIZE, state.results.length);

  for (var i = start; i < end; i++) {
    var card = { _raw: '<card>' + i + '</card>', _className: 'result-card' };
    containerEl.appendChild(card);
  }

  state.page++;

  if (end < state.results.length) {
    pagAppendShowMoreButton(tabId, containerEl, emptyEl, emptyMsg, state.results.length - end);
  }
}

function pagRebuildVisibleCards(tabId, containerEl, emptyEl, emptyMsg) {
  var state = _pagState[tabId];
  if (!state || !state.results.length || state.page < 1) return;

  var n = Math.min(state.page * PAGE_SIZE, state.results.length);
  if (n <= 0) return;

  containerEl.innerHTML = '';
  emptyEl.classList.add('hidden');

  for (var i = 0; i < n; i++) {
    var card = { _raw: '<card>' + i + '</card>', _className: 'result-card' };
    containerEl.appendChild(card);
  }

  if (n < state.results.length) {
    pagAppendShowMoreButton(tabId, containerEl, emptyEl, emptyMsg, state.results.length - n);
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

function runTests() {
  var tests = [];
  function it(label, fn) { tests.push({ label: label, fn: fn }); }

  // ─── isConsecutiveRange ──────────────────────────────────────────────────

  it('returns false for empty array', function () {
    assert.strictEqual(isConsecutiveRange([]), false);
  });

  it('returns false for single-element array', function () {
    assert.strictEqual(isConsecutiveRange([{ surah: 2, ayah: 255 }]), false);
  });

  it('returns true for two consecutive ayahs in same surah', function () {
    assert.strictEqual(isConsecutiveRange([
      { surah: 2, ayah: 255 },
      { surah: 2, ayah: 256 }
    ]), true);
  });

  it('returns true for three consecutive ayahs', function () {
    assert.strictEqual(isConsecutiveRange([
      { surah: 2, ayah: 255 },
      { surah: 2, ayah: 256 },
      { surah: 2, ayah: 257 }
    ]), true);
  });

  it('returns false when ayahs skip a number', function () {
    assert.strictEqual(isConsecutiveRange([
      { surah: 2, ayah: 255 },
      { surah: 2, ayah: 257 }
    ]), false);
  });

  it('returns false when surahs differ', function () {
    assert.strictEqual(isConsecutiveRange([
      { surah: 2, ayah: 255 },
      { surah: 3, ayah: 256 }
    ]), false);
  });

  it('returns false for mixed-surah range even if ayah numbers are consecutive', function () {
    assert.strictEqual(isConsecutiveRange([
      { surah: 2, ayah: 1 },
      { surah: 3, ayah: 2 }
    ]), false);
  });

  // ─── buildRangeData ──────────────────────────────────────────────────────

  it('sets surah, ayahStart, ayahEnd from first/last items', function () {
    var results = [
      { surah: 2, ayah: 255, arabicText: 'آية ٢٥٥', surahNameArabic: 'البقرة', surahNameEnglish: 'Al-Baqarah', translationText: 'Allah - there is no deity' },
      { surah: 2, ayah: 256, arabicText: 'آية ٢٥٦', surahNameArabic: 'البقرة', surahNameEnglish: 'Al-Baqarah', translationText: 'There shall be no compulsion' }
    ];
    var data = buildRangeData(results);
    assert.strictEqual(data.surah, 2);
    assert.strictEqual(data.ayahStart, 255);
    assert.strictEqual(data.ayahEnd, 256);
    assert.strictEqual(data.surahNameArabic, 'البقرة');
    assert.strictEqual(data.surahNameEnglish, 'Al-Baqarah');
  });

  it('concatenates arabicText with ayah markers', function () {
    var results = [
      { surah: 1, ayah: 1, arabicText: 'بسم الله', surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah', translationText: '' },
      { surah: 1, ayah: 2, arabicText: 'الحمد لله', surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah', translationText: '' }
    ];
    var data = buildRangeData(results);
    assert.ok(data.arabicText.indexOf('بسم الله') >= 0, 'first ayah text present');
    assert.ok(data.arabicText.indexOf('الحمد لله') >= 0, 'second ayah text present');
    assert.ok(data.arabicText.indexOf(toArabicIndicClient(1)) >= 0, 'ayah 1 marker present');
    assert.ok(data.arabicText.indexOf(toArabicIndicClient(2)) >= 0, 'ayah 2 marker present');
    assert.ok(data.arabicText.indexOf('\u00A0(') >= 0, 'NBSP before each ayah-number parenthesis');
  });

  it('joins translationText for all ayahs', function () {
    var results = [
      { surah: 2, ayah: 255, arabicText: 'text', surahNameArabic: '', surahNameEnglish: '', translationText: 'First translation' },
      { surah: 2, ayah: 256, arabicText: 'text', surahNameArabic: '', surahNameEnglish: '', translationText: 'Second translation' }
    ];
    var data = buildRangeData(results);
    assert.ok(data.translationText.indexOf('First translation') >= 0);
    assert.ok(data.translationText.indexOf('Second translation') >= 0);
  });

  it('handles missing translationText gracefully', function () {
    var results = [
      { surah: 1, ayah: 1, arabicText: 'text', surahNameArabic: '', surahNameEnglish: '' }
    ];
    var data = buildRangeData([results[0], results[0]]);
    assert.strictEqual(typeof data.translationText, 'string');
  });

  // ─── buildCardHtml — single card ─────────────────────────────────────────

  it('single: wraps matched substring in <mark>', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله الرحمن الرحيم',
      matchStart: 0, matchEnd: 3
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('<mark>بسم</mark>') >= 0, 'matched text wrapped in <mark>');
    assert.ok(html.indexOf(' الله الرحمن الرحيم') >= 0, 'rest of text follows');
  });

  it('single: highlights match in the middle of text', function () {
    var r = {
      surah: 2, ayah: 255,
      surahNameArabic: 'البقرة', surahNameEnglish: 'Al-Baqarah',
      arabicText: 'الله لا اله الا هو',
      matchStart: 5, matchEnd: 7
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('<mark>لا</mark>') >= 0, 'middle match highlighted');
  });

  it('single: highlights match at end of text', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله',
      matchStart: 4, matchEnd: 8
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('<mark>الله</mark>') >= 0, 'end match highlighted');
  });

  it('single: no <mark> when matchStart/matchEnd absent', function () {
    var r = {
      surah: 1, ayah: 2,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'الحمد لله رب العالمين'
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.strictEqual(html.indexOf('<mark>'), -1, 'no <mark> without match data');
  });

  it('single: no <mark> when matchStart/matchEnd are null', function () {
    var r = {
      surah: 1, ayah: 2,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'الحمد لله رب العالمين',
      matchStart: null, matchEnd: null
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.strictEqual(html.indexOf('<mark>'), -1, 'no <mark> with null match data');
  });

  it('single: no <mark> when matchEnd <= matchStart', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله',
      matchStart: 3, matchEnd: 3
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.strictEqual(html.indexOf('<mark>'), -1, 'no <mark> when matchEnd equals matchStart');
  });

  it('single: renders translation toggle and hidden translation div when translationText provided', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله الرحمن الرحيم',
      translationText: 'In the name of Allah, the Most Gracious, the Most Merciful'
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('btn-toggle-translation') >= 0, 'toggle link present');
    assert.ok(html.indexOf('Show translation') >= 0, 'toggle text is "Show translation"');
    assert.ok(html.indexOf('translation hidden') >= 0, 'translation div has hidden class by default');
    assert.ok(html.indexOf('Most Gracious') >= 0, 'translation text present in hidden div');
  });

  it('single: no translation toggle when translationText is empty', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله', translationText: ''
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.strictEqual(html.indexOf('btn-toggle-translation'), -1, 'no toggle when translation empty');
    assert.strictEqual(html.indexOf('class="translation'), -1, 'no translation div when empty');
  });

  it('single: no translation toggle when translationText is undefined', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله'
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.strictEqual(html.indexOf('btn-toggle-translation'), -1, 'no toggle when translation undefined');
    assert.strictEqual(html.indexOf('class="translation'), -1, 'no translation div when undefined');
  });

  it('single: translation text is HTML-escaped', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله',
      translationText: '<script>alert("xss")</script>'
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.strictEqual(html.indexOf('<script>alert'), -1, 'script tag escaped in translation');
    assert.ok(html.indexOf('&lt;script&gt;') >= 0, 'escaped script present in translation div');
  });

  it('single: includes Arabic reference with Arabic-Indic ayah number', function () {
    var r = {
      surah: 2, ayah: 255,
      surahNameArabic: 'البقرة', surahNameEnglish: 'Al-Baqarah',
      arabicText: 'الله لا اله الا هو'
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('البقرة ٢٥٥') >= 0, 'Arabic ref with Indic digits');
  });

  it('single: includes English reference with Western numerals', function () {
    var r = {
      surah: 2, ayah: 255,
      surahNameArabic: 'البقرة', surahNameEnglish: 'Al-Baqarah',
      arabicText: 'الله لا اله الا هو'
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('Al-Baqarah 2:255') >= 0, 'English ref present');
  });

  it('single: insert button has data-surah and data-ayah', function () {
    var r = {
      surah: 3, ayah: 18,
      surahNameArabic: 'آل عمران', surahNameEnglish: 'Ali Imran',
      arabicText: 'شهد الله'
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('data-surah="3"') >= 0, 'data-surah present');
    assert.ok(html.indexOf('data-ayah="18"') >= 0, 'data-ayah present');
    assert.ok(html.indexOf('btn-insert-result') >= 0, 'insert button class present');
    assert.strictEqual(html.indexOf('data-ayah-start'), -1, 'no data-ayah-start on single card');
  });

  it('single: applies specified font family', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله'
    };
    var html = buildCardHtml(r, 'Scheherazade New');
    assert.ok(html.indexOf("font-family:'Scheherazade New',serif") >= 0, 'custom font applied');
  });

  it('single: wraps Arabic preview with quranic ornate parentheses (matches insert)', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله'
    };
    var html = buildCardHtml(r, 'Amiri');
    var openIdx = html.indexOf('\uFD3F');
    var closeIdx = html.indexOf('\uFD3E');
    assert.ok(openIdx >= 0 && closeIdx > openIdx, 'U+FD3F / U+FD3E present in order');
    assert.ok(html.indexOf('\uFD3F\u00A0') === openIdx, 'NBSP after opening brace (not regular space)');
    assert.ok(html.indexOf('بسم الله') > openIdx && html.indexOf('بسم الله') < closeIdx, 'Arabic between braces');
  });

  it('single: quranic braces wrap highlighted match', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله الرحمن الرحيم',
      matchStart: 0,
      matchEnd: 3
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('\uFD3F') < html.indexOf('<mark>'), 'opening brace before mark');
    assert.ok(html.indexOf('</mark>') < html.indexOf('\uFD3E'), 'closing brace after mark');
  });

  it('single: formatState object uses fixed insert preview size and color', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله'
    };
    var fs = {
      fontName: 'Amiri',
      fontVariant: 'regular',
      fontSize: 24,
      bold: false,
      textColor: '#2e7d32'
    };
    var html = buildCardHtml(r, fs);
    assert.ok(html.indexOf('font-size:16pt') >= 0, 'fixed 16pt preview');
    assert.ok(html.indexOf('color:#202124') >= 0, 'fixed insert text color');
  });

  it('single: legacy bold flag does not change Arabic preview weight', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله'
    };
    var fs = {
      fontName: 'Amiri',
      fontVariant: 'regular',
      fontSize: 18,
      bold: true,
      textColor: '#000000'
    };
    var html = buildCardHtml(r, fs);
    assert.ok(html.indexOf('font-weight:400') >= 0, 'regular weight for preview');
  });

  it('single: invalid textColor in formatState is ignored for Arabic preview', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله'
    };
    var fs = {
      fontName: 'Amiri',
      fontVariant: 'regular',
      fontSize: 18,
      bold: false,
      textColor: 'not-a-color'
    };
    var html = buildCardHtml(r, fs);
    assert.ok(html.indexOf('color:#202124') >= 0, 'fixed insert color');
  });

  it('single: falls back to "Surah" when surahNameEnglish is empty', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: '', surahNameEnglish: '',
      arabicText: 'بسم الله'
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('Surah 1:1') >= 0, 'falls back to "Surah"');
  });

  it('single: does not have range-block class', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: 'بسم الله'
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.strictEqual(html.indexOf('range-block'), -1, 'no range-block class on single card');
  });

  // ─── buildCardHtml — range card ──────────────────────────────────────────

  it('range: includes range-block class on arabic element', function () {
    var data = { isRange: true, surah: 2, ayahStart: 255, ayahEnd: 257, surahNameArabic: 'البقرة', surahNameEnglish: 'Al-Baqarah', arabicText: 'text' };
    var html = buildCardHtml(data, 'Amiri');
    assert.ok(html.indexOf('range-block') >= 0, 'range-block class present');
    assert.ok(html.indexOf('\uFD3F') >= 0 && html.indexOf('\uFD3E') >= 0, 'quranic braces on range preview');
  });

  it('range: shows Arabic ref as start - end range', function () {
    var data = { isRange: true, surah: 2, ayahStart: 255, ayahEnd: 257, surahNameArabic: 'البقرة', surahNameEnglish: 'Al-Baqarah', arabicText: 'text' };
    var html = buildCardHtml(data, 'Amiri');
    var startIndic = toArabicIndicClient(255);
    var endIndic   = toArabicIndicClient(257);
    assert.ok(html.indexOf(startIndic) >= 0, 'start ayah in Arabic ref');
    assert.ok(html.indexOf(endIndic) >= 0, 'end ayah in Arabic ref');
  });

  it('range: shows English ref as surah:start-end', function () {
    var data = { isRange: true, surah: 2, ayahStart: 255, ayahEnd: 257, surahNameArabic: 'البقرة', surahNameEnglish: 'Al-Baqarah', arabicText: 'text' };
    var html = buildCardHtml(data, 'Amiri');
    assert.ok(html.indexOf('Al-Baqarah 2:255-257') >= 0, 'English ref with range');
  });

  it('range: insert button has data-surah, data-ayah-start, data-ayah-end', function () {
    var data = { isRange: true, surah: 2, ayahStart: 255, ayahEnd: 257, surahNameArabic: 'البقرة', surahNameEnglish: 'Al-Baqarah', arabicText: 'text' };
    var html = buildCardHtml(data, 'Amiri');
    assert.ok(html.indexOf('data-surah="2"') >= 0, 'data-surah present');
    assert.ok(html.indexOf('data-ayah-start="255"') >= 0, 'data-ayah-start present');
    assert.ok(html.indexOf('data-ayah-end="257"') >= 0, 'data-ayah-end present');
    assert.strictEqual(html.indexOf('data-ayah="'), -1, 'no data-ayah on range card');
  });

  it('range: renders translation toggle and hidden translation div when translationText provided', function () {
    var data = { isRange: true, surah: 2, ayahStart: 255, ayahEnd: 256, surahNameArabic: 'البقرة', surahNameEnglish: 'Al-Baqarah', arabicText: 'text', translationText: 'Allah - there is no deity' };
    var html = buildCardHtml(data, 'Amiri');
    assert.ok(html.indexOf('btn-toggle-translation') >= 0, 'toggle link present on range card');
    assert.ok(html.indexOf('Show translation') >= 0, 'toggle text is "Show translation"');
    assert.ok(html.indexOf('translation hidden') >= 0, 'translation div has hidden class');
    assert.ok(html.indexOf('Allah - there is no deity') >= 0, 'translation text present');
  });

  it('range: no translation toggle when translationText is empty', function () {
    var data = { isRange: true, surah: 2, ayahStart: 1, ayahEnd: 2, surahNameArabic: '', surahNameEnglish: '', arabicText: 'text', translationText: '' };
    var html = buildCardHtml(data, 'Amiri');
    assert.strictEqual(html.indexOf('btn-toggle-translation'), -1, 'no toggle on range when translation empty');
    assert.strictEqual(html.indexOf('class="translation'), -1, 'no translation div on range when empty');
  });

  it('range: does not have <mark> even if match params somehow present', function () {
    var data = { isRange: true, surah: 2, ayahStart: 1, ayahEnd: 2, surahNameArabic: '', surahNameEnglish: '', arabicText: 'text text', matchStart: 0, matchEnd: 4 };
    var html = buildCardHtml(data, 'Amiri');
    assert.strictEqual(html.indexOf('<mark>'), -1, 'no <mark> on range cards');
  });

  // ─── XSS safety ──────────────────────────────────────────────────────────

  it('escapes HTML in arabicText (single)', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'الفاتحة', surahNameEnglish: 'Al-Fatihah',
      arabicText: '<script>alert("xss")</script>'
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.strictEqual(html.indexOf('<script>'), -1, 'script tag escaped');
    assert.ok(html.indexOf('&lt;script&gt;') >= 0, 'escaped script tag present');
  });

  it('escapes HTML in surah names (single)', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: '<b>bold</b>', surahNameEnglish: '<i>italic</i>',
      arabicText: 'text'
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.strictEqual(html.indexOf('<b>bold</b>'), -1);
    assert.strictEqual(html.indexOf('<i>italic</i>'), -1);
  });

  it('escapes HTML in matched substring (single)', function () {
    var r = {
      surah: 1, ayah: 1,
      surahNameArabic: 'test', surahNameEnglish: 'Test',
      arabicText: 'ab<img>cd',
      matchStart: 2, matchEnd: 7
    };
    var html = buildCardHtml(r, 'Amiri');
    assert.ok(html.indexOf('<mark>&lt;img&gt;</mark>') >= 0, 'HTML in match escaped inside mark');
  });

  it('escapes HTML in range arabicText', function () {
    var data = { isRange: true, surah: 1, ayahStart: 1, ayahEnd: 2, surahNameArabic: '', surahNameEnglish: '', arabicText: '<script>xss</script>' };
    var html = buildCardHtml(data, 'Amiri');
    assert.strictEqual(html.indexOf('<script>'), -1);
  });

  // ─── Pagination module ────────────────────────────────────────────────────

  it('pagReset initialises state with page 0', function () {
    pagReset('test-tab', [{ id: 1 }, { id: 2 }]);
    assert.strictEqual(_pagState['test-tab'].page, 0);
    assert.strictEqual(_pagState['test-tab'].results.length, 2);
  });

  it('pagClear empties results and resets page', function () {
    pagReset('test-tab', [{ id: 1 }]);
    pagClear('test-tab');
    assert.strictEqual(_pagState['test-tab'].results.length, 0);
    assert.strictEqual(_pagState['test-tab'].page, 0);
  });

  it('pagRenderPage shows empty message when no results', function () {
    var container = makeEl('div');
    var emptyEl = makeEl('div');
    pagReset('test-empty', []);
    pagRenderPage('test-empty', container, emptyEl, 'Nothing found.');
    assert.strictEqual(emptyEl.textContent, 'Nothing found.');
    assert.ok(emptyEl.classList.contains('hidden') === false, 'emptyEl visible');
  });

  it('pagRenderPage renders at most PAGE_SIZE items on first page', function () {
    var items = [];
    for (var i = 0; i < 25; i++) items.push({ id: i });
    var container = makeEl('div');
    var emptyEl = makeEl('div');
    pagReset('test-pag', items);
    pagRenderPage('test-pag', container, emptyEl, 'Empty');
    assert.strictEqual(_pagState['test-pag'].page, 1, 'page incremented to 1');
    assert.ok(container._children.length <= PAGE_SIZE + 1, 'at most PAGE_SIZE cards + show-more btn');
  });

  it('pagRenderPage appends Show-more button when items remain', function () {
    var items = [];
    for (var i = 0; i < 15; i++) items.push({ id: i });
    var container = makeEl('div');
    var emptyEl = makeEl('div');
    pagReset('test-showmore', items);
    pagRenderPage('test-showmore', container, emptyEl, 'Empty');
    var btn = container.querySelector('.btn-show-more');
    assert.ok(btn, 'Show more button present');
    assert.ok(btn.textContent.indexOf('5 remaining') >= 0, 'correct remaining count');
  });

  it('pagRenderPage does NOT append Show-more button when all items fit', function () {
    var items = [];
    for (var i = 0; i < 5; i++) items.push({ id: i });
    var container = makeEl('div');
    var emptyEl = makeEl('div');
    pagReset('test-nomore', items);
    pagRenderPage('test-nomore', container, emptyEl, 'Empty');
    var btn = container.querySelector('.btn-show-more');
    assert.strictEqual(btn, null, 'no Show more button when all items fit');
  });

  it('pagRenderPage appends more items on second call without clearing', function () {
    var items = [];
    for (var i = 0; i < 15; i++) items.push({ id: i });
    var container = makeEl('div');
    var emptyEl = makeEl('div');
    pagReset('test-append', items);
    pagRenderPage('test-append', container, emptyEl, 'Empty');
    var countAfterFirst = container._children.length;
    // Trigger second page
    pagRenderPage('test-append', container, emptyEl, 'Empty');
    assert.ok(container._children.length > countAfterFirst, 'more items appended on second call');
  });

  it('pagReset clears page back to 0 for a new search', function () {
    var items = [];
    for (var i = 0; i < 15; i++) items.push({ id: i });
    var container = makeEl('div');
    var emptyEl = makeEl('div');
    pagReset('test-newq', items);
    pagRenderPage('test-newq', container, emptyEl, 'Empty');
    assert.strictEqual(_pagState['test-newq'].page, 1);

    // new query resets
    pagReset('test-newq', [{ id: 99 }]);
    assert.strictEqual(_pagState['test-newq'].page, 0, 'page reset after pagReset');
    assert.strictEqual(_pagState['test-newq'].results.length, 1, 'new results stored');
  });

  it('pagRebuildVisibleCards is a no-op when page is 0', function () {
    var items = [{ id: 0 }];
    var container = makeEl('div');
    var emptyEl = makeEl('div');
    pagReset('test-rebuild0', items);
    pagRebuildVisibleCards('test-rebuild0', container, emptyEl, 'Empty');
    assert.strictEqual(container._children.length, 0, 'nothing rendered before first pagRenderPage');
  });

  it('pagRebuildVisibleCards re-renders all visible cards and show-more', function () {
    var items = [];
    for (var i = 0; i < 25; i++) items.push({ id: i });
    var container = makeEl('div');
    var emptyEl = makeEl('div');
    pagReset('test-rebuild', items);
    pagRenderPage('test-rebuild', container, emptyEl, 'Empty');
    pagRenderPage('test-rebuild', container, emptyEl, 'Empty');
    assert.strictEqual(_pagState['test-rebuild'].page, 2, 'two pages loaded');

    pagRebuildVisibleCards('test-rebuild', container, emptyEl, 'Empty');
    var btn = container.querySelector('.btn-show-more');
    assert.ok(btn, 'Show more still present after rebuild');
    assert.ok(btn.textContent.indexOf('5 remaining') >= 0, 'remaining count preserved');
    assert.strictEqual(container._children.length, 21, '20 cards + show more');
  });

  // ─── Run all tests ────────────────────────────────────────────────────────

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

  console.log('\nCard/range/pagination utilities: ' + ran + ' passed, ' + failed + ' failed.');
  if (failed > 0) process.exit(1);
}

runTests();
