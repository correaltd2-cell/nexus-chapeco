/* A saúde do sistema, do jeito que a gestão lê.
   O servidor anota num documento só (config/saude) a última vez que cada parte
   funcionou e a última falha de cada uma (src/lib/saude.ts). Aqui isso vira aviso:
   o que parou, desde quando e o que fazer.
   Existe porque em 19/11/2026 o servidor passou um dia sem gravar mensagem e
   ninguém soube: o erro só aparecia nos registros da Vercel.
   Prova: node --experimental-strip-types testes/saude.ts */
import { duracao } from './formato.ts';

export type OndeFalha = 'webhook' | 'assinatura' | 'envio' | 'modelo' | 'modelos' | 'midia' | 'agenda' | 'ia' | 'relogio' | 'agendadas';
export type Batida = 'webhookEm' | 'entradaEm' | 'saidaEm' | 'relogioEm' | 'agendadasEm';

export interface Falha { motivo: string; em: string; vezes: number }

export interface Saude extends Partial<Record<Batida, string>> {
  falhas?: Partial<Record<OndeFalha, Partial<Falha>>>;
  vistoEm?: string;   // a gestão já viu as falhas até aqui
}

/** Se o servidor alcança o banco. "desconhecido" é não ter conseguido perguntar
    (sem internet, página abrindo): isso não vira alarme. */
export type EstadoServidor = 'ok' | 'sem_chave' | 'sem_permissao' | 'fora' | 'desconhecido';

export interface Aviso {
  chave: string;
  titulo: string;
  detalhe: string;
  conserto: string;
  grave: boolean;        // grave sobe para a faixa vermelha no topo
  dispensavel: boolean;  // "já vi" tira; o resto só sai quando consertar
  em?: string;
}

/* quanto tempo sem notícia vira alarme */
export const RELOGIO_PARADO_MIN = 10;      // o relógio roda de minuto em minuto
export const FILA_PARADA_MIN = 40;         // a fila roda de dez em dez
export const META_CALADA_MIN = 10;         // depois de um envio, a Meta devolve o "enviado" em segundos
const FOLGA_MS = 2 * 60_000;               // as batidas são gravadas no máximo uma vez por minuto

const SOBRE_FALHA: Record<OndeFalha, { titulo: string; conserto: string; grave: boolean }> = {
  webhook: {
    titulo: 'Chegou mensagem e o sistema não conseguiu guardar',
    conserto: 'O contato pode ter falado e a conversa não aparecer na lista. Se repetir, os registros da Vercel em /api/whatsapp/webhook dizem o porquê.',
    grave: true,
  },
  assinatura: {
    titulo: 'A Meta chamou e a assinatura não conferiu',
    conserto: 'Nenhuma mensagem entra enquanto isso. O META_APP_SECRET da Vercel tem que ser a chave secreta do app Nexus 1 (no painel da Meta, Configurações do app, Básico). Troque e publique de novo.',
    grave: true,
  },
  envio: {
    titulo: 'O WhatsApp recusou um envio da escola',
    conserto: 'Token vencido se resolve gerando outro no usuário de sistema da Nexus e trocando o WHATSAPP_TOKEN na Vercel. Pagamento e conta bloqueada se resolvem no Gerenciador de Negócios da Meta.',
    grave: true,
  },
  modelo: {
    titulo: 'Um modelo de mensagem não saiu',
    conserto: 'O nome ou o idioma não batem com um modelo aprovado na Meta, ou a Meta pausou o modelo. Confira em Configurações, Modelos de mensagem.',
    grave: true,
  },
  modelos: {
    titulo: 'Não consegui conferir os modelos de mensagem com a Meta',
    conserto: 'Os modelos já aprovados seguem saindo. O token do WhatsApp precisa da permissão de gerenciar a conta (whatsapp_business_management) e a WHATSAPP_BUSINESS_ACCOUNT_ID tem que ser a conta do número novo. Veja em Configurações, Modelos de mensagem.',
    grave: false,
  },
  midia: {
    titulo: 'Uma foto, áudio ou documento do contato não foi baixado',
    conserto: 'A mensagem aparece na conversa sem o arquivo. Peça para o contato mandar de novo. Se repetir, confira o Storage do Firebase e os registros da Vercel em /api/whatsapp/webhook.',
    grave: false,
  },
  agenda: {
    titulo: 'A agenda falhou numa tarefa do servidor',
    conserto: 'Pode ser o lembrete da véspera, a resposta do aluno ao lembrete ou os dados de teste. A agenda segue funcionando na tela. Se repetir, veja os registros da Vercel em /api/cron/lembretes e /api/agenda.',
    grave: false,
  },
  ia: {
    titulo: 'A IA não respondeu',
    conserto: 'O atendimento seguiu com os textos de reserva, então ninguém ficou sem resposta. Se repetir, confira a ANTHROPIC_API_KEY na Vercel e o saldo da conta.',
    grave: false,
  },
  relogio: {
    titulo: 'O relógio do atendimento falhou numa volta',
    conserto: 'Follow-up, encerramento e volta para a Recepção podem ter atrasado. Se repetir, os registros da Vercel em /api/cron/atendimento dizem o porquê.',
    grave: false,
  },
  agendadas: {
    titulo: 'A fila de mensagens programadas falhou',
    conserto: 'Alguma mensagem programada pode não ter saído na hora: confira no painel do contato. Se repetir, os registros da Vercel em /api/cron/agendadas dizem o porquê.',
    grave: false,
  },
};

