-- 027_item_comments.sql
-- Monday.com-style item collaboration: comments/updates on any entity.
-- Backs the ItemDrawer "Updates" feed. comments table already existed
-- (id, entity_type, entity_id, author_id, body, mentions uuid[], created_at).
create or replace function public.get_comments(p_entity_type text, p_entity_id uuid)
returns jsonb language sql security definer set search_path=public as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'body', c.body, 'author_id', c.author_id,
    'author_name', coalesce(p.full_name, p.display_name, 'Unknown'),
    'mentions', c.mentions, 'created_at', c.created_at
  ) order by c.created_at), '[]'::jsonb)
  from comments c left join people p on p.id = c.author_id
  where c.entity_type = p_entity_type and c.entity_id = p_entity_id;
$function$;

create or replace function public.add_comment(
  p_entity_type text, p_entity_id uuid, p_author_id uuid, p_body text, p_mentions uuid[] default '{}'::uuid[]
) returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_id uuid;
begin
  if coalesce(trim(p_body),'') = '' then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  insert into comments(entity_type, entity_id, author_id, body, mentions)
  values (p_entity_type, p_entity_id, p_author_id, left(p_body, 4000), coalesce(p_mentions, '{}'::uuid[]))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

grant execute on function public.get_comments(text,uuid) to anon, authenticated;
grant execute on function public.add_comment(text,uuid,uuid,text,uuid[]) to anon, authenticated;
