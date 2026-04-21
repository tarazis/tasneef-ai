/**
 * SettingsService.gs
 * Manages user preferences via PropertiesService.
 * User settings are persisted to User Properties (per-user, per-script).
 * API keys (Claude) are in Script Properties (shared, developer-owned).
 */

/** Fallback when Script Property ai_search_daily_limit is missing or invalid. */
var AI_SEARCH_DAILY_LIMIT_DEFAULT = 20;

/**
 * User Property (per-user): when true, AI search always returns daily-limit error (for UI testing).
 * Checked before super-user exemption. Remove when no longer needed.
 */
var AI_QUOTA_TEST_FORCE_LIMIT_USER_KEY = 'ai_quota_test_force_limit';

var SETTINGS_DEFAULTS = {
  showTranslation: true,
  /** When true, ayah/range inserts are wrapped in a styled 2×1 table (blockquote look). */
  blockquoteInsertion: true,
  insertArabic: true,
  arabicStyle: 'uthmani'     // "uthmani" | "simple"
};

var PROPERTY_KEYS = {
  SETTINGS_PREFIX: 'setting_',
  CLAUDE_API_KEY: 'claude_api_key',
  AI_SEARCH_COUNT: 'ai_search_count',
  /** Positive integer cap on AI searches per user per UTC day (Script Properties). */
  AI_SEARCH_DAILY_LIMIT: 'ai_search_daily_limit',
  /** Comma-separated emails exempt from AI search daily limit (Script Properties). */
  SUPER_USERS: 'super_users',
  OPENAI_API_KEY: 'openai_api_key',
  PINECONE_HOST: 'pinecone_host',
  PINECONE_API_KEY: 'pinecone_api_key',
  /** Optional; enables Google Fonts CSS API key on preview and icon stylesheet URLs. */
  GOOGLE_FONTS_API_KEY: 'google_fonts_api_key'
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

  settings.aiQuotaTestSimulateLimit = getAiQuotaTestSimulateLimit_();

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
 * Google Fonts Web API key from Script Properties (optional).
 * Used as the `key` query parameter on fonts.googleapis.com CSS requests.
 * @return {string|null}
 */
function getGoogleFontsApiKey_() {
  var v = PropertiesService.getScriptProperties()
    .getProperty(PROPERTY_KEYS.GOOGLE_FONTS_API_KEY);
  if (!v) return null;
  v = String(v).trim();
  return v ? v : null;
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
 * Support / donate link URL from Script Properties (e.g. Buy Me a Coffee).
 * @return {string} URL or empty string if unset
 */
function getSupportUrl() {
  var url = PropertiesService.getScriptProperties().getProperty('support_url');
  return url && String(url).trim() ? String(url).trim() : '';
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
 * Max AI searches per user per UTC day from Script Properties, or default when unset/invalid.
 * @return {number}
 */
function getAiSearchDailyLimit_() {
  var raw = PropertiesService.getScriptProperties()
    .getProperty(PROPERTY_KEYS.AI_SEARCH_DAILY_LIMIT);
  if (!raw) return AI_SEARCH_DAILY_LIMIT_DEFAULT;
  var n = parseInt(String(raw).trim(), 10);
  if (!isFinite(n) || n < 1) return AI_SEARCH_DAILY_LIMIT_DEFAULT;
  return n;
}

/**
 * @return {boolean}
 */
function getAiQuotaTestSimulateLimit_() {
  return PropertiesService.getUserProperties().getProperty(AI_QUOTA_TEST_FORCE_LIMIT_USER_KEY) === 'true';
}

/**
 * Persist dev-only flag: simulate AI daily limit reached (super users included).
 * @param {boolean} enabled
 */
function setAiQuotaTestSimulateLimit(enabled) {
  PropertiesService.getUserProperties().setProperty(
    AI_QUOTA_TEST_FORCE_LIMIT_USER_KEY,
    enabled ? 'true' : 'false'
  );
}

/**
 * Increments today's AI search count and persists it.
 * Super users (Script Property super_users; legacy dev_emails fallback) do not consume quota.
 * @return {number} The new count, or -1 if the daily limit has been reached.
 */
function incrementAiSearchCount_() {
  if (getAiQuotaTestSimulateLimit_()) return -1;

  if (isAiSearchSuperUserExempt_()) return 0;

  var current = getAiSearchCount_();
  var cap = getAiSearchDailyLimit_();

  if (current >= cap) return -1;

  var newCount = current + 1;
  PropertiesService.getUserProperties().setProperty(
    PROPERTY_KEYS.AI_SEARCH_COUNT,
    JSON.stringify({ count: newCount, date: _todayUtcString() })
  );

  return newCount;
}

/**
 * True if the current user's email appears in super_users (comma-separated, trimmed).
 * Falls back to legacy Script Property dev_emails if super_users is unset.
 * Uses Session.getActiveUser().getEmail() first; if blank (e.g. Run from the script editor),
 * falls back to Session.getEffectiveUser().getEmail().
 * @return {boolean}
 */
function isAiSearchSuperUserExempt_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(PROPERTY_KEYS.SUPER_USERS);
  if (!raw) raw = props.getProperty('dev_emails');
  if (!raw) return false;
  try {
    var email = Session.getActiveUser().getEmail();
    email = email ? String(email).trim() : '';
    if (!email) {
      email = Session.getEffectiveUser().getEmail();
      email = email ? String(email).trim() : '';
    }
    return superUserEmailListIncludes_(email, raw);
  } catch (e) {
    return false;
  }
}

/**
 * @param {string} userEmail
 * @param {string} rawCsv - Comma-separated list from Script Properties
 * @return {boolean}
 */
function superUserEmailListIncludes_(userEmail, rawCsv) {
  if (userEmail == null || rawCsv == null) return false;
  var normalized = String(userEmail).trim().toLowerCase();
  if (!normalized) return false;
  var parts = String(rawCsv).split(',');
  for (var i = 0; i < parts.length; i++) {
    var e = String(parts[i]).trim().toLowerCase();
    if (e && e === normalized) return true;
  }
  return false;
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

