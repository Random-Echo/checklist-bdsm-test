window.CHECKLIST_RELEASE = "V1.1.159";
window.CHECKLIST_SITE = Object.freeze({
  languageKey: "bdsmChecklistSite_language_v1",
  adultKey: "bdsmChecklistSite_adultConfirmed_v1",
  onboardingKey: "bdsmChecklistSite_firstUseGuide_v1"
});

(() => {
  try {
    const { languageKey, adultKey } = window.CHECKLIST_SITE;
    const saved = localStorage.getItem(languageKey);
    const lang = saved === "fr" || saved === "en"
      ? saved
      : (String(navigator.language || "").toLowerCase().startsWith("fr") ? "fr" : "en");
    document.documentElement.lang = lang;
    if (localStorage.getItem(adultKey) !== "true") document.documentElement.classList.add("adult-gate-required");
  } catch (_) {
    document.documentElement.classList.add("adult-gate-required");
  }
})();


(() => {
  const applyRelease = () => {
    const release = window.CHECKLIST_RELEASE || "";
    document.documentElement.dataset.appVersion = release;
    document.querySelectorAll("[data-app-version]").forEach(el => { el.textContent = release; });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyRelease, {once:true});
  else applyRelease();
})();
