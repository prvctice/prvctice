/**
 * Chat Translator Pro -- text and chat translation builtin app.
 * Text mode with language swap, chat mode with conversation history.
 * Uses prvctice.ai.complete for translations.
 * ES5-compatible JavaScript (runs inside sandboxed iframe).
 */

export const TRANSLATOR_HTML =
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body class="p-stack pad-2 full gap-2">
  <div id="mainContent" class="p-stack full gap-2">
    <div class="p-terminal-header">
      <span class="p-label-tech">TRANSLATOR</span>
      <span id="modeLabel" class="p-label-tech" style="color:var(--p-text-muted)">TEXT MODE</span>
    </div>
    <div class="p-stack gap-1" id="inputSection">
      <div class="p-tab-bar" id="modeTabs"></div><div id="textMode" class="p-stack gap-2"><div class="p-row gap-2"><select class="p-select flex-1" id="sourceLang"><option value="auto">Auto-detect</option><option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option><option value="it">Italian</option><option value="pt">Portuguese</option><option value="ru">Russian</option><option value="zh">Chinese</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="ar">Arabic</option><option value="hi">Hindi</option></select><button class="p-btn p-btn-ghost" id="swapBtn" title="Swap languages"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5h10M10 2l3 3-3 3M13 11H3M6 8l-3 3 3 3"/></svg></button><select class="p-select flex-1" id="targetLang"><option value="es">Spanish</option><option value="en">English</option><option value="fr">French</option><option value="de">German</option><option value="it">Italian</option><option value="pt">Portuguese</option><option value="ru">Russian</option><option value="zh">Chinese</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="ar">Arabic</option><option value="hi">Hindi</option></select></div><textarea class="p-input" id="sourceText" placeholder="Enter text to translate..." rows="4" style="resize:none"></textarea><div class="p-card-instrument p-stack gap-1"><div class="p-label-tech">TRANSLATION</div><div id="translatedText" class="text-sm" style="min-height:60px;white-space:pre-wrap">Translation will appear here...</div></div></div><div id="chatMode" class="p-stack gap-2 full-height" style="display:none"><div class="p-row gap-2"><select class="p-select flex-1" id="chatLang1"><option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option><option value="it">Italian</option><option value="pt">Portuguese</option><option value="ru">Russian</option><option value="zh">Chinese</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="ar">Arabic</option><option value="hi">Hindi</option></select><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="flex-shrink:0"><path d="M3 5h10M10 2l3 3-3 3M13 11H3M6 8l-3 3 3 3"/></svg><select class="p-select flex-1" id="chatLang2"><option value="es">Spanish</option><option value="en">English</option><option value="fr">French</option><option value="de">German</option><option value="it">Italian</option><option value="pt">Portuguese</option><option value="ru">Russian</option><option value="zh">Chinese</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="ar">Arabic</option><option value="hi">Hindi</option></select></div><div id="chatMessages" class="p-scroll flex-1" style="max-height:220px"></div><div class="p-row gap-2"><input class="p-input flex-1" id="chatInput" placeholder="Type message..." /><button class="p-btn p-btn-primary" id="sendBtn">Send</button></div></div>
    </div>
    <div class="p-row gap-2" id="actionButtons">
      <button class="p-btn p-btn-primary flex-1" id="translateBtn">Translate</button><button class="p-btn p-btn-ghost flex-1" id="clearBtn">Clear</button>
    </div>
    <div id="resultDisplay">
      <div id="statsRow" class="p-row gap-2 p-feed-meta" style="display:none"><div class="p-split flex-1"><span class="p-label-tech">CHARS</span><span id="charCount" class="font-mono">0</span></div><div class="p-split flex-1"><span class="p-label-tech">WORDS</span><span id="wordCount" class="font-mono">0</span></div></div>
    </div>
  </div>
  <div id="errorState" class="p-center full-height" style="display:none">
    <div class="p-empty"><div class="p-empty-message" id="errorMsg">NO SIGNAL</div></div>
  </div>
