# Tasneef AI — Architecture Reference

> Optimized for Claude Code. Read before starting any task.

---

## Directory Structure

```
tasneef-ai/
├── Code.js                        Entry point: exposes doGet(), include()
├── ClaudeAPI.js                   Claude API wrapper — intent classification only
├── DocumentService.js             Inserts ayah/range into the active Doc
├── FormatService.js               Typography for inserted text (Quran Arabic: Amiri regular; translation/citation: Figtree)
├── NormalizeArabic.js             Server-side Arabic normalization (parity with client)
├── SettingsService.js             User Properties: showTranslation, blockquoteInsertion, arabicStyle, AI search count, etc.
├── appsscript.json                Apps Script manifest
│
├── client/
│   ├── makeClientCache.html       makeClientCache() factory — fetch-once cache with callbacks
│   └── normalizeArabic.html       normalizeArabic(), _mapNormalizedToOriginal() — client globals
│
├── sidebar/
│   ├── sidebar.html               Root template: HTML shell + ordered script includes
│   ├── sidebar-css.html           All CSS
│   ├── components/
│   │   ├── logo-img.html          Logo <img> snippet
│   │   ├── settings-panel.html    Settings overlay HTML
│   │   ├── tab-ai-search.html     AI Search tab HTML
│   │   ├── tab-direct-insert.html Direct Insert tab HTML
│   │   └── tab-exact-search.html  Exact Search tab HTML
│   └── js/
│       ├── shared-state.html      Global vars: formatState, _settings, _surahList, constants, window.getFormatState
│       ├── quran-caches.html      4 makeClientCache instances + public accessor functions
│       ├── search-utils.html      searchImlaeiClient(), _buildResultsFromReferences(), _buildAyahDataForInsert()
│       ├── card-builder.html      buildCardHtml(), buildRangeData(), isConsecutiveRange(), escapeHtml(), toArabicIndicClient()
│       ├── pagination.html        pagReset(), pagRenderPage(), pagClear(), PAGE_SIZE, refreshAllResultCardPreviews
│       ├── render-helpers.html    renderPreview(), onInsertClick(), makeSkeleton()
│       ├── font-variant-utils.html parseGoogleFontVariantClient(), ensureGoogleFontsPreviewStylesheet(), arabicPreviewFontStyle()
│       ├── settings-panel-js.html initSettings(), refreshSettings(), loadSettingsIntoPanel(), initSettingsPanelHandlers(), onSettingsLoaded()
│       ├── tab-direct-insert-js.html  initDirectInsertTab()
│       ├── tab-exact-search-js.html   initExactSearchTab()
│       ├── tab-ai-search-js.html      _conversationMessages, initAISearchTab(), clearAISearch()
│       └── sidebar-js.html        IIFE: tab nav, setupTextarea, init() bootstrap
│
└── tests/
    ├── makeClientCache.test.js    Node tests for cache factory
    ├── normalizeArabic.test.js    Node tests for normalization + search
    ├── buildResultCardHtml.test.js Node tests for card builder + pagination
    ├── ClaudeAPI.test.gs          Apps Script tests
    ├── FormatService.test.gs      Apps Script tests
    ├── NormalizeArabic.test.gs    Apps Script tests
    └── SettingsService.test.gs    Apps Script tests
```

---

## Include Order in `sidebar/sidebar.html`

The browser evaluates `<script>` tags in DOM order. Each file depends on globals defined by earlier files.

```
client/makeClientCache          — defines makeClientCache()
client/normalizeArabic          — defines normalizeArabic(), _mapNormalizedToOriginal()
sidebar/js/quran-caches         — calls makeClientCache(); defines cache APIs + accessor fns
sidebar/js/search-utils         — calls normalizeArabic, _mapNormalizedToOriginal, cache accessors
sidebar/js/shared-state         — defines formatState, _settings, _surahList, constants, window.getFormatState
sidebar/js/font-variant-utils   — Amiri preview stylesheet + arabicPreviewFontStyle (used by card-builder)
sidebar/js/card-builder         — pure rendering utils; no runtime deps on earlier globals
sidebar/js/pagination           — calls buildCardHtml (card-builder), window.getFormatState (shared-state)
sidebar/js/render-helpers       — calls buildCardHtml, buildRangeData (card-builder); _buildAyahDataForInsert (search-utils)
sidebar/js/settings-panel-js    — reads/writes _settings; onSettingsLoaded refreshes card previews; header New chat → clearAISearch
sidebar/js/tab-direct-insert-js — reads _surahList, MAX_RESULTS; calls cache accessors, renderPreview, onInsertClick; sets window._refreshDirectInsert
sidebar/js/tab-exact-search-js  — calls pagClear/Reset/RenderPage, searchImlaeiClient, onInsertClick
sidebar/js/tab-ai-search-js     — calls all of the above; reads/writes _conversationMessages; calls window.setupTextarea
sidebar/js/sidebar-js           — IIFE: exposes window.setupTextarea; calls init() on DOMContentLoaded
```

