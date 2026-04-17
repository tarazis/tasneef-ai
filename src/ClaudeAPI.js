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
var CLAUDE_RAG_RERANK_MAX_TOKENS = 512;
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
  'Include a "queries" array of exactly 3 short strings: reformulate the same user intent from different angles ' +
  '(different vocabulary, synonyms, Islamic terminology alongside English, and phrasing that could appear ' +
  'in an English Quran translation or tafseer). Questions in Arabic should still use English-oriented query strings.\n' +
  'Include a "references" array of up to 50 {surah, ayah} pairs, ordered by relevance, for the standard semantic results path.\n' +
  'Include "rag_supported": true or false (see guidelines).\n' +
  '{"action":"semantic_search","rag_supported":true,"queries":["patience and steadfastness in the face of hardship","sabr during trials and tests from Allah","enduring difficulty with faith and perseverance"],"references":[{"surah":2,"ayah":153},{"surah":2,"ayah":155},{"surah":3,"ayah":200}]}\n\n' +
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
  '- For semantic_search: always include "queries" (exactly 3 strings), "references" (up to 50 pairs), and "rag_supported".\n' +
  '- For semantic_search: set "rag_supported" to true when the query can be answered by searching ayah content, meaning, or themes, ' +
  'optionally filtered by surah. Set "rag_supported" to false when the query requires filtering by juz, page number, hizb, ' +
  'revelation order, makki/madani classification, or any structural metadata beyond surah number. ' +
  'When rag_supported is false, the "references" array will be used directly as the sole source of results, ' +
  'so make it especially thorough and include up to 50 references.\n' +
  '- If the user restricts their search to a specific surah, include a "filter" object with the surah number: ' +
  '"filter":{"surah":2}. If no surah restriction, omit "filter" entirely.\n' +
  '- If the user requests a specific number of results (e.g. "give me 5 ayahs about..."), include "limit" with that number: ' +
  '"limit":5. If not specified, omit "limit".\n' +
  '- If the user asks for multiple topics or multiple surah filters in one query (e.g. "2 ayahs from baqara about patience and 3 from imran about love"), ' +
  'use clarify to ask them to search one topic at a time.\n' +
  '- If a surah name is given without an ayah number, return the full surah using fetch_ayah. ' +
  'You must know the correct total ayah count for the surah.\n' +
  '- Never assume or correct a surah name, surah number, or ayah number. ' +
  'If the user provides a name or number that does not exactly match a known surah ' +
  'or exceeds the ayah count for that surah, use clarify to ask the user to verify. ' +
  'Do not guess the closest match.\n' +
  '- Surah numbers must be between 1 and 114. If the user requests a surah number outside this range ' +
  '(e.g. surah 116, surah 0, surah 200), always use clarify to tell them it is not valid and ask which surah they meant.\n' +
  '- Prefer clarify over guessing when input is ambiguous.\n' +
  '</guidelines>\n\n' +
  '<examples>\n' +
  'User: "الحمد لله رب العالمين"\n' +
  '{"action":"exact_search","query":"الحمد لله رب العالمين"}\n\n' +
  'User: "ابحث عن: إن مع العسر يسرا"\n' +
  '{"action":"exact_search","query":"إن مع العسر يسرا"}\n\n' +
  'User: "find the verse that contains الله نور السماوات"\n' +
  '{"action":"exact_search","query":"الله نور السماوات"}\n\n' +
  'User: "verses about the love of the prophet"\n' +
  '{"action":"semantic_search","rag_supported":true,"queries":["love and devotion to the Messenger Muhammad","preferring the Prophet over worldly attachments and family","sending blessings and salutations upon the Prophet salawat"],"references":[{"surah":3,"ayah":31},{"surah":33,"ayah":56},{"surah":9,"ayah":24},{"surah":48,"ayah":29}]}\n\n' +
  'User: "ayahs about love between husband and wife"\n' +
  '{"action":"semantic_search","rag_supported":true,"queries":["love and mercy between spouses mawaddah rahmah","marriage as a sign of Allah and tranquility between partners","the bond between husband and wife in Islam"],"references":[{"surah":30,"ayah":21},{"surah":2,"ayah":187},{"surah":4,"ayah":1}]}\n\n' +
  'User: "verses about patience in hardship"\n' +
  '{"action":"semantic_search","rag_supported":true,"queries":["patience and steadfastness in the face of hardship","sabr during trials and tests from Allah","enduring difficulty with faith and perseverance"],"references":[{"surah":2,"ayah":153},{"surah":2,"ayah":155},{"surah":3,"ayah":200}]}\n\n' +
  'User: "ما هي الآيات التي تتحدث عن الصبر"\n' +
  '{"action":"semantic_search","rag_supported":true,"queries":["patience and steadfastness in the face of hardship","sabr during trials and tests from Allah","enduring difficulty with faith and perseverance"],"references":[{"surah":2,"ayah":153},{"surah":2,"ayah":155},{"surah":31,"ayah":17}]}\n\n' +
  'User: "give me 10 ayahs from surah al baqarah about tawheed"\n' +
  '{"action":"semantic_search","rag_supported":true,"queries":["monotheism and oneness of Allah in Al-Baqarah","tawheed and rejecting false gods","worshiping Allah alone without partners"],"references":[{"surah":2,"ayah":163},{"surah":2,"ayah":255}],"filter":{"surah":2},"limit":10}\n\n' +
  'User: "ayahs from juz 30 about mercy"\n' +
  '{"action":"semantic_search","rag_supported":false,"queries":["mercy and compassion of Allah in short surahs","Allah\'s rahma in Juz Amma","forgiveness and mercy in the Quran"],"references":[{"surah":93,"ayah":5},{"surah":85,"ayah":14},{"surah":110,"ayah":3},{"surah":95,"ayah":8},{"surah":107,"ayah":1}]}\n\n' +
  'User: "makki ayahs about the Day of Judgment"\n' +
  '{"action":"semantic_search","rag_supported":false,"queries":["Day of Judgment and resurrection in Meccan surahs","Yawm al-Qiyamah warnings to disbelievers","descriptions of the Hereafter in early revelations"],"references":[{"surah":82,"ayah":1},{"surah":81,"ayah":1},{"surah":56,"ayah":1},{"surah":78,"ayah":1},{"surah":99,"ayah":1}]}\n\n' +
  'User: "5 ayahs about forgiveness"\n' +
  '{"action":"semantic_search","rag_supported":true,"queries":["Allah\'s forgiveness and pardon for sins","seeking forgiveness and repentance tawbah istighfar","divine mercy toward those who repent"],"references":[{"surah":39,"ayah":53},{"surah":4,"ayah":110},{"surah":3,"ayah":135}],"limit":5}\n\n' +
  'User: "3 ayahs from baqara about patience and 2 from imran about love"\n' +
  '{"action":"clarify","message":"I can search one topic at a time. Which would you like first — ayahs about patience from Al-Baqarah, or ayahs about love from Ali \'Imran?"}\n\n' +
  'User: "show me Al-Imran 190 to 194"\n' +
  '{"action":"fetch_ayah","references":[{"surah":3,"ayahStart":190,"ayahEnd":194}]}\n\n' +
  'User: "give me al baqarah 255 and al mulk 1 to 3"\n' +
  '{"action":"fetch_ayah","references":[{"surah":2,"ayahStart":255,"ayahEnd":255},{"surah":67,"ayahStart":1,"ayahEnd":3}]}\n\n' +
  'User: "show me Al-Baqarah"\n' +
  '{"action":"fetch_ayah","references":[{"surah":2,"ayahStart":1,"ayahEnd":286}]}\n\n' +
  'User: "show me Surah Al-Fatiha"\n' +
  '{"action":"fetch_ayah","references":[{"surah":1,"ayahStart":1,"ayahEnd":7}]}\n\n' +
  'User: "show me surah 116"\n' +
  '{"action":"clarify","message":"Surah 116 is not a valid surah number. The Quran has 114 surahs (1-114). Which surah did you mean?"}\n' +
  '</examples>';

