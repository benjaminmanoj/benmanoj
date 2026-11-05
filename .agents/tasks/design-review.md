# Design Review — Write-and-Publish Workflow (design.md revision 3)

Reviewed fresh against the actual files on disk. This is the third review in the loop; the design claims to have addressed the prior two. I re-verified every load-bearing "the existing file does X" claim rather than trusting the design's word.

Verdict basis is mechanical: count HIGH + MEDIUM findings. This review records **0 HIGH, 2 MEDIUM, 5 NIT** → **CHANGES_REQUESTED**.

---

## Verified Assumptions

These design claims were checked against the real files/environment and are **correct**:

1. **Source files exist where claimed, untracked.** `git status` in the main tree shows `benmanoj.com/index.html` modified-but-uncommitted and `benmanoj.com/{style.css,about/,fonts/,images/,papers/,writing/}` + `public/` untracked. Matches §5.0 exactly.
2. **`style.css` content.** Verified `--line: clamp(2.6rem, 3.2vw + 2.4vh, 5.6rem)`, `--fs-item: calc(var(--line) * 0.8)`, `--baseline-drop: 0.22em`, `--top-gap: calc(var(--line) * 4)`, `.line-row { align-items: flex-end; height: var(--line); }`, `.line-row > * { transform: translateY(var(--baseline-drop)); }`. §7.1's description of the grid mechanism is accurate (transform, not `top`; flex-end; repeat-y rule background offset by `--top-gap`). No existing `.paper-body` selector exists, so §7.3 is genuinely additive.
3. **Home page markup.** Verified: SVG filter, `article.notebook-page`, `img.hole[src="/images/bowl.png"]`, `div.writing.pencil`, 3 header `.line-row.blank` + `.header-name` "Benjamin Manoj", `.toc-title` "Table of Contents", one blank, `nav` with three `.toc-item` (Papers/Writing/About, each `.toc-label`/`.toc-leader`/`.toc-page` with literal page numbers 1/2/3), and **15 trailing `.line-row.blank`** (file has 19 `line-row blank` total = 3 header + 1 post-title + 15 trailing). FR-4/§6.5/AC-2 are accurate.
4. **Writing & About body lines.** §6.6's reproduced body lines match `writing/index.html` and `about/index.html` byte-for-byte (lines, blank-row placement, wording). The back-link is `<a class="back-link" href="/">&larr; Contents</a>` inside a `.line-row.toc-item` — matches §6.6/§6.1.
5. **SVG pencil filter is identical across all four pages** (`baseFrequency="0.08"`, `numOctaves="4"`, `seed="7"`, `scale="3"`), so a single `_includes/pencil-filter.html` reproduces them. §6.1 is correct.
6. **`public/crayonia/` contents.** Verified: `1001fonts-crayonia-eula.txt`, `Crayonia.ttf`, `Unknown.png` — **no zip**. Matches §1/§5.0.
7. **Local Ruby is 2.6.10** (`ruby 2.6.10p210 ... arm64e-darwin25`), below Jekyll 4.3's required >= 2.7. §4/§11.1's claim that the lock cannot be generated locally and must come from CI (Ruby 3.3) is correct.
8. **No `vercel.json` and no `CNAME` exist** in the tree. §4/§11 treats `vercel.json` as new; correct.
9. **Worktree tracked files** are exactly `.gitignore`, `LICENSE`, `README.md`, `benmanoj.com/README.md`, `benmanoj.com/index.html`; the committed `benmanoj.com/index.html` is the "Coming Soon" page (`<title>Ben Manoj - Coming Soon</title>`). The `git rm benmanoj.com/index.html benmanoj.com/README.md` in §5.0 targets real tracked paths. §13/AC-13 accurate.
10. **Worktree `.gitignore` is the stock Node template** (verified: ignores `node_modules/`, `dist`, `out`, `.output`, `.env`, etc., with none of `.jekyll-cache/`/`.sass-cache/`/`.bundle/`/`vendor/`). §5.1's "append this block" is accurate and non-colliding.
11. **Decap `format: "frontmatter"` + a field named `body`.** Correct: under `format: frontmatter`, Decap writes the field literally named `body` as the document body below the `---` front matter, not as a `body:` key. §8/§12.2's pinned file shape is right.
12. **`permalink: /papers/:name/`.** `:name` is the filename sans extension, so `2024-01-01-example-paper.md` → `/papers/2024-01-01-example-paper/`. §9 is correct.
13. **Front-matter `date:` casting.** An unquoted `YYYY-MM-DD` in YAML is parsed as a date and Jekyll exposes it as a `Time`, so `sort: "date"` and `date: "%Y"` work. The primary mechanism in §8 is sound (see MEDIUM-2 for the overstated secondary justification).

