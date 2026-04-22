/**
 * RagService.js
 * RAG-powered semantic search via OpenAI embeddings + Pinecone vector DB.
 * Called from ClaudeAPI.js for rag_supported semantic_search queries.
 * After retrieval, optionally reranks the top candidate ayahs with Claude using English translations.
 *
 * Every failure silently falls back to _handleSemanticSearch (Claude's references).
 */

var RAG_SCORE_THRESHOLD = 0.35;
var RAG_TOP_K = 20;
var RAG_MAX_EXPAND_QUERIES = 3;
var RAG_CANDIDATE_POOL = 20;
var RAG_FINAL_MAX_AYAH = 10;
var RAG_LOG_QUERY_MAX_LEN = 80;
var OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';
var OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

// ─── Property getters (trailing _ hides from google.script.run) ──────────────

/**
 * Returns the OpenAI API key from Script Properties, or null if not set.
 * @return {string|null}
 */
function getOpenAiApiKey_() {
  return PropertiesService.getScriptProperties()
    .getProperty(PROPERTY_KEYS.OPENAI_API_KEY) || null;
}

/**
 * Returns the Pinecone index host URL from Script Properties, or null if not set.
 * @return {string|null}
 */
function getPineconeHost_() {
  return PropertiesService.getScriptProperties()
    .getProperty(PROPERTY_KEYS.PINECONE_HOST) || null;
}

/**
 * Returns the Pinecone API key from Script Properties, or null if not set.
 * @return {string|null}
 */
function getPineconeApiKey_() {
  return PropertiesService.getScriptProperties()
    .getProperty(PROPERTY_KEYS.PINECONE_API_KEY) || null;
}

// ─── Query normalization (multi-query expansion) ─────────────────────────────

/**
 * Builds the list of query strings for RAG from Claude output.
 * Prefers classified.queries (capped); falls back to legacy classified.query.
 * @param {Object} classified
 * @return {string[]}
 */
function _normalizeRagQueryStrings_(classified) {
  var out = [];
  var raw = classified && classified.queries;
  if (raw && Array.isArray(raw)) {
    for (var i = 0; i < raw.length && out.length < RAG_MAX_EXPAND_QUERIES; i++) {
      var t = (raw[i] === null || raw[i] === undefined) ? '' : String(raw[i]).trim();
      if (t) out.push(t);
    }
  }
  if (!out.length && classified) {
    var legacy = (classified.query || '').trim();
    if (legacy) out.push(legacy);
  }
  return out;
}

/**
 * Truncates a string for Logger output.
 * @param {string} s
 * @return {string}
 */
function _truncateForRagLog_(s) {
  if (!s || typeof s !== 'string') return '';
  if (s.length <= RAG_LOG_QUERY_MAX_LEN) return s;
  return s.substring(0, RAG_LOG_QUERY_MAX_LEN) + '…';
}

/**
 * Merges Pinecone match lists from multiple query vectors: one row per ayah (max score wins).
 * @param {Array<{queryIndex: number, queryText: string, matches: Array<{score: number, metadata: Object}>}>} runs
 * @return {Array<{surah: number, ayah: number, score: number, winningQueryIndex: number, winningQueryText: string, compositeText: string}>}
 */
function _mergeRagMatchesByAyah_(runs) {
  var best = {};
  for (var r = 0; r < runs.length; r++) {
    var run = runs[r];
    var qi = run.queryIndex;
    var qtext = run.queryText || '';
    var matches = run.matches || [];
    for (var j = 0; j < matches.length; j++) {
      var m = matches[j];
      var meta = m.metadata;
      if (!meta) continue;
      var s = parseInt(meta.surah_number, 10);
      var a = parseInt(meta.ayah_number, 10);
      if (!(s >= 1 && s <= 114 && a >= 1)) continue;
      var key = s + ':' + a;
      var sc = m.score;
      var row = best[key];
      if (!row || sc > row.score) {
        best[key] = {
          score: sc,
          surah: s,
          ayah: a,
          winningQueryIndex: qi,
          winningQueryText: qtext,
          compositeText: (meta.composite_text != null ? String(meta.composite_text) : '')
        };
      }
    }
  }
  var arr = [];
  for (var k in best) {
    if (Object.prototype.hasOwnProperty.call(best, k)) {
      arr.push(best[k]);
    }
  }
  arr.sort(function (x, y) {
    return y.score - x.score;
  });
  return arr;
}

