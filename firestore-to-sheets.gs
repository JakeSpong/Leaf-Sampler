/**
 * LEAF-SAMPLER → GOOGLE SHEETS SYNC
 * ─────────────────────────────────────────────────────────────
 * Pulls every document from the Firestore "pins" collection
 * (project: leaf-sampler) and writes it into the active sheet.
 *
 * SETUP:
 * 1. Open (or create) a Google Sheet.
 * 2. Extensions → Apps Script.
 * 3. Delete any starter code, paste this whole file in.
 * 4. Click "Save" (disk icon), name the project anything.
 * 5. Run `syncPins` once manually — it will ask for permission
 *    to connect to external services (Firestore). Approve it.
 * 6. (Optional) Set up a time-based trigger so it runs
 *    automatically — see `createTrigger()` below, run it once.
 *
 * NOTE: This works because your Firestore rules allow
 *   `allow read: if true;`
 * on the `pins` collection — no API key or auth needed for reads.
 */

const FIRESTORE_PROJECT_ID = 'leaf-sampler';
const FIRESTORE_COLLECTION = 'pins';
const SHEET_NAME            = 'Pins';

function syncPins() {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${FIRESTORE_COLLECTION}`;

  let allDocs = [];
  let pageToken = '';

  // Firestore REST API paginates at 300 docs by default — loop through pages
  do {
    const reqUrl = pageToken ? `${url}?pageToken=${pageToken}&pageSize=300` : `${url}?pageSize=300`;
    const res  = UrlFetchApp.fetch(reqUrl, { muteHttpExceptions: true });
    const code = res.getResponseCode();
    if (code !== 200) {
      throw new Error(`Firestore request failed (${code}): ${res.getContentText()}`);
    }
    const data = JSON.parse(res.getContentText());
    if (data.documents) allDocs = allDocs.concat(data.documents);
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  // Convert Firestore's typed field format into plain values
  const rows = allDocs.map(doc => {
    const f = doc.fields || {};
    return [
      getVal(f.code),
      getVal(f.lat),
      getVal(f.lng),
      getVal(f.date),
      getVal(f.cellId)
    ];
  });

  // Write to sheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  sheet.clear();
  sheet.getRange(1, 1, 1, 5).setValues([['code', 'latitude', 'longitude', 'date', 'cell_id']]);
  sheet.getRange(1, 1, 1, 5).setFontWeight('bold');

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  }

  sheet.autoResizeColumns(1, 5);

  // Log a timestamp in cell G1 so you can see when it last ran
  sheet.getRange('G1').setValue('Last synced: ' + new Date().toLocaleString());

  Logger.log(`Synced ${rows.length} pins.`);
}

// Helper: extract a plain value from a Firestore typed field object
function getVal(field) {
  if (!field) return '';
  if ('stringValue'  in field) return field.stringValue;
  if ('doubleValue'  in field) return field.doubleValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('timestampValue' in field) return field.timestampValue;
  if ('booleanValue' in field) return field.booleanValue;
  return JSON.stringify(field);
}

/**
 * Run this ONCE to set up automatic syncing every hour.
 * (Apps Script → Run → select createTrigger → Run)
 */
function createTrigger() {
  // Remove any existing triggers for syncPins first (avoid duplicates)
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'syncPins') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('syncPins')
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log('Hourly sync trigger created.');
}
