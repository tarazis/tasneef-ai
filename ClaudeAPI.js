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
var FETCH_AYAH_SAFETY_CAP = 300;

var UNIFIED_SYSTEM_PROMPT =
  '<role>\n' +
  'You are a Quran search assistant for Islamic scholars. ' +
  'Classify user intent and return ONLY a raw JSON object. ' +
  'No markdown fences, no explanation, no extra text.\n' +
  '</role>\n\n' +
  '<actions>\n' +
  '1. fetch_ayah — User wants specific ayah(s) by surah and ayah reference.\n' +
  'Always use the "references" array, even for a single ayah. Always use ayahStart/ayahEnd (for a single ayah, set both to the same number).\n' +
  'Single ayah: {"action":"fetch_ayah","references":[{"surah":2,"ayahStart":255,"ayahEnd":255}]}\n' +
  'Range: {"action":"fetch_ayah","references":[{"surah":3,"ayahStart":190,"ayahEnd":194}]}\n' +
  'Multiple references: {"action":"fetch_ayah","references":[{"surah":2,"ayahStart":255,"ayahEnd":255},{"surah":67,"ayahStart":1,"ayahEnd":3}]}\n' +
  'Full surah: {"action":"fetch_ayah","references":[{"surah":1,"ayahStart":1,"ayahEnd":7}]}\n\n' +
  '2. exact_search — Input contains Quranic Arabic text to find in the corpus.\n' +
  'Extract only the Quranic Arabic text into "query", stripping any surrounding instructions.\n' +
  '{"action":"exact_search","query":"بسم الله الرحمن"}\n\n' +
  '3. semantic_search — User describes a topic, theme, or meaning to search for (in any language).\n' +
  'Return up to 50 of the most relevant {surah, ayah} references, ordered by relevance.\n' +
  '{"action":"semantic_search","references":[{"surah":2,"ayah":153},{"surah":3,"ayah":200}]}\n\n' +
  '4. clarify — The request is ambiguous or missing information.\n' +
  '{"action":"clarify","message":"Your clarifying question here"}\n' +
  '</actions>\n\n' +
  '<guidelines>\n' +
  '- Return ONLY the raw JSON object.\n' +
  '- For fetch_ayah: you must know the exact surah (1-114) and ayah number(s). ' +
  'Always use the "references" array format.\n' +
  '- Use exact_search when the input contains Quranic Arabic text to match in the corpus, ' +
  'regardless of whether surrounding instructions are in Arabic or another language. ' +
  'Extract only the Quranic text into "query".\n' +
  '- Use semantic_search when the user describes what to find by meaning, topic, or theme, ' +
  'in any language (including Arabic questions about Quran topics).\n' +
  '- If a surah name is given without an ayah number, return the full surah using fetch_ayah. ' +
  'You must know the correct total ayah count for the surah.\n' +
  '- Prefer clarify over guessing when input is ambiguous.\n' +
  '</guidelines>\n\n' +
  '<examples>\n' +
  'User: "الحمد لله رب العالمين"\n' +
  '{"action":"exact_search","query":"الحمد لله رب العالمين"}\n\n' +
  'User: "ابحث عن: إن مع العسر يسرا"\n' +
  '{"action":"exact_search","query":"إن مع العسر يسرا"}\n\n' +
  'User: "find the verse that contains الله نور السماوات"\n' +
  '{"action":"exact_search","query":"الله نور السماوات"}\n\n' +
  'User: "verses about patience in hardship"\n' +
  '{"action":"semantic_search","references":[{"surah":2,"ayah":153},{"surah":2,"ayah":155},{"surah":3,"ayah":200}]}\n\n' +
  'User: "ما هي الآيات التي تتحدث عن الصبر"\n' +
  '{"action":"semantic_search","references":[{"surah":2,"ayah":153},{"surah":2,"ayah":155},{"surah":31,"ayah":17}]}\n\n' +
  'User: "show me Al-Imran 190 to 194"\n' +
  '{"action":"fetch_ayah","references":[{"surah":3,"ayahStart":190,"ayahEnd":194}]}\n\n' +
  'User: "give me al baqarah 255 and al mulk 1 to 3"\n' +
  '{"action":"fetch_ayah","references":[{"surah":2,"ayahStart":255,"ayahEnd":255},{"surah":67,"ayahStart":1,"ayahEnd":3}]}\n\n' +
  'User: "show me Al-Baqarah"\n' +
  '{"action":"fetch_ayah","references":[{"surah":2,"ayahStart":1,"ayahEnd":286}]}\n\n' +
  'User: "show me Surah Al-Fatiha"\n' +
  '{"action":"fetch_ayah","references":[{"surah":1,"ayahStart":1,"ayahEnd":7}]}\n' +
  '</examples>';

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
    case 'exact_search':
      response = _handleExactSearch(classified);
      break;
    case 'semantic_search':
      response = _handleSemanticSearch(classified);
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
 * Handles exact Arabic search: returns the query for client-side corpus matching.
 * @param {Object} classified - { query }
 * @return {Object} { type: 'arabic_search', query } or error
 */
function _handleExactSearch(classified) {
  var q = (classified.query || '').trim();
  if (!q) return { type: 'error', error: 'Please enter a search query.' };
  return { type: 'arabic_search', query: q };
}

/**
 * Handles semantic search: returns Claude's validated references for
 * client-side resolution against in-memory caches.
 * @param {Object} classified - { references: [{surah, ayah}] }
 * @return {Object} { type: 'references', references: [{surah, ayah}] } or error
 */
function _handleSemanticSearch(classified) {
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
    return { type: 'error', error: 'Invalid surah number. Must be 1-114.' };
  }
  if (!ayahStart || ayahStart < 1) {
    return { type: 'error', error: 'Invalid ayah number.' };
  }
  if (ayahEnd < ayahStart) ayahEnd = ayahStart;
  if (ayahEnd - ayahStart + 1 > FETCH_AYAH_SAFETY_CAP) {
    return { type: 'error', error: 'Range too large. Maximum ' + FETCH_AYAH_SAFETY_CAP + ' ayahs at once.' };
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
 * Invalid items are silently skipped; total count is capped at FETCH_AYAH_SAFETY_CAP.
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
      if (refs.length > FETCH_AYAH_SAFETY_CAP) {
        return { type: 'error', error: 'Too many ayahs requested. Maximum ' + FETCH_AYAH_SAFETY_CAP + ' at once.' };
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

