const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const db = require('./src/db/database');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    frame: false, titleBarStyle: 'hidden',
    backgroundColor: '#0A0A12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'launch.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(() => {
  db.initDatabase(app);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── Navigation ───────────────────────────────────────────────────────────────
const PAGES = {
  launch: 'launch.html', projects: 'projects.html',
  operations: 'operations.html', 'operation-detail': 'operation-detail.html',
  'record-view': 'record-view.html', about: 'about.html',
  editor: 'editor.html',
  'single-batch-record': 'single-batch-record.html',
  'single-batch-default': 'single-batch-default.html',
};
let autoMaximized = false;   // tracks if we maximized on behalf of a page

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.on('nav:navigate', (e, page, params) => {
  const file = PAGES[page]; if (!file) return;

  // Restore window size when leaving full-screen pages
  if (autoMaximized && page !== 'record-view' && page !== 'single-batch-record' && page !== 'single-batch-default') {
    mainWindow.unmaximize();
    autoMaximized = false;
  }

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', file))
    .then(() => {
      if (params) mainWindow.webContents.send('nav:page-data', params);
      // Auto-maximize for record/view time study
      if ((page === 'record-view' || page === 'single-batch-record' || page === 'single-batch-default') && !mainWindow.isMaximized()) {
        mainWindow.maximize();
        autoMaximized = true;
      }
    });
});

// ── Window controls ──────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow.minimize());
ipcMain.on('window:ensure-maximized', () => { if (!mainWindow.isMaximized()) { mainWindow.maximize(); autoMaximized = true; } });
ipcMain.on('window:toggle-fullscreen', () => mainWindow.setFullScreen(!mainWindow.isFullScreen()));
ipcMain.on('window:maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window:close',    () => mainWindow.close());

// ── Sessions ─────────────────────────────────────────────────────────────────
ipcMain.handle('db:begin-session',       () => db.beginSession());
ipcMain.handle('db:get-latest-session',  () => db.getLatestSession());

// ── Projects ─────────────────────────────────────────────────────────────────
ipcMain.handle('db:get-projects',    ()         => db.getAllProjects());
ipcMain.handle('db:get-project',     (_e, id)   => db.getProjectById(id));
ipcMain.handle('db:create-project',  (_e, data) => db.createProject(data));
ipcMain.handle('db:update-project',  (_e, id, data) => db.updateProject(id, data));
ipcMain.handle('db:delete-project',  (_e, id)   => db.deleteProject(id));

// ── Operations ────────────────────────────────────────────────────────────────
ipcMain.handle('db:get-operations',     (_e, pid)      => db.getOperationsByProject(pid));
ipcMain.handle('db:get-operation',      (_e, id)       => db.getOperationById(id));
ipcMain.handle('db:create-operation',   (_e, pid, data)=> db.createOperation(pid, data));
ipcMain.handle('db:update-operation',   (_e, id, data) => db.updateOperation(id, data));
ipcMain.handle('db:delete-operation',   (_e, id)       => db.deleteOperation(id));
ipcMain.handle('db:reorder-operations', (_e, pid, ids) => db.reorderOperations(pid, ids));
ipcMain.handle('db:get-distinct-values',(_e, field)    => db.getDistinctValues(field));
ipcMain.handle('db:get-distinct-persons',(_e, role)    => db.getDistinctPersonValues(role));

// ── Timestamps ────────────────────────────────────────────────────────────────
ipcMain.handle('db:get-timestamps',    (_e, oid)                      => db.getTimestampsByOperation(oid));
ipcMain.handle('db:create-timestamp',  (_e, oid, notes, lid, obs, op, ws, stype, bsz, sfocus) => db.createTimestamp(oid, notes, lid, obs, op, ws, stype, bsz, sfocus));
ipcMain.handle('db:delete-timestamp',  (_e, id)                       => db.deleteTimestamp(id));

// ── Recordings ───────────────────────────────────────────────────────────────
ipcMain.handle('db:complete-timestamp', (_e, tsId) => db.completeTimestamp(tsId));
ipcMain.handle('db:save-recording', (_e, tsId, cells, complete) => db.saveRecording(tsId, cells, complete));
ipcMain.handle('db:get-recording',  (_e, tsId)        => db.getRecording(tsId));

// ── Batch Observations ────────────────────────────────────────────────────────
ipcMain.handle('db:save-batch-recording', (_e, tsId, obs) => db.saveBatchRecording(tsId, obs));
ipcMain.handle('db:get-batch-recording',  (_e, tsId)      => db.getBatchRecording(tsId));

// ── Editor Data ───────────────────────────────────────────────────────────────
ipcMain.handle('db:get-editor-data',  (_e, tsId)       => db.getEditorData(tsId));
ipcMain.handle('db:save-editor-data', (_e, tsId, rows) => db.saveEditorData(tsId, rows));

// ── Excel Export ──────────────────────────────────────────────────────────────
ipcMain.handle('export:timestudy', async (_e, payload) => {
  const { steps, cells, totalObs, tsId, opName, version, project, operation } = payload;

  // Fetch timestamp for operator + created_at
  const ts = tsId ? db.getTimestampById(tsId) : null;
  const operator  = ts ? (ts.operator  || '') : '';
  const createdAt = ts ? (ts.created_at || '') : '';

  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Time Observation Form');

  // ── Column layout ──────────────────────────────────────────────────────────
  // A   = No
  // B–E = Step / Procedure  (frozen)
  // F…  = Obs 1 … totalObs
  // then Lowest Elemental Time, Adjustment, Adjusted Elemental Time, VA, NA, NNA
  const COL_NO     = 1;
  const COL_STEP_S = 2;   // B
  const COL_STEP_E = 5;   // E  ← freeze boundary
  const COL_OBS1   = 6;   // F
  const COL_OBSL   = 5 + totalObs;
  const COL_LOW    = 6 + totalObs;
  const COL_ADJ    = 7 + totalObs;
  const COL_ADJE   = 8 + totalObs;
  const COL_VA     = 9  + totalObs;
  const COL_NA     = 10 + totalObs;
  const COL_NNA    = 11 + totalObs;
  const TOTAL_COLS = COL_NNA;

  // Column widths
  ws.getColumn(COL_NO).width = 5;
  ws.getColumn(2).width = 22; ws.getColumn(3).width = 8;
  ws.getColumn(4).width = 8;  ws.getColumn(5).width = 8;
  for (let o = 0; o < totalObs; o++) ws.getColumn(COL_OBS1 + o).width = 10;
  ws.getColumn(COL_LOW).width  = 18;
  ws.getColumn(COL_ADJ).width  = 13;
  ws.getColumn(COL_ADJE).width = 20;
  ws.getColumn(COL_VA).width   = 7;
  ws.getColumn(COL_NA).width   = 7;
  ws.getColumn(COL_NNA).width  = 7;

  // ── Style constants ────────────────────────────────────────────────────────
  const grayFill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFD9D9D9' } };
  const thinBdr   = { style:'thin' };
  const borders   = { top:thinBdr, left:thinBdr, bottom:thinBdr, right:thinBdr };
  const ctr       = { horizontal:'center', vertical:'middle', wrapText:true };
  const lft       = { horizontal:'left',   vertical:'middle', wrapText:true };
  const rgt       = { horizontal:'right',  vertical:'middle' };

  function sc(row, col, val, { font, align, fill } = {}) {
    const c = ws.getCell(row, col);
    c.value = val !== undefined && val !== null ? val : '';
    c.font      = font  || { size:10 };
    c.alignment = align || ctr;
    if (fill) c.fill = fill;
    c.border = borders;
    return c;
  }
  function mrg(r1,c1,r2,c2) { try { ws.mergeCells(r1,c1,r2,c2); } catch {} }

  // ── Row 1 – Title ─────────────────────────────────────────────────────────
  ws.getRow(1).height = 30;
  mrg(1, COL_NO, 1, TOTAL_COLS);
  sc(1, COL_NO, 'TIME OBSERVATION FORM', {
    font: { bold:true, size:16 }, align: ctr, fill: grayFill });

  // ── Row 2 – thin spacer (no borders) ──────────────────────────────────────
  ws.getRow(2).height = 6;

  // ── Rows 3–6 – header info ────────────────────────────────────────────────
  [3,4,5,6].forEach(r => { ws.getRow(r).height = 22; });

  const boldSm = { bold:true, size:10 };
  const normSm = { size:10 };

  // Left block: A = label, B–E merged = value
  function leftLbl(row, text) {
    sc(row, COL_NO, text, { font:boldSm, align:lft, fill:grayFill });
  }
  function leftVal(row, text) {
    mrg(row, COL_STEP_S, row, COL_STEP_E);
    sc(row, COL_STEP_S, text||'', { font:normSm, align:lft });
  }
  leftLbl(3, 'Project Name');   leftVal(3, project   ? project.name       : '');
  leftLbl(4, 'Project Owner');  leftVal(4, project   ? project.owner_name : '');
  leftLbl(5, 'Operation Name'); leftVal(5, opName    || (operation ? operation.name : ''));
  leftLbl(6, 'Department');     leftVal(6, operation ? operation.department : '');

  // Middle block – obs columns split: label=F–G, value=H–last_obs
  const MID_LBL_E = COL_OBS1 + 1;  // G
  const MID_VAL_S = COL_OBS1 + 2;  // H
  const MID_VAL_E = COL_OBSL;

  function midLbl(row, text) {
    mrg(row, COL_OBS1, row, MID_LBL_E);
    sc(row, COL_OBS1, text, { font:boldSm, align:lft, fill:grayFill });
  }
  function midVal(row, text) {
    if (MID_VAL_S <= MID_VAL_E) mrg(row, MID_VAL_S, row, MID_VAL_E);
    sc(row, MID_VAL_S, text||'', { font:normSm, align:lft });
  }

  const sups = operation && operation.supervisors ? operation.supervisors.join(', ') : '';
  const engs = operation && operation.engineers   ? operation.engineers.join(', ')   : '';

  midLbl(3, 'Supervisor');    midVal(3, sups);
  midLbl(4, 'Engineer');      midVal(4, engs);
  midLbl(5, 'Shift');         midVal(5, operation ? operation.shift : '');

  // Row 6 middle: Shift Hours + Shift Seconds side by side
  if (totalObs >= 4) {
    const midPt = COL_OBS1 + Math.floor((MID_VAL_E - COL_OBS1) / 2);
    mrg(6, COL_OBS1, 6, MID_LBL_E);
    sc(6, COL_OBS1, 'Shift Hours', { font:boldSm, align:lft, fill:grayFill });
    mrg(6, MID_VAL_S, 6, midPt);
    sc(6, MID_VAL_S, operation ? (operation.shift_hours||'') : '', { font:normSm, align:lft });
    mrg(6, midPt+1, 6, midPt+2);
    sc(6, midPt+1, 'Shift Sec.', { font:boldSm, align:lft, fill:grayFill });
    mrg(6, midPt+3, 6, MID_VAL_E);
    sc(6, midPt+3, operation ? (operation.shift_seconds||'') : '', { font:normSm, align:lft });
  } else {
    midLbl(6, 'Shift Hours'); midVal(6, operation ? operation.shift_hours : '');
  }

  // Right block: COL_LOW = label, COL_ADJ–COL_NNA merged = value
  function rgtLbl(row, text) {
    sc(row, COL_LOW, text, { font:boldSm, align:lft, fill:grayFill });
  }
  function rgtVal(row, text) {
    mrg(row, COL_ADJ, row, COL_NNA);
    sc(row, COL_ADJ, text||'', { font:normSm, align:lft });
  }

  const dt = createdAt ? new Date(createdAt) : new Date();
  const dateStr = dt.toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' });
  const timeStr = dt.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true });

  rgtLbl(3, 'Time Study Date'); rgtVal(3, dateStr);
  rgtLbl(4, 'Time Study Time'); rgtVal(4, timeStr);
  rgtLbl(5, 'Observations');    rgtVal(5, String(totalObs));
  rgtLbl(6, 'Operator');        rgtVal(6, operator);

  // ── Row 7 – thin spacer ───────────────────────────────────────────────────
  ws.getRow(7).height = 6;

  // ── Row 8 – Column headers ────────────────────────────────────────────────
  ws.getRow(8).height = 36;
  sc(8, COL_NO, 'No', { font:boldSm, fill:grayFill });
  mrg(8, COL_STEP_S, 8, COL_STEP_E);
  sc(8, COL_STEP_S, 'Step / Procedure', { font:boldSm, fill:grayFill });
  for (let o = 1; o <= totalObs; o++) {
    sc(8, COL_OBS1+o-1, o, { font:boldSm, fill:grayFill });
  }
  sc(8, COL_LOW,  'Lowest\nElemental\nTime',      { font:{bold:true,size:9}, fill:grayFill });
  sc(8, COL_ADJ,  'Adjustment',                   { font:{bold:true,size:9}, fill:grayFill });
  sc(8, COL_ADJE, 'Adjusted\nElemental\nTime',    { font:{bold:true,size:9}, fill:grayFill });
  sc(8, COL_VA,   'VA',  { font:boldSm, fill:grayFill });
  sc(8, COL_NA,   'NA',  { font:boldSm, fill:grayFill });
  sc(8, COL_NNA,  'NNA', { font:boldSm, fill:grayFill });

  // ── Data rows (2 per step) ────────────────────────────────────────────────
  const dataMap = {};
  cells.forEach(c => {
    if (!dataMap[c.step_order]) dataMap[c.step_order] = {};
    dataMap[c.step_order][c.obs_num] = c;
  });

  const BASE_ROW  = 9;
  const cycleTotals = {};

  steps.forEach((step, idx) => {
    const stepNum = idx + 1;
    const r1 = BASE_ROW + idx * 2;
    const r2 = r1 + 1;
    ws.getRow(r1).height = 14;
    ws.getRow(r2).height = 14;

    // Merge No and Step cells across both sub-rows
    mrg(r1, COL_NO,     r2, COL_NO);
    mrg(r1, COL_STEP_S, r2, COL_STEP_E);

    sc(r1, COL_NO,     stepNum,         { font:{ bold:true, size:10 }, align:ctr });
    sc(r1, COL_STEP_S, step.step_text,  { font:normSm, align:lft });

    // Borders on the hidden halves of merged cells
    ws.getCell(r2, COL_NO).border = borders;
    for (let ci = COL_STEP_S; ci <= COL_STEP_E; ci++) ws.getCell(r2, ci).border = borders;

    for (let o = 1; o <= totalObs; o++) {
      const col = COL_OBS1 + o - 1;
      const rec = dataMap[stepNum] && dataMap[stepNum][o];
      if (rec) {
        sc(r1, col, parseFloat((rec.continuous_ms/1000).toFixed(2)),
           { font:{ bold:true, size:10 }, align:rgt });
        sc(r2, col, parseFloat((rec.elemental_ms /1000).toFixed(2)),
           { font:{ bold:true, size:10, color:{ argb:'FFCC0000' } }, align:rgt });
        cycleTotals[o] = (cycleTotals[o] || 0) + rec.elemental_ms;
      } else {
        sc(r1, col, '', { align:ctr }); sc(r2, col, '', { align:ctr });
      }
    }
    // Analysis cols – leave blank for manual fill
    [COL_LOW, COL_ADJ, COL_ADJE, COL_VA, COL_NA, COL_NNA].forEach(col => {
      sc(r1, col, '', { align:ctr }); sc(r2, col, '', { align:ctr });
    });
  });

  // ── Time for 1 Cycle row ──────────────────────────────────────────────────
  const cycleRow = BASE_ROW + steps.length * 2;
  ws.getRow(cycleRow).height = 20;
  sc(cycleRow, COL_NO, '', { font:boldSm, fill:grayFill });
  mrg(cycleRow, COL_STEP_S, cycleRow, COL_STEP_E);
  sc(cycleRow, COL_STEP_S, 'Time for 1 Cycle', { font:boldSm, align:lft, fill:grayFill });
  for (let o = 1; o <= totalObs; o++) {
    const val = cycleTotals[o] != null
      ? parseFloat((cycleTotals[o]/1000).toFixed(2)) : '';
    sc(cycleRow, COL_OBS1+o-1, val, { font:boldSm, fill:grayFill, align:rgt });
  }
  [COL_LOW, COL_ADJ, COL_ADJE, COL_VA, COL_NA, COL_NNA].forEach(col =>
    sc(cycleRow, col, '', { font:boldSm, fill:grayFill, align:ctr })
  );

  // ── Freeze panes: rows 1–8, columns A–E ───────────────────────────────────
  ws.views = [{ state:'frozen', xSplit:5, ySplit:8, activeCell:'F9' }];

  // ── Save dialog ───────────────────────────────────────────────────────────
  const safeName = (opName||'Export').replace(/[^a-zA-Z0-9 _-]/g,'_');
  const { filePath } = await dialog.showSaveDialog({
    title: 'Export Time Study',
    defaultPath: `TimeStudy_${safeName}_v${version||1}.xlsx`,
    filters: [{ name:'Excel Workbook', extensions:['xlsx'] }],
  });
  if (!filePath) return { cancelled: true };
  await wb.xlsx.writeFile(filePath);
  return { success:true, filePath };
});

