# Period Tracker — shared by Deena and Sarim

Both authenticated, linked accounts can now view and edit **Deena’s same tracker**, as explicitly requested. Sarim does not get a separate tracker. The calendar’s visual perspective is not an authorization mechanism. No hardcoded account UUID, email or credentials are added to the frontend.

## Access and data ownership

- `cycle_tracker_owner_id()` resolves Deena’s UUID on the server. Deena can access her own records. Sarim must have his administrator-managed `sarim` profile **and** share the existing calendar membership with Deena. An unrelated authenticated user receives no owner identity and cannot access records.
- Both clients read/write `period_entries` and `cycle_settings` under that resolved Deena owner. RLS applies to every direct SELECT, INSERT, UPDATE and DELETE, including requests that supply another UUID. A separate Sarim-owned tracker cannot be created through these policies.
- The new `delete_cycle_tracker_data()` RPC deletes this one tracker atomically after UI confirmation. Both linked editors may remove individual records or all tracker data. It accepts no target UUID. Existing date, overlap, identity and stale-write protections remain.
- Removing Sarim’s calendar link removes his tracker access. Owner resolution and RLS enforce that on subsequent requests; the UI clears cached data if access refresh fails. There is no public/anonymous access, shared-calendar export, health-data analytics, browser health-data cache or shared Realtime broadcast.
- Both users’ edits are saved in Supabase. The tracker refetches on open, focus, reconnect, visibility restoration and save. Concurrent stale edits are rejected through server timestamps; no health payload is broadcast to the calendar’s shared topics.

## Dates and estimation

SQL `date` columns and `YYYY-MM-DD` strings preserve date-only information. Arithmetic uses a fixed UTC calculation zone; Today follows the planner’s Kuala Lumpur timezone. Cycle day 1 is the actual recorded start. Confirmed historical bleeding takes priority over predictions, and an ongoing entry stays open until an end is recorded.

Initial suggestions are a 28-day cycle, five-day period and 14-day luteal estimate, clearly labeled as defaults rather than personal measurements. History mode withholds a forecast until three period starts exist. Manual mode is explicit. History uses the median of the latest six intervals; a range over seven days adds uncertainty. Those are product heuristics, not validated medical thresholds. A blank optional luteal input uses the stated 14-day suggestion.

The displayed ovulation window is a three-day calendar estimate around the next forecast minus the configured luteal estimate, **not a validated fertile window**. Incompatible boundaries remain uncertain. The displayed post-bleeding follicular segment is part of the broader biological follicular phase. A passed/missed forecast does not log bleeding or reset cycle day. New actual starts reanchor predictions; stale forecast overrides are ignored. Resetting an override never changes actual history.

