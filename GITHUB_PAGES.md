# Our Time on GitHub Pages

Prepared November 18, 2026. **Local preparation only.** No GitHub repository was created, no Git repository was initialized, nothing was committed/pushed/published/deployed, and no Supabase settings or database records were changed. Obtain approval before the publication steps below.

## What is prepared

- Vite production builds and production previews use **`/our-time/`**. Development and unit tests retain `/`.
- The default `npm run build` produces a static `dist` and verifies its URLs/artwork. The former Worker artifact-copy step is no longer part of this build. Original Worker helper files remain locally for provenance; they are not exported or deployed. The Sites Vite plugin is no longer loaded; no Sites runtime or paid hosting is required.
- Runtime scene images, photobooth sticker trays and canvas sticker loads use Vite's `BASE_URL`. Vite rebases the existing CSS botanical URL. Artwork bytes, design styles, animations and reduced-motion behavior are preserved. Font families are existing system stacks (Georgia/Palatino/Segoe UI/Segoe Print and fallbacks); there is no remote font service or downloadable font file to configure.
- `.github/workflows/deploy-pages.yml` runs `npm ci`, `npm test`, then `npm run build`, uploads **only `dist`**, and deploys it using GitHub's official Pages actions. It is **manual-only** (`workflow_dispatch`) and restricted to `main`; a push does not trigger deployment. The deployment job depends on the tested build, uses the `github-pages` environment, and has only Pages/OIDC permissions. No personal access token is needed.
- The public build environment is validated before bundling. Missing CI configuration, remote HTTP endpoints, privileged keys (including an unused legacy key), and unexpected `VITE_` variables cause a generic error without printing values. A local build with blank configuration still shows the existing setup screen; it is not evidence of a connected app.
- Existing email/password auth, sessions, shared calendar, photobooth/private Storage, editable books and diary remain on the existing Supabase project and RLS. No migration or auth change is needed just to change the frontend base path.
- Before launching all unified features, independently verify that **all three** schema versions (`202609260001`, `202610190001`, `202611170001`) are applied in the existing project. The frontend workflow never applies database migrations. Review any missing photobooth/diary schema and obtain database approval separately; do not reset the project or repair migration history without inspecting actual objects.
- The final sticker pass keeps decorative artwork clear of the mini-calendar at desktop/tablet/phone widths. On narrow phones, the same header elements wrap to avoid overlap; scene decorations pass pointer events through while photobooth sticker controls remain interactive.

## 1. Review the clean source export

The working copy is currently under the parent repository's ignored `work/` directory. **Do not run `git add .` in the parent DS-calendar repository.** Use the prepared clean candidate as the root of the future `our-time` repository.

From the existing working copy, `npm.cmd run prepare:github` creates a new timestamped `outputs/github-pages-source-...` directory and prints its full path. It refuses to overwrite prior candidates and does not initialize Git or contact GitHub. A candidate has already been prepared for review with this pass; see `GITHUB_PAGES_VALIDATION.md` in the original working copy for its path and results. Generate a new candidate whenever product/source files change after preparation.

The exporter copies an explicit set of build/config/workflow files, application source/tests, the five approved decorative images/favicon, three schema migrations and the read-only audit. It includes a fresh README and this guide. It excludes `.env.local` and all other real environment files, `.git`, `.openai`, QA fixtures/screenshots, exported media, local connection/consolidation documents, unused legacy demo schedules/school details, generated builds, dependency directories, and account-link SQL. Runtime calendar/diary entries and photo memories are fetched from Supabase and are not exported.

The source guard rejects local artifacts, unreviewed public media, configured `.env.example` values and common embedded credential patterns. It is a useful boundary, not a guarantee that arbitrary text contains no personal information. Review the candidate before publication. The design intentionally includes Deena/Sarim names and decorative stickers; a public repository and its static frontend make those design assets/source visible. Personal events, diary writing and saved photos must remain behind Supabase auth/RLS.

## 2. After approval: create the free GitHub repository

