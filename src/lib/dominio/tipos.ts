/* Modelo de dados do sistema. Nomes de colecao e campo em portugues, como manda o CLAUDE.md.
   Tudo que é dinheiro é inteiro em centavos. Datas gravadas como ISO ou Timestamp do Firestore;
   no cliente a gente lê sempre pelos ajudantes de `datas.ts`. */

export type Papel = 'admin' | 'gestor' | 'recepcao' | 'coordenacao' | 'professor';
export type Setor = 'recepcao' | 'financeiro' | 'coordenacao' | 'kids';
export type Trilha = 'adultos' | 'kids';

/* ---------- equipe ---------- */
export interface Perfil {
  id: string;              // uid do Firebase Auth
  nome: string;
  email: string;
  papel: Papel;
  setores: Setor[];        // de quais setores vê as conversas
  telefone?: string;       // para receber o aviso no WhatsApp
  assinatura?: string;     // como o nome aparece nas mensagens que a pessoa manda
  avisaNoWhats: boolean;
  ativo: boolean;
  criadoEm: string;
  /* agenda: quem dá aula aparece como professor; a cor pinta os blocos dele */
  daAula?: boolean;        // papel professor já dá aula; coordenação marca se der
  cor?: string;            // #RRGGBB
  teste?: boolean;         // professor fictício da semente da agenda
}

/* ---------- alunos ---------- */
export interface Contrato {
  inicio: string;          // 2026-02-10
  fim: string;             // 2027-06-15
  mensalidadeCents: number;
  diaVencimento: number;
}

