const path = require('path');
const fs = require('fs');

let db;

function getDbPath(app) {
  let dbDir;
  if (app.isPackaged) {
    dbDir = app.getPath('userData');
  } else {
    dbDir = path.join(__dirname, '..', '..', 'data');
  }
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  return path.join(dbDir, 'timestudy.db');
}

function initDatabase(app) {
  const Database = require('better-sqlite3');
  const dbPath = getDbPath(app);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_time TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      abbreviation TEXT NOT NULL,
      color TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      lan_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      department TEXT DEFAULT '',
      description TEXT DEFAULT '',
      manager TEXT DEFAULT '',
      supervisors TEXT DEFAULT '[]',
      engineers TEXT DEFAULT '[]',
      shift TEXT DEFAULT '',
      shift_hours REAL DEFAULT 0,
      shift_seconds REAL DEFAULT 0,
      order_index INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS op_timestamps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS step_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS step_list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL REFERENCES step_lists(id) ON DELETE CASCADE,
      order_index INTEGER DEFAULT 0,
      step_text TEXT NOT NULL
    );
  `);

  // Migrations — safe to run every time; fail silently if column already exists
  try { db.exec('ALTER TABLE op_timestamps ADD COLUMN list_id INTEGER REFERENCES step_lists(id)'); } catch {}
  try { db.exec('ALTER TABLE op_timestamps ADD COLUMN observations INTEGER DEFAULT 10'); } catch {}
  try { db.exec('ALTER TABLE op_timestamps ADD COLUMN is_recorded INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE op_timestamps ADD COLUMN operator TEXT DEFAULT ""'); } catch {}
  try { db.exec('ALTER TABLE step_lists ADD COLUMN is_default INTEGER DEFAULT 0'); } catch {}
  // v1.3.0 migrations – step grouping
  try { db.exec('ALTER TABLE step_list_items ADD COLUMN group_id TEXT'); } catch {}
  // v1.2.0 migrations – new timestamp fields
  try { db.exec('ALTER TABLE op_timestamps ADD COLUMN workstation TEXT DEFAULT ""'); } catch {}
  try { db.exec('ALTER TABLE op_timestamps ADD COLUMN subject_type TEXT DEFAULT "single"'); } catch {}
  try { db.exec('ALTER TABLE op_timestamps ADD COLUMN batch_size INTEGER DEFAULT 10'); } catch {}
  try { db.exec('ALTER TABLE op_timestamps ADD COLUMN subject_focus TEXT DEFAULT ""'); } catch {}
  try { db.exec('ALTER TABLE op_timestamps ADD COLUMN ts_name TEXT DEFAULT ""'); } catch {}
  // v1.1.2 migrations
  try { db.exec('ALTER TABLE op_timestamps ADD COLUMN tag TEXT DEFAULT ""'); } catch {}
  // Back-fill: existing recorded timestamps are considered complete (only runs when column is first created)
  try { db.exec('ALTER TABLE op_timestamps ADD COLUMN is_complete INTEGER DEFAULT 0'); db.exec("UPDATE op_timestamps SET is_complete = 1 WHERE is_recorded = 1 AND is_complete = 0"); } catch {}
  try { db.exec('ALTER TABLE operations ADD COLUMN ts_version_seq INTEGER DEFAULT 0'); } catch {}
  // Back-fill ts_version_seq for existing operations (set to current MAX version)
  db.exec(`UPDATE operations SET ts_version_seq = COALESCE((SELECT MAX(version) FROM op_timestamps WHERE operation_id = operations.id), 0) WHERE ts_version_seq = 0`);
  // Back-fill tags for existing timestamps that have none
  const untagged = db.prepare("SELECT id FROM op_timestamps WHERE tag IS NULL OR tag = ''").all();
  const tagStmt = db.prepare("UPDATE op_timestamps SET tag = ? WHERE id = ?");
  untagged.forEach(row => { tagStmt.run(_generateTag(), row.id); });

  // ts_recordings table (added separately so existing DBs get it even without full reinit)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ts_recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_id INTEGER NOT NULL REFERENCES op_timestamps(id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL,
      obs_num INTEGER NOT NULL,
      continuous_ms INTEGER NOT NULL,
      elemental_ms INTEGER NOT NULL
    );
  `);

  // ts_batch_observations table – stores start/end times for single-batch-record page
  db.exec(`
    CREATE TABLE IF NOT EXISTS ts_batch_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_id INTEGER NOT NULL REFERENCES op_timestamps(id) ON DELETE CASCADE,
      obs_num INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      UNIQUE(timestamp_id, obs_num)
    );
  `);

  // ts_obs_units table – units per observation (shared by both recording types)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ts_obs_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_id INTEGER NOT NULL REFERENCES op_timestamps(id) ON DELETE CASCADE,
      obs_num INTEGER NOT NULL,
      units INTEGER NOT NULL DEFAULT 1,
      UNIQUE(timestamp_id, obs_num)
    );
  `);

  // ts_editor_data table – stores analysis columns filled in the editor page
  db.exec(`
    CREATE TABLE IF NOT EXISTS ts_editor_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_id INTEGER NOT NULL REFERENCES op_timestamps(id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL,
      lowest_elemental REAL,
      adjustment REAL,
      adjusted_elemental REAL,
      va TEXT DEFAULT '',
      na TEXT DEFAULT '',
      nna TEXT DEFAULT '',
      UNIQUE(timestamp_id, step_order)
    );
  `);

  return db;
}

// ── Sessions ──────────────────────────────────────────────────────────────────
function beginSession() {
  const now = new Date().toISOString();
  const r = db.prepare('INSERT INTO sessions (start_time) VALUES (?)').run(now);
  return { id: r.lastInsertRowid, start_time: now };
}
function getLatestSession() {
  return db.prepare('SELECT * FROM sessions ORDER BY id DESC LIMIT 1').get();
}

// ── Projects ──────────────────────────────────────────────────────────────────
function getAllProjects() {
  return db.prepare('SELECT * FROM projects ORDER BY name ASC').all();
}
function getProjectById(id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}
function createProject({ name, abbreviation, color, owner_name, lan_id }) {
  const r = db.prepare(
    'INSERT INTO projects (name, abbreviation, color, owner_name, lan_id) VALUES (?,?,?,?,?)'
  ).run(name, abbreviation, color, owner_name, lan_id);
  return getProjectById(r.lastInsertRowid);
}
function updateProject(id, { name, abbreviation, color, owner_name, lan_id }) {
  db.prepare(
    'UPDATE projects SET name=?, abbreviation=?, color=?, owner_name=?, lan_id=? WHERE id=?'
  ).run(name, abbreviation, color, owner_name, lan_id, id);
  return getProjectById(id);
}
function deleteProject(id) {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return { success: true };
}

// ── Operations ────────────────────────────────────────────────────────────────
function getOperationsByProject(projectId) {
  const rows = db.prepare(
    'SELECT * FROM operations WHERE project_id = ? ORDER BY order_index ASC, id ASC'
  ).all(projectId);
  return rows.map(parseOp);
}

function getOperationById(id) {
  const row = db.prepare('SELECT * FROM operations WHERE id = ?').get(id);
  return row ? parseOp(row) : null;
}

function parseOp(row) {
  try { row.supervisors = JSON.parse(row.supervisors || '[]'); } catch { row.supervisors = []; }
  try { row.engineers   = JSON.parse(row.engineers   || '[]'); } catch { row.engineers   = []; }
  return row;
}

function createOperation(projectId, data) {
  const { name, department, description, manager, supervisors, engineers,
          shift, shift_hours, shift_seconds } = data;
  const maxRow = db.prepare(
    'SELECT MAX(order_index) as mx FROM operations WHERE project_id = ?'
  ).get(projectId);
  const order = (maxRow.mx ?? -1) + 1;
  const r = db.prepare(`
    INSERT INTO operations
      (project_id, name, department, description, manager, supervisors, engineers,
       shift, shift_hours, shift_seconds, order_index)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    projectId, name, department || '', description || '', manager || '',
    JSON.stringify(supervisors || []), JSON.stringify(engineers || []),
    shift || '', shift_hours || 0, shift_seconds || 0, order
  );
  const opId = r.lastInsertRowid;
  seedDefaultStepList(opId);
  return getOperationById(opId);
}

