// Realtime improves latency; focus, reconnection and a bounded poll recover missed events.
export function watchConfiguration(client, userId, refresh, host = window) {
  let stopped = false;
  let pending;
  const schedule = () => {
    if (stopped) return;
    host.clearTimeout(pending);
    pending = host.setTimeout(() => { if (!stopped) refresh(); }, 250);
  };
  let channel = client.channel(`configuration:${userId}`);
  for (const table of ['nav_registry', 'nav_role_visibility', 'page_permissions', 'app_users']) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table,
      ...(table === 'app_users' ? { filter: `user_id=eq.${userId}` } : {}) }, schedule);
  }
  channel.subscribe(status => { if (status === 'SUBSCRIBED') schedule(); });
  host.addEventListener('focus', schedule);
  host.addEventListener('online', schedule);
  const interval = host.setInterval(schedule, 60000);
  return () => {
    stopped = true; host.clearTimeout(pending); host.clearInterval(interval);
    host.removeEventListener('focus', schedule); host.removeEventListener('online', schedule);
    client.removeChannel(channel);
  };
}