---

## Unverified / Wrong Assumptions

1. **(See MEDIUM-2) "The date-prefixed filename alone already guarantees the sort order."** Overstated for a *custom collection*. Jekyll's automatic date-from-filename behavior is a `_posts` feature; for arbitrary collections the `YYYY-MM-DD-` filename prefix is not reliably parsed into `date`. The actual guarantee comes from the required front-matter `date:` value, which is always present. The outcome still holds, but the stated reason is wrong.
2. **(See MEDIUM-1) Vercel zero-config `api/` detection firing alongside a custom `outputDirectory: _site`.** The design itself concedes this is unverified and gates it on AC-5 [B]. Acceptable as a deferred runtime check, but the local tree ships no mechanism that *forces* it — see MEDIUM-1 on the fallback being under-specified.
3. **Decap 3.x github backend + self-hosted OAuth handshake message sequence.** The `authorizing:github` → `authorization:github:success:{...}` postMessage contract (§13.2) matches the netlify-cms/decap serverless-shim convention, but this is asserted from convention, not verified against a running Decap 3.x. Correctly tagged [B]; noted here as convention-based, not independently verified.
4. **`unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js` as the CDN path.** Plausible and conventional, not verified against the live CDN. Low risk; flagged in NIT-5.

---

## Findings

### MEDIUM-1 — `/api/auth` → 404 fallback is named but not actionable
**Where:** §4 ("Decision — api/ functions"), §11.1 ("Reconciliation of `api/` + custom `outputDirectory`"), AC-5.

**Problem:** The whole OAuth feature depends on repo-root `api/*.js` being deployed as functions while `outputDirectory` is `_site`. The design is honest that this is validated only by AC-5 [B], but the stated fallback is self-admittedly a no-op: it says the `rewrites` entry `{ "source": "/api/:fn", "destination": "/api/:fn" }` "is a no-op; the real fallback is to confirm the functions build in the Vercel dashboard or relocate them." "Relocate them" is not specified — to where, and how does the OAuth `redirect_uri`/`base_url`/callback-URL set (which hard-code `/api/callback`) change to match? If the implementer hits a 404 they have no concrete recovery, only a direction. A design is supposed to remove this kind of "decide during implementation."

**Concrete fix:** Specify the fallback as a definite, already-worked-out config rather than a direction. Pick one and write it out, e.g.:
> If AC-5 returns 404, add to `vercel.json`:
> ```json
> "functions": { "api/*.js": { "runtime": "@vercel/node@3.2.0" } }
> ```
> using a **fully-qualified** version (not a truncated major), which is the documented cure for the zero-config-miss case and does not trigger `Function Runtimes must have a valid version`. No function relocation and therefore no change to `redirect_uri`/callback URL is needed.

This keeps the primary no-`functions`-key path, but gives the implementer a complete, decided recovery instead of "relocate them (unspecified)".

### MEDIUM-2 — Date-ordering justification rests on a false Jekyll behavior
**Where:** §6.7 ("Sorting & year-rendering decision"), §8 (front-matter `date`), §17 (assumptions), AC-6/AC-7.

