# Review — write-and-publish Jekyll overhaul (publish-workflow)

Converts the untracked notebook site into a buildable Jekyll project at the worktree root, deletes the committed Coming Soon page, adds the `_papers` collection with an auto-listing index, and wires a browser write-and-publish loop (Decap CMS at `/admin`, two Vercel OAuth functions at `/api`, GitHub Actions build, `vercel.json`, `PUBLISHING.md`). Reviewed the full `main...publish-workflow` diff plus the recorded FEAT-001/002/003 evidence. Tier-B items (live OAuth 302/handshake, the Actions build) are not locally e2e testable and are not gated here.

**Verdict**: APPROVED

## What was verified

### Layouts/includes reproduce the notebook markup and classes exactly (confirmed)
Diffed the generated Jekyll sources against the original untracked source at `benmanoj.com/`:
- `_includes/pencil-filter.html` is the exact feTurbulence/feDisplacementMap block (baseFrequency 0.08, numOctaves 4, seed 7, scale 3).
- `_includes/hole.html` is `<img class="hole" src="/images/bowl.png" alt="" aria-hidden="true">`.
- `_includes/header.html` emits 3 `.line-row.blank` then a `.line-row` with `<span class="header-name">{{ include.name }}</span>` — matching the original 3-blank + name pattern.
- `_layouts/notebook.html` reproduces the doctype/head, the single `<title>` conditional (`title_tag` → `collection == papers` → `page.title`), `<link rel="stylesheet" href="/style.css">`, `article.notebook-page`, the hole, and `div.writing.pencil` wrapping content.
- `index.html` reproduces the header, the `.toc-title` "Table of Contents" row, one blank, the `nav` with three `.toc-item` entries (Papers/Writing/About, pages 1/2/3), and exactly 15 trailing `.line-row.blank` rows — identical to the original.
- `writing/index.html` and `about/index.html` carry the exact `.body-line` rows verbatim from the source.

Note (LOW, informational): Jekyll injects `{{ content }}` at column 0, so the converted page bodies are not indented 12 spaces inside `.writing.pencil` the way the original hand-written HTML was. This is whitespace-only and does not change rendered markup, classes, or layout. No action needed.

### style.css is additive-only (confirmed)
`git diff --numstat` on `style.css` reports `286 insertions, 0 deletions`. Every pre-existing selector (`.back-link:hover`, the `@media (max-width: 600px)` block, etc.) is untouched; the only change is the appended `.paper-body` block and its whole-rule margin / heading / list / code / link rules. The heading baseline drift under `line-height: var(--line)` is the documented, accepted grid tradeoff — not a defect.

### _papers collection, paper layout, auto-listing index, seed (confirmed)
- `_config.yml`: `collections.papers` with `output: true`, `permalink: /papers/:name/`; defaults scope type `papers` → `layout: paper` (no `title_tag` default, as intended).
- `_layouts/paper.html`: `layout: notebook`, header include with `page.title`, blank, `.toc-item` back-link to `/papers/`, blank, `<div class="paper-body">{{ content }}</div>`.
- `papers/index.html`: `{% assign sorted = site.papers | sort: "date" | reverse %}`, loop emitting `.line-row.toc-item` with title in `.toc-label` and `{{ paper.date | date: "%Y" }}` in `.toc-page`, plus a "No papers yet." empty state.
- `_papers/2024-01-01-example-paper.md`: title quoted, `date: 2024-01-01` unquoted (the sort/`%Y` guarantee), body with paragraph + `##` heading + 2-item list. The year 2024 will render in the listing.

FEAT-002 evidence records a real markup-proxy build (Jekyll 3.9.5 pure-Ruby, serve-only native gems stubbed) that produced `_site`, served all routes with HTTP 200, confirmed the seed auto-lists at year 2024 newest-first, and confirmed root-relative `/style.css`, `/fonts/Crayonia.ttf`, `/images/bowl.png` all resolve. The production Jekyll 4.3 build is owned by CI (Ruby 3.3); not re-run here, per instructions.