const MESMO_DANO_DO_SERVIDOR = 'Nenhuma mensagem do WhatsApp é gravada enquanto isso, e o atendimento automático não roda.';

const SOBRE_SERVIDOR: Record<'sem_chave' | 'sem_permissao' | 'fora', Omit<Aviso, 'chave' | 'grave' | 'dispensavel'>> = {
  sem_chave: {
    titulo: 'O servidor está sem a chave do Firebase',
    detalhe: MESMO_DANO_DO_SERVIDOR,
    conserto: 'Coloque a FIREBASE_SERVICE_ACCOUNT nas variáveis da Vercel, com o JSON inteiro da conta de serviço, e publique de novo.',
  },
  sem_permissao: {
    titulo: 'O banco recusou o servidor',
    detalhe: MESMO_DANO_DO_SERVIDOR,
    conserto: 'A conta de serviço da FIREBASE_SERVICE_ACCOUNT é de outro projeto ou perdeu a permissão. Gere uma chave nova no Firebase (Configurações do projeto, Contas de serviço), troque na Vercel e publique de novo.',
  },
  fora: {
    titulo: 'O servidor não respondeu',
    detalhe: 'A conferência do servidor falhou. Pode ser uma queda rápida da Vercel.',
    conserto: 'Recarregue a página daqui a um minuto. Se continuar, veja os registros da Vercel.',
  },
};

const ms = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);

/** "há 12 min", "agora há pouco". */
export function haQuanto(iso: string, agora: Date) {
  const d = duracao(iso, agora);
  return d === 'agora' ? 'agora há pouco' : `há ${d}`;
}

const frase = (s: string) => {
  const t = s.trim();
  return !t || /[.!?]$/.test(t) ? t : `${t}.`;
};

export function avisosDaSaude(
  s: Saude | null | undefined,
  agora: Date,
  o: { automaticoLigado: boolean; servidor: EstadoServidor },
): Aviso[] {
  const saude = s || {};
  const avisos: Aviso[] = [];
  const minutos = (iso: string) => (agora.getTime() - ms(iso)) / 60_000;

  if (o.servidor === 'sem_chave' || o.servidor === 'sem_permissao' || o.servidor === 'fora') {
    avisos.push({ chave: `servidor_${o.servidor}`, ...SOBRE_SERVIDOR[o.servidor], grave: true, dispensavel: false });
  }

  /* Todo envio aceito gera um "enviado" da Meta pelo webhook em segundos. Se a escola
     enviou e a Meta não voltou, o webhook não está chegando: nem mensagem de contato entra. */
  if (saude.saidaEm && minutos(saude.saidaEm) > META_CALADA_MIN
      && (!saude.webhookEm || ms(saude.webhookEm) < ms(saude.saidaEm) - FOLGA_MS)) {
    avisos.push({
      chave: 'meta_calada',
      titulo: 'A Meta parou de chamar o sistema',
      detalhe: `A escola enviou ${haQuanto(saude.saidaEm, agora)} e a Meta não devolveu nem o aviso de entrega, então mensagem de contato também não deve estar entrando.`
        + (saude.webhookEm ? ` A última chamada dela foi ${haQuanto(saude.webhookEm, agora)}.` : ''),
      conserto: 'Em Configurações, WhatsApp oficial, toque em Conferir agora e depois em Assinar agora. Se não resolver, confira no app Nexus 1 da Meta se a URL do webhook termina em /api/whatsapp/webhook e se o campo messages está assinado.',
      grave: true,
      dispensavel: false,
    });
  }

  if (o.automaticoLigado && (!saude.relogioEm || minutos(saude.relogioEm) > RELOGIO_PARADO_MIN)) {
    avisos.push({
      chave: 'relogio_parado',
      titulo: 'O relógio do atendimento parou',
      detalhe: (saude.relogioEm ? `A última volta foi ${haQuanto(saude.relogioEm, agora)}.` : 'Ele ainda não rodou nenhuma vez.')
        + ' Follow-up, encerramento e a volta para a Recepção não saem enquanto isso.',
      conserto: 'Na Vercel, em Settings, Cron Jobs, confira se o /api/cron/atendimento está ativo, e se o CRON_SECRET existe nas variáveis.',
      grave: true,
      dispensavel: false,
    });
  }

  if (saude.agendadasEm && minutos(saude.agendadasEm) > FILA_PARADA_MIN) {
    avisos.push({
      chave: 'fila_parada',
      titulo: 'A fila de mensagens programadas parou',
      detalhe: `A última volta foi ${haQuanto(saude.agendadasEm, agora)}. Mensagem programada não sai enquanto isso.`,
      conserto: 'Na Vercel, em Settings, Cron Jobs, confira se o /api/cron/agendadas está ativo, e se o CRON_SECRET existe nas variáveis.',
      grave: true,
      dispensavel: false,
    });
  }

  const visto = ms(saude.vistoEm);
  for (const onde of Object.keys(SOBRE_FALHA) as OndeFalha[]) {
    const f = saude.falhas?.[onde];
    if (!f?.em || !f.vezes) continue;
    if (visto && ms(f.em) <= visto) continue;
    const sobre = SOBRE_FALHA[onde];
    const quando = haQuanto(f.em, agora);
    avisos.push({
      chave: `falha_${onde}`,
      titulo: sobre.titulo,
      detalhe: `${frase(f.motivo || 'Sem detalhe.')} ${f.vezes > 1 ? `Aconteceu ${f.vezes} vezes, a última ${quando}.` : `Foi ${quando}.`}`,
      conserto: sobre.conserto,
      grave: sobre.grave,
      dispensavel: true,
      em: f.em,
    });
  }

  /* o que segue quebrado vem antes; entre as falhas, a mais recente primeiro */
  return avisos.sort((a, b) =>
    Number(a.dispensavel) - Number(b.dispensavel) || ms(b.em) - ms(a.em) || 0);
}

