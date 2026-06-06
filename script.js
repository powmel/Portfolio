(function () {
  "use strict";

  const config = window.PORTFOLIO_CONFIG || {};
  const posts = Array.isArray(window.DAILY_POSTS) ? window.DAILY_POSTS : [];
  const page = document.body ? document.body.dataset.page : "home";
  const copySet = config.lpCopy || {};
  const langButtons = document.querySelectorAll(".lang-btn");
  const menuToggle = document.getElementById("menu-toggle");
  const headerPanel = document.getElementById("primary-nav");
  const year = document.getElementById("year");
  const updatedAt = document.getElementById("updated-at");
  const activityModal = document.getElementById("activity-modal");
  const activityModalBackdrop = document.getElementById("activity-modal-backdrop");
  const activityModalClose = document.getElementById("activity-modal-close");
  let activeLang = config.defaultLanguage || "ja";
  let activeCopy = copySet[activeLang] || copySet.ja || {};

  function $(id) {
    return document.getElementById(id);
  }

  function setText(node, text) {
    if (node && typeof text === "string") node.textContent = text;
  }

  function safePath(path) {
    return typeof path === "string" ? path.replace(/^\//, "") : "";
  }

  function setMenu(open) {
    if (!menuToggle || !headerPanel) return;
    headerPanel.classList.toggle("is-open", open);
    menuToggle.classList.toggle("is-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    const label = activeCopy.menu || {};
    menuToggle.setAttribute("aria-label", open ? label.close || "Close menu" : label.open || "Open menu");
  }

  function normalizeStatus(status) {
    return status === "ongoing" ? "ongoing" : "completed";
  }

  function localizePeriod(period, lang) {
    if (typeof period !== "string") return "";
    return lang === "ja" ? period.replace("Present", "現在") : period.replace("現在", "Present");
  }

  function getActivityBySlug(slug) {
    return (config.activities || []).find((activity) => activity.slug === slug) || null;
  }

  function localizeActivity(activity) {
    if (!activity) return null;
    const status = normalizeStatus(activity.status);
    return {
      id: activity.slug,
      period: localizePeriod(activity.period, activeLang),
      status,
      statusLabel:
        activeLang === "ja"
          ? status === "ongoing"
            ? "進行中"
            : "完了"
          : status === "ongoing"
            ? "ONGOING"
            : "COMPLETED",
      title: activeLang === "ja" ? activity.title_ja : activity.title_en,
      detail: activeLang === "ja" ? activity.detail_ja : activity.detail_en,
      records: activeLang === "ja" ? activity.records_ja : activity.records_en,
      coverImage: safePath(activity.coverImage),
      gallery: Array.isArray(activity.gallery) ? activity.gallery.map(safePath) : [],
      url: activity.url || ""
    };
  }

  function buildHeroStream() {
    const images = Array.isArray(config.heroStreamImages) ? config.heroStreamImages : [];
    const tracks = [$("hero-stream-track-a"), $("hero-stream-track-b")].filter(Boolean);
    if (!images.length || !tracks.length) return;
    tracks.forEach((track) => {
      track.innerHTML = "";
      images.concat(images).forEach((src) => {
        const img = document.createElement("img");
        img.src = safePath(src);
        img.alt = "";
        img.loading = "lazy";
        track.appendChild(img);
      });
    });
  }

  function renderIdentityCards() {
    const grid = $("identity-grid");
    const items = (config.identityCards && (config.identityCards[activeLang] || config.identityCards.ja)) || [];
    if (!grid) return;
    grid.innerHTML = "";
    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "identity-card";
      const icon = document.createElement("span");
      icon.className = "identity-icon";
      icon.textContent = item.title ? item.title.charAt(0) : "";
      const title = document.createElement("h3");
      title.textContent = item.title || "";
      const text = document.createElement("p");
      text.textContent = item.text || "";
      card.append(icon, title, text);
      grid.appendChild(card);
    });
  }

  function renderFocusAreas() {
    const list = $("focus-list");
    if (!list) return;
    list.innerHTML = "";
    (config.focusAreas || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
  }

  function renderTimeline() {
    const list = $("timeline-list");
    const items = (config.timeline && (config.timeline[activeLang] || config.timeline.ja)) || [];
    if (!list) return;
    list.innerHTML = "";
    items.forEach((item) => {
      const article = document.createElement("article");
      article.className = "timeline-item";

      const year = document.createElement("div");
      year.className = "timeline-year";
      year.textContent = item.year || "";

      const body = document.createElement("div");
      body.className = "timeline-body";
      const title = document.createElement("h3");
      title.textContent = item.title || "";
      const description = document.createElement("p");
      description.textContent = item.description || "";
      body.append(title, description);

      if (item.image) {
        const img = document.createElement("img");
        img.className = "timeline-thumb";
        img.src = safePath(item.image);
        img.alt = item.title || "Timeline photo";
        img.loading = "lazy";
        article.append(year, body, img);
      } else {
        article.append(year, body);
      }

      list.appendChild(article);
    });
  }

  function sortedDailyPosts() {
    return posts.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function dailyMonthKey(date) {
    return typeof date === "string" && date.length >= 7 ? date.slice(0, 7) : "unknown";
  }

  function dailyMonthLabel(key) {
    if (!/^\d{4}-\d{2}$/.test(key)) return activeLang === "ja" ? "日付未設定" : "Undated";
    const [year, month] = key.split("-");
    if (activeLang === "ja") return `${year}年${Number(month)}月`;
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
    return `${monthNames[Number(month) - 1] || month} ${year}`;
  }

  function dailyPostCountLabel(count) {
    if (activeLang === "ja") return `${count}件`;
    return count === 1 ? "1 post" : `${count} posts`;
  }

  function createTag(text) {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = text;
    return span;
  }

  function createDailyCard(post, compact) {
    const article = document.createElement("article");
    article.className = compact ? "daily-card compact-card" : "daily-card";
    const date = document.createElement("p");
    date.className = "daily-date";
    date.textContent = post.date || "";
    const title = document.createElement("h3");
    const link = document.createElement("a");
    link.href = post.url || "#";
    link.textContent = post.title || "";
    title.appendChild(link);
    const summary = document.createElement("p");
    summary.className = "daily-summary";
    summary.textContent = post.summary || "";
    const tags = document.createElement("div");
    tags.className = "tag-list";
    (post.tags || []).forEach((tag) => tags.appendChild(createTag(tag)));
    article.append(date, title, summary, tags);
    return article;
  }

  function renderLatestDaily() {
    const list = $("latest-daily-list");
    if (!list) return;
    list.innerHTML = "";
    sortedDailyPosts().slice(0, 3).forEach((post) => list.appendChild(createDailyCard(post, true)));
  }

  function renderDailyArchive() {
    const list = $("daily-archive-list");
    if (!list) return;
    list.innerHTML = "";
    const grouped = new Map();
    sortedDailyPosts().forEach((post) => {
      const key = dailyMonthKey(post.date);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(post);
    });

    grouped.forEach((items, key) => {
      const section = document.createElement("section");
      section.className = "daily-month-group";
      section.setAttribute("aria-labelledby", `daily-month-${key}`);

      const heading = document.createElement("div");
      heading.className = "daily-month-heading";

      const title = document.createElement("h2");
      title.id = `daily-month-${key}`;
      title.textContent = dailyMonthLabel(key);

      const count = document.createElement("p");
      count.textContent = dailyPostCountLabel(items.length);

      const cards = document.createElement("div");
      cards.className = "daily-month-posts";
      items.forEach((post) => cards.appendChild(createDailyCard(post, false)));

      heading.append(title, count);
      section.append(heading, cards);
      list.appendChild(section);
    });
  }

  function openActivityModal(item) {
    if (!activityModal || !item) return;
    const labels = activeCopy.modal || {};
    setText($("activity-modal-period"), item.period || "");
    setText($("activity-modal-title"), item.title || "");
    setText($("activity-modal-detail"), item.detail || "");
    setText($("activity-modal-records-heading"), labels.recordsTitle || "Records");
    setText($("activity-modal-gallery-heading"), labels.galleryTitle || "Photos");

    const records = $("activity-modal-records");
    if (records) {
      records.innerHTML = "";
      (item.records || []).forEach((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        records.appendChild(li);
      });
    }

    const gallery = $("activity-modal-gallery");
    if (gallery) {
      gallery.innerHTML = "";
      (item.gallery || []).forEach((src) => {
        const img = document.createElement("img");
        img.src = src;
        img.alt = item.title || "Activity photo";
        img.loading = "lazy";
        gallery.appendChild(img);
      });
    }

    const linkSection = $("activity-modal-link-section");
    const modalLink = $("activity-modal-link");
    const linkHeading = $("activity-modal-link-heading");
    const hasUrl = typeof item.url === "string" && item.url.trim() !== "";
    if (linkSection && modalLink && linkHeading) {
      linkSection.hidden = !hasUrl;
      if (hasUrl) {
        linkHeading.textContent = labels.linkTitle || "Related Link";
        modalLink.href = item.url;
        modalLink.textContent = labels.visitLabel || "Open page";
      }
    }

    activityModal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeActivityModal() {
    if (!activityModal) return;
    activityModal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function renderProjects() {
    const grid = $("project-grid");
    if (!grid) return;
    grid.innerHTML = "";
    (config.projectHighlights || []).forEach((highlight) => {
      const activity = localizeActivity(getActivityBySlug(highlight.slug));
      const card = document.createElement("article");
      card.className = "project-card";

      const img = document.createElement("img");
      img.src = activity && activity.coverImage ? activity.coverImage : "images/profile-main.png";
      img.alt = highlight.title || (activity && activity.title) || "Project image";
      img.loading = "lazy";

      const body = document.createElement("div");
      body.className = "project-card-body";
      const title = document.createElement("h3");
      title.textContent = highlight.title || (activity && activity.title) || "";
      const detail = document.createElement("p");
      detail.textContent = activity ? activity.detail : "";
      const tags = document.createElement("div");
      tags.className = "tag-list";
      (highlight.tags || []).forEach((tag) => tags.appendChild(createTag(tag)));
      body.append(title, detail, tags);

      if (activity) {
        const button = document.createElement("button");
        button.className = "project-open";
        button.type = "button";
        button.textContent = activeLang === "ja" ? "記録を見る" : "View details";
        button.addEventListener("click", () => openActivityModal(activity));
        body.appendChild(button);
      }

      card.append(img, body);
      grid.appendChild(card);
    });
  }

  function renderContactLinks() {
    const links = config.links || {};
    const labels = activeCopy.contactLabels || {};
    const fallbacks = activeCopy.contactFallbacks || {};
    const target = $("contact-links");
    const items = [
      { label: labels.github || "GitHub", key: "github", fallback: fallbacks.github || "GitHub URL" },
      { label: labels.x || "X", key: "x", fallback: fallbacks.x || "X URL" },
      { label: labels.linkedin || "LinkedIn", key: "linkedin", fallback: fallbacks.linkedin || "LinkedIn URL" },
      { label: labels.email || "Email", key: "email", fallback: fallbacks.email || "your-email@example.com" }
    ];
    if (!target) return;
    target.innerHTML = "";
    items.forEach((item) => {
      const value = links[item.key] || "#";
      const link = document.createElement("a");
      link.className = "contact-link";
      link.href = value || "#";
      link.target = value && !value.startsWith("mailto:") && value !== "#" ? "_blank" : "_self";
      link.rel = "noreferrer";
      if (!value || value === "#") {
        link.dataset.disabled = "true";
        link.addEventListener("click", (event) => event.preventDefault());
      }
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = item.label;
      const visibleValue = document.createElement("span");
      visibleValue.className = "value";
      visibleValue.textContent = !value || value === "#" ? item.fallback : value.replace("mailto:", "");
      link.append(label, visibleValue);
      target.appendChild(link);
    });
  }

  function applyCopy(lang) {
    activeLang = copySet[lang] ? lang : "ja";
    activeCopy = copySet[activeLang] || copySet.ja || {};
    const sections = activeCopy.sections || {};
    const hero = activeCopy.hero || {};
    const nav = activeCopy.nav || {};

    document.documentElement.lang = activeLang;
    document.title = activeCopy.pageTitle || "Taiki Misawa | Portfolio";
    const meta = $("meta-description");
    if (meta && activeCopy.metaDescription) meta.setAttribute("content", activeCopy.metaDescription);

    setText($("nav-timeline"), nav.timeline);
    setText($("nav-daily"), nav.daily);
    setText($("nav-projects"), nav.projects);
    setText($("nav-vision"), nav.vision);
    setText($("nav-about"), nav.about);
    setText($("hero-affiliation"), hero.affiliation);
    setText($("hero-identity"), hero.identity);
    setText($("hero-lead"), hero.lead);
    setText($("hero-btn-timeline"), hero.timelineButton);
    setText($("hero-btn-daily"), hero.dailyButton);
    setText($("hero-caption"), hero.caption);

    setText($("about-kicker"), sections.aboutKicker);
    setText($("heading-about"), sections.aboutTitle);
    setText($("about-lead"), sections.aboutLead);
    setText($("focus-kicker"), sections.focusKicker);
    setText($("heading-focus"), sections.focusTitle);
    setText($("timeline-kicker"), sections.timelineKicker);
    setText($("heading-timeline"), sections.timelineTitle);
    setText($("timeline-link"), sections.timelineLink);
    setText($("daily-kicker"), sections.dailyKicker);
    setText($("heading-daily"), sections.dailyTitle);
    setText($("daily-subtext"), sections.dailySubtext);
    setText($("daily-link"), sections.dailyLink);
    setText($("projects-kicker"), sections.projectsKicker);
    setText($("heading-projects"), sections.projectsTitle);
    setText($("projects-link"), sections.projectsLink);
    setText($("vision-kicker"), sections.visionKicker);
    setText($("heading-vision"), sections.visionTitle);
    setText($("vision-text"), (config.vision && (config.vision[activeLang] || config.vision.ja)) || "");
    setText($("contact-kicker"), sections.contactKicker);
    setText($("heading-contact"), sections.contactTitle);
    setText($("contact-intro"), sections.contactIntro);
    setText($("daily-page-title"), activeLang === "ja" ? "Daily Log" : "Daily Log");
    setText($("daily-page-lead"), activeLang === "ja" ? "日々の活動・研究・開発・思考を、AIと一緒に整理して残していくログです。" : "A log for organizing daily activities, research, development, and thoughts together with AI.");

    if (updatedAt) {
      updatedAt.textContent = `${activeCopy.footerUpdated || "Updated"}: ${config.updatedAt || "April 2026"}`;
    }
    langButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.lang === activeLang));
    setMenu(false);

    renderIdentityCards();
    renderFocusAreas();
    renderTimeline();
    renderLatestDaily();
    renderDailyArchive();
    renderProjects();
    renderContactLinks();

    try {
      localStorage.setItem("portfolio-lang", activeLang);
    } catch (_e) {
      // Ignore storage restrictions.
    }
  }

  function initReveal() {
    const revealElements = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      revealElements.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealElements.forEach((el) => observer.observe(el));
  }

  if ($("profile-image")) $("profile-image").src = safePath(config.profileImage || "images/profile-main.png");
  if (year) year.textContent = String(new Date().getFullYear());

  buildHeroStream();

  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      const nextOpen = menuToggle.getAttribute("aria-expanded") !== "true";
      setMenu(nextOpen);
    });
  }

  document.querySelectorAll(".main-nav a").forEach((link) => {
    link.addEventListener("click", () => setMenu(false));
  });

  langButtons.forEach((button) => {
    button.addEventListener("click", () => applyCopy(button.dataset.lang || "ja"));
  });

  if (activityModalBackdrop) activityModalBackdrop.addEventListener("click", closeActivityModal);
  if (activityModalClose) activityModalClose.addEventListener("click", closeActivityModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeActivityModal();
      setMenu(false);
    }
  });

  try {
    activeLang = localStorage.getItem("portfolio-lang") || activeLang;
  } catch (_e) {
    // Ignore storage restrictions.
  }

  applyCopy(activeLang);
  initReveal();

  if (page === "daily-post") {
    renderContactLinks();
  }
})();
