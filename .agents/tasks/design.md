# Write-and-Publish Workflow — Requirements & Technical Design

Status: **revision 3** (a second design review exists at `.agents/tasks/design-review.json`; verdict `CHANGES_REQUESTED`, 2 HIGH / 4 MEDIUM / 4 NIT). Every finding is addressed below and the responses are recorded in §18. All "the existing file does X" claims in this revision were re-verified against the actual files on disk (including the stock Node `.gitignore`, the absence of any `vercel.json`/`CNAME`, and the local `ruby 2.6.10`).
Scope of this step: design only. No code is written here.

**Execution context (see §5).** The deployable notebook source does **not** live in the worktree, and it is **not tracked by git** at all. It exists only in the *main working tree* at `/Users/benjaminmanoj/Documents/benmanoj/` as untracked files. The worktree at `/Users/benjaminmanoj/Documents/benmanoj/.worktrees/publish-workflow` (branch `publish-workflow`) contains only the committed tree: `benmanoj.com/index.html` (the "Coming Soon" page, committed at `0b4f069`), `benmanoj.com/README.md`, `LICENSE`, `README.md`, `.gitignore`. The implementation step must therefore **copy the untracked notebook source into the worktree before transforming it** (exact paths and commands in §5). The final (separate) step rebases onto `main` and fast-forwards `main` locally; nothing is pushed to `origin`.

### Scope boundary — what this workflow delivers vs. what goes live later (resolves Finding 2 — HIGH)

This is important enough to state up front because it governs how the acceptance criteria are read.

**This workflow delivers a correct local tree.** It copies the notebook source into the worktree, transforms it into the Jekyll + Decap + OAuth structure described below, commits everything on branch `publish-workflow`, and (in the separate final step) fast-forwards local `main` to that commit. **Nothing is pushed to `origin`** (NFR-4).

**The publish loop only becomes live after a later push + one-time setup, which are out of scope here.** The runtime chain — Decap commits a paper to `main` on GitHub → the GitHub Actions `build.yml` fires `on: push` → it rebuilds and commits `_site/` → Vercel auto-deploys the prebuilt output + `api/` functions → GitHub OAuth authenticates the CMS — **cannot execute on a purely local commit**. It requires three things that are explicitly **not** part of this workflow: (1) `main` pushed to `origin` (done by the user later, or a subsequent workflow outside the "no push" constraint), (2) the GitHub OAuth App created with its callback URL, and (3) the `OAUTH_GITHUB_CLIENT_ID` / `OAUTH_GITHUB_CLIENT_SECRET` env vars set in Vercel. Items (2) and (3) are the user's one-time setup (PUBLISHING.md §3); item (1) is a deliberate deferral under NFR-4.

**Consequently the acceptance criteria (§14) are split into two tiers:**
- **Tier A — locally verifiable in this workflow:** file contents/shape, a local `bundle exec jekyll build`, and generated-markup checks. These gate the implementation step.
- **Tier B — post-push / deploy, verifiable only after the loop is live:** anything asserting Vercel/GitHub-Actions/Decap runtime behavior. These are documented as deferred verification, not gates on this workflow.

Each criterion in §14 is tagged **[A]** or **[B]** accordingly.

---

## 1. Summary

Benjamin wants to write and publish papers to his personal site (benmanoj.com) from a browser, without opening an IDE or hand-writing HTML. The site is a pixel-tuned "composition notebook" design whose look must be preserved exactly.

This overhaul does five things:

