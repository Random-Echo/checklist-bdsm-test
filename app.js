
const CHECKLIST_DATA = window.CHECKLIST_DATA;
const V2_STORAGE = window.CHECKLIST_V2_STORAGE;
const INTERACTION_MODEL = window.CHECKLIST_INTERACTION_MODEL;
const UNIFIED_CATALOG = window.CHECKLIST_CATALOG;
if (!CHECKLIST_DATA || !V2_STORAGE || !INTERACTION_MODEL || !UNIFIED_CATALOG) throw new Error("Checklist configuration missing.");
const CATALOG_ENTITIES = UNIFIED_CATALOG.entities || [];
const categoryColors = CHECKLIST_DATA.categoryColors;
const APP_VERSION = "V1.1.90";
const UNIFIED_ENTITY_BY_ID = new Map(CATALOG_ENTITIES.map(entity => [entity.id, entity]));

const LANG_KEY = window.CHECKLIST_SITE.languageKey;
const CATEGORY_EN = CHECKLIST_DATA.categoryEn;
const I18N = CHECKLIST_DATA.i18n;
const ONBOARDING_KEY = window.CHECKLIST_SITE.onboardingKey || "bdsmChecklistSite_firstUseGuide_v1";
const MERGE_REVIEW_KEY = "bdsmChecklistSite_mergeReviewPending_v1";
let onboardingModal = null;
let onboardingDialog = null;
let mergeReviewBanner = null;
let currentLang = (() => {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "fr" || saved === "en") return saved;
  const systemLang = String(navigator.language || "").toLowerCase();
  return systemLang.startsWith("fr") ? "fr" : "en";
})();

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) ?? I18N.fr[key] ?? key;
}

function localizedCategory(categoryName) {
  return currentLang === "en" ? (CATEGORY_EN[categoryName] || categoryName) : categoryName;
}

function applyStaticLanguage() {
  document.documentElement.lang = currentLang;
  document.title = `${t("appTitle")} ${APP_VERSION}`;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-html]").forEach(el => {
    const key = el.dataset.i18nHtml;
    el.innerHTML = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach(el => {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  });
  applyProfileLabels();

}
function applyProfileLabels() {
  const p = window.CHECKLIST_PROFILE_API?.get?.();
  if (!p) return;
  const nameA = p.personA?.name || (currentLang === "fr" ? "Personne A" : "Person A");
  const nameB = p.personB?.name || (currentLang === "fr" ? "Personne B" : "Person B");
  const a = document.getElementById("exportPersonA"), b = document.getElementById("exportPersonB");
  if (a) a.innerHTML = profileNameBadge('person-a', nameA, true);
  if (b) b.innerHTML = profileNameBadge('person-b', nameB, true);
}


