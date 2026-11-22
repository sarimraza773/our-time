# Calendar fixes and private Period Tracker

This update uses the existing recurrence engine, calendar repository, authenticated profiles and Supabase client. The new tracker is available only to the authenticated profile with `person_key = 'deena'`; the visual calendar perspective does not authorize access. It has no sharing switch, shared-calendar event export, analytics, health-data localStorage cache, or shared Realtime broadcast.

## Model and privacy

- Dates are SQL `date` and `YYYY-MM-DD` strings. Date arithmetic uses UTC as a fixed calculation zone; Today follows the planner's Kuala Lumpur timezone. No date-only value is converted through JavaScript `Date`.
- Cycle day 1 is a recorded start. Closed historical bleeding dates always win over forecasts. Open entries remain ongoing until ended; overlapping records are rejected, including concurrent writes serialized per owner.
- Initial suggestions are 28/5/14 days (cycle/period/luteal estimate), not personal measurements. Default history mode withholds a forecast until there are three recorded starts (two intervals). Manual mode is an explicit option.
- History uses the median of the most recent six recorded intervals. Variation over seven days adds an uncertainty message. These are product heuristics, not validated medical thresholds.
- Ovulation is estimated from the next forecast minus the configurable luteal estimate, with a three-day display window. This is **not a validated fertile window**. Incompatible boundaries produce uncertainty instead of forced phases. The displayed post-bleeding follicular segment is part of the larger biological follicular phase.
- A passed/missed prediction never generates a period or silently rolls cycle day back to 1. Actual early/late starts reanchor predictions. Overrides carry the latest recorded-start anchor; stale overrides are ignored after that anchor changes. Reset removes only prediction adjustments. Deleting actual records can recalculate estimates.
- Estimates cannot confirm ovulation, biological phase, pregnancy or safe contraceptive days. [NHS cycle information](https://www.nhs.uk/conditions/periods/fertility-in-the-menstrual-cycle/) explains why ovulation timing cannot be pinpointed from calendar dates alone.
- RLS on `period_entries` and `cycle_settings` requires BOTH `auth.uid() = user_id` and the existing administrator-managed Deena profile. Clients cannot change their profile mapping. Sarim and unrelated authenticated accounts cannot read or mutate either table even when they specify Deena's UUID. Anonymous privileges are revoked.
- `delete_my_cycle_data()` deletes only the caller's private records/settings in one transaction, after UI confirmation. Updates and individual deletions compare server timestamps to reject stale writes. API errors are translated without displaying database details. Tracker data is refetched on reopen, focus, visibility restoration, reconnect and save; no health data is broadcast on shared topics.

## New migrations — review before applying

1. `202611220001_custom_event_colors.sql` extends existing calendar/rule/occurrence color constraints to permit six-digit hex values, retaining the six legacy presets and all existing records.
2. `202611220002_private_period_tracker.sql` adds the two private tables, owner-mapping helper, validation/serialization triggers, RLS, grants and self-only deletion RPC.

The already-applied `202611210001_event_colors_and_repeats.sql` is unchanged. Do not replay it, reset the database, recreate accounts, generate account-link SQL or repair history as part of this update.

## Safe Supabase CLI application — only after approval

Use the **existing linked combined working copy** that retains its private local migration history. Do not run migration commands from a sanitized public export: it intentionally excludes account-link migrations. Use the previously approved project reference from the local setup; do not paste account identifiers or credentials into public files.

```powershell
Set-Location '<existing-combined-working-copy>'
npx.cmd --yes supabase@2 migration list --linked
npx.cmd --yes supabase@2 db push --linked --dry-run
```

The dry-run must show **only** the two November 22 migrations above, in that order. Confirm November 21 already appears applied. If old migrations appear pending, or the linked project is wrong/missing, stop and inspect the existing configuration/history. Do not repair history or use `--include-all`, `db reset`, seeds, roles or account provisioning. If linking is actually missing, verify the intended existing project in the dashboard, then use `npx.cmd --yes supabase@2 link --project-ref <approved-existing-project-ref>`; linking alone does not apply SQL.

Review the SQL and take/confirm an approved recovery checkpoint. After explicit approval of these two migrations only:

```powershell
npx.cmd --yes supabase@2 db push --linked
npx.cmd --yes supabase@2 migration list --linked
npx.cmd --yes supabase@2 db push --linked --dry-run
```

The final dry-run should show no pending migrations. Never also paste the migrations into the SQL editor. No remote CLI command or database mutation was performed for this update. See [Supabase migration guidance](https://supabase.com/docs/guides/deployment/database-migrations) and [CLI reference](https://supabase.com/docs/reference/cli/introduction).

## Source review and GitHub Pages — only after approval

From the combined working copy:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run prepare:github
```

Review the newly printed `outputs/github-pages-source-...` folder. It includes these public-safe schemas and tracker source/docs; it excludes local environment files, actual health records, private account-link SQL, QA fixtures, prior exports and credentials. Do not copy the parent working directory wholesale into the public repository. Use a clean review branch of the existing `sarimraza773/our-time` repository, copy only this reviewed export over its application files (preserving `.git`), and inspect `git diff --stat` and the full diff. Run `node scripts/check-public-source.mjs` after staging only reviewed source, then the tests/build. Never stage `.env.local` or local Supabase metadata. Commit/push only after explicit source publication approval.

The workflow stays manual-only (`workflow_dispatch`), retains `/our-time/` asset routing and never applies migrations. After the approved schema application and hosted privacy checks, request deployment approval, then run **Actions → Test, build and deploy Our Time to Pages → Run workflow → main**. Confirm the tested commit is the intended update and the workflow succeeds. Open the canonical URL, reload once, and verify its loaded hashed JS/CSS assets belong to that workflow artifact; changed local code alone does not update Pages. `npm run check:pages` now requires recurrence/color/tracker/24-hour control labels in the production bundle and excludes the synthetic QA fixture.

## Acceptance still required before calling the release verified

- Visually inspect 320, 390, 768, 1024 and 1440px, including sticker/button spacing, the expanded scrollable event form and tracker forms/month calendar. Use actual browser layouts; DOM tests do not prove geometry.
- Create disposable 1–6 AM, 2:30 AM, 11:59 PM and 10:30 PM–6 AM events. Scroll to midnight and the final hour, check both halves of overnight events, and click each of three overlapping cards. Check preset/custom/automatic colors, dark-fill text, recurrence edits/deletions and both users' saved colors.
- In approved hosted test sessions, Deena logs/ends/corrects/deletes a disposable period and reloads/signs in again. Test early/missed/manual/reset predictions. Use synthetic records or approved disposable data, never publish real health records as evidence.
- Using Sarim's real authenticated SDK/REST session, directly query both new tables filtered by Deena's user ID: return zero rows. Direct inserts with Sarim's own or Deena's identity must fail RLS; update/delete must affect zero rows. Anonymous access must fail. Repeat with an authorized disposable third account if available. Do not use a service-role key for this test, since it bypasses RLS.
- Confirm existing shared calendar Realtime, diary, bookshelf and private photos still work. Test intended physical devices and touch/keyboard behavior. Local embedded PostgreSQL and simulated SDK/UI tests do not establish hosted Auth, PostgREST, WebSocket or hardware behavior.

Browser QA was attempted but unavailable in this session: the local preview timed out, and Windows Computer Use stopped because it could not confidently determine the current browser URL. No viewport, live two-account or physical-device success is claimed. The hosted asset version also could not be verified; the public repository source already had Repeat/Color/24-hour code before this change, so an older deployed artifact remains a hypothesis, not a proven diagnosis.

The preserved parent repository's committed `DailyTimeline.tsx` uses `START_HOUR = 6` and `END_HOUR = 25`; its committed event editor has neither Repeat nor Color controls. Those older committed sources match the screenshot symptoms. The combined working copy and the fetched public `main` editor already contained the newer controls. This is concrete evidence of differing source generations, while the exact hosted bundle remains unverified.
