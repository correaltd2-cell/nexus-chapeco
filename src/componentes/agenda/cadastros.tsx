'use client';
/* Os cadastros da agenda, que moram na tela Cadastros junto com os alunos (pedido do
   cliente, 24/11/2026: "seja tudo ali na mesma tela"). Professor não é cadastro novo: é
   a equipe (perfis), com a cor dos blocos e a marca "dá aula" para quem não tem o papel
   de professor. Módulos e aulas do currículo se editam aqui. Os dados de teste ficam com
   a administração. */
import { useState } from 'react';
import { useSessao } from '@/componentes/sessao';
import { avisa } from '@/componentes/aviso';
import { atualiza, define, modoDemo, novoId } from '@/lib/dados/fonte';
import { corDoProfessor, permissoesDe, type Modalidade } from '@/lib/dominio/agenda';
import { ehGestao, NOME_PAPEL } from '@/lib/dominio/acessos';
import { useCadastros, ehProfessor } from './dados';

export default function CadastrosDaAgenda({ parte }: { parte: 'professores' | 'aulas' }) {
  const { perfil, usuario } = useSessao();
  const cad = useCadastros();
  const gestao = perfil ? ehGestao(perfil.papel) : false;
  const cuida = permissoesDe(perfil?.papel).criar;
  const [moduloId, setModuloId] = useState('');
  const [novoModulo, setNovoModulo] = useState('');
  const [novaAula, setNovaAula] = useState({ nivel: '', nome: '' });
  const [teste, setTeste] = useState('');

  const modulo = cad.modulos.find((m) => m.id === moduloId) || cad.modulos[0];
  const aulas = cad.aulas.filter((a) => a.moduloId === modulo?.id);
  const niveis = [...new Set(aulas.map((a) => a.nivel))];
  const equipe = cad.perfis.filter((p) => p.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  async function criaModulo() {
    const nome = novoModulo.trim();
    if (!nome) return;
    await define('modulos', novoId('modulos'), { nome, modalidade: /\bon\b|online/i.test(nome) ? 'online' : 'presencial', ordem: cad.modulos.length + 1, ativo: true });
    setNovoModulo('');
    avisa('Módulo criado');
  }
  async function criaAula() {
    if (!modulo || !novaAula.nome.trim()) return;
    const nivel = novaAula.nivel.trim() || 'Livre';
    const doNivel = aulas.filter((a) => a.nivel === nivel);
    const ordem = doNivel.length ? Math.max(...doNivel.map((a) => a.ordem)) + 1 : (Math.max(0, ...aulas.map((a) => a.ordem)) + 100);
    await define('aulas', novoId('aulas'), { moduloId: modulo.id, nivel, nome: novaAula.nome.trim(), ordem, ativo: true });
    setNovaAula({ nivel, nome: '' });
    avisa('Aula criada');
  }
  async function dadosDeTeste(acao: 'semear' | 'limpar' | 'curriculo') {
    if (modoDemo) { setTeste('Na demonstração os dados de teste já estão carregados. No sistema publicado, estes botões gravam e apagam no banco.'); return; }
    if (!usuario) return;
    setTeste('Trabalhando...');
    try {
      const token = await usuario.getIdToken();
      const r = await fetch('/api/agenda/teste', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ acao }),
      });
      const j = (await r.json()) as { mensagem?: string; erro?: string };
      setTeste(j.mensagem || j.erro || 'Pronto.');
    } catch { setTeste('Não consegui falar com o servidor.'); }
  }

  if (perfil && !cuida) {
    return <p className="vz">Os cadastros da agenda são da recepção, da coordenação e da gestão.</p>;
  }

  if (parte === 'professores') {
    return (
      <div className="cad">
        <section className="bl">
          <p className="bt">Professores</p>
          <p className="vz">Professor é quem tem o papel de professor na equipe, ou quem a gestão marca que dá aula. A cor pinta os blocos dele na agenda.{gestao ? '' : ' Só a gestão muda.'}</p>
          {equipe.map((p, i) => {
            const prof = ehProfessor(p);
            return (
              <div key={p.id} className="lin cad-prof">
                <input type="color" aria-label={`Cor de ${p.nome}`} value={corDoProfessor(p, i)} disabled={!gestao || !prof}
                       onChange={(e) => void atualiza('perfis', p.id, { cor: e.target.value })} />
                <span className="co"><b>{p.nome}</b><small>{NOME_PAPEL[p.papel]}{p.teste ? ' · dado de teste' : ''}</small></span>
                {p.papel === 'professor'
                  ? <span className="cad-tag">Dá aula</span>
                  : (
                    <label className="lig">
                      <input type="checkbox" checked={p.daAula === true} disabled={!gestao}
                             onChange={(e) => void atualiza('perfis', p.id, { daAula: e.target.checked })} />Dá aula
                    </label>
                  )}
              </div>
            );
          })}
          <p className="obs cad-obs">Pessoa nova na equipe entra por Configurações, Equipe{gestao ? '' : ', pela gestão'}; com o papel de professor ela já aparece aqui.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="cad">
      <section className="bl">
        <p className="bt">Módulos</p>
        <p className="vz">O produto que a aula é. A modalidade do módulo vem marcada na aula nova, e dá para trocar.</p>
        {cad.modulos.map((m) => (
          <div key={m.id} className="lin cad-mod">
            <input className="cx" defaultValue={m.nome} aria-label="Nome do módulo"
                   onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== m.nome) void atualiza('modulos', m.id, { nome: e.target.value.trim() }); }} />
            <select className="cx" value={m.modalidade} aria-label="Modalidade" onChange={(e) => void atualiza('modulos', m.id, { modalidade: e.target.value as Modalidade })}>
              <option value="presencial">Presencial</option>
              <option value="online">Online</option>
            </select>
            <label className="lig"><input type="checkbox" checked={m.ativo} onChange={(e) => void atualiza('modulos', m.id, { ativo: e.target.checked })} />Ativo</label>
          </div>
        ))}
        <form className="frm" onSubmit={(e) => { e.preventDefault(); void criaModulo(); }}>
          <div className="ln">
            <input className="cx" placeholder="Novo módulo, ex.: Turma Fixa ON" value={novoModulo} onChange={(e) => setNovoModulo(e.target.value)} />
            <button className="btn" type="submit" disabled={!novoModulo.trim()}>Criar módulo</button>
          </div>
        </form>
      </section>

      <section className="bl">
        <p className="bt">Aulas do currículo</p>
        <div className="chips cad-mods">
          {cad.modulos.map((m) => (
            <button key={m.id} className="chip" aria-pressed={m.id === modulo?.id} onClick={() => setModuloId(m.id)}>{m.nome}</button>
          ))}
        </div>
        {!aulas.length && <p className="vz">Nenhuma aula neste módulo ainda.</p>}
        {niveis.map((n) => (
          <div key={n} className="cad-nivel">
            <p className="cad-nivel-n">{n}</p>
            <div className="cad-aulas">
              {aulas.filter((a) => a.nivel === n).map((a) => (
                <label key={a.id} className={a.ativo ? 'cad-aula' : 'cad-aula off'}>
                  <input type="checkbox" checked={a.ativo} onChange={(e) => void atualiza('aulas', a.id, { ativo: e.target.checked })} />
                  {a.nome}
                </label>
              ))}
            </div>
          </div>
        ))}
        <p className="obs" style={{ padding: '0 18px' }}>Aula desmarcada some da escolha de aula nova; as aulas antigas continuam com ela.</p>
        <form className="frm" onSubmit={(e) => { e.preventDefault(); void criaAula(); }}>
          <div className="ln">
            <input className="cx" placeholder="Nível, ex.: B1" value={novaAula.nivel} onChange={(e) => setNovaAula({ ...novaAula, nivel: e.target.value })} />
            <input className="cx" placeholder="Nome da aula, ex.: B1 - L21" value={novaAula.nome} onChange={(e) => setNovaAula({ ...novaAula, nome: e.target.value })} />
            <button className="btn" type="submit" disabled={!novaAula.nome.trim() || !modulo}>Criar aula em {modulo?.nome || 'módulo'}</button>
          </div>
        </form>
      </section>

      {perfil?.papel === 'admin' && (
        <section className="bl">
          <p className="bt">Dados de teste</p>
          <p className="vz">
            Para testar a agenda antes de usar: 3 professores, 15 alunos, duas semanas de aulas, séries e bloqueios,
            todos marcados como teste. Os alunos de teste não têm telefone, então nenhum lembrete sai. Limpar apaga só o que é de teste.
          </p>
          <div className="frm">
            <div className="ln">
              <button className="btn" onClick={() => void dadosDeTeste('curriculo')}>Criar o currículo de partida</button>
              <button className="btn" onClick={() => void dadosDeTeste('semear')}>Carregar dados de teste</button>
              <button className="btn perigo-claro" onClick={() => void dadosDeTeste('limpar')}>Limpar dados de teste</button>
            </div>
            {teste && <p className="obs">{teste}</p>}
          </div>
        </section>
      )}
    </div>
  );
}