// ── Editor Export ─────────────────────────────────────────────────────────────
ipcMain.handle('export:editor-timestudy', async (_e, payload) => {
  const { steps, cells, editorRows, totalObs, tsId, opName, version, project, operation } = payload;

  const ts = tsId ? db.getTimestampById(tsId) : null;
  const operator  = ts ? (ts.operator  || '') : '';
  const createdAt = ts ? (ts.created_at || '') : '';

  // Build editor data map: step_order → row
  const edMap = {};
  (editorRows || []).forEach(r => { edMap[r.step_order] = r; });

  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Time Observation Form');

  const COL_NO     = 1;
  const COL_STEP_S = 2;
  const COL_STEP_E = 5;
  const COL_OBS1   = 6;
  const COL_OBSL   = 5 + totalObs;
  const COL_LOW    = 6 + totalObs;
  const COL_ADJ    = 7 + totalObs;
  const COL_ADJE   = 8 + totalObs;
  const COL_VA     = 9  + totalObs;
  const COL_NA     = 10 + totalObs;
  const COL_NNA    = 11 + totalObs;
  const TOTAL_COLS = COL_NNA;

  ws.getColumn(COL_NO).width = 5;
  ws.getColumn(2).width = 22; ws.getColumn(3).width = 8;
  ws.getColumn(4).width = 8;  ws.getColumn(5).width = 8;
  for (let o = 0; o < totalObs; o++) ws.getColumn(COL_OBS1 + o).width = 10;
  ws.getColumn(COL_LOW).width  = 18;
  ws.getColumn(COL_ADJ).width  = 13;
  ws.getColumn(COL_ADJE).width = 20;
  ws.getColumn(COL_VA).width   = 7;
  ws.getColumn(COL_NA).width   = 7;
  ws.getColumn(COL_NNA).width  = 7;

  const grayFill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFD9D9D9' } };
  const thinBdr   = { style:'thin' };
  const borders   = { top:thinBdr, left:thinBdr, bottom:thinBdr, right:thinBdr };
  const ctr = { horizontal:'center', vertical:'middle', wrapText:true };
  const lft = { horizontal:'left',   vertical:'middle', wrapText:true };
  const rgt = { horizontal:'right',  vertical:'middle' };
  const boldSm = { bold:true, size:10 };
  const normSm = { size:10 };

  function sc(row, col, val, { font, align, fill } = {}) {
    const c = ws.getCell(row, col);
    c.value = val !== undefined && val !== null ? val : '';
    c.font      = font  || { size:10 };
    c.alignment = align || ctr;
    if (fill) c.fill = fill;
    c.border = borders;
    return c;
  }
  function mrg(r1,c1,r2,c2) { try { ws.mergeCells(r1,c1,r2,c2); } catch {} }

  ws.getRow(1).height = 30;
  mrg(1, COL_NO, 1, TOTAL_COLS);
  sc(1, COL_NO, 'TIME OBSERVATION FORM', { font:{ bold:true, size:16 }, align:ctr, fill:grayFill });
  ws.getRow(2).height = 6;
  [3,4,5,6].forEach(r => { ws.getRow(r).height = 22; });

  function leftLbl(row, text) { sc(row, COL_NO, text, { font:boldSm, align:lft, fill:grayFill }); }
  function leftVal(row, text) { mrg(row, COL_STEP_S, row, COL_STEP_E); sc(row, COL_STEP_S, text||'', { font:normSm, align:lft }); }
  leftLbl(3, 'Project Name');   leftVal(3, project   ? project.name       : '');
  leftLbl(4, 'Project Owner');  leftVal(4, project   ? project.owner_name : '');
  leftLbl(5, 'Operation Name'); leftVal(5, opName    || (operation ? operation.name : ''));
  leftLbl(6, 'Department');     leftVal(6, operation ? operation.department : '');

  const MID_LBL_E = COL_OBS1 + 1;
  const MID_VAL_S = COL_OBS1 + 2;
  const MID_VAL_E = COL_OBSL;
  function midLbl(row, text) { mrg(row, COL_OBS1, row, MID_LBL_E); sc(row, COL_OBS1, text, { font:boldSm, align:lft, fill:grayFill }); }
  function midVal(row, text) { if (MID_VAL_S <= MID_VAL_E) mrg(row, MID_VAL_S, row, MID_VAL_E); sc(row, MID_VAL_S, text||'', { font:normSm, align:lft }); }
  const sups = operation && operation.supervisors ? operation.supervisors.join(', ') : '';
  const engs = operation && operation.engineers   ? operation.engineers.join(', ')   : '';
  midLbl(3, 'Supervisor'); midVal(3, sups);
  midLbl(4, 'Engineer');   midVal(4, engs);
  midLbl(5, 'Shift');      midVal(5, operation ? operation.shift : '');
  if (totalObs >= 4) {
    const midPt = COL_OBS1 + Math.floor((MID_VAL_E - COL_OBS1) / 2);
    mrg(6, COL_OBS1, 6, MID_LBL_E); sc(6, COL_OBS1, 'Shift Hours', { font:boldSm, align:lft, fill:grayFill });
    mrg(6, MID_VAL_S, 6, midPt);    sc(6, MID_VAL_S, operation ? (operation.shift_hours||'') : '', { font:normSm, align:lft });
    mrg(6, midPt+1, 6, midPt+2);    sc(6, midPt+1, 'Shift Sec.', { font:boldSm, align:lft, fill:grayFill });
    mrg(6, midPt+3, 6, MID_VAL_E);  sc(6, midPt+3, operation ? (operation.shift_seconds||'') : '', { font:normSm, align:lft });
  } else { midLbl(6, 'Shift Hours'); midVal(6, operation ? operation.shift_hours : ''); }

  function rgtLbl(row, text) { sc(row, COL_LOW, text, { font:boldSm, align:lft, fill:grayFill }); }
  function rgtVal(row, text) { mrg(row, COL_ADJ, row, COL_NNA); sc(row, COL_ADJ, text||'', { font:normSm, align:lft }); }
  const dt = createdAt ? new Date(createdAt) : new Date();
  const dateStr = dt.toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' });
  const timeStr = dt.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true });
  rgtLbl(3, 'Time Study Date'); rgtVal(3, dateStr);
  rgtLbl(4, 'Time Study Time'); rgtVal(4, timeStr);
  rgtLbl(5, 'Observations');    rgtVal(5, String(totalObs));
  rgtLbl(6, 'Operator');        rgtVal(6, operator);

  ws.getRow(7).height = 6;
  ws.getRow(8).height = 36;
  sc(8, COL_NO, 'No', { font:boldSm, fill:grayFill });
  mrg(8, COL_STEP_S, 8, COL_STEP_E);
  sc(8, COL_STEP_S, 'Step / Procedure', { font:boldSm, fill:grayFill });
  for (let o = 1; o <= totalObs; o++) sc(8, COL_OBS1+o-1, o, { font:boldSm, fill:grayFill });
  sc(8, COL_LOW,  'Lowest\nElemental\nTime',   { font:{bold:true,size:9}, fill:grayFill });
  sc(8, COL_ADJ,  'Adjustment',                { font:{bold:true,size:9}, fill:grayFill });
  sc(8, COL_ADJE, 'Adjusted\nElemental\nTime', { font:{bold:true,size:9}, fill:grayFill });
  sc(8, COL_VA,   'VA',  { font:boldSm, fill:grayFill });
  sc(8, COL_NA,   'NA',  { font:boldSm, fill:grayFill });
  sc(8, COL_NNA,  'NNA', { font:boldSm, fill:grayFill });

  const dataMap = {};
  cells.forEach(c => {
    if (!dataMap[c.step_order]) dataMap[c.step_order] = {};
    dataMap[c.step_order][c.obs_num] = c;
  });

  const BASE_ROW = 9;
  const cycleTotals = {};

  steps.forEach((step, idx) => {
    const stepNum = idx + 1;
    const r1 = BASE_ROW + idx * 2;
    const r2 = r1 + 1;
    ws.getRow(r1).height = 14; ws.getRow(r2).height = 14;
    mrg(r1, COL_NO, r2, COL_NO);
    mrg(r1, COL_STEP_S, r2, COL_STEP_E);
    sc(r1, COL_NO, stepNum, { font:{ bold:true, size:10 }, align:ctr });
    sc(r1, COL_STEP_S, step.step_text, { font:normSm, align:lft });
    ws.getCell(r2, COL_NO).border = borders;
    for (let ci = COL_STEP_S; ci <= COL_STEP_E; ci++) ws.getCell(r2, ci).border = borders;

    for (let o = 1; o <= totalObs; o++) {
      const col = COL_OBS1 + o - 1;
      const rec = dataMap[stepNum] && dataMap[stepNum][o];
      if (rec) {
        sc(r1, col, parseFloat((rec.continuous_ms/1000).toFixed(2)), { font:{ bold:true, size:10 }, align:rgt });
        sc(r2, col, parseFloat((rec.elemental_ms /1000).toFixed(2)), { font:{ bold:true, size:10, color:{ argb:'FFCC0000' } }, align:rgt });
        cycleTotals[o] = (cycleTotals[o] || 0) + rec.elemental_ms;
      } else {
        sc(r1, col, '', { align:ctr }); sc(r2, col, '', { align:ctr });
      }
    }

    // Analysis cols – filled from editor data
    const ed = edMap[stepNum];
    const numFmt = v => (v != null && v !== '') ? parseFloat(parseFloat(v).toFixed(4)) : '';
    mrg(r1, COL_LOW,  r2, COL_LOW);  sc(r1, COL_LOW,  ed ? numFmt(ed.lowest_elemental)    : '', { align:rgt });
    mrg(r1, COL_ADJ,  r2, COL_ADJ);  sc(r1, COL_ADJ,  ed ? numFmt(ed.adjustment)          : '', { align:rgt });
    mrg(r1, COL_ADJE, r2, COL_ADJE); sc(r1, COL_ADJE, ed ? numFmt(ed.adjusted_elemental)  : '', { align:rgt });
    mrg(r1, COL_VA,   r2, COL_VA);   sc(r1, COL_VA,   ed ? (ed.va  || '') : '', { align:ctr });
    mrg(r1, COL_NA,   r2, COL_NA);   sc(r1, COL_NA,   ed ? (ed.na  || '') : '', { align:ctr });
    mrg(r1, COL_NNA,  r2, COL_NNA);  sc(r1, COL_NNA,  ed ? (ed.nna || '') : '', { align:ctr });
    // borders on r2 hidden halves
    [COL_LOW,COL_ADJ,COL_ADJE,COL_VA,COL_NA,COL_NNA].forEach(col => ws.getCell(r2, col).border = borders);
  });

  const cycleRow = BASE_ROW + steps.length * 2;
  ws.getRow(cycleRow).height = 20;
  sc(cycleRow, COL_NO, '', { font:boldSm, fill:grayFill });
  mrg(cycleRow, COL_STEP_S, cycleRow, COL_STEP_E);
  sc(cycleRow, COL_STEP_S, 'Time for 1 Cycle', { font:boldSm, align:lft, fill:grayFill });
  for (let o = 1; o <= totalObs; o++) {
    const val = cycleTotals[o] != null ? parseFloat((cycleTotals[o]/1000).toFixed(2)) : '';
    sc(cycleRow, COL_OBS1+o-1, val, { font:boldSm, fill:grayFill, align:rgt });
  }
  [COL_LOW, COL_ADJ, COL_ADJE, COL_VA, COL_NA, COL_NNA].forEach(col =>
    sc(cycleRow, col, '', { font:boldSm, fill:grayFill, align:ctr })
  );

  ws.views = [{ state:'frozen', xSplit:5, ySplit:8, activeCell:'F9' }];

  const safeName = (opName||'Export').replace(/[^a-zA-Z0-9 _-]/g,'_');
  const { filePath } = await dialog.showSaveDialog({
    title: 'Export Time Study (Editor)',
    defaultPath: `TimeStudy_${safeName}_v${version||1}_analysis.xlsx`,
    filters: [{ name:'Excel Workbook', extensions:['xlsx'] }],
  });
  if (!filePath) return { cancelled: true };
  await wb.xlsx.writeFile(filePath);
  return { success:true, filePath };
});

// ── Step Lists ────────────────────────────────────────────────────────────────
ipcMain.handle('db:get-step-lists',         (_e, oid)        => db.getStepListsByOperation(oid));
ipcMain.handle('db:get-step-list',          (_e, id)         => db.getStepList(id));
ipcMain.handle('db:create-step-list',       (_e, oid, data)  => db.createStepList(oid, data));
ipcMain.handle('db:update-step-list',       (_e, id, data)   => db.updateStepList(id, data));
ipcMain.handle('db:delete-step-list',       (_e, id)         => db.deleteStepList(id));
ipcMain.handle('db:seed-default-step-list', (_e, oid)        => db.seedDefaultStepList(oid));
