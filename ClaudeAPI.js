/**
 * ClaudeAPI.gs
 * Semantic search via Claude. Returns validated Quran references.
 * Claude is a reference finder only — never returns Quranic text.
 * All Arabic text and translations come from quranapi.pages.dev.
 */

var CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
var CLAUDE_MODEL = 'claude-sonnet-4-20250514';
var CLAUDE_MAX_TOKENS = 1024;
var AI_MAX_REFERENCES = 10;

var CLAUDE_SYSTEM_PROMPT =
  'You are a Quran reference finder for Islamic scholars. ' +
  'Given a natural language description, return a JSON array of Quran verse references that best match the description. ' +
  'Each element must be an object with exactly two integer keys: "surah" (1–114) and "ayah". ' +
  'Return ONLY the raw JSON array — no markdown fences, no explanation, no Quranic text, no translation. ' +
  'Return between 5 and 10 of the most relevant references, ordered by relevance (most relevant first). ' +
  'Example output: [{"surah":2,"ayah":255},{"surah":112,"ayah":1}]';

/**
 * Runs AI semantic search: sends query to Claude, validates references against quranapi.
 * @param {string} query - Natural language search query
 * @return {Object} { success: boolean, results?: Array, error?: string }
 */
function runAiSearch(query) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return { success: false, error: 'Please enter a search query.' };
  }

  var apiKey = getClaudeApiKey();
  if (!apiKey) {
    return { success: false, error: 'NO_API_KEY' };
  }

  var count = incrementAiSearchCount();
  if (count === -1) {
    return {
      success: false,
      error: 'Daily AI search limit reached (' + AI_SEARCH_DAILY_LIMIT + '). Try again tomorrow.'
    };
  }

  var references;
  try {
    references = _callClaudeForReferences(apiKey, query.trim());
  } catch (e) {
    return { success: false, error: 'AI Search encountered an error. Please try again.' };
  }

  if (!references || !references.length) {
    return { success: false, error: 'No verified results found. Try a different query.' };
  }

  var settings = getSettings();
  var style = settings.arabicStyle || 'uthmani';
  var validated = _validateAndFetchReferences(references, style);

  if (!validated.length) {
    return { success: false, error: 'No verified results found. Try a different query.' };
  }

  return { success: true, results: validated };
}

/**
 * Calls Claude API and parses the JSON response into {surah, ayah} references.
 * @param {string} apiKey - Claude API key
 * @param {string} query - User's natural language query
 * @return {Array<{surah: number, ayah: number}>}
 */
function _callClaudeForReferences(apiKey, query) {
  var payload = {
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    temperature: 0,
    system: CLAUDE_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: query }
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

  return _parseReferencesFromText(text);
}

/**
 * Extracts a JSON array of {surah, ayah} from Claude's text response.
 * Handles markdown code fences and extraneous text around the JSON.
 * @param {string} text - Raw response text from Claude
 * @return {Array<{surah: number, ayah: number}>}
 */
function _parseReferencesFromText(text) {
  if (!text) return [];

  var cleaned = text.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();

  var arr;
  try {
    arr = JSON.parse(cleaned);
  } catch (e) {
    var match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      arr = JSON.parse(match[0]);
    } catch (e2) {
      return [];
    }
  }

  if (!Array.isArray(arr)) return [];

  var refs = [];
  for (var i = 0; i < arr.length && i < AI_MAX_REFERENCES; i++) {
    var item = arr[i];
    var surah = parseInt(item.surah, 10);
    var ayah = parseInt(item.ayah, 10);
    if (surah >= 1 && surah <= 114 && ayah >= 1) {
      refs.push({ surah: surah, ayah: ayah });
    }
  }

  return refs;
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