1. **Relocate** the site from the `benmanoj.com/` subfolder to the **repo root** so Vercel serves it at the domain root. (Vercel currently serves the old committed root `index.html` from commit `0b4f069` — the "coming soon" page. The new work in the main tree's `benmanoj.com/` is untracked and has never deployed, so moving it to root is safe and intended.)
2. **Add a minimal Jekyll build** that reuses `style.css` and reproduces the existing notebook markup/classes **byte-for-byte identically** via layouts and includes — no restyling.
3. **Turn papers into a Jekyll collection** (`_papers/`) of Markdown files, with a paper layout that wraps body content in the notebook page, and an auto-generated Papers index that lists every paper.
4. **Add Decap CMS at `/admin`** (`admin/index.html` + `admin/config.yml`) as the browser writing UI, with a `github` backend committing new Markdown into `_papers/` on `main`.
5. **Add a Vercel serverless GitHub OAuth route** (`api/auth` + `api/callback`) so Decap can authenticate against GitHub without an external OAuth provider.

A confirmed-and-accepted visual tradeoff governs paper body rendering: flowing Markdown prose cannot sit glued to each blue rule the way hand-placed `.line-row`s do. The design sets the Markdown body `line-height` equal to `--line` and phase-aligns the text block to the rule grid as closely as possible, so prose rests on the rules as well as flowing prose reasonably can. This is documented honestly in §7.

### Font license finding (flag to user)

`public/crayonia/1001fonts-crayonia-eula.txt` is the **1001Fonts "Free For Personal Use" (FFP)** license. Verified contents of `public/crayonia/`: the EULA text file, `Crayonia.ttf`, and an unused `Unknown.png` image — **no zip file**. Relevant clauses:

- **§7 Embedding** — explicitly allows embedding the font into a personal-use web app. OK.
- **§5 Conversion** — allows converting to WOFF/SVG/EOT as long as glyphs/names are unchanged. OK (we keep the existing `.ttf` as-is, so this is not even exercised).
- **§2 Personal Use** — "recreational websites and blogs for friends and family" is explicitly permitted.
- **§3 Commercial Use** — **not allowed** without written permission. Covers "websites … for companies" and "anything that will generate direct or indirect income."
- **§4 Modification** — the font file may not be altered.

**Verdict:** For a personal site (no income, personal use) the current embedding of `Crayonia.ttf` via `@font-face` is **within the license**. **Flag to the user:** if benmanoj.com ever becomes commercial (ads, paid offerings, company branding, income of any kind), the Crayonia embedding would require a paid/commercial license from the author, or the font must be swapped. No code change is required now; this is a usage constraint to remember. We note it in `PUBLISHING.md`.

---

## 2. Functional Requirements

**FR-1 Repo-root relocation.** The site's deployable files (home, sub-pages, assets, build) live at the repo root so Vercel serves them at the domain root. The old committed root `index.html` ("coming soon") is removed as part of the move.

**FR-2 Root-relative assets preserved.** `/style.css`, `/fonts/Crayonia.ttf`, `/images/bowl.png` remain referenced with leading-slash root-relative paths and resolve from any directory depth (`/`, `/papers/`, `/papers/<slug>/`, `/admin/`).

**FR-3 Identical markup via Jekyll.** Each existing page's generated HTML reproduces the current markup and class structure exactly (same SVG filter, `.notebook-page`, `.hole`, `.writing.pencil`, `.line-row` / `.line-row.blank`, header rows, `.toc-item`, `.body-line`, `.back-link`). `style.css` is used verbatim.

**FR-4 Home page preserved.** The home page keeps its 3 blank header rules + `Benjamin Manoj` name row, the `Table of Contents` title row, the `nav` with three `.toc-item` entries (Papers/Writing/About with label, leader, page number), and the trailing 15 blank ruled rows.

**FR-5 Papers as a collection.** Papers are Markdown files in `_papers/`. Each has front matter `title` (string) and `date` (date), plus a Markdown body. A paper layout renders the body inside the notebook page with a `← Contents` back-link and the paper title in the header.

**FR-6 Auto-listing Papers index.** `/papers/` auto-lists every document in the `_papers` collection as a `.toc-item` row (title linking to the paper's page), sorted newest first, replacing the hand-maintained list. No manual edit of the index is needed when a paper is added. (This intentionally changes the Papers index body from the current hand-written `.body-line` rows; it is exempt from the pixel-identical requirement — see NFR-1.)

**FR-7 Writing & About pages.** Writing and About remain simple pages reproducing their current body lines verbatim. (Papers is the priority; Writing/About are not converted to collections.)

**FR-8 Decap CMS at `/admin`.** A browser UI at `/admin` lets the user create a paper with at least `title`, `date`, and a Markdown `body`. Publishing commits a new `_papers/<slug>.md` to `main` via the GitHub backend, triggering a Vercel rebuild + deploy.

**FR-9 GitHub OAuth via Vercel serverless.** Two serverless endpoints implement the GitHub OAuth handshake Decap expects: `/api/auth` (redirect to GitHub authorize) and `/api/callback` (exchange code for token, post it back to the opener window). Decap's `base_url` points at the site's own domain so it uses these routes.

**FR-10 Build on Vercel.** Vercel builds the site and serves the generated `_site/` output plus the `api/` functions. The Ruby-provisioning approach is decided concretely in §4/§11 (no undecided fallback).

## 3. Non-Functional Requirements

**NFR-1 Pixel fidelity.** Home, Writing, and About must render pixel-identically to the current hand-written pages. **The Papers index is exempt** from pixel-identity: by design (FR-6) its body is replaced with an auto-generated list, so its rows change from `.body-line` to `.toc-item`; it must still use the same notebook shell, header, and back-link and land its rows on the rules. New paper-body prose introduces the documented, pre-accepted rule-alignment tradeoff (§7).

**NFR-2 No restyle.** `style.css` is preserved exactly. New CSS is **additive only** (a small `.paper-body` block appended to the file) and must not alter any existing selector's computed result.

**NFR-3 Secrets.** `OAUTH_GITHUB_CLIENT_ID` and `OAUTH_GITHUB_CLIENT_SECRET` live only in Vercel environment variables, never committed. The client secret is never exposed to the browser (used only server-side in `/api/callback`).

**NFR-4 No push.** Work stays local to the worktree; the final merge step fast-forwards local `main` only.

**NFR-5 Reproducible build.** Ruby gem versions are pinned via `Gemfile` + committed `Gemfile.lock` so Vercel and local builds match.

---

## 4. Technology Stack (locked once approved)

- **Static site generator:** Jekyll 4.3.x (Ruby). Chosen because the task mandates Jekyll, and Jekyll's collections + Liquid includes let us reproduce the exact notebook markup while auto-listing papers. No theme is used (`theme:` is omitted) — we ship our own layouts so markup is fully under our control and `style.css` is reused untouched.
- **Markdown renderer:** kramdown (Jekyll default) with GFM input.
- **Syntax highlighter:** none configured (not needed; papers are prose). Left at Jekyll default.
- **CMS:** Decap CMS 3.x, loaded from CDN (`unpkg`) in `admin/index.html`, `github` backend.
- **OAuth serverless runtime:** Vercel's built-in Node.js serverless runtime (`api/*.js`), selected by zero-config repo-root `api/` detection with the Node major pinned to `>=18` via `engines.node` in `package.json` (§13.3) — **no** `functions.runtime` key. Chosen over edge functions because the token exchange is a standard `fetch`/POST to GitHub and benefits from the simplest possible Node handler; no edge-specific APIs are needed.
- **Host:** Vercel, auto-deploy on push to `main` of `github.com/benjaminmanoj/benmanoj`.

### Decision — how Vercel builds Jekyll (Ruby provisioning is decided, not deferred)

Vercel's standard build image does **not** guarantee a usable Ruby/Bundler toolchain for an arbitrary `buildCommand`, and this is the single most failure-prone step. Rather than leave a fallback "to decide only if needed," we decide the approach now and make it self-contained:

**Chosen approach: build Jekyll in GitHub Actions and let Vercel deploy prebuilt output + functions.** A committed GitHub Actions workflow (`.github/workflows/build.yml`) runs on push to `main`, installs a pinned Ruby via `ruby/setup-ruby`, runs `bundle install && bundle exec jekyll build`, and commits the generated `_site/` to the same `main` branch (or a build artifact branch). Vercel then deploys with **no build step** (`buildCommand` empty / "Other" preset), serving the prebuilt `_site/` as the output directory and picking up `api/*.js` as Node functions.

Why this over "let Vercel run `bundle exec jekyll build`":
- Ruby is first-class and version-pinned in GitHub Actions (`ruby/setup-ruby@v1` with `ruby-version: 3.3`), eliminating the unverified assumption that Vercel's image has Ruby.
- Vercel's role is reduced to static-file serving + functions, which it does reliably regardless of language toolchains.
- The user's existing "push to main → Vercel deploys" model is preserved; the Action is an extra automated step, not a workflow the user operates.

**Tradeoff & honest note:** this commits generated output (`_site/`) into the repo, which is noisier in git history than source-only. The alternative (Vercel runs Ruby) is cleaner in git but rests on an unverified toolchain. Given the review flagged the Ruby assumption as load-bearing with no decided recovery, the deterministic Actions build is the safer locked choice. If, during implementation, it is verified that Vercel's build image provides a working Ruby + Bundler (confirmed by a successful preview deploy running `bundle exec jekyll build`), the simpler `vercel.json` buildCommand path in §11 "Alternative B" may be adopted instead — but the **primary, specified** path is the GitHub Actions prebuild. See §11 for both the primary config and the documented alternative, and §14 AC-1/AC-12 for the acceptance checks that decide it.

### Decision — api/ functions alongside a prebuilt static output

With the prebuilt model, Vercel treats the project as static output = `_site/` **plus** repo-root `api/*.js` as serverless functions. Vercel's **zero-config** function detection picks up any `api/` directory at the repo root as Node functions independent of the static output directory; the functions are deployed as `/api/*` routes, with the Node major pinned via `engines.node` in `package.json` (§13.3). `api/` is kept out of `_site` (it is not part of the static site).

**No `functions.runtime` pin (resolves Finding 1 — HIGH).** The prior revision put `"functions": { "api/*.js": { "runtime": "@vercel/node@3" } }` in `vercel.json`. That is unsafe: the `functions.<glob>.runtime` field expects a fully-qualified community-runtime package version (e.g. `@vercel/node@3.2.0`), and a truncated built-in major like `@vercel/node@3` is a well-known trigger for the deploy error `Function Runtimes must have a valid version` — which would break the function deploy outright. The built-in Node runtime does **not** need (and should not take) that key: zero-config detection of repo-root `api/*.js` plus `engines.node` is the correct, reliable mechanism. So `vercel.json` carries **no** `functions` key (see §11.1). The open question "does zero-config `api/` detection still fire when `outputDirectory` is a custom `_site`" is answered by an actual preview deploy — **AC-5** (`/api/auth` returns 302, not 404) — with a named fallback (explicit `rewrites`, or relocating functions) if the preview 404s. This is Tier B.

---

## 5. Target repo-root file tree & how source reaches the worktree

### 5.0 Getting the source into the worktree (addresses Finding 1 — HIGH)

The notebook source is **untracked** and lives only in the main working tree. Verified on disk:

- Main tree `/Users/benjaminmanoj/Documents/benmanoj/benmanoj.com/` contains: `index.html` (notebook home, *modified-but-uncommitted*; the committed version is "Coming Soon"), `style.css`, `about/index.html`, `papers/index.html`, `writing/index.html`, `fonts/Crayonia.ttf`, `images/bowl.png`, `README.md`, `.DS_Store`. All untracked except `index.html`/`README.md` which are tracked-but-the-notebook-edit-is-uncommitted.
- Main tree `/Users/benjaminmanoj/Documents/benmanoj/public/crayonia/` contains the EULA, `Crayonia.ttf`, `Unknown.png`.
- The worktree `benmanoj.com/` contains only the committed `index.html` (Coming Soon) + `README.md`.

**Chosen mechanism (option (a) from the review): copy the untracked source from the main working tree into the worktree before transforming.** This keeps all transformation/commit work in the worktree as the task requires, without depending on the user committing first. Exact commands the implementation step runs (from the worktree root):

```bash
WT=/Users/benjaminmanoj/Documents/benmanoj/.worktrees/publish-workflow
SRC=/Users/benjaminmanoj/Documents/benmanoj/benmanoj.com

# Bring the notebook source to the worktree ROOT (not the benmanoj.com/ subfolder).
cp "$SRC/index.html"        "$WT/index.html"          # notebook home (will get front matter)
cp "$SRC/style.css"         "$WT/style.css"           # crown-jewel stylesheet
mkdir -p "$WT/fonts" "$WT/images" "$WT/papers" "$WT/writing" "$WT/about"
cp "$SRC/fonts/Crayonia.ttf" "$WT/fonts/Crayonia.ttf"
cp "$SRC/images/bowl.png"    "$WT/images/bowl.png"
cp "$SRC/papers/index.html"  "$WT/papers/index.html"  # reference for transform
cp "$SRC/writing/index.html" "$WT/writing/index.html"
cp "$SRC/about/index.html"   "$WT/about/index.html"

# Font EULA lives under public/crayonia in the main tree; copy for reference only.
mkdir -p "$WT/public/crayonia"
cp /Users/benjaminmanoj/Documents/benmanoj/public/crayonia/1001fonts-crayonia-eula.txt "$WT/public/crayonia/"

# Remove the committed Coming Soon page's subfolder home (now superseded by root).
git -C "$WT" rm -q benmanoj.com/index.html benmanoj.com/README.md
```

Do **not** copy `.DS_Store` or `Unknown.png`. After copying, the implementation transforms the copied HTML into Jekyll layouts/includes (§6), appends the `.paper-body` CSS to the copied `style.css` (§7), and adds the new build/CMS/OAuth files. Everything is then committed on `publish-workflow` in the worktree (NFR-4: no push).

### 5.1 Resulting repo-root tree

After the move + additions, the repo root looks like this. The generated `_site/` is **not** committed by this workflow — on the primary path the GitHub Actions build creates and commits it after the first push to `main` (§11.1, Scope boundary); tooling dirs are git-ignored per the `.gitignore` note below:

```
/ (repo root = what Vercel serves)
├── _config.yml                 # Jekyll site config
├── Gemfile                     # jekyll + webrick, pinned
├── Gemfile.lock                # committed for reproducible builds
├── package.json                # declares Node runtime for api/ functions (CommonJS)
├── vercel.json                 # output dir + functions (no Ruby build step — see §11)
├── .github/
│   └── workflows/
│       └── build.yml           # GitHub Actions: pinned Ruby, jekyll build, commit _site/
├── index.html                  # home page (layout: notebook) — moved from benmanoj.com/index.html
├── style.css                   # crown-jewel stylesheet + appended additive .paper-body block
├── fonts/
│   └── Crayonia.ttf            # moved from benmanoj.com/fonts/
├── images/
│   └── bowl.png                # moved from benmanoj.com/images/
├── _layouts/
│   ├── notebook.html           # base notebook shell (doctype, head, svg filter, page frame)
│   ├── page.html               # sub-page: header name + ← Contents + body region
│   └── paper.html              # single paper: header title + ← Contents + flowing markdown body
├── _includes/
│   ├── pencil-filter.html      # the SVG feTurbulence/feDisplacementMap block
│   ├── hole.html               # the <img class="hole"> punched-hole PNG
│   └── header.html             # 3 blank rules + name/title row (parameterized)
├── _papers/                    # the Papers COLLECTION (Markdown source)
│   └── 2024-01-01-example-paper.md   # seed example paper
├── papers/
│   └── index.html              # auto-listing Papers index (layout: page + Liquid loop)
├── writing/
│   └── index.html              # Writing sub-page (layout: page)
├── about/
│   └── index.html              # About sub-page (layout: page)
├── admin/
│   ├── index.html              # Decap CMS host page (loads CMS from CDN)
│   └── config.yml              # Decap backend + collections config
├── api/
│   ├── auth.js                 # GitHub OAuth step 1: redirect to authorize
│   └── callback.js             # GitHub OAuth step 2: exchange code, post token to opener
│                               # (no _site/ committed by THIS workflow — CI creates it post-push; see §11.1)
├── PUBLISHING.md               # how-to for writing/publishing + one-time OAuth setup
├── LICENSE
└── README.md
```

Notes:
- `public/crayonia/` in the main repo holds the **EULA text file, the `Crayonia.ttf`, and an unused `Unknown.png` image** (no zip). The live font is `fonts/Crayonia.ttf`. `public/` is excluded from the Jekyll build (§9) and is not part of the deployed site.
- **`.gitignore` — exact additions (resolves Finding 7 — NIT).** The existing worktree `.gitignore` is a stock Node template (verified): it ignores `node_modules/`, `dist`, `out`, `.output`, `.env`, etc., but mentions none of the Jekyll/Bundler artifacts. The implementation **appends** exactly this block to the existing file (it does not rewrite it):

  ```gitignore
  # --- Jekyll / Bundler (appended for this project) ---
  .jekyll-cache/
  .sass-cache/
  .bundle/
  vendor/
  # _site/ is produced by the GitHub Actions build and committed by CI post-push
  # (primary path). It is NOT committed by this workflow and NOT ignored here, so
  # that CI can add it. Under Alternative B (Vercel runs Ruby) add `_site/` to
  # this list instead, since nothing should commit it.
  ```

  Clarification reconciling §4/§11/§5.0: **this workflow commits no `_site/`** (per the Scope boundary and Finding 3); on the primary path CI creates and commits `_site/` after the first push, so `_site/` is intentionally **left un-ignored** (not listed above) rather than committed by the implementer. Under Alternative B, `_site/` is add­ed to the ignore block because Vercel builds it on every deploy and nothing commits it. The stock template's `dist`/`out`/`.output` entries are harmless for Jekyll and are left untouched.

### 5.2 Mapping of current files → new locations

| Current (untracked, in main tree `benmanoj.com/`) | New location | Transformation |
|---|---|---|
| `benmanoj.com/index.html` | `/index.html` | front matter `layout: notebook` added; body `.writing` content inlined; filter/hole/head moved into layout+includes |
| `benmanoj.com/style.css` | `/style.css` | **verbatim**, plus additive `.paper-body` rules appended |
| `benmanoj.com/fonts/Crayonia.ttf` | `/fonts/Crayonia.ttf` | moved, unchanged |
| `benmanoj.com/images/bowl.png` | `/images/bowl.png` | moved, unchanged |
| `benmanoj.com/papers/index.html` | `/papers/index.html` | becomes `layout: page` + Liquid auto-list over `site.papers` (body replaced by design) |
| `benmanoj.com/writing/index.html` | `/writing/index.html` | becomes `layout: page`, body lines preserved verbatim |
| `benmanoj.com/about/index.html` | `/about/index.html` | becomes `layout: page`, body lines preserved verbatim |
| committed `benmanoj.com/index.html` (Coming Soon, from `0b4f069`) | **deleted** via `git rm` | replaced by the moved home page at root |

---

## 6. Jekyll layouts & includes — reproducing identical markup

The guiding invariant (NFR-1/NFR-2): the generated HTML's `<body>` for each existing page must be structurally identical to today's hand-written markup — same elements, same classes, same order. The only differences allowed are (a) whitespace/indentation inside tags (irrelevant to rendering), (b) the Papers index body (replaced by the auto-list, per FR-6/NFR-1), and (c) the new `.paper-body` block that only appears on new paper pages.

### 6.1 `_includes/pencil-filter.html`

Exact current SVG block, unchanged:

```html
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <filter id="pencil-texture">
        <feTurbulence type="fractalNoise" baseFrequency="0.08"
                      numOctaves="4" seed="7" result="noise"/>
        <feDisplacementMap in="SourceGraphic" in2="noise"
                           scale="3"
                           xChannelSelector="R" yChannelSelector="G"/>
    </filter>
</svg>
```

### 6.2 `_includes/hole.html`

```html
<img class="hole" src="/images/bowl.png" alt="" aria-hidden="true">
```

### 6.3 `_includes/header.html` (parameterized name/title row)

Reproduces the 3 blank rules + the name row. The visible text is passed via an include parameter so the home page shows `Benjamin Manoj` and sub-pages/papers show their own title.

**Naming clarification (resolves Finding 9 — NIT).** The include always takes exactly **one** parameter, `name`, and renders it inside `<span class="header-name">`. Callers pass: `name="Benjamin Manoj"` (a literal, home page §6.5), `name=page.heading` (static Writing/About pages §6.6), or `name=page.title` (papers §6.8). `heading` is a **page-only front-matter convenience** used only by static pages; it is unrelated to a collection document's `title`. So there are three distinct concepts kept deliberately separate — the include param `name`, the static-page front-matter key `heading`, and the paper/collection key `title` — and they only ever meet at the single `include.name` slot. No code change from the prior revision; this note exists to prevent an implementer conflating them.

```html
<div class="line-row blank"></div>
<div class="line-row blank"></div>
<div class="line-row blank"></div>
<div class="line-row">
    <span class="header-name">{{ include.name }}</span>
</div>
```

### 6.4 `_layouts/notebook.html` (base shell)

Produces the `<!DOCTYPE html>` … `<head>` (with `<title>`) … `<body>` containing the pencil filter, `.notebook-page`, `.hole`, and the opening `.writing.pencil` column. `{{ content }}` is the per-page rows.

**Title decision (resolves Findings 11 & 12).** The `<title>` is composed by a **single conditional in this base layout** (detailed in §6.8): static pages supply a `title_tag` front-matter value; papers are detected by `page.collection == "papers"` and get `"<title> — Benjamin Manoj"`. There is no `_config.yml` `title_tag` default and no layout-to-layout `assign`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% if page.title_tag %}{{ page.title_tag }}{% elsif page.collection == "papers" %}{{ page.title }} — Benjamin Manoj{% else %}{{ page.title }}{% endif %}</title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    {% include pencil-filter.html %}

    <article class="notebook-page">
        {% include hole.html %}

        <div class="writing pencil">
{{ content }}
        </div>
    </article>
</body>
</html>
```

- Home page sets `title_tag: "Benjamin Manoj"` in its own front matter → used directly.
- Writing/About set `title_tag: "Writing — Benjamin Manoj"` / `"About — Benjamin Manoj"` in their front matter → used directly.
- **Papers (collection)**: no `title_tag` is set anywhere. The base-layout conditional detects `page.collection == "papers"` and emits `"{{ page.title }} — Benjamin Manoj"`. This avoids the unreliable child-layout→parent-layout `assign`. Single mechanism, no "or" left to the implementer (see §6.8).

### 6.5 Home page — `/index.html`

Front matter selects the base layout; the body is the current home content verbatim (header via include, the TOC title row, the `nav`, and the 15 trailing blank rows). The home `nav` keeps hard-coded page numbers (1/2/3) exactly as now — these are decorative and not derived.

```html
---
layout: notebook
title_tag: "Benjamin Manoj"
---
{% include header.html name="Benjamin Manoj" %}

<div class="line-row">
    <span class="toc-title">Table of Contents</span>
</div>
<div class="line-row blank"></div>

<nav aria-label="Table of Contents">
    <div class="line-row toc-item">
        <a href="/papers/">
            <span class="toc-label">Papers</span>
            <span class="toc-leader"></span>
            <span class="toc-page">1</span>
        </a>
    </div>
    <div class="line-row toc-item">
        <a href="/writing/">
            <span class="toc-label">Writing</span>
            <span class="toc-leader"></span>
            <span class="toc-page">2</span>
        </a>
    </div>
    <div class="line-row toc-item">
        <a href="/about/">
            <span class="toc-label">About</span>
            <span class="toc-leader"></span>
            <span class="toc-page">3</span>
        </a>
    </div>
</nav>

<div class="line-row blank"></div>
<!-- 14 more identical blank rows (15 total), matching the current home page -->
```

(The implementation emits exactly 15 `<div class="line-row blank"></div>` trailing rows, matching the current file.)

### 6.6 `_layouts/page.html` (sub-pages: Writing, About, Papers index)

Reproduces the sub-page shell: header (title), blank, `← Contents` back-link in a `.toc-item` row, blank, then `{{ content }}` for that page's body rows.

```html
---
layout: notebook
---
{% include header.html name=page.heading %}

<div class="line-row blank"></div>
<div class="line-row toc-item">
    <a class="back-link" href="/">&larr; Contents</a>
</div>
<div class="line-row blank"></div>
{{ content }}
```

**Writing — `/writing/index.html`** (body lines verbatim from the current file):

```html
---
layout: page
title_tag: "Writing — Benjamin Manoj"
heading: "Writing"
---
<div class="line-row"><span class="body-line">A first piece of writing.</span></div>
<div class="line-row"><span class="body-line">A second piece of writing.</span></div>
<div class="line-row"><span class="body-line">A third piece of writing.</span></div>
<div class="line-row blank"></div>
<div class="line-row"><span class="body-line">The lines keep going down the page</span></div>
<div class="line-row"><span class="body-line">as the writing runs on, following</span></div>
<div class="line-row"><span class="body-line">the text all the way to the bottom.</span></div>
```

**About — `/about/index.html`** (body lines verbatim from the current file — resolves Finding 9):

```html
---
layout: page
title_tag: "About — Benjamin Manoj"
heading: "About"
---
<div class="line-row"><span class="body-line">A few words about me.</span></div>
<div class="line-row"><span class="body-line">More to come soon.</span></div>
<div class="line-row blank"></div>
<div class="line-row"><span class="body-line">The ruled lines carry on down the</span></div>
<div class="line-row"><span class="body-line">page, following the writing to the</span></div>
<div class="line-row"><span class="body-line">very bottom, just like the others.</span></div>
```

These yield markup identical to the current Writing/About pages.

### 6.7 Papers index — `/papers/index.html` (auto-listing)

Uses `layout: page` with `heading: "Papers"`. The body replaces the hand-maintained `.body-line` list with a Liquid loop over the `papers` collection, emitting one `.toc-item` row per paper — same structure as the home-page TOC entries but linking to each paper's URL. Sorted newest-first.

```html
---
layout: page
title_tag: "Papers — Benjamin Manoj"
heading: "Papers"
---
{% assign sorted = site.papers | sort: "date" | reverse %}
{% for paper in sorted %}
<div class="line-row toc-item">
    <a href="{{ paper.url }}">
        <span class="toc-label">{{ paper.title }}</span>
        <span class="toc-leader"></span>
        <span class="toc-page">{{ paper.date | date: "%Y" }}</span>
    </a>
</div>
{% endfor %}
{% if sorted.size == 0 %}
<div class="line-row"><span class="body-line">No papers yet.</span></div>
{% endif %}
```

**Decision — index row style.** Each paper reuses the exact `.toc-item` / `.toc-label` / `.toc-leader` / `.toc-page` structure the home TOC uses, so rows land on the rules identically. The `.toc-page` slot shows the paper's **year** (dotted-leader → year) rather than a sequential page number, because sequential numbers aren't meaningful for an auto-generated, reverse-chronological list and the year is useful context. This keeps the notebook aesthetic while being honest about what the marker means.

**Sorting & year-rendering decision (resolves Findings 7).** See §8 for the standardized date representation. Jekyll casts a collection document's `date` front-matter value to a real `Time` when it is a valid date string **or** when the filename is date-prefixed (`YYYY-MM-DD-...`). Both are guaranteed here: (a) Decap writes `date` in `YYYY-MM-DD` form and (b) the filename is always date-prefixed (§8 slug). Therefore `sort: "date"` orders by real dates and `paper.date | date: "%Y"` renders the year. This is verified with the seed paper (AC-6/AC-7). If, during implementation, the string is found not to cast (unexpected), the documented fallback is to add an explicit ISO datetime (`date: 2024-01-01 00:00:00 -0000`) to the Decap `format`/stored value — but the date-prefixed filename alone already guarantees the sort order.

### 6.8 `_layouts/paper.html` (single paper)

Wraps a paper in the notebook shell: shows the paper `title` in the header, then blank + `← Contents` back-link (linking to `/papers/`) + blank, then the flowing Markdown body inside a ruled wrapper. It carries **no** title logic (title is handled once in the base layout — see below):

```html
---
layout: notebook
---
{% include header.html name=page.title %}

<div class="line-row blank"></div>
<div class="line-row toc-item">
    <a class="back-link" href="/papers/">&larr; Contents</a>
</div>
<div class="line-row blank"></div>

<div class="paper-body">
{{ content }}
</div>
```

**Title composition — single chosen mechanism (resolves Findings 11 & 12).** Rather than a `title_tag` front-matter value per page plus a layout-level `assign` (which does not reliably propagate from a child layout up to a parent layout in Jekyll/Liquid), the `<title>` is composed by **one conditional in the base `notebook` layout**. Replace the plain `<title>{{ page.title_tag }}</title>` shown in §6.4 with:

```html
<title>{% if page.title_tag %}{{ page.title_tag }}{% elsif page.collection == "papers" %}{{ page.title }} — Benjamin Manoj{% else %}{{ page.title }}{% endif %}</title>
```

This handles all three cases with no per-paper front matter and no `_config.yml` `title_tag` default:
- Static pages (home, Writing, About) supply `title_tag` in their own front matter → used directly.
- Papers match `page.collection == "papers"` → emit `"{{ page.title }} — Benjamin Manoj"`.
- Any other page falls back to its bare `page.title`.

So §6.4, §6.8, and §9 agree: title composition lives in the base layout's single conditional; the `paper` layout is just header + back-link + `.paper-body`; `_config.yml` defaults set only `layout: paper`.

---

## 7. Paper body on the rule grid — the accepted tradeoff & exact CSS (resolves Finding 2 — HIGH)

### 7.1 How the existing grid actually works (verified against `style.css`)

- `.line-row { display: flex; align-items: flex-end; height: var(--line); overflow: visible; }` — each row is exactly one rule tall and its content aligns to the bottom of the row.
- `.line-row > * { transform: translateY(var(--baseline-drop)); }` — the row's child is nudged **down** by `--baseline-drop` (= `0.22em`) using a **transform**, not `top`. Because the child's own `em` is the child's `font-size` (`.body-line`/`.toc-item`/`.header-name`), the baseline lands on the blue rule at the row's bottom edge.
- The blue rules are a `repeat-y` background on `.notebook-page` with period `--line`, offset to start at `--top-gap` (= `4 * --line`). So rule N sits at `y = --top-gap + N*--line`.
- `--fs-item = --line * 0.8`; `--baseline-drop = 0.22em`.

The previous design wrote `.paper-body { position: relative; top: var(--baseline-drop); }` and claimed it "matches `.line-row` children." That was wrong on two counts: (1) the grid uses `transform: translateY`, not `top`; (2) a single block-level offset shifts the whole flowing block once — it does not reproduce the per-child mechanism. This revision corrects both and states the result honestly.

### 7.2 Decision (pre-accepted tradeoff), stated precisely

Render the Markdown body as normal flowing prose inside a `.paper-body` wrapper whose **`line-height` equals `--line`** so every visual text line advances exactly one rule. Phase-align the block to the rule grid with a **single block-level `transform`** on `.paper-body` — using `translateY` (not `top`) so the mechanism is the *same kind* as `.line-row > *`.

**The half-leading correction (resolves Finding 4 — MEDIUM).** A naive `translateY(var(--baseline-drop))` does **not** reproduce the `.line-row` result, and the prior revision's claim that "the first prose line sits on the same rule a hand-placed `.body-line` would" was geometrically wrong. Here is why, and the fix:

- In a `.line-row`, the child has `line-height: 1` and the row is `align-items: flex-end; height: var(--line)`, so the glyph box sits **flush at the row's bottom** and is then nudged down by `translateY(--baseline-drop)`. The baseline ends up `--baseline-drop` below the row's bottom edge (which is on a rule).
- In `.paper-body`, the text has `line-height: var(--line)` while the font-size is `--fs-item` (= `0.8·--line`). CSS centers the glyphs within each `--line`-tall line box, so there is **half-leading** of `(--line − fontSize)/2 ≈ (--line − 0.8·--line)/2 = 0.1·--line` of empty space above and below the glyphs. Applying only `translateY(--baseline-drop)` therefore leaves the first baseline roughly `0.1·--line` **above** the rule — visibly off.
- **Correction:** add the half-leading back into the transform so the first baseline lands where the flex-end `line-height:1` child lands:

  ```
  transform: translateY(calc(var(--baseline-drop) + (var(--line) - 1em) / 2));
  ```

  where `1em` is the `.paper-body` font-size (`--fs-item`), so `(--line − 1em)/2` is exactly the half-leading. This drops the whole block by `--baseline-drop` **plus** the half-leading, putting the first prose baseline on the same rule a hand-placed `.body-line` uses. Because `.paper-body` sets `font-size: var(--fs-item)`, the `em` basis matches the grid's base-text children, and because each subsequent line advances exactly `--line`, successive baselines track successive rules. A `transform` does not affect surrounding flow layout, so it adds no extra gap — it only shifts the painted text, exactly like the grid's per-child transform. The exact constant should be **tuned once against the seed paper** (the half-leading formula is the starting value); if a developer prefers not to rely on the computed half-leading, the equally acceptable documented alternative is to state honestly that prose rides `~0.1·--line` above the rules (the accepted approximate tradeoff). This revision chooses the **corrected transform** so the first line genuinely coincides.

This remains an **approximation** for everything past the first line of a wrapped/odd block (the accepted tradeoff, §7.4); it is not per-line gluing. Blocks are separated by whole-rule margins so a following block re-enters phase.

### 7.3 Exact CSS (appended to `style.css`, additive only)

```css
/* ---------- Flowing Markdown paper body on the ruled grid ---------- */
/* The body is normal prose, but every line advances exactly one ruled
   line (line-height: var(--line)) and the whole block is phase-aligned to
   the rule grid with the SAME translateY(--baseline-drop) mechanism the
   grid's .line-row children use, so baselines rest on the blue rules as
   closely as flowing text allows. This is a single block-level
   approximation, NOT per-line gluing (the accepted tradeoff). */
.paper-body {
    font-size: var(--fs-item);
    line-height: var(--line);
    /* Same mechanism as `.line-row > *` (transform, not top), same em basis,
       PLUS half-leading compensation: with line-height:var(--line) the glyphs
       are centered in a --line-tall line box, so we add (--line - 1em)/2 to the
       --baseline-drop nudge to land the first baseline ON the rule (not ~0.1*--line
       above it). 1em == --fs-item here. Tune the constant on the seed paper. */
    transform: translateY(calc(var(--baseline-drop) + (var(--line) - 1em) / 2));
}

/* Block elements must not introduce vertical space that is not a whole
   multiple of --line, or the text would fall off the rules. Collapse
   default margins and express spacing in whole rules only. */
.paper-body > *:first-child { margin-top: 0; }
.paper-body p,
.paper-body ul,
.paper-body ol,
.paper-body blockquote,
.paper-body pre,
.paper-body h1,
.paper-body h2,
.paper-body h3,
.paper-body h4 {
    margin: 0 0 var(--line) 0;   /* one blank rule between blocks */
    line-height: var(--line);    /* each wrapped line = one rule */
    font-weight: 400;
}

/* Headings stay on the grid: keep their line box exactly one rule tall by
   using a font-size below --line so a single line box still equals one rule. */
.paper-body h1 { font-size: calc(var(--line) * 0.95); }
.paper-body h2 { font-size: calc(var(--line) * 0.85); }
.paper-body h3 { font-size: var(--fs-item); font-weight: 600; }

/* Lists: indent inside the writing column; each item advances one rule. */
.paper-body ul,
.paper-body ol { padding-left: 1.2em; }
.paper-body li { line-height: var(--line); }

/* Inline code / pre: keep metrics on the grid; avoid tall line boxes. */
.paper-body code { font-family: inherit; }
.paper-body pre  { white-space: pre-wrap; }

/* Links inherit the ink color like the rest of the notebook. */
.paper-body a { color: inherit; text-decoration: underline; }
```

### 7.4 Honest limitations (also stated in `PUBLISHING.md`)

- Base-size paragraphs track the rules well because each line box is exactly `--line` and the block is phase-aligned by a `translateY` that includes the half-leading correction (§7.2), so the **first** baseline genuinely lands on a rule rather than ~`0.1·--line` above it.
- Headings use a font-size below `--line` so their single line box still equals one rule; very large headings are intentionally avoided to stay on the grid.
- Inter-block spacing is always a whole rule, so a following block stays in phase.
- Drift cases: a heading that wraps to two visual lines (its larger glyphs may not center perfectly on both rules), or deeply nested lists; these drift at most a fraction of a rule and self-correct at the next block.
- Because `--baseline-drop` is in `em` and `.paper-body` sets `font-size: var(--fs-item)`, the transform scales with font-size exactly as `.line-row > *` does.

### 7.5 Testability

(1) Build the seed paper and visually confirm prose sits on the rules at a few viewport widths. (2) **Position check (not just the transform value):** at a sample viewport width, measure the first `.paper-body` text baseline's `y` and confirm it coincides (within ~1px) with a background rule `y = --top-gap + N·--line`, and that `line-height` of `.paper-body` equals the computed pixel value of `--line`. Asserting the raw `translateY` string is insufficient (that was the weakness Finding 4 called out); the check must assert actual on-rule position. Pixel-perfect alignment of *every* wrapped line is out of scope by the accepted tradeoff — only the first-line coincidence and per-line advance are asserted.

---

## 8. `_papers` collection shape & front matter (resolves Findings 6 & 7)

A paper is a Markdown file in `_papers/`. Decap controls the filename via a slug pattern; hand-authored files follow the same convention.

**Filename convention:** `_papers/{{year}}-{{month}}-{{day}}-{{slug}}.md` — date-prefixed, which guarantees Jekyll date-casting and chronological ordering regardless of front-matter parsing. URL is controlled by `permalink` (§9).

**Exact written file shape** (pinned so the layout can depend on it). Decap's `papers` collection sets `extension: "md"` and `format: "frontmatter"`, so each file is exactly:

```
---
title: "On Something"
date: 2024-01-01
---
Markdown body goes here. Paragraphs, headings, lists, links, emphasis.
```

- `title` — REQUIRED string; used in the paper header, the computed `<title>`, and the index link text.
- `date` — REQUIRED; **stored as an unquoted `YYYY-MM-DD` value** (Decap datetime widget with `format: "YYYY-MM-DD"`). YAML parses an unquoted `YYYY-MM-DD` as a date; combined with the date-prefixed filename, Jekyll gives the document a real `Time`, so `sort: "date"` and `date: "%Y"` both work (verified via the seed paper, AC-6/AC-7). The stored representation is identical for hand-authored and Decap-written files because both use the same `format`.
- `layout` — not written by the author; defaulted to `paper` in `_config.yml` (§9).
- Body — the Markdown after the front matter; rendered into `.paper-body` (§7). Because the Decap field is literally named `body` **and** `format: "frontmatter"` is set, Decap writes the `body` field as the document body (not as a `body:` front-matter key), producing exactly the shape above.

**Seed file** `_papers/2024-01-01-example-paper.md` is committed so (a) the index has something to list, (b) the build has a real collection document, (c) the layout and date-casting are testable immediately. Its front matter uses the exact shape above; its body contains a short paragraph, an `h2`, and a two-item list to exercise the `.paper-body` CSS.

---

## 9. `_config.yml`

```yaml
# Site
title: "Benjamin Manoj"
url: "https://www.benmanoj.com"

# Build
markdown: kramdown
kramdown:
  input: GFM
  hard_wrap: false

# Collections — papers
collections:
  papers:
    output: true                 # each paper gets its own page/URL
    permalink: /papers/:name/    # /papers/<date-slug>/  (see note)

# Defaults: every paper uses the paper layout. Title composition lives in the
# base notebook layout's conditional (§6.4/§6.8), so NO title_tag default here.
defaults:
  - scope:
      path: ""
      type: papers
    values:
      layout: paper

# Keep source/control files out of the built _site
exclude:
  - Gemfile
  - Gemfile.lock
  - vercel.json
  - package.json
  - README.md
  - LICENSE
  - PUBLISHING.md
  - node_modules
  - public            # EULA + font file + unused image; not part of the deployed site
  - api               # served by Vercel as functions from repo root, NOT via Jekyll
  - .agents
  - .worktrees
  - .github
```

**Notes on exclude/serve mechanics:**
- `api/` is in `exclude` because Jekyll copies top-level non-underscore folders by default, and the functions must **not** be duplicated into `_site` — Vercel reads them from the repo root (§11).
- `admin/` is **not** excluded, so Jekyll copies it verbatim into `_site/admin/` and Decap is served at `/admin/`. It contains no front matter, so Jekyll passes it through unchanged (no `include:` entry needed).
- `public/`, `.github/`, `.agents/`, `.worktrees/`, and the tooling files are excluded so they never reach `_site`.

**Permalink decision.** `permalink: /papers/:name/` publishes `2024-01-01-example-paper.md` at `/papers/2024-01-01-example-paper/`. This keeps URL ↔ filename obvious and avoids title-vs-slug ambiguity; the date-prefixed URL is acceptable for a personal paper archive. Single chosen approach, not left to the implementer.

---

## 10. `Gemfile`

```ruby
source "https://rubygems.org"

gem "jekyll", "~> 4.3"
gem "webrick", "~> 1.8"   # required for `jekyll serve` on Ruby 3.x
```

`Gemfile.lock` is generated by `bundle install` during implementation and **committed** (NFR-5) so the GitHub Actions build and local builds resolve identical versions. No `github-pages` gem — we are not on GitHub Pages; plain Jekyll gives the current version and full control.

---

## 11. Build & deploy config — GitHub Actions + `vercel.json` (resolves Findings 4 & 5)

### 11.1 Primary path (chosen in §4): GitHub Actions prebuilds `_site`, Vercel serves it + functions

**`.github/workflows/build.yml`** — runs on push to `main`, installs a pinned Ruby, builds Jekyll, commits `_site/` back to `main` so Vercel's auto-deploy serves the prebuilt output:

```yaml
name: Build Jekyll site
on:
  push:
    branches: [ main ]
    paths-ignore:
      - '_site/**'          # don't loop on our own build commit
permissions:
  contents: write
concurrency:
  group: jekyll-build
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: '3.3'
          bundler-cache: true
      - name: Build
        run: bundle exec jekyll build
      - name: Commit built site
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add _site
          git diff --cached --quiet || git commit -m "ci: rebuild _site"
          git push
```

Rationale: Ruby is first-class and version-pinned here (eliminating the unverified "does Vercel's image have Ruby" assumption). The `paths-ignore: _site/**` plus the `git diff --cached --quiet` guard prevent an infinite build→commit→build loop. `_site/` is committed to the repo on this path (so it is **not** git-ignored).

**Bootstrap ordering & `Gemfile.lock` platform (resolves Finding 3 — MEDIUM).** Two concrete points the prior revision left ambiguous:

1. **`Gemfile.lock` must match the CI platform, and cannot be generated on this machine as-is.** The only Ruby present locally is `2.6.10` (verified), which is below Jekyll 4.3's `required_ruby_version` (>= 2.7), so `bundle install` cannot even resolve the lock here. The lock is therefore generated **under the same Ruby 3.3 the Action uses** — the simplest reliable path is to let the **first CI run generate and commit it** (the `build.yml` step `bundler-cache: true` will `bundle install` under Ruby 3.3 on `x86_64-linux` and the committed lock will carry the correct platform). To also support a local `bundle exec jekyll serve` on a developer's machine later, the lock should additionally carry the dev platform via `bundle lock --add-platform x86_64-linux arm64-darwin` (run once under Ruby 3.3). The implementer does **not** attempt to produce the lock under the local Ruby 2.6.

2. **The implementer does NOT commit an initial `_site/`; the first CI run creates it.** On the primary path the source tree is committed without `_site/`; when `main` is first pushed (out of scope here, per the Scope boundary), the Action's first run builds `_site/`, `git add _site`, and — because there is no prior `_site/` — the `git diff --cached --quiet` guard sees a non-empty diff and commits once. Every subsequent push rebuilds; if the output is unchanged, `git diff --cached --quiet` is true and **no** commit is made, so re-runs are idempotent and never loop. This removes the "does the implementer or CI create `_site/` first" ambiguity: **CI owns `_site/` entirely.** (Because this entire mechanism only runs post-push, it is Tier B; within this workflow `_site/` is simply absent from the committed tree, and the local Tier-A check is a plain `bundle exec jekyll build` into an ignored/throwaway `_site/` for verification — see §14 AC-1.)

**`vercel.json`** — Vercel does **no** build; it serves the prebuilt `_site/`, deploys `api/*.js` as Node functions via zero-config detection, and canonicalizes the apex to `www` so the OAuth handshake is reliable:

```json
{
  "buildCommand": "",
  "outputDirectory": "_site",
  "redirects": [
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": "benmanoj.com" }],
      "destination": "https://www.benmanoj.com/$1",
      "permanent": true
    }
  ]
}
```

- Empty `buildCommand` → Vercel skips the build step and uses the committed `_site/` as static output. No Ruby needed on Vercel.
- `outputDirectory: _site` serves the prebuilt site.
- **No `functions` key** (resolves Finding 1). Vercel's zero-config detection of repo-root `api/*.js` deploys them as Node functions (`api/auth.js` → `/api/auth`, `api/callback.js` → `/api/callback`); the Node major is pinned by `engines.node` in `package.json` (§13.3). A truncated `runtime: "@vercel/node@3"` would risk the `Function Runtimes must have a valid version` deploy error, so it is deliberately omitted.
- `redirects` canonicalizes the apex (resolves Finding 5): any request whose `Host` is `benmanoj.com` is 308-redirected (`permanent: true`) to the same path on `https://www.benmanoj.com`. This puts the enforcement of the "always on www" invariant **in version control** instead of relying on unverifiable live Vercel domain settings. It makes the apex → www canonicalization a repo artifact the implementation ships, so the OAuth opener is guaranteed to be on `www` before `/admin/` loads.

**Reconciliation of `api/` + custom `outputDirectory` (Finding 5, revised per Finding 1).** With `outputDirectory` pointing at `_site/` (which does **not** contain `api/`, because `_config.yml` excludes it), Vercel's zero-config repo-root `api/` detection is what deploys the functions. This is **not** independently guaranteed by config — it is validated by **AC-5 [B]** (a deployed preview returns `302` from `/api/auth`, not `404`). If the preview returns `404`, the implementation adds an explicit `rewrites` mapping (`{ "source": "/api/:fn", "destination": "/api/:fn" }` is a no-op; the real fallback is to confirm the functions build in the Vercel dashboard or relocate them so detection fires). The point Finding 1 forces: zero-config detection is the mechanism, and the preview is the proof — not a `functions.runtime` string.

### 11.2 Documented Alternative B (only if implementation verifies Vercel has Ruby)

If, during implementation, a Vercel preview deploy is confirmed to run Ruby + Bundler successfully, the simpler single-system path may be adopted instead: drop `.github/workflows/build.yml`, git-ignore `_site/`, and set

```json
{
  "buildCommand": "bundle install && bundle exec jekyll build",
  "outputDirectory": "_site",
  "redirects": [
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": "benmanoj.com" }],
      "destination": "https://www.benmanoj.com/$1",
      "permanent": true
    }
  ]
}
```

This is **not** the primary path (Vercel's Ruby availability is unverified); it is recorded so the implementer has a pre-decided simplification if and only if the toolchain is verified on a preview. Like the primary path it carries **no** `functions.runtime` pin (zero-config `api/` detection + `engines.node`) and keeps the apex → www redirect. Under this path `_site/` is git-ignored (Vercel rebuilds it every deploy) and no CI workflow commits it. The acceptance criteria (AC-1, AC-12) are written to pass under either path.

---

## 12. Decap CMS — `admin/`

### 12.1 `admin/index.html`

Host page that loads Decap from CDN, pinned to a major version:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Content Manager — Benjamin Manoj</title>
</head>
<body>
  <script src="https://unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js"></script>
</body>
</html>
```

### 12.2 `admin/config.yml`

```yaml
backend:
  name: github
  repo: benjaminmanoj/benmanoj
  branch: main
  base_url: https://www.benmanoj.com   # our Vercel-hosted OAuth endpoints live here
  auth_endpoint: api/auth              # -> https://www.benmanoj.com/api/auth

# No media_folder/public_folder (resolves Finding 6): papers are text/Markdown
# only, and image uploads are explicitly out of scope (§16). Declaring a media
# folder would half-wire an untested upload-to-main path. If media is wanted
# later, add media_folder: "images/uploads" + public_folder: "/images/uploads",
# create images/uploads/.gitkeep, and add an acceptance check.

collections:
  - name: "papers"
    label: "Papers"
    folder: "_papers"
    create: true
    extension: "md"                               # pin written file extension
    format: "frontmatter"                         # pin YAML frontmatter + markdown body shape
    slug: "{{year}}-{{month}}-{{day}}-{{slug}}"   # matches §8/§9 filename convention
    fields:
      - { label: "Title", name: "title", widget: "string" }
      - { label: "Date",  name: "date",  widget: "datetime", format: "YYYY-MM-DD", date_format: "YYYY-MM-DD", time_format: false }
      - { label: "Body",  name: "body",  widget: "markdown" }
```

- `backend.name: github`, `repo: benjaminmanoj/benmanoj`, `branch: main` per the brief.
- `extension: "md"` + `format: "frontmatter"` pin the written file to exactly `---\ntitle…\ndate…\n---\n<markdown>` (resolves Finding 6). The field literally named `body` is written as the document body under this format.
- `date` widget `format: "YYYY-MM-DD"` + `time_format: false` → stored as unquoted `YYYY-MM-DD` (matching §8, so sort + `%Y` work; resolves Findings 6/7).
- `slug` mirrors §8/§9 so CMS-created and hand-authored papers are consistent.

### 12.3 base_url & the same-origin handshake requirement (resolves Finding 3 — HIGH)

**Decision on `base_url` value:** `https://www.benmanoj.com` — the **canonical www host**, because the apex `benmanoj.com` is redirected to `www` by the `vercel.json` `redirects` rule (§11.1), and an OAuth popup that follows a redirect mid-handshake is a common breakage.

**Critical same-origin constraint.** Decap's github-backend handshake only succeeds if `/admin/` is opened on the **same origin** that `/api/callback` posts its token to. `/api/callback` posts with a target origin equal to the canonical www host (`https://www.benmanoj.com`, §13). The model is therefore **www-only**, and the repo-level redirect makes that safe (resolves Findings 5 & 8):

- **`/admin/` is served on `https://www.benmanoj.com/admin/`** (the canonical www host). A user who types the apex `https://benmanoj.com/admin/` is **308-redirected to `www` by the `vercel.json` rule before `/admin/` ever loads** (§11.1), so the opener window's origin is always `www`. The redirect is a committed repo artifact, not an unverifiable live-dashboard setting — that is the Finding 5 fix.
- `/api/callback` posts its token to the single canonical origin `https://www.benmanoj.com` (www-only). It does **not** also accept the apex as an opener: with the redirect in place the opener can only be `www`, so a one-entry allowlist is both correct and simplest (resolves Finding 8 — the prior two-host allowlist contradicted the "apex fails" prose; now there is one consistent model). If the callback ever observes an opener origin other than `https://www.benmanoj.com`, it fails safe and posts no token (§13.2).
- This is documented as a note in `PUBLISHING.md` ("open the CMS at `https://www.benmanoj.com/admin/`; typing the apex redirects there automatically"). The invariant is enforced by the redirect, not merely by instruction.

**Acceptance check (AC-10a):** logging in from `https://www.benmanoj.com/admin/` on the canonical host completes the `authorizing:github` → `authorization:github:success` handshake and Decap becomes authenticated.

---

## 13. Vercel serverless OAuth — `api/auth.js` & `api/callback.js`

Decap's `github` backend with a self-hosted `base_url` expects two endpoints implementing the standard GitHub OAuth web flow and the Decap postMessage handshake.

**Environment variables (exact names, set by the user in Vercel — never committed):**
- `OAUTH_GITHUB_CLIENT_ID`
- `OAUTH_GITHUB_CLIENT_SECRET`

These are the names the functions read via `process.env`. The user creates a GitHub OAuth App with **Authorization callback URL** `https://www.benmanoj.com/api/callback` and sets these two env vars in the Vercel project settings (Production scope).

### 13.1 `/api/auth` (step 1 — redirect to GitHub)

Behavior:
1. Generate a random `state` string (CSRF hygiene).
2. 302-redirect the browser to `https://github.com/login/oauth/authorize` with query params: `client_id=OAUTH_GITHUB_CLIENT_ID`, `scope=repo`, `redirect_uri=https://www.benmanoj.com/api/callback`, and `state`.
3. `scope=repo` is chosen (not `public_repo`) so the backend works whether or not the repo is private; it is the safe default for committing paper files.

Error handling:
- Missing `OAUTH_GITHUB_CLIENT_ID` → respond `500` plain text "OAuth not configured" and log the missing-env condition server-side (name only, never the value). Fatal (cannot proceed); the user fixes env vars.

### 13.2 `/api/callback` (step 2 — exchange code, post token to opener)

Behavior:
1. Read `code` (and `state`) from the query string.
2. POST to `https://github.com/login/oauth/access_token` with `client_id`, `client_secret` (from env), `code`, and `redirect_uri`; request JSON (`Accept: application/json`).
3. On success, extract `access_token` and return an HTML page whose inline script performs the Decap handshake: on load it posts `authorizing:github` to `window.opener`; on receiving the opener's acknowledgment it posts the string `authorization:github:success:{"token":"<token>","provider":"github"}`, then closes.
4. **postMessage target origin (www-only; resolves Findings 3 & 8):** the target origin is the single canonical host `https://www.benmanoj.com` — never `"*"`. The function checks the opener's origin (via `event.origin` on the opener's initial `authorizing:github` message) against this one allowed value; if it does not match, no token is posted (login fails safe). Because the `vercel.json` redirect (§11.1) forces any apex visitor to `www` before `/admin/` loads, the opener is always `https://www.benmanoj.com` in the canonical flow, so the one-entry allowlist is correct and avoids the prior two-host contradiction. The token is delivered only to the site's own www window.
5. The access token is only handled server-side during the exchange and then handed to the opener via the origin-pinned postMessage; it is never logged.

Error handling (each failure mode concrete):

| Failure | Recoverable? | Caller receives | Logged? |
|---|---|---|---|
| Missing `code` query param | Fatal for this attempt | `400` "Missing code" HTML | Yes, warning (no secret) |
| Missing env secret/id | Fatal | `500` "OAuth not configured" | Yes, error (names only, not values) |
| GitHub token endpoint non-200 / network error | Fatal for this attempt; user can retry | HTML posting `authorization:github:error:<message>` to opener so Decap shows a failure | Yes, error with GitHub's error code (not the secret) |
| GitHub returns `{error: ...}` body (e.g. bad/expired code) | Fatal for this attempt | `authorization:github:error:<github error>` postMessage | Yes, warning |
| Opener origin ≠ `https://www.benmanoj.com` | Fatal for this attempt | no token posted; generic failure HTML | Yes, warning (origin only) |

**Input validation:**
- `code`: required, non-empty string; on failure → `400`.
- `state`: generated in `/api/auth`; because the functions are stateless (no shared session store), it is **not** strictly verified server-side in `/api/callback`. GitHub's exact `redirect_uri` match + the OAuth App client secret are the primary protections. This is the standard pattern used by the widely used `decap-server`/`netlify-cms` serverless shims; documented as a known simplification. Future hardening: a signed `state` cookie.

**Runtime:** Vercel's built-in Node serverless runtime (selected by zero-config repo-root `api/` detection — **no `functions.runtime` pin**, per Finding 1), `module.exports = (req, res) => {…}` using Node's `req`/`res`. Uses global `fetch` (Node 18+ on Vercel) for the token POST; no third-party dependencies. A minimal repo-root `package.json` declares the CommonJS type + Node engine (this `engines.node` is what pins the Node major, replacing the removed runtime key) to avoid ESM/CJS ambiguity:

```json
{
  "name": "benmanoj-oauth",
  "private": true,
  "type": "commonjs",
  "engines": { "node": ">=18" }
}
```

### 13.3 Invariants & ownership
- **Secret confidentiality** (NFR-3) is owned by the serverless layer: the client secret is read from `process.env` in `/api/callback` only and never sent to the browser or logged. The browser only ever receives the short-lived access token via an origin-pinned same-origin postMessage.
- **Handshake origin match** is owned jointly by (a) the `vercel.json` apex→www redirect (§11.1) which guarantees the opener is on `www`, (b) `admin/config.yml` (`base_url` = canonical www host), and (c) `/api/callback` (single-origin `https://www.benmanoj.com` target check). All three agree on one canonical host; PUBLISHING.md states the invariant.
- **Backend ↔ endpoint contract** is owned by `admin/config.yml` (`base_url` + `auth_endpoint`) plus the two functions; the GitHub OAuth App's callback URL must equal `/api/callback` — stated in PUBLISHING.md.

---

## 14. Acceptance Criteria (testable, numbered)

Each criterion is tagged **[A]** (locally verifiable in this workflow — a gate on the implementation step) or **[B]** (post-push/deploy — verifiable only after the publish loop is live, per the Scope boundary; documented as deferred, not a gate on this workflow). This split resolves Finding 2.

1. **[A] Local build succeeds and produces the pages.** Running `bundle exec jekyll build` locally (under Ruby 3.3; or in the first CI run) produces a `_site/` containing `index.html`, `papers/index.html`, `writing/index.html`, `about/index.html`, `admin/index.html`, and one `papers/<slug>/index.html` per `_papers` document. **[B]** On the primary path, the GitHub Actions job runs the same build on push and commits `_site/`.
2. **[A]** The generated `_site/index.html` `<body>` contains the SVG pencil filter, `article.notebook-page`, `img.hole[src="/images/bowl.png"]`, `div.writing.pencil`, the 3 `.line-row.blank` + `.header-name` "Benjamin Manoj", a `.toc-title` "Table of Contents", a `nav` with three `.toc-item` entries (Papers/Writing/About, each with `.toc-label`/`.toc-leader`/`.toc-page`), and the trailing 15 `.line-row.blank` rows — matching the current hand-written home page.
3. **[A]** The generated Writing and About pages contain the header, a `.toc-item` `← Contents` back-link to `/`, and the exact `.body-line` rows present today (About lines per §6.6).
4. **[A]** Every existing selector and declaration in `style.css` is preserved unchanged (ignoring trailing-whitespace/newline normalization), and the only addition is the appended `.paper-body` block (§7.3); no existing selector's computed result is altered. (Reworded from "byte-identical" per Finding 10 — the intent is additive-only, not a literal byte match that a trailing newline would break.)
5. **[B] Functions deploy.** On a deployed Vercel preview, `GET /api/auth` returns `302` (redirect to GitHub), not `404` — confirming repo-root `api/*.js` deploy as functions via zero-config detection alongside `outputDirectory: _site`, with **no** `functions.runtime` key. If `404`, apply the §11.1 fallback (confirm function build / explicit `rewrites` / relocate) before the loop is considered live.
6. **[A]** Adding a file to `_papers/` and running the local build makes `/papers/` list that paper as a `.toc-item` row (title → paper URL, year in `.toc-page`), sorted newest-first, with **no** manual edit to `papers/index.html`. The seed paper confirms `sort: "date"` orders correctly and `date: "%Y"` renders the year. **[B]** The same occurs when a paper is published via Decap (which commits to `main`, triggering the Action rebuild).
7. **[A]** A built paper page shows the paper title in `.header-name`, a `← Contents` link to `/papers/`, and the Markdown body inside `.paper-body`. **[A] Position assertion (per Finding 4):** at a sample viewport width the first `.paper-body` text baseline coincides (within ~1px) with a background rule `y = --top-gap + N·--line`, and the computed `line-height` of `.paper-body` equals the computed pixel value of `--line`. (Asserting the raw `translateY` string alone is insufficient; the half-leading-corrected transform must actually land the first line on a rule — §7.2/§7.5.)
8. **[A]** `admin/config.yml` declares `backend.name: github`, `repo: benjaminmanoj/benmanoj`, `branch: main`, `base_url: https://www.benmanoj.com`, no `media_folder`/`public_folder`, and a `papers` collection with `extension: md`, `format: frontmatter`, and `title` (string), `date` (datetime, YYYY-MM-DD), `body` (markdown) writing to `_papers`.
9. **[A]** `api/auth.js` source 302-redirects to `github.com/login/oauth/authorize` with `client_id` from `OAUTH_GITHUB_CLIENT_ID`, `redirect_uri=https://www.benmanoj.com/api/callback`, and `scope=repo`. **[B]** Confirmed live on a preview per AC-5.
10. **[A]** `api/callback.js` source exchanges `code` using `OAUTH_GITHUB_CLIENT_ID` + `OAUTH_GITHUB_CLIENT_SECRET` and returns HTML performing the `authorizing:github` → `authorization:github:success:{token,provider}` handshake to the opener, posting only to the single origin `https://www.benmanoj.com` (never `*`); on failure it posts `authorization:github:error:…`.
    - **10a. [B]** Logging in from `https://www.benmanoj.com/admin/` completes the handshake and authenticates Decap. Opening `/admin/` on the apex is 308-redirected to www (by the `vercel.json` rule) before load. Requires the OAuth App + env vars (user one-time setup) and a live deploy.
11. **[A]** The client secret never appears in any committed file or served response body in the source; **[B]** and never in any deployed log line (verified on the live function).
12. **[A]** `vercel.json` sets `outputDirectory: _site`, carries **no** `functions.runtime` key, and includes the apex→www `redirects` rule; on the primary path `buildCommand` is empty and `api/` is excluded from the Jekyll build (`_config.yml`). **[B]** `_site/` is created and committed by the Actions build post-push (not by this workflow). (Under Alternative B, `buildCommand` runs Jekyll on Vercel and `_site/` is git-ignored.)
13. **[A]** The old committed `benmanoj.com/index.html` "coming soon" page (from `0b4f069`) is removed via `git rm`, and the home page is a repo-root `index.html`.
14. **[A]** `PUBLISHING.md` exists and documents the write/publish loop, the one-time OAuth setup, the "open `/admin/` on the canonical www host (apex auto-redirects)" note, and the scope boundary (loop goes live only after push + setup) (§15).
15. **[A]** All work is committed on branch `publish-workflow` in the worktree; nothing is pushed to `origin`; the `.gitignore` carries the appended Jekyll/Bundler block (§5.1) and no `_site/` is committed by this workflow.

---

## 15. PUBLISHING.md outline

The implementation step creates `PUBLISHING.md` with these sections:

1. **What this is** — one-paragraph overview of the browser-based write→publish loop.
2. **Writing a paper (day-to-day)**
   - Go to **`https://www.benmanoj.com/admin/`** (always the www host — the login handshake depends on it).
   - Log in with GitHub (first time authorizes the OAuth app).
   - New → Papers → fill Title, Date, Body (Markdown) → Publish.
   - Decap commits `_papers/<date>-<slug>.md` to `main`; the GitHub Action rebuilds `_site/`; Vercel redeploys; the paper appears at `/papers/` within ~a minute or two.
3. **One-time GitHub OAuth setup (done once by you)**
   - Create a GitHub OAuth App: Homepage `https://www.benmanoj.com`, Authorization callback URL `https://www.benmanoj.com/api/callback`.
   - Copy the Client ID; generate a Client Secret.
   - In Vercel → Settings → Environment Variables, add `OAUTH_GITHUB_CLIENT_ID` and `OAUTH_GITHUB_CLIENT_SECRET` (Production), then redeploy.
4. **Why always use the www host** — short note that `/admin/` is served at `https://www.benmanoj.com/admin/`; the `vercel.json` redirect 308s the apex to www, so typing the apex lands you on www automatically, which is the only origin the OAuth popup handshake targets.
   - **Going-live prerequisite (scope boundary):** the write/publish loop only works after `main` is pushed to `origin` (so the GitHub Action and Vercel see these files) AND the OAuth App + Vercel env vars are set. Until then the tree is correct locally but the loop is not yet live.
5. **Writing/About pages** — still edited as HTML in the repo (not in the CMS); note where they live and that a push triggers the same Action rebuild.
6. **Local preview** — `bundle install` then `bundle exec jekyll serve`, open `http://localhost:4000`.
7. **The notebook-grid tradeoff** — honest note that paper prose uses `line-height: --line` + a `translateY(--baseline-drop)` block nudge to rest on the rules as flowing text; headings/wrapped lines may drift a fraction of a rule (§7).
8. **Font license note** — Crayonia is FFP (personal use only). Fine for this personal site; if it ever becomes commercial, obtain a commercial license or swap the font (§1).
9. **Deploy model** — push to `main` → GitHub Action builds `_site/` and commits it → Vercel auto-deploys the prebuilt `_site/` + `api/` functions.

---

## 16. Out of Scope

- Converting Writing/About into collections (they stay simple HTML pages; papers is the priority).
- Pushing to `origin` or creating the GitHub OAuth App (the user does the latter; the final workflow step only fast-forwards local `main`).
- Any restyling or redesign of the notebook look; `style.css` is preserved (only additive `.paper-body` rules).
- Pixel-perfect per-line baseline gluing of flowing Markdown (replaced by the accepted `line-height: --line` + block-level `translateY` tradeoff).
- Media/image uploads via the CMS (papers are text/Markdown; `media_folder`/`public_folder` are deliberately **not** configured — resolves Finding 6). Adding them later is a one-line config change plus an `images/uploads/.gitkeep` and a new test.
- Pushing `main` to `origin`, and the resulting live publish loop (Decap → Action → Vercel). This workflow only produces/commits the local tree and fast-forwards local `main`; the loop goes live after a later push + the user's OAuth/env setup (Scope boundary, §Execution-context).
- Multi-user CMS roles, editorial workflow/drafts, search, tags, or pagination on the Papers index.
- Converting the Crayonia font to WOFF or subsetting for performance (allowed by license but not required now).
- Signed-`state` CSRF cookie hardening for the OAuth callback (documented as future work, §13.2).

---

## 17. Assumptions

- The notebook source is copied from the main working tree into the worktree before transforming (§5.0); the main-tree files remain the source of truth until the final fast-forward.
- The canonical host is `https://www.benmanoj.com`; the apex→www redirect is enforced by the committed `vercel.json` `redirects` rule (a repo artifact, not an assumed live-dashboard setting — Finding 5). `base_url`, the OAuth callback, and the `/admin/` host all use www.
- `ruby/setup-ruby@v1` with Ruby 3.3 builds Jekyll 4.3 cleanly in GitHub Actions and generates a CI-platform `Gemfile.lock` (the local Ruby 2.6.10 cannot produce the lock; it is produced under Ruby 3.3 in CI, with `--add-platform` for local dev — Finding 3).
- Vercel's **zero-config** repo-root `api/` detection deploys `api/*.js` as Node functions (major pinned by `engines.node`) alongside a `_site` output — with **no** `functions.runtime` key, which would risk a deploy error (Finding 1). Validated by AC-5 on a preview; falls back to explicit `rewrites`/relocation if the preview 404s.
- A Decap-written unquoted `date: YYYY-MM-DD` plus the date-prefixed filename gives Jekyll a real `Time`, so `sort: "date"` and `date: "%Y"` work (validated by the seed paper, AC-6/AC-7).
- The site is personal/non-commercial, keeping Crayonia within its FFP license.
- Node 18+ global `fetch` is available in Vercel's Node serverless runtime for the token exchange.

---

## 18. Responses to design review findings (revision 3 — verdict: CHANGES_REQUESTED, 2 HIGH / 4 MEDIUM / 4 NIT)

These respond to the **second** review (`.agents/tasks/design-review.json`). The revision-2 responses are superseded; the items below are the authoritative record.

**Finding 1 (HIGH — `vercel.json functions.runtime "@vercel/node@3"` likely invalid): ADDRESSED.** The `functions` key is **removed** from both `vercel.json` variants (§11.1 primary, §11.2 Alternative B). Function deployment now relies on Vercel's zero-config repo-root `api/` detection plus `engines.node` in `package.json` (§13.3), as recommended by the fix. §4's "Decision — api/ functions" and §13.3 were rewritten to state the no-pin rationale and the `Function Runtimes must have a valid version` risk explicitly. AC-5 (preview `/api/auth` → 302, not 404) remains the gate, with the §11.1 `rewrites`/relocate fallback. AC-12 and §17 updated to assert "no `functions.runtime` key."

**Finding 2 (HIGH — runtime publish loop requires push, conflicting with NFR-4; never reconciled): ADDRESSED.** A new **Scope boundary** section (top of the doc) states explicitly that this workflow produces and commits the correct tree and fast-forwards local `main` only; the publish loop (Decap → push → Action → Vercel) becomes live only after a later push to `origin` + the user's one-time OAuth/env setup, both out of scope. §14 acceptance criteria are now split **[A] locally verifiable** (gates this workflow) vs **[B] post-push/deploy** (deferred), and every criterion is tagged. §16 adds "pushing to origin / live loop" as out of scope.

**Finding 3 (MEDIUM — build bootstrap ordering + unpinned/mismatched `Gemfile.lock`): ADDRESSED.** §11.1 adds a "Bootstrap ordering & `Gemfile.lock` platform" subsection: the lock is generated under Ruby 3.3 in CI (the local Ruby 2.6.10 cannot produce it; verified), with `bundle lock --add-platform x86_64-linux arm64-darwin` for dev; and the implementer does **not** commit an initial `_site/` — CI owns `_site/` entirely, with the first run creating it and `git diff --cached --quiet` making re-runs idempotent and loop-free. §5.1 and the tree note were reconciled to "no `_site/` committed by this workflow."

**Finding 4 (MEDIUM — `.paper-body` first-line baseline claim geometrically inaccurate): ADDRESSED.** §7.2 now explains the half-leading problem (with `line-height:var(--line)` the glyphs are centered, leaving the baseline ~`0.1·--line` above the rule) and corrects the transform to `translateY(calc(var(--baseline-drop) + (var(--line) - 1em)/2))`, to be tuned on the seed paper; §7.3 CSS and §7.4 updated. §7.5 and AC-7 were tightened from "transform value equals 0.22×font-size" to an actual **position assertion** (first baseline within ~1px of a rule `y`).

**Finding 5 (MEDIUM — apex→www redirect load-bearing but unverified live infra): ADDRESSED.** The redirect is now a **committed repo artifact**: both `vercel.json` variants include a `redirects` entry 308-redirecting `benmanoj.com/*` → `https://www.benmanoj.com/$1` (§11.1/§11.2). §12.3, §13.3, §17 updated to cite the config rule rather than an assumed dashboard setting. PUBLISHING.md §4 notes the behavior and the curl check is implied by AC-10a [B].

**Finding 6 (MEDIUM — Decap `media_folder` half-wired): ADDRESSED by removing it.** `media_folder`/`public_folder` are deleted from `admin/config.yml` (§12.2) with a comment explaining how to add them later; §16 now lists CMS media uploads as out of scope cleanly (papers are text-only). No `images/uploads/` tree entry is introduced. AC-8 asserts their absence.

**Finding 7 (NIT — no concrete `.gitignore` change): ADDRESSED.** §5.1 now gives the exact appended block (`.jekyll-cache/`, `.sass-cache/`, `.bundle/`, `vendor/`) with an explicit note that `_site/` is intentionally **not** ignored on the primary path (CI commits it) and **is** added under Alternative B. The existing stock Node template is appended to, not rewritten. AC-15 references it.

**Finding 8 (NIT — §12.3 vs §13.2 contradiction on apex `/admin/`): ADDRESSED.** The model is now **www-only** and consistent: §13.2's allowlist is the single origin `https://www.benmanoj.com` (not two hosts), and §12.3 states the apex is redirected to www before `/admin/` loads, so the apex never serves `/admin/`. The Finding 5 redirect makes www-only the safe, simplest choice, exactly as the fix suggested.

**Finding 9 (NIT — header.html three-way naming): ADDRESSED.** §6.3 adds a clarifying paragraph: the include always takes one `name` parameter; callers pass a literal (home), `page.heading` (static pages), or `page.title` (papers); `heading` is a page-only convenience distinct from the collection `title`. No code change.

**Finding 10 (NIT — AC-4 "byte-identical" overstated): ADDRESSED.** AC-4 reworded to "every existing selector and declaration preserved unchanged (ignoring trailing-whitespace/newline normalization), only the appended `.paper-body` block added."

---

### Note on the previous review's HIGH findings

The first review's three HIGH findings (source not in worktree; `.paper-body` using `top`; apex-vs-www handshake) remain addressed as in revision 2 — §5.0 copy mechanism, §7 `translateY` mechanism (now further corrected for half-leading by this review's Finding 4), and the www-only handshake (now hardened by this review's Findings 5 & 8). No regression was introduced; the changes above refine rather than reopen them.
