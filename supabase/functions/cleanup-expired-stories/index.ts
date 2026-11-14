import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  }

  const secret = Deno.env.get('CRON_SECRET');
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!secret || !url || !serviceKey) {
    console.error('Missing cleanup function environment variables.');
    return new Response('Server configuration error', { status: 500 });
  }
  if (req.headers.get('x-cron-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: items, error } = await db.rpc('expired_story_objects');
  if (error) {
    console.error('Unable to list expired stories:', error.message);
    return Response.json({ error: 'Unable to list expired stories.' }, { status: 500 });
  }

  let deleted = 0;
  const failures: string[] = [];
  for (const item of items ?? []) {
    const file = await db.storage.from('stories').remove([item.storage_path]);
    if (file.error) {
      console.error('Unable to delete expired story media:', item.story_id, file.error.message);
      failures.push(item.story_id);
      continue;
    }

    const row = await db.from('stories').delete().eq('id', item.story_id);
    if (row.error) {
      console.error('Unable to delete expired story row:', item.story_id, row.error.message);
      failures.push(item.story_id);
      continue;
    }
    deleted++;
  }

  return Response.json({
    found: items?.length ?? 0,
    deleted,
    failed: failures.length,
    failedStoryIds: failures,
  });
});