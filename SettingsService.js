/**
 * SettingsService.gs
 * Manages user preferences and Claude API key via PropertiesService.
 * All settings are persisted to User Properties (per-user, per-script).
 */

var AI_SEARCH_DAILY_LIMIT = 10;

var SETTINGS_DEFAULTS = {
  insertMode: 'cursor',       // "cursor" | "newline" | "inserttag"
  showTranslation: true,
  insertArabic: true,
  showReference: true,
  translationEdition: 'sahih', // maps to quranapi edition key
  arabicStyle: 'uthmani',     // "uthmani" | "simple"
  fontName: 'Amiri',
  fontSize: 18,
  bold: false,
  textColor: '#000000'
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
function saveSetting(key, value) {
  if (!SETTINGS_DEFAULTS.hasOwnProperty(key)) {
    throw new Error('Unknown setting key: ' + key);
  }
  PropertiesService.getUserProperties()
    .setProperty(PROPERTY_KEYS.SETTINGS_PREFIX + key, String(value));
}

/**
 * Saves multiple settings at once.
 * @param {Object} settingsObj - An object of key/value pairs to persist.
 * @throws {Error} If any key is not a recognised setting.
 */
function saveSettings(settingsObj) {
  for (var key in settingsObj) {
    saveSetting(key, settingsObj[key]);
  }
}

/**
 * Returns the stored Claude API key, or null if not set.
 * @return {string|null}
 */
function getClaudeApiKey() {
  return PropertiesService.getUserProperties()
    .getProperty(PROPERTY_KEYS.CLAUDE_API_KEY) || null;
}

/**
 * Persists the Claude API key to User Properties.
 * @param {string} key - The API key to store.
 */
function setClaudeApiKey(key) {
  PropertiesService.getUserProperties()
    .setProperty(PROPERTY_KEYS.CLAUDE_API_KEY, key);
}

/**
 * Returns the stored Google Fonts API key, or null if not set.
 * @return {string|null}
 */
function getGoogleFontsApiKey() {
  return PropertiesService.getUserProperties()
    .getProperty(PROPERTY_KEYS.GOOGLE_FONTS_API_KEY) || null;
}

/**
 * Persists the Google Fonts API key to User Properties.
 * @param {string} key - The API key to store.
 */
function setGoogleFontsApiKey(key) {
  PropertiesService.getUserProperties()
    .setProperty(PROPERTY_KEYS.GOOGLE_FONTS_API_KEY, key);
}

/**
 * Returns today's AI search count (UTC date).
 * If the stored date is not today, the count is treated as 0.
 * @return {number} The current count for today.
 */
function getAiSearchCount() {
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
function incrementAiSearchCount() {
  var current = getAiSearchCount();

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
