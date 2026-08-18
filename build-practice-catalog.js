#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const B_DOM_SOURCE_FILE = path.join(ROOT, 'legacy-data', 'b-dom-a-sub-v1.1.55.js');
const A_DOM_SOURCE_FILE = path.join(ROOT, 'legacy-data', 'a-dom-b-sub-v1.1.55.js');
const OUT_FILE = path.join(ROOT, 'practice-catalog.js');
const REPORT_FILE = path.join(ROOT, 'CATALOG-MERGE-REPORT.md');

function loadChecklist(file) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  if (!context.window.CHECKLIST_DATA) throw new Error(`CHECKLIST_DATA missing in ${file}`);
  return context.window.CHECKLIST_DATA;
}

const sourceBDom = loadChecklist(B_DOM_SOURCE_FILE); // Person B dominant / Person A submissive
const sourceADom = loadChecklist(A_DOM_SOURCE_FILE); // Person A dominant / Person B submissive

function collectRuntimeI18nKeys() {
  const source = ['app.js', 'checklist.html']
    .map(file => fs.readFileSync(path.join(ROOT, file), 'utf8'))
    .join('\n');
  const keys = new Set();
  for (const match of source.matchAll(/data-i18n(?:-[\w-]+)?=["']([^"']+)["']/g)) keys.add(match[1]);
  for (const match of source.matchAll(/\bt\(\s*["']([^"']+)["']/g)) keys.add(match[1]);
  return keys;
}

function filteredRuntimeI18n(source, keys) {
  const out = {};
  for (const lang of ['fr', 'en']) {
    out[lang] = {};
    for (const key of keys) if (Object.prototype.hasOwnProperty.call(source?.[lang] || {}, key)) out[lang][key] = source[lang][key];
  }
  return out;
}

const RUNTIME_I18N_KEYS = collectRuntimeI18nKeys();
const RUNTIME_SOURCE_I18N = filteredRuntimeI18n(sourceADom.i18n, RUNTIME_I18N_KEYS);

const CATEGORY_MAP = Object.freeze({
  'Service sexuel / plaisir de la Maîtresse': 'Service sexuel / plaisir dominant',
  'Service sexuel / plaisir du Maître': 'Service sexuel / plaisir dominant',
  'Féminisation': 'Apparence / présentation',
  'Apparence / féminité imposée': 'Apparence / présentation',
  'CBT / jeux génitaux': 'Jeux génitaux',
  'Jeux vulvaires / génitaux': 'Jeux génitaux',
  'Partenaire masculin / jeux bi': 'Partenaire tiers / jeux bi',
  'Partenaire féminine / jeux bi': 'Partenaire tiers / jeux bi'
});
const CATEGORY_EN_MAP = Object.freeze({
  'Service sexuel / plaisir dominant': 'Sexual service / dominant pleasure',
  'Apparence / présentation': 'Appearance / presentation',
  'Jeux génitaux': 'Genital play',
  'Partenaire tiers / jeux bi': 'Third partner / bi play'
});

function unifiedCategory(category) { return CATEGORY_MAP[category] || category; }
function stripAccents(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function normalizeWords(s) {
  return stripAccents(s).toLowerCase()
    .replace(/\b(maitresse|maitre)\b/g, ' dominant ')
    .replace(/\b(soumise|soumis)\b/g, ' submissive ')
    .replace(/\b(femme|homme)\b/g, ' person ')
    .replace(/\b(elle|il)\b/g, ' pronoun ')
    .replace(/\b(sa|son|ses)\b/g, ' possessive ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function bigrams(s) {
  const x = normalizeWords(s);
  if (x.length < 2) return new Set([x]);
  const out = new Set();
  for (let i = 0; i < x.length - 1; i++) out.add(x.slice(i, i + 2));
  return out;
}
function diceSimilarity(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size && !B.size) return 1;
  let overlap = 0;
  for (const x of A) if (B.has(x)) overlap++;
  return (2 * overlap) / (A.size + B.size || 1);
}

const anatomyRe = /\b(penis|penis|testicule|testicules|vulve|vaginal|vaginale|vagin|clitoris|prostate|sein|seins|poitrine|sperme|ejaculation|uretral|uretre|gyn[eé]colog|cock|ball|genital|g[eé]nital|lingerie|perruque|maquillage|barbe)\b/i;
const specialAnatomyCategories = new Set(['Jeux génitaux', 'Apparence / présentation', 'Service sexuel / plaisir dominant', 'Partenaire tiers / jeux bi']);
const FORCE_PAIR_STATUS = new Map([
  [18, 'distinct'],
  [19, 'distinct'],
  [24, 'distinct'],
  [56, 'scenario-variant'],
  [69, 'anatomy-variant'],
  [77, 'anatomy-variant'],
  [80, 'neutralizable'],
  [102, 'anatomy-variant'],
  [162, 'scenario-variant'],
  [298, 'anatomy-variant'],
  [380, 'anatomy-variant'],
  [381, 'anatomy-variant'],
  [426, 'anatomy-variant'],
  [427, 'anatomy-variant'],
  [449, 'scenario-variant'],
  [477, 'neutralizable'],
  [500, 'anatomy-variant'],
  [501, 'anatomy-variant']
]);

function classify(a, b, legacyId) {
  const forced = FORCE_PAIR_STATUS.get(Number(legacyId));
  if (forced) return { status: forced, similarity: Math.max(diceSimilarity(a.practice, b.practice), diceSimilarity(a.practiceEn, b.practiceEn)) };
  const sameCategory = unifiedCategory(a.category) === unifiedCategory(b.category);
  const sameTitle = a.practice === b.practice && a.practiceEn === b.practiceEn;
  const sameExplanation = a.explanation === b.explanation && a.explanationEn === b.explanationEn;
  const sameRisk = (a.risk || 'normal') === (b.risk || 'normal');
  if (sameCategory && sameTitle && sameExplanation && sameRisk) return { status: 'identical', similarity: 1 };

  const similarity = Math.max(diceSimilarity(a.practice, b.practice), diceSimilarity(a.practiceEn, b.practiceEn));
  const normalizedSame = normalizeWords(a.practice) === normalizeWords(b.practice) || normalizeWords(a.practiceEn) === normalizeWords(b.practiceEn);
  if (sameCategory && (normalizedSame || similarity >= 0.84)) return { status: 'neutralizable', similarity };

  const anatomy = anatomyRe.test(`${a.practice} ${b.practice} ${a.practiceEn} ${b.practiceEn}`) || specialAnatomyCategories.has(unifiedCategory(a.category));
  if (anatomy && similarity >= 0.34) return { status: 'anatomy-variant', similarity };

  // Conservative split: very weak semantic similarity means the legacy slot clearly contains two different practices.
  if (similarity < 0.36) return { status: 'distinct', similarity };
  return { status: 'scenario-variant', similarity };
}

const ANATOMY_RULES = Object.freeze([
  { key:'testicles', re:/\b(testicule|testicules|couilles?|scrotum|bourses?|ball\s?busting|ball\s?stretch|ball\s?crush|ball\s?slap|cock\s?and\s?ball|cbt)\b/i },
  { key:'prostate', re:/\b(prostate|prostatique|prostatic)\b/i },
  { key:'vagina', re:/\b(vagin|vaginal(?:e|es)?|vaginally|vagina)\b/i },
  { key:'vulva', re:/\b(vulve|vulvaire|vulvar|clitoris|clitorid|clit\b)/i },
  { key:'breasts', re:/\b(seins?|poitrine|mamelons?|tétons?|tetons?|breasts?|nipples?)\b/i },
  { key:'penis', re:/\b(pénis|penis|gland|verge|cock\b)\b/i }
]);
const THIRD_PARTY_RE = /\b(partenaire\s+(?:masculin|féminin|féminine|masculine|feminine)|un\s+homme|une\s+femme|another\s+(?:man|woman)|third\s+partner|partenaire\s+tiers)\b/i;
const FAKE_BREASTS_RE = /\b(faux\s+seins?|fausses?\s+poitrines?|breast\s+forms?|fake\s+breasts?)\b/i;
const ANATOMY_OWNER_STEMS = Object.freeze({
  penis:'(?:pénis|penis|gland|verge|cock)', testicles:'(?:testicules?|couilles?|scrotum|bourses?)',
  prostate:'(?:prostate|prostatique)', vagina:'(?:vagin|vaginal(?:e)?)', vulva:'(?:vulve|vulvaire|clitoris|clitoridienne?)',
  breasts:'(?:seins?|poitrine|mamelons?|tétons?|tetons?)'
});
function explicitOwnerRole(text, anatomyKey) {
  const stem = ANATOMY_OWNER_STEMS[anatomyKey]; if (!stem) return null;
  const dominant = '(?:du\\s+ma[iî]tre|de\\s+la\\s+ma[iî]tresse|du\\s+dominant|de\\s+la\\s+dominante)';
  const submissive = '(?:du\\s+soumis|de\\s+la\\s+soumise)';
  // Tight adjacency is intentional: "clitoris ... permission du Maître" is not ownership.
  if (new RegExp(`${stem}\\s{0,3}${dominant}`, 'i').test(text) || new RegExp(`${dominant}\\s{0,3}${stem}`, 'i').test(text)) return 'dom';
  if (new RegExp(`${stem}\\s{0,3}${submissive}`, 'i').test(text) || new RegExp(`${submissive}\\s{0,3}${stem}`, 'i').test(text)) return 'sub';
  return null;
}
const REQUIREMENT_OVERRIDES = new Map([
  ['aDom:544', [{role:'sub',anatomy:'breasts'},{role:'dom',anatomy:'penis'}]],
  ['bDom:544', [{role:'dom',anatomy:'breasts'},{role:'sub',anatomy:'penis'}]],
  ['bDom:315', [{role:'dom',anatomy:'breasts'}]]
]);
function inferAnatomyRequirements(item, scenarioKey) {
  const override = REQUIREMENT_OVERRIDES.get(`${scenarioKey}:${Number(item.id)}`);
  if (override) return override;
  const title = String(item.practice || '');
  const explanation = String(item.explanation || '');
  const english = `${item.practiceEn || ''} ${item.explanationEn || ''}`;
  const text = `${title} ${explanation} ${english}`;
  // Third-party anatomy is intentionally not a hard requirement for A or B.
  if (THIRD_PARTY_RE.test(text)) return [];
  const requirements = [];
  for (const rule of ANATOMY_RULES) {
    if (!rule.re.test(text)) continue;
    if (rule.key === 'breasts' && FAKE_BREASTS_RE.test(text)) continue;
    let role;
    if (['penis','testicles','prostate'].includes(rule.key)) role = scenarioKey === 'aDom' ? 'dom' : 'sub';
    else if (['vulva','vagina'].includes(rule.key)) role = scenarioKey === 'aDom' ? 'sub' : 'dom';
    else role = 'sub';
    role = explicitOwnerRole(`${title} ${explanation}`, rule.key) || role;
    requirements.push({ role, anatomy:rule.key });
  }
  return requirements.filter((req, index, all) => all.findIndex(x => x.role === req.role && x.anatomy === req.anatomy) === index);
}



// ---------------------------------------------------------------------------
// Interaction model (single / give-receive / ds-role)
//
// The interaction axis is deliberately independent from anatomy and from the
// D/s dynamic. "give" never means "dominant". A submissive partner can give a
// practice (oral sex, massage, worship...) and a dominant partner can receive
// it. Legacy scenario projections are stored only to support the later data
// migration; they are not the future navigation model.
// ---------------------------------------------------------------------------
const INTERACTION_SCHEMA_VERSION = 1;
const AXIS = Object.freeze({ SINGLE:'single', DIRECTION:'give-receive', ROLE:'ds-role' });

const ROLE_CATEGORIES = new Set([
  'Contrôle de l’orgasme', 'Jeux psychologiques / contrôle', 'Chasteté',
  'Hypnose / conditionnement', 'Protocole / obéissance', 'Discipline / punitions',
  'Ownership / symboles D/s', 'Service', 'À distance', 'Contrôle financier',
  'CNC / contrainte consentie', 'Praise / récompenses', 'Objectification',
  'Pet play', 'Positions / contrainte', 'Jeux de rôle'
]);
const DIRECTION_CATEGORIES = new Set([
  'Jeux génitaux', 'Sexe oral / facesitting', 'Anal', 'Urine / salive / autres fluides',
  'Humiliation', 'Dirty talk / jeu verbal', 'Bondage / accessoires BDSM',
  'Jeux sensoriels', 'Impact play', 'Edge play / pratiques à risque',
  'Stimulation sexuelle / sextoys', 'Adoration', 'Médical / clinique',
  'Service sexuel / plaisir dominant'
]);
const SINGLE_CATEGORIES = new Set([
  'Pornographie', 'Fétichismes / tenues', 'Partenaires multiples', 'Partenaire tiers / jeux bi'
]);

// Strong title-level overrides for mixed categories and individual/self acts.
const ROLE_INTERACTION_RE = /\b(permission|interdiction|privation|ordre(?:s)?|ob[eé]issance|punition|r[eè]gle(?:s)?|contr[oô]le|collier|collaring|propri[eé]t[eé]|ownership|dressage|r[eé]compense|cons[eé]quence|tribut|budget|chastet[eé]|keyholder|humiliation de chastet[eé]|conditionnement|transe dirig[eé]e|t[aâ]che|service obligatoire|servir\b|human furniture|mobilier humain|position impos[eé]e|agenouille|mise au coin)\b/i;
const SINGLE_INTERACTION_RE = /\b(regarder\b.*ensemble|porno|porter\b|tenue|v[eê]tement|lingerie|latex|cuir|pvc|vinyle|corset|cuissardes|gants longs|perruque|maquillage|selfie|poser\b|s[eé]ance photo|filmer une sc[eè]ne|voyeurisme|exhibition|plan [aà] trois|partenaires multiples|primal play|lutte consentie|poursuite|fantasme)\b/i;
const DIRECTION_INTERACTION_RE = /\b(fess[eé]e|spank|fouet|cravache|claque|coups?|martinet|canne|paddle|bondage|attacher|entraves?|menottes|corde|bandeau|pinces?|morsures?|griffures?|tirage de cheveux|cire chaude|[eé]tranglement|contr[oô]le du cou|knife play|fire play|needle play|[eé]lectrostimulation|fellation|cunnilingus|anulingus|facesitting|masturb(?:er|ation)|doigter|fisting|p[eé]n[eé]tration|gode|vibromasseur|wand|footjob|adoration|l[eé]cher|cracher sur|uriner sur|insultes?|dirty talk|praise kink|chatouilles?|massage|examen gyn[eé]cologique|sondage ur[eé]tral|sp[eé]culum)\b/i;

const INTERACTION_AXIS_OVERRIDES = new Map([
  [21, AXIS.SINGLE], [23, AXIS.SINGLE], [27, AXIS.DIRECTION],
  [78, AXIS.SINGLE], [79, AXIS.SINGLE], [80, AXIS.SINGLE], [81, AXIS.SINGLE], [82, AXIS.SINGLE], [83, AXIS.SINGLE],
  [84, AXIS.ROLE], [92, AXIS.SINGLE], [157, AXIS.ROLE], [158, AXIS.ROLE],
  [159, AXIS.ROLE], [268, AXIS.ROLE], [504, AXIS.ROLE], [506, AXIS.ROLE],
  [533, AXIS.SINGLE], [535, AXIS.ROLE], [538, AXIS.ROLE], [540, AXIS.ROLE],
  [556, AXIS.SINGLE], [560, AXIS.SINGLE], [563, AXIS.ROLE], [596, AXIS.ROLE],
  [597, AXIS.SINGLE], [598, AXIS.ROLE]
]);
const INTERACTION_AXIS_SOURCE_OVERRIDES = new Map([
  ['aDom:18', AXIS.DIRECTION], ['bDom:18', AXIS.SINGLE],
  ['aDom:19', AXIS.DIRECTION], ['bDom:19', AXIS.SINGLE],
  ['aDom:24', AXIS.DIRECTION], ['bDom:24', AXIS.SINGLE]
]);

function combinedEntityText(blocks) {
  return blocks.filter(Boolean).map(b => `${b.practice || ''} ${b.explanation || ''} ${b.practiceEn || ''} ${b.explanationEn || ''}`).join(' | ');
}
function interactionAxisForBlocks(blocks) {
  const cats = [...new Set(blocks.filter(Boolean).map(b => unifiedCategory(b.category)))];
  const text = combinedEntityText(blocks);
  const titles = blocks.filter(Boolean).map(b => `${b.practice || ''} ${b.practiceEn || ''}`).join(' | ');
  const sourceOverrideKeys = blocks.map(b => `${b.sourceScenario}:${Number(b.legacyId)}`);
  if (sourceOverrideKeys.length && sourceOverrideKeys.every(k => INTERACTION_AXIS_SOURCE_OVERRIDES.has(k))) {
    const axes = [...new Set(sourceOverrideKeys.map(k => INTERACTION_AXIS_SOURCE_OVERRIDES.get(k)))];
    if (axes.length === 1) return { axis:axes[0], confidence:'high', reason:'manual-source-override' };
  }
  const legacyIds = [...new Set(blocks.map(b => Number(b.legacyId)).filter(Number.isFinite))];
  if (legacyIds.length === 1 && INTERACTION_AXIS_OVERRIDES.has(legacyIds[0])) {
    return { axis:INTERACTION_AXIS_OVERRIDES.get(legacyIds[0]), confidence:'high', reason:'manual-legacy-override' };
  }
  // Governance categories remain role-based even if their consequence is a
  // physical act (orgasm control, punishment, CNC...).
  if (cats.length && cats.every(c => ROLE_CATEGORIES.has(c))) return { axis:AXIS.ROLE, confidence:'high', reason:'role-category' };
  // Explicitly individual/shared wording wins before category defaults.
  if (SINGLE_INTERACTION_RE.test(titles)) return { axis:AXIS.SINGLE, confidence:'high', reason:'individual-or-shared-language' };
  // Physical categories use Give/Receive even when the explanation mentions
  // an order or D/s control: the D/s context is metadata, not the answer axis.
  if (cats.length && cats.every(c => DIRECTION_CATEGORIES.has(c))) return { axis:AXIS.DIRECTION, confidence:'high', reason:'direction-category' };
  if (cats.length && cats.every(c => SINGLE_CATEGORIES.has(c))) return { axis:AXIS.SINGLE, confidence:'high', reason:'single-category' };
  if (ROLE_INTERACTION_RE.test(titles)) return { axis:AXIS.ROLE, confidence:'high', reason:'ds-role-language' };
  if (DIRECTION_INTERACTION_RE.test(text)) return { axis:AXIS.DIRECTION, confidence:'high', reason:'physical-interaction' };
  // Mixed/uncertain categories stay single rather than inventing a direction.
  return { axis:AXIS.SINGLE, confidence:'review', reason:'conservative-fallback' };
}

const SUB_GIVER_RE = /\b(?:la\s+soumise|le\s+soumis)\s+(?:fait|donne|l[eè]che|l[eé]cher|suce|fait\s+une\s+fellation|masturbe|doigte|masse|urine|crache|sert)|\b(?:fellation|cunnilingus|anulingus|adoration|massage|masturber|doigter)\b.*\b(?:sur\s+ordre|du\s+ma[iî]tre|de\s+la\s+ma[iî]tresse|sur\s+le\s+ma[iî]tre|sur\s+la\s+ma[iî]tresse)\b|\bpar\s+(?:la\s+soumise|le\s+soumis)\b/i;
const DOM_GIVER_RE = /\b(?:le\s+ma[iî]tre|la\s+ma[iî]tresse|le\s+dominant|la\s+dominante)\s+(?:fait|donne|frappe|fesse|fouette|attache|mord|griffe|urine|crache|masturbe|doigte|p[eé]n[eè]tre)|\bpar\s+(?:le\s+ma[iî]tre|la\s+ma[iî]tresse|le\s+dominant|la\s+dominante)\b/i;
const DOM_GIVER_TITLE_RE = /\b(fess[eé]e|fouet|cravache|claque|coups?|martinet|canne|paddle|bondage|entraves?|menottes|corde|bandeau|pinces?|morsures?|griffures?|tirage de cheveux|cire chaude|[eé]tranglement|knife play|fire play|needle play|[eé]lectrostimulation|humiliation|insultes?|dirty talk|punition|facesitting)\b/i;
const SUB_GIVER_TITLE_RE = /\b(fellation|cunnilingus|anulingus|adoration|l[eé]cher les (?:pieds|chaussures|bottes)|striptease|lap dance|massage)\b/i;

const EXPLICIT_DOM_PERFORMER_RE = /(?:\b(?:fellation|cunnilingus|anulingus)\b[^|]{0,35}\b(?:du\s+ma[iî]tre|de\s+la\s+ma[iî]tresse)\b[^|]{0,20}\bsur\b|\b(?:masturbation|fisting|footjob|stimulation|massage)\b[^|]{0,45}\bpar\s+(?:le\s+ma[iî]tre|la\s+ma[iî]tresse)\b)/i;
const EXPLICIT_SUB_PERFORMER_RE = /(?:\b(?:fellation|cunnilingus|anulingus)\b[^|]{0,35}\b(?:du\s+soumis|de\s+la\s+soumise)\b[^|]{0,20}\bsur\b|\b(?:masturbation|fisting|footjob|stimulation|massage)\b[^|]{0,45}\bpar\s+(?:le\s+soumis|la\s+soumise)\b)/i;

const DIRECTION_GIVER_DEFAULT_BY_CATEGORY = Object.freeze({
  'Jeux génitaux':'dom', 'Anal':'dom', 'Humiliation':'dom', 'Dirty talk / jeu verbal':'dom',
  'Bondage / accessoires BDSM':'dom', 'Jeux sensoriels':'dom', 'Impact play':'dom',
  'Edge play / pratiques à risque':'dom', 'Stimulation sexuelle / sextoys':'dom',
  'Médical / clinique':'dom', 'Adoration':'sub', 'Service sexuel / plaisir dominant':'sub',
  'Sexe oral / facesitting':'sub'
});

const DIRECTION_GIVER_SOURCE_OVERRIDES = new Map([
  ['aDom:18','dom'], ['aDom:19','dom'], ['aDom:24','dom'],
  ['aDom:26','dom'], ['bDom:26','sub'], ['aDom:27','sub'], ['bDom:27','dom'],
  ['bDom:106','dom'], ['aDom:107','dom'], ['bDom:107','dom'], ['bDom:108','dom'],
  ['aDom:386','dom'], ['bDom:386','dom']
]);

function inferDirectionalGiverRole(block) {
  const text = `${block.practice || ''} ${block.explanation || ''}`;
  const title = String(block.practice || '');
  const sourceKey = `${block.sourceScenario}:${Number(block.legacyId)}`;
  if (DIRECTION_GIVER_SOURCE_OVERRIDES.has(sourceKey)) return { role:DIRECTION_GIVER_SOURCE_OVERRIDES.get(sourceKey), confidence:'high', reason:'manual-source-projection' };
  // Explicit performer grammar beats generic act defaults, but is restricted
  // to the practice title so "rythme imposé par le Maître" cannot turn the
  // Master into the giver of a fellatio.
  if (EXPLICIT_SUB_PERFORMER_RE.test(title)) return { role:'sub', confidence:'high', reason:'explicit-sub-performer' };
  if (EXPLICIT_DOM_PERFORMER_RE.test(title)) return { role:'dom', confidence:'high', reason:'explicit-dom-performer' };
  // Named acts such as fellatio/cunnilingus define who gives the act more
  // reliably than nearby D/s context.
  if (SUB_GIVER_TITLE_RE.test(title)) return { role:'sub', confidence:'medium', reason:'act-default-sub' };
  if (DOM_GIVER_TITLE_RE.test(title)) return { role:'dom', confidence:'medium', reason:'act-default-dom' };
  if (SUB_GIVER_RE.test(text)) return { role:'sub', confidence:'high', reason:'explicit-sub-actor' };
  if (DOM_GIVER_RE.test(text)) return { role:'dom', confidence:'high', reason:'explicit-dom-actor' };
  const cat = unifiedCategory(block.category);
  const defaultRole = DIRECTION_GIVER_DEFAULT_BY_CATEGORY[cat];
  if (defaultRole) return { role:defaultRole, confidence:'medium', reason:`category-default-${defaultRole}` };
  return { role:null, confidence:'review', reason:'direction-unknown' };
}

function projectionForScenario(axis, scenarioKey, block) {
  const roles = scenarioKey === 'aDom'
    ? { personA:'dom', personB:'sub' }
    : { personA:'sub', personB:'dom' };
  if (axis === AXIS.SINGLE) return { personA:'interest', personB:'interest' };
  if (axis === AXIS.ROLE) return {
    personA: roles.personA === 'dom' ? 'dominant' : 'submissive',
    personB: roles.personB === 'dom' ? 'dominant' : 'submissive'
  };
  const inferred = inferDirectionalGiverRole(block);
  if (!inferred.role) return { personA:'legacy', personB:'legacy', giverRole:null, confidence:inferred.confidence, reason:inferred.reason };
  const receiverRole = inferred.role === 'dom' ? 'sub' : 'dom';
  return {
    personA: roles.personA === inferred.role ? 'give' : roles.personA === receiverRole ? 'receive' : 'legacy',
    personB: roles.personB === inferred.role ? 'give' : roles.personB === receiverRole ? 'receive' : 'legacy',
    giverRole: inferred.role,
    confidence: inferred.confidence,
    reason: inferred.reason
  };
}

function requirementOwnerSlot(axis, projection, role) {
  if (axis === AXIS.ROLE) return role === 'dom' ? 'dominant' : 'submissive';
  if (axis === AXIS.DIRECTION) {
    if (projection.giverRole === role) return 'give';
    if (projection.giverRole && projection.giverRole !== role) return 'receive';
  }
  return 'interest';
}

function requirementAlternativesForSlots(axis, blocksByScenario, legacyProjection) {
  const bySlot = {};
  const add = (slot, group) => {
    if (!slot || !group.length) return;
    const clean = group.filter(x => x && x.anatomy && x.subject).sort((a,b)=>`${a.subject}:${a.anatomy}`.localeCompare(`${b.subject}:${b.anatomy}`));
    if (!clean.length) return;
    const signature = JSON.stringify(clean);
    bySlot[slot] ||= [];
    if (!bySlot[slot].some(x => JSON.stringify(x.all) === signature)) bySlot[slot].push({ all:clean });
  };
  for (const [scenarioKey, block] of Object.entries(blocksByScenario)) {
    if (!block || !(block.anatomyRequirements || []).length) continue;
    const projection = legacyProjection[scenarioKey] || {};
    if (axis === AXIS.DIRECTION && projection.giverRole) {
      const giver = [], receiver = [];
      for (const req of block.anatomyRequirements || []) {
        if (req.role === projection.giverRole) {
          giver.push({subject:'self', anatomy:req.anatomy});
          receiver.push({subject:'partner', anatomy:req.anatomy});
        } else {
          giver.push({subject:'partner', anatomy:req.anatomy});
          receiver.push({subject:'self', anatomy:req.anatomy});
        }
      }
      add('give', giver); add('receive', receiver);
    } else if (axis === AXIS.ROLE) {
      const dominant = [], submissive = [];
      for (const req of block.anatomyRequirements || []) {
        if (req.role === 'dom') {
          dominant.push({subject:'self', anatomy:req.anatomy});
          submissive.push({subject:'partner', anatomy:req.anatomy});
        } else {
          dominant.push({subject:'partner', anatomy:req.anatomy});
          submissive.push({subject:'self', anatomy:req.anatomy});
        }
      }
      add('dominant', dominant); add('submissive', submissive);
    } else if (axis === AXIS.SINGLE) {
      // Legacy role ownership is not reliable enough to infer a personal-body
      // requirement for a directionless preference. Preserve the evidence for
      // audit/migration but do not hide a personal choice on a guess.
    }
  }
  return bySlot;
}

function interactionForEntity(blocksByScenario) {
  const blocks = Object.values(blocksByScenario).filter(Boolean);
  const inferred = interactionAxisForBlocks(blocks);
  const legacyProjection = {};
  const evidence = [];
  const requirementEvidence = [];
  for (const [scenarioKey, block] of Object.entries(blocksByScenario)) {
    if (!block) continue;
    const p = projectionForScenario(inferred.axis, scenarioKey, block);
    legacyProjection[scenarioKey] = p;
    evidence.push({ scenario:scenarioKey, projection:{personA:p.personA,personB:p.personB}, giverRole:p.giverRole || null, confidence:p.confidence || inferred.confidence, reason:p.reason || inferred.reason });
    for (const req of block.anatomyRequirements || []) {
      requirementEvidence.push({ scenario:scenarioKey, slot:requirementOwnerSlot(inferred.axis,p,req.role), anatomy:req.anatomy, legacyRole:req.role });
    }
  }
  const requirementsBySlot = requirementAlternativesForSlots(inferred.axis, blocksByScenario, legacyProjection);
  const projectionNeedsReview = evidence.some(x => x.confidence === 'review' || x.projection.personA === 'legacy' || x.projection.personB === 'legacy');
  return {
    schemaVersion: INTERACTION_SCHEMA_VERSION,
    axis: inferred.axis,
    confidence: inferred.confidence,
    reason: inferred.reason,
    slots: inferred.axis === AXIS.SINGLE ? ['interest'] : inferred.axis === AXIS.DIRECTION ? ['give','receive'] : ['dominant','submissive'],
    variants: inferred.axis === AXIS.SINGLE ? ['shared'] : inferred.axis === AXIS.DIRECTION ? ['a-to-b','b-to-a'] : ['a-dominant','b-dominant'],
    requirementsBySlot,
    legacyProjection,
    requirementEvidence,
    needsProjectionReview: projectionNeedsReview
  };
}

function scenarioBlock(item, displayIndex, scenarioKey) {
  return {
    legacyId: Number(item.id),
    sourceScenario: scenarioKey,
    displayIndex,
    category: unifiedCategory(item.category),
    sourceCategory: item.category,
    practice: item.practice,
    explanation: item.explanation,
    practiceEn: item.practiceEn,
    explanationEn: item.explanationEn,
    anatomyRequirements: inferAnatomyRequirements(item, scenarioKey),
    level: item.level,
    risk: item.risk || 'normal'
  };
}

const fById = new Map(sourceBDom.items.map((item, index) => [Number(item.id), { item, index: index + 1 }]));
const mById = new Map(sourceADom.items.map((item, index) => [Number(item.id), { item, index: index + 1 }]));
const ids = [...new Set([...fById.keys(), ...mById.keys()])].sort((a, b) => a - b);
const entities = [];
const auditRows = [];

for (const id of ids) {
  const f = fById.get(id), m = mById.get(id);
  if (!f || !m) throw new Error(`Legacy catalog mismatch for id ${id}`);
  const result = classify(m.item, f.item, id); // A-dom first, B-dom second
  const baseAudit = { legacyId: id, status: result.status, similarity: Number(result.similarity.toFixed(3)), a: m.item.practice, b: f.item.practice };
  auditRows.push(baseAudit);

  if (result.status === 'distinct') {
    entities.push({
      id: `practice-${String(id).padStart(4, '0')}-a`,
      mergeStatus: 'distinct',
      legacy: { aDom: id, bDom: null },
      scenarios: { aDom: scenarioBlock(m.item, m.index, 'aDom') }
    });
    entities.push({
      id: `practice-${String(id).padStart(4, '0')}-b`,
      mergeStatus: 'distinct',
      legacy: { aDom: null, bDom: id },
      scenarios: { bDom: scenarioBlock(f.item, f.index, 'bDom') }
    });
  } else {
    entities.push({
      id: `practice-${String(id).padStart(4, '0')}`,
      mergeStatus: result.status,
      similarity: Number(result.similarity.toFixed(3)),
      legacy: { aDom: id, bDom: id },
      scenarios: {
        aDom: scenarioBlock(m.item, m.index, 'aDom'),
        bDom: scenarioBlock(f.item, f.index, 'bDom')
      }
    });
  }
}


// Attach the future per-person interaction model after both legacy scenario
// blocks are known. The current UI still consumes the legacy scenario blocks;
// steps 2–4 will progressively switch reading/writing to this model.
for (const entity of entities) {
  entity.interaction = interactionForEntity(entity.scenarios || {});
}

const categoryColors = {};
const categoryEn = {};
for (const source of [sourceADom, sourceBDom]) {
  for (const [cat, color] of Object.entries(source.categoryColors || {})) {
    const unified = unifiedCategory(cat);
    if (!categoryColors[unified]) categoryColors[unified] = color;
  }
  for (const [cat, en] of Object.entries(source.categoryEn || {})) {
    const unified = unifiedCategory(cat);
    if (!categoryEn[unified]) categoryEn[unified] = CATEGORY_EN_MAP[unified] || en;
  }
}
Object.assign(categoryEn, CATEGORY_EN_MAP);

const counts = auditRows.reduce((acc, row) => ((acc[row.status] = (acc[row.status] || 0) + 1), acc), {});

// Rich audit metadata is used only while generating the catalog. The browser
// receives the smaller runtime shape required by UI, interaction and migration.
function runtimeScenario(block) {
  return {
    legacyId:block.legacyId,
    category:block.category,
    practice:block.practice,
    explanation:block.explanation,
    practiceEn:block.practiceEn,
    explanationEn:block.explanationEn,
    level:block.level,
    risk:block.risk
  };
}
function runtimeEntity(entity) {
  return {
    id:entity.id,
    scenarios:Object.fromEntries(Object.entries(entity.scenarios || {}).map(([key,block]) => [key,runtimeScenario(block)])),
    interaction:{
      axis:entity.interaction.axis,
      requirementsBySlot:entity.interaction.requirementsBySlot,
      legacyProjection:entity.interaction.legacyProjection
    }
  };
}
const runtimeEntities = entities.map(runtimeEntity);
const runtime = `/* Generated by tools/build-practice-catalog.js. Do not hand-edit. */\n` +
`(() => {\n` +
`  const CATALOG = ${JSON.stringify({ schemaVersion: 2, interactionSchemaVersion: INTERACTION_SCHEMA_VERSION, sourceVersion: 'V1.1.55', entities:runtimeEntities, categoryColors, categoryEn })};\n` +
`  const profile = window.CHECKLIST_PROFILE_API?.get?.() || null;\n` +
`  const sourceI18n = ${JSON.stringify(RUNTIME_SOURCE_I18N)};\n` +
`  const i18n = JSON.parse(JSON.stringify(sourceI18n));\n` +
`  const personAName = profile?.personA?.name || 'Personne A';\n` +
`  const personBName = profile?.personB?.name || 'Personne B';\n` +
`  for (const lang of ['fr','en']) {\n` +
`    const fr = lang === 'fr';\n` +
`    const d = i18n[lang];\n` +
`    d.appTitle = (fr ? 'Checklist BDSM — ' : 'BDSM Checklist — ') + personAName + ' & ' + personBName;\n` +
`    d.titleExtra = '';\n` +
`    d.personA = personAName;\n` +
`    d.personB = personBName;\n` +
`    d.backupPersonA = '🔵 ' + personAName;\n` +
`    d.backupPersonB = '🟣 ' + personBName;\n` +
`    d.backupHint = fr ? 'Complète = profils, réponses des deux personnes et données du couple · Personne A/B = réponses personnelles uniquement.' : 'Full = profiles, both people’s answers and couple data · Person A/B = personal answers only.';\n` +
`    d.minFilterAria = fr ? 'Filtrer par niveau effectif minimal' : 'Filter by minimum effective level';\n` +
`    d.readingLegendResults = fr ? personAName + ' à gauche, ' + personBName + ' à droite, avec le résultat du couple pour chaque variante.' : personAName + ' on the left, ' + personBName + ' on the right, with the couple result for each variant.';\n` +
`    d.readingLegendCheckPersonA = fr ? '✓ sous ' + personAName + ' : déjà essayé par cette personne.' : '✓ under ' + personAName + ': already tried by this person.';\n` +
`    d.readingLegendCheckPersonB = fr ? '✓ sous ' + personBName + ' : déjà essayé par cette personne.' : '✓ under ' + personBName + ': already tried by this person.';\n` +
`    for (const key of Object.keys(d)) {\n` +
`      if (typeof d[key] !== 'string') continue;\n` +
`      d[key] = d[key].replaceAll('Personne A', personAName).replaceAll('Person A', personAName).replaceAll('Personne B', personBName).replaceAll('Person B', personBName);\n` +
`    }\n` +
`  }\n` +
`  window.CHECKLIST_CATALOG = Object.freeze(CATALOG);\n` +
`  window.CHECKLIST_DATA = Object.freeze({ categoryColors:CATALOG.categoryColors, categoryEn:CATALOG.categoryEn, i18n });\n` +
`})();\n`;
fs.writeFileSync(OUT_FILE, runtime);
const interactionCounts = entities.reduce((acc,e)=>{ acc[e.interaction.axis]=(acc[e.interaction.axis]||0)+1; return acc; },{});
const projectionReview = entities.filter(e=>e.interaction.needsProjectionReview);
const report = `# Rapport catalogue et modèle d'interaction\n\n` +
`Source historique : V1.1.55, 600 entrées par orientation.\n\n` +
`## Catalogue\n\n` +
`- Entrées source par orientation : 600\n` +
`- Entités logiques : ${entities.length}\n` +
`- Catégories unifiées : ${Object.keys(categoryColors).length}\n` +
Object.entries(counts).sort().map(([k,v]) => `- fusion ${k}: ${v}`).join('\n') + `\n\n` +
`## Axes de réponse individuels\n\n` +
Object.entries(interactionCounts).sort().map(([k,v]) => `- ${k}: ${v}`).join('\n') + `\n` +
`- projections historiques encore ambiguës : ${projectionReview.length}\n\n` +
`Les réponses futures sont personnelles : \`interest\`, \`give/receive\` ou \`dominant/submissive\`. Donner n'est jamais assimilé à dominer. Les scénarios historiques sont conservés uniquement comme source de migration.\n\n` +
`Trois slots historiques supplémentaires (18, 19, 24) ont été séparés car une orientation décrivait une interaction de couple alors que l'autre décrivait une pratique individuelle/de soi.\n\n` +
`## Entrées séparées avec prudence\n\n` + auditRows.filter(r => r.status === 'distinct').map(r => `- ${r.legacyId} — A-dom: **${r.a}** / B-dom: **${r.b}** (similarité ${r.similarity})`).join('\n') + `\n`;
fs.writeFileSync(REPORT_FILE, report);
console.log(`Generated ${path.relative(ROOT, OUT_FILE)} with ${entities.length} unified entities.`);
console.log(counts);
