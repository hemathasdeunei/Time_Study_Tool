// ═══════════════════════════════════════════════════
//  Time Study Tool — Theme Manager
//  Include this script in every page's <head>
// ═══════════════════════════════════════════════════

const THEMES = {
  light: {
    label: 'Light',
    accent: '#6366F1', accentHover: '#4F52D9', accentDim: 'rgba(99,102,241,.12)',
    base: '#F5F6FA', surface: '#FFFFFF', elevated: '#EEF0F8', overlay: '#E4E7F2', input: '#F0F2FA',
    border: '#DDE1EF', borderHover: '#B8BED8',
    textPrimary: '#1A1D2E', textSecondary: '#3A3F5C', textMuted: '#6B728E', textDim: '#9AA0BC',
    scrollThumb: '#C8CCDE',
    shadow: '0 2px 8px rgba(0,0,0,.08)', shadowMd: '0 4px 24px rgba(0,0,0,.10)', shadowLg: '0 8px 40px rgba(0,0,0,.12)',
    preview: ['#F5F6FA','#FFFFFF','#6366F1'],
  },
  indigo: {
    label: 'Indigo Dark',
    accent: '#6366F1', accentHover: '#818CF8', accentDim: 'rgba(99,102,241,.15)',
    base: '#0A0A12', surface: '#12121E', elevated: '#1A1A2E', overlay: '#222240', input: '#0E0E1C',
    border: '#1E1E3A', borderHover: '#3A3A6A',
    textPrimary: '#F0F2FF', textSecondary: '#D8DCF0', textMuted: '#9AA0BC', textDim: '#636880',
    scrollThumb: '#222240',
    shadow: '0 2px 8px rgba(0,0,0,.4)', shadowMd: '0 4px 24px rgba(0,0,0,.5)', shadowLg: '0 8px 40px rgba(0,0,0,.6)',
    preview: ['#0A0A12','#12121E','#6366F1'],
  },
  blue: {
    label: 'Ocean Blue',
    accent: '#3B82F6', accentHover: '#60A5FA', accentDim: 'rgba(59,130,246,.15)',
    base: '#080E1A', surface: '#0E1525', elevated: '#162035', overlay: '#1E2D4A', input: '#0A1020',
    border: '#1A2D50', borderHover: '#2A4A7A',
    textPrimary: '#F0F2FF', textSecondary: '#D8DCF0', textMuted: '#9AA0BC', textDim: '#636880',
    scrollThumb: '#1E2D4A',
    shadow: '0 2px 8px rgba(0,0,0,.4)', shadowMd: '0 4px 24px rgba(0,0,0,.5)', shadowLg: '0 8px 40px rgba(0,0,0,.6)',
    preview: ['#080E1A','#0E1525','#3B82F6'],
  },
  emerald: {
    label: 'Forest Green',
    accent: '#10B981', accentHover: '#34D399', accentDim: 'rgba(16,185,129,.15)',
    base: '#060F0A', surface: '#0C1810', elevated: '#122018', overlay: '#1A2E22', input: '#080E0C',
    border: '#1A3020', borderHover: '#2A5035',
    textPrimary: '#F0F2FF', textSecondary: '#D8DCF0', textMuted: '#9AA0BC', textDim: '#636880',
    scrollThumb: '#1A2E22',
    shadow: '0 2px 8px rgba(0,0,0,.4)', shadowMd: '0 4px 24px rgba(0,0,0,.5)', shadowLg: '0 8px 40px rgba(0,0,0,.6)',
    preview: ['#060F0A','#0C1810','#10B981'],
  },
  rose: {
    label: 'Rose Dark',
    accent: '#F43F5E', accentHover: '#FB7185', accentDim: 'rgba(244,63,94,.15)',
    base: '#120A0E', surface: '#1E1018', elevated: '#281520', overlay: '#361A2C', input: '#100810',
    border: '#3A1525', borderHover: '#5A2040',
    textPrimary: '#F0F2FF', textSecondary: '#D8DCF0', textMuted: '#9AA0BC', textDim: '#636880',
    scrollThumb: '#361A2C',
    shadow: '0 2px 8px rgba(0,0,0,.4)', shadowMd: '0 4px 24px rgba(0,0,0,.5)', shadowLg: '0 8px 40px rgba(0,0,0,.6)',
    preview: ['#120A0E','#1E1018','#F43F5E'],
  },
  slate: {
    label: 'Slate Gray',
    accent: '#06B6D4', accentHover: '#22D3EE', accentDim: 'rgba(6,182,212,.15)',
    base: '#090C10', surface: '#10141C', elevated: '#181E28', overlay: '#202836', input: '#0C1018',
    border: '#202840', borderHover: '#304060',
    textPrimary: '#F0F2FF', textSecondary: '#D8DCF0', textMuted: '#9AA0BC', textDim: '#636880',
    scrollThumb: '#202836',
    shadow: '0 2px 8px rgba(0,0,0,.4)', shadowMd: '0 4px 24px rgba(0,0,0,.5)', shadowLg: '0 8px 40px rgba(0,0,0,.6)',
    preview: ['#090C10','#10141C','#06B6D4'],
  },
  amber: {
    label: 'Amber Night',
    accent: '#F59E0B', accentHover: '#FBbf24', accentDim: 'rgba(245,158,11,.15)',
    base: '#0E0A04', surface: '#181208', elevated: '#221A0C', overlay: '#2E2410', input: '#120E06',
    border: '#3A2A10', borderHover: '#5A4020',
    textPrimary: '#F0F2FF', textSecondary: '#D8DCF0', textMuted: '#9AA0BC', textDim: '#636880',
    scrollThumb: '#2E2410',
    shadow: '0 2px 8px rgba(0,0,0,.4)', shadowMd: '0 4px 24px rgba(0,0,0,.5)', shadowLg: '0 8px 40px rgba(0,0,0,.6)',
    preview: ['#0E0A04','#181208','#F59E0B'],
  },
};

