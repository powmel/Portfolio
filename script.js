(function () {
  "use strict";

  const config = window.PORTFOLIO_CONFIG || {};
  const i18n = config.i18n || {};

  const profileImage = document.getElementById("profile-image");
  const metaDescription = document.getElementById("meta-description");
  const navAbout = document.getElementById("nav-about");
  const navFocus = document.getElementById("nav-focus");
  const navExperience = document.getElementById("nav-experience");
  const navNow = document.getElementById("nav-now");
  const navVision = document.getElementById("nav-vision");
  const navContact = document.getElementById("nav-contact");
  const affiliation = document.getElementById("affiliation");
  const identity = document.getElementById("identity");
  const heroLead = document.getElementById("hero-lead");
  const heroBtnContact = document.getElementById("hero-btn-contact");
  const heroBtnExperience = document.getElementById("hero-btn-experience");
  const headingAbout = document.getElementById("heading-about");
  const headingFocus = document.getElementById("heading-focus");
  const headingExperience = document.getElementById("heading-experience");
  const experienceNote = document.getElementById("experience-note");
  const headingNow = document.getElementById("heading-now");
  const headingVision = document.getElementById("heading-vision");
  const headingContact = document.getElementById("heading-contact");
  const aboutP1 = document.getElementById("about-p1");
  const aboutP2 = document.getElementById("about-p2");
  const aboutP3 = document.getElementById("about-p3");
  const contactIntro = document.getElementById("contact-intro");
  const focusList = document.getElementById("focus-list");
  const experienceList = document.getElementById("experience-list");
  const nowList = document.getElementById("now-list");
  const visionText = document.getElementById("vision-text");
  const contactLinks = document.getElementById("contact-links");
  const streamTrackA = document.getElementById("hero-stream-track-a");
  const streamTrackB = document.getElementById("hero-stream-track-b");
  const langButtons = document.querySelectorAll(".lang-btn");
  const activityModal = document.getElementById("activity-modal");
  const activityModalBackdrop = document.getElementById("activity-modal-backdrop");
  const activityModalClose = document.getElementById("activity-modal-close");
  const activityModalPeriod = document.getElementById("activity-modal-period");
  const activityModalTitle = document.getElementById("activity-modal-title");
  const activityModalDetail = document.getElementById("activity-modal-detail");
  const activityModalRecordsHeading = document.getElementById("activity-modal-records-heading");
  const activityModalRecords = document.getElementById("activity-modal-records");
  const activityModalGalleryHeading = document.getElementById("activity-modal-gallery-heading");
  const activityModalGallery = document.getElementById("activity-modal-gallery");
  const year = document.getElementById("year");
  const updatedAt = document.getElementById("updated-at");
  let activeCopy = null;

  if (profileImage) {
    profileImage.src = config.profileImage || "images/profile-main.png";
  }

  function setList(target, items) {
    if (!target || !Array.isArray(items)) return;
    target.innerHTML = "";
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      target.appendChild(li);
    });
  }

  function buildHeroStream() {
    const images = Array.isArray(config.heroStreamImages) ? config.heroStreamImages : [];
    if (!images.length || !streamTrackA || !streamTrackB) return;
    const extended = images.concat(images);
    [streamTrackA, streamTrackB].forEach((track) => {
      track.innerHTML = "";
      extended.forEach((src) => {
        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        img.loading = "lazy";
        track.appendChild(img);
      });
    });
  }

  function renderContactLinks(copy) {
    const links = config.links || {};
    const labels = copy.contactLabels || {};
    const fallbacks = copy.contactFallbacks || {};
    const linkItems = [
      { label: labels.github || "GitHub", key: "github", fallback: fallbacks.github || "Add your GitHub URL" },
      { label: labels.x || "X", key: "x", fallback: fallbacks.x || "Add your X URL" },
      { label: labels.linkedin || "LinkedIn", key: "linkedin", fallback: fallbacks.linkedin || "Add your LinkedIn URL" },
      { label: labels.email || "Email", key: "email", fallback: fallbacks.email || "your-email@example.com" }
    ];

    if (!contactLinks) return;
    contactLinks.innerHTML = "";
    linkItems.forEach((item) => {
      const value = links[item.key] || "#";
      const a = document.createElement("a");
      a.className = "contact-link";
      a.href = value;
      a.target = value.startsWith("mailto:") || value === "#" ? "_self" : "_blank";
      a.rel = "noreferrer";

      const isDisabled = value === "#";
      if (isDisabled) {
        a.dataset.disabled = "true";
        a.addEventListener("click", (event) => event.preventDefault());
      }

      const label = document.createElement("span");
      label.className = "label";
      label.textContent = item.label;

      const linkValue = document.createElement("span");
      linkValue.className = "value";
      linkValue.textContent = isDisabled ? item.fallback : value.replace("mailto:", "");

      a.appendChild(label);
      a.appendChild(linkValue);
      contactLinks.appendChild(a);
    });
  }

  function openActivityModal(item) {
    if (!activityModal || !item) return;
    const modalLabels = (activeCopy && activeCopy.modal) || {};
    const recordsTitle = modalLabels.recordsTitle || "Records";
    const galleryTitle = modalLabels.galleryTitle || "Photos";

    setText(activityModalPeriod, item.period || "YYYY.MM");
    setText(activityModalTitle, item.title || "");
    setText(activityModalDetail, item.detail || "");
    setText(activityModalRecordsHeading, recordsTitle);
    setText(activityModalGalleryHeading, galleryTitle);

    if (activityModalRecords) {
      activityModalRecords.innerHTML = "";
      const records = Array.isArray(item.records) ? item.records : [];
      records.forEach((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        activityModalRecords.appendChild(li);
      });
    }

    if (activityModalGallery) {
      activityModalGallery.innerHTML = "";
      const gallery = Array.isArray(item.gallery) ? item.gallery : [];
      gallery.forEach((src) => {
        const img = document.createElement("img");
        img.src = src;
        img.alt = item.title || "Activity photo";
        img.loading = "lazy";
        activityModalGallery.appendChild(img);
      });
    }

    activityModal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeActivityModal() {
    if (!activityModal) return;
    activityModal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function renderExperienceList(items) {
    if (!experienceList || !Array.isArray(items)) return;
    experienceList.innerHTML = "";
    const cardLabels = (activeCopy && activeCopy.experienceCard) || {};

    items.forEach((item) => {
      const li = document.createElement("li");

      if (typeof item === "string") {
        li.textContent = item;
        experienceList.appendChild(li);
        return;
      }

      li.className = "activity-card";

      const main = document.createElement("div");
      main.className = "activity-main";

      const header = document.createElement("div");
      header.className = "timeline-header";

      const period = document.createElement("span");
      period.className = "timeline-period";
      period.textContent = item.period || "YYYY.MM";

      const status = document.createElement("span");
      status.className = `timeline-status ${item.status === "ongoing" ? "ongoing" : ""}`.trim();
      status.textContent = item.statusLabel || (item.status === "ongoing" ? "ONGOING" : "COMPLETED");

      header.appendChild(period);
      header.appendChild(status);

      const title = document.createElement("h3");
      title.className = "timeline-title";
      title.textContent = item.title || "";

      main.appendChild(header);
      main.appendChild(title);

      if (item.detail) {
        const detail = document.createElement("p");
        detail.className = "timeline-detail";
        detail.textContent = item.detail;
        main.appendChild(detail);
      }

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "activity-open";
      openButton.textContent = cardLabels.open || "View details";
      openButton.addEventListener("click", () => openActivityModal(item));
      main.appendChild(openButton);

      li.appendChild(main);

      const thumb = document.createElement("img");
      thumb.className = "activity-thumb";
      thumb.src = item.coverImage || "images/profile-main.png";
      thumb.alt = item.title || "Activity";
      thumb.loading = "lazy";
      li.appendChild(thumb);

      experienceList.appendChild(li);
    });
  }

  function setText(node, text) {
    if (node && typeof text === "string") {
      node.textContent = text;
    }
  }

  function setLanguage(lang) {
    const safeLang = i18n[lang] ? lang : "en";
    const copy = i18n[safeLang] || {};
    activeCopy = copy;
    document.documentElement.lang = safeLang;
    document.title = copy.pageTitle || "Taiki Misawa | Portfolio";
    if (metaDescription && copy.metaDescription) {
      metaDescription.setAttribute("content", copy.metaDescription);
    }

    const nav = copy.nav || {};
    setText(navAbout, nav.about);
    setText(navFocus, nav.focus);
    setText(navExperience, nav.experience);
    setText(navNow, nav.now);
    setText(navVision, nav.vision);
    setText(navContact, nav.contact);
    setText(affiliation, copy.affiliation);
    setText(identity, copy.identity);
    setText(heroLead, copy.heroLead);

    const heroButtons = copy.heroButtons || {};
    setText(heroBtnContact, heroButtons.contact);
    setText(heroBtnExperience, heroButtons.experience);

    const headings = copy.headings || {};
    setText(headingAbout, headings.about);
    setText(headingFocus, headings.focus);
    setText(headingExperience, headings.experience);
    setText(headingNow, headings.now);
    setText(headingVision, headings.vision);
    setText(headingContact, headings.contact);

    const about = copy.about || [];
    setText(aboutP1, about[0] || "");
    setText(aboutP2, about[1] || "");
    setText(aboutP3, about[2] || "");
    setText(contactIntro, copy.contactIntro || "");
    setText(experienceNote, copy.experienceNote || "");

    setList(focusList, copy.focusAreas || []);
    renderExperienceList(copy.selectedExperience || []);
    setList(nowList, copy.now || []);
    setText(visionText, copy.vision || "");
    renderContactLinks(copy);

    if (updatedAt) {
      const updatedLabel = copy.footerUpdated || "Updated";
      updatedAt.textContent = `${updatedLabel}: ${config.updatedAt || "April 2026"}`;
    }

    langButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.lang === safeLang);
    });

    try {
      localStorage.setItem("portfolio-lang", safeLang);
    } catch (_e) {
      // Ignore storage restriction.
    }
  }

  buildHeroStream();

  langButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextLang = button.dataset.lang || "en";
      setLanguage(nextLang);
    });
  });

  if (activityModalBackdrop) {
    activityModalBackdrop.addEventListener("click", closeActivityModal);
  }

  if (activityModalClose) {
    activityModalClose.addEventListener("click", closeActivityModal);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeActivityModal();
    }
  });

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  let initialLang = config.defaultLanguage || "ja";
  try {
    initialLang = localStorage.getItem("portfolio-lang") || initialLang;
  } catch (_e) {
    // Ignore storage restriction.
  }
  setLanguage(initialLang);

  const revealElements = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.12
    }
  );

  revealElements.forEach((el) => observer.observe(el));
})();
