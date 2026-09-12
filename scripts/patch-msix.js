const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

exports.default = async function(context) {
  const msixFiles = context.artifactPaths.filter(p => p.endsWith('.msix'));
  if (!msixFiles.length) return;

  // Find makeappx.exe
  let makeappx = '';
  try {
    const kitsDir = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
    const dirs = fs.readdirSync(kitsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(kitsDir, d.name, 'x64', 'makeappx.exe'))
      .filter(p => fs.existsSync(p));
    makeappx = dirs[0];
  } catch {}
  if (!makeappx) { console.warn('[patch-msix] makeappx.exe not found, skipping patch'); return; }

  // Custom tile assets in build/appx/
  const projectRoot = path.resolve(__dirname, '..');
  const customAssetsDir = path.join(projectRoot, 'build', 'appx');
  const tileAssets = ['Square44x44Logo.png', 'Square150x150Logo.png', 'Wide310x150Logo.png', 'StoreLogo.png'];

  for (const msix of msixFiles) {
    const tmpDir = msix + '_patch_tmp';
    const fixed  = msix.replace('.msix', '-fixed.msix');
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
      execSync(`"${makeappx}" unpack /p "${msix}" /d "${tmpDir}" /nv`, { stdio: 'inherit' });

      // 1. Patch MinVersion
      const manifestPath = path.join(tmpDir, 'AppxManifest.xml');
      let xml = fs.readFileSync(manifestPath, 'utf8');
      xml = xml.replace(/MinVersion="10\.0\.14316\.0"/g, 'MinVersion="10.0.17763.0"')
               .replace(/MaxVersionTested="10\.0\.14316\.0"/g, 'MaxVersionTested="10.0.17763.0"');
      fs.writeFileSync(manifestPath, xml);
      console.log('[patch-msix] MinVersion patched to 10.0.17763.0');

      // 2. Replace tile assets with custom logo
      const msixAssetsDir = path.join(tmpDir, 'assets');
      if (fs.existsSync(customAssetsDir)) {
        for (const tile of tileAssets) {
          const src  = path.join(customAssetsDir, tile);
          const dest = path.join(msixAssetsDir, tile);
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`[patch-msix] Replaced tile: ${tile}`);
          }
        }
      } else {
        console.warn('[patch-msix] build/appx/ not found, skipping tile replacement');
      }

      execSync(`"${makeappx}" pack /d "${tmpDir}" /p "${fixed}" /nv`, { stdio: 'inherit' });
      fs.rmSync(tmpDir, { recursive: true });
      console.log(`[patch-msix] Done: ${fixed}`);
    } catch (e) {
      console.error('[patch-msix] Failed:', e.message);
    }
  }
};