function renderLanguageButtons() {
  document.querySelectorAll("[data-lang-choice]").forEach(btn => {
    const active = btn.dataset.langChoice === currentLang;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}


function updateHelpLanguage() {
  if (!helpModal) return;

  document.querySelectorAll("[data-help-lang]").forEach(block => {
    block.hidden = block.dataset.helpLang !== currentLang;
  });

  if (currentLang === "fr") {
    helpKicker.textContent = "Mode d’emploi";
    helpTitle.textContent = "Mode d’emploi complet";
    openHelpBtn.setAttribute("aria-label", "Aide");
    openHelpBtn.title = "Aide";
    closeHelpBtn.setAttribute("aria-label", "Fermer");
    closeHelpBtn.title = "Fermer";
  } else {
    helpKicker.textContent = "User guide";
    helpTitle.textContent = "Complete user guide";
    openHelpBtn.setAttribute("aria-label", "Help");
    openHelpBtn.title = "Help";
    closeHelpBtn.setAttribute("aria-label", "Close");
    closeHelpBtn.title = "Close";
  }
}


function updateAdultInfoLanguage() {
  const fr = currentLang === "fr";
  if (adultGate) adultGate.setAttribute("aria-labelledby", fr ? "adultGateTitleFr" : "adultGateTitleEn");
  if (infoModalTitle) infoModalTitle.textContent = fr ? "Informations" : "Information";
  if (closeInfoModalBtn) {
    closeInfoModalBtn.setAttribute("aria-label", fr ? "Fermer" : "Close");
    closeInfoModalBtn.title = fr ? "Fermer" : "Close";
  }
}

function focusTrapIn(container, event) {
  if (!container || event.key !== "Tab") return;
  const focusable = [...container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.hidden && el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function acceptAdultGate() {
  try {
    localStorage.setItem(window.CHECKLIST_SITE.adultKey, "true");
  } catch (_) {}
  document.documentElement.classList.remove("adult-gate-required");
  if (adultGate) adultGate.setAttribute("aria-hidden", "true");
  setAppBackgroundInert(false);
  requestAnimationFrame(showFirstUseGuideIfNeeded);
}

function leaveAdultGate() {
  if (history.length > 1) {
    history.back();
    setTimeout(() => { try { window.location.replace("about:blank"); } catch (_) {} }, 250);
  } else {
    try { window.location.replace("about:blank"); } catch (_) {}
  }
}

function openInfoModal(section="adult", opener=null) {
  if (!infoModal) return;
  lastInfoOpener = opener || document.activeElement;
  updateAdultInfoLanguage();
  infoModal.hidden = false;
  infoModal.setAttribute("aria-hidden", "false");
  setAppBackgroundInert(true);
  requestAnimationFrame(() => {
    const suffix = currentLang === "fr" ? "Fr" : "En";
    const target = document.getElementById(`info${section.charAt(0).toUpperCase()+section.slice(1)}${suffix}`);
    if (target) target.scrollIntoView({block:"start"});
    if (closeInfoModalBtn) closeInfoModalBtn.focus();
  });
}

function closeInfoModal() {
  if (!infoModal) return;
  infoModal.hidden = true;
  infoModal.setAttribute("aria-hidden", "true");
  setAppBackgroundInert(false);
  if (lastInfoOpener && typeof lastInfoOpener.focus === "function") lastInfoOpener.focus();
}

function setAppBackgroundInert(active) {
  for (const el of [document.querySelector("header"), document.querySelector("main"), document.querySelector("footer.site-footer"), document.querySelector(".merge-review-banner")]) {
    if (el && "inert" in el) el.inert = !!active;
  }
}

function openHelpModal() {
  updateHelpLanguage();
  helpModal.hidden = false;
  helpModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("help-open");
  setAppBackgroundInert(true);
  helpBody.scrollTop = 0;
  requestAnimationFrame(() => closeHelpBtn.focus());
}

function closeHelpModal() {
  helpModal.hidden = true;
  helpModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("help-open");
  setAppBackgroundInert(false);
  if (openHelpBtn) openHelpBtn.focus();
}

function setLanguage(lang, persist = true) {
  const next = lang === "fr" ? "fr" : "en";
  currentLang = next;
  if (persist) {
    localStorage.setItem(LANG_KEY, currentLang);
  }

  applyStaticLanguage();
  renderLanguageButtons();
  updateHelpLanguage();
  updateAdultInfoLanguage();
  updateFirstUseGuideLanguage();
  updateMergeReviewBannerLanguage();
  renderCategoryControls();
  renderExperienceModeUI();
  renderRoleUI();
  renderExchangeInfo();
  render();
}

const FAVORITE_SCORE = 4;
const FANTASY_SCORE = 5;
const SCORE_BUTTON_ORDER = [0,1,FANTASY_SCORE,2,3,FAVORITE_SCORE];


// Semantic score helpers used by the unified Edit/Read renderers.
// Keep these independent from the legacy table renderer: they are part of the active V2 UI.
function validScore(value) {
  return Number.isInteger(value) && value >= 0 && value <= FANTASY_SCORE ? value : null;
}

function favoriteSymbol(role = null) {
  return "👑";
}

function scoreLabel(value, compact = false, role = null) {
  const v = validScore(value);
  if (v === null) return t("unknown");
  if (v === FANTASY_SCORE) return compact ? "💭" : t("scoreFantasy");
  if (v === FAVORITE_SCORE) {
    const symbol = favoriteSymbol(role);
    return compact ? symbol : `${symbol} ${t("favoriteWord")}`;
  }
  if (currentLang === "fr") {
    const full = ["🚫 Limite", "Pas maintenant", "Neutre", "🔥 Envie"];
    const short = ["🚫", "Pas maintenant", "Neutre", "🔥"];
    return (compact ? short : full)[v];
  }
  const full = ["🚫 Limit", "Not now", "Neutral", "🔥 Want to"];
  const short = ["🚫", "Not now", "Neutral", "🔥"];
  return (compact ? short : full)[v];
}

function scoreButtonLabel(value, role = null) {
  const v = validScore(value);
  if (v === null) return "?";
  if (v === FANTASY_SCORE) return "💭";
  if (v === FAVORITE_SCORE) return favoriteSymbol(role);
  if (v === 0) return "🚫";
  if (v === 1) return "⏳";
  if (v === 2) return "😐";
  if (v === 3) return "🔥";
  return "?";
}

function scoreDescription(value) {
  const v = validScore(value);
  if (v === null) return t("unknown");
  if (v === FANTASY_SCORE) return t("scoreFantasyDesc");
  if (v === FAVORITE_SCORE) return t("scoreFavoriteDesc");
  return t(["scoreLimitDesc", "scoreLaterDesc", "scoreNeutralDesc", "scoreWantDesc"][v]);
}

function scoreChoiceTitle(value, role = null) {
  const v = validScore(value);
  if (v === null) return t("unknown");
  return `${scoreLabel(v, false, role)} — ${scoreDescription(v)}`;
}

function riskLabel(risk) {
  if (risk === "high") return t("riskHigh").replace(/^.*?:\s*/, "");
  if (risk === "caution") return t("riskCaution").replace(/^.*?:\s*/, "");
  return t("riskNormal").replace(/^.*?:\s*/, "");
}

function riskBadge(item) {
  if (item?.risk === "high") return `<button class="risk-badge risk-high" data-risk-info="high" type="button" title="${esc(t("riskHighTitle"))}" aria-label="${esc(t("riskHighTitle"))}">⚠</button>`;
  if (item?.risk === "caution") return `<button class="risk-badge risk-caution" data-risk-info="caution" type="button" title="${esc(t("riskCautionTitle"))}" aria-label="${esc(t("riskCautionTitle"))}">!</button>`;
  return "";
}

let riskInfoOverlay = null;
let lastRiskInfoOpener = null;
function ensureRiskInfoOverlay() {
  if (riskInfoOverlay) return riskInfoOverlay;
  const overlay=document.createElement("div");
  overlay.className="risk-info-overlay";
  overlay.hidden=true;
  overlay.setAttribute("aria-hidden","true");
  overlay.innerHTML=`<div class="risk-info-backdrop" data-risk-close="true"></div><section class="risk-info-dialog" role="dialog" aria-modal="true" aria-labelledby="riskInfoTitle"><div class="risk-info-head"><h2 id="riskInfoTitle"></h2><button class="risk-info-close" data-risk-close="true" type="button" aria-label="Fermer">✕</button></div><div class="risk-info-body" id="riskInfoBody"></div></section>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click",e=>{ if(e.target.closest("[data-risk-close='true']")) closeRiskInfo(); });
  riskInfoOverlay=overlay;
  return overlay;
}
function openRiskInfo(risk,opener=null) {
  const overlay=ensureRiskInfoOverlay();
  const high=risk==="high";
  const title=currentLang==="fr"?(high?"⚠ Risque élevé":"! Vigilance"):(high?"⚠ High risk":"! Caution");
  const description=high?t("riskHighTitle"):t("riskCautionTitle");
  lastRiskInfoOpener=opener||document.activeElement;
  overlay.querySelector("#riskInfoTitle").textContent=title;
  overlay.querySelector("#riskInfoBody").innerHTML=`<p>${esc(description)}</p>`;
  overlay.hidden=false;
  overlay.setAttribute("aria-hidden","false");
  setAppBackgroundInert(true);
  requestAnimationFrame(()=>overlay.querySelector(".risk-info-close")?.focus());
}
function closeRiskInfo() {
  if(!riskInfoOverlay||riskInfoOverlay.hidden) return;
  riskInfoOverlay.hidden=true;
  riskInfoOverlay.setAttribute("aria-hidden","true");
  setAppBackgroundInert(false);
  if(lastRiskInfoOpener&&typeof lastRiskInfoOpener.focus==="function") lastRiskInfoOpener.focus();
}

// Caches de données dérivées : un changement de réponse les invalide une seule fois.
// Les statistiques et le tirage ne reparcourent ainsi pas les 600 pratiques plusieurs fois par cycle UI.
let derivedDataRevision = 0;
let statsSnapshotCache = { revision:-1, value:null };
let randomSnapshotCache = { revision:-1, value:null };
let categoryStateCache = new Map();
let randomStateRevision = 0;
function invalidateRandomSnapshot() {
  randomStateRevision++;
  randomSnapshotCache.revision = -1;
}
function invalidateDerivedData() {
  derivedDataRevision++;
  statsSnapshotCache.revision = -1;
  categoryStateCache.clear();
  invalidateRandomSnapshot();
}

// Legacy numeric session state is no longer active. Sessions are stored as practice + logical variant.
let variantSessionOrder = (() => {
  try { return Array.isArray(V2_STORAGE.getAllSessionEntries?.()) ? V2_STORAGE.getAllSessionEntries() : []; }
  catch (_) { return []; }
})();
let variantSessionKeySet = new Set(variantSessionOrder.map(entry => `${entry.practiceId}|${entry.variant}`));
let sessionOnlyFilter = false;

let activeEditPerson = V2_STORAGE.getDisplay("activeEditPerson", "person-a", false) === "person-b" ? "person-b" : "person-a";
let isReadingMode = V2_STORAGE.getDisplay("readOnly", false, false) === true;

let experienceMode = (() => {
  const saved = V2_STORAGE.getDisplay("experienceMode", "beginner", false);
  return ["beginner","confirmed","advanced"].includes(saved) ? saved : "beginner";
})();

const allCatalogCategories = [...new Set(CATALOG_ENTITIES.flatMap(entity => Object.values(entity.scenarios || {}).map(block => block?.category).filter(Boolean)))];
let collapsedCategories = (() => {
  const raw = V2_STORAGE.getDisplay("collapsedCategories", null, true);
  if (raw === null) return new Set(allCatalogCategories);
  if (Array.isArray(raw)) return new Set(raw.filter(x => allCatalogCategories.includes(x)));
  return new Set();
})();

function saveCollapsedCategories() {
  V2_STORAGE.setDisplay("collapsedCategories", [...collapsedCategories], true);
}

function experienceMaxLevel() {
  if (experienceMode === "beginner") return 1;
  if (experienceMode === "confirmed") return 2;
  return 3;
}

function experienceLabel(mode = experienceMode) {
  if (mode === "beginner") return t("beginner");
  if (mode === "confirmed") return t("confirmed");
  return t("advanced");
}


function catalogEntityLevel(entity) {
  const levels = Object.values(entity?.scenarios || {}).map(block => Number(block?.level || 3)).filter(level => level >= 1 && level <= 3);
  return levels.length ? Math.min(...levels) : 3;
}
const catalogCumulativeLevelCounts = (() => {
  const exact = {1:0, 2:0, 3:0};
  for (const entity of CATALOG_ENTITIES) exact[catalogEntityLevel(entity)]++;
  return {1:exact[1], 2:exact[1] + exact[2], 3:exact[1] + exact[2] + exact[3]};
})();

function renderExperienceModeUI() {
  if (!experienceSwitch) return;
  const modes = [
    ["beginner", 1],
    ["confirmed", 2],
    ["advanced", 3],
  ];
  experienceSwitch.querySelectorAll("[data-experience-mode]").forEach(btn => {
    const mode = btn.dataset.experienceMode;
    const tuple = modes.find(x => x[0] === mode);
    const max = tuple ? tuple[1] : 3;
    const count = catalogCumulativeLevelCounts[max] || CATALOG_ENTITIES.length;
    btn.textContent = `${experienceLabel(mode)} · ${count}`;
    const active = experienceMode === mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  experienceSwitch.setAttribute(
    "aria-label",
    currentLang === "fr" ? "Niveau d’exploration" : "Exploration level"
  );
}

const search = document.getElementById("search");
const category = document.getElementById("category");
const status = document.getElementById("status");
const minFilterScore = document.getElementById("minFilterScore");
const readerIncludeFantasy = document.getElementById("readerIncludeFantasy");
const readerFilterDock = document.getElementById("readerFilterDock");
const readerFilterSummary = document.getElementById("readerFilterSummary");
const readerHeaderDs = document.getElementById("readerHeaderDs");
const readerHeaderDsButtons = [...document.querySelectorAll("[data-reader-header-ds]")];
const readerMinimumOneChips = document.getElementById("readerMinimumOneChips");
const readerMinimumTwoChips = document.getElementById("readerMinimumTwoChips");
const readerAdvancedFilters = document.getElementById("readerAdvancedFilters");
const riskFilter = document.getElementById("riskFilter");
const minRandomOne = document.getElementById("minRandomOne");
const minRandomOther = document.getElementById("minRandomOther");
const randomOnlyNew = document.getElementById("randomOnlyNew");
const randomIncludeNeutralNeutral = document.getElementById("randomIncludeNeutralNeutral");
const randomExcludeHighRisk = document.getElementById("randomExcludeHighRisk");
const randomNoRepeat = document.getElementById("randomNoRepeat");
const resetRandomCycleBtn = document.getElementById("resetRandomCycle");
const compatIndicator = document.getElementById("compatIndicator");
const compatDetails = document.getElementById("compatDetails");
const randomCandidateInfo = document.getElementById("randomCandidateInfo");
const exchangeInfo = document.getElementById("exchangeInfo");
const showSessionBtn = document.getElementById("showSession");
const openSessionModeBtn = document.getElementById("openSessionMode");
const resetSessionBtn = document.getElementById("resetSession");
const sessionMode = document.getElementById("sessionMode");
const closeSessionModeBtn = document.getElementById("closeSessionMode");
const sessionModeList = document.getElementById("sessionModeList");
const sessionSafetySummary = document.getElementById("sessionSafetySummary");
const sessionSummary = document.getElementById("sessionSummary");
const sessionList = document.getElementById("sessionList");
const randomBtn = document.getElementById("randomBtn");
const randomResult = document.getElementById("randomResult");
const importJsonBtn = document.getElementById("importJson");
const importJsonFile = document.getElementById("importJsonFile");
const exportFullBtn = document.getElementById("exportFull");
const exportPersonABtn = document.getElementById("exportPersonA");
const exportPersonBBtn = document.getElementById("exportPersonB");
const resetChecklistBtn = document.getElementById("resetChecklist");
const statVisibleEl = document.getElementById("statVisible");
const statDoneEl = document.getElementById("statDone");
const statTogetherEl = document.getElementById("statTogether");
const statRatedEl = document.getElementById("statRated");
const statStarredEl = document.getElementById("statStarred");
const statModeEl = document.getElementById("statMode");
const safetyFields = [...document.querySelectorAll(".safety input,.safety select,.safety textarea")];
// une seule colonne fixe (Pratique), sans colonne Catégorie.
const roleButtons = [...document.querySelectorAll("[data-person-choice]")];

let randomDrawHistory = (() => {
  try {
    const raw = V2_STORAGE.getRandomHistoryEntries?.() || [];
    return new Set((Array.isArray(raw) ? raw : []).map(entry => `${entry.practiceId}|${entry.variant}`));
  } catch (_) { return new Set(); }
})();

const readerFilterState = {
  ds: V2_STORAGE.getDisplay("readerDsFilter", "a-dominant") === "b-dominant" ? "b-dominant" : "a-dominant",
  minOne: String(V2_STORAGE.getDisplay("readerMinOne", "") ?? ""),
  minTwo: String(V2_STORAGE.getDisplay("readerMinTwo", "") ?? ""),
  includeFantasy: V2_STORAGE.getDisplay("readerIncludeFantasy", false) === true,
};
if (readerIncludeFantasy) readerIncludeFantasy.checked = readerFilterState.includeFantasy;

function getRandomPreferences() {
  return {
    minOne:minRandomOne.value,
    minOther:minRandomOther.value,
    includeNeutralNeutral:!!randomIncludeNeutralNeutral.checked,
    onlyNew:!!randomOnlyNew.checked,
    excludeHighRisk:!!randomExcludeHighRisk.checked,
    noRepeat:!!randomNoRepeat.checked
  };
}

function normalizeRandomThreshold(value, fallback) {
  return ["fantasy","neutral","want","favorite"].includes(value) ? value : fallback;
}

function applyRandomPreferences(prefs, persist=false) {
  const p = prefs && typeof prefs === "object" ? prefs : {};
  minRandomOne.value = normalizeRandomThreshold(p.minOne, "want");
  minRandomOther.value = normalizeRandomThreshold(p.minOther, "neutral");
  randomIncludeNeutralNeutral.checked = p.includeNeutralNeutral === true;
  if (typeof p.onlyNew === "boolean") randomOnlyNew.checked = p.onlyNew;
  if (typeof p.excludeHighRisk === "boolean") randomExcludeHighRisk.checked = p.excludeHighRisk;
  if (typeof p.noRepeat === "boolean") randomNoRepeat.checked = p.noRepeat;
  invalidateRandomSnapshot();
  if (persist) V2_STORAGE.setRandomPreferences(getRandomPreferences());
}

function loadRandomPreferences() {
  try {
    const saved = V2_STORAGE.getRandomPreferences();
    if (saved && typeof saved === "object") applyRandomPreferences(saved, false);
  } catch (_) {}
}

function saveRandomPreferences() {
  V2_STORAGE.setRandomPreferences(getRandomPreferences());
}

function saveRandomHistory() {
  const entries=[...randomDrawHistory].map(key=>{const i=key.lastIndexOf("|");return {practiceId:key.slice(0,i),variant:key.slice(i+1)}}).filter(e=>e.practiceId&&e.variant);
  V2_STORAGE.setRandomHistoryEntries?.(entries);
}

function clearRandomHistory(showMessage=true) {
  randomDrawHistory.clear();
  invalidateRandomSnapshot();
  saveRandomHistory();
  updateCompatibilityIndicator();
  if (showMessage) randomResult.innerHTML = `<strong>${t("randomCycleReset")}</strong>`;
}

loadRandomPreferences();
const languageButtons = [...document.querySelectorAll("[data-lang-choice]")];
const openHelpBtn = document.getElementById("openHelp");
const helpModal = document.getElementById("helpModal");
const helpBody = document.getElementById("helpBody");
const closeHelpBtn = document.getElementById("closeHelp");
const helpTitle = document.getElementById("helpTitle");
const helpKicker = document.getElementById("helpKicker");
const adultGate = document.getElementById("adultGate");
const adultGateDialog = adultGate ? adultGate.querySelector(".adult-gate-dialog") : null;
const infoModal = document.getElementById("infoModal");
const infoModalTitle = document.getElementById("infoModalTitle");
const closeInfoModalBtn = document.getElementById("closeInfoModal");
let lastInfoOpener = null;
const modeEditBtn = document.getElementById("modeEdit");
const modeReadBtn = document.getElementById("modeRead");
const experienceSwitch = document.getElementById("experienceSwitch");
const allTools = document.getElementById("allTools");

let lastExchange = V2_STORAGE.getLastExchange() || null;

function backupTypeLabel(type) {
  if (type === "male" || type === "person-a") return currentLang === "fr" ? "Personne A" : "Person A";
  if (type === "female" || type === "person-b") return currentLang === "fr" ? "Personne B" : "Person B";
  return currentLang === "fr" ? "Complète" : "Full";
}

function globalBackupConfirmationText(type, payload, inspection=null) {
  const normalized = type === "male" ? "person-a" : type === "female" ? "person-b" : type;
  const legacy = inspection?.format === "legacy-v2";
  const exportedAt = typeof payload?.exportedAt === "string" ? payload.exportedAt : "";
  const localAt = V2_STORAGE.getLastModified() || "";
  const older = normalized !== "full" && Number.isFinite(new Date(exportedAt).getTime()) && Number.isFinite(new Date(localAt).getTime()) && new Date(exportedAt).getTime() < new Date(localAt).getTime();
  let message;
  if (currentLang === "fr") {
    if (normalized === "full") {
      message = `Sauvegarde COMPLÈTE${legacy ? " V1.1.55" : " actuelle"}.\n\nElle remplacera le stockage complet : profils, réponses individuelles des deux personnes, données « Fait ensemble », notes, sécurité, séances, affichage et historique.${legacy ? "\n\nLa sauvegarde V1.1.55 sera convertie automatiquement vers le nouveau modèle individuel." : ""}`;
    } else {
      const who = normalized === "person-a" ? "Personne A" : "Personne B";
      const other = normalized === "person-a" ? "Personne B" : "Personne A";
      message = `Sauvegarde ${who.toUpperCase()}${legacy ? " V1.1.55" : " actuelle"}.\n\nElle remplacera uniquement les réponses personnelles de ${who}. Les réponses de ${other} resteront intactes. Les données communes restent additives et la sécurité est fusionnée prudemment.`;
    }
    if (older) message += `\n\n⚠️ Ce fichier semble plus ancien que les données locales.`;
    return message + `\n\nContinuer ?`;
  }
  if (normalized === "full") {
    message = `FULL ${legacy ? "V1.1.55" : "CURRENT"} BACKUP.\n\nIt will replace the complete current storage: both people's individual answers, couple data, notes, safety, sessions, display settings and history.${legacy ? "\n\nThe V1.1.55 backup will be converted automatically to the new individual model." : ""}`;
  } else {
    const who = normalized === "person-a" ? "Person A" : "Person B";
    const other = normalized === "person-a" ? "Person B" : "Person A";
    message = `${who.toUpperCase()} ${legacy ? "V1.1.55" : "CURRENT"} BACKUP.\n\nIt will replace only ${who}'s personal answers for all applicable directions and D/s roles. ${other}'s answers remain intact. Done together remains additive and safety is merged conservatively.`;
  }
  if (older) message += `\n\n⚠️ This file appears older than the local data.`;
  return message + `\n\nContinue?`;
}

function formatDateTime(iso) {
  if (!iso) return t("dateUnknown");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("dateUnknown");
  const locale = currentLang === "fr" ? "fr-FR" : "en-GB";
  try {
    return d.toLocaleString(locale, {
      day:"2-digit", month:"2-digit", year:"numeric",
      hour:"2-digit", minute:"2-digit"
    });
  } catch (_) {
    return d.toLocaleString(locale);
  }
}


function renderExchangeInfo() {
  if (!exchangeInfo) return;
  if (!lastExchange || typeof lastExchange !== "object") {
    exchangeInfo.textContent = t("lastExchangeNone");
    return;
  }
  const action = lastExchange.type === "import" ? "Import" : "Export";
  const backupLabel = backupTypeLabel(lastExchange.backupType || "full");
  const version = lastExchange.appVersion || t("versionUnknown");
  const modified = formatDateTime(lastExchange.lastModifiedAt || lastExchange.exportedAt);
  exchangeInfo.textContent = `${action} · ${backupLabel} · ${t("modified")} ${modified} · ${version}`;
}

function applyModeToSharedTools() {
  // "Lecture" locks personal answers, not shared couple tools.
  safetyFields.forEach(el => { el.disabled = false; });
  importJsonBtn.disabled = false; importJsonBtn.title = "";
  resetChecklistBtn.disabled = isReadingMode; resetChecklistBtn.title = isReadingMode ? (currentLang === "fr" ? "Passez en Édition pour réinitialiser toutes les données." : "Switch to Edit to reset all data.") : "";
  resetSessionBtn.disabled = variantSessionOrder.length === 0; resetSessionBtn.title = "";
}


function firstUseGuideCopy() {
  if (currentLang === "fr") {
    return {
      kicker:"Première utilisation",
      title:"Remplissez d’abord séparément, puis fusionnez",
      intro:"Pour limiter l’influence des réponses de l’autre, chaque personne peut remplir sa partie de son côté, idéalement sur son propre appareil.",
      cards:[
        ["1 · Chacun de son côté","La Personne A et la Personne B renseignent chacune leurs propres choix sans voir ceux de l’autre : intérêt, donner/recevoir ou rôle D/s selon la pratique."],
        ["2 · Édition vraiment individuelle","Le mode Édition n’affiche que les choix de la personne active. Passez ensuite en Lecture pour croiser les réponses et renseigner les données communes."],
        ["3 · Fusionnez avec les sauvegardes","Exportez 🔵 Personne A ou 🟣 Personne B, envoyez le JSON à l’autre appareil puis utilisez 📂 Restaurer. L’import remplace uniquement les réponses personnelles de la personne concernée."],
        ["4 · Vérifiez ensemble avant une séance","En mode Lecture, relisez les résultats, marquez les configurations déjà faites, préparez la séance et vérifiez surtout Sécurité / limites / aftercare."]
      ],
      local:"Séance, ordre de séance, niveau d’exploration, affichage et réglages du tirage restent locaux lors d’un échange Personne A/B. Une sauvegarde 💾 Complète permet ensuite d’aligner entièrement deux appareils.",
      understand:"J’ai compris",
      guide:"Lire le mode d’emploi complet",
      once:"Ce message n’apparaît automatiquement qu’une fois sur cet appareil. Le mode d’emploi reste accessible avec « ? »."
    };
  }
  return {
    kicker:"First use",
    title:"Fill your answers separately first, then merge",
    intro:"To reduce influence from the other person’s answers, each person can fill their own part separately, preferably on their own device.",
    cards:[
      ["1 · Fill separately","Person A and Person B each fill only their own interest, give/receive or D/s-role answers, depending on the practice."],
      ["2 · Truly individual editing","Edit mode shows only the active person’s answers. Then switch to Reading to compare answers and manage shared couple data."],
      ["3 · Merge with backups","Export 🔵 Person A or 🟣 Person B, send the JSON file to the other device, then use 📂 Restore. The import replaces only that person’s personal answers."],
      ["4 · Review together before a session","In Reading mode, review the results, mark configurations already done, prepare the session, and especially verify Safety / limits / aftercare."]
    ],
    local:"Session selection/order, exploration level, display and random-draw settings remain local during Person A/B exchanges. A 💾 Full backup can then be used to align both devices completely.",
    understand:"Got it",
    guide:"Read the complete user guide",
    once:"This message is shown automatically only once on this device. The complete guide remains available from “?”."
  };
}

function ensureFirstUseGuide() {
  if (onboardingModal) return;
  const wrap = document.createElement("div");
  wrap.className = "first-use-modal";
  wrap.hidden = true;
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = `<div class="first-use-backdrop"></div>
    <section class="first-use-dialog" role="dialog" aria-modal="true" aria-labelledby="firstUseTitle">
      <div class="first-use-kicker" data-first-use-kicker></div>
      <h2 id="firstUseTitle" data-first-use-title></h2>
      <p class="first-use-intro" data-first-use-intro></p>
      <div class="first-use-grid" data-first-use-grid></div>
      <p class="first-use-local" data-first-use-local></p>
      <div class="first-use-actions">
        <button class="first-use-primary" type="button" data-first-use-understand></button>
        <button class="first-use-secondary" type="button" data-first-use-guide></button>
      </div>
      <p class="first-use-once" data-first-use-once></p>
    </section>`;
  document.body.appendChild(wrap);
  onboardingModal = wrap;
  onboardingDialog = wrap.querySelector(".first-use-dialog");

  wrap.querySelector("[data-first-use-understand]").addEventListener("click", () => closeFirstUseGuide(true));
  wrap.querySelector("[data-first-use-guide]").addEventListener("click", () => {
    closeFirstUseGuide(true, false);
    openHelpModal();
  });
  updateFirstUseGuideLanguage();
}

function updateFirstUseGuideLanguage() {
  if (!onboardingModal) return;
  const c = firstUseGuideCopy();
  onboardingModal.querySelector("[data-first-use-kicker]").textContent = c.kicker;
  onboardingModal.querySelector("[data-first-use-title]").textContent = c.title;
  onboardingModal.querySelector("[data-first-use-intro]").textContent = c.intro;
  onboardingModal.querySelector("[data-first-use-local]").textContent = c.local;
  onboardingModal.querySelector("[data-first-use-understand]").textContent = c.understand;
  onboardingModal.querySelector("[data-first-use-guide]").textContent = c.guide;
  onboardingModal.querySelector("[data-first-use-once]").textContent = c.once;
  onboardingModal.querySelector("[data-first-use-grid]").innerHTML = c.cards.map(([title,text]) =>
    `<div class="first-use-card"><strong>${esc(title)}</strong><span>${esc(text)}</span></div>`
  ).join("");
}

function markFirstUseSeen() {
  try { localStorage.setItem(ONBOARDING_KEY, "true"); } catch (_) {}
}

function closeFirstUseGuide(markSeen=true, restoreFocus=true) {
  if (!onboardingModal || onboardingModal.hidden) return;
  if (markSeen) markFirstUseSeen();
  onboardingModal.hidden = true;
  onboardingModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("first-use-open");
  setAppBackgroundInert(false);
  if (restoreFocus && openHelpBtn) openHelpBtn.focus();
}

function showFirstUseGuideIfNeeded() {
  if (document.documentElement.classList.contains("adult-gate-required")) return;
  const profile = window.CHECKLIST_PROFILE_API?.get?.();
  if (profile && profile.anatomyConfigured !== true) return;
  let seen = false;
  try { seen = localStorage.getItem(ONBOARDING_KEY) === "true"; } catch (_) {}
  if (seen) return;
  ensureFirstUseGuide();
  updateFirstUseGuideLanguage();
  onboardingModal.hidden = false;
  onboardingModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("first-use-open");
  setAppBackgroundInert(true);
  requestAnimationFrame(() => {
    const btn = onboardingModal.querySelector("[data-first-use-understand]");
    if (btn) btn.focus();
  });
}

function mergeReviewCopy(type) {
  const whoFr = (type === "male" || type === "person-a") ? "Personne A" : "Personne B";
  const whoEn = (type === "male" || type === "person-a") ? "Person A" : "Person B";
  return currentLang === "fr" ? {
    title:`✓ Réponses ${whoFr} fusionnées`,
    text:"Avant de préparer une séance, vérifiez ensemble « Fait ensemble », les notes A:/B: et surtout Sécurité / limites / aftercare.",
    open:"Vérifier la sécurité",
    close:"Fermer"
  } : {
    title:`✓ ${whoEn} answers merged`,
    text:"Before preparing a session, review Done together, A:/B: notes and especially Safety / limits / aftercare together.",
    open:"Review safety",
    close:"Dismiss"
  };
}

function readPendingMergeReview() {
  try {
    const raw = sessionStorage.getItem(MERGE_REVIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && ["male","female","person-a","person-b"].includes(parsed.type) ? parsed : null;
  } catch (_) { return null; }
}

function updateMergeReviewBannerLanguage() {
  if (!mergeReviewBanner) return;
  const pending = readPendingMergeReview();
  if (!pending) return;
  const c = mergeReviewCopy(pending.type);
  mergeReviewBanner.querySelector("[data-merge-title]").textContent = c.title;
  mergeReviewBanner.querySelector("[data-merge-text]").textContent = c.text;
  mergeReviewBanner.querySelector("[data-merge-open]").textContent = c.open;
  mergeReviewBanner.querySelector("[data-merge-close]").textContent = c.close;
}

function dismissMergeReviewBanner() {
  try { sessionStorage.removeItem(MERGE_REVIEW_KEY); } catch (_) {}
  if (mergeReviewBanner) mergeReviewBanner.remove();
  mergeReviewBanner = null;
}

function renderMergeReviewBanner() {
  const pending = readPendingMergeReview();
  if (!pending || mergeReviewBanner) return;
  const banner = document.createElement("aside");
  banner.className = "merge-review-banner";
  banner.setAttribute("role", "status");
  banner.innerHTML = `<div class="merge-review-copy"><strong data-merge-title></strong><span data-merge-text></span></div>
    <div class="merge-review-actions"><button type="button" data-merge-open></button><button type="button" data-merge-close></button></div>`;
  const header = document.querySelector("header");
  if (header) header.insertAdjacentElement("afterend", banner); else document.body.prepend(banner);
  mergeReviewBanner = banner;
  updateMergeReviewBannerLanguage();
  banner.querySelector("[data-merge-open]").addEventListener("click", () => {
    if (allTools) allTools.open = true;
    const safety = document.querySelector(".safety-tool-section");
    if (safety) requestAnimationFrame(() => safety.scrollIntoView({behavior:"smooth", block:"start"}));
  });
  banner.querySelector("[data-merge-close]").addEventListener("click", dismissMergeReviewBanner);
}

function renderRoleChoiceLabel(btn) {
  const person = btn.dataset.personChoice === "person-b" ? "person-b" : "person-a";
  const profile = window.CHECKLIST_PROFILE_API?.get?.();
  const name = person === "person-a"
    ? (profile?.personA?.name || (currentLang === "fr" ? "Personne A" : "Person A"))
    : (profile?.personB?.name || (currentLang === "fr" ? "Personne B" : "Person B"));
  const nameEl = document.createElement("span");
  nameEl.className = "role-choice-name";
  nameEl.textContent = name;
  const roleEl = document.createElement("small");
  roleEl.className = "role-choice-ds";
  roleEl.textContent = currentLang === "fr" ? "Mes réponses" : "My answers";
  btn.replaceChildren(nameEl, roleEl);
}

function renderRoleUI() {

  for (const btn of roleButtons) {
    const active = btn.dataset.personChoice === activeEditPerson;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    renderRoleChoiceLabel(btn);
  }


  document.body.dataset.viewMode = isReadingMode ? "read" : "edit";
  document.body.dataset.activeEditPerson = activeEditPerson;
  if (!isReadingMode && readerHeaderDs) readerHeaderDs.hidden=true;
  if (modeEditBtn) {
    modeEditBtn.textContent = currentLang === "fr" ? "✏️ Édition" : "✏️ Edit";
    modeEditBtn.classList.toggle("active", !isReadingMode);
    modeEditBtn.setAttribute("aria-pressed", !isReadingMode ? "true" : "false");
  }
  if (modeReadBtn) {
    modeReadBtn.textContent = currentLang === "fr" ? "👁 Lecture" : "👁 Reading";
    modeReadBtn.classList.toggle("active", isReadingMode);
    modeReadBtn.setAttribute("aria-pressed", isReadingMode ? "true" : "false");
  }

  if (statModeEl) {
    const profile = window.CHECKLIST_PROFILE_API?.get?.();
    const name = activeEditPerson === "person-a" ? profile?.personA?.name : profile?.personB?.name;
    statModeEl.textContent = isReadingMode ? `${t("mode")} : ${t("readOnlySuffix")}` : `${t("mode")} : ${name || (activeEditPerson === "person-a" ? "A" : "B")}`;
  }

  applyModeToSharedTools();
  renderSessionPanel();
}

function setActivePerson(person) {
  flushPersonalNoteSaves();
  const normalized = person === "person-b" ? "person-b" : "person-a";
  if (normalized === activeEditPerson) return;
  activeEditPerson = normalized;
  V2_STORAGE.setDisplay("activeEditPerson", activeEditPerson, false);
  renderRoleUI();
  render();
}

for (const btn of roleButtons) {
  btn.addEventListener("click", () => setActivePerson(btn.dataset.personChoice));
}

for (const btn of languageButtons) {
  btn.addEventListener("click", () => setLanguage(btn.dataset.langChoice, true));
}

openHelpBtn.addEventListener("click", openHelpModal);
closeHelpBtn.addEventListener("click", closeHelpModal);


if (document.documentElement.classList.contains("adult-gate-required")) {
  setAppBackgroundInert(true);
  requestAnimationFrame(() => {
    const langClass = currentLang === "fr" ? ".adult-lang-fr" : ".adult-lang-en";
    const btn = adultGate && adultGate.querySelector(`${langClass} [data-adult-accept]`);
    if (btn) btn.focus();
  });
}

document.querySelectorAll("[data-adult-accept]").forEach(btn => btn.addEventListener("click", acceptAdultGate));
document.querySelectorAll("[data-adult-exit]").forEach(btn => btn.addEventListener("click", leaveAdultGate));

document.querySelectorAll("[data-info-open]").forEach(btn => {
  btn.addEventListener("click", () => openInfoModal(btn.dataset.infoOpen || "adult", btn));
});
if (closeInfoModalBtn) closeInfoModalBtn.addEventListener("click", closeInfoModal);
if (infoModal) {
  infoModal.addEventListener("click", e => {
    if (e.target && e.target.dataset && e.target.dataset.infoClose === "true") closeInfoModal();
  });
}

document.addEventListener("click",e=>{
  const risk=e.target.closest?.("[data-risk-info]");
  if(risk){ e.preventDefault(); e.stopPropagation(); openRiskInfo(risk.dataset.riskInfo,risk); }
});

document.addEventListener("keydown", e => {
  if (riskInfoOverlay && !riskInfoOverlay.hidden) {
    if(e.key==="Escape"){ e.preventDefault(); closeRiskInfo(); return; }
    focusTrapIn(riskInfoOverlay.querySelector(".risk-info-dialog"),e); return;
  }
  if (onboardingModal && !onboardingModal.hidden) {
    if (e.key === "Escape") { e.preventDefault(); closeFirstUseGuide(true); return; }
    focusTrapIn(onboardingDialog, e);
    return;
  }
  if (document.documentElement.classList.contains("adult-gate-required")) {
    if (e.key === "Escape") { e.preventDefault(); return; }
    focusTrapIn(adultGateDialog, e);
    return;
  }
  if (infoModal && !infoModal.hidden) {
    if (e.key === "Escape") { e.preventDefault(); closeInfoModal(); return; }
    focusTrapIn(infoModal.querySelector(".info-modal-dialog"), e);
  }
});

helpModal.addEventListener("click", (e) => {
  if (e.target.closest("[data-help-close='true']")) {
    closeHelpModal();
    return;
  }

  const jump = e.target.closest("[data-help-target]");
  if (jump) {
    const target = document.getElementById(jump.dataset.helpTarget);
    if (target) target.scrollIntoView({behavior:"smooth", block:"start"});
  }
});

document.addEventListener("keydown", (e) => {
  if (helpModal && !helpModal.hidden) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeHelpModal();
      return;
    }
    focusTrapIn(helpModal.querySelector(".help-dialog"), e);
  }
});

function setViewMode(mode) {
  flushPersonalNoteSaves();
  const next = mode === "read";
  if (next === isReadingMode) return;
  isReadingMode = next;
  V2_STORAGE.setDisplay("readOnly", isReadingMode, false);
  sessionOnlyFilter = false;
  status.dataset.readerLang = "";
  renderRoleUI(); render();
  if (sessionMode && !sessionMode.hidden) renderSessionMode();
}
if (modeEditBtn) modeEditBtn.addEventListener("click",()=>setViewMode("edit"));
if (modeReadBtn) modeReadBtn.addEventListener("click",()=>setViewMode("read"));

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function profilePersonSide(person) {
  return (person === 'person-b' || person === 'personB') ? 'person-b' : 'person-a';
}
function profilePersonClass(person) {
  return profilePersonSide(person) === 'person-b' ? 'person-b' : 'person-a';
}
function profilePersonName(person, names = null) {
  const side = profilePersonSide(person);
  if (names) return side === 'person-b' ? names.personB : names.personA;
  const profile = window.CHECKLIST_PROFILE_API?.get?.() || {};
  if (side === 'person-b') return profile.personB?.name || (currentLang === 'fr' ? 'Personne B' : 'Person B');
  return profile.personA?.name || (currentLang === 'fr' ? 'Personne A' : 'Person A');
}
function profileNameBadge(person, label = null, compact = false) {
  const name = label == null ? profilePersonName(person) : label;
  const cls = `${compact ? 'profile-inline-name is-compact' : 'profile-inline-name'} ${profilePersonClass(person)}`;
  return `<span class="${cls}">${esc(name)}</span>`;
}
function readerDsChipHtml(value, names = readerNames()) {
  const person = value === 'b-dominant' ? 'person-b' : 'person-a';
  const verb = currentLang === 'fr' ? 'domine' : 'dominant';
  return `${profileNameBadge(person, profilePersonName(person, names), true)} <span class="profile-inline-text">${esc(verb)}</span>`;
}
function readerFlowHtml(entity, variant, names = readerNames()) {
  if (variant === INTERACTION_MODEL.VARIANT.A_TO_B || variant === INTERACTION_MODEL.VARIANT.A_DOMINANT) return `${profileNameBadge('person-a', names.personA, true)} <span class="flow-arrow">→</span> ${profileNameBadge('person-b', names.personB, true)}`;
  if (variant === INTERACTION_MODEL.VARIANT.B_TO_A || variant === INTERACTION_MODEL.VARIANT.B_DOMINANT) return `${profileNameBadge('person-b', names.personB, true)} <span class="flow-arrow">→</span> ${profileNameBadge('person-a', names.personA, true)}`;
  return `${profileNameBadge('person-a', names.personA, true)} <span class="flow-arrow">+</span> ${profileNameBadge('person-b', names.personB, true)}`;
}
function variantEntryKey(entryOrPracticeId, variant=null) {
  if (typeof entryOrPracticeId === "object" && entryOrPracticeId) return `${entryOrPracticeId.practiceId}|${entryOrPracticeId.variant}`;
  return `${entryOrPracticeId}|${variant}`;
}
function refreshVariantSessionSet() {
  variantSessionKeySet = new Set(variantSessionOrder.map(entry => variantEntryKey(entry)));
}
function saveVariantSessionOrder() {
  refreshVariantSessionSet();
  V2_STORAGE.setSessionEntries?.(variantSessionOrder);
}
function isVariantInSession(practiceId, variant) {
  return variantSessionKeySet.has(variantEntryKey(practiceId,variant));
}
// Compatibility adapter retained for legacy migrations only.
function sessionEntryData(entry) {
  const entity=UNIFIED_ENTITY_BY_ID.get(entry?.practiceId); if(!entity) return null;
  const profile=window.CHECKLIST_PROFILE_API?.get?.()||{};
  const practiceResponse=V2_STORAGE.getReaderPractice(entity.id);
  const pair=INTERACTION_MODEL.readingPair(entity,entry.variant,practiceResponse,profile);
  if(!pair) return null;
  const info=readerVariantInfo(entity,entry.variant);
  return {entry,entity,pair,info,key:variantEntryKey(entry)};
}
let lastSessionPanelSignature = "";
function renderSessionPanel(force=false) {
  if (!sessionList || !sessionSummary) return;
  variantSessionOrder=(V2_STORAGE.getAllSessionEntries?.()||variantSessionOrder).filter(entry=>UNIFIED_ENTITY_BY_ID.has(entry.practiceId));
  refreshVariantSessionSet();
  const selected=variantSessionOrder.map(sessionEntryData).filter(Boolean);
  const signature=[currentLang,...selected.map(x=>`${x.key}:${x.pair.compatibility?.status}:${x.pair.common?.doneTogether?1:0}`)].join("|");
  if(!force&&signature===lastSessionPanelSignature){if(sessionMode&&!sessionMode.hidden)renderSessionMode();return;}
  lastSessionPanelSignature=signature;
  const fantasies=selected.filter(x=>x.pair.compatibility?.status==="fantasy").length;
  sessionSummary.textContent=selected.length
    ? (currentLang==="fr"?`${selected.length} configuration${selected.length>1?'s':''} dans la séance${fantasies?` · ${fantasies} fantasme${fantasies>1?'s':''}`:''}.`:`${selected.length} configuration${selected.length>1?'s':''} in the session${fantasies?` · ${fantasies} fantas${fantasies>1?'ies':'y'}`:''}.`)
    : t("sessionNone");
  showSessionBtn.disabled=selected.length===0; openSessionModeBtn.disabled=selected.length===0; resetSessionBtn.disabled=selected.length===0;
  sessionList.innerHTML=selected.map((x,index)=>{
    const fantasy=x.pair.compatibility?.status==="fantasy";
    return `<div class="session-item${fantasy?' is-fantasy':''}" data-session-key="${esc(x.key)}">
      <span class="session-index">${index+1}</span>
      <span class="session-name"><strong>${esc(x.info.title||x.entity.id)}</strong><small>${esc(readerVariantLabel(x.entity,x.entry.variant))}</small></span>
      ${x.info.risk!=="normal"?riskBadge({risk:x.info.risk}):""}
      ${fantasy?`<span class="fantasy-session-badge">💭 ${esc(t("fantasyOnlyShort"))}</span>`:""}
      <button class="session-move" data-session-action="up" data-session-index="${index}" type="button" ${index===0?'disabled':''} title="${t("moveUp")}">↑</button>
      <button class="session-move" data-session-action="down" data-session-index="${index}" type="button" ${index===selected.length-1?'disabled':''} title="${t("moveDown")}">↓</button>
      <button class="session-remove" data-session-action="remove" data-session-index="${index}" type="button" title="${t("removeSession")}">×</button>
    </div>`;
  }).join("");
  if(sessionMode&&!sessionMode.hidden)renderSessionMode();
}

function renderSessionSafetySummary() {
  const safety = getSafety();
  const entries = [];
  const push = (label, value) => { const clean=typeof value==="string"?value.trim():value; if(clean) entries.push(`<div class="session-safety-item"><strong>${esc(label)} :</strong> ${esc(clean)}</div>`); };
  push(t("slowWordLabel"), safety.slowWord); push(t("safeWordLabel"), safety.safeWord); push(t("slowSignalLabel"), safety.slowSignal); push(t("stopSignalLabel"), safety.stopSignal);
  const marksEl=document.getElementById("marks"),mediaEl=document.getElementById("media");
  push(t("marksLabel"),safety.marks&&marksEl?.selectedOptions?.[0]?marksEl.selectedOptions[0].textContent:safety.marks); push(t("hardLimitsLabel"),safety.hardLimits); push(t("aftercareLabel"),safety.aftercare); push(t("mediaLabel"),safety.media&&mediaEl?.selectedOptions?.[0]?mediaEl.selectedOptions[0].textContent:safety.media);
  if(safety.stopImmediate)push(t("stopImmediate"),currentLang==="fr"?"Oui":"Yes"); if(safety.noIntoxication)push(t("noIntoxication"),currentLang==="fr"?"Oui":"Yes"); if(safety.nextDayDebrief)push(t("nextDayDebrief"),currentLang==="fr"?"Oui":"Yes");
  sessionSafetySummary.innerHTML=entries.length?`<div class="session-safety-grid">${entries.join("")}</div>`:`<div class="session-safety-item">${esc(t("sessionSafetyEmpty"))}</div>`;
}
function renderSessionMode() {
  if(!sessionModeList||!sessionSafetySummary)return; renderSessionSafetySummary();
  const selected=variantSessionOrder.map(sessionEntryData).filter(Boolean);
  if(!selected.length){sessionModeList.innerHTML=`<div class="empty">${esc(t("sessionModeEmpty"))}</div>`;return;}
  sessionModeList.innerHTML=selected.map((x,index)=>{
    const fantasy=x.pair.compatibility?.status==="fantasy",limit=x.pair.compatibility?.status==="limit",done=x.pair.common?.doneTogether===true;
    const names=readerNames();
    return `<article class="session-mode-card${fantasy?' fantasy-only':''}${limit?' has-limit':''}" data-session-key="${esc(x.key)}" style="--category-color:${categoryColors[x.info.category]||'#9aa0a6'}">
      <div class="session-mode-card-head"><span class="session-mode-index">${index+1}</span><div class="session-mode-title-wrap"><div class="session-mode-category">${esc(localizedCategory(x.info.category))}</div><div class="session-mode-practice">${esc(x.info.title)} ${x.info.risk!=="normal"?riskBadge({risk:x.info.risk}):""}</div><div class="session-mode-variant">${esc(readerVariantLabel(x.entity,x.entry.variant,names))}</div></div><div class="session-mode-meta"><span class="session-mode-compat">${esc(readerCompatibilityLabel(x.pair.compatibility?.status||'incomplete'))}</span></div></div>
      ${fantasy?`<div class="session-mode-fantasy-banner">${esc(t("sessionFantasyBanner"))}</div>`:""}
      <div class="session-mode-expl">${esc(x.info.explanation||"")}</div>
      <div class="session-mode-couple-grid">${readerPersonPanel(names.personA,"person-a",x.pair.personA.slot,x.pair.personA.state)}${readerPersonPanel(names.personB,"person-b",x.pair.personB.slot,x.pair.personB.state)}</div>
      <label class="session-mode-together" ${fantasy||limit?`title="${esc(fantasy?t("fantasyTogetherDisabled"):(currentLang==='fr'?'Une limite empêche de marquer cette configuration comme faite ensemble.':'A limit prevents marking this configuration as done together.'))}"`:""}><input type="checkbox" data-session-mode-together data-practice-id="${esc(x.entry.practiceId)}" data-variant="${esc(x.entry.variant)}" ${done?'checked':''} ${fantasy||limit?'disabled':''}><span>${esc(t("sessionDoneTogetherLabel"))}</span></label>
    </article>`;
  }).join("");
}
let sessionModePreviousFocus=null;
function openSessionMode(){if(!variantSessionOrder.length)return;sessionModePreviousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;renderSessionMode();sessionMode.hidden=false;sessionMode.setAttribute("aria-hidden","false");document.body.classList.add("session-mode-open");setAppBackgroundInert(true);closeSessionModeBtn.focus();}
function closeSessionMode(){sessionMode.hidden=true;sessionMode.setAttribute("aria-hidden","true");document.body.classList.remove("session-mode-open");setAppBackgroundInert(false);render();if(sessionModePreviousFocus&&document.contains(sessionModePreviousFocus))sessionModePreviousFocus.focus();sessionModePreviousFocus=null;}
function toggleSessionVariant(practiceId,variant){const key=variantEntryKey(practiceId,variant),index=variantSessionOrder.findIndex(entry=>variantEntryKey(entry)===key);if(index>=0)variantSessionOrder.splice(index,1);else variantSessionOrder.push({practiceId,variant});saveVariantSessionOrder();renderSessionPanel(true);}
function moveSessionEntry(index,direction){const target=direction==="up"?index-1:index+1;if(index<0||target<0||index>=variantSessionOrder.length||target>=variantSessionOrder.length)return;[variantSessionOrder[index],variantSessionOrder[target]]=[variantSessionOrder[target],variantSessionOrder[index]];saveVariantSessionOrder();renderSessionPanel(true);}
const scoreUiCache = new Map();
function cachedScoreUi(value, role=null) {
  const key = `${currentLang}|${role || "none"}|${value}`;
  if (scoreUiCache.has(key)) return scoreUiCache.get(key);
  const ui = Object.freeze({
    label:scoreButtonLabel(value, role),
    title:esc(scoreChoiceTitle(value, role))
  });
  scoreUiCache.set(key, ui);
  return ui;
}


const individualEditor = document.getElementById("individualEditor");
const individualEditorList = document.getElementById("individualEditorList");
const individualEditorEmpty = document.getElementById("individualEditorEmpty");
const individualEditorTitle = document.getElementById("individualEditorTitle");
const individualEditorIntro = document.getElementById("individualEditorIntro");
const individualEditorProgress = document.getElementById("individualEditorProgress");
const individualEditorLegend = document.getElementById("individualEditorLegend");
const individualEditorProfile = document.getElementById("individualEditorProfile");
const individualEditorCollapseAll = document.getElementById("individualEditorCollapseAll");
const individualEditorExpandAll = document.getElementById("individualEditorExpandAll");
const coupleReader = document.getElementById("coupleReader");
const coupleReaderList = document.getElementById("coupleReaderList");
const coupleReaderEmpty = document.getElementById("coupleReaderEmpty");
const coupleReaderTitle = document.getElementById("coupleReaderTitle");
const coupleReaderIntro = document.getElementById("coupleReaderIntro");
const coupleReaderSummary = document.getElementById("coupleReaderSummary");
const coupleReaderLegend = document.getElementById("coupleReaderLegend");
if (individualEditorProfile) individualEditorProfile.addEventListener("click", () => window.CHECKLIST_PROFILE_API?.open?.());
if (individualEditorCollapseAll) individualEditorCollapseAll.addEventListener("click", () => {
  const cats=[...new Set(CATALOG_ENTITIES.map(entity=>entity.category).filter(Boolean))];
  collapsedCategories=new Set(cats);
  saveCollapsedCategories();
  render();
});
if (individualEditorExpandAll) individualEditorExpandAll.addEventListener("click", () => {
  collapsedCategories.clear();
  saveCollapsedCategories();
  render();
});

function modelPersonKey() { return activeEditPerson === "person-b" ? "personB" : "personA"; }
function editorProfileName(person=modelPersonKey()) {
  const p=window.CHECKLIST_PROFILE_API?.get?.();
  return person === "personA" ? (p?.personA?.name || (currentLang==="fr"?"Personne A":"Person A")) : (p?.personB?.name || (currentLang==="fr"?"Personne B":"Person B"));
}
function legacyBlockForEditorSlot(entity, person, slot) {
  for (const [legacySourceKey,scenarioName] of [["aDom","a-dom"],["bDom","b-dom"]]) {
    if (INTERACTION_MODEL.slotForLegacyPerson(entity,scenarioName,person) === slot && entity?.scenarios?.[legacySourceKey]) return {block:entity.scenarios[legacySourceKey],legacySourceKey};
  }
  const firstKey = entity?.scenarios?.aDom ? "aDom" : entity?.scenarios?.bDom ? "bDom" : null;
  return firstKey ? {block:entity.scenarios[firstKey],legacySourceKey:firstKey} : {block:null,legacySourceKey:null};
}
function personalizeLegacyText(text, legacySourceKey) {
  let out=String(text||""); const p=window.CHECKLIST_PROFILE_API?.get?.(); if(!p) return out;
  const a=p.personA?.name||"A", b=p.personB?.name||"B";
  const dom=legacySourceKey==="bDom"?b:a, sub=legacySourceKey==="bDom"?a:b;
  const replacements=[
    [/\b(?:le |la )?Ma[iî]tre(?:sse)?\b/gi,dom],[/\b(?:du |de la )Ma[iî]tre(?:sse)?\b/gi,dom],
    [/\b(?:le |la )?Soumis(?:e)?\b/gi,sub],[/\b(?:du |de la )Soumis(?:e)?\b/gi,sub],
    [/\b(?:the )?Master\b/gi,dom],[/\b(?:the )?Mistress\b/gi,dom],[/\b(?:the )?Submissive\b/gi,sub]
  ];
  for(const [re,value] of replacements) out=out.replace(re,value);
  return out;
}
const localizedLegacyInfoCache = new Map();
function localizedLegacyInfo(entity, legacySourceKey) {
  const block=legacySourceKey ? entity?.scenarios?.[legacySourceKey] : null;
  if(!block) return {title:"",explanation:"",category:"Autres",level:3,risk:"normal"};
  const profile=window.CHECKLIST_PROFILE_API?.get?.()||{};
  const cacheKey=[currentLang,profile.personA?.name||"",profile.personB?.name||"",entity.id,legacySourceKey].join("|");
  const cached=localizedLegacyInfoCache.get(cacheKey);
  if(cached) return cached;
  const info=Object.freeze({
    title:personalizeLegacyText(currentLang==="en"?(block.practiceEn||block.practice):(block.practice||block.practiceEn),legacySourceKey),
    explanation:personalizeLegacyText(currentLang==="en"?(block.explanationEn||block.explanation):(block.explanation||block.explanationEn),legacySourceKey),
    category:block.category||"Autres",
    level:Number.isInteger(block.level)?block.level:3,
    risk:["normal","caution","high"].includes(block.risk)?block.risk:"normal"
  });
  localizedLegacyInfoCache.set(cacheKey,info);
  return info;
}
function editorSlotLabel(slot) {
  if(currentLang==="fr") return ({interest:"INTÉRÊT",give:"DONNER",receive:"RECEVOIR",dominant:"DOM",submissive:"SUB"})[slot]||slot;
  return ({interest:"INTEREST",give:"GIVE",receive:"RECEIVE",dominant:"DOM",submissive:"SUB"})[slot]||slot;
}
function editorSlotsForEntity(entity, person, profile) {
  let slots=INTERACTION_MODEL.visibleSlots(entity,person,profile);
  if(INTERACTION_MODEL.axisOf(entity)===INTERACTION_MODEL.AXIS.ROLE && profile?.dynamic?.mode!=="switch") {
    const dominant = profile?.dynamic?.mode==="a-dom"?"personA":profile?.dynamic?.mode==="b-dom"?"personB":null;
    if(dominant) slots=slots.filter(slot => slot === (person===dominant ? INTERACTION_MODEL.SLOT.DOMINANT : INTERACTION_MODEL.SLOT.SUBMISSIVE));
  }
  return slots;
}
function editorEntityInfo(entity, person, slots) {
  const preferred=legacyBlockForEditorSlot(entity,person,slots[0]||INTERACTION_MODEL.slotsForEntity(entity)[0]);
  return localizedLegacyInfo(entity,preferred.legacySourceKey);
}
function editorScoreButtons(v2Id,slot,state) {
  const role = slot===INTERACTION_MODEL.SLOT.DOMINANT?"dom":slot===INTERACTION_MODEL.SLOT.SUBMISSIVE?"sub":null;
  const unknown=`<button class="score-btn unknown-score${Number.isInteger(state.preference)?"":" selected"}" data-personal-action="preference" data-v2-id="${esc(v2Id)}" data-slot="${slot}" data-score="unknown" type="button" title="${esc(t("unknown"))}">?</button>`;
  return unknown+SCORE_BUTTON_ORDER.map(n=>{const ui=cachedScoreUi(n,role),sel=state.preference===n;return `<button class="score-btn semantic-score-btn${n===0?' limit-score':''}${sel?' selected':''}" data-personal-action="preference" data-v2-id="${esc(v2Id)}" data-slot="${slot}" data-score="${n}" type="button" title="${ui.title}" aria-pressed="${sel?'true':'false'}">${ui.label}</button>`}).join("");
}
function editorAfterButtons(v2Id,slot,state) {
  const role = slot===INTERACTION_MODEL.SLOT.DOMINANT?"dom":slot===INTERACTION_MODEL.SLOT.SUBMISSIVE?"sub":null;
  const unknown=`<button class="score-btn unknown-score${Number.isInteger(state.after)?"":" selected"}" data-personal-action="after" data-v2-id="${esc(v2Id)}" data-slot="${slot}" data-score="unknown" type="button">?</button>`;
  return unknown+SCORE_BUTTON_ORDER.map(n=>{const ui=cachedScoreUi(n,role),sel=state.after===n;return `<button class="score-btn semantic-score-btn${n===0?' limit-score':''}${sel?' selected':''}" data-personal-action="after" data-v2-id="${esc(v2Id)}" data-slot="${slot}" data-score="${n}" type="button" title="${ui.title}" aria-pressed="${sel?'true':'false'}">${ui.label}</button>`}).join("");
}
function renderEditorSlot(entity,person,slot,profile,state=V2_STORAGE.getPersonalSlotState(entity.id,person,slot)||{}) {
  const applicability=INTERACTION_MODEL.evaluateSlot(entity,person,slot,profile);
  const incompatible=applicability.status==="notApplicable";
  const incompatTitle=currentLang==="fr"?"Anatomie non compatible":"Anatomy not compatible";
  const hasNote=typeof state.note==="string"&&state.note.trim().length>0;
  const noteTitle=currentLang==="fr"?(hasNote?"Ouvrir la note renseignée":"Ajouter une note"):(hasNote?"Open saved note":"Add a note");
  const showAfter=state.prior===true||Number.isInteger(state.after);
  return `<section class="individual-slot${incompatible?' is-incompatible':''}" data-editor-slot="${slot}">
    <div class="individual-slot-main">
      <div class="individual-slot-label-wrap"><strong class="individual-slot-label">${esc(editorSlotLabel(slot))}</strong>${incompatible?`<span class="individual-applicability" title="${esc(incompatTitle)}" aria-label="${esc(incompatTitle)}">⚠</span>`:""}</div>
      <div class="individual-score-row">${editorScoreButtons(entity.id,slot,state)}</div>
      <div class="individual-slot-tools">
        <button class="individual-prior${state.prior?' checked':''}" data-personal-action="prior" data-v2-id="${esc(entity.id)}" data-slot="${slot}" type="button" aria-pressed="${state.prior?'true':'false'}" title="${currentLang==="fr"?"Déjà essayé":"Already tried"}"><span>${state.prior?'✓':'□'}</span><span class="individual-prior-text">${currentLang==="fr"?"Essayé":"Tried"}</span></button>
        <button class="individual-note-toggle${hasNote?' has-note':''}" data-personal-note-toggle type="button" aria-expanded="false" aria-label="${esc(noteTitle)}" title="${esc(noteTitle)}"><span aria-hidden="true">📝</span>${hasNote?'<i aria-hidden="true"></i>':''}</button>
      </div>
    </div>
    ${showAfter?`<div class="individual-after"><span class="individual-field-label">${currentLang==="fr"?"Après":"After"}</span><div class="individual-score-row">${editorAfterButtons(entity.id,slot,state)}</div></div>`:""}
    <label class="individual-note-panel" hidden><span>${currentLang==="fr"?"Note personnelle":"Personal note"}</span><textarea data-personal-note data-v2-id="${esc(entity.id)}" data-slot="${slot}" placeholder="${currentLang==="fr"?"Note personnelle…":"Personal note…"}">${esc(state.note||"")}</textarea></label>
  </section>`;
}

function configureEditorStatusOptions() {
  const langKey=`edit-${currentLang}`; if(status.dataset.readerLang===langKey) return;
  const previous=status.value;
  const options=currentLang==="fr"?[["","Tous mes choix"],["incomplete","? À compléter"],["want","🔥 Envie ou favori"],["favorite","👑 Favoris"],["fantasy","💭 Fantasmes"],["limit","🚫 Limites"],["tried","✓ Déjà essayé"],["after","Après essai renseigné"],["notes","Avec une note"]]:[["","All my choices"],["incomplete","? To complete"],["want","🔥 Want or favorite"],["favorite","👑 Favorites"],["fantasy","💭 Fantasies"],["limit","🚫 Limits"],["tried","✓ Already tried"],["after","After trying filled"],["notes","With a note"]];
  status.innerHTML=options.map(([value,label])=>`<option value="${value}">${esc(label)}</option>`).join("");
  status.value=options.some(([value])=>value===previous)?previous:""; status.dataset.readerLang=langKey;
}
function editorEffectiveScore(state){return Number.isInteger(state?.after)?state.after:Number.isInteger(state?.preference)?state.preference:null;}
function editorSlotMatches(state,statusValue,minScore){const score=editorEffectiveScore(state);if(statusValue==="incomplete"&&Number.isInteger(state?.preference))return false;if(statusValue==="want"&&![3,4].includes(score))return false;if(statusValue==="favorite"&&score!==4)return false;if(statusValue==="fantasy"&&score!==5)return false;if(statusValue==="limit"&&score!==0)return false;if(statusValue==="tried"&&state?.prior!==true)return false;if(statusValue==="after"&&!Number.isInteger(state?.after))return false;if(statusValue==="notes"&&!(typeof state?.note==="string"&&state.note.trim()))return false;if(minScore!==null&&(score===5||!Number.isInteger(score)||score<minScore))return false;return true;}

function renderIndividualEditor() {
  if(!individualEditor||!individualEditorList) return;
  individualEditor.hidden=false;
  configureEditorStatusOptions();
  configureEditorMinimumOptions();
  const profile=window.CHECKLIST_PROFILE_API?.get?.()||{}; const person=modelPersonKey(),name=editorProfileName(person);
  if (individualEditor) individualEditor.dataset.person = person === 'personB' ? 'person-b' : 'person-a';
  individualEditorTitle.innerHTML=currentLang==="fr"?`Réponses de ${profileNameBadge(person === 'personB' ? 'person-b' : 'person-a', name)}`:`${profileNameBadge(person === 'personB' ? 'person-b' : 'person-a', name)}'s answers`;
  individualEditorIntro.innerHTML=currentLang==="fr"?`Vous modifiez uniquement les choix de ${profileNameBadge(person === 'personB' ? 'person-b' : 'person-a', name, true)}. Les réponses de l’autre personne ne sont jamais affichées ici.`:`You are editing only ${profileNameBadge(person === 'personB' ? 'person-b' : 'person-a', name, true)}. The other person's answers are never shown here.`;
  individualEditorLegend.innerHTML=currentLang==="fr"?`<strong>Comment répondre :</strong> une pratique peut demander votre intérêt général, ce que vous aimez <b>donner</b>/<b>recevoir</b>, ou ce que vous aimez en position <b>dominante</b>/<b>soumise</b>.`:`<strong>How to answer:</strong> a practice may ask for your general interest, what you like to <b>give</b>/<b>receive</b>, or what you like in a <b>dominant</b>/<b>submissive</b> role.`;
  const q=search.value.trim().toLowerCase(), cat=category.value, risk=riskFilter.value; const maxLevel=experienceMaxLevel();
  const minRaw=minFilterScore.value, minScore=minRaw===""?null:Number(minRaw), statusValue=status.value;
  const grouped=new Map(); let visible=0;
  for(const entity of CATALOG_ENTITIES) {
    const slotStates=editorSlotsForEntity(entity,person,profile)
      .map(slot=>({slot,state:V2_STORAGE.getPersonalSlotState(entity.id,person,slot)||{}}))
      .filter(({state})=>editorSlotMatches(state,statusValue,minScore));
    if(!slotStates.length) continue;
    const slots=slotStates.map(({slot})=>slot), info=editorEntityInfo(entity,person,slots);
    if(info.level>maxLevel || (risk&&info.risk!==risk) || (cat&&info.category!==cat)) continue;
    const ownText=slotStates.map(({state})=>state.note||"").join(" ");
    const hay=`${info.title} ${info.explanation} ${info.category} ${ownText}`.toLowerCase(); if(q&&!hay.includes(q)) continue;
    if(!grouped.has(info.category)) grouped.set(info.category,[]); grouped.get(info.category).push({entity,slotStates,info}); visible++;
  }
  const categories=[...grouped.keys()].sort((a,b)=>a.localeCompare(b,currentLang)); let html="";
  for(const catName of categories) {
    const rows=grouped.get(catName); const collapsed=collapsedCategories.has(catName) && !q && !cat && !risk;
    html+=`<section class="individual-category" data-category="${esc(catName)}"><button class="individual-category-head" data-editor-category-toggle="${esc(catName)}" type="button" aria-expanded="${collapsed?'false':'true'}"><span class="section-dot" style="background:${categoryColors[catName]||'#999'}"></span><strong>${esc(currentLang==="en"?(CATEGORY_EN[catName]||catName):catName)}</strong><span>${rows.length}</span><b>${collapsed?'▸':'▾'}</b></button>${collapsed?'':`<div class="individual-category-cards">${rows.map(({entity,slotStates,info})=>`<article class="individual-practice-card" data-v2-id="${esc(entity.id)}"><header${info.explanation?` title="${esc(info.explanation)}"`:''}><div class="individual-practice-headmain"><div class="individual-practice-titleline"><span class="individual-practice-category">${esc(currentLang==='fr'?`N${info.level}`:`L${info.level}`)}</span><h3>${esc(info.title)}</h3></div>${info.explanation?`<p class="individual-practice-explanation">${esc(info.explanation)}</p>`:''}</div>${info.risk==='normal'?'':riskBadge({risk:info.risk})}</header><div class="individual-slots${slotStates.length>1?' has-multiple':''}">${slotStates.map(({slot,state})=>renderEditorSlot(entity,person,slot,profile,state)).join('')}</div></article>`).join('')}</div>`}</section>`;
  }
  individualEditorList.innerHTML=html; individualEditorEmpty.hidden=visible!==0;
  const summary=V2_STORAGE.getPersonalSummary(person); individualEditorProgress.textContent=currentLang==="fr"?`${summary.ratedSlots}/${summary.totalSlots} choix renseignés`:`${summary.ratedSlots}/${summary.totalSlots} choices filled`;
  updateStats(visible);
}
function hideIndividualEditor() {
  if(individualEditor) individualEditor.hidden=true;
}
const pendingPersonalNotes = new Map();
let personalNoteSaveTimer = null;
function flushPersonalNoteSaves() {
  if (personalNoteSaveTimer) { clearTimeout(personalNoteSaveTimer); personalNoteSaveTimer = null; }
  if (!pendingPersonalNotes.size) return;
  for (const {id,person,slot,value} of pendingPersonalNotes.values()) {
    const state=V2_STORAGE.getPersonalSlotState(id,person,slot)||{};
    if (value) state.note=value; else delete state.note;
    V2_STORAGE.setPersonalSlotState(id,person,slot,state);
  }
  pendingPersonalNotes.clear();
}
function queuePersonalNoteSave(id,person,slot,value) {
  const key=`${id}|${person}|${slot}`;
  pendingPersonalNotes.set(key,{id,person,slot,value});
  if (personalNoteSaveTimer) clearTimeout(personalNoteSaveTimer);
  personalNoteSaveTimer=setTimeout(flushPersonalNoteSaves,180);
}

if(individualEditorList) {
  individualEditorList.addEventListener("click",e=>{
    const catBtn=e.target.closest("[data-editor-category-toggle]"); if(catBtn){const c=catBtn.dataset.editorCategoryToggle;if(collapsedCategories.has(c))collapsedCategories.delete(c);else collapsedCategories.add(c);saveCollapsedCategories();render();return;}
    const noteToggle=e.target.closest("button[data-personal-note-toggle]");
    if(noteToggle){
      const slotEl=noteToggle.closest(".individual-slot"),panel=slotEl?.querySelector(".individual-note-panel");
      if(panel){const opening=panel.hidden;panel.hidden=!opening;noteToggle.setAttribute("aria-expanded",opening?"true":"false");noteToggle.classList.toggle("is-open",opening);if(opening)panel.querySelector("textarea")?.focus();}
      return;
    }
    const btn=e.target.closest("button[data-personal-action]"); if(!btn)return;
    const id=btn.dataset.v2Id,slot=btn.dataset.slot,person=modelPersonKey(); const state=V2_STORAGE.getPersonalSlotState(id,person,slot)||{}; const action=btn.dataset.personalAction;
    if(action==="prior"){state.prior=!state.prior;if(!state.prior)delete state.after;}
    else {const value=btn.dataset.score==="unknown"?null:Number(btn.dataset.score);if(value===null)delete state[action];else state[action]=state[action]===value?undefined:value;if(state[action]===undefined)delete state[action];}
    V2_STORAGE.setPersonalSlotState(id,person,slot,state); invalidateDerivedData(); render();
  });
  individualEditorList.addEventListener("input",e=>{const note=e.target.closest("textarea[data-personal-note]");if(!note)return;const person=modelPersonKey();queuePersonalNoteSave(note.dataset.v2Id,person,note.dataset.slot,note.value);const toggle=note.closest(".individual-slot")?.querySelector("[data-personal-note-toggle]");if(toggle){const hasNote=note.value.trim().length>0;toggle.classList.toggle("has-note",hasNote);let dot=toggle.querySelector("i");if(hasNote&&!dot){dot=document.createElement("i");dot.setAttribute("aria-hidden","true");toggle.appendChild(dot);}else if(!hasNote&&dot)dot.remove();}});
  individualEditorList.addEventListener("change",e=>{if(e.target.closest("textarea[data-personal-note]"))flushPersonalNoteSaves();});
}

function readerNames() {
  const profile=window.CHECKLIST_PROFILE_API?.get?.()||{};
  return {
    personA:profile.personA?.name||(currentLang==="fr"?"Personne A":"Person A"),
    personB:profile.personB?.name||(currentLang==="fr"?"Personne B":"Person B")
  };
}
function readerSlotLabel(slot) {
  if(currentLang==="fr") return ({interest:"Intérêt",give:"Donner",receive:"Recevoir",dominant:"Position dominante",submissive:"Position soumise"})[slot]||slot;
  return ({interest:"Interest",give:"Give",receive:"Receive",dominant:"Dominant",submissive:"Submissive"})[slot]||slot;
}
function readerVariantLabel(entity,variant,names=readerNames()) {
  if(variant===INTERACTION_MODEL.VARIANT.A_TO_B) return currentLang==="fr"?`${names.personA} donne → ${names.personB} reçoit`:`${names.personA} gives → ${names.personB} receives`;
  if(variant===INTERACTION_MODEL.VARIANT.B_TO_A) return currentLang==="fr"?`${names.personB} donne → ${names.personA} reçoit`:`${names.personB} gives → ${names.personA} receives`;
  if(variant===INTERACTION_MODEL.VARIANT.A_DOMINANT) return currentLang==="fr"?`${names.personA} en position dominante ↔ ${names.personB} en position soumise`:`${names.personA} dominant → ${names.personB} submissive`;
  if(variant===INTERACTION_MODEL.VARIANT.B_DOMINANT) return currentLang==="fr"?`${names.personB} en position dominante ↔ ${names.personA} en position soumise`:`${names.personB} dominant → ${names.personA} submissive`;
  return currentLang==="fr"?"Intérêt partagé":"Shared interest";
}
function readerCompactFlowLabel(entity,variant,names=readerNames()) {
  if(variant===INTERACTION_MODEL.VARIANT.A_TO_B || variant===INTERACTION_MODEL.VARIANT.A_DOMINANT) return `${names.personA} → ${names.personB}`;
  if(variant===INTERACTION_MODEL.VARIANT.B_TO_A || variant===INTERACTION_MODEL.VARIANT.B_DOMINANT) return `${names.personB} → ${names.personA}`;
  return `${names.personA} + ${names.personB}`;
}
function legacyBlockForVariant(entity,variant) {
  for(const [scenarioName,key] of [["a-dom","aDom"],["b-dom","bDom"]]) {
    if(INTERACTION_MODEL.variantForLegacyScenario(entity,scenarioName)===variant && entity?.scenarios?.[key]) return {block:entity.scenarios[key],legacySourceKey:key};
  }
  const key=entity?.scenarios?.aDom?"aDom":entity?.scenarios?.bDom?"bDom":null;
  return key?{block:entity.scenarios[key],legacySourceKey:key}:{block:{},legacySourceKey:null};
}
function readerVariantInfo(entity,variant) {
  const source=legacyBlockForVariant(entity,variant);
  return localizedLegacyInfo(entity,source.legacySourceKey);
}
function readerCompatibilityLabel(status) {
  if(currentLang==="fr") return ({excellent:"👑 Excellent match",strong:"🔥 Très compatible",compatible:"✓ Compatible",later:"⏳ Pas maintenant",fantasy:"💭 Fantasme à discuter",limit:"🚫 Limite",incomplete:"? Incomplet"})[status]||"? Incomplet";
  return ({excellent:"👑 Excellent match",strong:"🔥 Strong match",compatible:"✓ Compatible",later:"⏳ Not now",fantasy:"💭 Fantasy to discuss",limit:"🚫 Limit",incomplete:"? Incomplete"})[status]||"? Incomplete";
}
function readerScoreRole(slot) {
  return slot===INTERACTION_MODEL.SLOT.DOMINANT?"dom":slot===INTERACTION_MODEL.SLOT.SUBMISSIVE?"sub":null;
}
function readerEffectiveState(state) {
  const after=Number.isInteger(state?.after)?state.after:null;
  const preference=Number.isInteger(state?.preference)?state.preference:null;
  return {score:after!==null?after:preference,source:after!==null?"after":preference!==null?"preference":"unknown"};
}
function readerCommonScoreEmoji(compatibility) {
  const c=compatibility||{};
  if(c.status==="limit") return "🚫";
  if(c.status==="fantasy") return "💭";
  if(c.status==="incomplete") return "?";
  return scoreButtonLabel(Number.isInteger(c.score)?c.score:null,null);
}
function readerTriedMark(state) {
  return state?.prior===true ? "✓" : "—";
}
function readerNotesHtml(pair,names=readerNames(),flowLabel="") {
  const notes=[
    [names.personA,String(pair?.personA?.state?.note||"").trim()],
    [names.personB,String(pair?.personB?.state?.note||"").trim()]
  ].filter(([,note])=>note);
  if(!notes.length) return "";
  return `<div class="couple-reader-notes">${flowLabel?`<div class="couple-reader-note-flow">${flowLabel}</div>`:""}${notes.map(([name,note],index)=>`<div class="couple-reader-note"><strong>${profileNameBadge(index===0?'person-a':'person-b', name, true)}</strong><span>${esc(note)}</span></div>`).join("")}</div>`;
}
function readerResultPanel(entity,pair,names=readerNames()) {
  const c=pair.compatibility||{status:"incomplete",scoreA:null,scoreB:null};
  const aRole=readerScoreRole(pair.personA.slot), bRole=readerScoreRole(pair.personB.slot);
  const aScore=scoreButtonLabel(readerEffectiveState(pair.personA.state).score,aRole);
  const bScore=scoreButtonLabel(readerEffectiveState(pair.personB.state).score,bRole);
  const commonScore=readerCommonScoreEmoji(c);
  const done=pair.common?.doneTogether===true;
  const blocked=c.status==="limit", fantasy=c.status==="fantasy";
  const togetherLabel=done?(currentLang==="fr"?"Déjà fait ensemble":"Already done together"):(currentLang==="fr"?"Marquer fait ensemble":"Mark done together");
  return `<div class="couple-result-grid" data-result="${esc(c.status)}" aria-label="${esc(readerCompatibilityLabel(c.status))}">
    <span class="couple-result-cell person-a" title="${esc(`${names.personA} · ${readerSlotLabel(pair.personA.slot)} : ${aScore}`)}"><span class="couple-result-emoji">${aScore}</span><span class="couple-result-tick">${readerTriedMark(pair.personA.state)}</span></span>
    <span class="couple-result-cell person-b" title="${esc(`${names.personB} · ${readerSlotLabel(pair.personB.slot)} : ${bScore}`)}"><span class="couple-result-emoji">${bScore}</span><span class="couple-result-tick">${readerTriedMark(pair.personB.state)}</span></span>
    <span class="couple-result-cell couple-result-common-cell" title="${esc(readerCompatibilityLabel(c.status))}"><span class="couple-result-emoji">${commonScore}</span><button class="couple-result-tick couple-together-tick${done?' is-done':''}" data-couple-action="together" data-v2-id="${esc(entity.id)}" data-variant="${esc(pair.variant)}" type="button" ${blocked||fantasy?'disabled':''} aria-label="${esc(togetherLabel)}" title="${esc(blocked?(currentLang==='fr'?'Une limite est active.':'A limit is active.'):fantasy?t('fantasyTogetherDisabled'):togetherLabel)}">${done?'✓':'—'}</button></span>
  </div>`;
}
function readerPinButton(entity,pair) {
  const inSession=isVariantInSession(entity.id,pair.variant), blocked=pair.compatibility?.status==="limit";
  const sessionLabel=blocked?t('sessionLimitWarning'):(inSession?t('removeSession'):t('addSession'));
  return `<button class="couple-reader-pin${inSession?' is-selected':''}" data-couple-action="session" data-v2-id="${esc(entity.id)}" data-variant="${esc(pair.variant)}" type="button" ${blocked?'disabled':''} aria-label="${esc(sessionLabel)}" title="${esc(sessionLabel)}">📌</button>`;
}
function readerRiskHtml(info) {
  return info?.risk!=="normal"?`<div class="couple-reader-risk">${riskBadge({risk:info.risk})}</div>`:"";
}
function readerPinRail(entity,pair,info) {
  return `<div class="couple-practice-rail">${readerPinButton(entity,pair)}${readerRiskHtml(info)}</div>`;
}
function readerCanGroupDirectionVariants(entity,variants) {
  if(INTERACTION_MODEL.axisOf(entity)!==INTERACTION_MODEL.AXIS.DIRECTION || variants.length<2) return false;
  const normalized=variants.map(({info})=>({
    title:String(info?.title||"").trim().toLocaleLowerCase(currentLang),
    category:String(info?.category||""),
    level:Number(info?.level||0),
    risk:String(info?.risk||"normal")
  }));
  const first=normalized[0];
  return normalized.every(item=>item.title===first.title && item.category===first.category && item.level===first.level && item.risk===first.risk);
}
function readerGroupedDescription(variants) {
  const descriptions=[...new Set(variants.map(({info})=>String(info?.explanation||"").trim()).filter(Boolean))];
  return descriptions[0]||"";
}

function readerStatusMatches(pair,statusValue) {
  const c=pair.compatibility||{};
  if(statusValue==="coupleCompatible" && !["compatible","strong","excellent"].includes(c.status)) return false;
  if(statusValue==="coupleStrong" && !["strong","excellent"].includes(c.status)) return false;
  if(statusValue==="coupleLimit" && c.status!=="limit") return false;
  if(statusValue==="coupleFantasy" && c.status!=="fantasy") return false;
  if(statusValue==="coupleIncomplete" && c.status!=="incomplete") return false;
  if(statusValue==="together" && pair.common?.doneTogether!==true) return false;
  if(statusValue==="notTogether" && pair.common?.doneTogether===true) return false;
  return true;
}
function readerMinimumLabels(counts={}) {
  const fr=currentLang==="fr";
  return [
    ["",fr?"Tous":"All",counts.all],
    ["1",fr?"⏳ Pas maintenant":"⏳ Not now",counts[1]],
    ["2",fr?"🙂 Neutre":"🙂 Neutral",counts[2]],
    ["3",fr?"🔥 Envie":"🔥 Want",counts[3]],
    ["4",fr?"👑 Favori":"👑 Favorite",counts[4]]
  ];
}
function readerDsChipLabel(value,names) {
  if (value === "b-dominant") return currentLang === "fr" ? `${names.personB} domine` : `${names.personB} dominant`;
  return currentLang === "fr" ? `${names.personA} domine` : `${names.personA} dominant`;
}
function readerSelectedDsFilter(value) {
  return value === "b-dominant" ? "b-dominant" : "a-dominant";
}
function readerMinimumChipLabel(value) {
  const fr=currentLang === "fr";
  return ({
    "": fr ? "Tous" : "All",
    "1": "⏳",
    "2": "🙂",
    "3": "🔥",
    "4": "👑"
  })[String(value)] || (fr ? "Tous" : "All");
}
function readerMinimumChipTitle(value) {
  const item=readerMinimumLabels({}).find(([v])=>String(v)===String(value));
  return item ? item[1] : "";
}
function readerMinimumSummary(value) {
  return value ? readerMinimumChipLabel(value) : (currentLang==='fr'?'Tous':'All');
}
function setReaderFilterState(key, value, persist = true) {
  readerFilterState[key] = value;
  if (!persist) return;
  const storageKey = ({ ds:"readerDsFilter", minOne:"readerMinOne", minTwo:"readerMinTwo", includeFantasy:"readerIncludeFantasy" })[key];
  if (storageKey) V2_STORAGE.setDisplay(storageKey, value);
}
function renderReaderMinimumChips(container,current,counters,side) {
  if (!container) return;
  const selected=String(current||"");
  const minimum=counters||{};
  const values=["","1","2","3","4"];
  container.innerHTML=values.map(value=>{
    const active=value===selected;
    const count=value===""?minimum.all:minimum[value];
    const title=`Minimum ${side} · ${readerMinimumChipTitle(value)}`;
    return `<button class="reader-filter-chip reader-min-chip${active?' is-active':''}" type="button" data-reader-min-side="${side}" data-reader-min="${value}" aria-pressed="${active?'true':'false'}" title="${esc(title)}"><span class="reader-filter-chip-text">${esc(readerMinimumChipLabel(value))}</span>${Number.isInteger(count)?`<span class="reader-filter-chip-count">${count}</span>`:""}</button>`;
  }).join("");
}
function renderReaderHeaderDs(profile,names,dsValue,counters={}) {
  if(!readerHeaderDs) return;
  const fixed=profile?.dynamic?.mode && profile.dynamic.mode!=="switch";
  readerHeaderDs.hidden=!isReadingMode||!!fixed;
  readerHeaderDs.setAttribute("aria-label",currentLang==="fr"?"Choisir la personne dominante":"Choose the dominant person");
  const labels={
    "a-dominant": currentLang==="fr"?`${names.personA} domine`:`${names.personA} dominant`,
    "b-dominant": currentLang==="fr"?`${names.personB} domine`:`${names.personB} dominant`
  };
  for(const btn of readerHeaderDsButtons){
    const value=readerSelectedDsFilter(btn.dataset.readerHeaderDs), active=value===dsValue;
    const count=counters?.[value];
    btn.classList.toggle("active",active);
    btn.setAttribute("aria-pressed",active?"true":"false");
    btn.innerHTML=`${readerDsChipHtml(value,names)}${Number.isInteger(count)?`<span class="reader-header-ds-count"> · ${count}</span>`:""}`;
    btn.setAttribute("title", labels[value]);
  }
}
function renderReaderFilterDock(profile,names,counters={ds:{},minimumOne:{},minimumTwo:{}}) {
  if (!readerFilterDock) return;
  const fixed=profile?.dynamic?.mode && profile.dynamic.mode !== "switch";
  const { ds:dsValue, minOne, minTwo, includeFantasy } = readerFilterState;
  renderReaderHeaderDs(profile,names,dsValue,counters.ds||{});
  renderReaderMinimumChips(readerMinimumOneChips,minOne,counters.minimumOne||{},1);
  renderReaderMinimumChips(readerMinimumTwoChips,minTwo,counters.minimumTwo||{},2);
  if (readerFilterSummary) {
    const parts=[];
    if (!fixed) parts.push(readerDsChipHtml(dsValue,names));
    parts.push(`<span class="reader-filter-summary-piece">${esc(minOne || minTwo ? `${readerMinimumSummary(minOne)} + ${readerMinimumSummary(minTwo)}` : (currentLang==='fr'?'Tous':'All'))}</span>`);
    if (includeFantasy) parts.push('<span class="reader-filter-summary-piece">💭</span>');
    readerFilterSummary.innerHTML=parts.join('<span class="reader-filter-summary-sep"> · </span>');
  }
  if (!readerFilterDock.dataset.initialized) {
    readerFilterDock.dataset.initialized="true";
    try { if (window.matchMedia?.("(max-width: 700px)")?.matches) readerFilterDock.open=false; } catch (_) {}
  }
}
function configureReaderLogicControls(profile,names,counters={ds:{},minimumOne:{},minimumTwo:{}}) {
  if(readerIncludeFantasy){
    readerIncludeFantasy.checked=readerFilterState.includeFantasy;
    const span=readerIncludeFantasy.closest("label")?.querySelector("span");
    if(span) span.textContent=currentLang==="fr"?"💭 Inclure les fantasmes avec les minima":"💭 Include fantasies with the minimums";
  }
  renderReaderFilterDock(profile,names,counters);
}
function configureEditorMinimumOptions(){
  if(!minFilterScore) return;
  const previous=minFilterScore.value;
  const opts=currentLang==="fr"?[
    ["","Niveau minimum : tous"],["1","Pas maintenant ou mieux"],["2","Neutre ou mieux"],["3","🔥 Envie ou favori"],["4","👑 Favori"]
  ]:[
    ["","Minimum level: all"],["1","Not now or better"],["2","Neutral or better"],["3","🔥 Want or favorite"],["4","👑 Favorite"]
  ];
  minFilterScore.innerHTML=opts.map(([value,label])=>`<option value="${value}">${esc(label)}</option>`).join("");
  minFilterScore.value=opts.some(([value])=>value===previous)?previous:"";
}
function configureReaderStatusOptions() {
  const langKey=currentLang;
  if(status.dataset.readerLang===langKey) return;
  const previous=status.value;
  const options=currentLang==="fr"?[
    ["","Tous les résultats"],["coupleCompatible","✓ Compatibles"],["coupleStrong","🔥 Très compatibles"],["coupleLimit","🚫 Avec une limite"],["coupleFantasy","💭 Fantasmes"],["coupleIncomplete","? Incomplets"],["together","Déjà fait ensemble"],["notTogether","Jamais fait ensemble"]
  ]:[
    ["","All results"],["coupleCompatible","✓ Compatible"],["coupleStrong","🔥 Strong matches"],["coupleLimit","🚫 With a limit"],["coupleFantasy","💭 Fantasies"],["coupleIncomplete","? Incomplete"],["together","Done together"],["notTogether","Never done together"]
  ];
  status.innerHTML=options.map(([value,label])=>`<option value="${value}">${esc(label)}</option>`).join("");
  if(options.some(([value])=>value===previous)) status.value=previous;
  status.dataset.readerLang=langKey;
}
function hideCoupleReader() {
  if(coupleReader) coupleReader.hidden=true;
}
function renderCoupleReader() {
  if(!coupleReader||!coupleReaderList) return;
  configureReaderStatusOptions();
  coupleReader.hidden=false;
  hideIndividualEditor();
  const profile=window.CHECKLIST_PROFILE_API?.get?.()||{}, names=readerNames();
  coupleReaderTitle.innerHTML=currentLang==="fr"?`Résultats de ${profileNameBadge('person-a', names.personA)} & ${profileNameBadge('person-b', names.personB)}`:`${profileNameBadge('person-a', names.personA)} & ${profileNameBadge('person-b', names.personB)} results`;
  coupleReaderIntro.textContent=currentLang==="fr"?"Chaque résultat croise uniquement les réponses complémentaires : donner avec recevoir, dominant avec soumis, ou intérêt partagé.":"Each result matches only complementary answers: give with receive, dominant with submissive, or shared interest.";
  coupleReaderLegend.innerHTML=currentLang==="fr"?`<strong>Lecture :</strong> les réponses restent personnelles. Le résultat au centre est calculé pour chaque configuration réellement possible. 🚫 reste une limite prioritaire ; 💭 reste un fantasme et n’est jamais transformé en consentement réel.`:`<strong>Reading:</strong> answers remain personal. The center result is calculated for each actually possible configuration. 🚫 remains a priority limit; 💭 remains a fantasy and is never converted into real-world consent.`;
  const q=search.value.trim().toLowerCase(), maxLevel=experienceMaxLevel(), selectedCategory=category.value, selectedRisk=riskFilter.value;
  const { minOne, minTwo, includeFantasy } = readerFilterState;
  const dsFilter=readerSelectedDsFilter(readerFilterState.ds);
  const prepared=[];
  for(const entity of CATALOG_ENTITIES) {
    const practiceResponse=V2_STORAGE.getReaderPractice(entity.id); if(!practiceResponse) continue;
    const allPairs=INTERACTION_MODEL.readingView(entity,practiceResponse,profile)||[];
    const base=[];
    for(const pair of allPairs) {
      const info=readerVariantInfo(entity,pair.variant);
      if(info.level>maxLevel) continue;
      if(selectedCategory&&info.category!==selectedCategory) continue;
      if(selectedRisk&&info.risk!==selectedRisk) continue;
      if(sessionOnlyFilter&&!isVariantInSession(entity.id,pair.variant)) continue;
      if(!readerStatusMatches(pair,status.value)) continue;
      base.push({pair,info});
    }
    if(!base.length) continue;
    const searchText=base.map(({pair,info})=>`${info.title} ${info.explanation} ${info.category} ${pair.personA.state?.note||""} ${pair.personB.state?.note||""}`).join(" ").toLowerCase();
    if(q&&!searchText.includes(q)) continue;
    prepared.push({entity,variants:base});
  }

  const baseEntries=prepared.flatMap(({entity,variants})=>variants.map(({pair})=>({entity,pair})));
  const dsCounterSource=baseEntries.filter(({pair})=>INTERACTION_MODEL.readerMinimumMatches(pair,minOne,minTwo,includeFantasy));
  const minCounterSource=baseEntries.filter(({entity,pair})=>INTERACTION_MODEL.readerDsFilterMatches(entity,pair,profile,dsFilter));
  const dsCounters=INTERACTION_MODEL.readerFilterCounters(dsCounterSource,profile,includeFantasy,minOne,minTwo).ds;
  const minimumCounters=INTERACTION_MODEL.readerFilterCounters(minCounterSource,profile,includeFantasy,minOne,minTwo);
  configureReaderLogicControls(profile,names,{ds:dsCounters,minimumOne:minimumCounters.minimumOne,minimumTwo:minimumCounters.minimumTwo});

  const grouped=new Map(); let visiblePractices=0,visibleVariants=0,completeVariants=0,compatible=0,strong=0,fantasies=0,limits=0,done=0;
  for(const {entity,variants} of prepared) {
    const candidates=variants.filter(({pair})=>
      INTERACTION_MODEL.readerDsFilterMatches(entity,pair,profile,dsFilter) &&
      INTERACTION_MODEL.readerMinimumMatches(pair,minOne,minTwo,includeFantasy)
    );
    if(!candidates.length) continue;
    const categoryName=candidates[0].info.category||"Autres";
    if(!grouped.has(categoryName)) grouped.set(categoryName,[]);
    grouped.get(categoryName).push({entity,variants:candidates}); visiblePractices++; visibleVariants+=candidates.length;
    for(const {pair} of candidates) {
      const st=pair.compatibility?.status;
      if(st!=="incomplete") completeVariants++;
      if(["compatible","strong","excellent"].includes(st)) compatible++;
      if(["strong","excellent"].includes(st)) strong++;
      if(st==="fantasy") fantasies++;
      if(st==="limit") limits++;
      if(pair.common?.doneTogether===true) done++;
    }
  }
  const categories=[...grouped.keys()].sort((a,b)=>localizedCategory(a).localeCompare(localizedCategory(b),currentLang));
  const beforeShort=currentLang==="fr"?"Av.":"Before";
  const togetherShort=currentLang==="fr"?"Ens.":"Together";
  coupleReaderList.innerHTML=categories.map(categoryName=>{
    const entries=grouped.get(categoryName), collapsed=collapsedCategories.has(categoryName), color=categoryColors[categoryName]||"#aaa";
    const practiceHtml=entries.map(({entity,variants})=>{
      if(readerCanGroupDirectionVariants(entity,variants)) {
        const base=variants[0].info, explanation=readerGroupedDescription(variants);
        const rows=variants.map(({pair,info},index)=>{
          const flow=readerCompactFlowLabel(entity,pair.variant,names);
          const notes=readerNotesHtml(pair,names,flow);
          const copy=index===0
            ? `<div class="couple-practice-copy" title="${esc(explanation||base.title||entity.id)}"><div class="couple-practice-title-line"><strong>${esc(base.title||entity.id)}</strong><span class="couple-practice-flow">${readerFlowHtml(entity,pair.variant,names)}</span></div>${explanation?`<div class="couple-practice-description">${esc(explanation)}</div>`:""}</div>`
            : `<div class="couple-group-flow" title="${esc(readerVariantLabel(entity,pair.variant,names))}"><span>${readerFlowHtml(entity,pair.variant,names)}</span></div>`;
          return `<div class="couple-group-variant-block" data-reader-variant="${esc(pair.variant)}" data-result="${esc(pair.compatibility?.status||'incomplete')}">
            <div class="couple-group-variant-row">
              <div class="couple-practice-rail">${readerPinButton(entity,pair)}${index===0?readerRiskHtml(base):""}</div>
              ${copy}
              ${readerResultPanel(entity,pair,names)}
            </div>
            ${notes}
          </div>`;
        }).join("");
        return `<article class="couple-practice couple-practice-grouped" data-v2-id="${esc(entity.id)}" data-reader-grouped="true"><div class="couple-group-variants">${rows}</div></article>`;
      }
      return variants.map(({pair,info})=>{
        const flow=readerCompactFlowLabel(entity,pair.variant,names);
        const explanation=String(info.explanation||"").trim();
        const notes=readerNotesHtml(pair,names);
        return `<article class="couple-practice" data-v2-id="${esc(entity.id)}" data-reader-variant="${esc(pair.variant)}" data-result="${esc(pair.compatibility?.status||'incomplete')}">
          <div class="couple-practice-row">
            ${readerPinRail(entity,pair,info)}
            <div class="couple-practice-copy" title="${esc(explanation||info.title||entity.id)}">
              <div class="couple-practice-title-line"><strong>${esc(info.title||entity.id)}</strong><span class="couple-practice-flow">${readerFlowHtml(entity,pair.variant,names)}</span></div>
              ${explanation?`<div class="couple-practice-description">${esc(explanation)}</div>`:""}
            </div>
            ${readerResultPanel(entity,pair,names)}
          </div>
          ${notes}
        </article>`;
      }).join("");
    }).join("");
    const resultHead=`<span class="couple-result-head" aria-hidden="true"><span><b>${profileNameBadge('person-a', names.personA, true)}</b><small>✓ ${esc(beforeShort)}</small></span><span><b>${profileNameBadge('person-b', names.personB, true)}</b><small>✓ ${esc(beforeShort)}</small></span><span><b><span class="profile-inline-text">🔗</span></b><small>✓ ${esc(togetherShort)}</small></span></span>`;
    return `<section class="couple-reader-category${collapsed?' is-collapsed':''}" style="--reader-category-color:${color}"><button class="couple-reader-category-head" data-reader-category-toggle="${esc(categoryName)}" type="button" aria-expanded="${collapsed?'false':'true'}"><span class="couple-reader-category-chevron">${collapsed?'▸':'▾'}</span><strong>${esc(localizedCategory(categoryName))}</strong><span class="couple-reader-category-count">${entries.length}</span>${resultHead}</button><div class="couple-reader-category-body">${practiceHtml}</div></section>`;
  }).join("");
  coupleReaderEmpty.hidden=visiblePractices!==0;
  const summary=currentLang==="fr"?`${visiblePractices} pratiques · ${visibleVariants} configurations · ${completeVariants} résultats complets`:`${visiblePractices} practices · ${visibleVariants} configurations · ${completeVariants} complete results`;
  coupleReaderSummary.textContent=summary;
  statVisibleEl.textContent=summary;
  statDoneEl.textContent=currentLang==="fr"?`${done} configurations déjà faites ensemble`:`${done} configurations already done together`;
  statTogetherEl.textContent=currentLang==="fr"?`${compatible} compatibles · ${strong} fortes`:`${compatible} compatible · ${strong} strong`;
  statRatedEl.textContent=currentLang==="fr"?`${completeVariants}/${visibleVariants} résultats calculables`:`${completeVariants}/${visibleVariants} calculable results`;
  statStarredEl.textContent=currentLang==="fr"?`${fantasies} fantasmes · ${limits} limites`:`${fantasies} fantasies · ${limits} limits`;
  if(statModeEl) statModeEl.textContent=currentLang==="fr"?"Mode : Lecture du couple":"Mode: Couple reading";
  compatIndicator.textContent=currentLang==="fr"?`${compatible} compatibilités · ${completeVariants} résultats complets`:`${compatible} matches · ${completeVariants} complete results`;
  compatIndicator.removeAttribute("role"); compatIndicator.removeAttribute("tabindex"); compatIndicator.title="";
  return {visiblePractices,visibleVariants,completeVariants,compatible,strong,fantasies,limits,done,filterCounters:{ds:dsCounters,minimumOne:minimumCounters.minimumOne,minimumTwo:minimumCounters.minimumTwo}};
}
if(coupleReaderList) coupleReaderList.addEventListener("click",e=>{
  const action=e.target.closest("button[data-couple-action]");
  if(action){
    const id=action.dataset.v2Id,variant=action.dataset.variant;
    if(action.dataset.coupleAction==="session") toggleSessionVariant(id,variant);
    if(action.dataset.coupleAction==="together"){
      const entity=UNIFIED_ENTITY_BY_ID.get(id),pair=entity?INTERACTION_MODEL.readingPair(entity,variant,V2_STORAGE.getReaderPractice(id),window.CHECKLIST_PROFILE_API?.get?.()||{}):null;
      if(!pair||["limit","fantasy"].includes(pair.compatibility?.status)) return;
      V2_STORAGE.setVariantCommonState(id,variant,{doneTogether:pair.common?.doneTogether!==true});
      invalidateRandomSnapshot();
    }
    renderSessionPanel(true); renderCoupleReader(); return;
  }
  const btn=e.target.closest("[data-reader-category-toggle]");if(!btn)return;const cat=btn.dataset.readerCategoryToggle;if(collapsedCategories.has(cat))collapsedCategories.delete(cat);else collapsedCategories.add(cat);saveCollapsedCategories();renderCoupleReader();
});

function render() {
  if (isReadingMode) {
    hideIndividualEditor();
    renderCoupleReader();
  } else {
    hideCoupleReader();
    renderIndividualEditor();
  }
}



function randomThresholdRank(value) {
  return ({ fantasy:1, neutral:2, want:3, favorite:4 })[value] || 0;
}

function randomPreferenceRank(score) {
  const v = validScore(score);
  if (v === FANTASY_SCORE) return 1;
  if (v === 2) return 2;
  if (v === 3) return 3;
  if (v === FAVORITE_SCORE) return 4;
  // ? / 🚫 / Pas maintenant ne sont jamais tirables.
  return 0;
}

function randomThresholdLabel(value) {
  if (value === "fantasy") return t("drawFantasy");
  if (value === "neutral") return t("drawNeutral");
  if (value === "want") return t("drawWant");
  if (value === "favorite") return t("drawFavorite");
  return "—";
}

function randomPairRanks(pair) {
  const a = randomPreferenceRank(pair?.compatibility?.scoreA);
  const b = randomPreferenceRank(pair?.compatibility?.scoreB);
  return {a,b};
}

function matchesRandomVariantCriterion(pair) {
  const {a,b}=randomPairRanks(pair);
  if(!a||!b) return false;
  const one=randomThresholdRank(minRandomOne.value), other=randomThresholdRank(minRandomOther.value);
  if(!((a>=one&&b>=other)||(a>=other&&b>=one))) return false;
  if(!randomIncludeNeutralNeutral.checked && pair.compatibility?.scoreA===2 && pair.compatibility?.scoreB===2) return false;
  return true;
}

function getRandomEligibilitySnapshot() {
  if (randomSnapshotCache.revision === randomStateRevision && randomSnapshotCache.value) return randomSnapshotCache.value;
  const profile=window.CHECKLIST_PROFILE_API?.get?.()||{};
  const pairEligible=[], baseEligible=[], eligible=[];
  let bothFavorite=0,newTogether=0,fantasyCount=0;
  for(const entity of CATALOG_ENTITIES) {
    const response=V2_STORAGE.getReaderPractice(entity.id); if(!response) continue;
    for(const pair of INTERACTION_MODEL.readingView(entity,response,profile)||[]) {
      const info=readerVariantInfo(entity,pair.variant);
      if(info.level>experienceMaxLevel()) continue;
      if(!matchesRandomVariantCriterion(pair)) continue;
      const candidate={entity,pair,info,key:`${entity.id}|${pair.variant}`};
      pairEligible.push(candidate);
      if(pair.compatibility?.scoreA===FAVORITE_SCORE&&pair.compatibility?.scoreB===FAVORITE_SCORE) bothFavorite++;
      if(pair.common?.doneTogether!==true) newTogether++;
      if(pair.compatibility?.status==='fantasy') fantasyCount++;
      if(randomOnlyNew.checked&&pair.common?.doneTogether===true) continue;
      if(randomExcludeHighRisk.checked&&info.risk==='high'&&pair.compatibility?.status!=='fantasy') continue;
      baseEligible.push(candidate);
      if(!randomNoRepeat.checked||!randomDrawHistory.has(candidate.key)) eligible.push(candidate);
    }
  }
  const snapshot={pairEligible,baseEligible,eligible,bothFavorite,newTogether,fantasyCount};
  randomSnapshotCache={revision:randomStateRevision,value:snapshot};
  return snapshot;
}

let lastCompatibilitySignature = "";
function updateCompatibilityIndicator() {
  if(!isReadingMode) {
    if(compatIndicator) compatIndicator.textContent=currentLang==='fr'?'Édition individuelle':'Individual editing';
    if(compatDetails) compatDetails.innerHTML='';
    if(randomCandidateInfo) randomCandidateInfo.textContent='';
    return;
  }
  const snapshot=getRandomEligibilitySnapshot();
  const {pairEligible,baseEligible,eligible,bothFavorite,newTogether,fantasyCount}=snapshot;
  const thresholdValues=[minRandomOne.value,minRandomOther.value].sort((a,b)=>randomThresholdRank(b)-randomThresholdRank(a));
  const thresholdLabels=thresholdValues.map(randomThresholdLabel);
  const criterionLabel=thresholdValues[0]===thresholdValues[1]?thresholdLabels[0]:`${thresholdLabels[0]} + ${thresholdLabels[1]}`;
  const signature=[currentLang,thresholdValues.join(','),pairEligible.length,baseEligible.length,eligible.length,bothFavorite,newTogether,fantasyCount,randomNoRepeat.checked?1:0].join('|');
  if(signature===lastCompatibilitySignature)return; lastCompatibilitySignature=signature;
  compatIndicator.textContent=currentLang==='fr'?`${pairEligible.length} configurations au critère : ${criterionLabel}`:`${pairEligible.length} variants match: ${criterionLabel}`;
  compatIndicator.removeAttribute('role'); compatIndicator.removeAttribute('tabindex'); compatIndicator.title='';
  compatDetails.innerHTML=currentLang==='fr'
    ? `<span>👑+👑 ${bothFavorite} favoris communs</span><span>○ ${newTogether} jamais faites ensemble</span>${fantasyCount?`<span class="random-fantasy-badge">💭 ${fantasyCount} fantasme${fantasyCount>1?'s':''}</span>`:''}`
    : `<span>👑+👑 ${bothFavorite} shared favorites</span><span>○ ${newTogether} never done together</span>${fantasyCount?`<span class="random-fantasy-badge">💭 ${fantasyCount} fantas${fantasyCount>1?'ies':'y'}</span>`:''}`;
  randomCandidateInfo.textContent=randomNoRepeat.checked
    ? (currentLang==='fr'?`Tirables : ${eligible.length}/${baseEligible.length} restantes dans ce cycle`:`Eligible: ${eligible.length}/${baseEligible.length} remaining in this cycle`)
    : (currentLang==='fr'?`Tirables avec les options actuelles : ${baseEligible.length}`:`Eligible with current options: ${baseEligible.length}`);
}

function getStatsSnapshot() {
  const profile=window.CHECKLIST_PROFILE_API?.get?.()||{};
  let variants=0,complete=0,compatible=0,strong=0,done=0,favorites=0;
  for(const entity of CATALOG_ENTITIES) {
    const response=V2_STORAGE.getReaderPractice(entity.id); if(!response)continue;
    for(const pair of INTERACTION_MODEL.readingView(entity,response,profile)||[]) {
      variants++;
      const st=pair.compatibility?.status;
      if(st!=='incomplete') complete++;
      if(['compatible','strong','excellent'].includes(st)) compatible++;
      if(['strong','excellent'].includes(st)) strong++;
      if(pair.common?.doneTogether===true) done++;
      if(pair.compatibility?.scoreA===4&&pair.compatibility?.scoreB===4) favorites++;
    }
  }
  return {variants,complete,compatible,strong,done,favorites};
}

let lastStatsSignature = "";
let lastVisibleStatCount = null;
function updateStats(visibleCount = null) {
  if(visibleCount!==null) lastVisibleStatCount=visibleCount;
  if(!isReadingMode) {
    const person=modelPersonKey(), summary=V2_STORAGE.getPersonalSummary(person), name=editorProfileName(person);
    if(statVisibleEl) statVisibleEl.textContent=currentLang==='fr'?`${lastVisibleStatCount??summary.practicesTouched} pratiques visibles`:`${lastVisibleStatCount??summary.practicesTouched} visible practices`;
    if(statDoneEl) statDoneEl.textContent='';
    if(statTogetherEl) statTogetherEl.textContent='';
    if(statRatedEl) statRatedEl.textContent=currentLang==='fr'?`${summary.ratedSlots}/${summary.totalSlots} choix renseignés`:`${summary.ratedSlots}/${summary.totalSlots} choices filled`;
    if(statStarredEl) statStarredEl.textContent='';
    if(statModeEl) statModeEl.textContent=currentLang==='fr'?`Édition individuelle · ${name}`:`Individual editing · ${name}`;
    updateCompatibilityIndicator(); renderSessionPanel(); return;
  }
  const x=getStatsSnapshot();
  const signature=[currentLang,lastVisibleStatCount,x.variants,x.complete,x.compatible,x.strong,x.done,x.favorites].join('|');
  if(signature!==lastStatsSignature){lastStatsSignature=signature;
    if(statVisibleEl) statVisibleEl.textContent=currentLang==='fr'?`${lastVisibleStatCount??x.variants} pratiques visibles`:`${lastVisibleStatCount??x.variants} visible practices`;
    if(statDoneEl) statDoneEl.textContent=currentLang==='fr'?`${x.complete}/${x.variants} résultats complets`:`${x.complete}/${x.variants} complete results`;
    if(statTogetherEl) statTogetherEl.textContent=currentLang==='fr'?`${x.done} faites ensemble`:`${x.done} done together`;
    if(statRatedEl) statRatedEl.textContent=currentLang==='fr'?`${x.compatible} configurations compatibles`:`${x.compatible} compatible variants`;
    if(statStarredEl) statStarredEl.textContent=currentLang==='fr'?`${x.favorites} favoris communs`:`${x.favorites} shared favorites`;
    if(statModeEl) statModeEl.textContent=currentLang==='fr'?`Lecture du couple · ${x.strong} très compatibles`:`Couple reading · ${x.strong} strong matches`;
  }
  updateCompatibilityIndicator(); renderSessionPanel();
}

let randomPickedId = null;
function pickRandomPractice() {
  if(!isReadingMode) setViewMode('read');
  const snapshot=getRandomEligibilitySnapshot(); let eligible=snapshot.eligible, cycleRestarted=false;
  if(!snapshot.baseEligible.length){
    randomResult.innerHTML=currentLang==='fr'?'Aucune configuration ne correspond aux critères actuels.':'No variant matches the current criteria.';
    updateCompatibilityIndicator(); return;
  }
  if(randomNoRepeat.checked&&!eligible.length){randomDrawHistory.clear();saveRandomHistory();invalidateRandomSnapshot();eligible=[...snapshot.baseEligible];cycleRestarted=true;}
  const picked=eligible[Math.floor(Math.random()*eligible.length)];
  randomPickedId=picked.key;
  if(randomNoRepeat.checked){randomDrawHistory.add(picked.key);saveRandomHistory();invalidateRandomSnapshot();}
  search.value='';category.value='';status.value='';minFilterScore.value='';riskFilter.value='';setReaderFilterState('minOne','');setReaderFilterState('minTwo','');setReaderFilterState('ds','a-dominant');setReaderFilterState('includeFantasy',false);if(readerIncludeFantasy)readerIncludeFantasy.checked=false;sessionOnlyFilter=false;render();
  const card=coupleReaderList?.querySelector(`[data-v2-id="${CSS.escape(picked.entity.id)}"]`); if(card)card.scrollIntoView({behavior:'smooth',block:'center'});
  const already=isVariantInSession(picked.entity.id,picked.pair.variant), blocked=picked.pair.compatibility?.status==='limit';
  const fantasy=picked.pair.compatibility?.status==='fantasy';
  const riskInfo=picked.info.risk==='normal'?'':` · <strong>${esc(riskLabel(picked.info.risk))}</strong>`;
  randomResult.innerHTML=`<strong>${esc(picked.info.title)}</strong> · ${esc(readerVariantLabel(picked.entity,picked.pair.variant))}${riskInfo}<br><span>${esc(readerCompatibilityLabel(picked.pair.compatibility?.status))}</span>${fantasy?`<div class="random-fantasy-warning">${esc(t('randomFantasyWarning'))}</div>`:''}${cycleRestarted?`<div class="random-candidate-info">${currentLang==='fr'?'Nouveau cycle démarré automatiquement.':'A new cycle started automatically.'}</div>`:''}<div class="random-result-actions"><button class="random-session-btn" data-random-practice-id="${esc(picked.entity.id)}" data-random-variant="${esc(picked.pair.variant)}" type="button" ${already||blocked?'disabled':''}>${already?t('alreadyInSession'):t('addRandomToSession')}</button></div>`;
  updateCompatibilityIndicator();
}

function getSafety() {
  return {
    slowWord: document.getElementById("slowWord").value,
    safeWord: document.getElementById("safeWord").value,
    slowSignal: document.getElementById("slowSignal").value,
    stopSignal: document.getElementById("stopSignal").value,
    marks: document.getElementById("marks").value,
    hardLimits: document.getElementById("hardLimits").value,
    aftercare: document.getElementById("aftercare").value,
    media: document.getElementById("media").value,
    noIntoxication: document.getElementById("noIntoxication").checked,
    nextDayDebrief: document.getElementById("nextDayDebrief").checked,
    stopImmediate: document.getElementById("stopImmediate").checked,
  };
}
function applySafety(s) {
  if (!s || typeof s !== "object") return;
  for (const [k,v] of Object.entries(s)) {
    const el = document.getElementById(k);
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!v;
    else el.value = v ?? "";
  }
}

function loadSafety() {
  try { applySafety(V2_STORAGE.getSafety()); } catch(e) {}
}


let safetySaveTimer = null;
let safetyDirty = false;
function flushSafetySave() {
  clearTimeout(safetySaveTimer);
  safetySaveTimer = null;
  if (!safetyDirty) return;
  safetyDirty = false;
  V2_STORAGE.setSafety(getSafety());
}
function scheduleSafetySave() {
  safetyDirty = true;
  clearTimeout(safetySaveTimer);
  safetySaveTimer = setTimeout(flushSafetySave, 140);
}
safetyFields.forEach(el => el.addEventListener("input", scheduleSafetySave));
window.addEventListener("pagehide", flushSafetySave);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { flushPersonalNoteSaves(); flushSafetySave(); }
});
window.addEventListener("pagehide", () => { flushPersonalNoteSaves(); flushSafetySave(); });