function updateOperation(id, data) {
  const { name, department, description, manager, supervisors, engineers,
          shift, shift_hours, shift_seconds } = data;
  db.prepare(`
    UPDATE operations SET
      name=?, department=?, description=?, manager=?,
      supervisors=?, engineers=?, shift=?, shift_hours=?, shift_seconds=?
    WHERE id=?
  `).run(
    name, department || '', description || '', manager || '',
    JSON.stringify(supervisors || []), JSON.stringify(engineers || []),
    shift || '', shift_hours || 0, shift_seconds || 0, id
  );
  return getOperationById(id);
}

function deleteOperation(id) {
  db.prepare('DELETE FROM operations WHERE id = ?').run(id);
  return { success: true };
}

function reorderOperations(projectId, orderedIds) {
  const stmt = db.prepare('UPDATE operations SET order_index=? WHERE id=? AND project_id=?');
  const update = db.transaction((ids) => {
    ids.forEach((id, idx) => stmt.run(idx, id, projectId));
  });
  update(orderedIds);
  return { success: true };
}

// ── Dropdown option lists ─────────────────────────────────────────────────────
function getDistinctValues(field) {
  const allowed = ['department', 'manager', 'shift'];
  if (!allowed.includes(field)) return [];
  const rows = db.prepare(
    `SELECT DISTINCT ${field} as val FROM operations WHERE ${field} != '' ORDER BY ${field}`
  ).all();
  return rows.map(r => r.val).filter(Boolean);
}

