#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');

// Directories and files to exclude from secret scanning
const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  'out',
  'build',
  'dist',
  'coverage',
  '.vercel'
]);

const IGNORED_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml'
]);

const PLACEHOLDER_PATTERNS = [
  /^password$/i,
  /^your[-_]?password$/i,
  /^your[-_]?actual[-_]?password$/i,
  /^your[-_]?local[-_]?password$/i,
  /^\[.*password.*\]$/i,
  /^<.*password.*>$/i,
  /^xxxxx+$/i,
  /^placeholder$/i,
  /^\.\.\.$/,
  /^test$/i,
  /^sample$/i,
  /^user:password$/i
];

function isPlaceholder(value) {
  if (!value) return true;
  const trimmed = value.trim();
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(trimmed));
}

// SHA-256 hashes of known prohibited leaked credentials/identifiers to avoid storing plaintext in code
const BLACKLISTED_HASHES = new Set([
  crypto.createHash('sha256').update('oojbfgqprqrimudnzydy').digest('hex'),
  crypto.createHash('sha256').update('Achilles@505@Aiga').digest('hex'),
  crypto.createHash('sha256').update('Achilles%40505%40Aiga').digest('hex'),
  crypto.createHash('sha256').update('Achilles!505!Aiga').digest('hex'),
  crypto.createHash('sha256').update('Achilles%23505%23Aiga').digest('hex'),
  crypto.createHash('sha256').update('Achilles505Aiga').digest('hex'),
]);

// Exact known leaked SHA-256 hashes pre-computed
const PRECOMPUTED_HASHES = new Set([
  '29ec0b1f6920f78bcde76495dfdc5617ba85e2b02a2eb3b6d2673a5a73e655cf',
  '3a6ffeb04f58c792ca82d9da31e9c20490b4d4580bfb9f848eb3a69623512270',
  '03cf65d210515152a420b925f6f4d2f004a43405b58309b67484df4777d130ae',
  '8ff9c98616fa1f2aa6f272a8fe8b1b22e11894d0c26ee3a903c74debe7ee9808',
  '120df0ee74ee8fc7714155a0fc40e8b2b6279f6430335e236ceebca35a643594',
  'f746dc038ec8b5093f41249e917d23a6773a48eef824bc80735e5d3269cb6a2a'
]);

// Regex rules for potential credentials
const SECRET_RULES = [
  {
    name: 'Real PostgreSQL Connection String',
    regex: /postgres(?:ql)?:\/\/(?:([^:\s"'/]+):)?([^@\s"'/]+)@([^:/\s"']+)(?::(\d+))?\/([^?\s"']+)/g,
    validate: (match, user, password, host) => {
      if (!password) return null;
      if (isPlaceholder(password)) return null;
      if (host === 'localhost' && (password === 'password' || password === 'your-local-password')) {
        return null;
      }
      return `PostgreSQL URI contains real-looking password: "${password}"`;
    }
  },
  {
    name: 'Live Clerk Secret Key',
    regex: /\b(sk_live_[a-zA-Z0-9]{20,})\b/g,
    validate: (match, key) => `Found real Clerk secret key: ${key.substring(0, 10)}...`
  },
  {
    name: 'Google API Key',
    regex: /\b(AIza[0-9A-Za-z\-_]{35})\b/g,
    validate: (match, key) => `Found Google AI / Cloud API key: ${key.substring(0, 8)}...`
  },
  {
    name: 'Trigger.dev Secret Key',
    regex: /\b(tr_(?:dev|prod)_[a-zA-Z0-9]{20,})\b/g,
    validate: (match, key) => {
      if (key.includes('...') || key.includes('placeholder')) return null;
      return `Found Trigger.dev API key: ${key.substring(0, 10)}...`;
    }
  },
  {
    name: 'AWS Access Key ID',
    regex: /\b(AKIA[0-9A-Z]{16})\b/g,
    validate: (match, key) => `Found AWS Access Key: ${key}`
  }
];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(ROOT_DIR, filePath);
  const violations = [];

  // 1. Check tokens against blacklisted hashes
  // Tokenize by common delimiters
  const tokens = content.split(/[\s,;:'"()\[\]{}<>\/\\`?&=]+/);
  for (const token of tokens) {
    if (token.length >= 8) {
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const lowerHash = crypto.createHash('sha256').update(token.toLowerCase()).digest('hex');
      if (PRECOMPUTED_HASHES.has(hash) || PRECOMPUTED_HASHES.has(lowerHash)) {
        violations.push(`Previously leaked credential/project identifier token detected (hash match: ${hash.substring(0, 10)}...)`);
      }
    }
  }

  // 2. Check regex rules
  for (const rule of SECRET_RULES) {
    let match;
    const regex = new RegExp(rule.regex);
    while ((match = regex.exec(content)) !== null) {
      const issue = rule.validate ? rule.validate(...match) : `Matched pattern ${rule.name}`;
      if (issue) {
        const linesUpToMatch = content.substring(0, match.index).split('\n');
        const lineNumber = linesUpToMatch.length;
        violations.push(`Line ${lineNumber}: ${issue}`);
      }
    }
  }

  return { file: relativePath, violations };
}

function traverseDirectory(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        traverseDirectory(fullPath, results);
      }
    } else if (entry.isFile()) {
      if (!IGNORED_FILES.has(entry.name) && !entry.name.endsWith('.png') && !entry.name.endsWith('.jpg') && !entry.name.endsWith('.ico')) {
        const scanResult = scanFile(fullPath);
        if (scanResult.violations.length > 0) {
          results.push(scanResult);
        }
      }
    }
  }

  return results;
}

console.log('🔒 Running secret scan across codebase...');
const scanResults = traverseDirectory(ROOT_DIR);

if (scanResults.length > 0) {
  console.error('\n❌ Secrets or real credentials detected in the repository:\n');
  for (const result of scanResults) {
    console.error(`  📄 ${result.file}`);
    for (const v of result.violations) {
      console.error(`     - ${v}`);
    }
  }
  console.error('\nPlease redact these credentials and replace them with placeholders (e.g. YOUR_PASSWORD, xxxxx).\n');
  process.exit(1);
} else {
  console.log('✅ No leaked secrets or credentials detected.');
  process.exit(0);
}
