import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {ArrowLeft,Camera,ChevronRight,ImagePlus,LogOut,MessageCircle,Mic,MoreHorizontal,PencilLine,Plus,RefreshCw,Search,Send,Settings,Square,Trash2,UserRound,X} from 'lucide-react';
type Session={access_token:string};
type User={id:string};
import {isSupabaseConfigured,supabase} from './lib/supabase';

type Screen='messages'|'chat'|'create-story'|'profile'|'edit-profile'|'settings'|'auth'|'story-viewer';
type Profile={id:string;username:string;display_name:string;avatar_url:string|null;bio:string;cover_url?:string|null};
const fileToDataUrl=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Lecture du fichier impossible.'));reader.readAsDataURL(file)});
type Story={id:string;user_id:string;storage_path:string;media_type:'image'|'video';caption:string;created_at:string;expires_at:string;url:string;profile:Profile};
type ChatRow={id:string;user:Profile;lastMessage:string;lastAt:string};
type Attachment={id:string;message_id:string;storage_path:string;file_name:string;mime_type:string;size_bytes:number;url:string};
type Reaction={id:string;message_id:string;user_id:string;reaction:string};
type Message={id:string;conversation_id:string;sender_id:string;body:string;message_type:string;created_at:string;attachments?:Attachment[];reactions?:Reaction[];seenByPeer?:boolean};
const MIME_TYPES=['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'];
const MAX_FILE=50*1024*1024;
const CACHE_VERSION=2;
const DATA_CACHE_TTL_MS=12*60*60*1000;
const CACHE_PREFIX='safary:cache:v1:';
const readCache=<T,>(key:string,maxAgeMs=DATA_CACHE_TTL_MS):T|null=>{try{const raw=localStorage.getItem(CACHE_PREFIX+key);if(!raw)return null;const value=JSON.parse(raw);if(value.version!==CACHE_VERSION||Date.now()-value.savedAt>maxAgeMs){localStorage.removeItem(CACHE_PREFIX+key);return null}return value.data as T}catch{return null}};
const writeCache=(key:string,data:unknown)=>{try{localStorage.setItem(CACHE_PREFIX+key,JSON.stringify({version:CACHE_VERSION,savedAt:Date.now(),data}))}catch{try{Object.keys(localStorage).filter(k=>k.startsWith(CACHE_PREFIX)).slice(0,3).forEach(k=>localStorage.removeItem(k));localStorage.setItem(CACHE_PREFIX+key,JSON.stringify({version:CACHE_VERSION,savedAt:Date.now(),data}))}catch{}}};
const CHAT_FILE_TYPES=['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav'];
const initials=(value:string)=>value.trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()??'').join('')||'S';
const timeLabel=(value:string)=>{const date=new Date(value);if(Number.isNaN(date.getTime()))return '';return new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(date)};
function Avatar({profile,size='normal',online=false}:{profile?:Partial<Profile>|null;size?:'small'|'normal'|'large';online?:boolean}){return <span className={'avatar avatar-'+size+(online?' avatar-is-online':'')}>{profile?.avatar_url?<img src={profile.avatar_url} alt=""/>:initials(profile?.display_name||profile?.username||'i-tafa')}{online&&<i className="avatar-online-dot" aria-label="En ligne"/>}</span>}

