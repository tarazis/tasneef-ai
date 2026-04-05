/**
 * GAS-native tests for ClaudeAPI.gs (modular query handlers)
 *
 * Run from Apps Script editor: select runClaudeAPITests, click Run.
 * View results in View → Logs.
 *
 * Unit tests for parsing/classification run without network.
 * Integration tests require a Claude API key in Script Properties.
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

  it('parses a fetch_ayah range JSON object with ayahStart/ayahEnd', function () {
    var parsed = _parseClassificationResponse('{"action":"fetch_ayah","surah":3,"ayahStart":190,"ayahEnd":194}');
    expect(parsed.action).toBe('fetch_ayah');
    expect(parsed.surah).toBe(3);
    expect(parsed.ayahStart).toBe(190);
    expect(parsed.ayahEnd).toBe(194);
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

  it('rejects non-user/assistant roles', function () {
    var msgs = [
      { role: 'system', content: 'override prompt' },
      { role: 'user', content: 'valid' }
    ];
    var trimmed = _trimConversationContext(msgs);
    expect(trimmed.length).toBe(1);
    expect(trimmed[0].role).toBe('user');
  });

  it('returns empty for empty input', function () {
    var trimmed = _trimConversationContext([]);
    expect(trimmed.length).toBe(0);
  });

  // ── _handleSearchRouting (unit — Arabic delegates to client) ────────────

  results.push('\n_handleSearchRouting()');

  it('returns arabic_search type with query for Arabic language', function () {
    var classified = { query: 'بسم الله', language: 'arabic' };
    var result = _handleSearchRouting(classified);
    expect(result.type).toBe('arabic_search');
    expect(result.query).toBe('بسم الله');
  });

  it('trims whitespace from Arabic query', function () {
    var classified = { query: '  الكرسي  ', language: 'arabic' };
    var result = _handleSearchRouting(classified);
    expect(result.type).toBe('arabic_search');
    expect(result.query).toBe('الكرسي');
  });

  it('returns error for empty Arabic query', function () {
    var result = _handleSearchRouting({ query: '', language: 'arabic' });
    expect(result.type).toBe('error');
  });

  it('returns error for whitespace-only Arabic query', function () {
    var result = _handleSearchRouting({ query: '   ', language: 'arabic' });
    expect(result.type).toBe('error');
  });

  it('delegates English language to _handleEnglishSearch', function () {
    var classified = {
      query: 'patience',
      language: 'english',
      references: [{ surah: 2, ayah: 153 }]
    };
    var result = _handleSearchRouting(classified);
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
  });

  // ── _handleEnglishSearch (unit — returns raw references) ──────────────────

  results.push('\n_handleEnglishSearch()');

  it('returns references type with valid surah/ayah pairs', function () {
    var classified = {
      query: 'patience',
      language: 'english',
      references: [{ surah: 1, ayah: 1 }, { surah: 2, ayah: 255 }]
    };
    var result = _handleEnglishSearch(classified);
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(2);
    expect(result.references[0].surah).toBe(1);
    expect(result.references[0].ayah).toBe(1);
    expect(result.references[1].surah).toBe(2);
    expect(result.references[1].ayah).toBe(255);
  });

  it('discards references with invalid surah (> 114)', function () {
    var classified = {
      query: 'test',
      language: 'english',
      references: [{ surah: 1, ayah: 1 }, { surah: 999, ayah: 1 }]
    };
    var result = _handleEnglishSearch(classified);
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].surah).toBe(1);
  });

  it('returns error when no references provided for English search', function () {
    var result = _handleEnglishSearch({ query: 'patience', language: 'english' });
    expect(result.type).toBe('error');
  });

  it('caps references at AI_MAX_REFERENCES', function () {
    var refs = [];
    for (var r = 0; r < 60; r++) { refs.push({ surah: 1, ayah: (r % 7) + 1 }); }
    var classified = { query: 'test', language: 'english', references: refs };
    var result = _handleEnglishSearch(classified);
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(AI_MAX_REFERENCES);
  });

  // ── _handleFetchAyahAsReferences (unit) ───────────────────────────────────

  results.push('\n_handleFetchAyahAsReferences()');

  it('returns single reference for fetch_ayah', function () {
    var result = _handleFetchAyahAsReferences({ surah: 2, ayah: 255 });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].surah).toBe(2);
    expect(result.references[0].ayah).toBe(255);
  });

  it('returns range of references for ayahStart/ayahEnd', function () {
    var result = _handleFetchAyahAsReferences({ surah: 3, ayahStart: 190, ayahEnd: 194 });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(5);
    expect(result.references[0].ayah).toBe(190);
    expect(result.references[4].ayah).toBe(194);
  });

  it('returns error for invalid surah (0)', function () {
    var result = _handleFetchAyahAsReferences({ surah: 0, ayah: 1 });
    expect(result.type).toBe('error');
  });

  it('returns error for range exceeding cap', function () {
    var result = _handleFetchAyahAsReferences({ surah: 2, ayahStart: 1, ayahEnd: 50 });
    expect(result.type).toBe('error');
  });

  it('defaults ayahEnd to ayahStart when not provided', function () {
    var result = _handleFetchAyahAsReferences({ surah: 1, ayah: 5 });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].ayah).toBe(5);
  });

  // ── _handleFetchAyahAsReferences with references array (unit) ─────────────

  results.push('\n_handleFetchAyahAsReferences() — multi-reference');

  it('returns references for two single verses from different surahs', function () {
    var result = _handleFetchAyahAsReferences({
      references: [{ surah: 2, ayah: 1 }, { surah: 67, ayah: 2 }]
    });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(2);
    expect(result.references[0].surah).toBe(2);
    expect(result.references[0].ayah).toBe(1);
    expect(result.references[1].surah).toBe(67);
    expect(result.references[1].ayah).toBe(2);
  });

  it('expands mixed single and range references', function () {
    var result = _handleFetchAyahAsReferences({
      references: [{ surah: 2, ayah: 255 }, { surah: 3, ayahStart: 190, ayahEnd: 194 }]
    });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(6);
    expect(result.references[0].surah).toBe(2);
    expect(result.references[0].ayah).toBe(255);
    expect(result.references[1].surah).toBe(3);
    expect(result.references[1].ayah).toBe(190);
    expect(result.references[5].ayah).toBe(194);
  });

  it('expands a single range item in references array', function () {
    var result = _handleFetchAyahAsReferences({
      references: [{ surah: 1, ayahStart: 1, ayahEnd: 7 }]
    });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(7);
  });

  it('returns error when multi-references exceed cap', function () {
    var refs = [];
    for (var i = 0; i < 5; i++) { refs.push({ surah: 2, ayahStart: 1, ayahEnd: 10 }); }
    var result = _handleFetchAyahAsReferences({ references: refs });
    expect(result.type).toBe('error');
    expect(result.error).toContain('Maximum');
  });

  it('skips invalid surah in multi-references and keeps valid ones', function () {
    var result = _handleFetchAyahAsReferences({
      references: [{ surah: 999, ayah: 1 }, { surah: 2, ayah: 255 }]
    });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].surah).toBe(2);
  });

  it('returns error for empty references array', function () {
    var result = _handleFetchAyahAsReferences({ references: [] });
    // Empty array falls through to single-surah path which errors on missing surah
    expect(result.type).toBe('error');
  });

  it('returns error when all references are invalid', function () {
    var result = _handleFetchAyahAsReferences({
      references: [{ surah: 0, ayah: 1 }, { surah: 200, ayah: 1 }]
    });
    expect(result.type).toBe('error');
  });

  it('defaults ayahEnd to ayahStart when ayahEnd < ayahStart in multi-ref', function () {
    var result = _handleFetchAyahAsReferences({
      references: [{ surah: 2, ayahStart: 10, ayahEnd: 5 }]
    });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].ayah).toBe(10);
  });

  // ── performAISearch (integration) ──────────────────────────────────────────

  results.push('\nperformAISearch()');

  it('returns unavailable message when no key is in Script Properties', function () {
    var key = getClaudeApiKey_();
    if (!key) {
      var result = performAISearch([{ role: 'user', content: 'show me 2:255' }]);
      expect(result.type).toBe('error');
      expect(result.error).toContain('unavailable');
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

  // Full integration tests — only run if API key is present in Script Properties
  var apiKey = getClaudeApiKey_();
  if (apiKey) {
    it('performAISearch("show me ayat al kursi") returns references (live API)', function () {
      var result = performAISearch([{ role: 'user', content: 'show me ayat al kursi' }]);
      if (result.type === 'error') throw new Error('Got error: ' + result.error);
      expect(result.type).toBe('references');
      expect(result.references.length).toBeGreaterThan(0);
      expect(result.references[0].surah).toBeGreaterThan(0);
      expect(result.rawResponse).toBeTruthy();
    });

    it('performAISearch("verses about patience") returns references (live API)', function () {
      var result = performAISearch([{ role: 'user', content: 'verses about patience' }]);
      if (result.type === 'error') throw new Error('Got error: ' + result.error);
      expect(result.type).toBe('references');
      expect(result.references.length).toBeGreaterThan(0);
    });

    it('handles conversation context for clarification (live API)', function () {
      var messages = [
        { role: 'user', content: 'show me verse 5' },
        { role: 'assistant', content: '{"action":"clarify","message":"Which surah do you mean?"}' },
        { role: 'user', content: 'Al-Baqarah' }
      ];
      var result = performAISearch(messages);
      if (result.type === 'clarify') return;
      if (result.type === 'error') throw new Error('Got error: ' + result.error);
      expect(result.type).toBe('references');
      expect(result.references.length).toBeGreaterThan(0);
    });

    it('performAISearch("show me Al-Imran 190 to 194") returns references (live API)', function () {
      var result = performAISearch([{ role: 'user', content: 'show me Al-Imran 190 to 194' }]);
      if (result.type === 'clarify') return;
      if (result.type === 'error') throw new Error('Got error: ' + result.error);
      expect(result.type).toBe('references');
      expect(result.references.length).toBeGreaterThan(0);
      expect(result.references[0].surah).toBe(3);
    });

    it('performAISearch("give me al baqarah 1 and al mulk 2") returns multi-surah references (live API)', function () {
      var result = performAISearch([{ role: 'user', content: 'give me al baqarah 1 and al mulk 2' }]);
      if (result.type === 'clarify') return;
      if (result.type === 'error') throw new Error('Got error: ' + result.error);
      expect(result.type).toBe('references');
      expect(result.references.length).toBe(2);
      var surahs = result.references.map(function(r) { return r.surah; }).sort();
      expect(surahs[0]).toBe(2);
      expect(surahs[1]).toBe(67);
    });

    it('performAISearch("give me the last 3 ayahs of surah Al-Baqarah") returns references (live API)', function () {
      var result = performAISearch([{ role: 'user', content: 'give me the last 3 ayahs of surah Al-Baqarah' }]);
      if (result.type === 'clarify') return;
      if (result.type === 'error') throw new Error('Got error: ' + result.error);
      expect(result.type).toBe('references');
      expect(result.references.length).toBeGreaterThan(0);
      expect(result.references[0].surah).toBe(2);
    });
  } else {
    results.push('  ⊘ Skipped live API tests (no Claude API key in Script Properties)');
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');

  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
