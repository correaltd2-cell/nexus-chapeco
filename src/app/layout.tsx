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
    { media: '(prefers-color-scheme: light)', color: '#EFEFEC' },
    { media: '(prefers-color-scheme: dark)', color: '#1A1A18' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* A tipografia é a mesma da Luz por Assinatura: Bricolage Grotesque nos
            títulos e números grandes, Instrument Sans no corpo, JetBrains Mono em
            todo dado numérico. Carregadas por link, como no modelo de lá. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font --
            de propósito: next/font busca a fonte na hora do build, e a rede da
            máquina de desenvolvimento não alcança o Google, o que quebraria o
            build local. Por link funciona nos dois lugares, e é como o modelo
            visual da Luz por Assinatura faz. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        <ProvedorDeSessao>{children}</ProvedorDeSessao>
      </body>
    </html>
  );
}