let searchRenderTimer = null;
search.addEventListener("input", () => {
  clearTimeout(searchRenderTimer);
  searchRenderTimer = setTimeout(render, 100);
});
[category, status, minFilterScore, riskFilter].forEach(el => el.addEventListener("input", render));
if(readerIncludeFantasy) readerIncludeFantasy.addEventListener("input",()=>{
  setReaderFilterState("includeFantasy", readerIncludeFantasy.checked===true);
  render();
});
for(const btn of readerHeaderDsButtons){
  btn.addEventListener("click",()=>{
    const profile=window.CHECKLIST_PROFILE_API?.get?.()||{};
    if(profile?.dynamic?.mode && profile.dynamic.mode!=="switch") return;
    setReaderFilterState("ds", readerSelectedDsFilter(btn.dataset.readerHeaderDs));
    render();
  });
}
[readerMinimumOneChips,readerMinimumTwoChips].filter(Boolean).forEach(container=>container.addEventListener("click",e=>{
  const btn=e.target.closest?.("[data-reader-min]"); if(!btn) return;
  const key=btn.dataset.readerMinSide==="2"?"minTwo":"minOne";
  setReaderFilterState(key, btn.dataset.readerMin||"");
  render();
}));
if(readerAdvancedFilters) readerAdvancedFilters.addEventListener("click",()=>{
  if(allTools) allTools.open=true;
  const target=document.querySelector(".filters-backup-section");
  if(target) requestAnimationFrame(()=>target.scrollIntoView({behavior:"smooth",block:"start"}));
});

