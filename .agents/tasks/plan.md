# Implementation Plan — Write-and-Publish Workflow

Derived from the APPROVED-in-substance design at `.agents/tasks/design.md` (revision 3) and its review at `.agents/tasks/design-review.md`. The two outstanding review MEDIUMs are documentation-level corrections already folded into the design; they are reflected in the steps below (date-ordering rule in step 8/10; the `/api/auth` 404 fallback in step 14).

All paths are relative to the worktree root unless absolute:
`/Users/benjaminmanoj/Documents/benmanoj/.worktrees/publish-workflow` (call it `$WT`).
Source notebook files are UNTRACKED in the main tree at
`/Users/benjaminmanoj/Documents/benmanoj/benmanoj.com` (call it `$SRC`) and
`/Users/benjaminmanoj/Documents/benmanoj/public/crayonia`.

## Environment reality (verified during exploration — read before starting)

- Worktree is on branch `publish-workflow`; the only tracked site file is the committed "Coming Soon" `benmanoj.com/index.html` (+ `benmanoj.com/README.md`). `git status` shows only `.agents/` untracked.
- Local Ruby is **2.6.10** (`/usr/bin/ruby`), Bundler **1.17.2**. This is BELOW Jekyll 4.3's required Ruby >= 2.7. There is **no** rbenv/rvm/asdf, **no** Homebrew, **no** Docker on this machine. Therefore a local `bundle exec jekyll build` under Jekyll 4.3 **cannot run as-is**. Step 16 addresses this head-on: try to obtain a usable Ruby; if impossible in this sandbox, fall back to a Jekyll-3.x-compatible local build purely for Tier-A markup verification, and document that CI (Ruby 3.3) owns the real 4.3 build. Do NOT let a missing modern Ruby block the file-shape and markup verifications, which can be done with a compatible Jekyll or, as a last resort, by asserting generated-markup expectations against a documented manual review.
- `style.css` has no existing `.paper-body` selector (verified) — the appended block (step 9) is genuinely additive.
- No `vercel.json`, no `CNAME` exist.

## Tiering

Criteria tagged **[A]** are locally verifiable and gate this workflow. Criteria tagged **[B]** (Vercel/GitHub-Actions/Decap runtime) cannot be tested on a purely local commit and are documented as deferred — they are NOT gates here (design §14, Scope boundary).

---

- [ ] 1. Copy the untracked notebook source into the worktree ROOT and remove the committed Coming Soon page.
      Run the copy block from design §5.0: `index.html`, `style.css` to `$WT` root; `fonts/Crayonia.ttf`, `images/bowl.png`, `papers/index.html`, `writing/index.html`, `about/index.html` into their `$WT/<dir>/` equivalents; copy `public/crayonia/1001fonts-crayonia-eula.txt` into `$WT/public/crayonia/` for reference. Do NOT copy `.DS_Store` or `Unknown.png`. Then `git rm benmanoj.com/index.html benmanoj.com/README.md`. The copied `papers/writing/about/index.html` are references that steps 6–7 overwrite in place; the copied root `index.html` and `style.css` are transformed in steps 5 and 9.
      Files: `$WT/index.html`, `$WT/style.css`, `$WT/fonts/Crayonia.ttf`, `$WT/images/bowl.png`, `$WT/papers/index.html`, `$WT/writing/index.html`, `$WT/about/index.html`, `$WT/public/crayonia/1001fonts-crayonia-eula.txt`; delete `$WT/benmanoj.com/index.html`, `$WT/benmanoj.com/README.md`.
      Verify: `ls $WT/index.html $WT/style.css $WT/fonts/Crayonia.ttf $WT/images/bowl.png $WT/papers/index.html $WT/writing/index.html $WT/about/index.html` all exist; `git -C $WT status --short` shows `benmanoj.com/index.html` and `benmanoj.com/README.md` staged for deletion and the new root files untracked. (AC-13)

