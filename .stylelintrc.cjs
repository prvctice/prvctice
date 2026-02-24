module.exports = {
  extends: ['stylelint-config-standard'],
  rules: {
    'color-hex-length': 'short',
    'selector-class-pattern': null,
    'no-descending-specificity': null,
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global'] }],
    // Allow -webkit-backdrop-filter (required for Safari support)
    'property-no-vendor-prefix': [true, { ignoreProperties: ['backdrop-filter'] }],
    // Allow traditional media query syntax for broader browser support
    'media-feature-range-notation': null,
  },
  ignoreFiles: [
    '**/dist/**/*',
    '**/node_modules/**/*',
    '**/public/themes/**/*.css', // handled in later thematic audit
  ],
};
