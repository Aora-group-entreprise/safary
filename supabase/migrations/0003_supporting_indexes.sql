-- SAFARY V1: supporting indexes for message joins and story-view uniqueness.
create index if not exists message_attachments_message_idx on public.message_attachments(message_id);
create index if not exists messages_sender_idx on public.messages(sender_id);
create index if not exists story_views_viewer_idx on public.story_views(viewer_id);
