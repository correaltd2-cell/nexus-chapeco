/* A planilha de alunos no servidor: lê a planilha do Google com a conta de serviço,
   confere com os alunos do sistema e aplica. As regras moram em dominio/planilha.ts.
   A conta de serviço é a mesma do Firebase (ou GOOGLE_SERVICE_ACCOUNT, se existir): a
   escola só compartilha a planilha com o e-mail dela, como leitor, e liga a API do
   Google Sheets no projeto. Nada de chave nova. */
import 'server-only';
import { JWT } from 'google-auth-library';
import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import {
  lePlanilha, planeja, vinculaConversas, type AlunoDoSistema, type Leitura, type Mapa, type Plano,
} from '@/lib/dominio/planilha';
import { falhou, descreveErro } from '@/lib/saude';

export interface ResumoDaAtualizacao {
  quando: string;
  quem: string;
  titulo: string;
  aba: string;
  lidos: number;
  ativos: number;
  novos: number;
  atualizados: number;
  iguais: number;
  foraDaPlanilha: number;
  vinculadas: number;
  problemas: number;
}

export interface ConfigDaPlanilha {
  planilhaId: string;
  aba: string;
  titulo?: string;
  mapa?: Mapa;
  automatico: boolean;
  ultima?: ResumoDaAtualizacao;
  erro?: { quando: string; motivo: string } | null;
}

export class ErroDaPlanilha extends Error {}

function conta() {
  const bruto = process.env.GOOGLE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto) throw new ErroDaPlanilha('O servidor está sem a conta de serviço do Google.');
  const c = JSON.parse(bruto) as { client_email: string; private_key: string; project_id: string };
  return { email: c.client_email, chave: c.private_key.replace(/\\n/g, '\n'), projeto: c.project_id };
}

/** O e-mail com quem a escola compartilha a planilha (não é segredo: é um endereço) e o
    projeto onde a API do Google Sheets precisa estar ligada. */
export function emailDaConta() {
  try { return conta().email; } catch { return ''; }
}
export function projetoDaConta() {
  try { return conta().projeto; } catch { return ''; }
}

async function pede<T>(caminho: string): Promise<T> {
  const c = conta();
  const jwt = new JWT({ email: c.email, key: c.chave, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const { token } = await jwt.getAccessToken();
  if (!token) throw new ErroDaPlanilha('O Google não deu acesso à conta de serviço.');
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${caminho}`, { headers: { authorization: `Bearer ${token}` } });
  if (r.ok) return (await r.json()) as T;
  const corpo = (await r.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
  const msg = corpo.error?.message || '';
  if (r.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(`${msg} ${corpo.error?.status || ''}`)) {
    throw new ErroDaPlanilha(`A API do Google Sheets está desligada no projeto ${c.projeto}. Ligue em console.cloud.google.com/apis/library/sheets.googleapis.com?project=${c.projeto} e tente de novo em alguns minutos.`);
  }
  if (r.status === 403) throw new ErroDaPlanilha(`A planilha não está compartilhada com o sistema. No Google Sheets, toque em Compartilhar e adicione ${c.email} como leitor.`);
  if (r.status === 404) throw new ErroDaPlanilha('Não achei essa planilha. Confira o link.');
  if (r.status === 400 && /parse range|Unable to parse/i.test(msg)) throw new ErroDaPlanilha('Não achei essa aba na planilha. Escolha outra.');
  throw new ErroDaPlanilha(`O Google recusou a leitura (${r.status}). ${msg}`.trim());
}

export async function abasDa(planilhaId: string) {
  const d = await pede<{ properties?: { title?: string }; sheets?: { properties?: { title?: string } }[] }>(
    `${planilhaId}?fields=properties.title,sheets.properties.title`,
  );
  return { titulo: d.properties?.title || 'Planilha', abas: (d.sheets || []).map((s) => s.properties?.title || '').filter(Boolean) };
}

async function linhasDa(planilhaId: string, aba: string): Promise<string[][]> {
  const faixa = encodeURIComponent(`'${aba.replace(/'/g, "''")}'`);
  const d = await pede<{ values?: string[][] }>(`${planilhaId}/values/${faixa}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`);
  return d.values || [];
}

async function alunosDoSistema(bd: Firestore): Promise<AlunoDoSistema[]> {
  const s = await bd.collection('alunos').get();
  return s.docs.map((d) => ({ ...(d.data() as Omit<AlunoDoSistema, 'id'>), id: d.id }));
}

export interface Conferencia {
  titulo: string;
  abas: string[];
  aba: string;
  leitura: Omit<Leitura, 'alunos'> & { total: number; ativos: number };
  amostra: Leitura['alunos'];
  plano: { novos: number; atualizados: number; iguais: number; foraDaPlanilha: number; exemplosNovos: string[]; exemplosAtualizados: string[]; exemplosFora: string[] };
  vincular: number;
}

