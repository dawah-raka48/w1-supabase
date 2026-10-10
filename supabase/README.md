# W1 Supabase PDF Migration (Preparation)

This folder adds a non-destructive migration path for the existing W1 weekly reports system.

## Important
- The current GitHub Pages application and its Google Apps Script API remain unchanged.
- The source Google Sheet is read-only for this migration script.
- Original PDFs remain in Google Drive.
- Files are copied to a private Supabase Storage bucket; they are not moved or deleted.
- A mapping/status row is saved in public.report_file_migrations for each source spreadsheet row.
- Do not expose SUPABASE_SERVICE_ROLE_KEY in GitHub Pages or any client-side JavaScript.

## Files
- supabase/migration.sql: creates the private bucket and migration mapping table.
- supabase/google-apps-script/W1PdfMigration.gs: migration runner for Apps Script.

## Runbook
1. Create or select the Supabase project intended for W1.
2. Run supabase/migration.sql in Supabase SQL Editor.
3. Create a standalone Google Apps Script project under an account with access to the source Google Sheet and all linked Drive files. Paste the .gs contents.
4. Set Script Properties: SPREADSHEET_ID, SHEET_NAME, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: SUPABASE_BUCKET (defaults to weekly-reports-pdf).
5. Run previewW1PdfMigration(). Check logs for detected columns and count of recognized Drive links.
6. If the PDF column is not detected, edit HEADER_ALIASES.pdf to include the exact existing column heading. Repeat preview.
7. Run migrateW1PdfBatch() repeatedly. Each execution handles up to 10 linked rows and can be safely retried. Review Apps Script execution logs and report_file_migrations.
8. Before app cutover, verify migrated count, compare files, and add the app's authenticated read policy for the private bucket based on the actual roles/department model. The current application is not switched to Supabase by these files.

## Not automatic yet
- Supabase project URL/keys and exact Google Sheet/tab/column names have not been configured in this repository.
- The runner creates a migration map rather than guessing the production reports table schema.
- No source data is deleted or modified. Production pages should be switched only in a separate tested change after migration verification.
