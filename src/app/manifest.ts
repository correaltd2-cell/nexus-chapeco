/* O sistema como aplicativo: no celular dá para pôr na tela de início, e no iPhone é
   assim que o aviso de mensagem nova chega com o sistema fechado. */
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nexus Chapecó',
    short_name: 'Nexus',
    description: 'Central de atendimento da Nexus English Center Chapecó',
    lang: 'pt-BR',
    start_url: '/conversas',
    scope: '/',
    display: 'standalone',
    background_color: '#F1F1EE',
    theme_color: '#F6821F',
    icons: [
      { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icones/icone-mascara-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
