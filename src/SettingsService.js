/**
 * SettingsService.gs
 * Manages user preferences via PropertiesService.
 * User settings are persisted to User Properties (per-user, per-script).
 * API keys (Claude) are in Script Properties (shared, developer-owned).
 */

/** Fallback when Script Property ai_limit is missing or invalid. */
var AI_LIMIT_DEFAULT = 20;

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
  /** Positive integer cap on AI searches per user per UTC day for default tier (Script Properties). */
  AI_LIMIT: 'ai_limit',
  /** Positive integer cap on AI searches per user per UTC day for pro tier (Script Properties). */
  AI_LIMIT_PRO_USERS: 'ai_limit_pro_users',
  /** Comma-separated emails with unlimited AI usage (Script Properties). */
  USERS_DEV: 'users_dev',
  /** Comma-separated emails on the pro tier — capped by ai_limit_pro_users (Script Properties). */
  USERS_PRO: 'users_pro',
  OPENAI_API_KEY: 'openai_api_key',
  PINECONE_HOST: 'pinecone_host',
  PINECONE_API_KEY: 'pinecone_api_key',
  /** Optional; enables Google Fonts CSS API key on preview and icon stylesheet URLs. */
  GOOGLE_FONTS_API_KEY: 'google_fonts_api_key',
  /** Optional; Tasneef homepage URL for bottom-bar logo link. */
  TASNEEF_URL: 'tasneef_url'
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
 * Optional Tasneef homepage URL from Script Properties.
 * If no protocol is provided, defaults to https://.
 * @return {string} URL or empty string if unset/invalid
 */
function getTasneefUrl() {
  var url = PropertiesService.getScriptProperties()
    .getProperty(PROPERTY_KEYS.TASNEEF_URL);
  if (!url) return '';
  url = String(url).trim();
  if (!url) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  return url;
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
 * Max AI searches per user per UTC day from Script Properties.
 * Pro users (Script Property users_pro) use ai_limit_pro_users.
 * Everyone else uses ai_limit. Returns AI_LIMIT_DEFAULT if the relevant
 * property is unset or invalid.
 * @return {number}
 */
function getAiSearchDailyLimit_() {
  if (isAiSearchProUser_()) {
    var pro = _readPositiveIntScriptProp_(PROPERTY_KEYS.AI_LIMIT_PRO_USERS);
    if (pro !== null) return pro;
  }
  var n = _readPositiveIntScriptProp_(PROPERTY_KEYS.AI_LIMIT);
  return n !== null ? n : AI_LIMIT_DEFAULT;
}

/**
 * Reads a Script Property and parses it as a positive integer.
 * @param {string} propKey
 * @return {number|null} Parsed int ≥ 1, or null when missing/invalid.
 */
function _readPositiveIntScriptProp_(propKey) {
  var raw = PropertiesService.getScriptProperties().getProperty(propKey);
  if (!raw) return null;
  var n = parseInt(String(raw).trim(), 10);
  return (isFinite(n) && n >= 1) ? n : null;
}

/**
 * Whether the current user may start another AI search (does not increment quota).
 * Mirrors logic in incrementAiSearchCount_ without persisting.
 * @return {boolean}
 */
function getAiSearchQuotaAllowsMore() {
  if (isAiSearchDevUser_()) return true;
  var current = getAiSearchCount_();
  return current < getAiSearchDailyLimit_();
}

/**
 * Sidebar startup + AI tab: quota allowance, dev-tier flag (wire field still named
 * `isSuperUser` for compatibility with the sidebar), and whether the resolved daily
 * cap exceeds the product default.
 * @return {{ allowed: boolean, isSuperUser: boolean, dailyLimit: number, dailyLimitIncreased: boolean }}
 */
function getAiSearchQuotaStateForClient() {
  var dailyLimit = getAiSearchDailyLimit_();
  return {
    allowed: getAiSearchQuotaAllowsMore(),
    isSuperUser: isAiSearchDevUser_(),
    dailyLimit: dailyLimit,
    dailyLimitIncreased: dailyLimit > AI_LIMIT_DEFAULT
  };
}

/**
 * Increments today's AI search count and persists it.
 * Dev users (Script Property users_dev) do not consume quota.
 * Pro users (Script Property users_pro) consume quota against ai_limit_pro_users;
 * everyone else against ai_limit.
 * @return {number} The new count, or -1 if the daily limit has been reached.
 */
function incrementAiSearchCount_() {
  if (isAiSearchDevUser_()) return 0;

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
 * True if the current user's email appears in users_dev (comma-separated, trimmed).
 * Dev users have unlimited AI quota.
 * @return {boolean}
 */
function isAiSearchDevUser_() {
  return _aiSearchCurrentUserInList_(PROPERTY_KEYS.USERS_DEV);
}

/**
 * True if the current user's email appears in users_pro (comma-separated, trimmed).
 * Pro users consume quota against ai_limit_pro_users.
 * @return {boolean}
 */
function isAiSearchProUser_() {
  return _aiSearchCurrentUserInList_(PROPERTY_KEYS.USERS_PRO);
}

/**
 * Membership check for the current user's email against a Script Property
 * containing a comma-separated list. Uses Session.getActiveUser().getEmail()
 * first; if blank (e.g. Run from the script editor) falls back to
 * Session.getEffectiveUser().getEmail().
 * @param {string} propKey - Script Property key holding the CSV list.
 * @return {boolean}
 */
function _aiSearchCurrentUserInList_(propKey) {
  var raw = PropertiesService.getScriptProperties().getProperty(propKey);
  if (!raw) return false;
  try {
    var email = Session.getActiveUser().getEmail();
    email = email ? String(email).trim() : '';
    if (!email) {
      email = Session.getEffectiveUser().getEmail();
      email = email ? String(email).trim() : '';
    }
    return userEmailListIncludes_(email, raw);
  } catch (e) {
    return false;
  }
}

/**
 * Pure CSV membership check (case-insensitive, whitespace-trimmed).
 * Empty email or empty CSV → false.
 * @param {string} userEmail
 * @param {string} rawCsv - Comma-separated list from Script Properties
 * @return {boolean}
 */
function userEmailListIncludes_(userEmail, rawCsv) {
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