showSessionBtn.addEventListener("click", () => {
  if (!isReadingMode) setViewMode("read");
  sessionOnlyFilter = !sessionOnlyFilter;
  search.value = ""; category.value = ""; status.value = ""; minFilterScore.value = "";
  setReaderFilterState("minOne", "", false);
  setReaderFilterState("minTwo", "", false);
  setReaderFilterState("ds", "a-dominant", false);
  setReaderFilterState("includeFantasy", false, false);
  if(readerIncludeFantasy) readerIncludeFantasy.checked=false;
  showSessionBtn.classList.toggle("active", sessionOnlyFilter);
  showSessionBtn.textContent = sessionOnlyFilter ? (currentLang==="fr"?"📌 Afficher tout":"📌 Show all") : t("showSession");
  render();
});

openSessionModeBtn.addEventListener("click", openSessionMode);
closeSessionModeBtn.addEventListener("click", closeSessionMode);
sessionMode.addEventListener("click", (e) => {
  if (e.target === sessionMode) closeSessionMode();
});
document.addEventListener("keydown", (e) => {
  if (!sessionMode.hidden) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeSessionMode();
      return;
    }
    focusTrapIn(sessionMode.querySelector(".session-mode-panel"), e);
  }
});

sessionModeList.addEventListener("change", (e) => {
  const checkbox=e.target.closest("input[data-session-mode-together]"); if(!checkbox)return;
  const id=checkbox.dataset.practiceId,variant=checkbox.dataset.variant,entity=UNIFIED_ENTITY_BY_ID.get(id); if(!entity)return;
  const pair=INTERACTION_MODEL.readingPair(entity,variant,V2_STORAGE.getReaderPractice(id),window.CHECKLIST_PROFILE_API?.get?.()||{}); if(!pair||["limit","fantasy"].includes(pair.compatibility?.status))return;
  V2_STORAGE.setVariantCommonState(id,variant,{doneTogether:!!checkbox.checked}); renderSessionPanel(true); render();
});

