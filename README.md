# Time Study Tool

Electron desktop app with built-in SQLite database. Fully portable.

## Setup

```
npm install
npm start
```

## Build portable EXE

```
npm run build
```
Output: `dist/TimeStudyTool-Portable.exe`

## Database location

- **Development:** `data/timestudy.db` (next to package.json)
- **Production:** same folder as the `.exe`
