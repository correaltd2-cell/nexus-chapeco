'use client';
/* O bonequinho dando tchau em tela grande quando a pessoa abre o sistema (26/11/2026,
   pedido do cliente: "quando abre o sistema, o bonequinho dando tchau em tela grande,
   tipo em push"). Aparece uma vez por pessoa a cada vez que o sistema abre no navegador,
   some sozinho em menos de 3 segundos e não pega clique: quem chegou já pode ir
   trabalhando por baixo. Quem não quer desliga em Configurações, Seu bonequinho. */
import { useEffect, useState } from 'react';
import { Boneco } from '@/componentes/avatar';
import { chaveDoTchau, DURACAO_DO_TCHAU_MS, leAvatar, saudacao } from '@/lib/dominio/avatar';
import type { Perfil } from '@/lib/dominio/tipos';

const horaDeChapeco = (d: Date) => Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(d));

export default function Tchau({ perfil }: { perfil: Perfil | null }) {
  const [texto, setTexto] = useState<{ titulo: string; frase: string } | null>(null);
  const uid = perfil?.id || '';
  const quer = perfil ? leAvatar(perfil.avatar, perfil.nome).tchau : false;

  useEffect(() => {
    if (!uid || !quer || !perfil) return;
    let jaDeu = false;
    try {
      jaDeu = sessionStorage.getItem(chaveDoTchau(uid)) === '1';
      sessionStorage.setItem(chaveDoTchau(uid), '1');
    } catch { /* sem armazenamento: dá o tchau mesmo assim */ }
    if (jaDeu) return;
    const nome = perfil.nome;
    const abre = setTimeout(() => setTexto(saudacao(nome, horaDeChapeco(new Date()))), 300);
    const fecha = setTimeout(() => setTexto(null), 300 + DURACAO_DO_TCHAU_MS);
    return () => { clearTimeout(abre); clearTimeout(fecha); };
    /* uma vez por pessoa que entrou */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, quer]);

  if (!texto || !perfil) return null;
  const a = leAvatar(perfil.avatar, perfil.nome);
  return (
    <div className="tchau" role="status" aria-live="polite">
      <div className="tchau-cartao" style={{ background: a.fundo }}>
        <Boneco a={a} acenando className="tchau-boneco" />
        <div className="tchau-tx">
          <b>{texto.titulo}</b>
          <span>{texto.frase}</span>
        </div>
      </div>
    </div>
  );
}
