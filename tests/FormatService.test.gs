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

  results.push('\nformatStateForEnglishTranslation()');

  it('null yields Figtree state with bold off', function () {
    var a = formatStateForEnglishTranslation(null);
    expect(a.fontName).toBe('Figtree');
    expect(a.bold).toBe(false);
  });
  it('undefined yields Figtree state with bold off', function () {
    var a = formatStateForEnglishTranslation(undefined);
    expect(a.fontName).toBe('Figtree');
    expect(a.bold).toBe(false);
  });
  it('copies fields; Figtree; font size minus 2; never bold', function () {
    var fs = { fontName: 'Scheherazade New', fontVariant: '700', fontSize: 14, bold: true, textColor: '#000' };
    var b = formatStateForEnglishTranslation(fs);
    expect(b.fontName).toBe('Figtree');
    expect(b.fontVariant).toBe('700');
    expect(b.fontSize).toBe(12);
    expect(b.bold).toBe(false);
    expect(b.textColor).toBe('#000');
  });
  it('font size floors at 1 when ayah size is very small', function () {
    var fs = { fontName: 'X', fontSize: 2 };
    var b = formatStateForEnglishTranslation(fs);
    expect(b.fontSize).toBe(1);
  });
  it('does not mutate original formatState', function () {
    var fs = { fontName: 'Amiri', fontSize: 10 };
    formatStateForEnglishTranslation(fs);
    expect(fs.fontName).toBe('Amiri');
  });

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');
  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
