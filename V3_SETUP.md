# R&Y Studio V3 — delivery notes

## Included
- New `studio.html` management workspace, dashboard, production board, role-aware assignment controls, deadline notes, placeholder photobook editor, internal client review notes, draft quotation/invoice printer, analytics, JSON metadata backup/merge.
- Shared Light/Dark toggle and navigation on the five existing internal pages: index, jobs, normal, personalized, preview.
- Optional RLS-protected team membership/assignment schema: `migrations/001_v3_team_foundation.sql`.
- All original calculator, import, flipbook and login code retained (except shared navigation/theme links).

## IMPORTANT limitations (not fully implemented)
- Team-wide jobs are **not** yet migrated. Legacy `jobs.html` syncs owner-scoped data and may delete rows missing from its local queue. Do not relax its ownership rules or replace its `user_id` filter without redesigning the sync logic. Team assignments can be saved by admin only for jobs already visible to that admin under existing jobs RLS. Artist visibility of other owners' jobs is not provided by this migration.
- Deadlines, review notes, draft invoices, and history are currently **per-browser, per-account localStorage**; they do not sync across devices or team members. Back them up using the V3 JSON export.
- Visual layout builder creates placeholders, not actual image uploads, drag-and-drop editing, production-quality flipbook animations, or print-ready PDF.
- Existing client flipbook continues to work as before; no new public client portal or public sharing links are created.
- Analytics reports counts of visible jobs only; earnings are draft quotation totals, not payment data.
- AI photo grouping, team notifications, full revision/version history, automatic workload recommendation, and production PDF export are NOT included.

## Safe setup
1. Back up your existing Supabase `jobs` table and export legacy jobs first.
2. Extract this ZIP in a new directory. Keep a copy of your old folder.
3. Open `studio.html` through your usual local server, log in with existing credentials, and check legacy pages.
4. To enable membership/assignment tables, review and run `migrations/001_v3_team_foundation.sql` in Supabase SQL Editor. Bootstrap one workspace/admin using the commented SQL with the actual auth user UUID, then add artists. Do not guess IDs.
5. Check Supabase table RLS policies before any production deployment. Migration does not alter existing jobs policies.
6. Deploy only after local testing. If using Git/Vercel: `git add .`, `git commit -m "Add R&Y V3 studio foundation"`, `git push`.

## Data safety
- No service-role key included. Existing publishable Supabase key is preserved.
- No automatic data migrations, destructive deletes, or live database operations were performed.
- The `studio.html` dashboard reads jobs and updates statuses only for rows owned by the current user. Existing jobs page behavior remains unchanged.
- New per-account backup JSON cannot restore Supabase job records; it only merges local V3 metadata.
