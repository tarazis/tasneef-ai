/**
 * GAS-native tests for DocumentService.gs
 *
 * Run from Apps Script editor: select runDocumentServiceTests, click Run.
 * View results in View → Logs.
 *
 * Uses mock objects for DocumentApp, so no real document is needed.
 */

function runDocumentServiceTests() {
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
      toBe: function(expected) {
        if (actual !== expected) {
          throw new Error('Expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
        }
      },
      toBeTruthy: function() {
        if (!actual) throw new Error('Expected truthy but got ' + JSON.stringify(actual));
      },
      toBeFalsy: function() {
        if (actual) throw new Error('Expected falsy but got ' + JSON.stringify(actual));
      },
      toContain: function(substr) {
        if (typeof actual !== 'string' || actual.indexOf(substr) === -1) {
          throw new Error('Expected ' + JSON.stringify(actual) + ' to contain ' + JSON.stringify(substr));
        }
      },
      not: {
        toContain: function(substr) {
          if (typeof actual === 'string' && actual.indexOf(substr) !== -1) {
            throw new Error('Expected ' + JSON.stringify(actual) + ' NOT to contain ' + JSON.stringify(substr));
          }
        }
      }
    };
  }

  // ─── Mock helpers ────────────────────────────────────────────────────────────

  /**
   * Builds a minimal mock of DocumentApp that records inserted paragraphs.
   * @param {boolean} hasCursor - Whether the mock document has a cursor.
   * @param {number}  numParagraphs - How many initial paragraphs to create.
   * @return {{mock: Object, inserted: Array}} mock is the DocumentApp shim; inserted collects paragraph data.
   */
  function buildMock(hasCursor, numParagraphs) {
    numParagraphs = numParagraphs || 2;
    var inserted = [];

    // Each paragraph is just an object with an index within the body children array.
    var paragraphs = [];
    var bodyChildren = [];
    for (var i = 0; i < numParagraphs; i++) {
      var p = { _index: i, _text: 'Paragraph ' + i };
      paragraphs.push(p);
      bodyChildren.push(p);
    }

    var body = {
      getParagraphs: function() { return paragraphs.slice(); },
      getChildIndex: function(elem) { return bodyChildren.indexOf(elem); },
      findText: function() { return null; },
      insertParagraph: function(index, text) {
        var p = {
          _index: index,
          _text: text,
          _align: null,
          _rtl: false,
          _formatCalled: false,
          setAlignment: function(a) { this._align = a; },
          setLeftToRight: function(v) { this._rtl = !v; },
          editAsText: function() {
            var self = this;
            return {
              setFontFamily: function() {},
              setFontSize: function() {},
              setBold: function() {},
              setForegroundColor: function() {},
              _parent: self
            };
          },
          getType: function() { return 'PARAGRAPH'; }
        };
        inserted.push(p);
        return p;
      }
    };

    var cursorElement = {
      getParent: function() {
        return {
          getType: function() { return DocumentApp.ElementType.PARAGRAPH; },
          asParagraph: function() { return paragraphs[0]; },
          getParent: function() { return null; }
        };
      }
    };

    var cursor = hasCursor ? {
      getElement: function() { return cursorElement; }
    } : null;

    var mockDocumentApp = {
      ElementType: { PARAGRAPH: 'PARAGRAPH' },
      HorizontalAlignment: { CENTER: 'CENTER', LEFT: 'LEFT' },
      _toastMessage: null,
      _alertMessage: null,
      getActiveDocument: function() {
        return {
          getBody: function() { return body; },
          getCursor: function() { return cursor; }
        };
      },
      getUi: function() {
        return {
          toast: function(msg) { mockDocumentApp._toastMessage = msg; },
          alert: function(msg) { mockDocumentApp._alertMessage = msg; }
        };
      }
    };

    return { mock: mockDocumentApp, inserted: inserted };
  }

  /**
   * Runs insertAyah with a temporarily swapped DocumentApp global.
   */
  function runInsertAyah(mockDocumentApp, ayahData, formatState, settings) {
    var original = DocumentApp;
    DocumentApp = mockDocumentApp;
    var result;
    try {
      result = insertAyah(ayahData, formatState, settings);
    } finally {
      DocumentApp = original;
    }
    return result;
  }

  // ─── Sample data ─────────────────────────────────────────────────────────────

  var sampleAyah = {
    surah: 2,
    ayah: 255,
    surahNameArabic: 'البقرة',
    surahNameEnglish: 'Al-Baqarah',
    textUthmani: 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ',
    textSimple: 'الله لا اله الا هو',
    translationText: 'Allah — there is no deity except Him'
  };

  var sampleFormat = { fontName: 'Amiri', fontSize: 18, bold: false, textColor: '#000000' };

  // ─── Tests ───────────────────────────────────────────────────────────────────

  results.push('\ninsertAyah() — no cursor');

  it('returns { success: false } when there is no cursor', function() {
    var env = buildMock(false);
    var result = runInsertAyah(env.mock, sampleAyah, sampleFormat, { insertMode: 'cursor' });
    expect(result.success).toBe(false);
  });

  it('inserts zero paragraphs when there is no cursor', function() {
    var env = buildMock(false);
    runInsertAyah(env.mock, sampleAyah, sampleFormat, { insertMode: 'cursor' });
    expect(env.inserted.length).toBe(0);
  });

  results.push('\ninsertAyah() — showTranslation: true');

  it('returns { success: true } with translation', function() {
    var env = buildMock(true);
    var result = runInsertAyah(env.mock, sampleAyah, sampleFormat,
      { insertMode: 'cursor', showTranslation: true });
    expect(result.success).toBe(true);
  });

  it('inserts 2 paragraphs when translation is shown (Arabic + translation+citation)', function() {
    var env = buildMock(true);
    runInsertAyah(env.mock, sampleAyah, sampleFormat,
      { insertMode: 'cursor', showTranslation: true });
    expect(env.inserted.length).toBe(2);
  });

  it('translation paragraph contains inline English citation format (Name S:A)', function() {
    var env = buildMock(true);
    runInsertAyah(env.mock, sampleAyah, sampleFormat,
      { insertMode: 'cursor', showTranslation: true });
    // Second inserted paragraph should be "translationText (Name S:A)"
    var transText = env.inserted[1]._text;
    expect(transText).toContain('Al-Baqarah 2:255');
    expect(transText).toContain('Allah — there is no deity except Him');
  });

  results.push('\ninsertAyah() — showTranslation: false');

  it('returns { success: true } without translation', function() {
    var env = buildMock(true);
    var result = runInsertAyah(env.mock, sampleAyah, sampleFormat,
      { insertMode: 'cursor', showTranslation: false });
    expect(result.success).toBe(true);
  });

  it('inserts 1 paragraph when translation is hidden', function() {
    var env = buildMock(true);
    runInsertAyah(env.mock, sampleAyah, sampleFormat,
      { insertMode: 'cursor', showTranslation: false });
    expect(env.inserted.length).toBe(1);
  });

  it('Arabic-only paragraph uses ornamental opening bracket \uFD3F', function() {
    var env = buildMock(true);
    runInsertAyah(env.mock, sampleAyah, sampleFormat,
      { insertMode: 'cursor', showTranslation: false });
    var text = env.inserted[0]._text;
    expect(text).toContain('\uFD3F');
  });

  it('Arabic-only paragraph uses ornamental closing bracket \uFD3E for citation', function() {
    var env = buildMock(true);
    runInsertAyah(env.mock, sampleAyah, sampleFormat,
      { insertMode: 'cursor', showTranslation: false });
    var text = env.inserted[0]._text;
    // Citation bracket: ﴿Name: Num﴾ — the citation closing bracket appears at the very end
    var lastChar = text.charAt(text.length - 1);
    expect(lastChar).toBe('\uFD3E');
  });

  it('Arabic-only citation does not use square brackets', function() {
    var env = buildMock(true);
    runInsertAyah(env.mock, sampleAyah, sampleFormat,
      { insertMode: 'cursor', showTranslation: false });
    var text = env.inserted[0]._text;
    expect(text).not.toContain('[');
  });

  it('Arabic-only paragraph contains surah name Arabic', function() {
    var env = buildMock(true);
    runInsertAyah(env.mock, sampleAyah, sampleFormat,
      { insertMode: 'cursor', showTranslation: false });
    var text = env.inserted[0]._text;
    expect(text).toContain('البقرة');
  });

  results.push('\ninsertAyah() — insertMode: lastparagraph');

  it('with lastparagraph mode inserts at index after last paragraph', function() {
    var env = buildMock(true, 3); // 3 paragraphs at indices 0, 1, 2
    runInsertAyah(env.mock, sampleAyah, sampleFormat,
      { insertMode: 'lastparagraph', showTranslation: false });
    // Last paragraph is at bodyChildren index 2, so insertIndex = 3
    expect(env.inserted[0]._index).toBe(3);
  });

  it('with lastparagraph mode returns { success: true }', function() {
    var env = buildMock(true, 2);
    var result = runInsertAyah(env.mock, sampleAyah, sampleFormat,
      { insertMode: 'lastparagraph', showTranslation: false });
    expect(result.success).toBe(true);
  });

  results.push('\ninsertAyah() — invalid ayah data');

  it('returns { success: false } when ayahData is null', function() {
    var env = buildMock(true);
    var result = runInsertAyah(env.mock, null, sampleFormat, { insertMode: 'cursor' });
    expect(result.success).toBe(false);
  });

  it('returns { success: false } when surah is missing', function() {
    var env = buildMock(true);
    var result = runInsertAyah(env.mock,
      { ayah: 1, textUthmani: 'text', translationText: 'trans' },
      sampleFormat, { insertMode: 'cursor' });
    expect(result.success).toBe(false);
  });

  // ─── Summary ─────────────────────────────────────────────────────────────────

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');

  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
