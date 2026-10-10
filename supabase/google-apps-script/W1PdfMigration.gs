/**
 * W1 -> Supabase Storage PDF migration (non-destructive).
 *
 * Setup Script Properties:
 * SPREADSHEET_ID, SHEET_NAME, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: SUPABASE_BUCKET (defaults to weekly-reports-pdf)
 *
 * Run previewW1PdfMigration() first, then migrateW1PdfBatch() repeatedly.
 * Each batch processes at most 10 linked rows.
 *
 * This script never deletes Drive files and never edits the source Sheet.
 */
const W1_MIGRATION = {
  DEFAULT_BUCKET: 'weekly-reports-pdf',
  BATCH_SIZE: 10,
  TABLE: 'report_file_migrations',
  HEADER_ALIASES: {
    reportId: ['report_id', 'report id', 'رقم التقرير', 'معرف التقرير', 'كود التقرير', 'id'],
    employee: ['employee', 'employee_name', 'اسم الموظف', 'الموظف', 'اسم مقدم التقرير', 'اسم المستخدم'],
    department: ['department', 'department_name', 'القسم', 'اسم القسم'],
    date: ['date', 'report_date', 'التاريخ', 'تاريخ التقرير', 'تاريخ الرفع'],
    pdf: ['pdf', 'pdf_url', 'file_url', 'رابط pdf', 'رابط الملف', 'رابط التقرير', 'الملف', 'رابط ملف التقرير']
  }
};

function w1MigrationProps_() {
  const p = PropertiesService.getScriptProperties();
  const cfg = {
    spreadsheetId: p.getProperty('SPREADSHEET_ID'),
    sheetName: p.getProperty('SHEET_NAME'),
    supabaseUrl: (p.getProperty('SUPABASE_URL') || '').replace(/\/$/, ''),
    serviceKey: p.getProperty('SUPABASE_SERVICE_ROLE_KEY'),
    bucket: p.getProperty('SUPABASE_BUCKET') || W1_MIGRATION.DEFAULT_BUCKET
  };
  const names = {
    spreadsheetId: 'SPREADSHEET_ID', sheetName: 'SHEET_NAME',
    supabaseUrl: 'SUPABASE_URL', serviceKey: 'SUPABASE_SERVICE_ROLE_KEY'
  };
  Object.keys(names).forEach(k => { if (!cfg[k]) throw new Error('Missing Script Property: ' + names[k]); });
  return cfg;
}

function previewW1PdfMigration() {
  const cfg = w1MigrationProps_();
  const sheet = SpreadsheetApp.openById(cfg.spreadsheetId).getSheetByName(cfg.sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + cfg.sheetName);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) { Logger.log('No data rows found.'); return; }
  const map = w1MapHeaders_(values[0]);
  Logger.log('Detected columns: ' + JSON.stringify(map));
  if (map.pdf < 0) throw new Error('Could not detect PDF URL column. Add its exact header to HEADER_ALIASES.pdf.');
  let withLinks = 0, withoutLinks = 0, invalidLinks = 0;
  for (let i = 1; i < values.length; i++) {
    const url = String(values[i][map.pdf] || '').trim();
    if (!url) { withoutLinks++; continue; }
    if (!w1DriveId_(url)) { invalidLinks++; continue; }
    withLinks++;
  }
  Logger.log(JSON.stringify({
    sheet: cfg.sheetName, rows: values.length - 1, rowsWithDriveLinks: withLinks,
    rowsWithoutLinks: withoutLinks, rowsWithUnrecognizedLinks: invalidLinks,
    bucket: cfg.bucket, sourceWillBeModified: false, driveFilesWillBeDeleted: false
  }, null, 2));
}