/**
 * Builds final flat {surah, ayah} list: reranked keys first (validated against pool), then Pinecone order to fill/cap.
 * @param {Array<{surah: number, ayah: number}>} pineconeOrderedRefs - score order, length <= RAG_CANDIDATE_POOL
 * @param {string[]|null} rerankedKeys - Claude "surah:ayah" keys, or null for score-only
 * @param {number} [maxOut] - defaults to RAG_FINAL_MAX_AYAH
 * @return {Array<{surah: number, ayah: number}>}
 */
function _finalizeRagAyahRefs_(pineconeOrderedRefs, rerankedKeys, maxOut) {
  var cap = maxOut != null ? maxOut : RAG_FINAL_MAX_AYAH;
  var pineconeKeyList = [];
  for (var i = 0; i < pineconeOrderedRefs.length; i++) {
    var r = pineconeOrderedRefs[i];
    pineconeKeyList.push(parseInt(r.surah, 10) + ':' + parseInt(r.ayah, 10));
  }

  var allowed = {};
  for (var a = 0; a < pineconeKeyList.length; a++) {
    allowed[pineconeKeyList[a]] = true;
  }

  var out = [];
  var seen = {};

  function pushKey(key) {
    if (out.length >= cap) return;
    if (!key || !allowed[key]) return;
    if (seen[key]) return;
    seen[key] = true;
    var parts = String(key).split(':');
    if (parts.length !== 2) return;
    var s = parseInt(parts[0], 10);
    var ay = parseInt(parts[1], 10);
    if (!(s >= 1 && s <= 114 && ay >= 1)) return;
    out.push({ surah: s, ayah: ay });
  }

  if (rerankedKeys && Array.isArray(rerankedKeys)) {
    for (var j = 0; j < rerankedKeys.length; j++) {
      pushKey(String(rerankedKeys[j]).trim());
    }
  }

  for (var k = 0; k < pineconeKeyList.length; k++) {
    pushKey(pineconeKeyList[k]);
  }

  return out;
}

/**
 * Fallback text for rerank prompt when originalUserQueryForRerank is not passed (e.g. tests).
 * @param {Object} classified
 * @return {string}
 */
function _rerankUserQueryFallback_(classified) {
  var qs = _normalizeRagQueryStrings_(classified);
  if (qs.length) return qs[0];
  return String(classified && classified.query ? classified.query : '').trim();
}

// ─── API calls ───────────────────────────────────────────────────────────────

/**
 * Calls OpenAI embeddings API for one or more strings (single batch request).
 * @param {string} apiKey - OpenAI API key
 * @param {string[]} inputs - Non-empty list of texts to embed
 * @return {number[][]} One vector per input, ordered by input index
 * @throws {Error} On non-200 response or malformed body
 */
function _getEmbeddings(apiKey, inputs) {
  if (!inputs || !inputs.length) {
    throw new Error('OpenAI embeddings: inputs array must be non-empty');
  }

  var payload = {
    model: OPENAI_EMBEDDING_MODEL,
    input: inputs
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(OPENAI_EMBEDDING_URL, options);
  if (response.getResponseCode() !== 200) {
    throw new Error('OpenAI API returned HTTP ' + response.getResponseCode());
  }

  var body = JSON.parse(response.getContentText());
  var rows = body.data || [];
  rows.sort(function (a, b) {
    return (a.index || 0) - (b.index || 0);
  });

  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i].embedding) {
      throw new Error('OpenAI embeddings: missing embedding at index ' + i);
    }
    out.push(rows[i].embedding);
  }
  if (out.length !== inputs.length) {
    throw new Error('OpenAI embeddings: expected ' + inputs.length + ' vectors, got ' + out.length);
  }
  return out;
}

