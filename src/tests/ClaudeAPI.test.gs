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

  it('parses a fetch_ayah JSON object with ayahStart/ayahEnd', function () {
    var parsed = _parseClassificationResponse('{"action":"fetch_ayah","surah":2,"ayahStart":255,"ayahEnd":255}');
    expect(parsed.action).toBe('fetch_ayah');
    expect(parsed.surah).toBe(2);
    expect(parsed.ayahStart).toBe(255);
    expect(parsed.ayahEnd).toBe(255);
  });

  it('parses a fetch_ayah range JSON object with ayahStart/ayahEnd', function () {
    var parsed = _parseClassificationResponse('{"action":"fetch_ayah","surah":3,"ayahStart":190,"ayahEnd":194}');
    expect(parsed.action).toBe('fetch_ayah');
    expect(parsed.surah).toBe(3);
    expect(parsed.ayahStart).toBe(190);
    expect(parsed.ayahEnd).toBe(194);
  });

  it('parses a fetch_ayah JSON object with references array', function () {
    var parsed = _parseClassificationResponse(
      '{"action":"fetch_ayah","references":[{"surah":2,"ayahStart":255,"ayahEnd":255}]}'
    );
    expect(parsed.action).toBe('fetch_ayah');
    expect(parsed.references.length).toBe(1);
    expect(parsed.references[0].surah).toBe(2);
    expect(parsed.references[0].ayahStart).toBe(255);
  });

  it('parses an exact_search JSON object', function () {
    var parsed = _parseClassificationResponse('{"action":"exact_search","query":"بسم الله"}');
    expect(parsed.action).toBe('exact_search');
    expect(parsed.query).toBe('بسم الله');
  });

  it('parses a semantic_search JSON object with references', function () {
    var text = '{"action":"semantic_search","references":[{"surah":2,"ayah":153}]}';
    var parsed = _parseClassificationResponse(text);
    expect(parsed.action).toBe('semantic_search');
    expect(parsed.references.length).toBe(1);
    expect(parsed.references[0].surah).toBe(2);
  });

  it('parses a semantic_search JSON object with queries and references', function () {
    var text = '{"action":"semantic_search","queries":["patience in hardship","sabr during trials"],"references":[{"surah":2,"ayah":153}]}';
    var parsed = _parseClassificationResponse(text);
    expect(parsed.action).toBe('semantic_search');
    expect(parsed.queries.length).toBe(2);
    expect(parsed.queries[0]).toBe('patience in hardship');
    expect(parsed.queries[1]).toBe('sabr during trials');
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

  // ── _parseRerankedAyahKeys_ (unit tests, no network) ───────────────────────

  results.push('\n_parseRerankedAyahKeys_()');

  it('parses a bare JSON array of ayah keys', function () {
    var keys = _parseRerankedAyahKeys_('["30:21","4:19","2:231"]');
    expect(keys.length).toBe(3);
    expect(keys[0]).toBe('30:21');
    expect(keys[1]).toBe('4:19');
    expect(keys[2]).toBe('2:231');
  });

  it('parses JSON array wrapped in markdown fences', function () {
    var keys = _parseRerankedAyahKeys_('```json\n["2:153","3:200"]\n```');
    expect(keys.length).toBe(2);
    expect(keys[0]).toBe('2:153');
  });

  it('extracts array from surrounding text', function () {
    var keys = _parseRerankedAyahKeys_('Here: ["67:1","67:2"]');
    expect(keys.length).toBe(2);
  });

  it('filters out invalid surah or ayah', function () {
    var keys = _parseRerankedAyahKeys_('["2:153","0:1","200:1","2:255"]');
    expect(keys.length).toBe(2);
    expect(keys[0]).toBe('2:153');
    expect(keys[1]).toBe('2:255');
  });

  it('returns null for empty or non-array', function () {
    expect(_parseRerankedAyahKeys_(null) === null).toBe(true);
    expect(_parseRerankedAyahKeys_('') === null).toBe(true);
    expect(_parseRerankedAyahKeys_('{}') === null).toBe(true);
    expect(_parseRerankedAyahKeys_('[]') === null).toBe(true);
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

  // ── _handleExactSearch (unit — Arabic corpus search) ────────────────────

  results.push('\n_handleExactSearch()');

  it('returns arabic_search type with query', function () {
    var result = _handleExactSearch({ query: 'بسم الله' });
    expect(result.type).toBe('arabic_search');
    expect(result.query).toBe('بسم الله');
  });

  it('trims whitespace from query', function () {
    var result = _handleExactSearch({ query: '  الكرسي  ' });
    expect(result.type).toBe('arabic_search');
    expect(result.query).toBe('الكرسي');
  });

  it('returns error for empty query', function () {
    var result = _handleExactSearch({ query: '' });
    expect(result.type).toBe('error');
  });

  it('returns error for whitespace-only query', function () {
    var result = _handleExactSearch({ query: '   ' });
    expect(result.type).toBe('error');
  });

  // ── _mergeConsecutiveReferences (unit) ──────────────���─────────────────────

  results.push('\n_mergeConsecutiveReferences()');

  it('merges consecutive same-surah refs into one group', function () {
    var refs = [{ surah: 3, ayah: 123 }, { surah: 3, ayah: 124 }, { surah: 3, ayah: 125 }];
    var groups = _mergeConsecutiveReferences(refs);
    expect(groups.length).toBe(1);
    expect(groups[0].surah).toBe(3);
    expect(groups[0].ayahStart).toBe(123);
    expect(groups[0].ayahEnd).toBe(125);
  });

  it('keeps non-consecutive same-surah refs as separate groups', function () {
    var refs = [{ surah: 2, ayah: 255 }, { surah: 2, ayah: 153 }];
    var groups = _mergeConsecutiveReferences(refs);
    expect(groups.length).toBe(2);
    expect(groups[0].ayahStart).toBe(153);
    expect(groups[1].ayahStart).toBe(255);
  });

  it('sorts and groups multi-surah refs correctly', function () {
    var refs = [{ surah: 3, ayah: 124 }, { surah: 2, ayah: 255 }, { surah: 3, ayah: 123 }];
    var groups = _mergeConsecutiveReferences(refs);
    expect(groups.length).toBe(2);
    expect(groups[0].surah).toBe(2);
    expect(groups[0].ayahStart).toBe(255);
    expect(groups[0].ayahEnd).toBe(255);
    expect(groups[1].surah).toBe(3);
    expect(groups[1].ayahStart).toBe(123);
    expect(groups[1].ayahEnd).toBe(124);
  });

  it('returns single group for single ref', function () {
    var groups = _mergeConsecutiveReferences([{ surah: 1, ayah: 5 }]);
    expect(groups.length).toBe(1);
    expect(groups[0].surah).toBe(1);
    expect(groups[0].ayahStart).toBe(5);
    expect(groups[0].ayahEnd).toBe(5);
  });

  it('returns empty array for empty input', function () {
    var groups = _mergeConsecutiveReferences([]);
    expect(groups.length).toBe(0);
  });

  it('returns empty array for null input', function () {
    var groups = _mergeConsecutiveReferences(null);
    expect(groups.length).toBe(0);
  });

  it('handles unsorted input across multiple surahs', function () {
    var refs = [
      { surah: 67, ayah: 3 }, { surah: 2, ayah: 255 },
      { surah: 67, ayah: 1 }, { surah: 67, ayah: 2 }
    ];
    var groups = _mergeConsecutiveReferences(refs);
    expect(groups.length).toBe(2);
    expect(groups[0].surah).toBe(2);
    expect(groups[0].ayahStart).toBe(255);
    expect(groups[1].surah).toBe(67);
    expect(groups[1].ayahStart).toBe(1);
    expect(groups[1].ayahEnd).toBe(3);
  });

  // ── _mergeConsecutiveReferencesInInputOrder_ (RAG score order) ─────────────

  results.push('\n_mergeConsecutiveReferencesInInputOrder_()');

  it('preserves input order across surahs without sorting', function () {
    var refs = [{ surah: 3, ayah: 124 }, { surah: 2, ayah: 255 }, { surah: 3, ayah: 123 }];
    var groups = _mergeConsecutiveReferencesInInputOrder_(refs);
    expect(groups.length).toBe(3);
    expect(groups[0].surah).toBe(3);
    expect(groups[0].ayahStart).toBe(124);
    expect(groups[0].ayahEnd).toBe(124);
    expect(groups[1].surah).toBe(2);
    expect(groups[1].ayahStart).toBe(255);
    expect(groups[2].surah).toBe(3);
    expect(groups[2].ayahStart).toBe(123);
  });

  it('merges adjacent consecutive same-surah ayahs in input order', function () {
    var refs = [{ surah: 3, ayah: 190 }, { surah: 3, ayah: 191 }, { surah: 2, ayah: 255 }];
    var groups = _mergeConsecutiveReferencesInInputOrder_(refs);
    expect(groups.length).toBe(2);
    expect(groups[0].surah).toBe(3);
    expect(groups[0].ayahStart).toBe(190);
    expect(groups[0].ayahEnd).toBe(191);
    expect(groups[1].surah).toBe(2);
    expect(groups[1].ayahStart).toBe(255);
  });

  it('keeps non-adjacent same-surah refs separate unlike sorted merge', function () {
    var refs = [{ surah: 2, ayah: 255 }, { surah: 2, ayah: 153 }];
    var groups = _mergeConsecutiveReferencesInInputOrder_(refs);
    expect(groups.length).toBe(2);
    expect(groups[0].ayahStart).toBe(255);
    expect(groups[1].ayahStart).toBe(153);
  });

  it('returns empty for empty or null input order merge', function () {
    expect(_mergeConsecutiveReferencesInInputOrder_([]).length).toBe(0);
    expect(_mergeConsecutiveReferencesInInputOrder_(null).length).toBe(0);
  });

  // ── _handleSemanticSearch (unit — returns merged reference groups) ────────

  results.push('\n_handleSemanticSearch()');

  it('returns merged groups for valid surah/ayah pairs', function () {
    var classified = {
      references: [{ surah: 1, ayah: 1 }, { surah: 2, ayah: 255 }]
    };
    var result = _handleSemanticSearch(classified);
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(2);
    expect(result.references[0].surah).toBe(1);
    expect(result.references[0].ayahStart).toBe(1);
    expect(result.references[0].ayahEnd).toBe(1);
    expect(result.references[1].surah).toBe(2);
    expect(result.references[1].ayahStart).toBe(255);
    expect(result.references[1].ayahEnd).toBe(255);
  });

  it('merges consecutive semantic_search refs into range groups', function () {
    var classified = {
      references: [{ surah: 3, ayah: 123 }, { surah: 3, ayah: 124 }, { surah: 2, ayah: 255 }]
    };
    var result = _handleSemanticSearch(classified);
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(2);
    expect(result.references[0].surah).toBe(2);
    expect(result.references[0].ayahStart).toBe(255);
    expect(result.references[1].surah).toBe(3);
    expect(result.references[1].ayahStart).toBe(123);
    expect(result.references[1].ayahEnd).toBe(124);
  });

  it('discards references with invalid surah (> 114)', function () {
    var classified = {
      references: [{ surah: 1, ayah: 1 }, { surah: 999, ayah: 1 }]
    };
    var result = _handleSemanticSearch(classified);
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].surah).toBe(1);
  });

  it('returns error when no references provided', function () {
    var result = _handleSemanticSearch({});
    expect(result.type).toBe('error');
  });

  it('caps references at AI_MAX_REFERENCES before merging', function () {
    var refs = [];
    for (var r = 0; r < 60; r++) { refs.push({ surah: 1, ayah: (r % 7) + 1 }); }
    var classified = { references: refs };
    var result = _handleSemanticSearch(classified);
    expect(result.type).toBe('references');
    // After capping at 50 and merging, should have one group for surah 1
    expect(result.references.length).toBeGreaterThan(0);
    expect(result.references[0].surah).toBe(1);
  });

  it('applies classified.limit before merging (single result)', function () {
    var classified = {
      limit: 1,
      references: [{ surah: 1, ayah: 1 }, { surah: 2, ayah: 255 }, { surah: 3, ayah: 190 }]
    };
    var result = _handleSemanticSearch(classified);
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].surah).toBe(1);
    expect(result.references[0].ayahStart).toBe(1);
    expect(result.references[0].ayahEnd).toBe(1);
  });

  it('applies classified.limit=3 and truncates before consecutive merge', function () {
    var classified = {
      limit: 3,
      references: [
        { surah: 2, ayah: 1 }, { surah: 2, ayah: 2 }, { surah: 2, ayah: 3 }, { surah: 2, ayah: 4 }
      ]
    };
    var result = _handleSemanticSearch(classified);
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].surah).toBe(2);
    expect(result.references[0].ayahStart).toBe(1);
    expect(result.references[0].ayahEnd).toBe(3);
  });

  it('ignores invalid classified.limit values', function () {
    var classified = {
      limit: 0,
      references: [{ surah: 1, ayah: 1 }, { surah: 2, ayah: 255 }]
    };
    var result = _handleSemanticSearch(classified);
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(2);
  });

  // ── _handleFetchAyahAsReferences (unit — returns merged groups) ────────────

  results.push('\n_handleFetchAyahAsReferences()');

  it('returns single group for fetch_ayah single ayah', function () {
    var result = _handleFetchAyahAsReferences({ surah: 2, ayah: 255 });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].surah).toBe(2);
    expect(result.references[0].ayahStart).toBe(255);
    expect(result.references[0].ayahEnd).toBe(255);
  });

  it('returns single merged group for ayahStart/ayahEnd range', function () {
    var result = _handleFetchAyahAsReferences({ surah: 3, ayahStart: 190, ayahEnd: 194 });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].surah).toBe(3);
    expect(result.references[0].ayahStart).toBe(190);
    expect(result.references[0].ayahEnd).toBe(194);
  });

  it('returns clarify for invalid surah (0)', function () {
    var result = _handleFetchAyahAsReferences({ surah: 0, ayah: 1 });
    expect(result.type).toBe('clarify');
    expect(result.message).toContain('not a valid surah number');
  });

  it('returns clarify for out-of-range surah (115)', function () {
    var result = _handleFetchAyahAsReferences({ surah: 115, ayah: 1 });
    expect(result.type).toBe('clarify');
    expect(result.message).toContain('115');
  });

  it('returns error for range exceeding safety cap', function () {
    var result = _handleFetchAyahAsReferences({ surah: 2, ayahStart: 1, ayahEnd: 301 });
    expect(result.type).toBe('error');
  });

  it('allows large range within safety cap (full surah)', function () {
    var result = _handleFetchAyahAsReferences({ surah: 2, ayahStart: 1, ayahEnd: 286 });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].ayahStart).toBe(1);
    expect(result.references[0].ayahEnd).toBe(286);
  });

  it('defaults ayahEnd to ayahStart when not provided', function () {
    var result = _handleFetchAyahAsReferences({ surah: 1, ayah: 5 });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].ayahStart).toBe(5);
    expect(result.references[0].ayahEnd).toBe(5);
  });

  // ── _handleFetchAyahAsReferences with references array (unit — merged) ────

  results.push('\n_handleFetchAyahAsReferences() — multi-reference (merged)');

  it('returns single merged group when references array has one item', function () {
    var result = _handleFetchAyahAsReferences({
      references: [{ surah: 2, ayahStart: 255, ayahEnd: 255 }]
    });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].surah).toBe(2);
    expect(result.references[0].ayahStart).toBe(255);
    expect(result.references[0].ayahEnd).toBe(255);
  });

  it('merges full surah into single group via references array', function () {
    var result = _handleFetchAyahAsReferences({
      references: [{ surah: 1, ayahStart: 1, ayahEnd: 7 }]
    });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].surah).toBe(1);
    expect(result.references[0].ayahStart).toBe(1);
    expect(result.references[0].ayahEnd).toBe(7);
  });

  it('merges long surah (286 ayahs) into single group via references array', function () {
    var result = _handleFetchAyahAsReferences({
      references: [{ surah: 2, ayahStart: 1, ayahEnd: 286 }]
    });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].ayahStart).toBe(1);
    expect(result.references[0].ayahEnd).toBe(286);
  });

  it('returns two groups for two single verses from different surahs', function () {
    var result = _handleFetchAyahAsReferences({
      references: [{ surah: 2, ayah: 1 }, { surah: 67, ayah: 2 }]
    });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(2);
    expect(result.references[0].surah).toBe(2);
    expect(result.references[0].ayahStart).toBe(1);
    expect(result.references[1].surah).toBe(67);
    expect(result.references[1].ayahStart).toBe(2);
  });

  it('merges mixed single and range references into groups', function () {
    var result = _handleFetchAyahAsReferences({
      references: [{ surah: 2, ayah: 255 }, { surah: 3, ayahStart: 190, ayahEnd: 194 }]
    });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(2);
    expect(result.references[0].surah).toBe(2);
    expect(result.references[0].ayahStart).toBe(255);
    expect(result.references[0].ayahEnd).toBe(255);
    expect(result.references[1].surah).toBe(3);
    expect(result.references[1].ayahStart).toBe(190);
    expect(result.references[1].ayahEnd).toBe(194);
  });

  it('merges consecutive refs from separate objects in references array', function () {
    var result = _handleFetchAyahAsReferences({
      references: [
        { surah: 3, ayahStart: 123, ayahEnd: 123 },
        { surah: 3, ayahStart: 124, ayahEnd: 124 }
      ]
    });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].surah).toBe(3);
    expect(result.references[0].ayahStart).toBe(123);
    expect(result.references[0].ayahEnd).toBe(124);
  });

  it('returns error when multi-references exceed safety cap', function () {
    var refs = [];
    for (var i = 0; i < 4; i++) { refs.push({ surah: 2, ayahStart: 1, ayahEnd: 100 }); }
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
    expect(result.type).toBe('error');
  });

  it('returns clarify when all references have invalid surahs', function () {
    var result = _handleFetchAyahAsReferences({
      references: [{ surah: 0, ayah: 1 }, { surah: 200, ayah: 1 }]
    });
    expect(result.type).toBe('clarify');
    expect(result.message).toContain('200');
    expect(result.message).toContain('not a valid surah number');
  });

  it('defaults ayahEnd to ayahStart when ayahEnd < ayahStart in multi-ref', function () {
    var result = _handleFetchAyahAsReferences({
      references: [{ surah: 2, ayahStart: 10, ayahEnd: 5 }]
    });
    expect(result.type).toBe('references');
    expect(result.references.length).toBe(1);
    expect(result.references[0].ayahStart).toBe(10);
    expect(result.references[0].ayahEnd).toBe(10);
  });

  // ── _handleSemanticSearchRouted_ (unit) ──────────────────────────────────

  results.push('\n_handleSemanticSearchRouted_()');

  it('uses Claude references directly when rag_supported is false', function () {
    var classified = {
      rag_supported: false,
      queries: ['mercy in Juz Amma'],
      references: [{ surah: 93, ayah: 5 }, { surah: 85, ayah: 14 }]
    };
    var result = _handleSemanticSearchRouted_(classified, 'ayahs from juz 30 about mercy');
    expect(result.type).toBe('references');
    // Should come from _handleSemanticSearch (sorted), first surah 85 then 93
    expect(result.references[0].surah).toBe(85);
    expect(result.references[1].surah).toBe(93);
  });

  it('falls back to Claude references when queries array is empty', function () {
    var classified = {
      rag_supported: true,
      queries: [],
      references: [{ surah: 2, ayah: 153 }]
    };
    var result = _handleSemanticSearchRouted_(classified, 'patience');
    expect(result.type).toBe('references');
    expect(result.references[0].surah).toBe(2);
  });

  it('falls back to Claude references when queries is missing', function () {
    var classified = {
      rag_supported: true,
      references: [{ surah: 1, ayah: 1 }]
    };
    var result = _handleSemanticSearchRouted_(classified, 'test');
    expect(result.type).toBe('references');
    expect(result.references[0].surah).toBe(1);
  });

  it('treats missing rag_supported as true (RAG default path)', function () {
    var classified = {
      queries: [],
      references: [{ surah: 39, ayah: 53 }]
    };
    // No rag_supported field — should NOT go the rag_supported:false path
    // With empty queries it will fall back to Claude references
    var result = _handleSemanticSearchRouted_(classified, 'forgiveness');
    expect(result.type).toBe('references');
    expect(result.references[0].surah).toBe(39);
  });

  // ── _aiSearchDedupeKey_ (unit) ────────────────────────────────────────────

  results.push('\n_aiSearchDedupeKey_()');

  it('returns a non-empty string prefixed with ai_dedupe_v1_', function () {
    var key = _aiSearchDedupeKey_([{ role: 'user', content: 'test query' }]);
    expect(typeof key).toBe('string');
    expect(key.indexOf('ai_dedupe_v1_') === 0).toBe(true);
    expect(key.length).toBeGreaterThan(13);
  });

  it('returns the same key for identical last user messages', function () {
    var msgs = [{ role: 'user', content: 'patience verses' }];
    var k1 = _aiSearchDedupeKey_(msgs);
    var k2 = _aiSearchDedupeKey_(msgs);
    expect(k1).toBe(k2);
  });

  it('returns different keys for different user messages', function () {
    var k1 = _aiSearchDedupeKey_([{ role: 'user', content: 'patience verses' }]);
    var k2 = _aiSearchDedupeKey_([{ role: 'user', content: 'forgiveness verses' }]);
    expect(k1 === k2).toBe(false);
  });

  it('includes prior assistant turn in key so context changes produce different keys', function () {
    var msgs1 = [
      { role: 'user', content: 'show me verse 5' },
      { role: 'assistant', content: 'Which surah?' },
      { role: 'user', content: 'Al-Baqarah' }
    ];
    var msgs2 = [
      { role: 'user', content: 'show me verse 5' },
      { role: 'assistant', content: 'Different prior turn' },
      { role: 'user', content: 'Al-Baqarah' }
    ];
    expect(_aiSearchDedupeKey_(msgs1) === _aiSearchDedupeKey_(msgs2)).toBe(false);
  });

  // ── performAISearch dedupe (integration — requires API key + CacheService) ─

  results.push('\nperformAISearch() dedupe guard');

  var apiKeyForDedupe = getClaudeApiKey_();
  if (apiKeyForDedupe) {
    it('performAISearch dedupes identical back-to-back calls within 15s', function () {
      var msgs = [{ role: 'user', content: 'show me 2:255' }];
      var dedupeKey = _aiSearchDedupeKey_(msgs);
      // Clear any prior cached entry so the first call is always a cache miss
      try { CacheService.getUserCache().remove(dedupeKey); } catch (e) {}

      var result1 = performAISearch(msgs);
      if (result1.type === 'error') throw new Error('First call errored: ' + result1.error);

      // Second call must return same type/shape (served from dedupe cache)
      var result2 = performAISearch(msgs);
      expect(result2.type).toBe(result1.type);

      // Cleanup
      try { CacheService.getUserCache().remove(dedupeKey); } catch (e) {}
    });
  } else {
    results.push('  ⊘ Skipped dedupe integration test (no Claude API key in Script Properties)');
  }

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

    it('performAISearch("show me Surah Al-Fatiha") returns full surah as single merged group (live API)', function () {
      var result = performAISearch([{ role: 'user', content: 'show me Surah Al-Fatiha' }]);
      if (result.type === 'clarify') return;
      if (result.type === 'error') throw new Error('Got error: ' + result.error);
      expect(result.type).toBe('references');
      expect(result.references.length).toBe(1);
      expect(result.references[0].surah).toBe(1);
      expect(result.references[0].ayahStart).toBe(1);
      expect(result.references[0].ayahEnd).toBe(7);
    });

    it('performAISearch("give me the last 3 ayahs of surah Al-Baqarah") returns merged group (live API)', function () {
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
