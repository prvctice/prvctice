/**
 * Bookmarks HTML Build
 *
 * ES5-compatible bookmark manager with categories and search.
 * Loaded lazily by the bookmarks config via dynamic import.
 */

export const BOOKMARKS_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
.p-list-item { transition: background var(--p-duration-fast) var(--p-ease); }
.p-list-item:hover { background: var(--p-surface); border-radius: var(--p-radius-md); }
</style>
</head>
<body class="p-stack pad-2 full gap-1">
  <div id="mainContent" class="p-stack full gap-1">
    <div class="p-terminal-header">
      <span class="p-label-tech" id="appTitle">BOOKMARKS</span>
      <span id="bookmarkCount" class="p-label-tech text-muted">0 SAVED</span>
    </div>
    <div class="p-stack gap-1" style="flex-shrink:0">
      <div class="p-row gap-1" style="flex-wrap:wrap;align-items:center">
        <button id="addBtn" class="p-btn p-btn-ghost p-btn-sm font-mono" style="font-size:10px;padding:2px 8px;flex-shrink:0">+ ADD</button>
        <div id="catBar" class="p-row gap-1" style="flex-wrap:wrap"></div>
      </div>
      <div id="addForm" class="p-card-flat p-stack gap-1 pad-2" style="display:none">
        <input id="urlInput" class="p-input" placeholder="https://..." style="font-size:12px" />
        <input id="titleInput" class="p-input" placeholder="Title (optional)" style="font-size:12px" />
        <div class="p-row gap-1">
          <select id="catSelect" class="p-select flex-1" style="font-size:12px">
            <option value="General">General</option>
            <option value="Work">Work</option>
            <option value="Dev">Dev</option>
            <option value="Reading">Reading</option>
            <option value="Media">Media</option>
            <option value="Shopping">Shopping</option>
            <option value="Other">Other</option>
          </select>
          <button id="saveBtn" class="p-btn p-btn-primary p-btn-sm">SAVE</button>
          <button id="cancelBtn" class="p-btn p-btn-ghost p-btn-sm">\u2715</button>
        </div>
      </div>
    </div>
    <div class="p-scroll flex-1" id="listContainer">
      <div id="emptyMsg" class="p-center" style="padding:24px 0;display:none"><span class="p-empty-message text-muted">NO BOOKMARKS YET</span></div>
    </div>
    <div class="p-row gap-1" style="flex-shrink:0">
      <input id="searchInput" class="p-input flex-1" placeholder="Search bookmarks..." style="font-size:12px" />
    </div>
    <div class="p-split p-feed-meta" style="flex-shrink:0">
      <span class="p-label-tech" style="font-size:10px;opacity:0.7">BOOKMARKS</span><span id="footerStats" class="text-muted">0 items</span>
    </div>
  </div>
  <div id="errorState" class="p-center full-height" style="display:none">
    <div class="p-empty"><div class="p-empty-message" id="errorMsg">NO SIGNAL</div></div>
  </div>
