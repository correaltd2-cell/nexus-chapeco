/* Avisos de mensagem nova com o sistema fechado.
   O Firebase entrega o push; aqui ele vira notificação, e o toque abre a conversa.
   Uma notificação por conversa (tag): a mensagem nova troca a anterior. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener('push', (evento) => {
  let bruto = {};
  try { bruto = evento.data ? evento.data.json() : {}; } catch (e) { bruto = {}; }
  const d = bruto.data || bruto.notification || bruto;
  evento.waitUntil(self.registration.showNotification(d.titulo || d.title || 'Nexus Chapecó', {
    body: d.corpo || d.body || 'Mensagem nova',
    tag: d.tag || 'nexus',
    renotify: true,
    icon: '/icones/icone-192.png',
    badge: '/icones/icone-192.png',
    data: { link: d.link || '/conversas' },
  }));
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const link = (evento.notification.data && evento.notification.data.link) || '/conversas';
  evento.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const janela of janelas) {
      if (new URL(janela.url).origin !== self.location.origin) continue;
      try { await janela.navigate(link); } catch (e) { /* janela de outro controle: só foca */ }
      return janela.focus();
    }
    return self.clients.openWindow(link);
  })());
});
