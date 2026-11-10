(function () {
  const data = JSON.parse(document.getElementById("guide-data").textContent);
  const sourcesById = Object.fromEntries((window.GUIDE_SOURCES || []).map((s) => [s.id, s]));
  const cats = Object.fromEntries(data.categories.map((c) => [c.id, c]));
  const classes = Object.fromEntries(data.species_classes.map((c) => [c.id, c]));
  const confirmLabels = data.confirmation_labels;
  const monsters = data.monsters.slice().sort((a, b) => a.sort - b.sort);

  const els = {
    search: document.getElementById("search"),
    filters: document.getElementById("filters"),
    count: document.getElementById("count"),
    grid: document.getElementById("grid"),
    elders: document.getElementById("elder-grid"),
    empty: document.getElementById("empty"),
    modal: document.getElementById("modal"),
    dialog: document.getElementById("dialog"),
  };

  let filter = "all";
  let query = "";
  let lastFocus = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function pair(en, zh, extraZhClass) {
    const zhClass = extraZhClass ? "zh " + extraZhClass : "zh";
    return `<span class="pair"><span class="en">${esc(en)}</span><span class="${zhClass}" lang="zh-Hant">${esc(zh)}</span></span>`;
  }
  function icon(id) {
    return `<svg class="ico" aria-hidden="true"><use href="icons.svg#${esc(id)}"></use></svg>`;
  }
  const CAT_ICON = { all: "all", "elder-dragon": "elder", radiant: "radiant", standard: "standard", subspecies: "subspecies" };
  function catLabel(id) { return cats[id] || { en: id, zh: id }; }
  function classLabel(id) { return classes[id] || { en: id, zh: id }; }
  function confLabel(id) { return confirmLabels[id] || { en: id, zh: id }; }
  function nameStatusOfficial(m) {
    return m.name_zh_status === "official_outlanders" || m.name_zh_status === "official_outlanders_and_series";
  }

  function sourceItems(ids) {
    return (ids || []).map((id) => {
      const s = sourcesById[id];
      if (!s) return `<li>${esc(id)}</li>`;
      const date = s.date ? ` (${esc(s.date)})` : "";
      const title = s.title || {};
      return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${pair(title.en || s.url, title.zh || title.en || s.url)}</a>${date}</li>`;
    }).join("");
  }

  function art(src, alt, eager) {
    const load = eager ? `fetchpriority="high"` : `loading="lazy"`;
    return `<div class="frame-art"><img src="${esc(src)}" alt="${esc(alt)}" width="1280" height="720" decoding="async" ${load}></div>`;
  }

  function matches(m) {
    if (filter !== "all" && m.category !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const cat = catLabel(m.category);
    const cls = classLabel(m.species_class);
    const blob = [
      m.name.en, m.name.zh, m.id, m.category, m.species_class, m.form,
      cat.en, cat.zh, cls.en, cls.zh,
      m.description.en, m.description.zh,
    ].join(" ").toLowerCase();
    return blob.includes(q);
  }

  function badgeClass(c) {
    if (c === "official_upcoming") return "badge upcoming";
    if (c === "official_prelaunch") return "badge prelaunch";
    return "badge";
  }

  function cardButton(m, variant) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = variant === "elder" ? "elder-card" : "card";
    btn.dataset.id = m.id;
    btn.setAttribute("aria-haspopup", "dialog");
    const cat = catLabel(m.category);
    const cls = classLabel(m.species_class);
    const conf = confLabel(m.confirmation);
    const alt = m.name.en + " / " + m.name.zh;
    const sameClass = cat.en === cls.en && cat.zh === cls.zh;
    btn.innerHTML = `
      ${art(m.images.hero, alt, variant === "elder")}
      <div class="card-body">
        <p class="card-cat"><span class="with-icon">${icon(CAT_ICON[m.category] || "standard")}${pair(cat.en, cat.zh)}</span>${sameClass ? "" : pair(cls.en, cls.zh)}</p>
        <h3 class="card-name-en">${esc(m.name.en)}</h3>
        <p class="card-name-zh" lang="zh-Hant">${esc(m.name.zh)}</p>
        <div class="badge-row"><span class="${badgeClass(m.confirmation)}">${pair(conf.en, conf.zh)}</span></div>
      </div>`;
    btn.addEventListener("click", () => openModal(m.id));
    return btn;
  }

  function renderElders() {
    els.elders.innerHTML = "";
    monsters.filter((m) => m.category === "elder-dragon").forEach((m) => {
      els.elders.appendChild(cardButton(m, "elder"));
    });
  }

  function renderFilters() {
    els.filters.innerHTML = "";
    data.categories.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "filter-btn";
      b.setAttribute("aria-pressed", filter === c.id ? "true" : "false");
      b.innerHTML = icon(CAT_ICON[c.id] || "all") + pair(c.en, c.zh);
      b.addEventListener("click", () => {
        filter = c.id;
        renderFilters();
        renderGrid();
      });
      els.filters.appendChild(b);
    });
  }

  function renderGrid() {
    const list = monsters.filter(matches);
    els.grid.innerHTML = "";
    list.forEach((m) => els.grid.appendChild(cardButton(m, "card")));
    els.count.innerHTML = pair(list.length + " / " + monsters.length, list.length + "／" + monsters.length);
    els.empty.classList.toggle("show", list.length === 0);
    els.empty.innerHTML = pair("No match.", "沒有符合的魔物。");
  }

  function openModal(id) {
    const m = monsters.find((x) => x.id === id);
    if (!m) return;
    lastFocus = document.activeElement;
    els.modal.hidden = false;
    els.modal.dataset.open = id;
    document.body.style.overflow = "hidden";
    const conf = confLabel(m.confirmation);
    const cat = catLabel(m.category);
    const cls = classLabel(m.species_class);
    els.dialog.innerHTML = `
      <div class="dialog-bar">
        <button class="close" type="button" id="close-modal" aria-label="Close, 關閉">×</button>
      </div>
      ${art(m.images.hero, m.name.en + " / " + m.name.zh, true)}
      <div class="dialog-body">
        <div class="badge-row"><span class="${badgeClass(m.confirmation)}">${pair(conf.en, conf.zh)}</span></div>
        <h2 id="dialog-title">${esc(m.name.en)}</h2>
        <p class="subnames" lang="zh-Hant">${esc(m.name.zh)}</p>
        <div class="chips"><span class="chip with-icon">${icon(CAT_ICON[m.category] || "standard")}${pair(cat.en, cat.zh)}</span>${cat.en === cls.en && cat.zh === cls.zh ? "" : `<span class="chip">${pair(cls.en, cls.zh)}</span>`}</div>
        <p class="desc en">${esc(m.description.en)}</p>
        <p class="desc zh" lang="zh-Hant">${esc(m.description.zh)}</p>
      </div>`;
    els.dialog.setAttribute("aria-labelledby", "dialog-title");
    const closeBtn = document.getElementById("close-modal");
    closeBtn.addEventListener("click", closeModal);
    closeBtn.focus();
  }

  function closeModal() {
    els.modal.hidden = true;
    delete els.modal.dataset.open;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  renderFilters();
  renderElders();
  renderGrid();

  els.search.addEventListener("input", () => {
    query = els.search.value;
    renderGrid();
  });
  document.getElementById("backdrop").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.modal.hidden) {
      e.preventDefault();
      closeModal();
    } else if (e.key === "/" && document.activeElement !== els.search && els.modal.hidden) {
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      els.search.focus();
    }
    if (e.key === "Tab" && !els.modal.hidden) {
      const f = els.dialog.querySelectorAll("a,button");
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  });
})();
