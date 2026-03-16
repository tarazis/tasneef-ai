/**
 * GAS-native tests for ClaudeAPI.gs
 *
 * Run from Apps Script editor: select runClaudeAPITests, click Run.
 * View results in View → Logs.
 *
 * Unit tests for parsing/validation run without network.
 * Integration tests require a Claude API key in User Properties.
 */

function runClaudeAPITests() {
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
      toBeGreaterThan: function (n) {
        if (typeof actual !== 'number' || actual <= n) {
          throw new Error('Expected > ' + n + ' but got ' + JSON.stringify(actual));
        }
      },
      toContain: function (substring) {
        if (typeof actual !== 'string' || actual.indexOf(substring) < 0) {
          throw new Error('Expected string containing ' + JSON.stringify(substring) + ' but got ' + JSON.stringify(actual));
        }
      }
    };
  }

  // ── _parseReferencesFromText (unit tests, no network) ─────────────────────

  results.push('\n_parseReferencesFromText()');

  it('parses a clean JSON array', function () {
    var refs = _parseReferencesFromText('[{"surah":2,"ayah":255},{"surah":112,"ayah":1}]');
    expect(refs.length).toBe(2);
    expect(refs[0].surah).toBe(2);
    expect(refs[0].ayah).toBe(255);
    expect(refs[1].surah).toBe(112);
    expect(refs[1].ayah).toBe(1);
  });

  it('parses JSON wrapped in markdown code fences', function () {
    var text = '```json\n[{"surah":1,"ayah":1},{"surah":36,"ayah":1}]\n```';
    var refs = _parseReferencesFromText(text);
    expect(refs.length).toBe(2);
    expect(refs[0].surah).toBe(1);
    expect(refs[1].surah).toBe(36);
  });

  it('extracts JSON array from surrounding text', function () {
    var text = 'Here are the results:\n[{"surah":55,"ayah":13}]\nI hope this helps.';
    var refs = _parseReferencesFromText(text);
    expect(refs.length).toBe(1);
    expect(refs[0].surah).toBe(55);
    expect(refs[0].ayah).toBe(13);
  });

  it('returns empty for null/empty input', function () {
    expect(_parseReferencesFromText(null).length).toBe(0);
    expect(_parseReferencesFromText('').length).toBe(0);
  });

  it('returns empty for invalid JSON', function () {
    expect(_parseReferencesFromText('not json at all').length).toBe(0);
  });

  it('filters out invalid surah numbers', function () {
    var text = '[{"surah":0,"ayah":1},{"surah":115,"ayah":1},{"surah":50,"ayah":5}]';
    var refs = _parseReferencesFromText(text);
    expect(refs.length).toBe(1);
    expect(refs[0].surah).toBe(50);
  });

  it('filters out invalid ayah numbers', function () {
    var text = '[{"surah":1,"ayah":0},{"surah":1,"ayah":-1},{"surah":1,"ayah":3}]';
    var refs = _parseReferencesFromText(text);
    expect(refs.length).toBe(1);
    expect(refs[0].ayah).toBe(3);
  });

  it('caps results at AI_MAX_REFERENCES (10)', function () {
    var arr = [];
    for (var i = 1; i <= 15; i++) arr.push({ surah: 1, ayah: i });
    var refs = _parseReferencesFromText(JSON.stringify(arr));
    expect(refs.length).toBe(10);
  });

  // ── _validateAndFetchReferences (integration, real network) ───────────────

  results.push('\n_validateAndFetchReferences()');

  it('validates known-good references and returns full ayah data', function () {
    var refs = [{ surah: 1, ayah: 1 }, { surah: 2, ayah: 255 }];
    var validated = _validateAndFetchReferences(refs, 'uthmani');
    expect(validated.length).toBe(2);
    expect(validated[0].surah).toBe(1);
    expect(validated[0].ayah).toBe(1);
    expect(validated[0].arabicText).toBeTruthy();
    expect(validated[0].translationText).toBeTruthy();
    expect(validated[0].textUthmani).toBeTruthy();
    expect(validated[0].textSimple).toBeTruthy();
    expect(validated[1].surah).toBe(2);
    expect(validated[1].ayah).toBe(255);
  });

  it('silently discards hallucinated references (invalid surah/ayah)', function () {
    var refs = [{ surah: 1, ayah: 1 }, { surah: 999, ayah: 1 }, { surah: 2, ayah: 9999 }];
    var validated = _validateAndFetchReferences(refs, 'uthmani');
    expect(validated.length).toBe(1);
    expect(validated[0].surah).toBe(1);
    expect(validated[0].ayah).toBe(1);
  });

  it('returns empty array for all-invalid references', function () {
    var refs = [{ surah: 999, ayah: 1 }, { surah: 200, ayah: 5 }];
    var validated = _validateAndFetchReferences(refs, 'uthmani');
    expect(validated.length).toBe(0);
  });

  it('returns empty array for empty input', function () {
    var validated = _validateAndFetchReferences([], 'uthmani');
    expect(validated.length).toBe(0);
  });

  it('respects style parameter (simple vs uthmani)', function () {
    var refs = [{ surah: 1, ayah: 1 }];
    var uthmani = _validateAndFetchReferences(refs, 'uthmani');
    var simple = _validateAndFetchReferences(refs, 'simple');
    expect(uthmani.length).toBe(1);
    expect(simple.length).toBe(1);
    expect(uthmani[0].arabicText).toBeTruthy();
    expect(simple[0].arabicText).toBeTruthy();
  });

  // ── runAiSearch (integration) ─────────────────────────────────────────────

  results.push('\nrunAiSearch()');

  it('runAiSearch returns NO_API_KEY when no key is set', function () {
    var savedKey = getClaudeApiKey();
    try {
      PropertiesService.getUserProperties().deleteProperty(PROPERTY_KEYS.CLAUDE_API_KEY);
      var result = runAiSearch('verses about mercy');
      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_API_KEY');
    } finally {
      if (savedKey) setClaudeApiKey(savedKey);
    }
  });

  it('runAiSearch returns error for empty query', function () {
    var result = runAiSearch('');
    expect(result.success).toBe(false);
  });

  it('runAiSearch returns error for whitespace-only query', function () {
    var result = runAiSearch('   ');
    expect(result.success).toBe(false);
  });

  // Full integration test — only runs if API key is present
  var apiKey = getClaudeApiKey();
  if (apiKey) {
    it('runAiSearch("verses about patience") returns validated results (live API)', function () {
      var result = runAiSearch('verses about patience');
      expect(result.success).toBe(true);
      expect(result.results.length).toBeGreaterThan(0);
      var first = result.results[0];
      expect(first.surah).toBeGreaterThan(0);
      expect(first.ayah).toBeGreaterThan(0);
      expect(first.arabicText).toBeTruthy();
      expect(first.translationText).toBeTruthy();
    });
  } else {
    results.push('  ⊘ Skipped live API test (no Claude API key configured)');
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');

  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
