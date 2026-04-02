/**
 * GAS-native tests for DocumentService.gs — insertParagraphsAtPosition_()
 * Run from Apps Script editor: select runDocumentServiceTests, click Run.
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
      toBe: function (expected) {
        if (actual !== expected) {
          throw new Error('Expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
        }
      },
      toEqual: function (expected) {
        var a = JSON.stringify(actual);
        var b = JSON.stringify(expected);
        if (a !== b) {
          throw new Error('Expected ' + b + ' but got ' + a);
        }
      }
    };
  }

  // ── Mock factories ──────────────────────────────────────────

  function createMockParagraph(text) {
    return {
      _text: text,
      _align: null,
      _ltr: null,
      _heading: null,
      _formatCalls: [],
      getText: function () { return this._text; },
      setAlignment: function (a) { this._align = a; },
      setLeftToRight: function (v) { this._ltr = v; },
      setHeading: function (h) { this._heading = h; },
      getType: function () { return DocumentApp.ElementType.PARAGRAPH; },
      asParagraph: function () { return this; },
      getParent: function () { return null; },
      editAsText: function () { return this; }
    };
  }

  function createMockBody(initialTexts) {
    var children = [];
    for (var i = 0; i < initialTexts.length; i++) {
      children.push(createMockParagraph(initialTexts[i]));
    }
    return {
      _children: children,
      getParagraphs: function () {
        var paras = [];
        for (var i = 0; i < this._children.length; i++) {
          if (this._children[i].getType() === DocumentApp.ElementType.PARAGRAPH) {
            paras.push(this._children[i]);
          }
        }
        return paras;
      },
      getNumChildren: function () { return this._children.length; },
      getChild: function (idx) { return this._children[idx]; },
      getChildIndex: function (child) {
        for (var i = 0; i < this._children.length; i++) {
          if (this._children[i] === child) return i;
        }
        return -1;
      },
      insertParagraph: function (index, text) {
        var p = createMockParagraph(text);
        this._children.splice(index, 0, p);
        return p;
      },
      removeChild: function (child) {
        for (var i = 0; i < this._children.length; i++) {
          if (this._children[i] === child) {
            this._children.splice(i, 1);
            return;
          }
        }
      }
    };
  }

  function createMockDoc(body, cursorParagraph) {
    return {
      getBody: function () { return body; },
      getCursor: function () {
        if (!cursorParagraph) return null;
        return {
          getElement: function () { return cursorParagraph; }
        };
      }
    };
  }

  // ── Helpers ─────────────────────────────────────────────────

  function singleArabicParagraph() {
    return [{
      text: '\uFD3F test \uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true
    }];
  }

  function arabicAndTranslation() {
    return [
      {
        text: '\uFD3F arabic \uFD3E',
        align: DocumentApp.HorizontalAlignment.CENTER,
        rtl: true
      },
      {
        text: '"translation" (Al-Fatiha 1:1)',
        align: DocumentApp.HorizontalAlignment.CENTER
      }
    ];
  }

  // Save original applyFormat and stub it
  var originalApplyFormat = applyFormat;
  var applyFormatReturnValue = null;
  applyFormat = function () { return applyFormatReturnValue; };

  // ── Tests ───────────────────────────────────────────────────

  results.push('\ninsertParagraphsAtPosition_()');

  it('cursor on empty paragraph — inserts at cursor index, removes empty, adds cleanup', function () {
    var body = createMockBody(['']);
    var cursorPara = body._children[0];
    var doc = createMockDoc(body, cursorPara);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // Should have: [content, cleanup]
    expect(body._children.length).toBe(2);
    expect(body._children[0]._text).toBe('\uFD3F test \uFD3E');
    expect(body._children[0]._ltr).toBe(false);
    expect(body._children[1]._text).toBe('');
    expect(body._children[1]._heading).toBe(DocumentApp.ParagraphHeading.NORMAL);
    expect(body._children[1]._ltr).toBe(true);
  });

  it('cursor on non-empty paragraph — inserts below, adds cleanup', function () {
    var body = createMockBody(['existing text']);
    var cursorPara = body._children[0];
    var doc = createMockDoc(body, cursorPara);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // Should have: [existing, content, cleanup]
    expect(body._children.length).toBe(3);
    expect(body._children[0]._text).toBe('existing text');
    expect(body._children[1]._text).toBe('\uFD3F test \uFD3E');
    expect(body._children[2]._text).toBe('');
    expect(body._children[2]._heading).toBe(DocumentApp.ParagraphHeading.NORMAL);
    expect(body._children[2]._ltr).toBe(true);
  });

  it('no cursor, last paragraph has text — inserts after it, adds cleanup', function () {
    var body = createMockBody(['first', 'second', '']);
    var doc = createMockDoc(body, null);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // Should have: [first, second, content, cleanup, '']
    expect(body._children.length).toBe(5);
    expect(body._children[0]._text).toBe('first');
    expect(body._children[1]._text).toBe('second');
    expect(body._children[2]._text).toBe('\uFD3F test \uFD3E');
    expect(body._children[3]._text).toBe('');
    expect(body._children[3]._heading).toBe(DocumentApp.ParagraphHeading.NORMAL);
    expect(body._children[3]._ltr).toBe(true);
    expect(body._children[4]._text).toBe('');
  });

  it('no cursor, all paragraphs empty — inserts at index 0, removes first empty, adds cleanup', function () {
    var body = createMockBody(['', '', '']);
    var doc = createMockDoc(body, null);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // Should have: [content, cleanup, '', '']
    expect(body._children.length).toBe(4);
    expect(body._children[0]._text).toBe('\uFD3F test \uFD3E');
    expect(body._children[1]._text).toBe('');
    expect(body._children[1]._heading).toBe(DocumentApp.ParagraphHeading.NORMAL);
    expect(body._children[1]._ltr).toBe(true);
  });

  it('new doc (single empty paragraph, no cursor) — content + cleanup only', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, null);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // Should have: [content, cleanup]
    expect(body._children.length).toBe(2);
    expect(body._children[0]._text).toBe('\uFD3F test \uFD3E');
    expect(body._children[1]._text).toBe('');
    expect(body._children[1]._heading).toBe(DocumentApp.ParagraphHeading.NORMAL);
  });

  it('cursor at last paragraph (non-empty) — content appended, cleanup is last', function () {
    var body = createMockBody(['first', 'last']);
    var cursorPara = body._children[1];
    var doc = createMockDoc(body, cursorPara);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // Should have: [first, last, content, cleanup]
    expect(body._children.length).toBe(4);
    expect(body._children[2]._text).toBe('\uFD3F test \uFD3E');
    expect(body._children[3]._text).toBe('');
    expect(body._children[3]._heading).toBe(DocumentApp.ParagraphHeading.NORMAL);
    expect(body._children[3]._ltr).toBe(true);
  });

  it('font warning is propagated from applyFormat', function () {
    applyFormatReturnValue = 'Font "Custom" not found. Using Amiri.';
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);

    var result = insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(result.fontWarning).toBe('Font "Custom" not found. Using Amiri.');
    applyFormatReturnValue = null;
  });

  it('two content paragraphs (Arabic + translation) — both inserted in order, cleanup follows', function () {
    var body = createMockBody(['existing']);
    var cursorPara = body._children[0];
    var doc = createMockDoc(body, cursorPara);

    insertParagraphsAtPosition_(body, doc, arabicAndTranslation(), {});

    // Should have: [existing, arabic, translation, cleanup]
    expect(body._children.length).toBe(4);
    expect(body._children[1]._text).toBe('\uFD3F arabic \uFD3E');
    expect(body._children[1]._ltr).toBe(false);
    expect(body._children[2]._text).toBe('"translation" (Al-Fatiha 1:1)');
    expect(body._children[2]._ltr).toBe(null);
    expect(body._children[3]._text).toBe('');
    expect(body._children[3]._heading).toBe(DocumentApp.ParagraphHeading.NORMAL);
    expect(body._children[3]._ltr).toBe(true);
  });

  // ── Restore ─────────────────────────────────────────────────
  applyFormat = originalApplyFormat;

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');
  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
