/* O contato e o aluno: por quem este número fala. Puro, sem import, para valer igual
   na tela e no servidor. Prova em testes/contato.ts:
   node --experimental-strip-types testes/contato.ts */

/**
 * As duas grafias do mesmo celular brasileiro: a Meta às vezes manda o número sem o
 * 9 da frente (554998965170) e o cadastro tem com ele (5549998965170), ou o contrário.
 * O servidor procura o aluno pelas duas.
 */
export function variantesDoTelefone(bruto: string): string[] {
  const d = (bruto || '').replace(/\D/g, '');
  if (!d) return [];
  const com55 = d.startsWith('55') ? d : d.length <= 11 ? `55${d}` : d;
  const saida = new Set([d, com55]);
  if (com55.length === 13 && com55[4] === '9') saida.add(com55.slice(0, 4) + com55.slice(5));
  if (com55.length === 12 && /[6-9]/.test(com55[4])) saida.add(`${com55.slice(0, 4)}9${com55.slice(4)}`);
  return [...saida];
}

/** O mesmo celular, escrito de um jeito ou de outro. */
export function mesmoTelefone(a?: string, b?: string) {
  if (!a || !b) return false;
  const va = variantesDoTelefone(a);
  return variantesDoTelefone(b).some((x) => va.includes(x));
}

/**
 * Por quem este contato fala: o aluno ligado à conversa e, quando o número é de um
 * responsável, os outros alunos dele (irmãos no Kids). O aluno é a chave, não o
 * telefone: o ligado à mão vem primeiro, mesmo que o número não bata.
 */
export function alunosDoContato<A extends { id: string; telefone?: string; responsavelTelefone?: string; ativo: boolean }>(
  alunos: A[], c: { alunoId?: string | null; waId: string },
): A[] {
  const ligado = c.alunoId ? alunos.find((a) => a.id === c.alunoId) : undefined;
  const pelofone = alunos.filter((a) => a.id !== ligado?.id && a.ativo
    && (mesmoTelefone(a.telefone, c.waId) || mesmoTelefone(a.responsavelTelefone, c.waId)));
  return ligado ? [ligado, ...pelofone] : pelofone;
}

/** O contato é o responsável deste aluno (e não o próprio aluno)? */
export const falaComoResponsavel = (
  a: { telefone?: string; responsavelTelefone?: string; responsavelNome?: string; trilha?: string }, waId: string,
) => mesmoTelefone(a.responsavelTelefone, waId)
  || (!mesmoTelefone(a.telefone, waId) && (a.trilha === 'kids' || Boolean(a.responsavelNome)));
