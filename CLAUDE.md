# Tasneef AI — Google Docs Add-on

## What This Is
A Google Docs sidebar add-on for Islamic scholars to search and insert Quranic ayat into documents. MVP is Quran-only (Hadith is post-MVP).

## Stack
- Google Apps Script (server-side `.js` files — clasp pushes them as `.gs`)
- HTML/CSS/JS via HtmlService (client-side, no npm/bundler)
- Client ↔ server communication via `google.script.run`

## Data Architecture (Critical)

### Quran data — client-only, loaded from GitHub Pages into browser memory
All Quran text, metadata, and translations are fetched **client-side** via `makeClientCache` (browser `fetch()`). The server never loads or caches Quran data.

**Canonical URL constants** live in `sidebar/sidebar-js.html`:
```
UTHMANI:      https://tarazis.github.io/tasneef-data/quran/uthmani.json
SIMPLE:       https://tarazis.github.io/tasneef-data/quran/imlaei-simple.json
SURAH META:   https://tarazis.github.io/tasneef-data/quran/quran-metadata-surah-name.json
TRANSLATION:  https://tarazis.github.io/tasneef-data/quran/en-sahih-international-simple.json
```
Font URLs live in `FontService.js`:
```
FONTS:        https://tarazis.github.io/tasneef-data/fonts.json
```
- INSPECT the actual JSON structure before writing code against it
- Translation JSON is a flat object keyed by `"surah:ayah"` with `{t: "text"}` values

### Arabic normalization — `NormalizeArabic.js` (server) + `client/normalizeArabic.html` (client)
- Both files MUST stay in sync — parity enforced by `tests/normalizeArabic.test.js`
- Strips tashkeel/diacritics, normalizes alef variants (آ أ إ ٱ → ا)
- Server copy exists solely for parity testing; all production search runs client-side

### Claude API — intent classification only
- Model: claude-sonnet-4-20250514, temperature: 0
- Claude classifies user intent and returns JSON actions — NEVER Quranic text
- For Arabic corpus search: Claude extracts the query text, client runs the search locally
- For English/semantic search: Claude returns {surah, ayah} references, client resolves text
- Every reference from Claude MUST be validated against local data before display
- API key stored in User Properties

## Hard Rules
1. **All Quranic Arabic text and English translations come from GitHub Pages JSON. Never from Claude. Never generated.**
3. **Claude is an intent classifier only.** It returns {surah, ayah} pairs or Arabic search queries. We look up/search the real text ourselves client-side.
5. **Arabic search must normalize.** Strip tashkeel/diacritics for comparison. Normalize alef variants.
6. **Font fallback is Amiri.** If selected font fails, use Amiri and show a toast.
7. **Apps Script constraints:** No npm. No import/require. No ES modules. All server-side files are `.js` (clasp pushes them as `.gs`); they share global scope. HTML files served via HtmlService. Max project size ~2MB (code only, data is external).
8. **File extension:** Always use `.js` for server-side scripts. Never create `.gs` files. Clasp handles the conversion on push.

## IMPORTANT:
1. Before starting any new feature, bugfix, hotfix, or refactor — or any substantial/independent change — create and checkout a branch following this naming convention:

   - `feature/<issue-number>-kebab-case-description`
   - `bugfix/<issue-number>-kebab-case-description`
   - `hotfix/<issue-number>-kebab-case-description`
   - `refactor/<issue-number>-kebab-case-description`

   Always confirm the GitHub issue number before creating the branch. If no issue exists, create one first.

   **Exception — Issue #26:** Do not create a branch or PR for this issue. It is a tracking issue only, used to log future bug fixes and features.

   Immediately after creating the branch, open a **draft pull request** with:
   - A title matching the issue title
   - `Closes #<issue-number>` on its own line in the body

   This triggers GitHub Projects automation to move the issue to **In Progress** automatically.

2. You must write unit and integration tests for all code.

3. You must compile the code and pass ALL tests before committing.

4. **After every commit that passes tests, run `clasp push`** to deploy the code to the Apps Script project. **Do not open a PR unless explicitly instructed.**
   Reference the issue number in every commit message:
   - `feat(#42): add Arabic text tokenization`
   - `fix(#17): correct sidebar overflow on mobile`
   - `refactor(#8): simplify hadith search handler`

5. When explicitly instructed to open a PR, convert the existing draft PR to **ready for review.**

### Commit Message Style

**Use imperative mood** for all commit messages, for example:
- `Add expense summary feature`
- `Fix login validation bug`
- `Refactor database queries for performance`
- `Update dependencies to latest versions`
- `Remove deprecated API endpoints`

**Commit Message Guidelines:**
- Start with a capital letter
- Use imperative mood (as if giving a command)
- Keep the subject line under 72 characters
- Provide additional context in the body if needed

## How Claude Should Approach Tasks

1. **Read this file first** before starting any development work
2. **Ask clarifying questions** if requirements are ambiguous
3. **Follow all guidelines** specified in this document
4. **Create complete, production-ready code** - not just examples
7. **Use proper error handling** in all code
8. **Write clean, self-documenting code** with appropriate comments
9. **Create proper git commits** following the imperative mood style
10. **Explain trade-offs** when making architectural decisions

## Additional Notes

- **Prioritize code quality** over speed of delivery
- **Write code that's easy to understand** - future you will thank you
- **Don't repeat yourself** (DRY principle)
- **Keep it simple** (KISS principle)
- **You aren't gonna need it** (YAGNI principle - don't over-engineer)
- **Fail fast** - validate input early and throw clear errors
- **Make it work, make it right, make it fast** - in that order

## Questions?
If Claude is unsure about any requirement or needs clarification, **always ask** before making assumptions.