/** O que gravar quando a gestão toca em "já vi": as falhas somem até a próxima,
    e a contagem recomeça. Leva a falha inteira para valer com qualquer jeito de mesclar. */
export function camposDoJaVi(s: Saude | null | undefined, agora: Date): Saude {
  const falhas: Saude['falhas'] = {};
  for (const [onde, f] of Object.entries(s?.falhas || {})) {
    falhas[onde as OndeFalha] = { ...f, vezes: 0 };
  }
  return { vistoEm: agora.toISOString(), falhas };
}

/** As batidas, para a seção Saúde do sistema mostrar que está tudo andando. */
export function linhasDaSaude(s: Saude | null | undefined, agora: Date) {
  const saude = s || {};
  const linha = (rotulo: string, iso: string | undefined, nunca: string) =>
    ({ rotulo, valor: iso ? haQuanto(iso, agora) : nunca, conhecido: Boolean(iso) });
  return [
    linha('Última chamada da Meta', saude.webhookEm, 'nenhuma ainda'),
    linha('Última mensagem de contato', saude.entradaEm, 'nenhuma ainda'),
    linha('Último envio aceito pela Meta', saude.saidaEm, 'nenhum ainda'),
    linha('Última volta do relógio do atendimento', saude.relogioEm, 'ainda não rodou'),
    linha('Última volta da fila de programadas', saude.agendadasEm, 'ainda não rodou'),
  ];
}

/* ---------- para o servidor ---------- */

/** Recusa da Meta que é problema da conta (alarme) ou do modelo (alarme), e não do
    contato. Janela fechada, número sem WhatsApp e afins são do dia a dia: aparecem
    na própria mensagem e não acordam ninguém. Sem código é rede: alarme. */
export function classificaRecusa(codigo?: number): 'conta' | 'modelo' | 'contato' {
  if (codigo === undefined) return 'conta';
  if (codigo >= 132000 && codigo < 133000) return 'modelo';
  const DO_CONTATO = [131047, 131026, 131051, 131052, 131053, 131021, 131009, 131008, 100, 470, 131056];
  return DO_CONTATO.includes(codigo) ? 'contato' : 'conta';
}

/** De onde vem a falha do servidor com o banco. */
export function classificaErroDoBanco(mensagem: string): 'sem_chave' | 'sem_permissao' | 'fora' {
  if (/FIREBASE_SERVICE_ACCOUNT|JSON|private.?key|PEM|DECODER/i.test(mensagem)) return 'sem_chave';
  if (/PERMISSION_DENIED|UNAUTHENTICATED|invalid_grant|default credentials|insufficient permission/i.test(mensagem)) return 'sem_permissao';
  return 'fora';
}

/** O erro do servidor em português, curto, para caber no aviso. */
export function explicaErroDoServidor(mensagem: string) {
  if (/FIREBASE_SERVICE_ACCOUNT/i.test(mensagem)) return 'Falta a FIREBASE_SERVICE_ACCOUNT no servidor.';
  if (/PERMISSION_DENIED|UNAUTHENTICATED|invalid_grant/i.test(mensagem)) return 'O banco recusou a gravação: a conta de serviço está sem permissão.';
  if (/FAILED_PRECONDITION/.test(mensagem) && /index/i.test(mensagem)) return 'Falta um índice no Firestore para esta consulta.';
  if (/DEADLINE_EXCEEDED|UNAVAILABLE/.test(mensagem)) return 'O banco demorou demais para responder.';
  if (/RESOURCE_EXHAUSTED/.test(mensagem)) return 'O banco chegou no limite de uso.';
  const limpo = mensagem.replace(/\s+/g, ' ').trim();
  return limpo.length > 200 ? `${limpo.slice(0, 199)}…` : limpo || 'Erro sem mensagem.';
}
