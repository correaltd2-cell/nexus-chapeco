/* Equipe: criar login, trocar papel, tirar e devolver acesso, dar senha nova.
   Tudo com a chave de servico, porque o navegador nao pode criar usuario. A senha
   provisoria aparece UMA vez na tela de quem criou: nao depende de SMTP configurado,
   e nao fica guardada em lugar nenhum.

   Quem tem historico nao é apagado, é desativado: conversa, cartao e correcao de
   prova apontam para o uid, e apagar deixaria buraco no registro do aluno. */
import { NextResponse } from 'next/server';
import { adminAuth, adminBd, quemChamou } from '@/lib/firebase/admin';
import { MODULOS_POR_PAPEL_OK } from '@/lib/dominio/equipe';
import type { Papel, Setor } from '@/lib/dominio/tipos';

export const dynamic = 'force-dynamic';

const LETRAS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const senhaProvisoria = () =>
  Array.from({ length: 10 }, () => LETRAS[Math.floor(Math.random() * LETRAS.length)]).join('');

const erro = (texto: string, status = 400) =>
  NextResponse.json({ ok: false, erro: texto }, { status });

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
      return erro('Não consegui criar o login. Tente de novo.');
    }
  }

  if (!corpo.uid) return erro('Falta dizer de quem é o acesso.');

  if (corpo.acao === 'senha') {
    const senha = senhaProvisoria();
    await auth.updateUser(corpo.uid, { password: senha });
    return NextResponse.json({ ok: true, senha });
  }

  if (corpo.acao === 'acesso') {
    const ativo = corpo.ativo !== false;
    await auth.updateUser(corpo.uid, { disabled: !ativo });
    await bd.doc(`perfis/${corpo.uid}`).update({ ativo });
    return NextResponse.json({ ok: true });
  }

  if (corpo.acao === 'papel') {
    const papel = corpo.papel;
    if (!papel || !MODULOS_POR_PAPEL_OK.includes(papel)) return erro('Papel desconhecido.');
    await auth.setCustomUserClaims(corpo.uid, { papel });
    await bd.doc(`perfis/${corpo.uid}`).update({ papel, setores: corpo.setores || [] });
    return NextResponse.json({ ok: true });
  }

  return erro('Não entendi o que fazer.');
}
