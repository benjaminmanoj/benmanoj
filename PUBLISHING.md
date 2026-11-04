# Publishing papers to benmanoj.com

## What this is

This site has a browser-based write-and-publish loop so you can post papers
without opening an editor or touching git. You write in a small web form at
`/admin/`, hit Publish, and the paper goes live on its own: Decap CMS commits a
Markdown file to `main`, a GitHub Action rebuilds the Jekyll site into `_site/`,
and Vercel serves the freshly built output. No local tooling required for the
day-to-day loop.

## Writing a paper (day-to-day)

1. Go to **https://www.benmanoj.com/admin/** (always the `www` host — the login
   handshake depends on it; see "Why always use the www host" below).
2. Log in with GitHub. The first time, you'll authorize the OAuth app.
3. Choose **New → Papers**, then fill in:
   - **Title** — the paper's title.
   - **Date** — the publish date (`YYYY-MM-DD`). This is required: the Papers
     index sorts by it and renders the year from it.
   - **Body** — the paper text, in Markdown.
4. Click **Publish**.

Decap commits `_papers/<date>-<slug>.md` to `main`. The GitHub Action rebuilds
`_site/`, Vercel redeploys, and the paper shows up at `/papers/` within a minute
or two.

## One-time GitHub OAuth setup (done once by you)

The login flow needs a GitHub OAuth App and two Vercel environment variables.

1. Create a GitHub OAuth App (GitHub → Settings → Developer settings → OAuth
   Apps → New OAuth App):
   - **Homepage URL:** `https://www.benmanoj.com`
   - **Authorization callback URL:** `https://www.benmanoj.com/api/callback`
     (this must match exactly).
2. Copy the **Client ID**, then **generate a new Client Secret** and copy it.
3. In **Vercel → Project → Settings → Environment Variables**, add both of these
   to the **Production** scope:
   - `OAUTH_GITHUB_CLIENT_ID`
   - `OAUTH_GITHUB_CLIENT_SECRET`
4. **Redeploy** so the functions pick up the new env vars.

The Client Secret lives only in Vercel's environment variables. It is never
committed to the repo and is used only server-side in `api/callback.js`.

## Exact Vercel project settings

- **Root directory:** the repo root (where `vercel.json`, `_site/`, and `api/`
  live) — not a subdirectory.
- **Framework preset:** "Other".
- **Build command:** empty. Vercel does not build; it serves the prebuilt
  `_site/` that the GitHub Action commits.
- **Output directory:** `_site`.
- **Environment variables:** `OAUTH_GITHUB_CLIENT_ID` and
  `OAUTH_GITHUB_CLIENT_SECRET` (Production scope).

The serverless functions in `api/` (`api/auth.js` → `/api/auth`,
`api/callback.js` → `/api/callback`) deploy via Vercel's zero-config repo-root
`api/` detection. The Node version is pinned by `engines.node` in
`package.json`; `vercel.json` carries no `functions` key on purpose (a truncated
runtime string risks a "Function Runtimes must have a valid version" deploy
error).

### If `/api/auth` returns 404 on a preview

If a preview deploy serves `/api/auth` as a 404 instead of a redirect, the
zero-config detection isn't firing. The fallback is to add a fully-qualified
runtime to `vercel.json`:

```json
{
  "functions": {
    "api/*.js": { "runtime": "@vercel/node@3.2.0" }
  }
}
```

Use the full `@vercel/node@3.2.0` spec (not a bare `@vercel/node@3`), redeploy,
and confirm `/api/auth` returns a 302.

## Why always use the www host

`/admin/` is served at `https://www.benmanoj.com/admin/`. The `vercel.json`
redirect 308s any request to the apex `benmanoj.com` over to
`https://www.benmanoj.com`, so typing the apex lands you on `www`
automatically. This matters because the OAuth popup handshake only delivers the
token to one origin — `https://www.benmanoj.com` — so the login window must be
on `www`. The redirect enforces that for you.

### Going-live prerequisite (scope boundary)

The write-and-publish loop only works after two things happen:

1. `main` is pushed to `origin` (so GitHub Actions and Vercel see these files).
2. The GitHub OAuth App and the two Vercel env vars are set up (above).

Until then the tree is correct locally, but the loop is not yet live.

## Writing and About pages

The Writing and About pages are plain HTML in the repo (`writing/index.html`,
`about/index.html`) — they are not edited through the CMS. Edit the HTML
directly; pushing to `main` triggers the same GitHub Action rebuild, and the
changes go live the same way.

## Local preview

To preview the site locally (requires Ruby 3.x with Bundler):

```sh
bundle install
bundle exec jekyll serve
```

Then open `http://localhost:4000`.

## The notebook-grid tradeoff

Paper prose uses `line-height: var(--line)` plus a block-level
`translateY(--baseline-drop…)` nudge so the text rests on the ruled lines as it
flows. This lands flowing body text on the rules well, but headings and wrapped
lines may drift a fraction of a rule. That's an accepted tradeoff: the prose
reads as handwriting on a notebook page without per-line pixel gluing.

## Font license note

The Crayonia font is licensed Free for Personal use (FFP) only. That's fine for
this personal site. If the site ever becomes commercial, obtain a commercial
license for Crayonia or swap in a differently-licensed font.

## Deploy model

Push to `main` → the GitHub Action builds `_site/` and commits it back →
Vercel auto-deploys the prebuilt `_site/` plus the `api/` functions. Vercel runs
no build of its own.