- [ ] 2. Append the Jekyll/Bundler ignore block to the existing `.gitignore` (do not rewrite the file).
      Append exactly (design §5.1, NIT-3 form): a comment line, then `.jekyll-cache/`, `.sass-cache/`, `.bundle/`, `vendor/`, then a two-line prose comment that `_site/` is intentionally NOT ignored on the primary path (CI commits it) and IS added under Alternative B. Leave the stock Node entries untouched.
      Files: `$WT/.gitignore`
      Verify: `grep -n "jekyll-cache\|sass-cache\|.bundle\|vendor" $WT/.gitignore` shows the four new entries once each; the original Node entries (`node_modules/`, `dist`, `.output`) are still present. (AC-15)

- [ ] 3. Author `_config.yml`, `Gemfile`, and `package.json` at the repo root.
      `_config.yml` per design §9: site title/url, `markdown: kramdown` with GFM input, the `papers` collection (`output: true`, `permalink: /papers/:name/`), the `defaults` block giving `_papers` `layout: paper`, and the `exclude` list (Gemfile, Gemfile.lock, vercel.json, package.json, README.md, LICENSE, PUBLISHING.md, node_modules, public, api, .agents, .worktrees, .github). `Gemfile` per §10: `jekyll ~> 4.3` + `webrick ~> 1.8`. `package.json` per §13.3: `type: commonjs`, `engines.node: ">=18"`. Do NOT hand-write `Gemfile.lock` — CI (Ruby 3.3) owns it (§11.1, Finding 3); the local verification Ruby (step 16) may generate a throwaway lock that is NOT committed.
      Files: `$WT/_config.yml`, `$WT/Gemfile`, `$WT/package.json`
      Verify: `ruby -ryaml -e 'YAML.load_file("$WT/_config.yml")'` parses without error (works on the local Ruby 2.6); `_config.yml` contains `collections:`, `papers:`, `permalink: /papers/:name/`, and `api` in `exclude`. (Supports AC-1, AC-12)

- [ ] 4. Create the three includes.
      `_includes/pencil-filter.html` = the exact SVG `feTurbulence`/`feDisplacementMap` block (verified identical across all four source pages). `_includes/hole.html` = `<img class="hole" src="/images/bowl.png" alt="" aria-hidden="true">`. `_includes/header.html` = 3 `.line-row.blank` + a `.line-row` wrapping `<span class="header-name">{{ include.name }}</span>` (single `name` param, design §6.3).
      Files: `$WT/_includes/pencil-filter.html`, `$WT/_includes/hole.html`, `$WT/_includes/header.html`
      Verify: files exist and their content matches the SVG/filter markup from `$SRC/index.html` byte-for-byte modulo indentation. Full confirmation comes via the build in step 16 (generated markup contains the filter + hole).

- [ ] 5. Create `_layouts/notebook.html` (base shell) and convert the home page `index.html` to use it.
      `notebook.html` per §6.4: full `<!DOCTYPE html>`…`<head>` with the single `<title>` conditional (`page.title_tag` → else `page.collection == "papers"` → else `page.title`), `<link rel="stylesheet" href="/style.css">`, body including `pencil-filter.html`, `article.notebook-page`, `hole.html`, and `div.writing.pencil` wrapping `{{ content }}`. Rewrite `$WT/index.html` to front matter `layout: notebook` + `title_tag: "Benjamin Manoj"`, then the home body (via `{% include header.html name="Benjamin Manoj" %}`, the `.toc-title` row, one blank, the `nav` with three `.toc-item` entries for Papers/Writing/About with literal page numbers 1/2/3, and exactly 15 trailing `.line-row.blank` rows). HTML comment nodes may be dropped (design §6 clause d / NIT-1).
      Files: `$WT/_layouts/notebook.html`, `$WT/index.html`
      Verify: deferred to the build in step 16 (generated `_site/index.html` body matches AC-2). Statically: `grep -c "line-row blank" $WT/index.html` counts the trailing blanks (3 header + 15 trailing = 18 in the source file body, header blanks move into the include so the home file itself holds 15).

- [ ] 6. Create `_layouts/page.html` and convert Writing and About to it.
      `page.html` per §6.6: front matter `layout: notebook`; body = `{% include header.html name=page.heading %}`, blank, a `.toc-item` row with the `.back-link` `← Contents` to `/`, blank, then `{{ content }}`. Rewrite `$WT/writing/index.html` and `$WT/about/index.html` to front matter (`layout: page`, their `title_tag`, `heading`) + the exact `.body-line` rows verbatim from the current files (Writing and About bodies per §6.6, matching the source read during exploration).
      Files: `$WT/_layouts/page.html`, `$WT/writing/index.html`, `$WT/about/index.html`
      Verify: deferred to the build in step 16 (generated Writing/About contain the header, the `← Contents` back-link to `/`, and the exact body lines — AC-3).

