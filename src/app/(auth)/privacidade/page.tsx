import type { Metadata } from 'next';

/* Página pública, sem login. A Meta exige um endereço de política de privacidade
   para publicar o app do WhatsApp oficial, e quem fala com a escola pelo WhatsApp
   precisa poder ler isto sem conta no sistema. */

export const metadata: Metadata = {
  title: 'Política de privacidade | Nexus Chapecó',
  description: 'Como a Nexus English Center, unidade Chapecó, trata os dados de quem fala com a escola.',
};

const ATUALIZADA_EM = '19 de novembro de 2026';

export default function Privacidade() {
  return (
    <main style={estilos.pagina}>
      <article style={estilos.caixa}>
        <p style={estilos.marca}>Nexus English Center · Chapecó</p>
        <h1 style={estilos.titulo}>Política de privacidade</h1>
        <p style={estilos.data}>Atualizada em {ATUALIZADA_EM}</p>

        <p>
          Esta política explica como a Nexus English Center, unidade Chapecó, trata os dados de
          alunos, responsáveis e interessados que falam com a escola pelo WhatsApp oficial e pelo
          sistema interno de atendimento. Ela segue a Lei Geral de Proteção de Dados (Lei 13.709/2018).
        </p>

        <h2 style={estilos.secao}>Que dados guardamos</h2>
        <ul style={estilos.lista}>
          <li>Nome e número de telefone de quem fala com a escola.</li>
          <li>As mensagens trocadas no WhatsApp com a escola, incluindo áudios, imagens e arquivos enviados.</li>
          <li>Dados de matrícula e de estudo do aluno: nível, aulas marcadas, provas e notas.</li>
          <li>Anotações da equipe sobre o atendimento, como o assunto da conversa e o setor responsável.</li>
        </ul>

        <h2 style={estilos.secao}>Para que usamos</h2>
        <ul style={estilos.lista}>
          <li>Responder quem nos procura e encaminhar a conversa para o setor certo.</li>
          <li>Organizar matrícula, marcação de aulas, provas e financeiro do aluno.</li>
          <li>Avisar sobre aulas, provas, pagamentos e mudanças na escola.</li>
        </ul>
        <p>
          Uma parte da triagem das mensagens é feita de forma automática, para identificar o assunto e
          abrir a tarefa no setor certo. Quem responde e decide é sempre alguém da equipe.
        </p>

        <h2 style={estilos.secao}>Com quem compartilhamos</h2>
        <p>
          Não vendemos nem cedemos dados para terceiros. Os dados passam apenas pelos serviços que fazem
          o atendimento funcionar: a Meta, que opera o WhatsApp, e os provedores de hospedagem e banco de
          dados do sistema (Google Firebase e Vercel). Cada um deles trata os dados só para prestar o
          serviço à escola.
        </p>

        <h2 style={estilos.secao}>Por quanto tempo</h2>
        <p>
          Guardamos os dados enquanto a pessoa for aluna ou estiver em contato com a escola, e depois pelo
          tempo exigido por lei para registros escolares e financeiros. O histórico de notas é mantido
          como registro escolar do aluno.
        </p>

        <h2 style={estilos.secao}>Seus direitos</h2>
        <p>
          Você pode pedir a qualquer momento para ver, corrigir ou apagar seus dados, ou para não receber
          mais mensagens da escola. Basta pedir no próprio WhatsApp da escola, no número
          <span style={estilos.num}> (49) 98896-5170</span>, ou na recepção da unidade.
        </p>

        <h2 style={estilos.secao}>Segurança</h2>
        <p>
          O acesso ao sistema é restrito à equipe da escola, com login individual, e cada pessoa vê apenas
          o que o seu papel permite. As chaves de acesso aos serviços ficam só no servidor.
        </p>
      </article>
    </main>
  );
}

const estilos: Record<string, React.CSSProperties> = {
  pagina: {
    minHeight: '100dvh',
    background: 'var(--canvas)',
    color: 'var(--text)',
    fontFamily: 'var(--fonte-corpo)',
    padding: '48px 16px',
    lineHeight: 1.6,
  },
  caixa: {
    maxWidth: 680,
    margin: '0 auto',
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r)',
    padding: '32px 28px',
    boxShadow: 'var(--shadow)',
  },
  marca: { color: 'var(--solar-deep)', fontWeight: 600, fontSize: 14, margin: 0 },
  titulo: { fontFamily: 'var(--fonte-display)', fontSize: 32, lineHeight: 1.15, margin: '8px 0 4px' },
  data: { color: 'var(--muted)', fontSize: 14, marginTop: 0 },
  secao: { fontFamily: 'var(--fonte-display)', fontSize: 19, margin: '28px 0 8px' },
  lista: { paddingLeft: 20, margin: '8px 0' },
  num: { fontFamily: 'var(--fonte-dados)', fontVariantNumeric: 'tabular-nums' },
};
