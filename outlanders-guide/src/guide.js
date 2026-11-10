(function () {
  const data = JSON.parse(document.getElementById("guide-data").textContent);
  const sourcesById = Object.fromEntries((window.GUIDE_SOURCES || []).map((s) => [s.id, s]));
  const root = document.documentElement;
  const els = {
    html: document.documentElement,
    title: document.querySelector("title"),
    brandTitle: document.querySelector("[data-i18n=brandTitle]"),
    brandKicker: document.querySelector("[data-i18n=brandKicker]"),
    h1: document.querySelector("[data-i18n=h1]"),
    lede: document.querySelector("[data-i18n=lede]"),
    notice: document.querySelector("[data-i18n=notice]"),
    elderHead: document.querySelector("[data-i18n=elderHead]"),
    elderSub: document.querySelector("[data-i18n=elderSub]"),
    rosterHead: document.querySelector("[data-i18n=rosterHead]"),
    search: document.getElementById("search"),
    searchLabel: document.querySelector("[data-i18n=searchLabel]"),
    filters: document.getElementById("filters"),
    count: document.getElementById("count"),
    grid: document.getElementById("grid"),
    elders: document.getElementById("elder-grid"),
    empty: document.getElementById("empty"),
    modal: document.getElementById("modal"),
    dialog: document.getElementById("dialog"),
    close: document.getElementById("close-modal"),
  };

  const I18N = {
    en: {
      docTitle: "Monster Hunter Outlanders Field Guide — Monsters",
      brandKicker: "Unofficial fan guide",
      brandTitle: "Outlanders Field Guide",
      navMonsters: "Monsters",
      navSoonA: "Adventurers",
      navSoonB: "Weapons",
      soon: "later",
      h1: "The monsters of Aesoland",
      lede: "A bilingual field guide to large monsters officially named for Monster Hunter Outlanders — starting with the roster, and with Elder Dragons set apart so no species is casually labelled an Elder Dragon.",
      notice: data.meta.coverage_limits.en + " " + data.meta.as_of.replace("2026-11-10", "Researched 10 November 2026 (Hong Kong time, UTC+8)."),
      asOf: "Researched 10 November 2026 (Hong Kong time, UTC+8).",
      elderHead: "Elder Dragons",
      elderSub: "Only these three are officially presented as Elder Dragons in the sources reviewed.",
      rosterHead: "Officially named large monsters",
      searchLabel: "Search monsters",
      searchPh: "Search English or Chinese names…",
      all: "All",
      empty: "No monsters match that search or filter.",
      close: "Close",
      sources: "Citations",
      notes: "Notes",
      descOfficial: "Official description",
      descProv: "Traditional Chinese is a provisional translation of the official English text.",
      nameProv: "Traditional Chinese name is provisional or assembled as noted below.",
      imageCredit: "Official artwork. ©CAPCOM / ©2026 Proxima Beta Pte. Ltd. Used here in an unofficial fan guide.",
      footerSources: "Primary sources",
      footerLegal: "This is an unofficial fan guide and is not affiliated with, endorsed by, or sponsored by Capcom, TiMi Studio Group, Level Infinite, Proxima Beta, or Garena. Monster Hunter and all related names and imagery are trademarks or copyrights of their respective owners. This copy is a static page on a personal playground site. The same folder can also be opened locally.",
      result: (n, t) => n + " of " + t + " monsters",
    },
    zh: {
      docTitle: "《魔物獵人：旅人》狩獵手冊 — 魔物",
      brandKicker: "非官方粉絲手冊",
      brandTitle: "旅人狩獵手冊",
      navMonsters: "魔物",
      navSoonA: "冒險者",
      navSoonB: "武器",
      soon: "稍後",
      h1: "埃索島的魔物",
      lede: "本篇是《魔物獵人：旅人》大型魔物的中英雙語手冊，先從官方具名的魔物名冊寫起；古龍種獨立分類，避免把所有魔物都誤稱為古龍。",
      notice: data.meta.coverage_limits.zh + "資料查核日期：2026年11月10日（香港時間，UTC+8）。",
      asOf: "資料查核日期：2026年11月10日（香港時間，UTC+8）。",
      elderHead: "古龍種",
      elderSub: "在本次查核的官方來源中，只有這三種被作為古龍種介紹。",
      rosterHead: "官方具名的大型魔物",
      searchLabel: "搜尋魔物",
      searchPh: "搜尋英文或繁體中文名稱……",
      all: "全部",
      empty: "沒有符合此搜尋或篩選的魔物。",
      close: "關閉",
      sources: "出處",
      notes: "備註",
      descOfficial: "官方簡介",
      descProv: "繁體中文簡介為官方英文原文的臨時翻譯，並非官方中文原文。",
      nameProv: "繁體中文名稱為臨時或組合譯名，詳見下方說明。",
      imageCredit: "官方美術。©CAPCOM／©2026 Proxima Beta Pte. Ltd. 僅用於非官方粉絲手冊。",
      footerSources: "主要來源",
      footerLegal: "本站為非官方粉絲手冊，與 Capcom、天美工作室、Level Infinite、Proxima Beta 或 Garena 無關，亦未獲其認可或贊助。Monster Hunter 及相關名稱與圖像均為其權利人的商標或著作權。此頁為個人 playground 上的靜態頁面，同一資料夾亦可於本機開啟。",
      result: (n, t) => "顯示 " + n + "／" + t + " 種魔物",
    },
  };

  const cats = Object.fromEntries(data.categories.map((c) => [c.id, c]));
  const classes = Object.fromEntries(data.species_classes.map((c) => [c.id, c]));
  const confirmLabels = data.confirmation_labels;

  let lang = (localStorage.getItem("mho-guide-lang") === "en") ? "en" : "zh";
  let filter = "all";
  let query = "";
  let lastFocus = null;
  const monsters = data.monsters.slice().sort((a, b) => a.sort - b.sort);

  function t(key) {
    return I18N[lang][key];
  }
  function catLabel(id) {
    const c = cats[id];
    return c ? c[lang] : id;
  }
  function classLabel(id) {
    const c = classes[id];
    return c ? c[lang] : id;
  }
  function confLabel(id) {
    const c = confirmLabels[id];
    return c ? c[lang] : id;
  }
  function nameStatusOfficial(m) {
    return m.name_zh_status === "official_outlanders" || m.name_zh_status === "official_outlanders_and_series";
  }

  function applyLang() {
    els.html.lang = lang === "zh" ? "zh-Hant-HK" : "en";
    els.html.dataset.lang = lang;
    document.title = t("docTitle");
    const map = {
      brandTitle: "brandTitle",
      brandKicker: "brandKicker",
      h1: "h1",
      lede: "lede",
      notice: "notice",
      elderHead: "elderHead",
      elderSub: "elderSub",
      rosterHead: "rosterHead",
      searchLabel: "searchLabel",
    };
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const k = node.getAttribute("data-i18n");
      if (I18N[lang][k] && k !== "notice") {
        if (node.tagName === "INPUT") node.placeholder = I18N[lang][k];
        else node.textContent = I18N[lang][k];
      }
    });
    document.querySelector("[data-i18n=notice]").textContent = t("notice");
    const pills = {
      en: ["23 officially named", "10 Nov 2026 · Hong Kong time", "Unofficial fan guide"],
      zh: ["官方具名 23 種", "2026年11月10日 · 香港時間", "非官方粉絲手冊"]
    };
    document.querySelectorAll(".hero .pill").forEach((el, i) => { if (pills[lang][i]) el.textContent = pills[lang][i]; });
    els.search.placeholder = t("searchPh");
    els.search.setAttribute("aria-label", t("searchLabel"));
    const closer = document.getElementById("close-modal");
    if (closer) closer.setAttribute("aria-label", t("close"));
    document.querySelectorAll("[data-lang-btn]").forEach((b) => {
      b.setAttribute("aria-pressed", b.getAttribute("data-lang-btn") === lang ? "true" : "false");
    });
    document.querySelectorAll("[data-nav-soon]").forEach((n) => {
      n.setAttribute("title", t("soon"));
    });
    renderFilters();
    renderElders();
    renderGrid();
    const openId = els.modal.dataset.open;
    if (openId && !els.modal.hidden) openModal(openId, true);
  }

  function renderFilters() {
    els.filters.innerHTML = "";
    data.categories.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "filter-btn";
      b.setAttribute("aria-pressed", filter === c.id ? "true" : "false");
      b.textContent = c[lang];
      b.addEventListener("click", () => {
        filter = c.id;
        renderFilters();
        renderGrid();
      });
      els.filters.appendChild(b);
    });
  }

  function matches(m) {
    if (filter !== "all" && m.category !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const blob = [
      m.name.en, m.name.zh, m.id, m.category, m.species_class, m.form,
      catLabel(m.category), classLabel(m.species_class),
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
    const imgSrc = variant === "elder" ? m.images.hero : m.images.card;
    const nameLine = lang === "zh"
      ? `<div class="n">${esc(m.name.zh)}</div><div>${esc(m.name.en)}</div>`
      : `<div class="n">${esc(m.name.en)}</div><div class="card-name-zh">${esc(m.name.zh)}</div>`;
    if (variant === "elder") {
      btn.innerHTML = `<img src="${esc(imgSrc)}" alt="${esc(m.name.en)} / ${esc(m.name.zh)}" width="640" height="400"><div class="cap"><div class="k">${esc(classLabel(m.species_class))}</div>${nameLine}</div>`;
    } else {
      const prov = nameStatusOfficial(m) ? "" : `<span class="provisional">${lang === "zh" ? "譯名見備註" : "name note"}</span>`;
      btn.innerHTML = `<div class="card-art"><img src="${esc(imgSrc)}" alt="${esc(m.name.en)} / ${esc(m.name.zh)}" width="400" height="320"><span class="${badgeClass(m.confirmation)}">${esc(confLabel(m.confirmation))}</span></div><div class="card-body"><p class="card-cat">${esc(catLabel(m.category))} · ${esc(classLabel(m.species_class))}${prov}</p><h3 class="card-name-en">${esc(lang === "zh" ? m.name.zh : m.name.en)}</h3><p class="card-name-zh">${esc(lang === "zh" ? m.name.en : m.name.zh)}</p></div>`;
    }
    btn.addEventListener("click", () => openModal(m.id));
    return btn;
  }

  function renderElders() {
    els.elders.innerHTML = "";
    monsters.filter((m) => m.category === "elder-dragon").forEach((m) => {
      els.elders.appendChild(cardButton(m, "elder"));
    });
  }

  function renderGrid() {
    const list = monsters.filter(matches);
    els.grid.innerHTML = "";
    list.forEach((m) => els.grid.appendChild(cardButton(m, "card")));
    els.count.textContent = t("result")(list.length, monsters.length);
    els.empty.classList.toggle("show", list.length === 0);
    els.empty.textContent = t("empty");
  }

  function sourceLink(id) {
    const s = sourcesById[id];
    if (!s) return `<li>${esc(id)}</li>`;
    const title = s.title[lang] || s.title.en;
    const date = s.date ? ` (${s.date})` : "";
    return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>${esc(date)}</li>`;
  }

  function openModal(id, keepFocus) {
    const m = monsters.find((x) => x.id === id);
    if (!m) return;
    if (!keepFocus) lastFocus = document.activeElement;
    els.modal.hidden = false;
    els.modal.dataset.open = id;
    document.body.style.overflow = "hidden";
    const descNote = m.description_zh_status === "official_outlanders"
      ? ""
      : `<p class="flag">${esc(t("descProv"))}</p>`;
    const nameNote = nameStatusOfficial(m)
      ? ""
      : `<p class="flag">${esc(t("nameProv"))} ${esc(m.name_zh_note)}</p>`;
    const notes = (m.notes && (m.notes[lang] || m.notes.en))
      ? `<h3>${esc(t("notes"))}</h3><p class="notes">${esc(m.notes[lang] || m.notes.en)}</p>`
      : "";
    els.dialog.innerHTML = `
      <button class="close" type="button" id="close-modal-inner" aria-label="${esc(t("close"))}">×</button>
      <div class="dialog-art"><img src="${esc(m.images.hero)}" alt="${esc(m.name.en)} / ${esc(m.name.zh)}"></div>
      <div class="dialog-body">
        <p class="chip" style="display:inline-block;border-color:var(--gold-dim);color:var(--gold-2)">${esc(confLabel(m.confirmation))}</p>
        <h2 id="dialog-title">${esc(lang === "zh" ? m.name.zh : m.name.en)}</h2>
        <p class="subnames">${esc(lang === "zh" ? m.name.en : m.name.zh)}</p>
        <div class="chips">
          <span class="chip">${esc(catLabel(m.category))}</span>
          <span class="chip">${esc(classLabel(m.species_class))}</span>
        </div>
        ${nameNote}
        <p class="desc">${esc(m.description[lang])}</p>
        ${descNote}
        ${m.name_zh_note && nameStatusOfficial(m) ? `<p class="notes">${esc(m.name_zh_note)}</p>` : ""}
        ${notes}
        <div class="cite"><h3>${esc(t("sources"))}</h3><ul>${m.sources.map(sourceLink).join("")}</ul></div>
        <p class="notes">${esc(t("imageCredit"))}</p>
      </div>`;
    els.dialog.querySelector("#close-modal-inner").addEventListener("click", closeModal);
    els.dialog.setAttribute("aria-labelledby", "dialog-title");
    els.dialog.querySelector("#close-modal-inner").focus();
  }

  function closeModal() {
    els.modal.hidden = true;
    delete els.modal.dataset.open;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  document.querySelectorAll("[data-lang-btn]").forEach((b) => {
    b.addEventListener("click", () => {
      lang = b.getAttribute("data-lang-btn");
      localStorage.setItem("mho-guide-lang", lang);
      applyLang();
    });
  });
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

  applyLang();
})();
