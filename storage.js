(() => {
  'use strict';

  const CATALOG = window.CHECKLIST_CATALOG;
  const INTERACTION = window.CHECKLIST_INTERACTION_MODEL;
  if (!CATALOG || !INTERACTION) throw new Error('Checklist storage requires catalog and interaction model.');

  const SCHEMA_VERSION = 5;
  const PERSON_KEYS = Object.freeze(['personA','personB']);
  const PERSONAL_BACKUP_TYPES = Object.freeze(['person-a','person-b']);
  const BACKUP_TYPES = Object.freeze(['full', ...PERSONAL_BACKUP_TYPES]);
  const SITE_BACKUP_ID = 'bdsm-checklists-couple-v2';
  const LEGACY_SITE_BACKUP_ID = 'bdsm-checklists-couple';
  const LEGACY_BACKUP_VERSION = 2;
  const KEYS = Object.freeze({
    personalResponses:'bdsmChecklistV2_personalResponses_v2',
    coupleState:'bdsmChecklistV2_coupleState_v1',
    safety:'bdsmChecklistV2_safety_v1',
    sessions:'bdsmChecklistV2_sessions_v2',
    display:'bdsmChecklistV2_display_v2',
    random:'bdsmChecklistV2_random_v2',
    meta:'bdsmChecklistV2_meta_v2',
    legacyArchive:'bdsmChecklistV2_migrationArchive_v1'
  });
  const LEGACY_ACTIVE_KEYS = Object.freeze({
    responses:'bdsmChecklistV2_responses_v1',
    personalResponses:'bdsmChecklistV2_personalResponses_v1',
    sessions:'bdsmChecklistV2_sessions_v1',
    display:'bdsmChecklistV2_display_v1',
    random:'bdsmChecklistV2_random_v1',
    meta:'bdsmChecklistV2_meta_v1'
  });

  const LEGACY_VARIANT_FORMATS = Object.freeze({
    'maitre-soumise': Object.freeze({ scenario:'a-dom', namespace:'maledomChecklistFRInteractive', prefix:'maledom', personARole:'dom', personBRole:'sub' }),
    'maitresse-soumis': Object.freeze({ scenario:'b-dom', namespace:'femdomChecklistFRInteractive', prefix:'femdom', personARole:'sub', personBRole:'dom' })
  });

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const nowIso = () => new Date().toISOString();
  const isPerson = p => p === 'personA' || p === 'personB';
  function readJson(key, fallback) { try { const raw=localStorage.getItem(key); return raw === null ? clone(fallback) : JSON.parse(raw); } catch(_) { return clone(fallback); } }
  function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function validScore(v) { return Number.isInteger(v) && v >= 0 && v <= 5 ? v : null; }
  function nonEmptyString(v) { return typeof v === 'string' && v.length ? v : ''; }

  const entityByV2 = new Map((CATALOG.entities || []).map(e => [e.id, e]));
  const v2ByScenarioLegacy = new Map();
  let personalResponsesCache = null;
  let coupleStateCache = null;
  let sessionsCache = null;
  let randomCache = null;
  let displayCache = null;
  let metaCache = null;
  let safetyCache = null;
  const readerPracticeCache = new Map();
  const personalPracticeCache = new Map();
  const personalSummaryCache = new Map();

  function invalidateReaderPractice(v2Id=null){
    if(v2Id) readerPracticeCache.delete(v2Id);
    else readerPracticeCache.clear();
  }
  function invalidatePersonalDerived(v2Id=null){
    invalidateReaderPractice(v2Id);
    if(v2Id) personalPracticeCache.delete(v2Id); else personalPracticeCache.clear();
    personalSummaryCache.clear();
  }
  function resetRuntimeCaches(){
    personalResponsesCache=null; coupleStateCache=null; sessionsCache=null; randomCache=null; displayCache=null; metaCache=null; safetyCache=null;
    readerPracticeCache.clear(); personalPracticeCache.clear(); personalSummaryCache.clear();
  }
  for (const entity of CATALOG.entities || []) {
    for (const [scenarioKey, block] of Object.entries(entity.scenarios || {})) {
      const scenario = scenarioKey === 'aDom' ? 'a-dom' : scenarioKey === 'bDom' ? 'b-dom' : null;
      if (scenario && block?.legacyId != null) v2ByScenarioLegacy.set(`${scenario}:${Number(block.legacyId)}`, entity.id);
    }
  }

  function scenarioRoles(scenario) { return scenario === 'b-dom' ? {personA:'sub',personB:'dom'} : {personA:'dom',personB:'sub'}; }
  function personForRole(scenario, role) { const roles=scenarioRoles(scenario); return roles.personA===role?'personA':'personB'; }
  function roleForPerson(scenario, person) { return scenarioRoles(scenario)[person]; }
  function legacyFieldsForRole(role) { return role==='dom'?{want:'wantDom',prior:'priorDom',after:'afterDom'}:{want:'wantSub',prior:'priorSub',after:'afterSub'}; }
  function legacyNoteFieldForPerson(person) { return person==='personA'?'noteMale':'noteFemale'; }
  function runtimeNoteFieldForPerson(person) { return person==='personA'?'notePersonA':'notePersonB'; }
  function legacyTypeToPerson(type) { return type==='male'||type==='person-a'?'personA':type==='female'||type==='person-b'?'personB':null; }
  function personToBackupType(person) { return person==='personA'?'person-a':'person-b'; }

  function normalizeParticipant(raw) {
    const out={}; const preference=validScore(raw?.preference); if(preference!==null) out.preference=preference;
    if(raw?.prior===true) out.prior=true; const after=validScore(raw?.after); if(after!==null) out.after=after;
    const note=nonEmptyString(raw?.note); if(note) out.note=note; return out;
  }
  function participantHasData(state) { return Object.keys(normalizeParticipant(state)).length>0; }

  function emptyLegacyResponses(){ return {schemaVersion:1,practices:{}}; }
  function normalizeLegacyScenarioState(raw){ const out={participants:{personA:normalizeParticipant(raw?.participants?.personA),personB:normalizeParticipant(raw?.participants?.personB)},common:{}}; if(raw?.common?.doneTogether===true) out.common.doneTogether=true; return out; }
  function legacyScenarioHasState(state){ return !!state && (state.common?.doneTogether===true || participantHasData(state.participants?.personA) || participantHasData(state.participants?.personB)); }
  function normalizeLegacyResponses(raw){ const out=emptyLegacyResponses(); for(const [id,p] of Object.entries(raw?.practices||{})){ if(!entityByV2.has(id)) continue; const scenarios={}; for(const scenario of ['a-dom','b-dom']){const s=normalizeLegacyScenarioState(p?.scenarios?.[scenario]);if(legacyScenarioHasState(s))scenarios[scenario]=s;} if(Object.keys(scenarios).length)out.practices[id]={scenarios}; } return out; }

  function emptyPersonalResponses(){ return {schemaVersion:INTERACTION.responseSchemaVersion||1,practices:{}}; }
  function joinUniqueNotes(parts){
    const seen=new Set(),clean=[];
    for(const part of parts||[]){const value=nonEmptyString(part);if(!value||seen.has(value))continue;seen.add(value);clean.push(value);}
    return clean.join("\n\n");
  }
  function legacyPracticeNote(practice,person,entity){
    const parts=[];
    const direct=nonEmptyString(practice?.notes?.[person])||nonEmptyString(practice?.[person==='personA'?'notePersonA':'notePersonB']);
    if(direct) parts.push(direct);
    const practiceBefore=nonEmptyString(practice?.noteBefore?.[person])||nonEmptyString(practice?.beforeNote?.[person]);
    const practiceAfter=nonEmptyString(practice?.noteAfter?.[person])||nonEmptyString(practice?.afterNote?.[person]);
    if(practiceBefore) parts.push(`Avant : ${practiceBefore}`);
    if(practiceAfter) parts.push(`Après : ${practiceAfter}`);
    for(const slot of INTERACTION.slotsForEntity(entity)){
      const raw=practice?.persons?.[person]?.[slot];
      const note=nonEmptyString(raw?.note);
      if(note) parts.push(note);
      const before=nonEmptyString(raw?.noteBefore)||nonEmptyString(raw?.beforeNote)||nonEmptyString(raw?.preNote);
      const after=nonEmptyString(raw?.noteAfter)||nonEmptyString(raw?.afterNote)||nonEmptyString(raw?.postNote);
      if(before) parts.push(`Avant : ${before}`);
      if(after) parts.push(`Après : ${after}`);
    }
    return joinUniqueNotes(parts);
  }
  function normalizePersonalResponses(raw){
    const out=emptyPersonalResponses();
    for(const [v2Id,practice] of Object.entries(raw?.practices||{})){
      const entity=entityByV2.get(v2Id); if(!entity) continue;
      const dst={persons:{personA:{},personB:{}},notes:{}};
      for(const person of PERSON_KEYS){
        const note=legacyPracticeNote(practice,person,entity); if(note) dst.notes[person]=note;
        for(const slot of INTERACTION.slotsForEntity(entity)){
          const state=normalizeParticipant(practice?.persons?.[person]?.[slot]);
          delete state.note;
          if(Object.keys(state).length) dst.persons[person][slot]=state;
        }
      }
      if(Object.keys(dst.persons.personA).length||Object.keys(dst.persons.personB).length||Object.keys(dst.notes).length) out.practices[v2Id]=dst;
    }
    return out;
  }
  function mergeMissingPersonal(base, incoming){
    const out=normalizePersonalResponses(base),src=normalizePersonalResponses(incoming);
    for(const [v2Id,p] of Object.entries(src.practices||{})){
      const dst=out.practices[v2Id]||{persons:{personA:{},personB:{}},notes:{}};
      dst.notes=dst.notes||{};
      for(const person of PERSON_KEYS){
        for(const [slot,state] of Object.entries(p?.persons?.[person]||{})) if(!Object.keys(dst.persons[person]?.[slot]||{}).length&&Object.keys(state||{}).length) dst.persons[person][slot]=clone(state);
        if(!nonEmptyString(dst.notes[person])&&nonEmptyString(p?.notes?.[person])) dst.notes[person]=p.notes[person];
      }
      if(Object.keys(dst.persons.personA).length||Object.keys(dst.persons.personB).length||Object.keys(dst.notes).length) out.practices[v2Id]=dst;
    }
    return out;
  }
  function projectLegacyResponsesToPersonal(source){
    const sourceResponses=normalizeLegacyResponses(source), out=emptyPersonalResponses();
    for(const entity of CATALOG.entities||[]){
      const p=sourceResponses.practices?.[entity.id]; if(!p) continue; const dst={persons:{personA:{},personB:{}}};
      for(const person of ['personA','personB']) for(const slot of INTERACTION.slotsForEntity(entity)){
        const states=[]; for(const scenario of ['a-dom','b-dom']) if(INTERACTION.slotForLegacyPerson(entity,scenario,person)===slot){const s=p.scenarios?.[scenario]?.participants?.[person];if(participantHasData(s))states.push(normalizeParticipant(s));}
        if(states.length){ states.sort((a,b)=>(Object.keys(b).length+(Number.isInteger(b.after)?2:0)+(Number.isInteger(b.preference)?1:0))-(Object.keys(a).length+(Number.isInteger(a.after)?2:0)+(Number.isInteger(a.preference)?1:0))); dst.persons[person][slot]=states[0]; }
      }
      if(Object.keys(dst.persons.personA).length||Object.keys(dst.persons.personB).length) out.practices[entity.id]=dst;
    }
    return out;
  }
  function personalResponsesStore(){
    if (!personalResponsesCache){
      const raw=readJson(KEYS.personalResponses,emptyPersonalResponses());
      personalResponsesCache=normalizePersonalResponses(raw);
      if(JSON.stringify(raw)!==JSON.stringify(personalResponsesCache)) writeJson(KEYS.personalResponses,personalResponsesCache);
    }
    return personalResponsesCache;
  }
  function loadPersonalResponses(){ return clone(personalResponsesStore()); }
  function savePersonalResponses(v){ personalResponsesCache = normalizePersonalResponses(v); invalidatePersonalDerived(); writeJson(KEYS.personalResponses, personalResponsesCache); }
  function persistPersonalResponses(){ writeJson(KEYS.personalResponses, personalResponsesStore()); }

  function emptyCoupleState(){ return {schemaVersion:1,practices:{}}; }
  function normalizeVariantCommon(raw){ const out={}; if(raw?.doneTogether===true) out.doneTogether=true; return out; }
  function commonHasData(raw){ return normalizeVariantCommon(raw).doneTogether===true; }
  function normalizeCoupleState(raw){
    const out=emptyCoupleState();
    for(const [v2Id,p] of Object.entries(raw?.practices||{})){
      const entity=entityByV2.get(v2Id); if(!entity) continue; const variants={};
      for(const variant of INTERACTION.variantsForEntity(entity)){const state=normalizeVariantCommon(p?.variants?.[variant]);if(commonHasData(state))variants[variant]=state;}
      if(Object.keys(variants).length) out.practices[v2Id]={variants};
    }
    return out;
  }
  function coupleStateStore(){
    if (!coupleStateCache) coupleStateCache = normalizeCoupleState(readJson(KEYS.coupleState, emptyCoupleState()));
    return coupleStateCache;
  }
  function loadCoupleState(){ return clone(coupleStateStore()); }
  function saveCoupleState(v){ coupleStateCache = normalizeCoupleState(v); invalidateReaderPractice(); writeJson(KEYS.coupleState, coupleStateCache); }
  function persistCoupleState(){ writeJson(KEYS.coupleState, coupleStateStore()); }
  function projectLegacyResponsesToCouple(source){
    const src=normalizeLegacyResponses(source), out=emptyCoupleState();
    for(const [v2Id,p] of Object.entries(src.practices||{})){
      const entity=entityByV2.get(v2Id); if(!entity) continue;
      for(const scenario of ['a-dom','b-dom']){const s=p.scenarios?.[scenario];if(s?.common?.doneTogether!==true)continue;const variant=INTERACTION.variantForLegacyScenario(entity,scenario);if(!variant)continue;out.practices[v2Id]=out.practices[v2Id]||{variants:{}};out.practices[v2Id].variants[variant]={doneTogether:true};}
    }
    return out;
  }
  function mergeCoupleAdditive(base,incoming){ const out=normalizeCoupleState(base); for(const [id,p] of Object.entries(incoming?.practices||{}))for(const [variant,state] of Object.entries(p?.variants||{}))if(state?.doneTogether===true){out.practices[id]=out.practices[id]||{variants:{}};out.practices[id].variants[variant]={doneTogether:true};}return out; }
  function getVariantCommonState(v2Id,variant){ return normalizeVariantCommon(coupleStateStore()?.practices?.[v2Id]?.variants?.[variant]); }
  function setVariantCommonState(v2Id,variant,state){ const entity=entityByV2.get(v2Id); if(!entity||!INTERACTION.variantsForEntity(entity).includes(variant))return false;const store=coupleStateStore();const normalized=normalizeVariantCommon(state);const p=store.practices[v2Id]||{variants:{}};if(commonHasData(normalized))p.variants[variant]=normalized;else delete p.variants[variant];if(Object.keys(p.variants).length)store.practices[v2Id]=p;else delete store.practices[v2Id];invalidateReaderPractice(v2Id);persistCoupleState();touchCommon();return true; }

  function emptySafety(){ return {schemaVersion:1,values:{},legacySources:{},conflicts:[]}; }
  function emptySessions(){ return {schemaVersion:2,entries:[]}; }
  function emptyDisplay(){ return {schemaVersion:2,common:{}}; }
  function emptyRandom(){ return {schemaVersion:2,preferences:null,history:[]}; }
  function emptyMeta(){ return {schemaVersion:2,initialized:false,lastModifiedAt:'',modifiedAt:{personA:'',personB:'',common:''},lastExchange:null,migration:null}; }
  function emptyLegacyArchive(){ return {schemaVersion:1,entries:[]}; }
  function normalizeLegacyArchive(raw){ return {schemaVersion:1,entries:Array.isArray(raw?.entries)?clone(raw.entries):[]}; }
  function mergeLegacyArchive(base,incoming){const out=normalizeLegacyArchive(base);for(const entry of normalizeLegacyArchive(incoming).entries)out.entries.push(clone(entry));return out;}
  function archiveScenarioData(data,source,personOnly=null){const responses=normalizeLegacyResponses(data?.responses||emptyLegacyResponses());if(personOnly){for(const p of Object.values(responses.practices||{}))for(const state of Object.values(p.scenarios||{}))for(const person of ['personA','personB'])if(person!==personOnly)state.participants[person]={};}return {schemaVersion:1,entries:[{source:source||'legacy scenario data',at:nowIso(),personOnly:personOnly||null,responses,sessions:clone(data?.sessions||null),random:clone(data?.random||null),display:clone(data?.display||null),meta:clone(data?.meta||null)}]};}

  function sessionKey(entry){ return `${entry?.practiceId||''}|${entry?.variant||''}`; }
  function normalizeVariantEntries(rawEntries){ const seen=new Set(), out=[]; for(const e of Array.isArray(rawEntries)?rawEntries:[]){const entity=entityByV2.get(e?.practiceId);if(!entity||!INTERACTION.variantsForEntity(entity).includes(e?.variant))continue;const k=sessionKey(e);if(seen.has(k))continue;seen.add(k);out.push({practiceId:e.practiceId,variant:e.variant});}return out; }
  function sessionsStore(){
    if(!sessionsCache){const r=readJson(KEYS.sessions,emptySessions());sessionsCache={schemaVersion:2,entries:normalizeVariantEntries(r?.entries)};}
    return sessionsCache;
  }
  function loadSessions(){ return clone(sessionsStore()); }
  function saveSessions(v){ sessionsCache={schemaVersion:2,entries:normalizeVariantEntries(v?.entries)};writeJson(KEYS.sessions,sessionsCache); }
  function randomStore(){
    if(!randomCache){const r=readJson(KEYS.random,emptyRandom());randomCache={schemaVersion:2,preferences:r?.preferences&&typeof r.preferences==='object'?clone(r.preferences):null,history:normalizeVariantEntries(r?.history)};}
    return randomCache;
  }
  function loadRandom(){ return clone(randomStore()); }
  function saveRandom(v){ randomCache={schemaVersion:2,preferences:v?.preferences&&typeof v.preferences==='object'?clone(v.preferences):null,history:normalizeVariantEntries(v?.history)};writeJson(KEYS.random,randomCache); }
  function displayStore(){
    if(!displayCache){const r=readJson(KEYS.display,emptyDisplay());displayCache={schemaVersion:2,common:r?.common&&typeof r.common==='object'?clone(r.common):{}};}
    return displayCache;
  }
  function loadDisplay(){ return clone(displayStore()); }
  function saveDisplay(v){ displayCache={schemaVersion:2,common:v?.common&&typeof v.common==='object'?clone(v.common):{}};writeJson(KEYS.display,displayCache); }
  function metaStore(){
    if(!metaCache){metaCache=readJson(KEYS.meta,emptyMeta());metaCache.modifiedAt=metaCache.modifiedAt||{personA:'',personB:'',common:''};}
    return metaCache;
  }
  function getMeta(){ return clone(metaStore()); }
  function setMeta(m){ metaCache=clone(m);writeJson(KEYS.meta,metaCache); }
  function touchPerson(person){const m=getMeta(),now=nowIso();m.modifiedAt[person]=now;m.lastModifiedAt=now;m.initialized=true;setMeta(m);}
  function touchCommon(){const m=getMeta(),now=nowIso();m.modifiedAt.common=now;m.lastModifiedAt=now;m.initialized=true;setMeta(m);}

  function getPersonalSlotState(v2Id,person,slot){if(!isPerson(person))return{};const entity=entityByV2.get(v2Id);if(!entity||!INTERACTION.slotsForEntity(entity).includes(slot))return{};const state=normalizeParticipant(personalResponsesStore()?.practices?.[v2Id]?.persons?.[person]?.[slot]);delete state.note;return state;}
  function setPersonalSlotState(v2Id,person,slot,state){if(!isPerson(person))return false;const entity=entityByV2.get(v2Id);if(!entity||!INTERACTION.slotsForEntity(entity).includes(slot))return false;const store=personalResponsesStore(),p=store.practices[v2Id]||{persons:{personA:{},personB:{}},notes:{}},normalized=normalizeParticipant(state);delete normalized.note;p.notes=p.notes||{};if(Object.keys(normalized).length)p.persons[person][slot]=normalized;else delete p.persons[person][slot];if(Object.keys(p.persons.personA).length||Object.keys(p.persons.personB).length||Object.keys(p.notes).length)store.practices[v2Id]=p;else delete store.practices[v2Id];invalidatePersonalDerived(v2Id);persistPersonalResponses();touchPerson(person);return true;}
  function getPersonalPracticeNote(v2Id,person){if(!isPerson(person)||!entityByV2.has(v2Id))return"";return nonEmptyString(personalResponsesStore()?.practices?.[v2Id]?.notes?.[person]);}
  function setPersonalPracticeNote(v2Id,person,value){if(!isPerson(person)||!entityByV2.has(v2Id))return false;const store=personalResponsesStore(),p=store.practices[v2Id]||{persons:{personA:{},personB:{}},notes:{}};p.notes=p.notes||{};const note=nonEmptyString(value);if(note)p.notes[person]=note;else delete p.notes[person];if(Object.keys(p.persons?.personA||{}).length||Object.keys(p.persons?.personB||{}).length||Object.keys(p.notes).length)store.practices[v2Id]=p;else delete store.practices[v2Id];invalidatePersonalDerived(v2Id);persistPersonalResponses();touchPerson(person);return true;}
  function copyPersonalSlots(entity, raw){const out={};for(const slot of INTERACTION.slotsForEntity(entity)){const state=normalizeParticipant(raw?.[slot]);delete state.note;if(Object.keys(state).length)out[slot]=state;}return out;}
  function getPersonalPractice(v2Id){if(personalPracticeCache.has(v2Id))return personalPracticeCache.get(v2Id);const entity=entityByV2.get(v2Id);if(!entity)return null;const p=personalResponsesStore().practices?.[v2Id],result={persons:{personA:Object.freeze(copyPersonalSlots(entity,p?.persons?.personA)),personB:Object.freeze(copyPersonalSlots(entity,p?.persons?.personB))},notes:Object.freeze({personA:nonEmptyString(p?.notes?.personA),personB:nonEmptyString(p?.notes?.personB)})};Object.freeze(result.persons);Object.freeze(result);personalPracticeCache.set(v2Id,result);return result;}
  function getReaderPractice(v2Id){
    if(readerPracticeCache.has(v2Id)) return readerPracticeCache.get(v2Id);
    const entity=entityByV2.get(v2Id);if(!entity)return null;
    const p=personalResponsesStore().practices?.[v2Id],couple=coupleStateStore(),variants={};
    for(const v of INTERACTION.variantsForEntity(entity))variants[v]=Object.freeze(normalizeVariantCommon(couple.practices?.[v2Id]?.variants?.[v]));
    const result={persons:{personA:Object.freeze(copyPersonalSlots(entity,p?.persons?.personA)),personB:Object.freeze(copyPersonalSlots(entity,p?.persons?.personB))},common:{variants:Object.freeze(variants)}};
    Object.freeze(result.persons);Object.freeze(result.common);Object.freeze(result);readerPracticeCache.set(v2Id,result);return result;
  }
  function getPersonalSummary(person){
    if(!isPerson(person))return{person,totalSlots:0,touchedSlots:0,ratedSlots:0,practicesTouched:0};
    if(personalSummaryCache.has(person)) return personalSummaryCache.get(person);
    const store=personalResponsesStore();let totalSlots=0,touchedSlots=0,ratedSlots=0,practicesTouched=0;
    for(const entity of CATALOG.entities||[]){let touched=!!nonEmptyString(store.practices?.[entity.id]?.notes?.[person]);for(const slot of INTERACTION.slotsForEntity(entity)){totalSlots++;const s=normalizeParticipant(store.practices?.[entity.id]?.persons?.[person]?.[slot]);delete s.note;if(Object.keys(s).length){touchedSlots++;touched=true;}if(Number.isInteger(s.after)||Number.isInteger(s.preference))ratedSlots++;}if(touched)practicesTouched++;}
    const result=Object.freeze({person,totalSlots,touchedSlots,ratedSlots,practicesTouched});personalSummaryCache.set(person,result);return result;
  }

  // Compatibility adapter for the pre-1.1.62 runtime. It synthesizes the former scenario rows from personal slots + couple variants.
  function getScenarioItems(scenario){const personal=loadPersonalResponses(),couple=loadCoupleState(),out=[];for(const entity of CATALOG.entities||[]){const key=scenario==='b-dom'?'bDom':'aDom',block=entity?.scenarios?.[key];if(!block)continue;const row={id:Number(block.legacyId)};for(const person of PERSON_KEYS){const slot=INTERACTION.slotForLegacyPerson(entity,scenario,person);if(!slot)continue;const src=normalizeParticipant(personal.practices?.[entity.id]?.persons?.[person]?.[slot]);const fields=legacyFieldsForRole(roleForPerson(scenario,person));const pref=validScore(src.preference);if(pref!==null)row[fields.want]=pref;if(src.prior===true)row[fields.prior]=true;const after=validScore(src.after);if(after!==null)row[fields.after]=after;const note=nonEmptyString(personal.practices?.[entity.id]?.notes?.[person]);if(note)row[runtimeNoteFieldForPerson(person)]=note;}const variant=INTERACTION.variantForLegacyScenario(entity,scenario);if(variant&&couple.practices?.[entity.id]?.variants?.[variant]?.doneTogether===true)row.doneTogether=true;if(Object.keys(row).length>1)out.push(row);}return out;}
  function saveScenarioItems(scenario,rawItems){for(const raw of Array.isArray(rawItems)?rawItems:[]){const v2Id=v2ByScenarioLegacy.get(`${scenario}:${Number(raw?.id)}`),entity=entityByV2.get(v2Id);if(!entity)continue;for(const person of PERSON_KEYS){const slot=INTERACTION.slotForLegacyPerson(entity,scenario,person);if(!slot)continue;const role=roleForPerson(scenario,person),fields=legacyFieldsForRole(role),state={};const pref=validScore(raw?.[fields.want]);if(pref!==null)state.preference=pref;if(raw?.[fields.prior]===true)state.prior=true;const after=validScore(raw?.[fields.after]);if(after!==null)state.after=after;setPersonalSlotState(v2Id,person,slot,state);const note=nonEmptyString(raw?.[runtimeNoteFieldForPerson(person)]);if(note)setPersonalPracticeNote(v2Id,person,note);}const variant=INTERACTION.variantForLegacyScenario(entity,scenario);if(variant)setVariantCommonState(v2Id,variant,{doneTogether:raw?.doneTogether===true});}}

  function scenarioVariantKeySet(scenario){const out=new Set();for(const entity of CATALOG.entities||[]){const key=scenario==='b-dom'?'bDom':'aDom';if(!entity?.scenarios?.[key])continue;const variant=INTERACTION.variantForLegacyScenario(entity,scenario);if(variant)out.add(`${entity.id}|${variant}`);}return out;}
  function getScenarioSessionLegacyIds(scenario){const sessions=loadSessions(),ids=[];for(const entity of CATALOG.entities||[]){const key=scenario==='b-dom'?'bDom':'aDom',block=entity?.scenarios?.[key];if(!block)continue;const variant=INTERACTION.variantForLegacyScenario(entity,scenario);if(variant&&sessions.entries.some(e=>e.practiceId===entity.id&&e.variant===variant))ids.push(Number(block.legacyId));}return[...new Set(ids)];}
  function setScenarioSessionLegacyIds(scenario,ids){const s=loadSessions(),scope=scenarioVariantKeySet(scenario),keep=s.entries.filter(e=>!scope.has(sessionKey(e))),add=[];for(const id of [...new Set((Array.isArray(ids)?ids:[]).map(Number))]){const v2Id=v2ByScenarioLegacy.get(`${scenario}:${id}`),entity=entityByV2.get(v2Id);if(!entity)continue;const variant=INTERACTION.variantForLegacyScenario(entity,scenario);if(variant)add.push({practiceId:v2Id,variant});}s.entries=[...keep,...add];saveSessions(s);touchCommon();}
  function getAllSessionEntries(){return clone(sessionsStore().entries);}
  function setSessionEntries(entries){const next={schemaVersion:2,entries:normalizeVariantEntries(entries)};saveSessions(next);touchCommon();return clone(sessionsStore().entries);}

  function getRandomHistoryLegacyIds(scenario){const random=loadRandom(),ids=[];for(const entity of CATALOG.entities||[]){const key=scenario==='b-dom'?'bDom':'aDom',block=entity?.scenarios?.[key];if(!block)continue;const variant=INTERACTION.variantForLegacyScenario(entity,scenario);if(variant&&random.history.some(e=>e.practiceId===entity.id&&e.variant===variant))ids.push(Number(block.legacyId));}return[...new Set(ids)];}
  function setRandomHistoryLegacyIds(scenario,ids){const r=loadRandom(),scope=scenarioVariantKeySet(scenario),keep=r.history.filter(e=>!scope.has(sessionKey(e))),add=[];for(const id of [...new Set((Array.isArray(ids)?ids:[]).map(Number))]){const v2Id=v2ByScenarioLegacy.get(`${scenario}:${id}`),entity=entityByV2.get(v2Id);if(!entity)continue;const variant=INTERACTION.variantForLegacyScenario(entity,scenario);if(variant)add.push({practiceId:v2Id,variant});}r.history=[...keep,...add];saveRandom(r);}
  function getRandomHistoryEntries(){return clone(randomStore().history);}
  function setRandomHistoryEntries(entries){const r=loadRandom();r.history=normalizeVariantEntries(entries);saveRandom(r);return clone(randomStore().history);}
  function getRandomPreferences(){return clone(randomStore().preferences);}
  function setRandomPreferences(value){const r=loadRandom();r.preferences=value&&typeof value==='object'?clone(value):null;saveRandom(r);}

  function getDisplay(name,fallback){const d=displayStore();return Object.prototype.hasOwnProperty.call(d.common,name)?clone(d.common[name]):clone(fallback);}
  function setDisplay(name,value){const d=displayStore();if(value===undefined)delete d.common[name];else d.common[name]=clone(value);saveDisplay(d);}

  function getLastModified(){return getMeta().lastModifiedAt||'';}
  function getLastExchange(){return getMeta().lastExchange||null;}
  function setLastExchange(info){const m=getMeta();m.lastExchange=clone(info);m.initialized=true;setMeta(m);}

  function mergeSafetyText(a,b){a=nonEmptyString(a).trim();b=nonEmptyString(b).trim();if(!b)return a;if(!a||a===b)return b;const parts=a.split(/\n+/).map(x=>x.trim()).filter(Boolean),seen=new Set(parts.map(x=>x.toLocaleLowerCase()));for(const p of b.split(/\n+/).map(x=>x.trim()).filter(Boolean)){const k=p.toLocaleLowerCase();if(!seen.has(k)){seen.add(k);parts.push(p);}}return parts.join('\n');}
  function restrictiveChoice(a,b,ranking){a=nonEmptyString(a).trim();b=nonEmptyString(b).trim();if(!b)return a;if(!a||a===b)return b;const ra=ranking[a]||0,rb=ranking[b]||0;if(!ra&&!rb)return a;if(!ra)return b;if(!rb)return a;return rb>ra?b:a;}
  function mergeSafetyPrudent(local,incoming){local=local&&typeof local==='object'?local:{};incoming=incoming&&typeof incoming==='object'?incoming:{};const merged={...local},conflicts=[];for(const key of ['slowWord','safeWord','slowSignal','stopSignal']){const a=nonEmptyString(local[key]).trim(),b=nonEmptyString(incoming[key]).trim();if(!b)merged[key]=a;else if(!a||a===b)merged[key]=b;else{merged[key]=a;conflicts.push({key,local:a,incoming:b});}}merged.hardLimits=mergeSafetyText(local.hardLimits,incoming.hardLimits);merged.aftercare=mergeSafetyText(local.aftercare,incoming.aftercare);merged.marks=restrictiveChoice(local.marks,incoming.marks,{'Oui':1,'Oui, légères':2,'Non':3,'Yes':1,'Yes, light':2,'No':3});merged.media=restrictiveChoice(local.media,incoming.media,{'Selon accord explicite au cas par cas':1,'Privées uniquement':2,'Aucune':3,'Only with explicit case-by-case agreement':1,'Private only':2,'None':3});for(const key of ['noIntoxication','nextDayDebrief','stopImmediate'])merged[key]=local[key]===true||incoming[key]===true;return{merged,conflicts};}
  function safetyStore(){if(!safetyCache)safetyCache=readJson(KEYS.safety,emptySafety());return safetyCache;}
  function getSafety(){return clone(safetyStore().values||{});}
  function setSafety(values){const s=safetyStore();s.values=values&&typeof values==='object'?clone(values):{};writeJson(KEYS.safety,s);touchCommon();}

  function legacyKeys(def){return{items:`${def.namespace}_v1`,safety:`${def.namespace}_safety_v1`,columns:`${def.namespace}_columns_v5`,role:`${def.namespace}_role_v1`,otherRoleColumns:`${def.namespace}_otherRoleColumns_v1`,readOnly:`${def.namespace}_readOnly_v1`,lastModified:`${def.namespace}_lastModified_v1`,lastExchange:`${def.namespace}_lastExchange_v1`,session:`${def.namespace}_session_v1`,modifiedScopes:`${def.namespace}_modifiedScopes_v1`,experienceMode:`${def.prefix}Checklist_experienceMode_v1`,collapsedCategories:`${def.prefix}Checklist_collapsedCategories_v1`,randomPrefs:`${def.prefix}Checklist_randomPrefs_v1`,randomHistory:`${def.prefix}Checklist_randomHistory_v1`};}
  function snapshotLegacyLocalVariant(def){const k=legacyKeys(def);return{items:readJson(k.items,[]),safety:readJson(k.safety,{}),sessionOrder:readJson(k.session,[]),columnPreferences:readJson(k.columns,null),experienceMode:localStorage.getItem(k.experienceMode)||null,collapsedCategories:readJson(k.collapsedCategories,[]),randomPreferences:readJson(k.randomPrefs,null),randomDrawHistory:readJson(k.randomHistory,[]),modifiedAtByScope:readJson(k.modifiedScopes,{}),lastModifiedAt:localStorage.getItem(k.lastModified)||'',activeRole:localStorage.getItem(k.role)||null,showOtherRoleColumns:localStorage.getItem(k.otherRoleColumns),readOnly:localStorage.getItem(k.readOnly),lastExchange:readJson(k.lastExchange,null)};}
  function hasLegacyV1155LocalData(){for(const def of Object.values(LEGACY_VARIANT_FORMATS))for(const key of Object.values(legacyKeys(def)))if(localStorage.getItem(key)!==null)return true;return false;}

  function legacyItemToScenarioState(raw,scenario,personOnly=null){const state={participants:{personA:{},personB:{}},common:{}};for(const person of PERSON_KEYS){if(personOnly&&person!==personOnly)continue;const fields=legacyFieldsForRole(roleForPerson(scenario,person)),dst=state.participants[person],want=validScore(raw?.[fields.want]);if(want!==null)dst.preference=want;if(raw?.[fields.prior]===true)dst.prior=true;const after=validScore(raw?.[fields.after]);if(after!==null)dst.after=after;const note=nonEmptyString(raw?.[legacyNoteFieldForPerson(person)]);if(note)dst.note=note;}if(raw?.doneTogether===true)state.common.doneTogether=true;return state;}
  function addLegacyVariantToResponses(responses,scenario,rawItems,personOnly=null){for(const raw of Array.isArray(rawItems)?rawItems:[]){const v2Id=v2ByScenarioLegacy.get(`${scenario}:${Number(raw?.id)}`);if(!v2Id)continue;const incoming=legacyItemToScenarioState(raw,scenario,personOnly),p=responses.practices[v2Id]||{scenarios:{}},existing=normalizeLegacyScenarioState(p.scenarios?.[scenario]);if(personOnly){existing.participants[personOnly]=incoming.participants[personOnly];if(incoming.common.doneTogether===true)existing.common.doneTogether=true;p.scenarios[scenario]=existing;}else p.scenarios[scenario]=incoming;if(legacyScenarioHasState(p.scenarios[scenario]))responses.practices[v2Id]=p;}}
  function mapLegacyScopes(scenario,scopes,fallback=''){const out={};for(const role of ['sub','dom'])out[personForRole(scenario,role)]=typeof scopes?.[role]==='string'&&scopes[role]?scopes[role]:fallback;out.common=typeof scopes?.common==='string'&&scopes.common?scopes.common:fallback;return out;}

  function projectLegacyEntries(entries){const out=[];for(const entry of Array.isArray(entries)?entries:[]){const scenario=entry?.scenario,v2Id=entry?.practiceId,entity=entityByV2.get(v2Id);if(!entity||!['a-dom','b-dom'].includes(scenario))continue;const variant=INTERACTION.variantForLegacyScenario(entity,scenario);if(variant)out.push({practiceId:v2Id,variant});}return normalizeVariantEntries(out);}
  function projectLegacyScenarioIds(scenario,ids){const out=[];for(const id of Array.isArray(ids)?ids:[]){const v2Id=v2ByScenarioLegacy.get(`${scenario}:${Number(id)}`),entity=entityByV2.get(v2Id);if(!entity)continue;const variant=INTERACTION.variantForLegacyScenario(entity,scenario);if(variant)out.push({practiceId:v2Id,variant});}return normalizeVariantEntries(out);}
  function flattenLegacyDisplay(raw){const out=emptyDisplay(),common=raw?.common&&typeof raw.common==='object'?clone(raw.common):{};for(const s of ['a-dom','b-dom']){const b=raw?.scenarios?.[s];if(!b||typeof b!=='object')continue;for(const [k,v] of Object.entries(b))if(!Object.prototype.hasOwnProperty.call(common,k)&&v!==undefined&&v!==null)common[k]=clone(v);}out.common=common;return out;}
  function projectLegacyRandom(raw){const out=emptyRandom();const prefA=raw?.preferencesByScenario?.['a-dom'],prefB=raw?.preferencesByScenario?.['b-dom'];out.preferences=clone(prefA||prefB||raw?.preferences||null);out.history=projectLegacyEntries(raw?.history);return out;}

  function currentProfile(){return window.CHECKLIST_PROFILE_API?.get?.()||null;}
  function installActiveData(data,source){
    resetRuntimeCaches();
    savePersonalResponses(data.personalResponses||emptyPersonalResponses());saveCoupleState(data.coupleState||emptyCoupleState());writeJson(KEYS.safety,data.safety||emptySafety());saveSessions(data.sessions||emptySessions());saveDisplay(data.display||emptyDisplay());saveRandom(data.random||emptyRandom());writeJson(KEYS.legacyArchive,normalizeLegacyArchive(data.legacyArchive||emptyLegacyArchive()));
    const meta=data.meta&&typeof data.meta==='object'?clone(data.meta):emptyMeta();meta.schemaVersion=2;meta.initialized=true;meta.migration={...(meta.migration||{}),source:source||meta.migration?.source||'unknown',at:nowIso(),storageModel:'personal-slots+couple-variants'};writeJson(KEYS.meta,meta);
  }
  function convertScenarioDataToActive(data,source){const legacyResponses=normalizeLegacyResponses(data?.responses||emptyLegacyResponses());const existingPersonal=data?.personalResponses?normalizePersonalResponses(data.personalResponses):emptyPersonalResponses();const projected=projectLegacyResponsesToPersonal(legacyResponses);const personalResponses=mergeMissingPersonal(existingPersonal,projected);const coupleState=projectLegacyResponsesToCouple(legacyResponses);const sessions={schemaVersion:2,entries:projectLegacyEntries(data?.sessions?.entries)};const random=projectLegacyRandom(data?.random||{});const display=flattenLegacyDisplay(data?.display||{});const meta=clone(data?.meta||emptyMeta());const legacyArchive=archiveScenarioData(data,source);return{personalResponses,coupleState,safety:data?.safety||emptySafety(),sessions,display,random,meta,legacyArchive,source};}

  function mergeLegacyFullSnapshots(variants,sourceLabel){
    const responses=emptyLegacyResponses();let safety=emptySafety(),latest=0;const sourceMap={},sessionEntries=[],randomHistory=[];const displayLegacy={schemaVersion:1,common:{},scenarios:{'a-dom':{},'b-dom':{}}},randomLegacy={schemaVersion:1,preferencesByScenario:{'a-dom':null,'b-dom':null},history:[]},meta=emptyMeta();
    for(const [variantId,def] of Object.entries(LEGACY_VARIANT_FORMATS)){
      const snap=variants?.[variantId]||{};sourceMap[def.scenario]=clone(snap.safety||{});addLegacyVariantToResponses(responses,def.scenario,snap.items);
      sessionEntries.push(...projectLegacyScenarioIds(def.scenario,snap.sessionOrder||[]));randomHistory.push(...projectLegacyScenarioIds(def.scenario,snap.randomDrawHistory||[]));
      displayLegacy.scenarios[def.scenario]={columnPreferences:clone(snap.columnPreferences),collapsedCategories:clone(snap.collapsedCategories||[])};if(['beginner','confirmed','advanced'].includes(snap.experienceMode))displayLegacy.common.experienceMode=snap.experienceMode;if(snap.showOtherRoleColumns!=null)displayLegacy.common.showOtherRoleColumns=String(snap.showOtherRoleColumns)!=='false';if(snap.readOnly!=null)displayLegacy.common.readOnly=String(snap.readOnly)==='true';if(snap.activeRole==='sub'||snap.activeRole==='dom')displayLegacy.common.activePerson=personForRole(def.scenario,snap.activeRole);
      if(snap.randomPreferences&&typeof snap.randomPreferences==='object')randomLegacy.preferencesByScenario[def.scenario]=clone(snap.randomPreferences);
      const mapped=mapLegacyScopes(def.scenario,snap.modifiedAtByScope||{},snap.lastModifiedAt||'');for(const p of ['personA','personB','common']){const t=new Date(mapped[p]||'').getTime(),old=new Date(meta.modifiedAt[p]||'').getTime();if(Number.isFinite(t)&&(!Number.isFinite(old)||t>old))meta.modifiedAt[p]=mapped[p];}const lm=new Date(snap.lastModifiedAt||'').getTime();if(Number.isFinite(lm)&&lm>latest)latest=lm;if(!meta.lastExchange&&snap.lastExchange)meta.lastExchange=clone(snap.lastExchange);
    }
    const sm=mergeSafetyPrudent(sourceMap['a-dom']||{},sourceMap['b-dom']||{});safety.values=sm.merged;safety.legacySources=sourceMap;safety.conflicts=sm.conflicts;meta.lastModifiedAt=latest?new Date(latest).toISOString():'';meta.initialized=true;
    const converted=convertScenarioDataToActive({responses,safety,sessions:{entries:[]},display:displayLegacy,random:randomLegacy,meta},sourceLabel);converted.sessions={schemaVersion:2,entries:normalizeVariantEntries(sessionEntries)};converted.random.history=normalizeVariantEntries(randomHistory);if(converted.legacyArchive?.entries?.[0]){converted.legacyArchive.entries[0].sessions={schemaVersion:1,entries:Object.entries(LEGACY_VARIANT_FORMATS).flatMap(([variantId,def])=>(variants?.[variantId]?.sessionOrder||[]).map(id=>({scenario:def.scenario,legacyId:Number(id)})))};converted.legacyArchive.entries[0].random={schemaVersion:1,history:Object.entries(LEGACY_VARIANT_FORMATS).flatMap(([variantId,def])=>(variants?.[variantId]?.randomDrawHistory||[]).map(id=>({scenario:def.scenario,legacyId:Number(id)})))};}converted.meta.migration={source:sourceLabel,at:nowIso(),safetyConflicts:sm.conflicts.length,storageModel:'personal-slots+couple-variants'};return converted;
  }

  function activeStorageExists(){return localStorage.getItem(KEYS.meta)!==null||localStorage.getItem(KEYS.personalResponses)!==null||localStorage.getItem(KEYS.coupleState)!==null;}
  function oldV3StorageExists(){return Object.values(LEGACY_ACTIVE_KEYS).some(k=>localStorage.getItem(k)!==null);}
  function autoMigrate(){
    if(activeStorageExists())return{migrated:false};
    if(oldV3StorageExists()){
      const data=convertScenarioDataToActive({responses:readJson(LEGACY_ACTIVE_KEYS.responses,emptyLegacyResponses()),personalResponses:readJson(LEGACY_ACTIVE_KEYS.personalResponses,null),safety:readJson(KEYS.safety,emptySafety()),sessions:readJson(LEGACY_ACTIVE_KEYS.sessions,{entries:[]}),display:readJson(LEGACY_ACTIVE_KEYS.display,{}),random:readJson(LEGACY_ACTIVE_KEYS.random,{}),meta:readJson(LEGACY_ACTIVE_KEYS.meta,emptyMeta())},'V1.1.58–V1.1.62 localStorage');installActiveData(data,data.source);return{migrated:true,source:'schema3-local'};
    }
    if(hasLegacyV1155LocalData()){
      const variants={};for(const [id,def] of Object.entries(LEGACY_VARIANT_FORMATS))variants[id]=snapshotLegacyLocalVariant(def);const data=mergeLegacyFullSnapshots(variants,'V1.1.55 localStorage');installActiveData(data,data.source);return{migrated:true,source:'v1.1.55-local'};
    }
    const meta=emptyMeta();meta.initialized=true;meta.lastModifiedAt=nowIso();meta.modifiedAt={personA:meta.lastModifiedAt,personB:meta.lastModifiedAt,common:meta.lastModifiedAt};installActiveData({meta,safety:readJson(KEYS.safety,emptySafety())},'fresh V1.1.62');return{migrated:false,source:'fresh'};
  }

  function normalizeCurrentFullData(data){return{personalResponses:normalizePersonalResponses(data?.personalResponses),coupleState:normalizeCoupleState(data?.coupleState),safety:data?.safety||emptySafety(),sessions:{schemaVersion:2,entries:normalizeVariantEntries(data?.sessions?.entries)},display:loadableDisplay(data?.display),random:loadableRandom(data?.random),meta:data?.meta||emptyMeta(),legacyArchive:normalizeLegacyArchive(data?.legacyArchive)};}
  function loadableDisplay(raw){return{schemaVersion:2,common:raw?.common&&typeof raw.common==='object'?clone(raw.common):{}};}
  function loadableRandom(raw){return{schemaVersion:2,preferences:raw?.preferences&&typeof raw.preferences==='object'?clone(raw.preferences):null,history:normalizeVariantEntries(raw?.history)};}

  function validateCurrentBackup(payload){
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.schemaVersion!==SCHEMA_VERSION||payload.siteBackupId!==SITE_BACKUP_ID)return null;
    if(!BACKUP_TYPES.includes(payload.backupType)||!payload.data||typeof payload.data!=='object')throw new Error('Invalid current backup.');
    if(PERSONAL_BACKUP_TYPES.includes(payload.backupType)&&(!payload.coupleConfiguration||typeof payload.coupleConfiguration!=='object'))throw new Error('Invalid personal backup: couple configuration missing.');
    if(payload.coupleConfiguration&&window.CHECKLIST_PROFILE_API?.configurationFingerprint){
      const actual=window.CHECKLIST_PROFILE_API.configurationFingerprint(payload.coupleConfiguration);
      if(payload.coupleConfigFingerprint&&payload.coupleConfigFingerprint!==actual)throw new Error('Invalid backup: couple configuration fingerprint mismatch.');
    }
    return{format:'v5',type:payload.backupType,hasCoupleConfiguration:!!payload.coupleConfiguration};
  }
  function validateV4Backup(payload){if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.schemaVersion!==4||payload.siteBackupId!==SITE_BACKUP_ID)return null;if(!['full','person-a','person-b'].includes(payload.backupType)||!payload.data||typeof payload.data!=='object')throw new Error('Invalid V1.1.62 backup.');return{format:'v4',type:payload.backupType,hasCoupleConfiguration:false};}
  function validateV3Backup(payload){if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.schemaVersion!==3||payload.siteBackupId!==SITE_BACKUP_ID)return null;if(!['full','person-a','person-b'].includes(payload.backupType)||!payload.data||typeof payload.data!=='object')throw new Error('Invalid V1.1.58–V1.1.61 backup.');return{format:'v3',type:payload.backupType,hasCoupleConfiguration:false};}
  function validateLegacyBackup(payload){if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.version!==LEGACY_BACKUP_VERSION||payload.siteBackupId!==LEGACY_SITE_BACKUP_ID)return null;const type=['full','male','female'].includes(payload.backupType)?payload.backupType:null;if(!type||!payload.variants||typeof payload.variants!=='object')throw new Error('Invalid V1.1.55 backup.');for(const id of Object.keys(LEGACY_VARIANT_FORMATS)){const block=payload.variants[id];if(!block||typeof block!=='object'||!Array.isArray(block.items))throw new Error('Invalid V1.1.55 backup.');}return{format:'legacy-v2',type,hasCoupleConfiguration:false};}
  function inspectBackup(payload){return validateCurrentBackup(payload)||validateV4Backup(payload)||validateV3Backup(payload)||validateLegacyBackup(payload)||(()=>{throw new Error('Sauvegarde incompatible / incompatible backup.');})();}

  function buildPersonalModelForPerson(person){const src=loadPersonalResponses(),out=emptyPersonalResponses();for(const [id,p] of Object.entries(src.practices||{})){const kept={};for(const [slot,state] of Object.entries(p?.persons?.[person]||{})){const normalized=normalizeParticipant(state);delete normalized.note;if(Object.keys(normalized).length)kept[slot]=normalized;}const note=nonEmptyString(p?.notes?.[person]);if(Object.keys(kept).length||note){out.practices[id]={persons:{personA:{},personB:{}},notes:{}};out.practices[id].persons[person]=kept;if(note)out.practices[id].notes[person]=note;}}return out;}
  function buildLegacyArchiveForPerson(person){const src=normalizeLegacyArchive(readJson(KEYS.legacyArchive,emptyLegacyArchive())),out=emptyLegacyArchive();for(const entry of src.entries){const next={source:entry.source,at:entry.at,personOnly:person,responses:normalizeLegacyResponses(entry.responses||emptyLegacyResponses())};for(const p of Object.values(next.responses.practices||{}))for(const state of Object.values(p.scenarios||{}))for(const other of PERSON_KEYS)if(other!==person)state.participants[other]={};out.entries.push(next);}return out;}
  function buildBackup(type,appVersion){
    const backupType=type==='full'?'full':type==='male'||type==='person-a'?'person-a':'person-b',exportedAt=nowIso(),meta=getMeta(),profile=currentProfile();
    const coupleConfiguration=window.CHECKLIST_PROFILE_API?.coupleConfiguration?.(profile)||null;
    const coupleConfigFingerprint=coupleConfiguration&&window.CHECKLIST_PROFILE_API?.configurationFingerprint?.(coupleConfiguration)||null;
    if(backupType==='full')return{schemaVersion:SCHEMA_VERSION,siteBackupId:SITE_BACKUP_ID,appVersion,catalogVersion:CATALOG.schemaVersion||1,backupType,exportedAt,profile:clone(profile),coupleConfiguration:clone(coupleConfiguration),coupleConfigFingerprint,data:{personalResponses:loadPersonalResponses(),coupleState:loadCoupleState(),safety:readJson(KEYS.safety,emptySafety()),sessions:loadSessions(),display:loadDisplay(),random:loadRandom(),meta:clone(meta),legacyArchive:readJson(KEYS.legacyArchive,emptyLegacyArchive())}};
    const person=backupType==='person-a'?'personA':'personB',identity=profile?.[person]||{};
    return{schemaVersion:SCHEMA_VERSION,siteBackupId:SITE_BACKUP_ID,appVersion,catalogVersion:CATALOG.schemaVersion||1,backupType,exportedAt,participant:{slot:backupType,identityId:identity.identityId||null,name:identity.name||null},coupleConfiguration:clone(coupleConfiguration),coupleConfigFingerprint,data:{personalResponses:buildPersonalModelForPerson(person),coupleState:loadCoupleState(),safety:readJson(KEYS.safety,emptySafety()),modifiedAt:{person:meta.modifiedAt?.[person]||'',common:meta.modifiedAt?.common||''},legacyArchive:buildLegacyArchiveForPerson(person)}};
  }

  function compareBackupCoupleConfiguration(payload){
    const info=inspectBackup(payload);
    if(!['person-a','person-b'].includes(info.type)||!payload.coupleConfiguration||!window.CHECKLIST_PROFILE_API?.compareCoupleConfiguration)return null;
    return window.CHECKLIST_PROFILE_API.compareCoupleConfiguration(payload.coupleConfiguration,currentProfile());
  }

  function mergePersonalActive(data,person,exportedAt){const local=loadPersonalResponses(),incoming=normalizePersonalResponses(data?.personalResponses);for(const p of Object.values(local.practices||{})){if(p?.persons)p.persons[person]={};if(p?.notes)delete p.notes[person];}for(const [id,p] of Object.entries(incoming.practices||{})){const slots=p?.persons?.[person]||{},note=nonEmptyString(p?.notes?.[person]);if(!Object.keys(slots).length&&!note)continue;const dst=local.practices[id]||{persons:{personA:{},personB:{}},notes:{}};dst.notes=dst.notes||{};dst.persons[person]=clone(slots);if(note)dst.notes[person]=note;local.practices[id]=dst;}for(const [id,p] of Object.entries(local.practices||{}))if(!Object.keys(p.persons?.personA||{}).length&&!Object.keys(p.persons?.personB||{}).length&&!Object.keys(p.notes||{}).length)delete local.practices[id];savePersonalResponses(local);saveCoupleState(mergeCoupleAdditive(loadCoupleState(),data?.coupleState));if(data?.legacyArchive)writeJson(KEYS.legacyArchive,mergeLegacyArchive(readJson(KEYS.legacyArchive,emptyLegacyArchive()),data.legacyArchive));const localSafety=clone(safetyStore()),incomingSafety=data?.safety||emptySafety(),merged=mergeSafetyPrudent(localSafety.values||{},incomingSafety.values||{});localSafety.values=merged.merged;localSafety.conflicts=[...(localSafety.conflicts||[]),...merged.conflicts];safetyCache=localSafety;writeJson(KEYS.safety,localSafety);const meta=getMeta();meta.modifiedAt[person]=data?.modifiedAt?.person||exportedAt||nowIso();meta.modifiedAt.common=data?.modifiedAt?.common||meta.modifiedAt.common||nowIso();meta.lastModifiedAt=nowIso();meta.initialized=true;setMeta(meta);return{conflicts:merged.conflicts};}

  function convertV3Payload(payload){if(payload.backupType==='full')return convertScenarioDataToActive(payload.data||{},`V1.1.58–V1.1.61 backup (${payload.appVersion||'schema3'})`);const person=payload.backupType==='person-a'?'personA':'personB',legacyResponses=normalizeLegacyResponses(payload.data?.responses||emptyLegacyResponses()),personal=payload.data?.personalResponses?normalizePersonalResponses(payload.data.personalResponses):projectLegacyResponsesToPersonal(legacyResponses);return{personalResponses:personal,coupleState:projectLegacyResponsesToCouple(legacyResponses),safety:payload.data?.safety||emptySafety(),modifiedAt:payload.data?.modifiedAt||{},legacyArchive:archiveScenarioData(payload.data||{},`V1.1.58–V1.1.61 personal backup (${payload.appVersion||'schema3'})`,person),person};}
  function convertLegacyPersonal(payload,legacyType){const person=legacyTypeToPerson(legacyType),responses=emptyLegacyResponses();let mergedSafety={},conflicts=[];for(const [variantId,def] of Object.entries(LEGACY_VARIANT_FORMATS)){const block=payload.variants?.[variantId]||{};addLegacyVariantToResponses(responses,def.scenario,block.items,person);const m=mergeSafetyPrudent(mergedSafety,block.safety||{});mergedSafety=m.merged;conflicts.push(...m.conflicts.map(x=>({...x,scenario:def.scenario})));}return{person,personalResponses:projectLegacyResponsesToPersonal(responses),coupleState:projectLegacyResponsesToCouple(responses),safety:{schemaVersion:1,values:mergedSafety,legacySources:{},conflicts},modifiedAt:{person:payload.exportedAt||'',common:payload.exportedAt||''},legacyArchive:archiveScenarioData({responses},`V1.1.55 personal backup (${legacyType})`,person)};}

  function importBackup(payload,options={}){
    const info=inspectBackup(payload);
    let result;
    if(info.format==='v5'){
      if(info.type==='full'){
        const data=normalizeCurrentFullData(payload.data);
        installActiveData(data,`Current backup (${payload.appVersion||('schema'+SCHEMA_VERSION)})`);
        if(payload.profile&&window.CHECKLIST_PROFILE_API?.save)window.CHECKLIST_PROFILE_API.save(payload.profile);
        result={type:'full',format:'v5',conflicts:[],configComparison:null};
      }else{
        const comparison=compareBackupCoupleConfiguration(payload);
        if(comparison&&!comparison.same&&options.allowProfileMismatch!==true){
          const error=new Error('La configuration du couple de cette sauvegarde est différente de celle de cet appareil.');
          error.code='COUPLE_CONFIG_MISMATCH';
          error.comparison=comparison;
          throw error;
        }
        const person=info.type==='person-a'?'personA':'personB',r=mergePersonalActive(payload.data,person,payload.exportedAt);
        result={type:info.type,format:'v5',conflicts:r.conflicts,configComparison:comparison};
      }
    }else if(info.format==='v4'){
      if(info.type==='full'){const data=normalizeCurrentFullData(payload.data);installActiveData(data,`V1.1.62 backup (${payload.appVersion||'schema4'})`);if(payload.profile&&window.CHECKLIST_PROFILE_API?.save)window.CHECKLIST_PROFILE_API.save(payload.profile);result={type:'full',format:'v4',conflicts:[]};}
      else{const person=info.type==='person-a'?'personA':'personB',r=mergePersonalActive(payload.data,person,payload.exportedAt);result={type:info.type,format:'v4',conflicts:r.conflicts};}
    }else if(info.format==='v3'){
      const converted=convertV3Payload(payload);
      if(info.type==='full'){installActiveData(converted,converted.source);if(payload.profile&&window.CHECKLIST_PROFILE_API?.save)window.CHECKLIST_PROFILE_API.save(payload.profile);result={type:'full',format:'v3',conflicts:converted.safety?.conflicts||[]};}
      else{const person=info.type==='person-a'?'personA':'personB',r=mergePersonalActive(converted,person,payload.exportedAt);result={type:info.type,format:'v3',conflicts:r.conflicts};}
    }else if(info.type==='full'){
      const data=mergeLegacyFullSnapshots(payload.variants,'V1.1.55 backup');installActiveData(data,data.source);result={type:'full',format:'legacy-v2',conflicts:data.safety?.conflicts||[]};
    }else{
      const converted=convertLegacyPersonal(payload,info.type),r=mergePersonalActive(converted,converted.person,payload.exportedAt);result={type:personToBackupType(converted.person),format:'legacy-v2',conflicts:r.conflicts};
    }
    const exchange={type:'import',backupType:result.type,exportedAt:payload.exportedAt||null,lastModifiedAt:nowIso(),appVersion:payload.appVersion||'V1.1.55',sourceFormat:result.format};setLastExchange(exchange);result.info=exchange;return result;
  }

  function getScenarioSummary(scenario){const personal=loadPersonalResponses(),couple=loadCoupleState(),sessions=loadSessions(),random=loadRandom();let total=0,touched=0,ratedByBoth=0,doneTogether=0,experienced=0,sessionCount=0,randomCount=0;const seenSession=new Set(),seenRandom=new Set();for(const entity of CATALOG.entities||[]){const key=scenario==='b-dom'?'bDom':'aDom';if(!entity?.scenarios?.[key])continue;total++;const variant=INTERACTION.variantForLegacyScenario(entity,scenario),slots=variant?INTERACTION.participantSlotsForVariant(entity,variant):null;if(!variant||!slots)continue;const a=normalizeParticipant(personal.practices?.[entity.id]?.persons?.personA?.[slots.personA]),b=normalizeParticipant(personal.practices?.[entity.id]?.persons?.personB?.[slots.personB]),done=couple.practices?.[entity.id]?.variants?.[variant]?.doneTogether===true;const pt=p=>participantHasData(p),rated=p=>Number.isInteger(p.after)||Number.isInteger(p.preference);if(pt(a)||pt(b)||done)touched++;if(rated(a)&&rated(b))ratedByBoth++;if(done)doneTogether++;if(a.prior===true||b.prior===true||Number.isInteger(a.after)||Number.isInteger(b.after)||done)experienced++;const k=`${entity.id}|${variant}`;if(sessions.entries.some(e=>sessionKey(e)===k)&&!seenSession.has(k)){seenSession.add(k);sessionCount++;}if(random.history.some(e=>sessionKey(e)===k)&&!seenRandom.has(k)){seenRandom.add(k);randomCount++;}}
    return{scenario,total,touched,ratedByBoth,doneTogether,experienced,sessionCount,randomCount};}

  function resetAllUserData(){resetRuntimeCaches();for(const key of Object.values(KEYS))localStorage.removeItem(key);for(const key of Object.values(LEGACY_ACTIVE_KEYS))localStorage.removeItem(key);for(const def of Object.values(LEGACY_VARIANT_FORMATS))for(const key of Object.values(legacyKeys(def)))localStorage.removeItem(key);const meta=emptyMeta();meta.initialized=true;meta.lastModifiedAt=nowIso();meta.modifiedAt={personA:meta.lastModifiedAt,personB:meta.lastModifiedAt,common:meta.lastModifiedAt};installActiveData({meta},'reset');}

  const migration=autoMigrate();

  window.CHECKLIST_V2_STORAGE=Object.freeze({
    schemaVersion:SCHEMA_VERSION,siteBackupId:SITE_BACKUP_ID,keys:KEYS,migration,
    getSafety,setSafety,
    getAllSessionEntries,setSessionEntries,
    getRandomHistoryEntries,setRandomHistoryEntries,getRandomPreferences,setRandomPreferences,
    getDisplay,setDisplay,getLastModified,getLastExchange,setLastExchange,
    getPersonalSlotState,setPersonalSlotState,getPersonalPractice,getPersonalPracticeNote,setPersonalPracticeNote,getVariantCommonState,setVariantCommonState,getReaderPractice,getPersonalSummary,
    buildBackup,inspectBackup,compareBackupCoupleConfiguration,importBackup,resetAllUserData,
    _legacy:{getScenarioItems,saveScenarioItems,getScenarioSessionLegacyIds,setScenarioSessionLegacyIds,getRandomHistoryLegacyIds,setRandomHistoryLegacyIds,getScenarioSummary},
    _debug:{loadPersonalResponses,loadCoupleState,loadSessions,loadRandom,projectLegacyResponsesToPersonal,projectLegacyResponsesToCouple,convertScenarioDataToActive,mergeLegacyFullSnapshots,v2ByScenarioLegacy,entityByV2,legacyActiveKeys:LEGACY_ACTIVE_KEYS,loadLegacyArchive:()=>normalizeLegacyArchive(readJson(KEYS.legacyArchive,emptyLegacyArchive()))}
  });
})();