/**
 * Calls OpenAI embeddings API to get a vector for the given text.
 * @param {string} apiKey - OpenAI API key
 * @param {string} query - Text to embed
 * @return {number[]} 1536-dimensional embedding vector
 * @throws {Error} On non-200 response or malformed body
 */
function _getEmbedding(apiKey, query) {
  return _getEmbeddings(apiKey, [query])[0];
}

/**
 * Queries the Pinecone vector index with the given embedding.
 * @param {string} host - Pinecone index host URL (e.g. https://tasneef-english-xxx.svc.xxx.pinecone.io)
 * @param {string} apiKey - Pinecone API key
 * @param {number[]} vector - Query vector
 * @param {Object|null} [surahFilter] - Optional Pinecone metadata filter (e.g. {surah_number:{$eq:2}})
 * @return {Array<{id: string, score: number, metadata: Object}>} Matches array
 * @throws {Error} On non-200 response
 */
function _queryPinecone(host, apiKey, vector, surahFilter) {
  var url = host + '/query';
  var payload = {
    vector: vector,
    topK: RAG_TOP_K,
    includeMetadata: true
  };

  if (surahFilter) {
    payload.filter = surahFilter;
  }

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Api-Key': apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    throw new Error('Pinecone API returned HTTP ' + response.getResponseCode());
  }

  var body = JSON.parse(response.getContentText());
  return body.matches || [];
}

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Handles semantic search via RAG: batch-embeds query reformulations, queries Pinecone per vector,
 * merges by ayah (max score), filters by threshold, optional Claude rerank, cap, merge consecutive refs.
 * Falls back to _handleSemanticSearch on any failure or zero results.
 * @param {Object} classified - Claude classification with { queries?, query?, references, filter?, limit? }
 * @param {string} [originalUserQueryForRerank] - Last user message as typed
 * @return {Object} { type: 'references', references: [{surah, ayahStart, ayahEnd}] } or fallback
 */
