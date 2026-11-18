/* Os papeis que a rota de equipe aceita. Fica fora de acessos.ts porque a rota roda
   no servidor e nao pode arrastar nada de tela junto. */
import type { Papel } from './tipos';

export const MODULOS_POR_PAPEL_OK: Papel[] =
  ['admin', 'gestor', 'recepcao', 'coordenacao', 'professor'];