**Problem:** The design repeatedly leans on "the filename is always date-prefixed (`YYYY-MM-DD-...`), therefore Jekyll gives the document a real `Time`" as an *independent* guarantee ("the date-prefixed filename alone already guarantees the sort order"). That is true for `_posts`, not for a custom collection like `_papers`. For a custom collection, Jekyll does **not** synthesize `date` from the filename; ordering/`%Y` work only because the required front-matter `date:` value is a YAML date. If a future hand-authored file ever omits `date:` (trusting the design's claim that the filename suffices), `sort: "date"` and `date: "%Y"` break. The functional outcome is fine today because `date:` is REQUIRED and always written, but the documented reasoning is wrong and could mislead the implementer or a future author.

**Concrete fix:** Correct the justification to name the real mechanism and make `date:` the sole guarantee:
> Ordering and `%Y` rendering come from the **required front-matter `date:`** (an unquoted `YYYY-MM-DD`, which YAML casts to a Time). The `YYYY-MM-DD-` filename prefix is a human-readability/URL convention only; Jekyll does **not** derive `date` from a custom-collection filename (that is a `_posts`-only behavior). Therefore every paper — Decap-written or hand-authored — **must** carry `date:` in front matter; the seed paper and AC-6/AC-7 verify this.

No code change; it tightens §8's "REQUIRED" into the load-bearing rule and removes the false filename guarantee from §6.7/§17.

### NIT-1 — Home-page comment nodes dropped by the includes (document as allowed)
**Where:** §6.1/§6.5 vs the real `index.html`.

**Problem:** The real home page contains explanatory HTML comments (`<!-- Pencil-stroke texture filter... -->`, `<!-- Header region... -->`, `<!-- Table of contents... -->`, `<!-- Extra empty ruled rows... -->`). The include/layout versions omit them. This is rendering-irrelevant and within the design's stated "whitespace/indentation inside tags" allowance, but comments are not whitespace, so AC-2's "matching the current hand-written home page" is slightly broader than what's delivered.

**Concrete fix:** Add one clause to §6's "only differences allowed" list: "(d) HTML comment nodes present in the current files may be dropped — they do not affect rendering." Keeps AC-2 honest.

### NIT-2 — `.paper-body a` underline is a visible change vs. existing link styling
**Where:** §7.3 (`.paper-body a { color: inherit; text-decoration: underline; }`).

**Problem:** Existing notebook links (`.toc-item a`, `.back-link`) use `text-decoration: none`. Paper-body links will be underlined — a new visual treatment. It only appears on new paper pages (so NFR-2 "additive, no existing selector changed" holds), but it's a deliberate style introduction worth calling out so it isn't mistaken for the "no restyle" invariant leaking.

**Concrete fix:** One line in §7.3 or §7.4: "Paper-body links are underlined by choice (prose convention); this is new styling confined to `.paper-body` and does not touch the existing link selectors." No code change.

### NIT-3 — `.gitignore` block comment lines are inconsistent about trailing content
**Where:** §5.1 appended `.gitignore` block.

**Problem:** The block mixes real ignore entries with multi-line prose comments about `_site/`. The prose is fine, but one comment line is wrapped mid-word ("add­ed" contains a soft hyphen in the doc) and the intent ("`_site/` intentionally not ignored on primary path; add it under Alternative B") is spread across §5.1, §4, and §11.1. An implementer copy-pasting could introduce a stray character.

**Concrete fix:** Reduce the appended block to the four real entries plus a single short comment, and keep the Alternative-B note in prose only:
```gitignore
# --- Jekyll / Bundler (appended for this project) ---
.jekyll-cache/
.sass-cache/
.bundle/
vendor/
# _site/ is intentionally NOT ignored on the primary path (CI commits it).
# Under Alternative B, add `_site/` here instead.
```

### NIT-4 — `scope=repo` breadth not justified against least-privilege
**Where:** §13.1 step 3.

**Problem:** `scope=repo` grants full read/write to all of the user's repos (public and private), to commit Markdown into one repo. The design justifies it only as "works whether or not the repo is private." For a single-repo CMS this is broader than needed; least-privilege would prefer `public_repo` if the repo is public.

**Concrete fix:** Note the tradeoff and make it a one-line decision: "Repo `benjaminmanoj/benmanoj` is public, so `public_repo` suffices and is narrower; `repo` is used only if the repo is later made private. Pick `public_repo` now unless privacy is planned." If the user has already accepted `repo`, keep it but record the breadth explicitly.

### NIT-5 — Decap CDN URL and version pin unverified
**Where:** §12.1 (`https://unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js`).

**Problem:** The `@^3.0.0` range in a URL path and the exact `dist/decap-cms.js` filename are asserted from convention, not verified. An unpkg range in the path resolves to the latest 3.x, which can drift. Low risk but unverified.

**Concrete fix:** Pin a concrete known-good version instead of a range in the URL (e.g. `decap-cms@3.x.y`) and confirm the `dist/decap-cms.js` path during implementation as part of AC-8 (currently AC-8 checks config fields but not that the host page actually loads the bundle). No functional change beyond pinning.

---

## Summary

The design is thorough and the prior findings genuinely appear addressed: the source-copy mechanism (§5.0), the `translateY` grid mechanism with half-leading correction (§7.2), the www-only OAuth handshake with a committed redirect (§11.1/§12.3/§13.2), the removed `functions.runtime` pin (§4/§11.1), and the [A]/[B] acceptance split (§14) are all concrete and match reality. Markup reproduction, CSS additivity, file locations, git state, and the font license are all verified correct.

Two MEDIUM items block approval: the `/api/auth` 404 fallback is still a "decide later" direction rather than a decided config (MEDIUM-1), and the date-ordering justification repeats a Jekyll behavior that does not apply to custom collections (MEDIUM-2) — the outcome is fine but the stated rule could mislead a future author into omitting the required `date:`. Five NITs are cleanup. Fixing the two MEDIUMs (both are small, mostly documentation-level corrections) should clear the way to APPROVED.
