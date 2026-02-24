const path = require('path');
const stylelint = require('stylelint');
const postcssReporter = require('postcss-reporter');

module.exports = {
  plugins: [
    stylelint({
      configFile: path.resolve(__dirname, '.stylelintrc.cjs'),
      formatter: 'string',
    }),
    postcssReporter({
      clearReportedMessages: true,
    }),
  ],
};