export default function App(){
 const client=supabase;
 const [screen,setScreen]=useState<Screen>('auth');
 const [session,setSession]=useState<Session|null>(null);
 const [user,setUser]=useState<User|null>(null);
 const [profile,setProfile]=useState<Profile|null>(null);
 const [chats,setChats]=useState<ChatRow[]>([]);
 const [stories,setStories]=useState<Story[]>([]);
 const [storyViewers,setStoryViewers]=useState<Array<{username:string;display_name:string;viewed_at:string}>>([]);
 const [storyViewersOpen,setStoryViewersOpen]=useState(false);
 const [viewedProfile,setViewedProfile]=useState<Profile|null>(null);
 const [storyPreview,setStoryPreview]=useState('');
 const [messages,setMessages]=useState<Message[]>([]);
 const [conversationId,setConversationId]=useState('');
 const [realtimeConnected,setRealtimeConnected]=useState(false);
 const [presence,setPresence]=useState<Record<string,boolean>>({});
 const chatSocket=useRef<WebSocket|null>(null);
 const inboxSocket=useRef<WebSocket|null>(null);
 const presenceSocket=useRef<WebSocket|null>(null);
 const [contact,setContact]=useState<Profile|null>(null);
 const [storyIndex,setStoryIndex]=useState(0);
 const [draft,setDraft]=useState('');
 const [storyFile,setStoryFile]=useState<File|null>(null);
 const [chatFile,setChatFile]=useState<File|null>(null);
 const [chatFilePreview,setChatFilePreview]=useState('');
 const [storyCaption,setStoryCaption]=useState('');
 const [displayName,setDisplayName]=useState('');
 const [username,setUsername]=useState('');
 const [bio,setBio]=useState('');
 const [password,setPassword]=useState('');
 const [confirmPassword,setConfirmPassword]=useState('');
 const [age,setAge]=useState('');
 const [avatarFile,setAvatarFile]=useState<File|null>(null);
 const [coverFile,setCoverFile]=useState<File|null>(null);
 const [profileAvatarPreview,setProfileAvatarPreview]=useState('');
 const [profileCoverPreview,setProfileCoverPreview]=useState('');
 const [authMode,setAuthMode]=useState<'login'|'signup'>('login');
 const [signupStep,setSignupStep]=useState(1);
 const [signupAvatarPreview,setSignupAvatarPreview]=useState('');
 const [signupCoverPreview,setSignupCoverPreview]=useState('');
 const [searchOpen,setSearchOpen]=useState(false);
 const [searchTerm,setSearchTerm]=useState('');
 const [searchResults,setSearchResults]=useState<Profile[]>([]);
 const searchTimer=useRef<number|null>(null);
 const searchSequence=useRef(0);
 const [settings,setSettings]=useState({online_status_visible:true,notifications_enabled:true});
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [loading,setLoading]=useState(true);
 const [recording,setRecording]=useState(false);
 const [recordingPaused,setRecordingPaused]=useState(false);
 const [recordingSeconds,setRecordingSeconds]=useState(0);
 const discardRecording=useRef(false);
 const sendRecordingOnStop=useRef(false);
 const [activeMessage,setActiveMessage]=useState<Message|null>(null);
 const longPressTimer=useRef<number|null>(null);
 const recorderRef=useRef<MediaRecorder|null>(null);
 const recorderChunks=useRef<Blob[]>([]);
 const fileInputRef=useRef<HTMLInputElement|null>(null);
 const attachmentUrls=useRef(new Map<string,string>());
 useEffect(()=>()=>{attachmentUrls.current.forEach(url=>URL.revokeObjectURL(url));attachmentUrls.current.clear()},[]);
 useEffect(()=>{if(!recording||recordingPaused)return;const timer=window.setInterval(()=>setRecordingSeconds(value=>value+1),1000);return()=>window.clearInterval(timer)},[recording,recordingPaused]);

 const notify=(message:string)=>setNotice(message);
 const loadProfile=useCallback(async(uid:string)=>{
  if(!client)return;
  const cached=readCache<Profile>('profile:'+uid);if(cached){setProfile(cached);setDisplayName(cached.display_name??'');setUsername(cached.username??'');setBio(cached.bio??'')}
  const {data,error}=await client.from('profiles').select('id,username,display_name,avatar_url,bio,cover_url').eq('id',uid).maybeSingle();
  if(error){notify(error.message);return}
  if(data){let resolvedAvatar=data.avatar_url??'';let resolvedCover=data.cover_url??'';if(resolvedAvatar&&!resolvedAvatar.startsWith('http')){const signed=await client.storage.from('profile-media').createSignedUrl(resolvedAvatar,46800);resolvedAvatar=signed.data?.signedUrl??'';}if(resolvedCover&&!resolvedCover.startsWith('http')){const signed=await client.storage.from('profile-media').createSignedUrl(resolvedCover,46800);resolvedCover=signed.data?.signedUrl??'';}const p={...data,avatar_url:resolvedAvatar,cover_url:resolvedCover} as Profile;setProfile(p);writeCache('profile:'+uid,p);setDisplayName(p.display_name??'');setUsername(p.username??'');setBio(p.bio??'')}
  const pref=await client.from('user_settings').select('online_status_visible,notifications_enabled').eq('user_id',uid).maybeSingle();
  if(pref.data)setSettings({...pref.data,notifications_enabled:pref.data.notifications_enabled&&'Notification' in window&&Notification.permission==='granted'});
 },[client]);

 const loadHome=useCallback(async(uid:string)=>{
  if(!client)return;
  const cachedHome=readCache<{chats:ChatRow[];stories:Story[]}>('home:'+uid);if(cachedHome){setChats(cachedHome.chats);setStories(cachedHome.stories.filter(story=>new Date(story.expires_at).getTime()>Date.now()))}
  let nextChats:ChatRow[]=[];
  const [own,active]=await Promise.all([
   client.from('conversation_members').select('conversation_id').eq('user_id',uid),
   client.from('stories').select('id,user_id,storage_path,media_type,caption,created_at,expires_at').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(100)
  ]);
  if(own.error){notify(own.error.message);return}
  const ids=[...new Set((own.data??[]).map((x:any)=>x.conversation_id as string))];
  if(ids.length){
   const members=await client.from('conversation_members').select('conversation_id,user_id').in('conversation_id',ids);
   if(members.error)notify(members.error.message);
   const otherIds=[...new Set((members.data??[]).map((x:any)=>x.user_id as string).filter((x:string)=>x!==uid))];
   const people=otherIds.length?await client.from('profiles').select('id,username,display_name,avatar_url,bio').in('id',otherIds):{data:[],error:null};
   const signedPeople=await Promise.all((people.data??[]).map(async(p:any)=>{if(p.avatar_url&&!p.avatar_url.startsWith('http')){const signed=await client.storage.from('profile-media').createSignedUrl(p.avatar_url,46800);return {...p,avatar_url:signed.data?.signedUrl??null} as Profile}return p as Profile}));
   const byId=new Map(signedPeople.map((p:any)=>[p.id,p as Profile]));
   const last=await client.from('messages').select('id,conversation_id,body,created_at,sender_id').in('conversation_id',ids).order('created_at',{ascending:false}).limit(500);
   const latest=new Map<string,any>();
   for(const m of last.data??[])if(!latest.has(m.conversation_id))latest.set(m.conversation_id,m);
   const rows:ChatRow[]=[];
   for(const id of ids){const peer=(members.data??[]).find((m:any)=>m.conversation_id===id&&m.user_id!==uid);const p=peer?byId.get(peer.user_id):undefined;if(p){const m=latest.get(id);rows.push({id,user:p,lastMessage:m?.body??'Commencez à discuter',lastAt:m?.created_at??''})}}
   rows.sort((a,b)=>b.lastAt.localeCompare(a.lastAt));nextChats=rows;setChats(rows);
  }else{nextChats=[];setChats([])}
  if(active.error){notify(active.error.message);setStories([]);return}
  const raw=active.data??[];
  const storyUsers=[...new Set(raw.map((s:any)=>s.user_id as string))];
  const people=storyUsers.length?await client.from('profiles').select('id,username,display_name,avatar_url,bio').in('id',storyUsers):{data:[],error:null};
  const signedPeople=await Promise.all((people.data??[]).map(async(p:any)=>{if(p.avatar_url&&!p.avatar_url.startsWith('http')){const signed=await client.storage.from('profile-media').createSignedUrl(p.avatar_url,46800);return {...p,avatar_url:signed.data?.signedUrl??null} as Profile}return p as Profile}));
  const profileMap=new Map(signedPeople.map((p:any)=>[p.id,p as Profile]));
  const resolved=await Promise.all(raw.map(async(s:any)=>{
   const {data}=await client.storage.from('stories').createSignedUrl(s.storage_path,46800);
   const p=profileMap.get(s.user_id);return p&&data?.signedUrl?{...s,url:data.signedUrl,profile:p} as Story:null;
  }));
  const nextStories=resolved.filter(Boolean) as Story[];setStories(nextStories);writeCache('home:'+uid,{chats:nextChats,stories:nextStories});
 },[client]);

 useEffect(()=>{
  if(!client){setLoading(false);notify('Configuration Supabase manquante.');return}
  let alive=true;
  const restore=async()=>{
   const token=localStorage.getItem('safary_session');
   if(!token){if(alive){setLoading(false);setScreen('auth')}return}
   const {data,error}=await client.functions.invoke('safary-auth',{body:{action:'me'}});
   if(!alive)return;
   if(error||!data?.account){localStorage.removeItem('safary_session');setSession(null);setUser(null);setScreen('auth')}
   else{setSession({access_token:token});setUser({id:data.account.id});setProfile(data.account);setDisplayName(data.account.display_name??'');setUsername(data.account.username??'');setBio(data.account.bio??'')}
   setLoading(false);
  };
  void restore();
  return()=>{alive=false};
 },[client]);

 useEffect(()=>{
  if(!client||!user)return;
  let active=true;setScreen('messages');
  void Promise.all([loadProfile(user.id),loadHome(user.id)]).then(()=>{if(!active)return});
  return()=>{active=false};
 },[client,user,loadProfile,loadHome]);

 const loadMessages=useCallback(async(id:string,peerId?:string)=>{
  if(!client||!user)return;
  const cacheKey='messages:'+id;const cachedMessages=readCache<Message[]>(cacheKey);if(cachedMessages)setMessages(cachedMessages);
  const {data,error}=await client.from('messages').select('id,conversation_id,sender_id,body,message_type,created_at').eq('conversation_id',id).order('created_at',{ascending:false}).limit(100);
  if(error){notify(error.message);return}
  const allRows=((data??[]) as Message[]).reverse();const ids=allRows.map(m=>m.id);
  const [hiddenResult,reactionResult]=ids.length?await Promise.all([client.from('message_user_hides').select('message_id').eq('user_id',user?.id??'').in('message_id',ids),client.from('message_reactions').select('id,message_id,user_id,reaction').in('message_id',ids)]):[{data:[],error:null},{data:[],error:null}];
  const activePeerId=peerId??contact?.id;
  if(activePeerId&&ids.length){const unread=allRows.filter(m=>m.sender_id!==user?.id).map(m=>({message_id:m.id,user_id:user.id}));if(unread.length){const written=await client.from('message_receipts').upsert(unread,{onConflict:'message_id,user_id',ignoreDuplicates:true});if(!written.error&&chatSocket.current?.readyState===WebSocket.OPEN)chatSocket.current.send(JSON.stringify({type:'sync'}))}}
  const receiptResult=ids.length&&activePeerId?await client.from('message_receipts').select('message_id').eq('user_id',activePeerId).in('message_id',ids):{data:[],error:null};
  const seenIds=new Set((receiptResult.data??[]).map((x:any)=>x.message_id));
  const hidden=new Set((hiddenResult.data??[]).map((x:any)=>x.message_id));const rows=allRows.filter(m=>!hidden.has(m.id));
  const result=ids.length?await client.from('message_attachments').select('id,message_id,storage_path,file_name,mime_type,size_bytes').in('message_id',ids):{data:[],error:null};
  if(result.error)notify(result.error.message);
  const downloadedAttachments=await Promise.all((result.data??[]).map(async(item:any)=>{
   let url=attachmentUrls.current.get(item.storage_path);
   if(!url){
    let blob:Blob|null=null;
    const cacheName='safary-media-v1-'+(user?.id??'guest');
    const cacheKey=new Request(new URL('/__safary_media__/'+encodeURIComponent(item.storage_path),window.location.origin).toString());
    try{if('caches' in window){const cache=await caches.open(cacheName);const hit=await cache.match(cacheKey);if(hit){const cachedAt=Number(hit.headers.get('x-safary-cached-at')||0);if(cachedAt>0&&Date.now()-cachedAt<=DATA_CACHE_TTL_MS)blob=await hit.blob();else await cache.delete(cacheKey)}}}catch{}
    if(!blob){const downloaded=await client.storage.from('message-attachments').download(item.storage_path);if(downloaded.data){blob=downloaded.data;try{if('caches' in window){const cache=await caches.open(cacheName);await cache.put(cacheKey,new Response(blob,{headers:{'Content-Type':item.mime_type,'Cache-Control':'private, max-age=43200','x-safary-cached-at':String(Date.now())}}))}}catch{}}}
    if(blob){const audioBlob=item.mime_type.startsWith('audio/')?new Blob([blob],{type:item.mime_type}):blob;url=URL.createObjectURL(audioBlob);attachmentUrls.current.set(item.storage_path,url)}
   }
   return url?{...item,url} as Attachment:null;
  }));
  const byMessage=new Map<string,Attachment[]>();for(const attachment of downloadedAttachments){if(!attachment)continue;const list=byMessage.get(attachment.message_id)??[];list.push(attachment);byMessage.set(attachment.message_id,list)}
  const nextMessages=rows.map(m=>({...m,attachments:byMessage.get(m.id)??[],reactions:(reactionResult.data??[]).filter((x:any)=>x.message_id===m.id) as Reaction[],seenByPeer:m.sender_id===user?.id&&seenIds.has(m.id)}));setMessages(nextMessages);writeCache(cacheKey,nextMessages.map(({attachments,...m})=>m));
 },[client,user,contact]);
 const openChat=useCallback(async(row:ChatRow)=>{
  setContact(row.user);setConversationId(row.id);setScreen('chat');setMessages([]);await loadMessages(row.id,row.user.id);
 },[loadMessages]);

 useEffect(()=>{
  if(!client||!user)return;
  let stopped=false;let retryTimer=0;let retryDelay=1000;
  const connectInbox=()=>{
   if(stopped||document.visibilityState!=='visible'||!navigator.onLine)return;
   const token=localStorage.getItem('safary_session');if(!token)return;
   const scheme=window.location.protocol==='https:'?'wss:':'ws:';
   const socket=new WebSocket(scheme+'//'+window.location.host+'/realtime/inbox/'+user.id,['safary.v1','session.'+token]);
   inboxSocket.current=socket;
   socket.onmessage=event=>{try{const payload=JSON.parse(String(event.data));if(payload.type==='inbox-sync'&&payload.actorId!==user.id){void loadHome(user.id);if(settings.notifications_enabled&&document.hidden&&'Notification' in window&&Notification.permission==='granted'){void (async()=>{const {data}=await client.from('messages').select('id,body,sender_id,created_at').eq('conversation_id',payload.conversationId).neq('sender_id',user.id).order('created_at',{ascending:false}).limit(1).maybeSingle();if(!data)return;const {data:sender}=await client.from('profiles').select('username').eq('id',data.sender_id).maybeSingle();new Notification(sender?.username??'Nouveau message',{body:data.body||'Tu as reçu une pièce jointe.',tag:'i-tafa-'+data.id})})()}}else if(payload.type==='presence')setPresence(prev=>({...prev,[payload.userId]:!!payload.online}));else if(payload.type==='presence-snapshot'){setPresence(prev=>{const next={...prev};for(const item of payload.users??[])next[item.userId]=!!item.online;return next})}else if(payload.type==='activity'){void loadHome(user.id);if(screen==='chat'&&conversationId)void loadMessages(conversationId)}}catch{}};
   socket.onerror=()=>socket.close();
   socket.onclose=()=>{if(inboxSocket.current===socket)inboxSocket.current=null;if(!stopped){retryTimer=window.setTimeout(connectInbox,retryDelay);retryDelay=Math.min(retryDelay*2,30000)}};
   socket.onopen=()=>{retryDelay=1000};
  };
  connectInbox();
  const onVisible=()=>{if(document.visibilityState==='visible'&&(!inboxSocket.current||inboxSocket.current.readyState>1))connectInbox()};
  document.addEventListener('visibilitychange',onVisible);window.addEventListener('online',onVisible);
  return()=>{stopped=true;window.clearTimeout(retryTimer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('online',onVisible);const socket=inboxSocket.current;inboxSocket.current=null;if(socket){socket.onclose=null;socket.close()}};
 },[client,user,loadHome,settings.notifications_enabled]);

 useEffect(()=>{
  if(!client||!user||!settings.online_status_visible){setPresence(prev=>({...prev,[user?.id??'']:false}));return}
  let stopped=false;let retryTimer=0;let heartbeatTimer=0;let delay=1000;
  const connect=()=>{
   if(stopped||document.visibilityState!=='visible'||!navigator.onLine)return;
   const token=localStorage.getItem('safary_session');if(!token)return;
   const scheme=window.location.protocol==='https:'?'wss:':'ws:';
   const socket=new WebSocket(scheme+'//'+window.location.host+'/realtime/presence/'+user.id,['safary.v1','session.'+token]);
   presenceSocket.current=socket;
   socket.onopen=()=>{delay=1000;heartbeatTimer=window.setInterval(()=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'heartbeat'}))},25000)};
   socket.onerror=()=>socket.close();
   socket.onclose=()=>{window.clearInterval(heartbeatTimer);if(presenceSocket.current===socket)presenceSocket.current=null;if(!stopped){retryTimer=window.setTimeout(connect,delay);delay=Math.min(delay*2,30000)}};
  };
  connect();
  const onVisible=()=>{if(document.visibilityState==='visible'){if(!presenceSocket.current||presenceSocket.current.readyState>1)connect()}else{const socket=presenceSocket.current;presenceSocket.current=null;if(socket){socket.onclose=null;socket.close()}}};
  document.addEventListener('visibilitychange',onVisible);window.addEventListener('online',onVisible);
  return()=>{stopped=true;window.clearTimeout(retryTimer);window.clearInterval(heartbeatTimer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('online',onVisible);const socket=presenceSocket.current;presenceSocket.current=null;if(socket){socket.onclose=null;socket.close()}};
 },[client,user,settings.online_status_visible]);

 useEffect(()=>{
  if(!client||!conversationId||screen!=='chat'||!user){setRealtimeConnected(false);return}
  let stopped=false;let retryTimer=0;let retryDelay=1000;let fallbackTimer=0;let running=false;
  const connect=()=>{
   if(stopped||document.visibilityState!=='visible'||!navigator.onLine)return;
   const token=localStorage.getItem('safary_session');if(!token)return;
   const scheme=window.location.protocol==='https:'?'wss:':'ws:';
   const socket=new WebSocket(scheme+'//'+window.location.host+'/realtime/chat/'+conversationId,['safary.v1','session.'+token]);
   chatSocket.current=socket;
   socket.onopen=()=>{if(stopped){socket.close();return}retryDelay=1000;setRealtimeConnected(true);void loadMessages(conversationId)};
   socket.onmessage=event=>{try{const payload=JSON.parse(String(event.data));if(payload.type==='sync'&&payload.conversationId===conversationId&&payload.actorId!==user.id&&!running){running=true;void loadMessages(conversationId).finally(()=>{running=false})}}catch{}};
   socket.onerror=()=>socket.close();
   socket.onclose=()=>{if(chatSocket.current===socket)chatSocket.current=null;setRealtimeConnected(false);if(!stopped){retryTimer=window.setTimeout(connect,retryDelay);retryDelay=Math.min(retryDelay*2,30000)}};
  };
  connect();
  const onVisible=()=>{if(document.visibilityState==='visible'){if(!chatSocket.current||chatSocket.current.readyState>1)connect();else if(chatSocket.current.readyState===1)void loadMessages(conversationId)}};
  document.addEventListener('visibilitychange',onVisible);window.addEventListener('online',onVisible);
  return()=>{stopped=true;window.clearTimeout(retryTimer);window.clearInterval(fallbackTimer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('online',onVisible);const socket=chatSocket.current;chatSocket.current=null;if(socket){socket.onclose=null;socket.close()}setRealtimeConnected(false)};
 },[client,conversationId,screen,user,loadMessages]);

 useEffect(()=>{
  if(!client||!conversationId||screen!=='chat'||realtimeConnected)return;
  let running=false;const refresh=async()=>{if(running||document.visibilityState!=='visible'||!navigator.onLine)return;running=true;try{await loadMessages(conversationId)}finally{running=false}};
  const timer=window.setInterval(()=>void refresh(),60000);
  return()=>window.clearInterval(timer);
 },[client,conversationId,screen,realtimeConnected,loadMessages]);

 const broadcastChatSync=()=>{const socket=chatSocket.current;if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'sync'}))};
 const broadcastAppUpdate=()=>{const socket=presenceSocket.current;if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'activity'}))};

 const sendMessage=async(e:FormEvent)=>{
  e.preventDefault();if(chatFile){const sent=await uploadChatFile(chatFile,chatFile.type.startsWith('image/')?'image':'file');if(sent){setChatFile(null);setChatFilePreview('')}return}const body=draft.trim();if(!client||!user||!conversationId||!body)return;
  setDraft('');const {data,error}=await client.from('messages').insert({conversation_id:conversationId,sender_id:user.id,body,message_type:'text'}).select('id,conversation_id,sender_id,body,message_type,created_at').single();
  if(error){setDraft(body);notify(error.message);return}
  setMessages(prev=>{const next=prev.some(m=>m.id===data.id)?prev:[...prev,data as Message];writeCache('messages:'+conversationId,next.map(({attachments,...m})=>m));return next});broadcastChatSync();void loadHome(user.id);
 };

 const uploadChatFile=async(file:File,kind:'image'|'file'|'voice'='file')=>{
  if(!client||!user||!conversationId)return;
  if(!CHAT_FILE_TYPES.includes(file.type)){notify('Type de fichier non accepté.');return}
  if(file.size>MAX_FILE){notify('Le fichier dépasse la limite de 50 Mo.');return}
  setBusy(true);
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=conversationId+'/'+user.id+'/'+crypto.randomUUID()+'-'+safeName;
  const uploaded=await client.storage.from('message-attachments').upload(path,file,{contentType:file.type,upsert:false});
  if(uploaded.error){notify(uploaded.error.message);setBusy(false);return false}
  const message=await client.from('messages').insert({conversation_id:conversationId,sender_id:user.id,body:file.name.slice(0,500),message_type:kind}).select('id').single();
  if(message.error){await client.storage.from('message-attachments').remove([path]);notify(message.error.message);setBusy(false);return false}
  const attachment=await client.from('message_attachments').insert({message_id:message.data.id,storage_path:path,file_name:file.name.slice(0,255),mime_type:file.type,size_bytes:file.size});
  if(attachment.error){await client.from('messages').delete().eq('id',message.data.id);await client.storage.from('message-attachments').remove([path]);notify(attachment.error.message);setBusy(false);return false}
  else{await loadMessages(conversationId);broadcastChatSync();await loadHome(user.id)}
  setBusy(false);return true;
 };
 const formatVoiceTime=(seconds:number)=>String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 const finishVoiceRecording=(send:boolean)=>{
  const recorder=recorderRef.current;if(!recorder||recorder.state==='inactive')return;
  discardRecording.current=!send;sendRecordingOnStop.current=send;
  if(recorder.state==='paused')recorder.resume();
  recorder.stop();
 };
 const toggleVoicePause=()=>{
  const recorder=recorderRef.current;if(!recorder)return;
  if(recorder.state==='recording'){recorder.pause();setRecordingPaused(true)}
  else if(recorder.state==='paused'){recorder.resume();setRecordingPaused(false)}
 };
 const toggleVoiceRecording=async()=>{
  if(recording){finishVoiceRecording(true);return}
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){notify('Ton navigateur ne permet pas les messages vocaux.');return}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
   const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
   const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);recorderChunks.current=[];discardRecording.current=false;sendRecordingOnStop.current=false;setRecordingSeconds(0);setRecordingPaused(false);
   recorder.ondataavailable=e=>{if(e.data.size)recorderChunks.current.push(e.data)};
   recorder.onstop=async()=>{
    stream.getTracks().forEach(track=>track.stop());setRecording(false);setRecordingPaused(false);
    const shouldSend=sendRecordingOnStop.current&&!discardRecording.current;sendRecordingOnStop.current=false;
    if(!shouldSend){recorderChunks.current=[];return}
    const type=(recorder.mimeType||'audio/webm').split(';')[0];const ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';const blob=new Blob(recorderChunks.current,{type});recorderChunks.current=[];
    if(!blob.size){notify('Aucun son n’a été enregistré. Réessaie.');return}
    const file=new File([blob],'vocal-'+Date.now()+'.'+ext,{type});await uploadChatFile(file,'voice');
   };
   recorderRef.current=recorder;recorder.start(250);setRecording(true);
  }catch(error){notify(error instanceof Error?error.message:'Impossible d’accéder au microphone.')}
 };
 const searchPeople=async(term:string)=>{
  setSearchTerm(term);const sequence=++searchSequence.current;
  if(searchTimer.current!==null)window.clearTimeout(searchTimer.current);
  if(!client||term.trim().length<2){setSearchResults([]);return}
  const normalized=term.trim().toLowerCase();
  const cached=readCache<Profile[]>('search:'+normalized);if(cached)setSearchResults(cached);
  searchTimer.current=window.setTimeout(()=>{void (async()=>{
   const {data,error}=await client.from('profiles').select('id,username,display_name,avatar_url,bio').ilike('username','%'+normalized.replace(/[%_]/g,'')+'%').neq('id',user?.id??'').limit(12);
   if(sequence!==searchSequence.current)return;
   if(error){notify(error.message);return}
   const resolved=await Promise.all((data??[]).map(async(p:any)=>{if(p.avatar_url&&!p.avatar_url.startsWith('http')){const signed=await client.storage.from('profile-media').createSignedUrl(p.avatar_url,46800);return {...p,avatar_url:signed.data?.signedUrl??null} as Profile}return p as Profile}));
   if(sequence===searchSequence.current){setSearchResults(resolved);writeCache('search:'+normalized,resolved)}
  })()},220);
 };
 const startConversation=async(person:Profile)=>{
  if(!client||!user)return;setBusy(true);
  const {data,error}=await client.rpc('create_direct_conversation',{p_other_user:person.id});
  if(error){notify(error.message);setBusy(false);return}
  const id=data as string;setSearchOpen(false);setSearchTerm('');setSearchResults([]);setBusy(false);
  await loadHome(user.id);await openChat({id,user:person,lastMessage:'',lastAt:''});
 };

 const nextSignupStep=()=>{
  setNotice('');
  if(signupStep===1&&username.trim().length<3){notify('Choisis un pseudo de 3 caractères minimum.');return}
  if(signupStep===2&&(password.length<10||password!==confirmPassword)){notify(password.length<10?'Le mot de passe doit contenir au moins 10 caractères.':'Les mots de passe ne correspondent pas.');return}
  if(signupStep===3&&(!Number.isInteger(Number(age))||Number(age)<1||Number(age)>120)){notify('Indique un âge valide.');return}
  setSignupStep(step=>Math.min(4,step+1));
 };
 const previousSignupStep=()=>{setNotice('');setSignupStep(step=>Math.max(1,step-1))};
 const submitAuth=async(e:FormEvent)=>{
  e.preventDefault();if(!client)return;setBusy(true);setNotice('');
  try{
   if(authMode==='login'){
    const {data,error}=await client.functions.invoke('safary-auth',{body:{action:'login',username:username.trim(),password}});
    if(error)throw new Error(data?.error??error.message);
    if(!data?.session?.token||!data?.account?.id)throw new Error(data?.error??'Connexion impossible.');
    localStorage.setItem('safary_session',data.session.token);
    setSession({access_token:data.session.token});setUser({id:data.account.id});setProfile(data.account);setScreen('messages');notify('Bienvenue sur i-tafa.');
   }else{
    if(username.trim().length<3)throw new Error('Le pseudo doit contenir au moins 3 caractères.');
    if(password.length<10)throw new Error('Le mot de passe doit contenir au moins 10 caractères.');
    if(password!==confirmPassword)throw new Error('Les mots de passe ne correspondent pas.');
    if(!Number.isInteger(Number(age))||Number(age)<1||Number(age)>120)throw new Error('Âge invalide.');
    if(!avatarFile||!coverFile)throw new Error('Ajoute ta photo de profil et ta photo de couverture.');
    if(!['image/jpeg','image/png','image/webp'].includes(avatarFile.type)||!['image/jpeg','image/png','image/webp'].includes(coverFile.type))throw new Error('Les photos doivent être au format JPG, PNG ou WebP.');
    if(avatarFile.size>1536*1024||coverFile.size>1536*1024)throw new Error('Chaque photo doit faire moins de 1,5 Mo.');
    const [avatarDataUrl,coverDataUrl]=await Promise.all([fileToDataUrl(avatarFile),fileToDataUrl(coverFile)]);
    const {data,error}=await client.functions.invoke('safary-auth',{body:{action:'signup',username:username.trim(),password,confirmPassword,age:Number(age),avatarDataUrl,coverDataUrl}});
    if(error)throw new Error(data?.error??error.message);
    if(!data?.session?.token||!data?.account?.id)throw new Error(data?.error??'Création du compte impossible.');
    localStorage.setItem('safary_session',data.session.token);
    setSession({access_token:data.session.token});setUser({id:data.account.id});setProfile(data.account);setScreen('messages');notify('Compte créé. Bienvenue sur i-tafa.');
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
  if(result.error){await client.storage.from('stories').remove([path]);notify(result.error.message)}else{setStoryFile(null);setStoryPreview('');setStoryCaption('');await loadHome(user.id);broadcastAppUpdate();setScreen('messages');notify('Story publiée. Elle disparaîtra après 48 heures.')}
  setBusy(false);
 };

 const openProfile=async(person:Partial<Profile>)=>{
  if(!client||!person.id)return;
  if(person.id===user?.id){setViewedProfile(null);setScreen('profile');return}
  const cached=readCache<Profile>('profile:'+person.id);if(cached){setViewedProfile(cached);setScreen('profile')}
  const {data,error}=await client.from('profiles').select('id,username,display_name,avatar_url,bio,cover_url').eq('id',person.id).maybeSingle();
  if(error||!data){notify(error?.message??'Profil introuvable.');return}
  let avatar=data.avatar_url??'';let cover=data.cover_url??'';
  if(avatar&&!avatar.startsWith('http')){const signed=await client.storage.from('profile-media').createSignedUrl(avatar,46800);avatar=signed.data?.signedUrl??''}
  if(cover&&!cover.startsWith('http')){const signed=await client.storage.from('profile-media').createSignedUrl(cover,46800);cover=signed.data?.signedUrl??''}
  const resolved={...data,avatar_url:avatar,cover_url:cover} as Profile;setViewedProfile(resolved);writeCache('profile:'+person.id,resolved);setScreen('profile');
 };
 const showStory=async(story:Story)=>{const index=stories.findIndex(item=>item.id===story.id);if(index<0)return;setStoryIndex(index);setStoryViewersOpen(false);setScreen('story-viewer');if(story.user_id!==user?.id&&client&&user){const {error}=await client.from('story_views').upsert({story_id:story.id,viewer_id:user.id},{onConflict:'story_id,viewer_id',ignoreDuplicates:true});if(error)notify('Impossible d’enregistrer la vue de cette story.')}};
 const openStoryViewers=async()=>{if(!client||!user||!activeStory||activeStory.user_id!==user.id)return;const {data,error}=await client.from('story_views').select('viewer_id,viewed_at').eq('story_id',activeStory.id).order('viewed_at',{ascending:false});if(error){notify('Impossible de charger les vues.');return}const ids=[...new Set((data??[]).map((v:any)=>v.viewer_id as string))];const people=ids.length?await client.from('profiles').select('id,username,display_name').in('id',ids):{data:[],error:null};if(people.error){notify('Impossible de charger les profils des visiteurs.');return}const byId=new Map<string,any>((people.data??[]).map((p:any)=>[p.id,p] as [string,any]));setStoryViewers((data??[]).map((v:any)=>({username:byId.get(v.viewer_id)?.username??'Membre',display_name:byId.get(v.viewer_id)?.display_name??'',viewed_at:v.viewed_at})));setStoryViewersOpen(true)};
  const clearLongPress=()=>{if(longPressTimer.current!==null){window.clearTimeout(longPressTimer.current);longPressTimer.current=null}};
  const beginMessagePress=(message:Message)=>{clearLongPress();longPressTimer.current=window.setTimeout(()=>setActiveMessage(message),550)};
  const reactToMessage=async(message:Message,emoji:string)=>{if(!client||!user)return;const existing=message.reactions?.find(r=>r.user_id===user.id);const result=existing?.reaction===emoji?await client.from('message_reactions').delete().eq('id',existing.id):await client.from('message_reactions').upsert({message_id:message.id,user_id:user.id,reaction:emoji},{onConflict:'message_id,user_id'});if(result.error)notify(result.error.message);else{await loadMessages(conversationId);broadcastChatSync()}setActiveMessage(null)};
  const deleteMessage=async(message:Message,scope:'me'|'everyone')=>{if(!client||!user)return;setBusy(true);try{if(scope==='me'){const {error}=await client.from('message_user_hides').upsert({message_id:message.id,user_id:user.id},{onConflict:'message_id,user_id'});if(error)throw error}else{if(message.sender_id!==user.id)throw new Error('Tu peux supprimer pour tout le monde uniquement un message que tu as envoyé.');const files=message.attachments??[];if(files.length){const removed=await client.storage.from('message-attachments').remove(files.map(f=>f.storage_path));if(removed.error)throw removed.error;const deletedFiles=await client.from('message_attachments').delete().eq('message_id',message.id);if(deletedFiles.error)throw deletedFiles.error}const deleted=await client.from('messages').delete().eq('id',message.id).eq('sender_id',user.id);if(deleted.error)throw deleted.error}await loadMessages(conversationId);broadcastChatSync();await loadHome(user.id);notify(scope==='me'?'Message supprimé de ta conversation.':'Message supprimé pour tout le monde.')}catch(error){notify(error instanceof Error?error.message:'Suppression impossible.')}finally{setBusy(false);setActiveMessage(null)}};
  const deleteStory=async()=>{
  const story=stories[storyIndex];if(!client||!user||!story||story.user_id!==user.id)return;
  setBusy(true);const file=await client.storage.from('stories').remove([story.storage_path]);
  if(file.error){notify(file.error.message);setBusy(false);return}
  const row=await client.from('stories').delete().eq('id',story.id);
  if(row.error)notify(row.error.message);else{await loadHome(user.id);broadcastAppUpdate();setScreen('messages');notify('Story supprimée.')}
  setBusy(false);
 };
 const saveProfile=async(e:FormEvent)=>{
  e.preventDefault();if(!client||!user)return;
  if(!/^[a-z0-9_.]{3,30}$/i.test(username.trim())){notify('Le nom utilisateur doit contenir 3 à 30 caractères (lettres, chiffres, _ ou .).');return}
  if(avatarFile&&(!['image/jpeg','image/png','image/webp'].includes(avatarFile.type)||avatarFile.size>1536*1024)){notify('La photo de profil doit être JPG, PNG ou WebP et faire moins de 1,5 Mo.');return}
  if(coverFile&&(!['image/jpeg','image/png','image/webp'].includes(coverFile.type)||coverFile.size>1536*1024)){notify('La photo de couverture doit être JPG, PNG ou WebP et faire moins de 1,5 Mo.');return}
  setBusy(true);
  try{
   const [avatarDataUrl,coverDataUrl]=await Promise.all([avatarFile?fileToDataUrl(avatarFile):Promise.resolve(undefined),coverFile?fileToDataUrl(coverFile):Promise.resolve(undefined)]);
   const {data,error}=await client.functions.invoke('safary-auth',{body:{action:'profile-update',username:username.trim().toLowerCase(),displayName:displayName.trim(),bio,avatarDataUrl,coverDataUrl}});
   if(error)throw new Error(data?.error??error.message);
   if(!data?.account)throw new Error('Le profil n’a pas pu être actualisé.');
   const saved=data.account as Profile;
   setProfile(saved);writeCache('profile:'+user.id,saved);setAvatarFile(null);setCoverFile(null);broadcastAppUpdate();
   setProfileAvatarPreview('');setProfileCoverPreview('');
   notify('Profil mis à jour.');
  }catch(error){notify(error instanceof Error?error.message:'Impossible de mettre à jour le profil.')}
  finally{setBusy(false)}
 };
 const updateSetting=async(key:'online_status_visible'|'notifications_enabled',value:boolean)=>{
  if(!client||!user)return;
  if(key==='notifications_enabled'&&value){if(!('Notification' in window)){notify('Les notifications du navigateur ne sont pas disponibles sur cet appareil.');return}const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;if(permission!=='granted'){notify('Autorise les notifications dans les réglages du navigateur pour les activer.');return}}
  const next={...settings,[key]:value};setSettings(next);
  const {error}=await client.from('user_settings').update({...next,updated_at:new Date().toISOString()}).eq('user_id',user.id);
  if(error){setSettings(settings);notify(error.message)}else{broadcastAppUpdate()}if(!error&&key==='online_status_visible'&&!value){setPresence({});notify('Ton statut en ligne est masqué.')}else if(!error&&key==='online_status_visible'&&value){notify('Ton statut en ligne est activé.')} 
 };
 const deleteAccount=async()=>{if(!client||!user)return;if(!window.confirm('Supprimer définitivement ton compte i-tafa, tes Stories, tes conversations et tes fichiers ? Cette action est irréversible.'))return;setBusy(true);try{const {data,error}=await client.functions.invoke('safary-auth',{body:{action:'delete-account'}});if(error||!data?.account_deleted)throw new Error(data?.error??error?.message??'La suppression du compte a échoué.');const uid=user.id;localStorage.removeItem('safary_session');Object.keys(localStorage).filter(k=>k.startsWith(CACHE_PREFIX)).forEach(k=>localStorage.removeItem(k));if('caches' in window)await caches.delete('safary-media-v1-'+uid);setSession(null);setUser(null);setProfile(null);setContact(null);setConversationId('');setChats([]);setStories([]);setMessages([]);setPresence({});setScreen('auth');notify('Ton compte et ses données ont été supprimés.')}catch(error){notify(error instanceof Error?error.message:'Suppression du compte impossible.')}finally{setBusy(false)}};
 const signOut=async()=>{if(client){const currentUserId=user?.id;const {error}=await client.functions.invoke('safary-auth',{body:{action:'logout'}});if(error)notify(error.message);localStorage.removeItem('safary_session');Object.keys(localStorage).filter(k=>k.startsWith(CACHE_PREFIX)).forEach(k=>localStorage.removeItem(k));if(currentUserId&&'caches' in window)await caches.delete('safary-media-v1-'+currentUserId);setScreen('auth');setSession(null);setUser(null);setProfile(null);setContact(null);setConversationId('');setViewedProfile(null);setChats([]);setStories([]);setMessages([]);setPresence({});setActiveMessage(null);setStoryViewersOpen(false)}};

 const groupedStories=useMemo(()=>{const map=new Map<string,Story[]>();for(const s of stories){const list=map.get(s.user_id)??[];list.push(s);map.set(s.user_id,list)}return [...map.values()].map(items=>items[0])},[stories]);
 const activeStory=stories[storyIndex];
 useEffect(()=>()=>{stories.forEach(story=>{if(story.url.startsWith('blob:'))URL.revokeObjectURL(story.url)})},[stories]);
 if(loading)return <main className="app-shell"><section className="phone-frame loading-state"><span className="brand"><img src="https://raw.githubusercontent.com/Aora-group-entreprise/safary/main/FB_IMG_17947533283908349.jpg" alt="" />i-tafa</span><p>Chargement sécurisé…</p></section></main>;

 return <main className="app-shell"><div className="ambient ambient-one"/><div className="ambient ambient-two"/><section className="phone-frame">
 {!isSupabaseConfigured&&<div className="setup-banner">Connexion i-tafa indisponible : vérifie la configuration Supabase.</div>}
 {(!session||!user||screen==='auth')&&<div className="auth-screen">
  <div className="auth-brand"><span className="brand-line"><img src="https://raw.githubusercontent.com/Aora-group-entreprise/safary/main/FB_IMG_17947533283908349.jpg" alt="" />i-tafa</span><span>Le lien qui nous rapproche.</span></div>
  {authMode==='signup'?<form className="form-card signup-card" onSubmit={e=>{e.preventDefault();if(signupStep===4)void submitAuth(e);else nextSignupStep()}}>
   <div className="signup-heading"><span className="signup-eyebrow">REJOINS LA COMMUNAUTÉ</span><h1>Créer ton compte</h1><p>Quelques étapes simples pour commencer.</p></div>
   <div className="signup-progress" aria-label={`Étape ${signupStep} sur 4`}>{[1,2,3,4].map(n=><span key={n} className={n<=signupStep?'completed':''}/>)}</div>
   <div className="signup-step-caption"><span>ÉTAPE 0{signupStep} / 04</span><strong>{['Ton identité','Sécurise ton compte','Fais connaissance','Personnalise ton profil'][signupStep-1]}</strong></div>
   {signupStep===1&&<div className="signup-step-content"><div className="signup-step-icon"><UserRound/></div><label>Nom d'utilisateur<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="ex. rakoto" minLength={3} maxLength={30} autoComplete="username" autoFocus required/></label><small>Ton pseudo sera visible par les autres membres. Tu pourras le modifier plus tard.</small></div>}
   {signupStep===2&&<div className="signup-step-content"><div className="signup-step-icon"><Settings/></div><label>Mot de passe<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} minLength={10} placeholder="10 caractères minimum" autoFocus required/></label><label>Confirme ton mot de passe<input type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} minLength={10} placeholder="Répète ton mot de passe" required/></label><small>Utilise au moins 10 caractères et garde ton mot de passe confidentiel.</small></div>}
   {signupStep===3&&<div className="signup-step-content"><div className="signup-step-icon"><UserRound/></div><label>Quel âge as-tu ?<input type="number" inputMode="numeric" min="1" max="120" value={age} onChange={e=>setAge(e.target.value)} placeholder="Ton âge" autoFocus required/></label><small>Cette information nous aide à adapter l'expérience i-tafa.</small></div>}
   {signupStep===4&&<div className="signup-step-content signup-photo-step">
    <p className="signup-photo-intro">Ajoute tes photos pour que tes amis puissent te reconnaître.</p>
    <div className="signup-cover-preview" style={{backgroundImage:signupCoverPreview?`url("${signupCoverPreview}")`:undefined}}>{!signupCoverPreview&&<ImagePlus/>}<label>Photo de couverture (PDC)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async e=>{const f=e.target.files?.[0];if(f){setCoverFile(f);setSignupCoverPreview(await fileToDataUrl(f))}}}/></label></div>
    <div className="signup-avatar-row"><div className="signup-avatar-preview">{signupAvatarPreview?<img src={signupAvatarPreview} alt="Aperçu de ta photo de profil"/>:<UserRound/>}</div><label>Photo de profil (PDP)<span>Format JPG, PNG ou WebP · 1,5 Mo max</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={async e=>{const f=e.target.files?.[0];if(f){setAvatarFile(f);setSignupAvatarPreview(await fileToDataUrl(f))}}}/></label></div>
    <div className="signup-review"><strong>@{username}</strong><span>{age} ans · Ton compte est presque prêt</span></div>
   </div>}
   {notice&&<p className="notice signup-notice">{notice}</p>}
   <div className="signup-actions">{signupStep>1&&<button type="button" className="signup-back" onClick={previousSignupStep}>Retour</button>}<button className="gradient-button signup-next" disabled={busy||!isSupabaseConfigured}>{busy?'Création…':signupStep===4?'Créer mon compte':'Continuer'}{signupStep!==4&&<ChevronRight size={18}/>}</button></div>
   <button type="button" className="text-button signup-switch" onClick={()=>{setAuthMode('login');setSignupStep(1);setPassword('');setConfirmPassword('');setNotice('')}}>J’ai déjà un compte</button>
  </form>:<form className="form-card login-card" onSubmit={submitAuth}>
   <h1>Bon retour</h1><p className="login-subtitle">Connecte-toi pour retrouver ta communauté.</p>
   <label>Pseudo<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="ex. rakoto" minLength={3} maxLength={30} autoComplete="username" required/></label>
   <label>Mot de passe<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Ton mot de passe" required/></label>
   {notice&&<p className="notice">{notice}</p>}
   <button className="gradient-button full-width" disabled={busy||!isSupabaseConfigured}>{busy?'Connexion…':'Se connecter'}</button>
   <button type="button" className="text-button" onClick={()=>{setAuthMode('signup');setSignupStep(1);setPassword('');setConfirmPassword('');setNotice('')}}>Créer un compte</button>
  </form>}
  <p className="auth-foot">Un espace social pensé pour se retrouver.</p>
 </div>}
 {session&&user&&screen!=='auth'&&<>
  {screen==='messages'&&<><header className="topbar"><div className="brand"><img src="https://raw.githubusercontent.com/Aora-group-entreprise/safary/main/FB_IMG_17947533283908349.jpg" alt="" />i-tafa</div><div className="top-actions"><button aria-label="Rechercher un membre" onClick={()=>setSearchOpen(true)}><Search/></button><button aria-label="Nouvelle discussion" onClick={()=>setSearchOpen(true)}><PencilLine/></button></div></header>
   <section className="stories-section"><div className="section-heading"><h2>Stories</h2><button aria-label="Créer une story" onClick={()=>setScreen('create-story')}><Plus/></button></div><div className="stories-row"><button className="story-item" onClick={()=>setScreen('create-story')}><span className="story-ring own-story"><Avatar profile={profile} size="small"/><i>+</i></span><span>Votre story</span></button>{groupedStories.map(s=><button className="story-item" key={s.id} onClick={()=>showStory(s)}><span className="story-ring"><Avatar profile={s.profile} size="small" online={!!presence[s.profile.id]}/></span><span>{s.profile.username}</span></button>)}</div></section>
   <section className="messages-section"><div className="section-heading"><h1>Messages</h1><button aria-label="Actualiser" onClick={()=>void loadHome(user.id)}><RefreshCw size={18}/></button></div>
   {chats.length===0?<div className="empty-state"><MessageCircle size={34}/><strong>Aucune conversation</strong><span>Recherche un membre i-tafa pour commencer à discuter.</span><button className="gradient-button" onClick={()=>setSearchOpen(true)}>Trouver des membres</button></div>:<div className="conversation-list">{chats.map(c=><button className="conversation" key={c.id} onClick={()=>void openChat(c)}><span className="avatar-profile-hit" role="button" tabIndex={0} aria-label={'Voir le profil de '+c.user.username} onClick={e=>{e.stopPropagation();void openProfile(c.user)}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();void openProfile(c.user)}}}><Avatar profile={c.user} online={!!presence[c.user.id]}/></span><span className="conversation-copy"><span className="conversation-top"><strong>{c.user.username}</strong><time>{c.lastAt?timeLabel(c.lastAt):''}</time></span><span className="preview">{c.lastMessage}</span></span></button>)}</div>}</section>
   </>}
  {screen==='messages'&&null}
  {screen==='chat'&&<div className="chat-screen"><header className="chat-header"><button onClick={()=>{setScreen('messages');setConversationId('')}} aria-label="Retour"><ArrowLeft/></button><button type="button" className="avatar-profile-hit chat-avatar-hit" aria-label="Voir le profil" onClick={()=>contact&&void openProfile(contact)}><Avatar profile={contact} online={!!presence[contact?.id??'']}/></button><div><strong>{contact?.username??'Discussion'}</strong><span>{contact?.display_name??''}</span></div><button className="push-right" aria-label="Profil" onClick={()=>contact&&void openProfile(contact)}><InfoIcon/></button></header>
   <div className="chat-messages">{messages.length===0&&<p className="empty-chat">Démarre la conversation 👋</p>}{messages.map(m=><div className={'message-row '+(m.sender_id===user.id?'message-row-outgoing':'message-row-incoming')} key={m.id}><div className={'bubble '+(m.sender_id===user.id?'outgoing':'incoming')} onPointerDown={()=>beginMessagePress(m)} onPointerUp={clearLongPress} onPointerLeave={clearLongPress} onPointerCancel={clearLongPress} onContextMenu={e=>{e.preventDefault();setActiveMessage(m)}}>{m.message_type==='text'&&<span>{m.body}</span>}{m.attachments?.map(a=><div className="attachment-preview" key={a.id}>{a.mime_type.startsWith('image/')?<img src={a.url} alt={a.file_name}/>:a.mime_type.startsWith('audio/')?<div className="voice-message"><span>♫</span><audio controls preload="metadata" src={a.url}/></div>:<a href={a.url} download={a.file_name}>{a.file_name}</a>}</div>)}<time>{timeLabel(m.created_at)}</time>{m.sender_id===user.id&&m.seenByPeer&&<small className="message-seen">Vu</small>}</div>{m.reactions&&m.reactions.length>0&&<div className="message-reaction-list">{Object.entries(m.reactions.reduce((acc:Record<string,number>,r)=>{acc[r.reaction]=(acc[r.reaction]||0)+1;return acc},{})).map(([emoji,count])=><span key={emoji}>{emoji} {count}</span>)}</div>}</div>)}</div>
   {activeMessage&&<div className="message-action-backdrop" onClick={()=>setActiveMessage(null)}><div className="message-action-panel" onClick={e=>e.stopPropagation()}><div className="reaction-picker">{['❤️','😂','😮','😢','😡','👍'].map(emoji=><button key={emoji} onClick={()=>void reactToMessage(activeMessage,emoji)}>{emoji}</button>)}</div><button onClick={()=>void deleteMessage(activeMessage,'me')}><Trash2 size={17}/> Supprimer pour moi</button>{activeMessage.sender_id===user.id&&<button className="danger-action" onClick={()=>void deleteMessage(activeMessage,'everyone')}><Trash2 size={17}/> Supprimer pour tout le monde</button>}<button className="cancel-action" onClick={()=>setActiveMessage(null)}>Annuler</button></div></div>}{recording&&<div className="voice-recording-bar"><button type="button" className="voice-record-trash" aria-label="Annuler le vocal" onClick={()=>finishVoiceRecording(false)}><Trash2/></button><div className="voice-live-pill"><span className="voice-live-dot"/><div className="voice-live-wave">{Array.from({length:42},(_,i)=><i key={i} style={{height:(7+((i*17+recordingSeconds*3)%25))+'px'}}/> )}</div><time>{formatVoiceTime(recordingSeconds)}</time></div><button type="button" className="voice-record-pause" aria-label={recordingPaused?'Reprendre':'Pause'} onClick={toggleVoicePause}>{recordingPaused?'▶':'Ⅱ'}</button><button type="button" className="voice-record-send" aria-label="Envoyer le vocal" disabled={busy} onClick={()=>finishVoiceRecording(true)}><Send size={22}/></button></div>}{chatFile&&<div className="chat-upload-preview">{chatFile.type.startsWith('image/')?<img src={chatFilePreview} alt="Aperçu de la pièce jointe"/>:<span className="chat-file-chip">{chatFile.name}</span>}<button type="button" aria-label="Retirer le fichier" onClick={()=>{setChatFile(null);setChatFilePreview('')}}><X/></button><span>{chatFile.name}</span></div>}{!recording&&<form className="composer" onSubmit={sendMessage}><button type="button" aria-label="Joindre un fichier" onClick={()=>fileInputRef.current?.click()}><Plus/></button><input ref={fileInputRef} type="file" accept={CHAT_FILE_TYPES.join(',')} hidden onChange={e=>{const file=e.target.files?.[0];if(file){setChatFile(file);setChatFilePreview(file.type.startsWith('image/')?URL.createObjectURL(file):'')}e.currentTarget.value=''}}/><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Écrire un message…" maxLength={10000}/><button type="button" aria-label={recording?'Arrêter le vocal':'Enregistrer un vocal'} onClick={()=>void toggleVoiceRecording()}>{recording?<Square/>:<Mic/>}</button><button className="send-button" type="submit" aria-label={chatFile?'Envoyer la pièce jointe':'Envoyer'} disabled={(!draft.trim()&&!chatFile)||busy}><Send/></button></form>}</div>}
  {screen==='create-story'&&<SubScreen title="Créer une story" onBack={()=>setScreen('messages')}><div className="story-composer"><div className="story-composer-heading"><span className="signup-eyebrow">PARTAGE UN MOMENT</span><h2>Ta story, ton instant.</h2><p>Une photo ou une vidéo, visible pendant 48 heures.</p></div><label className={'story-dropzone '+(storyPreview?'has-preview':'')}>
    {storyPreview?(storyFile?.type.startsWith('video/')?<video src={storyPreview} muted autoPlay loop playsInline/>:<img src={storyPreview} alt="Aperçu de la story"/>):<><span className="story-drop-icon"><ImagePlus/></span><strong>Ajoute ton média</strong><small>JPG, PNG, WebP, GIF ou vidéo · 50 Mo max</small></>}
    <span className="story-choose"><Camera size={17}/> {storyFile?'Changer le média':'Choisir depuis la galerie'}</span><input type="file" accept={MIME_TYPES.join(',')} onChange={e=>{const f=e.target.files?.[0]??null;setStoryFile(f);setStoryPreview(f?URL.createObjectURL(f):'')}}/>
   </label><div className="story-caption-wrap"><label htmlFor="story-caption">Légende <span>{storyCaption.length}/300</span></label><textarea id="story-caption" className="story-caption" placeholder="Écris quelque chose à partager…" value={storyCaption} onChange={e=>setStoryCaption(e.target.value)} maxLength={300}/></div><div className="story-composer-footer"><span><i/> Visible pendant 48 h</span><button className="gradient-button" disabled={!storyFile||busy} onClick={()=>void publishStory()}>{busy?'Publication…':'Publier la story'} <ChevronRight size={17}/></button></div></div></SubScreen>}
  {screen==='story-viewer'&&activeStory&&<div className="story-viewer"><header><button onClick={()=>setScreen('messages')}><X/></button><button className="story-owner-link" onClick={()=>void openProfile(activeStory.profile)}><Avatar profile={activeStory.profile} size="small"/><strong>{activeStory.profile.username}</strong></button><time>{timeLabel(activeStory.created_at)}</time>{activeStory.user_id===user.id&&<button className="push-right" onClick={()=>void deleteStory()} aria-label="Supprimer"><Trash2/></button>}</header>{activeStory.user_id===user.id&&<button className="story-views-button" onClick={()=>void openStoryViewers()}>Voir les vues</button>}{activeStory.media_type==='video'?<video src={activeStory.url} controls autoPlay playsInline/>:<img src={activeStory.url} alt={activeStory.caption||'Story i-tafa'}/>}<p>{activeStory.caption}</p>{storyViewersOpen&&<div className="story-viewers-backdrop" onClick={()=>setStoryViewersOpen(false)}><div className="story-viewers-panel" onClick={e=>e.stopPropagation()}><header><strong>Vues de la story ({storyViewers.length})</strong><button onClick={()=>setStoryViewersOpen(false)} aria-label="Fermer"><X/></button></header>{storyViewers.length?storyViewers.map((v,i)=><div className="story-viewer-row" key={v.username+'-'+i}><span><strong>{v.username}</strong><small>{v.display_name}</small></span><time>{timeLabel(v.viewed_at)}</time></div>):<p>Personne n’a encore vu cette story.</p>}</div></div>}<footer><button onClick={()=>setStoryIndex(i=>Math.max(0,i-1))} disabled={storyIndex===0}>Précédente</button><button onClick={()=>setStoryIndex(i=>Math.min(stories.length-1,i+1))} disabled={storyIndex>=stories.length-1}>Suivante</button></footer></div>}
  {screen==='story-viewer'&&!activeStory&&<SubScreen title="Story" onBack={()=>setScreen('messages')}><div className="empty-state">Aucune story disponible.</div></SubScreen>}
  {screen==='profile'&&<SubScreen title={viewedProfile?'Profil':'Mon profil'} onBack={()=>{setViewedProfile(null);setScreen('messages')}}><div className="profile-preview">
   <div className="profile-cover-preview" style={{backgroundImage:(viewedProfile||profile)?.cover_url?`url("${(viewedProfile||profile)?.cover_url}")`:undefined}}>{!(viewedProfile||profile)?.cover_url&&<span>Photo de couverture</span>}</div>
   <div className="profile-preview-identity"><Avatar profile={viewedProfile||profile} size="large" online={!!presence[(viewedProfile||profile)?.id??'']}/><div><strong>{(viewedProfile||profile)?.display_name||(viewedProfile||profile)?.username||'Profil'}</strong><span>@{(viewedProfile||profile)?.username||'utilisateur'}</span></div></div>
   <p className="profile-preview-bio">{(viewedProfile||profile)?.bio||'Aucune biographie pour le moment.'}</p>
   <div className="profile-preview-actions">{viewedProfile?<button className="gradient-button" onClick={()=>{const p=viewedProfile;setViewedProfile(null);void startConversation(p)}}><MessageCircle size={17}/> Envoyer un message</button>:<button className="gradient-button" onClick={()=>setScreen('settings')}><Settings size={17}/> Paramètres</button>}</div>
  </div></SubScreen>}
  {screen==='edit-profile'&&<SubScreen title="Modifier mon profil" onBack={()=>setScreen('settings')}><form className="profile-form profile-editor" onSubmit={saveProfile}>
   <div className="profile-cover-editor" style={{backgroundImage:`url("${profileCoverPreview||profile?.cover_url||''}")`}}>
    {!(profileCoverPreview||profile?.cover_url)&&<span>Ta photo de couverture</span>}
    <label className="cover-edit-button"><Camera size={16}/> Modifier la couverture<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async e=>{const file=e.target.files?.[0];if(file){setCoverFile(file);setProfileCoverPreview(await fileToDataUrl(file))}}}/></label>
   </div>
   <div className="profile-identity-editor">
    <div className="profile-avatar-wrap"><Avatar profile={{...profile,avatar_url:profileAvatarPreview||profile?.avatar_url||null,display_name:displayName}} size="large"/><label className="avatar-edit-button"><Camera size={15}/><input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async e=>{const file=e.target.files?.[0];if(file){setAvatarFile(file);setProfileAvatarPreview(await fileToDataUrl(file))}}}/></label></div>
    <div className="profile-identity-copy"><strong>{displayName||username||'Ton profil'}</strong><span>@{username||'utilisateur'}</span></div>
   </div>
   <div className="profile-fields">
    <label>Nom affiché<input value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={60} placeholder="Ton nom"/></label>
    <label>Nom utilisateur<input value={username} onChange={e=>setUsername(e.target.value)} minLength={3} maxLength={30} placeholder="pseudo"/></label>
    <label>Biographie<textarea value={bio} onChange={e=>setBio(e.target.value)} maxLength={160} rows={3} placeholder="Présente-toi en quelques mots…"/></label>
   </div>
   <button className="gradient-button full-width profile-save-button" disabled={busy}>{busy?'Enregistrement…':'Enregistrer les modifications'}</button>
  </form></SubScreen>}
  {screen==='settings'&&<SubScreen title="Paramètres" onBack={()=>setScreen('profile')}><div className="settings-list"><div className="settings-row"><span><strong>Statut en ligne</strong><small>Afficher ta présence aux autres.</small></span><input type="checkbox" checked={settings.online_status_visible} onChange={e=>void updateSetting('online_status_visible',e.target.checked)}/></div><div className="settings-row"><span><strong>Notifications</strong><small>Alertes du navigateur lorsque i-tafa est ouvert en arrière-plan.</small></span><input type="checkbox" checked={settings.notifications_enabled} onChange={e=>void updateSetting('notifications_enabled',e.target.checked)}/></div><button onClick={()=>setScreen('edit-profile')}>Modifier mon profil <ChevronRight/></button><button className="logout-row" onClick={()=>void signOut()}><LogOut size={18}/> Déconnexion</button><button className="delete-account-row" onClick={()=>void deleteAccount()} disabled={busy}><Trash2 size={18}/> Supprimer mon compte</button><p className="settings-version">i-tafa · V1</p></div></SubScreen>}
  {['messages','create-story','profile'].includes(screen)&&<nav className="bottom-nav bottom-nav-fixed"><button className={screen==='messages'?'active':''} onClick={()=>setScreen('messages')}><MessageCircle/><span>Messages</span></button><button className={screen==='create-story'?'active':''} onClick={()=>setScreen('create-story')}><Plus/><span>Créer Story</span></button><button className={screen==='profile'?'active':''} onClick={()=>setScreen('profile')}><UserRound/><span>Profil</span></button></nav>}
  {searchOpen&&<div className="modal-backdrop" onClick={()=>setSearchOpen(false)}><div className="search-modal" onClick={e=>e.stopPropagation()}><header><h2>Trouver des membres</h2><button onClick={()=>setSearchOpen(false)}><X/></button></header><input autoFocus value={searchTerm} onChange={e=>void searchPeople(e.target.value)} placeholder="Rechercher par nom utilisateur…"/><div className="search-results">{searchResults.map(p=><button key={p.id} onClick={()=>void startConversation(p)} disabled={busy}><span className="avatar-profile-hit" role="button" tabIndex={0} aria-label={'Voir le profil de '+p.username} onClick={e=>{e.stopPropagation();void openProfile(p)}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();void openProfile(p)}}}><Avatar profile={p} online={!!presence[p.id]}/></span><span><strong>{p.username}</strong><small>{p.display_name}</small></span><ChevronRight/></button>)}</div>{searchTerm.length<2&&<small>Saisis au moins deux caractères.</small>}</div></div>}
 </>}
 </section><div className="connection-note">{session?'i-tafa · connecté':'i-tafa'}</div>{notice&&<button className="toast" onClick={()=>setNotice('')}>{notice}<X size={15}/></button>}</main>;
}

function InfoIcon(){return <MoreHorizontal/>}
function SubScreen({title,onBack,children}:{title:string;onBack:()=>void;children:React.ReactNode}){return <div className="sub-screen"><header className="sub-header"><button onClick={onBack} aria-label="Retour"><ArrowLeft/></button><h1>{title}</h1></header>{children}</div>}