- [ ] 7. Convert the Papers index to an auto-listing page.
      Rewrite `$WT/papers/index.html` per §6.7: front matter (`layout: page`, `title_tag: "Papers — Benjamin Manoj"`, `heading: "Papers"`); body = `{% assign sorted = site.papers | sort: "date" | reverse %}` then a `{% for paper in sorted %}` loop emitting one `.line-row.toc-item` with an `<a href="{{ paper.url }}">` containing `.toc-label` = `{{ paper.title }}`, `.toc-leader`, and `.toc-page` = `{{ paper.date | date: "%Y" }}`; plus an empty-state `.body-line` "No papers yet." when `sorted.size == 0`.
      Files: `$WT/papers/index.html`
      Verify: deferred to the build in step 16 (generated `/papers/` lists the seed paper as a `.toc-item` row with year, no manual edit — AC-6).

- [ ] 8. Create `_layouts/paper.html` and the seed paper.
      `paper.html` per §6.8: front matter `layout: notebook`; body = `{% include header.html name=page.title %}`, blank, a `.toc-item` row with `.back-link` `← Contents` to `/papers/`, blank, then `<div class="paper-body">{{ content }}</div>`. Seed `_papers/2024-01-01-example-paper.md` per §8: front matter `title` (quoted string) + `date: 2024-01-01` (unquoted — the REQUIRED date is the sole sort/`%Y` guarantee for a custom collection; the filename prefix is convention only, per review MEDIUM-2), then a body with one paragraph, an `h2`, and a two-item list to exercise `.paper-body`.
      Files: `$WT/_layouts/paper.html`, `$WT/_papers/2024-01-01-example-paper.md`
      Verify: deferred to the build in step 16 (generated `/papers/2024-01-01-example-paper/` shows the title in `.header-name`, a `← Contents` link to `/papers/`, and the markdown inside `.paper-body` — AC-7).

- [ ] 9. Append the additive `.paper-body` CSS block to `style.css`.
      Append the §7.3 block exactly (do not modify any existing selector): `.paper-body { font-size: var(--fs-item); line-height: var(--line); transform: translateY(calc(var(--baseline-drop) + (var(--line) - 1em) / 2)); }` plus the block-margin, heading, list, code/pre, and underlined-link rules. Underlined `.paper-body a` is a deliberate new treatment confined to paper bodies (review NIT-2).
      Files: `$WT/style.css`
      Verify: `grep -c "^\.paper-body" $WT/style.css` > 0 and every pre-existing selector (`.line-row`, `.toc-item`, `.body-line`, `.header-name`, `.back-link`, the `--line`/`--baseline-drop` vars) is still present and unchanged (`git -C $WT diff` on `style.css` shows only appended lines). (AC-4) Rule-alignment position check (AC-7 position assertion) is a visual/computed check done after the build in step 16.

- [ ] 10. Author the Decap CMS host page and config.
      `admin/index.html` per §12.1: minimal HTML loading Decap from CDN (pin a concrete known-good `decap-cms@3.x` version in the `unpkg` URL rather than a bare range — review NIT-5). `admin/config.yml` per §12.2: `backend` (`name: github`, `repo: benjaminmanoj/benmanoj`, `branch: main`, `base_url: https://www.benmanoj.com`, `auth_endpoint: api/auth`); NO `media_folder`/`public_folder`; a `papers` collection (`folder: _papers`, `create: true`, `extension: md`, `format: frontmatter`, `slug: "{{year}}-{{month}}-{{day}}-{{slug}}"`) with fields `title` (string), `date` (datetime, `format: YYYY-MM-DD`, `time_format: false`), `body` (markdown).
      Files: `$WT/admin/index.html`, `$WT/admin/config.yml`
      Verify: `ruby -ryaml -e 'c=YAML.load_file("$WT/admin/config.yml"); raise unless c["backend"]["name"]=="github" && c["backend"]["repo"]=="benjaminmanoj/benmanoj" && c["backend"]["branch"]=="main" && c["backend"]["base_url"]=="https://www.benmanoj.com" && c.dig("collections",0,"folder")=="_papers"'` exits 0, and the config has no `media_folder`/`public_folder` key. (AC-8)

