/**
 * GAS-native tests for DocumentService.gs
 * Run from Apps Script editor: select runDocumentServiceTests, click Run.
 *
 * trailingNormalParagraphInsertIndex is unit-tested here.
 * _finishInsertWithNormalLineBelow requires a real Document (manual check in a Doc).
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
      }
    };
  }

  results.push('\ntrailingNormalParagraphInsertIndex()');

  it('returns index after one inserted paragraph', function () {
    expect(trailingNormalParagraphInsertIndex(5, 1)).toBe(6);
  });
  it('returns index after two inserted paragraphs', function () {
    expect(trailingNormalParagraphInsertIndex(3, 2)).toBe(5);
  });
  it('handles insertIndex 0', function () {
    expect(trailingNormalParagraphInsertIndex(0, 1)).toBe(1);
  });
  it('handles zero inserted count (edge)', function () {
    expect(trailingNormalParagraphInsertIndex(4, 0)).toBe(4);
  });

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');
  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
