/* Prova das provas do portal (src/lib/dominio/provas-portal.ts e src/lib/provas-portal/fluxo.ts).
   Tudo com dublês: um portal de mentira, um registro em memória e um mensageiro que só
   anota. Nenhuma chamada sai para o portal real e nenhuma mensagem real é enviada.
   Os nomes, ids e links são inventados.
   Rodar:  node --experimental-strip-types testes/provas-portal.ts  */
import {
  acoesDaProva, canalDoEnvio, chaveValida, idDaTrava, leAluno, leErro, leLiberacao, leLink, leListaDeAlunos, leProvas, linkValido,
  mensagemDaProva, podeNoPortal, seguraATrava, situacaoDaMensagem,
  type AlunoNoPortal, type EnvioDaProva, type LiberacaoConfirmada, type OperacaoDaProva, type ProvaNoPortal,
} from '../src/lib/dominio/provas-portal.ts';
import {
  buscaNoPortal, desvincula, liberaEEnvia, provasDoAluno, reenvia, vincula,
  type AlunoDaCentral, type ConversaDaCentral, type Dependencias, type FalhaDoPortal, type LinhaDoLog, type QuemComSetores,
  type RespostaDoPortal,
} from '../src/lib/provas-portal/fluxo.ts';
import { assinaPedido, textoAssinado } from '../src/lib/provas-portal/assinatura.ts';
import { readFileSync } from 'node:fs';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}\n    veio     ${JSON.stringify(veio)}`);
  }
}
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
let seq = 0;
const uuid = () => {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
};

/* ---------------- os dublês ---------------- */

const RECEPCAO: QuemComSetores = { uid: 'u-rec', nome: 'Ana (Recepção)', papel: 'recepcao' };
const GESTOR: QuemComSetores = { uid: 'u-ges', nome: 'Gui', papel: 'gestor' };
const COORD: QuemComSetores = { uid: 'u-coo', nome: 'Natan', papel: 'coordenacao', setores: ['coordenacao'] };
const PROF: QuemComSetores = { uid: 'u-pro', nome: 'Paula', papel: 'professor' };

function provaDe(id: string, estado: ProvaNoPortal['estado'], podeLiberar = estado === 'bloqueada'): ProvaNoPortal {
  return {
    id, titulo: `A2 ${id}`, nivel: 'A2', modulo: id, estado, estadoOriginal: estado, podeLiberar, motivoBloqueio: '',
    liberacao: null, iniciadaEm: '', concluidaEm: '', resultado: null,
  };
}

function montaCenario(op: { configurado?: boolean; janela?: boolean; modelo?: boolean } = {}) {
  const agora = new Date('2026-11-24T15:00:00.000Z');
  const alunos = new Map<string, AlunoDaCentral>([
    ['a1', { id: 'a1', nome: 'Joana Teste', telefone: '5549999110001', portalStudentId: 'stu_1', portalNome: 'Joana Teste' }],
    ['a2', { id: 'a2', nome: 'Pedro Exemplo', telefone: '5549999110002' }],
    ['a3', { id: 'a3', nome: 'Bia Inventada', menor: true, responsavelTelefone: '5549999110003', portalStudentId: 'stu_3', portalNome: 'Bia Inventada' }],
  ]);
  const conversas = new Map<string, ConversaDaCentral>([
    ['c1', { id: 'c1', nome: 'Joana Teste', waId: '5549999110001', alunoId: 'a1', setor: 'recepcao', janelaAte: op.janela === false ? '2026-11-20T10:00:00.000Z' : '2026-11-25T10:00:00.000Z' }],
    ['c2', { id: 'c2', nome: 'Pedro', waId: '5549999110002', alunoId: 'a2', setor: 'recepcao', janelaAte: '2026-11-25T10:00:00.000Z' }],
    ['c3', { id: 'c3', nome: 'Marta Inventada', waId: '5549999110003', setor: 'kids', janelaAte: '2026-11-25T10:00:00.000Z' }],
  ]);
  const provas = new Map<string, ProvaNoPortal[]>([
    ['stu_1', [provaDe('m1', 'bloqueada'), provaDe('m2', 'liberada'), provaDe('m3', 'iniciada'), provaDe('m4', 'concluida'), provaDe('m5', 'bloqueada', false)]],
    ['stu_3', [provaDe('k1', 'bloqueada')]],
  ]);
  const portalAlunos = new Map<string, AlunoNoPortal>([
    ['stu_1', { id: 'stu_1', nome: 'Joana Teste', emailMascarado: 'jo***@exemplo.com', telefoneFinal: '0001', turma: 'A2 Noite', nivel: 'A2', ativo: true }],
    ['stu_2', { id: 'stu_2', nome: 'Pedro Exemplo', emailMascarado: 'pe***@exemplo.com', telefoneFinal: '0002', turma: 'B1', nivel: 'B1', ativo: true }],
    ['stu_3', { id: 'stu_3', nome: 'Bia Inventada', emailMascarado: '', telefoneFinal: '', turma: 'Kids 2', nivel: 'Kids 2', ativo: true }],
  ]);

  const conta = { busca: 0, aluno: 0, provas: 0, libera: 0, link: 0 };
  const chavesDeLiberacao: string[] = [];
  /* o que o portal faz na próxima chamada de cada tipo (a de liberar pode demorar) */
  const roteiro: {
    libera: (RespostaDoPortal<LiberacaoConfirmada> | 'normal')[]; liberaDemora: number;
    link: (RespostaDoPortal<{ link: string; expiraEm: string }> | 'normal')[];
    provas: (RespostaDoPortal<{ alunoId: string; atualizadoEm: string; provas: ProvaNoPortal[] }> | 'normal')[];
    aluno: (RespostaDoPortal<AlunoNoPortal> | 'normal')[];
    linkDoPortal: string;
  } = { libera: [], liberaDemora: 0, link: [], provas: [], aluno: [], linkDoPortal: 'https://nexusenglish.com.br/aluno/provas/' };
  const ja: Map<string, LiberacaoConfirmada> = new Map();

  const portal: Dependencias['portal'] = {
    configurado: () => op.configurado !== false,
    hostsDoLink: () => [],
    async buscaAlunos() { conta.busca += 1; return { ok: true, dados: [...portalAlunos.values()] }; },
    async aluno(id) {
      conta.aluno += 1;
      const r = roteiro.aluno.shift();
      if (r && r !== 'normal') return r;
      const a = portalAlunos.get(id);
      return a ? { ok: true, dados: a } : { ok: false, tipo: 'recusado', codigo: 'aluno_nao_encontrado', mensagem: '', incerto: false };
    },
    async provas(id) {
      conta.provas += 1;
      const r = roteiro.provas.shift();
      if (r && r !== 'normal') return r;
      return { ok: true, dados: { alunoId: id, atualizadoEm: agora.toISOString(), provas: provas.get(id) || [] } };
    },
    async libera(id, provaId, chave) {
      conta.libera += 1;
      chavesDeLiberacao.push(chave);
      if (roteiro.liberaDemora) await espera(roteiro.liberaDemora);
      const r = roteiro.libera.shift();
      if (r && r !== 'normal') return r;
      /* a mesma chave devolve a mesma liberação (o que o contrato pede ao portal) */
      const antes = ja.get(chave);
      if (antes) return { ok: true, dados: antes };
      const lib = { id: `lib_${ja.size + 1}`, alunoId: id, provaId, estado: 'liberada', liberadaEm: agora.toISOString(), expiraEm: '', link: `${roteiro.linkDoPortal}${provaId}` };
      ja.set(chave, lib);
      const p = provas.get(id)?.find((x) => x.id === provaId);
      if (p) { p.estado = 'liberada'; p.podeLiberar = false; }
      return { ok: true, dados: lib };
    },
    async link(id, provaId) {
      conta.link += 1;
      const r = roteiro.link.shift();
      if (r && r !== 'normal') return r;
      return { ok: true, dados: { link: `${roteiro.linkDoPortal}${provaId}`, expiraEm: '' } };
    },
  };

  const ops = new Map<string, OperacaoDaProva>();
  const travas = new Map<string, string>();
  const log: LinhaDoLog[] = [];
  const vinculos: { alunoId: string; portalStudentId: string | null }[] = [];
  const registro: Dependencias['registro'] = {
    async aluno(id) { const a = alunos.get(id); return a ? { ...a } : null; },
    async alunoPeloPortal(pid) { return [...alunos.values()].find((a) => a.portalStudentId === pid) || null; },
    async conversa(id) { const c = conversas.get(id); return c ? { ...c } : null; },
    async modeloDaProvaAprovado() { return op.modelo === true; },
    async gravaVinculo(alunoId, v) {
      const a = alunos.get(alunoId);
      if (a) { a.portalStudentId = v?.portalStudentId || null; a.portalNome = v?.portalNome || null; }
      vinculos.push({ alunoId, portalStudentId: v?.portalStudentId || null });
    },
    /* sem await entre conferir e gravar: é o que a transação do Firestore garante */
    async comecaLiberacao(o) {
      const existente = ops.get(o.id);
      if (existente) return { existente: structuredClone(existente) };
      const trava = travas.get(idDaTrava(o.alunoId, o.provaId));
      const dona = trava ? ops.get(trava) : undefined;
      if (dona && seguraATrava(dona.liberacao.estado)) return { ocupada: structuredClone(dona) };
      ops.set(o.id, structuredClone(o));
      travas.set(idDaTrava(o.alunoId, o.provaId), o.id);
      return { criada: true };
    },
    async operacao(id) { const o = ops.get(id); return o ? structuredClone(o) : null; },
    async ultimaOperacao(alunoId, provaId) {
      const l = [...ops.values()].filter((o) => o.alunoId === alunoId && o.provaId === provaId).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm) || 1);
      return l[0] ? structuredClone(l[0]) : null;
    },
    async criaOperacao(o) { ops.set(o.id, structuredClone(o)); },
    async atualizaLiberacao(id, campos, soltaTrava) {
      const o = ops.get(id);
      if (!o) return;
      o.liberacao = { ...o.liberacao, ...campos };
      if (soltaTrava && travas.get(idDaTrava(o.alunoId, o.provaId)) === id) travas.delete(idDaTrava(o.alunoId, o.provaId));
    },
    async comecaEnvio(opId, envio) {
      const o = ops.get(opId);
      if (!o) throw new Error('sem operação');
      const igual = o.envios.find((e) => e.chave === envio.chave);
      if (igual) return { existente: { ...igual } };
      const saindo = o.envios.find((e) => e.estado === 'enviando');
      if (saindo) return { ocupado: { ...saindo } };
      o.envios.push({ ...envio });
      return { criado: true };
    },
    async terminaEnvio(opId, chave, campos) {
      const e = ops.get(opId)?.envios.find((x) => x.chave === chave);
      if (e) Object.assign(e, campos);
    },
    async anota(l) { log.push(l); },
  };

  const enviadas: { conversaId: string; canal: string; texto: string; operacaoId: string }[] = [];
  const whats = { falhaNaProxima: false };
  const mensageiro: Dependencias['mensageiro'] = {
    async envia(p) {
      await espera(5);
      if (whats.falhaNaProxima) { whats.falhaNaProxima = false; return { ok: false, erro: 'número sem WhatsApp' }; }
      enviadas.push({ conversaId: p.conversa.id, canal: p.canal, texto: p.texto, operacaoId: p.operacaoId });
      return { ok: true, waMessageId: `wamid.${enviadas.length}`, mensagemId: `m${enviadas.length}` };
    },
  };

  const d: Dependencias = { portal, registro, mensageiro, agora: () => agora };
  return { d, conta, roteiro, ops, travas, log, enviadas, whats, alunos, vinculos, chavesDeLiberacao };
}

const indisponivel: FalhaDoPortal = { ok: false, tipo: 'indisponivel', codigo: 'tempo_esgotado', mensagem: '', incerto: true };
const status = (r: { ok: boolean; status?: number; codigo?: string }) => (r.ok ? 'ok' : `${r.status} ${r.codigo}`);

/* ================= regras puras ================= */

igual('permissões', [
  podeNoPortal('recepcao', 'liberar'), podeNoPortal('recepcao', 'vincular'), podeNoPortal('recepcao', 'desvincular'),
  podeNoPortal('coordenacao', 'vincular'), podeNoPortal('coordenacao', 'reenviar'), podeNoPortal('professor', 'consultar'), podeNoPortal(undefined, 'consultar'),
], [true, true, false, false, true, false, false]);
igual('chave de idempotência', [chaveValida('3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'), chaveValida('123'), chaveValida(undefined)], [true, false, false]);
igual('link só do portal e em https', [
  linkValido('https://nexusenglish.com.br/aluno/provas/m1'), linkValido('https://app.nexusenglish.com.br/p/1'),
  linkValido('http://nexusenglish.com.br/p'), linkValido('https://nexusenglish.com.br.golpe.com/p'),
  linkValido('https://usuario:senha@nexusenglish.com.br/p'), linkValido('javascript:alert(1)'), linkValido('https://outro.com/p', ['outro.com']),
], [true, true, false, false, false, false, true]);
igual('canal: texto na janela, modelo fora, nada sem modelo', [
  canalDoEnvio({ temConversa: true, janelaAberta: true, modeloAprovado: false }),
  canalDoEnvio({ temConversa: true, janelaAberta: false, modeloAprovado: true }),
  'erro' in canalDoEnvio({ temConversa: true, janelaAberta: false, modeloAprovado: false }),
  'erro' in canalDoEnvio({ temConversa: false, janelaAberta: true, modeloAprovado: true }),
], [{ canal: 'texto' }, { canal: 'modelo' }, true, true]);
igual('mensagem para o próprio aluno', mensagemDaProva({ nomeDoContato: 'Joana Teste', nomeDoAluno: 'Joana Teste', ehResponsavel: false, titulo: 'A2 Módulo 1', link: 'https://nexusenglish.com.br/p/1' }),
  'Oi, Joana! A sua prova A2 Módulo 1 já está liberada no portal do aluno. É só entrar com o seu login por este link:\nhttps://nexusenglish.com.br/p/1');
igual('mensagem para o responsável fala do aluno', mensagemDaProva({ nomeDoContato: 'Marta Inventada', nomeDoAluno: 'Bia Inventada', ehResponsavel: true, titulo: 'Kids 2', link: 'https://nexusenglish.com.br/p/2' }).startsWith('Oi, Marta! A prova Kids 2 do(a) Bia'), true);
const envioAceito: EnvioDaProva = { chave: 'x', estado: 'aceito', waMessageId: 'w', por: RECEPCAO, em: '' };
igual('aceita pela Meta é diferente de entregue', [
  situacaoDaMensagem({ estado: 'enviando' }), situacaoDaMensagem(envioAceito), situacaoDaMensagem(envioAceito, { entregueEm: '2026-11-24T15:01:00Z' }),
  situacaoDaMensagem(envioAceito, { entregueEm: 'x', lidoEm: 'y' }), situacaoDaMensagem(envioAceito, { falhouEm: 'z' }), situacaoDaMensagem({ estado: 'falhou' }),
], ['enviando', 'aceita', 'entregue', 'lida', 'falhou', 'falhou']);
igual('ações por estado da prova', [
  acoesDaProva({ estado: 'bloqueada', podeLiberar: true }), acoesDaProva({ estado: 'liberada', podeLiberar: false }).reenviar,
  acoesDaProva({ estado: 'concluida', podeLiberar: false }).liberar,
  acoesDaProva({ estado: 'bloqueada', podeLiberar: true }, { liberacao: { estado: 'sem_confirmacao', pedidaEm: '', pedidaPor: RECEPCAO }, envios: [] }),
], [{ liberar: true, retomar: false, reenviar: false, motivo: '' }, true, false, { liberar: false, retomar: true, reenviar: false, motivo: 'O portal não confirmou a liberação.' }]);

/* o exemplo do documento do contrato passa na leitura; estado novo vira "desconhecido" */
const lida = leProvas({
  aluno_id: 'stu_8f2k1', atualizado_em: '2026-11-24T14:58:00-03:00',
  provas: [
    { id: 'prv_a2_m1', titulo: 'A2 Módulo 1', nivel: 'A2', modulo: '1', estado: 'bloqueada', pode_liberar: true, liberacao: null },
    { id: 'prv_a2_m2', titulo: 'A2 Módulo 2', estado: 'em_revisao', pode_liberar: true },
  ],
});
igual('leitura das provas', [lida?.provas[0].podeLiberar, lida?.provas[1].estado, lida?.provas[1].podeLiberar], [true, 'desconhecido', false]);
igual('resposta fora do contrato é recusada', [leProvas({ provas: 'x' }), leLiberacao({ liberacao: { id: 'l' } })], [null, null]);
/* o vetor de assinatura do documento do contrato (segredo de exemplo, não é chave real) */
igual('texto assinado', textoAssinado(1795543200, 'GET', '/api/central/v1/alunos/stu_8f2k1/provas', ''),
  '1795543200.GET./api/central/v1/alunos/stu_8f2k1/provas.e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
igual('assinatura do GET do documento', assinaPedido('segredo-de-exemplo-nao-usar', 1795543200, 'GET', '/api/central/v1/alunos/stu_8f2k1/provas', ''),
  'v1=ad37e9bfda6248e1af03d59488974ec96943b6572e308f4933451877abedc1e4');
igual('assinatura do POST do documento', assinaPedido('segredo-de-exemplo-nao-usar', 1795543260, 'POST', '/api/central/v1/alunos/stu_8f2k1/provas/prv_a2_m4/liberacoes',
  JSON.stringify({ operador: { id: 'uid_recepcao_ana', nome: 'Ana (Recepção)' }, origem: 'central-chapeco' })),
  'v1=c6427bb099e73e765d719d68c73cc4d5acf44d352286518fe3807d0446afe4f2');
/* cada exemplo JSON do documento do contrato passa na leitura da central: o documento e o
   código não podem divergir */
{
  const doc = readFileSync(new URL('../docs/integracao-provas-portal.md', import.meta.url), 'utf8');
  const blocos = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>);
  const leitores: Record<string, (j: unknown) => unknown> = {
    alunos: leListaDeAlunos, aluno: leAluno, erro: leErro, provas: leProvas, liberacao: leLiberacao, link: leLink,
  };
  const vistos = new Set<string>();
  for (const b of blocos) {
    if ('operador' in b) {
      igual('corpo da liberação no documento', b, { operador: { id: 'uid_recepcao_ana', nome: 'Ana (Recepção)' }, origem: 'central-chapeco' });
      vistos.add('corpo');
      continue;
    }
    const chave = Object.keys(leitores).find((k) => k in b);
    if (!chave) { igual('exemplo do documento sem leitor', Object.keys(b), []); continue; }
    vistos.add(chave);
    igual(`exemplo "${chave}" do documento passa na leitura`, leitores[chave](b) !== null, true);
  }
  igual('o documento traz um exemplo de cada resposta', [...vistos].sort(), ['alunos', 'corpo', 'erro', 'liberacao', 'link', 'provas']);
  const lib = blocos.map((b) => leLiberacao(b)).find(Boolean);
  igual('o link do exemplo é aceito', lib ? linkValido(lib.link) : false, true);
}
igual('erro do portal', leErro({ erro: { codigo: 'prova_em_andamento', mensagem: 'x' } }), { codigo: 'prova_em_andamento', mensagem: 'x' });

/* ================= o fluxo ================= */

async function main() {
  /* ---- não configurado: nada é chamado ---- */
  {
    const c = montaCenario({ configurado: false });
    const r = await provasDoAluno(c.d, { quem: RECEPCAO, alunoId: 'a1' });
    const l = await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave: uuid() });
    igual('sem configuração: indisponível, sem chamar o portal', [status(r), status(l), c.conta.provas + c.conta.libera], ['503 nao_configurado', '503 nao_configurado', 0]);
  }

  /* ---- permissões ---- */
  {
    const c = montaCenario();
    igual('professor não consulta', status(await provasDoAluno(c.d, { quem: PROF, alunoId: 'a1' })), '403 sem_permissao');
    igual('coordenação não vincula', status(await vincula(c.d, { quem: COORD, alunoId: 'a2', portalStudentId: 'stu_2' })), '403 sem_permissao');
    igual('recepção não desvincula', status(await desvincula(c.d, { quem: RECEPCAO, alunoId: 'a1' })), '403 sem_permissao');
    igual('coordenação não manda em conversa de outro setor', status(await liberaEEnvia(c.d, { quem: COORD, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave: uuid() })), '403 sem_permissao');
    igual('nada foi liberado nos negados', c.conta.libera, 0);
  }

  /* ---- vínculo ---- */
  {
    const c = montaCenario();
    igual('busca curta', status(await buscaNoPortal(c.d, { quem: RECEPCAO, busca: 'pe' })), '400 busca_curta');
    const v = await vincula(c.d, { quem: RECEPCAO, alunoId: 'a2', portalStudentId: 'stu_2' });
    igual('vincula o escolhido, conferido no portal', [status(v), c.alunos.get('a2')?.portalStudentId, c.log.at(-1)?.acao, c.log.at(-1)?.quem.uid], ['ok', 'stu_2', 'vinculou', 'u-rec']);
    igual('já vinculado a outro não troca', status(await vincula(c.d, { quem: RECEPCAO, alunoId: 'a1', portalStudentId: 'stu_2' })), '409 ja_vinculado');
    c.alunos.get('a2')!.portalStudentId = null;
    igual('aluno do portal já usado por outro aluno da central', status(await vincula(c.d, { quem: RECEPCAO, alunoId: 'a2', portalStudentId: 'stu_1' })), '409 portal_ja_usado');
    igual('id que o portal não conhece', status(await vincula(c.d, { quem: RECEPCAO, alunoId: 'a2', portalStudentId: 'stu_x' })), '404 aluno_nao_encontrado');
    c.roteiro.aluno.push({ ok: true, dados: { id: 'stu_9', nome: 'Outra Pessoa', emailMascarado: '', telefoneFinal: '', turma: '', nivel: '', ativo: true } });
    igual('portal respondeu com outro aluno: não vincula', [status(await vincula(c.d, { quem: RECEPCAO, alunoId: 'a2', portalStudentId: 'stu_2' })), c.alunos.get('a2')?.portalStudentId], ['502 resposta_invalida', null]);
    igual('gestão desvincula, com registro', [status(await desvincula(c.d, { quem: GESTOR, alunoId: 'a1' })), c.alunos.get('a1')?.portalStudentId, c.log.at(-1)?.acao], ['ok', null, 'desvinculou']);
  }

  /* ---- vínculo incorreto na consulta: lista de outro aluno não aparece ---- */
  {
    const c = montaCenario();
    c.roteiro.provas.push({ ok: true, dados: { alunoId: 'stu_999', atualizadoEm: '', provas: [provaDe('x', 'bloqueada')] } });
    igual('provas de outro aluno não aparecem', status(await provasDoAluno(c.d, { quem: RECEPCAO, alunoId: 'a1' })), '502 resposta_invalida');
    igual('sem vínculo', status(await provasDoAluno(c.d, { quem: RECEPCAO, alunoId: 'a2' })), '409 sem_vinculo');
    igual('conversa de outro aluno', status(await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c2', chave: uuid() })), '409 conversa_de_outro');
  }

  /* ---- janela fechada sem modelo: não libera ---- */
  {
    const c = montaCenario({ janela: false });
    const r = await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave: uuid() });
    igual('janela fechada sem modelo aprovado: nem libera', [status(r), c.conta.libera, c.enviadas.length], ['409 sem_canal', 0, 0]);
  }

  /* ---- o caminho feliz ---- */
  {
    const c = montaCenario();
    const chave = uuid();
    const r = await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave });
    const op = r.ok ? r.dados : null;
    igual('liberou e mandou', [status(r), op?.liberacao.estado, op?.liberacao.portalLiberacaoId, op?.envios.map((e) => e.estado), c.conta.libera, c.chavesDeLiberacao],
      ['ok', 'confirmada', 'lib_1', ['aceito'], 1, [chave]]);
    igual('a mensagem leva o link do portal', [c.enviadas.length, c.enviadas[0]?.canal, c.enviadas[0]?.texto.endsWith('https://nexusenglish.com.br/aluno/provas/m1')], [1, 'texto', true]);
    igual('registro separado da liberação e do envio, com quem fez', c.log.map((l) => `${l.acao}:${l.quem.uid}`), ['pediu_liberacao:u-rec', 'liberacao_confirmada:u-rec', 'enviou:u-rec']);
    igual('a trava foi solta', c.travas.size, 0);
    const de_novo = await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave });
    igual('mesmo pedido de novo: devolve o que houve, sem chamar nada', [status(de_novo), c.conta.libera, c.enviadas.length], ['ok', 1, 1]);
    igual('prova já liberada não se libera de novo', status(await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave: uuid() })), '409 prova_ja_liberada');
  }

  /* ---- clique duplicado ao mesmo tempo ---- */
  {
    const c = montaCenario();
    c.roteiro.liberaDemora = 30;
    const chave = uuid();
    const pedido = { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave };
    const [r1, r2] = await Promise.all([liberaEEnvia(c.d, pedido), liberaEEnvia(c.d, pedido)]);
    igual('dois cliques juntos: uma liberação e uma mensagem', [status(r1), status(r2), c.conta.libera, c.enviadas.length], ['ok', 'ok', 1, 1]);
  }

  /* ---- outra pessoa tenta enquanto uma liberação está em curso ---- */
  {
    const c = montaCenario();
    c.roteiro.liberaDemora = 40;
    const a = liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave: uuid() });
    await espera(10);
    const b = await liberaEEnvia(c.d, { quem: GESTOR, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave: uuid() });
    const ra = await a;
    igual('a segunda não substitui a primeira', [status(b), b.ok ? '' : b.operacao?.liberacao.pedidaPor.uid, status(ra), c.conta.libera, c.enviadas.length],
      ['409 liberacao_em_andamento', 'u-rec', 'ok', 1, 1]);
  }

  /* ---- portal indisponível na liberação: sem confirmação, trava fica, retoma com a mesma chave ---- */
  {
    const c = montaCenario();
    const chave = uuid();
    c.roteiro.libera.push(indisponivel);
    const r = await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave });
    igual('portal calado: sem confirmação, nada mandado, trava segura', [status(r), r.ok ? '' : r.operacao?.liberacao.estado, c.enviadas.length, c.travas.size],
      ['503 sem_confirmacao', 'sem_confirmacao', 0, 1]);
    igual('outra chave não passa por cima', status(await liberaEEnvia(c.d, { quem: GESTOR, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave: uuid() })), '409 liberacao_em_andamento');
    igual('o mesmo pedido sem "retomar" não refaz nada', [status(await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave })), c.conta.libera], ['ok', 1]);
    const retomada = await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave, retomar: true });
    igual('retomar usa a MESMA chave e manda uma vez', [status(retomada), c.chavesDeLiberacao, c.enviadas.length, c.travas.size, c.log.map((l) => l.acao)],
      ['ok', [chave, chave], 1, 0, ['pediu_liberacao', 'liberacao_sem_confirmacao', 'retomou_liberacao', 'liberacao_confirmada', 'enviou']]);
  }

  /* ---- recusa com código que a central não conhece: não destrava ---- */
  {
    const c = montaCenario();
    const chave = uuid();
    c.roteiro.libera.push({ ok: false, tipo: 'recusado', codigo: 'idempotencia_em_processamento', mensagem: '', incerto: false });
    const r = await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave });
    igual('código desconhecido fica sem confirmação, com a trava', [status(r), r.ok ? '' : r.operacao?.liberacao.estado, c.travas.size, c.enviadas.length],
      ['503 sem_confirmacao', 'sem_confirmacao', 1, 0]);
  }

  /* ---- portal fora do ar já na consulta ---- */
  {
    const c = montaCenario();
    c.roteiro.provas.push(indisponivel);
    igual('portal fora do ar na consulta', status(await provasDoAluno(c.d, { quem: RECEPCAO, alunoId: 'a1' })), '503 portal_indisponivel');
    c.roteiro.provas.push(indisponivel);
    const r = await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave: uuid() });
    igual('portal fora do ar antes de liberar: nada criado', [status(r), c.ops.size, c.conta.libera], ['503 portal_indisponivel', 0, 0]);
  }

  /* ---- tentativa já iniciada e prova que não se libera ---- */
  {
    const c = montaCenario();
    igual('prova iniciada não se libera nem reinicia', [status(await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm3', conversaId: 'c1', chave: uuid() })), c.conta.libera], ['409 prova_em_andamento', 0]);
    igual('prova concluída', status(await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm4', conversaId: 'c1', chave: uuid() })), '409 prova_concluida');
    igual('prova bloqueada que o portal não deixa liberar', status(await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm5', conversaId: 'c1', chave: uuid() })), '409 prova_nao_liberavel');
    /* corrida: estava bloqueada na consulta, mas o portal diz que alguém já liberou */
    c.roteiro.libera.push({ ok: false, tipo: 'recusado', codigo: 'prova_ja_liberada', mensagem: '', incerto: false });
    const r = await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave: uuid() });
    igual('já liberada por fora: não manda sozinho, solta a trava', [status(r), r.ok ? '' : r.operacao?.liberacao.estado, c.enviadas.length, c.travas.size],
      ['409 prova_ja_liberada', 'ja_estava_liberada', 0, 0]);
    c.roteiro.libera.push({ ok: false, tipo: 'recusado', codigo: 'prova_nao_liberavel', mensagem: '', incerto: false });
    const recusa = await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a3', provaId: 'k1', conversaId: 'c3', chave: uuid() });
    igual('recusa certa do portal: recusada e destrava', [status(recusa), recusa.ok ? '' : recusa.operacao?.liberacao.estado, c.travas.size], ['409 prova_nao_liberavel', 'recusada', 0]);
  }

  /* ---- falha do WhatsApp depois da liberação, e o reenvio ---- */
  {
    const c = montaCenario();
    c.whats.falhaNaProxima = true;
    const r = await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave: uuid() });
    igual('liberou, mas a mensagem não saiu', [status(r), r.ok ? '' : r.operacao?.liberacao.estado, r.ok ? '' : r.operacao?.envios.map((e) => e.estado), c.enviadas.length],
      ['502 envio_falhou', 'confirmada', ['falhou'], 0]);
    const chaveDoEnvio = uuid();
    const re = await reenvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chaveDoEnvio });
    igual('reenviar manda sem nova liberação', [status(re), c.conta.libera, c.conta.link, c.enviadas.length, re.ok ? re.dados.envios.map((e) => e.estado) : []],
      ['ok', 1, 1, 1, ['falhou', 'aceito']]);
    await reenvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chaveDoEnvio });
    igual('o mesmo reenvio de novo não manda duas vezes', [c.enviadas.length, c.conta.link], [1, 1]);
    igual('registro: liberação e envios separados', c.log.map((l) => l.acao), ['pediu_liberacao', 'liberacao_confirmada', 'envio_falhou', 'enviou']);
  }

  /* ---- reenviar prova liberada direto no portal, e link fora do portal ---- */
  {
    const c = montaCenario();
    const re = await reenvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm2', conversaId: 'c1', chaveDoEnvio: uuid() });
    igual('liberada no portal: manda o link e registra como externa', [status(re), re.ok ? re.dados.liberacao.estado : '', c.conta.libera, c.enviadas.length], ['ok', 'externa', 0, 1]);
    c.roteiro.link.push({ ok: true, dados: { link: 'https://golpe.example.com/prova', expiraEm: '' } });
    const ruim = await reenvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm2', conversaId: 'c1', chaveDoEnvio: uuid() });
    igual('link fora do portal não é mandado', [status(ruim), c.enviadas.length], ['502 envio_falhou', 1]);
    c.roteiro.link.push({ ok: false, tipo: 'recusado', codigo: 'prova_nao_liberada', mensagem: '', incerto: false });
    igual('sem liberação no portal, sem link', status(await reenvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chaveDoEnvio: uuid() })), '409 prova_nao_liberada');
    igual('responsável recebe a mensagem falando do aluno', status(await reenvia(c.d, { quem: RECEPCAO, alunoId: 'a3', provaId: 'k1', conversaId: 'c3', chaveDoEnvio: uuid() })), 'ok');
    igual('texto para o responsável', c.enviadas.at(-1)?.texto.startsWith('Oi, Marta! A prova'), true);
  }

  /* ---- o portal libera o aluno ou a prova errada ---- */
  {
    const c = montaCenario();
    c.roteiro.libera.push({ ok: true, dados: { id: 'lib_x', alunoId: 'stu_999', provaId: 'm1', estado: 'liberada', liberadaEm: '', expiraEm: '', link: 'https://nexusenglish.com.br/p/m1' } });
    const r = await liberaEEnvia(c.d, { quem: RECEPCAO, alunoId: 'a1', provaId: 'm1', conversaId: 'c1', chave: uuid() });
    igual('resposta de outro aluno: nada mandado, fica sem confirmação', [status(r), r.ok ? '' : r.operacao?.liberacao.estado, c.enviadas.length], ['502 resposta_invalida', 'sem_confirmacao', 0]);
  }

  console.log(falhas ? `\n${falhas} falha(s)` : 'provas do portal: tudo certo');
  process.exit(falhas ? 1 : 0);
}

void main();