**Key ordering constraints:**
- `quran-caches` must follow `makeClientCache` (calls the factory at parse time)
- `shared-state` must precede `font-variant-utils`, `card-builder`, and all tab modules (they read or write `formatState`, `_settings`, `_surahList`)
- `font-variant-utils` must precede `card-builder` (`arabicPreviewFontStyle`, `ensureGoogleFontsPreviewStylesheet`)
- `card-builder` must precede `pagination` and `render-helpers` (both call `buildCardHtml`)
- `search-utils` must precede `render-helpers` (calls `_buildAyahDataForInsert`)
- `sidebar-js` must be last — its IIFE calls `init()` which calls all `init*()` functions

---

## Shared Globals

### State variables (`sidebar/js/shared-state.html`)
| Variable | Type | Initial value | Writers | Readers |
|---|---|---|---|---|
| `formatState` | object | `{fontName:'Amiri', fontVariant:'regular', bold:false}` (fixed for Quran preview; server forces same for inserts) | — | `renderPreview`, `window.getFormatState`, insert payloads |
| `_settings` | object | `{}` | `onSettingsLoaded`, `refreshSettings` | `onInsertClick`, `_buildResultsFromReferences`, `_buildAyahDataForInsert` |
| `_surahList` | array | `[]` | `initDirectInsertTab` (via `ensureSurahMetaCache` callback) | `searchImlaeiClient`, `_buildResultsFromReferences`, `_buildAyahDataForInsert`, `initDirectInsertTab` |
| `MAX_RESULTS` | number | `50` | — | `searchImlaeiClient`, `initDirectInsertTab` |
| `EXACT_DEBOUNCE_MS` | number | `200` | — | `initExactSearchTab` |
| `EXACT_MIN_CHARS` | number | `2` | — | `initExactSearchTab` |
### Window-bridge properties (set by IIFE, read by global scripts)
| Property | Set by | Read by |
|---|---|---|
| `window._activeTab` | `sidebar-js` IIFE (`switchTab`) | (tab visibility helpers) |
| `window._refreshDirectInsert` | `tab-direct-insert-js` (`initDirectInsertTab`) | `pagination` (`refreshAllResultCardPreviews`) |
| `clearAISearch()` | `tab-ai-search-js` (global fn) | `settings-panel-js` (`initSettings` header New chat button) |
| `window.setupTextarea` | `sidebar-js` IIFE | `tab-ai-search-js` (`initAISearchTab`) |
| `window.getFormatState` | `shared-state` | `render-helpers` (`onInsertClick`), `pagination` (`pagRenderPage`) |

### Cache APIs (`sidebar/js/quran-caches.html`)
All four are module-private `_*CacheApi` objects. Public access is only through the wrapper functions:

| Function | Cache | Used by |
|---|---|---|
| `ensureUthmaniCache(onReady, onError)` | **imlaei-script** JSON (see CLAUDE.md naming note; legacy “Uthmani” names) | `initDirectInsertTab`, `switchTab`, `init` |
| `lookupUthmaniAyah(surah, ayah)` | **imlaei-script** JSON (same) | `initDirectInsertTab`, `_buildResultsFromReferences`, `_buildAyahDataForInsert` |
| `ensureTranslationCache(onReady, onError)` | Translation JSON | `switchTab`, `init` |
| `loadTranslationEdition(url, onReady, onError)` | Translation JSON | (settings, future use) |
| `lookupTranslation(surah, ayah)` | Translation JSON | `initDirectInsertTab`, `_buildResultsFromReferences`, `_buildAyahDataForInsert` |
| `ensureImlaeiCache(onReady, onError)` | Imlaei JSON (normalized index) | `switchTab`, `init`, `_buildResultsFromReferences`, `_buildAyahDataForInsert` |
| `ensureSurahMetaCache(onReady, onError)` | Surah metadata JSON | `initDirectInsertTab`, `init` |

---

## Rendering Pipeline

### Preview mode (Direct Insert tab, AI Search consecutive range)
```
User selects surah/ayah  OR  AI returns consecutive references
    │
    ▼
lookupUthmaniAyah() + lookupTranslation()  →  results[] array
    │
    ▼
renderPreview(containerEl, results)          [render-helpers.html]
    │
    ├── results.length === 1  →  buildCardHtml(result, font)
    └── results.length > 1   →  buildRangeData(results) → buildCardHtml(rangeData, font)
                                                            [card-builder.html]
    │
    ▼
Single <div class="result-card"> injected into containerEl
```

### Paginated mode (Exact Search, AI Search non-consecutive)
```
searchImlaeiClient(query)  OR  _buildResultsFromReferences(refs)  →  results[]
    │
    ▼
pagReset(tabId, results)        stores results + resets page counter   [pagination.html]
    │
    ▼
pagRenderPage(tabId, containerEl, emptyEl, emptyMsg)
    │
    ├── slices results[0..PAGE_SIZE]
    ├── calls buildCardHtml(result, window.getFormatState()) for each
    ├── appends cards to containerEl
    └── appends "Show more" button if items remain  →  clicking calls pagRenderPage again
```

