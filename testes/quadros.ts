/* Prova das regras dos quadros (src/lib/dominio/quadros.ts): prazo com data e hora,
   atrasado e vence em breve, busca que acha arquivado, etiquetas por nome, fundo,
   ordem das listas e cópia do cartão. Os nomes são inventados.
   Rodar:  node --experimental-strip-types testes/quadros.ts  */
import {
  FUNDOS, apagaEtiqueta, arquivadosNaBusca, bateNaBusca, copiaDoCartao, criaEtiqueta, estadoDoPrazo, etiquetasDoQuadro,
  filtrosVazios, fundoDoQuadro, juntaPrazo, mudaEtiqueta, partesDoPrazo, passaNosFiltros, quantosFiltros, reordenaListas,
  textoDoPrazo, vencido, ETIQUETAS_PADRAO,
} from '../src/lib/dominio/quadros.ts';
import type { Cartao, Lista } from '../src/lib/dominio/tipos.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}

const agora = new Date(2026, 10, 24, 12, 0);   // 24/11/2026 12:00, hora local
const cartao = (d: Partial<Cartao> & { id: string }): Cartao => ({
  quadroId: 'q1', listaId: 'l1', ordem: 1000, titulo: 'Cartão', descricao: '', etiquetas: [], membros: [], prazoConcluido: false,
  checklist: [], comentarios: [], atividade: [], anexos: [], arquivado: false, criadoEm: '2026-11-20T10:00:00Z', atualizadoEm: '2026-11-20T10:00:00Z', ...d,
});

/* ---- prazo ---- */
igual('sem prazo', estadoDoPrazo({ prazo: undefined, prazoConcluido: false }, agora), null);
igual('hoje sem hora vence só no fim do dia', estadoDoPrazo({ prazo: '2026-11-24', prazoConcluido: false }, agora), 'breve');
igual('hoje às 11h já passou', estadoDoPrazo({ prazo: '2026-11-24T11:00', prazoConcluido: false }, agora), 'atrasado');
igual('hoje às 15h vence em breve', estadoDoPrazo({ prazo: '2026-11-24T15:00', prazoConcluido: false }, agora), 'breve');
igual('ontem sem hora atrasado', estadoDoPrazo({ prazo: '2026-11-23', prazoConcluido: false }, agora), 'atrasado');
igual('daqui a 3 dias normal', estadoDoPrazo({ prazo: '2026-11-27T09:00', prazoConcluido: false }, agora), 'normal');
igual('concluído não atrasa', estadoDoPrazo({ prazo: '2026-11-20', prazoConcluido: true }, agora), 'concluido');
igual('vencido usa a hora', vencido(cartao({ id: 'x', prazo: '2026-11-24T11:59' }), agora), true);
igual('textos do prazo', [
  textoDoPrazo('2026-11-24T15:00', agora), textoDoPrazo('2026-11-25', agora), textoDoPrazo('2026-11-23T09:30', agora),
  textoDoPrazo('2026-11-30T08:05', agora), textoDoPrazo('2027-01-03', agora),
], ['Hoje 15:00', 'Amanhã', 'Ontem 09:30', '30/11 08:05', '03/01/2027']);
igual('juntar data e hora', [juntaPrazo('2026-11-25', '14:30'), juntaPrazo('2026-11-25', ''), juntaPrazo('', '14:30')], ['2026-11-25T14:30', '2026-11-25', '']);
igual('partes do prazo', [partesDoPrazo('2026-11-25T14:30'), partesDoPrazo('2026-11-25'), partesDoPrazo(undefined)],
  [{ data: '2026-11-25', hora: '14:30' }, { data: '2026-11-25', hora: '' }, { data: '', hora: '' }]);

/* ---- busca e filtros ---- */
const nomes: Record<string, string> = { u1: 'Natan', u2: 'Karina' };
const nomeDe = (id: string) => nomes[id];
const c1 = cartao({ id: 'c1', titulo: 'Reposição da Larissa', etiquetas: ['Reposição'], membros: ['u1'], urgencia: 'urgente',
  checklist: [{ id: 'i', texto: 'Ver vaga na sexta', feito: false }] });
