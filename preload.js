const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Session
  beginSession:    () => ipcRenderer.invoke('db:begin-session'),
  getLatestSession:() => ipcRenderer.invoke('db:get-latest-session'),

  // Projects
  getProjects:    ()         => ipcRenderer.invoke('db:get-projects'),
  getProject:     (id)       => ipcRenderer.invoke('db:get-project', id),
  createProject:  (data)     => ipcRenderer.invoke('db:create-project', data),
  updateProject:  (id, data) => ipcRenderer.invoke('db:update-project', id, data),
  deleteProject:  (id)       => ipcRenderer.invoke('db:delete-project', id),

  // Operations
  getOperations:      (projectId)      => ipcRenderer.invoke('db:get-operations', projectId),
  getOperation:       (id)             => ipcRenderer.invoke('db:get-operation', id),
  createOperation:    (projectId, data)=> ipcRenderer.invoke('db:create-operation', projectId, data),
  updateOperation:    (id, data)       => ipcRenderer.invoke('db:update-operation', id, data),
  deleteOperation:    (id)             => ipcRenderer.invoke('db:delete-operation', id),
  reorderOperations:  (projectId, ids) => ipcRenderer.invoke('db:reorder-operations', projectId, ids),
  getDistinctValues:  (field)          => ipcRenderer.invoke('db:get-distinct-values', field),
  getDistinctPersons: (role)           => ipcRenderer.invoke('db:get-distinct-persons', role),

  // Timestamps
  getTimestamps:   (operationId)                  => ipcRenderer.invoke('db:get-timestamps', operationId),
  createTimestamp: (operationId, notes, listId, obs, operator, workstation, subjectType, batchSize, subjectFocus) => ipcRenderer.invoke('db:create-timestamp', operationId, notes, listId, obs, operator, workstation, subjectType, batchSize, subjectFocus),
  deleteTimestamp: (id)                           => ipcRenderer.invoke('db:delete-timestamp', id),

  // Step Lists
  getStepLists:        (operationId)      => ipcRenderer.invoke('db:get-step-lists', operationId),
  getStepList:         (id)               => ipcRenderer.invoke('db:get-step-list', id),
  createStepList:      (operationId, data)=> ipcRenderer.invoke('db:create-step-list', operationId, data),
  updateStepList:      (id, data)         => ipcRenderer.invoke('db:update-step-list', id, data),
  deleteStepList:      (id)               => ipcRenderer.invoke('db:delete-step-list', id),
  seedDefaultStepList: (operationId)      => ipcRenderer.invoke('db:seed-default-step-list', operationId),

  // Recordings
  completeTimestamp:  (tsId)        => ipcRenderer.invoke('db:complete-timestamp', tsId),
  saveRecording:      (tsId, cells) => ipcRenderer.invoke('db:save-recording', tsId, cells),
  getRecording:       (tsId)        => ipcRenderer.invoke('db:get-recording', tsId),
  saveBatchRecording: (tsId, obs)   => ipcRenderer.invoke('db:save-batch-recording', tsId, obs),
  getBatchRecording:  (tsId)        => ipcRenderer.invoke('db:get-batch-recording', tsId),

  // Export
  exportTimestudy:       (payload) => ipcRenderer.invoke('export:timestudy', payload),
  exportEditorTimestudy: (payload) => ipcRenderer.invoke('export:editor-timestudy', payload),

  // Editor Data
  getEditorData:  (tsId)       => ipcRenderer.invoke('db:get-editor-data', tsId),
  saveEditorData: (tsId, rows) => ipcRenderer.invoke('db:save-editor-data', tsId, rows),

  // Navigation
  navigate:   (page, params) => ipcRenderer.send('nav:navigate', page, params),
  onNavigate: (cb)           => ipcRenderer.on('nav:page-data', (_e, d) => cb(d)),

  // App info
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // Window
  minimize: () => ipcRenderer.send('window:minimize'),
  ensureMaximized: () => ipcRenderer.send('window:ensure-maximized'),
  toggleFullScreen: () => ipcRenderer.send('window:toggle-fullscreen'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close:    () => ipcRenderer.send('window:close'),
});