resetSessionBtn.addEventListener("click", () => {
  if (!variantSessionOrder.length) return;
  const message=currentLang==="fr"?`Reset de la séance ? Les ${variantSessionOrder.length} configuration${variantSessionOrder.length>1?'s':''} sélectionnées seront retirées. Les réponses ne seront pas effacées.`:`Reset the session? The ${variantSessionOrder.length} selected configuration${variantSessionOrder.length>1?'s':''} will be removed. Answers will not be deleted.`;
  if(!window.confirm(message))return; variantSessionOrder=[]; saveVariantSessionOrder(); sessionOnlyFilter=false; renderSessionPanel(true); render(); randomResult.innerHTML=`<strong>${t("sessionResetDone")}</strong> ${t("sessionNowEmpty")}`;
});

sessionList.addEventListener("click", (e) => {
  const btn=e.target.closest("[data-session-action]"); if(!btn||btn.disabled)return; const index=Number(btn.dataset.sessionIndex),action=btn.dataset.sessionAction;
  if(action==="remove"&&Number.isInteger(index)){variantSessionOrder.splice(index,1);saveVariantSessionOrder();renderSessionPanel(true);render();}
  else if((action==="up"||action==="down")&&Number.isInteger(index)){moveSessionEntry(index,action);render();}
});

