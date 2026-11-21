/* Prova do aviso de mensagem nova: quem recebe, quando, e o que aparece.
   Rodar:  node --experimental-strip-types testes/avisos.ts  */
import { aparelhoSumiu, chegaramAgora, comGente, recebeAviso, textoDoAviso } from '../src/lib/dominio/avisos.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}

/* ---- quem recebe ---- */
igual('recepção recebe da Recepção', recebeAviso({ ativo: true, setores: ['recepcao'] }, 'recepcao'), true);
igual('recepção não recebe do Financeiro', recebeAviso({ ativo: true, setores: ['recepcao'] }, 'financeiro'), false);
igual('Karina recebe do Kids', recebeAviso({ ativo: true, setores: ['kids'] }, 'kids'), true);
igual('inativo não recebe', recebeAviso({ ativo: false, setores: ['recepcao'] }, 'recepcao'), false);
igual('sem setor não recebe', recebeAviso({ ativo: true }, 'recepcao'), false);

/* ---- quando ---- */
igual('atendimento automático desligado: chama gente', comGente({ estado: 'aberta', etapa: 'inicio' }), true);
igual('conversa antiga sem etapa: chama gente', comGente({ estado: 'aberta' }), true);
igual('na saudação: não chama', comGente({ estado: 'aberta', etapa: 'menu' }), false);
igual('com o assistente: não chama', comGente({ estado: 'ia', etapa: 'assistente' }), false);
igual('vendo a próxima aula pelo Minhas aulas: não chama', comGente({ estado: 'aberta', etapa: 'aulas' }), false);
igual('esperando o setor: chama', comGente({ estado: 'aguardando', etapa: 'gente' }), true);
igual('encerrada: não chama', comGente({ estado: 'encerrada' }), false);

/* ---- o que aparece ---- */
igual('aviso com nome e prévia', textoDoAviso({ id: 'c1', nome: 'Bianca Zanella', waId: '5549' }, '🎤 Áudio'), {
  titulo: 'Bianca Zanella', corpo: '🎤 Áudio', link: '/conversas?conversa=c1', tag: 'conversa-c1',
});
igual('sem nome vai o telefone', textoDoAviso({ id: 'c2', nome: '', waId: '5549999' }, 'oi').titulo, '+5549999');
igual('prévia vazia', textoDoAviso({ id: 'c2', nome: 'A', waId: '1' }, '  ').corpo, 'Mensagem nova');
igual('prévia longa é cortada', textoDoAviso({ id: 'c2', nome: 'A', waId: '1' }, 'a'.repeat(300)).corpo.length, 140);
igual('quebra de linha vira espaço', textoDoAviso({ id: 'c2', nome: 'A', waId: '1' }, 'oi\n\ntudo bem').corpo, 'oi tudo bem');

/* ---- o que chegou agora ---- */
const antes = new Map([['c1', 0], ['c2', 2]]);
igual('primeira olhada não avisa', chegaramAgora(null, [{ id: 'c1', naoLidas: 3 }]), []);
igual('subiu avisa', chegaramAgora(antes, [{ id: 'c1', naoLidas: 1 }, { id: 'c2', naoLidas: 2 }]), ['c1']);
igual('leu (desceu) não avisa', chegaramAgora(antes, [{ id: 'c2', naoLidas: 0 }]), []);
igual('conversa nova com mensagem avisa', chegaramAgora(antes, [{ id: 'c9', naoLidas: 1 }]), ['c9']);

igual('aparelho que sumiu', [aparelhoSumiu('messaging/registration-token-not-registered'), aparelhoSumiu('messaging/internal-error')], [true, false]);

if (falhas) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log('avisos: tudo certo.');
