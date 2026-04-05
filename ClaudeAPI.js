/**
 * ClaudeAPI.gs
 * Backend functions for Quran lookup:
 *   - performAISearch(messages) — Claude-powered intent classification + search routing
 *
 * processUnifiedQuery is kept as a thin wrapper for frontend compatibility.
 *
 * Arabic corpus search is handled entirely client-side (searchImlaeiClient);
 * the server only extracts the query via Claude and returns it for the client.
 */

var CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
var CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
var CLAUDE_MAX_TOKENS = 1024;
var AI_MAX_REFERENCES = 50;
var CONVERSATION_CONTEXT_LIMIT = 3;
var DIRECT_AYAH_RANGE_CAP = 30;

var UNIFIED_SYSTEM_PROMPT =
  'You are a Quran search assistant for Islamic scholars. ' +
  'Given a user request, determine the intent and return ONLY a raw JSON object. ' +
  'No markdown fences, no explanation, no extra text — just the JSON.\n\n' +
  'Actions:\n\n' +
  '1. fetch_ayah — user wants a specific ayah or consecutive range by reference:\n' +
  'Single: {"action":"fetch_ayah","surah":2,"ayah":255}\n' +
  'Range:  {"action":"fetch_ayah","surah":3,"ayahStart":190,"ayahEnd":194}\n' +
  'Multi (non-consecutive or different surahs): {"action":"fetch_ayah","references":[{"surah":2,"ayah":1},{"surah":67,"ayah":2}]}\n' +
  'Each item in references can use "ayah" (single) or "ayahStart"/"ayahEnd" (range). Maximum 30 total ayahs.\n\n' +
  '2. search — user wants to find verses (by Arabic text, topic, theme, or meaning):\n' +
  'For Arabic Quranic text to search in the corpus:\n' +
  '{"action":"search","query":"بسم الله الرحمن","language":"arabic"}\n' +
  'For English or non-Arabic description of what to find (include references you know):\n' +
  '{"action":"search","query":"patience in hardship","language":"english","references":[{"surah":2,"ayah":153},{"surah":3,"ayah":200}]}\n' +
  'Return up to 50 of the most relevant references for English search, ordered by relevance.\n\n' +
  '3. clarify — the request is ambiguous or you need more information:\n' +
  '{"action":"clarify","message":"Your clarifying question here"}\n\n' +
  'Rules:\n' +
  '- Return ONLY the raw JSON object.\n' +
  '- For fetch_ayah: you must know the exact surah (1-114) and ayah number(s). ' +
  'Use "ayah" for a single verse, "ayahStart"/"ayahEnd" for a consecutive range, ' +
  'or "references" array for multiple non-consecutive verses or verses from different surahs.\n' +
  '- For Arabic input: determine if it is Quranic text to search for (use search with language "arabic") ' +
  'or a conversational question in Arabic (interpret the intent and respond accordingly). ' +
  'If genuinely unsure, use clarify.\n' +
  '- For search with language "english": include a "references" array of up to 50 {surah, ayah} pairs from your Quran knowledge.\n' +
  '- For search with language "arabic": include only "query" (the Arabic text). No references needed.\n' +
  '- If the user gives a surah name without an ayah number, use clarify to ask which ayah.\n' +
  '- Prefer clarify over guessing when the input is ambiguous.';

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Performs AI-powered search using Claude for intent classification.
 * Handles conversation context for multi-turn clarification.
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

  var apiKey = getClaudeApiKey_();
  if (!apiKey) {
    return { type: 'error', error: 'AI search is temporarily unavailable. Please try again later.' };
  }

  var count = incrementAiSearchCount_();
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
      response = _handleFetchAyahAsReferences(classified);
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
 * Trailing underscore hides this from google.script.run.
 * @param {Array<{role: string, content: string}>} messages
 * @return {Object} Unified response
 */
