/* Equipe: criar login, trocar papel, tirar e devolver acesso, dar senha nova.
   Tudo com a chave de servico, porque o navegador nao pode criar usuario. A senha
   provisoria aparece UMA vez na tela de quem criou: nao depende de SMTP configurado,
   e nao fica guardada em lugar nenhum.

   Quem tem historico nao é apagado, é desativado: conversa, cartao e correcao de
   prova apontam para o uid, e apagar deixaria buraco no registro do aluno.

   Quem já está na equipe sem login (os professores que vieram do ELLO, por exemplo)
   ganha o login com o MESMO id do cadastro (acao 'login', 26/11/2026): as aulas dele
   apontam para esse id, e um login com id novo duplicaria o professor e deixaria a
   agenda dele vazia. GET diz quem já tem login. */
import { NextResponse } from 'next/server';
import { adminAuth, adminBd, quemChamou } from '@/lib/firebase/admin';
import { MODULOS_POR_PAPEL_OK, explicaErroDoLogin } from '@/lib/dominio/equipe';
import { falhou } from '@/lib/saude';
import type { Papel, Setor } from '@/lib/dominio/tipos';

export const dynamic = 'force-dynamic';

const LETRAS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const senhaProvisoria = () =>
  Array.from({ length: 10 }, () => LETRAS[Math.floor(Math.random() * LETRAS.length)]).join('');

const erro = (texto: string, status = 400) =>
  NextResponse.json({ ok: false, erro: texto }, { status });

const semLogin = (e: unknown) => String((e as { code?: string }).code || '').includes('user-not-found');

/* Recusa que não é do dia a dia (e-mail repetido, e-mail inválido): anota na Saúde do
   sistema e devolve o motivo de verdade, nunca só "tente de novo". */
async function recusa(e: unknown, oQue: string) {
  const texto = explicaErroDoLogin(e, oQue);
  const err = (e || {}) as { code?: unknown; message?: unknown };
  await falhou('equipe', `${String(err.code || '')} ${String(err.message || e || '')}`.trim().slice(0, 300));
  return erro(texto, 500);
}

/** Quem da equipe já tem login, e se está bloqueado. Só a gestão pergunta. */
export async function GET(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return erro('Faça login de novo.', 401);
  if (quem.papel !== 'admin' && quem.papel !== 'gestor') return erro('Só a administração mexe na equipe.', 403);
  /* id de login do Firebase: até 128 caracteres, sem barra */
  const ids = (await adminBd().collection('perfis').select().get()).docs.map((d) => d.id).filter((id) => id.length <= 128 && !id.includes('/'));
  const logins: Record<string, { email: string; bloqueado: boolean }> = {};
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const r = await adminAuth().getUsers(ids.slice(i, i + 100).map((uid) => ({ uid })));
      for (const u of r.users) logins[u.uid] = { email: u.email || '', bloqueado: u.disabled };
    }
  } catch (e) {
    return recusa(e, 'conferir quem já tem login');
  }
  return NextResponse.json({ ok: true, logins });
}

