/* Prova da comemoração de transferência: quem aparece e o que diz.
   Rodar:  node --experimental-strip-types testes/festa.ts  */
import { festaDaTransferencia, quemRecebe } from '../src/lib/dominio/festa.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}

const equipe = [
  { nome: 'Guilherme Correa', papel: 'admin' as const, setores: ['recepcao', 'financeiro', 'coordenacao', 'kids'] as const, ativo: true },
  { nome: 'Natan Silva', papel: 'coordenacao' as const, setores: ['coordenacao'] as const, ativo: true },
  { nome: 'Karina', papel: 'coordenacao' as const, setores: ['kids'] as const, ativo: true },
].map((p) => ({ ...p, setores: [...p.setores] }));

igual('coordenação é do Natan', quemRecebe('coordenacao', equipe), 'Natan');
igual('Kids é da Karina', quemRecebe('kids', equipe), 'Karina');
igual('financeiro é o setor, não pessoa', quemRecebe('financeiro', equipe), undefined);
igual('admin com todos os setores não conta como dono', quemRecebe('coordenacao', [equipe[0]]), undefined);
igual('inativo não recebe', quemRecebe('kids', [{ ...equipe[2], ativo: false }]), undefined);
igual('dois donos: fala do setor', quemRecebe('kids', [equipe[2], { ...equipe[2], nome: 'Outra' }]), undefined);

const natan = festaDaTransferencia('coordenacao', 'Natan', 0);
igual('título com o nome, sem artigo', natan.titulo, 'Transferido para Natan!');
igual('frase com o nome', natan.frase, 'Bucha passada, Natan! 🎯');
igual('inicial no avatar', natan.inicial, 'N');
const fin = festaDaTransferencia('financeiro', undefined, 0.99);
igual('setor com artigo', fin.titulo, 'Transferido para o Financeiro!');
igual('sorteio no fim da lista não estoura', fin.frase, 'Agora é com quem entende de boleto 😎');
igual('sem pessoa, sem inicial', fin.inicial, undefined);
igual('recepção com artigo', festaDaTransferencia('recepcao', undefined, 0).titulo, 'Transferido para a Recepção!');
igual('sorteio 1 não estoura', festaDaTransferencia('kids', 'Karina', 1).frase, 'Chegou presente pra Karina 🎁');

if (falhas) {
  console.log(`festa: ${falhas} caso(s) falharam`);
  process.exit(1);
}
console.log('festa: todos os casos passaram');
