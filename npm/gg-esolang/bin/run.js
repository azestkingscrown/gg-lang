#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { spawnSync, execSync } = require('child_process');

const VERSION = '1.2.1';
const TAG = 'v1.2.1';
const REPO = 'azestkingscrown/gg-lang';

const TARGET_MAP = {
  'linux-x64': {
    asset: 'gg-v1.2.1-linux-x86_64.tar.gz',
    binName: 'gg',
    archiveType: 'tar.gz',
    sha256: '1e7c3ae92aca1f3660c0d1a09f74af56a51d4b126b263f067d0570b75bab9fb5',
  },
  'linux-arm64': {
    asset: 'gg-v1.2.1-linux-aarch64.tar.gz',
    binName: 'gg',
    archiveType: 'tar.gz',
    sha256: '75386d70c0e8d1625d74763be6ea2e79fbb6b672a3b523bf31513c0c315c1807',
  },
  'darwin-arm64': {
    asset: 'gg-v1.2.1-macos-aarch64.tar.gz',
    binName: 'gg',
    archiveType: 'tar.gz',
    sha256: 'da8cb67c03d1b0c7ac164d30891147e4be816588ff5986f6a70b26378268ab7e',
  },
  'darwin-x64': {
    asset: 'gg-v1.2.1-macos-x86_64.tar.gz',
    binName: 'gg',
    archiveType: 'tar.gz',
    sha256: '892eed5f6ffe81e5b47de44e6de5da88ae12117454a171c6a525e84a594e2eeb',
  },
  'win32-x64': {
    asset: 'gg-v1.2.1-windows-x86_64.zip',
    binName: 'gg.exe',
    archiveType: 'zip',
    sha256: 'f30612047c6791a0355e555ac51efef8351466d542de5c14f4aa895a8e8d466b',
  },
  'win32-arm64': {
    asset: 'gg-v1.2.1-windows-aarch64.zip',
    binName: 'gg.exe',
    archiveType: 'zip',
    sha256: '9bc23e9d3406f5922446f3c09d0c9a344ff63a89bbafca4d8fde5739feea7bc',
  },
};

function getPlatformKey() {
  const platform = process.platform;
  let arch = process.arch;

  // On macOS x64 running under Rosetta 2 on Apple Silicon
  if (platform === 'darwin' && arch === 'x64') {
    try {
      const isTranslated = execSync('sysctl -in sysctl.proc_translated', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (isTranslated === '1') {
        arch = 'arm64';
      }
    } catch {}
  }

  return `${platform}-${arch}`;
}

function getCacheDir() {
  if (process.platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'gg-lang',
      VERSION
    );
  }
  const xdgCache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return path.join(xdgCache, 'gg-lang', VERSION);
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    function get(currentUrl, redirectCount = 0) {
      if (redirectCount > 5) {
        return reject(new Error('Too many redirects while downloading release asset.'));
      }

      https.get(currentUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location, redirectCount + 1);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed with HTTP ${res.statusCode}: ${currentUrl}`));
        }

        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(resolve);
        });

        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      }).on('error', reject);
    }

    get(url);
  });
}

function verifySha256(filePath, expectedSha256) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      const actual = hash.digest('hex');
      if (actual.toLowerCase() === expectedSha256.toLowerCase()) {
        resolve();
      } else {
        reject(new Error(`Checksum mismatch!\nExpected: ${expectedSha256}\nActual:   ${actual}`));
      }
    });
    stream.on('error', reject);
  });
}

function extractArchive(archivePath, targetDir, archiveType) {
  fs.mkdirSync(targetDir, { recursive: true });
  if (archiveType === 'tar.gz') {
    execSync(`tar -xzf "${archivePath}" -C "${targetDir}"`, { stdio: 'inherit' });
  } else if (archiveType === 'zip') {
    if (process.platform === 'win32') {
      try {
        execSync(`tar.exe -xf "${archivePath}" -C "${targetDir}"`, { stdio: 'inherit' });
      } catch {
        execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${targetDir}' -Force"`, { stdio: 'inherit' });
      }
    } else {
      execSync(`unzip -q -o "${archivePath}" -d "${targetDir}"`, { stdio: 'inherit' });
    }
  }
}

async function ensureBinary() {
  const key = getPlatformKey();
  const config = TARGET_MAP[key];

  if (!config) {
    console.error(`[gg-esolang] Unsupported platform/architecture: ${key}`);
    console.error(`[gg-esolang] Supported platforms: ${Object.keys(TARGET_MAP).join(', ')}`);
    console.error(`[gg-esolang] You can build from source using 'cargo build --release' or report this issue at:`);
    console.error(`         https://github.com/${REPO}/issues`);
    process.exit(1);
  }

  const cacheDir = getCacheDir();
  const binaryPath = path.join(cacheDir, config.binName);

  if (fs.existsSync(binaryPath)) {
    try {
      fs.accessSync(binaryPath, fs.constants.X_OK);
      return binaryPath;
    } catch {
      // If found but not executable, attempt chmod
      try {
        fs.chmodSync(binaryPath, 0o755);
        return binaryPath;
      } catch {}
    }
  }

  const downloadUrl = `https://github.com/${REPO}/releases/download/${TAG}/${config.asset}`;
  const tempArchivePath = path.join(cacheDir, config.asset);

  fs.mkdirSync(cacheDir, { recursive: true });

  process.stderr.write(`[gg-esolang] Downloading native binary for ${key} (${TAG})...\n`);

  try {
    await downloadFile(downloadUrl, tempArchivePath);
    await verifySha256(tempArchivePath, config.sha256);
    extractArchive(tempArchivePath, cacheDir, config.archiveType);

    if (process.platform !== 'win32') {
      fs.chmodSync(binaryPath, 0o755);
    }

    try {
      fs.unlinkSync(tempArchivePath);
    } catch {}

    return binaryPath;
  } catch (err) {
    try {
      if (fs.existsSync(tempArchivePath)) fs.unlinkSync(tempArchivePath);
      if (fs.existsSync(binaryPath)) fs.unlinkSync(binaryPath);
    } catch {}
    console.error(`[gg-esolang] Failed to prepare native binary: ${err.message}`);
    process.exit(1);
  }
}

async function main() {
  const binaryPath = await ensureBinary();
  const args = process.argv.slice(2);

  const result = spawnSync(binaryPath, args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`[gg-esolang] Execution error: ${result.error.message}`);
    process.exit(1);
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
  } else {
    process.exit(result.status ?? 0);
  }
}

main().catch((err) => {
  console.error(`[gg-esolang] Unexpected fatal error: ${err.message}`);
  process.exit(1);
});
