/* Prova da explicação do erro do Firebase ao mexer nos logins da equipe.
   Rodar:  node --experimental-strip-types testes/equipe.ts  */
import { explicaErroDoLogin } from '../src/lib/dominio/equipe.ts';

let falhas = 0;
function tem(nome: string, veio: string, pedaco: string) {
  if (!veio.includes(pedaco)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperava conter ${JSON.stringify(pedaco)}, veio ${JSON.stringify(veio)}`);
  }
}

const err = (code: string, message = '') => Object.assign(new Error(message), { code });

tem('sem permissão fala da conta de serviço',
  explicaErroDoLogin(err('auth/insufficient-permission', 'Credential implementation provided to initializeApp() via the "credential" property has insufficient permission'), 'mudar o papel'),
  'Administrador do Firebase Authentication');
tem('sem permissão leva o código', explicaErroDoLogin(err('auth/insufficient-permission'), 'mudar o papel'), '(insufficient-permission)');
tem('PERMISSION_DENIED da API também é permissão',
  explicaErroDoLogin(err('auth/internal-error', 'PERMISSION_DENIED: Caller does not have required permission'), 'criar o login'),
  'não tem permissão');
tem('API desligada',
  explicaErroDoLogin(err('auth/internal-error', 'Identity Toolkit API has not been used in project 123 before or it is disabled'), 'criar o login'),
  'Identity Toolkit');
tem('projeto sem login', explicaErroDoLogin(err('auth/configuration-not-found'), 'criar o login'), 'mesmo projeto');
tem('e-mail e senha desligado', explicaErroDoLogin(err('auth/operation-not-allowed'), 'criar o login'), 'Método de login');
tem('chave recusada', explicaErroDoLogin(err('app/invalid-credential', 'invalid_grant'), 'mudar o papel'), 'Gere uma nova');
tem('sem a variável', explicaErroDoLogin(new Error('FIREBASE_SERVICE_ACCOUNT nao esta no ambiente'), 'mudar o papel'), 'não está nas variáveis');
tem('o que estava fazendo aparece', explicaErroDoLogin(err('auth/algo-novo'), 'gerar a senha'), 'Não consegui gerar a senha');
tem('erro desconhecido leva o código', explicaErroDoLogin(err('auth/algo-novo'), 'gerar a senha'), '(algo-novo)');
tem('erro sem código não quebra', explicaErroDoLogin(undefined, 'mudar o acesso'), 'Não consegui mudar o acesso');

if (falhas) { console.log(`${falhas} falha(s)`); process.exit(1); }
console.log('equipe: tudo certo');
