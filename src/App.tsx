import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {ArrowLeft,Camera,ChevronRight,ImagePlus,LogOut,MessageCircle,Mic,MoreHorizontal,PencilLine,Plus,RefreshCw,Search,Send,Settings,Square,Trash2,UserRound,X} from 'lucide-react';
type Session={access_token:string};
type User={id:string};
import {isSupabaseConfigured,supabase} from './lib/supabase';

type Screen='messages'|'chat'|'create-story'|'profile'|'settings'|'auth'|'story-viewer';
type Profile={id:string;username:string;display_name:string;avatar_url:string|null;bio:string};
const fileToDataUrl=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Lecture du fichier impossible.'));reader.readAsDataURL(file)});
type Story={id:string;user_id:string;storage_path:string;media_type:'image'|'video';caption:string;created_at:string;expires_at:string;url:string;profile:Profile};
type ChatRow={id:string;user:Profile;lastMessage:string;lastAt:string};
type Attachment={id:string;message_id:string;storage_path:string;file_name:string;mime_type:string;size_bytes:number;url:string};
type Message={id:string;conversation_id:string;sender_id:string;body:string;message_type:string;created_at:string;attachments?:Attachment[]};
const MIME_TYPES=['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'];
const MAX_FILE=50*1024*1024;
const CHAT_FILE_TYPES=['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav'];
const initials=(value:string)=>value.trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()??'').join('')||'S';
const timeLabel=(value:string)=>{const date=new Date(value);if(Number.isNaN(date.getTime()))return '';return new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(date)};
function Avatar({profile,size='normal'}:{profile?:Partial<Profile>|null;size?:'small'|'normal'|'large'}){return <span className={'avatar avatar-'+size}>{profile?.avatar_url?<img src={profile.avatar_url} alt=""/>:initials(profile?.display_name||profile?.username||'SAFARY')}</span>}

