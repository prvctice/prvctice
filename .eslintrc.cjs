module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'prettier', 'vue'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    // Keep Prettier integration but do not fail lint on formatting; we treat it as a warning.
    'plugin:prettier/recommended',
  ],
  overrides: [
    // CommonJS/Node JS files: use default JS parser and relax TS/Prettier rules
    // Scripts use console.log for CLI output
    {
      files: [
        'scripts/**/*.js',
        'main.js',
        'forge.config.js',
        'vite.config.js',
        'electron/**/*.js',
      ],
      env: { node: true, browser: false },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script',
      },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'prettier/prettier': 'off',
        'no-empty': 'off',
        'no-console': 'off',
      },
    },
    // Electron preload can access DOM globals
    {
      files: ['preload.js'],
      env: { node: true, browser: true },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script',
      },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'prettier/prettier': 'off',
      },
    },
    // Project JS under src: keep Prettier but disable TS-specific rules
    // Backend code uses console for server logging
    {
      files: ['src/**/*.js'],
      env: { node: true, browser: true },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        // relax a few stylistic rules for legacy JS
        'no-empty': 'off',
        'no-useless-escape': 'off',
        'no-inner-declarations': 'off',
        'no-constant-condition': 'off',
        'no-console': 'off',
      },
    },
    // Backend TypeScript (src/**/*.ts) - server logging allowed
    {
      files: ['src/**/*.ts'],
      rules: {
        'no-console': 'off',
      },
    },
    // Frontend/browser JS under web: allow DOM globals and relax common rules
    {
      files: ['web/**/*.js'],
      env: { browser: true, node: false },
      rules: {
        'no-empty': 'off',
        'no-inner-declarations': 'off',
        'no-constant-condition': 'off',
        'no-undef': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
    // Debug logging utility - allowed to use console.* methods
    {
      files: ['web/utils/debugLog.ts'],
      rules: {
        'no-console': 'off',
      },
    },
    // Vue Single File Components
    {
      files: ['web/**/*.vue'],
      env: { browser: true, node: false },
      parser: 'vue-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser',
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      extends: ['plugin:vue/vue3-recommended'],
      rules: {
        'vue/multi-word-component-names': 'off',
        'vue/no-multiple-template-root': 'off',
        'vue/max-attributes-per-line': 'off',
        'vue/singleline-html-element-content-newline': 'off',
        'vue/attributes-order': 'off',
        'vue/html-self-closing': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'no-unused-vars': 'off',
        'no-undef': 'off',
        'no-constant-condition': 'off',
      },
    },
  ],
  ignorePatterns: ['node_modules/', 'dist/', 'build/', 'bin/', 'archive/'],
  rules: {
    // Treat Prettier as advisory so lint doesn't fail on formatting alone
    'prettier/prettier': 'warn',
    'no-empty': 'off',
    'no-inner-declarations': 'off',
    // Error on console.log usage - migrate to debugLog utility
    // Allow debug/warn/error which are used by debugLog.ts internals
    'no-console': ['error', { allow: ['error', 'warn', 'debug'] }],
  },
};
