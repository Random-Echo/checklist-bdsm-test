(() => {
  'use strict';

  const KEY = 'bdsmChecklistV2_profile_v1';
  const CONFIG_BACKUP_ID = 'bdsm-checklists-couple-config-v1';
  const CONFIG_SCHEMA_VERSION = 1;
  const PROFILE_COLORS = [
    {id:'blue',main:'#2F6F8F',dark:'#1E536C',soft:'#E8F2F7'},
    {id:'plum',main:'#8B3F6F',dark:'#67294D',soft:'#F7EAF2'},
    {id:'teal',main:'#2B7A78',dark:'#195B59',soft:'#E1F2F1'},
    {id:'green',main:'#4F7D45',dark:'#365E2F',soft:'#EAF3E7'},
    {id:'orange',main:'#B66A2C',dark:'#874A1C',soft:'#F9EBDD'},
    {id:'red',main:'#A94D55',dark:'#7A3339',soft:'#F8E5E7'},
    {id:'violet',main:'#7054A6',dark:'#503B7A',soft:'#EEE9F8'},
    {id:'gold',main:'#9B782A',dark:'#70561B',soft:'#F8F0D9'}
  ];
  const ANATOMY_KEYS = ['penis','testicles','vulva','vagina','breasts','prostate'];
  const DEFAULT = {
    schemaVersion:3,
    personA:{id:'person-a',identityId:null,name:'Personne A',color:'blue',anatomy:{penis:false,testicles:false,vulva:false,vagina:false,breasts:false,prostate:false}},
    personB:{id:'person-b',identityId:null,name:'Personne B',color:'plum',anatomy:{penis:false,testicles:false,vulva:false,vagina:false,breasts:false,prostate:false}},
    dynamic:{mode:'switch',dominant:null},
    anatomyConfigured:false,
    showIncompatible:false
  };

  const clone = value => JSON.parse(JSON.stringify(value));
  const colorById = id => PROFILE_COLORS.find(color => color.id === id) || null;
  const safeName = (value, fallback) => String(value || '').trim().slice(0, 40) || fallback;
  const makeIdentityId = () => {
    try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
  };

  function normalize(raw) {
    const profile = clone(DEFAULT);
    if (!raw || typeof raw !== 'object') {
      profile.personA.identityId = makeIdentityId();
      profile.personB.identityId = makeIdentityId();
      return profile;
    }

    for (const side of ['personA','personB']) {
      const source = raw[side] || {};
      profile[side].name = safeName(source.name, side === 'personA' ? 'Personne A' : 'Personne B');
      profile[side].identityId = typeof source.identityId === 'string' && source.identityId ? source.identityId : makeIdentityId();
      profile[side].color = colorById(source.color)?.id || (side === 'personA' ? 'blue' : 'plum');
      for (const key of ANATOMY_KEYS) profile[side].anatomy[key] = source.anatomy?.[key] === true;
    }

    profile.dynamic.mode = ['a-dom','b-dom','switch'].includes(raw.dynamic?.mode) ? raw.dynamic.mode : 'switch';
    profile.dynamic.dominant = profile.dynamic.mode === 'a-dom' ? 'person-a' : profile.dynamic.mode === 'b-dom' ? 'person-b' : null;
    profile.anatomyConfigured = raw.anatomyConfigured === true;
    profile.showIncompatible = raw.showIncompatible !== false;
    return profile;
  }

  function load() {
    try { return normalize(JSON.parse(localStorage.getItem(KEY) || 'null')); }
    catch (_) { return normalize(null); }
  }

  let profile = load();

  function applyProfileColors(value = profile) {
    const root = document.documentElement;
    const a = colorById(value?.personA?.color) || colorById('blue');
    const b = colorById(value?.personB?.color) || colorById('plum');
    for (const [prefix, color] of [['--person-a-role', a], ['--person-b-role', b]]) {
      root.style.setProperty(`${prefix}-color`, color.main);
      root.style.setProperty(`${prefix}-dark`, color.dark);
      root.style.setProperty(`${prefix}-soft`, color.soft);
    }
  }

  function save(next) {
    profile = normalize(next);
    localStorage.setItem(KEY, JSON.stringify(profile));
    applyProfileColors(profile);
    return profile;
  }

  function coupleConfiguration(value = profile) {
    const normalized = normalize(value);
    const pickPerson = person => ({
      id: normalized[person].id,
      identityId: normalized[person].identityId,
      name: normalized[person].name,
      color: normalized[person].color,
      anatomy: Object.fromEntries(ANATOMY_KEYS.map(key => [key, normalized[person].anatomy[key] === true]))
    });
    return {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      personA: pickPerson('personA'),
      personB: pickPerson('personB'),
      dynamic: {mode: normalized.dynamic.mode},
      anatomyConfigured: true
    };
  }

  function configurationComparisonShape(value = profile) {
    const config = value?.personA && value?.personB ? coupleConfiguration(value) : value;
    const person = side => ({
      name: safeName(config?.[side]?.name, side === 'personA' ? 'Personne A' : 'Personne B'),
      color: colorById(config?.[side]?.color)?.id || (side === 'personA' ? 'blue' : 'plum'),
      anatomy: Object.fromEntries(ANATOMY_KEYS.map(key => [key, config?.[side]?.anatomy?.[key] === true]))
    });
    return {
      personA: person('personA'),
      personB: person('personB'),
      dynamic: {mode: ['a-dom','b-dom','switch'].includes(config?.dynamic?.mode) ? config.dynamic.mode : 'switch'}
    };
  }

  function configurationFingerprint(value = profile) {
    const text = JSON.stringify(configurationComparisonShape(value));
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `cfg1-${hash.toString(16).padStart(8,'0')}`;
  }

  function normalizeCoupleConfiguration(raw, base = profile) {
    const source = raw?.profile || raw?.coupleConfiguration || raw;
    if (!source || typeof source !== 'object' || !source.personA || !source.personB) throw new Error('Configuration du couple invalide / invalid couple configuration.');
    const next = normalize(base);
    for (const side of ['personA','personB']) {
      const incoming = source[side] || {};
      next[side].name = safeName(incoming.name, side === 'personA' ? 'Personne A' : 'Personne B');
      next[side].color = colorById(incoming.color)?.id || next[side].color;
      if (typeof incoming.identityId === 'string' && incoming.identityId) next[side].identityId = incoming.identityId;
      for (const key of ANATOMY_KEYS) next[side].anatomy[key] = incoming.anatomy?.[key] === true;
    }
    next.dynamic.mode = ['a-dom','b-dom','switch'].includes(source.dynamic?.mode) ? source.dynamic.mode : 'switch';
    next.dynamic.dominant = next.dynamic.mode === 'a-dom' ? 'person-a' : next.dynamic.mode === 'b-dom' ? 'person-b' : null;
    next.anatomyConfigured = true;
    return normalize(next);
  }

  function compareCoupleConfiguration(incoming, local = profile) {
    const remote = normalizeCoupleConfiguration(incoming, local);
    const a = configurationComparisonShape(local);
    const b = configurationComparisonShape(remote);
    const differences = [];
    for (const side of ['personA','personB']) {
      if (a[side].name !== b[side].name) differences.push({kind:'name',side,local:a[side].name,incoming:b[side].name});
      if (a[side].color !== b[side].color) differences.push({kind:'color',side,local:a[side].color,incoming:b[side].color});
      for (const key of ANATOMY_KEYS) {
        if (a[side].anatomy[key] !== b[side].anatomy[key]) differences.push({kind:'anatomy',side,key,local:a[side].anatomy[key],incoming:b[side].anatomy[key]});
      }
    }
    if (a.dynamic.mode !== b.dynamic.mode) differences.push({kind:'dynamic',local:a.dynamic.mode,incoming:b.dynamic.mode});
    return {
      same:differences.length === 0,
      differences,
      localFingerprint:configurationFingerprint(local),
      incomingFingerprint:configurationFingerprint(remote),
      incomingProfile:remote
    };
  }

  function buildCoupleConfigBackup(appVersion = '') {
    const config = coupleConfiguration(profile);
    return {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      siteBackupId: CONFIG_BACKUP_ID,
      backupType:'couple-config',
      appVersion:String(appVersion || ''),
      exportedAt:new Date().toISOString(),
      configFingerprint:configurationFingerprint(config),
      profile:config
    };
  }

  function inspectCoupleConfigBackup(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.siteBackupId !== CONFIG_BACKUP_ID || payload.schemaVersion !== CONFIG_SCHEMA_VERSION || payload.backupType !== 'couple-config') {
      throw new Error('Ce fichier n’est pas une configuration de couple compatible.');
    }
    const incomingProfile = normalizeCoupleConfiguration(payload.profile, profile);
    const fingerprint = configurationFingerprint(incomingProfile);
    if (payload.configFingerprint && payload.configFingerprint !== fingerprint) throw new Error('Configuration du couple corrompue / corrupted couple configuration.');
    return {
      type:'couple-config',
      format:'couple-config-v1',
      appVersion:payload.appVersion || '',
      exportedAt:payload.exportedAt || null,
      fingerprint,
      incomingProfile
    };
  }

  function openProfilePage() {
    location.href = 'index.html#profiles';
  }

  applyProfileColors(profile);
  window.CHECKLIST_PROFILE_API = {
    key:KEY,
    configBackupId:CONFIG_BACKUP_ID,
    configSchemaVersion:CONFIG_SCHEMA_VERSION,
    get:() => profile,
    save,
    normalize,
    colors:PROFILE_COLORS.map(color => ({...color})),
    anatomyKeys:[...ANATOMY_KEYS],
    safeName,
    coupleConfiguration,
    normalizeCoupleConfiguration,
    configurationFingerprint,
    compareCoupleConfiguration,
    buildCoupleConfigBackup,
    inspectCoupleConfigBackup,
    open:openProfilePage
  };

  // Profiles are configured on index.html. Direct checklist access without
  // a configured anatomy profile is redirected there after the adult gate.
  document.addEventListener('DOMContentLoaded', () => {
    const onChecklist = /(?:^|\/)checklist\.html$/i.test(location.pathname);
    if (!onChecklist || profile.anatomyConfigured) return;

    const redirect = () => {
      if (!profile.anatomyConfigured) openProfilePage();
    };
    document.querySelectorAll('[data-adult-accept]').forEach(button => {
      button.addEventListener('click', () => setTimeout(redirect, 0), {once:true});
    });
    const gate = document.getElementById('adultGate');
    if (!gate || gate.hidden || getComputedStyle(gate).display === 'none') redirect();
  });
})();