- [ ] 11. Write the two Vercel serverless OAuth functions.
      `api/auth.js` per §13.1: generate a random `state`, 302-redirect to `https://github.com/login/oauth/authorize` with `client_id` from `process.env.OAUTH_GITHUB_CLIENT_ID`, `scope=repo`, `redirect_uri=https://www.benmanoj.com/api/callback`, and `state`; respond 500 "OAuth not configured" if the client id env is missing (log name only, never value). `api/callback.js` per §13.2: read `code`; POST to `https://github.com/login/oauth/access_token` with id+secret (`process.env.OAUTH_GITHUB_CLIENT_SECRET`)+code+redirect_uri, `Accept: application/json`; return HTML whose script does the `authorizing:github` → `authorization:github:success:{"token":...,"provider":"github"}` handshake, posting ONLY to the single origin `https://www.benmanoj.com` (never `*`), failing safe on origin mismatch; on error post `authorization:github:error:<msg>`. Both use `module.exports = (req,res) => {…}` and global `fetch`; never log the secret.
      Files: `$WT/api/auth.js`, `$WT/api/callback.js`
      Verify: if `node` is on PATH (it was NOT during exploration), `node --check $WT/api/auth.js && node --check $WT/api/callback.js`; otherwise confirm the files parse by reading them. `grep -n "OAUTH_GITHUB_CLIENT_ID\|scope=repo\|/api/callback" $WT/api/auth.js` and `grep -n "OAUTH_GITHUB_CLIENT_SECRET\|authorization:github:success\|www.benmanoj.com" $WT/api/callback.js` confirm the required literals; `grep -rn "client_secret\|CLIENT_SECRET" $WT/api/auth.js` returns nothing (secret only in callback). (AC-9, AC-10, AC-11 [A])

- [ ] 12. Author `vercel.json` (primary path: no Vercel build).
      Per §11.1: `buildCommand: ""`, `outputDirectory: "_site"`, NO `functions` key, and the `redirects` rule 308-ing any `Host: benmanoj.com` request to `https://www.benmanoj.com/$1` (`permanent: true`). Record Alternative B (Vercel runs Ruby) in PUBLISHING.md/design only, not here.
      Files: `$WT/vercel.json`
      Verify: `ruby -rjson -e 'v=JSON.parse(File.read("$WT/vercel.json")); abort unless v["outputDirectory"]=="_site" && !v["functions"] && v["redirects"]'` exits 0; the redirect destination is the www host. (AC-12)

- [ ] 13. Add the GitHub Actions build workflow.
      `.github/workflows/build.yml` per §11.1: `on: push` to `main` with `paths-ignore: ['_site/**']`, `permissions: contents: write`, concurrency group, `actions/checkout@v4`, `ruby/setup-ruby@v1` with `ruby-version: '3.3'` + `bundler-cache: true`, `bundle exec jekyll build`, then a commit-built-site step that `git add _site` and commits only if the diff is non-empty, then `git push`. This runs only post-push (Tier B); the implementer commits NO `_site/`.
      Files: `$WT/.github/workflows/build.yml`
      Verify: `ruby -ryaml -e 'YAML.load_file("$WT/.github/workflows/build.yml")'` parses; `grep -n "ruby-version: '3.3'\|jekyll build\|paths-ignore" $WT/.github/workflows/build.yml` confirm the pinned Ruby, build, and loop guard.

