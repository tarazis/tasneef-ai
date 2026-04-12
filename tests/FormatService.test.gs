/**
 * GAS-native tests for FormatService.gs
 * Run from Apps Script editor: select runFormatServiceTests, click Run.
 */

function runFormatServiceTests() {
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
      }
    };
  }

  results.push('\ntoArabicIndic()');

  it('converts 0 to ٠', function () {
    expect(toArabicIndic(0)).toBe('٠');
  });
  it('converts 255 to ٢٥٥', function () {
    expect(toArabicIndic(255)).toBe('٢٥٥');
  });
  it('converts 1 to ١', function () {
    expect(toArabicIndic(1)).toBe('١');
  });
  it('converts 9 to ٩', function () {
    expect(toArabicIndic(9)).toBe('٩');
  });
  it('handles null', function () {
    expect(toArabicIndic(null)).toBe('null');
  });

  results.push('\nparseGoogleFontVariant()');

  it('parses regular', function () {
    var p = parseGoogleFontVariant('regular');
    expect(p.weight).toBe(400);
    expect(p.italic).toBe(false);
  });
  it('parses 700italic', function () {
    var p = parseGoogleFontVariant('700italic');
    expect(p.weight).toBe(700);
    expect(p.italic).toBe(true);
  });

  results.push('\nformatStateForBeautifiedInsertParagraph()');

  it('translation role yields Figtree 12pt same color as Quran', function () {
    var item = { insertTextRole: 'translation' };
    var a = formatStateForBeautifiedInsertParagraph(item, {});
    expect(a.fontName).toBe('Figtree');
    expect(a.fontVariant).toBe('regular');
    expect(a.fontSize).toBe(12);
    expect(a.bold).toBe(false);
    expect(a.textColor).toBe('#202124');
  });
  it('citation role yields Figtree 11pt same color as Quran', function () {
    var item = { insertTextRole: 'citation' };
    var a = formatStateForBeautifiedInsertParagraph(item, { fontName: 'Amiri', bold: true });
    expect(a.fontName).toBe('Figtree');
    expect(a.fontVariant).toBe('regular');
    expect(a.fontSize).toBe(11);
    expect(a.bold).toBe(false);
    expect(a.textColor).toBe('#202124');
  });
  it('quran role forces Amiri regular non-bold and 16pt primary color', function () {
    var fs = { fontName: 'Scheherazade New', fontVariant: '700', bold: true };
    var item = { insertTextRole: 'quran' };
    var a = formatStateForBeautifiedInsertParagraph(item, fs);
    expect(a.fontName).toBe('Amiri');
    expect(a.fontVariant).toBe('regular');
    expect(a.fontSize).toBe(16);
    expect(a.textColor).toBe('#202124');
    expect(a.bold).toBe(false);
  });
  it('quran role does not mutate original formatState', function () {
    var fs = { fontName: 'Amiri', fontVariant: 'regular', fontSize: 10, textColor: '#ff00ff' };
    var item = { insertTextRole: 'quran' };
    formatStateForBeautifiedInsertParagraph(item, fs);
    expect(fs.fontSize).toBe(10);
    expect(fs.textColor).toBe('#ff00ff');
  });

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');
  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
