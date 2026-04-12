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
      _parentBody: null,
      _text: text,
      _textChildren: [],
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
      getParent: function () { return this._parentBody; },
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

  function createMockListItem(text, listId, nestingLevel) {
    var li = createMockParagraph(text);
    li.getType = function () { return DocumentApp.ElementType.LIST_ITEM; };
    li.asListItem = function () { return this; };
    li.getListId = function () { return listId; };
    li.getNestingLevel = function () { return nestingLevel == null ? 0 : nestingLevel; };
    return li;
  }

  function wireParentsForBody_(bd) {
    var j;
    for (j = 0; j < bd._children.length; j++) {
      bd._children[j]._parentBody = bd;
    }
  }

  function createMockBody(initialTexts) {
    var children = [];
    var body;
    function wireParents() {
      var c;
      for (c = 0; c < children.length; c++) {
        if (children[c]._parentBody !== undefined) {
          children[c]._parentBody = body;
        }
      }
    }
    for (var i = 0; i < initialTexts.length; i++) {
      children.push(createMockParagraph(initialTexts[i]));
    }
    body = {
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
        p._parentBody = this;
        this._children.splice(index, 0, p);
        return p;
      },
      insertListItem: function (index, templateLi) {
        var nid = templateLi.getListId ? templateLi.getListId() : 'L';
        var nest = templateLi.getNestingLevel ? templateLi.getNestingLevel() : 0;
        var li = createMockListItem('', nid, nest);
        li._parentBody = this;
        this._children.splice(index, 0, li);
        return li;
      },
      insertTable: function (index, cells) {
        var t = createMockTable();
        t._parentBody = this;
        t.getParent = function () { return body; };
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
    wireParents();
    return body;
  }

  /**
   * @param {*} body
   * @param {*} cursorElement - element for cursor (or null)
   * @param {Array} selectionElements - optional range elements (see mockRangeEl_)
   * @param {number} [cursorOffsetOverride] - explicit cursor offset (else end of element text)
   */
  function createMockDoc(body, cursorElement, selectionElements, cursorOffsetOverride) {
    return {
      getBody: function () { return body; },
      getId: function () { return 'mock-doc-id'; },
      getCursor: function () {
        if (!cursorElement) return null;
        return {
          getElement: function () { return cursorElement; },
          getOffset: function () {
            if (typeof cursorOffsetOverride === 'number') {
              return cursorOffsetOverride;
            }
            if (cursorElement.getType && cursorElement.getType() === DocumentApp.ElementType.TEXT) {
              return cursorElement.getText().length;
            }
            if (cursorElement.getText) {
              return cursorElement.getText().length;
            }
            return 0;
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
        insertTextRole: 'quran',
        spacingBefore: INSERT_SPACING_OUTER_PT,
        spacingAfter: INSERT_SPACING_INNER_PT
      },
      {
        text: '"translation"',
        align: DocumentApp.HorizontalAlignment.CENTER,
        insertTextRole: 'translation',
        spacingAfter: INSERT_SPACING_INNER_PT
      },
      {
        text: '(Al-Fatiha\u00A01:1)',
        align: DocumentApp.HorizontalAlignment.CENTER,
        insertTextRole: 'citation',
        spacingAfter: INSERT_SPACING_OUTER_PT
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
        insertTextRole: 'quran',
        spacingBefore: INSERT_SPACING_OUTER_PT,
        spacingAfter: INSERT_SPACING_OUTER_PT
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

  it('cursor on empty paragraph (only child) — reuses para for ayah, one bottom buffer', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children.length).toBe(2);
    expect(body._children[0]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[0]._ltr).toBe(false);
    expect(body._children[1]._text).toBe('');
    expect(body._children[1]._heading).toBe(null);
  });

  it('cursor at end of non-empty paragraph (last child) — two top buffers, content, one bottom', function () {
    var body = createMockBody(['existing text']);
    var doc = createMockDoc(body, body._children[0]);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children.length).toBe(5);
    expect(body._children[0]._text).toBe('existing text');
    expect(body._children[1]._text).toBe('');
    expect(body._children[2]._text).toBe('');
    expect(body._children[3]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[4]._text).toBe('');
    expect(body._children[4]._heading).toBe(null);
  });

  it('no cursor, all paragraphs empty — no top buffer (2+ empties), append content + bottom', function () {
    var body = createMockBody(['', '', '']);
    var doc = createMockDoc(body, null);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children.length).toBe(5);
    expect(body._children[3]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[4]._text).toBe('');
    expect(body._children[4]._heading).toBe(null);
  });

  it('new doc (single empty paragraph, no cursor) — one top buffer, content, bottom', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, null);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children.length).toBe(4);
    expect(body._children[0]._text).toBe('');
    expect(body._children[1]._text).toBe('');
    expect(body._children[2]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[3]._text).toBe('');
    expect(body._children[3]._heading).toBe(null);
  });

  it('cursor at end of last paragraph — two top buffers, content, one bottom', function () {
    var body = createMockBody(['first', 'last']);
    var doc = createMockDoc(body, body._children[1]);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children.length).toBe(6);
    expect(body._children[0]._text).toBe('first');
    expect(body._children[1]._text).toBe('last');
    expect(body._children[2]._text).toBe('');
    expect(body._children[3]._text).toBe('');
    expect(body._children[4]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[5]._text).toBe('');
    expect(body._children[5]._heading).toBe(null);
  });

  results.push('\ninsertParagraphsAtPosition_() — bottom buffer when not at doc end');

  it('no cursor, trailing empties after last non-empty — one top buffer, one bottom', function () {
    var body = createMockBody(['first', 'second', '']);
    var doc = createMockDoc(body, null);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children.length).toBe(6);
    expect(body._children[0]._text).toBe('first');
    expect(body._children[1]._text).toBe('second');
    expect(body._children[2]._text).toBe('');
    expect(body._children[3]._text).toBe('');
    expect(body._children[4]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[5]._text).toBe('');
    expect(body._children[5]._heading).toBe(null);
  });

  it('cursor at end of first paragraph with siblings — two top, content, two bottom', function () {
    var body = createMockBody(['first', 'second', 'third']);
    var doc = createMockDoc(body, body._children[0]);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children.length).toBe(8);
    expect(body._children[0]._text).toBe('first');
    expect(body._children[1]._text).toBe('');
    expect(body._children[2]._text).toBe('');
    expect(body._children[3]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[4]._text).toBe('');
    expect(body._children[5]._text).toBe('');
    expect(body._children[6]._text).toBe('second');
    expect(body._children[7]._text).toBe('third');
  });

  it('cursor at end of first with spaces-only paragraph below — two top, content, two bottom', function () {
    var body = createMockBody(['first', '   ']);
    var doc = createMockDoc(body, body._children[0]);

    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children.length).toBe(7);
    expect(body._children[0]._text).toBe('first');
    expect(body._children[3]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[6]._text).toBe('   ');
  });

  results.push('\ninsertParagraphsAtPosition_() — paragraph spacing (insert beautify)');

  it('Arabic-only single ayah applies outer spacing on one paragraph', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertParagraphsAtPosition_(body, doc, arabicOnlyAyahInsert(), {});
    expect(body._children[0]._spacingBefore).toBe(INSERT_SPACING_OUTER_PT);
    expect(body._children[0]._spacingAfter).toBe(INSERT_SPACING_OUTER_PT);
    expect(body._children[1]._text).toBe('');
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
    expect(body._children[3]._text).toBe('');
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

    expect(body._children.length).toBe(7);
    expect(applyFormatCalls.length).toBe(3);
    expect(applyFormatCalls[0].fontName).toBe('Amiri');
    expect(applyFormatCalls[0].fontVariant).toBe('regular');
    expect(applyFormatCalls[0].fontSize).toBe(16);
    expect(applyFormatCalls[0].bold).toBe(false);
    expect(applyFormatCalls[0].textColor).toBe('#202124');
    expect(applyFormatCalls[1].fontName).toBe('Figtree');
    expect(applyFormatCalls[1].fontVariant).toBe('regular');
    expect(applyFormatCalls[1].fontSize).toBe(12);
    expect(applyFormatCalls[1].bold).toBe(false);
    expect(applyFormatCalls[1].textColor).toBe('#202124');
    expect(applyFormatCalls[2].fontName).toBe('Figtree');
    expect(applyFormatCalls[2].fontVariant).toBe('regular');
    expect(applyFormatCalls[2].fontSize).toBe(11);
    expect(applyFormatCalls[2].bold).toBe(false);
    expect(applyFormatCalls[2].textColor).toBe('#202124');
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
    expect(applyFormatCalls[0].textColor).toBe('#202124');
    expect(applyFormatCalls[0].bold).toBe(false);
  });

  it('three content paragraphs at end — two top buffers, all inserted, one bottom', function () {
    var body = createMockBody(['existing']);
    var doc = createMockDoc(body, body._children[0]);

    insertParagraphsAtPosition_(body, doc, arabicAndTranslation(), {});

    expect(body._children.length).toBe(7);
    expect(body._children[1]._text).toBe('');
    expect(body._children[2]._text).toBe('');
    expect(body._children[3]._text).toBe('\uFD3F\u00A0arabic\u00A0\uFD3E');
    expect(body._children[3]._ltr).toBe(false);
    expect(body._children[4]._text).toBe('"translation"');
    expect(body._children[4]._ltr).toBe(true);
    expect(body._children[5]._text).toBe('(Al-Fatiha\u00A01:1)');
    expect(body._children[5]._ltr).toBe(true);
    expect(body._children[6]._text).toBe('');
    expect(body._children[6]._heading).toBe(null);
    expect(body._children[6]._spacingBefore).toBe(null);
  });

  it('three content paragraphs with content after — two top, two bottom before following paragraph', function () {
    var body = createMockBody(['existing', 'after']);
    var doc = createMockDoc(body, body._children[0]);

    insertParagraphsAtPosition_(body, doc, arabicAndTranslation(), {});

    expect(body._children.length).toBe(8);
    expect(body._children[1]._text).toBe('');
    expect(body._children[2]._text).toBe('');
    expect(body._children[3]._text).toBe('\uFD3F\u00A0arabic\u00A0\uFD3E');
    expect(body._children[4]._text).toBe('"translation"');
    expect(body._children[5]._text).toBe('(Al-Fatiha\u00A01:1)');
    expect(body._children[6]._text).toBe('');
    expect(body._children[7]._text).toBe('after');
  });

  results.push('\ninsertParagraphsAtPosition_() — regression: sequential insertion & removeChild');

  it('sequential insert: second insertion adds another ayah block after the first', function () {
    var body = createMockBody(['']);
    var emptyPara = body._children[0];
    var doc = createMockDoc(body, emptyPara);

    insertParagraphsAtPosition_(body, doc, arabicAndTranslation(), {});

    expect(body._children.length).toBe(4);
    expect(body._children[0]._text).toBe('\uFD3F\u00A0arabic\u00A0\uFD3E');
    expect(body._children[1]._text).toBe('"translation"');
    expect(body._children[2]._text).toBe('(Al-Fatiha\u00A01:1)');
    expect(body._children[3]._text).toBe('');

    var cleanup = body._children[3];
    var doc2 = createMockDoc(body, cleanup);
    insertParagraphsAtPosition_(body, doc2, singleArabicParagraph(), {});

    var ornateCount = 0;
    var idx;
    for (idx = 0; idx < body._children.length; idx++) {
      if (body._children[idx]._text && body._children[idx]._text.indexOf('\uFD3F') === 0) {
        ornateCount++;
      }
    }
    expect(ornateCount).toBe(2);
    expect(body._children[body._children.length - 1]._text).toBe('');
  });

  results.push('\ninsertBlockquoteTableAtPosition_()');

  it('blockquote: empty doc — table + one bottom buffer; inner spacing matches', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, arabicOnlyAyahInsert(), {});

    expect(body._children.length).toBe(2);
    expect(body._children[0].getType()).toBe(DocumentApp.ElementType.TABLE);
    expect(body._children[1]._text).toBe('');
    expect(body._children[1]._heading).toBe(null);

    var cell = body._children[0]._cell;
    expect(cell._bg).toBe(null);
    expect(cell._padL).toBe(21);
    expect(cell._padT).toBe(6);
    expect(cell._padR).toBe(18);
    expect(cell._padB).toBe(6);
    expect(cell._inner.length).toBe(1);
    expect(cell._inner[0]._spacingBefore).toBe(INSERT_SPACING_OUTER_PT);
    expect(cell._inner[0]._spacingAfter).toBe(INSERT_SPACING_OUTER_PT);
  });

  it('blockquote: three paragraphs in cell with translation spacing', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, arabicAndTranslation(), {});

    expect(body._children.length).toBe(2);
    expect(body._children[1]._heading).toBe(null);
    var cell = body._children[0]._cell;
    expect(cell._inner.length).toBe(3);
    expect(cell._inner[0]._spacingBefore).toBe(INSERT_SPACING_OUTER_PT);
    expect(cell._inner[0]._spacingAfter).toBe(INSERT_SPACING_INNER_PT);
    expect(cell._inner[1]._spacingAfter).toBe(INSERT_SPACING_INNER_PT);
    expect(cell._inner[2]._spacingAfter).toBe(INSERT_SPACING_OUTER_PT);
  });

  it('blockquote: non-empty doc — two top buffers, table, two bottom, then after', function () {
    var body = createMockBody(['existing', 'after']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children.length).toBe(7);
    expect(body._children[0]._text).toBe('existing');
    expect(body._children[1]._text).toBe('');
    expect(body._children[2]._text).toBe('');
    expect(body._children[3].getType()).toBe(DocumentApp.ElementType.TABLE);
    expect(body._children[4]._text).toBe('');
    expect(body._children[5]._text).toBe('');
    expect(body._children[6]._text).toBe('after');
  });

  it('blockquote: empty doc skips top buffer paragraph', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children[0].getType()).toBe(DocumentApp.ElementType.TABLE);
    expect(body._children[0]._cell._inner[0]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
  });

  it('blockquote: bottom buffer paragraphs have no explicit spacing', function () {
    var body = createMockBody(['content above', 'more content']);
    var doc = createMockDoc(body, body._children[1]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    var b1 = body._children[4];
    var b2 = body._children[5];
    expect(b1._text).toBe('');
    expect(b2._text).toBe('');
    expect(b1._spacingBefore).toBe(null);
    expect(b2._spacingAfter).toBe(null);
  });

  it('blockquote: bottom buffers are plain empty paragraphs', function () {
    var body = createMockBody(['text']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    var typing = body._children[4];
    expect(typing._text).toBe('');
    expect(typing._heading).toBe(null);
    expect(typing._ltr).toBe(null);
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

  results.push('\ninsertBlockquoteTableAtPosition_() — ordinal targeting (pendingBorders)');

  it('single table in empty doc returns pendingBorders with tableOrdinal 1', function () {
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    var result = insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});
    expect(result.pendingBorders.docId).toBe('mock-doc-id');
    expect(result.pendingBorders.tableOrdinal).toBe(1);
  });

  it('new table after one pre-existing table returns tableOrdinal 2', function () {
    var body = createMockBody(['text before', 'cursor here']);
    var existingTable = createMockTable();
    existingTable._parentBody = body;
    existingTable.getParent = function () { return body; };
    body._children.splice(1, 0, existingTable);
    wireParentsForBody_(body);
    var cursorPara = body._children[2];
    var doc = createMockDoc(body, cursorPara);
    var result = insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});
    expect(result.pendingBorders.tableOrdinal).toBe(2);
  });

  it('new table between two pre-existing tables returns tableOrdinal 2', function () {
    var body = createMockBody(['before', 'middle', 'after']);
    var table1 = createMockTable();
    table1._parentBody = body;
    table1.getParent = function () { return body; };
    body._children.splice(1, 0, table1);
    var table2 = createMockTable();
    table2._parentBody = body;
    table2.getParent = function () { return body; };
    body._children.splice(3, 0, table2);
    wireParentsForBody_(body);
    var cursorPara = body._children[2];
    var doc = createMockDoc(body, cursorPara);
    var result = insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});
    expect(result.pendingBorders.tableOrdinal).toBe(2);
  });

  it('blockquote does NOT call applyBlockquoteCellBordersViaDocsApi_ inline', function () {
    var called = false;
    var origBorders = applyBlockquoteCellBordersViaDocsApi_;
    applyBlockquoteCellBordersViaDocsApi_ = function () { called = true; };
    var body = createMockBody(['']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});
    expect(called).toBe(false);
    applyBlockquoteCellBordersViaDocsApi_ = origBorders;
  });

  it('list item split: remainder list item preserves listId after plain insert', function () {
    var body = createMockBody(['intro']);
    body._children.push(createMockListItem('abcdef', 'L9', 0));
    wireParentsForBody_(body);
    var li = body._children[1];
    var doc = createMockDoc(body, li, null, 3);
    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});
    expect(body._children[1]._text).toBe('abc');
    expect(body._children[1].getType()).toBe(DocumentApp.ElementType.LIST_ITEM);
    var foundRemainder = false;
    var i;
    for (i = 0; i < body._children.length; i++) {
      if (body._children[i]._text === 'def' && body._children[i].getListId && body._children[i].getListId() === 'L9') {
        foundRemainder = true;
      }
    }
    expect(foundRemainder).toBe(true);
  });

  // ── End-to-end: blockquote insert with cursor in table cell ──

  results.push('\ninsertBlockquoteTableAtPosition_() — cursor in table cell');

  it('blockquote: cursor in table cell inserts table after the existing table', function () {
    var body = createMockBody(['before']);
    var tbl = createMockTable();
    tbl._parentBody = body;
    tbl.getParent = function () { return body; };
    body._children.push(tbl);
    body._children.push(createMockParagraph('after'));
    wireParentsForBody_(body);
    var cellPara = tbl._cell._inner[0];
    cellPara.getParent = function () { return tbl; };
    var doc = createMockDoc(body, cellPara);
    var result = insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children[0]._text).toBe('before');
    expect(body._children[1]).toBe(tbl);
    expect(body._children[2]._text).toBe('');
    expect(body._children[3]._text).toBe('');
    expect(body._children[4].getType()).toBe(DocumentApp.ElementType.TABLE);
    expect(body._children[5]._text).toBe('');
    expect(body._children[6]._text).toBe('');
    expect(body._children[7]._text).toBe('after');
    expect(result.pendingBorders.tableOrdinal).toBe(2);
  });

  // ── End-to-end: cursor in middle or beginning of paragraph (no split) ──

  results.push('\ninsertBlockquoteTableAtPosition_() — cursor in paragraph (split at end)');

  it('blockquote: cursor at end of paragraph splits then inserts table and buffers', function () {
    var body = createMockBody(['hello world', 'after']);
    var doc = createMockDoc(body, body._children[0]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children[0]._text).toBe('hello world');
    expect(body._children[1]._text).toBe('');
    expect(body._children[2]._text).toBe('');
    expect(body._children[3].getType()).toBe(DocumentApp.ElementType.TABLE);
    expect(body._children[4]._text).toBe('');
    expect(body._children[5]._text).toBe('');
    expect(body._children[6]._text).toBe('after');
  });

  it('plain: cursor at end of paragraph splits then inserts content and buffers', function () {
    var body = createMockBody(['hello world', 'after']);
    var doc = createMockDoc(body, body._children[0]);
    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children[0]._text).toBe('hello world');
    expect(body._children[1]._text).toBe('');
    expect(body._children[2]._text).toBe('');
    expect(body._children[3]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[4]._text).toBe('');
    expect(body._children[5]._text).toBe('');
    expect(body._children[6]._text).toBe('after');
  });

  it('blockquote: cursor at end of second paragraph — split, table, buffers', function () {
    var body = createMockBody(['first', 'second', 'third']);
    var doc = createMockDoc(body, body._children[1]);
    insertBlockquoteTableAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children[0]._text).toBe('first');
    expect(body._children[1]._text).toBe('second');
    expect(body._children[2]._text).toBe('');
    expect(body._children[3]._text).toBe('');
    expect(body._children[4].getType()).toBe(DocumentApp.ElementType.TABLE);
    expect(body._children[5]._text).toBe('');
    expect(body._children[6]._text).toBe('');
    expect(body._children[7]._text).toBe('third');
  });

  it('plain: cursor at end of second paragraph — split, content, buffers', function () {
    var body = createMockBody(['first', 'second', 'third']);
    var doc = createMockDoc(body, body._children[1]);
    insertParagraphsAtPosition_(body, doc, singleArabicParagraph(), {});

    expect(body._children[0]._text).toBe('first');
    expect(body._children[1]._text).toBe('second');
    expect(body._children[2]._text).toBe('');
    expect(body._children[3]._text).toBe('');
    expect(body._children[4]._text).toBe('\uFD3F\u00A0test\u00A0\uFD3E');
    expect(body._children[5]._text).toBe('');
    expect(body._children[6]._text).toBe('');
    expect(body._children[7]._text).toBe('third');
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
