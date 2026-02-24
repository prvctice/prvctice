/**
 * Voice Notes — Vintage Sony PCM recorder aesthetic.
 * Amber LCD, segmented VU meters, 7-segment timer, skeuomorphic buttons.
 * Transparent background, left-aligned transport, WAV export.
 */

export const VOICE_NOTES_HTML =
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>

* { box-sizing: border-box; }

body {
  display: flex; flex-direction: column; height: 100vh; overflow: hidden;
  background: transparent; font-family: 'Courier New', monospace;
}

/* ── Bezel (transparent — inherits window glass) ── */
.bezel {
  flex-shrink: 0; background: transparent;
  padding: 10px 10px 8px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

/* ── LCD Panel ── */
.lcd {
  background: linear-gradient(160deg, #c98d14 0%, #b87a0c 40%, #c28510 100%);
  border-radius: 3px; padding: 7px 9px 6px;
  position: relative; overflow: hidden; color: #1a0d00;
  box-shadow:
    inset 0 0 20px rgba(0,0,0,0.35),
    inset 0 2px 6px rgba(0,0,0,0.25),
    0 1px 0 rgba(255,255,255,0.05);
}
.lcd::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(
    0deg, transparent, transparent 2px,
    rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 3px
  );
}
.vu-scale {
  display: flex; margin: 0 0 1px 13px; padding-right: 36px;
  font-size: 6.5px; font-weight: 700; color: rgba(26,13,0,0.55);
  justify-content: space-between;
}
.vu-row { display: flex; align-items: center; gap: 3px; margin-bottom: 3px; }
.vu-ch { font-size: 8px; font-weight: 700; width: 10px; flex-shrink: 0; }
.vu-segs { flex: 1; display: flex; gap: 1px; }
.seg { flex: 1; height: 9px; border-radius: 1px; background: rgba(26,13,0,0.12); transition: background 35ms; }
.seg.on  { background: rgba(26,13,0,0.82); }
.seg.pk  { background: rgba(26,13,0,1); }
.seg.hot { background: rgba(100,30,0,0.9); }
.vu-db { font-size: 8px; font-weight: 700; width: 34px; text-align: right; flex-shrink: 0; }
.lcd-sep { height: 1px; margin: 4px -9px; background: linear-gradient(90deg, transparent, rgba(26,13,0,0.25) 20%, rgba(26,13,0,0.25) 80%, transparent); }
.time-row { display: flex; align-items: center; gap: 0; margin-top: 2px; }
.rec-badge {
  font-size: 7.5px; font-weight: 900; padding: 1px 4px;
  border: 1.5px solid rgba(26,13,0,0.7); border-radius: 2px;
  letter-spacing: 0.05em; flex-shrink: 0;
  opacity: 0; transition: opacity 100ms;
}
.rec-badge.on { opacity: 1; animation: badge-blink 1s step-end infinite; }
@keyframes badge-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
.time-spacer { flex: 1; }
.lcd-time {
  font-size: 30px; font-weight: 900; letter-spacing: 0.04em; line-height: 1;
  color: #160b00; font-variant-numeric: tabular-nums;
}
.lcd-time-idle { opacity: 0.55; }
.info-row { display: flex; justify-content: space-between; align-items: baseline; margin-top: 2px; }
.lcd-sm { font-size: 8px; opacity: 0.65; letter-spacing: 0.02em; }
.lcd-sm-r { font-size: 8px; opacity: 0.65; text-align: right; }
.file-row { display: flex; align-items: center; gap: 5px; margin-top: 1px; }
.lcd-box { font-size: 7.5px; border: 1px solid rgba(26,13,0,0.45); padding: 0 2px; border-radius: 1px; flex-shrink: 0; }
.lcd-filename { font-size: 9px; font-weight: 700; letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lcd-status { display: flex; justify-content: space-between; margin-top: 4px; padding-top: 3px; border-top: 1px solid rgba(26,13,0,0.2); font-size: 7px; font-weight: 900; letter-spacing: 0.12em; opacity: 0.55; }
.lim-on { opacity: 1 !important; }

/* ── Transport (left-aligned) ── */
.transport {
  flex-shrink: 0; display: flex; align-items: flex-end;
  justify-content: flex-start; gap: 18px;
  padding: 10px 14px 10px; background: transparent;
}
.tbtn-wrap { display: flex; flex-direction: column; align-items: center; gap: 5px; }
.tbtn-label { font-size: 6.5px; letter-spacing: 0.14em; font-weight: 700; color: rgba(160,135,90,0.45); text-transform: uppercase; }

.tbtn { all: unset; cursor: pointer; position: relative; border-radius: 50%; display: flex; align-items: center; justify-content: center; user-select: none; -webkit-user-select: none; transition: transform 55ms, box-shadow 55ms; }
.tbtn:active { transform: translateY(2px) !important; box-shadow: inset 0 1px 1px rgba(255,255,255,0.04), 0 0px 0 #050402, 0 1px 2px rgba(0,0,0,0.4) !important; }

.tbtn-rec {
  width: 52px; height: 52px;
  background: radial-gradient(circle at 42% 32%, #e83030, #b81818);
  box-shadow: inset 0 1px 2px rgba(255,255,255,0.15), 0 2px 0 #6a0a0a, 0 3px 6px rgba(0,0,0,0.4);
}
.tbtn-rec::after {
  content: ''; width: 18px; height: 18px; border-radius: 50%;
  position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
  background: radial-gradient(circle at 40% 32%, #ffffff, #e8e8e8);
  box-shadow: 0 1px 4px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.8);
}
.tbtn-rec.recording { background: radial-gradient(circle at 42% 32%, #ff4040, #cc1515); }
.tbtn-rec.recording::after { animation: rec-glow 1s ease-in-out infinite; }
@keyframes rec-glow { 0%,100% { opacity: 1; transform: translate(-50%,-50%) scale(1); } 50% { opacity: 0.6; transform: translate(-50%,-50%) scale(0.85); } }

.tbtn-md {
  width: 42px; height: 42px;
  background: radial-gradient(circle at 42% 32%, #242018, #14120e);
  box-shadow: inset 0 1px 1px rgba(255,255,255,0.04), 0 2px 0 #060402, 0 3px 6px rgba(0,0,0,0.45);
  color: rgba(175,150,105,0.75); font-size: 13px;
}
.tbtn-sm {
  width: 36px; height: 36px;
  background: radial-gradient(circle at 42% 32%, #1e1c14, #110f0a);
  box-shadow: inset 0 1px 1px rgba(255,255,255,0.04), 0 2px 0 #060402, 0 3px 5px rgba(0,0,0,0.4);
  color: rgba(165,140,95,0.65); font-size: 11px;
}
#playBtn {
  background: radial-gradient(circle at 42% 32%, #1e1e1e, #0e0e0e);
  box-shadow: inset 0 1px 1px rgba(255,255,255,0.06), 0 2px 0 #050505, 0 3px 6px rgba(0,0,0,0.5);
  color: rgba(60,220,90,0.95);
}
#stopBtn {
  background: radial-gradient(circle at 42% 32%, #1e1e1e, #0e0e0e);
  box-shadow: inset 0 1px 1px rgba(255,255,255,0.06), 0 2px 0 #050505, 0 3px 6px rgba(0,0,0,0.5);
  color: rgba(240,240,240,0.95);
}

/* ── List ── */
.list-hdr { flex-shrink: 0; display: flex; justify-content: space-between; padding: 5px 10px 3px; background: transparent; border-top: 1px solid rgba(255,255,255,0.06); }
.list-hdr-label { font-size: 7.5px; letter-spacing: 0.12em; color: rgba(160,130,75,0.45); }
.list-hdr-count { font-size: 7.5px; color: rgba(140,115,65,0.35); }

.note-list { flex: 1; overflow-y: auto; background: transparent; padding: 3px 7px 7px; display: flex; flex-direction: column; gap: 3px; }
.note-list::-webkit-scrollbar { width: 2px; }
.note-list::-webkit-scrollbar-thumb { background: rgba(255,200,100,0.15); border-radius: 999px; }

.note-empty { padding: 20px 12px; text-align: center; font-size: 9px; color: rgba(160,130,75,0.3); letter-spacing: 0.06em; line-height: 1.9; }

.note-card { border: 1px solid rgba(255,200,100,0.1); border-radius: 3px; background: rgba(0,0,0,0.25); overflow: hidden; transition: border-color 80ms; }
.note-card:hover { border-color: rgba(255,200,100,0.2); }
.note-card.playing { border-color: rgba(68,102,180,0.6); background: rgba(30,45,100,0.12); }

.note-row { display: flex; align-items: center; gap: 7px; padding: 6px 7px 3px; }
.note-play { all: unset; cursor: pointer; flex-shrink: 0; width: 27px; height: 27px; border-radius: 50%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,200,100,0.2); display: flex; align-items: center; justify-content: center; font-size: 8px; color: rgba(170,140,85,0.7); box-shadow: 0 1px 3px rgba(0,0,0,0.6), inset 0 1px rgba(255,255,255,0.03); transition: all 80ms; }
.note-play:hover { border-color: #4466bb; color: rgba(100,140,220,0.9); }
.note-card.playing .note-play { border-color: rgba(68,102,180,0.8); color: rgba(100,140,220,1); }

.note-info { flex: 1; min-width: 0; }
.note-name { font-size: 11px; font-weight: 700; color: rgba(195,168,115,0.92); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; outline: none; display: block; cursor: text; font-family: 'Courier New', monospace; }
.note-name:focus { color: rgba(215,190,140,1); }
.note-meta { font-size: 7.5px; color: rgba(140,115,65,0.55); margin-top: 1px; }

.note-actions { display: flex; gap: 2px; flex-shrink: 0; }
.note-btn { all: unset; cursor: pointer; width: 22px; height: 22px; border-radius: 2px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: rgba(140,115,65,0.45); transition: all 70ms; }
.note-btn:hover { background: rgba(255,200,100,0.08); color: rgba(195,168,115,0.85); }
.note-btn.del:hover { color: rgba(200,80,70,0.9); }

.note-bars { display: flex; align-items: flex-end; gap: 1px; padding: 0 7px 3px; height: 14px; }
.note-bar { flex: 1; border-radius: 1px; min-height: 2px; background: rgba(90,70,30,0.28); }
.note-card.playing .note-bar { background: rgba(68,100,185,0.4); }
.note-prog { height: 2px; background: rgba(0,0,0,0.2); }
.note-prog-fill { height: 100%; background: #4466bb; width: 0%; }

</style>
</head>
<body>

<div class="bezel">
  <div class="lcd">
    <div class="vu-scale">
      <span>-40</span><span>-24</span><span>-12</span><span>-6</span><span>0</span>
    </div>
    <div class="vu-row">
      <span class="vu-ch">L</span>
      <div class="vu-segs" id="vuL"></div>
      <span class="vu-db" id="dbL">&nbsp;&nbsp;--</span>
    </div>
    <div class="vu-row">
      <span class="vu-ch">R</span>
      <div class="vu-segs" id="vuR"></div>
      <span class="vu-db" id="dbR">&nbsp;&nbsp;--</span>
    </div>
    <div class="lcd-sep"></div>
    <div class="time-row">
      <span class="rec-badge" id="recBadge">REC</span>
      <span class="time-spacer"></span>
      <span class="lcd-time lcd-time-idle" id="lcdTime">0:00:00</span>
      <span class="time-spacer"></span>
    </div>
    <div class="info-row">
      <span class="lcd-sm" id="trackLabel">&#9654; --/--</span>
      <span class="lcd-sm-r" id="remainLabel">&nbsp;</span>
    </div>
    <div class="file-row">
      <span class="lcd-box" id="trackBox">[--]</span>
      <span class="lcd-filename" id="lcdFilename">READY</span>
    </div>
    <div class="lcd-status">
      <span>MONO WAV</span>
      <span id="limLabel">---</span>
    </div>
  </div>
</div>

<div class="transport">
  <div class="tbtn-wrap">
    <button class="tbtn tbtn-rec" id="recBtn"></button>
    <span class="tbtn-label">REC</span>
  </div>
  <div class="tbtn-wrap">
    <button class="tbtn tbtn-md" id="playBtn">&#9654;</button>
    <span class="tbtn-label">PLAY</span>
  </div>
  <div class="tbtn-wrap">
    <button class="tbtn tbtn-md" id="stopBtn">&#9646;&#9646;</button>
    <span class="tbtn-label">STOP</span>
  </div>
</div>

<div class="list-hdr">
  <span class="list-hdr-label">RECORDINGS</span>
  <span class="list-hdr-count" id="noteCount"></span>
</div>
<div class="note-list" id="noteList"></div>

<script>
prvctice.onReady(function() {

  var SEG = 20;

  // ── State ──
  var notes = [];
  var recording = false;
  var timerInt = null;
  var startMs = 0;
  var audioUnsub = null;
  var peakL = 0, peakR = 0;
  var currentNoteId = null;
  var currentAudio = null;
  var selectedId = null;
  var snapBuf = [];
  for (var _i = 0; _i < 80; _i++) snapBuf.push(0);

  // ── Build VU segments ──
  function buildVu(id) {
    var el = document.getElementById(id);
    el.innerHTML = '';
    for (var i = 0; i < SEG; i++) {
      var s = document.createElement('div');
      s.className = 'seg';
      el.appendChild(s);
    }
  }
  buildVu('vuL');
  buildVu('vuR');

  function energyToSegs(e) { return Math.floor(SEG * Math.sqrt(Math.max(0, Math.min(1, e)))); }
  function energyToDb(e) {
    if (e < 0.001) return '  --';
    var db = Math.round(20 * Math.log(e) / Math.log(10));
    return (db >= 0 ? ' +' : (db > -10 ? '  ' : ' ')) + db;
  }

  function updateVu(eL, eR) {
    if (eL > peakL) peakL = eL; else peakL = Math.max(0, peakL - 0.015);
    if (eR > peakR) peakR = eR; else peakR = Math.max(0, peakR - 0.015);
    setVuRow('vuL', eL, peakL);
    setVuRow('vuR', eR, peakR);
    document.getElementById('dbL').textContent = energyToDb(eL) + 'dB';
    document.getElementById('dbR').textContent = energyToDb(eR) + 'dB';
    var lim = document.getElementById('limLabel');
    if (eL > 0.92 || eR > 0.92) { lim.textContent = 'LIM'; lim.classList.add('lim-on'); }
    else { lim.textContent = '---'; lim.classList.remove('lim-on'); }
  }

  function setVuRow(id, e, peak) {
    var segs = document.getElementById(id).children;
    var active = energyToSegs(e);
    var pkSeg = Math.max(0, energyToSegs(peak) - 1);
    for (var i = 0; i < segs.length; i++) {
      segs[i].className = 'seg';
      if (i < active) segs[i].classList.add(i >= SEG - 3 ? 'hot' : 'on');
      else if (i === pkSeg && peak > 0.05) segs[i].classList.add('pk');
    }
  }

  function clearVu() {
    var ids = ['vuL', 'vuR'];
    for (var k = 0; k < ids.length; k++) {
      var segs = document.getElementById(ids[k]).children;
      for (var i = 0; i < segs.length; i++) segs[i].className = 'seg';
    }
    document.getElementById('dbL').textContent = '  --';
    document.getElementById('dbR').textContent = '  --';
    document.getElementById('limLabel').textContent = '---';
    document.getElementById('limLabel').classList.remove('lim-on');
    peakL = 0; peakR = 0;
  }

  // ── Helpers ──
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtLong(ms) {
    var s = Math.floor(ms/1000), m = Math.floor(s/60), h = Math.floor(m/60);
    m = m%60; s = s%60;
    return h + ':' + p2(m) + ':' + p2(s);
  }
  function fmtShort(ms) {
    var s = Math.floor(ms/1000), m = Math.floor(s/60);
    return m + ':' + p2(s%60);
  }

  var lcdTimeEl = document.getElementById('lcdTime');
  function setTime(ms, idle) {
    lcdTimeEl.textContent = fmtLong(ms);
    lcdTimeEl.className = 'lcd-time' + (idle ? ' lcd-time-idle' : '');
  }
  function setFilename(name) { document.getElementById('lcdFilename').textContent = name; }
  function setTrack(cur, total) {
    document.getElementById('trackLabel').innerHTML = cur > 0 ? ('&#9654; ' + p2(cur) + '/' + p2(total)) : '&#9654; --/--';
    document.getElementById('trackBox').textContent = cur > 0 ? ('[' + p2(cur) + ']') : '[--]';
  }

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── Record ──
  var recBtn = document.getElementById('recBtn');
  recBtn.addEventListener('click', function() {
    if (recording) stopRec(); else startRec();
  });

  function startRec() {
    prvctice.media.startMicrophone({ mode: 'both' }).then(function() {
      recording = true;
      startMs = Date.now();
      recBtn.classList.add('recording');
      document.getElementById('recBadge').classList.add('on');
      setTime(0, false);
      setFilename('NOTE_' + p2(notes.length + 1) + '.WAV');
      setTrack(0, 0);
      document.getElementById('remainLabel').textContent = '';
      timerInt = setInterval(function() { setTime(Date.now() - startMs, false); }, 250);
      audioUnsub = prvctice.media.onAudioData(function(bars) {
        var sumL = 0, sumR = 0;
        for (var i = 0; i < 16; i++) sumL += (bars[i] || 0);
        for (var i = 16; i < 32; i++) sumR += (bars[i] || 0);
        updateVu(sumL / 16, sumR / 16);
        // build waveform snapshot
        var sum = 0;
        for (var j = 0; j < bars.length; j++) sum += bars[j];
        snapBuf.shift();
        snapBuf.push(sum / bars.length);
      });
    }).catch(function() {
      prvctice.ui.toast('Microphone access denied', 'error');
    });
  }

  function stopRec() {
    recording = false;
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
    if (audioUnsub) { audioUnsub(); audioUnsub = null; }
    recBtn.classList.remove('recording');
    document.getElementById('recBadge').classList.remove('on');
    clearVu();

    var dur = Date.now() - startMs;
    var snap = snapBuf.slice();
    // reset snap buffer
    for (var i = 0; i < snapBuf.length; i++) snapBuf[i] = 0;

    setFilename('SAVING...');
    prvctice.media.stopMicrophone().then(function(result) {
      setTime(0, true);
      setFilename('READY');
      setTrack(0, 0);

      if (result && result.audio) {
        var now = new Date();
        var note = {
          id: 'n' + Date.now(),
          name: 'Note ' + p2(notes.length + 1),
          audio: result.audio,
          mimeType: result.mimeType || 'audio/webm',
          duration: dur,
          snap: snap,
          date: now.toLocaleDateString(undefined, { month:'short', day:'numeric' }) +
                ' ' + now.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' })
        };
        notes.unshift(note);
        persist();
        selectedId = note.id;
        prvctice.ui.toast('Saved', 'success');
      } else {
        prvctice.ui.toast('Recording captured nothing — try again', 'warning');
      }
      render();
    }).catch(function() {
      setTime(0, true);
      setFilename('READY');
      render();
    });
  }

  // ── Playback ──
  function stopPlayback() {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    currentNoteId = null;
    setTime(0, true);
    setFilename('READY');
    document.getElementById('trackLabel').innerHTML = '&#9654; --/--';
    document.getElementById('remainLabel').textContent = '';
    refreshPlaying();
  }

  function playNote(note) {
    if (!note || !note.audio) { prvctice.ui.toast('No audio', 'error'); return; }
    stopPlayback();
    currentNoteId = note.id;
    var blob = prvctice.ui.base64ToBlob(note.audio, note.mimeType);
    var url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.onended = function() { URL.revokeObjectURL(url); stopPlayback(); };
    currentAudio.ontimeupdate = function() {
      var ct = currentAudio.currentTime * 1000;
      setTime(ct, false);
      var idx = noteIdx(note.id);
      document.getElementById('trackLabel').innerHTML = '&#9654; ' + p2(idx+1) + '/' + p2(notes.length);
      if (note.duration > 0) {
        document.getElementById('remainLabel').textContent = '-' + fmtShort(Math.max(0, note.duration - ct));
        var fill = document.getElementById('prg-' + note.id);
        if (fill) fill.style.width = Math.min(100, ct / note.duration * 100) + '%';
      }
    };
    setFilename(note.name.toUpperCase() + '.WAV');
    var idx = noteIdx(note.id);
    document.getElementById('trackLabel').innerHTML = '&#9654; ' + p2(idx+1) + '/' + p2(notes.length);
    currentAudio.play();
    refreshPlaying();
  }

  function noteIdx(id) {
    for (var i = 0; i < notes.length; i++) if (notes[i].id === id) return i;
    return 0;
  }
  function findNote(id) {
    for (var i = 0; i < notes.length; i++) if (notes[i].id === id) return notes[i];
    return null;
  }

  // ── Transport ──
  document.getElementById('playBtn').addEventListener('click', function() {
    if (recording) return;
    if (currentNoteId) {
      if (currentAudio && currentAudio.paused) currentAudio.play();
      else if (currentAudio) currentAudio.pause();
    } else {
      var id = selectedId || (notes.length > 0 ? notes[0].id : null);
      if (id) playNote(findNote(id));
    }
  });
  document.getElementById('stopBtn').addEventListener('click', function() {
    if (recording) stopRec(); else stopPlayback();
  });

  // ── Export as WAV ──
  function exportWav(note) {
    if (!note.audio) { prvctice.ui.toast('No audio to export', 'warning'); return; }
    prvctice.ui.toast('Converting to WAV...', 'info');
    var blob = prvctice.ui.base64ToBlob(note.audio, note.mimeType);
    var reader = new FileReader();
    reader.onload = function() {
      prvctice.audio.buffer.decode(reader.result).then(function(buf) {
        var wav = prvctice.audio.encodeWAV(buf);
        return prvctice.audio.bufferToBase64(wav);
      }).then(function(b64) {
        prvctice.media.download(b64, note.name + '.wav', 'audio/wav');
        prvctice.ui.toast(note.name + '.wav saved', 'success');
      }).catch(function() {
        prvctice.media.download(note.audio, note.name + '.webm', note.mimeType);
        prvctice.ui.toast(note.name + '.webm saved', 'success');
      });
    };
    reader.readAsArrayBuffer(blob);
  }

  // ── Render ──
  var listEl = document.getElementById('noteList');

  function render() {
    var countEl = document.getElementById('noteCount');
    countEl.textContent = notes.length ? (notes.length + (notes.length === 1 ? ' note' : ' notes')) : '';

    if (!notes.length) {
      listEl.innerHTML = '<div class="note-empty">PRESS REC TO CAPTURE<br>YOUR FIRST VOICE NOTE</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      var MINI = 28;
      var barsHtml = '';
      if (n.snap && n.snap.length >= MINI) {
        var step = n.snap.length / MINI;
        for (var j = 0; j < MINI; j++) {
          var v = n.snap[Math.floor(j * step)] || 0;
          barsHtml += '<div class="note-bar" style="height:' + Math.max(15, Math.round(v * 100)) + '%"></div>';
        }
      } else {
        for (var j = 0; j < MINI; j++) barsHtml += '<div class="note-bar" style="height:15%"></div>';
      }
      html +=
        '<div class="note-card" data-id="' + n.id + '">' +
          '<div class="note-row">' +
            '<button class="note-play" data-play="' + n.id + '">&#9654;</button>' +
            '<div class="note-info">' +
              '<span class="note-name" contenteditable="true" spellcheck="false" data-name="' + n.id + '">' + esc(n.name) + '</span>' +
              '<div class="note-meta">' + fmtShort(n.duration) + ' &middot; ' + n.date + '</div>' +
            '</div>' +
            '<div class="note-actions">' +
              '<button class="note-btn" data-export="' + n.id + '" title="Save WAV">&#8599;</button>' +
              '<button class="note-btn del" data-del="' + n.id + '" title="Delete">&#215;</button>' +
            '</div>' +
          '</div>' +
          '<div class="note-bars">' + barsHtml + '</div>' +
          '<div class="note-prog"><div class="note-prog-fill" id="prg-' + n.id + '"></div></div>' +
        '</div>';
    }
    listEl.innerHTML = html;
    refreshPlaying();

    // Attach direct delete listeners — bypass event delegation, remove card from DOM instantly
    var delBtns = listEl.querySelectorAll('[data-del]');
    for (var di = 0; di < delBtns.length; di++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var nid = btn.getAttribute('data-del');
          // Remove the card from DOM immediately for instant visual feedback
          var card = btn.closest('.note-card');
          if (card && card.parentNode) card.parentNode.removeChild(card);
          // Update state
          if (currentNoteId === nid) stopPlayback();
          if (selectedId === nid) selectedId = null;
          notes = notes.filter(function(x) { return x.id !== nid; });
          persist();
          // Update count and show empty state if list is now empty
          var countEl = document.getElementById('noteCount');
          if (countEl) countEl.textContent = notes.length ? (notes.length + (notes.length === 1 ? ' note' : ' notes')) : '';
          if (!notes.length) listEl.innerHTML = '<div class="note-empty">PRESS REC TO CAPTURE<br>YOUR FIRST VOICE NOTE</div>';
        });
      })(delBtns[di]);
    }
  }

  function refreshPlaying() {
    var cards = listEl.querySelectorAll('.note-card');
    for (var i = 0; i < cards.length; i++) {
      var el = cards[i];
      var id = el.getAttribute('data-id');
      var btn = el.querySelector('[data-play]');
      if (id === currentNoteId) {
        el.classList.add('playing');
        if (btn) btn.innerHTML = '&#9646;&#9646;';
      } else {
        el.classList.remove('playing');
        if (btn) btn.innerHTML = '&#9654;';
        var fill = document.getElementById('prg-' + id);
        if (fill) fill.style.width = '0%';
      }
      el.style.outline = id === selectedId ? '1px solid rgba(68,102,180,0.3)' : '';
    }
  }

  // ── List events (added once) ──
  listEl.addEventListener('click', function(e) {
    var card = e.target.closest('.note-card');
    if (card) { selectedId = card.getAttribute('data-id'); refreshPlaying(); }

    var pb = e.target.closest('[data-play]');
    if (pb) {
      var id = pb.getAttribute('data-play');
      if (currentNoteId === id) stopPlayback();
      else playNote(findNote(id));
      return;
    }

    var eb = e.target.closest('[data-export]');
    if (eb) { exportWav(findNote(eb.getAttribute('data-export'))); return; }

  });

  listEl.addEventListener('blur', function(e) {
    var el = e.target.closest('[data-name]');
    if (!el) return;
    var n = findNote(el.getAttribute('data-name'));
    if (!n) return;
    var v = el.textContent.trim();
    if (v && v !== n.name) { n.name = v; persist(); }
    else el.textContent = n.name;
  }, true);

  listEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.target.hasAttribute('contenteditable')) {
      e.preventDefault(); e.target.blur();
    }
  });

  // ── Storage ──
  function persist() {
    var idx = [];
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      idx.push({ id:n.id, name:n.name, duration:n.duration, snap:n.snap, date:n.date, mimeType:n.mimeType });
      prvctice.storage.set('vn_a_' + n.id, n.audio);
    }
    prvctice.storage.set('vn_idx', JSON.stringify(idx));
    // prune deleted audio
    var ids = notes.map(function(n) { return n.id; });
    prvctice.storage.keys().then(function(keys) {
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k.indexOf('vn_a_') === 0 && ids.indexOf(k.replace('vn_a_','')) === -1) {
          prvctice.storage.remove(k);
        }
      }
    });
  }

  function loadNotes(done) {
    prvctice.storage.get('vn_idx').then(function(raw) {
      if (!raw) { done(); return; }
      var idx = JSON.parse(raw);
      if (!idx || !idx.length) { done(); return; }
      var loaded = 0;
      for (var i = 0; i < idx.length; i++) {
        (function(meta) {
          prvctice.storage.get('vn_a_' + meta.id).then(function(audio) {
            if (audio) {  // only load notes that have actual audio
              notes.push({
                id: meta.id, name: meta.name, audio: audio,
                mimeType: meta.mimeType || 'audio/webm', duration: meta.duration || 0,
                snap: meta.snap || [], date: meta.date || ''
              });
            }
            if (++loaded === idx.length) {
              notes.sort(function(a, b) { return a.id < b.id ? 1 : -1; });
              done();
            }
          }).catch(function() {
            if (++loaded === idx.length) { done(); }
          });
        })(idx[i]);
      }
    }).catch(done);
  }

  // ── Boot: clean up stale keys from old versions, then load ──
  setTime(0, true);
  prvctice.storage.keys().then(function(keys) {
    var stale = ['vn2_idx', 'vn3_idx'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.indexOf('vn2_') === 0 || k.indexOf('vn3_') === 0) stale.push(k);
    }
    for (var j = 0; j < stale.length; j++) prvctice.storage.remove(stale[j]);
  }).catch(function() {}).then(function() {
    loadNotes(function() { render(); });
  }).catch(function() {
    loadNotes(function() { render(); });
  });

  prvctice.onDispose(function() {
    if (recording) { if (audioUnsub) audioUnsub(); prvctice.media.stopMicrophone(); }
    if (timerInt) clearInterval(timerInt);
    stopPlayback();
  });
});
<` +
  `/script>
</body>
</html>`;
