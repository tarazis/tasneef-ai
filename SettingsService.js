/**
 * SettingsService.gs
 * Manages user preferences via PropertiesService.
 * User settings are persisted to User Properties (per-user, per-script).
 * API keys (Claude, Google Fonts) are in Script Properties (shared, developer-owned).
 */

var AI_SEARCH_DAILY_LIMIT = 50;

var SETTINGS_DEFAULTS = {
  showTranslation: true,
  /** When true, ayah/range inserts are wrapped in a styled 1×1 table (blockquote look). */
  blockquoteInsertion: true,
  insertArabic: true,
  arabicStyle: 'uthmani',     // "uthmani" | "simple"
  fontName: 'Amiri',
  fontVariant: 'regular',    // Google Fonts API variant token
  fontSize: 18,
  bold: false,
  textColor: '#000000',
  customSwatchColors: []     // max 5 hex strings, persisted as JSON in User Properties
};

var PROPERTY_KEYS = {
  SETTINGS_PREFIX: 'setting_',
  CLAUDE_API_KEY: 'claude_api_key',
  GOOGLE_FONTS_API_KEY: 'google_fonts_api_key',
  AI_SEARCH_COUNT: 'ai_search_count'
};

/**
 * Returns all settings, merging stored values over defaults.
 * Boolean and numeric values are coerced from their stored string form.
 * @return {Object} The current settings object.
 */
function getSettings() {
  var props = PropertiesService.getUserProperties().getProperties();
  var settings = {};

  for (var key in SETTINGS_DEFAULTS) {
    var storedKey = PROPERTY_KEYS.SETTINGS_PREFIX + key;
    if (key === 'customSwatchColors') {
      settings[key] = props.hasOwnProperty(storedKey)
        ? _parseCustomSwatchColorsFromStored_(props[storedKey])
        : [];
      continue;
    }
    if (props.hasOwnProperty(storedKey)) {
      settings[key] = _coerceValue(props[storedKey], SETTINGS_DEFAULTS[key]);
    } else {
      settings[key] = SETTINGS_DEFAULTS[key];
    }
  }

  return settings;
}

/**
 * Saves a single setting to User Properties.
 * @param {string} key   - The setting key (must be a key in SETTINGS_DEFAULTS).
 * @param {*}      value - The value to store.
 * @throws {Error} If key is not a recognised setting.
 */
function saveSetting_(key, value) {
  if (!SETTINGS_DEFAULTS.hasOwnProperty(key)) {
    throw new Error('Unknown setting key: ' + key);
  }
  var storedKey = PROPERTY_KEYS.SETTINGS_PREFIX + key;
  if (key === 'customSwatchColors') {
    var clean = _sanitizeCustomSwatchArray_(Array.isArray(value) ? value : []);
    PropertiesService.getUserProperties().setProperty(storedKey, JSON.stringify(clean));
    return;
  }
  PropertiesService.getUserProperties().setProperty(storedKey, String(value));
}

/**
 * Saves multiple settings at once.
 * @param {Object} settingsObj - An object of key/value pairs to persist.
 * @throws {Error} If any key is not a recognised setting.
 */
function saveSettings(settingsObj) {
  for (var key in settingsObj) {
    saveSetting_(key, settingsObj[key]);
  }
}

/**
 * Returns the shared Claude API key from Script Properties, or null if not set.
 * Set once by the developer in Project Settings → Script Properties.
 * Trailing underscore hides this from google.script.run (prevents client access).
 * @return {string|null}
 */
function getClaudeApiKey_() {
  return PropertiesService.getScriptProperties()
    .getProperty(PROPERTY_KEYS.CLAUDE_API_KEY) || null;
}

/**
 * Returns the Google Fonts Developer API key from Script Properties (shared by all users).
 * Set once by the developer in Project Settings → Script Properties.
 * Trailing underscore hides this from google.script.run (prevents client access).
 * @return {string|null}
 */
function getGoogleFontsApiKey_() {
  return PropertiesService.getScriptProperties()
    .getProperty(PROPERTY_KEYS.GOOGLE_FONTS_API_KEY) || null;
}

/**
 * Public feedback form URL from Script Properties (e.g. Google Form).
 * @return {string} URL or empty string if unset
 */
function getFeedbackFormUrl() {
  var url = PropertiesService.getScriptProperties().getProperty('feedback_form_url');
  return url ? String(url) : '';
}

/**
 * Returns today's AI search count (UTC date).
 * If the stored date is not today, the count is treated as 0.
 * @return {number} The current count for today.
 */
function getAiSearchCount_() {
  var raw = PropertiesService.getUserProperties()
    .getProperty(PROPERTY_KEYS.AI_SEARCH_COUNT);

  if (!raw) return 0;

  try {
    var stored = JSON.parse(raw);
    var todayUtc = _todayUtcString();
    return stored.date === todayUtc ? (stored.count || 0) : 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Increments today's AI search count and persists it.
 * @return {number} The new count, or -1 if the daily limit has been reached.
 */
function incrementAiSearchCount_() {
  var current = getAiSearchCount_();

  if (current >= AI_SEARCH_DAILY_LIMIT) return -1;

  var newCount = current + 1;
  PropertiesService.getUserProperties().setProperty(
    PROPERTY_KEYS.AI_SEARCH_COUNT,
    JSON.stringify({ count: newCount, date: _todayUtcString() })
  );

  return newCount;
}

// ─── Private helpers ─────────────────────────────────────────────────────────

/**
 * Returns today's date as "YYYY-MM-DD" in UTC.
 * @return {string}
 */
function _todayUtcString() {
  var now = new Date();
  var year  = now.getUTCFullYear();
  var month = String(now.getUTCMonth() + 1).padStart(2, '0');
  var day   = String(now.getUTCDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

/**
 * Coerces a string value from User Properties back to the type of its default.
 * @param {string} stored       - The raw stored string.
 * @param {*}      defaultValue - The default value (used to infer type).
 * @return {*} The coerced value.
 */
function _coerceValue(stored, defaultValue) {
  switch (typeof defaultValue) {
    case 'boolean': return stored === 'true';
    case 'number':  return Number(stored);
    default:        return stored;
  }
}

/**
 * @param {*} value
 * @return {string|null} #RRGGBB or null
 */
function normalizeHex6ForSettings_(value) {
  if (value == null) return null;
  var s = String(value).trim();
  if (s.charAt(0) === '#') s = s.slice(1);
  if (s.length === 3) {
    s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return '#' + s.toUpperCase();
}

/**
 * @param {*} value - array-like of hex strings
 * @return {string[]} at most 5 normalized hex strings
 */
function _sanitizeCustomSwatchArray_(value) {
  var out = [];
  if (!value || typeof value.length !== 'number') return out;
  for (var i = 0; i < value.length; i++) {
    var h = normalizeHex6ForSettings_(value[i]);
    if (h) out.push(h);
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * @param {string} raw - JSON array string from User Properties
 * @return {string[]}
 */
function _parseCustomSwatchColorsFromStored_(raw) {
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.length !== 'number') return [];
    return _sanitizeCustomSwatchArray_(parsed);
  } catch (e) {
    return [];
  }
}