var RAG_RERANK_SYSTEM_PROMPT =
  'You are a Quran relevance ranker. Given a user\'s search query and a list of candidate ayahs, return the 10 most relevant ayahs ranked by how directly they address the user\'s intent.\n\n' +
  'Return ONLY a JSON array of ayah keys in order of relevance, most relevant first.\n' +
  'Example: ["30:21","4:19","2:231"]';

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

  var originalUserMessageForRerank = lastMessage.content.trim();

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
      response = _handleSemanticSearchRouted_(classified, originalUserMessageForRerank);
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
 * Handles semantic search: validates Claude's references, merges consecutive
 * same-surah ayahs into range groups, and returns them for client-side resolution.
 * @param {Object} classified - { references: [{surah, ayah}] }
 * @return {Object} { type: 'references', references: [{surah, ayahStart, ayahEnd}] } or error
 */
function _handleSemanticSearch(classified) {
  var refs = classified.references;

  var rawCount = (refs && Array.isArray(refs)) ? refs.length : 0;
  Logger.log('[CLAUDE SEARCH] Claude returned ' + rawCount + ' raw reference(s):');
  if (refs && Array.isArray(refs)) {
    for (var ci = 0; ci < refs.length && ci < AI_MAX_REFERENCES; ci++) {
      Logger.log('  [' + (ci + 1) + '] Surah ' + refs[ci].surah + ':' + refs[ci].ayah + ' (no score — Claude semantic search)');
    }
  }

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

  Logger.log('[CLAUDE SEARCH] After validation: ' + validRefs.length + ' valid ref(s) remain.');

  if (!validRefs.length) {
    return { type: 'error', error: 'No valid results found. Try a different query.' };
  }

  var merged = _mergeConsecutiveReferences(validRefs);
  Logger.log('[CLAUDE SEARCH] Final result: ' + merged.length + ' merged group(s) shown to user.');
  return { type: 'references', references: merged };
}

