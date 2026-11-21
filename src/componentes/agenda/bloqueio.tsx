'use client';
/* Bloqueio: feriado, férias, reunião ou indisponível, da escola inteira ou de um
   professor. É tipo próprio: nunca aula falsa nem professor inventado. */
import { useState } from 'react';
import { useSessao } from '@/componentes/sessao';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import { excluiBloqueio, gravaBloqueio } from '@/lib/dados/agenda';
import { BLOQUEIOS, permissoesDe, type Bloqueio, type TipoBloqueio } from '@/lib/dominio/agenda';
import { paraCampoDeHora } from '@/lib/dominio/formato';
import type { Cadastros } from './dados';

export type AberturaDeBloqueio = { bloqueio?: Bloqueio; inicio?: string; fim?: string };

export default function ModalDoBloqueio({ abertura, cad, aoFechar }: { abertura: AberturaDeBloqueio; cad: Cadastros; aoFechar: () => void }) {
  const { perfil } = useSessao();
  const pode = permissoesDe(perfil?.papel).bloquear;
  const b = abertura.bloqueio;
  const [tipo, setTipo] = useState<TipoBloqueio>(b?.tipo || 'feriado');
  const [professorId, setProfessorId] = useState(b?.professorId || '');
  const [inicio, setInicio] = useState(() => paraCampoDeHora(b?.inicio || abertura.inicio ? new Date(b?.inicio || abertura.inicio || '') : new Date()));
  const [fim, setFim] = useState(() => {
    if (b?.fim || abertura.fim) return paraCampoDeHora(new Date(b?.fim || abertura.fim || ''));
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return paraCampoDeHora(d);
  });
  const [motivo, setMotivo] = useState(b?.motivo || '');
  const [erro, setErro] = useState('');
  const [confirma, setConfirma] = useState(false);

  async function salva() {
    if (!perfil) return;
    if (!inicio || !fim || new Date(fim) <= new Date(inicio)) { setErro('O fim precisa ser depois do início.'); return; }
    try {
      await gravaBloqueio({ id: perfil.id, nome: perfil.nome, papel: perfil.papel }, {
        id: b?.id, tipo, professorId: professorId || null, motivo,
        inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString(), criadoPor: b?.criadoPor, criadoEm: b?.criadoEm,
      });
      avisa('Bloqueio salvo');
      aoFechar();
    } catch { setErro('Não consegui salvar o bloqueio.'); }
  }
  async function apaga() {
    if (!b) return;
    if (!confirma) { setConfirma(true); return; }
    await excluiBloqueio(b.id);
    avisa('Bloqueio excluído');
    aoFechar();
  }

  return (
    <div className="mod ag-mod" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <form className="mod-c ag-mc pequeno" role="dialog" aria-modal="true" aria-label="Bloqueio" onSubmit={(e) => { e.preventDefault(); void salva(); }}>
        <header className="ag-mh">
          <h2>{b ? 'Bloqueio' : 'Novo bloqueio'}</h2>
          <button type="button" className="ib" aria-label="Fechar" onClick={aoFechar}><Ic n="x" /></button>
        </header>
        <div className="ag-mb">
          <p className="obs">O horário bloqueado aparece cinza listrado na agenda e não aceita aula sem aviso de conflito.</p>
          <div className="ag-campos">
            <div className="ag-c largo"><span>Tipo</span>
              <div className="ag-seg" role="group" aria-label="Tipo do bloqueio">
                {(Object.keys(BLOQUEIOS) as TipoBloqueio[]).map((t) => (
                  <button key={t} type="button" aria-pressed={tipo === t} disabled={!pode} onClick={() => setTipo(t)}>{BLOQUEIOS[t]}</button>
                ))}
              </div>
            </div>
            <label className="ag-c largo"><span>De quem</span>
              <select className="cx" value={professorId} disabled={!pode} onChange={(e) => setProfessorId(e.target.value)}>
                <option value="">A escola inteira</option>
                {cad.professores.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
            <label className="ag-c"><span>Início</span>
              <input className="cx num" type="datetime-local" value={inicio} disabled={!pode} onChange={(e) => setInicio(e.target.value)} />
            </label>
            <label className="ag-c"><span>Fim</span>
              <input className="cx num" type="datetime-local" value={fim} disabled={!pode} onChange={(e) => setFim(e.target.value)} />
            </label>
            <label className="ag-c largo"><span>Motivo</span>
              <input className="cx" value={motivo} disabled={!pode} placeholder="Ex.: Feriado municipal, Férias da Paula" onChange={(e) => setMotivo(e.target.value)} />
            </label>
          </div>
          {erro && <div className="ag-erro" role="alert"><p>{erro}</p></div>}
        </div>
        {pode && (
          <footer className="ag-mf">
            {b && <button type="button" className={confirma ? 'btn perigo' : 'tx-btn perigo'} onClick={() => void apaga()}>{confirma ? 'Confirmar exclusão' : 'Excluir'}</button>}
            <span className="ag-mf-meio" />
            <button type="submit" className="btn p">Salvar bloqueio</button>
          </footer>
        )}
      </form>
    </div>
  );
}
