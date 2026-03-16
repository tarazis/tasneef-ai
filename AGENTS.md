# Tasneef AI — Google Docs Add-on

## What This Is
A Google Docs sidebar add-on for Islamic scholars to search and insert Quranic ayat into documents. MVP is Quran-only (Hadith is post-MVP).

## Stack
- Google Apps Script (server-side `.js` files — clasp pushes them as `.gs`)
- HTML/CSS/JS via HtmlService (client-side, no npm/bundler)
- Client ↔ server communication via `google.script.run`

## Project Structure
```
tasneef-ai/
├── appsscript.json
├── Code.js                      # Menu, sidebar launcher, include() helper
├── QuranData.js                 # GitHub Pages: in-memory exact search only
├── QuranAPI.js                  # quranapi.pages.dev: surah list, ayah (Arabic + translation in one call)
├── TranslationAPI.js            # Batch translations (Search/AI multi-result inserts)
├── ClaudeAPI.js                 # Claude API wrapper (semantic search)
├── DocumentService.js           # Insert logic (cursor, new line, insert tag)
├── FormatService.js             # Formatting + Arabic-Indic numeral conversion
├── SettingsService.js           # User Properties (settings, API key, usage counter)
├── FontService.js               # Google Fonts API + exclusion filter
├── sidebar/
│   ├── sidebar.html             # Main shell (template includes via <?!= ?>)
│   ├── sidebar-css.html         # Styles (wrapped in <style>)
│   ├── sidebar-js.html          # Client-side JS
│   └── components/
│       ├── format-bar.html
│       ├── tab-browse.html
│       ├── tab-search.html
│       ├── tab-ai.html
│       └── settings-panel.html
```

## Data Architecture (Critical)

### quranapi.pages.dev — Browse, AI Search (Arabic + translation in one call)
- Docs: https://quranapi.pages.dev/introduction
- Surah list: GET /api/surah.json
- Single ayah: GET /api/{surah}/{ayah}.json → returns arabic1, arabic2, english, surah metadata
- Used by: Browse tab, AI Search (validation + fetch)
- This API has NO text search endpoint — do not attempt to search with it

### GitHub Pages — Exact Search only (in-memory)
```
UTHMANI:     https://tarazis97.github.io/tasneef-data/quran/uthmani.json
SIMPLE:      https://tarazis97.github.io/tasneef-data/quran/imlaei-simple.json
SURAH META:  https://tarazis97.github.io/tasneef-data/quran/quran-metadata-surah-name.json
FONTS:       https://tarazis97.github.io/tasneef-data/fonts.json
```
- Loaded when Search tab needs in-memory exact text search
- INSPECT the actual JSON structure before writing code against it

### TranslationAPI.js — Batch translations
- For Search/AI when inserting multiple results; fetches from quranapi per ayah

### Claude API — semantic search only
- Model: claude-sonnet-4-20250514, temperature: 0
- Claude returns surah/ayah references as JSON — NEVER Quranic text
- Validate references by fetching from quranapi (200 = valid)
- API key stored in User Properties

## Hard Rules
1. **Browse & AI: Arabic + translation from quranapi.pages.dev. Never from Claude. Never generated.**
2. **Exact Search: Arabic from GitHub Pages JSON only.** quranapi has no search.
3. **Claude is a reference finder only.** It returns {surah, ayah} pairs. We look up the real text ourselves.
4. **Exact search is in-memory.** Arabic text from GitHub. Filter/match against it directly.
5. **Arabic search must normalize.** Strip tashkeel/diacritics for comparison. Normalize alef variants.
6. **Font fallback is Amiri.** If selected font fails, use Amiri and show a toast.
7. **Apps Script constraints:** No npm. No import/require. No ES modules. All server-side files are `.js` (clasp pushes them as `.gs`); they share global scope. HTML files served via HtmlService. Max project size ~2MB (code only, data is external).
8. **File extension:** Always use `.js` for server-side scripts. Never create `.gs` files. Clasp handles the conversion on push.


## IMPORTANT:
1. Before you make any change, create and checkout a feature branch according to the naming patterns specified below, then make the changes and commit your changes to the branch you created. 

2. You must write unit and integration tests for all code.

3. You must compile the code and pass ALL tests before committing.

4. Once tests pass, commit your change.

5. **After every commit, run `clasp push`** to deploy the code to the Apps Script project.

## Version Control Guidelines
**ALWAYS** use the following branch naming pattern:
```
feature/kebab-case-description
bugfix/kebab-case-description
hotfix/kebab-case-description
refactor/kebab-case-description
```
**Examples:**
- `feature/adding-expense-summary`
- `bugfix/fix-login-validation`
- `refactor/improve-api-performance`

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
If cursor is unsure about any requirement or needs clarification, **always ask** before making assumptions.