experienceSwitch.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-experience-mode]");
  if (!btn) return;
  const mode = btn.dataset.experienceMode;
  if (!["beginner","confirmed","advanced"].includes(mode)) return;
  experienceMode = mode;
  V2_STORAGE.setDisplay("experienceMode", experienceMode, false);
  invalidateRandomSnapshot();
  renderExperienceModeUI();
    render();
});

randomBtn.addEventListener("click", pickRandomPractice);
randomResult.addEventListener("click", (e) => {
  const btn=e.target.closest("[data-random-practice-id][data-random-variant]");
  if(!btn||btn.disabled)return;
  const practiceId=btn.dataset.randomPracticeId, variant=btn.dataset.randomVariant;
  if(isVariantInSession(practiceId,variant))return;
  const entity=UNIFIED_ENTITY_BY_ID.get(practiceId); if(!entity)return;
  const pair=INTERACTION_MODEL.readingPair(entity,variant,V2_STORAGE.getReaderPractice(practiceId),window.CHECKLIST_PROFILE_API?.get?.()||{});
  if(!pair||pair.compatibility?.status==='limit'){window.alert(t("sessionLimitWarning"));btn.disabled=true;return;}
  toggleSessionVariant(practiceId,variant);
  btn.disabled=true; btn.textContent=t("alreadyInSession");
});
resetRandomCycleBtn.addEventListener("click", () => clearRandomHistory(true));
[minRandomOne, minRandomOther, randomOnlyNew, randomIncludeNeutralNeutral, randomExcludeHighRisk, randomNoRepeat].forEach(el => {
  const onChange = () => {
    if (randomDrawHistory.size) { randomDrawHistory.clear(); saveRandomHistory(); }
    invalidateRandomSnapshot();
    saveRandomPreferences();
    updateCompatibilityIndicator();
  };
  el.addEventListener("change", onChange);
});
const cats = allCatalogCategories;