---

## Insert Pipeline

```
User clicks .btn-insert-result button
    │
    ▼
onInsertClick(e)                             [render-helpers.html]
    │
    ├── reads data-surah, data-ayah (single) OR data-surah, data-ayah-start, data-ayah-end (range)
    ├── reads window.getFormatState() → fs  (passed to server; Arabic typography enforced in FormatService)
    ├── reads _settings.arabicStyle → 'uthmani' | 'simple' (`'uthmani'` = imlaei-script display; see CLAUDE.md)
    │
    ├── SINGLE:  _buildAyahDataForInsert(surah, ayah, style)
    │               └── google.script.run.insertAyah(ayahData, fs, _settings)
    │
    └── RANGE:   _buildAyahDataForInsert() × N  →  buildRangeData(items)
                    └── google.script.run.insertAyahRange(rangeData, fs, _settings)

Translation checkbox (_settings.showTranslation):
    Stored in User Properties via SettingsService.
    Passed as part of _settings to insertAyah / insertAyahRange.
    DocumentService reads it server-side to decide whether to append translation text.
```

---

## Per-Tab Flow

### Direct Insert
```
User selects Surah (dropdown)
    → ensureSurahMetaCache populates _surahList on first load
    → populateAyahSelect() fills ayah-start dropdown
    → ayah-end disabled until ayah-start chosen

User selects ayah-start / ayah-end
    → autoRenderPreview()
        → lookupUthmaniAyah() + lookupTranslation() for each ayah in range
        → renderPreview()  →  one card (single or range)

Insert click  →  onInsertClick()  →  insertAyah / insertAyahRange
```

### Exact Search
```
User types in search box
    → debounced 200ms → doExactSearch()
        → searchImlaeiClient(query)
            → normalizeArabic(query)
            → scans pre-normalized imlaei index (loaded once at startup)
            → _mapNormalizedToOriginal() maps match position back to offsets in the imlaei-simple verse string (preview Arabic for exact search)
            → returns up to MAX_RESULTS results
        → pagReset() + pagRenderPage()  →  paginated cards

Insert click  →  onInsertClick()
```

### AI Search
```
User types query + Enter / Send
    → _conversationMessages.push({role:'user', content:query})
    → google.script.run.performAISearch(last 3 messages)
        [server: ClaudeAPI classifies intent → returns typed JSON response]
    │
    ├── type:'clarify'     → show clarification message; keep conversation alive
    │
    ├── type:'arabic_search'  → response.query extracted by Claude
    │       → _conversationMessages = []  (chain broken)
    │       → searchImlaeiClient(response.query)  →  paginated results
    │
    ├── type:'references'  → response.references [{surah,ayah}, ...]
    │       → _conversationMessages = []  (chain broken)
    │       → _buildResultsFromReferences()  (validates against local caches)
    │       → isConsecutiveRange()?
    │           yes  →  renderPreview()   (one combined card)
    │           no   →  pagReset() + pagRenderPage()  (paginated)
    │
    └── type:'error'
            NO_API_KEY  →  show "configure API key" banner
            other       →  show error message

Conversation chain: maintained across clarify responses only.
Any non-clarify response resets _conversationMessages = [].
```

---

## State Management

| State | Lives in | Reset by |
|---|---|---|
| `formatState` | `shared-state.html` global | Fixed Amiri/regular for Quran preview (server mirrors for inserts) |
| `_settings` | `shared-state.html` global | `onSettingsLoaded` (page load), `refreshSettings` (settings panel close) |
| `_surahList` | `shared-state.html` global | `initDirectInsertTab` → `ensureSurahMetaCache` callback (once) |
| `window._activeTab` | IIFE (`sidebar-js`) | `switchTab()` on every tab click |
| `window._refreshDirectInsert` | IIFE (`sidebar-js`) initial `null` | Set to `autoRenderPreview` by `initDirectInsertTab` |
| `_conversationMessages` | `tab-ai-search-js.html` global | `clearAISearch()`, any non-clarify AI response |
| Pagination state `_pagState` | `pagination.html` module-private | `pagReset()` (new search), `pagClear()` (tab clear) |
| Direct Insert DOM state | DOM only | User changes surah/ayah selects; tab switch does not clear |
| Exact Search DOM state | DOM only | User clears query or edits search; tab switch does not clear |
| AI Search DOM state | DOM only | `clearAISearch()` — clears input, results, clarify, conversation; invoked by header **New chat** (sparkle) button |

**What triggers AI reset:** The header **New chat** control calls `clearAISearch()` only. Browse and Search tabs are not cleared from the header. Tab switches do **not** clear state — switching back restores previous results for Browse/Search.