function processUnifiedQuery_(messages) {
  return performAISearch(messages);
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Routes search based on language classification from Claude.
 * Arabic queries return {type: 'arabic_search', query} for client-side corpus search.
 * English queries return validated {surah, ayah} references for client-side resolution.
 * @param {Object} classified - { query, language, references? }
 * @return {Object} Unified result object
 */
function _handleSearchRouting(classified) {
  var language = (classified.language || '').toLowerCase();

  if (language === 'arabic') {
    var q = (classified.query || '').trim();
    if (!q) return { type: 'error', error: 'Please enter a search query.' };
    return { type: 'arabic_search', query: q };
  }
  return _handleEnglishSearch(classified);
}

/**
 * Handles English/semantic search: returns Claude's validated references for
 * client-side resolution against in-memory caches.
 * @param {Object} classified - { query, references: [{surah, ayah}] }
 * @return {Object} { type: 'references', references: [{surah, ayah}] } or error
 */
function _handleEnglishSearch(classified) {
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

  return { type: 'references', references: validRefs };
}

/**
 * Converts a fetch_ayah classification into raw references for client-side resolution.
 * @param {Object} classified - { surah, ayah?, ayahStart?, ayahEnd? }
 * @return {Object} { type: 'references', references: [{surah, ayah}] } or error
 */
function _handleFetchAyahAsReferences(classified) {
  if (Array.isArray(classified.references) && classified.references.length > 0) {
    return _expandMultiReferences(classified.references);
  }

  var ayahStart = parseInt(classified.ayahStart || classified.ayah, 10);
  var ayahEnd = parseInt(classified.ayahEnd || classified.ayah || ayahStart, 10);
  var s = parseInt(classified.surah, 10);

  if (!s || s < 1 || s > 114) {
    return { type: 'error', error: 'Invalid surah number. Must be 1\u2013114.' };
  }
  if (!ayahStart || ayahStart < 1) {
    return { type: 'error', error: 'Invalid ayah number.' };
  }
  if (ayahEnd < ayahStart) ayahEnd = ayahStart;
  if (ayahEnd - ayahStart + 1 > DIRECT_AYAH_RANGE_CAP) {
    return { type: 'error', error: 'Range too large. Maximum ' + DIRECT_AYAH_RANGE_CAP + ' ayahs at once.' };
  }

  var refs = [];
  for (var i = ayahStart; i <= ayahEnd; i++) {
    refs.push({ surah: s, ayah: i });
  }
  return { type: 'references', references: refs };
}

/**
 * Expands an array of multi-reference items into a flat list of {surah, ayah} pairs.
 * Each item may be a single ayah or a range (ayahStart/ayahEnd).
 * Invalid items are silently skipped; total count is capped at DIRECT_AYAH_RANGE_CAP.
 * @param {Array<{surah: number, ayah?: number, ayahStart?: number, ayahEnd?: number}>} groups
 * @return {Object} { type: 'references', references: [{surah, ayah}] } or error
 */
function _expandMultiReferences(groups) {
  var refs = [];
  for (var g = 0; g < groups.length; g++) {
    var item = groups[g];
    var s = parseInt(item.surah, 10);
    if (!s || s < 1 || s > 114) continue;

    var start = parseInt(item.ayahStart || item.ayah, 10);
    var end = parseInt(item.ayahEnd || item.ayah || start, 10);
    if (!start || start < 1) continue;
    if (end < start) end = start;

    for (var a = start; a <= end; a++) {
      refs.push({ surah: s, ayah: a });
      if (refs.length > DIRECT_AYAH_RANGE_CAP) {
        return { type: 'error', error: 'Too many ayahs requested. Maximum ' + DIRECT_AYAH_RANGE_CAP + ' at once.' };
      }
    }
  }

  if (!refs.length) {
    return { type: 'error', error: 'No valid references found.' };
  }
  return { type: 'references', references: refs };
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
    if (m && m.content && typeof m.content === 'string' &&
        (m.role === 'user' || m.role === 'assistant')) {
      valid.push({ role: m.role, content: String(m.content) });
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

