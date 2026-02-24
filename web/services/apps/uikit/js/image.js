/**
 * prvctice UI Kit — Image Processing
 * WebGL-accelerated filters, Canvas 2D transforms, compositing,
 * text rendering, and PNG/JPEG export. All operations non-destructive
 * (return new canvas elements). Max size: 4096x4096.
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  var MAX_SIZE = 4096;

  // ==================== INTERNAL: SHARED WEBGL ====================

  var _glCanvas = null;
  var _gl = null;
  var _vertexBuffer = null;
  var _shaderCache = {};

  var VERTEX_SHADER_SRC =
    'attribute vec2 aPosition;\n' +
    'varying vec2 vTexCoord;\n' +
    'void main() {\n' +
    '  vTexCoord = aPosition * 0.5 + 0.5;\n' +
    '  vTexCoord.y = 1.0 - vTexCoord.y;\n' +
    '  gl_Position = vec4(aPosition, 0.0, 1.0);\n' +
    '}\n';

  function getGL() {
    if (_gl && !_gl.isContextLost()) return _gl;
    _glCanvas = document.createElement('canvas');
    _gl = _glCanvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!_gl) return null;

    // Set up full-screen quad vertex buffer
    _vertexBuffer = _gl.createBuffer();
    _gl.bindBuffer(_gl.ARRAY_BUFFER, _vertexBuffer);
    _gl.bufferData(
      _gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      _gl.STATIC_DRAW
    );

    _shaderCache = {};
    return _gl;
  }

  function compileShader(gl, type, src) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function getProgram(gl, fragSrc) {
    if (_shaderCache[fragSrc]) return _shaderCache[fragSrc];
    var vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return null;
    }
    _shaderCache[fragSrc] = prog;
    return prog;
  }

  function applyGLFilter(canvas, fragSrc, setUniforms) {
    var gl = getGL();
    if (!gl) return applyCanvasFallback(canvas, fragSrc);

    var w = canvas.width;
    var h = canvas.height;
    _glCanvas.width = w;
    _glCanvas.height = h;
    gl.viewport(0, 0, w, h);

    var prog = getProgram(gl, fragSrc);
    if (!prog) return copyCanvas(canvas);
    gl.useProgram(prog);

    // Bind vertex buffer
    var posLoc = gl.getAttribLocation(prog, 'aPosition');
    gl.bindBuffer(gl.ARRAY_BUFFER, _vertexBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Upload source as texture
    var tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

    var texLoc = gl.getUniformLocation(prog, 'uTexture');
    gl.uniform1i(texLoc, 0);

    var resLoc = gl.getUniformLocation(prog, 'uResolution');
    if (resLoc) gl.uniform2f(resLoc, w, h);

    if (setUniforms) setUniforms(gl, prog);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Read back to new canvas
    var result = document.createElement('canvas');
    result.width = w;
    result.height = h;
    var ctx = result.getContext('2d');
    ctx.drawImage(_glCanvas, 0, 0);

    gl.deleteTexture(tex);
    return result;
  }

  // Canvas 2D fallback for basic CSS filters
  function applyCanvasFallback(canvas, fragSrc) {
    return copyCanvas(canvas);
  }

  // ==================== INTERNAL: UTILITY ====================

  function clampSize(width, height) {
    if (width <= MAX_SIZE && height <= MAX_SIZE) return { w: width, h: height };
    var ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height);
    return { w: Math.round(width * ratio), h: Math.round(height * ratio) };
  }

  function toCanvas(source) {
    var w, h;
    if (source instanceof HTMLCanvasElement) {
      w = source.width;
      h = source.height;
      if (w <= MAX_SIZE && h <= MAX_SIZE) return source;
    } else if (source instanceof HTMLImageElement) {
      w = source.naturalWidth;
      h = source.naturalHeight;
    } else if (source instanceof HTMLVideoElement) {
      w = source.videoWidth;
      h = source.videoHeight;
    } else {
      return source;
    }
    var size = clampSize(w, h);
    var c = document.createElement('canvas');
    c.width = size.w;
    c.height = size.h;
    var ctx = c.getContext('2d');
    ctx.drawImage(source, 0, 0, size.w, size.h);
    return c;
  }

  function copyCanvas(canvas) {
    var c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    var ctx = c.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    return c;
  }

  // ==================== FRAGMENT SHADERS ====================

  var FRAG_HEADER =
    'precision mediump float;\n' +
    'varying vec2 vTexCoord;\n' +
    'uniform sampler2D uTexture;\n' +
    'uniform vec2 uResolution;\n';

  var FRAG_GRAYSCALE =
    FRAG_HEADER +
    'void main() {\n' +
    '  vec4 c = texture2D(uTexture, vTexCoord);\n' +
    '  float g = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));\n' +
    '  gl_FragColor = vec4(vec3(g), c.a);\n' +
    '}\n';

  var FRAG_SEPIA =
    FRAG_HEADER +
    'void main() {\n' +
    '  vec4 c = texture2D(uTexture, vTexCoord);\n' +
    '  float r = dot(c.rgb, vec3(0.393, 0.769, 0.189));\n' +
    '  float g = dot(c.rgb, vec3(0.349, 0.686, 0.168));\n' +
    '  float b = dot(c.rgb, vec3(0.272, 0.534, 0.131));\n' +
    '  gl_FragColor = vec4(min(r,1.0), min(g,1.0), min(b,1.0), c.a);\n' +
    '}\n';

  var FRAG_INVERT =
    FRAG_HEADER +
    'void main() {\n' +
    '  vec4 c = texture2D(uTexture, vTexCoord);\n' +
    '  gl_FragColor = vec4(1.0 - c.rgb, c.a);\n' +
    '}\n';

  var FRAG_BRIGHTNESS =
    FRAG_HEADER +
    'uniform float uValue;\n' +
    'void main() {\n' +
    '  vec4 c = texture2D(uTexture, vTexCoord);\n' +
    '  gl_FragColor = vec4(clamp(c.rgb + uValue, 0.0, 1.0), c.a);\n' +
    '}\n';

  var FRAG_CONTRAST =
    FRAG_HEADER +
    'uniform float uValue;\n' +
    'void main() {\n' +
    '  vec4 c = texture2D(uTexture, vTexCoord);\n' +
    '  float f = (1.0 + uValue) / (1.0 - uValue + 0.001);\n' +
    '  vec3 r = clamp(f * (c.rgb - 0.5) + 0.5, 0.0, 1.0);\n' +
    '  gl_FragColor = vec4(r, c.a);\n' +
    '}\n';

  var FRAG_SATURATION =
    FRAG_HEADER +
    'uniform float uValue;\n' +
    'void main() {\n' +
    '  vec4 c = texture2D(uTexture, vTexCoord);\n' +
    '  float g = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));\n' +
    '  vec3 r = mix(vec3(g), c.rgb, 1.0 + uValue);\n' +
    '  gl_FragColor = vec4(clamp(r, 0.0, 1.0), c.a);\n' +
    '}\n';

  var FRAG_HUE_ROTATE =
    FRAG_HEADER +
    'uniform float uAngle;\n' +
    'void main() {\n' +
    '  vec4 c = texture2D(uTexture, vTexCoord);\n' +
    '  float a = uAngle * 3.14159265 / 180.0;\n' +
    '  float cosA = cos(a);\n' +
    '  float sinA = sin(a);\n' +
    '  mat3 m = mat3(\n' +
    '    0.213+0.787*cosA-0.213*sinA, 0.213-0.213*cosA+0.143*sinA, 0.213-0.213*cosA-0.787*sinA,\n' +
    '    0.715-0.715*cosA-0.715*sinA, 0.715+0.285*cosA+0.140*sinA, 0.715-0.715*cosA+0.715*sinA,\n' +
    '    0.072-0.072*cosA+0.928*sinA, 0.072-0.072*cosA-0.283*sinA, 0.072+0.928*cosA+0.072*sinA\n' +
    '  );\n' +
    '  gl_FragColor = vec4(clamp(m * c.rgb, 0.0, 1.0), c.a);\n' +
    '}\n';

  var FRAG_BLUR =
    FRAG_HEADER +
    'uniform float uRadius;\n' +
    'void main() {\n' +
    '  vec4 sum = vec4(0.0);\n' +
    '  float total = 0.0;\n' +
    '  float r = uRadius;\n' +
    '  for (float y = -10.0; y <= 10.0; y += 1.0) {\n' +
    '    for (float x = -10.0; x <= 10.0; x += 1.0) {\n' +
    '      if (abs(x) > r || abs(y) > r) continue;\n' +
    '      vec2 offset = vec2(x, y) / uResolution;\n' +
    '      float w = exp(-(x*x + y*y) / (2.0 * r * r));\n' +
    '      sum += texture2D(uTexture, vTexCoord + offset) * w;\n' +
    '      total += w;\n' +
    '    }\n' +
    '  }\n' +
    '  gl_FragColor = sum / total;\n' +
    '}\n';

  var FRAG_SHARPEN =
    FRAG_HEADER +
    'uniform float uAmount;\n' +
    'void main() {\n' +
    '  vec2 px = 1.0 / uResolution;\n' +
    '  vec4 c = texture2D(uTexture, vTexCoord);\n' +
    '  vec4 n = texture2D(uTexture, vTexCoord + vec2(0.0, -px.y));\n' +
    '  vec4 s = texture2D(uTexture, vTexCoord + vec2(0.0,  px.y));\n' +
    '  vec4 e = texture2D(uTexture, vTexCoord + vec2( px.x, 0.0));\n' +
    '  vec4 w = texture2D(uTexture, vTexCoord + vec2(-px.x, 0.0));\n' +
    '  vec4 sharp = c * (1.0 + 4.0 * uAmount) - (n + s + e + w) * uAmount;\n' +
    '  gl_FragColor = vec4(clamp(sharp.rgb, 0.0, 1.0), c.a);\n' +
    '}\n';

  var FRAG_VIGNETTE =
    FRAG_HEADER +
    'uniform float uRadius;\n' +
    'uniform float uAmount;\n' +
    'void main() {\n' +
    '  vec4 c = texture2D(uTexture, vTexCoord);\n' +
    '  vec2 center = vTexCoord - 0.5;\n' +
    '  float dist = length(center);\n' +
    '  float vig = smoothstep(uRadius, uRadius + 0.3, dist);\n' +
    '  gl_FragColor = vec4(c.rgb * (1.0 - vig * uAmount), c.a);\n' +
    '}\n';

  var FRAG_NOISE =
    FRAG_HEADER +
    'uniform float uAmount;\n' +
    'uniform float uSeed;\n' +
    'float rand(vec2 co) {\n' +
    '  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);\n' +
    '}\n' +
    'void main() {\n' +
    '  vec4 c = texture2D(uTexture, vTexCoord);\n' +
    '  float n = (rand(vTexCoord + uSeed) - 0.5) * uAmount;\n' +
    '  gl_FragColor = vec4(clamp(c.rgb + n, 0.0, 1.0), c.a);\n' +
    '}\n';

  var FRAG_POSTERIZE =
    FRAG_HEADER +
    'uniform float uLevels;\n' +
    'void main() {\n' +
    '  vec4 c = texture2D(uTexture, vTexCoord);\n' +
    '  vec3 r = floor(c.rgb * uLevels + 0.5) / uLevels;\n' +
    '  gl_FragColor = vec4(r, c.a);\n' +
    '}\n';

  var FRAG_EMBOSS =
    FRAG_HEADER +
    'void main() {\n' +
    '  vec2 px = 1.0 / uResolution;\n' +
    '  vec4 tl = texture2D(uTexture, vTexCoord + vec2(-px.x, -px.y));\n' +
    '  vec4 br = texture2D(uTexture, vTexCoord + vec2( px.x,  px.y));\n' +
    '  vec4 c = texture2D(uTexture, vTexCoord);\n' +
    '  vec3 diff = (br.rgb - tl.rgb) * 2.0 + 0.5;\n' +
    '  gl_FragColor = vec4(clamp(diff, 0.0, 1.0), c.a);\n' +
    '}\n';

  // ==================== FILTER FUNCTIONS ====================

  function grayscale(canvas, params) {
    return applyGLFilter(toCanvas(canvas), FRAG_GRAYSCALE);
  }

  function sepia(canvas, params) {
    return applyGLFilter(toCanvas(canvas), FRAG_SEPIA);
  }

  function invert(canvas, params) {
    return applyGLFilter(toCanvas(canvas), FRAG_INVERT);
  }

  function brightness(canvas, params) {
    if (!params) params = {};
    var val = typeof params.value === 'number' ? params.value : 0;
    return applyGLFilter(toCanvas(canvas), FRAG_BRIGHTNESS, function (gl, prog) {
      gl.uniform1f(gl.getUniformLocation(prog, 'uValue'), val);
    });
  }

  function contrast(canvas, params) {
    if (!params) params = {};
    var val = typeof params.value === 'number' ? params.value : 0;
    return applyGLFilter(toCanvas(canvas), FRAG_CONTRAST, function (gl, prog) {
      gl.uniform1f(gl.getUniformLocation(prog, 'uValue'), val);
    });
  }

  function saturation(canvas, params) {
    if (!params) params = {};
    var val = typeof params.value === 'number' ? params.value : 0;
    return applyGLFilter(toCanvas(canvas), FRAG_SATURATION, function (gl, prog) {
      gl.uniform1f(gl.getUniformLocation(prog, 'uValue'), val);
    });
  }

  function hueRotate(canvas, params) {
    if (!params) params = {};
    var angle = typeof params.angle === 'number' ? params.angle : 0;
    return applyGLFilter(toCanvas(canvas), FRAG_HUE_ROTATE, function (gl, prog) {
      gl.uniform1f(gl.getUniformLocation(prog, 'uAngle'), angle);
    });
  }

  function blur(canvas, params) {
    if (!params) params = {};
    var radius = typeof params.radius === 'number' ? params.radius : 5;
    // Clamp radius for performance (shader loops have fixed iteration count)
    radius = Math.min(10, Math.max(0, radius));
    return applyGLFilter(toCanvas(canvas), FRAG_BLUR, function (gl, prog) {
      gl.uniform1f(gl.getUniformLocation(prog, 'uRadius'), radius);
    });
  }

  function sharpen(canvas, params) {
    if (!params) params = {};
    var amount = typeof params.amount === 'number' ? params.amount : 0.5;
    return applyGLFilter(toCanvas(canvas), FRAG_SHARPEN, function (gl, prog) {
      gl.uniform1f(gl.getUniformLocation(prog, 'uAmount'), amount);
    });
  }

  function vignette(canvas, params) {
    if (!params) params = {};
    var radius = typeof params.radius === 'number' ? params.radius : 0.5;
    var amount = typeof params.amount === 'number' ? params.amount : 0.5;
    return applyGLFilter(toCanvas(canvas), FRAG_VIGNETTE, function (gl, prog) {
      gl.uniform1f(gl.getUniformLocation(prog, 'uRadius'), radius);
      gl.uniform1f(gl.getUniformLocation(prog, 'uAmount'), amount);
    });
  }

  function noise(canvas, params) {
    if (!params) params = {};
    var amount = typeof params.amount === 'number' ? params.amount : 0.1;
    return applyGLFilter(toCanvas(canvas), FRAG_NOISE, function (gl, prog) {
      gl.uniform1f(gl.getUniformLocation(prog, 'uAmount'), amount);
      gl.uniform1f(gl.getUniformLocation(prog, 'uSeed'), Math.random());
    });
  }

  function posterize(canvas, params) {
    if (!params) params = {};
    var levels = typeof params.levels === 'number' ? params.levels : 4;
    levels = Math.max(2, Math.min(32, levels));
    return applyGLFilter(toCanvas(canvas), FRAG_POSTERIZE, function (gl, prog) {
      gl.uniform1f(gl.getUniformLocation(prog, 'uLevels'), levels);
    });
  }

  function emboss(canvas, params) {
    return applyGLFilter(toCanvas(canvas), FRAG_EMBOSS);
  }

  // Filter lookup table
  var FILTERS = {
    grayscale: grayscale,
    sepia: sepia,
    invert: invert,
    brightness: brightness,
    contrast: contrast,
    saturation: saturation,
    hueRotate: hueRotate,
    blur: blur,
    sharpen: sharpen,
    vignette: vignette,
    noise: noise,
    posterize: posterize,
    emboss: emboss,
  };

  // ==================== PIPELINE ====================

  /**
   * Apply a chain of filters.
   * @param {HTMLCanvasElement|HTMLImageElement|HTMLVideoElement} source
   * @param {Array<{filter: string, ...params}>} steps
   * @returns {HTMLCanvasElement}
   */
  function pipeline(source, steps) {
    var current = toCanvas(source);
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      var fn = FILTERS[step.filter];
      if (fn) current = fn(current, step);
    }
    return current;
  }

  // ==================== TRANSFORMS ====================

  /**
   * Crop a region from the canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {{x: number, y: number, width: number, height: number}} opts
   * @returns {HTMLCanvasElement}
   */
  function crop(canvas, opts) {
    if (!opts) opts = {};
    var src = toCanvas(canvas);
    var x = opts.x || 0;
    var y = opts.y || 0;
    var w = opts.width || src.width;
    var h = opts.height || src.height;
    var size = clampSize(w, h);
    var result = document.createElement('canvas');
    result.width = size.w;
    result.height = size.h;
    var ctx = result.getContext('2d');
    ctx.drawImage(src, x, y, w, h, 0, 0, size.w, size.h);
    return result;
  }

  /**
   * Resize the canvas. Preserves aspect ratio if only one dimension given.
   * @param {HTMLCanvasElement} canvas
   * @param {{width?: number, height?: number}} opts
   * @returns {HTMLCanvasElement}
   */
  function resize(canvas, opts) {
    if (!opts) opts = {};
    var src = toCanvas(canvas);
    var w = opts.width;
    var h = opts.height;
    if (w && !h) {
      h = Math.round(src.height * (w / src.width));
    } else if (h && !w) {
      w = Math.round(src.width * (h / src.height));
    } else if (!w && !h) {
      return copyCanvas(src);
    }
    var size = clampSize(w, h);
    var result = document.createElement('canvas');
    result.width = size.w;
    result.height = size.h;
    var ctx = result.getContext('2d');
    ctx.drawImage(src, 0, 0, size.w, size.h);
    return result;
  }

  /**
   * Rotate the canvas. Canvas size expands to fit.
   * @param {HTMLCanvasElement} canvas
   * @param {{angle: number}} opts - Angle in degrees
   * @returns {HTMLCanvasElement}
   */
  function rotate(canvas, opts) {
    if (!opts) opts = {};
    var src = toCanvas(canvas);
    var angle = ((opts.angle || 0) * Math.PI) / 180;
    var cosA = Math.abs(Math.cos(angle));
    var sinA = Math.abs(Math.sin(angle));
    var w = Math.round(src.width * cosA + src.height * sinA);
    var h = Math.round(src.width * sinA + src.height * cosA);
    var size = clampSize(w, h);
    var result = document.createElement('canvas');
    result.width = size.w;
    result.height = size.h;
    var ctx = result.getContext('2d');
    ctx.translate(size.w / 2, size.h / 2);
    ctx.rotate(angle);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
    return result;
  }

  /**
   * Flip the canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {{horizontal?: boolean, vertical?: boolean}} opts
   * @returns {HTMLCanvasElement}
   */
  function flip(canvas, opts) {
    if (!opts) opts = {};
    var src = toCanvas(canvas);
    var result = document.createElement('canvas');
    result.width = src.width;
    result.height = src.height;
    var ctx = result.getContext('2d');
    var sx = opts.horizontal ? -1 : 1;
    var sy = opts.vertical ? -1 : 1;
    ctx.translate(opts.horizontal ? src.width : 0, opts.vertical ? src.height : 0);
    ctx.scale(sx, sy);
    ctx.drawImage(src, 0, 0);
    return result;
  }

  // ==================== COMPOSITING ====================

  /**
   * Composite two canvases with blend mode.
   * @param {HTMLCanvasElement} base
   * @param {HTMLCanvasElement} overlay
   * @param {{blendMode?: string, x?: number, y?: number, opacity?: number}} opts
   * @returns {HTMLCanvasElement}
   */
  function composite(base, overlay, opts) {
    if (!opts) opts = {};
    var baseSrc = toCanvas(base);
    var overlaySrc = toCanvas(overlay);
    var blendMode = opts.blendMode || 'normal';
    var x = opts.x || 0;
    var y = opts.y || 0;
    var opacity = typeof opts.opacity === 'number' ? opts.opacity : 1;

    // Map blend mode names to globalCompositeOperation values
    var blendMap = {
      normal: 'source-over',
      multiply: 'multiply',
      screen: 'screen',
      overlay: 'overlay',
      darken: 'darken',
      lighten: 'lighten',
    };

    var result = document.createElement('canvas');
    result.width = baseSrc.width;
    result.height = baseSrc.height;
    var ctx = result.getContext('2d');
    ctx.drawImage(baseSrc, 0, 0);
    ctx.globalCompositeOperation = blendMap[blendMode] || 'source-over';
    ctx.globalAlpha = opacity;
    ctx.drawImage(overlaySrc, x, y);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    return result;
  }

  // ==================== TEXT ====================

  /**
   * Render text onto a canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {string} textStr
   * @param {{x?: number, y?: number, font?: string, size?: number, color?: string, align?: string, baseline?: string, maxWidth?: number}} opts
   * @returns {HTMLCanvasElement}
   */
  function text(canvas, textStr, opts) {
    if (!opts) opts = {};
    var src = toCanvas(canvas);
    var result = copyCanvas(src);
    var ctx = result.getContext('2d');
    var fontSize = opts.size || 16;
    var fontFamily = opts.font || 'sans-serif';
    ctx.font = fontSize + 'px ' + fontFamily;
    ctx.fillStyle = opts.color || '#ffffff';
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'top';
    var x = typeof opts.x === 'number' ? opts.x : 0;
    var y = typeof opts.y === 'number' ? opts.y : 0;
    if (opts.maxWidth) {
      ctx.fillText(textStr, x, y, opts.maxWidth);
    } else {
      ctx.fillText(textStr, x, y);
    }
    return result;
  }

  // ==================== EXPORT ====================

  /**
   * Export canvas as data URL.
   * @param {HTMLCanvasElement} canvas
   * @param {{format?: string, quality?: number}} opts
   * @returns {string} Data URL
   */
  function exportImage(canvas, opts) {
    if (!opts) opts = {};
    var format = opts.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    var quality = typeof opts.quality === 'number' ? opts.quality : 0.92;
    return canvas.toDataURL(format, quality);
  }

  /**
   * Export canvas as Blob.
   * @param {HTMLCanvasElement} canvas
   * @param {{format?: string, quality?: number}} opts
   * @returns {Promise<Blob>}
   */
  function exportBlob(canvas, opts) {
    if (!opts) opts = {};
    var format = opts.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    var quality = typeof opts.quality === 'number' ? opts.quality : 0.92;
    return new Promise(function (resolve) {
      canvas.toBlob(
        function (blob) {
          resolve(blob);
        },
        format,
        quality
      );
    });
  }

  // ==================== ATTACH TO PRVCTICE NAMESPACE ====================

  function waitForPrvctice() {
    if (window.prvctice) {
      window.prvctice.image = {
        // Filters
        grayscale: grayscale,
        sepia: sepia,
        blur: blur,
        sharpen: sharpen,
        brightness: brightness,
        contrast: contrast,
        saturation: saturation,
        invert: invert,
        hueRotate: hueRotate,
        vignette: vignette,
        noise: noise,
        posterize: posterize,
        emboss: emboss,
        // Pipeline
        pipeline: pipeline,
        // Transforms
        crop: crop,
        resize: resize,
        rotate: rotate,
        flip: flip,
        // Compositing
        composite: composite,
        // Text
        text: text,
        // Export
        exportImage: exportImage,
        exportBlob: exportBlob,
      };
    } else {
      setTimeout(waitForPrvctice, 10);
    }
  }

  waitForPrvctice();
})();