const c2 = cartao({ id: 'c2', titulo: 'Boleto atrasado', descricao: 'Mandar a 2ª via', arquivado: true, atualizadoEm: '2026-11-22T10:00:00Z' });
const c3 = cartao({ id: 'c3', titulo: 'Boleto de outubro', arquivado: true, quadroId: 'q2' });
igual('busca sem acento e por palavras', [bateNaBusca(c1, 'reposicao larissa'), bateNaBusca(c1, 'vaga sexta'), bateNaBusca(c1, 'natan', nomeDe), bateNaBusca(c1, 'urgente'), bateNaBusca(c1, 'karina', nomeDe)], [true, true, true, true, false]);
igual('arquivado não aparece no quadro', passaNosFiltros(c2, filtrosVazios()), false);
igual('arquivado aparece na busca, só do quadro', arquivadosNaBusca([c1, c2, c3], 'q1', 'boleto').map((c) => c.id), ['c2']);
igual('sem busca, nenhum arquivado', arquivadosNaBusca([c2], 'q1', '  ').length, 0);
igual('filtro de urgência', [passaNosFiltros(c1, { ...filtrosVazios(), urgencias: ['urgente'] }), passaNosFiltros(c1, { ...filtrosVazios(), urgencias: ['baixa'] })], [true, false]);
igual('busca não conta como filtro', quantosFiltros({ ...filtrosVazios(), busca: 'x', urgencias: ['alta'], soVencidos: true }), 2);

/* ---- etiquetas ---- */
igual('quadro sem etiquetas usa as padrão', etiquetasDoQuadro({}).length, ETIQUETAS_PADRAO.length);
const base = [{ nome: 'Matrícula', cor: 'vd' }, { nome: 'Urgente da semana', cor: 'vm' }];
igual('etiqueta nova', criaEtiqueta(base, '  Ligar  amanhã ', 'az'), { lista: [...base, { nome: 'Ligar amanhã', cor: 'az' }] });
igual('etiqueta repetida', criaEtiqueta(base, 'matricula', 'az'), { erro: 'Já existe a etiqueta matricula.' });
const comEtiqueta = [cartao({ id: 'a', etiquetas: ['Matrícula', 'Prova'] }), cartao({ id: 'b', etiquetas: ['Prova'] })];
igual('renomear leva os cartões junto', mudaEtiqueta(base, comEtiqueta, 'Matrícula', 'Matrícula nova', 'lr'), {
  lista: [{ nome: 'Matrícula nova', cor: 'lr' }, { nome: 'Urgente da semana', cor: 'vm' }],
  cartoes: [{ id: 'a', etiquetas: ['Matrícula nova', 'Prova'] }],
});
igual('trocar só a cor não mexe nos cartões', (mudaEtiqueta(base, comEtiqueta, 'Matrícula', 'Matrícula', 'am') as { cartoes: unknown[] }).cartoes, []);
igual('apagar tira dos cartões', apagaEtiqueta(base, comEtiqueta, 'Matrícula').cartoes, [{ id: 'a', etiquetas: ['Prova'] }]);

/* ---- fundo ---- */
igual('sem fundo', [fundoDoQuadro({}), fundoDoQuadro({ fundo: 'padrao' })], [null, null]);
igual('fundo pronto', fundoDoQuadro({ fundo: 'oceano' })?.escuro, true);
igual('imagem só com https', [fundoDoQuadro({ fundo: 'imagem', fundoImagem: 'javascript:x' }), Boolean(fundoDoQuadro({ fundo: 'imagem', fundoImagem: 'https://x.com/a.jpg' }))], [null, true]);
igual('ids dos fundos únicos', new Set(FUNDOS.map((f) => f.id)).size, FUNDOS.length);

/* ---- listas e cópia ---- */
const listas: Lista[] = ['A', 'B', 'C', 'D'].map((n, i) => ({ id: n, quadroId: 'q1', nome: n, ordem: (i + 1) * 1000, arquivada: false }));
igual('arrastar D para antes de B', reordenaListas(listas, 'D', 'B'), [{ id: 'D', ordem: 2000 }, { id: 'B', ordem: 3000 }, { id: 'C', ordem: 4000 }]);
igual('arrastar A para o fim', reordenaListas(listas, 'A', null), [{ id: 'B', ordem: 1000 }, { id: 'C', ordem: 2000 }, { id: 'D', ordem: 3000 }, { id: 'A', ordem: 4000 }]);
const copia = copiaDoCartao({ ...c1, conversaId: 'conv', comentarios: [{ id: 'k', autorId: 'u', autorNome: 'X', texto: 'oi', criadoEm: 'x' }] }, 1500, 'Natan', '2026-11-24T15:00:00Z');
igual('cópia', [copia.titulo, copia.ordem, copia.comentarios.length, 'conversaId' in copia, copia.checklist[0].feito, copia.urgencia], ['Reposição da Larissa (cópia)', 1500, 0, false, false, 'urgente']);

console.log(falhas ? `\n${falhas} falha(s)` : 'quadros: tudo certo');
process.exit(falhas ? 1 : 0);
