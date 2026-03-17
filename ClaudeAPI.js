/**
 * ClaudeAPI.gs
 * Unified query handler: classifies user intent via Claude, then routes to
 * the appropriate data source (quranapi, GitHub Pages, or semantic references).
 * Claude is a text classifier only — never returns Quranic text or translations.
 */

var CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
var CLAUDE_MODEL = 'claude-sonnet-4-20250514';
var CLAUDE_MAX_TOKENS = 1024;
var AI_MAX_REFERENCES = 10;

var UNIFIED_SYSTEM_PROMPT =
  'You are a Quran search assistant for Islamic scholars. ' +
  'Given a user request, determine the intent and return ONLY a raw JSON object (no markdown fences, no explanation). ' +
  'Use one of these exact formats:\n\n' +
  'If the user wants a specific ayah by reference number, surah name, or well-known verse name:\n' +
  '{"action":"fetch_ayah","surah":2,"ayah":255}\n\n' +
  'If the user provides Arabic text to search for in the Quran:\n' +
  '{"action":"exact_search","query":"the arabic text here"}\n\n' +
  'If the user describes a topic, theme, or meaning and wants to find matching verses:\n' +
  '{"action":"semantic_search","references":[{"surah":2,"ayah":153},{"surah":3,"ayah":200}]}\n' +
  'Return 5-10 of the most relevant references for semantic search, ordered by relevance.\n\n' +
  'If the request is ambiguous or you need more information:\n' +
  '{"action":"clarify","message":"Your clarifying question here"}\n\n' +
  'Rules:\n' +
  '- ONLY return the raw JSON object. No markdown, no explanation, no extra text.\n' +
  '- For fetch_ayah: you must know the exact surah number (1-114) and ayah number.\n' +
  '- For exact_search: extract the Arabic text the user wants to search for.\n' +
  '- For semantic_search: return references you are confident about from your knowledge of the Quran.\n' +
  '- If the user gives a surah name (e.g. "Al-Baqarah") without an ayah, use clarify to ask which ayah.\n' +
  '- If the user gives ambiguous input, prefer clarify over guessing.';

/**
 * Processes a user query through the unified Claude-based interface.
 * Routes to fetch_ayah, exact_search, or semantic_search based on Claude's classification.
 * @param {string} userMessage - The user's natural language query
 * @return {Object} { type: string, results?: Array, message?: string, error?: string }
 */
function processUnifiedQuery(userMessage) {
  if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
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

  var parsed;
  try {
    parsed = _callClaudeForClassification(apiKey, userMessage.trim());
  } catch (e) {
    return { type: 'error', error: 'Something went wrong. Please try again.' };
  }

  if (!parsed || !parsed.action) {
    return { type: 'error', error: 'Could not understand request. Please try again.' };
  }

  var settings = getSettings();
  var style = settings.arabicStyle || 'uthmani';

  switch (parsed.action) {
    case 'fetch_ayah':
      return _handleFetchAyah(parsed, style);
    case 'exact_search':
      return _handleExactSearch(parsed, style);
    case 'semantic_search':
      return _handleSemanticSearch(parsed, style);
    case 'clarify':
      return { type: 'clarify', message: parsed.message || 'Could you be more specific?' };
    default:
      return { type: 'error', error: 'Could not understand request. Please try again.' };
  }
}

/**
 * Calls Claude API with the unified system prompt and returns the parsed JSON response.
 * @param {string} apiKey - Claude API key
 * @param {string} userMessage - User's query
 * @return {Object} Parsed JSON action object
 */
function _callClaudeForClassification(apiKey, userMessage) {
  var payload = {
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    temperature: 0,
    system: UNIFIED_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: userMessage }
    ]
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

  return _parseClassificationResponse(text);
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
 * Handles fetch_ayah action: looks up a single ayah from quranapi.pages.dev.
 * @param {Object} parsed - { action, surah, ayah }
 * @param {string} style - "uthmani" or "simple"
 * @return {Object} Unified result object
 */
function _handleFetchAyah(parsed, style) {
  var surah = parseInt(parsed.surah, 10);
  var ayah = parseInt(parsed.ayah, 10);

  if (!surah || surah < 1 || surah > 114 || !ayah || ayah < 1) {
    return { type: 'error', error: 'Invalid ayah reference. Please try again.' };
  }

  var result = getAyahFromQuranApi(surah, ayah, style);
  if (!result) {
    return { type: 'error', error: 'Ayah ' + surah + ':' + ayah + ' not found.' };
  }

  return { type: 'single', results: [result] };
}

/**
 * Handles exact_search action: runs in-memory Arabic text search via QuranData.
 * @param {Object} parsed - { action, query }
 * @param {string} style - "uthmani" or "simple"
 * @return {Object} Unified result object
 */
function _handleExactSearch(parsed, style) {
  var query = parsed.query;
  if (!query || typeof query !== 'string' || !query.trim()) {
    return { type: 'error', error: 'No search text provided.' };
  }

  var data = loadQuranData();
  var results = searchQuran(data, query.trim(), 'simple');

  if (!results || !results.length) {
    return { type: 'search', results: [], message: 'No exact matches found for that text.' };
  }

  return { type: 'search', results: results };
}

/**
 * Handles semantic_search action: validates Claude's references against quranapi.
 * @param {Object} parsed - { action, references: [{surah, ayah}] }
 * @param {string} style - "uthmani" or "simple"
 * @return {Object} Unified result object
 */
function _handleSemanticSearch(parsed, style) {
  var refs = parsed.references;
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

  return { type: 'semantic', results: validated };
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
      if (!json) continue;

      var arabic1 = json.arabic1 || '';
      var arabic2 = json.arabic2 || '';
      var s = style || 'uthmani';
      var arabicText = (s === 'uthmani') ? arabic1 : arabic2;
      if (!arabicText) arabicText = arabic1 || arabic2;

      validated.push({
        surah: json.surahNo || refMap[j].surah,
        ayah: json.ayahNo || refMap[j].ayah,
        surahNameArabic: json.surahNameArabic || '',
        surahNameEnglish: json.surahNameTranslation || json.surahName || '',
        arabicText: arabicText,
        textUthmani: arabic1,
        textSimple: arabic2,
        translationText: json.english || ''
      });
    } catch (e) {
      // Silently discard — hallucination guard
    }
  }

  return validated;
}