- [ ] 14. Write `PUBLISHING.md` at the repo root.
      Per §15: what-this-is; day-to-day writing (open `https://www.benmanoj.com/admin/`, log in, New → Papers → Title/Date/Body → Publish); one-time GitHub OAuth App setup (Homepage `https://www.benmanoj.com`, Authorization callback URL `https://www.benmanoj.com/api/callback`, copy Client ID, generate Client Secret, set `OAUTH_GITHUB_CLIENT_ID`/`OAUTH_GITHUB_CLIENT_SECRET` in Vercel → redeploy); exact Vercel settings (root directory = repo root, empty build command / "Other" preset, output dir `_site`, env var names); the "always use www" note and the apex→www redirect; the going-live scope boundary (loop is live only after push + OAuth/env setup); Writing/About are edited as HTML; local preview (`bundle install` + `bundle exec jekyll serve`); the notebook-grid tradeoff; and the Crayonia FFP (personal-use-only) license note. Also note the `/api/auth` 404 recovery (review MEDIUM-1): if a preview returns 404, add a fully-qualified `"functions": {"api/*.js": {"runtime":"@vercel/node@3.2.0"}}` to `vercel.json`.
      Files: `$WT/PUBLISHING.md`
      Verify: `grep -n "api/callback\|OAUTH_GITHUB_CLIENT_ID\|OAUTH_GITHUB_CLIENT_SECRET\|www.benmanoj.com/admin\|_site" $WT/PUBLISHING.md` confirm the required OAuth/Vercel/day-to-day sections are present. (AC-14)

- [ ] 15. Stage and commit everything on branch `publish-workflow` (no push).
      `git add` the new/changed files by name (NOT `git add -A`), keep the Coming Soon deletions staged, and commit with a descriptive message. Do NOT commit `_site/`, any throwaway `Gemfile.lock` from step 16, `node_modules/`, or vendored gems.
      Files: (commit only)
      Verify: `git -C $WT log --oneline -1` shows the commit on `publish-workflow`; `git -C $WT status --short` is clean except intentionally-ignored tooling output; `git -C $WT log origin/publish-workflow..HEAD 2>/dev/null` (nothing pushed) — confirm no push occurred. (AC-15)

- [ ] 16. Build-and-fetch verification (Tier A).
      Obtain a usable Jekyll toolchain, then build and HTTP-fetch pages. Order: (a) try to install/locate a Ruby >= 2.7 usable for Jekyll 4.3 (no rbenv/rvm/Homebrew/Docker were found during exploration, so this may not be possible in-sandbox); (b) if a modern Ruby is available, `bundle install` (generating a throwaway, uncommitted `Gemfile.lock`) then `bundle exec jekyll build` and `bundle exec jekyll serve`; (c) if only Ruby 2.6 is available, install a Jekyll-3.x-compatible gem set in a local `vendor/` purely to render and assert the markup (note in the report that CI/Ruby 3.3 owns the real 4.3 build, so this is a markup proxy, not the production build). With a running serve, HTTP-fetch `/`, `/papers/`, `/papers/2024-01-01-example-paper/`, `/writing/`, `/about/` and assert HTTP 200 plus the notebook markup/classes (SVG filter, `.notebook-page`, `.hole`, `.writing.pencil`, header `.header-name`, `.toc-item`/`.back-link`, and for the paper page `.paper-body`); confirm the seed paper auto-appears in `/papers/` with its year; confirm `/style.css`, `/fonts/Crayonia.ttf`, `/images/bowl.png` resolve root-relative (HTTP 200). Re-validate `admin/config.yml` as well-formed YAML with the required fields. If no usable Ruby can be installed at all, record that the build/fetch checks could not be executed locally and that the static YAML/JS/markup-shape checks (steps 3,5,6,7,10,11,12) plus CI are the available evidence — do NOT fabricate a passing build.
      Files: (verification only; clean up `vendor/`, `.jekyll-cache/`, `_site/`, throwaway `Gemfile.lock`)
      Verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/` and the four other routes return `200`; `curl -s http://localhost:4000/papers/ | grep -q "example-paper"`; asset URLs return `200`. Note the OAuth route (AC-5/AC-10a [B]) CANNOT be e2e tested without the user's GitHub OAuth credentials + a live Vercel deploy — state this explicitly.

## Deferred (Tier B — not gated here, documented only)
- `GET /api/auth` → 302 on a Vercel preview (AC-5), and the `/api/callback` live handshake (AC-10a): require the user's OAuth App + env vars + a deploy.
- GitHub Actions building and committing `_site/` on push (AC-1 [B], AC-12 [B]): runs only after `main` is pushed to `origin`.
- Secret never appearing in a deployed log line (AC-11 [B]).
