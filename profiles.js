(() => {
  'use strict';

  const KEY = 'bdsmChecklistV2_profile_v1';
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

  function openProfilePage() {
    location.href = 'index.html#profiles';
  }

  applyProfileColors(profile);
  window.CHECKLIST_PROFILE_API = {
    key:KEY,
    get:() => profile,
    save,
    normalize,
    colors:PROFILE_COLORS.map(color => ({...color})),
    anatomyKeys:[...ANATOMY_KEYS],
    safeName,
    open:openProfilePage
  };

  // Profiles are configured on index.html now. Direct checklist access without
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