/**
 * Routes semantic_search to RAG or Claude references path based on rag_supported flag.
 * RAG is the default; falls back to Claude references if rag_supported is explicitly false
 * or if the RAG path throws or returns zero results.
 * @param {Object} classified - Claude classification with { rag_supported?, queries?, references, filter?, limit? }
 * @param {string} originalUserMessageForRerank - Last user message as typed
 * @return {Object} { type: 'references', references } or error
 */
function _handleSemanticSearchRouted_(classified, originalUserMessageForRerank) {
  if (classified.rag_supported === false) {
    Logger.log('[SEMANTIC] rag_supported=false — using Claude references directly.');
    return _handleSemanticSearch(classified);
  }

  // Default: RAG path. Any error falls back to Claude references.
  var queryStrings = classified.queries;
  if (!queryStrings || !Array.isArray(queryStrings) || !queryStrings.length) {
    Logger.log('[RAG SEARCH] No expansion queries provided, falling back to Claude references.');
    return _handleSemanticSearch(classified);
  }

  try {
    var result = _handleRagSearch(classified, originalUserMessageForRerank);
    // _handleRagSearch already falls back internally on most errors, but it may return
    // an empty references array if filtering leaves zero results after threshold.
    if (result && result.type === 'references' && result.references && result.references.length > 0) {
      return result;
    }
    Logger.log('[SEMANTIC] RAG returned empty result set — falling back to Claude references.');
    return _handleSemanticSearch(classified);
  } catch (e) {
    Logger.log('[SEMANTIC] RAG path threw unexpected error: ' + e.message + ' — falling back to Claude references.');
    return _handleSemanticSearch(classified);
  }
}

/**
 * Converts a fetch_ayah classification into merged range groups for client-side resolution.
 * Expands references to flat pairs, then merges consecutive same-surah ayahs into groups.
 * @param {Object} classified - { references?, surah?, ayah?, ayahStart?, ayahEnd? }
 * @return {Object} { type: 'references', references: [...] } or { type: 'error'|'clarify', ... }
 */
