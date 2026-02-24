#!/usr/bin/env node
/*
 * Applies the same localStorage migration used in the browser to a JSON file.
 * Usage:
 *   node scripts/config-migrate.js --file path/to/localstorage.json
 * If no file is provided, uses ./.localstorage.json in the repo root.
 */
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = { file: path.join(process.cwd(), '.localstorage.json') };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file' && argv[i + 1]) {
      out.file = path.resolve(argv[++i]);
      continue;
    }
  }
  return out;
}

function migrate(storage) {
  // 1) Legacy model keys → new namespaced keys
  const legacy = {
    openaiModel: 'model:openai',
    anthropicModel: 'model:anthropic',
    geminiModel: 'model:gemini',
  };
  for (const [oldKey, newKey] of Object.entries(legacy)) {
    const oldVal = storage[oldKey];
    const hasNew = storage[newKey];
    if (oldVal && !hasNew) storage[newKey] = oldVal;
  }

  // 2) Normalize reasoning effort minimal → low
  if (storage.chatReasoningEffort === 'minimal') storage.chatReasoningEffort = 'low';

  // 3) Mark migration flag
  storage['config:migration:v1'] = '1';
  return storage;
}

function main() {
  const { file } = parseArgs(process.argv);
  let data = {};
  if (fs.existsSync(file)) {
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.error(`Failed to read ${file}: ${e.message}`);
      process.exit(1);
    }
  }
  const before = JSON.stringify(data);
  const migrated = migrate(data);
  const after = JSON.stringify(migrated, null, 2);
  fs.writeFileSync(file, after + '\n', 'utf8');
  console.log(`Wrote migrated storage to ${file}`);
  if (before === after) {
    console.log('No changes (already up-to-date).');
  } else {
    console.log('Applied migration v1.');
  }
}

if (require.main === module) main();

// Export for testing
module.exports = { migrate };
