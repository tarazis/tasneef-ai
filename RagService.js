/**
 * RagService.js
 * RAG-powered semantic search via OpenAI embeddings + Pinecone vector DB.
 * Called from ClaudeAPI.js when the user triggers @rag mode on a semantic_search query.
 *
 * Every failure silently falls back to _handleSemanticSearch (Claude's references).
 */

var RAG_SCORE_THRESHOLD = 0.75;
var RAG_TOP_K = 10;
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

// ─── API calls ───────────────────────────────────────────────────────────────

/**
 * Calls OpenAI embeddings API to get a vector for the given text.
 * @param {string} apiKey - OpenAI API key
 * @param {string} query - Text to embed
 * @return {number[]} 1536-dimensional embedding vector
 * @throws {Error} On non-200 response or malformed body
 */
function _getEmbedding(apiKey, query) {
  var payload = {
    model: OPENAI_EMBEDDING_MODEL,
    input: query
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
  return body.data[0].embedding;
}

/**
 * Queries the Pinecone vector index with the given embedding.
 * @param {string} host - Pinecone index host URL (e.g. https://tasneef-english-xxx.svc.xxx.pinecone.io)
 * @param {string} apiKey - Pinecone API key
 * @param {number[]} vector - Query vector
 * @return {Array<{id: string, score: number, metadata: Object}>} Matches array
 * @throws {Error} On non-200 response
 */
function _queryPinecone(host, apiKey, vector) {
  var url = host + '/query';
  var payload = {
    vector: vector,
    topK: RAG_TOP_K,
    includeMetadata: true
  };

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
 * Handles semantic search via RAG: embeds query → queries Pinecone → maps to references.
 * Falls back to _handleSemanticSearch on any failure.
 * @param {Object} classified - Claude classification with { query, references }
 * @return {Object} { type: 'references', references: [{surah, ayahStart, ayahEnd}] } or fallback
 */
function _handleRagSearch(classified) {
  var query = (classified.query || '').trim();
  if (!query) return _handleSemanticSearch(classified);

  var openAiKey = getOpenAiApiKey_();
  if (!openAiKey) return _handleSemanticSearch(classified);

  var vector;
  try {
    vector = _getEmbedding(openAiKey, query);
  } catch (e) {
    return _handleSemanticSearch(classified);
  }

  var pineconeHost = getPineconeHost_();
  var pineconeKey = getPineconeApiKey_();
  if (!pineconeHost || !pineconeKey) return _handleSemanticSearch(classified);

  var matches;
  try {
    matches = _queryPinecone(pineconeHost, pineconeKey, vector);
  } catch (e) {
    return _handleSemanticSearch(classified);
  }

  var validRefs = [];
  for (var i = 0; i < matches.length; i++) {
    if (matches[i].score < RAG_SCORE_THRESHOLD) continue;
    var meta = matches[i].metadata;
    if (!meta) continue;
    var s = parseInt(meta.surah_number, 10);
    var a = parseInt(meta.ayah_number, 10);
    if (s >= 1 && s <= 114 && a >= 1) {
      validRefs.push({ surah: s, ayah: a });
    }
  }

  if (!validRefs.length) return _handleSemanticSearch(classified);

  return { type: 'references', references: _mergeConsecutiveReferences(validRefs) };
}
