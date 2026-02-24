/**
 * prvctice UI Kit — Math Expression Evaluator
 * Safe recursive-descent parser for mathematical expressions.
 * prvctice.math.evaluate(expr, vars) — no eval(), no new Function().
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  // ==================== CONSTANTS ====================

  var CONSTANTS = {
    pi: Math.PI,
    PI: Math.PI,
    e: Math.E,
    E: Math.E,
  };

  // ==================== FUNCTIONS ====================

  var FUNCTIONS = {
    sin: function (a) {
      return Math.sin(a);
    },
    cos: function (a) {
      return Math.cos(a);
    },
    tan: function (a) {
      return Math.tan(a);
    },
    asin: function (a) {
      return Math.asin(a);
    },
    acos: function (a) {
      return Math.acos(a);
    },
    atan: function (a) {
      return Math.atan(a);
    },
    sinh: function (a) {
      return (Math.exp(a) - Math.exp(-a)) / 2;
    },
    cosh: function (a) {
      return (Math.exp(a) + Math.exp(-a)) / 2;
    },
    tanh: function (a) {
      return (Math.exp(2 * a) - 1) / (Math.exp(2 * a) + 1);
    },
    sqrt: function (a) {
      return Math.sqrt(a);
    },
    cbrt: function (a) {
      return Math.pow(a, 1 / 3);
    },
    log: function (a) {
      return Math.log(a);
    },
    ln: function (a) {
      return Math.log(a);
    },
    log10: function (a) {
      return Math.log(a) / Math.LN10;
    },
    log2: function (a) {
      return Math.log(a) / Math.LN2;
    },
    exp: function (a) {
      return Math.exp(a);
    },
    abs: function (a) {
      return Math.abs(a);
    },
    ceil: function (a) {
      return Math.ceil(a);
    },
    floor: function (a) {
      return Math.floor(a);
    },
    round: function (a) {
      return Math.round(a);
    },
    sign: function (a) {
      return a > 0 ? 1 : a < 0 ? -1 : 0;
    },
  };

  // Multi-argument functions
  var MULTI_ARG_FUNCTIONS = {
    min: function (args) {
      return Math.min.apply(Math, args);
    },
    max: function (args) {
      return Math.max.apply(Math, args);
    },
    pow: function (args) {
      if (args.length < 2) throw new Error('pow() requires 2 arguments');
      return Math.pow(args[0], args[1]);
    },
    atan2: function (args) {
      if (args.length < 2) throw new Error('atan2() requires 2 arguments');
      return Math.atan2(args[0], args[1]);
    },
  };

  // ==================== TOKENIZER ====================

  function tokenize(expr) {
    var tokens = [];
    var i = 0;
    var len = expr.length;

    while (i < len) {
      var ch = expr.charAt(i);

      // Skip whitespace
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        i++;
        continue;
      }

      // Number (including decimals like .5)
      if (
        (ch >= '0' && ch <= '9') ||
        (ch === '.' && i + 1 < len && expr.charAt(i + 1) >= '0' && expr.charAt(i + 1) <= '9')
      ) {
        var numStr = '';
        while (
          i < len &&
          ((expr.charAt(i) >= '0' && expr.charAt(i) <= '9') || expr.charAt(i) === '.')
        ) {
          numStr += expr.charAt(i);
          i++;
        }
        // Scientific notation (e.g., 1e5, 2.5e-3)
        if (i < len && (expr.charAt(i) === 'e' || expr.charAt(i) === 'E')) {
          numStr += expr.charAt(i);
          i++;
          if (i < len && (expr.charAt(i) === '+' || expr.charAt(i) === '-')) {
            numStr += expr.charAt(i);
            i++;
          }
          while (i < len && expr.charAt(i) >= '0' && expr.charAt(i) <= '9') {
            numStr += expr.charAt(i);
            i++;
          }
        }
        tokens.push({ type: 'number', value: parseFloat(numStr) });
        continue;
      }

      // Identifier (variable, function, or constant name)
      if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
        var id = '';
        while (
          i < len &&
          ((expr.charAt(i) >= 'a' && expr.charAt(i) <= 'z') ||
            (expr.charAt(i) >= 'A' && expr.charAt(i) <= 'Z') ||
            (expr.charAt(i) >= '0' && expr.charAt(i) <= '9') ||
            expr.charAt(i) === '_')
        ) {
          id += expr.charAt(i);
          i++;
        }
        tokens.push({ type: 'identifier', value: id });
        continue;
      }

      // Two-character operators
      if (ch === '*' && i + 1 < len && expr.charAt(i + 1) === '*') {
        tokens.push({ type: 'operator', value: '**' });
        i += 2;
        continue;
      }

      // Single-character operators and punctuation
      if (
        ch === '+' ||
        ch === '-' ||
        ch === '*' ||
        ch === '/' ||
        ch === '%' ||
        ch === '^' ||
        ch === '(' ||
        ch === ')' ||
        ch === ','
      ) {
        tokens.push({ type: 'operator', value: ch });
        i++;
        continue;
      }

      throw new Error('Unexpected character: ' + ch);
    }

    return tokens;
  }

  // ==================== PARSER ====================
  //
  // Grammar (precedence low to high):
  //   expression  = term (('+' | '-') term)*
  //   term        = power (('*' | '/' | '%') power)*
  //   power       = unary (('^' | '**') unary)*   (right-associative)
  //   unary       = ('-' | '+') unary | call
  //   call        = identifier '(' arglist ')' | primary
  //   primary     = number | identifier | '(' expression ')'

  function createParser(tokens, vars) {
    var pos = 0;

    function peek() {
      return pos < tokens.length ? tokens[pos] : null;
    }

    function consume() {
      return tokens[pos++];
    }

    function expect(type, value) {
      var tok = consume();
      if (!tok || tok.type !== type || (value !== undefined && tok.value !== value)) {
        throw new Error(
          'Expected ' + (value || type) + ' but got ' + (tok ? tok.value : 'end of expression')
        );
      }
      return tok;
    }

    function parseExpression() {
      var left = parseTerm();
      var tok = peek();
      while (tok && tok.type === 'operator' && (tok.value === '+' || tok.value === '-')) {
        consume();
        var right = parseTerm();
        if (tok.value === '+') {
          left = left + right;
        } else {
          left = left - right;
        }
        tok = peek();
      }
      return left;
    }

    function parseTerm() {
      var left = parsePower();
      var tok = peek();
      while (
        tok &&
        tok.type === 'operator' &&
        (tok.value === '*' || tok.value === '/' || tok.value === '%')
      ) {
        consume();
        var right = parsePower();
        if (tok.value === '*') {
          left = left * right;
        } else if (tok.value === '/') {
          left = left / right;
        } else {
          left = left % right;
        }
        tok = peek();
      }
      return left;
    }

    function parsePower() {
      var base = parseUnary();
      var tok = peek();
      if (tok && tok.type === 'operator' && (tok.value === '^' || tok.value === '**')) {
        consume();
        // Right-associative: recurse into parsePower
        var exponent = parsePower();
        return Math.pow(base, exponent);
      }
      return base;
    }

    function parseUnary() {
      var tok = peek();
      if (tok && tok.type === 'operator' && tok.value === '-') {
        consume();
        return -parseUnary();
      }
      if (tok && tok.type === 'operator' && tok.value === '+') {
        consume();
        return parseUnary();
      }
      return parseCall();
    }

    function parseCall() {
      var tok = peek();
      if (tok && tok.type === 'identifier') {
        var name = tok.value;
        var nextTok = pos + 1 < tokens.length ? tokens[pos + 1] : null;
        if (nextTok && nextTok.type === 'operator' && nextTok.value === '(') {
          // Function call
          consume(); // identifier
          consume(); // (
          var args = [];
          var inner = peek();
          if (!inner || !(inner.type === 'operator' && inner.value === ')')) {
            args.push(parseExpression());
            var comma = peek();
            while (comma && comma.type === 'operator' && comma.value === ',') {
              consume();
              args.push(parseExpression());
              comma = peek();
            }
          }
          expect('operator', ')');

          // Multi-argument functions
          if (MULTI_ARG_FUNCTIONS[name]) {
            return MULTI_ARG_FUNCTIONS[name](args);
          }
          // Single-argument functions
          if (FUNCTIONS[name]) {
            if (args.length !== 1) {
              throw new Error(name + '() expects 1 argument, got ' + args.length);
            }
            return FUNCTIONS[name](args[0]);
          }
          throw new Error('Unknown function: ' + name);
        }
      }
      return parsePrimary();
    }

    function parsePrimary() {
      var tok = peek();
      if (!tok) {
        throw new Error('Unexpected end of expression');
      }

      // Number literal
      if (tok.type === 'number') {
        consume();
        return tok.value;
      }

      // Identifier (constant or variable)
      if (tok.type === 'identifier') {
        consume();
        if (Object.prototype.hasOwnProperty.call(CONSTANTS, tok.value)) {
          return CONSTANTS[tok.value];
        }
        if (vars && Object.prototype.hasOwnProperty.call(vars, tok.value)) {
          return vars[tok.value];
        }
        throw new Error('Unknown variable: ' + tok.value);
      }

      // Parenthesized expression
      if (tok.type === 'operator' && tok.value === '(') {
        consume();
        var result = parseExpression();
        expect('operator', ')');
        return result;
      }

      throw new Error('Unexpected token: ' + tok.value);
    }

    return {
      parseExpression: parseExpression,
      isComplete: function () {
        return pos >= tokens.length;
      },
    };
  }

  // ==================== PUBLIC API ====================

  /**
   * Evaluate a mathematical expression string.
   * @param {string} expr - The expression to evaluate (e.g., 'sin(x) + x^2')
   * @param {Object} [vars] - Variable values (e.g., {x: 1.5, y: 2})
   * @returns {number} The result
   * @throws {Error} On syntax errors or unknown variables/functions
   */
  function evaluate(expr, vars) {
    if (typeof expr !== 'string' || expr.trim() === '') {
      throw new Error('Expression must be a non-empty string');
    }
    var tokens = tokenize(expr);
    if (tokens.length === 0) {
      throw new Error('Empty expression');
    }
    var parser = createParser(tokens, vars || {});
    var result = parser.parseExpression();
    if (!parser.isComplete()) {
      throw new Error('Unexpected content after expression');
    }
    return result;
  }

  // ==================== REGISTRATION ====================

  if (!window.prvctice) window.prvctice = {};
  window.prvctice.math = {
    evaluate: evaluate,
  };
})();