1. Sign in to your intended GitHub account. Open **New repository**.
2. Set the repository name to **`our-time`** exactly.
3. For GitHub Free, choose **Public** only after approving the source review. Leave README, `.gitignore` and license initialization unchecked so it is empty. A private-repository Pages site requires an eligible paid GitHub plan; this preparation does not introduce one. [GitHub Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages).
4. Create the repository only when publication is approved. The eventual default URL is **`https://YOUR_GITHUB_USERNAME.github.io/our-time/`**. Replace the username with the account/organization that owns the repository. No custom domain purchase is needed.

Run the following **only after approval**, in the reviewed timestamped candidate directory (replace both placeholders):

```powershell
Set-Location 'FULL_PATH_TO_THE_REVIEWED_GITHUB_PAGES_SOURCE_CANDIDATE'
git init -b main
git add -- .
node scripts/check-public-source.mjs
git status --short
git diff --cached --stat
```

Review the staged source locally. Confirm `.env.example` is blank, `.env.local` is absent, and no user data, private keys or account-link migration is staged. Do not use `git add -f`. Then, after source/publication approval:

```powershell
git commit -m "Prepare Our Time for GitHub Pages"
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/our-time.git
git push -u origin main
```

Use GitHub's normal browser/credential-manager sign-in if prompted. Do not place a token/password in a URL or shell argument. These commands have **not** been executed by this task.

## 3. Set GitHub build variables

In **our-time → Settings → Secrets and variables → Actions → Variables**, create **repository variables**:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | The existing project's HTTPS API URL, e.g. `https://YOUR_PROJECT.supabase.co`; not a dashboard URL or database connection string |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | That same project's public publishable key |

For a legacy project with only a public anon JWT, leave the publishable variable unset and set **`VITE_SUPABASE_ANON_KEY`** instead. Do not set both unless both values are valid public keys. The client prefers the publishable key. Do not put `sb_secret_` keys, service-role JWTs, database passwords, account passwords, access tokens, private auth UUID lists or personal records in these variables. No `SUPABASE_SERVICE_ROLE_KEY`, database URL, `VITE_SITE_URL` or additional app secret is needed.