function _handleFetchAyahAsReferences(classified) {
  if (Array.isArray(classified.references) && classified.references.length === 0) {
    return { type: 'error', error: 'No ayah references in response.' };
  }
  if (Array.isArray(classified.references) && classified.references.length > 0) {
    var expanded = _expandMultiReferences(classified.references);
    if (expanded.type === 'error' || expanded.type === 'clarify') return expanded;
    return { type: 'references', references: _mergeConsecutiveReferences(expanded.references) };
  }

  var ayahStart = parseInt(classified.ayahStart || classified.ayah, 10);
  var ayahEnd = parseInt(classified.ayahEnd || classified.ayah || ayahStart, 10);
  var s = parseInt(classified.surah, 10);

  if (!s || s < 1 || s > 114) {
    return {
      type: 'clarify',
      message: 'Surah ' + (s || '?') + ' is not a valid surah number. The Quran has 114 surahs (1\u2013114). Which surah did you mean?'
    };
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
  return { type: 'references', references: _mergeConsecutiveReferences(refs) };
}

/**
 * Sorts flat {surah, ayah} references and merges consecutive same-surah ayahs into range groups.
 * E.g. [{surah:3, ayah:124}, {surah:2, ayah:255}, {surah:3, ayah:123}]
 *    → [{surah:2, ayahStart:255, ayahEnd:255}, {surah:3, ayahStart:123, ayahEnd:124}]
 * @param {Array<{surah: number, ayah: number}>} refs - Flat references
 * @return {Array<{surah: number, ayahStart: number, ayahEnd: number}>} Merged groups
 */
function _mergeConsecutiveReferences(refs) {
  if (!refs || !refs.length) return [];

  var sorted = refs.slice().sort(function(a, b) {
    if (a.surah !== b.surah) return a.surah - b.surah;
    return a.ayah - b.ayah;
  });

  var groups = [];
  var cur = { surah: sorted[0].surah, ayahStart: sorted[0].ayah, ayahEnd: sorted[0].ayah };

  for (var i = 1; i < sorted.length; i++) {
    var r = sorted[i];
    if (r.surah === cur.surah && r.ayah === cur.ayahEnd + 1) {
      cur.ayahEnd = r.ayah;
    } else {
      groups.push(cur);
      cur = { surah: r.surah, ayahStart: r.ayah, ayahEnd: r.ayah };
    }
  }
  groups.push(cur);

  return groups;
}

/**
 * Merges consecutive same-surah ayahs into range groups without reordering the input.
 * Use for RAG so Pinecone/rerank order is preserved; unlike _mergeConsecutiveReferences,
 * which sorts by surah/ayah first for canonical display on other paths.
 * @param {Array<{surah: number, ayah: number}>} refs - Flat references in desired output order
 * @return {Array<{surah: number, ayahStart: number, ayahEnd: number}>} Merged groups
 */
function _mergeConsecutiveReferencesInInputOrder_(refs) {
  if (!refs || !refs.length) return [];

  var groups = [];
  var cur = { surah: refs[0].surah, ayahStart: refs[0].ayah, ayahEnd: refs[0].ayah };

  for (var i = 1; i < refs.length; i++) {
    var r = refs[i];
    if (r.surah === cur.surah && r.ayah === cur.ayahEnd + 1) {
      cur.ayahEnd = r.ayah;
    } else {
      groups.push(cur);
      cur = { surah: r.surah, ayahStart: r.ayah, ayahEnd: r.ayah };
    }
  }
  groups.push(cur);

  return groups;
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
  var invalidSurahs = [];
  for (var g = 0; g < groups.length; g++) {
    var item = groups[g];
    var s = parseInt(item.surah, 10);
    if (!s || s < 1 || s > 114) {
      if (s) invalidSurahs.push(s);
      continue;
    }

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
    if (invalidSurahs.length) {
      var nums = invalidSurahs.join(', ');
      return {
        type: 'clarify',
        message: 'Surah ' + nums + ' is not a valid surah number. The Quran has 114 surahs (1\u2013114). Which surah did you mean?'
      };
    }
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
 * Calls Claude to rerank RAG candidate ayahs by English translation relevance.
 * @param {string} apiKey - Anthropic API key
 * @param {string} userQuery - User search query for reranking
 * @param {string} candidateBlock - Lines "surah:ayah — translation"
 * @return {string|null} Model text, or null on HTTP/body failure
 */
function _callClaudeForRagRerank_(apiKey, userQuery, candidateBlock) {
  if (!apiKey || !candidateBlock || !String(candidateBlock).trim()) {
    return null;
  }

  var userContent =
    'User query: ' + (userQuery || '') + '\n\n' +
    'Candidate ayahs:\n' +
    candidateBlock;

  var payload = {
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_RAG_RERANK_MAX_TOKENS,
    temperature: 0,
    system: RAG_RERANK_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }]
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
  if (response.getResponseCode() !== 200) {
    return null;
  }

  var body = JSON.parse(response.getContentText());
  if (!body || !body.content || !body.content.length) {
    return null;
  }

  var text = '';
  for (var i = 0; i < body.content.length; i++) {
    if (body.content[i].type === 'text') {
      text += body.content[i].text;
    }
  }
  return text ? text.trim() : null;
}

/**
 * Parses Claude rerank response: JSON array of "surah:ayah" keys.
 * @param {string} text - Raw model output
 * @return {string[]|null} Validated keys, or null if unusable
 */
function _parseRerankedAyahKeys_(text) {
  if (!text || typeof text !== 'string') return null;

  var cleaned = text.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();

  var parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    var match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch (e2) {
      return null;
    }
  }

  if (!Array.isArray(parsed) || !parsed.length) return null;

  var out = [];
  for (var i = 0; i < parsed.length; i++) {
    if (typeof parsed[i] !== 'string') continue;
    var key = parsed[i].trim();
    var parts = key.split(':');
    if (parts.length !== 2) continue;
    var s = parseInt(parts[0], 10);
    var a = parseInt(parts[1], 10);
    if (!(s >= 1 && s <= 114 && a >= 1)) continue;
    out.push(s + ':' + a);
  }

  return out.length ? out : null;
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

