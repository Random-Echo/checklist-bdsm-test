(() => {
  'use strict';
  const KEY = 'bdsmChecklistV2_profile_v1';
  const makeIdentityId = () => { try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch (_) {} return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,12); };
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
  const colorById = id => PROFILE_COLORS.find(c=>c.id===id) || null;
  const DEFAULT = {
    schemaVersion: 3,
    personA: { id:'person-a', identityId:null, name:'Personne A', color:'blue', anatomy:{ penis:false,testicles:false,vulva:false,vagina:false,breasts:false,prostate:false } },
    personB: { id:'person-b', identityId:null, name:'Personne B', color:'plum', anatomy:{ penis:false,testicles:false,vulva:false,vagina:false,breasts:false,prostate:false } },
    dynamic: { mode:'switch', dominant:null },
    anatomyConfigured: false,
    showIncompatible: false
  };
  const clone = x => JSON.parse(JSON.stringify(x));
  const safeName = (v, fallback) => String(v||'').trim().slice(0,40) || fallback;
  function normalize(raw){
    const p=clone(DEFAULT); if(!raw||typeof raw!=='object'){ p.personA.identityId=makeIdentityId(); p.personB.identityId=makeIdentityId(); return p; }
    for(const side of ['personA','personB']){
      const r=raw[side]||{}; p[side].name=safeName(r.name, side==='personA'?'Personne A':'Personne B');
      p[side].identityId = typeof r.identityId === 'string' && r.identityId ? r.identityId : makeIdentityId();
      p[side].color = colorById(r.color)?.id || (side==='personA'?'blue':'plum');
      for(const k of Object.keys(p[side].anatomy)) p[side].anatomy[k]=r.anatomy?.[k]===true;
    }
    const mode=raw.dynamic?.mode; p.dynamic.mode=['a-dom','b-dom','switch'].includes(mode)?mode:'switch';
    p.dynamic.dominant=p.dynamic.mode==='a-dom'?'person-a':p.dynamic.mode==='b-dom'?'person-b':null;
    p.anatomyConfigured=raw.anatomyConfigured===true;
    p.showIncompatible=raw.showIncompatible!==false;
    return p;
  }
  function load(){ try{return normalize(JSON.parse(localStorage.getItem(KEY)||'null'));}catch(_){return normalize(null);} }
  let profile=load();
  function applyProfileColors(p=profile){
    const root=document.documentElement;
    const a=colorById(p?.personA?.color)||colorById('blue');
    const b=colorById(p?.personB?.color)||colorById('plum');
    for(const [prefix,c] of [['--person-a-role',a],['--person-b-role',b]]){
      root.style.setProperty(`${prefix}-color`,c.main);
      root.style.setProperty(`${prefix}-dark`,c.dark);
      root.style.setProperty(`${prefix}-soft`,c.soft);
    }
  }
  function save(next){ profile=normalize(next); localStorage.setItem(KEY,JSON.stringify(profile)); applyProfileColors(profile); return profile; }
  applyProfileColors(profile);
  window.CHECKLIST_PROFILE_API={ key:KEY, get:()=>profile, save, normalize, colors:PROFILE_COLORS.map(c=>({...c})), open:()=>renderModal(true) };


  function labels(lang){ const fr=lang!=='en'; return {
    title:fr?'Configurer votre couple':'Configure your couple', sub:fr?'Ces informations servent uniquement à adapter la checklist. Aucun genre ni pronom n’est demandé.':'These details are only used to adapt the checklist. No gender or pronouns are requested.',
    nameA:fr?'Pseudo — Personne A':'Name — Person A', nameB:fr?'Pseudo — Personne B':'Name — Person B',
    color:fr?'Couleur':'Color', anatomy:fr?'Anatomie pertinente':'Relevant anatomy', dynamic:fr?'Dynamique D/s':'D/s dynamic',
    aDom:fr?'A domine principalement B':'A mainly dominates B', bDom:fr?'B domine principalement A':'B mainly dominates A', sw:fr?'Switch — les deux rôles possibles':'Switch — both roles available',
    other:fr?'Afficher aussi les pratiques nécessitant une autre anatomie':'Also show practices requiring other anatomy',
    save:fr?'Enregistrer et ouvrir la checklist':'Save and open checklist', edit:fr?'⚙ Profils':'⚙ Profiles',
    penis:fr?'Pénis':'Penis', testicles:fr?'Testicules':'Testicles', vulva:fr?'Vulve':'Vulva', vagina:fr?'Vagin':'Vagina', breasts:fr?'Poitrine / seins':'Chest / breasts', prostate:'Prostate'
  }; }
  function renderModal(force=false){
    let modal=document.getElementById('profileSetupModal'); if(modal) modal.remove();
    const lang=(localStorage.getItem('bdsmChecklistSite_language_v1')||document.documentElement.lang||'fr').startsWith('en')?'en':'fr'; const L=labels(lang); const p=profile;
    modal=document.createElement('div'); modal.id='profileSetupModal'; modal.className='profile-setup-modal'; modal.hidden=!force;
    const anatomy=(side)=>Object.keys(p[side].anatomy).map(k=>`<label><input type="checkbox" data-anatomy="${side}:${k}" ${p[side].anatomy[k]?'checked':''}> ${L[k]}</label>`).join('');
    const palette=(side)=>PROFILE_COLORS.map(c=>`<label class="profile-color-chip" style="--chip-color:${c.main};--chip-soft:${c.soft}" title="${c.id}"><input type="radio" name="profileColor-${side}" value="${c.id}" ${p[side].color===c.id?'checked':''}><span aria-hidden="true"></span></label>`).join('');
    const nameA=escapeHtml(p.personA.name), nameB=escapeHtml(p.personB.name);
    const dynamicA=lang==='en'?`${nameA} mainly dominates ${nameB}`:`${nameA} domine principalement ${nameB}`;
    const dynamicB=lang==='en'?`${nameB} mainly dominates ${nameA}`:`${nameB} domine principalement ${nameA}`;
    modal.innerHTML=`<div class="profile-setup-backdrop"></div><section class="profile-setup-dialog" role="dialog" aria-modal="true"><h2>${L.title}</h2><p>${L.sub}</p><div class="profile-grid"><fieldset class="profile-person-card" data-profile-side="personA"><legend>${L.nameA}</legend><input id="profileNameA" maxlength="40" value="${nameA}"><strong>${L.color}</strong><div class="profile-color-grid" role="radiogroup">${palette('personA')}</div><strong>${L.anatomy}</strong><div class="anatomy-grid">${anatomy('personA')}</div></fieldset><fieldset class="profile-person-card" data-profile-side="personB"><legend>${L.nameB}</legend><input id="profileNameB" maxlength="40" value="${nameB}"><strong>${L.color}</strong><div class="profile-color-grid" role="radiogroup">${palette('personB')}</div><strong>${L.anatomy}</strong><div class="anatomy-grid">${anatomy('personB')}</div></fieldset></div><fieldset class="dynamic-field"><legend>${L.dynamic}</legend><label><input type="radio" name="profileDynamic" value="a-dom" ${p.dynamic.mode==='a-dom'?'checked':''}> ${dynamicA}</label><label><input type="radio" name="profileDynamic" value="b-dom" ${p.dynamic.mode==='b-dom'?'checked':''}> ${dynamicB}</label><label><input type="radio" name="profileDynamic" value="switch" ${p.dynamic.mode==='switch'?'checked':''}> ${L.sw}</label></fieldset><label class="profile-other"><input id="profileShowIncompatible" type="checkbox" ${p.showIncompatible?'checked':''}> ${L.other}</label><div class="profile-actions"><button id="profileSave" type="button">${L.save}</button>${p.anatomyConfigured?'<button id="profileCancel" type="button">×</button>':''}</div></section>`;
    document.body.appendChild(modal);
    modal.querySelector('#profileCancel')?.addEventListener('click',()=>modal.hidden=true);
    modal.querySelector('#profileSave').addEventListener('click',()=>{
      const next=clone(p); next.personA.name=safeName(modal.querySelector('#profileNameA').value,'Personne A'); next.personB.name=safeName(modal.querySelector('#profileNameB').value,'Personne B');
      next.personA.color=modal.querySelector('input[name="profileColor-personA"]:checked')?.value||'blue';
      next.personB.color=modal.querySelector('input[name="profileColor-personB"]:checked')?.value||'plum';
      modal.querySelectorAll('[data-anatomy]').forEach(el=>{const [side,k]=el.dataset.anatomy.split(':'); next[side].anatomy[k]=el.checked;});
      next.dynamic.mode=modal.querySelector('input[name="profileDynamic"]:checked')?.value||'switch'; next.anatomyConfigured=true; next.showIncompatible=modal.querySelector('#profileShowIncompatible').checked; save(next);
      location.reload();
    });
  }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  document.addEventListener('DOMContentLoaded',()=>{
    const bar=document.querySelector('.title-actions'); if(bar && !bar.querySelector('.profile-edit-button')){ const b=document.createElement('button'); b.type='button'; b.className='profile-edit-button'; b.textContent=labels(document.documentElement.lang).edit; b.addEventListener('click',()=>renderModal(true)); bar.prepend(b); }
    renderModal(false);
    const show=()=>{ if(!profile.anatomyConfigured){ const m=document.getElementById('profileSetupModal'); if(m) m.hidden=false; } };
    document.querySelectorAll('[data-adult-accept]').forEach(adult=>adult.addEventListener('click',()=>setTimeout(show,0)));
    new MutationObserver(()=>{ const btn=document.querySelector('.profile-edit-button'); if(btn) btn.textContent=labels(document.documentElement.lang).edit; }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    const gate=document.getElementById('adultGate'); if(!gate || gate.hidden || getComputedStyle(gate).display==='none') show();
  });
})();
