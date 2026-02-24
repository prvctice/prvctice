/**
 * Media Downloader -- HTML build module.
 */

export const MEDIA_DOWNLOADER_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body class="p-stack pad-2 full gap-1">
  <div id="mainContent">
    <div class="p-stat p-stat-left" style="padding:0">
      <div class="p-stat-value font-mono font-bold" id="heroValue" style="color:var(--p-primary)">--</div>
      <div class="p-stat-label p-label-tech" id="heroLabel">READY</div>
    </div>
    <div class="p-divider"></div>
    <div class="p-stack gap-2">
      <div class="p-stack gap-1" style="display:none" id="detailsContainer">
  <div class="p-split text-xs font-mono">
    <span class="text-muted">TITLE</span>
    <span id="titleValue" class="p-text-clamp-1">--</span>
  </div>
  <div class="p-split text-xs font-mono">
    <span class="text-muted">DURATION</span>
    <span id="durationValue">--</span>
  </div>
  <div class="p-split text-xs font-mono">
    <span class="text-muted">FORMAT</span>
    <span id="formatValue">--</span>
  </div>
  <div class="p-split text-xs font-mono">
    <span class="text-muted">SIZE</span>
    <span id="sizeValue">--</span>
  </div>
</div>
<div class="p-stack gap-2" id="inputContainer">
  <input type="text" class="p-input" id="urlInput" placeholder="Paste video URL..." />
  <div class="p-row gap-2">
    <select class="p-select flex-1" id="formatSelect">
      <option value="video">Video (MP4)</option>
      <option value="audio">Audio Only (MP3)</option>
    </select>
  </div>
  <button class="p-btn p-btn-primary" id="downloadBtn">Download</button>
</div>
<div class="p-stack gap-2" style="display:none" id="actionsContainer">
  <button class="p-btn p-btn-primary" id="saveBtn">Save to Device</button>
  <button class="p-btn" id="newBtn">Download Another</button>
</div>
    </div>
    <div class="p-split text-xs font-mono" style="flex-shrink:0;margin-top:var(--p-2)">
  <span class="text-muted">STATUS</span>
  <span id="statusIndicator"><span class="p-badge-dot"></span> IDLE</span>
</div>
  </div>
  <div id="errorState" class="p-center full-height" style="display:none">
    <div class="p-empty"><div class="p-empty-message" id="errorMsg">NO SIGNAL</div></div>
  </div>
</body>
<script>prvctice.onReady(function() {
  var heroValue = document.getElementById("heroValue");
  var heroLabel = document.getElementById("heroLabel");
  var statusIndicator = document.getElementById("statusIndicator");
  var urlInput = document.getElementById("urlInput");
  var formatSelect = document.getElementById("formatSelect");
  var downloadBtn = document.getElementById("downloadBtn");
  var saveBtn = document.getElementById("saveBtn");
  var newBtn = document.getElementById("newBtn");
  var inputContainer = document.getElementById("inputContainer");
  var detailsContainer = document.getElementById("detailsContainer");
  var actionsContainer = document.getElementById("actionsContainer");
  var titleValue = document.getElementById("titleValue");
  var durationValue = document.getElementById("durationValue");
  var formatValue = document.getElementById("formatValue");
  var sizeValue = document.getElementById("sizeValue");
  var currentResult = null;
  function setStatus(text, isDot) {
    if (isDot) {
      statusIndicator.innerHTML = '<span class="p-badge-dot"></span> ' + text;
    } else {
      statusIndicator.textContent = text;
    }
  }
  function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    var k = 1024;
    var sizes = ["B", "KB", "MB", "GB"];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }
  function formatDuration(seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = Math.floor(seconds % 60);
    return mins + ":" + (secs < 10 ? "0" : "") + secs;
  }
  function resetUI() {
    inputContainer.style.display = "";
    detailsContainer.style.display = "none";
    actionsContainer.style.display = "none";
    heroValue.textContent = "--";
    heroLabel.textContent = "READY";
    urlInput.value = "";
    currentResult = null;
    setStatus("IDLE", true);
  }
  function handleDownload() {
    var url = urlInput.value.trim();
    if (!url) {
      prvctice.ui.toast({ message: "Enter a URL", type: "warning" });
      return;
    }
    var format = formatSelect.value;
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Downloading...";
    setStatus("DOWNLOADING", false);
    heroValue.textContent = "...";
    heroLabel.textContent = "PROCESSING";
    var downloadOpts = format === "audio" ? { format: "audio" } : {};
    prvctice.mediaTools.download(url, downloadOpts).then(function(result) {
      currentResult = result;
      heroValue.textContent = "\\u2713";
      heroValue.style.color = "var(--p-success)";
      heroLabel.textContent = "COMPLETE";
      titleValue.textContent = result.title || "Untitled";
      durationValue.textContent = result.duration ? formatDuration(result.duration) : "--";
      formatValue.textContent = result.format ? result.format.toUpperCase() : format === "audio" ? "MP3" : "MP4";
      sizeValue.textContent = result.size ? formatBytes(result.size) : "--";
      inputContainer.style.display = "none";
      detailsContainer.style.display = "";
      actionsContainer.style.display = "";
      setStatus("READY TO SAVE", true);
      downloadBtn.disabled = false;
      downloadBtn.textContent = "Download";
    }).catch(function(err) {
      heroValue.textContent = "\\u2717";
      heroValue.style.color = "var(--p-danger)";
      heroLabel.textContent = "FAILED";
      setStatus("ERROR", false);
      downloadBtn.disabled = false;
      downloadBtn.textContent = "Download";
      prvctice.ui.toast({ message: "Download failed. Check URL.", type: "danger" });
    });
  }
  function handleSave() {
    if (!currentResult || !currentResult.url) {
      prvctice.ui.toast({ message: "No file to save", type: "warning" });
      return;
    }
    var filename = currentResult.title || "download";
    var ext = currentResult.format || (formatSelect.value === "audio" ? "mp3" : "mp4");
    prvctice.media.saveUrl(currentResult.url, filename + "." + ext).then(function() {
      prvctice.ui.toast({ message: "Saved to device!", type: "success" });
      setStatus("SAVED", true);
    }).catch(function() {
      prvctice.ui.toast({ message: "Save failed", type: "danger" });
    });
  }
  downloadBtn.addEventListener("click", handleDownload);
  saveBtn.addEventListener("click", handleSave);
  newBtn.addEventListener("click", function() {
    heroValue.style.color = "var(--p-primary)";
    resetUI();
  });
  urlInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      handleDownload();
    }
  });
});
</script>
</html>`;
