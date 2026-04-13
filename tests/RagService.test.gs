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
      }
    };
  }

  // ── Constants (unit) ──────────────────────────────────────────────────────

  results.push('\nRAG constants');

  it('RAG_SCORE_THRESHOLD is 0.75', function () {
    expect(RAG_SCORE_THRESHOLD).toBe(0.75);
  });

  it('RAG_TOP_K is 10', function () {
    expect(RAG_TOP_K).toBe(10);
  });

  it('OPENAI_EMBEDDING_MODEL is text-embedding-3-small', function () {
    expect(OPENAI_EMBEDDING_MODEL).toBe('text-embedding-3-small');
  });

  // ── _handleRagSearch fallback cases (unit, no network) ────────────────────

  results.push('\n_handleRagSearch() — fallback to _handleSemanticSearch');

  it('falls back when query is missing', function () {
    var classified = { references: [{ surah: 2, ayah: 153 }] };
    var result = _handleRagSearch(classified);
    expect(result.type).toBe('references');
    // Should use Claude's references via _handleSemanticSearch
    expect(result.references[0].surah).toBe(2);
    expect(result.references[0].ayahStart).toBe(153);
  });

  it('falls back when query is empty string', function () {
    var classified = { query: '', references: [{ surah: 1, ayah: 1 }] };
    var result = _handleRagSearch(classified);
    expect(result.type).toBe('references');
    expect(result.references[0].surah).toBe(1);
  });

  it('falls back when query is whitespace only', function () {
    var classified = { query: '   ', references: [{ surah: 1, ayah: 1 }] };
    var result = _handleRagSearch(classified);
    expect(result.type).toBe('references');
  });

  it('falls back when OpenAI API key is not set', function () {
    // If no OpenAI key in Script Properties, should fall back
    var openAiKey = getOpenAiApiKey_();
    if (!openAiKey) {
      var classified = { query: 'patience', references: [{ surah: 2, ayah: 153 }] };
      var result = _handleRagSearch(classified);
      expect(result.type).toBe('references');
      expect(result.references[0].surah).toBe(2);
    }
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

    results.push('\n_queryPinecone() — integration');

    it('returns matches with expected metadata fields', function () {
      var embedding = _getEmbedding(openAiKey, 'patience in hardship');
      var matches = _queryPinecone(pineconeHost, pineconeKey, embedding);
      expect(Array.isArray(matches)).toBe(true);
      expect(matches.length).toBeGreaterThan(0);
      var first = matches[0];
      expect(typeof first.score).toBe('number');
      expect(first.metadata !== null && first.metadata !== undefined).toBe(true);
      expect(typeof first.metadata.surah_number).toBe('number');
      expect(typeof first.metadata.ayah_number).toBe('number');
    });

    results.push('\n_handleRagSearch() — integration');

    it('returns valid references for a known query', function () {
      var classified = {
        query: 'patience in hardship',
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
        query: 'mercy and forgiveness',
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