function getDistinctPersonValues(role) {
  const rows = db.prepare('SELECT supervisors, engineers FROM operations').all();
  const set = new Set();
  rows.forEach(row => {
    try {
      const arr = JSON.parse(role === 'supervisors' ? row.supervisors : row.engineers);
      arr.forEach(v => { if (v) set.add(v); });
    } catch {}
  });
  return [...set].sort();
}

// ── Timestamps ────────────────────────────────────────────────────────────────
function getTimestampById(id) {
  return db.prepare('SELECT * FROM op_timestamps WHERE id = ?').get(id);
}

function getTimestampsByOperation(operationId) {
  return db.prepare(
    'SELECT * FROM op_timestamps WHERE operation_id = ? ORDER BY version ASC'
  ).all(operationId);
}

function _generateTag() {
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const D = '0123456789';
  let tag;
  do {
    tag = [L,L,L].map(s => s[Math.floor(Math.random()*s.length)]).join('') +
          [D,D,D].map(s => s[Math.floor(Math.random()*s.length)]).join('');
  } while (db.prepare("SELECT 1 FROM op_timestamps WHERE tag = ?").get(tag));
  return tag;
}

function createTimestamp(operationId, notes, listId, observations, operator, workstation, subjectType, batchSize, subjectFocus, tsName) {
  // Atomically increment the per-operation version counter (never resets on delete)
  db.prepare('UPDATE operations SET ts_version_seq = ts_version_seq + 1 WHERE id = ?').run(operationId);
  const { ts_version_seq: version } = db.prepare(
    'SELECT ts_version_seq FROM operations WHERE id = ?'
  ).get(operationId);
  const tag = _generateTag();
  const r = db.prepare(
    `INSERT INTO op_timestamps
       (operation_id, version, notes, list_id, observations, operator, tag,
        workstation, subject_type, batch_size, subject_focus, ts_name)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    operationId, version, notes || '', listId || null, observations || 10,
    operator || '', tag,
    workstation || '', subjectType || 'single',
    batchSize != null ? batchSize : 10,
    subjectFocus || '',
    tsName || ''
  );
  return db.prepare('SELECT * FROM op_timestamps WHERE id = ?').get(r.lastInsertRowid);
}

function completeTimestamp(id) {
  db.prepare('UPDATE op_timestamps SET is_complete = 1, is_recorded = 1 WHERE id = ?').run(id);
  return { success: true };
}

function deleteTimestamp(id) {
  db.prepare('DELETE FROM op_timestamps WHERE id = ?').run(id);
  return { success: true };
}

// ── Step Lists ────────────────────────────────────────────────────────────────
function getStepList(id) {
  const list = db.prepare('SELECT * FROM step_lists WHERE id = ?').get(id);
  if (!list) return null;
  list.items = db.prepare(
    'SELECT * FROM step_list_items WHERE list_id = ? ORDER BY order_index ASC'
  ).all(id);
  return list;
}

function getStepListsByOperation(operationId) {
  const lists = db.prepare(
    'SELECT * FROM step_lists WHERE operation_id = ? ORDER BY version ASC'
  ).all(operationId);
  return lists.map(l => ({
    ...l,
    items: db.prepare(
      'SELECT * FROM step_list_items WHERE list_id = ? ORDER BY order_index ASC'
    ).all(l.id),
  }));
}

function createStepList(operationId, { name, steps, is_default = 0 }) {
  const maxRow = db.prepare(
    'SELECT MAX(version) as mv FROM step_lists WHERE operation_id = ?'
  ).get(operationId);
  const version = (maxRow.mv ?? 0) + 1;

  return db.transaction(() => {
    const r = db.prepare(
      'INSERT INTO step_lists (operation_id, name, version, is_default) VALUES (?,?,?,?)'
    ).run(operationId, name, version, is_default ? 1 : 0);
    const listId = r.lastInsertRowid;
    const itemStmt = db.prepare(
      'INSERT INTO step_list_items (list_id, order_index, step_text, group_id) VALUES (?,?,?,?)'
    );
    (steps || []).forEach((item, idx) => {
      const text = typeof item === 'string' ? item.trim() : (item.text || '').trim();
      const gid  = typeof item === 'string' ? null : (item.group_id || null);
      if (text) itemStmt.run(listId, idx, text, gid);
    });
    return getStepList(listId);
  })();
}

function seedDefaultStepList(operationId) {
  const existing = db.prepare(
    'SELECT id FROM step_lists WHERE operation_id = ? AND is_default = 1'
  ).get(operationId);
  if (existing) return existing;
  return createStepList(operationId, {
    name: 'Default Batch Procedure',
    steps: ['Batch Start', 'Batch Finish'],
    is_default: 1,
  });
}

function updateStepList(id, { name, steps }) {
  return db.transaction(() => {
    db.prepare('UPDATE step_lists SET name = ? WHERE id = ?').run(name, id);
    db.prepare('DELETE FROM step_list_items WHERE list_id = ?').run(id);
    const itemStmt = db.prepare(
      'INSERT INTO step_list_items (list_id, order_index, step_text, group_id) VALUES (?,?,?,?)'
    );
    (steps || []).forEach((item, idx) => {
      const text = typeof item === 'string' ? item.trim() : (item.text || '').trim();
      const gid  = typeof item === 'string' ? null : (item.group_id || null);
      if (text) itemStmt.run(id, idx, text, gid);
    });
    return getStepList(id);
  })();
}

function deleteStepList(id) {
  db.prepare('DELETE FROM step_lists WHERE id = ?').run(id);
  return { success: true };
}

// ── Recordings ────────────────────────────────────────────────────────────────
function saveRecording(timestampId, cells, complete = false) {
  return db.transaction(() => {
    db.prepare('DELETE FROM ts_recordings WHERE timestamp_id = ?').run(timestampId);
    db.prepare('UPDATE op_timestamps SET is_recorded = 1, is_complete = ? WHERE id = ?').run(complete ? 1 : 0, timestampId);
    const stmt = db.prepare(
      'INSERT INTO ts_recordings (timestamp_id, step_order, obs_num, continuous_ms, elemental_ms) VALUES (?,?,?,?,?)'
    );
    for (const c of cells) {
      stmt.run(timestampId, c.step_order, c.obs_num, c.continuous_ms, c.elemental_ms);
    }
    return { success: true };
  })();
}

function getRecording(timestampId) {
  return db.prepare(
    'SELECT * FROM ts_recordings WHERE timestamp_id = ? ORDER BY obs_num ASC, step_order ASC'
  ).all(timestampId);
}

// ── Batch Observations ────────────────────────────────────────────────────────
function saveBatchRecording(timestampId, observations) {
  const stmt = db.prepare(`
    INSERT INTO ts_batch_observations (timestamp_id, obs_num, start_time, end_time, duration_ms)
    VALUES (?,?,?,?,?)
    ON CONFLICT(timestamp_id, obs_num) DO UPDATE SET
      start_time=excluded.start_time,
      end_time=excluded.end_time,
      duration_ms=excluded.duration_ms
  `);
  db.transaction(() => {
    observations.forEach((obs, idx) => {
      stmt.run(timestampId, idx + 1, obs.start || '', obs.end || '', obs.durationMs || 0);
    });
  })();
  return { success: true };
}

function getBatchRecording(timestampId) {
  return db.prepare(
    'SELECT * FROM ts_batch_observations WHERE timestamp_id = ? ORDER BY obs_num ASC'
  ).all(timestampId);
}

// ── Obs Units (per observation, all recording types) ──────────────────────────
function saveObsUnits(timestampId, unitsArr) {
  // unitsArr: [{obs_num, units}]
  const stmt = db.prepare(`
    INSERT INTO ts_obs_units (timestamp_id, obs_num, units)
    VALUES (?,?,?)
    ON CONFLICT(timestamp_id, obs_num) DO UPDATE SET units=excluded.units
  `);
  db.transaction(() => {
    unitsArr.forEach(row => {
      stmt.run(timestampId, row.obs_num, row.units || 1);
    });
  })();
  return { success: true };
}

function getObsUnits(timestampId) {
  return db.prepare(
    'SELECT obs_num, units FROM ts_obs_units WHERE timestamp_id = ? ORDER BY obs_num ASC'
  ).all(timestampId);
}

// ── Editor Data ───────────────────────────────────────────────────────────────
function getEditorData(tsId) {
  return db.prepare(
    'SELECT * FROM ts_editor_data WHERE timestamp_id = ? ORDER BY step_order ASC'
  ).all(tsId);
}

function saveEditorData(tsId, rows) {
  const stmt = db.prepare(`
    INSERT INTO ts_editor_data
      (timestamp_id, step_order, lowest_elemental, adjustment, adjusted_elemental, va, na, nna)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(timestamp_id, step_order) DO UPDATE SET
      lowest_elemental=excluded.lowest_elemental,
      adjustment=excluded.adjustment,
      adjusted_elemental=excluded.adjusted_elemental,
      va=excluded.va, na=excluded.na, nna=excluded.nna
  `);
  db.transaction(() => {
    rows.forEach(r => stmt.run(
      tsId, r.step_order,
      r.lowest_elemental != null ? r.lowest_elemental : null,
      r.adjustment       != null ? r.adjustment       : null,
      r.adjusted_elemental != null ? r.adjusted_elemental : null,
      r.va || '', r.na || '', r.nna || ''
    ));
  })();
  return { success: true };
}

module.exports = {
  initDatabase,
  beginSession, getLatestSession,
  getAllProjects, getProjectById, createProject, updateProject, deleteProject,
  getOperationsByProject, getOperationById, createOperation, updateOperation,
  deleteOperation, reorderOperations, getDistinctValues, getDistinctPersonValues,
  getTimestampById, getTimestampsByOperation, createTimestamp, completeTimestamp, deleteTimestamp,
  getStepListsByOperation, getStepList, createStepList, updateStepList, deleteStepList, seedDefaultStepList,
  saveRecording, getRecording,
  saveBatchRecording, getBatchRecording,
  saveObsUnits, getObsUnits,
  getEditorData, saveEditorData,
};
