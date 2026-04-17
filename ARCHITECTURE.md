# Tasneef AI — Architecture Reference

Reference for current implementation in this repository.

---

## High-Level Architecture

- Runtime is Google Apps Script with HtmlService-rendered sidebar UI.
- Quran Arabic text, metadata, and translations are fetched client-side from GitHub Pages JSON via `makeClientCache`.
- Three-tab sidebar: Direct Insert, Exact Search, AI Search.
- Claude is used for intent classification and RAG reranking only; final Quran/translation content is always resolved from local client caches.
- AI semantic search uses a RAG pipeline: OpenAI embeddings → Pinecone retrieval → Claude rerank → client-side validation.
- Insert actions flow from browser (`google.script.run`) to server services that format and write into the active Google Doc.
- Per-user daily AI search quota (10/day, UTC reset) enforced server-side. Dev emails exempted via Script Property.

---

## Current File Structure

Clasp deploys the **`src/`** directory (`rootDir` in `.clasp.json`). Repository config, docs, and Node tests stay at the repo root.

```
tasneef-ai/
├── ARCHITECTURE.md
├── CLAUDE.md
├── package.json
├── .gitignore
├── .claspignore
├── .clasp.json
│
├── src/                          # Google Apps Script project root (clasp push)
│   ├── appsscript.json
│   ├── Code.js
│   ├── ClaudeAPI.js
│   ├── DocumentService.js
│   ├── FormatService.js
│   ├── NormalizeArabic.js
│   ├── RagEnglishTranslationSource.js
│   ├── RagService.js
│   ├── SettingsService.js
│   │
│   ├── client/
│   │   ├── makeClientCache.html
│   │   └── normalizeArabic.html
│   │
│   ├── sidebar/
│   │   ├── sidebar.html
│   │   ├── sidebar-css.html
│   │   ├── assets/
│   │   │   └── logo.png
│   │   ├── components/
│   │   │   ├── bottom-bar.html
│   │   │   ├── logo-img.html
│   │   │   ├── settings-panel.html
│   │   │   ├── tab-ai-search.html
│   │   │   ├── tab-direct-insert.html
│   │   │   └── tab-exact-search.html
│   │   └── js/
│   │       ├── card-builder.html
│   │       ├── font-variant-utils.html
│   │       ├── pagination.html
│   │       ├── quran-caches.html
│   │       ├── render-helpers.html
│   │       ├── search-utils.html
│   │       ├── settings-panel-js.html
│   │       ├── shared-state.html
│   │       ├── sidebar-js.html
│   │       ├── tab-ai-search-js.html
│   │       ├── tab-direct-insert-js.html
│   │       └── tab-exact-search-js.html
│   │
│   └── tests/                    # Apps Script tests (*.test.gs); pushed to the editor
│       ├── ClaudeAPI.test.gs
│       ├── DocumentService.test.gs
│       ├── FormatService.test.gs
│       ├── NormalizeArabic.test.gs
│       ├── RagService.test.gs
│       └── SettingsService.test.gs
│
└── tests/                        # Node.js tests only (*.test.js); npm test
    ├── buildResultCardHtml.test.js
    ├── fontVariant.test.js
    ├── makeClientCache.test.js
    ├── normalizeArabic.test.js
    └── renderHelpers.test.js
```

---

## Core Server Modules

All live under **`src/`** (the clasp project root).

- `src/Code.js`: Entry points (`onOpen`, `showSidebar`, `include_`).
- `src/ClaudeAPI.js`: AI search orchestration — classification via Claude, RAG routing, fallback logic, response shaping. Enforces daily quota via `SettingsService`.
- `src/RagService.js`: RAG semantic retrieval — query expansion, OpenAI embedding, Pinecone vector search, score filtering/merging, Claude reranking, reference finalization.
- `src/RagEnglishTranslationSource.js`: Server-side translation map source/cache for RAG rerank candidate text. Loaded in parallel with Pinecone queries.
- `src/DocumentService.js`: Insertion orchestration for single/range ayat and post-insert behavior.
- `src/FormatService.js`: Typography and formatting logic for inserted document content. Enforces Amiri font, regular weight.
- `src/SettingsService.js`: User/script property persistence, settings helpers, daily AI quota management, dev exemption checks.
- `src/NormalizeArabic.js`: Server-side normalization (parity testing only — production search runs client-side).

---

## Sidebar Script Include Order

`src/sidebar/sidebar.html` includes scripts in this order:

1. `client/makeClientCache`
2. `client/normalizeArabic`
3. `sidebar/js/quran-caches`
4. `sidebar/js/search-utils`
5. `sidebar/js/shared-state`
6. `sidebar/js/font-variant-utils`
7. `sidebar/js/card-builder`
8. `sidebar/js/pagination`
9. `sidebar/js/render-helpers`
10. `sidebar/js/settings-panel-js`
11. `sidebar/js/tab-direct-insert-js`
12. `sidebar/js/tab-exact-search-js`
13. `sidebar/js/tab-ai-search-js`
14. `sidebar/js/sidebar-js`

