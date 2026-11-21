/* Dados fictícios da agenda no banco de verdade, para a escola testar antes de usar.
   Só a administração. "semear" grava a mesma semente da demonstração com `teste: true`
   (professores, alunos, aulas, séries, bloqueios e log); "limpar" apaga tudo o que tem
   essa marca. Os alunos fictícios não têm telefone: nenhum lembrete sai para ninguém.
   "curriculo" cria só os módulos e as aulas de partida, sem marca, quando ainda não há
   nenhum: é o currículo de verdade, que a escola edita depois. */
import { NextResponse } from 'next/server';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { adminBd, quemChamou } from '@/lib/firebase/admin';
import { aulasPadrao, MODULOS_PADRAO, semente } from '@/lib/dominio/agenda-exemplo';
import { descreveErro, falhou } from '@/lib/saude';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Escrita = { ref: DocumentReference; dados?: Record<string, unknown> };

async function escreve(bd: Firestore, lista: Escrita[]) {
  for (let i = 0; i < lista.length; i += 400) {
    const lote = bd.batch();
    for (const e of lista.slice(i, i + 400)) {
      if (e.dados) lote.set(e.ref, e.dados); else lote.delete(e.ref);
    }
    await lote.commit();
  }
}

/* o currículo de partida entra uma vez só, e não sai no limpar */
async function curriculo(bd: Firestore) {
  const ja = await bd.collection('modulos').limit(1).get();
  if (!ja.empty) return 0;
  const lista: Escrita[] = [
    ...MODULOS_PADRAO.map((m) => ({ ref: bd.doc(`modulos/${m.id}`), dados: { ...m, ativo: true } })),
    ...aulasPadrao().map((a) => ({ ref: bd.doc(`aulas/${a.id}`), dados: { ...a } })),
  ];
  await escreve(bd, lista);
  return lista.length;
}

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return NextResponse.json({ ok: false, erro: 'Faça login de novo.' }, { status: 401 });
  if (quem.papel !== 'admin') return NextResponse.json({ ok: false, erro: 'Só a administração mexe nos dados de teste.' }, { status: 403 });
  const { acao } = (await req.json().catch(() => ({}))) as { acao?: string };
  const bd = adminBd();

  try {
    if (acao === 'curriculo') {
      const n = await curriculo(bd);
      return NextResponse.json({ ok: true, mensagem: n ? `Currículo criado: ${n} módulos e aulas.` : 'O currículo já existia; nada mudou.' });
    }

    if (acao === 'semear') {
      const ja = await bd.collection('agendamentos').where('teste', '==', true).limit(1).get();
      if (!ja.empty) return NextResponse.json({ ok: false, erro: 'Os dados de teste já estão no banco. Limpe antes de carregar de novo.' });
      await curriculo(bd);
      const s = semente(new Date(), { prefixo: 'teste-', teste: true, criadoPor: quem.uid });
      const agora = new Date().toISOString();
      const lista: Escrita[] = [
        ...s.professores.map((p) => ({
          ref: bd.doc(`perfis/${p.id}`),
          dados: { ...p, papel: 'professor', setores: [], avisaNoWhats: false, ativo: true, daAula: true, criadoEm: agora, teste: true },
        })),
        ...s.alunos.map((a) => ({ ref: bd.doc(`alunos/${a.id}`), dados: { ...a } })),
        ...s.recorrencias.map((r) => ({ ref: bd.doc(`recorrencias/${r.id}`), dados: { ...r } })),
        ...s.bloqueios.map((b) => ({ ref: bd.doc(`bloqueios/${b.id}`), dados: { ...b } })),
        ...s.logs.map((l) => ({ ref: bd.doc(`logs_agenda/${l.id}`), dados: { ...l } })),
      ];
      for (const a of s.agendamentos) {
        const { alunosDaAula, ...ag } = a;
        lista.push({ ref: bd.doc(`agendamentos/${ag.id}`), dados: { ...ag } });
        for (const x of alunosDaAula) lista.push({ ref: bd.doc(`agendamentos/${ag.id}/alunos/${x.alunoId}`), dados: { ...x, teste: true } });
      }
      await escreve(bd, lista);
      return NextResponse.json({
        ok: true,
        mensagem: `Dados de teste carregados: ${s.professores.length} professores, ${s.alunos.length} alunos, ${s.agendamentos.length} aulas, ${s.bloqueios.length} bloqueios.`,
      });
    }

    if (acao === 'limpar') {
      const lista: Escrita[] = [];
      for (const c of ['perfis', 'alunos', 'recorrencias', 'bloqueios', 'logs_agenda']) {
        const r = await bd.collection(c).where('teste', '==', true).get();
        r.docs.forEach((d) => lista.push({ ref: d.ref }));
      }
      const ags = await bd.collection('agendamentos').where('teste', '==', true).get();
      for (const d of ags.docs) {
        const filhos = await d.ref.collection('alunos').get();
        filhos.docs.forEach((f) => lista.push({ ref: f.ref }));
        lista.push({ ref: d.ref });
      }
      await escreve(bd, lista);
      return NextResponse.json({ ok: true, mensagem: `Dados de teste apagados (${lista.length} registros).` });
    }

    return NextResponse.json({ ok: false, erro: 'Ação desconhecida.' }, { status: 400 });
  } catch (e) {
    await falhou('agendadas', `Dados de teste da agenda: ${descreveErro(e)}`);
    return NextResponse.json({ ok: false, erro: 'Não consegui gravar agora. Tente de novo em um minuto.' }, { status: 500 });
  }
}