function migrateW1PdfBatch() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Another migration batch is running.');
  try {
    const cfg = w1MigrationProps_();
    const sheet = SpreadsheetApp.openById(cfg.spreadsheetId).getSheetByName(cfg.sheetName);
    if (!sheet) throw new Error('Sheet not found: ' + cfg.sheetName);
    const values = sheet.getDataRange().getDisplayValues();
    if (values.length < 2) return { processed: 0, message: 'No data rows.' };
    const map = w1MapHeaders_(values[0]);
    if (map.pdf < 0) throw new Error('PDF URL column not found. Run preview and configure HEADER_ALIASES.');
    let processed = 0, migrated = 0, skipped = 0, errors = 0;
    for (let i = 1; i < values.length && processed < W1_MIGRATION.BATCH_SIZE; i++) {
      const row = values[i];
      const url = String(row[map.pdf] || '').trim();
      if (!url) continue;
      const rowNumber = i + 1;
      const driveId = w1DriveId_(url);
      const reportId = w1Value_(row, map.reportId) || 'row-' + rowNumber;
      if (!driveId) {
        w1SaveMigration_(cfg, {
          source_sheet_id: cfg.spreadsheetId, source_sheet_name: cfg.sheetName,
          source_sheet_row: rowNumber, report_id: reportId,
          employee_name: w1Value_(row, map.employee), department: w1Value_(row, map.department),
          report_date: w1Value_(row, map.date), source_drive_file_id: '',
          storage_path: '', migration_status: 'error', error_message: 'Unrecognized Google Drive URL'
        });
        errors++; processed++; continue;
      }
      const existing = w1GetMigration_(cfg, rowNumber);
      if (existing && existing.migration_status === 'migrated') { skipped++; processed++; continue; }
      try {
        const file = DriveApp.getFileById(driveId);
        const blob = file.getBlob().setContentType('application/pdf');
        const filename = w1SafeName_(file.getName() || ('report-' + rowNumber + '.pdf'));
        const storagePath = w1SafeName_(cfg.spreadsheetId) + '/' +
          w1SafeName_(cfg.sheetName) + '/row-' + rowNumber + '-' +
          w1SafeName_(reportId) + '-' + filename;
        w1UploadPdf_(cfg, storagePath, blob);
        w1SaveMigration_(cfg, {
          source_sheet_id: cfg.spreadsheetId, source_sheet_name: cfg.sheetName,
          source_sheet_row: rowNumber, report_id: reportId,
          employee_name: w1Value_(row, map.employee), department: w1Value_(row, map.department),
          report_date: w1Value_(row, map.date), source_drive_file_id: driveId,
          storage_path: storagePath, migration_status: 'migrated',
          migrated_at: new Date().toISOString(), error_message: null
        });
        migrated++;
      } catch (err) {
        w1SaveMigration_(cfg, {
          source_sheet_id: cfg.spreadsheetId, source_sheet_name: cfg.sheetName,
          source_sheet_row: rowNumber, report_id: reportId,
          employee_name: w1Value_(row, map.employee), department: w1Value_(row, map.department),
          report_date: w1Value_(row, map.date), source_drive_file_id: driveId,
          storage_path: '', migration_status: 'error',
          error_message: String(err && err.message ? err.message : err).slice(0, 1500)
        });
        errors++;
      }
      processed++;
    }
    const result = { processed: processed, migrated: migrated, skipped: skipped, errors: errors };
    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function w1MapHeaders_(headers) {
  const norm = headers.map(h => String(h || '').trim().toLowerCase().replace(/[\s_\-]+/g, ' '));
  const result = {};
  Object.keys(W1_MIGRATION.HEADER_ALIASES).forEach(key => {
    const aliases = W1_MIGRATION.HEADER_ALIASES[key].map(a => a.toLowerCase().replace(/[\s_\-]+/g, ' '));
    result[key] = norm.findIndex(h => aliases.indexOf(h) >= 0);
  });
  return result;
}
function w1Value_(row, index) { return index >= 0 ? String(row[index] || '').trim() : ''; }

function w1DriveId_(url) {
  const s = String(url || '').trim();
  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/uc\?[^#]*id=([a-zA-Z0-9_-]+)/,
    /docs\.google\.com\/[^/]+\/d\/([a-zA-Z0-9_-]+)/
  ];
  for (let i = 0; i < patterns.length; i++) { const m = s.match(patterns[i]); if (m) return m[1]; }
  const generic = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return generic ? generic[1] : '';
}
function w1SafeName_(value) {
  return String(value || 'file').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'file';
}
function w1SupabaseHeaders_(cfg, extra) {
  return Object.assign({ apikey: cfg.serviceKey, Authorization: 'Bearer ' + cfg.serviceKey }, extra || {});
}
function w1UploadPdf_(cfg, path, blob) {
  const url = cfg.supabaseUrl + '/storage/v1/object/' + encodeURIComponent(cfg.bucket) + '/' +
    path.split('/').map(encodeURIComponent).join('/');
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: w1SupabaseHeaders_(cfg, { 'Content-Type': 'application/pdf', 'x-upsert': 'true' }),
    payload: blob.getBytes(), muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('Storage upload failed (' + code + '): ' + response.getContentText().slice(0, 500));
}
function w1GetMigration_(cfg, rowNumber) {
  const query = '?select=migration_status&source_sheet_id=eq.' + encodeURIComponent(cfg.spreadsheetId) +
    '&source_sheet_name=eq.' + encodeURIComponent(cfg.sheetName) +
    '&source_sheet_row=eq.' + rowNumber + '&limit=1';
  const response = UrlFetchApp.fetch(cfg.supabaseUrl + '/rest/v1/' + W1_MIGRATION.TABLE + query, {
    method: 'get', headers: w1SupabaseHeaders_(cfg, { Accept: 'application/json' }), muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('Migration status lookup failed (' + code + '): ' + response.getContentText().slice(0, 300));
  const data = JSON.parse(response.getContentText() || '[]');
  return data.length ? data[0] : null;
}
function w1SaveMigration_(cfg, record) {
  record.updated_at = new Date().toISOString();
  const url = cfg.supabaseUrl + '/rest/v1/' + W1_MIGRATION.TABLE +
    '?on_conflict=source_sheet_id,source_sheet_name,source_sheet_row';
  const response = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    headers: w1SupabaseHeaders_(cfg, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    payload: JSON.stringify(record), muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('Saving migration record failed (' + code + '): ' + response.getContentText().slice(0, 500));
}
