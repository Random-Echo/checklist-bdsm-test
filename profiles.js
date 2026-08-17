(() => {
  'use strict';
  const KEY = 'bdsmChecklistV2_profile_v1';
  const makeIdentityId = () => { try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch (_) {} return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,12); };
  const DEFAULT = {
    schemaVersion: 2,
    personA: { id:'person-a', identityId:null, name:'Personne A', anatomy:{ penis:false,testicles:false,vulva:false,vagina:false,breasts:false,prostate:false } },
    personB: { id:'person-b', identityId:null, name:'Personne B', anatomy:{ penis:false,testicles:false,vulva:false,vagina:false,breasts:false,prostate:false } },
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
      for(const k of Object.keys(p[side].anatomy)) p[side].anatomy[k]=r.anatomy?.[k]===true;
    }
    const mode=raw.dynamic?.mode; p.dynamic.mode=['a-dom','b-dom','switch'].includes(mode)?mode:'switch';
    p.dynamic.dominant=p.dynamic.mode==='a-dom'?'person-a':p.dynamic.mode==='b-dom'?'person-b':null;
    p.anatomyConfigured=raw.anatomyConfigured===true;
    p.showIncompatible=raw.showIncompatible!==false;
    return p;
  }
  function load(){ try{return normalize(JSON.parse(localStorage.getItem(KEY)||'null'));}catch(_){return clone(DEFAULT);} }
  let profile=load();
  function save(next){ profile=normalize(next); localStorage.setItem(KEY,JSON.stringify(profile)); return profile; }
  function personForRole(scenarioDef, role){
    if(scenarioDef.personARole===role) return profile.personA;
    return profile.personB;
  }
  const RULES = [
    { key:'testicles', re:/\b(testicule|testicules|couilles?|scrotum|bourses?|ball\s?busting|ball\s?stretch|ball\s?crush|ball\s?slap|cock\s?and\s?ball|cbt)\b/i },
    { key:'prostate', re:/\b(prostate|prostatique|prostatic)\b/i },
    { key:'vagina', re:/\b(vagin|vaginal(?:e|es)?|vaginally|vagina)\b/i },
    { key:'vulva', re:/\b(vulve|vulvaire|vulvar|clitoris|clitorid|clit\b)/i },
    { key:'breasts', re:/\b(seins?|poitrine|mamelons?|tétons?|tetons?|breasts?|nipples?)\b/i },
    { key:'penis', re:/\b(pénis|penis|gland|verge|cock\b)\b/i }
  ];
  function inferRequirements(block){
    const title=String(block.practice||''); const expl=String(block.explanation||''); const en=`${block.practiceEn||''} ${block.explanationEn||''}`;
    const text=`${title} ${expl} ${en}`;
    const found=RULES.filter(r=>r.re.test(text)).map(r=>r.key);
    if(!found.length) return [];
    const lower=`${title} ${expl}`.toLowerCase();
    // Determine whose anatomy is targeted only when wording gives a strong D/s cue.
    let role='sub';
    if(/ma[iî]tre|ma[iî]tresse|dominant(?:e)?/.test(lower) && !/soumis|soumise|submissive/.test(lower)) role='dom';
    else if(/soumis|soumise|submissive/.test(lower)) role='sub';
    return [...new Set(found)].map(anatomy=>({role,anatomy}));
  }
  function evaluate(block, scenarioDef){
    const requirements=Array.isArray(block?.anatomyRequirements) ? block.anatomyRequirements : inferRequirements(block);
    if(!profile.anatomyConfigured) return {status:'unknown',requirements};
    if(!requirements.length) return {status:'applicable',requirements};
    const missing=requirements.filter(r=>!personForRole(scenarioDef,r.role).anatomy[r.anatomy]);
    return {status:missing.length?'notApplicable':'applicable',requirements,missing};
  }
  window.CHECKLIST_PROFILE_API={ key:KEY, get:()=>profile, save, normalize, evaluate, inferRequirements, open:()=>renderModal(true) };

  function labels(lang){ const fr=lang!=='en'; return {
    title:fr?'Configurer votre couple':'Configure your couple', sub:fr?'Ces informations servent uniquement à adapter la checklist. Aucun genre ni pronom n’est demandé.':'These details are only used to adapt the checklist. No gender or pronouns are requested.',
    nameA:fr?'Pseudo — Personne A':'Name — Person A', nameB:fr?'Pseudo — Personne B':'Name — Person B',
    anatomy:fr?'Anatomie pertinente':'Relevant anatomy', dynamic:fr?'Dynamique D/s':'D/s dynamic',
    aDom:fr?'A domine principalement B':'A mainly dominates B', bDom:fr?'B domine principalement A':'B mainly dominates A', sw:fr?'Switch — les deux orientations':'Switch — both orientations',
    other:fr?'Afficher aussi les pratiques nécessitant une autre anatomie':'Also show practices requiring other anatomy',
    save:fr?'Enregistrer et ouvrir la checklist':'Save and open checklist', edit:fr?'⚙ Profils':'⚙ Profiles',
    penis:fr?'Pénis':'Penis', testicles:fr?'Testicules':'Testicles', vulva:fr?'Vulve':'Vulva', vagina:fr?'Vagin':'Vagina', breasts:fr?'Poitrine / seins':'Chest / breasts', prostate:'Prostate'
  }; }
  function renderModal(force=false){
    let modal=document.getElementById('profileSetupModal'); if(modal) modal.remove();
    const lang=(localStorage.getItem('bdsmChecklistSite_language_v1')||document.documentElement.lang||'fr').startsWith('en')?'en':'fr'; const L=labels(lang); const p=profile;
    modal=document.createElement('div'); modal.id='profileSetupModal'; modal.className='profile-setup-modal'; modal.hidden=!force;
    const anatomy=(side)=>Object.keys(p[side].anatomy).map(k=>`<label><input type="checkbox" data-anatomy="${side}:${k}" ${p[side].anatomy[k]?'checked':''}> ${L[k]}</label>`).join('');
    const nameA=escapeHtml(p.personA.name), nameB=escapeHtml(p.personB.name);
    const dynamicA=lang==='en'?`${nameA} mainly dominates ${nameB}`:`${nameA} domine principalement ${nameB}`;
    const dynamicB=lang==='en'?`${nameB} mainly dominates ${nameA}`:`${nameB} domine principalement ${nameA}`;
    modal.innerHTML=`<div class="profile-setup-backdrop"></div><section class="profile-setup-dialog" role="dialog" aria-modal="true"><h2>${L.title}</h2><p>${L.sub}</p><div class="profile-grid"><fieldset><legend>${L.nameA}</legend><input id="profileNameA" maxlength="40" value="${nameA}"><strong>${L.anatomy}</strong><div class="anatomy-grid">${anatomy('personA')}</div></fieldset><fieldset><legend>${L.nameB}</legend><input id="profileNameB" maxlength="40" value="${nameB}"><strong>${L.anatomy}</strong><div class="anatomy-grid">${anatomy('personB')}</div></fieldset></div><fieldset class="dynamic-field"><legend>${L.dynamic}</legend><label><input type="radio" name="profileDynamic" value="a-dom" ${p.dynamic.mode==='a-dom'?'checked':''}> ${dynamicA}</label><label><input type="radio" name="profileDynamic" value="b-dom" ${p.dynamic.mode==='b-dom'?'checked':''}> ${dynamicB}</label><label><input type="radio" name="profileDynamic" value="switch" ${p.dynamic.mode==='switch'?'checked':''}> ${L.sw}</label></fieldset><label class="profile-other"><input id="profileShowIncompatible" type="checkbox" ${p.showIncompatible?'checked':''}> ${L.other}</label><div class="profile-actions"><button id="profileSave" type="button">${L.save}</button>${p.anatomyConfigured?'<button id="profileCancel" type="button">×</button>':''}</div></section>`;
    document.body.appendChild(modal);
    modal.querySelector('#profileCancel')?.addEventListener('click',()=>modal.hidden=true);
    modal.querySelector('#profileSave').addEventListener('click',()=>{
      const next=clone(p); next.personA.name=safeName(modal.querySelector('#profileNameA').value,'Personne A'); next.personB.name=safeName(modal.querySelector('#profileNameB').value,'Personne B');
      modal.querySelectorAll('[data-anatomy]').forEach(el=>{const [side,k]=el.dataset.anatomy.split(':'); next[side].anatomy[k]=el.checked;});
      next.dynamic.mode=modal.querySelector('input[name="profileDynamic"]:checked')?.value||'switch'; next.anatomyConfigured=true; next.showIncompatible=modal.querySelector('#profileShowIncompatible').checked; save(next);
      const url=new URL(location.href); url.searchParams.delete('scenario'); location.href=url.href;
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
