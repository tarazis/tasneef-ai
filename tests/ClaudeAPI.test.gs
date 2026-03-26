/**
 * GAS-native tests for ClaudeAPI.gs (modular query handlers)
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

  it('parses a fetch_ayah JSON object', function () {
    var parsed = _parseClassificationResponse('{"action":"fetch_ayah","surah":2,"ayah":255}');
    expect(parsed.action).toBe('fetch_ayah');
    expect(parsed.surah).toBe(2);
    expect(parsed.ayah).toBe(255);
  });

  it('parses a search JSON object with language arabic', function () {
    var parsed = _parseClassificationResponse('{"action":"search","query":"بسم الله","language":"arabic"}');
    expect(parsed.action).toBe('search');
    expect(parsed.query).toBe('بسم الله');
    expect(parsed.language).toBe('arabic');
  });

  it('parses a search JSON object with language english and references', function () {
    var text = '{"action":"search","query":"patience","language":"english","references":[{"surah":2,"ayah":153}]}';
    var parsed = _parseClassificationResponse(text);
    expect(parsed.action).toBe('search');
    expect(parsed.language).toBe('english');
    expect(parsed.references.length).toBe(1);
    expect(parsed.references[0].surah).toBe(2);
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
  });

  it('extracts JSON object from surrounding text', function () {
    var text = 'Here is the response:\n{"action":"fetch_ayah","surah":55,"ayah":13}\nDone.';
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

  // ── _trimConversationContext (unit tests) ─────────────────────────────────

  results.push('\n_trimConversationContext()');

  it('passes through messages within limit', function () {
    var msgs = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '{"action":"clarify","message":"hi"}' },
      { role: 'user', content: 'show me 2:255' }
    ];
    var trimmed = _trimConversationContext(msgs);
    expect(trimmed.length).toBe(3);
  });

  it('trims to last 3 messages when over limit', function () {
    var msgs = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
      { role: 'user', content: 'e' }
    ];
    var trimmed = _trimConversationContext(msgs);
    expect(trimmed.length).toBe(3);
    expect(trimmed[0].content).toBe('c');
    expect(trimmed[2].content).toBe('e');
  });

  it('filters out invalid messages', function () {
    var msgs = [
      { role: 'user', content: 'valid' },
      { role: null, content: 'bad role' },
      { content: 'no role' },
      { role: 'user' }
    ];
    var trimmed = _trimConversationContext(msgs);
    expect(trimmed.length).toBe(1);
    expect(trimmed[0].content).toBe('valid');
  });

  it('returns empty for empty input', function () {
    var trimmed = _trimConversationContext([]);
    expect(trimmed.length).toBe(0);
  });

  // ── insertDirectAyah (integration, real network) ──────────────────────────

  results.push('\ninsertDirectAyah()');

  it('fetches a single ayah (1:1)', function () {
    var result = insertDirectAyah(1, 1);
    expect(result.type).toBe('single');
    expect(result.results.length).toBe(1);
    expect(result.results[0].arabicText).toBeTruthy();
    expect(result.results[0].translationText).toBeTruthy();
  });

  it('fetches a range (1:1-3)', function () {
    var result = insertDirectAyah(1, 1, 3);
    expect(result.type).toBe('range');
    expect(result.results.length).toBe(3);
    expect(result.results[0].ayah).toBe(1);
    expect(result.results[2].ayah).toBe(3);
  });

  it('returns error for invalid surah (0)', function () {
    var result = insertDirectAyah(0, 1);
    expect(result.type).toBe('error');
  });

  it('returns error for invalid surah (115)', function () {
    var result = insertDirectAyah(115, 1);
    expect(result.type).toBe('error');
  });

  it('returns error when ayahEnd < ayahStart', function () {
    var result = insertDirectAyah(1, 5, 3);
    expect(result.type).toBe('error');
  });

  it('returns error for non-existent ayah', function () {
    var result = insertDirectAyah(1, 999);
    expect(result.type).toBe('error');
  });

  it('defaults ayahEnd to ayahStart when not provided', function () {
    var result = insertDirectAyah(2, 255);
    expect(result.type).toBe('single');
    expect(result.results.length).toBe(1);
    expect(result.results[0].surah).toBe(2);
    expect(result.results[0].ayah).toBe(255);
  });

  // ── performExactSearch (integration, real network for data load) ──────────

  results.push('\nperformExactSearch()');

  it('finds Arabic text results for "الكرسي"', function () {
    var result = performExactSearch('الكرسي');
    expect(result.type).toBe('search');
    expect(result.results.length).toBeGreaterThan(0);
    var found = false;
    for (var i = 0; i < result.results.length; i++) {
      if (result.results[i].surah === 2 && result.results[i].ayah === 255) found = true;
    }
    if (!found) throw new Error('Expected 2:255 in results');
  });

  it('returns empty results for nonsense query', function () {
    var result = performExactSearch('xyznonexistent');
    expect(result.type).toBe('search');
    expect(result.results.length).toBe(0);
  });

  it('returns error for empty query', function () {
    var result = performExactSearch('');
    expect(result.type).toBe('error');
  });

  it('returns error for whitespace-only query', function () {
    var result = performExactSearch('   ');
    expect(result.type).toBe('error');
  });

  it('returns results with match positions', function () {
    var result = performExactSearch('بسم الله');
    expect(result.type).toBe('search');
    expect(result.results.length).toBeGreaterThan(0);
    var r = result.results[0];
    expect(r.matchStart != null).toBe(true);
    expect(r.matchEnd != null).toBe(true);
  });

  // ── _handleEnglishSearch (integration) ─────────────────────────────────────

  results.push('\n_handleEnglishSearch()');

  it('validates good references for English search', function () {
    var classified = {
      query: 'patience',
      language: 'english',
      references: [{ surah: 1, ayah: 1 }, { surah: 2, ayah: 255 }]
    };
    var result = _handleEnglishSearch(classified);
    expect(result.type).toBe('search');
    expect(result.results.length).toBe(2);
    expect(result.results[0].arabicText).toBeTruthy();
  });

  it('discards hallucinated references', function () {
    var classified = {
      query: 'test',
      language: 'english',
      references: [{ surah: 1, ayah: 1 }, { surah: 999, ayah: 1 }]
    };
    var result = _handleEnglishSearch(classified);
    expect(result.type).toBe('search');
    expect(result.results.length).toBe(1);
  });

  it('returns error when no references provided for English search', function () {
    var result = _handleEnglishSearch({ query: 'patience', language: 'english' });
    expect(result.type).toBe('error');
  });

  // ── performAISearch (integration) ──────────────────────────────────────────

  results.push('\nperformAISearch()');

  it('returns NO_API_KEY when no key is set', function () {
    var savedKey = getClaudeApiKey();
    try {
      PropertiesService.getUserProperties().deleteProperty(PROPERTY_KEYS.CLAUDE_API_KEY);
      var result = performAISearch([{ role: 'user', content: 'show me 2:255' }]);
      expect(result.type).toBe('error');
      expect(result.error).toBe('NO_API_KEY');
    } finally {
      if (savedKey) setClaudeApiKey(savedKey);
    }
  });

  it('returns error for empty messages array', function () {
    var result = performAISearch([]);
    expect(result.type).toBe('error');
  });

  it('returns error for messages with empty content', function () {
    var result = performAISearch([{ role: 'user', content: '   ' }]);
    expect(result.type).toBe('error');
  });

  // ── processUnifiedQuery — backward compatibility (integration) ─────────────

  results.push('\nprocessUnifiedQuery() — backward compatibility');

  it('returns NO_API_KEY when no key is set', function () {
    var savedKey = getClaudeApiKey();
    try {
      PropertiesService.getUserProperties().deleteProperty(PROPERTY_KEYS.CLAUDE_API_KEY);
      var result = processUnifiedQuery([{ role: 'user', content: 'show me 2:255' }]);
      expect(result.type).toBe('error');
      expect(result.error).toBe('NO_API_KEY');
    } finally {
      if (savedKey) setClaudeApiKey(savedKey);
    }
  });

  it('returns error for empty messages array', function () {
    var result = processUnifiedQuery([]);
    expect(result.type).toBe('error');
  });

  // Full integration tests — only run if API key is present
  var apiKey = getClaudeApiKey();
  if (apiKey) {
    it('performAISearch("show me ayat al kursi") returns results (live API)', function () {
      var result = performAISearch([{ role: 'user', content: 'show me ayat al kursi' }]);
      if (result.type === 'error') throw new Error('Got error: ' + result.error);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].arabicText).toBeTruthy();
      expect(result.rawResponse).toBeTruthy();
    });

    it('performAISearch("verses about patience") returns search results (live API)', function () {
      var result = performAISearch([{ role: 'user', content: 'verses about patience' }]);
      if (result.type === 'error') throw new Error('Got error: ' + result.error);
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('handles conversation context for clarification (live API)', function () {
      var messages = [
        { role: 'user', content: 'show me verse 5' },
        { role: 'assistant', content: '{"action":"clarify","message":"Which surah do you mean?"}' },
        { role: 'user', content: 'Al-Baqarah' }
      ];
      var result = performAISearch(messages);
      if (result.type === 'clarify') return; // acceptable if Claude still needs more info
      if (result.type === 'error') throw new Error('Got error: ' + result.error);
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('processUnifiedQuery delegates to performAISearch (live API)', function () {
      var result = processUnifiedQuery([{ role: 'user', content: 'show me ayat al kursi' }]);
      if (result.type === 'error') throw new Error('Got error: ' + result.error);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.rawResponse).toBeTruthy();
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