export default function App(){
 const client=supabase;
 const [screen,setScreen]=useState<Screen>('auth');
 const [session,setSession]=useState<Session|null>(null);
 const [user,setUser]=useState<User|null>(null);
 const [profile,setProfile]=useState<Profile|null>(null);
 const [chats,setChats]=useState<ChatRow[]>([]);
 const [stories,setStories]=useState<Story[]>([]);
 const [messages,setMessages]=useState<Message[]>([]);
 const [conversationId,setConversationId]=useState('');
 const [contact,setContact]=useState<Profile|null>(null);
 const [storyIndex,setStoryIndex]=useState(0);
 const [draft,setDraft]=useState('');
 const [storyFile,setStoryFile]=useState<File|null>(null);
 const [storyCaption,setStoryCaption]=useState('');
 const [displayName,setDisplayName]=useState('');
 const [username,setUsername]=useState('');
 const [bio,setBio]=useState('');
 const [avatarUrl,setAvatarUrl]=useState('');
 const [password,setPassword]=useState('');
 const [confirmPassword,setConfirmPassword]=useState('');
 const [age,setAge]=useState('');
 const [avatarFile,setAvatarFile]=useState<File|null>(null);
 const [coverFile,setCoverFile]=useState<File|null>(null);
 const [authMode,setAuthMode]=useState<'login'|'signup'>('login');
 const [searchOpen,setSearchOpen]=useState(false);
 const [searchTerm,setSearchTerm]=useState('');
 const [searchResults,setSearchResults]=useState<Profile[]>([]);
 const [settings,setSettings]=useState({online_status_visible:true,notifications_enabled:true});
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [loading,setLoading]=useState(true);
 const [recording,setRecording]=useState(false);
 const recorderRef=useRef<MediaRecorder|null>(null);
 const recorderChunks=useRef<Blob[]>([]);
 const fileInputRef=useRef<HTMLInputElement|null>(null);
 const attachmentUrls=useRef(new Map<string,string>());
 useEffect(()=>()=>{attachmentUrls.current.forEach(url=>URL.revokeObjectURL(url));attachmentUrls.current.clear()},[]);

 const notify=(message:string)=>setNotice(message);
 const loadProfile=useCallback(async(uid:string)=>{
  if(!client)return;
  const {data,error}=await client.from('profiles').select('id,username,display_name,avatar_url,bio').eq('id',uid).maybeSingle();
  if(error){notify(error.message);return}
  if(data){let resolvedAvatar=data.avatar_url??'';if(resolvedAvatar&&!resolvedAvatar.startsWith('http')){const signed=await client.storage.from('profile-media').createSignedUrl(resolvedAvatar,3600);resolvedAvatar=signed.data?.signedUrl??'';}const p={...data,avatar_url:resolvedAvatar} as Profile;setProfile(p);setDisplayName(p.display_name??'');setUsername(p.username??'');setBio(p.bio??'');setAvatarUrl(resolvedAvatar)}
  const pref=await client.from('user_settings').select('online_status_visible,notifications_enabled').eq('user_id',uid).maybeSingle();
  if(pref.data)setSettings(pref.data);
 },[client]);

 const loadHome=useCallback(async(uid:string)=>{
  if(!client)return;
  const own=await client.from('conversation_members').select('conversation_id').eq('user_id',uid);
  if(own.error){notify(own.error.message);return}
  const ids=[...new Set((own.data??[]).map((x:any)=>x.conversation_id as string))];
  if(ids.length){
   const members=await client.from('conversation_members').select('conversation_id,user_id').in('conversation_id',ids);
   if(members.error)notify(members.error.message);
   const otherIds=[...new Set((members.data??[]).map((x:any)=>x.user_id as string).filter((x:string)=>x!==uid))];
   const people=otherIds.length?await client.from('profiles').select('id,username,display_name,avatar_url,bio').in('id',otherIds):{data:[],error:null};
   const signedPeople=await Promise.all((people.data??[]).map(async(p:any)=>{if(p.avatar_url&&!p.avatar_url.startsWith('http')){const signed=await client.storage.from('profile-media').createSignedUrl(p.avatar_url,3600);return {...p,avatar_url:signed.data?.signedUrl??null} as Profile}return p as Profile}));
   const byId=new Map(signedPeople.map((p:any)=>[p.id,p as Profile]));
   const last=await client.from('messages').select('id,conversation_id,body,created_at,sender_id').in('conversation_id',ids).order('created_at',{ascending:false});
   const latest=new Map<string,any>();
   for(const m of last.data??[])if(!latest.has(m.conversation_id))latest.set(m.conversation_id,m);
   const rows:ChatRow[]=[];
   for(const id of ids){const peer=(members.data??[]).find((m:any)=>m.conversation_id===id&&m.user_id!==uid);const p=peer?byId.get(peer.user_id):undefined;if(p){const m=latest.get(id);rows.push({id,user:p,lastMessage:m?.body??'Commencez à discuter',lastAt:m?.created_at??''})}}
   rows.sort((a,b)=>b.lastAt.localeCompare(a.lastAt));setChats(rows);
  }else setChats([]);
  const active=await client.from('stories').select('id,user_id,storage_path,media_type,caption,created_at,expires_at').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false});
  if(active.error){notify(active.error.message);setStories([]);return}
  const raw=active.data??[];
  const storyUsers=[...new Set(raw.map((s:any)=>s.user_id as string))];
  const people=storyUsers.length?await client.from('profiles').select('id,username,display_name,avatar_url,bio').in('id',storyUsers):{data:[],error:null};
  const signedPeople=await Promise.all((people.data??[]).map(async(p:any)=>{if(p.avatar_url&&!p.avatar_url.startsWith('http')){const signed=await client.storage.from('profile-media').createSignedUrl(p.avatar_url,3600);return {...p,avatar_url:signed.data?.signedUrl??null} as Profile}return p as Profile}));
  const profileMap=new Map(signedPeople.map((p:any)=>[p.id,p as Profile]));
  const resolved=await Promise.all(raw.map(async(s:any)=>{
   const {data}=await client.storage.from('stories').createSignedUrl(s.storage_path,3600);
   const p=profileMap.get(s.user_id);return p&&data?.signedUrl?{...s,url:data.signedUrl,profile:p} as Story:null;
  }));
  setStories(resolved.filter(Boolean) as Story[]);
 },[client]);

 useEffect(()=>{
  if(!client){setLoading(false);notify('Configuration Supabase manquante.');return}
  let alive=true;
  const restore=async()=>{
   const token=localStorage.getItem('safary_session');
   if(!token){if(alive){setLoading(false);setScreen('auth')}return}
   const {data,error}=await client.functions.invoke('safary-auth',{body:{action:'me'},headers:{'x-safary-session':token}});
   if(!alive)return;
   if(error||!data?.account){localStorage.removeItem('safary_session');setSession(null);setUser(null);setScreen('auth')}
   else{setSession({access_token:token});setUser({id:data.account.id});setProfile(data.account);setDisplayName(data.account.display_name??'');setUsername(data.account.username??'');setBio(data.account.bio??'');setAvatarUrl(data.account.avatar_url??'')}
   setLoading(false);
  };
  void restore();
  return()=>{alive=false};
 },[client]);

 useEffect(()=>{
  if(!client||!user)return;
  let active=true;
  (async()=>{await loadProfile(user.id);await loadHome(user.id);if(active)setScreen('messages')})();
  return()=>{active=false};
 },[client,user,loadProfile,loadHome]);

 const loadMessages=useCallback(async(id:string)=>{
  if(!client)return;
  const {data,error}=await client.from('messages').select('id,conversation_id,sender_id,body,message_type,created_at').eq('conversation_id',id).order('created_at',{ascending:true}).limit(300);
  if(error){notify(error.message);return}
  const rows=(data??[]) as Message[];const ids=rows.map(m=>m.id);
  const result=ids.length?await client.from('message_attachments').select('id,message_id,storage_path,file_name,mime_type,size_bytes').in('message_id',ids):{data:[],error:null};
  if(result.error)notify(result.error.message);
  const byMessage=new Map<string,Attachment[]>();
  for(const item of result.data??[]){
   let url=attachmentUrls.current.get(item.storage_path);
   if(!url){const downloaded=await client.storage.from('message-attachments').download(item.storage_path);if(downloaded.data){url=URL.createObjectURL(downloaded.data);attachmentUrls.current.set(item.storage_path,url)}}
   if(url){const list=byMessage.get(item.message_id)??[];list.push({...item,url} as Attachment);byMessage.set(item.message_id,list)}
  }
  setMessages(rows.map(m=>({...m,attachments:byMessage.get(m.id)??[]})));
 },[client]);
 const openChat=useCallback(async(row:ChatRow)=>{
  setContact(row.user);setConversationId(row.id);setScreen('chat');setMessages([]);await loadMessages(row.id);
 },[loadMessages]);

 useEffect(()=>{
  if(!client||!conversationId||screen!=='chat')return;
  const timer=window.setInterval(()=>{void loadMessages(conversationId);if(user?.id)void loadHome(user.id)},4000);
  return()=>window.clearInterval(timer);
 },[client,conversationId,screen,user,loadHome,loadMessages]);

 const sendMessage=async(e:FormEvent)=>{
  e.preventDefault();const body=draft.trim();if(!client||!user||!conversationId||!body)return;
  setDraft('');const {data,error}=await client.from('messages').insert({conversation_id:conversationId,sender_id:user.id,body,message_type:'text'}).select('id,conversation_id,sender_id,body,message_type,created_at').single();
  if(error){setDraft(body);notify(error.message);return}
  setMessages(prev=>prev.some(m=>m.id===data.id)?prev:[...prev,data as Message]);
 };

 const uploadChatFile=async(file:File,kind:'image'|'file'|'voice'='file')=>{
  if(!client||!user||!conversationId)return;
  if(!CHAT_FILE_TYPES.includes(file.type)){notify('Type de fichier non accepté.');return}
  if(file.size>MAX_FILE){notify('Le fichier dépasse la limite de 50 Mo.');return}
  setBusy(true);
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=conversationId+'/'+user.id+'/'+crypto.randomUUID()+'-'+safeName;
  const uploaded=await client.storage.from('message-attachments').upload(path,file,{contentType:file.type,upsert:false});
  if(uploaded.error){notify(uploaded.error.message);setBusy(false);return}
  const message=await client.from('messages').insert({conversation_id:conversationId,sender_id:user.id,body:file.name.slice(0,500),message_type:kind}).select('id').single();
  if(message.error){await client.storage.from('message-attachments').remove([path]);notify(message.error.message);setBusy(false);return}
  const attachment=await client.from('message_attachments').insert({message_id:message.data.id,storage_path:path,file_name:file.name.slice(0,255),mime_type:file.type,size_bytes:file.size});
  if(attachment.error){await client.from('messages').delete().eq('id',message.data.id);await client.storage.from('message-attachments').remove([path]);notify(attachment.error.message)}
  else{await loadMessages(conversationId);await loadHome(user.id)}
  setBusy(false);
 };
 const toggleVoiceRecording=async()=>{
  if(recording){recorderRef.current?.stop();return}
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){notify('Ton navigateur ne permet pas les messages vocaux.');return}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   const mime=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':MediaRecorder.isTypeSupported('audio/mp4')?'audio/mp4':undefined;
   const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);recorderChunks.current=[];
   recorder.ondataavailable=e=>{if(e.data.size)recorderChunks.current.push(e.data)};
   recorder.onstop=()=>{stream.getTracks().forEach(track=>track.stop());setRecording(false);const type=(recorder.mimeType||'audio/webm').split(';')[0];const ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';const blob=new Blob(recorderChunks.current,{type});void uploadChatFile(new File([blob],'vocal-'+Date.now()+'.'+ext,{type}),'voice')};
   recorderRef.current=recorder;recorder.start();setRecording(true);
  }catch(error){notify(error instanceof Error?error.message:'Impossible d’accéder au microphone.')}
 };
 const searchPeople=async(term:string)=>{
  setSearchTerm(term);if(!client||term.trim().length<2){setSearchResults([]);return}
  const {data,error}=await client.from('profiles').select('id,username,display_name,avatar_url,bio').ilike('username','%'+term.trim().replace(/[%_]/g,'')+'%').neq('id',user?.id??'').limit(12);
  if(error)notify(error.message);else setSearchResults((data??[]) as Profile[]);
 };
 const startConversation=async(person:Profile)=>{
  if(!client||!user)return;setBusy(true);
  const {data,error}=await client.rpc('create_direct_conversation',{p_other_user:person.id});
  if(error){notify(error.message);setBusy(false);return}
  const id=data as string;setSearchOpen(false);setSearchTerm('');setSearchResults([]);setBusy(false);
  await loadHome(user.id);await openChat({id,user:person,lastMessage:'',lastAt:''});
 };

 const submitAuth=async(e:FormEvent)=>{
  e.preventDefault();if(!client)return;setBusy(true);setNotice('');
  try{
   if(authMode==='login'){
    const {data,error}=await client.functions.invoke('safary-auth',{body:{action:'login',username:username.trim(),password}});
    if(error)throw new Error(data?.error??error.message);
    if(!data?.session?.token||!data?.account?.id)throw new Error(data?.error??'Connexion impossible.');
    localStorage.setItem('safary_session',data.session.token);
    setSession({access_token:data.session.token});setUser({id:data.account.id});setProfile(data.account);setScreen('messages');notify('Bienvenue sur SAFARY.');
   }else{
    if(username.trim().length<3)throw new Error('Le pseudo doit contenir au moins 3 caractères.');
    if(password.length<10)throw new Error('Le mot de passe doit contenir au moins 10 caractères.');
    if(password!==confirmPassword)throw new Error('Les mots de passe ne correspondent pas.');
    if(!Number.isInteger(Number(age))||Number(age)<1||Number(age)>120)throw new Error('Âge invalide.');
    if(!avatarFile||!coverFile)throw new Error('Ajoute ta photo de profil et ta photo de couverture.');
    if(!['image/jpeg','image/png','image/webp'].includes(avatarFile.type)||!['image/jpeg','image/png','image/webp'].includes(coverFile.type))throw new Error('Les photos doivent être au format JPG, PNG ou WebP.');
    if(avatarFile.size>3*1024*1024||coverFile.size>3*1024*1024)throw new Error('Chaque photo doit faire moins de 3 Mo.');
    const [avatarDataUrl,coverDataUrl]=await Promise.all([fileToDataUrl(avatarFile),fileToDataUrl(coverFile)]);
    const {data,error}=await client.functions.invoke('safary-auth',{body:{action:'signup',username:username.trim(),password,confirmPassword,age:Number(age),avatarDataUrl,coverDataUrl}});
    if(error)throw new Error(data?.error??error.message);
    if(!data?.session?.token||!data?.account?.id)throw new Error(data?.error??'Création du compte impossible.');
    localStorage.setItem('safary_session',data.session.token);
    setSession({access_token:data.session.token});setUser({id:data.account.id});setProfile(data.account);setScreen('messages');notify('Compte créé. Bienvenue sur SAFARY.');
   }
  }catch(err){notify(err instanceof Error?err.message:'Une erreur est survenue.')}finally{setBusy(false)}
 };

 const publishStory=async()=>{
  if(!client||!user||!storyFile)return;
  if(!MIME_TYPES.includes(storyFile.type)){notify('Format non accepté. Utilise JPEG, PNG, WebP, GIF, MP4, WebM ou MOV.');return}
  if(storyFile.size>MAX_FILE){notify('Le fichier dépasse la limite de 50 Mo.');return}
  setBusy(true);notify('');
  const path=user.id+'/'+crypto.randomUUID()+'-'+storyFile.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const upload=await client.storage.from('stories').upload(path,storyFile,{contentType:storyFile.type,upsert:false});
  if(upload.error){notify(upload.error.message);setBusy(false);return}
  const result=await client.from('stories').insert({user_id:user.id,storage_path:path,media_type:storyFile.type.startsWith('video/')?'video':'image',caption:storyCaption.trim()});
  if(result.error){await client.storage.from('stories').remove([path]);notify(result.error.message)}else{setStoryFile(null);setStoryCaption('');await loadHome(user.id);setScreen('messages');notify('Story publiée. Elle disparaîtra après 48 heures.')}
  setBusy(false);
 };

 const viewStory=async(index:number)=>{
  const story=stories[index];if(!story)return;setStoryIndex(index);setScreen('story-viewer');
  if(client&&user&&story.user_id!==user.id)await client.from('story_views').upsert({story_id:story.id,viewer_id:user.id},{onConflict:'story_id,viewer_id',ignoreDuplicates:true});
 };
 const deleteStory=async()=>{
  const story=stories[storyIndex];if(!client||!user||!story||story.user_id!==user.id)return;
  setBusy(true);const file=await client.storage.from('stories').remove([story.storage_path]);
  if(file.error){notify(file.error.message);setBusy(false);return}
  const row=await client.from('stories').delete().eq('id',story.id);
  if(row.error)notify(row.error.message);else{await loadHome(user.id);setScreen('messages');notify('Story supprimée.')}
  setBusy(false);
 };
 const saveProfile=async(e:FormEvent)=>{
  e.preventDefault();if(!client||!user)return;
  if(!/^[a-z0-9_.]{3,30}$/i.test(username.trim())){notify('Le nom utilisateur doit contenir 3 à 30 caractères (lettres, chiffres, _ ou .).');return}
  setBusy(true);
  const {data,error}=await client.functions.invoke('safary-auth',{body:{action:'profile-update',username:username.trim().toLowerCase(),displayName:displayName.trim(),bio}});
  if(error){notify(error.message);setBusy(false);return}
  const profileUpdate=await client.from('profiles').update({avatar_url:avatarUrl.trim()||null}).eq('id',user.id).select('id,username,display_name,avatar_url,bio').single();
  if(profileUpdate.error)notify(profileUpdate.error.message);else{setProfile({...profileUpdate.data,avatar_url:avatarUrl.trim()||null} as Profile);notify('Profil mis à jour.')}
  setBusy(false);
 };
 const updateSetting=async(key:'online_status_visible'|'notifications_enabled',value:boolean)=>{
  if(!client||!user)return;const next={...settings,[key]:value};setSettings(next);
  const {error}=await client.from('user_settings').update({...next,updated_at:new Date().toISOString()}).eq('user_id',user.id);
  if(error){setSettings(settings);notify(error.message)}
 };
 const signOut=async()=>{if(client){const token=localStorage.getItem('safary_session');const {error}=await client.functions.invoke('safary-auth',{body:{action:'logout'},headers:token?{'x-safary-session':token}:{}});if(error)notify(error.message);localStorage.removeItem('safary_session');setScreen('auth');setSession(null);setUser(null);setProfile(null);setChats([]);setStories([]);setMessages([])}};

 const groupedStories=useMemo(()=>{const map=new Map<string,Story[]>();for(const s of stories){const list=map.get(s.user_id)??[];list.push(s);map.set(s.user_id,list)}return [...map.values()].map(items=>items[0])},[stories]);
 const activeStory=stories[storyIndex];
 useEffect(()=>()=>{stories.forEach(story=>{if(story.url.startsWith('blob:'))URL.revokeObjectURL(story.url)})},[stories]);
 if(loading)return <main className="app-shell"><section className="phone-frame loading-state"><span className="brand">SAFARY</span><p>Chargement sécurisé…</p></section></main>;

 return <main className="app-shell"><div className="ambient ambient-one"/><div className="ambient ambient-two"/><section className="phone-frame">
 {!isSupabaseConfigured&&<div className="setup-banner">Connexion SAFARY indisponible : vérifie la configuration Supabase.</div>}
 {(!session||!user||screen==='auth')&&<div className="auth-screen"><div className="auth-brand">SAFARY<span>Le lien qui nous rapproche.</span></div><form className="form-card" onSubmit={submitAuth}>
  <h1>{authMode==='login'?'Bon retour':'Créer un compte'}</h1>
  <label>Pseudo<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="ex. rakoto" minLength={3} maxLength={30} autoComplete="username" required/></label>
  <label>Mot de passe<input type="password" autoComplete={authMode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={authMode==='login'?1:10} placeholder={authMode==='login'?'Ton mot de passe':'10 caractères minimum'} required/></label>
  {authMode==='signup'&&<>
   <label>Confirmer le mot de passe<input type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} minLength={10} required/></label>
   <label>Âge<input type="number" inputMode="numeric" min="1" max="120" value={age} onChange={e=>setAge(e.target.value)} required/></label>
   <label>Photo de profil (PDP)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setAvatarFile(e.target.files?.[0]??null)} required/></label>
   <label>Photo de couverture (PDC)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setCoverFile(e.target.files?.[0]??null)} required/></label>
  </>}
  <button className="gradient-button full-width" disabled={busy||!isSupabaseConfigured}>{busy?'Patiente…':authMode==='login'?'Se connecter':'Créer mon compte'}</button>
  <button type="button" className="text-button" onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setPassword('');setConfirmPassword('');setNotice('')}}>{authMode==='login'?'Créer un compte':'J’ai déjà un compte'}</button>
  {notice&&<p className="notice">{notice}</p>}
 </form><p className="auth-foot">Un espace social pensé pour se retrouver.</p></div>}
 {session&&user&&screen!=='auth'&&<>
  {screen==='messages'&&<><header className="topbar"><div className="brand">SAFARY</div><div className="top-actions"><button aria-label="Rechercher un membre" onClick={()=>setSearchOpen(true)}><Search/></button><button aria-label="Nouvelle discussion" onClick={()=>setSearchOpen(true)}><PencilLine/></button></div></header>
   <section className="stories-section"><div className="section-heading"><h2>Stories</h2><button aria-label="Créer une story" onClick={()=>setScreen('create-story')}><Plus/></button></div><div className="stories-row"><button className="story-item" onClick={()=>setScreen('create-story')}><span className="story-ring own-story"><Avatar profile={profile} size="small"/><i>+</i></span><span>Votre story</span></button>{groupedStories.map(s=><button className="story-item" key={s.id} onClick={()=>void viewStory(stories.findIndex(x=>x.id===s.id))}><span className="story-ring"><Avatar profile={s.profile} size="small"/></span><span>{s.profile.username}</span></button>)}</div></section>
   <section className="messages-section"><div className="section-heading"><h1>Messages</h1><button aria-label="Actualiser" onClick={()=>void loadHome(user.id)}><RefreshCw size={18}/></button></div>
   {chats.length===0?<div className="empty-state"><MessageCircle size={34}/><strong>Aucune conversation</strong><span>Recherche un membre SAFARY pour commencer à discuter.</span><button className="gradient-button" onClick={()=>setSearchOpen(true)}>Trouver des membres</button></div>:<div className="conversation-list">{chats.map(c=><button className="conversation" key={c.id} onClick={()=>void openChat(c)}><Avatar profile={c.user}/><span className="conversation-copy"><span className="conversation-top"><strong>{c.user.username}</strong><time>{c.lastAt?timeLabel(c.lastAt):''}</time></span><span className="preview">{c.lastMessage}</span></span></button>)}</div>}</section>
   <nav className="bottom-nav"><button className="active" onClick={()=>setScreen('messages')}><MessageCircle/><span>Messages</span></button><button onClick={()=>setScreen('create-story')}><Plus/><span>Créer Story</span></button><button onClick={()=>setScreen('profile')}><UserRound/><span>Profil</span></button></nav></>}
  {screen==='chat'&&<div className="chat-screen"><header className="chat-header"><button onClick={()=>{setScreen('messages');setConversationId('')}} aria-label="Retour"><ArrowLeft/></button><Avatar profile={contact}/><div><strong>{contact?.username??'Discussion'}</strong><span>{contact?.display_name??''}</span></div><button className="push-right" aria-label="Profil" onClick={()=>setScreen('profile')}><InfoIcon/></button></header>
   <div className="chat-messages">{messages.length===0&&<p className="empty-chat">Démarre la conversation 👋</p>}{messages.map(m=><div className={'bubble '+(m.sender_id===user.id?'outgoing':'incoming')} key={m.id}>{m.message_type==='text'&&<span>{m.body}</span>}{m.attachments?.map(a=><div className="attachment-preview" key={a.id}>{a.mime_type.startsWith('image/')?<img src={a.url} alt={a.file_name}/>:a.mime_type.startsWith('audio/')?<audio controls src={a.url}/>:<a href={a.url} download={a.file_name}>{a.file_name}</a>}</div>)}<time>{timeLabel(m.created_at)}</time></div>)}</div>
   <form className="composer" onSubmit={sendMessage}><button type="button" aria-label="Joindre un fichier" onClick={()=>fileInputRef.current?.click()}><Plus/></button><input ref={fileInputRef} type="file" accept={CHAT_FILE_TYPES.join(',')} hidden onChange={e=>{const file=e.target.files?.[0];if(file)void uploadChatFile(file,file.type.startsWith('image/')?'image':'file');e.currentTarget.value=''}}/><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Écrire un message…" maxLength={10000}/><button type="button" aria-label={recording?'Arrêter le vocal':'Enregistrer un vocal'} onClick={()=>void toggleVoiceRecording()}>{recording?<Square/>:<Mic/>}</button><button className="send-button" type="submit" aria-label="Envoyer" disabled={!draft.trim()||busy}><Send/></button></form></div>}
  {screen==='create-story'&&<SubScreen title="Créer une Story" onBack={()=>setScreen('messages')}><div className="editor-card"><ImagePlus size={42}/><strong>Ajoute une photo ou une vidéo</strong><span>Ta story sera visible pendant 48 heures.</span><label className="gradient-button"><Camera size={18}/> Choisir un média<input type="file" accept={MIME_TYPES.join(',')} hidden onChange={e=>setStoryFile(e.target.files?.[0]??null)}/></label>{storyFile&&<span className="file-name">{storyFile.name}</span>}<input className="story-caption" placeholder="Ajouter une légende…" value={storyCaption} onChange={e=>setStoryCaption(e.target.value)} maxLength={300}/><button className="gradient-button" disabled={!storyFile||busy} onClick={()=>void publishStory()}>{busy?'Publication…':'Publier la Story'}</button></div></SubScreen>}
  {screen==='story-viewer'&&activeStory&&<div className="story-viewer"><header><button onClick={()=>setScreen('messages')}><X/></button><Avatar profile={activeStory.profile} size="small"/><strong>{activeStory.profile.username}</strong><time>{timeLabel(activeStory.created_at)}</time>{activeStory.user_id===user.id&&<button className="push-right" onClick={()=>void deleteStory()} aria-label="Supprimer"><Trash2/></button>}</header>{activeStory.media_type==='video'?<video src={activeStory.url} controls autoPlay playsInline/>:<img src={activeStory.url} alt={activeStory.caption||'Story SAFARY'}/>}<p>{activeStory.caption}</p><footer><button onClick={()=>setStoryIndex(i=>Math.max(0,i-1))} disabled={storyIndex===0}>Précédente</button><button onClick={()=>setStoryIndex(i=>Math.min(stories.length-1,i+1))} disabled={storyIndex>=stories.length-1}>Suivante</button></footer></div>}
  {screen==='story-viewer'&&!activeStory&&<SubScreen title="Story" onBack={()=>setScreen('messages')}><div className="empty-state">Aucune story disponible.</div></SubScreen>}
  {screen==='profile'&&<SubScreen title="Profil" onBack={()=>setScreen('messages')}><form className="profile-form" onSubmit={saveProfile}><Avatar profile={{...profile,avatar_url:avatarUrl||null,display_name:displayName}} size="large"/><label>URL de la photo de profil<input type="url" value={avatarUrl} onChange={e=>setAvatarUrl(e.target.value)} placeholder="https://…"/></label><label>Nom affiché<input value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={60}/></label><label>Nom utilisateur<input value={username} onChange={e=>setUsername(e.target.value)} minLength={3} maxLength={30}/></label><label>Biographie<textarea value={bio} onChange={e=>setBio(e.target.value)} maxLength={160} rows={3}/></label><button className="gradient-button full-width" disabled={busy}>Enregistrer le profil</button><button type="button" className="outline-button" onClick={()=>setScreen('settings')}><Settings size={17}/> Paramètres</button></form></SubScreen>}
  {screen==='settings'&&<SubScreen title="Paramètres" onBack={()=>setScreen('profile')}><div className="settings-list"><div className="settings-row"><span><strong>Statut en ligne</strong><small>Afficher ta présence aux autres.</small></span><input type="checkbox" checked={settings.online_status_visible} onChange={e=>void updateSetting('online_status_visible',e.target.checked)}/></div><div className="settings-row"><span><strong>Notifications</strong><small>Autoriser les notifications de SAFARY.</small></span><input type="checkbox" checked={settings.notifications_enabled} onChange={e=>void updateSetting('notifications_enabled',e.target.checked)}/></div><button onClick={()=>setScreen('profile')}>Modifier mon profil <ChevronRight/></button><button className="logout-row" onClick={()=>void signOut()}><LogOut size={18}/> Déconnexion</button><p className="settings-version">SAFARY · V1</p></div></SubScreen>}
  {searchOpen&&<div className="modal-backdrop" onClick={()=>setSearchOpen(false)}><div className="search-modal" onClick={e=>e.stopPropagation()}><header><h2>Trouver des membres</h2><button onClick={()=>setSearchOpen(false)}><X/></button></header><input autoFocus value={searchTerm} onChange={e=>void searchPeople(e.target.value)} placeholder="Rechercher par nom utilisateur…"/><div className="search-results">{searchResults.map(p=><button key={p.id} onClick={()=>void startConversation(p)} disabled={busy}><Avatar profile={p}/><span><strong>{p.username}</strong><small>{p.display_name}</small></span><ChevronRight/></button>)}</div>{searchTerm.length<2&&<small>Saisis au moins deux caractères.</small>}</div></div>}
 </>}
 </section><div className="connection-note">{session?'SAFARY · connecté':'SAFARY'}</div>{notice&&<button className="toast" onClick={()=>setNotice('')}>{notice}<X size={15}/></button>}</main>;
}

function InfoIcon(){return <MoreHorizontal/>}
function SubScreen({title,onBack,children}:{title:string;onBack:()=>void;children:React.ReactNode}){return <div className="sub-screen"><header className="sub-header"><button onClick={onBack} aria-label="Retour"><ArrowLeft/></button><h1>{title}</h1></header>{children}</div>}
