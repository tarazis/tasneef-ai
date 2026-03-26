/**
 * ClaudeAPI.gs
 * Three modular backend functions for Quran lookup:
 *   - insertDirectAyah(surah, ayahStart, ayahEnd) — direct ayah/range fetch
 *   - performExactSearch(query) — Arabic exact text search (local data)
 *   - performAISearch(messages) — Claude-powered semantic search
 *
 * processUnifiedQuery is kept as a thin wrapper for frontend compatibility.
 */

var CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
var CLAUDE_MODEL = 'claude-sonnet-4-20250514';
var CLAUDE_MAX_TOKENS = 1024;
var AI_MAX_REFERENCES = 10;
var CONVERSATION_CONTEXT_LIMIT = 3;
var DIRECT_AYAH_RANGE_CAP = 30;

var UNIFIED_SYSTEM_PROMPT =
  'You are a Quran search assistant for Islamic scholars. ' +
  'Given a user request, determine the intent and return ONLY a raw JSON object. ' +
  'No markdown fences, no explanation, no extra text — just the JSON.\n\n' +
  'Actions:\n\n' +
  '1. fetch_ayah — user wants a specific ayah by reference number, surah name, or well-known verse name:\n' +
  '{"action":"fetch_ayah","surah":2,"ayah":255}\n\n' +
  '2. search — user wants to find verses (by Arabic text, topic, theme, or meaning):\n' +
  'For Arabic Quranic text to search in the corpus:\n' +
  '{"action":"search","query":"بسم الله الرحمن","language":"arabic"}\n' +
  'For English or non-Arabic description of what to find (include references you know):\n' +
  '{"action":"search","query":"patience in hardship","language":"english","references":[{"surah":2,"ayah":153},{"surah":3,"ayah":200}]}\n' +
  'Return 5-10 of the most relevant references for English search, ordered by relevance.\n\n' +
  '3. clarify — the request is ambiguous or you need more information:\n' +
  '{"action":"clarify","message":"Your clarifying question here"}\n\n' +
  'Rules:\n' +
  '- Return ONLY the raw JSON object.\n' +
  '- For fetch_ayah: you must know the exact surah (1-114) and ayah number.\n' +
  '- For Arabic input: determine if it is Quranic text to search for (use search with language "arabic") ' +
  'or a conversational question in Arabic (interpret the intent and respond accordingly). ' +
  'If genuinely unsure, use clarify.\n' +
  '- For search with language "english": include a "references" array of {surah, ayah} pairs from your Quran knowledge.\n' +
  '- For search with language "arabic": include only "query" (the Arabic text). No references needed.\n' +
  '- If the user gives a surah name without an ayah number, use clarify to ask which ayah.\n' +
  '- Prefer clarify over guessing when the input is ambiguous.';

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetches one or more ayahs directly from quranapi by surah/ayah reference.
 * No Claude call. Supports single ayah or range.
 * @param {number} surah - Surah number (1–114)
 * @param {number} ayahStart - First ayah number
 * @param {number} [ayahEnd] - Last ayah number (defaults to ayahStart)
 * @return {Object} { type, results, error? }
 */
function insertDirectAyah(surah, ayahStart, ayahEnd) {
  surah = parseInt(surah, 10);
  ayahStart = parseInt(ayahStart, 10);
  ayahEnd = ayahEnd != null ? parseInt(ayahEnd, 10) : ayahStart;

  if (!surah || surah < 1 || surah > 114) {
    return { type: 'error', error: 'Invalid surah number. Must be 1–114.' };
  }
  if (!ayahStart || ayahStart < 1) {
    return { type: 'error', error: 'Invalid ayah number.' };
  }
  if (ayahEnd < ayahStart) {
    return { type: 'error', error: 'End ayah must be greater than or equal to start ayah.' };
  }
  if (ayahEnd - ayahStart + 1 > DIRECT_AYAH_RANGE_CAP) {
    return { type: 'error', error: 'Range too large. Maximum ' + DIRECT_AYAH_RANGE_CAP + ' ayahs at once.' };
  }

  var settings = getSettings();
  var style = settings.arabicStyle || 'uthmani';

  if (ayahStart === ayahEnd) {
    var result = getAyahFromQuranApi(surah, ayahStart, style);
    if (!result) {
      return { type: 'error', error: 'Ayah ' + surah + ':' + ayahStart + ' not found.' };
    }
    return { type: 'single', results: [result] };
  }

  var requests = [];
  for (var i = ayahStart; i <= ayahEnd; i++) {
    requests.push({
      url: QURAN_API_BASE + '/' + surah + '/' + i + '.json',
      muteHttpExceptions: true
    });
  }

  var responses = UrlFetchApp.fetchAll(requests);
  var results = [];
  for (var j = 0; j < responses.length; j++) {
    if (responses[j].getResponseCode() !== 200) continue;
    try {
      var json = JSON.parse(responses[j].getContentText());
      var parsed = _parseQuranApiResponse(json, surah, ayahStart + j, style);
      if (parsed) results.push(parsed);
    } catch (e) {
      // Skip malformed responses
    }
  }

  if (!results.length) {
    return { type: 'error', error: 'No ayahs found in range ' + surah + ':' + ayahStart + '-' + ayahEnd + '.' };
  }

  return { type: 'range', results: results };
}

