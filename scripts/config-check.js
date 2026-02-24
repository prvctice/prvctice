#!/usr/bin/env node
/*
 * Prints effective defaults and runtime info without starting a server.
 */
const { loadDefaults } = require('../src/config/defaults');
const pkg = require('../package.json');

function main() {
  const defaults = loadDefaults();
  const out = {
    version: pkg.version,
    defaults: {
      providerDefault: defaults.providerDefault,
      models: defaults.models,
      reasoningDefault: defaults.reasoningDefault,
      features: defaults.features,
    },
    env: {
      hasOpenAI: Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY),
      hasAnthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      hasGoogle: Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY),
    },
  };
  console.log(JSON.stringify(out, null, 2));
}

main();
