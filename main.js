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
  'record-view': 'record-view.html', about: 'about.html', instructions: 'instructions.html',
  editor: 'editor.html',
  'single-batch-record': 'single-batch-record.html',
  'single-batch-default': 'single-batch-default.html',
  'batch-record-view': 'batch-record-view.html',
  'batch-view': 'batch-view.html',
};
let autoMaximized = false;   // tracks if we maximized on behalf of a page

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.on('nav:navigate', (e, page, params) => {
  const file = PAGES[page]; if (!file) return;

  // Restore window size when leaving full-screen pages
  if (autoMaximized && page !== 'record-view' && page !== 'single-batch-record' && page !== 'single-batch-default' && page !== 'batch-record-view' && page !== 'batch-view') {
    mainWindow.unmaximize();
    autoMaximized = false;
  }

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', file))
    .then(() => {
      if (params) mainWindow.webContents.send('nav:page-data', params);
      // Auto-maximize for record/view time study
      if ((page === 'record-view' || page === 'single-batch-record' || page === 'single-batch-default' || page === 'batch-record-view' || page === 'batch-view') && !mainWindow.isMaximized()) {
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
ipcMain.handle('db:create-timestamp',  (_e, oid, notes, lid, obs, op, ws, stype, bsz, sfocus, tsName) => db.createTimestamp(oid, notes, lid, obs, op, ws, stype, bsz, sfocus, tsName));
ipcMain.handle('db:delete-timestamp',  (_e, id)                       => db.deleteTimestamp(id));

// ── Recordings ───────────────────────────────────────────────────────────────
ipcMain.handle('db:complete-timestamp', (_e, tsId) => db.completeTimestamp(tsId));
ipcMain.handle('db:save-recording', (_e, tsId, cells, complete) => db.saveRecording(tsId, cells, complete));
ipcMain.handle('db:get-recording',  (_e, tsId)        => db.getRecording(tsId));

// ── Batch Observations ────────────────────────────────────────────────────────
ipcMain.handle('db:save-batch-recording', (_e, tsId, obs) => db.saveBatchRecording(tsId, obs));
ipcMain.handle('db:get-batch-recording',  (_e, tsId)      => db.getBatchRecording(tsId));

// ── Obs Units ─────────────────────────────────────────────────────────────────
ipcMain.handle('db:save-obs-units', (_e, tsId, arr) => db.saveObsUnits(tsId, arr));
ipcMain.handle('db:get-obs-units',  (_e, tsId)      => db.getObsUnits(tsId));

// ── Editor Data ───────────────────────────────────────────────────────────────
ipcMain.handle('db:get-editor-data',  (_e, tsId)       => db.getEditorData(tsId));
ipcMain.handle('db:save-editor-data', (_e, tsId, rows) => db.saveEditorData(tsId, rows));

// ── Database Management ───────────────────────────────────────────────────────
ipcMain.handle('db:get-location', () => db.getDbLocation());
ipcMain.handle('db:reset', () => db.resetDatabase());
ipcMain.handle('db:change-location', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Database Folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  return db.changeDbLocation(result.filePaths[0]);
});

// ── Excel helper: display step numbers (grouped steps share same number) ─────
function computeStepDisplayNums(steps) {
  let display = 0;
  const groupMap = {};
  return steps.map(step => {
    if (!step.group_id) { display++; return display; }
    if (!(step.group_id in groupMap)) { display++; groupMap[step.group_id] = display; }
    return groupMap[step.group_id];
  });
}

// ── Excel Export ──────────────────────────────────────────────────────────────
ipcMain.handle('export:timestudy', async (_e, payload) => {
  const { steps, cells, totalObs, tsId, opName, version, project, operation, batchObs, batchSize } = payload;

  // Fetch timestamp for operator + created_at
  const ts = tsId ? db.getTimestampById(tsId) : null;
  const operator  = ts ? (ts.operator  || '') : '';
  const rawCa0 = ts ? (ts.created_at || '') : '';
  // SQLite datetime('now') is UTC without 'Z' — normalize so JS parses as UTC
  const createdAt = rawCa0 && !rawCa0.includes('T') && !rawCa0.endsWith('Z')
    ? rawCa0.replace(' ', 'T') + 'Z' : rawCa0;

  // ── Batch Time Study Export ───────────────────────────────────────────────
  if (batchObs) {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Batch Time Observation Form');

    const numObs = batchObs.length;
    // Columns: A=No, B–E=Step (merged), F..F+numObs-1=Obs1..N, last=Avg Cycle
    const COL_NO    = 1;
    const COL_STP_S = 2;
    const COL_STP_E = 5;
    const COL_OBS1  = 6;
    const COL_OBSL  = 5 + numObs;
    const COL_AVG   = 6 + numObs;
    const TOTAL_COLS = COL_AVG;

    ws.getColumn(COL_NO).width = 5;
    ws.getColumn(2).width = 22; ws.getColumn(3).width = 8;
    ws.getColumn(4).width = 8;  ws.getColumn(5).width = 8;
    for (let o = 0; o < numObs; o++) ws.getColumn(COL_OBS1 + o).width = 12;
    ws.getColumn(COL_AVG).width = 14;

    const grayFill   = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFD9D9D9' } };
    const greenFill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFC6EFCE' } };
    const redFill    = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFFFC7CE' } };
    const thinBdr    = { style:'thin' };
    const borders    = { top:thinBdr, left:thinBdr, bottom:thinBdr, right:thinBdr };
    const ctr  = { horizontal:'center', vertical:'middle', wrapText:true };
    const lft  = { horizontal:'left',   vertical:'middle', wrapText:true };
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

    // Row 1 – Title
    ws.getRow(1).height = 30;
    mrg(1, COL_NO, 1, TOTAL_COLS);
    sc(1, COL_NO, 'BATCH TIME OBSERVATION FORM', { font:{ bold:true, size:16 }, align:ctr, fill:grayFill });

    // Row 2 – spacer
    ws.getRow(2).height = 6;

    // Rows 3–6 – header metadata
    [3,4,5,6].forEach(r => ws.getRow(r).height = 22);

    function leftLbl(row, text) { sc(row, COL_NO, text, { font:boldSm, align:lft, fill:grayFill }); }
    function leftVal(row, text) { mrg(row, COL_STP_S, row, COL_STP_E); sc(row, COL_STP_S, text||'', { font:normSm, align:lft }); }

    leftLbl(3, 'Project Name');   leftVal(3, project   ? project.name       : '');
    leftLbl(4, 'Project Owner');  leftVal(4, project   ? project.owner_name : '');
    leftLbl(5, 'Operation Name'); leftVal(5, opName    || (operation ? operation.name : ''));
    leftLbl(6, 'Department');     leftVal(6, operation ? operation.department : '');

    // Middle block (obs columns area)
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
    midLbl(6, 'Batch Size'); midVal(6, batchSize ? String(batchSize) : '');

    // Right block
    function rgtLbl(row, text) { sc(row, COL_AVG, text, { font:boldSm, align:lft, fill:grayFill }); }
    // Right block spans only the AVG column (no analysis cols in batch form)
    const dt = createdAt ? new Date(createdAt) : new Date();
    const dateStr = dt.toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' });
    const timeStr = dt.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true });
    rgtLbl(3, `Date: ${dateStr}`);
    rgtLbl(4, `Time: ${timeStr}`);
    rgtLbl(5, `Observations: ${numObs}`);
    rgtLbl(6, `Operator: ${operator}`);

    // Row 7 – spacer
    ws.getRow(7).height = 6;

    // Row 8 – column headers
    ws.getRow(8).height = 36;
    sc(8, COL_NO, 'No', { font:boldSm, fill:grayFill });
    mrg(8, COL_STP_S, 8, COL_STP_E);
    sc(8, COL_STP_S, 'Step / Procedure', { font:boldSm, fill:grayFill });
    for (let o = 1; o <= numObs; o++) {
      sc(8, COL_OBS1+o-1, `Obs ${o}`, { font:boldSm, fill:grayFill });
    }
    sc(8, COL_AVG, 'Avg Cycle', { font:boldSm, fill:grayFill });

    // Helper: ms → HH:MM:SS string
    function msToHMS(ms) {
      if (!ms && ms !== 0) return '';
      const totalSec = Math.round(ms / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    // Row 9 – Batch Start (start_time values)
    ws.getRow(9).height = 20;
    sc(9, COL_NO, 1, { font:boldSm, align:ctr });
    mrg(9, COL_STP_S, 9, COL_STP_E);
    sc(9, COL_STP_S, 'Batch Start', { font:boldSm, align:lft, fill:greenFill });
    for (let o = 0; o < numObs; o++) {
      const obs = batchObs[o];
      sc(9, COL_OBS1+o, obs ? (obs.start_time || '') : '', { font:normSm, fill:greenFill });
    }
    sc(9, COL_AVG, '', { fill:greenFill });

    // Row 10 – Batch Finish (end_time values)
    ws.getRow(10).height = 20;
    sc(10, COL_NO, 2, { font:boldSm, align:ctr });
    mrg(10, COL_STP_S, 10, COL_STP_E);
    sc(10, COL_STP_S, 'Batch Finish', { font:boldSm, align:lft, fill:redFill });
    for (let o = 0; o < numObs; o++) {
      const obs = batchObs[o];
      sc(10, COL_OBS1+o, obs ? (obs.end_time || '') : '', { font:normSm, fill:redFill });
    }
    sc(10, COL_AVG, '', { fill:redFill });

    // Row 11 – Time for 1 Cycle (duration_ms as HH:MM:SS)
    ws.getRow(11).height = 20;
    sc(11, COL_NO, '', { fill:grayFill });
    mrg(11, COL_STP_S, 11, COL_STP_E);
    sc(11, COL_STP_S, 'Time for 1 Cycle', { font:boldSm, align:lft, fill:grayFill });
    let totalDurMs = 0; let countDur = 0;
    for (let o = 0; o < numObs; o++) {
      const obs = batchObs[o];
      const durMs = obs ? (obs.duration_ms || 0) : 0;
      sc(11, COL_OBS1+o, msToHMS(durMs), { font:{ bold:true, size:10 }, fill:grayFill });
      if (durMs) { totalDurMs += durMs; countDur++; }
    }
    const avgMs = countDur > 0 ? Math.round(totalDurMs / countDur) : 0;
    sc(11, COL_AVG, msToHMS(avgMs), { font:{ bold:true, size:10 }, fill:grayFill });

    // Row 12 – Units per observation
    ws.getRow(12).height = 20;
    const batchUnitsRows = tsId ? db.getObsUnits(tsId) : [];
    const batchUnitsMap = {};
    batchUnitsRows.forEach(u => { batchUnitsMap[u.obs_num] = u.units; });
    const purpleFill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFE9D5FF' } };
    const purpleFont = { bold:true, size:10, color:{ argb:'FF7C3AED' } };
    sc(12, COL_NO, 'U', { font:purpleFont, align:ctr, fill:purpleFill });
    mrg(12, COL_STP_S, 12, COL_STP_E);
    sc(12, COL_STP_S, 'Units', { font:purpleFont, align:lft, fill:purpleFill });
    for (let o = 0; o < numObs; o++) {
      const obsNum = o + 1;
      const u = batchUnitsMap[obsNum] || 1;
      sc(12, COL_OBS1+o, u, { font:purpleFont, align:ctr, fill:purpleFill });
    }
    sc(12, COL_AVG, '', { fill:purpleFill });

    // Freeze panes: rows 1–8, columns A–E
    ws.views = [{ state:'frozen', xSplit:5, ySplit:8, activeCell:'F9' }];

    // Save dialog
    const safeName = (opName||'BatchExport').replace(/[^a-zA-Z0-9 _-]/g,'_');
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Batch Time Study',
      defaultPath: `BatchTimeStudy_${safeName}_v${version||1}.xlsx`,
      filters: [{ name:'Excel Workbook', extensions:['xlsx'] }],
    });
    if (!filePath) return { cancelled: true };
    await wb.xlsx.writeFile(filePath);
    return { success:true, filePath };
  }
  // ── End Batch Export ──────────────────────────────────────────────────────

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
  const singleDispNums = computeStepDisplayNums(steps);

  // Pre-compute No-column merge spans: grouped steps share one merged No cell
  const singleNoSpan = steps.map((step, idx) => {
    if (!step.group_id) return { isFirst: true, rowSpan: 2 };
    if (idx > 0 && steps[idx - 1].group_id === step.group_id) return { isFirst: false };
    let count = 1, j = idx + 1;
    while (j < steps.length && steps[j].group_id === step.group_id) { count++; j++; }
    return { isFirst: true, rowSpan: count * 2 };
  });

  steps.forEach((step, idx) => {
    const stepNum = idx + 1;
    const dispNum = singleDispNums[idx];
    const r1 = BASE_ROW + idx * 2;
    const r2 = r1 + 1;
    ws.getRow(r1).height = 14;
    ws.getRow(r2).height = 14;

    // No column: merge across entire group span (just r1–r2 for ungrouped)
    const noInfo = singleNoSpan[idx];
    if (noInfo.isFirst) {
      mrg(r1, COL_NO, r1 + noInfo.rowSpan - 1, COL_NO);
      sc(r1, COL_NO, dispNum, { font:{ bold:true, size:10 }, align:ctr });
      for (let ri = r1 + 1; ri < r1 + noInfo.rowSpan; ri++) ws.getCell(ri, COL_NO).border = borders;
    } else {
      // Continuation row: No cell already merged from group's first step
      ws.getCell(r1, COL_NO).border = borders;
      ws.getCell(r2, COL_NO).border = borders;
    }

    // Step cells always merge just r1–r2
    mrg(r1, COL_STEP_S, r2, COL_STEP_E);
    sc(r1, COL_STEP_S, step.step_text,  { font:normSm, align:lft });
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

  // ── Units row ─────────────────────────────────────────────────────────────
  const unitsRow = cycleRow + 1;
  ws.getRow(unitsRow).height = 20;
  const singleUnitsRows = tsId ? db.getObsUnits(tsId) : [];
  const singleUnitsMap = {};
  singleUnitsRows.forEach(u => { singleUnitsMap[u.obs_num] = u.units; });
  const purpleFillS = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFE9D5FF' } };
  const purpleFontS = { bold:true, size:10, color:{ argb:'FF7C3AED' } };
  sc(unitsRow, COL_NO, 'U', { font:purpleFontS, align:ctr, fill:purpleFillS });
  mrg(unitsRow, COL_STEP_S, unitsRow, COL_STEP_E);
  sc(unitsRow, COL_STEP_S, 'Units', { font:purpleFontS, align:lft, fill:purpleFillS });
  for (let o = 1; o <= totalObs; o++) {
    const u = singleUnitsMap[o] || 1;
    sc(unitsRow, COL_OBS1+o-1, u, { font:purpleFontS, align:ctr, fill:purpleFillS });
  }
  [COL_LOW, COL_ADJ, COL_ADJE, COL_VA, COL_NA, COL_NNA].forEach(col =>
    sc(unitsRow, col, '', { fill:purpleFillS, align:ctr })
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
  const { steps, cells, editorRows, totalObs, tsId, opName, version, project, operation, isBatch } = payload;

  const ts = tsId ? db.getTimestampById(tsId) : null;
  const operator  = ts ? (ts.operator  || '') : '';
  const rawCa1 = ts ? (ts.created_at || '') : '';
  const createdAt = rawCa1 && !rawCa1.includes('T') && !rawCa1.endsWith('Z')
    ? rawCa1.replace(' ', 'T') + 'Z' : rawCa1;

  // Build editor data map: step_order → row
  const edMap = {};
  (editorRows || []).forEach(r => { edMap[r.step_order] = r; });

  // ── Batch Editor Export ────────────────────────────────────────────────────
  if (isBatch) {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Batch Time Observation Form');

    const numObs     = Math.max(totalObs || 0, (cells || []).length);
    const COL_NO     = 1;
    const COL_STEP_S = 2;
    const COL_STEP_E = 5;
    const COL_OBS1   = 6;
    const COL_OBSL   = 5 + numObs;
    const COL_LOW    = 6 + numObs;
    const COL_ADJ    = 7 + numObs;
    const COL_ADJE   = 8 + numObs;
    const COL_VA     = 9  + numObs;
    const COL_NA     = 10 + numObs;
    const COL_NNA    = 11 + numObs;
    const TOTAL_COLS = COL_NNA;

    ws.getColumn(COL_NO).width = 5;
    ws.getColumn(2).width = 22; ws.getColumn(3).width = 8;
    ws.getColumn(4).width = 8;  ws.getColumn(5).width = 8;
    for (let o = 0; o < numObs; o++) ws.getColumn(COL_OBS1 + o).width = 12;
    ws.getColumn(COL_LOW).width  = 16;
    ws.getColumn(COL_ADJ).width  = 12;
    ws.getColumn(COL_ADJE).width = 18;
    ws.getColumn(COL_VA).width   = 7;
    ws.getColumn(COL_NA).width   = 7;
    ws.getColumn(COL_NNA).width  = 7;

    const grayFill   = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFD9D9D9' } };
    const greenFill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFC6EFCE' } };
    const redFill    = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFFFC7CE' } };
    const purpleFill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFE9D5FF' } };
    const thinBdr    = { style:'thin' };
    const borders    = { top:thinBdr, left:thinBdr, bottom:thinBdr, right:thinBdr };
    const ctr  = { horizontal:'center', vertical:'middle', wrapText:true };
    const lft  = { horizontal:'left',   vertical:'middle', wrapText:true };
    const rgt  = { horizontal:'right',  vertical:'middle' };
    const boldSm   = { bold:true, size:10 };
    const normSm   = { size:10 };
    const purpleFont = { bold:true, size:10, color:{ argb:'FF7C3AED' } };

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

    // Row 1 – Title
    ws.getRow(1).height = 30;
    mrg(1, COL_NO, 1, TOTAL_COLS);
    sc(1, COL_NO, 'BATCH TIME OBSERVATION FORM', { font:{ bold:true, size:16 }, align:ctr, fill:grayFill });

    // Row 2 – spacer
    ws.getRow(2).height = 6;

    // Rows 3–6 – header metadata
    [3,4,5,6].forEach(r => ws.getRow(r).height = 22);

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
    midLbl(6, 'Shift Hours'); midVal(6, operation ? (operation.shift_hours||'') : '');

    // Right block – analysis col labels area
    function rgtLbl(row, text) { sc(row, COL_LOW, text, { font:boldSm, align:lft, fill:grayFill }); }
    function rgtVal(row, text) { if (COL_ADJ <= COL_NNA) mrg(row, COL_ADJ, row, COL_NNA); sc(row, COL_ADJ, text||'', { font:normSm, align:lft }); }
    const dt = createdAt ? new Date(createdAt) : new Date();
    const dateStr = dt.toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' });
    const timeStr = dt.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true });
    rgtLbl(3, 'Time Study Date'); rgtVal(3, dateStr);
    rgtLbl(4, 'Time Study Time'); rgtVal(4, timeStr);
    rgtLbl(5, 'Observations');    rgtVal(5, String(numObs));
    rgtLbl(6, 'Operator');        rgtVal(6, operator);

    // Row 7 – spacer
    ws.getRow(7).height = 6;

    // Row 8 – column headers
    ws.getRow(8).height = 36;
    sc(8, COL_NO, 'No', { font:boldSm, fill:grayFill });
    mrg(8, COL_STEP_S, 8, COL_STEP_E);
    sc(8, COL_STEP_S, 'Step / Procedure', { font:boldSm, fill:grayFill });
    for (let o = 1; o <= numObs; o++) sc(8, COL_OBS1+o-1, o, { font:boldSm, fill:grayFill });
    sc(8, COL_LOW,  'Lowest\nElemental\nTime',   { font:{ bold:true, size:9 }, fill:grayFill });
    sc(8, COL_ADJ,  'Adjustment',                { font:{ bold:true, size:9 }, fill:grayFill });
    sc(8, COL_ADJE, 'Adjusted\nElemental\nTime', { font:{ bold:true, size:9 }, fill:grayFill });
    sc(8, COL_VA,   'VA',  { font:boldSm, fill:grayFill });
    sc(8, COL_NA,   'NA',  { font:boldSm, fill:grayFill });
    sc(8, COL_NNA,  'NNA', { font:boldSm, fill:grayFill });

    // Build obs map
    const obsMap = {};
    (cells || []).forEach(c => { obsMap[c.obs_num] = c; });

    function msToHMS(ms) {
      if (!ms && ms !== 0) return '';
      const totalSec = Math.round(ms / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    const numFmt = v => (v != null && v !== '') ? parseFloat(parseFloat(v).toFixed(4)) : '';

    // Analysis data from edMap
    const edBatch = edMap[1] || {};   // Batch Start/Finish/Elapsed analysis
    const edAvg   = edMap[0] || {};   // AVG CYCLE analysis

    // Rows 9–11: Batch Start, Batch Finish, Time Elapsed — analysis spans all 3 rows
    [9, 10, 11].forEach(r => ws.getRow(r).height = 20);

    // Row 9 – Batch Start
    sc(9, COL_NO, 1, { font:{ bold:true, size:10, color:{ argb:'FF375623' } }, align:ctr, fill:greenFill });
    mrg(9, COL_STEP_S, 9, COL_STEP_E);
    sc(9, COL_STEP_S, 'Batch Start', { font:{ bold:true, size:10, color:{ argb:'FF375623' } }, align:lft, fill:greenFill });
    for (let o = 1; o <= numObs; o++) {
      const obs = obsMap[o];
      sc(9, COL_OBS1+o-1, obs ? (obs.start_time || '') : '', { font:{ bold:true, size:10, color:{ argb:'FF375623' } }, fill:greenFill });
    }
    // Analysis cols with rowspan 3 (merged across start/finish/elapsed)
    mrg(9, COL_LOW,  11, COL_LOW);  sc(9, COL_LOW,  numFmt(edBatch.lowest_elemental),   { font:boldSm, align:rgt, fill:greenFill });
    mrg(9, COL_ADJ,  11, COL_ADJ);  sc(9, COL_ADJ,  numFmt(edBatch.adjustment),         { font:boldSm, align:rgt, fill:greenFill });
    mrg(9, COL_ADJE, 11, COL_ADJE); sc(9, COL_ADJE, numFmt(edBatch.adjusted_elemental), { font:boldSm, align:rgt, fill:greenFill });
    mrg(9, COL_VA,   11, COL_VA);   sc(9, COL_VA,   edBatch.va  || '', { font:boldSm, align:ctr, fill:greenFill });
    mrg(9, COL_NA,   11, COL_NA);   sc(9, COL_NA,   edBatch.na  || '', { font:boldSm, align:ctr, fill:greenFill });
    mrg(9, COL_NNA,  11, COL_NNA);  sc(9, COL_NNA,  edBatch.nna || '', { font:boldSm, align:ctr, fill:greenFill });

    // Row 10 – Batch Finish
    sc(10, COL_NO, 2, { font:{ bold:true, size:10, color:{ argb:'FF9C0006' } }, align:ctr, fill:redFill });
    mrg(10, COL_STEP_S, 10, COL_STEP_E);
    sc(10, COL_STEP_S, 'Batch Finish', { font:{ bold:true, size:10, color:{ argb:'FF9C0006' } }, align:lft, fill:redFill });
    for (let o = 1; o <= numObs; o++) {
      const obs = obsMap[o];
      sc(10, COL_OBS1+o-1, obs ? (obs.end_time || '') : '', { font:{ bold:true, size:10, color:{ argb:'FF9C0006' } }, fill:redFill });
    }
    [COL_LOW, COL_ADJ, COL_ADJE, COL_VA, COL_NA, COL_NNA].forEach(col => ws.getCell(10, col).border = borders);

    // Row 11 – Time Elapsed
    sc(11, COL_NO, '—', { font:boldSm, align:ctr, fill:grayFill });
    mrg(11, COL_STEP_S, 11, COL_STEP_E);
    sc(11, COL_STEP_S, 'Time Elapsed', { font:boldSm, align:lft, fill:grayFill });
    let totalDurMs = 0; let countDur = 0;
    for (let o = 1; o <= numObs; o++) {
      const obs = obsMap[o];
      const durMs = obs ? (obs.duration_ms || 0) : 0;
      sc(11, COL_OBS1+o-1, msToHMS(durMs), { font:boldSm, fill:grayFill });
      if (durMs) { totalDurMs += durMs; countDur++; }
    }
    [COL_LOW, COL_ADJ, COL_ADJE, COL_VA, COL_NA, COL_NNA].forEach(col => ws.getCell(11, col).border = borders);

    // Row 12 – Units
    ws.getRow(12).height = 20;
    const batchUnitsRows = tsId ? db.getObsUnits(tsId) : [];
    const batchUnitsMap  = {};
    batchUnitsRows.forEach(u => { batchUnitsMap[u.obs_num] = u.units; });
    sc(12, COL_NO, 'U', { font:purpleFont, align:ctr, fill:purpleFill });
    mrg(12, COL_STEP_S, 12, COL_STEP_E);
    sc(12, COL_STEP_S, 'Units', { font:purpleFont, align:lft, fill:purpleFill });
    for (let o = 1; o <= numObs; o++) {
      const u = batchUnitsMap[o] || 1;
      sc(12, COL_OBS1+o-1, u, { font:purpleFont, align:ctr, fill:purpleFill });
    }
    [COL_LOW, COL_ADJ, COL_ADJE, COL_VA, COL_NA, COL_NNA].forEach(col =>
      sc(12, col, '', { fill:purpleFill, align:ctr })
    );

    // Row 13 – AVG CYCLE
    ws.getRow(13).height = 20;
    const avgMs = countDur > 0 ? Math.round(totalDurMs / countDur) : 0;
    sc(13, COL_NO, '', { font:boldSm, fill:grayFill });
    mrg(13, COL_STEP_S, 13, COL_STEP_E);
    sc(13, COL_STEP_S, 'AVG CYCLE', { font:boldSm, align:lft, fill:grayFill });
    const midObs = Math.ceil(numObs / 2);
    for (let o = 1; o <= numObs; o++) {
      sc(13, COL_OBS1+o-1, o === midObs ? msToHMS(avgMs) : '', { font:boldSm, fill:grayFill });
    }
    sc(13, COL_LOW,  numFmt(edAvg.lowest_elemental),   { font:boldSm, align:rgt, fill:grayFill });
    sc(13, COL_ADJ,  numFmt(edAvg.adjustment),         { font:boldSm, align:rgt, fill:grayFill });
    sc(13, COL_ADJE, numFmt(edAvg.adjusted_elemental), { font:boldSm, align:rgt, fill:grayFill });
    sc(13, COL_VA,   edAvg.va  || '', { font:boldSm, align:ctr, fill:grayFill });
    sc(13, COL_NA,   edAvg.na  || '', { font:boldSm, align:ctr, fill:grayFill });
    sc(13, COL_NNA,  edAvg.nna || '', { font:boldSm, align:ctr, fill:grayFill });

    // Freeze panes
    ws.views = [{ state:'frozen', xSplit:5, ySplit:8, activeCell:'F9' }];

    const safeName = (opName||'BatchExport').replace(/[^a-zA-Z0-9 _-]/g,'_');
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Batch Time Study (Editor)',
      defaultPath: `BatchTimeStudy_${safeName}_v${version||1}_analysis.xlsx`,
      filters: [{ name:'Excel Workbook', extensions:['xlsx'] }],
    });
    if (!filePath) return { cancelled: true };
    await wb.xlsx.writeFile(filePath);
    return { success:true, filePath };
  }
  // ── End Batch Editor Export ────────────────────────────────────────────────

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
  const editorDispNums = computeStepDisplayNums(steps);

  // Pre-compute No-column merge spans: grouped steps share one merged No cell
  const editorNoSpan = steps.map((step, idx) => {
    if (!step.group_id) return { isFirst: true, rowSpan: 2 };
    if (idx > 0 && steps[idx - 1].group_id === step.group_id) return { isFirst: false };
    let count = 1, j = idx + 1;
    while (j < steps.length && steps[j].group_id === step.group_id) { count++; j++; }
    return { isFirst: true, rowSpan: count * 2 };
  });

  steps.forEach((step, idx) => {
    const stepNum = idx + 1;
    const dispNum = editorDispNums[idx];
    const r1 = BASE_ROW + idx * 2;
    const r2 = r1 + 1;
    ws.getRow(r1).height = 14; ws.getRow(r2).height = 14;

    // No column: merge across entire group span (just r1–r2 for ungrouped)
    const noInfo = editorNoSpan[idx];
    if (noInfo.isFirst) {
      mrg(r1, COL_NO, r1 + noInfo.rowSpan - 1, COL_NO);
      sc(r1, COL_NO, dispNum, { font:{ bold:true, size:10 }, align:ctr });
      for (let ri = r1 + 1; ri < r1 + noInfo.rowSpan; ri++) ws.getCell(ri, COL_NO).border = borders;
    } else {
      // Continuation row: No cell already merged from group's first step
      ws.getCell(r1, COL_NO).border = borders;
      ws.getCell(r2, COL_NO).border = borders;
    }

    // Step cells always merge just r1–r2
    mrg(r1, COL_STEP_S, r2, COL_STEP_E);
    sc(r1, COL_STEP_S, step.step_text, { font:normSm, align:lft });
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
  // Use edMap[0] (step_order=0) for Time for 1 Cycle analysis columns
  const cycleEd = edMap[0] || {};
  const numFmtC = v => (v != null && v !== '') ? parseFloat(parseFloat(v).toFixed(4)) : '';
  sc(cycleRow, COL_LOW,  numFmtC(cycleEd.lowest_elemental),   { font:boldSm, fill:grayFill, align:rgt });
  sc(cycleRow, COL_ADJ,  numFmtC(cycleEd.adjustment),         { font:boldSm, fill:grayFill, align:rgt });
  sc(cycleRow, COL_ADJE, numFmtC(cycleEd.adjusted_elemental), { font:boldSm, fill:grayFill, align:rgt });
  sc(cycleRow, COL_VA,   cycleEd.va  || '', { font:boldSm, fill:grayFill, align:ctr });
  sc(cycleRow, COL_NA,   cycleEd.na  || '', { font:boldSm, fill:grayFill, align:ctr });
  sc(cycleRow, COL_NNA,  cycleEd.nna || '', { font:boldSm, fill:grayFill, align:ctr });

  // ── Units row ─────────────────────────────────────────────────────────────
  const edUnitsRow = cycleRow + 1;
  ws.getRow(edUnitsRow).height = 20;
  const edUnitsRows = tsId ? db.getObsUnits(tsId) : [];
  const edUnitsMap = {};
  edUnitsRows.forEach(u => { edUnitsMap[u.obs_num] = u.units; });
  const purpleFillE = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFE9D5FF' } };
  const purpleFontE = { bold:true, size:10, color:{ argb:'FF7C3AED' } };
  sc(edUnitsRow, COL_NO, 'U', { font:purpleFontE, align:ctr, fill:purpleFillE });
  mrg(edUnitsRow, COL_STEP_S, edUnitsRow, COL_STEP_E);
  sc(edUnitsRow, COL_STEP_S, 'Units', { font:purpleFontE, align:lft, fill:purpleFillE });
  for (let o = 1; o <= totalObs; o++) {
    const u = edUnitsMap[o] || 1;
    sc(edUnitsRow, COL_OBS1+o-1, u, { font:purpleFontE, align:ctr, fill:purpleFillE });
  }
  [COL_LOW, COL_ADJ, COL_ADJE, COL_VA, COL_NA, COL_NNA].forEach(col =>
    sc(edUnitsRow, col, '', { fill:purpleFillE, align:ctr })
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

// ── Project Time Study Export ─────────────────────────────────────────────────
ipcMain.handle('export:project-timestudy', async (_e, payload) => {
  const { project, operations } = payload;
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Time Study');

  const MAX_OBS = 10;

  // Column layout
  // A=No(1), B-C=Operations(2-3), D..D+MAX_OBS-1=Obs1..10, then AvgTime, Freq, PFD, StdTime, UPH, Units/shift
  const COL_NO    = 1;
  const COL_OP_S  = 2;
  const COL_OP_E  = 3;
  const COL_OBS1  = 4;
  const COL_OBSL  = 3 + MAX_OBS;       // 13
  const COL_AVG   = COL_OBSL + 1;      // 14
  const COL_FREQ  = COL_AVG  + 1;      // 15
  const COL_PFD   = COL_FREQ + 1;      // 16
  const COL_STD   = COL_PFD  + 1;      // 17
  const COL_UPH   = COL_STD  + 1;      // 18
  const COL_UPS   = COL_UPH  + 1;      // 19
  const TOTAL_COLS = COL_UPS;

  // Column widths
  ws.getColumn(COL_NO).width   = 5;
  ws.getColumn(COL_OP_S).width = 22;
  ws.getColumn(COL_OP_E).width = 8;
  for (let o = 0; o < MAX_OBS; o++) ws.getColumn(COL_OBS1 + o).width = 9;
  ws.getColumn(COL_AVG).width  = 11;
  ws.getColumn(COL_FREQ).width = 7;
  ws.getColumn(COL_PFD).width  = 9;
  ws.getColumn(COL_STD).width  = 11;
  ws.getColumn(COL_UPH).width  = 8;
  ws.getColumn(COL_UPS).width  = 10;

  // Fills
  const grayFill   = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF666666' } };
  const navyFill   = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1F2D7B' } };
  const orangeFill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFFF8C00' } };
  const yellowFill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFFFF200' } };
  const greenFill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF70AD47' } };
  const cyanFill   = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF00B0F0' } };
  const whiteFill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFFFFFFF' } };
  const thinBdr    = { style:'thin' };
  const borders    = { top:thinBdr, left:thinBdr, bottom:thinBdr, right:thinBdr };

  const ctr   = { horizontal:'center', vertical:'middle', wrapText:true };
  const lft   = { horizontal:'left',   vertical:'middle', wrapText:true };
  const rgt   = { horizontal:'right',  vertical:'middle' };

  function sc(row, col, val, { font, align, fill, numFmt } = {}) {
    const c = ws.getCell(row, col);
    c.value     = (val !== undefined && val !== null) ? val : '';
    c.font      = font  || { size:10, color:{ argb:'FF000000' } };
    c.alignment = align || ctr;
    if (fill)   c.fill   = fill;
    if (numFmt) c.numFmt = numFmt;
    c.border    = borders;
    return c;
  }
  function mrg(r1,c1,r2,c2) { try { ws.mergeCells(r1,c1,r2,c2); } catch {} }
  function whiteFont(size=10, bold=false) { return { bold, size, color:{ argb:'FFFFFFFF' } }; }
  function blackFont(size=10, bold=false) { return { bold, size, color:{ argb:'FF000000' } }; }

  // ── Row 1: Title ──────────────────────────────────────────────────────────
  ws.getRow(1).height = 28;
  mrg(1, 1, 1, TOTAL_COLS);
  sc(1, 1, 'TIME STUDY', {
    font: { bold:true, size:16, color:{ argb:'FFFFFFFF' } },
    align: ctr, fill: grayFill
  });

  // ── Rows 2–6: Header metadata (left) & Summary box (right) ───────────────
  const labelFont = { bold:true, size:10 };
  const metaFont  = { size:10 };
  const metaFields = [
    ['Department:', 'Product:', 'Area Manager:', 'Engineer:', 'Date:'],
    ['Shift:',      'Shift Hours:', 'Shift Seconds:', '',        ''],
  ];

  for (let r = 0; r < 5; r++) {
    ws.getRow(r + 2).height = 16;
    // Left block: label (A) + value (B-C)
    sc(r+2, COL_NO,   metaFields[0][r], { font:labelFont, align:rgt, fill:whiteFill });
    mrg(r+2, COL_OP_S, r+2, COL_OP_E);
    sc(r+2, COL_OP_S, '', { font:metaFont, align:lft, fill:whiteFill });
    // Middle block: label (D-E) + value (F-G)
    if (metaFields[1][r]) {
      mrg(r+2, COL_OBS1, r+2, COL_OBS1+1);
      sc(r+2, COL_OBS1, metaFields[1][r], { font:labelFont, align:rgt, fill:whiteFill });
      mrg(r+2, COL_OBS1+2, r+2, COL_OBS1+3);
      sc(r+2, COL_OBS1+2, '', { font:metaFont, align:lft, fill:whiteFill });
    }
  }

  // Right: Time Study Summary box (rows 2-6, last 4 cols area)
  const SUM_COL = TOTAL_COLS - 3;
  // Header
  mrg(2, SUM_COL, 2, TOTAL_COLS);
  sc(2, SUM_COL, 'Time Study Summary', { font:whiteFont(10,true), align:ctr, fill:navyFill });
  const summaryRows = [
    ['Total Time (seconds)', '0.0'],
    ['Total Time (minutes)', '0.0'],
    ['Units per Hour (UPH)', '0'],
    ['Units per Shift',      '0'],
  ];
  summaryRows.forEach(([label, val], i) => {
    const r = 3 + i;
    mrg(r, SUM_COL, r, TOTAL_COLS - 1);
    const isBold = label.includes('UPH');
    sc(r, SUM_COL, label, { font:blackFont(10, isBold), align:lft, fill:whiteFill });
    sc(r, TOTAL_COLS, val, { font:blackFont(10, isBold), align:rgt, fill:whiteFill });
  });

  // ── Row 7: Spacer ─────────────────────────────────────────────────────────
  ws.getRow(7).height = 6;
  mrg(7, 1, 7, TOTAL_COLS);
  ws.getCell(7, 1).fill = whiteFill;

  // ── Rows 8-10: Column headers ─────────────────────────────────────────────
  // Row 8 spans all, Row 9-10 will have the sub-headers
  ws.getRow(8).height = 20;
  ws.getRow(9).height = 20;
  ws.getRow(10).height = 20;

  // "OPERATIONS" header — spans rows 8-10
  mrg(8, COL_NO,   10, COL_NO);
  sc(8, COL_NO, 'No', { font:whiteFont(10,true), align:ctr, fill:grayFill });

  mrg(8, COL_OP_S, 10, COL_OP_E);
  sc(8, COL_OP_S, 'OPERATIONS', { font:{ bold:true, size:11, italic:true, color:{ argb:'FFFFFFFF' } }, align:ctr, fill:grayFill });

  // "Time (sec.)" spans obs columns rows 8-8, then Obs-1..10 in row 9 merging to 10
  mrg(8, COL_OBS1, 8, COL_OBSL);
  sc(8, COL_OBS1, 'Time (sec.)', { font:{ bold:true, size:11, italic:true, color:{ argb:'FFFFFFFF' } }, align:ctr, fill:grayFill });

  for (let o = 1; o <= MAX_OBS; o++) {
    mrg(9, COL_OBS1+o-1, 10, COL_OBS1+o-1);
    sc(9, COL_OBS1+o-1, `Obs-${o}`, { font:{ bold:true, size:9, italic:true, color:{ argb:'FFFFFFFF' } }, align:ctr, fill:grayFill });
  }

  // Right-side column headers — rows 8-10 merged per column
  const rightHdrs = [
    [COL_AVG,  'Average\nTime',    grayFill,   whiteFont(9,true)],
    [COL_FREQ, 'Freq',             yellowFill, blackFont(9,true)],
    [COL_PFD,  'PF&D %',           orangeFill, blackFont(9,true)],
    [COL_STD,  'Standard\nTime',   navyFill,   whiteFont(9,true)],
    [COL_UPH,  'UPH',              greenFill,  blackFont(10,true)],
    [COL_UPS,  'Units/shift',      cyanFill,   blackFont(9,true)],
  ];
  // "Frequency of Occurrence/stations" spanning row 8 above FREQ..STD
  mrg(8, COL_FREQ, 8, COL_STD);
  sc(8, COL_FREQ, 'Frequency of Occurrence/stations', { font:whiteFont(9,true), align:ctr, fill:navyFill });
  // "Allowance" row 9 above FREQ..STD
  mrg(9, COL_FREQ, 9, COL_STD);
  sc(9, COL_FREQ, 'Allowance', { font:blackFont(9,true), align:ctr, fill:orangeFill });
  // Individual col headers on row 10 for right side
  rightHdrs.forEach(([col, label, fill, font]) => {
    if (col === COL_FREQ || col === COL_PFD || col === COL_STD) {
      mrg(10, col, 10, col);
      sc(10, col, label, { font, align:ctr, fill });
    } else {
      mrg(8, col, 10, col);
      sc(8, col, label, { font, align:ctr, fill });
    }
  });

  // ── Data rows ─────────────────────────────────────────────────────────────
  const BASE_ROW = 11;
  operations.forEach((op, idx) => {
    const r = BASE_ROW + idx;
    ws.getRow(r).height = 18;
    sc(r, COL_NO, idx + 1, { font:blackFont(10,true), align:ctr, fill:whiteFill });
    mrg(r, COL_OP_S, r, COL_OP_E);
    sc(r, COL_OP_S, op.name || '', { font:blackFont(10), align:lft, fill:whiteFill });
    for (let o = 0; o < MAX_OBS; o++) {
      sc(r, COL_OBS1 + o, '', { font:blackFont(10), align:ctr, fill:whiteFill });
    }
    sc(r, COL_AVG,  '', { font:blackFont(10), align:ctr, fill:whiteFill });
    sc(r, COL_FREQ, '', { font:blackFont(10), align:ctr, fill:whiteFill });
    sc(r, COL_PFD,  '', { font:blackFont(10), align:ctr, fill:whiteFill });
    sc(r, COL_STD,  '', { font:blackFont(10), align:ctr, fill:whiteFill });
    sc(r, COL_UPH,  '', { font:blackFont(10), align:ctr, fill:greenFill });
    sc(r, COL_UPS,  '', { font:blackFont(10), align:ctr, fill:cyanFill });
  });

  // ── Total row ─────────────────────────────────────────────────────────────
  const TOT_ROW = BASE_ROW + operations.length;
  ws.getRow(TOT_ROW).height = 18;
  mrg(TOT_ROW, 1, TOT_ROW, COL_STD - 1);
  sc(TOT_ROW, 1, 'Total Process Time =', { font:blackFont(10,true), align:rgt, fill:whiteFill });
  sc(TOT_ROW, COL_STD, '0.0', { font:blackFont(10,true), align:ctr, fill:whiteFill });
  sc(TOT_ROW, COL_UPH, '0',   { font:blackFont(10,true), align:ctr, fill:greenFill });
  sc(TOT_ROW, COL_UPS, '0',   { font:blackFont(10,true), align:ctr, fill:cyanFill });

  ws.views = [{ state:'frozen', xSplit:3, ySplit:10, activeCell:'D11' }];

  const safeName = (project.name||'Project').replace(/[^a-zA-Z0-9 _-]/g,'_');
  const today = new Date().toISOString().slice(0,10);
  const { filePath } = await dialog.showSaveDialog({
    title: 'Export Project Time Study',
    defaultPath: `TimeStudy_${safeName}_${today}.xlsx`,
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
