# prvctice SDK Reference

Complete API reference for the `window.prvctice` namespace available to sandboxed iframe apps. All method signatures verified against source code (`bridgeSDK.ts` and UIKit JS modules).

Apps run inside sandboxed iframes and communicate with the host via a postMessage bridge. The SDK handles handshake, request queuing, and response correlation automatically. All async methods return Promises. All code examples use ES5 syntax.

---

## Table of Contents

- [Lifecycle](#lifecycle)
- [Storage](#storage)
- [Theme](#theme)
- [Window](#window)
- [Time](#time)
- [Location](#location)
- [Weather](#weather)
- [News](#news)
- [Web](#web)
- [AI](#ai)
- [Sports](#sports)
- [Markets](#markets)
- [Wikipedia](#wikipedia)
- [Books](#books)
- [Academic](#academic)
- [Art](#art)
- [Movies](#movies)
- [Music](#music)
- [YouTube](#youtube)
- [Europeana](#europeana)
- [Smithsonian](#smithsonian)
- [Library of Congress](#library-of-congress)
- [Google Books](#google-books)
- [Films](#films)
- [Vision](#vision)
- [Media](#media)
- [Utility](#utility)
- [Audio](#audio)
- [Audio Transport and Recording](#audio-transport-and-recording)
- [Audio Buffer](#audio-buffer)
- [Image Processing](#image-processing)
- [Frame Capture](#frame-capture)
- [Refresh](#refresh)
- [Math](#math)
- [Chat](#chat)
- [Context](#context)
- [Broadcast](#broadcast)
- [Skills](#skills)
- [Calendar](#calendar)
- [Clipboard](#clipboard)
- [Files](#files)
- [Virtual File System](#virtual-file-system)
- [Mixer](#mixer)
- [Connectors](#connectors)
- [Input](#input)
- [Actions](#actions)
- [Animation](#animation)
- [UI Components](#ui-components)
- [Notifications](#notifications)
- [Navigation](#navigation)
- [Forms](#forms)
- [Streaming AI](#streaming-ai)
- [Media Playback](#media-playback)
- [Camera](#camera)
- [Video](#video)
- [GIF Encoder](#gif-encoder)
- [Charts](#charts)

---

## Lifecycle

### prvctice.onReady(callback)

Register a callback to run when the bridge handshake completes. If already ready, fires immediately.

| Parameter | Type     | Required | Description                        |
| --------- | -------- | -------- | ---------------------------------- |
| callback  | function | Yes      | Function to call when SDK is ready |

**Returns:** `undefined`

**Example:**

```javascript
prvctice.onReady(function () {
  prvctice.window.setTitle('My App');
  // All initialization code goes here
});
```

### prvctice.onDispose(callback)

Register a cleanup callback that fires when the app is closed. Use for releasing resources.

| Parameter | Type     | Required | Description      |
| --------- | -------- | -------- | ---------------- |
| callback  | function | Yes      | Cleanup function |

**Returns:** `function` -- Unsubscribe function that removes the callback.

**Example:**

```javascript
var unsubDispose = prvctice.onDispose(function () {
  clearInterval(timerId);
});
```

---

## Storage

App-scoped key-value storage. Each app gets its own isolated storage namespace.

### prvctice.storage.get(key)

Retrieve a value from storage.

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| key       | string | Yes      | Storage key |

**Returns:** `Promise<any>` -- The stored value, or `undefined` if not found.

**Example:**

```javascript
prvctice.storage.get('settings').then(function (settings) {
  if (settings) {
    applySettings(settings);
  }
});
```

### prvctice.storage.set(key, value)

Store a value. Values are JSON-serialized.

| Parameter | Type   | Required | Description                                |
| --------- | ------ | -------- | ------------------------------------------ |
| key       | string | Yes      | Storage key                                |
| value     | any    | Yes      | Value to store (must be JSON-serializable) |

**Returns:** `Promise<void>`

**Example:**

```javascript
prvctice.storage.set('settings', { theme: 'dark', volume: 0.8 });
```

### prvctice.storage.delete(key)

Delete a stored value.

| Parameter | Type   | Required | Description           |
| --------- | ------ | -------- | --------------------- |
| key       | string | Yes      | Storage key to delete |

**Returns:** `Promise<void>`

**Example:**

```javascript
prvctice.storage.delete('cache');
```

### prvctice.storage.usage()

Get storage usage statistics for this app.

**Returns:** `Promise<object>` -- Usage info including bytes used.

**Example:**

```javascript
prvctice.storage.usage().then(function (info) {
  console.log('Storage used:', info);
});
```

---

## Theme

Access the current theme colors. Apps automatically inherit the active theme via CSS custom properties (`--prvctice-background`, `--prvctice-text`, `--prvctice-primary`, etc.).

### prvctice.theme.get()

Get the current theme colors.

**Returns:** `Promise<object>` -- Theme object with color properties (background, surface, text, textSecondary, primary, secondary, accent, border).

**Example:**

```javascript
prvctice.theme.get().then(function (theme) {
  console.log('Primary color:', theme.primary);
});
```

### prvctice.theme.onChange(callback)

Subscribe to theme changes. The callback fires whenever the user switches themes.

| Parameter | Type     | Required | Description                   |
| --------- | -------- | -------- | ----------------------------- |
| callback  | function | Yes      | Receives the new theme object |

**Returns:** `function` -- Unsubscribe function.

**Example:**

```javascript
var unsub = prvctice.theme.onChange(function (theme) {
  updateChartColors(theme.primary);
});
```

---

## Window

Control the app window (title, size, focus/close events).

### prvctice.window.setTitle(title)

Set the window title bar text.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| title     | string | Yes      | Window title |

**Returns:** `undefined` (fire-and-forget)

**Example:**

```javascript
prvctice.window.setTitle('Weather Dashboard');
```

### prvctice.window.resize(width, height)

Request a window resize.

| Parameter | Type   | Required | Description      |
| --------- | ------ | -------- | ---------------- |
| width     | number | Yes      | Width in pixels  |
| height    | number | Yes      | Height in pixels |

**Returns:** `undefined` (fire-and-forget)

**Example:**

```javascript
prvctice.window.resize(400, 600);
```

### prvctice.window.onFocus(callback)

Subscribe to focus/blur events.

| Parameter | Type     | Required | Description                               |
| --------- | -------- | -------- | ----------------------------------------- |
| callback  | function | Yes      | Receives `true` on focus, `false` on blur |

**Returns:** `function` -- Unsubscribe function.

**Example:**

```javascript
var unsub = prvctice.window.onFocus(function (focused) {
  if (focused) refreshData();
});
```

### prvctice.window.onClose(callback)

Subscribe to the close event. Fires after `onDispose` callbacks.

| Parameter | Type     | Required | Description   |
| --------- | -------- | -------- | ------------- |
| callback  | function | Yes      | Close handler |

**Returns:** `function` -- Unsubscribe function.

---

## Time

Get current time and timezone. These are synchronous (no bridge call).

### prvctice.time.now()

Get current time as ISO string.

**Returns:** `string` -- ISO 8601 timestamp.

**Example:**

```javascript
var now = prvctice.time.now(); // "2026-02-15T10:30:00.000Z"
```

### prvctice.time.timezone()

Get the user's timezone.

**Returns:** `string` -- IANA timezone identifier (e.g., `"America/New_York"`).

**Example:**

```javascript
var tz = prvctice.time.timezone(); // "America/New_York"
```

---

## Location

Get user location and geocoding.

### prvctice.location.current()

Get the user's current location.

**Returns:** `Promise<object>` -- Location object.

**Example:**

```javascript
prvctice.location.current().then(function (loc) {
  console.log('Location:', loc);
});
```

### prvctice.location.geocode(name)

Convert a place name to coordinates.

| Parameter | Type   | Required | Description           |
| --------- | ------ | -------- | --------------------- |
| name      | string | Yes      | Place name to geocode |

**Returns:** `Promise<Array>` -- Array of geocoding results.

**Example:**

```javascript
prvctice.location.geocode('Tokyo').then(function (results) {
  var first = results[0];
  console.log(first.lat, first.lon);
});
```

### prvctice.location.reverseGeocode(lat, lon)

Convert coordinates to a place name.

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| lat       | number | Yes      | Latitude    |
| lon       | number | Yes      | Longitude   |

**Returns:** `Promise<object>` -- Reverse geocoding result.

**Example:**

```javascript
prvctice.location.reverseGeocode(35.6762, 139.6503).then(function (result) {
  console.log(result.name); // "Tokyo"
});
```

---

## Weather

Get current weather and forecast. Auto-resolves location and units if not provided.

### prvctice.weather.current(location, units)

Get current weather conditions.

| Parameter | Type   | Required | Description                                                   |
| --------- | ------ | -------- | ------------------------------------------------------------- |
| location  | object | No       | Location object. If omitted, uses current location.           |
| units     | string | No       | `"metric"` or `"imperial"`. If omitted, uses user preference. |

**Returns:** `Promise<object>` -- Current weather data.

**Example:**

The resolved object contains Open-Meteo fields:

```javascript
prvctice.weather.current().then(function (w) {
  var temp = Math.round(w.current.temperature_2m);
  var unit = w.units.temperature_2m; // "°C" or "°F"
  document.getElementById('temp').textContent = temp + unit;
  // Also available: w.current.relative_humidity_2m, w.current.wind_speed_10m,
  // w.current.apparent_temperature, w.current.weather_code
  // w.location.name (if geocoded), w.location.lat, w.location.lon
});
```

### prvctice.weather.forecast(location, days, units)

Get multi-day weather forecast.

| Parameter | Type   | Required | Description                                                   |
| --------- | ------ | -------- | ------------------------------------------------------------- |
| location  | object | No       | Location object. If omitted, uses current location.           |
| days      | number | No       | Number of forecast days (default 7)                           |
| units     | string | No       | `"metric"` or `"imperial"`. If omitted, uses user preference. |

**Returns:** `Promise<object>` -- Forecast data.

**Example:**

```javascript
prvctice.weather.forecast(null, 5).then(function (data) {
  data.forecast.forEach(function (day) {
    console.log(day.date, day.high, day.low);
  });
});
```

---

## News

Search news articles and fetch RSS feeds.

### prvctice.news.search(query, limit)

Search news articles.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| query     | string | Yes      | Search query |
| limit     | number | No       | Max results  |

**Returns:** `Promise<Array>` -- Array of news articles.

**Example:**

```javascript
prvctice.news.search('technology', 10).then(function (articles) {
  articles.forEach(function (article) {
    console.log(article.title, article.source);
  });
});
```

### prvctice.news.headlines(topic, limit)

Get top headlines by topic.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| topic     | string | No       | Topic filter |
| limit     | number | No       | Max results  |

**Returns:** `Promise<Array>` -- Array of headline articles.

### prvctice.news.fetch(feedUrl)

Fetch and parse an RSS feed.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| feedUrl   | string | Yes      | RSS feed URL |

**Returns:** `Promise<object>` -- Parsed feed data.

**Example:**

```javascript
prvctice.news.fetch('https://example.com/feed.xml').then(function (feed) {
  feed.items.forEach(function (item) {
    console.log(item.title);
  });
});
```

---

## Web

Fetch remote resources through the host proxy (bypasses iframe CSP restrictions).

### prvctice.web.fetch(url, options)

Fetch a URL through the host proxy.

| Parameter | Type   | Required | Description   |
| --------- | ------ | -------- | ------------- |
| url       | string | Yes      | URL to fetch  |
| options   | object | No       | Fetch options |

**Returns:** `Promise<object>` -- Response data.

**Example:**

```javascript
prvctice.web.fetch('https://api.example.com/data').then(function (response) {
  console.log(response);
});
```

---

## AI

AI text completion. For streaming responses, see [Streaming AI](#streaming-ai).

### prvctice.ai.complete(prompt, options)

Get a complete AI text response.

| Parameter | Type   | Required | Description                          |
| --------- | ------ | -------- | ------------------------------------ |
| prompt    | string | Yes      | Text prompt                          |
| options   | object | No       | Options (maxTokens, provider, model) |

**Returns:** `Promise<object>` -- AI response with text.

**Example:**

```javascript
prvctice.ai.complete('Summarize this in 3 bullet points: ' + text).then(function (result) {
  document.getElementById('summary').textContent = result.text;
});
```

---

## Sports

Get live scores, standings, and schedules.

### prvctice.sports.scores(sport, league)

Get live scores. Accepts either two string arguments or an options object.

| Parameter | Type             | Required | Description                                                             |
| --------- | ---------------- | -------- | ----------------------------------------------------------------------- |
| sport     | string or object | Yes      | Sport name (e.g., `"basketball"`) or options object `{ sport, league }` |
| league    | string           | No       | League name (e.g., `"nba"`)                                             |

**Returns:** `Promise<object>` -- Scores data.

**Example:**

```javascript
prvctice.sports.scores('basketball', 'nba').then(function (scores) {
  console.log(scores);
});
```

### prvctice.sports.standings(sport, league)

Get league standings. Same parameter pattern as `scores`.

**Returns:** `Promise<object>` -- Standings data.

### prvctice.sports.schedule(sport, league)

Get upcoming schedule. Same parameter pattern as `scores`.

**Returns:** `Promise<object>` -- Schedule data.

---

## Markets

Financial market data for crypto and stocks.

### prvctice.markets.crypto(ids, vs)

Get cryptocurrency prices.

| Parameter | Type   | Required | Description                                            |
| --------- | ------ | -------- | ------------------------------------------------------ |
| ids       | string | Yes      | Coin IDs (comma-separated, e.g., `"bitcoin,ethereum"`) |
| vs        | string | No       | Currency to compare against (e.g., `"usd"`)            |

**Returns:** `Promise<object>` -- Price data.

**Example:**

```javascript
prvctice.markets.crypto('bitcoin,ethereum', 'usd').then(function (data) {
  console.log('BTC:', data.bitcoin.usd);
});
```

### prvctice.markets.stock(symbol)

Get stock quote.

| Parameter | Type   | Required | Description         |
| --------- | ------ | -------- | ------------------- |
| symbol    | string | Yes      | Stock ticker symbol |

**Returns:** `Promise<object>` -- Stock data.

### prvctice.markets.trending()

Get trending cryptocurrencies.

**Returns:** `Promise<object>` -- Trending coins.

---

## Wikipedia

Search Wikipedia articles and images.

### prvctice.wikipedia.search(query, limit)

Search Wikipedia articles.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| query     | string | Yes      | Search query |
| limit     | number | No       | Max results  |

**Returns:** `Promise<Array>` -- Search results.

**Example:**

```javascript
prvctice.wikipedia.search('quantum computing', 5).then(function (results) {
  results.forEach(function (r) {
    console.log(r.title, r.snippet);
  });
});
```

### prvctice.wikipedia.images(query, limit)

Search Wikipedia for images.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| query     | string | Yes      | Search query |
| limit     | number | No       | Max results  |

**Returns:** `Promise<Array>` -- Image results.

---

## Books

Search the Open Library catalog.

### prvctice.books.search(query, limit, author)

Search books.

| Parameter | Type   | Required | Description      |
| --------- | ------ | -------- | ---------------- |
| query     | string | Yes      | Search query     |
| limit     | number | No       | Max results      |
| author    | string | No       | Filter by author |

**Returns:** `Promise<Array>` -- Book results.

**Example:**

```javascript
prvctice.books.search('machine learning', 10).then(function (books) {
  books.forEach(function (b) {
    console.log(b.title, b.author);
  });
});
```

---

## Academic

Search academic papers.

### prvctice.academic.search(query, limit)

Search academic papers and journals.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| query     | string | Yes      | Search query |
| limit     | number | No       | Max results  |

**Returns:** `Promise<Array>` -- Academic paper results.

---

## Art

Search art collections from multiple museums.

### prvctice.art.search(query, limit)

Search across art collections.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| query     | string | Yes      | Search query |
| limit     | number | No       | Max results  |

**Returns:** `Promise<Array>` -- Art results.

### prvctice.art.searchArtInstitute(query, limit)

Search the Art Institute of Chicago collection.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| query     | string | Yes      | Search query |
| limit     | number | No       | Max results  |

**Returns:** `Promise<Array>` -- Art results from Art Institute of Chicago.

### prvctice.art.searchMetMuseum(query, limit)

Search the Metropolitan Museum of Art collection.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| query     | string | Yes      | Search query |
| limit     | number | No       | Max results  |

**Returns:** `Promise<Array>` -- Art results from The Met.

---

## Movies

Search movies and get trending content via TMDB.

### prvctice.movies.search(query, limit)

Search movies and TV shows.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| query     | string | Yes      | Search query |
| limit     | number | No       | Max results  |

**Returns:** `Promise<Array>` -- Movie/TV results.

### prvctice.movies.trending(mediaType, timeWindow)

Get trending movies or TV shows.

| Parameter  | Type   | Required | Description                   |
| ---------- | ------ | -------- | ----------------------------- |
| mediaType  | string | No       | `"movie"`, `"tv"`, or `"all"` |
| timeWindow | string | No       | `"day"` or `"week"`           |

**Returns:** `Promise<Array>` -- Trending results.

---

## Music

Search music via MusicBrainz.

### prvctice.music.search(query, limit)

Search artists, albums, and tracks.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| query     | string | Yes      | Search query |
| limit     | number | No       | Max results  |

**Returns:** `Promise<Array>` -- Music search results.

---

## YouTube

Search YouTube videos.

### prvctice.youtube.search(query, limit)

Search YouTube.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| query     | string | Yes      | Search query |
| limit     | number | No       | Max results  |

**Returns:** `Promise<Array>` -- Video results.

---

## Europeana

Search European cultural heritage collections.

### prvctice.europeana.search(query, limit)

Search Europeana.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| query     | string | Yes      | Search query |
| limit     | number | No       | Max results  |

**Returns:** `Promise<Array>` -- Cultural heritage results.

---

## Smithsonian

Search Smithsonian Institution collections.

### prvctice.smithsonian.search(query, limit)

Search Smithsonian.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| query     | string | Yes      | Search query |
| limit     | number | No       | Max results  |

**Returns:** `Promise<Array>` -- Smithsonian results.

---

## Library of Congress

Search the Library of Congress digital collections.

### prvctice.loc.search(query, limit)

Search Library of Congress.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| query     | string | Yes      | Search query |
| limit     | number | No       | Max results  |

**Returns:** `Promise<Array>` -- LoC results.

---

## Google Books

Search Google Books.

### prvctice.googleBooks.search(query, limit, author)

Search Google Books.

| Parameter | Type   | Required | Description      |
| --------- | ------ | -------- | ---------------- |
| query     | string | Yes      | Search query     |
| limit     | number | No       | Max results      |
| author    | string | No       | Filter by author |

**Returns:** `Promise<Array>` -- Google Books results.

---

## Films

Search TMDB films with advanced filtering.

### prvctice.films.search(options)

Search films with structured options.

| Parameter | Type   | Required | Description                               |
| --------- | ------ | -------- | ----------------------------------------- |
| options   | object | No       | Search options (query, year, genre, etc.) |

**Returns:** `Promise<Array>` -- Film results.

**Example:**

```javascript
prvctice.films.search({ query: 'inception', year: 2010 }).then(function (films) {
  films.forEach(function (f) {
    console.log(f.title, f.year, f.rating);
  });
});
```

---

## Vision

AI-powered image description.

### prvctice.vision.describe(imageData, prompt, provider)

Describe an image using AI vision.

| Parameter | Type   | Required | Description                                         |
| --------- | ------ | -------- | --------------------------------------------------- |
| imageData | string | Yes      | Base64 image data or data URI                       |
| prompt    | string | No       | Description prompt (e.g., "What is in this image?") |
| provider  | string | No       | AI provider to use                                  |

**Returns:** `Promise<object>` -- Description result.

**Example:**

```javascript
prvctice.vision.describe(base64Image, 'Describe the objects in this photo').then(function (result) {
  document.getElementById('description').textContent = result.text;
});
```

---

## Media

Microphone recording and file download.

**IMPORTANT — Sandbox restriction:** Apps must NOT call `navigator.mediaDevices.getUserMedia()`
directly. Chrome blocks this from sandboxed iframes with null/opaque origins. Always use
`prvctice.media.startMicrophone()` — it calls `getUserMedia` on the host page where Chrome
will prompt properly.

**Permission required:** Apps that use the microphone must declare `'media:microphone'` in
their `permissions` array in the app config (`web/services/apps/builtin/*/index.ts`).

### prvctice.media.startMicrophone(opts)

Start the host microphone. `getUserMedia` runs on the host page, not the iframe.
Audio data arrives via `onAudioData`.

| Parameter        | Type   | Required | Description                                                                                          |
| ---------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------- |
| opts.mode        | string | No       | `'both'` (record+visualize), `'record'`, `'visualize'`, `'voice'` (effects chain). Default: `'both'` |
| opts.voiceParams | object | No       | Initial voice effects params (only used with `mode: 'voice'`)                                        |

**Returns:** `Promise<{ active: true, mode: string }>`

**Modes:**

- `'both'` — Records raw mic audio AND sends 32-bar frequency data to `onAudioData`. Use for voice notes, audio recorders.
- `'record'` — Records only, no visualization data sent.
- `'visualize'` — Visualization data only, no recording.
- `'voice'` — Sets up a host-side effects chain (pitch, distortion, reverb, delay), outputs processed audio to speakers, records the processed output, sends both frequency bars and waveform samples to `onAudioData`.

**Example (voice notes):**

```javascript
prvctice.media.startMicrophone({ mode: 'both' }).then(function () {
  // mic is live, subscribe to visualization
  unsub = prvctice.media.onAudioData(function (bars) {
    drawWaveform(bars);
  });
});
```

### prvctice.media.stopMicrophone()

Stop the microphone and retrieve the recording.

**Returns:** `Promise<{ stopped: true, audio: string|null, mimeType: string|null, duration: number }>`

- `audio` — Base64-encoded audio (webm/opus). Convert to playable URL: `URL.createObjectURL(prvctice.ui.base64ToBlob(audio, mimeType))`
- `duration` — Approximate duration in ms (chunk count × 250)

**Example:**

```javascript
prvctice.media.stopMicrophone().then(function (result) {
  if (result.audio) {
    var blob = prvctice.ui.base64ToBlob(result.audio, result.mimeType);
    var url = URL.createObjectURL(blob);
    // use url with <audio> or prvctice.ui.mediaPlayer()
  }
});
```

### prvctice.media.updateVoiceParams(params)

Update voice effects chain parameters in real-time. Only works when mic is active with
`mode: 'voice'`. No-op otherwise.

| Parameter       | Type   | Range     | Description                                    |
| --------------- | ------ | --------- | ---------------------------------------------- |
| params.pitch    | number | -12 to 12 | Semitones (LFO delay modulation approximation) |
| params.dist     | number | 0–1       | Distortion amount                              |
| params.reverb   | number | 0–1       | Reverb wet mix                                 |
| params.delay    | number | 0–1       | Delay time in seconds                          |
| params.delayFb  | number | 0–1       | Delay feedback                                 |
| params.delayMix | number | 0–1       | Delay wet mix                                  |
| params.vol      | number | 0–1       | Output volume                                  |

**Returns:** `Promise<{ updated: boolean }>`

### prvctice.media.onAudioData(callback)

Subscribe to real-time audio data from the microphone.

| Parameter | Type     | Required | Description                                |
| --------- | -------- | -------- | ------------------------------------------ |
| callback  | function | Yes      | `function(freqBars, waveform)` — see below |

- `freqBars` — Array of 32 numbers (0–1), frequency spectrum bars. Available in all modes.
- `waveform` — Array of 128 numbers (-1 to 1), time-domain samples. Only sent in `mode: 'voice'`.

**Returns:** `function` — Unsubscribe function. Call in `onDispose`.

**Example:**

```javascript
var unsub = prvctice.media.onAudioData(function (bars, waveform) {
  drawBars(bars); // always available
  if (waveform) drawWave(waveform); // voice mode only
});

prvctice.onDispose(function () {
  unsub();
});
```

### prvctice.media.download(base64, filename, mimeType)

Download a file to the user's device.

| Parameter | Type   | Required | Description                     |
| --------- | ------ | -------- | ------------------------------- |
| base64    | string | Yes      | Base64-encoded file content     |
| filename  | string | Yes      | Download filename               |
| mimeType  | string | Yes      | MIME type (e.g., `"audio/wav"`) |

**Returns:** `Promise<void>`

**Example:**

```javascript
prvctice.audio.bufferToBase64(wavBlob).then(function (b64) {
  prvctice.media.download(b64, 'recording.wav', 'audio/wav');
});
```

### prvctice.media.saveUrl(url, filename)

Download a remote URL and save it as a file.

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| url       | string | Yes      | Remote URL to download    |
| filename  | string | Yes      | Save filename             |

**Returns:** `Promise`

---

## Utility

### prvctice.openUrl(url)

Open a URL in the system browser (Electron) or new tab (web).

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| url       | string | Yes      | URL to open |

**Returns:** `undefined` (fire-and-forget)

### prvctice.sdkVersion

**Type:** `string | null` -- SDK version string. `null` until the bridge handshake completes.

---

## Audio

Web Audio synthesis, recording, and visualization. Runs entirely in-iframe using the Web Audio API.

### prvctice.audio.tone(frequency, duration, opts)

Play a simple tone.

| Parameter | Type   | Required | Description                                  |
| --------- | ------ | -------- | -------------------------------------------- |
| frequency | number | Yes      | Frequency in Hz (e.g., 440 for A4)           |
| duration  | number | No       | Duration in ms (default 200)                 |
| opts      | object | No       | Options: `{ type, volume, attack, release }` |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| type | string | `"sine"` | Oscillator type: `"sine"`, `"square"`, `"sawtooth"`, `"triangle"` |
| volume | number | 0.3 | Volume 0-1 |
| attack | number | 10 | Attack time in ms |
| release | number | 50 | Release time in ms |

**Returns:** `undefined`

**Example:**

```javascript
// Play middle C
prvctice.audio.tone(261.63, 300, { type: 'sine', volume: 0.5 });
```

### prvctice.audio.sequence(notes, opts)

Play a sequence of notes in order.

| Parameter | Type   | Required | Description                                         |
| --------- | ------ | -------- | --------------------------------------------------- |
| notes     | Array  | Yes      | Array of `{ freq, duration }` objects               |
| opts      | object | No       | Shared options: `{ type, volume, attack, release }` |

**Returns:** `undefined`

**Example:**

```javascript
// Play C major arpeggio
prvctice.audio.sequence(
  [
    { freq: 261.63, duration: 200 },
    { freq: 329.63, duration: 200 },
    { freq: 392.0, duration: 200 },
    { freq: 523.25, duration: 400 },
  ],
  { type: 'triangle', volume: 0.4 }
);
```

### prvctice.audio.createContext()

Get or create the shared AudioContext. Resumes if suspended.

**Returns:** `AudioContext`

### prvctice.audio.createAnalyser(opts)

Create an AnalyserNode for audio visualization.

| Parameter | Type   | Required | Description                       |
| --------- | ------ | -------- | --------------------------------- |
| opts      | object | No       | Options: `{ fftSize, smoothing }` |

**Returns:** `{ analyser: AnalyserNode, context: AudioContext }`

**Example:**

```javascript
var result = prvctice.audio.createAnalyser({ fftSize: 256 });
var analyser = result.analyser;
```

### prvctice.audio.getMasterGain()

Get the master gain node. All synthesis output routes through this node.

**Returns:** `GainNode`

### prvctice.audio.getAnalyser()

Get the master bus analyser node tapped from the master gain. Useful for visualization.

**Returns:** `AnalyserNode`

**Example:**

```javascript
var analyser = prvctice.audio.getAnalyser();
var oscilloscope = prvctice.ui.oscilloscope(container, { analyser: analyser });
```

### prvctice.audio.createRecorder(opts)

Create a recorder that captures all audio flowing through the master bus.

| Parameter | Type   | Required | Description             |
| --------- | ------ | -------- | ----------------------- |
| opts      | object | No       | Reserved for future use |

**Returns:** `{ start, stop, isRecording, dispose }`

| Method        | Returns                       | Description                                  |
| ------------- | ----------------------------- | -------------------------------------------- |
| start()       | `undefined`                   | Start recording                              |
| stop()        | `Promise<{ blob, duration }>` | Stop and get recording blob + duration in ms |
| isRecording() | `boolean`                     | Check if currently recording                 |
| dispose()     | `undefined`                   | Clean up recorder resources                  |

**Example:**

```javascript
var recorder = prvctice.audio.createRecorder();
recorder.start();
// ... play some tones ...
recorder.stop().then(function (result) {
  console.log('Recorded', result.duration, 'ms');
  // result.blob is a Blob of audio/webm
});
```

### prvctice.audio.renderOffline(callback, duration, opts)

Render audio faster than real-time using OfflineAudioContext.

| Parameter | Type     | Required | Description                                                |
| --------- | -------- | -------- | ---------------------------------------------------------- |
| callback  | function | Yes      | Receives OfflineAudioContext; build your audio graph on it |
| duration  | number   | Yes      | Duration in seconds                                        |
| opts      | object   | No       | Options: `{ sampleRate, channels }`                        |

**Returns:** `Promise<AudioBuffer>`

### prvctice.audio.encodeWAV(audioBuffer)

Encode an AudioBuffer as a WAV blob (16-bit PCM).

| Parameter   | Type        | Required | Description            |
| ----------- | ----------- | -------- | ---------------------- |
| audioBuffer | AudioBuffer | Yes      | Audio buffer to encode |

**Returns:** `Blob` -- WAV blob with `audio/wav` MIME type.

### prvctice.audio.bufferToBase64(blob)

Convert a Blob to a base64-encoded string.

| Parameter | Type | Required | Description     |
| --------- | ---- | -------- | --------------- |
| blob      | Blob | Yes      | Blob to convert |

**Returns:** `Promise<string>` -- Base64 string (without data URI prefix).

**Example:**

```javascript
// Full recording + export workflow
var recorder = prvctice.audio.createRecorder();
recorder.start();
// ... record audio ...
recorder
  .stop()
  .then(function (result) {
    return prvctice.audio.bufferToBase64(result.blob);
  })
  .then(function (base64) {
    prvctice.media.download(base64, 'recording.webm', 'audio/webm');
  });
```

---

## Audio Transport and Recording

BPM-aware transport clock, per-track state management, and MIDI event recording for DAW-style apps.

### prvctice.audio.createTransport(opts)

Create a BPM-aware transport clock with play/stop/record/seek, looping, and tick/beat callbacks.

Source: `web/services/apps/uikit/js/transport.js`

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| opts      | object | No       | Options     |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| bpm | number | 120 | Beats per minute |
| loop | boolean | false | Enable looping |
| loopStart | number | 0 | Loop start in beats |
| loopEnd | number | 16 | Loop end in beats |

**Returns:**
```
{
  play(), stop(), pause(), record(), seek(beats),
  getState() -> 'stopped' | 'playing' | 'recording',
  getPositionBeats() -> number,
  getBpm() -> number, setBpm(n),
  setLoop(enabled, startBeat?, endBeat?), getLoop(),
  onTick(cb) -> unsubscribe,       // cb(positionBeats) ~60fps
  onBeat(cb) -> unsubscribe,       // cb(beatNumber) on integer beat crossing
  onStateChange(cb) -> unsubscribe, // cb(state)
  dispose()
}
```
All setters return `this` for chaining. BPM is clamped 20-300.

### prvctice.audio.createTrackManager(opts)

Per-track state management (mute, solo, volume, armed). Data-only -- no DOM or audio nodes.

Source: `web/services/apps/uikit/js/track-manager.js`

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| opts      | object | No       | Options     |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| tracks | number | 4 | Number of tracks |
| onChange | function | - | Called when any track state changes |

**Returns:**
```
{
  getTrack(idx), setMute(idx, val), setSolo(idx, val),
  setVolume(idx, vol), setArmed(idx, val), setLabel(idx, label),
  getEffectiveGain(idx) -> number,  // accounts for mute/solo/volume
  getArmedTracks() -> number[],
  getAllTracks(), getTrackCount()
}
```

### prvctice.audio.createMidiRecorder(transport, opts)

Record and play back MIDI note events synchronized to a transport clock.

Source: `web/services/apps/uikit/js/midi-recorder.js`

| Parameter | Type      | Required | Description |
| --------- | --------- | -------- | ----------- |
| transport | Transport | Yes      | Transport instance from `createTransport()` |
| opts      | object    | No       | Options     |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| overdub | boolean | false | Keep existing events when re-recording |

**Returns:**
```
{
  noteOn(midi, velocity?),   // velocity default 100; only records when armed + recording
  noteOff(midi),
  getEvents() -> Array<{ midi, velocity, startBeat, durationBeats }>,
  setEvents(arr), clear(),
  setArmed(val), isArmed(),
  setOverdub(val), hasEvents(),
  setPlaybackHandler(onNoteOn, onNoteOff),
  dispose()
}
```

---

## Audio Buffer

Non-destructive audio buffer manipulation. Every function returns a NEW AudioBuffer -- originals are never mutated. Enables undo/redo via buffer history.

Source: `web/services/apps/uikit/js/audio-buffer.js`

### prvctice.audio.buffer.decode(arrayBuffer)

Decode raw audio bytes into an AudioBuffer.

| Parameter   | Type        | Required | Description          |
| ----------- | ----------- | -------- | -------------------- |
| arrayBuffer | ArrayBuffer | Yes      | Raw audio file bytes |

**Returns:** `Promise<AudioBuffer>`

**Example:**

```javascript
// Load and decode an audio file from a drop
var reader = new FileReader();
reader.onload = function () {
  prvctice.audio.buffer.decode(reader.result).then(function (buffer) {
    console.log('Decoded:', buffer.duration, 'seconds');
  });
};
reader.readAsArrayBuffer(file);
```

### prvctice.audio.buffer.slice(buffer, startTime, endTime)

Extract a time range from the buffer.

| Parameter | Type        | Required | Description           |
| --------- | ----------- | -------- | --------------------- |
| buffer    | AudioBuffer | Yes      | Source buffer         |
| startTime | number      | Yes      | Start time in seconds |
| endTime   | number      | Yes      | End time in seconds   |

**Returns:** `AudioBuffer` -- New buffer containing the slice.

### prvctice.audio.buffer.reverse(buffer)

Reverse the audio data.

| Parameter | Type        | Required | Description   |
| --------- | ----------- | -------- | ------------- |
| buffer    | AudioBuffer | Yes      | Source buffer |

**Returns:** `AudioBuffer` -- New reversed buffer.

### prvctice.audio.buffer.normalize(buffer)

Normalize to peak amplitude of 1.0. If the buffer is silent, returns a copy without scaling.

| Parameter | Type        | Required | Description   |
| --------- | ----------- | -------- | ------------- |
| buffer    | AudioBuffer | Yes      | Source buffer |

**Returns:** `AudioBuffer` -- New normalized buffer.

### prvctice.audio.buffer.fade(buffer, type, duration)

Apply fade in or fade out using a linear ramp.

| Parameter | Type        | Required | Description              |
| --------- | ----------- | -------- | ------------------------ |
| buffer    | AudioBuffer | Yes      | Source buffer            |
| type      | string      | Yes      | `"in"` or `"out"`        |
| duration  | number      | Yes      | Fade duration in seconds |

**Returns:** `AudioBuffer` -- New buffer with fade applied.

### prvctice.audio.buffer.mix(bufferA, bufferB, opts)

Mix two buffers together.

| Parameter | Type        | Required | Description   |
| --------- | ----------- | -------- | ------------- |
| bufferA   | AudioBuffer | Yes      | First buffer  |
| bufferB   | AudioBuffer | Yes      | Second buffer |
| opts      | object      | No       | Options       |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| gainA | number | 1.0 | Gain for buffer A |
| gainB | number | 1.0 | Gain for buffer B |
| offset | number | 0 | Offset in seconds for buffer B start |

**Returns:** `AudioBuffer` -- New mixed buffer. Length = max(bufferA.length, offset + bufferB.length).

### prvctice.audio.buffer.pitchShift(buffer, semitones)

Shift pitch by adjusting playback rate via OfflineAudioContext. Tempo changes proportionally.

| Parameter | Type        | Required | Description                    |
| --------- | ----------- | -------- | ------------------------------ |
| buffer    | AudioBuffer | Yes      | Source buffer                  |
| semitones | number      | Yes      | Semitones to shift (-12 to 12) |

**Returns:** `Promise<AudioBuffer>` -- New pitch-shifted buffer.

**Example:**

```javascript
// Shift up 5 semitones
prvctice.audio.buffer.pitchShift(myBuffer, 5).then(function (shifted) {
  // shifted is a new AudioBuffer at higher pitch
});
```

### prvctice.audio.buffer.waveformPeaks(buffer, resolution)

Extract pre-computed min/max peaks for waveform visualization. Mixes to mono for multi-channel buffers.

| Parameter  | Type        | Required | Description                  |
| ---------- | ----------- | -------- | ---------------------------- |
| buffer     | AudioBuffer | Yes      | Source buffer                |
| resolution | number      | No       | Number of bins (default 200) |

**Returns:** `Array<{min: number, max: number}>` -- Peaks array with values in range [-1, 1].

**Example:**

```javascript
var peaks = prvctice.audio.buffer.waveformPeaks(myBuffer, 300);
// Draw waveform on canvas
var canvas = document.getElementById('waveform');
var ctx = canvas.getContext('2d');
var w = canvas.width;
var h = canvas.height;
var midY = h / 2;
ctx.clearRect(0, 0, w, h);
ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--p-accent-blue');
for (var i = 0; i < peaks.length; i++) {
  var x = (i / peaks.length) * w;
  var barW = w / peaks.length;
  var top = midY + peaks[i].min * midY;
  var bottom = midY + peaks[i].max * midY;
  ctx.fillRect(x, top, barW, bottom - top);
}
```

---

## Image Processing

WebGL-accelerated image filters, Canvas 2D transforms, compositing, text rendering, and export. All operations are non-destructive -- every function returns a new canvas element. Maximum image size: 4096x4096 (larger inputs are silently downscaled).

Source: `web/services/apps/uikit/js/image.js`

### Filters

All filter functions accept a canvas (or image/video element) and return a new canvas.

### prvctice.image.grayscale(canvas)

Convert to grayscale using luminance weights (0.2126, 0.7152, 0.0722).

**Returns:** `HTMLCanvasElement`

### prvctice.image.sepia(canvas)

Apply sepia tone.

**Returns:** `HTMLCanvasElement`

### prvctice.image.blur(canvas, opts)

Gaussian blur.

| Option | Type   | Default | Description                    |
| ------ | ------ | ------- | ------------------------------ |
| radius | number | 5       | Blur radius in pixels (max 10) |

**Returns:** `HTMLCanvasElement`

### prvctice.image.sharpen(canvas, opts)

Unsharp mask sharpening.

| Option | Type   | Default | Description             |
| ------ | ------ | ------- | ----------------------- |
| amount | number | 0.5     | Sharpening amount (0-1) |

**Returns:** `HTMLCanvasElement`

### prvctice.image.brightness(canvas, opts)

Adjust brightness.

| Option | Type   | Default | Description                                    |
| ------ | ------ | ------- | ---------------------------------------------- |
| value  | number | 0       | Brightness adjustment (-1 to 1, 0 = unchanged) |

**Returns:** `HTMLCanvasElement`

### prvctice.image.contrast(canvas, opts)

Adjust contrast.

| Option | Type   | Default | Description                                  |
| ------ | ------ | ------- | -------------------------------------------- |
| value  | number | 0       | Contrast adjustment (-1 to 1, 0 = unchanged) |

**Returns:** `HTMLCanvasElement`

### prvctice.image.saturation(canvas, opts)

Adjust saturation.

| Option | Type   | Default | Description                                    |
| ------ | ------ | ------- | ---------------------------------------------- |
| value  | number | 0       | Saturation adjustment (-1 to 1, 0 = unchanged) |

**Returns:** `HTMLCanvasElement`

### prvctice.image.invert(canvas)

Invert RGB values, preserve alpha.

**Returns:** `HTMLCanvasElement`

### prvctice.image.hueRotate(canvas, opts)

Rotate hue.

| Option | Type   | Default | Description               |
| ------ | ------ | ------- | ------------------------- |
| angle  | number | 0       | Rotation angle in degrees |

**Returns:** `HTMLCanvasElement`

### prvctice.image.vignette(canvas, opts)

Darken edges.

| Option | Type   | Default | Description            |
| ------ | ------ | ------- | ---------------------- |
| radius | number | 0.5     | Vignette radius (0-1)  |
| amount | number | 0.5     | Darkening amount (0-1) |

**Returns:** `HTMLCanvasElement`

### prvctice.image.noise(canvas, opts)

Add random noise.

| Option | Type   | Default | Description        |
| ------ | ------ | ------- | ------------------ |
| amount | number | 0.1     | Noise amount (0-1) |

**Returns:** `HTMLCanvasElement`

### prvctice.image.posterize(canvas, opts)

Reduce color levels.

| Option | Type   | Default | Description                   |
| ------ | ------ | ------- | ----------------------------- |
| levels | number | 4       | Number of color levels (2-32) |

**Returns:** `HTMLCanvasElement`

### prvctice.image.emboss(canvas)

Apply emboss convolution.

**Returns:** `HTMLCanvasElement`

### prvctice.image.pipeline(source, steps)

Apply a chain of filters in sequence.

| Parameter | Type    | Required | Description                              |
| --------- | ------- | -------- | ---------------------------------------- |
| source    | Element | Yes      | Canvas, image, or video element          |
| steps     | Array   | Yes      | Array of `{ filter: 'name', ...params }` |

**Returns:** `HTMLCanvasElement`

**Example:**

```javascript
var result = prvctice.image.pipeline(myCanvas, [
  { filter: 'grayscale' },
  { filter: 'contrast', value: 0.3 },
  { filter: 'vignette', radius: 0.4, amount: 0.6 },
]);
document.body.appendChild(result);
```

### Transforms

### prvctice.image.crop(canvas, opts)

Crop a region.

| Option | Type   | Default       | Description |
| ------ | ------ | ------------- | ----------- |
| x      | number | 0             | Left offset |
| y      | number | 0             | Top offset  |
| width  | number | canvas width  | Crop width  |
| height | number | canvas height | Crop height |

**Returns:** `HTMLCanvasElement`

### prvctice.image.resize(canvas, opts)

Resize. Preserves aspect ratio if only one dimension given.

| Option | Type   | Default | Description   |
| ------ | ------ | ------- | ------------- |
| width  | number | -       | Target width  |
| height | number | -       | Target height |

**Returns:** `HTMLCanvasElement`

### prvctice.image.rotate(canvas, opts)

Rotate. Canvas expands to fit rotated content.

| Option | Type   | Default | Description      |
| ------ | ------ | ------- | ---------------- |
| angle  | number | 0       | Angle in degrees |

**Returns:** `HTMLCanvasElement`

### prvctice.image.flip(canvas, opts)

Flip horizontally and/or vertically.

| Option     | Type    | Default | Description       |
| ---------- | ------- | ------- | ----------------- |
| horizontal | boolean | false   | Flip horizontally |
| vertical   | boolean | false   | Flip vertically   |

**Returns:** `HTMLCanvasElement`

### prvctice.image.composite(base, overlay, opts)

Composite two canvases with blend mode.

| Parameter | Type    | Required | Description    |
| --------- | ------- | -------- | -------------- |
| base      | Element | Yes      | Base canvas    |
| overlay   | Element | Yes      | Overlay canvas |
| opts      | object  | No       | Options        |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| blendMode | string | `"normal"` | Blend mode: `"normal"`, `"multiply"`, `"screen"`, `"overlay"`, `"darken"`, `"lighten"` |
| x | number | 0 | Overlay X position |
| y | number | 0 | Overlay Y position |
| opacity | number | 1 | Overlay opacity (0-1) |

**Returns:** `HTMLCanvasElement`

### prvctice.image.text(canvas, textStr, opts)

Render text onto a canvas.

| Parameter | Type    | Required | Description    |
| --------- | ------- | -------- | -------------- |
| canvas    | Element | Yes      | Source canvas  |
| textStr   | string  | Yes      | Text to render |
| opts      | object  | No       | Options        |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| x | number | 0 | X position |
| y | number | 0 | Y position |
| font | string | `"sans-serif"` | Font family |
| size | number | 16 | Font size in pixels |
| color | string | `"#ffffff"` | Fill color |
| align | string | `"left"` | Text alignment |
| baseline | string | `"top"` | Text baseline |
| maxWidth | number | - | Maximum width constraint |

**Returns:** `HTMLCanvasElement`

### prvctice.image.exportImage(canvas, opts)

Export canvas as a data URL string.

| Option  | Type   | Default | Description         |
| ------- | ------ | ------- | ------------------- |
| format  | string | `"png"` | `"png"` or `"jpeg"` |
| quality | number | 0.92    | JPEG quality (0-1)  |

**Returns:** `string` -- Data URL.

### prvctice.image.exportBlob(canvas, opts)

Export canvas as a Blob.

| Option  | Type   | Default | Description         |
| ------- | ------ | ------- | ------------------- |
| format  | string | `"png"` | `"png"` or `"jpeg"` |
| quality | number | 0.92    | JPEG quality (0-1)  |

**Returns:** `Promise<Blob>`

---

## Frame Capture

Capture frames from canvas elements for animation sequences, GIF encoding, or frame-by-frame analysis.

Source: `web/services/apps/uikit/js/frame-capture.js`

### prvctice.capture.start(canvas, opts)

Start capturing frames from a canvas at a target FPS. Auto-stops when maxFrames or maxDuration is reached.

| Parameter | Type              | Required | Description   |
| --------- | ----------------- | -------- | ------------- |
| canvas    | HTMLCanvasElement | Yes      | Source canvas |
| opts      | object            | No       | Options       |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| fps | number | 30 | Target frames per second |
| scale | number | 1.0 | Resolution scale (0.5 = half, 2.0 = double) |
| maxFrames | number | 300 | Stop after this many frames |
| maxDuration | number | 10000 | Stop after this many ms |
| onFrame | function | - | Callback: `onFrame(frameCanvas, {index, timestamp, elapsed})` |
| onComplete | function | - | Callback: `onComplete({frames, duration, fps})` |

**Returns:** `{ stop(), isRunning(), getFrameCount() }`

**Example:**

```javascript
var frames = [];
var handle = prvctice.capture.start(myCanvas, {
  fps: 10,
  scale: 0.5,
  maxFrames: 30,
  onFrame: function (frameCanvas, meta) {
    frames.push(frameCanvas);
  },
  onComplete: function (stats) {
    console.log('Captured', stats.frames, 'frames at', stats.fps.toFixed(1), 'FPS');
  },
});
// Or stop manually:
// handle.stop();
```

### prvctice.capture.snapshot(canvas, opts)

Single-frame convenience capture.

| Parameter | Type              | Required | Description   |
| --------- | ----------------- | -------- | ------------- |
| canvas    | HTMLCanvasElement | Yes      | Source canvas |
| opts      | object            | No       | Options       |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| scale | number | 1.0 | Resolution scale factor |

**Returns:** `HTMLCanvasElement` -- New canvas with the captured frame.

---

## Refresh

Parent-managed periodic refresh timer. Use for data widgets that need regular updates.

### prvctice.refresh.start(intervalMs)

Start a refresh timer managed by the host.

| Parameter  | Type   | Required | Description                    |
| ---------- | ------ | -------- | ------------------------------ |
| intervalMs | number | No       | Interval in ms (default 60000) |

**Returns:** `undefined` (fire-and-forget)

### prvctice.refresh.stop()

Stop the refresh timer.

**Returns:** `undefined` (fire-and-forget)

### prvctice.refresh.requestNow()

Trigger an immediate refresh.

**Returns:** `undefined` (fire-and-forget)

### prvctice.refresh.onRefresh(callback)

Subscribe to refresh ticks.

| Parameter | Type     | Required | Description                 |
| --------- | -------- | -------- | --------------------------- |
| callback  | function | Yes      | Called on each refresh tick |

**Returns:** `function` -- Unsubscribe function.

**Example:**

```javascript
prvctice.refresh.onRefresh(function () {
  loadLatestData();
});
prvctice.refresh.start(30000); // Every 30 seconds
```

---

## Math

Safe math expression evaluator (synchronous, no bridge call).

### prvctice.math.evaluate(expr, vars)

Evaluate a math expression string. Supports standard operators, parentheses, and built-in functions. No `eval()` -- uses a safe recursive-descent parser.

| Parameter | Type   | Required | Description                                    |
| --------- | ------ | -------- | ---------------------------------------------- |
| expr      | string | Yes      | Math expression (e.g., `'sin(x) + x^2'`)      |
| vars      | object | No       | Variable values (e.g., `{ x: 1.5, y: 2 }`)    |

**Returns:** `number`

**Throws:** `Error` on syntax errors or unknown variables/functions.

**Built-in constants:** `pi`, `PI`, `e`, `E`

**Functions:** `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh`, `tanh`, `sqrt`, `cbrt`, `log`, `ln`, `log10`, `log2`, `exp`, `abs`, `ceil`, `floor`, `round`, `sign`, `min(a,b,...)`, `max(a,b,...)`, `pow(a,b)`, `atan2(a,b)`

**Operators:** `+`, `-`, `*`, `/`, `%`, `^` / `**` (power), unary `-`/`+`, parentheses

**Example:**

```javascript
var result = prvctice.math.evaluate('sin(pi / 4) * 2'); // 1.4142...
var y = prvctice.math.evaluate('x^2 + 2*x + 1', { x: 3 }); // 16
```

---

## Chat

Access the host chat conversation. Send messages and subscribe to updates.

### prvctice.chat.getMessages(opts)

Get recent chat messages.

| Parameter | Type   | Required | Description                  |
| --------- | ------ | -------- | ---------------------------- |
| opts      | object | No       | Options: `{ limit, offset }` |

**Returns:** `Promise<Array>` -- Array of message objects.

### prvctice.chat.getConversation()

Get the current conversation metadata.

**Returns:** `Promise<object>` -- Conversation info (id, title).

### prvctice.chat.sendMessage(text)

Send a message to the chat.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| text      | string | Yes      | Message text |

**Returns:** `Promise<void>`

### prvctice.chat.onMessage(callback)

Subscribe to new chat messages.

| Parameter | Type     | Required | Description             |
| --------- | -------- | -------- | ----------------------- |
| callback  | function | Yes      | Receives message object |

**Returns:** `function` -- Unsubscribe function.

### prvctice.chat.onStreamingUpdate(callback)

Subscribe to streaming AI response updates.

| Parameter | Type     | Required | Description                   |
| --------- | -------- | -------- | ----------------------------- |
| callback  | function | Yes      | Receives `{ buffer, active }` |

**Returns:** `function` -- Unsubscribe function.

### prvctice.chat.onConversationChanged(callback)

Subscribe to conversation change events (new conversation, title change).

| Parameter | Type     | Required | Description                          |
| --------- | -------- | -------- | ------------------------------------ |
| callback  | function | Yes      | Receives `{ conversationId, title }` |

**Returns:** `function` -- Unsubscribe function.

---

## Context

Get information about the host environment: open apps, workspace, user.

### prvctice.context.getOpenApps()

Get list of currently open apps.

**Returns:** `Promise<Array>` -- Open app info objects.

### prvctice.context.getActiveApp()

Get the currently focused app.

**Returns:** `Promise<object>` -- Active app info.

### prvctice.context.getWorkspace()

Get workspace info.

**Returns:** `Promise<object>` -- Workspace data.

### prvctice.context.getUser()

Get user preferences (temperature unit, etc.).

**Returns:** `Promise<object>` -- User preferences.

### prvctice.context.onAppOpened(callback)

Subscribe to app open events.

| Parameter | Type     | Required | Description              |
| --------- | -------- | -------- | ------------------------ |
| callback  | function | Yes      | Receives app info object |

**Returns:** `function` -- Unsubscribe function.

### prvctice.context.onAppClosed(callback)

Subscribe to app close events.

| Parameter | Type     | Required | Description              |
| --------- | -------- | -------- | ------------------------ |
| callback  | function | Yes      | Receives app info object |

**Returns:** `function` -- Unsubscribe function.

---

## Broadcast

Publish/subscribe messaging between apps. Apps can communicate by publishing and subscribing to named channels.

### prvctice.broadcast.publish(channel, data)

Publish data to a channel.

| Parameter | Type   | Required | Description                         |
| --------- | ------ | -------- | ----------------------------------- |
| channel   | string | Yes      | Channel name                        |
| data      | any    | Yes      | Data to publish (JSON-serializable) |

**Returns:** `Promise<void>`

**Example:**

```javascript
prvctice.broadcast.publish('player:state', { playing: true, track: 'Song Name' });
```

### prvctice.broadcast.subscribe(channel, callback)

Subscribe to messages on a channel.

| Parameter | Type     | Required | Description                                                    |
| --------- | -------- | -------- | -------------------------------------------------------------- |
| channel   | string   | Yes      | Channel name                                                   |
| callback  | function | Yes      | Receives `(data, meta)` where meta is `{ channel, fromAppId }` |

**Returns:** `function` -- Unsubscribe function.

**Example:**

```javascript
var unsub = prvctice.broadcast.subscribe('player:state', function (data, meta) {
  console.log('From app:', meta.fromAppId, 'Data:', data);
});
```

### prvctice.broadcast.unsubscribe(channel)

Unsubscribe from all callbacks on a channel.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| channel   | string | Yes      | Channel name |

---

## Skills

List and execute user skills from the host.

### prvctice.skills.list()

Get all available user skills.

**Returns:** `Promise<Array>` -- Array of skill objects.

### prvctice.skills.execute(skillId, input)

Execute a skill.

| Parameter | Type   | Required | Description              |
| --------- | ------ | -------- | ------------------------ |
| skillId   | string | Yes      | Skill identifier         |
| input     | any    | No       | Input data for the skill |

**Returns:** `Promise<object>` -- Skill execution result.

---

## Calendar

Parse calendar/date content.

### prvctice.calendar.parse(content)

Parse calendar content (iCal, natural language dates, etc.).

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| content   | string | Yes      | Calendar content to parse |

**Returns:** `Promise<object>` -- Parsed calendar data.

---

## Clipboard

Read and write the system clipboard.

### prvctice.clipboard.readText()

Read text from the clipboard.

**Returns:** `Promise<string>` -- Clipboard text content.

### prvctice.clipboard.writeText(text)

Write text to the clipboard.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| text      | string | Yes      | Text to copy |

**Returns:** `Promise<void>`

**Example:**

```javascript
prvctice.clipboard.writeText('Copied!').then(function () {
  prvctice.ui.toast({ message: 'Copied to clipboard', type: 'success' });
});
```

---

## Files

Read files from the host filesystem (Electron only).

### prvctice.files.read(path)

Read a file.

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| path      | string | Yes      | File path   |

**Returns:** `Promise<object>` -- File contents.

### prvctice.files.list(directory)

List files in a directory.

| Parameter | Type   | Required | Description    |
| --------- | ------ | -------- | -------------- |
| directory | string | Yes      | Directory path |

**Returns:** `Promise<Array>` -- File listing.

---

## Virtual File System

Cross-platform host data access (VFS). Works on both web and Electron.

### prvctice.fs.read(path)

Read a virtual file.

| Parameter | Type   | Required | Description       |
| --------- | ------ | -------- | ----------------- |
| path      | string | Yes      | Virtual file path |

**Returns:** `Promise<object>` -- File data.

### prvctice.fs.list(path)

List entries in a virtual directory.

| Parameter | Type   | Required | Description            |
| --------- | ------ | -------- | ---------------------- |
| path      | string | Yes      | Virtual directory path |

**Returns:** `Promise<Array>` -- Directory entries.

### prvctice.fs.stat(path)

Get file metadata.

| Parameter | Type   | Required | Description       |
| --------- | ------ | -------- | ----------------- |
| path      | string | Yes      | Virtual file path |

**Returns:** `Promise<object>` -- File metadata (size, modified, type).

### prvctice.fs.listBlobs(accept)

List blob files, optionally filtered by MIME type.

| Parameter | Type   | Required | Description                                                           |
| --------- | ------ | -------- | --------------------------------------------------------------------- |
| accept    | string | No       | MIME filter (e.g. `'audio/*'`, `'image/*,video/*'`). Defaults to all. |

**Returns:** `Promise<Array>` -- Array of `{ name: string, mime: string, size: number }`.

### prvctice.fs.readAsDataUrl(path)

Read a VFS file and return it as a base64 data URL.

| Parameter | Type   | Required | Description                                 |
| --------- | ------ | -------- | ------------------------------------------- |
| path      | string | Yes      | Virtual file path (e.g. `'/blobs/' + name`) |

**Returns:** `Promise<string>` -- Base64 data URL string.

### prvctice.fs.saveBlob(base64, mime, name, thumbnail)

Save a file to the host file library (appears in the Files panel).

| Parameter | Type   | Required | Description                            |
| --------- | ------ | -------- | -------------------------------------- |
| base64    | string | Yes      | Base64-encoded file data               |
| mime      | string | No       | MIME type (default `'application/octet-stream'`) |
| name      | string | No       | Filename (default `'file-' + Date.now()`)        |
| thumbnail | string | No       | Optional thumbnail data URL            |

**Returns:** `Promise`

### prvctice.fs.listFiles(accept)

List files from the host file library with full metadata. Newer than `listBlobs`.

| Parameter | Type   | Required | Description                                                |
| --------- | ------ | -------- | ---------------------------------------------------------- |
| accept    | string | No       | MIME filter (e.g. `'image/*'`, `'audio/wav,audio/mp3'`)    |

**Returns:** `Promise<Array<{ id, name, mime, uploadedAt, thumbnailId }>>` -- Newest first.

### prvctice.fs.deleteBlob(id)

Delete a file from the host file library.

| Parameter | Type   | Required | Description       |
| --------- | ------ | -------- | ----------------- |
| id        | string | Yes      | File library ID   |

**Returns:** `Promise`

---

## Connectors

Check connector health.

### prvctice.connectors.check(connectorId)

Check if a connector is available and healthy.

| Parameter   | Type   | Required | Description                            |
| ----------- | ------ | -------- | -------------------------------------- |
| connectorId | string | No       | Specific connector ID, or null for all |

**Returns:** `Promise<object>` -- Health status.

**Example:**

```javascript
prvctice.connectors.check('weather').then(function (status) {
  if (status.healthy) {
    loadWeatherData();
  }
});
```

---

## Input

Receive input events relayed from the host (hand tracking, etc.).

### prvctice.input.onMove(callback)

Subscribe to input move events.

| Parameter | Type     | Required | Description                             |
| --------- | -------- | -------- | --------------------------------------- |
| callback  | function | Yes      | Receives `{ x, y, rawX, rawY, source }` |

**Returns:** `function` -- Unsubscribe function.

### prvctice.input.onKeyDown(callback)

Subscribe to keyboard events. Listens to both host-relayed keys and local iframe keyboard events.

| Parameter | Type     | Required | Description                   |
| --------- | -------- | -------- | ----------------------------- |
| callback  | function | Yes      | Receives `KeyboardEvent`      |

**Returns:** `function` -- Unsubscribe function.

### prvctice.input.onKeyUp(callback)

Subscribe to key release events.

| Parameter | Type     | Required | Description                   |
| --------- | -------- | -------- | ----------------------------- |
| callback  | function | Yes      | Receives `KeyboardEvent`      |

**Returns:** `function` -- Unsubscribe function.

---

## Actions

Register callable actions that the host can invoke on the app. Used for inter-app communication and host-initiated commands.

### prvctice.actions.register(id, handler)

Register an action handler.

| Parameter | Type     | Required | Description                                             |
| --------- | -------- | -------- | ------------------------------------------------------- |
| id        | string   | Yes      | Action identifier                                       |
| handler   | function | Yes      | Receives `(payload, params)`, returns result or Promise |

**Example:**

```javascript
prvctice.actions.register('getState', function (payload, params) {
  return { playing: isPlaying, volume: currentVolume };
});
```

### prvctice.actions.unregister(id)

Remove a registered action handler.

| Parameter | Type   | Required | Description       |
| --------- | ------ | -------- | ----------------- |
| id        | string | Yes      | Action identifier |

---

## Animation

Spring physics animation system. Runs entirely in-iframe using WAAPI (Web Animations API) -- zero postMessage overhead.

Source: `web/services/apps/uikit/js/animation.js`

### prvctice.animate(selector, props, opts)

Animate CSS properties with spring physics.

| Parameter | Type              | Required | Description                 |
| --------- | ----------------- | -------- | --------------------------- |
| selector  | string or Element | Yes      | CSS selector or DOM element |
| props     | object            | Yes      | Target CSS property values  |
| opts      | object            | No       | Animation options           |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| preset | string | `"snappy"` | Spring preset: `"xsnappy"`, `"snappy"`, `"standard"`, `"gentle"`, `"bouncy"` |
| stiffness | number | (from preset) | Override spring stiffness |
| damping | number | (from preset) | Override spring damping |
| mass | number | (from preset) | Override spring mass |
| initialVelocity | number | 0 | Initial velocity |
| delay | number | 0 | Delay in ms before animation starts |
| onComplete | function | null | Called when animation finishes |

**Spring presets:**

| Preset | Stiffness | Damping | Approx. Duration | Character |
|--------|-----------|---------|-------------------|-----------|
| xsnappy | 500 | 35 | ~200ms | No overshoot |
| snappy | 300 | 28 | ~350ms | Tiny overshoot (default) |
| standard | 170 | 20 | ~500ms | Moderate overshoot |
| gentle | 100 | 15 | ~800ms | Visible overshoot |
| bouncy | 150 | 12 | ~900ms | Pronounced bounce |

**Returns:** `{ cancel: function, finished: Promise }`

**Supported properties:** `opacity`, `transform` (translateX, translateY, scale, rotate, etc.), `backgroundColor`, `color`, `borderColor`, and any numeric CSS property.

**Example:**

```javascript
// Fade in with slide up
prvctice.animate(
  '.card',
  {
    opacity: '1',
    transform: 'translateY(0px)',
  },
  { preset: 'snappy' }
);

// Scale animation on button press
prvctice
  .animate(
    buttonEl,
    {
      transform: 'scale(0.95)',
    },
    { preset: 'xsnappy' }
  )
  .finished.then(function () {
    prvctice.animate(buttonEl, { transform: 'scale(1)' }, { preset: 'bouncy' });
  });

// Stagger pattern (no separate API -- use delay)
var cards = document.querySelectorAll('.card');
for (var i = 0; i < cards.length; i++) {
  prvctice.animate(
    cards[i],
    {
      opacity: '1',
      transform: 'translateY(0)',
    },
    { delay: i * 40, preset: 'standard' }
  );
}
```

### prvctice.sequence(steps)

Chain sequential animations. Each step runs after the previous finishes.

| Parameter | Type  | Required | Description                                |
| --------- | ----- | -------- | ------------------------------------------ |
| steps     | Array | Yes      | Array of `{ target, props, opts }` objects |

Each step has:

| Field | Type | Description |
|-------|------|-------------|
| target | string or Element | CSS selector or DOM element |
| props | object | Target CSS properties |
| opts | object | Animation options (same as `prvctice.animate`) |

**Returns:** `{ cancel: function, finished: Promise }`

**Example:**

```javascript
prvctice.sequence([
  {
    target: '.title',
    props: { opacity: '1', transform: 'translateY(0)' },
    opts: { preset: 'gentle' },
  },
  { target: '.subtitle', props: { opacity: '1' }, opts: { preset: 'snappy', delay: 100 } },
  {
    target: '.content',
    props: { opacity: '1', transform: 'translateY(0)' },
    opts: { preset: 'standard' },
  },
]);
```

### prvctice.animateValue(target, from, to, opts)

Animate a numeric value with spring physics. Updates element text content and/or fires a callback per frame.

| Parameter | Type                     | Required | Description                                               |
| --------- | ------------------------ | -------- | --------------------------------------------------------- |
| target    | string, Element, or null | Yes      | Element for textContent update, or null for callback-only |
| from      | number                   | Yes      | Start value                                               |
| to        | number                   | Yes      | End value                                                 |
| opts      | object                   | No       | Options                                                   |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| preset | string | `"snappy"` | Spring preset |
| format | function | `Math.round(v).toLocaleString()` | Format function for display |
| onUpdate | function | null | Called each frame with current value |
| onComplete | function | null | Called when animation finishes |

**Returns:** `{ cancel: function, finished: Promise }`

**Example:**

```javascript
// Animate a score counter
prvctice.animateValue('#score', 0, 1250, {
  preset: 'standard',
  format: function (v) {
    return Math.round(v).toLocaleString();
  },
});

// Callback-only (no element update)
prvctice.animateValue(null, 0, 100, {
  onUpdate: function (v) {
    progressBar.style.width = v + '%';
  },
});
```

---

## UI Components

Interactive components from the UIKit runtime. Source: `web/services/apps/uikit/js/runtime.js`

### prvctice.ui.clock(el, opts)

Create a digital clock display.

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ format: '12h' | '24h', seconds: boolean, timezone: string }`

**Returns:** `{ dispose, setFormat, setTimezone }`

### prvctice.ui.analogClock(el, opts)

Create an SVG analog clock.

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ showSeconds: boolean, showNumbers: boolean, showTicks: boolean, size: number }`

**Returns:** `{ dispose }`

### prvctice.ui.timer(el, opts)

Create a countdown or stopwatch timer.

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| duration | number | 0 | Duration in **milliseconds** (e.g., 300000 for 5 minutes) |
| mode | string | `'countdown'` if duration > 0, else `'stopwatch'` | `'countdown'` or `'stopwatch'` |
| onTick | function(displayMs, elapsedMs) | null | Called ~every 50ms with two positional args: remaining/elapsed display ms, and total elapsed ms |
| onComplete | function() | null | Called when countdown reaches zero (countdown mode only) |
| autoStart | boolean | false | Start immediately on creation |
| format | string | auto | Display format: `'mm:ss'` or `'hh:mm:ss'` (auto-detected from duration) |

**Returns:** `{ start, pause, stop, reset, dispose, isRunning, getElapsed, getRemaining, setDuration }`

**Example:**

```javascript
var timerEl = document.getElementById('timer');
var timer = prvctice.ui.timer(timerEl, {
  duration: 25 * 60 * 1000, // 25 minutes in milliseconds
  mode: 'countdown',
  onTick: function(displayMs, elapsedMs) {
    var secondsLeft = Math.ceil(displayMs / 1000);
    var progress = elapsedMs / (25 * 60 * 1000);
    ring.update({ value: Math.round(progress * 100) });
  },
  onComplete: function() {
    prvctice.ui.toast({ message: 'Time is up!', type: 'warning' });
    prvctice.audio.tone(880, 400);
  }
});
timer.start();
```

### prvctice.ui.stepper(el, opts)

Create a numeric stepper (increment/decrement buttons with value display).

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ min: number, max: number, step: number, value: number, onChange: fn, format: fn }`

**Returns:** `{ getValue, setValue, dispose }`

### prvctice.ui.tabs(el, opts)

Create a tab bar.

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ tabs: [{ id, label }], active: string, onChange: fn }`

**Returns:** `{ getActive, setActive, dispose }`

**Example:**

```javascript
var tabBar = prvctice.ui.tabs(document.getElementById('tabs'), {
  tabs: [
    { id: 'overview', label: 'Overview' },
    { id: 'details', label: 'Details' },
    { id: 'settings', label: 'Settings' },
  ],
  active: 'overview',
  onChange: function (tabId) {
    showPanel(tabId);
  },
});
```

### prvctice.ui.canvas(el, opts)

Create a managed canvas with auto-resize and retina support.

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ retina: boolean, width: number, height: number, onReady: fn(ctx, canvas) }`

**Returns:** `{ ctx, canvas, resize, toDataURL, toBlob, clear, dispose }`

**Example:**

```javascript
var canvasComp = prvctice.ui.canvas(document.getElementById('game'), {
  onReady: function (ctx, canvas) {
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--p-accent-blue');
    ctx.fillRect(10, 10, 50, 50);
  },
});
// Later: canvasComp.ctx.clearRect(...)
```

### prvctice.ui.dropzone(el, opts)

Create a file dropzone with drag-and-drop and click-to-browse.

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ accept: string, multiple: boolean, label: string, hint: string, onDrop: fn(files) }`

**Returns:** `{ dispose, setLabel }`

### prvctice.ui.filePicker(opts)

Open a modal file picker that browses VFS blobs. Filters by MIME type, displays file list, and returns a data URL on selection.

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| opts      | object | No       | Options     |

**Options:** `{ accept: string, title: string, emptyMessage: string, onSelect: fn(result) }`

| Option       | Type     | Default             | Description                                                    |
| ------------ | -------- | ------------------- | -------------------------------------------------------------- |
| accept       | string   | `'*/*'`             | MIME filter (e.g. `'audio/*'`, `'image/*,video/*'`)            |
| title        | string   | `'Load from Files'` | Header text                                                    |
| emptyMessage | string   | `'No files found'`  | Empty state text                                               |
| onSelect     | function | noop                | Called with `{ dataUrl: string, entry: { name, mime, size } }` |

**Returns:** `{ open, close, dispose }`

**Example:**

```javascript
var picker = prvctice.ui.filePicker({
  accept: 'audio/*',
  title: 'Load Audio',
  onSelect: function (result) {
    // result.dataUrl — base64 data URL
    // result.entry  — { name, mime, size }
    loadAudio(result.dataUrl);
  },
});
picker.open();
```

### prvctice.ui.waveform(el, opts)

Create an audio waveform visualization.

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ color: string, barWidth: number, barGap: number }`

**Returns:** `{ draw(data), connectAnalyser(analyserNode), resize, dispose }`

**Example:**

```javascript
var waveform = prvctice.ui.waveform(document.getElementById('viz'), {
  barWidth: 3,
  barGap: 1,
});

// Draw static data
waveform.draw(audioData);

// Or connect to live audio
var analyser = prvctice.audio.getAnalyser();
waveform.connectAnalyser(analyser);
```

### prvctice.ui.mediaPlayer(el, opts)

Create a media player with play/pause, seek, and time display.

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ src: string | Blob, type: 'audio' | 'video', onTimeUpdate: fn, onEnd: fn, autoPlay: boolean }`

**Returns:** `{ play, pause, seek, setSrc, getMedia, dispose }`

### prvctice.ui.audioRecorder(el, opts)

Create an audio recorder component with waveform, level meter, and recording controls.

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ onRecordingComplete: fn(result), waveform: boolean, autoStart: boolean }`

**Returns:** `{ start, stop, isRecording, dispose }`

### prvctice.ui.dataView(el, opts)

Create a data view with automatic loading, error, and empty states.

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ load: fn() -> Promise, render: fn(data, contentEl), empty: fn(data) -> boolean, errorMessage: string, emptyMessage: string }`

**Returns:** `{ reload, dispose }`

**Example:**

```javascript
prvctice.ui.dataView(document.getElementById('content'), {
  load: function () {
    return prvctice.weather.current();
  },
  render: function (data, el) {
    el.innerHTML = '<div class="p-label-lg">' + data.temp + '\u00B0</div>';
  },
  emptyMessage: 'NO WEATHER DATA',
});
```

### prvctice.ui.animateEntrance(el, opts)

Stagger-animate the direct children of an element with a fade-up effect.

| Parameter | Type    | Required | Description                                |
| --------- | ------- | -------- | ------------------------------------------ |
| el        | Element | Yes      | Parent element whose children will animate |
| opts      | object  | No       | Options                                    |

**Options:** `{ delay: number, stagger: number }` (defaults: delay 0, stagger 40ms)

**Returns:** `{ dispose }`

**Example:**

```javascript
// Animate a list of items on load
var list = document.getElementById('results');
// ... populate list with children ...
prvctice.ui.animateEntrance(list, { stagger: 50 });
```

### prvctice.ui.animateValue(el, from, to, opts)

Spring-animated numeric counter (runtime.js version -- simpler than AnimationKit `prvctice.animateValue`).

| Parameter | Type    | Required | Description                                     |
| --------- | ------- | -------- | ----------------------------------------------- |
| el        | Element | Yes      | Element for textContent update                  |
| from      | number  | Yes      | Start value                                     |
| to        | number  | Yes      | End value                                       |
| opts      | object  | No       | Options: `{ format, stiffness, damping, mass }` |

**Returns:** `{ dispose }`

### prvctice.ui.errorState(el, opts)

Display an error state with icon, message, and optional retry button.

| Parameter | Type    | Required | Description                                       |
| --------- | ------- | -------- | ------------------------------------------------- |
| el        | Element | Yes      | Container element                                 |
| opts      | object  | No       | Options: `{ icon, message, onRetry, retryLabel }` |

**Returns:** `{ setMessage, setIcon, dispose }`

### prvctice.ui.emptyState(el, opts)

Display an empty state with icon/illustration and message.

| Parameter | Type    | Required | Description                                |
| --------- | ------- | -------- | ------------------------------------------ |
| el        | Element | Yes      | Container element                          |
| opts      | object  | No       | Options: `{ icon, illustration, message }` |

**Returns:** `{ setMessage, dispose }`

### prvctice.ui.staleBadge(meta)

Create a "last updated" badge for cached data.

| Parameter | Type   | Required | Description                                   |
| --------- | ------ | -------- | --------------------------------------------- |
| meta      | object | Yes      | Metadata: `{ fresh: boolean, ageMs: number }` |

**Returns:** `{ el: HTMLElement, dispose, update }`

### prvctice.ui.fader(container, opts)

Create a mixing-console fader control. Supports vertical and horizontal orientation, center detent, and value readout.

Source: `web/services/apps/uikit/js/fader.js`

| Parameter | Type        | Required | Description    |
| --------- | ----------- | -------- | -------------- |
| container | HTMLElement | Yes      | Parent element |
| opts      | object      | No       | Options        |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| min | number | 0 | Minimum value |
| max | number | 1 | Maximum value |
| step | number | 0.01 | Step size |
| value | number | min | Initial value |
| label | string | - | Label text above fader |
| format | function | `v.toFixed(2)` | Display format function |
| orientation | string | `"vertical"` | `"vertical"` or `"horizontal"` |
| color | string | `var(--p-accent-blue)` | Track fill color |
| detent | number | null | Center detent snap value (snaps within 5% of range) |
| onChange | function | - | Callback: `onChange(value)` |

**Returns:** `{ get(), set(v), dispose() }`

**Example:**

```javascript
var volume = prvctice.ui.fader(document.getElementById('mixer'), {
  min: 0,
  max: 1,
  value: 0.7,
  label: 'VOL',
  orientation: 'vertical',
  onChange: function (val) {
    gainNode.gain.value = val;
  },
});
```

### prvctice.ui.knob(container, opts)

Create a rotary dial control. Supports vertical drag, double-click to reset, and arc visualization.

Source: `web/services/apps/uikit/js/knob.js`

| Parameter | Type       | Required | Description    |
| --------- | ---------- | -------- | -------------- |
| container | HTMLElement | Yes      | Parent element |
| opts      | object     | No       | Options        |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| min | number | 0 | Minimum value |
| max | number | 1 | Maximum value |
| step | number | 0.01 | Step size |
| value | number | min | Initial value |
| label | string | - | Label text above knob |
| format | function | `v.toFixed(2)` | Display format function |
| size | number | 44 | Knob diameter in px |
| color | string | `var(--p-accent-blue)` | Arc color |
| onChange | function | - | Callback: `onChange(value)` |

**Returns:** `{ get(), set(v), dispose() }`

**Example:**

```javascript
var cutoff = prvctice.ui.knob(document.getElementById('filter'), {
  min: 20,
  max: 20000,
  value: 1000,
  label: 'CUTOFF',
  format: function(v) { return v < 1000 ? Math.round(v) + 'Hz' : (v / 1000).toFixed(1) + 'kHz'; },
  color: 'var(--p-accent-amber)',
  onChange: function(val) {
    filterNode.frequency.value = val;
  }
});
```

### prvctice.ui.timeline(container, opts)

Create a DAW-style timeline with ruler, lanes, draggable clips, playhead, zoom, and snap-to-grid. Events-only architecture -- emits callbacks, does not handle playback.

Source: `web/services/apps/uikit/js/timeline.js`

| Parameter | Type        | Required | Description    |
| --------- | ----------- | -------- | -------------- |
| container | HTMLElement | Yes      | Parent element |
| opts      | object      | No       | Options        |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| duration | number | 60 | Total timeline duration in seconds |
| lanes | Array | `[{id:'default', label:'Track 1'}]` | Lane definitions: `{id, label, color?}` |
| clips | Array | `[]` | Initial clips: `{id, laneId, start, duration, label?, type?}` |
| snap | boolean | true | Enable snap-to-grid |
| snapInterval | number | 1 | Snap interval in seconds |
| zoom | number | 1 | Initial zoom (1 = fit-to-width) |
| minZoom | number | 0.1 | Minimum zoom |
| maxZoom | number | 50 | Maximum zoom |
| onPlay | function | - | `onPlay(position)` |
| onPause | function | - | `onPause(position)` |
| onSeek | function | - | `onSeek(position)` |
| onClipMove | function | - | `onClipMove({clipId, laneId, start, duration})` |
| onClipSelect | function | - | `onClipSelect(clipId)` |
| onClipAdd | function | - | `onClipAdd({laneId, start})` -- fires on double-click empty lane |
| onZoom | function | - | `onZoom(level)` |

Clip `type` determines color: `"audio"` = accent-blue, `"video"` = accent-amber, `"text"` = accent-green.

**Returns:**

```
{
  setPlayhead(time),      // Move playhead to time
  getPlayhead(),          // Get current playhead time
  addClip(clip),          // Add a clip
  removeClip(clipId),     // Remove a clip
  updateClip(clipId, props), // Update clip properties
  getClips(),             // Get all clips
  setZoom(level),         // Set zoom level
  getZoom(),              // Get current zoom
  setSnap(enabled, interval), // Toggle snap
  setDuration(seconds),   // Change total duration
  dispose()               // Clean up
}
```

**Example:**

```javascript
var tl = prvctice.ui.timeline(document.getElementById('editor'), {
  duration: 30,
  lanes: [
    { id: 'audio', label: 'Audio' },
    { id: 'video', label: 'Video' },
  ],
  clips: [
    { id: 'c1', laneId: 'audio', start: 2, duration: 5, label: 'Intro', type: 'audio' },
    { id: 'c2', laneId: 'video', start: 0, duration: 8, label: 'Scene 1', type: 'video' },
  ],
  onClipMove: function (data) {
    console.log('Clip moved:', data.clipId, 'to', data.start);
  },
  onSeek: function (pos) {
    audioPlayer.currentTime = pos;
  },
});
// Drive playhead from playback loop
function tick() {
  tl.setPlayhead(audioPlayer.currentTime);
  requestAnimationFrame(tick);
}
tick();
```

---

## Notifications

Toast, confirm, and alert dialogs rendered in the host UI (outside the iframe).

Source: `web/services/apps/uikit/js/notifications.js`

### prvctice.ui.toast(opts)

Show a toast notification. Accepts either a string or options object.

| Parameter | Type             | Required | Description                             |
| --------- | ---------------- | -------- | --------------------------------------- |
| opts      | string or object | Yes      | Toast message string, or options object |

**Options object:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| message | string | `""` | Toast message text |
| type | string | `"info"` | Type: `"info"`, `"success"`, `"warning"`, `"error"` |
| duration | number | (default) | Display duration in ms |

**Returns:** `Promise<{ shown: boolean }>`

**Example:**

```javascript
// Simple string
prvctice.ui.toast('Saved!');

// With options
prvctice.ui.toast({ message: 'File exported', type: 'success', duration: 3000 });

// Error toast
prvctice.ui.toast({ message: 'Connection failed', type: 'error' });
```

### prvctice.ui.confirm(opts)

Show a confirmation dialog. Uses a two-phase pattern (immediate ack, then push result).

| Parameter | Type   | Required | Description    |
| --------- | ------ | -------- | -------------- |
| opts      | object | Yes      | Dialog options |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| title | string | `"Confirm"` | Dialog title |
| message | string | `""` | Dialog message |
| buttons | Array | `["Cancel", "OK"]` | Button labels |

**Returns:** `Promise<{ button: string }>` -- The label of the button the user clicked.

**Example:**

```javascript
prvctice.ui
  .confirm({
    title: 'Delete item?',
    message: 'This action cannot be undone.',
    buttons: ['Cancel', 'Delete'],
  })
  .then(function (result) {
    if (result.button === 'Delete') {
      deleteItem();
    }
  });
```

### prvctice.ui.alert(opts)

Show an alert dialog.

| Parameter | Type   | Required | Description    |
| --------- | ------ | -------- | -------------- |
| opts      | object | Yes      | Dialog options |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| title | string | `"Alert"` | Dialog title |
| message | string | `""` | Dialog message |

**Returns:** `Promise<{ dismissed: boolean }>`

---

## Navigation

DOM-based router with push/pop view stack and spring slide transitions.

Source: `web/services/apps/uikit/js/navigation.js`

### prvctice.ui.router(opts)

Initialize the router. Scans DOM for `[data-view]` elements, shows the initial view, hides the rest.

| Parameter | Type   | Required | Description    |
| --------- | ------ | -------- | -------------- |
| opts      | object | No       | Router options |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| routes | object | `{}` | Route config: `{ viewName: { title } }` |
| initial | string | (first data-view) | Initial view name |
| persist | boolean | true | Persist current view to storage across sessions |

**Returns:** Router handle:

| Method | Returns | Description |
|--------|---------|-------------|
| push(viewName) | `undefined` | Push a view onto the stack (slide-in from right) |
| pop() | `undefined` | Pop the current view (slide back to left) |
| replace(viewName) | `undefined` | Replace current view (no animation) |
| current() | `string` | Get current view name |
| stack() | `Array` | Get copy of the view stack |
| onNavigate(callback) | `function` | Subscribe to navigation events. Callback receives `(viewName, direction)`. Returns unsubscribe function. |
| dispose() | `undefined` | Clean up router |

**HTML structure:** Views are defined with `data-view` attributes:

```html
<div id="app-container" style="position: relative; overflow: hidden; flex: 1;">
  <div data-view="list" class="p-stack pad-2 gap-2">
    <!-- List view content -->
  </div>
  <div data-view="detail" class="p-stack pad-2 gap-2">
    <!-- Detail view content -->
  </div>
</div>
```

**Example:**

```javascript
var router = prvctice.ui.router({
  routes: {
    list: { title: 'Library' },
    detail: { title: 'Details' },
  },
  initial: 'list',
});

// Navigate
document.getElementById('view-detail-btn').addEventListener('click', function () {
  router.push('detail');
});

document.getElementById('back-btn').addEventListener('click', function () {
  router.pop();
});

// Host back button also triggers pop automatically
```

---

## Forms

Declarative form rendering with field-level validation.

Source: `web/services/apps/uikit/js/forms.js`

### prvctice.ui.form(container, opts)

Create a declarative form from a schema.

| Parameter | Type    | Required | Description                         |
| --------- | ------- | -------- | ----------------------------------- |
| container | Element | Yes      | DOM element to render the form into |
| opts      | object  | Yes      | Form options                        |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| fields | Array | `[]` | Field definitions |
| onSubmit | function | `function(){}` | Called with form data when validation passes |
| submitLabel | string | `"Submit"` | Submit button text |

**Field definition:**

| Property | Type | Description |
|----------|------|-------------|
| name | string | Field name (used as key in data object) |
| type | string | Field type: `"text"`, `"number"`, `"select"`, `"toggle"`, `"slider"`, `"checkbox"`, `"radio"` |
| label | string | Display label |
| value | any | Default value |
| placeholder | string | Placeholder text (text, number, select) |
| required | boolean | Required validation |
| email | boolean | Email format validation (text type only) |
| minLength | number | Minimum string length |
| maxLength | number | Maximum string length |
| min | number | Minimum numeric value (number, slider) |
| max | number | Maximum numeric value (number, slider) |
| step | number | Step increment (number, slider) |
| pattern | string or RegExp | Regex pattern validation |
| patternMessage | string | Custom error message for pattern validation |
| options | Array | Options for select/radio: `[{ value, label }]` |

**Returns:** Form handle:

| Method | Returns | Description |
|--------|---------|-------------|
| getValue(name) | `any` | Get a field's current value |
| setValue(name, value) | `undefined` | Set a field's value |
| validate() | `{ valid, errors }` | Validate all fields |
| reset() | `undefined` | Reset all fields to initial values |
| dispose() | `undefined` | Clean up form and event listeners |

**Example:**

```javascript
var form = prvctice.ui.form(document.getElementById('settings-form'), {
  fields: [
    { name: 'name', type: 'text', label: 'Name', required: true, minLength: 2 },
    { name: 'email', type: 'text', label: 'Email', email: true },
    { name: 'volume', type: 'slider', label: 'Volume', min: 0, max: 100, value: 50 },
    {
      name: 'theme',
      type: 'select',
      label: 'Theme',
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
      value: 'dark',
    },
    { name: 'notifications', type: 'toggle', label: 'Enable Notifications', value: true },
  ],
  submitLabel: 'Save Settings',
  onSubmit: function (data) {
    prvctice.storage.set('settings', data);
    prvctice.ui.toast({ message: 'Settings saved', type: 'success' });
  },
});
```

---

## Streaming AI

Stream AI responses incrementally. Extends `prvctice.ai` with a streaming method.

Source: `web/services/apps/uikit/js/streaming.js`

### prvctice.ai.stream(prompt, opts)

Stream an AI response with incremental text delivery.

| Parameter | Type   | Required | Description       |
| --------- | ------ | -------- | ----------------- |
| prompt    | string | Yes      | Text prompt       |
| opts      | object | No       | Streaming options |

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| onChunk | function | Called with each text fragment as it arrives |
| onDone | function | Called when stream completes. Receives metadata object. On error, metadata has `{ error }` field. |
| maxTokens | number | Maximum tokens to generate |
| provider | string | AI provider to use |
| model | string | Model to use |

**Returns:** `{ cancel: function }` -- Call `cancel()` to abort the stream.

**Example:**

```javascript
var outputEl = document.getElementById('output');
outputEl.textContent = '';

var stream = prvctice.ai.stream('Write a haiku about programming', {
  onChunk: function (text) {
    outputEl.textContent += text;
  },
  onDone: function (metadata) {
    if (metadata.error) {
      prvctice.ui.toast({ message: 'AI error: ' + metadata.error, type: 'error' });
    } else {
      console.log('Stream complete');
    }
  },
});

// Cancel if needed
// stream.cancel();
```

---

## Media Playback

Audio playback via host proxy and image loading.

Source: `web/services/apps/uikit/js/media-playback.js`

### prvctice.media.playAudio(url)

Play audio from a remote URL via host proxy and blob injection.

| Parameter | Type   | Required | Description      |
| --------- | ------ | -------- | ---------------- |
| url       | string | Yes      | Remote audio URL |

**Returns:** Player object (synchronous):

| Method | Returns | Description |
|--------|---------|-------------|
| play() | `undefined` | Start/resume playback |
| pause() | `undefined` | Pause playback |
| stop() | `undefined` | Stop and reset to beginning |
| seek(t) | `undefined` | Seek to time `t` (seconds) |
| setVolume(v) | `undefined` | Set volume 0-1 |
| getState() | `object` | Get `{ currentTime, duration, paused, ended, volume }` |
| onError(cb) | `undefined` | Set error callback |
| dispose() | `undefined` | Release player resources |

**Example:**

```javascript
var player = prvctice.media.playAudio('https://example.com/song.mp3');

document.getElementById('play-btn').addEventListener('click', function () {
  player.play();
});
document.getElementById('pause-btn').addEventListener('click', function () {
  player.pause();
});

player.onError(function (err) {
  prvctice.ui.toast({ message: 'Audio error: ' + err, type: 'error' });
});
```

### prvctice.media.loadImage(url)

Load a remote image through the host proxy with auto-resize (max 800px).

| Parameter | Type   | Required | Description      |
| --------- | ------ | -------- | ---------------- |
| url       | string | Yes      | Remote image URL |

**Returns:** `Promise<{ dataUri: string, width: number, height: number }>`

**Example:**

```javascript
prvctice.media.loadImage('https://example.com/photo.jpg').then(function (result) {
  var img = document.createElement('img');
  img.src = result.dataUri;
  img.style.width = '100%';
  document.getElementById('art').appendChild(img);
});
```

---

## Camera

Device camera access with configurable resolution, FPS, and facing mode. Frames stream as JPEG data URIs. The host manages `getUserMedia` outside the sandbox.

**Permission:** Requires `media:camera`. The user sees a prvctice-branded permission dialog on first use. AI-generated apps display an additional warning. Permission is remembered per app.

Source: `web/services/apps/bridgeSDK.ts` (SDK), `web/services/apps/handlers/camera.ts` (handler)

### Resolution Presets

| Preset | Max Width | Max Height |
| ------ | --------- | ---------- |
| low    | 320       | 240        |
| medium | 640       | 480        |
| high   | 1280      | 720        |

### prvctice.camera.start(opts)

Start a camera stream. Creates a `getUserMedia` video feed on the host side and begins streaming JPEG frames to registered `onFrame` callbacks.

| Parameter       | Type   | Required | Description                                |
| --------------- | ------ | -------- | ------------------------------------------ |
| opts.resolution | string | No       | `'low'`, `'medium'` (default), or `'high'` |
| opts.fps        | number | No       | Frames per second, 1-30 (default 12)       |
| opts.facingMode | string | No       | `'user'` (default) or `'environment'`      |

**Returns:** `Promise<object>` -- `{ active: true, resolution: { width, height }, fps }`

**Example:**

```javascript
prvctice.camera.start({ resolution: 'medium', fps: 12, facingMode: 'user' }).then(function (info) {
  console.log('Camera active:', info.resolution.width + 'x' + info.resolution.height);
});
```

### prvctice.camera.capture()

Capture a single high-quality still photo from the active camera. Uses higher JPEG quality (0.92) than streaming frames (0.7). Requires an active camera stream.

**Returns:** `Promise<object>` -- `{ dataUri, width, height, timestamp }`

**Example:**

```javascript
prvctice.camera.capture().then(function (photo) {
  document.getElementById('snapshot').src = photo.dataUri;
});
```

### prvctice.camera.stop()

Stop the camera stream. Releases the video track and cleans up resources.

**Returns:** `Promise<object>` -- `{ stopped: true }`

### prvctice.camera.onFrame(callback)

Subscribe to streaming video frames. Frames arrive as JPEG data URIs at the configured FPS and resolution.

| Parameter | Type     | Required | Description                                                             |
| --------- | -------- | -------- | ----------------------------------------------------------------------- |
| callback  | function | Yes      | Receives `(dataUri, meta)` where meta is `{ timestamp, width, height }` |

**Returns:** `function` -- Unsubscribe function.

**Performance:** Frames are JPEG-encoded at quality 0.7. At `medium` resolution and 12 FPS, expect roughly 15-30 KB per frame. Use `low` resolution for camera-to-GIF pipelines.

**Example:**

```javascript
var unsub = prvctice.camera.onFrame(function (dataUri, meta) {
  var img = document.getElementById('preview');
  img.src = dataUri;
  img.width = meta.width;
  img.height = meta.height;
});

// Later: stop receiving frames
unsub();
```

---

## Video

Video playback via host-side hidden video elements with blob URL injection. Supports multiple simultaneous players (each identified by a unique `playerId`).

**Permission:** Uses `media:playback` (auto-granted, no prompt).

Source: `web/services/apps/bridgeSDK.ts` (SDK), `web/services/apps/handlers/video.ts` (handler)

### prvctice.video.load(opts)

Load a video from base64 data, a data URI, or a remote URL. The host creates a hidden video element, loads metadata, and returns duration and dimensions.

| Parameter     | Type   | Required | Description                                    |
| ------------- | ------ | -------- | ---------------------------------------------- |
| opts.playerId | string | No       | Unique player ID (auto-generated if omitted)   |
| opts.base64   | string | No       | Base64-encoded video data                      |
| opts.url      | string | No       | Remote URL (`http://`, `https://`) or data URI |
| opts.mimeType | string | No       | MIME type (default `'video/mp4'`)              |

Either `base64` or `url` is required.

**Returns:** `Promise<object>` -- `{ loaded, playerId, duration, width, height }`

**Example:**

```javascript
prvctice.video.load({ url: 'https://example.com/clip.mp4' }).then(function (info) {
  console.log('Loaded: ' + info.duration + 's, ' + info.width + 'x' + info.height);
  console.log('Player ID:', info.playerId);
});
```

### prvctice.video.play(playerId, startTime)

Start or resume playback, optionally from a specific time.

| Parameter | Type   | Required | Description             |
| --------- | ------ | -------- | ----------------------- |
| playerId  | string | Yes      | Player ID from `load()` |
| startTime | number | No       | Start time in seconds   |

**Returns:** `Promise<object>` -- `{ playing: true, playerId }`

### prvctice.video.pause(playerId)

Pause playback.

| Parameter | Type   | Required | Description             |
| --------- | ------ | -------- | ----------------------- |
| playerId  | string | Yes      | Player ID from `load()` |

**Returns:** `Promise<object>` -- `{ paused: true, playerId, currentTime }`

### prvctice.video.seek(playerId, time)

Seek to a specific time in seconds.

| Parameter | Type   | Required | Description             |
| --------- | ------ | -------- | ----------------------- |
| playerId  | string | Yes      | Player ID from `load()` |
| time      | number | Yes      | Target time in seconds  |

**Returns:** `Promise<object>` -- `{ seeked: true, playerId, currentTime }`

### prvctice.video.seekAndCapture(playerId, time, width, height)

Seek to a time and capture the video frame as a JPEG data URI. Useful for generating timeline thumbnails. Output capped at 800px in either dimension.

| Parameter | Type   | Required | Description                                        |
| --------- | ------ | -------- | -------------------------------------------------- |
| playerId  | string | Yes      | Player ID from `load()`                            |
| time      | number | Yes      | Target time in seconds                             |
| width     | number | No       | Capture width (defaults to video width, max 800)   |
| height    | number | No       | Capture height (defaults to video height, max 800) |

**Returns:** `Promise<object>` -- `{ dataUri, width, height, time }`

**Example:**

```javascript
// Generate thumbnails at 5-second intervals
prvctice.video.load({ url: videoUrl }).then(function (info) {
  var times = [];
  for (var t = 0; t < info.duration; t += 5) times.push(t);

  function captureThumbnail(i) {
    if (i >= times.length) return;
    prvctice.video.seekAndCapture(info.playerId, times[i], 160, 90).then(function (frame) {
      var img = document.createElement('img');
      img.src = frame.dataUri;
      document.getElementById('timeline').appendChild(img);
      captureThumbnail(i + 1);
    });
  }
  captureThumbnail(0);
});
```

### prvctice.video.unload(playerId)

Release video resources: pause playback, revoke blob URL, remove the hidden video element.

| Parameter | Type   | Required | Description             |
| --------- | ------ | -------- | ----------------------- |
| playerId  | string | Yes      | Player ID from `load()` |

**Returns:** `Promise<object>` -- `{ unloaded: true, playerId }`

---

## GIF Encoder

Animated GIF encoding via a host-side Web Worker. Apps feed frames progressively, then call `finish()` to produce the GIF. Encoding runs off the main thread.

**Permission:** Uses `media:playback` (auto-granted, no prompt).

**Constraints:** Maximum output dimensions are 800x600. Frames are auto-scaled to fit.

Source: `web/services/apps/bridgeSDK.ts` (SDK), `web/services/apps/handlers/gif.ts` (handler)

### Quality Presets

| Quality | Max Colors | Description                    |
| ------- | ---------- | ------------------------------ |
| high    | 256        | Full palette, best quality     |
| medium  | 128        | Balanced quality and file size |
| low     | 64         | Smallest file size             |

### prvctice.gif.create(opts)

Create a new GIF encoder.

| Parameter      | Type   | Required | Description                                   |
| -------------- | ------ | -------- | --------------------------------------------- |
| opts.encoderId | string | No       | Unique encoder ID (auto-generated if omitted) |
| opts.width     | number | No       | Width in pixels, max 800 (default 400)        |
| opts.height    | number | No       | Height in pixels, max 600 (default 300)       |
| opts.quality   | string | No       | `'high'`, `'medium'` (default), or `'low'`    |

**Returns:** `Promise<object>` -- `{ created, encoderId, width, height, quality }`

**Example:**

```javascript
prvctice.gif.create({ width: 320, height: 240, quality: 'medium' }).then(function (info) {
  console.log('Encoder ready:', info.encoderId);
});
```

### prvctice.gif.addFrame(encoderId, dataUri, delay)

Add a frame to the encoder. The image is decoded and resized to the encoder's dimensions.

| Parameter | Type   | Required | Description                     |
| --------- | ------ | -------- | ------------------------------- |
| encoderId | string | Yes      | Encoder ID from `create()`      |
| dataUri   | string | Yes      | JPEG or PNG data URI            |
| delay     | number | No       | Frame delay in ms (default 100) |

**Returns:** `Promise<object>` -- `{ added, encoderId, frameCount }`

### prvctice.gif.finish(encoderId)

Finalize encoding and produce the GIF. Uses a long timeout (120s) since encoding may take several seconds for many frames.

| Parameter | Type   | Required | Description                |
| --------- | ------ | -------- | -------------------------- |
| encoderId | string | Yes      | Encoder ID from `create()` |

**Returns:** `Promise<object>` -- `{ dataUri, size, frameCount, width, height }`

**Example:**

```javascript
prvctice.gif.finish(encoderId).then(function (result) {
  document.getElementById('preview').src = result.dataUri;
  console.log('GIF size:', result.size, 'bytes,', result.frameCount, 'frames');
});
```

### prvctice.gif.cancel(encoderId)

Cancel an in-progress encoding. Terminates the worker and frees resources.

| Parameter | Type   | Required | Description                |
| --------- | ------ | -------- | -------------------------- |
| encoderId | string | Yes      | Encoder ID from `create()` |

**Returns:** `Promise<object>` -- `{ cancelled: true, encoderId }`

### prvctice.gif.onProgress(encoderId, callback)

Subscribe to encoding progress during `finish()`.

| Parameter | Type     | Required | Description                                 |
| --------- | -------- | -------- | ------------------------------------------- |
| encoderId | string   | Yes      | Encoder ID from `create()`                  |
| callback  | function | Yes      | Receives `(percent)` where percent is 0-100 |

**Returns:** `function` -- Unsubscribe function.

**Example:**

```javascript
var unsub = prvctice.gif.onProgress(encoderId, function (percent) {
  document.getElementById('progress').textContent = percent + '%';
});
```

---

## Charts

SVG-based chart components with animated rendering.

Source: `web/services/apps/uikit/js/charts.js`

All chart components share a common pattern: they accept an element and options, return `{ update(newOpts), dispose() }`, and automatically resize with the container.

### prvctice.ui.sparkline(el, opts)

Minimal inline chart for showing trends.

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ data: number[], color: string, fill: boolean, smooth: boolean, animate: boolean, strokeWidth: number }`

**Returns:** `{ update(opts), dispose }`

**Example:**

```javascript
var spark = prvctice.ui.sparkline(document.getElementById('trend'), {
  data: [10, 25, 18, 30, 22, 35, 28],
  fill: true,
  smooth: true,
});
// Update later
spark.update({ data: [12, 28, 20, 32, 25, 38, 30] });
```

### prvctice.ui.barChart(el, opts)

Vertical or horizontal bar chart.

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ labels: string[], values: number[], colors: string[], showValues: boolean, horizontal: boolean, animate: boolean, barRadius: number }`

**Returns:** `{ update(opts), dispose }`

### prvctice.ui.lineChart(el, opts)

Line chart with optional multi-dataset support.

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ labels: string[], values: number[], datasets: [{values, color}], dots: boolean, grid: boolean, smooth: boolean, animate: boolean, strokeWidth: number, color: string }`

**Returns:** `{ update(opts), dispose }`

### prvctice.ui.gauge(el, opts)

Arc gauge (like a speedometer).

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ value: number, min: number, max: number, color: string, label: string, showValue: boolean, animate: boolean, thickness: number }`

**Returns:** `{ update(opts), dispose }`

### prvctice.ui.pieChart(el, opts)

Pie or donut chart.

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ segments: [{value, label, color}], donut: boolean, labels: boolean, animate: boolean, colors: string[] }`

**Returns:** `{ update(opts), dispose }`

**Example:**

```javascript
var pie = prvctice.ui.pieChart(document.getElementById('usage'), {
  segments: [
    { value: 40, label: 'Audio' },
    { value: 30, label: 'Video' },
    { value: 20, label: 'Images' },
    { value: 10, label: 'Other' },
  ],
  donut: true,
});
```

### prvctice.ui.progressRing(el, opts)

Circular progress indicator.

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| el        | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ value: number, max: number, color: string, showValue: boolean, animate: boolean, thickness: number, label: string }`

**Returns:** `{ update(opts), dispose }`

**Example:**

```javascript
var ring = prvctice.ui.progressRing(document.getElementById('progress'), {
  value: 73,
  max: 100,
  label: 'Complete',
  thickness: 10,
});
```

### prvctice.ui.oscilloscope(container, opts)

Real-time waveform display (time-domain).

Source: `web/services/apps/uikit/js/audio.js`

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| container | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ analyser: AnalyserNode, color: string, lineWidth: number, fill: boolean }`

**Returns:** `{ connectAnalyser(node), dispose }`

### prvctice.ui.spectrogram(container, opts)

Real-time frequency bar display.

Source: `web/services/apps/uikit/js/audio.js`

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| container | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:** `{ analyser: AnalyserNode, bars: number, color: string, gap: number, gradient: boolean }`

**Returns:** `{ draw(data), connectAnalyser(node), dispose }`

### prvctice.ui.spectrum(container, opts)

Frequency spectrum analyzer with colored bands and optional reflection.

Source: `web/services/apps/uikit/js/audio.js`

| Parameter | Type    | Required | Description       |
| --------- | ------- | -------- | ----------------- |
| container | Element | Yes      | Container element |
| opts      | object  | No       | Options           |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| bands | number | 48 | Number of frequency bands |
| smoothing | number | 0.82 | Smoothing factor 0-1 |
| reflection | boolean | true | Show reflection below bars |
| analyser | AnalyserNode | - | Existing AnalyserNode to connect |
| waveform | string | `'sine'` | Color palette: `'sine'`, `'sawtooth'`, `'square'`, `'triangle'` |

**Returns:** `{ draw(data), setWaveform(type), connectAnalyser(node), dispose }`

### prvctice.ui.piano(container, opts)

Interactive piano keyboard with mouse/touch and computer keyboard support.

Source: `web/services/apps/uikit/js/audio.js`

| Parameter | Type       | Required | Description    |
| --------- | ---------- | -------- | -------------- |
| container | HTMLElement | Yes      | Parent element |
| opts      | object     | No       | Options        |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| startOctave | number | 4 | Starting octave |
| octaves | number | 1 | Number of octaves (max 3) |
| labels | boolean | true | Show note labels on keys |
| hints | boolean | true | Show keyboard shortcut hints |
| onNoteOn | function | - | `onNoteOn({ note, octave, frequency, midi, key })` |
| onNoteOff | function | - | `onNoteOff({ note, octave, frequency, midi, key })` |

**Returns:** `{ setOctave(n), noteOn(midi, key), noteOff(midi, key), dispose }`

Keyboard mapping: A-L for white keys, W/E/T/Y/U/O/P for black keys.

### prvctice.ui.pads(container, opts)

Grid of trigger pads with keyboard mapping. Default 4x4 layout.

Source: `web/services/apps/uikit/js/audio.js`

| Parameter | Type       | Required | Description    |
| --------- | ---------- | -------- | -------------- |
| container | HTMLElement | Yes      | Parent element |
| opts      | object     | No       | Options        |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| cols | number | 4 | Number of columns |
| rows | number | 4 | Number of rows |
| pads | Array | - | Pad definitions: `[{ label, note?, frequency?, midi? }]` |
| hints | boolean | true | Show keyboard shortcut hints |
| onPadOn | function | - | `onPadOn({ index, label, frequency?, midi?, key? })` |
| onPadOff | function | - | `onPadOff({ index, label, frequency?, midi?, key? })` |

**Returns:** `{ padOn(index), padOff(index), dispose }`

Default keyboard mapping for 4x4: `1234` (top row), `qwer`, `asdf`, `zxcv` (bottom row).

---

## Mixer

Host audio engine bridge. Route instrument audio through a centralized mixer with per-channel gain, pan, mute/solo, reverb send, and recording. The Mixer companion app displays channel strips for all connected instruments.

Requires `media:mixer` permission (implicitly granted to all apps).

Source: `web/services/apps/bridgeSDK.ts` (SDK), `web/services/apps/handlers/mixer.ts` (handler), `web/services/apps/audioEngine.ts` (engine)

### Connection

### prvctice.mixer.connect(opts)

Register as a mixer channel. Creates an audio channel strip in the host engine.

| Parameter | Type   | Required | Description                                            |
| --------- | ------ | -------- | ------------------------------------------------------ |
| opts.name | string | No       | Display name for the channel strip (default: app name) |

**Returns:** `Promise<{ channelId: string }>` -- The channel ID for subsequent calls.

**Example:**

```javascript
prvctice.mixer.connect({ name: 'My Synth' }).then(function (result) {
  console.log('Connected as channel:', result.channelId);
});
```

### prvctice.mixer.disconnect()

Remove the channel from the mixer. Always call in `prvctice.onDispose()`.

**Returns:** `Promise<void>`

### prvctice.mixer.onDisconnected(callback)

Subscribe to disconnection events (e.g., mixer reset, host cleanup).

| Parameter | Type     | Required | Description              |
| --------- | -------- | -------- | ------------------------ |
| callback  | function | Yes      | Called when disconnected |

**Returns:** `function` -- Unsubscribe function.

### Notes

### prvctice.mixer.noteOn(freq, opts)

Start a synthesizer voice on the connected channel.

| Parameter | Type   | Required | Description                        |
| --------- | ------ | -------- | ---------------------------------- |
| freq      | number | Yes      | Frequency in Hz (e.g., 440 for A4) |
| opts      | object | No       | Voice options                      |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| waveform | string | `"sine"` | `"sine"`, `"square"`, `"sawtooth"`, `"triangle"` |
| gain | number | 0.6 | Volume 0-1 |
| attack | number | 0.01 | Attack time in seconds |
| decay | number | 0 | Decay time in seconds |
| sustain | number | 1 | Sustain level 0-1 (1 = no decay) |
| release | number | 0.1 | Release time in seconds |
| filterFreq | number | 8000 | Lowpass cutoff in Hz (8000 = open) |
| filterQ | number | 1 | Filter resonance Q |
| detune | number | 0 | Detune in cents |
| vibratoDepth | number | 0 | Vibrato depth 0-1 |
| vibratoRate | number | 5 | Vibrato rate in Hz |

**Returns:** `Promise<{ voiceId: string }>` -- Use `voiceId` with `noteOff()`.

### prvctice.mixer.noteOff(voiceId)

Release a voice with its release envelope.

| Parameter | Type   | Required | Description              |
| --------- | ------ | -------- | ------------------------ |
| voiceId   | string | Yes      | Voice ID from `noteOn()` |

**Returns:** `Promise<void>`

### prvctice.mixer.setVoiceFrequency(voiceId, freq, rampTime?)

Smoothly change the frequency of an active voice (for continuous pitch instruments like theremins).

| Parameter | Type   | Required | Description                                  |
| --------- | ------ | -------- | -------------------------------------------- |
| voiceId   | string | Yes      | Voice ID from `noteOn()`                     |
| freq      | number | Yes      | Target frequency in Hz                       |
| rampTime  | number | No       | Ramp time constant in seconds (default 0.02) |

**Returns:** `Promise<void>`

### prvctice.mixer.setVoiceGain(voiceId, gain, rampTime?)

Smoothly change the gain of an active voice.

| Parameter | Type   | Required | Description                                  |
| --------- | ------ | -------- | -------------------------------------------- |
| voiceId   | string | Yes      | Voice ID from `noteOn()`                     |
| gain      | number | Yes      | Target gain (0-1)                            |
| rampTime  | number | No       | Ramp time constant in seconds (default 0.02) |

**Returns:** `Promise<void>`

### prvctice.mixer.tone(freq, duration, opts)

One-shot note: starts a voice and auto-releases after duration.

| Parameter | Type   | Required | Description                |
| --------- | ------ | -------- | -------------------------- |
| freq      | number | Yes      | Frequency in Hz            |
| duration  | number | Yes      | Duration in seconds        |
| opts      | object | No       | Same options as `noteOn()` |

**Returns:** `Promise<void>`

### prvctice.mixer.allNotesOff()

Kill all voices on the connected channel.

**Returns:** `Promise<void>`

### Channel Controls

### prvctice.mixer.setGain(channelId, value)

Set channel volume.

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| channelId | string | Yes      | Channel ID  |
| value     | number | Yes      | Gain 0-1    |

**Returns:** `Promise<void>`

### prvctice.mixer.setPan(channelId, value)

Set channel pan position.

| Parameter | Type   | Required | Description                |
| --------- | ------ | -------- | -------------------------- |
| channelId | string | Yes      | Channel ID                 |
| value     | number | Yes      | Pan -1 (left) to 1 (right) |

**Returns:** `Promise<void>`

### prvctice.mixer.setMute(channelId, value)

Mute or unmute a channel.

| Parameter | Type    | Required | Description |
| --------- | ------- | -------- | ----------- |
| channelId | string  | Yes      | Channel ID  |
| value     | boolean | Yes      | Mute state  |

**Returns:** `Promise<void>`

### prvctice.mixer.setSolo(channelId, value)

Solo or unsolo a channel.

| Parameter | Type    | Required | Description |
| --------- | ------- | -------- | ----------- |
| channelId | string  | Yes      | Channel ID  |
| value     | boolean | Yes      | Solo state  |

**Returns:** `Promise<void>`

### prvctice.mixer.setReverbSend(channelId, value)

Set reverb send level for a channel.

| Parameter | Type   | Required | Description    |
| --------- | ------ | -------- | -------------- |
| channelId | string | Yes      | Channel ID     |
| value     | number | Yes      | Send level 0-1 |

**Returns:** `Promise<void>`

### prvctice.mixer.setRecordArm(channelId, value)

Arm or disarm a channel for recording (visual indicator).

| Parameter | Type    | Required | Description |
| --------- | ------- | -------- | ----------- |
| channelId | string  | Yes      | Channel ID  |
| value     | boolean | Yes      | Arm state   |

**Returns:** `Promise<void>`

### Master Controls

### prvctice.mixer.setMasterGain(value)

Set master output volume.

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| value     | number | Yes      | Gain 0-1    |

**Returns:** `Promise<void>`

### prvctice.mixer.setMasterMute(value)

Mute or unmute master output.

| Parameter | Type    | Required | Description |
| --------- | ------- | -------- | ----------- |
| value     | boolean | Yes      | Mute state  |

**Returns:** `Promise<void>`

### Transport

### prvctice.mixer.setBpm(value)

Set transport BPM.

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| value     | number | Yes      | BPM (20-300) |

**Returns:** `Promise<void>`

### prvctice.mixer.setMetronome(enabled)

Enable or disable metronome click.

| Parameter | Type    | Required | Description     |
| --------- | ------- | -------- | --------------- |
| enabled   | boolean | Yes      | Metronome state |

**Returns:** `Promise<void>`

### prvctice.mixer.transportPlay()

Start transport playback.

**Returns:** `Promise<void>`

### prvctice.mixer.transportStop()

Stop transport playback.

**Returns:** `Promise<void>`

### State

### prvctice.mixer.getState()

Get a snapshot of the full engine state.

**Returns:** `Promise<object>` -- `{ channels, masterGain, masterMute, recording, bpm, metronomeEnabled, playing, transportTime }`

Each channel: `{ channelId, appId, appName, gain, pan, mute, solo, reverbSend, recordArm }`

### prvctice.mixer.subscribeState()

Get initial state and begin receiving state pushes via `onStateChange`.

**Returns:** `Promise<object>` -- Initial engine state (same shape as `getState()`).

### prvctice.mixer.onStateChange(callback)

Subscribe to real-time state updates. Fires on every state change (channel added/removed, gain/pan/mute changes, transport state, etc.).

| Parameter | Type     | Required | Description                  |
| --------- | -------- | -------- | ---------------------------- |
| callback  | function | Yes      | Receives engine state object |

**Returns:** `function` -- Unsubscribe function.

### prvctice.mixer.getAnalyserData(channelId)

Get FFT frequency and time-domain data for visualization.

| Parameter | Type   | Required | Description                        |
| --------- | ------ | -------- | ---------------------------------- |
| channelId | string | No       | Channel ID, or omit for master bus |

**Returns:** `Promise<{ timeDomain: number[], frequency: number[] }>` -- Byte arrays (0-255).

### Recording

### prvctice.mixer.startRecording()

Start recording the master bus output.

**Returns:** `Promise<void>`

### prvctice.mixer.stopRecording()

Stop recording and get the audio data.

**Returns:** `Promise<{ audio: string, mimeType: string, duration: number }>` -- Base64-encoded audio.

**Example:**

```javascript
prvctice.mixer.stopRecording().then(function (result) {
  prvctice.media.download(result.audio, 'mix.webm', result.mimeType);
});
```

### Recording Playback

After calling `stopRecording()`, the recorded audio is retained in the engine for in-app playback. Use these methods to play, seek, and manage the recording without exporting.

### prvctice.mixer.playRecording()

Start or resume playback of the last recording through the master bus.

**Returns:** `Promise<void>`

### prvctice.mixer.pauseRecording()

Pause recording playback at the current position.

**Returns:** `Promise<void>`

### prvctice.mixer.stopPlayback()

Stop playback and reset position to the beginning.

**Returns:** `Promise<void>`

### prvctice.mixer.seekRecording(time)

Seek to a specific position in the recording.

| Parameter | Type   | Required | Description         |
| --------- | ------ | -------- | ------------------- |
| time      | number | Yes      | Position in seconds |

**Returns:** `Promise<void>`

### prvctice.mixer.clearRecording()

Discard the recorded audio and free resources. Returns the mixer to live mode.

**Returns:** `Promise<void>`

**Example:**

```javascript
// Record, then play back
prvctice.mixer.stopRecording().then(function () {
  prvctice.mixer.playRecording();
});

// Seek to 5 seconds
prvctice.mixer.seekRecording(5);

// Discard and start fresh
prvctice.mixer.clearRecording();
```

**State fields** available via `getState()` during playback:

- `hasRecording` (boolean) -- Whether a recording is retained
- `playbackPlaying` (boolean) -- Whether playback is active
- `playbackCurrentTime` (number) -- Current playback position in seconds
- `playbackDuration` (number) -- Total recording duration in seconds

---

_Last verified against source: 2026-02-21_