Calendar estimates cannot confirm ovulation, pregnancy, biological phase or safe contraceptive days. See [NHS cycle information](https://www.nhs.uk/conditions/periods/fertility-in-the-menstrual-cycle/).

## Additive migrations

| Version | Purpose |
| --- | --- |
| `202611220001_custom_event_colors.sql` | Extends existing color constraints to include hex values. |
| `202611220002_private_period_tracker.sql` | Creates the original tables, date validation and owner-only policies. |
| `202611220003_shared_period_tracker.sql` | Resolves the common owner and replaces owner-only policies with linked Deena/Sarim editor access; adds shared-tracker deletion RPC. |

| `202611220004_phase_plans_and_predictions.sql` | Adds manual phase plans, saved automatic predictions, configurable future phase durations, confirm/dismiss RPCs and reconciliation triggers. |

All previous migration files are unchanged. Version `003` does not copy, delete, rewrite or change ownership of existing records. Its access policy intentionally supersedes version `002` following the explicit request to let both accounts edit. Do not edit or replay version `002` instead of applying version `003`.

## Safe existing-project Supabase CLI workflow

Use the **existing linked combined working copy**, which retains private local migration history. A sanitized public source export deliberately excludes account-link migrations and must not be used as the history authority.

```powershell
Set-Location '<existing-combined-working-copy>'
npx.cmd --yes supabase@2 migration list --linked
npx.cmd --yes supabase@2 db push --linked --dry-run
```

Review the linked project and exact pending list. All four November 22 migrations, including `202611220004`, were applied to the existing project after explicit approval. The production dry-run should now show no pending migrations. In another approved environment, inspect actual history and apply only missing versions in order. Do not replay already-applied migrations. November 21 is already applied and must not be replayed. If older/unexpected versions appear, stop without using `migration repair`, `--include-all`, resets, seeds, roles or account provisioning.

Review the actual SQL and take/confirm the existing approved recovery checkpoint. **Only after explicit approval to apply those pending migrations to production:**

```powershell
npx.cmd --yes supabase@2 db push --linked
npx.cmd --yes supabase@2 migration list --linked
npx.cmd --yes supabase@2 db push --linked --dry-run
```

The last dry-run should show no pending migrations. Do not also paste the files into the SQL editor. The GitHub Pages workflow never applies SQL. This source update does not claim production schema application. See [Supabase migration guidance](https://supabase.com/docs/guides/deployment/database-migrations).

## Source and Pages

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run prepare:github
```

Review/copy only the allowlisted export into the existing public repository. Never include `.env.local`, Supabase local metadata, actual health records, account-link SQL, QA screenshots or generated test fixtures. Public-source guards and the Pages build check exclude those boundaries. Existing assets and `/our-time/` routing remain unchanged; the manual GitHub Actions workflow tests, builds and uploads only the static artifact.

After source publication/deployment approval, run **Actions → Test, build and deploy Our Time to Pages → Run workflow → main** and verify the intended commit and successful run. The tracker button is visible to both linked profiles; storage/shared editing requires the migrations above. Schema application is separate from frontend publication.

## Acceptance and current limits

Automated checks execute the old private policies separately, then all migrations together in embedded PostgreSQL to verify the final shared policy. The final tests cover both linked users’ owner resolution and CRUD, cross-account visibility, deletion, outsider/anonymous denial, removed membership, attempted separate ownership/profile spoofing, preserved date/overlap validation and no shared snapshot/broadcast disclosure. SDK/UI tests check server-resolved ownership and Sarim saves under Deena’s owner identity. These do not establish hosted PostgREST or live sessions.

Manually verify both real authenticated accounts after approved migration application: log a disposable period as one, reopen/refresh as the other, correct dates/settings/overrides and confirm both see the same saved data. Direct unrelated/anonymous API requests must be denied. Test membership removal only in an approved disposable environment; do not remove the live couple’s link as a test.

Visual browser checks at 320/390/768/1024/1440px and physical-device interactions remain pending. The two top sticker wrappers now let their shared multiply effect blend with the cream paper, like the bottom pair, rather than isolate it against transparent layers. Artwork bytes and the existing border, shadow and animation are preserved. Check all four stickers and the adjacent button in normal/focus/mobile layouts.


## Manually setting all four phases

**Set phases** opens a date-only editor for Menstruation, Follicular, Ovulation and Luteal. Each phase has a day count, start date and end date. Changing a duration shifts later phases; editing a date updates its day count. Plans must include all four phases in order, without overlaps, and fit within 120 days. Gaps are allowed for uncertain days. The first phase begins on the selected cycle start. Saved cycles can be reopened from the saved-plan selector, updated or removed after confirmation.

Plans are stored separately from actual bleeding. Dashboard, month inspection and timeline use this priority: actual recorded bleeding, manually set phase dates, an active automatic predicted period, then calendar estimates. Manually set ovulation dates remain **Manually set**, never biologically confirmed. Ending an open actual period may be necessary before a different phase can appear today.

**Use these durations for future cycles** stores all four inclusive day counts, sets a manual cycle length equal to their sum and uses menstruation duration for forecasts. Gaps between exact phase dates are not counted in that future duration total. This resets the next-period override. Cycle settings can reset future phase durations or change back to history; exact saved plans remain available. Custom future cycles require a 10–120-day total and a 1–30-day menstruation segment. These input limits are product validation, not a claim about biological normality.

## Automatic logging after three recorded starts

The requested threshold is **three actual recorded period starts**, including a third period that is still ongoing. Phase plans, notes, setting changes and forecasts do not count as starts. Automatic logging is enabled by default once that threshold is reached and can be paused in Cycle settings.

A separate `cycle_predictions` row is saved for the next expected period. For example, three actual starts on Jan 1, Jan 29 and Feb 26 produce a March 26 forecast for a 28-day estimate. It appears as **Predicted · Upcoming**, then **Predicted · Expected in progress** when its expected dates arrive. Because the date range is stored ahead of time, this display transition needs neither an open browser nor a background cron task. Reconciliation runs on actual-record/settings writes and authenticated refresh. No scheduled external automation or health notification is created.

The system keeps one forecast per latest actual-cycle anchor. It does not endlessly manufacture periods after an unconfirmed prediction and does not use predictions to train the cycle estimate. The next forecast follows a new actual start. Repeated refreshes and two users opening the journal do not duplicate the forecast. Pausing, correcting actual records, changing a forecast or removing a cycle supersedes relevant automatic logs rather than rewriting confirmed history. A dismissed forecast stays dismissed unless its predicted date is explicitly changed.

**Confirm / correct bleeding dates** requires an explicit action and actual dates no later than Today. Confirmation atomically creates a real period entry and links the original prediction to it. Future end dates are not prefilled as actual bleeding. **Did not happen / Dismiss** changes only the forecast. Unconfirmed automatic rows never create actual `period_entries`, reset the actual history or establish ovulation, pregnancy or contraception safety.

## New schema and access details

`cycle_phase_plans` stores one JSON date plan per cycle start. `cycle_predictions` stores predicted/dismissed/confirmed/superseded logs with a link to the actual record only after confirmation. Both have RLS for the same server-resolved linked accounts. Authenticated callers can read these tables; writes use narrowly scoped, owner-resolving RPCs. Clients cannot directly forge a prediction's confirmed status, supply a target owner, or call the internal reconciler. Phase writes and forecast actions reject stale server timestamps. Plan validation, three-start eligibility, date/overlap checks and atomic confirmation run in PostgreSQL. Delete all removes phase plans and predicted logs as well as actual entries/settings.

`202611220004` is additive and does not alter previous migration files, replay prior SQL or create actual health entries during migration. Before it is installed, the frontend keeps existing logging/settings available and disables the new controls with a schema-update message. Production application still requires separate approval. Embedded SQL/SDK/UI tests validate the new paths; live authenticated two-account and physical-device acceptance remain separate.


### November 22 release status

The phase-planning migration `202611220004` was applied after explicit approval, following a dry-run that listed only that version. Existing actual records were not populated or changed by the migration. The full local suite passed 257 tests, including the three-start threshold, idempotency, manual phase dates, corrected confirmation, stale writes, anonymous/outsider denial and compatibility while schema updates are pending. Live real-account and physical-device acceptance remains unverified.
