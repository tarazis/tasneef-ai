/**
 * GAS-native tests for ClaudeAPI.gs (Unified query handler)
 *
 * Run from Apps Script editor: select runClaudeAPITests, click Run.
 * View results in View → Logs.
 *
 * Unit tests for parsing/classification run without network.
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

  // ── _parseClassificationResponse (unit tests, no network) ─────────────────

  results.push('\n_parseClassificationResponse()');

  it('parses a clean fetch_ayah JSON object', function () {
    var parsed = _parseClassificationResponse('{"action":"fetch_ayah","surah":2,"ayah":255}');
    expect(parsed.action).toBe('fetch_ayah');
    expect(parsed.surah).toBe(2);
    expect(parsed.ayah).toBe(255);
  });

  it('parses an exact_search JSON object', function () {
    var parsed = _parseClassificationResponse('{"action":"exact_search","query":"بسم الله"}');
    expect(parsed.action).toBe('exact_search');
    expect(parsed.query).toBe('بسم الله');
  });

  it('parses a semantic_search JSON object with references', function () {
    var text = '{"action":"semantic_search","references":[{"surah":2,"ayah":153},{"surah":3,"ayah":200}]}';
    var parsed = _parseClassificationResponse(text);
    expect(parsed.action).toBe('semantic_search');
    expect(parsed.references.length).toBe(2);
    expect(parsed.references[0].surah).toBe(2);
    expect(parsed.references[0].ayah).toBe(153);
  });

  it('parses a clarify JSON object', function () {
    var parsed = _parseClassificationResponse('{"action":"clarify","message":"Which surah?"}');
    expect(parsed.action).toBe('clarify');
    expect(parsed.message).toBe('Which surah?');
  });

  it('parses JSON wrapped in markdown code fences', function () {
    var text = '```json\n{"action":"fetch_ayah","surah":1,"ayah":1}\n```';
    var parsed = _parseClassificationResponse(text);
    expect(parsed.action).toBe('fetch_ayah');
    expect(parsed.surah).toBe(1);
    expect(parsed.ayah).toBe(1);
  });

  it('extracts JSON object from surrounding text', function () {
    var text = 'Here is the response:\n{"action":"fetch_ayah","surah":55,"ayah":13}\nHope this helps.';
    var parsed = _parseClassificationResponse(text);
    expect(parsed.action).toBe('fetch_ayah');
    expect(parsed.surah).toBe(55);
  });

  it('returns null for null/empty input', function () {
    expect(_parseClassificationResponse(null) === null).toBe(true);
    expect(_parseClassificationResponse('') === null).toBe(true);
  });

  it('returns null for invalid JSON', function () {
    expect(_parseClassificationResponse('not json at all') === null).toBe(true);
  });

  // ── _handleFetchAyah (integration, real network) ──────────────────────────

  results.push('\n_handleFetchAyah()');

  it('fetches a valid ayah (1:1)', function () {
    var result = _handleFetchAyah({ surah: 1, ayah: 1 }, 'uthmani');
    expect(result.type).toBe('single');
    expect(result.results.length).toBe(1);
    expect(result.results[0].surah).toBe(1);
    expect(result.results[0].ayah).toBe(1);
    expect(result.results[0].arabicText).toBeTruthy();
    expect(result.results[0].translationText).toBeTruthy();
  });

  it('fetches Ayat al-Kursi (2:255)', function () {
    var result = _handleFetchAyah({ surah: 2, ayah: 255 }, 'uthmani');
    expect(result.type).toBe('single');
    expect(result.results[0].surah).toBe(2);
    expect(result.results[0].ayah).toBe(255);
  });

  it('returns error for invalid surah (0)', function () {
    var result = _handleFetchAyah({ surah: 0, ayah: 1 }, 'uthmani');
    expect(result.type).toBe('error');
  });

  it('returns error for surah > 114', function () {
    var result = _handleFetchAyah({ surah: 115, ayah: 1 }, 'uthmani');
    expect(result.type).toBe('error');
  });

  it('returns error for non-existent ayah', function () {
    var result = _handleFetchAyah({ surah: 1, ayah: 999 }, 'uthmani');
    expect(result.type).toBe('error');
  });

  // ── _handleExactSearch (integration, real network for QuranData) ──────────

  results.push('\n_handleExactSearch()');

  it('finds results for Arabic text "الكرسي"', function () {
    var result = _handleExactSearch({ query: 'الكرسي' }, 'simple');
    expect(result.type).toBe('search');
    expect(result.results.length).toBeGreaterThan(0);
    var found = false;
    for (var i = 0; i < result.results.length; i++) {
      if (result.results[i].surah === 2 && result.results[i].ayah === 255) found = true;
    }
    if (!found) throw new Error('Expected 2:255 in results');
  });

  it('returns search type with empty results for nonsense query', function () {
    var result = _handleExactSearch({ query: 'xyznonexistent123' }, 'simple');
    expect(result.type).toBe('search');
    expect(result.results.length).toBe(0);
  });

  it('returns error for empty query', function () {
    var result = _handleExactSearch({ query: '' }, 'simple');
    expect(result.type).toBe('error');
  });

  // ── _handleSemanticSearch (integration, validates against quranapi) ────────

  results.push('\n_handleSemanticSearch()');

  it('validates known-good references', function () {
    var parsed = { references: [{ surah: 1, ayah: 1 }, { surah: 2, ayah: 255 }] };
    var result = _handleSemanticSearch(parsed, 'uthmani');
    expect(result.type).toBe('semantic');
    expect(result.results.length).toBe(2);
    expect(result.results[0].arabicText).toBeTruthy();
    expect(result.results[0].translationText).toBeTruthy();
  });

  it('silently discards hallucinated references', function () {
    var parsed = { references: [{ surah: 1, ayah: 1 }, { surah: 999, ayah: 1 }] };
    var result = _handleSemanticSearch(parsed, 'uthmani');
    expect(result.type).toBe('semantic');
    expect(result.results.length).toBe(1);
  });

  it('returns error when all references are invalid', function () {
    var parsed = { references: [{ surah: 999, ayah: 1 }] };
    var result = _handleSemanticSearch(parsed, 'uthmani');
    expect(result.type).toBe('error');
  });

  it('returns error for empty references array', function () {
    var parsed = { references: [] };
    var result = _handleSemanticSearch(parsed, 'uthmani');
    expect(result.type).toBe('error');
  });

  it('caps at AI_MAX_REFERENCES', function () {
    var refs = [];
    for (var i = 1; i <= 15; i++) refs.push({ surah: 1, ayah: i });
    var parsed = { references: refs };
    var result = _handleSemanticSearch(parsed, 'uthmani');
    expect(result.type).toBe('semantic');
    if (result.results.length > AI_MAX_REFERENCES) {
      throw new Error('Expected <= ' + AI_MAX_REFERENCES + ' results but got ' + result.results.length);
    }
  });

  // ── processUnifiedQuery (integration) ─────────────────────────────────────

  results.push('\nprocessUnifiedQuery()');

  it('returns NO_API_KEY when no key is set', function () {
    var savedKey = getClaudeApiKey();
    try {
      PropertiesService.getUserProperties().deleteProperty(PROPERTY_KEYS.CLAUDE_API_KEY);
      var result = processUnifiedQuery('show me 2:255');
      expect(result.type).toBe('error');
      expect(result.error).toBe('NO_API_KEY');
    } finally {
      if (savedKey) setClaudeApiKey(savedKey);
    }
  });

  it('returns error for empty query', function () {
    var result = processUnifiedQuery('');
    expect(result.type).toBe('error');
  });

  it('returns error for whitespace-only query', function () {
    var result = processUnifiedQuery('   ');
    expect(result.type).toBe('error');
  });

  // Full integration test — only runs if API key is present
  var apiKey = getClaudeApiKey();
  if (apiKey) {
    it('processUnifiedQuery("show me ayat al kursi") returns a single result (live API)', function () {
      var result = processUnifiedQuery('show me ayat al kursi');
      if (result.type === 'error') throw new Error('Got error: ' + result.error);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].arabicText).toBeTruthy();
    });

    it('processUnifiedQuery("verses about patience") returns semantic results (live API)', function () {
      var result = processUnifiedQuery('verses about patience');
      if (result.type === 'error') throw new Error('Got error: ' + result.error);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].surah).toBeGreaterThan(0);
    });
  } else {
    results.push('  ⊘ Skipped live API tests (no Claude API key configured)');
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');

  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