const THEME_KEY    = 'tst-theme';
const FONT_KEY     = 'tst-font-size';
const FONT_SIZES   = { small: 0.88, medium: 1.0, large: 1.14 };
const FONT_DEFAULT = 'medium';

function applyFontSize(key) {
  const scale = FONT_SIZES[key] || 1.0;
  const apply = () => { if (document.body) document.body.style.zoom = scale; };
  if (document.body) apply();
  else document.addEventListener('DOMContentLoaded', apply);
}
function getFontSize()     { try { return localStorage.getItem(FONT_KEY) || FONT_DEFAULT; } catch { return FONT_DEFAULT; } }
function saveFontSize(key) { try { localStorage.setItem(FONT_KEY, key); } catch {} applyFontSize(key); }

// Apply font size immediately
applyFontSize(getFontSize());

function applyTheme(key) {
  const t = THEMES[key] || THEMES.light;
  const root = document.documentElement;
  root.setAttribute('data-theme', key);
  root.style.setProperty('--accent',          t.accent);
  root.style.setProperty('--accent-hover',    t.accentHover);
  root.style.setProperty('--accent-dim',      t.accentDim);
  root.style.setProperty('--accent-glow',     `0 0 20px ${t.accent}66`);
  root.style.setProperty('--bg-base',         t.base);
  root.style.setProperty('--bg-surface',      t.surface);
  root.style.setProperty('--bg-elevated',     t.elevated);
  root.style.setProperty('--bg-overlay',      t.overlay);
  root.style.setProperty('--bg-input',        t.input);
  root.style.setProperty('--border',          t.border);
  root.style.setProperty('--border-hover',    t.borderHover);
  root.style.setProperty('--border-focus',    t.accent);
  root.style.setProperty('--text-primary',    t.textPrimary);
  root.style.setProperty('--text-secondary',  t.textSecondary);
  root.style.setProperty('--text-muted',      t.textMuted);
  root.style.setProperty('--text-dim',        t.textDim);
  root.style.setProperty('--shadow-sm',       t.shadow);
  root.style.setProperty('--shadow',          t.shadowMd);
  root.style.setProperty('--shadow-lg',       t.shadowLg);
  // Scrollbar thumb colour via CSS variable
  root.style.setProperty('--scrollbar-thumb', t.scrollThumb);
  document.body.style.background = t.base;
}

function getTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'light'; } catch { return 'light'; }
}

function saveTheme(key) {
  try { localStorage.setItem(THEME_KEY, key); } catch {}
  applyTheme(key);
}

// Apply immediately on load
applyTheme(getTheme());
