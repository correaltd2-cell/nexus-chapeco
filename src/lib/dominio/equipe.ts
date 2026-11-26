/* Os papeis que a rota de equipe aceita. Fica fora de acessos.ts porque a rota roda
   no servidor e nao pode arrastar nada de tela junto. */
import type { Papel } from './tipos';

export const MODULOS_POR_PAPEL_OK: Papel[] =
  ['admin', 'gestor', 'recepcao', 'coordenacao', 'professor'];

/* Por que o Firebase recusou mexer num login (26/11/2026). Antes a rota respondia só
   "Não consegui ... Tente de novo." e ninguém sabia que o problema era a conta de
   serviço ou o projeto: tentar de novo nunca resolve esses. O código do Firebase vai
   junto, entre parênteses, para quem for consertar achar o caso certo. */
export function explicaErroDoLogin(e: unknown, oQue: string): string {
  const err = (e || {}) as { code?: unknown; message?: unknown };
  const codigo = String(err.code || '').replace(/^auth\//, '');
  const mensagem = String(err.message || e || '');
  const com = (texto: string) => `${texto}${codigo ? ` (${codigo})` : ''}`;

  if (/insufficient-permission|PERMISSION_DENIED|does not have permission|serviceusage\.services\.use/i.test(`${codigo} ${mensagem}`)) {
    return com(`Não consegui ${oQue}: a conta de serviço do Firebase (FIREBASE_SERVICE_ACCOUNT, na Vercel) não tem permissão para mexer nos logins. No Google Cloud, IAM, dê a ela o papel "Administrador do Firebase Authentication".`);
  }
  if (/identitytoolkit|Identity Toolkit API|SERVICE_DISABLED/i.test(mensagem)) {
    return com(`Não consegui ${oQue}: a API de login (Identity Toolkit) está desligada no projeto do Firebase. Ligue em Google Cloud, APIs e serviços.`);
  }
  if (/configuration-not-found|CONFIGURATION_NOT_FOUND|project-not-found/i.test(`${codigo} ${mensagem}`)) {
    return com(`Não consegui ${oQue}: o projeto da chave de serviço não tem o login do Firebase configurado. Confira se a FIREBASE_SERVICE_ACCOUNT da Vercel é do mesmo projeto do sistema.`);
  }
  if (/operation-not-allowed/i.test(codigo)) {
    return com(`Não consegui ${oQue}: o login por e-mail e senha está desligado no Firebase (Authentication, Método de login).`);
  }
  if (/invalid-credential|invalid_grant|invalid-api-key/i.test(`${codigo} ${mensagem}`)) {
    return com(`Não consegui ${oQue}: a chave de serviço do Firebase foi recusada (pode ter sido apagada ou trocada). Gere uma nova e troque a FIREBASE_SERVICE_ACCOUNT na Vercel.`);
  }
  if (/FIREBASE_SERVICE_ACCOUNT/.test(mensagem)) {
    return `Não consegui ${oQue}: a FIREBASE_SERVICE_ACCOUNT não está nas variáveis da Vercel.`;
  }
  if (/uid-already-exists/i.test(codigo)) {
    return com(`Não consegui ${oQue}: já existe um login com o id dessa pessoa.`);
  }
  if (/invalid-uid/i.test(codigo)) {
    return com(`Não consegui ${oQue}: o id do cadastro dessa pessoa não serve como id de login.`);
  }
  return com(`Não consegui ${oQue}. Tente de novo; se repetir, o motivo está na Saúde do sistema`);
}
