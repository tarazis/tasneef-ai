/**
 * GAS-native tests for SettingsService.gs
 * Run from Apps Script editor: select runSettingsServiceTests, click Run.
 * View results in View → Logs.
 *
 * This suite does not mutate User or Script Properties (no setProperty/deleteProperty).
 * Key helpers below only read Script Properties where noted.
 */

function runSettingsServiceTests() {
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
      toBeTruthy: function () {
        if (!actual) throw new Error('Expected truthy but got ' + JSON.stringify(actual));
      },
      toBeFalsy: function () {
        if (actual) throw new Error('Expected falsy but got ' + JSON.stringify(actual));
      },
      toBeNull: function () {
        if (actual !== null) throw new Error('Expected null but got ' + JSON.stringify(actual));
      }
    };
  }

  // ─── getClaudeApiKey_ (read-only Script Properties) ───────────────────────

  results.push('\ngetClaudeApiKey_()');

  it('returns the Claude key from Script Properties', function () {
    var key = getClaudeApiKey_();
    // Returns whatever is in Script Properties (null if not set)
    expect(key === null || typeof key === 'string').toBeTruthy();
  });

  // ─── getGoogleFontsApiKey_ (read-only Script Properties) ─────────────────

  results.push('\ngetGoogleFontsApiKey_()');

  it('returns the Google Fonts key from Script Properties or null', function () {
    var key = getGoogleFontsApiKey_();
    expect(key === null || typeof key === 'string').toBeTruthy();
  });

  // ─── saveSetting_() ───────────────────────────────────────────────────────

  results.push('\nsaveSetting_()');

  it('saveSetting_ rejects unknown keys', function () {
    try {
      saveSetting_('unknownKey', true);
      throw new Error('Expected an error but none was thrown');
    } catch (e) {
      if (e.message.indexOf('Unknown setting key') === -1) throw e;
    }
  });

  // ─── AI search daily limit ────────────────────────────────────────────────

  results.push('\ngetAiSearchDailyLimit_()');

  it('returns a positive integer (from Script Properties or default)', function () {
    var cap = getAiSearchDailyLimit_();
    expect(typeof cap).toBe('number');
    expect(cap >= 1).toBeTruthy();
  });

  // ─── superUserEmailListIncludes_ ─────────────────────────────────────────

  results.push('\nsuperUserEmailListIncludes_()');

  it('returns false for null/empty email or csv', function () {
    expect(superUserEmailListIncludes_('', 'a@b.com')).toBe(false);
    expect(superUserEmailListIncludes_('a@b.com', '')).toBe(false);
    expect(superUserEmailListIncludes_(null, 'a@b.com')).toBe(false);
  });

  it('matches with spaces around emails and is case-insensitive', function () {
    expect(superUserEmailListIncludes_('User@Example.com', ' other@test.com , user@example.com ')).toBe(true);
    expect(superUserEmailListIncludes_('A@B.CO', 'x@y.z, a@b.co')).toBe(true);
  });

  it('ignores empty comma segments', function () {
    expect(superUserEmailListIncludes_('only@here.org', 'foo@bar.com,, , only@here.org')).toBe(true);
  });

  it('does not match partial addresses', function () {
    expect(superUserEmailListIncludes_('a@b.com', 'aa@b.com, x@b.com')).toBe(false);
  });

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');
  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
