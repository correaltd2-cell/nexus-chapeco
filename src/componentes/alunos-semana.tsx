'use client';
/* A marcação da semana na planilha de alunos: quantos ativos já marcaram a aula da
   semana seguinte, quem não marcou (o gargalo 2), e o botão de começar a semana nova,
   que guarda a semana que acabou e desmarca a coluna Marcou, como a escola fazia
   apagando os "yes". As regras moram em dominio/alunos.ts; no sistema publicado quem
   grava é /api/alunos/semana, na demonstração a própria tela. */
import { useCallback, useEffect, useState } from 'react';
import { assina, grava, modoDemo } from '@/lib/dados/fonte';
import { useSessao } from '@/componentes/sessao';
import { avisa } from '@/componentes/aviso';
import { horaConhecida, useAgora } from '@/componentes/relogio';
import { fechaSemana, horasDesde, idDaSemana, situacaoDoAluno, type AlunoDaGrade, type RegistroDaSemana } from '@/lib/dominio/alunos';
import { dataHoraBR } from '@/lib/dominio/formato';

type Semana = RegistroDaSemana & { id: string };
const PODE = ['admin', 'gestor', 'recepcao'];

export default function SemanaDaMarcacao({ alunos, aoVerQuemNaoMarcou }: { alunos: AlunoDaGrade[]; aoVerQuemNaoMarcou: () => void }) {
  const { perfil, usuario } = useSessao();
  const pode = Boolean(perfil && PODE.includes(perfil.papel));
  const [semanas, setSemanas] = useState<Semana[] | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);

  const pede = useCallback(async (metodo: 'GET' | 'POST') => {
    if (!usuario) throw new Error('sem login');
    const r = await fetch('/api/alunos/semana', { method: metodo, headers: { authorization: `Bearer ${await usuario.getIdToken()}` } });
    return (await r.json()) as { ok: boolean; erro?: string; semanas?: Semana[]; limpos?: number };
  }, [usuario]);

  useEffect(() => {
    if (modoDemo) {
      return assina('semanas', (d) => setSemanas((d as unknown as Semana[]).sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 12)));
    }
    if (!usuario) return;
    let vivo = true;
    pede('GET').then((r) => { if (vivo && r.ok) setSemanas(r.semanas || []); }, () => undefined);
    return () => { vivo = false; };
  }, [usuario, pede]);

  const ativos = alunos.filter((a) => situacaoDoAluno(a) === 'ativo');
  const marcaram = ativos.filter((a) => a.marcouSemana === true).length;
  const nao = ativos.length - marcaram;
  const ultima = semanas?.[0];
  const agora = useAgora();
  const horas = horaConhecida(agora) ? horasDesde(ultima?.quando, agora.toISOString()) : null;

  async function comeca() {
    setIndo(true); setErro('');
    try {
      if (modoDemo) {
        const quando = new Date().toISOString();
        const { registro, limpar } = fechaSemana(alunos, quando, perfil?.nome || 'Equipe');
        await grava([
          { tipo: 'definir', colecao: 'semanas', id: idDaSemana(quando), campos: { ...registro } },
          ...limpar.map((id) => ({ tipo: 'atualizar' as const, colecao: 'alunos', id, campos: { marcouSemana: false, atualizadoEm: quando } })),
        ]);
      } else {
        const r = await pede('POST');
        if (!r.ok) { setErro(r.erro || 'Não consegui começar a semana nova.'); return; }
        const g = await pede('GET');
        if (g.ok) setSemanas(g.semanas || []);
      }
      avisa('Semana nova começada: a coluna Marcou está limpa');
      setConfirmando(false);
    } catch {
      setErro('Não consegui falar com o servidor. Tente de novo em instantes.');
    } finally {
      setIndo(false);
    }
  }

  if (!ativos.length) return null;

  const parte = ativos.length ? (marcaram / ativos.length) * 100 : 0;

  /* uma linha só, em cima da planilha: a planilha é que precisa da altura da tela */
  return (
    <section className="alu-sem" aria-label="Marcação da próxima semana">
      <div className="alu-sem-linha">
        <span className="alu-sem-tit">Próxima semana</span>
        <span className="alu-sem-barra" role="img" aria-label={`${Math.round(parte)}% marcaram`}><span style={{ width: `${parte}%` }} /></span>
        <span className="alu-sem-conta"><b className="num">{marcaram}</b> de <b className="num">{ativos.length}</b> ativos marcaram</span>
        {nao > 0 && <button type="button" className="tx-btn alu-sem-nao" onClick={aoVerQuemNaoMarcou}>{nao} ainda não</button>}
        <span className="alu-sem-fim">
          {semanas && semanas.length > 0 && (
            <details className="alu-sem-hist">
              <summary>Semanas anteriores</summary>
              <ul>
                {semanas.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="alu-sem-item" aria-expanded={aberta === s.id} onClick={() => setAberta(aberta === s.id ? null : s.id)}>
                      <span>Fechada em {dataHoraBR(s.quando)}, por {s.quem}</span>
                      <span className="num">{s.marcaram} de {s.ativos} marcaram{s.naoMarcaram ? `, ${s.naoMarcaram} não` : ''}</span>
                    </button>
                    {aberta === s.id && (
                      <p className="alu-sem-nomes">
                        {s.quemNaoMarcou.length
                          ? <>Não marcaram: {s.quemNaoMarcou.map((q) => (q.codigo ? `${q.nome} (${q.codigo})` : q.nome)).join(', ')}.</>
                          : 'Todos os ativos marcaram.'}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {pode && !confirmando && (
            <button type="button" className="btn alu-sem-btn" onClick={() => { setConfirmando(true); setErro(''); }}>Começar a semana nova</button>
          )}
        </span>
      </div>

      {confirmando && (
        <div className="frm alu-sem-conf">
          <p>
            Isso guarda esta semana no histórico ({marcaram} marcaram, {nao} não marcaram) e desmarca a coluna Marcou dos {ativos.length} ativos,
            para a recepção marcar de novo conforme cada aluno escolhe o horário.
          </p>
          {horas !== null && horas < 48 && (
            <p className="obs alerta">A última semana começou há {horas < 1 ? 'menos de uma hora' : `${Math.floor(horas)} ${Math.floor(horas) === 1 ? 'hora' : 'horas'}`}. Confira se não é a mesma.</p>
          )}
          {erro && <p className="erro">{erro}</p>}
          <div className="ln">
            <button type="button" className="btn p" disabled={indo} onClick={() => void comeca()}>{indo ? 'Começando...' : 'Começar a semana nova'}</button>
            <button type="button" className="btn" disabled={indo} onClick={() => setConfirmando(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}