This order is required because modules share globals and call previously declared functions at parse/runtime.

---

## Data and Search Flow

### Exact Arabic Search (client-side only)

1. User types Arabic text in Exact Search tab.
2. Query is normalized via `normalizeArabic` (strip tashkeel, normalize alef variants).
3. Normalized query is matched against the `imlaei-simple` search index in browser memory.
4. Matched ayahs are resolved from the `imlaei-script` display cache and rendered as cards.

### AI Semantic Search

1. **Classification:** `performAISearch` sends user query + conversation context to Claude (`claude-haiku-4-5-20251001`, temp 0). Claude returns action JSON:
   - `fetch_ayah` — direct surah:ayah lookup
   - `exact_search` — Arabic corpus search (Claude extracts query, client searches locally)
   - `semantic_search` — RAG pipeline or Claude references
   - `clarify` — ask user for more detail

2. **RAG routing** (`_handleSemanticSearchRouted_`):
   - If `classified.rag_supported === false` → skip RAG, use Claude references directly.
   - Otherwise → try RAG pipeline, fall back to Claude references on error or empty results.

3. **RAG retrieval** (`_handleRagSearch` in `src/RagService.js`):
   - Build query strings from `classified.queries` (max 3), with legacy fallback to `classified.query`.
   - Embed all queries in one OpenAI batch (`text-embedding-3-small`).
   - Query Pinecone in parallel (`topK=20`, optional surah metadata filter).
   - Fetch translation JSON in same `fetchAll` for rerank context.

4. **Merge and score filtering:**
   - Merge Pinecone hits across query expansions by `surah:ayah`, keep highest score per ayah.
   - Sort descending by score.
   - Apply `RAG_SCORE_THRESHOLD = 0.35`. If nothing passes → fall back to Claude references.

5. **Reranking:**
   - Take top candidate pool (`RAG_CANDIDATE_POOL = 20`).
   - If ≥3 candidates and Claude key available → Claude reranks using translation text as context.
   - Reranker output parsed/validated as JSON array of `"surah:ayah"` keys.

6. **Finalization** (`_finalizeRagAyahRefs_`):
   - Keep only keys that exist in Pinecone pool.
   - Deduplicate, validate numeric range (surah 1–114, ayah ≥ 1), apply final cap.
   - Use reranked order first, fill remaining from Pinecone score order.
   - `_mergeConsecutiveReferencesInInputOrder_` groups adjacent ayahs into `{surah, ayahStart, ayahEnd}` ranges.
   - Server returns `{ type: 'references', references: [...] }`.

7. **Client-side validation (hallucination guard):**
   - Sidebar resolves references in `_buildResultsFromReferences` against local caches.
   - Drops any ref where: surah doesn't exist in metadata, ayah exceeds surah count, or Arabic text missing from Quran cache.
   - Only validated references are rendered/inserted.

### Insert Flow

1. User clicks insert on a result card.
2. Client calls server via `google.script.run` with ayah reference and settings payload.
3. `src/DocumentService.js` resolves insert anchor in the active Google Doc.
4. `src/FormatService.js` applies typography (Amiri, regular weight, Arabic numerals).
5. Content is written to the document.

---

## Test Architecture

### Node tests (`npm test`)

- `tests/makeClientCache.test.js` — Cache factory: fetch/parse, lookup, callback flow, error handling.
- `tests/normalizeArabic.test.js` — Client normalization primitives and normalized-to-original index mapping.
- `tests/buildResultCardHtml.test.js` — Card/range rendering and pagination logic (non-DOM harness).
- `tests/fontVariant.test.js` — Google Fonts variant token parsing and preview URL generation.
- `tests/renderHelpers.test.js` — Insert button lifecycle logic (loading/finalization/pending-border flows).

### Apps Script tests (run in Apps Script editor)

These files live in **`src/tests/`** so clasp pushes them with the script project.

- `src/tests/ClaudeAPI.test.gs` — Classification parsing, RAG routing, response handling, integration paths.
- `src/tests/DocumentService.test.gs` — Insert anchor resolution and document/body/table insertion with mocks.
- `src/tests/FormatService.test.gs` — Arabic numeral conversion and insert-format policy assertions.
- `src/tests/NormalizeArabic.test.gs` — Server normalization behavior and edge cases.
- `src/tests/RagService.test.gs` — RAG constants, query expansion/merge/finalization helpers, mocked network paths.
- `src/tests/SettingsService.test.gs` — Settings defaults, persistence, limits, quota, dev exemption, property interactions.

---

## Test Commands

- Run full Node suite: `npm test`
- Run individual Node targets:
  - `npm run test:client`
  - `npm run test:normalize`
  - `npm run test:card`
  - `npm run test:font`
  - `npm run test:render-helpers`
- Run Apps Script tests from editor via runner functions:
  - `runClaudeAPITests`
  - `runDocumentServiceTests`
  - `runFormatServiceTests`
  - `runNormalizeArabicTests`
  - `runRagServiceTests`
  - `runSettingsServiceTests`