export async function POST(req: Request) {
  const quem = await quemChamou(req);
  if (!quem) return erro('Faça login de novo.', 401);
  if (quem.papel !== 'admin' && quem.papel !== 'gestor') {
    return erro('Só a administração mexe na equipe.', 403);
  }

  const corpo = (await req.json()) as {
    acao?: string; uid?: string; email?: string; nome?: string;
    papel?: Papel; setores?: Setor[]; ativo?: boolean;
  };
  const bd = adminBd();
  const auth = adminAuth();

  /* só admin cria, promove ou desativa outro admin */
  const mexeComAdmin = corpo.papel === 'admin';
  if (mexeComAdmin && quem.papel !== 'admin') {
    return erro('Só um administrador cria ou promove outro administrador.', 403);
  }
  if (corpo.uid) {
    const alvo = await bd.doc(`perfis/${corpo.uid}`).get();
    if (alvo.data()?.papel === 'admin' && quem.papel !== 'admin') {
      return erro('Só um administrador mexe em outro administrador.', 403);
    }
    if (corpo.uid === quem.uid && (corpo.acao === 'papel' || corpo.acao === 'acesso')) {
      return erro('Ninguém muda o próprio papel nem o próprio acesso.', 400);
    }
  }

  if (corpo.acao === 'criar') {
    const email = (corpo.email || '').trim().toLowerCase();
    const nome = (corpo.nome || '').trim();
    const papel = corpo.papel || 'recepcao';
    if (!email || !nome) return erro('Falta o nome ou o e-mail.');
    if (!MODULOS_POR_PAPEL_OK.includes(papel)) return erro('Papel desconhecido.');

    const senha = senhaProvisoria();
    try {
      const usuario = await auth.createUser({ email, password: senha, displayName: nome });
      await auth.setCustomUserClaims(usuario.uid, { papel });
      await bd.doc(`perfis/${usuario.uid}`).set({
        nome, email, papel,
        setores: corpo.setores || [],
        avisaNoWhats: false,
        ativo: true,
        criadoEm: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, uid: usuario.uid, senha });
    } catch (e) {
      const codigo = (e as { code?: string }).code || '';
      if (codigo.includes('email-already-exists')) return erro('Esse e-mail já tem login.');
      if (codigo.includes('invalid-email')) return erro('Esse e-mail não é válido.');
      return recusa(e, 'criar o login');
    }
  }

  if (!corpo.uid) return erro('Falta dizer de quem é o acesso.');

  /* login para quem já está na equipe, com o mesmo id do cadastro */
  if (corpo.acao === 'login') {
    const email = (corpo.email || '').trim().toLowerCase();
    const ref = bd.doc(`perfis/${corpo.uid}`);
    const perfil = await ref.get();
    if (!perfil.exists) return erro('Essa pessoa não está na equipe.');
    if (!email) return erro('Falta o e-mail.');
    const dados = perfil.data() as { nome?: string; papel?: Papel; setores?: Setor[] };
    const papel = corpo.papel || dados.papel || 'professor';
    if (!MODULOS_POR_PAPEL_OK.includes(papel)) return erro('Papel desconhecido.');
    if (papel === 'admin' && quem.papel !== 'admin') return erro('Só um administrador cria ou promove outro administrador.', 403);
    try {
      await auth.getUser(corpo.uid);
      return erro('Essa pessoa já tem login. Use Senha nova se ela esqueceu a senha.');
    } catch (e) {
      if (!semLogin(e)) return recusa(e, 'conferir o login');
    }
    const senha = senhaProvisoria();
    try {
      await auth.createUser({ uid: corpo.uid, email, password: senha, displayName: dados.nome || email });
      await auth.setCustomUserClaims(corpo.uid, { papel });
      await ref.update({ email, papel, setores: corpo.setores ?? dados.setores ?? [], ativo: true });
      return NextResponse.json({ ok: true, uid: corpo.uid, senha });
    } catch (e) {
      const codigo = (e as { code?: string }).code || '';
      if (codigo.includes('email-already-exists')) return erro('Esse e-mail já tem login.');
      if (codigo.includes('invalid-email')) return erro('Esse e-mail não é válido.');
      return recusa(e, 'criar o login');
    }
  }

  if (corpo.acao === 'senha') {
    const senha = senhaProvisoria();
    try {
      await auth.updateUser(corpo.uid, { password: senha });
    } catch (e) {
      if (semLogin(e)) return erro('Essa pessoa ainda não tem login. Use Criar login na linha dela.');
      return recusa(e, 'gerar a senha');
    }
    return NextResponse.json({ ok: true, senha });
  }

  if (corpo.acao === 'acesso') {
    const ativo = corpo.ativo !== false;
    try { await auth.updateUser(corpo.uid, { disabled: !ativo }); } catch (e) { if (!semLogin(e)) return recusa(e, 'mudar o acesso'); }
    await bd.doc(`perfis/${corpo.uid}`).update({ ativo });
    return NextResponse.json({ ok: true });
  }

  if (corpo.acao === 'papel') {
    const papel = corpo.papel;
    if (!papel || !MODULOS_POR_PAPEL_OK.includes(papel)) return erro('Papel desconhecido.');
    try { await auth.setCustomUserClaims(corpo.uid, { papel }); } catch (e) { if (!semLogin(e)) return recusa(e, 'mudar o papel'); }
    await bd.doc(`perfis/${corpo.uid}`).update({ papel, setores: papel === 'coordenacao' ? corpo.setores || [] : [] });
    return NextResponse.json({ ok: true });
  }

  return erro('Não entendi o que fazer.');
}