/**
 * Performs exact Arabic text search against locally cached Quran data.
 * No Claude call. Uses normalized matching (strips diacritics, normalizes alef).
 * @param {string} query - Arabic text to search for
 * @return {Object} { type, results, message? }
 */
function performExactSearch(query) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return { type: 'error', error: 'Please enter a search query.' };
  }

  var data = loadQuranData();
  var results = searchQuran(data, query.trim(), 'simple');

  if (!results || !results.length) {
    return { type: 'search', results: [], message: 'No exact matches found for that text.' };
  }

  return { type: 'search', results: results };
}

/**
 * Performs AI-powered search using Claude for intent classification.
 * Handles conversation context for multi-turn clarification.
 * Delegates to insertDirectAyah/performExactSearch when appropriate.
 * @param {Array<{role: string, content: string}>} messages - Conversation messages
 * @return {Object} { type, results?, message?, error?, rawResponse? }
 */
function performAISearch(messages) {
  if (!messages || !Array.isArray(messages) || !messages.length) {
    return { type: 'error', error: 'Please enter a query.' };
  }

  var lastMessage = messages[messages.length - 1];
  if (!lastMessage || !lastMessage.content || !lastMessage.content.trim()) {
    return { type: 'error', error: 'Please enter a query.' };
  }

  var apiKey = getClaudeApiKey();
  if (!apiKey) {
    return { type: 'error', error: 'NO_API_KEY' };
  }

  var count = incrementAiSearchCount();
  if (count === -1) {
    return {
      type: 'error',
      error: 'Daily query limit reached (' + AI_SEARCH_DAILY_LIMIT + '). Try again tomorrow.'
    };
  }

  var trimmedMessages = _trimConversationContext(messages);

  var rawResponse;
  var classified;
  try {
    var result = _callClaudeForClassification(apiKey, trimmedMessages);
    rawResponse = result.raw;
    classified = result.parsed;
  } catch (e) {
    return { type: 'error', error: 'Something went wrong. Please try again.' };
  }

  if (!classified || !classified.action) {
    return { type: 'error', error: 'Could not understand request. Please try again.' };
  }

  var response;
  switch (classified.action) {
    case 'fetch_ayah':
      response = insertDirectAyah(classified.surah, classified.ayah, classified.ayah);
      break;
    case 'search':
      response = _handleSearchRouting(classified);
      break;
    case 'clarify':
      response = { type: 'clarify', message: classified.message || 'Could you be more specific?' };
      break;
    default:
      response = { type: 'error', error: 'Could not understand request. Please try again.' };
      break;
  }

  response.rawResponse = rawResponse || '';
  return response;
}

/**
 * Thin wrapper for frontend compatibility.
 * @param {Array<{role: string, content: string}>} messages
 * @return {Object} Unified response
 */
