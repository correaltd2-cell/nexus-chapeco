'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, configurado } from '@/lib/firebase/cliente';
import { useSessao } from '@/componentes/sessao';

export default function Entrar() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  const { estado, sair } = useSessao();
  const router = useRouter();

  /* sem Firebase, o sistema roda em demonstracao e nao tem o que logar */
  useEffect(() => { if (!configurado) router.replace('/conversas'); }, [router]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(''); setIndo(true);
    try {
      await signInWithEmailAndPassword(auth(), email.trim(), senha);
      router.replace('/conversas');
    } catch (err) {
      const codigo = (err as { code?: string }).code || '';
      setErro(
        codigo === 'auth/invalid-credential' || codigo === 'auth/wrong-password' || codigo === 'auth/user-not-found'
          ? 'E-mail ou senha não conferem. Confira e tente de novo.'
          : codigo === 'auth/too-many-requests'
            ? 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'
            : 'Não consegui entrar agora. Tente de novo em instantes.',
      );
      setIndo(false);
    }
  }

  if (!configurado) {
    return (
      <div className="login">
        <div className="login-c">
          <span className="eu-foto grande" aria-hidden="true">N</span>
          <h1>Nexus Chapecó</h1>
          <p className="obs forte">O sistema ainda não está ligado ao Firebase.</p>
          <p className="obs">Preencha o arquivo .env.local com as chaves do projeto e recarregue a página.</p>
        </div>
      </div>
    );
  }

  if (estado === 'sem-perfil') {
    return (
      <div className="login">
        <div className="login-c">
          <span className="eu-foto grande" aria-hidden="true">N</span>
          <h1>Acesso ainda não liberado</h1>
          <p className="obs forte">Seu login existe, mas ninguém liberou o acesso ainda.</p>
          <p className="obs">Peça para a administração liberar em Configurações, Equipe.</p>
          <button className="btn" onClick={() => void sair()}>Sair</button>
        </div>
      </div>
    );
  }

  return (
    <div className="login">
      <form className="login-c" onSubmit={enviar}>
        <span className="eu-foto grande" aria-hidden="true">N</span>
        <h1>Nexus Chapecó</h1>
        <p className="obs">Entre com o e-mail da escola.</p>
        <label className="cmp-l" htmlFor="email">E-mail</label>
        <input className="cx" id="email" type="email" autoComplete="username" required
               value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="cmp-l" htmlFor="senha">Senha</label>
        <input className="cx" id="senha" type="password" autoComplete="current-password" required
               value={senha} onChange={(e) => setSenha(e.target.value)} />
        {erro && <p className="erro" role="alert">{erro}</p>}
        <button className="btn p larga" type="submit" disabled={indo}>
          {indo ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
