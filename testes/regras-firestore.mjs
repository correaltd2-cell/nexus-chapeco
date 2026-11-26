/* Prova das regras do Firestore (firestore.rules) no emulador: quem lê e grava o quê,
   papel por papel (26/11/2026). Dados inventados; nada toca o banco de verdade.
   Recepção vê tudo do atendimento; Natan e Karina (coordenação) só o setor de cada um;
   o professor só as aulas dele; quem está sem acesso, nada.
   Rodar (precisa de Java):  npm run test:regras
   (sobe o emulador do Firestore pelo firebase-tools e roda este arquivo) */
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, addDoc, updateDoc, collection, query, where } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-nexus',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
});
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const bd = ctx.firestore();
  const perfil = (id, papel, extra = {}) => setDoc(doc(bd, 'perfis', id), { nome: id, papel, ativo: true, setores: [], ...extra });
  await perfil('adm', 'admin');
  await perfil('rec', 'recepcao');
  await perfil('natan', 'coordenacao', { setores: ['coordenacao'] });
  await perfil('karina', 'coordenacao', { setores: ['kids'] });
  await setDoc(doc(bd, 'perfis', 'semsetor'), { nome: 'x', papel: 'coordenacao', ativo: true });
  await perfil('prof', 'professor');
  await perfil('prof2', 'professor');
  await perfil('fora', 'recepcao', { ativo: false });
  for (const [id, setor] of [['c1', 'recepcao'], ['c2', 'coordenacao'], ['c3', 'kids']]) await setDoc(doc(bd, 'conversas', id), { setor, nome: id, naoLidas: 1 });
  for (const [id, c] of [['m1', 'c1'], ['m2', 'c2'], ['m3', 'c3']]) await setDoc(doc(bd, 'mensagens', id), { conversaId: c, texto: 'oi', criadaEm: '2026-11-26' });
  const aula = (id, professorId) => ({ inicio: '2026-11-27T21:30:00.000Z', fim: '2026-11-27T22:30:00.000Z', status: 'agendado', professorId, alunoIds: ['al1'], alunos: [{ id: 'al1', nome: 'A', presenca: null }], modalidade: 'presencial' });
  await setDoc(doc(bd, 'agendamentos', 'g1'), aula('g1', 'prof'));
  await setDoc(doc(bd, 'agendamentos', 'g2'), aula('g2', 'prof2'));
  await setDoc(doc(bd, 'agendamentos/g1/alunos', 'al1'), { alunoId: 'al1', nomeAluno: 'A', presenca: null, obs: '' });
  await setDoc(doc(bd, 'agendamentos/g2/alunos', 'al1'), { alunoId: 'al1', nomeAluno: 'A', presenca: null, obs: '' });
  await setDoc(doc(bd, 'alunos', 'al1'), { nome: 'A', telefone: '5549999999999' });
  await setDoc(doc(bd, 'quadros', 'q1'), { nome: 'Recepção' });
  await setDoc(doc(bd, 'cartoes', 'k1'), { titulo: 'x' });
  await setDoc(doc(bd, 'agendadas', 'ag1'), { conversaId: 'c1' });
  await setDoc(doc(bd, 'bloqueios', 'b1'), { tipo: 'reuniao', professorId: 'prof', inicio: 'a', fim: 'b' });
  await setDoc(doc(bd, 'modulos', 'mo1'), { nome: 'A' });
  await setDoc(doc(bd, 'provas_portal', 'op1'), { alunoId: 'al1' });
  await setDoc(doc(bd, 'config', 'atendimento'), { x: 1 });
});

let falhas = 0;
async function deve(nome, pode, promessa) {
  try {
    if (pode) await assertSucceeds(promessa); else await assertFails(promessa);
  } catch (e) {
    falhas += 1;
    console.log(`  x ${nome}: esperava ${pode ? 'PODE' : 'NÃO PODE'} (${String(e.message || e).slice(0, 140)})`);
  }
}
const como = (uid) => env.authenticatedContext(uid).firestore();
const nota = (conversaId) => ({ conversaId, autor: 'humano', texto: 'nota', criadaEm: '2026-11-26' });