</body>
<script>prvctice.onReady(function() {
  var currentMode = "text";
  var chatHistory = [];
  function showError(msg) {
    var main = document.getElementById("mainContent");
    var err = document.getElementById("errorState");
    var errMsg = document.getElementById("errorMsg");
    if (main) main.style.display = "none";
    if (err) err.style.display = "";
    if (errMsg) errMsg.textContent = msg || "NO SIGNAL";
  }
  function showContent() {
    var main = document.getElementById("mainContent");
    var err = document.getElementById("errorState");
    if (main) main.style.display = "";
    if (err) err.style.display = "none";
  }
  function updateStats(text) {
    var chars = text.length;
    var words = text.trim() ? text.trim().split(/\\s+/).length : 0;
    document.getElementById("charCount").textContent = chars;
    document.getElementById("wordCount").textContent = words;
    document.getElementById("statsRow").style.display = chars > 0 ? "" : "none";
  }
  function translateText(text, sourceLang2, targetLang2, callback) {
    if (!text.trim()) {
      callback("Please enter text to translate");
      return;
    }
    var prompt = "Translate the following text from " + (sourceLang2 === "auto" ? "auto-detected language" : sourceLang2) + " to " + targetLang2 + ". Only return the translation, no explanations:\\n\\n" + text;
    prvctice.ai.complete(prompt).then(function(response) {
      callback(null, response.text.trim());
    }).catch(function(err) {
      callback("Translation failed");
    });
  }
  function switchMode(mode) {
    currentMode = mode;
    var modeLabel = document.getElementById("modeLabel");
    if (modeLabel) modeLabel.textContent = mode === "text" ? "TEXT MODE" : "CHAT MODE";
    var textMode = document.getElementById("textMode");
    var chatMode = document.getElementById("chatMode");
    var actionBtns = document.getElementById("actionButtons");
    var resultDisplay = document.getElementById("resultDisplay");
    if (mode === "text") {
      textMode.style.display = "";
      chatMode.style.display = "none";
      actionBtns.style.display = "";
      resultDisplay.style.display = "";
    } else {
      textMode.style.display = "none";
      chatMode.style.display = "";
      actionBtns.style.display = "none";
      resultDisplay.style.display = "none";
    }
  }
  function addChatMessage(text, lang, isUser) {
    var container = document.getElementById("chatMessages");
    var msg = document.createElement("div");
    msg.className = "p-stack gap-1 pad-2";
    msg.style.background = isUser ? "var(--p-surface)" : "transparent";
    msg.style.borderRadius = "var(--p-radius-md)";
    msg.style.marginBottom = "var(--p-2)";
    var header = document.createElement("div");
    header.className = "p-split text-xs font-mono";
    header.innerHTML = '<span class="p-label-tech">' + lang.toUpperCase() + '</span><span class="p-feed-time">' + new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) + "</span>";
    var content = document.createElement("div");
    content.className = "text-sm";
    content.textContent = text;
    msg.appendChild(header);
    msg.appendChild(content);
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }
  function sendChatMessage() {
    var input = document.getElementById("chatInput");
    var text = input.value.trim();
    if (!text) return;
    var lang1 = document.getElementById("chatLang1").value;
    var lang2 = document.getElementById("chatLang2").value;
    addChatMessage(text, lang1, true);
    chatHistory.push({ text, lang: lang1, timestamp: Date.now() });
    input.value = "";
    translateText(text, lang1, lang2, function(err, translated) {
      if (err) {
        addChatMessage("Translation error", lang2, false);
      } else {
        addChatMessage(translated, lang2, false);
        chatHistory.push({ text: translated, lang: lang2, timestamp: Date.now() });
      }
      prvctice.storage.set("chatHistory", chatHistory).catch(function() {
      });
    });
  }
  function loadChatHistory() {
    prvctice.storage.get("chatHistory").then(function(data) {
      if (data && data.length > 0) {
        chatHistory = data;
        var container = document.getElementById("chatMessages");
        container.innerHTML = "";
        for (var i = 0; i < data.length; i++) {
          var msg = data[i];
          addChatMessage(msg.text, msg.lang, i % 2 === 0);
        }
      }
    }).catch(function() {
    });
  }
  prvctice.ui.tabs(document.getElementById("modeTabs"), {
    tabs: [{ id: "text", label: "Text" }, { id: "chat", label: "Chat" }],
    active: "text",
    onChange: function(id) {
      switchMode(id);
    }
  });
  var sourceText = document.getElementById("sourceText");
  var translatedText = document.getElementById("translatedText");
  var translateBtn = document.getElementById("translateBtn");
  var clearBtn = document.getElementById("clearBtn");
  var swapBtn = document.getElementById("swapBtn");
  var sourceLang = document.getElementById("sourceLang");
  var targetLang = document.getElementById("targetLang");
  var chatInput = document.getElementById("chatInput");
  var sendBtn = document.getElementById("sendBtn");
  sourceText.addEventListener("input", function() {
    updateStats(sourceText.value);
  });
  translateBtn.addEventListener("click", function() {
    var text = sourceText.value.trim();
    if (!text) {
      prvctice.ui.toast({ message: "Enter text first", type: "warning" });
      return;
    }
    translateBtn.disabled = true;
    translateBtn.textContent = "Translating...";
    translatedText.textContent = "Translating...";
    translateText(text, sourceLang.value, targetLang.value, function(err, result) {
      translateBtn.disabled = false;
      translateBtn.textContent = "Translate";
      if (err) {
        translatedText.textContent = err;
        prvctice.ui.toast({ message: err, type: "danger" });
      } else {
        translatedText.textContent = result;
      }
    });
  });
  clearBtn.addEventListener("click", function() {
    sourceText.value = "";
    translatedText.textContent = "Translation will appear here...";
    updateStats("");
  });
  swapBtn.addEventListener("click", function() {
    if (sourceLang.value === "auto") {
      prvctice.ui.toast({ message: "Cannot swap with auto-detect", type: "warning" });
      return;
    }
    var temp = sourceLang.value;
    sourceLang.value = targetLang.value;
    targetLang.value = temp;
    var tempText = sourceText.value;
    sourceText.value = translatedText.textContent === "Translation will appear here..." ? "" : translatedText.textContent;
    translatedText.textContent = tempText || "Translation will appear here...";
    updateStats(sourceText.value);
  });
  sendBtn.addEventListener("click", sendChatMessage);
  chatInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChatMessage();
    }
  });
  loadChatHistory();
  showContent();
});
<` +
  `/script>
</html>`;
