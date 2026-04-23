/**
 * GAS-native tests for DocumentService.gs — resolveNativeInsertAnchor_(),
 * insertParagraphsAtPosition_(), insertBlockquoteTableAtPosition_(), and helpers (no Docs API).
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

  function xit(label) {
    results.push('  (skipped) ' + label);
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

  function createMockText(textContent, parentEl) {
    return {
      _text: textContent,
      _parent: parentEl,
      getText: function () { return this._text; },
      getType: function () { return DocumentApp.ElementType.TEXT; },
      asText: function () { return this; },
      getParent: function () { return this._parent; }
    };
  }

  function createMockParagraph(text) {
    var para = {
      _text: text,
      _textChildren: [],
      _align: null,
      _ltr: null,
      _heading: null,
      _spacingBefore: null,
      _spacingAfter: null,
      _lineSpacing: null,
      _fontSize: null,
      getText: function () { return this._text; },
      setText: function (t) { this._text = t; },
      setAlignment: function (a) { this._align = a; },
      setLeftToRight: function (v) { this._ltr = v; },
      setHeading: function (h) { this._heading = h; },
      setSpacingBefore: function (pt) { this._spacingBefore = pt; },
      setSpacingAfter: function (pt) { this._spacingAfter = pt; },
      getSpacingBefore: function () { return this._spacingBefore; },
      getSpacingAfter: function () { return this._spacingAfter; },
      setLineSpacing: function (factor) { this._lineSpacing = factor; },
      getLineSpacing: function () { return this._lineSpacing; },
      getType: function () { return DocumentApp.ElementType.PARAGRAPH; },
      asParagraph: function () { return this; },
      getParent: function () { return null; },
      getChild: function (i) { return this._textChildren[i]; },
      getNumChildren: function () { return this._textChildren.length; },
      getChildIndex: function (child) {
        for (var j = 0; j < this._textChildren.length; j++) {
          if (this._textChildren[j] === child) return j;
        }
        throw new Error('Element does not contain the specified child element.');
      },
      editAsText: function () {
        return {
          _owner: para,
          setFontSize: function (s) { para._fontSize = s; return this; },
          getFontSize: function () { return para._fontSize; }
        };
      }
    };
    para._textChildren = [createMockText(text, para)];
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
      _width: null,
      setBackgroundColor: function (c) { this._bg = c; },
      setWidth: function (w) { this._width = w; },
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
    var accentCell = createMockTableCell();
    var contentCell = createMockTableCell();
    return {
      _cell: contentCell,
      _accentCell: accentCell,
      _contentCell: contentCell,
      getType: function () { return DocumentApp.ElementType.TABLE; },
      getRow: function () {
        var ac = accentCell;
        var cc = contentCell;
        return {
          getCell: function (i) {
            return i === 0 ? ac : cc;
          }
        };
      },
      setBorderWidth: function () {}
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
        throw new Error('Element does not contain the specified child element.');
      },
      insertParagraph: function (index, text) {
        var p = createMockParagraph(text);
        this._children.splice(index, 0, p);
        return p;
      },
      insertListItem: function (index, text) {
        var li = createMockParagraph(text);
        li.getType = function () { return DocumentApp.ElementType.LIST_ITEM; };
        li.asListItem = function () { return this; };
        li.getListId = function () { return 'mock-list'; };
        this._children.splice(index, 0, li);
        return li;
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

  /**
   * @param {*} body
   * @param {*} cursorElement - element for cursor (or null)
   * @param {Array} selectionElements - optional range elements (see mockRangeEl_)
   */
  function createMockDoc(body, cursorElement, selectionElements, cursorOffset) {
    return {
      getBody: function () { return body; },
      getId: function () { return 'mock-doc-id'; },
      getCursor: function () {
        if (!cursorElement) return null;
        return {
          getElement: function () { return cursorElement; },
          getOffset: function () {
            if (typeof cursorOffset === 'number') return cursorOffset;
            return (cursorElement && typeof cursorElement.getText === 'function')
              ? cursorElement.getText().length
              : 0;
          }
        };
      },
      getSelection: function () {
        if (!selectionElements || selectionElements.length === 0) return null;
        return {
          getRangeElements: function () {
            return selectionElements;
          }
        };
      },
      setCursor: function () {},
      newPosition: function () { return {}; }
    };
  }

  function mockRangeEl_(element) {
    return {
      getElement: function () { return element; },
      isPartial: function () { return false; },
      getEndOffsetInclusive: function () { return 0; }
    };
  }

  // ── Helpers ─────────────────────────────────────────────────

  function singleArabicParagraph() {
    return [{
      text: '\uFD3F\u00A0test\u00A0\uFD3E',
      align: DocumentApp.HorizontalAlignment.CENTER,
      rtl: true,
      insertTextRole: 'quran'
    }];
  }

  function arabicAndTranslation() {
    return [
      {
        text: '\uFD3F\u00A0arabic\u00A0\uFD3E',
        align: DocumentApp.HorizontalAlignment.CENTER,
        rtl: true,
        insertTextRole: 'quran'
      },
      {
        text: '"translation"',
        align: DocumentApp.HorizontalAlignment.CENTER,
        insertTextRole: 'translation',
        spacingAfter: INSERT_SPACING_INNER_PT
      },
      {
        text: 'Al-Fatiha\u00A01:1',
        align: DocumentApp.HorizontalAlignment.CENTER,
        insertTextRole: 'citation'
      }
    ];
  }

  /** Single ornate ayah when translation is off (matches insertAyah / insertAyahRange). */
  function arabicOnlyAyahInsert() {
    return [
      {
        text: '\uFD3F\u00A0ayah\u00A0\uFD3E',
        align: DocumentApp.HorizontalAlignment.CENTER,
        rtl: true,
        insertTextRole: 'quran'
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

  it('cursor on empty paragraph (only child) — replaces empty without cleanup paragraph', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // [content]
    expect(body._children.length).toBe(1);
    expect(body._children[0]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[0]._ltr).toBe(false);
  });

  it('cursor on non-empty paragraph (last child) — inserts content directly after paragraph', function () {
    var body = createMockBody(['existing text']);
    var doc = createMockDoc(body, body._children[0]);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // [existing, content]
    expect(body._children.length).toBe(2);
    expect(body._children[0]._text).toBe('existing text');
    expect(body._children[1]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
  });

  it('no cursor, all paragraphs empty — appends content without extra buffers', function () {
    var body = createMockBody(['', '', '']);
    var doc = createMockDoc(body, null);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // Fallback baseIndex=3 → [e0,e1,e2, content]
    expect(body._children.length).toBe(4);
    expect(body._children[2]._text).toBe('');
    expect(body._children[3]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
  });

  it('new doc (single empty paragraph, no cursor) — reuses empty paragraph only', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, null);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // Original empty reused for content
    // [content]
    expect(body._children.length).toBe(1);
    expect(body._children[0]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
  });

  it('cursor at last paragraph (non-empty) — inserts content as last child', function () {
    var body = createMockBody(['first', 'last']);
    var doc = createMockDoc(body, body._children[1]);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // [first, last, content]
    expect(body._children.length).toBe(3);
    expect(body._children[2]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
  });

  results.push('\ninsertParagraphsAtPosition_() — placement when not at doc end');

  it('no cursor, trailing empties after last non-empty — appends content after trailing empties', function () {
    var body = createMockBody(['first', 'second', '']);
    var doc = createMockDoc(body, null);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // [first, second, '', content]
    expect(body._children.length).toBe(4);
    expect(body._children[0]._text).toBe('first');
    expect(body._children[1]._text).toBe('second');
    expect(body._children[2]._text).toBe('');
    expect(body._children[3]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
  });

  it('cursor at first paragraph with paragraphs below — inserts content then keeps following paragraphs', function () {
    var body = createMockBody(['first', 'second', 'third']);
    var doc = createMockDoc(body, body._children[0]);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // [first, content, second, third]
    expect(body._children.length).toBe(4);
    expect(body._children[0]._text).toBe('first');
    expect(body._children[1]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[2]._text).toBe('second');
    expect(body._children[3]._text).toBe('third');
  });

  it('cursor at first with only spaces paragraph below — inserts content before spaces paragraph', function () {
    var body = createMockBody(['first', '   ']);
    var doc = createMockDoc(body, body._children[0]);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children.length).toBe(3);
    expect(body._children[1]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[2]._text).toBe('   ');
  });

  results.push('\ninsertParagraphsAtPosition_() — paragraph spacing (insert beautify)');

  it('Arabic-only single ayah applies no extra paragraph spacing', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertParagraphsAtPosition_(body, doc, arabicOnlyAyahInsert(), {});
    expect(body._children[0]._spacingBefore).toBe(TARGET_SPACING_PT);
    expect(body._children[0]._spacingAfter).toBe(TARGET_SPACING_PT);
    expect(body._children.length).toBe(1);
  });

  it('Arabic + translation three-paragraph block: no inner spacing after Arabic; gap after translation', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertParagraphsAtPosition_(body, doc, arabicAndTranslation(), {});
    expect(body._children[0]._spacingBefore).toBe(TARGET_SPACING_PT);
    expect(body._children[0]._spacingAfter).toBe(null);
    expect(body._children[1]._spacingBefore).toBe(null);
    expect(body._children[1]._spacingAfter).toBe(INSERT_SPACING_INNER_PT);
    expect(body._children[2]._spacingBefore).toBe(null);
    expect(body._children[2]._spacingAfter).toBe(TARGET_SPACING_PT);
    expect(body._children.length).toBe(3);
  });

  it('Quran paragraph uses 1.3 line spacing', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});
    expect(body._children[0]._lineSpacing).toBe(INSERT_QURAN_LINE_SPACING);
  });

  it('translation and citation paragraphs are not set to Quran line spacing', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertParagraphsAtPosition_(body, doc, arabicAndTranslation(), {});
    expect(body._children[0]._lineSpacing).toBe(INSERT_QURAN_LINE_SPACING);
    expect(body._children[1]._lineSpacing).toBe(null);
    expect(body._children[2]._lineSpacing).toBe(null);
  });

  it('single insert subtracts previous paragraph spacingAfter from target', function () {
    var body = createMockBody(['above']);
    body._children[0].setSpacingAfter(4);
    var doc = createMockDoc(body, body._children[0]);
    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});
    expect(body._children[1]._spacingBefore).toBe(TARGET_SPACING_PT);
    expect(body._children[1]._spacingAfter).toBe(TARGET_SPACING_PT);
  });

  it('cursor at paragraph start subtracts next paragraph spacingBefore from target', function () {
    var body = createMockBody(['current']);
    body._children[0].setSpacingBefore(5);
    var doc = createMockDoc(body, body._children[0], null, 0);
    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});
    expect(body._children[0]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[0]._spacingBefore).toBe(TARGET_SPACING_PT);
    expect(body._children[0]._spacingAfter).toBe(TARGET_SPACING_PT);
  });

  it('selection insertion keeps behavior and normalizes spacing from neighbors', function () {
    var body = createMockBody(['first', 'selected', 'after']);
    body._children[1].setSpacingAfter(3);
    body._children[2].setSpacingBefore(2);
    var doc = createMockDoc(body, null, [mockRangeEl_(body._children[1])]);
    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});
    expect(body._children[2]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[2]._spacingBefore).toBe(TARGET_SPACING_PT);
    expect(body._children[2]._spacingAfter).toBe(TARGET_SPACING_PT);
  });

  it('multi-paragraph insert keeps inner spacing after translation and adjusts outer boundaries', function () {
    var body = createMockBody(['before', 'after']);
    body._children[0].setSpacingAfter(2);
    body._children[1].setSpacingBefore(9);
    var doc = createMockDoc(body, body._children[0]);
    insertParagraphsAtPosition_(body, doc, arabicAndTranslation(), {});
    expect(body._children[1]._spacingBefore).toBe(TARGET_SPACING_PT);
    expect(body._children[1]._spacingAfter).toBe(null);
    expect(body._children[2]._spacingAfter).toBe(INSERT_SPACING_INNER_PT);
    expect(body._children[3]._spacingAfter).toBe(TARGET_SPACING_PT);
  });

  it('when previous spacing is greater than target, inserted spacing remains fixed', function () {
    var body = createMockBody(['before', 'after']);
    body._children[0].setSpacingAfter(18);
    body._children[1].setSpacingBefore(4);
    var doc = createMockDoc(body, body._children[0]);
    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});
    expect(body._children[1]._spacingBefore).toBe(TARGET_SPACING_PT);
    expect(body._children[1]._spacingAfter).toBe(TARGET_SPACING_PT);
  });

  it('when next spacing is greater than target, inserted spacing remains fixed', function () {
    var body = createMockBody(['before', 'after']);
    body._children[0].setSpacingAfter(3);
    body._children[1].setSpacingBefore(16);
    var doc = createMockDoc(body, body._children[0]);
    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});
    expect(body._children[1]._spacingBefore).toBe(TARGET_SPACING_PT);
    expect(body._children[1]._spacingAfter).toBe(TARGET_SPACING_PT);
  });

  it('when both neighbors exceed target, inserted spacing remains fixed', function () {
    var body = createMockBody(['before', 'after']);
    body._children[0].setSpacingAfter(15);
    body._children[1].setSpacingBefore(13);
    var doc = createMockDoc(body, body._children[0]);
    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});
    expect(body._children[1]._spacingBefore).toBe(TARGET_SPACING_PT);
    expect(body._children[1]._spacingAfter).toBe(TARGET_SPACING_PT);
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

  it('translation uses Figtree; Arabic Quran uses Amiri regular regardless of sidebar state', function () {
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

    // [existing, arabic, translation, citation]
    expect(body._children.length).toBe(4);
    expect(applyFormatCalls.length).toBe(3);
    expect(applyFormatCalls[0].fontName).toBe('Amiri');
    expect(applyFormatCalls[0].fontVariant).toBe('regular');
    expect(applyFormatCalls[0].fontSize).toBe(16);
    expect(applyFormatCalls[0].bold).toBe(false);
    expect(applyFormatCalls[0].textColor).toBe('#1A1A1A');
    expect(applyFormatCalls[1].fontName).toBe('Figtree');
    expect(applyFormatCalls[1].fontVariant).toBe('regular');
    expect(applyFormatCalls[1].fontSize).toBe(12);
    expect(applyFormatCalls[1].bold).toBe(false);
    expect(applyFormatCalls[1].textColor).toBe('#1A1A1A');
    expect(applyFormatCalls[2].fontName).toBe('Figtree');
    expect(applyFormatCalls[2].fontVariant).toBe('italic');
    expect(applyFormatCalls[2].fontSize).toBe(11);
    expect(applyFormatCalls[2].bold).toBe(false);
    expect(applyFormatCalls[2].textColor).toBe('#1A1A1A');
  });

  it('Arabic-only insert applies single Quran format call', function () {
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
    insertParagraphsAtPosition_(body, doc, arabicOnlyAyahInsert(), fs);
    expect(applyFormatCalls.length).toBe(1);
    expect(applyFormatCalls[0].fontSize).toBe(16);
    expect(applyFormatCalls[0].textColor).toBe('#1A1A1A');
    expect(applyFormatCalls[0].bold).toBe(false);
  });

  it('three content paragraphs at end — inserted directly with no cleanup paragraph', function () {
    var body = createMockBody(['existing']);
    var doc = createMockDoc(body, body._children[0]);

    insertParagraphsAtPosition_(body, doc, arabicAndTranslation(), {});

    // [existing, arabic, translation, citation]
    expect(body._children.length).toBe(4);
    expect(body._children[1]._text).toBe('\uFD3F\u00A0arabic\u00A0\uFD3E');
    expect(body._children[1]._ltr).toBe(false);
    expect(body._children[2]._text).toBe('"translation"');
    expect(body._children[2]._ltr).toBe(true);
    expect(body._children[3]._text).toBe('Al-Fatiha\u00A01:1');
    expect(body._children[3]._ltr).toBe(true);
  });

  it('three content paragraphs with content after — inserted directly before following paragraph', function () {
    var body = createMockBody(['existing', 'after']);
    var doc = createMockDoc(body, body._children[0]);

    insertParagraphsAtPosition_(body, doc, arabicAndTranslation(), {});

    // [existing, arabic, translation, citation, after]
    expect(body._children.length).toBe(5);
    expect(body._children[1]._text).toBe('\uFD3F\u00A0arabic\u00A0\uFD3E');
    expect(body._children[2]._text).toBe('"translation"');
    expect(body._children[3]._text).toBe('Al-Fatiha\u00A01:1');
    expect(body._children[4]._text).toBe('after');
  });

  results.push('\ninsertParagraphsAtPosition_() — regression: sequential insertion & removeChild');

  it('sequential insert: second insertion goes AFTER citation, not between', function () {
    var body = createMockBody(['']);
    var emptyPara = body._children[0];
    var doc = createMockDoc(body, emptyPara);

    insertParagraphsAtPosition_(body, doc, arabicAndTranslation(), {});

    // After first insert: [arabic, translation, citation]
    expect(body._children.length).toBe(3);
    expect(body._children[0]._text).toBe('\uFD3F\u00A0arabic\u00A0\uFD3E');
    expect(body._children[1]._text).toBe('"translation"');
    expect(body._children[2]._text).toBe('Al-Fatiha\u00A01:1');

    var doc2 = createMockDoc(body, body._children[2]);
    insertParagraphsAtPosition_(body, doc2, singleArabicParagraph(), {});

    // [arabic1, translation1, citation1, arabic2]
    expect(body._children.length).toBe(4);
    expect(body._children[0]._text).toBe('\uFD3F\u00A0arabic\u00A0\uFD3E');
    expect(body._children[1]._text).toBe('"translation"');
    expect(body._children[2]._text).toBe('Al-Fatiha\u00A01:1');
    expect(body._children[3]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
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

  it('blockquote: empty doc — table only; inner spacing matches', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, arabicOnlyAyahInsert(), {});

    expect(body._children.length).toBe(1);
    expect(body._children[0].getType()).toBe(DocumentApp.ElementType.TABLE);

    var tbl = body._children[0];
    var accent = tbl._accentCell;
    var cell = tbl._contentCell;
    expect(accent._bg).toBe('#0d6e4f');
    expect(accent._width).toBe(3);
    expect(accent._padL).toBe(0);
    expect(accent._padT).toBe(0);
    expect(accent._padR).toBe(0);
    expect(accent._padB).toBe(0);
    expect(cell._bg).toBe('#F7F5F0');
    expect(cell._padL).toBe(18);
    expect(cell._padT).toBe(18);
    expect(cell._padR).toBe(18);
    expect(cell._padB).toBe(18);
    expect(cell._inner.length).toBe(1);
    expect(cell._inner[0]._spacingBefore).toBe(null);
    expect(cell._inner[0]._spacingAfter).toBe(null);
  });

  it('blockquote: three paragraphs in cell with translation spacing', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, arabicAndTranslation(), {});

    expect(body._children.length).toBe(1);
    var cell = body._children[0]._cell;
    expect(cell._inner.length).toBe(3);
    expect(cell._inner[0]._spacingBefore).toBe(null);
    expect(cell._inner[0]._spacingAfter).toBe(null);
    expect(cell._inner[1]._spacingAfter).toBe(INSERT_SPACING_INNER_PT);
    expect(cell._inner[2]._spacingAfter).toBe(null);
  });

  it('blockquote: non-empty doc — inserts table directly before following paragraph', function () {
    var body = createMockBody(['existing', 'after']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    // [existing, TABLE, after]
    expect(body._children.length).toBe(3);
    expect(body._children[0]._text).toBe('existing');
    expect(body._children[1].getType()).toBe(DocumentApp.ElementType.TABLE);
    expect(body._children[2]._text).toBe('after');
  });

  it('blockquote: empty doc skips top buffer paragraph', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children[0].getType()).toBe(DocumentApp.ElementType.TABLE);
    expect(body._children[0]._cell._inner[0]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
  });

  it('blockquote: insertion at end does not add typing paragraph', function () {
    var body = createMockBody(['content above', 'more content']);
    var doc = createMockDoc(body, body._children[1]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    // [above, more, TABLE]
    expect(body._children.length).toBe(3);
    expect(body._children[0]._text).toBe('content above');
    expect(body._children[1]._text).toBe('more content');
    expect(body._children[2].getType()).toBe(DocumentApp.ElementType.TABLE);
  });

  it('blockquote: empty doc with removeChild failure keeps original paragraph as sibling', function () {
    var body = createMockBody(['']);
    var origPara = body._children[0];
    var origRemoveChild = body.removeChild;
    body.removeChild = function () {
      throw new Error("Can't remove the last paragraph in a document section.");
    };
    var doc = createMockDoc(body, origPara);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children.length).toBe(2);
    expect(body._children[0].getType()).toBe(DocumentApp.ElementType.TABLE);
    expect(body._children[1]).toBe(origPara);
    body.removeChild = origRemoveChild;
  });

  // ── resolveNativeInsertAnchor_ — selection end + cursor split ──

  results.push('\nresolveNativeInsertAnchor_() — selection end + block-boundary cursor');

  it('cursor on non-empty paragraph inserts after it', function () {
    var body = createMockBody(['first', 'second', 'third']);
    var doc = createMockDoc(body, body._children[1]);
    var anchor = resolveNativeInsertAnchor_(body, doc);
    expect(anchor.baseIndex).toBe(2);
    expect(anchor.removeTarget).toBe(null);
  });

  it('cursor on empty paragraph reuses it', function () {
    var body = createMockBody(['first', '', 'third']);
    var doc = createMockDoc(body, body._children[1]);
    var anchor = resolveNativeInsertAnchor_(body, doc);
    expect(anchor.baseIndex).toBe(1);
    expect(anchor.removeTarget).toBe(body._children[1]);
  });

  it('cursor on TEXT child of paragraph inserts after that paragraph', function () {
    var body = createMockBody(['hello world']);
    var textEl = body._children[0]._textChildren[0];
    var doc = createMockDoc(body, textEl);
    var anchor = resolveNativeInsertAnchor_(body, doc);
    expect(anchor.baseIndex).toBe(1);
    expect(anchor.removeTarget).toBe(null);
  });

  it('selection on non-empty paragraph inserts after it', function () {
    var body = createMockBody(['first', 'second', 'third']);
    var doc = createMockDoc(body, null, [mockRangeEl_(body._children[1])]);
    var anchor = resolveNativeInsertAnchor_(body, doc);
    expect(anchor.baseIndex).toBe(2);
    expect(anchor.removeTarget).toBe(null);
  });

  it('selection on empty paragraph reuses it', function () {
    var body = createMockBody(['first', '', 'third']);
    var doc = createMockDoc(body, null, [mockRangeEl_(body._children[1])]);
    var anchor = resolveNativeInsertAnchor_(body, doc);
    expect(anchor.baseIndex).toBe(2);
    expect(anchor.removeTarget).toBe(null);
  });

  // ── resolveNativeInsertAnchor_ — nested cursor (inside table cell) ──

  results.push('\nresolveNativeInsertAnchor_() — nested cursor inside table');

  // Skipped: cell paragraph is not a body child — body.getChildIndex fails until we use
  // resolveBodyLevelAncestor_ for this path (see #144).
  xit('cursor inside table cell paragraph resolves after table');

  it('selection inside table cell resolves after table', function () {
    var body = createMockBody(['before']);
    var tbl = createMockTable();
    body._children.push(tbl);
    body._children.push(createMockParagraph('after'));
    var cellPara = tbl._cell._inner[0];
    cellPara.getParent = function () { return tbl; };
    var doc = createMockDoc(body, null, [mockRangeEl_(cellPara)]);
    var anchor = resolveNativeInsertAnchor_(body, doc);
    expect(anchor.baseIndex).toBe(2);
    expect(anchor.removeTarget).toBe(null);
  });

  // ── resolveNativeInsertAnchor_ — list ──

  results.push('\nresolveNativeInsertAnchor_() — list items');

  function createMockListItem(text, listId) {
    var li = createMockParagraph(text);
    li.getType = function () { return DocumentApp.ElementType.LIST_ITEM; };
    li.asListItem = function () { return this; };
    li.getListId = function () { return listId; };
    return li;
  }

  it('cursor in list — anchor after current list item at cursor end', function () {
    var body = createMockBody(['intro']);
    body._children.push(createMockListItem('one', 'L9'));
    body._children.push(createMockListItem('two', 'L9'));
    var doc = createMockDoc(body, body._children[1]);
    var anchor = resolveNativeInsertAnchor_(body, doc);
    expect(anchor.baseIndex).toBe(2);
  });

  it('cursor in middle of paragraph does not split text; inserts at boundary', function () {
    var body = createMockBody(['The quick brown fox', 'after']);
    var doc = createMockDoc(body, body._children[0], null, 1);
    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});
    expect(body._children[0]._text).toBe('The quick brown fox');
    expect(body._children[1]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[2]._text).toBe('after');
  });

  // ── End-to-end: blockquote insert with cursor in table cell ──

  results.push('\ninsertBlockquoteTableAtPosition_() — cursor in table cell');

  // Skipped: same nested table-cell cursor issue as above (#144).
  xit('blockquote: cursor in table cell inserts table after the existing table');

  // ── End-to-end: cursor in middle or beginning of paragraph (no split) ──

  results.push('\ninsertBlockquoteTableAtPosition_() — cursor in paragraph (no split)');

  it('blockquote: cursor on paragraph inserts table after it', function () {
    var body = createMockBody(['hello world', 'after']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    // ["hello world", TABLE, "after"]
    expect(body._children[0]._text).toBe('hello world');
    expect(body._children[1].getType()).toBe(DocumentApp.ElementType.TABLE);
    expect(body._children[2]._text).toBe('after');
  });

  it('plain: cursor on paragraph inserts content after it', function () {
    var body = createMockBody(['hello world', 'after']);
    var doc = createMockDoc(body, body._children[0]);
    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // ["hello world", content, "after"]
    expect(body._children[0]._text).toBe('hello world');
    expect(body._children[1]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[2]._text).toBe('after');
  });

  it('blockquote: cursor on second of three paragraphs inserts after it', function () {
    var body = createMockBody(['first', 'second', 'third']);
    var doc = createMockDoc(body, body._children[1]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    // ["first", "second", TABLE, "third"]
    expect(body._children[0]._text).toBe('first');
    expect(body._children[1]._text).toBe('second');
    expect(body._children[2].getType()).toBe(DocumentApp.ElementType.TABLE);
    expect(body._children[3]._text).toBe('third');
  });

  it('plain: cursor on second of three paragraphs inserts after it', function () {
    var body = createMockBody(['first', 'second', 'third']);
    var doc = createMockDoc(body, body._children[1]);
    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    // ["first", "second", content, "third"]
    expect(body._children[0]._text).toBe('first');
    expect(body._children[1]._text).toBe('second');
    expect(body._children[2]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[3]._text).toBe('third');
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