### Root-relative assets (confirmed)
All asset references are root-relative (`/style.css`, `/images/bowl.png`, `/fonts/...`), so they resolve from any page depth.

### admin/config.yml is well-formed and complete (confirmed)
`ruby -ryaml` parses it cleanly. `backend.name: github`, `repo: benjaminmanoj/benmanoj`, `branch: main`, `base_url: https://www.benmanoj.com`, `auth_endpoint: api/auth`; no `media_folder`/`public_folder` (intentional); a single `papers` collection → folder `_papers`, `create: true`, `extension: md`, `format: frontmatter`, slug `{{year}}-{{month}}-{{day}}-{{slug}}`, with fields title (string), date (datetime, format/date_format `YYYY-MM-DD`, `time_format: false`), body (markdown). `admin/index.html` loads Decap pinned to a concrete `decap-cms@3.8.3` (not a bare range).

### api/ OAuth endpoints; secret read only via process.env (confirmed)
- `api/auth.js`: reads `process.env.OAUTH_GITHUB_CLIENT_ID` only; 500 "OAuth not configured" (logging the env NAME only) when missing; generates random state; 302-redirects to `github.com/login/oauth/authorize` with `scope=repo` and `redirect_uri=https://www.benmanoj.com/api/callback`. The client secret is never referenced here.
- `api/callback.js`: reads the code (400 "Missing code" when absent); exchanges via `fetch` POST to `github.com/login/oauth/access_token` with `client_secret` read ONLY from `process.env.OAUTH_GITHUB_CLIENT_SECRET`; returns an HTML handshake that posts `authorizing:github` then `authorization:github:success:{...}` (or `...:error:...`) targeting ONLY `https://www.benmanoj.com` — never `*` — and verifies the opener origin before sending. The secret is never logged and never appears in a response body. Balanced-delimiter + literal checks pass; `node --check` was unavailable locally (node not on PATH), consistent with the recorded evidence.

### vercel.json / build.yml (confirmed)
`vercel.json`: `buildCommand: ""`, `outputDirectory: "_site"`, no `functions` key, and a `permanent: true` (308) apex→www redirect on `Host benmanoj.com`. `build.yml`: `on push main` with `paths-ignore: ['_site/**']`, `permissions: contents: write`, concurrency group, `checkout@v4` + `setup-ruby@v1` (ruby 3.3, bundler-cache), `bundle exec jekyll build`, then a commit-loop guard (`git diff --cached --quiet || git commit`) and `git push`.

### PUBLISHING.md (confirmed precise)
Covers what-this-is, the day-to-day loop (`www.benmanoj.com/admin/` → New → Papers → Title/Date/Body → Publish), the one-time OAuth App setup (Homepage + exact callback URL + both env var names + redeploy), exact Vercel settings (root dir, "Other" preset, empty build command, output `_site`), the always-use-www rationale + apex→www redirect, the going-live scope boundary, Writing/About-as-HTML, local preview, the notebook-grid tradeoff, the Crayonia FFP personal-use license note, and the `/api/auth` 404 fallback (fully-qualified `@vercel/node@3.2.0`).

### Hygiene (confirmed)
No `_site/`, `vendor/`, `Gemfile.lock`, `.jekyll-cache`, `.DS_Store`, or `Unknown.png` in the diff. The Coming Soon page (`benmanoj.com/index.html`, `benmanoj.com/README.md`) is removed. `.gitignore` appends the Jekyll/Bundler block while leaving the stock Node template intact; `Gemfile` pins jekyll `~> 4.3` / webrick `~> 1.8`; `package.json` is `type: commonjs`, `engines.node >= 18`.

## Findings

No HIGH or MEDIUM findings.

LOW / informational (no action required):
1. **Content indentation** (confirmed) — `{{ content }}` injects page bodies at column 0 rather than the original 12-space indent inside `.writing.pencil`. Whitespace-only; no rendered difference.
2. **Paper-body heading baseline drift** (confirmed) — headings/wrapped lines may drift a fraction of a rule under the block-level `translateY` approach. Already documented in PUBLISHING.md as the accepted tradeoff.
