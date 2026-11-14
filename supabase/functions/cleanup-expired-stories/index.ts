import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async (req) => {
 const secret=Deno.env.get('CRON_SECRET');
 if(!secret || req.headers.get('x-cron-secret')!==secret) return new Response('Unauthorized',{status:401});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const {data:items,error}=await db.rpc('expired_story_objects');
 if(error)return Response.json({error:error.message},{status:500});
 let deleted=0;
 for(const item of items??[]){
  const file=await db.storage.from('stories').remove([item.storage_path]);
  if(file.error)continue;
  const row=await db.from('stories').delete().eq('id',item.story_id);
  if(!row.error)deleted++;
 }
 return Response.json({found:items?.length??0,deleted});
});