/** Lê e compara, sem gravar nada: é o que a tela mostra antes de importar. */
export async function confere(bd: Firestore, cfg: { planilhaId: string; aba?: string; mapa?: Mapa }) {
  const { titulo, abas } = await abasDa(cfg.planilhaId);
  const aba = cfg.aba && abas.includes(cfg.aba) ? cfg.aba : abas[0];
  if (!aba) throw new ErroDaPlanilha('A planilha não tem nenhuma aba.');
  const leitura = lePlanilha(await linhasDa(cfg.planilhaId, aba), cfg.mapa);
  const existentes = await alunosDoSistema(bd);
  const plano = planeja(leitura, existentes);
  const conversas = await bd.collection('conversas').select('waId', 'alunoId').get();
  const depois = alunosDepois(existentes, plano);
  const vincular = vinculaConversas(conversas.docs.map((d) => ({ id: d.id, ...(d.data() as { waId: string; alunoId?: string }) })), depois).length;
  const { alunos, ...resto } = leitura;
  const conferencia: Conferencia = {
    titulo, abas, aba,
    leitura: { ...resto, total: alunos.length, ativos: alunos.filter((a) => a.ativo).length },
    amostra: alunos.slice(0, 8),
    plano: {
      novos: plano.novos.length, atualizados: plano.atualizados.length, iguais: plano.iguais, foraDaPlanilha: plano.foraDaPlanilha.length,
      exemplosNovos: plano.novos.slice(0, 5).map((n) => n.nome),
      exemplosAtualizados: plano.atualizados.slice(0, 5).map((a) => `${a.nome} (${a.mudou.join(', ') || 'liga à planilha'})`),
      exemplosFora: plano.foraDaPlanilha.slice(0, 5).map((f) => f.nome),
    },
    vincular,
  };
  return { conferencia, plano, existentes, leitura };
}

/* os alunos como ficam depois de aplicar (os novos ganham um id provisório) */
function alunosDepois(existentes: AlunoDoSistema[], plano: Plano, idsNovos?: string[]) {
  const mudados = new Map(plano.atualizados.map((a) => [a.id, a.campos]));
  return [
    ...existentes.filter((e) => !e.teste).map((e) => ({ ...e, ...(mudados.get(e.id) || {}) }) as AlunoDoSistema),
    ...plano.novos.map((n, i) => ({ ...n, id: idsNovos?.[i] || `novo-${i}` }) as AlunoDoSistema),
  ];
}

/** Lê, compara e grava: alunos novos, alunos atualizados e conversas ligadas pelo telefone. */
export async function importa(bd: Firestore, cfg: ConfigDaPlanilha, quem: string): Promise<ResumoDaAtualizacao> {
  try {
    const { conferencia, plano, existentes, leitura } = await confere(bd, cfg);
    const agora = new Date().toISOString();
    const refsNovos = plano.novos.map(() => bd.collection('alunos').doc());
    const ops: ((l: WriteBatch) => void)[] = [];
    plano.novos.forEach((n, i) => ops.push((l) => l.set(refsNovos[i], { ...n, criadoEm: agora, atualizadoEm: agora })));
    plano.atualizados.forEach((a) => ops.push((l) => l.update(bd.doc(`alunos/${a.id}`), { ...a.campos, atualizadoEm: agora })));

    const conversas = await bd.collection('conversas').select('waId', 'alunoId').get();
    const ligar = vinculaConversas(
      conversas.docs.map((d) => ({ id: d.id, ...(d.data() as { waId: string; alunoId?: string }) })),
      alunosDepois(existentes, plano, refsNovos.map((r) => r.id)),
    );
    ligar.forEach((v) => ops.push((l) => l.update(bd.doc(`conversas/${v.conversaId}`), { alunoId: v.alunoId })));

    for (let i = 0; i < ops.length; i += 450) {
      const lote = bd.batch();
      ops.slice(i, i + 450).forEach((op) => op(lote));
      await lote.commit();
    }
    const resumo: ResumoDaAtualizacao = {
      quando: agora, quem, titulo: conferencia.titulo, aba: conferencia.aba,
      lidos: leitura.alunos.length, ativos: conferencia.leitura.ativos,
      novos: plano.novos.length, atualizados: plano.atualizados.length, iguais: plano.iguais,
      foraDaPlanilha: plano.foraDaPlanilha.length, vinculadas: ligar.length, problemas: leitura.problemas.length,
    };
    await bd.doc('config/planilha').set({ ...cfg, aba: conferencia.aba, titulo: conferencia.titulo, ultima: resumo, erro: null }, { merge: true });
    return resumo;
  } catch (e) {
    const motivo = e instanceof ErroDaPlanilha ? e.message : descreveErro(e);
    await bd.doc('config/planilha').set({ erro: { quando: new Date().toISOString(), motivo } }, { merge: true }).catch(() => undefined);
    if (!(e instanceof ErroDaPlanilha)) await falhou('planilha', motivo);
    throw e;
  }
}