export interface Aluno {
  id: string;
  nome: string;
  telefone: string;        // E.164 sem mais: 5549991234567
  email?: string;
  documento?: string;
  trilha: Trilha;
  nivel: string;           // Starter, A1, A2, B1, B2, Kids 1...
  licao: number;           // 1 a 20
  contrato?: Contrato;
  responsavelNome?: string;
  responsavelTelefone?: string;
  observacao?: string;
  ativo: boolean;
  /* ligação com a planilha de alunos do Google, quando veio de lá (dominio/planilha.ts) */
  linhaPlanilha?: number;
  planilhaChave?: string;  // reencontra o aluno na próxima leitura: código, CPF ou nome e telefone
  origem?: 'planilha' | 'sistema';
  /* o que vem da planilha da escola (aba ATIVOS), ver dominio/planilha.ts */
  codigo?: string;         // COD da planilha
  menor?: boolean;         // " - menor" no nome: quem fala no WhatsApp é o responsável
  situacao?: 'ativo' | 'trancado' | 'off' | 'obs' | 'inativo';
  marcouSemana?: boolean | null;  // "yes" na planilha: marcou a aula da semana seguinte
  horarioFixoTexto?: string;      // como a escola escreveu ("quartas às 13h30")
  horariosFixos?: { dia: number; hora: string }[];
  temFixo?: boolean;
  modalidade?: 'presencial' | 'online' | 'hibrido';
  tipoCurso?: 'turma' | 'particular' | 'clube';
  professorDoLivro?: string;      // "PRIVATE NATHAN"
  livroOriginal?: string;         // o BOOK como está na planilha
  saude?: 'evoluindo' | 'atencao' | 'critico';
  appAtivo?: boolean;
  nexiaAtivo?: boolean;
  pendenciaLivro?: boolean;
  contratoFim?: string;           // AAAA-MM-DD
  contratoAssinado?: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

/* ---------- conversas ---------- */
export type EstadoConversa = 'aberta' | 'ia' | 'aguardando' | 'encerrada';
export type QuemEncerrou = 'cliente' | 'silencio' | 'atendente';
/* inicio: conversa recem-criada; menu: esperando o contato escolher o assunto;
   assistente: com o assistente do financeiro; aulas: viu a próxima aula e pode
   confirmar ou remarcar pelos botões; gente: com uma pessoa do time */
export type EtapaAtendimento = 'inicio' | 'menu' | 'assistente' | 'aulas' | 'gente';

export interface Conversa {
  id: string;
  waId: string;            // telefone do contato, como a Meta manda
  nome: string;            // nome do perfil do WhatsApp ou do cadastro
  alunoId?: string;
  setor: Setor;
  estado: EstadoConversa;
  agenteAtivo: boolean;    // o Lumi responde enquanto for true
  naoLidas: number;
  etiquetas: string[];
  ultimaEm: string;
  ultimaPreviaTexto: string;
  janelaAte?: string;      // fim das 24 horas; depois disso so template
  aguardandoDesde?: string;
  foto?: string;           // foto do contato, reduzida, guardada no proprio documento
  observacao?: string;     // o que o time precisa lembrar deste contato
  tarefaId?: string;       // o cartao que a triagem abriu para esta conversa
  retorno?: { quando: string; nota: string };
  /* ---- atendimento automatico (src/lib/dominio/automatico.ts) ---- */
  etapa?: EtapaAtendimento;
  tentativasMenu?: number;
  atendimentoDesde?: string;   // quando o atendimento de agora começou
  relogioDesde?: string;       // ultima fala da escola que espera resposta do contato
  relogioMotivo?: 'despedida'; // o contato parece ter se despedido; a IA confirma
  followUpEm?: string;         // quando saiu o 1º follow-up deste relogio
  aguardandoSetorDesde?: string; // passou para um setor que ainda nao respondeu
  processandoEm?: string;      // trava do cron, para dois nao mandarem a mesma coisa
  encerradaEm?: string;
  encerradaPor?: QuemEncerrou;
  encerradaPorNome?: string;
  criadaEm: string;
}

export type DirecaoMensagem = 'entrada' | 'saida';
export type AutorMensagem = 'cliente' | 'humano' | 'lumi' | 'sistema';

export interface Mensagem {
  id: string;
  conversaId: string;
  direcao: DirecaoMensagem;
  autor: AutorMensagem;
  autorNome?: string;
  texto: string;
  /* midia guardada no Storage; o caminho, nunca a url assinada */
  midiaPath?: string;
  midiaMime?: string;
  midiaNome?: string;
  midiaFalhou?: boolean;   // chegou mídia e o servidor não conseguiu baixar
  botoes?: string[];       // reply buttons que foram enviados
  template?: string;       // nome do template, quando saiu por template
  assinadaComo?: string;   // o nome que foi em negrito em cima do texto, no WhatsApp
  waMessageId?: string;
  entregueEm?: string;
  lidoEm?: string;
  falhouEm?: string;
  falhaMotivo?: string;
  criadaEm: string;
}

/* ---------- quadros ---------- */
export interface Etiqueta { nome: string; cor: string }

export interface ItemChecklist { id: string; texto: string; feito: boolean }

export interface Comentario {
  id: string;
  autorId: string;
  autorNome: string;
  texto: string;
  criadoEm: string;
}

export interface Atividade {
  id: string;
  autorNome: string;
  texto: string;
  criadoEm: string;
}

export interface AnexoCartao {
  id: string;
  nome: string;
  path: string;
  mime: string;
  tamanho: number;
  criadoEm: string;
}

/* Mensagem escrita agora para sair depois. Fora da janela de 24 horas a Meta so
   aceita modelo aprovado, entao a hora escolhida decide o que da para mandar. */
export type EstadoAgendada = 'agendada' | 'enviada' | 'cancelada' | 'falhou';

export interface MensagemAgendada {
  id: string;
  conversaId: string;
  texto: string;
  quando: string;          // ISO com hora: e quando ela sai
  autorId: string;
  autorNome: string;
  estado: EstadoAgendada;
  motivo?: string;         // por que nao saiu, na palavra da Meta
  criadaEm: string;
}

export interface Cartao {
  id: string;
  quadroId: string;
  listaId: string;
  ordem: number;           // posicao dentro da lista
  titulo: string;
  descricao: string;
  etiquetas: string[];
  membros: string[];       // uids
  prazo?: string;
  prazoConcluido: boolean;
  checklist: ItemChecklist[];
  comentarios: Comentario[];
  atividade: Atividade[];
  anexos: AnexoCartao[];
  capaCor?: string;
  conversaId?: string;
  alunoId?: string;
  arquivado: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Lista {
  id: string;
  quadroId: string;
  nome: string;
  ordem: number;
  arquivada: boolean;
}

export interface Quadro {
  id: string;
  nome: string;
  ordem: number;
  arquivado: boolean;
  criadoEm: string;
}

/* ---------- provas ---------- */
export type TipoQuestao = 'multipla' | 'aberta';

export interface Questao {
  id: string;
  enunciado: string;
  tipo: TipoQuestao;
  opcoes?: string[];
  gabarito?: string;       // indice da opcao certa ou resposta esperada
  peso: number;
}

export interface Prova {
  id: string;
  titulo: string;
  trilha: Trilha;
  nivel: string;
  licao: number;           // a prova fecha esta licao
  questoes: Questao[];
  notaMaxima: number;
  ativa: boolean;
  criadaEm: string;
}

export type EstadoEnvioProva = 'enviada' | 'respondida' | 'corrigida' | 'cancelada';

export interface Resposta { questaoId: string; valor: string; pontos?: number }

export interface EnvioProva {
  id: string;
  provaId: string;
  provaTitulo: string;
  alunoId: string;
  alunoNome: string;
  conversaId?: string;
  estado: EstadoEnvioProva;
  prazo?: string;
  enviadaEm: string;
  enviadaPor: string;
  respondidaEm?: string;
  respostas: Resposta[];
  corrigidaEm?: string;
  corretorId?: string;
  corretorNome?: string;
  nota?: number;
  comentarioCorrecao?: string;
  criadoEm: string;
}

/* ---------- grade e marcacao de aulas ---------- */
export type EstadoMarcacao = 'livre' | 'marcada' | 'confirmada' | 'faltou' | 'reposicao';

export interface Horario {
  id: string;
  dia: number;             // 1 segunda ... 6 sabado
  hora: string;            // 19:00
  trilha: Trilha;
  nivel?: string;
  capacidade: number;
  professorId?: string;
  ativo: boolean;
}

export interface Marcacao {
  id: string;
  semana: string;          // segunda da semana: 2026-11-16
  alunoId: string;
  alunoNome: string;
  horarioId?: string;
  dia?: number;
  hora?: string;
  estado: EstadoMarcacao;
  origem: 'planilha' | 'sistema' | 'aluno';
  linhaPlanilha?: number;
  marcadaEm?: string;
  criadaEm: string;
  atualizadaEm: string;
}

/* ---------- WhatsApp ---------- */
/* Os modelos de mensagem (templates) moram em src/lib/dominio/modelos.ts. */

export type TipoEnvio = 'texto' | 'template';
export type EstadoEnvio = 'na_fila' | 'enviado' | 'falhou' | 'pulado';

export interface Envio {
  id: string;
  regra: string;           // marcacao_semana, cobranca_marcacao, prova_lembrete...
  chave: string;           // regra + alvo + periodo, para nao repetir
  tipo: TipoEnvio;
  destino: string;         // waId
  alunoId?: string;
  conversaId?: string;
  template?: string;
  variaveis?: string[];
  texto?: string;
  estado: EstadoEnvio;
  motivo?: string;
  criadoEm: string;
  enviadoEm?: string;
}

/* ---------- configuracao ---------- */
export interface ConfigWhatsApp {
  phoneNumberId?: string;
  wabaId?: string;
  numero?: string;
  coexistencia: boolean;
  conectadoEm?: string;
}

export interface ConfigAtendimento {
  atender: boolean;              // a chave-mestra do Lumi
  saudacao: string;
  botoes: { titulo: string; setor: Setor }[];
  iaFinanceiro: boolean;
  boletoDiretoParaIa: boolean;
  horario: { dias: number[]; inicio: string; fim: string };
  foraDoHorarioAtiva: boolean;
  textoForaDoHorario: string;
  encerrarMinutos: number;
}

export interface ConfigSheets {
  planilhaId?: string;
  aba?: string;
  mapa?: Record<string, string>;  // campo do sistema -> coluna da planilha
  ligadoEm?: string;
}
