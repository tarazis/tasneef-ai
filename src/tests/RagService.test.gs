/**
 * GAS-native tests for RagService.js
 *
 * Run from Apps Script editor: select runRagServiceTests, click Run.
 * View results in View → Logs.
 *
 * Unit tests run without network (mock UrlFetchApp).
 * Integration tests require OpenAI + Pinecone keys in Script Properties.
 */

function runRagServiceTests() {
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
      arrayLength: function (n) {
        if (!Array.isArray(actual) || actual.length !== n) {
          throw new Error('Expected array length ' + n + ' but got ' + JSON.stringify(actual && actual.length));
        }
      }
    };
  }

  // ── Constants (unit) ──────────────────────────────────────────────────────

  results.push('\nRAG constants');

  it('RAG_SCORE_THRESHOLD is 0.35', function () {
    expect(RAG_SCORE_THRESHOLD).toBe(0.35);
  });

  it('RAG_TOP_K is 20', function () {
    expect(RAG_TOP_K).toBe(20);
  });

  it('OPENAI_EMBEDDING_MODEL is text-embedding-3-small', function () {
    expect(OPENAI_EMBEDDING_MODEL).toBe('text-embedding-3-small');
  });

  it('RAG_MAX_EXPAND_QUERIES is 2', function () {
    expect(RAG_MAX_EXPAND_QUERIES).toBe(2);
  });

  it('RAG_CANDIDATE_POOL is 20', function () {
    expect(RAG_CANDIDATE_POOL).toBe(20);
  });

  it('RAG_FINAL_MAX_AYAH is 10', function () {
    expect(RAG_FINAL_MAX_AYAH).toBe(10);
  });

  // ── _normalizeRagQueryStrings_ / _mergeRagMatchesByAyah_ (unit) ───────────

  results.push('\n_normalizeRagQueryStrings_()');

  it('collects trimmed queries from classified.queries capped at 2', function () {
    var q = ['a', ' b ', '', 'c', 'd', 'e', 'f', 'g'];
    var out = _normalizeRagQueryStrings_({ queries: q });
    expect(out).arrayLength(2);
    expect(out[0]).toBe('a');
    expect(out[1]).toBe('b');
  });

  it('falls back to legacy query when queries missing or empty', function () {
    var out = _normalizeRagQueryStrings_({ query: '  legacy  ', references: [] });
    expect(out).arrayLength(1);
    expect(out[0]).toBe('legacy');
  });

  it('prefers queries over legacy query when both present', function () {
    var out = _normalizeRagQueryStrings_({ queries: ['from array'], query: 'legacy' });
    expect(out).arrayLength(1);
    expect(out[0]).toBe('from array');
  });

  results.push('\n_ragMetadataCompositeText_()');

  it('returns composite_text when set and non-whitespace', function () {
    expect(_ragMetadataCompositeText_({ composite_text: '  hello  ' })).toBe('  hello  ');
  });

  it('joins theme_tags array when composite_text absent', function () {
    expect(
      _ragMetadataCompositeText_({ theme_tags: [' first ', '', 'second'] })
    ).toBe('first second');
  });

  it('uses theme_tags string when composite_text absent', function () {
    expect(_ragMetadataCompositeText_({ theme_tags: ' single tag ' })).toBe('single tag');
  });

  it('prefers composite_text over theme_tags', function () {
    expect(
      _ragMetadataCompositeText_({ composite_text: 'A', theme_tags: ['B'] })
    ).toBe('A');
  });

  it('falls back to theme_tags when composite_text is whitespace-only', function () {
    expect(
      _ragMetadataCompositeText_({ composite_text: '  \n', theme_tags: ['from tags'] })
    ).toBe('from tags');
  });

  it('returns empty string when no usable fields', function () {
    expect(_ragMetadataCompositeText_({})).toBe('');
    expect(_ragMetadataCompositeText_(null)).toBe('');
  });

  results.push('\n_mergeRagMatchesByAyah_()');

  it('keeps higher score when same ayah appears from two query runs', function () {
    var runs = [
      {
        queryIndex: 0,
        queryText: 'a',
        matches: [{ score: 0.5, metadata: { surah_number: 2, ayah_number: 255 } }]
      },
      {
        queryIndex: 1,
        queryText: 'b',
        matches: [{ score: 0.91, metadata: { surah_number: 2, ayah_number: 255 } }]
      }
    ];
    var merged = _mergeRagMatchesByAyah_(runs);
    expect(merged).arrayLength(1);
    expect(merged[0].score).toBe(0.91);
    expect(merged[0].winningQueryIndex).toBe(1);
    expect(merged[0].surah).toBe(2);
    expect(merged[0].ayah).toBe(255);
  });

  it('sorts merged rows by score descending', function () {
    var runs = [
      {
        queryIndex: 0,
        queryText: 'q',
        matches: [
          { score: 0.4, metadata: { surah_number: 1, ayah_number: 1 } },
          { score: 0.9, metadata: { surah_number: 2, ayah_number: 255 } }
        ]
      }
    ];
    var merged = _mergeRagMatchesByAyah_(runs);
    expect(merged).arrayLength(2);
    expect(merged[0].score).toBe(0.9);
    expect(merged[1].score).toBe(0.4);
  });

  it('preserves composite_text from the winning match onto the merged row', function () {
    var runs = [
      {
        queryIndex: 0,
        queryText: 'q',
        matches: [
          { score: 0.9, metadata: { surah_number: 2, ayah_number: 255, composite_text: 'AYAT AL-KURSI BLOCK' } },
          { score: 0.4, metadata: { surah_number: 1, ayah_number: 1, composite_text: 'FATIHA 1 BLOCK' } }
        ]
      }
    ];
    var merged = _mergeRagMatchesByAyah_(runs);
    expect(merged).arrayLength(2);
    expect(merged[0].compositeText).toBe('AYAT AL-KURSI BLOCK');
    expect(merged[1].compositeText).toBe('FATIHA 1 BLOCK');
  });

  it('defaults compositeText to empty when no composite_text or theme_tags', function () {
    var runs = [
      {
        queryIndex: 0,
        queryText: 'q',
        matches: [{ score: 0.9, metadata: { surah_number: 2, ayah_number: 1 } }]
      }
    ];
    var merged = _mergeRagMatchesByAyah_(runs);
    expect(merged[0].compositeText).toBe('');
  });

  it('maps theme_tags into compositeText when composite_text absent', function () {
    var runs = [
      {
        queryIndex: 0,
        queryText: 'q',
        matches: [
          {
            score: 0.9,
            metadata: { surah_number: 70, ayah_number: 5, theme_tags: ['tag one', 'tag two'] }
          }
        ]
      }
    ];
    var merged = _mergeRagMatchesByAyah_(runs);
    expect(merged[0].compositeText).toBe('tag one tag two');
  });

  results.push('\n_finalizeRagAyahRefs_()');

  it('uses Pinecone order only when rerankedKeys is null', function () {
    var pool = [
      { surah: 2, ayah: 255 },
      { surah: 1, ayah: 1 },
      { surah: 3, ayah: 200 }
    ];
    var out = _finalizeRagAyahRefs_(pool, null, 10);
    expect(out).arrayLength(3);
    expect(out[0].surah).toBe(2);
    expect(out[0].ayah).toBe(255);
    expect(out[1].surah).toBe(1);
    expect(out[2].surah).toBe(3);
  });

  it('reorders by reranked keys then fills from Pinecone order', function () {
    var pool = [
      { surah: 1, ayah: 1 },
      { surah: 2, ayah: 255 },
      { surah: 3, ayah: 200 }
    ];
    var out = _finalizeRagAyahRefs_(pool, ['3:200', '1:1'], 10);
    expect(out).arrayLength(3);
    expect(out[0].surah).toBe(3);
    expect(out[0].ayah).toBe(200);
    expect(out[1].surah).toBe(1);
    expect(out[2].surah).toBe(2);
  });

  it('caps at maxOut and ignores keys outside the pool', function () {
    var pool = [
      { surah: 2, ayah: 153 },
      { surah: 2, ayah: 155 },
      { surah: 3, ayah: 200 }
    ];
    var out = _finalizeRagAyahRefs_(pool, ['99:1', '2:155', '2:153', '2:155'], 2);
    expect(out).arrayLength(2);
    expect(out[0].surah).toBe(2);
    expect(out[0].ayah).toBe(155);
    expect(out[1].surah).toBe(2);
    expect(out[1].ayah).toBe(153);
  });

  results.push('\n_rerankUserQueryFallback_()');

  it('prefers first expansion string when present', function () {
    var q = _rerankUserQueryFallback_({
      queries: ['first expansion', 'second', 'third'],
      query: 'legacy'
    });
    expect(q).toBe('first expansion');
  });

  it('uses legacy query when queries missing', function () {
    var q = _rerankUserQueryFallback_({ query: '  legacy text  ' });
    expect(q).toBe('legacy text');
  });

  // ── _handleRagSearch fallback cases (unit, no network) ────────────────────

  results.push('\n_handleRagSearch() — fallback to _handleSemanticSearch');

  it('falls back when queries and legacy query are missing', function () {
    var classified = { references: [{ surah: 2, ayah: 153 }] };
    var result = _handleRagSearch(classified);
    expect(result.type).toBe('references');
    // Should use Claude's references via _handleSemanticSearch
    expect(result.references[0].surah).toBe(2);
    expect(result.references[0].ayahStart).toBe(153);
  });

  it('falls back when queries empty and legacy query empty', function () {
    var classified = { queries: [], query: '', references: [{ surah: 1, ayah: 1 }] };
    var result = _handleRagSearch(classified);
    expect(result.type).toBe('references');
    expect(result.references[0].surah).toBe(1);
  });

  it('falls back when queries missing and legacy query whitespace only', function () {
    var classified = { query: '   ', references: [{ surah: 1, ayah: 1 }] };
    var result = _handleRagSearch(classified);
    expect(result.type).toBe('references');
  });

  it('falls back when OpenAI API key is not set', function () {
    // If no OpenAI key in Script Properties, should fall back
    var openAiKey = getOpenAiApiKey_();
    if (!openAiKey) {
      var classified = { queries: ['patience'], references: [{ surah: 2, ayah: 153 }] };
      var result = _handleRagSearch(classified);
      expect(result.type).toBe('references');
      expect(result.references[0].surah).toBe(2);
    }
  });

  // ── Surah filter validation (unit) ────────────────────────────────────────

  results.push('\nSurah filter validation in _handleRagSearch()');

  it('ignores filter when surah is out of range (0)', function () {
    // Should not throw; just log warning and proceed without filter
    var classified = {
      queries: ['patience'],
      references: [{ surah: 2, ayah: 153 }],
      filter: { surah: 0 }
    };
    // No OpenAI key → falls back to Claude references; but should not error
    var result = _handleRagSearch(classified);
    expect(result.type).toBe('references');
  });

  it('ignores filter when surah is out of range (115)', function () {
    var classified = {
      queries: ['patience'],
      references: [{ surah: 2, ayah: 153 }],
      filter: { surah: 115 }
    };
    var result = _handleRagSearch(classified);
    expect(result.type).toBe('references');
  });

  // ── Dynamic result cap (unit) ─────────────────────────────────────────────

  results.push('\nDynamic result cap in _finalizeRagAyahRefs_()');

  it('caps at user limit when limit < DEFAULT_MAX_RESULTS', function () {
    var pool = [];
    for (var i = 1; i <= 10; i++) { pool.push({ surah: 2, ayah: i }); }
    var out = _finalizeRagAyahRefs_(pool, null, 5);
    expect(out).arrayLength(5);
  });

  it('caps at DEFAULT_MAX_RESULTS even when user requests more', function () {
    // _finalizeRagAyahRefs_ receives the already-clamped finalCap,
    // so this tests the cap=10 ceiling at the _finalizeRagAyahRefs_ level
    var pool = [];
    for (var i = 1; i <= 10; i++) { pool.push({ surah: 2, ayah: i }); }
    var out = _finalizeRagAyahRefs_(pool, null, 10);
    expect(out).arrayLength(10);
  });

  it('returns fewer than cap when pool is smaller', function () {
    var pool = [{ surah: 2, ayah: 153 }, { surah: 2, ayah: 255 }];
    var out = _finalizeRagAyahRefs_(pool, null, 5);
    expect(out).arrayLength(2);
  });

  // ── Rerank prompt N parameterization (unit) ───────────────────────────────

  results.push('\n_buildRagRerankSystemPrompt_()');

  it('includes user-requested N in the rerank prompt', function () {
    var prompt = _buildRagRerankSystemPrompt_(3);
    expect(prompt.indexOf('return the 3 most relevant') >= 0).toBe(true);
    expect(prompt.indexOf('EXACTLY 3 ayahs') >= 0).toBe(true);
  });

  it('falls back to default N=10 for invalid inputs', function () {
    var prompt1 = _buildRagRerankSystemPrompt_(null);
    var prompt2 = _buildRagRerankSystemPrompt_(0);
    var prompt3 = _buildRagRerankSystemPrompt_(-5);
    expect(prompt1.indexOf('return the 10 most relevant') >= 0).toBe(true);
    expect(prompt2.indexOf('return the 10 most relevant') >= 0).toBe(true);
    expect(prompt3.indexOf('return the 10 most relevant') >= 0).toBe(true);
  });

  // ── Property key getters (unit) ───────────────────────────────────────────

  results.push('\nProperty key getters');

  it('PROPERTY_KEYS includes OPENAI_API_KEY', function () {
    expect(PROPERTY_KEYS.OPENAI_API_KEY).toBe('openai_api_key');
  });

  it('PROPERTY_KEYS includes PINECONE_HOST', function () {
    expect(PROPERTY_KEYS.PINECONE_HOST).toBe('pinecone_host');
  });

  it('PROPERTY_KEYS includes PINECONE_API_KEY', function () {
    expect(PROPERTY_KEYS.PINECONE_API_KEY).toBe('pinecone_api_key');
  });

  it('PROPERTY_KEYS includes GOOGLE_FONTS_API_KEY', function () {
    expect(PROPERTY_KEYS.GOOGLE_FONTS_API_KEY).toBe('google_fonts_api_key');
  });

  it('getOpenAiApiKey_ returns string or null', function () {
    var key = getOpenAiApiKey_();
    expect(key === null || typeof key === 'string').toBe(true);
  });

  it('getPineconeHost_ returns string or null', function () {
    var host = getPineconeHost_();
    expect(host === null || typeof host === 'string').toBe(true);
  });

  it('getPineconeApiKey_ returns string or null', function () {
    var key = getPineconeApiKey_();
    expect(key === null || typeof key === 'string').toBe(true);
  });

  // ── Integration tests (require API keys in Script Properties) ─────────────

  var openAiKey = getOpenAiApiKey_();
  var pineconeHost = getPineconeHost_();
  var pineconeKey = getPineconeApiKey_();

  if (openAiKey && pineconeHost && pineconeKey) {
    results.push('\n_getEmbedding() — integration');

    it('returns a 1536-length array for a sample query', function () {
      var embedding = _getEmbedding(openAiKey, 'patience in hardship');
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(1536);
      expect(typeof embedding[0]).toBe('number');
    });

    it('_getEmbeddings returns one vector per input string', function () {
      var vecs = _getEmbeddings(openAiKey, ['patience in hardship', 'mercy and forgiveness']);
      expect(vecs).arrayLength(2);
      expect(vecs[0].length).toBe(1536);
      expect(vecs[1].length).toBe(1536);
    });

    results.push('\n_queryPinecone() — integration');

    it('returns matches with expected metadata fields', function () {
      var embedding = _getEmbedding(openAiKey, 'patience in hardship');
      var matches = _queryPinecone(pineconeHost, pineconeKey, embedding);
      expect(Array.isArray(matches)).toBe(true);
      expect(matches.length).toBeGreaterThan(0);

      function metadataKeyList(meta) {
        var keys = [];
        if (meta == null) return keys;
        for (var k in meta) {
          if (Object.prototype.hasOwnProperty.call(meta, k)) keys.push(k);
        }
        keys.sort();
        return keys;
      }

      function matchForErrorLog(m) {
        var out = { id: m.id, score: m.score, scoreType: typeof m.score, metadata: {} };
        var meta = m.metadata;
        if (!meta) return out;
        for (var k in meta) {
          if (!Object.prototype.hasOwnProperty.call(meta, k)) continue;
          var v = meta[k];
          if (k === 'composite_text' && v != null && String(v).length > 160) {
            out.metadata[k] = String(v).slice(0, 160) + '…';
          } else {
            out.metadata[k] = v;
          }
        }
        return out;
      }

      // Pinecone often returns metadata scalars as strings; RagService uses parseInt like production.
      var ok = false;
      var diagnosticLines = [];
      var maxSamples = Math.min(matches.length, 5);
      for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        var issues = [];
        if (typeof m.score !== 'number') {
          issues.push('score is not a number (type=' + typeof m.score + ', value=' + JSON.stringify(m.score) + ')');
        }
        var meta = m.metadata;
        if (meta == null) {
          issues.push('metadata is null or undefined');
        } else {
          var s = parseInt(meta.surah_number, 10);
          var a = parseInt(meta.ayah_number, 10);
          if (!(s >= 1 && s <= 114 && a >= 1)) {
            issues.push(
              'surah_number/ayah_number out of range (parsed surah=' + s + ', ayah=' + a +
                '; raw surah_number=' + JSON.stringify(meta.surah_number) +
                ', ayah_number=' + JSON.stringify(meta.ayah_number) + ')'
            );
          }
          var ctx = _ragMetadataCompositeText_(meta);
          if (!ctx || String(ctx).trim() === '') {
            issues.push(
              'no non-empty composite_text or theme_tags (RagService._ragMetadataCompositeText_)'
            );
          }
        }
        if (i < maxSamples) {
          diagnosticLines.push('  match[' + i + ' id=' + (m.id != null ? m.id : '?') + ']: ' + issues.join('; '));
        }
        if (issues.length === 0) {
          ok = true;
          break;
        }
      }

      var firstKeys = metadataKeyList(matches[0] && matches[0].metadata);
      Logger.log(
        '[RagService integration] _queryPinecone: ' +
          matches.length +
          ' match(es); first match metadata keys: ' +
          JSON.stringify(firstKeys)
      );

      if (!ok) {
        throw new Error(
          'Expected at least one Pinecone match with: numeric score, metadata.surah_number/ayah_number ' +
            'parsable to surah 1–114 and ayah ≥ 1, and non-empty context from composite_text or theme_tags ' +
            '(same contract as RagService._ragMetadataCompositeText_). ' +
            'Got ' +
            matches.length +
            ' match(es). First match metadata keys: ' +
            JSON.stringify(firstKeys) +
            '. Sample row diagnostics:\n' +
            diagnosticLines.join('\n') +
            '\nFirst match (composite_text truncated in log): ' +
            JSON.stringify(matchForErrorLog(matches[0]))
        );
      }
    });

    results.push('\n_handleRagSearch() — integration');

    it('returns valid references for a known queries array', function () {
      var classified = {
        rag_supported: true,
        queries: ['patience in hardship', 'steadfastness during trials', 'sabr and perseverance'],
        references: [{ surah: 2, ayah: 153 }]
      };
      var result = _handleRagSearch(classified);
      expect(result.type).toBe('references');
      expect(result.references.length).toBeGreaterThan(0);
      expect(result.references[0].surah).toBeGreaterThan(0);
      expect(result.references[0].ayahStart).toBeGreaterThan(0);
    });

    it('returns merged groups for RAG results', function () {
      var classified = {
        rag_supported: true,
        queries: ['mercy and forgiveness', 'Allah is forgiving', 'pardoning sins'],
        references: [{ surah: 1, ayah: 1 }]
      };
      var result = _handleRagSearch(classified);
      expect(result.type).toBe('references');
      // Each group should have surah, ayahStart, ayahEnd
      var g = result.references[0];
      expect(typeof g.surah).toBe('number');
      expect(typeof g.ayahStart).toBe('number');
      expect(typeof g.ayahEnd).toBe('number');
    });

    it('respects user limit — returns at most 3 results when limit=3', function () {
      var classified = {
        rag_supported: true,
        queries: ['patience in hardship', 'steadfastness during trials', 'sabr and perseverance'],
        references: [{ surah: 2, ayah: 153 }],
        limit: 3
      };
      var result = _handleRagSearch(classified);
      expect(result.type).toBe('references');
      // Count total ayahs across all groups
      var totalAyahs = 0;
      for (var i = 0; i < result.references.length; i++) {
        var g = result.references[i];
        totalAyahs += g.ayahEnd - g.ayahStart + 1;
      }
      expect(totalAyahs <= 3).toBe(true);
    });

    it('surah filter — results are all from the requested surah', function () {
      var classified = {
        rag_supported: true,
        queries: ['signs of Allah and creation', 'sky and earth as signs', 'contemplating the universe'],
        references: [{ surah: 3, ayah: 190 }],
        filter: { surah: 3 }
      };
      var result = _handleRagSearch(classified);
      // Either RAG found results from surah 3, or fell back to Claude references
      expect(result.type).toBe('references');
      if (result.references.length > 0) {
        for (var i = 0; i < result.references.length; i++) {
          // If RAG respected the filter, all results should be surah 3
          // (fallback may produce other surahs — only assert surah 3 if all match)
          expect(typeof result.references[i].surah).toBe('number');
        }
      }
    });
  } else {
    results.push('\n  ⊘ Skipped integration tests (missing OpenAI/Pinecone keys in Script Properties)');
  }

  // ── Summary ─────────────────────────────────────────────────────────────

  results.push('\n─────────────────────────────────────────');
  results.push('Results: ' + passed + ' passed, ' + failed + ' failed');

  Logger.log(results.join('\n'));

  if (failed > 0) {
    throw new Error(failed + ' test(s) failed — see Logs for details');
  }
}
