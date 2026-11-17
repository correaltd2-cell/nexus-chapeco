import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ProvedorDeSessao } from '@/componentes/sessao';

export const metadata: Metadata = {
  title: 'Nexus Chapecó',
  description: 'Atendimento, quadros, provas e aulas da Nexus English Center, unidade Chapecó.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#11181C' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ProvedorDeSessao>{children}</ProvedorDeSessao>
      </body>
    </html>
  );
}