function _handleRagSearch(classified, originalUserQueryForRerank) {
  var DEFAULT_MAX_RESULTS = 20;
  var MIN_CANDIDATES_FOR_RERANK = 3;

  Logger.log('[RAG SEARCH] Entered _handleRagSearch');

  var queryStrings = _normalizeRagQueryStrings_(classified);
  if (!queryStrings.length) {
    Logger.log('[RAG SEARCH] No expansion queries provided, falling back to Claude references.');
    return _handleSemanticSearch(classified);
  }

  var originalQuery = (originalUserQueryForRerank && String(originalUserQueryForRerank).trim()) || '';
  if (originalQuery) queryStrings.push(originalQuery);

  Logger.log('[RAG SEARCH] Using ' + queryStrings.length + ' expansion query string(s) (including original user query).');

  // Build Pinecone metadata filter for surah restriction
  var surahFilter = null;
  if (classified.filter && classified.filter.surah) {
    var filterSurah = parseInt(classified.filter.surah, 10);
    if (filterSurah >= 1 && filterSurah <= 114) {
      surahFilter = { surah_number: { '$eq': filterSurah } };
      Logger.log('[RAG SEARCH] Pinecone filter active: surah_number = ' + filterSurah);
    } else {
      Logger.log('[RAG SEARCH] WARN: classified.filter.surah=' + classified.filter.surah + ' is out of range (1-114), ignoring filter.');
    }
  }

  // Compute final result cap from user limit
  var userLimit = (classified.limit && Number.isInteger(classified.limit) && classified.limit > 0)
    ? classified.limit : null;
  var finalCap = userLimit ? Math.min(userLimit, DEFAULT_MAX_RESULTS) : DEFAULT_MAX_RESULTS;
  if (userLimit) {
    Logger.log('[RAG SEARCH] Result cap: ' + finalCap + ' (user requested: ' + userLimit + ')');
  } else {
    Logger.log('[RAG SEARCH] Result cap: ' + DEFAULT_MAX_RESULTS + ' (default)');
  }

  var openAiKey = getOpenAiApiKey_();
  if (!openAiKey) {
    Logger.log('[RAG SEARCH] FAIL: openai_api_key not set in Script Properties — falling back to Claude.');
    return _handleSemanticSearch(classified);
  }

  var vectors;
  try {
    vectors = _getEmbeddings(openAiKey, queryStrings);
    Logger.log('[RAG SEARCH] OpenAI batch embedding OK — ' + vectors.length + ' vector(s), dim ' + vectors[0].length);
  } catch (e) {
    Logger.log('[RAG SEARCH] FAIL: OpenAI embedding error: ' + e.message + ' — falling back to Claude.');
    return _handleSemanticSearch(classified);
  }

  var pineconeHost = getPineconeHost_();
  var pineconeKey = getPineconeApiKey_();
  if (!pineconeHost || !pineconeKey) {
    Logger.log('[RAG SEARCH] FAIL: pinecone_host=' + (pineconeHost ? 'SET' : 'MISSING') +
      ', pinecone_api_key=' + (pineconeKey ? 'SET' : 'MISSING') + ' — falling back to Claude.');
    return _handleSemanticSearch(classified);
  }

  // Build one request object per query vector and fire them all in parallel
  var filterObj = surahFilter || undefined;
  var pineconeRequests = [];
  for (var qi = 0; qi < vectors.length; qi++) {
    var reqPayload = {
      vector: vectors[qi],
      topK: RAG_TOP_K,
      includeMetadata: true
    };
    if (filterObj) reqPayload.filter = filterObj;
    pineconeRequests.push({
      url: pineconeHost + '/query',
      method: 'post',
      headers: { 'Api-Key': pineconeKey, 'Content-Type': 'application/json' },
      payload: JSON.stringify(reqPayload),
      muteHttpExceptions: true
    });
  }

  var pineconeT0 = Date.now();
  var allResponses = UrlFetchApp.fetchAll(pineconeRequests);
  Logger.log('[RAG SEARCH] Pinecone parallel fetch: ' + (Date.now() - pineconeT0) + 'ms');

  var pineconeResponses = allResponses;

  var runs = [];
  var successCount = 0;
  for (var ri = 0; ri < pineconeResponses.length; ri++) {
    var qLabel = queryStrings[ri];
    var trunc = _truncateForRagLog_(qLabel);
    var resp = pineconeResponses[ri];
    var statusCode = resp.getResponseCode();
    if (statusCode !== 200) {
      Logger.log('[RAG SEARCH] WARN: Pinecone query[' + ri + '] returned HTTP ' + statusCode + ' — skipping this query.');
      continue;
    }
    successCount++;
    var body = JSON.parse(resp.getContentText());
    var matches = body.matches || [];

    for (var j = 0; j < matches.length; j++) {
      var m = matches[j];
      var matchMeta = m.metadata || {};
      Logger.log('[RAG SEARCH] raw match — query[' + ri + '] "' + trunc + '" — Surah ' +
        matchMeta.surah_number + ':' + matchMeta.ayah_number + ' — score: ' + m.score.toFixed(4));
    }

    runs.push({
      queryIndex: ri,
      queryText: qLabel,
      matches: matches
    });
  }

  if (successCount === 0) {
    Logger.log('[RAG SEARCH] FAIL: All Pinecone queries failed — falling back to Claude.');
    return _handleSemanticSearch(classified);
  }

  var mergedRows = _mergeRagMatchesByAyah_(runs);

  Logger.log('[RAG SEARCH] After merge across queries: ' + mergedRows.length + ' unique ayah key(s), sorted by score desc.');

  for (var mi = 0; mi < mergedRows.length; mi++) {
    var row = mergedRows[mi];
    var below = row.score < RAG_SCORE_THRESHOLD;
    Logger.log('[RAG SEARCH] merged — Surah ' + row.surah + ':' + row.ayah + ' — best score: ' + row.score.toFixed(4) +
      ' — from query[' + row.winningQueryIndex + '] "' + _truncateForRagLog_(row.winningQueryText) + '"' +
      (below ? ' (BELOW threshold, filtered out)' : ' (KEPT)'));
  }

  var validRefs = [];
  for (var vri = 0; vri < mergedRows.length; vri++) {
    if (mergedRows[vri].score < RAG_SCORE_THRESHOLD) continue;
    validRefs.push({
      surah: mergedRows[vri].surah,
      ayah: mergedRows[vri].ayah,
      compositeText: mergedRows[vri].compositeText || ''
    });
  }

  Logger.log('[RAG SEARCH] After score filter (threshold=' + RAG_SCORE_THRESHOLD + '): ' + validRefs.length + ' valid ref(s) remain.');

  if (!validRefs.length) {
    Logger.log('[RAG SEARCH] 0 results after threshold filter, falling back to Claude references.');
    return _handleSemanticSearch(classified);
  }

  var pool = validRefs.slice(0, RAG_CANDIDATE_POOL);
  var pineconeKeysForLog = [];
  for (var pi = 0; pi < pool.length; pi++) {
    pineconeKeysForLog.push(pool[pi].surah + ':' + pool[pi].ayah);
  }
  Logger.log('[RAG SEARCH] Pinecone-ranked order (top ' + pool.length + '): ' + JSON.stringify(pineconeKeysForLog));

  var userQueryForRerank =
    (originalUserQueryForRerank && String(originalUserQueryForRerank).trim()) ||
    _rerankUserQueryFallback_(classified);
  if (!userQueryForRerank) {
    userQueryForRerank = _rerankUserQueryFallback_(classified);
  }

  var rerankedKeys = null;

  if (pool.length < MIN_CANDIDATES_FOR_RERANK) {
    Logger.log('[RAG SEARCH] Only ' + pool.length + ' candidates after filter, skipping rerank.');
  } else {
    var lines = [];
    for (var li = 0; li < pool.length; li++) {
      var pr = pool[li];
      var pkey = pr.surah + ':' + pr.ayah;
      var ctx = (pr.compositeText && String(pr.compositeText).trim())
        ? String(pr.compositeText)
        : '[context unavailable]';
      lines.push(pkey + '\n' + ctx);
    }
    var candidateBlock = lines.join('\n\n');

    var claudeKey = getClaudeApiKey_();
    if (!claudeKey) {
      Logger.log('[RAG SEARCH] WARN: Claude API key missing — skipping rerank, using Pinecone order.');
    } else {
      var rawRerank = _callClaudeForRagRerank_(claudeKey, userQueryForRerank, candidateBlock, finalCap);
      if (!rawRerank) {
        Logger.log('[RAG SEARCH] WARN: Claude rerank returned empty or HTTP error — using Pinecone order.');
      } else {
        rerankedKeys = _parseRerankedAyahKeys_(rawRerank);
        if (!rerankedKeys) {
          Logger.log('[RAG SEARCH] WARN: Could not parse reranker JSON array — using Pinecone order.');
        }
      }
    }
  }

  var finalFlat = _finalizeRagAyahRefs_(pool, rerankedKeys, finalCap);

  // Defensive guard: enforce finalCap before merging consecutive ayahs so that
  // a reranker returning extras cannot inflate a range group past the user's N.
  if (finalFlat.length > finalCap) {
    Logger.log('[RAG SEARCH] WARN: finalFlat exceeded cap (' + finalFlat.length + ' > ' + finalCap + '), truncating.');
    finalFlat = finalFlat.slice(0, finalCap);
  }

  var finalKeysForLog = [];
  for (var fi = 0; fi < finalFlat.length; fi++) {
    finalKeysForLog.push(finalFlat[fi].surah + ':' + finalFlat[fi].ayah);
  }
  Logger.log('[RAG SEARCH] Final order (after rerank or fallback, cap ' + finalCap + '): ' +
    JSON.stringify(finalKeysForLog));

  var merged = _mergeConsecutiveReferencesInInputOrder_(finalFlat);
  Logger.log('[RAG SEARCH] SUCCESS — returning ' + merged.length + ' RAG group(s).');
  return { type: 'references', references: merged };
}