</body>
<script>prvctice.onReady(function() {
  var bookmarks = [];
  var activeCategory = "All";
  var searchQuery = "";
  var listContainer = document.getElementById("listContainer");
  var searchInput = document.getElementById("searchInput");
  var addBtn = document.getElementById("addBtn");
  var addForm = document.getElementById("addForm");
  var urlInput = document.getElementById("urlInput");
  var titleInput = document.getElementById("titleInput");
  var catSelect = document.getElementById("catSelect");
  var saveBtn = document.getElementById("saveBtn");
  var cancelBtn = document.getElementById("cancelBtn");
  var catBar = document.getElementById("catBar");
  var bookmarkCount = document.getElementById("bookmarkCount");
  var footerStats = document.getElementById("footerStats");
  var emptyMsg = document.getElementById("emptyMsg");
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
  function genId() {
    return "bm_" + Date.now() + "_" + Math.floor(Math.random() * 9999);
  }
  function getCategories() {
    var cats = ["All"];
    var seen = {};
    for (var i = 0; i < bookmarks.length; i++) {
      var c = bookmarks[i].category || "General";
      if (!seen[c]) {
        seen[c] = true;
        cats.push(c);
      }
    }
    return cats;
  }
  function renderCatBar() {
    var cats = getCategories();
    catBar.innerHTML = "";
    for (var i = 0; i < cats.length; i++) {
      var btn = document.createElement("button");
      btn.className = "p-btn p-btn-ghost p-btn-sm font-mono";
      btn.style.fontSize = "10px";
      btn.style.padding = "2px 8px";
      btn.dataset.cat = cats[i];
      btn.textContent = cats[i].toUpperCase();
      if (cats[i] === activeCategory) {
        btn.style.borderColor = "var(--p-accent-blue)";
        btn.style.color = "var(--p-text)";
      }
      catBar.appendChild(btn);
    }
  }
  function getDomain(url) {
    try {
      var a = document.createElement("a");
      a.href = url;
      return a.hostname || url;
    } catch (e) {
      return url;
    }
  }
  function getCatColor(cat) {
    var map = {
      "Work": "var(--p-accent-blue)",
      "Dev": "var(--p-accent-amber)",
      "Reading": "var(--p-accent-green)",
      "Media": "var(--p-accent-purple)",
      "Shopping": "var(--p-warning)",
      "General": "var(--p-text-muted)",
      "Other": "var(--p-text-muted)"
    };
    return map[cat] || "var(--p-text-muted)";
  }
  function getFilteredBookmarks() {
    var q = searchQuery.toLowerCase();
    return bookmarks.filter(function(bm) {
      var catMatch = activeCategory === "All" || bm.category === activeCategory;
      var searchMatch = !q || bm.title && bm.title.toLowerCase().indexOf(q) !== -1 || bm.url && bm.url.toLowerCase().indexOf(q) !== -1 || bm.category && bm.category.toLowerCase().indexOf(q) !== -1;
      return catMatch && searchMatch;
    });
  }
  function renderList() {
    var items = listContainer.querySelectorAll(".p-list-item");
    for (var i = 0; i < items.length; i++) {
      items[i].parentNode.removeChild(items[i]);
    }
    var filtered = getFilteredBookmarks();
    if (filtered.length === 0) {
      emptyMsg.style.display = "";
    } else {
      emptyMsg.style.display = "none";
    }
    for (var j = 0; j < filtered.length; j++) {
      var bm = filtered[j];
      var item = document.createElement("div");
      item.className = "p-list-item";
      item.style.cursor = "pointer";
      item.dataset.action = "open";
      item.dataset.id = bm.id;
      var content = document.createElement("div");
      content.className = "p-list-item-content";
      content.style.minWidth = "0";
      var titleRow = document.createElement("div");
      titleRow.className = "p-row gap-1";
      titleRow.style.alignItems = "center";
      var dot = document.createElement("span");
      dot.style.width = "6px";
      dot.style.height = "6px";
      dot.style.borderRadius = "var(--p-radius-pill)";
      dot.style.background = getCatColor(bm.category);
      dot.style.flexShrink = "0";
      dot.style.display = "inline-block";
      var titleEl = document.createElement("div");
      titleEl.className = "p-list-item-title p-text-clamp-1";
      titleEl.textContent = bm.title || getDomain(bm.url);
      titleRow.appendChild(dot);
      titleRow.appendChild(titleEl);
      var sub = document.createElement("div");
      sub.className = "p-list-item-subtitle text-muted p-text-clamp-1";
      sub.style.fontSize = "10px";
      sub.textContent = getDomain(bm.url);
      content.appendChild(titleRow);
      content.appendChild(sub);
      var action = document.createElement("div");
      action.className = "p-list-item-action p-row gap-1";
      action.style.flexShrink = "0";
      var catBadge = document.createElement("span");
      catBadge.className = "p-label-tech";
      catBadge.style.fontSize = "9px";
      catBadge.style.color = getCatColor(bm.category);
      catBadge.textContent = (bm.category || "General").toUpperCase();
      var delBtn = document.createElement("button");
      delBtn.className = "p-btn p-btn-ghost p-btn-sm";
      delBtn.style.fontSize = "11px";
      delBtn.style.padding = "2px 6px";
      delBtn.style.color = "var(--p-danger)";
      delBtn.dataset.action = "delete";
      delBtn.dataset.id = bm.id;
      delBtn.textContent = "\\u2715";
      action.appendChild(catBadge);
      action.appendChild(delBtn);
      item.appendChild(content);
      item.appendChild(action);
      listContainer.appendChild(item);
    }
    var total = bookmarks.length;
    bookmarkCount.textContent = total + " SAVED";
    footerStats.textContent = filtered.length + " of " + total + " items";
    renderCatBar();
  }
  function saveToStorage() {
    prvctice.storage.set("bookmarks_v2", bookmarks).catch(function(e) {
      prvctice.ui.toast({ message: "Save failed", type: "error", duration: 2e3 });
    });
  }
  function addBookmark() {
    var url = urlInput.value.trim();
    if (!url) {
      prvctice.ui.toast({ message: "Please enter a URL", type: "error", duration: 2e3 });
      return;
    }
    if (url.indexOf("://") === -1) {
      url = "https://" + url;
    }
    var title = titleInput.value.trim() || "";
    var cat = catSelect.value || "General";
    var bm = { id: genId(), url: url, title: title, category: cat, added: Date.now() };
    bookmarks.unshift(bm);
    saveToStorage();
    renderList();
    urlInput.value = "";
    titleInput.value = "";
    addForm.style.display = "none";
    addBtn.textContent = "+ ADD";
    prvctice.ui.toast({ message: "Bookmark saved!", type: "success", duration: 1800 });
  }
  addBtn.addEventListener("click", function() {
    if (addForm.style.display === "none") {
      addForm.style.display = "";
      urlInput.focus();
      addBtn.textContent = "\\u2191 HIDE";
    } else {
      addForm.style.display = "none";
      addBtn.textContent = "+ ADD";
    }
  });
  cancelBtn.addEventListener("click", function() {
    addForm.style.display = "none";
    addBtn.textContent = "+ ADD";
    urlInput.value = "";
    titleInput.value = "";
  });
  saveBtn.addEventListener("click", addBookmark);
  urlInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      titleInput.focus();
    }
  });
  titleInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      addBookmark();
    }
  });
  searchInput.addEventListener("input", function() {
    searchQuery = searchInput.value;
    renderList();
  });
  catBar.addEventListener("click", function(e) {
    var btn = e.target.closest("[data-cat]");
    if (!btn) return;
    activeCategory = btn.dataset.cat;
    renderList();
  });
  listContainer.addEventListener("click", function(e) {
    var delBtn = e.target.closest('[data-action="delete"]');
    if (delBtn) {
      e.stopPropagation();
      var id = delBtn.dataset.id;
      prvctice.ui.confirm({
        title: "Delete Bookmark",
        message: "Remove this bookmark?",
        confirmLabel: "DELETE",
        cancelLabel: "CANCEL"
      }).then(function(confirmed) {
        if (!confirmed) return;
        bookmarks = bookmarks.filter(function(b) {
          return b.id !== id;
        });
        saveToStorage();
        renderList();
      }).catch(function() {});
      return;
    }
    var item = e.target.closest('[data-action="open"]');
    if (item) {
      var id2 = item.dataset.id;
      for (var i = 0; i < bookmarks.length; i++) {
        if (bookmarks[i].id === id2) {
          prvctice.openUrl(bookmarks[i].url);
          break;
        }
      }
    }
  });
  prvctice.storage.get("bookmarks_v2").then(function(data) {
    if (Array.isArray(data)) {
      bookmarks = data;
    }
    showContent();
    renderList();
  }).catch(function() {
    showContent();
    renderList();
  });
});
<` + `/script>
<` + `/html>`;
