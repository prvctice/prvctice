/**
 * News Feed HTML Build
 *
 * Live headlines by topic with tab navigation and article detail view.
 * Loaded lazily by the news-feed config via dynamic import.
 */

export const NEWS_HTML =
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
/* News feed -- uses UIKit terminal components */
.p-list-item { padding: var(--p-2) var(--p-3); }
.p-list-item-title { font-size: var(--p-text-sm); font-weight: var(--p-weight-regular); }
.p-list-item-subtitle { font-size: 10px; font-family: var(--p-font-mono); letter-spacing: 0.04em; }
#listContainer { border: 1px solid rgba(68, 136, 255, 0.08); border-radius: var(--p-radius-sm); }
</style>
</head>
<body class="p-stack pad-2 full gap-1">
  <div id="mainContent" class="p-stack full gap-1">
    <div class="p-terminal-header">
      <span class="p-label-tech">HEADLINES</span>
      <span id="status" class="p-status-live">LIVE</span>
    </div>
    <div id="tabBar" class="p-tab-bar"></div>
    <div class="p-scroll flex-1" id="listContainer">
      <div class="p-stack gap-1" id="newsList"><div class="p-skeleton" style="height:48px"></div><div class="p-skeleton" style="height:48px"></div><div class="p-skeleton" style="height:48px"></div><div class="p-skeleton" style="height:48px"></div></div>
    </div>
  </div>
  <div id="errorState" class="p-center full-height" style="display:none">
    <div class="p-empty"><div class="p-empty-message" id="errorMsg">NO SIGNAL</div></div>
  </div>
</body>
<script>prvctice.onReady(function() {
  var currentTopic = "general";
  var articles = [];
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
  function formatTime(dateStr) {
    var date = new Date(dateStr);
    var now = new Date();
    var diff = now - date;
    var minutes = Math.floor(diff / 6e4);
    var hours = Math.floor(minutes / 60);
    var days = Math.floor(hours / 24);
    if (minutes < 1) return "JUST NOW";
    if (minutes < 60) return minutes + "M AGO";
    if (hours < 24) return hours + "H AGO";
    return days + "D AGO";
  }
  function renderArticles(items) {
    var list = document.getElementById("newsList");
    if (!list) return;
    list.innerHTML = "";
    if (!items || items.length === 0) {
      list.innerHTML = '<div class="p-empty"><div class="p-empty-message">NO ARTICLES</div></div>';
      return;
    }
    articles = items;
    for (var i2 = 0; i2 < items.length; i2++) {
      var article = items[i2];
      var item = document.createElement("div");
      item.className = "p-list-item";
      item.setAttribute("data-index", i2);
      item.style.cursor = "pointer";
      var content = document.createElement("div");
      content.className = "p-list-item-content";
      var title = document.createElement("div");
      title.className = "p-list-item-title p-text-clamp-2";
      title.textContent = article.title || "Untitled";
      var meta = document.createElement("div");
      meta.className = "p-list-item-subtitle text-muted";
      var source = article.source || "Unknown";
      var time = article.pubDate ? formatTime(article.pubDate) : "";
      meta.innerHTML = source + (time ? ' \\u2022 <span class="p-feed-time">' + time + '</span>' : '');
      content.appendChild(title);
      content.appendChild(meta);
      item.appendChild(content);
      list.appendChild(item);
    }
    prvctice.ui.animateEntrance(list, { stagger: true });
  }
  function fetchNews() {
    var status = document.getElementById("status");
    if (status) status.textContent = 'UPDATING';
    prvctice.news.headlines(currentTopic, 20).then(function(response) {
      showContent();
      renderArticles(response.items);
      if (status) status.textContent = 'LIVE';
    }).catch(function(err) {
      showError("FEED UNAVAILABLE");
    });
  }
  function expandArticle(index) {
    var article = articles[index];
    if (!article) return;
    var modal = document.createElement("div");
    modal.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:var(--p-bg);z-index:1000;overflow:auto;padding:var(--p-4)";
    var header = document.createElement("div");
    header.className = "p-split gap-2";
    header.style.marginBottom = "var(--p-3)";
    var back = document.createElement("button");
    back.className = "p-btn p-btn-ghost p-btn-sm";
    back.textContent = "\\u2190 Back";
    back.onclick = function() {
      document.body.removeChild(modal);
    };
    var open = document.createElement("button");
    open.className = "p-btn p-btn-ghost p-btn-sm";
    open.textContent = "Open \\u2197";
    open.onclick = function() {
      prvctice.openUrl(article.link);
    };
    header.appendChild(back);
    header.appendChild(open);
    var title = document.createElement("h1");
    title.className = "text-lg font-bold";
    title.style.marginBottom = "var(--p-2)";
    title.textContent = article.title;
    var meta = document.createElement("div");
    meta.className = "text-xs text-muted font-mono";
    meta.style.marginBottom = "var(--p-3)";
    meta.textContent = (article.source || "Unknown") + " \\u2022 " + (article.pubDate ? formatTime(article.pubDate) : "");
    var content = document.createElement("div");
    content.className = "text-sm";
    content.style.lineHeight = "1.6";
    content.textContent = article.content || "No content available.";
    modal.appendChild(header);
    modal.appendChild(title);
    modal.appendChild(meta);
    modal.appendChild(content);
    document.body.appendChild(modal);
  }
  var container = document.getElementById("listContainer");
  if (container) {
    container.addEventListener("click", function(e) {
      var item = e.target.closest("[data-index]");
      if (item) {
        var index = parseInt(item.getAttribute("data-index"), 10);
        expandArticle(index);
      }
    });
  }
  var tabBar = document.getElementById("tabBar");
  var topics = ["general", "technology", "business", "sports", "entertainment"];
  var tabButtons = [];
  for (var i = 0; i < topics.length; i++) {
    var btn = document.createElement("button");
    btn.className = "p-tab";
    btn.textContent = topics[i].toUpperCase();
    btn.setAttribute("data-topic", topics[i]);
    if (topics[i] === currentTopic) btn.classList.add("active");
    tabBar.appendChild(btn);
    tabButtons.push(btn);
  }
  tabBar.addEventListener("click", function(e) {
    var btn2 = e.target.closest("[data-topic]");
    if (btn2) {
      var topic = btn2.getAttribute("data-topic");
      currentTopic = topic;
      for (var i2 = 0; i2 < tabButtons.length; i2++) {
        tabButtons[i2].classList.toggle("active", tabButtons[i2].getAttribute("data-topic") === topic);
      }
      fetchNews();
    }
  });
  fetchNews();
  prvctice.refresh.onRefresh(fetchNews);
  prvctice.refresh.start(3e5);
});
<` +
  `/script>
</html>`;
