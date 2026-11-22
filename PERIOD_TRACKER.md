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

All previous migration files are unchanged. Version `003` does not copy, delete, rewrite or change ownership of existing records. Its access policy intentionally supersedes version `002` following the explicit request to let both accounts edit. Do not edit or replay version `002` instead of applying version `003`.

## Safe existing-project Supabase CLI workflow

Use the **existing linked combined working copy**, which retains private local migration history. A sanitized public source export deliberately excludes account-link migrations and must not be used as the history authority.

```powershell
Set-Location '<existing-combined-working-copy>'
npx.cmd --yes supabase@2 migration list --linked
npx.cmd --yes supabase@2 db push --linked --dry-run
```

Review the linked project and exact pending list. The only expected application migrations for this feature are the unapplied members of `202611220001`, `202611220002`, `202611220003`, in that order. If the first two were already applied, only `202611220003` should be pending. November 21 is already applied and must not be replayed. If older/unexpected versions appear, stop without using `migration repair`, `--include-all`, resets, seeds, roles or account provisioning.

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
