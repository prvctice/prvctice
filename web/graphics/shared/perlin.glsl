// Shared Perlin noise GLSL functions
// Requires: uPerlin sampler2D uniform

const float PI = 3.14159265358979323846264;
const float PERLIN_SIZE_F = 4095.0;
const float PERLIN_DIM = 64.0;

float pLookup(float index) {
  float i = mod(index, PERLIN_SIZE_F + 1.0);
  float y = floor(i / PERLIN_DIM);
  float x = i - y * PERLIN_DIM;
  vec2 uv = (vec2(x + 0.5, y + 0.5)) / PERLIN_DIM;
  return texture2D(uPerlin, uv).r;
}

float scos(float i) { return 0.5 * (1.0 - cos(i * PI)); }

// 3D Perlin noise calculation (p5.js compatible)
// Octave count is configurable via P5NOISE_OCTAVES define (default 4)
#ifndef P5NOISE_OCTAVES
#define P5NOISE_OCTAVES 4
#endif

float p5noise(float x, float y, float z) {
  if (x < 0.0) x = -x;
  if (y < 0.0) y = -y;
  if (z < 0.0) z = -z;
  float xi = floor(x), yi = floor(y), zi = floor(z);
  float xf = x - xi, yf = y - yi, zf = z - zi;
  float r = 0.0;
  float ampl = 0.5;
  float of = xi + yi * 16.0 + zi * 256.0;
  for (int o = 0; o < P5NOISE_OCTAVES; o++) {
    float rxf = scos(xf);
    float ryf = scos(yf);
    float n1 = pLookup(mod(of, PERLIN_SIZE_F + 1.0));
    n1 += rxf * (pLookup(mod(of + 1.0, PERLIN_SIZE_F + 1.0)) - n1);
    float n2 = pLookup(mod(of + 16.0, PERLIN_SIZE_F + 1.0));
    n2 += rxf * (pLookup(mod(of + 16.0 + 1.0, PERLIN_SIZE_F + 1.0)) - n2);
    n1 += ryf * (n2 - n1);
    of = of + 256.0;
    n2 = pLookup(mod(of, PERLIN_SIZE_F + 1.0));
    n2 += rxf * (pLookup(mod(of + 1.0, PERLIN_SIZE_F + 1.0)) - n2);
    float n3 = pLookup(mod(of + 16.0, PERLIN_SIZE_F + 1.0));
    n3 += rxf * (pLookup(mod(of + 16.0 + 1.0, PERLIN_SIZE_F + 1.0)) - n3);
    n2 += ryf * (n3 - n2);
    n1 += scos(zf) * (n2 - n1);
    r += n1 * ampl;
    ampl *= 0.5;
    xi *= 2.0; yi *= 2.0; zi *= 2.0;
    xf *= 2.0; yf *= 2.0; zf *= 2.0;
    if (xf >= 1.0) { xi += 1.0; xf -= 1.0; }
    if (yf >= 1.0) { yi += 1.0; yf -= 1.0; }
    if (zf >= 1.0) { zi += 1.0; zf -= 1.0; }
    of = xi + yi * 16.0 + zi * 256.0;
  }
  return r;
}