These two browser settings are **public configuration**, even if entered through a secret store; Vite includes them in downloadable JavaScript. RLS and authenticated sessions protect personal data. Keep `.env.local` local and ignored. [Vite environment variables](https://vite.dev/guide/env-and-mode.html), [Supabase API keys](https://supabase.com/docs/guides/api/api-keys).

Variables are captured at build time. After changing one, manually rebuild/redeploy after approval; an already-uploaded bundle does not update itself. The workflow does not print variable values and refuses to emit a production bundle with private/unexpected browser variables.

## 4. Configure GitHub Pages without running deployment yet

1. In **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. No `gh-pages` branch is needed.
2. In **Settings → Environments → github-pages**, restrict deployment to `main`. If required reviewers are available, add your review gate before the first run. Leave the site's audience/settings otherwise as intended.
3. Check that GitHub Actions are enabled for the repository. The official actions are declared in the prepared workflow. The normal automatic `GITHUB_TOKEN` supplies authorization; do not create a PAT for deployment.
4. Keep the workflow manual-only until you explicitly choose automatic deployment. It will appear in **Actions → Test, build and deploy Our Time to Pages** after the first source push; do not select **Run workflow** until the first deployment is approved.

The `build` job has repository read access. The `deploy` job gains `pages: write` and `id-token: write` and waits for the build. See [GitHub's custom Pages workflow requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite's project-subdirectory deployment guide](https://vite.dev/guide/static-deploy.html#github-pages).

## 5. After approval: update Supabase Authentication URLs

In the **existing Supabase project → Authentication → URL Configuration**:

- **Site URL:** `https://YOUR_GITHUB_USERNAME.github.io/our-time/`
- **Redirect URLs:** add that exact same URL, including `/our-time/` and the trailing slash.
- Retain any existing approved local-development allowlist entries. For this app's default development server, exact entries can be `http://localhost:5173/` and `http://127.0.0.1:5173/`. Add `http://127.0.0.1:4180/our-time/` only if you intentionally use the strict local production preview for an auth flow. Match the actual origin/port you use. Do not add a broad production wildcard.
- Keep existing accounts, profiles, calendar memberships, public-signup restrictions, private Realtime settings and private photo bucket unchanged. Do not reset or reprovision the database to host the frontend.

**Current auth is email/password with `signInWithPassword`, not OAuth or magic-link sign-in.** It does not navigate to a callback URL, so changing the host/base does not require adding a callback route or changing session handling. Sessions are restored through the existing client. The client currently sets `detectSessionInUrl: false`; there is no in-app OAuth/magic-link/password-reset callback handler or password-reset editor. Setting URL Configuration does not implement those features. Do not add `/auth/callback` or `/reset-password` as if those routes already existed. Existing confirmed users should use the email/password form.

Site URL controls default redirect destinations for Supabase email flows; exact production redirects are preferred by [Supabase's redirect documentation](https://supabase.com/docs/guides/auth/redirect-urls). Review any customized email template for obsolete URLs in the dashboard, without changing account data. Actual email-link/redirect behavior cannot be verified before configuring the final URL, and no such verification is claimed here.

## 6. Routing, refreshes and assets

The app has **no pathname-based React router**. The calendar, photobooth, diary and other panels are controlled by React state and remain at `/our-time/`. Refreshing the canonical URL requests its real `index.html`, so GitHub Pages does not need an SPA rewrite, Worker or 404 redirect hack. Query strings/fragments at that URL also request the same file. Refresh closes transient dialogs and restores the existing signed-in session where available; it does not delete backend data.

Use/share the canonical URL with its trailing slash. Paths such as `/our-time/diary` and `/auth/callback` are not product routes and intentionally 404. If pathname routing is introduced later, choose a Pages-compatible hash router or an explicitly reviewed fallback. Do not rely on Vite preview's SPA fallback as proof that Pages supports deep paths.

`npm.cmd run preview:pages` serves `dist` at `http://127.0.0.1:4180/our-time/` using a strict static server with **no SPA fallback**. `npm.cmd run check:pages` verifies HTML/CSS links, runtime root-relative URL mistakes, all five artwork hashes and absence of local/server/QA artifacts. All application image paths must remain under `/our-time/`; Supabase API/Storage URLs remain the existing absolute HTTPS URLs and must **not** receive the frontend base prefix.

## 7. HTTPS camera and private data acceptance

After an approved deployment:

1. In **Settings → Pages**, confirm the URL and enable/confirm **Enforce HTTPS**. Open the actual HTTPS site as a top-level tab. Browsers require a secure context and user permission for `getUserMedia`; localhost is also treated as secure for development. [Camera API requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
2. Open Photobooth without requesting camera access. Only **Open Camera** should prompt. On the intended desktop/phone browser, allow it yourself and verify video, capture, retake, denied-permission messaging and track release on close/background/sign-out. HTTPS makes camera access eligible; it does not guarantee hardware/permission success.
3. Sign in as Deena and Sarim in separate browser profiles. Confirm existing events, book titles, diary entries and photo memories load. Test only approved disposable records for create/edit/delete. Verify reload/sign-out/sign-in persistence, partner updates and reconnect recovery. A new browser origin has its own session/device storage; do not automatically import or clear the old local calendar.
4. Keep `our-time-memories` private. Existing SDK downloads use authenticated Storage reads and temporary blob URLs; no saved photo is copied to `dist` or given a public URL. Validate an actual member's photo download and an unrelated/anonymous caller's denial using the existing project. [Supabase private bucket access](https://supabase.com/docs/guides/storage/serving/downloads#private-buckets).
5. Confirm RLS for calendar, books and diary, membership-only private topics and two-client Realtime on the hosted project. Local embedded Postgres and mocked transport tests do not prove hosted Auth/Storage/WebSocket behavior.

The current working copy has no configured Supabase URL/key, and this task does not have a deployed Pages URL or real member sessions. These hosted/hardware checks remain **pending**. No camera permission, backend mutation or cloud setting change was performed during preparation.

## 8. First deployment — only after explicit approval

When source review, Pages settings, build variables and Supabase URL Configuration are approved, open **Actions → Test, build and deploy Our Time to Pages → Run workflow → Branch: main → Run workflow**. Approve the environment gate if configured. Confirm tests/build/upload/deploy all finish successfully. Visit the returned HTTPS URL and perform section 7 before calling the hosted app verified.

The workflow installs dependencies from the lockfile, runs all tests, validates public variables and builds. It never runs Supabase migrations or changes Auth/Storage settings. No automatic deployment has been triggered by this preparation.
