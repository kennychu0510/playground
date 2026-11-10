(function () {
  const data = JSON.parse(document.getElementById("guide-data").textContent);
  const sections = JSON.parse(document.getElementById("guide-sections").textContent);
  const sourcesById = Object.fromEntries((window.GUIDE_SOURCES || []).map((s) => [s.id, s]));
  const cats = Object.fromEntries(data.categories.map((c) => [c.id, c]));
  const classes = Object.fromEntries(data.species_classes.map((c) => [c.id, c]));
  const confirmLabels = data.confirmation_labels;
  const monsters = data.monsters.slice().sort((a, b) => a.sort - b.sort);
  const peopleById = {};
  sections.sections.forEach((section) => {
    (section.groups || []).forEach((group) => {
      (group.items || []).forEach((item) => { peopleById[item.id] = item; });
    });
  });

  const els = {
    search: document.getElementById("search"),
    filters: document.getElementById("filters"),
    count: document.getElementById("count"),
    grid: document.getElementById("grid"),
    elders: document.getElementById("elder-grid"),
    empty: document.getElementById("empty"),
    modal: document.getElementById("modal"),
    dialog: document.getElementById("dialog"),
    more: document.getElementById("more"),
    sources: document.getElementById("source-list"),
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
    const prov = nameStatusOfficial(m) ? "" : `<span class="provisional">name note / 譯名見備註</span>`;
    btn.innerHTML = `
      ${art(m.images.hero, alt, variant === "elder")}
      <div class="card-body">
        <p class="card-cat">${pair(cat.en, cat.zh)}${sameClass ? "" : pair(cls.en, cls.zh)} ${prov}</p>
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
      b.innerHTML = pair(c.en, c.zh);
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
    els.count.innerHTML = pair(
      list.length + " of " + monsters.length + " monsters",
      "顯示 " + list.length + "／" + monsters.length + " 種魔物"
    );
    els.empty.classList.toggle("show", list.length === 0);
    els.empty.innerHTML = pair("No monsters match that search or filter.", "沒有符合此搜尋或篩選的魔物。");
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
    const descFlag = m.description_zh_status === "official_outlanders"
      ? ""
      : `<p class="flag">${pair("Traditional Chinese description is a provisional translation of the official English text.", "繁體中文簡介是官方英文的臨時翻譯，不是官方中文原文。")}</p>`;
    const nameFlag = nameStatusOfficial(m)
      ? (m.name_zh_note ? `<p class="notes">${esc(m.name_zh_note)}</p>` : "")
      : `<p class="flag">${pair("Traditional Chinese name is provisional or assembled as noted.", "繁體中文名稱是臨時或組合譯名，說明如下。")} ${esc(m.name_zh_note || "")}</p>`;
    const notes = (m.notes && (m.notes.en || m.notes.zh))
      ? `<h3>${pair("Notes", "備註")}</h3><p class="notes en">${esc(m.notes.en || "")}</p><p class="notes zh" lang="zh-Hant">${esc(m.notes.zh || "")}</p>`
      : "";
    els.dialog.innerHTML = `
      <div class="dialog-bar">
        <button class="close" type="button" id="close-modal" aria-label="Close, 關閉">×</button>
      </div>
      ${art(m.images.hero, m.name.en + " / " + m.name.zh, true)}
      <div class="dialog-body">
        <div class="badge-row"><span class="${badgeClass(m.confirmation)}">${pair(conf.en, conf.zh)}</span></div>
        <h2 id="dialog-title">${esc(m.name.en)}</h2>
        <p class="subnames" lang="zh-Hant">${esc(m.name.zh)}</p>
        <div class="chips"><span class="chip">${pair(cat.en, cat.zh)}</span>${cat.en === cls.en && cat.zh === cls.zh ? "" : `<span class="chip">${pair(cls.en, cls.zh)}</span>`}</div>
        ${nameFlag}
        <h3>${pair("Description", "簡介")}</h3>
        <p class="desc en">${esc(m.description.en)}</p>
        <p class="desc zh" lang="zh-Hant">${esc(m.description.zh)}</p>
        ${descFlag}
        ${notes}
        <div class="cite"><h3>${pair("Citations", "出處")}</h3><ul>${sourceItems(m.sources)}</ul></div>
        <p class="notes">${pair(
          "Official artwork. ©CAPCOM / ©2026 Proxima Beta Pte. Ltd. Used here in an unofficial fan guide.",
          "官方美術。©CAPCOM／©2026 Proxima Beta Pte. Ltd. 僅用於非官方粉絲手冊。"
        )}</p>
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

  function textBlock(block) {
    const editorial = block.editorial ? " editorial" : "";
    const paras = (block.paragraphs || []).map((p) => {
      const flag = p.zh_status === "provisional_translation"
        ? `<p class="flag">${pair("Traditional Chinese in this paragraph is a provisional translation where the cited page is English.", "若引用頁是英文，本段繁體中文是臨時翻譯。")}</p>`
        : "";
      return `<p class="en">${esc(p.en)}</p><p class="zh" lang="zh-Hant">${esc(p.zh)}</p>${flag}`;
    }).join("");
    const label = block.editorial
      ? `<p class="flag">${pair("Editorial note. This is not an official instruction and adds no unpublished game facts.", "編輯說明。這不是官方指示，也不補充未公布的遊戲事實。")}</p>`
      : "";
    return `<div class="block${editorial}"><h3>${pair(block.title.en, block.title.zh)}</h3>${label}<div class="prose">${paras}</div></div>`;
  }

  function personCard(item) {
    const article = document.createElement("article");
    article.className = "person";
    article.id = "person-" + item.id;
    const nameZhClass = item.name_zh_status === "official_tc_absent" ? "caveat-name" : "";
    const chips = (item.chips || []).map((c) => {
      const zhClass = c.zh_status === "official_tc_absent" ? "caveat-name" : "";
      return `<span class="chip">${pair(c.en, c.zh, zhClass)}</span>`;
    }).join("");
    const descFlag = item.description_zh_status === "provisional_translation"
      ? `<p class="flag">${pair("Traditional Chinese description is a provisional translation.", "繁體中文簡介是臨時翻譯。")}</p>`
      : "";
    const note = item.note ? `<p class="notes en">${esc(item.note.en)}</p><p class="notes zh" lang="zh-Hant">${esc(item.note.zh)}</p>` : "";
    const links = (item.links || []).map((id) => {
      const person = peopleById[id];
      const label = person ? person.name.en : id;
      return `<a href="#person-${esc(id)}">${esc(label)}</a>`;
    }).join(" · ");
    const linkRow = links ? `<p class="notes">${pair("Featured with", "對應介紹")} ${links}</p>` : "";
    article.innerHTML = `
      <div class="person-body">
        <h3 class="person-name">${esc(item.name.en)}</h3>
        <p class="card-name-zh ${nameZhClass}" lang="zh-Hant">${esc(item.name.zh)}</p>
        <div class="chips">${chips}</div>
        <p class="desc en">${esc(item.description.en)}</p>
        <p class="desc zh" lang="zh-Hant">${esc(item.description.zh)}</p>
        ${descFlag}
        ${note}
        ${linkRow}
        <div class="cite"><ul>${sourceItems(item.sources)}</ul></div>
      </div>`;
    return article;
  }

  function renderSections() {
    els.more.innerHTML = "";
    const note = document.createElement("p");
    note.className = "notice";
    note.innerHTML = pair(sections.note.en, sections.note.zh);
    els.more.appendChild(note);

    sections.sections.forEach((section) => {
      const sec = document.createElement("section");
      sec.className = "guide-section";
      sec.id = section.id;
      const head = document.createElement("div");
      head.className = "section-head";
      head.innerHTML = `<h2>${pair(section.title.en, section.title.zh)}</h2>`;
      sec.appendChild(head);
      const lede = document.createElement("div");
      lede.className = "lede";
      lede.innerHTML = pair(section.lede.en, section.lede.zh);
      sec.appendChild(lede);
      (section.blocks || []).forEach((block) => sec.appendChild(htmlNode(textBlock(block))));
      (section.groups || []).forEach((group) => {
        const h = document.createElement("h3");
        h.innerHTML = pair(group.title.en, group.title.zh);
        sec.appendChild(h);
        if (group.intro) {
          const intro = document.createElement("div");
          intro.className = "lede";
          intro.innerHTML = pair(group.intro.en, group.intro.zh);
          sec.appendChild(intro);
        }
        const grid = document.createElement("div");
        grid.className = section.id === "weapons" ? "weapon-grid" : "people";
        (group.items || []).forEach((item) => grid.appendChild(personCard(item)));
        sec.appendChild(grid);
      });
      const cites = document.createElement("div");
      cites.className = "cite";
      cites.innerHTML = `<h3>${pair("Section sources", "本節出處")}</h3><ul>${sourceItems(section.sources)}</ul>`;
      sec.appendChild(cites);
      els.more.appendChild(sec);
    });
  }

  function htmlNode(html) {
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    return wrap.firstElementChild;
  }

  function renderSources() {
    els.sources.innerHTML = (window.GUIDE_SOURCES || []).map((s) => {
      const date = s.date ? ` (${esc(s.date)})` : "";
      const title = s.title || {};
      return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${pair(title.en || s.url, title.zh || title.en || s.url)}</a>${date}</li>`;
    }).join("");
  }

  const limits = data.meta.coverage_limits;
  const notice = document.getElementById("coverage");
  if (notice && limits) {
    notice.innerHTML = pair(
      limits.en + " Researched 10 November 2026 (Hong Kong time, UTC+8).",
      limits.zh + "資料查核日期：2026年11月10日（香港時間，UTC+8）。"
    );
  }

  renderFilters();
  renderElders();
  renderGrid();
  renderSections();
  renderSources();

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
