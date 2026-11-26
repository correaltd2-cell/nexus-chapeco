'use client';
/* As conversas que cada pessoa pede ao banco (26/11/2026). Gestão e recepção pedem
   todas; a coordenação pede só as dos setores dela (Natan, Coordenação; Karina,
   Coordenação Kids); o professor não pede nenhuma. O Firestore não filtra pela regra:
   uma consulta que poderia trazer conversa de outro setor é recusada inteira, e a
   coordenação ficava sem ver nem as próprias. Quem decide é conversasQueVe
   (dominio/acessos.ts); as regras do banco conferem o mesmo. */
import { assina, assinaFiltro, type Doc } from './fonte';
import { conversasQueVe } from '@/lib/dominio/acessos';
import type { Papel, Setor } from '@/lib/dominio/tipos';

export function assinaConversas(
  perfil: { papel: Papel; setores?: Setor[] } | null | undefined,
  cb: (docs: Doc[]) => void,
): () => void {
  if (!perfil) { cb([]); return () => {}; }
  const ve = conversasQueVe(perfil.papel, perfil.setores);
  if (ve === 'todas') return assina('conversas', cb);
  if (!ve.length) { cb([]); return () => {}; }
  return assinaFiltro('conversas', [{ campo: 'setor', op: 'in', valor: ve }], cb);
}