function renderCategoryControls() {
  const currentValue = category.value;
  category.replaceChildren();
  const allOption = new Option(t("allCategories"), "");
  category.appendChild(allOption);
  for (const name of cats) category.appendChild(new Option(localizedCategory(name), name));
  category.value = cats.includes(currentValue) ? currentValue : "";
}


function validateGlobalBackup(payload) {
  const inspection = V2_STORAGE.inspectBackup(payload);
  return { ...inspection, type: inspection.type === "male" ? "person-a" : inspection.type === "female" ? "person-b" : inspection.type };
}

function setGlobalLastExchange(info) {
  V2_STORAGE.setLastExchange(info);
  lastExchange = info;
  renderExchangeInfo();
}

function importGlobalBackup(payload) {
  const result = V2_STORAGE.importBackup(payload);
  lastExchange = result.info || V2_STORAGE.getLastExchange();
  return result;
}

importJsonBtn.addEventListener("click", () => {
  if (isReadingMode) {
    randomResult.innerHTML = `<strong>${t("readOnlyActive")}</strong> ${t("disableRestore")}`;
    return;
  }
  importJsonFile.value = "";
  importJsonFile.click();
});

importJsonFile.addEventListener("change", async () => {
  if (isReadingMode) return;
  const file = importJsonFile.files && importJsonFile.files[0];
  if (!file) return;
  flushSafetySave();

  try {
    const parsed = JSON.parse(await file.text());
    const inspection = validateGlobalBackup(parsed);
    const backupType = inspection.type;
    if (!window.confirm(globalBackupConfirmationText(backupType, parsed, inspection))) {
      randomResult.innerHTML = currentLang === "fr"
        ? "<strong>Restauration annulée.</strong> Aucune donnée n’a été modifiée."
        : "<strong>Restore cancelled.</strong> No data was changed.";
      return;
    }

    const result = importGlobalBackup(parsed);
    if (["person-a","person-b","male","female"].includes(result.type)) {
      try { sessionStorage.setItem(MERGE_REVIEW_KEY, JSON.stringify({type:result.type, at:new Date().toISOString()})); } catch (_) {}
    }
    const label = backupTypeLabel(result.type);
    const conflictCount = Array.isArray(result.conflicts) ? result.conflicts.length : 0;
    const conflictText = conflictCount
      ? (currentLang === "fr" ? ` · ⚠️ ${conflictCount} conflit(s) sécurité conservé(s)` : ` · ⚠️ ${conflictCount} safety conflict(s) preserved`)
      : "";
    const migrated = result.format === "legacy-v2";
    const message = currentLang === "fr"
      ? `Sauvegarde ${label} restaurée${migrated ? " et migrée depuis V1.1.55" : ""}${conflictText}. La page va être actualisée.`
      : `${label} backup restored${migrated ? " and migrated from V1.1.55" : ""}${conflictText}. The page will now refresh.`;
    window.alert(message);
    window.location.reload();
  } catch (err) {
    console.error(err);
    const prefix = currentLang === "fr" ? "Restauration impossible :" : "Restore failed:";
    randomResult.innerHTML = `<strong>${prefix}</strong> ${esc(err && err.message ? err.message : t("invalidBackup"))}`;
  }
});