function processUnifiedQuery(messages) {
  return performAISearch(messages);
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Routes search based on language classification from Claude.
 * @param {Object} classified - { query, language, references? }
 * @return {Object} Unified result object
 */
function _handleSearchRouting(classified) {
  var language = (classified.language || '').toLowerCase();

  if (language === 'arabic') {
    return performExactSearch(classified.query);
  }
  return _handleEnglishSearch(classified);
}

/**
 * Handles English/semantic search: validates Claude's references against quranapi.
 * @param {Object} classified - { query, references: [{surah, ayah}] }
 * @return {Object} Unified result object
 */
function _handleEnglishSearch(classified) {
  var settings = getSettings();
  var style = settings.arabicStyle || 'uthmani';
  var refs = classified.references;

  if (!refs || !Array.isArray(refs) || !refs.length) {
    return { type: 'error', error: 'No results found. Try a different query.' };
  }

  var validRefs = [];
  for (var i = 0; i < refs.length && i < AI_MAX_REFERENCES; i++) {
    var s = parseInt(refs[i].surah, 10);
    var a = parseInt(refs[i].ayah, 10);
    if (s >= 1 && s <= 114 && a >= 1) {
      validRefs.push({ surah: s, ayah: a });
    }
  }

  if (!validRefs.length) {
    return { type: 'error', error: 'No valid results found. Try a different query.' };
  }

  var validated = _validateAndFetchReferences(validRefs, style);
  if (!validated.length) {
    return { type: 'error', error: 'No verified results found. Try a different query.' };
  }

  return { type: 'search', results: validated };
}

/**
 * Trims conversation messages to the last N entries and validates format.
 * @param {Array} messages - Raw messages from client
 * @return {Array<{role: string, content: string}>} Validated, trimmed messages
 */
function _trimConversationContext(messages) {
  var valid = [];
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    if (m && m.role && m.content && typeof m.content === 'string') {
      valid.push({ role: String(m.role), content: String(m.content) });
    }
  }
  if (valid.length > CONVERSATION_CONTEXT_LIMIT) {
    valid = valid.slice(valid.length - CONVERSATION_CONTEXT_LIMIT);
  }
  return valid;
}

/**
 * Calls Claude API with the unified system prompt and conversation context.
 * @param {string} apiKey - Claude API key
 * @param {Array<{role: string, content: string}>} messages - Conversation messages
 * @return {{raw: string, parsed: Object}} Raw text and parsed JSON action object
 */
function _callClaudeForClassification(apiKey, messages) {
  var payload = {
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    temperature: 0,
    system: UNIFIED_SYSTEM_PROMPT,
    messages: messages
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(CLAUDE_API_URL, options);
  var code = response.getResponseCode();

  if (code === 401) {
    throw new Error('Invalid API key');
  }
  if (code !== 200) {
    throw new Error('Claude API returned HTTP ' + code);
  }

  var body = JSON.parse(response.getContentText());
  if (!body || !body.content || !body.content.length) {
    throw new Error('Empty response from Claude');
  }

  var text = '';
  for (var i = 0; i < body.content.length; i++) {
    if (body.content[i].type === 'text') {
      text += body.content[i].text;
    }
  }

  return { raw: text, parsed: _parseClassificationResponse(text) };
}

/**
 * Parses Claude's classification JSON response. Handles markdown fences and
 * extraneous text around the JSON.
 * @param {string} text - Raw response text from Claude
 * @return {Object|null} Parsed action object or null
 */
function _parseClassificationResponse(text) {
  if (!text) return null;

  var cleaned = text.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    var match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (e2) {
      return null;
    }
  }
}

/**
 * Validates references by fetching each from quranapi.pages.dev in parallel.
 * Silently discards any reference that returns non-200 (hallucination guard).
 * @param {Array<{surah: number, ayah: number}>} references
 * @param {string} style - "uthmani" or "simple"
 * @return {Array<Object>} Validated results with full ayah data
 */
function _validateAndFetchReferences(references, style) {
  if (!references || !references.length) return [];

  var requests = [];
  var refMap = [];

  for (var i = 0; i < references.length; i++) {
    var ref = references[i];
    var url = QURAN_API_BASE + '/' + ref.surah + '/' + ref.ayah + '.json';
    requests.push({ url: url, muteHttpExceptions: true });
    refMap.push(ref);
  }

  if (!requests.length) return [];

  var responses = UrlFetchApp.fetchAll(requests);
  var validated = [];

  for (var j = 0; j < responses.length; j++) {
    if (responses[j].getResponseCode() !== 200) continue;

    try {
      var json = JSON.parse(responses[j].getContentText());
      var result = _parseQuranApiResponse(json, refMap[j].surah, refMap[j].ayah, style);
      if (result) validated.push(result);
    } catch (e) {
      // Silently discard — hallucination guard
    }
  }

  return validated;
}
