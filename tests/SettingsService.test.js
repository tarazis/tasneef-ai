/**
 * Unit tests for SettingsService.gs
 *
 * Runs with plain Node.js — no npm or external packages required:
 *   node tests/SettingsService.test.js
 *
 * The GAS global APIs (PropertiesService, etc.) are mocked in-process.
 */

'use strict';

// ─── Minimal test framework ──────────────────────────────────────────────────

var passed = 0;
var failed = 0;

function describe(label, fn) {
  console.log('\n' + label);
  fn();
}

function it(label, fn) {
  try {
    fn();
    console.log('  ✓ ' + label);
    passed++;
  } catch (e) {
    console.error('  ✗ ' + label);
    console.error('    ' + e.message);
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
    },
    toBeNull: function () {
      if (actual !== null) {
        throw new Error('Expected null but got ' + JSON.stringify(actual));
      }
    },
    toThrow: function () {
      throw new Error('Use expectThrows() for throw assertions');
    }
  };
}

function expectThrows(fn) {
  try {
    fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (e) {
    if (e.message === 'Expected function to throw, but it did not') throw e;
    // swallow — the throw is expected
  }
}

// ─── GAS mock — PropertiesService ───────────────────────────────────────────

function makeMockPropertiesService(initialStore) {
  var store = Object.assign({}, initialStore || {});

  var userProps = {
    getProperties: function () { return Object.assign({}, store); },
    getProperty:   function (key) { return store.hasOwnProperty(key) ? store[key] : null; },
    setProperty:   function (key, value) { store[key] = value; },
    deleteProperty: function (key) { delete store[key]; },
    _store: store
  };

  return {
    getUserProperties: function () { return userProps; },
    _userProps: userProps
  };
}

// ─── Load SettingsService in this Node.js scope ──────────────────────────────
// We use Node's `vm` module to run the GAS source in an isolated sandbox that
// has the mocked PropertiesService injected as a global.

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');
var src  = fs.readFileSync(path.join(__dirname, '..', 'SettingsService.gs'), 'utf8');

function loadSettingsService(mockPropsService) {
  var sandbox = {
    PropertiesService: mockPropsService
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getSettings()', function () {
  it('returns all default values when nothing is stored', function () {
    var svc = loadSettingsService(makeMockPropertiesService());
    var settings = svc.getSettings();
    expect(settings.insertMode).toBe('cursor');
    expect(settings.showTranslation).toBe(true);
    expect(settings.translationEdition).toBe('sahih');
    expect(settings.arabicStyle).toBe('uthmani');
    expect(settings.fontName).toBe('Amiri');
    expect(settings.fontSize).toBe(18);
    expect(settings.bold).toBe(false);
    expect(settings.textColor).toBe('#000000');
  });

  it('returns stored string value over default', function () {
    var store = { 'setting_fontName': 'Scheherazade New' };
    var svc = loadSettingsService(makeMockPropertiesService(store));
    expect(svc.getSettings().fontName).toBe('Scheherazade New');
  });

  it('coerces stored boolean string "true" to boolean true', function () {
    var store = { 'setting_showTranslation': 'true' };
    var svc = loadSettingsService(makeMockPropertiesService(store));
    expect(svc.getSettings().showTranslation).toBe(true);
  });

  it('coerces stored boolean string "false" to boolean false', function () {
    var store = { 'setting_showTranslation': 'false', 'setting_bold': 'false' };
    var svc = loadSettingsService(makeMockPropertiesService(store));
    expect(svc.getSettings().showTranslation).toBe(false);
    expect(svc.getSettings().bold).toBe(false);
  });

  it('coerces stored numeric string to number', function () {
    var store = { 'setting_fontSize': '24' };
    var svc = loadSettingsService(makeMockPropertiesService(store));
    expect(svc.getSettings().fontSize).toBe(24);
  });
});

describe('saveSetting()', function () {
  it('persists a string setting', function () {
    var mock = makeMockPropertiesService();
    var svc = loadSettingsService(mock);
    svc.saveSetting('fontName', 'Noto Naskh Arabic');
    expect(svc.getSettings().fontName).toBe('Noto Naskh Arabic');
  });

  it('persists a boolean setting', function () {
    var mock = makeMockPropertiesService();
    var svc = loadSettingsService(mock);
    svc.saveSetting('bold', true);
    expect(svc.getSettings().bold).toBe(true);
  });

  it('persists a numeric setting', function () {
    var mock = makeMockPropertiesService();
    var svc = loadSettingsService(mock);
    svc.saveSetting('fontSize', 22);
    expect(svc.getSettings().fontSize).toBe(22);
  });

  it('throws on an unknown key', function () {
    var svc = loadSettingsService(makeMockPropertiesService());
    expectThrows(function () { svc.saveSetting('unknownKey', 'value'); });
  });
});

describe('saveSettings()', function () {
  it('persists multiple settings at once', function () {
    var mock = makeMockPropertiesService();
    var svc = loadSettingsService(mock);
    svc.saveSettings({ fontName: 'Amiri Quran', fontSize: 20, bold: true });
    var s = svc.getSettings();
    expect(s.fontName).toBe('Amiri Quran');
    expect(s.fontSize).toBe(20);
    expect(s.bold).toBe(true);
  });

  it('throws if any key is unknown', function () {
    var svc = loadSettingsService(makeMockPropertiesService());
    expectThrows(function () { svc.saveSettings({ fontName: 'Amiri', badKey: 'x' }); });
  });
});

describe('getClaudeApiKey() / setClaudeApiKey()', function () {
  it('returns null when no key is stored', function () {
    var svc = loadSettingsService(makeMockPropertiesService());
    expect(svc.getClaudeApiKey()).toBeNull();
  });

  it('returns the stored key after setClaudeApiKey()', function () {
    var svc = loadSettingsService(makeMockPropertiesService());
    svc.setClaudeApiKey('sk-ant-test-12345');
    expect(svc.getClaudeApiKey()).toBe('sk-ant-test-12345');
  });

  it('overwrites an existing key', function () {
    var svc = loadSettingsService(makeMockPropertiesService());
    svc.setClaudeApiKey('old-key');
    svc.setClaudeApiKey('new-key');
    expect(svc.getClaudeApiKey()).toBe('new-key');
  });
});

describe('getAiSearchCount()', function () {
  it('returns 0 when nothing is stored', function () {
    var svc = loadSettingsService(makeMockPropertiesService());
    expect(svc.getAiSearchCount()).toBe(0);
  });

  it('returns 0 when stored date is not today', function () {
    var store = {
      'ai_search_count': JSON.stringify({ count: 7, date: '2000-01-01' })
    };
    var svc = loadSettingsService(makeMockPropertiesService(store));
    expect(svc.getAiSearchCount()).toBe(0);
  });

  it('returns stored count when date matches today (UTC)', function () {
    var now = new Date();
    var todayUtc = now.getUTCFullYear() + '-' +
      String(now.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(now.getUTCDate()).padStart(2, '0');

    var store = {
      'ai_search_count': JSON.stringify({ count: 5, date: todayUtc })
    };
    var svc = loadSettingsService(makeMockPropertiesService(store));
    expect(svc.getAiSearchCount()).toBe(5);
  });

  it('returns 0 for malformed stored JSON', function () {
    var store = { 'ai_search_count': 'not-json' };
    var svc = loadSettingsService(makeMockPropertiesService(store));
    expect(svc.getAiSearchCount()).toBe(0);
  });
});

describe('incrementAiSearchCount()', function () {
  it('increments from 0 to 1', function () {
    var svc = loadSettingsService(makeMockPropertiesService());
    expect(svc.incrementAiSearchCount()).toBe(1);
  });

  it('increments sequentially', function () {
    var svc = loadSettingsService(makeMockPropertiesService());
    svc.incrementAiSearchCount(); // 1
    svc.incrementAiSearchCount(); // 2
    expect(svc.incrementAiSearchCount()).toBe(3);
  });

  it('resets stale count and increments from 1', function () {
    var store = {
      'ai_search_count': JSON.stringify({ count: 8, date: '2000-01-01' })
    };
    var svc = loadSettingsService(makeMockPropertiesService(store));
    expect(svc.incrementAiSearchCount()).toBe(1);
  });

  it('returns -1 when daily limit is reached', function () {
    var now = new Date();
    var todayUtc = now.getUTCFullYear() + '-' +
      String(now.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(now.getUTCDate()).padStart(2, '0');

    var store = {
      'ai_search_count': JSON.stringify({ count: 10, date: todayUtc })
    };
    var svc = loadSettingsService(makeMockPropertiesService(store));
    expect(svc.incrementAiSearchCount()).toBe(-1);
  });

  it('returns -1 on the (LIMIT+1)th call in a single session', function () {
    var svc = loadSettingsService(makeMockPropertiesService());
    for (var i = 0; i < 10; i++) {
      svc.incrementAiSearchCount();
    }
    expect(svc.incrementAiSearchCount()).toBe(-1);
  });

  it('does not persist count when limit is reached', function () {
    var now = new Date();
    var todayUtc = now.getUTCFullYear() + '-' +
      String(now.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(now.getUTCDate()).padStart(2, '0');

    var store = {
      'ai_search_count': JSON.stringify({ count: 10, date: todayUtc })
    };
    var svc = loadSettingsService(makeMockPropertiesService(store));
    svc.incrementAiSearchCount(); // returns -1, should not change count
    expect(svc.getAiSearchCount()).toBe(10);
  });
});

describe('AI_SEARCH_DAILY_LIMIT constant', function () {
  it('equals 10', function () {
    var svc = loadSettingsService(makeMockPropertiesService());
    expect(svc.AI_SEARCH_DAILY_LIMIT).toBe(10);
  });
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n─────────────────────────────────────────');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
