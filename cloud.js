import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import {getFirestore,doc,getDocFromServer,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),ui=window.JerseyBridge;
const el=id=>document.getElementById(id);
const blank=()=>({shirts:[],history:[],cycle:1,proposed:null,wishlist:[]});
const valid=x=>x&&Array.isArray(x.shirts)&&Array.isArray(x.history)&&Array.isArray(x.wishlist);
const copy=x=>JSON.parse(JSON.stringify(x));
let user=null,rev=0,dirty=false,busy=false,ready=false,conflict=null,timer=null,epoch=0,localOK=true;
const key=()=> 'jerseyroom.v4.draft.'+user.uid;
function status(s){el('cloudStatus').textContent=s;el('loginStatus').textContent=s;}
function controls(){el('cloudSync').disabled=busy;el('cloudLogout').disabled=busy;el('cloudConflict').hidden=!conflict;el('keepLocal').disabled=busy;el('keepRemote').disabled=busy;el('loginSubmit').disabled=busy;}
function draft(){if(!user)return;try{if(dirty)localStorage.setItem(key(),JSON.stringify({data:ui.read(),rev}));else localStorage.removeItem(key());localOK=true;}catch{localOK=false;status('Memoria locale piena: esporta un backup prima di chiudere.');}}
function pending(){try{return JSON.parse(localStorage.getItem(key())||'null')}catch{return null}}
function showApp(show){document.body.classList.toggle('jr-locked',!show);el('loginBox').hidden=show;el('cloudBox').hidden=!show;}
function remote(s){if(!s.exists())return {rev:0,data:blank()};const x=s.data();if(!Number.isSafeInteger(x.revision)||x.revision<1||typeof x.payload!=='string')throw Error('Formato cloud non valido');const data=JSON.parse(x.payload);if(!valid(data))throw Error('Dati cloud non validi');return {rev:x.revision,data};}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>sync(),450)}
ui.onSave=()=>{if(!ready||!user)return false;dirty=true;draft();if(!conflict){status(localOK?'Modifiche da sincronizzare…':'Memoria locale piena.');schedule();}return true;};
async function sync(){
 if(!user||!ready||busy||conflict)return;
 const token=epoch,ref=doc(db,'jerseyroom',user.uid);
 if(!dirty&&document.querySelector('dialog[open]'))return;
 busy=true;controls();
 try{
  if(dirty){
   const payload=JSON.stringify(ui.read()),base=rev;
   if(new TextEncoder().encode(payload).length>850000)throw Error('Collezione troppo grande per il salvataggio attuale: usa URL delle foto ed esporta un backup.');
   status('Sincronizzazione in corso…');
   const result=await runTransaction(db,async tx=>{
     const current=remote(await tx.get(ref));
     if(current.rev!==base)return {conflict:current};
     tx.set(ref,{revision:base+1,payload,updatedAt:serverTimestamp()});
     return {rev:base+1};
   });
   if(token!==epoch)return;
   if(result.conflict){conflict=result.conflict;status('Conflitto: ci sono modifiche anche su un altro dispositivo. Scegli quale versione mantenere.');}
   else{rev=result.rev;dirty=JSON.stringify(ui.read())!==payload;draft();status(dirty?'Altre modifiche da sincronizzare…':'Sincronizzato ✓');if(dirty)schedule();}
  }else{
   const current=remote(await getDocFromServer(ref));
   if(token!==epoch)return;
   if(current.rev!==rev){
    if(dirty||document.querySelector('dialog[open]')){if(dirty){conflict=current;status('Conflitto tra dispositivi.');}}
    else{rev=current.rev;ui.replace(current.data);status('Sincronizzato ✓');}
   }else if(!dirty)status('Sincronizzato ✓');
  }
 }catch(e){if(token===epoch)status('Non sincronizzato: '+(e.code||e.message)+'. Riprova con il pulsante.');}
 finally{if(token===epoch){busy=false;controls();}}
}
async function start(u){
 clearTimeout(timer);epoch++;const token=epoch;user=u;ready=false;dirty=false;conflict=null;rev=0;busy=false;ui.replace(blank());showApp(false);controls();
 if(!u){status('Accedi con il tuo account personale.');return;}
 busy=true;controls();status('Caricamento della collezione…');
 try{
  const p=pending(),current=remote(await getDocFromServer(doc(db,'jerseyroom',u.uid)));
  if(token!==epoch)return;
  rev=current.rev;
  if(p&&valid(p.data)&&Number.isSafeInteger(p.rev)){
   ui.replace(p.data);dirty=true;rev=p.rev;
   if(current.rev!==rev){conflict=current;status('Modifiche locali e cloud in conflitto. Scegli una versione.');}
  }else{
   ui.replace(current.data);
   if(!current.rev){const legacy=ui.legacy();if(valid(legacy)&&(legacy.shirts.length||legacy.history.length||legacy.wishlist.length)&&confirm('Trovata una collezione V3 su questo dispositivo. Importarla nel tuo account?')){ui.replace(legacy);dirty=true;draft();}}
  }
  ready=true;showApp(true);el('cloudAccount').textContent=u.email||'Account personale';
  if(!conflict)status(dirty?'Modifiche da sincronizzare…':'Sincronizzato ✓');
 }catch(e){if(token===epoch)status('Accesso riuscito, ma database non disponibile: '+(e.code||e.message)+'. Premi Riprova.');}
 finally{if(token===epoch){busy=false;controls();if(ready&&dirty&&!conflict)schedule();}}
}
el('loginForm').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;controls();try{await signInWithEmailAndPassword(auth,el('loginEmail').value.trim(),el('loginPassword').value);el('loginPassword').value='';}catch(e){status('Accesso non riuscito. Controlla email e password ('+(e.code||'errore')+').');busy=false;controls();}});
el('loginRetry').onclick=()=>{if(auth.currentUser&&!busy)start(auth.currentUser);else if(!busy)status('Inserisci email e password.');};
el('cloudSync').onclick=()=>sync();
el('keepRemote').onclick=()=>{if(!conflict||busy||!confirm('Sostituire le modifiche locali con la versione cloud? Esporta prima il backup se vuoi conservarle.'))return;ui.replace(copy(conflict.data));rev=conflict.rev;dirty=false;conflict=null;draft();controls();sync();};
el('keepLocal').onclick=()=>{if(!conflict||busy||!confirm('Sostituire la versione cloud con quella di questo dispositivo?'))return;rev=conflict.rev;conflict=null;dirty=true;draft();controls();sync();};
el('cloudLogout').onclick=async()=>{if(busy)return;if(dirty&&!confirm('Ci sono modifiche non sincronizzate. Uscire comunque? Esporta un backup se necessario.'))return;if(dirty&&!localOK){status('Esporta un backup e sincronizza prima di uscire.');return;}try{await signOut(auth);}catch(e){status('Uscita non riuscita.');}};
window.addEventListener('online',()=>sync());window.addEventListener('focus',()=>sync());document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});setInterval(()=>{if(!document.hidden)sync();},30000);
window.addEventListener('beforeunload',e=>{if(dirty&&!localOK){e.preventDefault();e.returnValue='';}});
onAuthStateChanged(auth,start,e=>status('Errore account: '+(e.code||e.message)));
