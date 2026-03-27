/**
 * GAS-native tests for SettingsService.gs
 * Run from Apps Script editor: select runSettingsServiceTests, click Run.
 * View results in View → Logs.
 *
 * Note: These tests write to real User Properties and clean up after themselves.
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

  // ─── hasClaudeApiKey ──────────────────────────────────────────────────────

  results.push('\nhasClaudeApiKey()');

  it('returns false when no key is stored', function () {
    PropertiesService.getUserProperties().deleteProperty('claude_api_key');
    expect(hasClaudeApiKey()).toBeFalsy();
  });

  it('returns true after storing a key', function () {
    PropertiesService.getUserProperties().setProperty('claude_api_key', 'sk-ant-test-key');
    expect(hasClaudeApiKey()).toBeTruthy();
    PropertiesService.getUserProperties().deleteProperty('claude_api_key');
  });

  // ─── setClaudeApiKey ──────────────────────────────────────────────────────

  results.push('\nsetClaudeApiKey()');

  it('stores a key and can be retrieved', function () {
    setClaudeApiKey('sk-ant-example');
    expect(getClaudeApiKey()).toBe('sk-ant-example');
    PropertiesService.getUserProperties().deleteProperty('claude_api_key');
  });

  it('trims whitespace before storing', function () {
    setClaudeApiKey('  sk-ant-trimmed  ');
    expect(getClaudeApiKey()).toBe('sk-ant-trimmed');
    PropertiesService.getUserProperties().deleteProperty('claude_api_key');
  });

  it('deletes the key when passed an empty string', function () {
    setClaudeApiKey('sk-ant-to-delete');
    setClaudeApiKey('');
    expect(getClaudeApiKey()).toBeNull();
  });

  it('deletes the key when passed a whitespace-only string', function () {
    setClaudeApiKey('sk-ant-to-delete');
    setClaudeApiKey('   ');
    expect(getClaudeApiKey()).toBeNull();
  });

  it('deletes the key when passed null', function () {
    setClaudeApiKey('sk-ant-to-delete');
    setClaudeApiKey(null);
    expect(getClaudeApiKey()).toBeNull();
  });

  // ─── getSettings / saveSetting defaults ──────────────────────────────────

  results.push('\ngetSettings() defaults');

  it('showTranslation defaults to true', function () {
    PropertiesService.getUserProperties().deleteProperty('setting_showTranslation');
    var s = getSettings();
    expect(s.showTranslation).toBe(true);
  });

  it('saveSetting persists showTranslation false', function () {
    saveSetting('showTranslation', false);
    var s = getSettings();
    expect(s.showTranslation).toBe(false);
    PropertiesService.getUserProperties().deleteProperty('setting_showTranslation');
  });

  it('saveSetting rejects unknown keys', function () {
    try {
      saveSetting('unknownKey', true);
      throw new Error('Expected an error but none was thrown');
    } catch (e) {
      if (e.message.indexOf('Unknown setting key') === -1) throw e;
    }
  });

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');
  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