/* recepção: tudo do atendimento */
{
  const bd = como('rec');
  await deve('recepção lista todas as conversas', true, getDocs(collection(bd, 'conversas')));
  await deve('recepção lê mensagens da coordenação', true, getDocs(query(collection(bd, 'mensagens'), where('conversaId', '==', 'c2'))));
  await deve('recepção lê uma mensagem pelo id', true, getDoc(doc(bd, 'mensagens', 'm3')));
  await deve('recepção lê quadros', true, getDocs(collection(bd, 'quadros')));
  await deve('recepção lê alunos', true, getDocs(collection(bd, 'alunos')));
  await deve('recepção lê a agenda inteira', true, getDocs(collection(bd, 'agendamentos')));
  await deve('recepção grava nota na conversa', true, addDoc(collection(bd, 'mensagens'), nota('c2')));
}
/* coordenação: só o setor dela */
for (const [uid, meu, outro, meuSetor, outroSetor] of [['natan', 'c2', 'c3', 'coordenacao', 'kids'], ['karina', 'c3', 'c2', 'kids', 'coordenacao']]) {
  const bd = como(uid);
  const [mMeu, mOutro] = [{ c2: 'm2', c3: 'm3' }[meu], { c2: 'm2', c3: 'm3' }[outro]];
  await deve(`${uid}: listar todas as conversas é recusado`, false, getDocs(collection(bd, 'conversas')));
  await deve(`${uid}: lista as conversas do setor dele`, true, getDocs(query(collection(bd, 'conversas'), where('setor', 'in', [meuSetor]))));
  await deve(`${uid}: pedir o setor do outro junto é recusado`, false, getDocs(query(collection(bd, 'conversas'), where('setor', 'in', [meuSetor, outroSetor]))));
  await deve(`${uid}: abre a conversa dele`, true, getDoc(doc(bd, 'conversas', meu)));
  await deve(`${uid}: não abre a conversa do outro`, false, getDoc(doc(bd, 'conversas', outro)));
  await deve(`${uid}: não abre a conversa da recepção`, false, getDoc(doc(bd, 'conversas', 'c1')));
  await deve(`${uid}: lê as mensagens da conversa dele`, true, getDocs(query(collection(bd, 'mensagens'), where('conversaId', '==', meu))));
  await deve(`${uid}: não lê as mensagens do outro`, false, getDocs(query(collection(bd, 'mensagens'), where('conversaId', '==', outro))));
  await deve(`${uid}: lê uma mensagem dele pelo id`, true, getDoc(doc(bd, 'mensagens', mMeu)));
  await deve(`${uid}: não lê mensagem do outro pelo id`, false, getDoc(doc(bd, 'mensagens', mOutro)));
  await deve(`${uid}: não lista todas as mensagens`, false, getDocs(collection(bd, 'mensagens')));
  await deve(`${uid}: grava nota na conversa dele`, true, addDoc(collection(bd, 'mensagens'), nota(meu)));
  await deve(`${uid}: não grava nota na do outro`, false, addDoc(collection(bd, 'mensagens'), nota(outro)));
  await deve(`${uid}: marca a conversa dele como lida`, true, updateDoc(doc(bd, 'conversas', meu), { naoLidas: 0 }));
  await deve(`${uid}: não mexe na conversa do outro`, false, updateDoc(doc(bd, 'conversas', outro), { naoLidas: 0 }));
  await deve(`${uid}: lê quadros e cartões`, true, getDocs(collection(bd, 'cartoes')));
  await deve(`${uid}: vê a agenda inteira`, true, getDocs(collection(bd, 'agendamentos')));
  await deve(`${uid}: lê alunos`, true, getDocs(collection(bd, 'alunos')));
}
await deve('coordenação sem setor não vê conversa nenhuma', false, getDocs(query(collection(como('semsetor'), 'conversas'), where('setor', 'in', ['coordenacao']))));
/* professor: só a agenda dele */
{
  const bd = como('prof');
  await deve('professor: lista as aulas dele', true, getDocs(query(collection(bd, 'agendamentos'), where('professorId', '==', 'prof'))));
  await deve('professor: não lista a agenda inteira', false, getDocs(collection(bd, 'agendamentos')));
  await deve('professor: não pede a semana de todos', false, getDocs(query(collection(bd, 'agendamentos'), where('inicio', '>=', '2026-11-23'))));
  await deve('professor: não pede as aulas de outro', false, getDocs(query(collection(bd, 'agendamentos'), where('professorId', '==', 'prof2'))));
  await deve('professor: abre a aula dele', true, getDoc(doc(bd, 'agendamentos', 'g1')));
  await deve('professor: não abre aula de outro', false, getDoc(doc(bd, 'agendamentos', 'g2')));
  await deve('professor: lê os alunos da aula dele', true, getDocs(collection(bd, 'agendamentos/g1/alunos')));
  await deve('professor: não lê os alunos da aula de outro', false, getDocs(collection(bd, 'agendamentos/g2/alunos')));
  await deve('professor: lança status na aula dele', true, updateDoc(doc(bd, 'agendamentos', 'g1'), { status: 'realizado', atualizadoPor: 'prof', atualizadoEm: 'x' }));
  await deve('professor: não lança na aula de outro', false, updateDoc(doc(bd, 'agendamentos', 'g2'), { status: 'realizado', atualizadoPor: 'prof', atualizadoEm: 'x' }));
  await deve('professor: lança presença na aula dele', true, updateDoc(doc(bd, 'agendamentos/g1/alunos', 'al1'), { presenca: 'presente' }));
  await deve('professor: lê bloqueios, perfis e módulos', true, Promise.all([getDocs(collection(bd, 'bloqueios')), getDocs(collection(bd, 'perfis')), getDocs(collection(bd, 'modulos'))]));
  await deve('professor: não lê conversa', false, getDoc(doc(bd, 'conversas', 'c1')));
  await deve('professor: não lista conversas de setor nenhum', false, getDocs(query(collection(bd, 'conversas'), where('setor', 'in', ['recepcao']))));
  await deve('professor: não lê mensagens', false, getDocs(query(collection(bd, 'mensagens'), where('conversaId', '==', 'c1'))));
  await deve('professor: não lê mensagem pelo id', false, getDoc(doc(bd, 'mensagens', 'm1')));
  await deve('professor: não grava nota', false, addDoc(collection(bd, 'mensagens'), nota('c1')));
  await deve('professor: não lê quadros', false, getDocs(collection(bd, 'quadros')));
  await deve('professor: não lê cartões', false, getDocs(collection(bd, 'cartoes')));
  await deve('professor: não lê mensagens programadas', false, getDocs(collection(bd, 'agendadas')));
  await deve('professor: não lê a ficha dos alunos', false, getDocs(collection(bd, 'alunos')));
  await deve('professor: não lê provas do portal', false, getDocs(collection(bd, 'provas_portal')));
}
/* sem acesso */
{
  const bd = como('fora');
  await deve('inativo: não lê conversa', false, getDoc(doc(bd, 'conversas', 'c1')));
  await deve('inativo: não lê agenda', false, getDocs(collection(bd, 'agendamentos')));
}
await env.cleanup();
if (falhas) { console.log(`regras: ${falhas} falha(s)`); process.exit(1); }
console.log('regras: tudo certo');
