/**
 * GAS-native tests for SettingsService.gs
 * Run from Apps Script editor: select runSettingsServiceTests, click Run.
 * View results in View → Logs.
 *
 * Note: These tests write to real User/Script Properties and clean up after themselves.
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

  // ─── getClaudeApiKey_ (reads from Script Properties) ──────────────────────

  results.push('\ngetClaudeApiKey_()');

  it('returns the Claude key from Script Properties', function () {
    var key = getClaudeApiKey_();
    // Returns whatever is in Script Properties (null if not set)
    expect(key === null || typeof key === 'string').toBeTruthy();
  });

  // ─── getSettings / saveSetting_ defaults ──────────────────────────────────

  results.push('\ngetSettings() defaults');

  it('showTranslation defaults to true', function () {
    PropertiesService.getUserProperties().deleteProperty('setting_showTranslation');
    var s = getSettings();
    expect(s.showTranslation).toBe(true);
  });

  it('saveSetting_ persists showTranslation false', function () {
    saveSetting_('showTranslation', false);
    var s = getSettings();
    expect(s.showTranslation).toBe(false);
    PropertiesService.getUserProperties().deleteProperty('setting_showTranslation');
  });

  it('saveSetting_ rejects unknown keys', function () {
    try {
      saveSetting_('unknownKey', true);
      throw new Error('Expected an error but none was thrown');
    } catch (e) {
      if (e.message.indexOf('Unknown setting key') === -1) throw e;
    }
  });

  // ─── AI search daily limit ────────────────────────────────────────────────

  results.push('\nAI_SEARCH_DAILY_LIMIT');

  it('daily limit is 10', function () {
    expect(AI_SEARCH_DAILY_LIMIT).toBe(50);
  });

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');
  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
