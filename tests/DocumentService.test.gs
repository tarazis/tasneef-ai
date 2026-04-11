/**
 * GAS-native tests for DocumentService.gs — insertParagraphsAtPosition_(),
 * insertBlockquoteTableAtPosition_(), and helpers.
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
    var para = {
      _text: text,
      _align: null,
      _ltr: null,
      _heading: null,
      _spacingBefore: null,
      _spacingAfter: null,
      _fontSize: null,
      getText: function () { return this._text; },
      setText: function (t) { this._text = t; },
      setAlignment: function (a) { this._align = a; },
      setLeftToRight: function (v) { this._ltr = v; },
      setHeading: function (h) { this._heading = h; },
      setSpacingBefore: function (pt) { this._spacingBefore = pt; },
      setSpacingAfter: function (pt) { this._spacingAfter = pt; },
      getType: function () { return DocumentApp.ElementType.PARAGRAPH; },
      asParagraph: function () { return this; },
      getParent: function () { return null; },
      editAsText: function () {
        return {
          _owner: para,
          setFontSize: function (s) { para._fontSize = s; return this; },
          getFontSize: function () { return para._fontSize; }
        };
      }
    };
    return para;
  }

  function createMockTableCell() {
    var innerParas = [createMockParagraph('')];
    return {
      _inner: innerParas,
      _bg: null,
      _padL: null,
      _padT: null,
      _padR: null,
      _padB: null,
      setBackgroundColor: function (c) { this._bg = c; },
      setPaddingLeft: function (x) { this._padL = x; },
      setPaddingTop: function (x) { this._padT = x; },
      setPaddingRight: function (x) { this._padR = x; },
      setPaddingBottom: function (x) { this._padB = x; },
      getChild: function (i) { return this._inner[i]; },
      getNumChildren: function () { return this._inner.length; },
      insertParagraph: function (childIndex, text) {
        var p = createMockParagraph(text);
        this._inner.splice(childIndex, 0, p);
        return p;
      }
    };
  }

  function createMockTable() {
    var cell = createMockTableCell();
    return {
      _cell: cell,
      getType: function () { return DocumentApp.ElementType.TABLE; },
      getRow: function () {
        return {
          getCell: function () {
            return cell;
          }
        };
      }
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
      insertTable: function (index, cells) {
        var t = createMockTable();
        this._children.splice(index, 0, t);
        return t;
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
      getId: function () { return 'mock-doc-id'; },
      getCursor: function () {
        if (!cursorParagraph) return null;
        return {
          getElement: function () { return cursorParagraph; }
        };
      },
      setCursor: function () {},
      newPosition: function () { return {}; }
    };
  }

  // ── Helpers ─────────────────────────────────────────────────

  function singleArabicParagraph() {
    return [{
      text: '\uFD3F\u00A0test\u00A0\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true
    }];
  }

  function arabicAndTranslation() {
    return [
      {
        text: '\uFD3F\u00A0arabic\u00A0\uFD3E',
        align: DocumentApp.HorizontalAlignment.CENTER,
        rtl: true,
        spacingBefore: INSERT_SPACING_OUTER_PT,
        spacingAfter: INSERT_SPACING_INNER_PT
      },
      {
        text: '"translation"',
        align: DocumentApp.HorizontalAlignment.CENTER,
        useEnglishTranslationFont: true,
        spacingAfter: INSERT_SPACING_INNER_PT
      },
      {
        text: '(Al-Fatiha\u00A01:1)',
        align: DocumentApp.HorizontalAlignment.CENTER,
        useEnglishTranslationFont: true,
        spacingAfter: INSERT_SPACING_OUTER_PT,
        fontSizeAdjustPt: -1
      }
    ];
  }

  function arabicOnlyAyahAndCitation() {
    return [
      {
        text: '\uFD3F\u00A0ayah\u00A0\uFD3E',
        align: DocumentApp.HorizontalAlignment.CENTER,
        rtl: true,
        spacingBefore: INSERT_SPACING_OUTER_PT,
        spacingAfter: INSERT_SPACING_INNER_PT
      },
      {
        text: '[\u0633\u0648\u0631\u0629:\u0661]',
        align: DocumentApp.HorizontalAlignment.CENTER,
        rtl: true,
        spacingAfter: INSERT_SPACING_OUTER_PT,
        fontSizeAdjustPt: -1
      }
    ];
  }

  // Save original applyFormat and stub it
  var originalApplyFormat = applyFormat;
  var applyFormatReturnValue = null;
  var applyFormatCalls = [];
  applyFormat = function (textEl, state) {
    applyFormatCalls.push(state);
    return applyFormatReturnValue;
  };

  // ── Tests ───────────────────────────────────────────────────

  results.push('\ninsertParagraphsAtPosition_() — positioning');

  it('cursor on empty paragraph (only child) — replaces empty, adds cleanup', function () {
    var body = createMockBody(['']);
    var cursorPara = body._children[0];
    var doc = createMockDoc(body, cursorPara);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // [content, cleanup]
    expect(body._children.length).toBe(2);
    expect(body._children[0]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[0]._ltr).toBe(false);
    expect(body._children[1]._text).toBe('');
    expect(body._children[1]._heading).toBe(DocumentApp.ParagraphHeading.NORMAL);
    expect(body._children[1]._ltr).toBe(true);
  });

  it('cursor on non-empty paragraph (last child) — inserts below, adds cleanup', function () {
    var body = createMockBody(['existing text']);
    var cursorPara = body._children[0];
    var doc = createMockDoc(body, cursorPara);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // [existing, content, cleanup]
    expect(body._children.length).toBe(3);
    expect(body._children[0]._text).toBe('existing text');
    expect(body._children[1]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[2]._text).toBe('');
    expect(body._children[2]._heading).toBe(DocumentApp.ParagraphHeading.NORMAL);
    expect(body._children[2]._ltr).toBe(true);
  });

  it('no cursor, all paragraphs empty — replaces first, NO cleanup (empties remain after)', function () {
    var body = createMockBody(['', '', '']);
    var doc = createMockDoc(body, null);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // Reuse first empty for content → [content, '', '']
    // Content is NOT last child → no cleanup
    expect(body._children.length).toBe(3);
    expect(body._children[0]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[1]._text).toBe('');
    expect(body._children[1]._heading).toBe(null);
    expect(body._children[2]._text).toBe('');
  });

  it('new doc (single empty paragraph, no cursor) — content + cleanup', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, null);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // Original empty reused for content → cleanup added
    // [content, cleanup]
    expect(body._children.length).toBe(2);
    expect(body._children[0]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[1]._text).toBe('');
    expect(body._children[1]._heading).toBe(DocumentApp.ParagraphHeading.NORMAL);
  });

  it('cursor at last paragraph (non-empty) — content appended, cleanup is last', function () {
    var body = createMockBody(['first', 'last']);
    var cursorPara = body._children[1];
    var doc = createMockDoc(body, cursorPara);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // [first, last, content, cleanup]
    expect(body._children.length).toBe(4);
    expect(body._children[2]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[3]._text).toBe('');
    expect(body._children[3]._heading).toBe(DocumentApp.ParagraphHeading.NORMAL);
    expect(body._children[3]._ltr).toBe(true);
  });

  results.push('\ninsertParagraphsAtPosition_() — conditional cleanup');

  it('no cursor, trailing empties after last non-empty — NO cleanup', function () {
    var body = createMockBody(['first', 'second', '']);
    var doc = createMockDoc(body, null);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // Insert after 'second' (index 2), trailing '' pushed to index 3
    // [first, second, content, ''] — content is NOT last → no cleanup
    expect(body._children.length).toBe(4);
    expect(body._children[0]._text).toBe('first');
    expect(body._children[1]._text).toBe('second');
    expect(body._children[2]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[3]._text).toBe('');
    expect(body._children[3]._heading).toBe(null);
  });

  it('cursor on non-empty paragraph with paragraphs below — NO cleanup', function () {
    var body = createMockBody(['first', 'second', 'third']);
    var cursorPara = body._children[0];
    var doc = createMockDoc(body, cursorPara);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // [first, content, second, third] — content is NOT last → no cleanup
    expect(body._children.length).toBe(4);
    expect(body._children[0]._text).toBe('first');
    expect(body._children[1]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[2]._text).toBe('second');
    expect(body._children[3]._text).toBe('third');
  });

  it('cursor on non-empty paragraph with only spaces paragraph below — NO cleanup', function () {
    var body = createMockBody(['first', '   ']);
    var cursorPara = body._children[0];
    var doc = createMockDoc(body, cursorPara);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // [first, content, '   '] — spaces paragraph after → no cleanup
    expect(body._children.length).toBe(3);
    expect(body._children[1]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[2]._text).toBe('   ');
    expect(body._children[2]._heading).toBe(null);
  });

  results.push('\ninsertParagraphsAtPosition_() — paragraph spacing (insert beautify)');

  it('Arabic-only two-paragraph block applies 12/6/12 pt spacing', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertParagraphsAtPosition_(body, doc, arabicOnlyAyahAndCitation(), {});
    expect(body._children[0]._spacingBefore).toBe(INSERT_SPACING_OUTER_PT);
    expect(body._children[0]._spacingAfter).toBe(INSERT_SPACING_INNER_PT);
    expect(body._children[1]._spacingBefore).toBe(null);
    expect(body._children[1]._spacingAfter).toBe(INSERT_SPACING_OUTER_PT);
  });

  it('Arabic + translation three-paragraph block applies outer and inner spacing', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertParagraphsAtPosition_(body, doc, arabicAndTranslation(), {});
    expect(body._children[0]._spacingBefore).toBe(INSERT_SPACING_OUTER_PT);
    expect(body._children[0]._spacingAfter).toBe(INSERT_SPACING_INNER_PT);
    expect(body._children[1]._spacingBefore).toBe(null);
    expect(body._children[1]._spacingAfter).toBe(INSERT_SPACING_INNER_PT);
    expect(body._children[2]._spacingBefore).toBe(null);
    expect(body._children[2]._spacingAfter).toBe(INSERT_SPACING_OUTER_PT);
  });

  results.push('\ninsertParagraphsAtPosition_() — multi-paragraph & font warning');

  it('font warning is propagated from applyFormat', function () {
    applyFormatCalls = [];
    applyFormatReturnValue = 'Font "Custom" not found. Using Amiri.';
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);

    var result = insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(result.fontWarning).toBe('Font "Custom" not found. Using Amiri.');
    applyFormatReturnValue = null;
  });

  it('translation paragraph uses Figtree and copies other format fields from sidebar state', function () {
    applyFormatCalls = [];
    applyFormatReturnValue = null;
    var fs = {
      fontName: 'Scheherazade New',
      fontVariant: '700',
      fontSize: 14,
      bold: true,
      textColor: '#112233'
    };
    var body = createMockBody(['existing']);
    var doc = createMockDoc(body, body._children[0]);

    insertParagraphsAtPosition_(body, doc, arabicAndTranslation(), fs);

    expect(applyFormatCalls.length).toBe(3);
    expect(applyFormatCalls[0]).toBe(fs);
    expect(applyFormatCalls[1].fontName).toBe('Figtree');
    expect(applyFormatCalls[1].fontVariant).toBe('regular');
    expect(applyFormatCalls[1].fontSize).toBe(12);
    expect(applyFormatCalls[1].bold).toBe(false);
    expect(applyFormatCalls[1].textColor).toBe('#112233');
    expect(applyFormatCalls[2].fontName).toBe('Figtree');
    expect(applyFormatCalls[2].fontVariant).toBe('regular');
    expect(applyFormatCalls[2].fontSize).toBe(11);
    expect(applyFormatCalls[2].bold).toBe(false);
    expect(applyFormatCalls[2].textColor).toBe('#112233');
  });

  it('Arabic citation paragraph is one point smaller than ayah', function () {
    applyFormatCalls = [];
    applyFormatReturnValue = null;
    var fs = {
      fontName: 'Amiri',
      fontVariant: 'regular',
      fontSize: 16,
      bold: false,
      textColor: '#000000'
    };
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertParagraphsAtPosition_(body, doc, arabicOnlyAyahAndCitation(), fs);
    expect(applyFormatCalls.length).toBe(2);
    expect(applyFormatCalls[0].fontSize).toBe(16);
    expect(applyFormatCalls[1].fontSize).toBe(15);
  });

  it('three content paragraphs at end — all inserted, cleanup follows', function () {
    var body = createMockBody(['existing']);
    var cursorPara = body._children[0];
    var doc = createMockDoc(body, cursorPara);

    insertParagraphsAtPosition_(body, doc, arabicAndTranslation(), {});

    // [existing, arabic, translation, citation, cleanup]
    expect(body._children.length).toBe(5);
    expect(body._children[1]._text).toBe('\uFD3F\u00A0arabic\u00A0\uFD3E');
    expect(body._children[1]._ltr).toBe(false);
    expect(body._children[2]._text).toBe('"translation"');
    expect(body._children[2]._ltr).toBe(true);
    expect(body._children[3]._text).toBe('(Al-Fatiha\u00A01:1)');
    expect(body._children[3]._ltr).toBe(true);
    expect(body._children[4]._text).toBe('');
    expect(body._children[4]._heading).toBe(DocumentApp.ParagraphHeading.NORMAL);
    expect(body._children[4]._ltr).toBe(true);
    expect(body._children[4]._spacingBefore).toBe(0);
    expect(body._children[4]._spacingAfter).toBe(0);
  });

  it('three content paragraphs with content after — NO cleanup', function () {
    var body = createMockBody(['existing', 'after']);
    var cursorPara = body._children[0];
    var doc = createMockDoc(body, cursorPara);

    insertParagraphsAtPosition_(body, doc, arabicAndTranslation(), {});

    // [existing, arabic, translation, citation, after] — no cleanup
    expect(body._children.length).toBe(5);
    expect(body._children[1]._text).toBe('\uFD3F\u00A0arabic\u00A0\uFD3E');
    expect(body._children[2]._text).toBe('"translation"');
    expect(body._children[3]._text).toBe('(Al-Fatiha\u00A01:1)');
    expect(body._children[4]._text).toBe('after');
    expect(body._children[4]._heading).toBe(null);
  });

  results.push('\ninsertParagraphsAtPosition_() — regression: sequential insertion & removeChild');

  it('sequential insert: second insertion goes AFTER citation, not between', function () {
    var body = createMockBody(['']);
    var emptyPara = body._children[0];
    var doc = createMockDoc(body, emptyPara);

    // First insert: Arabic + translation + citation into empty doc
    insertParagraphsAtPosition_(body, doc, arabicAndTranslation(), {});

    // After first insert: [arabic, translation, citation, cleanup]
    expect(body._children.length).toBe(4);
    expect(body._children[0]._text).toBe('\uFD3F\u00A0arabic\u00A0\uFD3E');
    expect(body._children[1]._text).toBe('"translation"');
    expect(body._children[2]._text).toBe('(Al-Fatiha\u00A01:1)');
    expect(body._children[3]._text).toBe('');

    // Second insert: cursor on cleanup (empty paragraph at end)
    var cleanup = body._children[3];
    var doc2 = createMockDoc(body, cleanup);
    insertParagraphsAtPosition_(body, doc2, singleArabicParagraph(), {});

    // [arabic1, translation1, citation1, arabic2, cleanup2]
    expect(body._children.length).toBe(5);
    expect(body._children[0]._text).toBe('\uFD3F\u00A0arabic\u00A0\uFD3E');
    expect(body._children[1]._text).toBe('"translation"');
    expect(body._children[2]._text).toBe('(Al-Fatiha\u00A01:1)');
    expect(body._children[3]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[4]._text).toBe('');
  });

  it('empty paragraph reuse avoids removeChild entirely', function () {
    var body = createMockBody(['']);
    var removeChildCalled = false;
    var origRemoveChild = body.removeChild;
    body.removeChild = function () {
      removeChildCalled = true;
      throw new Error("Can't remove the last paragraph in a document section.");
    };
    var doc = createMockDoc(body, body._children[0]);

    var result = insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(removeChildCalled).toBe(false);
    expect(result.fontWarning).toBe(null);
    expect(body._children[0]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    body.removeChild = origRemoveChild;
  });

  results.push('\ninsertBlockquoteTableAtPosition_()');

  it('blockquote: empty doc — table + bottom buffer + typing paragraph; inner spacing matches', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, arabicOnlyAyahAndCitation(), {});

    // insertIndex=0 → no top buffer; [TABLE, bottomBuffer, typingParagraph]
    expect(body._children.length).toBe(3);
    expect(body._children[0].getType()).toBe(DocumentApp.ElementType.TABLE);
    expect(body._children[1]._text).toBe('');
    expect(body._children[1]._fontSize).toBe(1);
    expect(body._children[1]._spacingBefore).toBe(INSERT_SPACING_OUTER_PT);
    expect(body._children[1]._spacingAfter).toBe(0);
    expect(body._children[2]._text).toBe('');
    expect(body._children[2]._heading).toBe(DocumentApp.ParagraphHeading.NORMAL);
    expect(body._children[2]._ltr).toBe(true);

    var cell = body._children[0]._cell;
    expect(cell._bg).toBe(null);
    expect(cell._padL).toBe(21);
    expect(cell._padT).toBe(6);
    expect(cell._padR).toBe(18);
    expect(cell._padB).toBe(6);
    expect(cell._inner.length).toBe(2);
    expect(cell._inner[0]._spacingBefore).toBe(INSERT_SPACING_OUTER_PT);
    expect(cell._inner[0]._spacingAfter).toBe(INSERT_SPACING_INNER_PT);
    expect(cell._inner[1]._spacingAfter).toBe(INSERT_SPACING_OUTER_PT);
  });

  it('blockquote: three paragraphs in cell with translation spacing', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, arabicAndTranslation(), {});

    // [TABLE, bottomBuffer, typingParagraph]
    expect(body._children.length).toBe(3);
    var cell = body._children[0]._cell;
    expect(cell._inner.length).toBe(3);
    expect(cell._inner[0]._spacingBefore).toBe(INSERT_SPACING_OUTER_PT);
    expect(cell._inner[0]._spacingAfter).toBe(INSERT_SPACING_INNER_PT);
    expect(cell._inner[1]._spacingAfter).toBe(INSERT_SPACING_INNER_PT);
    expect(cell._inner[2]._spacingAfter).toBe(INSERT_SPACING_OUTER_PT);
  });

  it('blockquote: non-empty doc — top buffer, table, bottom buffer, typing paragraph', function () {
    var body = createMockBody(['existing', 'after']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    // cursor on 'existing' (non-empty) → insertIndex 1 → top buffer at 1, table at 2
    // [existing, topBuffer, TABLE, bottomBuffer, typingParagraph, after]
    expect(body._children.length).toBe(6);
    expect(body._children[0]._text).toBe('existing');
    expect(body._children[1]._text).toBe('');
    expect(body._children[1]._fontSize).toBe(1);
    expect(body._children[1]._spacingBefore).toBe(0);
    expect(body._children[1]._spacingAfter).toBe(INSERT_SPACING_OUTER_PT);
    expect(body._children[2].getType()).toBe(DocumentApp.ElementType.TABLE);
    expect(body._children[3]._text).toBe('');
    expect(body._children[3]._fontSize).toBe(1);
    expect(body._children[3]._spacingBefore).toBe(INSERT_SPACING_OUTER_PT);
    expect(body._children[3]._spacingAfter).toBe(0);
    expect(body._children[4]._text).toBe('');
    expect(body._children[4]._heading).toBe(DocumentApp.ParagraphHeading.NORMAL);
    expect(body._children[4]._ltr).toBe(true);
    expect(body._children[5]._text).toBe('after');
  });

  it('blockquote: empty doc skips top buffer paragraph', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    // insertIndex=0 → no top buffer; first child is the table
    expect(body._children[0].getType()).toBe(DocumentApp.ElementType.TABLE);
    expect(body._children[0]._cell._inner[0]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
  });

  it('blockquote: buffer paragraphs have 1pt font and outer spacing', function () {
    var body = createMockBody(['content above', 'more content']);
    var doc = createMockDoc(body, body._children[1]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    // cursor on 'more content' (non-empty, last) → insertIndex 2, top buffer at 2, table at 3
    // [content above, more content, topBuffer, TABLE, bottomBuffer, typingParagraph]
    var topBuf = body._children[2];
    expect(topBuf._text).toBe('');
    expect(topBuf._fontSize).toBe(1);
    expect(topBuf._spacingBefore).toBe(0);
    expect(topBuf._spacingAfter).toBe(INSERT_SPACING_OUTER_PT);

    var bottomBuf = body._children[4];
    expect(bottomBuf._text).toBe('');
    expect(bottomBuf._fontSize).toBe(1);
    expect(bottomBuf._spacingBefore).toBe(INSERT_SPACING_OUTER_PT);
    expect(bottomBuf._spacingAfter).toBe(0);
  });

  it('blockquote: typing paragraph has default formatting', function () {
    var body = createMockBody(['text']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    // [text, topBuffer, TABLE, bottomBuffer, typingParagraph]
    var typing = body._children[4];
    expect(typing._text).toBe('');
    expect(typing._heading).toBe(DocumentApp.ParagraphHeading.NORMAL);
    expect(typing._ltr).toBe(true);
    expect(typing._fontSize).toBe(null);
  });

  it('hexToDocsRgb01_ parses normalized hex for Docs border color', function () {
    var rgb = hexToDocsRgb01_('#3A8F7A');
    expect(rgb.red > 0.2 && rgb.red < 0.25).toBe(true);
    expect(rgb.green > 0.55 && rgb.green < 0.58).toBe(true);
    expect(rgb.blue > 0.46 && rgb.blue < 0.49).toBe(true);
  });

  // ── resolveTableStartIndexForDocsApi_ ──────────────────────

  results.push('\nresolveTableStartIndexForDocsApi_()');

  var originalDocs = typeof Docs !== 'undefined' ? Docs : undefined;

  function stubDocsGet(contentArray) {
    Docs = {
      Documents: {
        get: function () {
          return { body: { content: contentArray } };
        },
        batchUpdate: function () {}
      }
    };
  }

  function restoreDocs() {
    if (originalDocs !== undefined) {
      Docs = originalDocs;
    }
  }

  it('ordinal 1 returns startIndex of the only table', function () {
    stubDocsGet([
      { sectionBreak: {} },
      { paragraph: {}, startIndex: 0 },
      { table: {}, startIndex: 42 }
    ]);
    var result = resolveTableStartIndexForDocsApi_('fake-id', 1);
    expect(result).toBe(42);
    restoreDocs();
  });

  it('ordinal 3 returns startIndex of the third table (skips paragraphs)', function () {
    stubDocsGet([
      { sectionBreak: {} },
      { paragraph: {}, startIndex: 0 },
      { table: {}, startIndex: 10 },
      { paragraph: {}, startIndex: 20 },
      { table: {}, startIndex: 30 },
      { paragraph: {}, startIndex: 50 },
      { table: {}, startIndex: 70 }
    ]);
    var result = resolveTableStartIndexForDocsApi_('fake-id', 3);
    expect(result).toBe(70);
    restoreDocs();
  });

  it('ordinal 2 with only 1 table returns null (propagation delay)', function () {
    stubDocsGet([
      { sectionBreak: {} },
      { table: {}, startIndex: 10 },
      { paragraph: {}, startIndex: 30 }
    ]);
    var result = resolveTableStartIndexForDocsApi_('fake-id', 2);
    expect(result).toBe(null);
    restoreDocs();
  });

  it('ordinal 0 returns null (invalid)', function () {
    stubDocsGet([
      { sectionBreak: {} },
      { table: {}, startIndex: 10 }
    ]);
    var result = resolveTableStartIndexForDocsApi_('fake-id', 0);
    expect(result).toBe(null);
    restoreDocs();
  });

  it('empty content array returns null', function () {
    stubDocsGet([]);
    var result = resolveTableStartIndexForDocsApi_('fake-id', 1);
    expect(result).toBe(null);
    restoreDocs();
  });

  // ── tableOrdinal computation in insertBlockquoteTableAtPosition_ ──

  results.push('\ninsertBlockquoteTableAtPosition_() — ordinal targeting');

  var capturedTableOrdinal = null;
  var originalApplyBorders = applyBlockquoteCellBordersViaDocsApi_;
  applyBlockquoteCellBordersViaDocsApi_ = function (docId, tableOrdinal) {
    capturedTableOrdinal = tableOrdinal;
  };

  it('single table in empty doc gets tableOrdinal 1', function () {
    capturedTableOrdinal = null;
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});
    expect(capturedTableOrdinal).toBe(1);
  });

  it('new table after one pre-existing table gets tableOrdinal 2', function () {
    capturedTableOrdinal = null;
    var body = createMockBody(['text before', 'cursor here']);
    var existingTable = createMockTable();
    body._children.splice(1, 0, existingTable);
    var cursorPara = body._children[2];
    var doc = createMockDoc(body, cursorPara);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});
    expect(capturedTableOrdinal).toBe(2);
  });

  it('new table between two pre-existing tables gets tableOrdinal 2', function () {
    capturedTableOrdinal = null;
    var body = createMockBody(['before', 'middle', 'after']);
    var table1 = createMockTable();
    body._children.splice(1, 0, table1);
    var table2 = createMockTable();
    body._children.splice(3, 0, table2);
    // body: [para"before", table1, para"middle", table2, para"after"]
    var cursorPara = body._children[2]; // para "middle"
    var doc = createMockDoc(body, cursorPara);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});
    // inserted after "middle" at index 3, pushing table2 to 4
    // body: [para"before", table1, para"middle", newTable, table2, para"after"]
    expect(capturedTableOrdinal).toBe(2);
  });

  applyBlockquoteCellBordersViaDocsApi_ = originalApplyBorders;

  // ── Restore ─────────────────────────────────────────────────
  applyFormat = originalApplyFormat;

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');
  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