function clearSafetyForm() {
  const textIds = ["slowWord","safeWord","slowSignal","stopSignal","hardLimits","aftercare"];
  for (const id of textIds) {
    const el = document.getElementById(id);
    if (el) el.value = "";
  }

  const selectIds = ["marks","media"];
  for (const id of selectIds) {
    const el = document.getElementById(id);
    if (el) el.value = "";
  }

  for (const id of ["noIntoxication","nextDayDebrief","stopImmediate"]) {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  }
}


resetChecklistBtn.addEventListener("click", () => {
  if (isReadingMode) {
    randomResult.innerHTML = `<strong>${t("readOnlyActive")}</strong> ${t("disableReset")}`;
    return;
  }

  const message = currentLang === "fr"
    ? "Réinitialiser la checklist ? Toutes les préférences, expériences antérieures, notes après expérience, notes communes, l’historique de tirage, la sélection de séance et les réglages de sécurité seront effacés. Cette action est irréversible sans sauvegarde."
    : "Reset the checklist? All preferences, prior-experience flags, after-experience ratings, shared notes, random-draw history, session selection and safety settings will be deleted. This cannot be undone without a backup.";

  const ok = window.confirm(message);
  if (!ok) return;

  clearTimeout(safetySaveTimer);
  safetySaveTimer = null;
  safetyDirty = false;

  V2_STORAGE.resetAllUserData();
  randomPickedId = null;
  invalidateDerivedData();
  lastSessionPanelSignature = "";
  lastStatsSignature = "";
  lastVisibleStatCount = null;
  lastExchange = null;
  clearSafetyForm();

  variantSessionOrder = []; refreshVariantSessionSet();
  randomDrawHistory.clear();
  renderSessionPanel();

  search.value = "";
  category.value = "";
  status.value = "";
  minFilterScore.value = "";
  setReaderFilterState("minOne", "");
  setReaderFilterState("minTwo", "");
  riskFilter.value = "";
  
  randomResult.innerHTML = currentLang === "fr"
    ? `<strong>${t("checklistResetDone")}</strong> Toutes les réponses, la sélection de séance et les réglages de sécurité ont été effacés.`
    : `<strong>${t("checklistResetDone")}</strong> All answers, the session selection and safety settings have been cleared.`;
  render();
});

function download(filename, content, type) {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function buildGlobalBackupPayload(type) {
  return V2_STORAGE.buildBackup(type, APP_VERSION);
}

function exportBackup(type) {
  flushPersonalNoteSaves();
  flushSafetySave();

  const payload = buildGlobalBackupPayload(type);
  const d = new Date();
  const dateStamp = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  const timeStamp = [String(d.getHours()).padStart(2, "0"), String(d.getMinutes()).padStart(2, "0")].join("-");

  const normalizedType = payload.backupType;
  const label = backupTypeLabel(normalizedType);
  const fileLabel = normalizedType === "full" ? (currentLang === "fr" ? "COMPLETE" : "FULL") : normalizedType === "person-a" ? "PERSON_A" : "PERSON_B";
  download(`Checklist_BDSM_${fileLabel}_${dateStamp}_${timeStamp}.json`, JSON.stringify(payload,null,2), "application/json");

  const info = {
    type:"export",
    backupType:normalizedType,
    exportedAt:payload.exportedAt,
    lastModifiedAt:payload.exportedAt,
    appVersion:APP_VERSION,
    schemaVersion:payload.schemaVersion
  };
  setGlobalLastExchange(info);

  if (currentLang === "fr") {
    const content = normalizedType === "full"
      ? "profils, réponses individuelles, données du couple, sécurité et réglages"
      : normalizedType === "person-a"
        ? "réponses personnelles de la Personne A et sécurité"
        : "réponses personnelles de la Personne B et sécurité";
    randomResult.innerHTML = `<strong>Sauvegarde ${label} créée :</strong> ${content} · schéma ${payload.schemaVersion} · ${APP_VERSION}.`;
  } else {
    const content = normalizedType === "full"
      ? "profiles, individual answers, couple data, safety and settings"
      : normalizedType === "person-a"
        ? "Person A personal answers and safety"
        : "Person B personal answers and safety";
    randomResult.innerHTML = `<strong>${label} backup created:</strong> ${content} · schema ${payload.schemaVersion} · ${APP_VERSION}.`;
  }
}

exportFullBtn.addEventListener("click", () => exportBackup("full"));
exportPersonABtn.addEventListener("click", () => exportBackup("person-a"));
exportPersonBBtn.addEventListener("click", () => exportBackup("person-b"));

loadSafety();
applyStaticLanguage();
renderLanguageButtons();
updateHelpLanguage();
updateAdultInfoLanguage();
renderCategoryControls();
renderExperienceModeUI();
renderExchangeInfo();
renderRoleUI();
render();
renderMergeReviewBanner();

requestAnimationFrame(showFirstUseGuideIfNeeded);

