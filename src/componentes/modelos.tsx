'use client';
/* Os modelos de mensagem na tela.
   EscolheModelo: dentro da conversa, a lista do que a Meta aprovou, os campos já com o
   primeiro nome do contato e a prévia do jeito que o aluno vai ler. Funciona com a
   janela de 24 horas fechada, que é para isso que modelo existe.
   ModelosDeMensagem: a seção das Configurações, com a situação de cada um na Meta.
   As regras moram em src/lib/dominio/modelos.ts. */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { assina, modoDemo } from '@/lib/dados/fonte';
import { Ic } from '@/componentes/icones';
import { avisa } from '@/componentes/aviso';
import {
  BIBLIOTECA, GRUPOS, NOME_DA_CATEGORIA, NOME_DO_ESTADO, faltando, idDoModelo, modelosParaEnviar,
  preenche, valoresIniciais, type CategoriaModelo, type EstadoModelo, type ModeloParaEnviar,
  type SituacaoDoModelo,
} from '@/lib/dominio/modelos';

export function useModelos() {
  const [salvos, setSalvos] = useState<SituacaoDoModelo[]>([]);
  useEffect(() => assina('templates', (d) => setSalvos(d as unknown as SituacaoDoModelo[])), []);
  return salvos;
}

/* ================= na conversa ================= */

export function EscolheModelo({ nomeDoContato, janela, aoFechar, aoEnviar }: {
  nomeDoContato: string;
  janela: boolean;
  aoFechar: () => void;
  aoEnviar: (m: ModeloParaEnviar, valores: string[]) => Promise<boolean>;
}) {
  const salvos = useModelos();
  const lista = useMemo(() => modelosParaEnviar(salvos), [salvos]);
  const emAnalise = salvos.filter((s) => s.daBiblioteca && s.estado === 'em_analise').length;
  const grupos = useMemo(() => [...new Set(lista.map((m) => m.grupo))], [lista]);

  const [grupo, setGrupo] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [escolhidoId, setEscolhidoId] = useState<string | null>(null);
  const [valores, setValores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const escolhido = lista.find((m) => m.situacao.id === escolhidoId) || null;
  const termo = busca.trim().toLowerCase();
  const visiveis = lista.filter((m) => (!grupo || m.grupo === grupo)
    && (!termo || `${m.titulo} ${m.quando} ${m.situacao.corpo}`.toLowerCase().includes(termo)));

  function escolhe(m: ModeloParaEnviar) {
    setEscolhidoId(m.situacao.id);
    setValores(valoresIniciais(m.campos, nomeDoContato));
  }

  async function envia(e: FormEvent) {
    e.preventDefault();
    if (!escolhido || faltando(escolhido.campos, valores).length) return;
    setEnviando(true);
    const foi = await aoEnviar(escolhido, valores);
    setEnviando(false);
    if (foi) aoFechar();
  }

  if (escolhido) {
    const falta = faltando(escolhido.campos, valores);
    const primeiroVazio = valoresIniciais(escolhido.campos, nomeDoContato).findIndex((v) => !v);
    return (
      <form className="mdl" onSubmit={(e) => void envia(e)} aria-label={`Enviar o modelo ${escolhido.titulo}`}>
        <div className="mdl-h">
          <button type="button" className="ib" title="Voltar para a lista" aria-label="Voltar para a lista"
                  onClick={() => setEscolhidoId(null)}>
            <Ic n="volta" />
          </button>
          <span className="mdl-t"><b>{escolhido.titulo}</b><small>{escolhido.quando}</small></span>
          <button type="button" className="ib" title="Fechar" aria-label="Fechar" onClick={aoFechar}><Ic n="x" /></button>
        </div>

        <div className="mdl-corpo">
          {escolhido.campos.length > 0 && (
            <div className="mdl-campos">
              {escolhido.campos.map((c, i) => (
                <label key={i}>
                  <span>{c.rotulo}</span>
                  <input className="cx" value={valores[i] || ''} placeholder={c.exemplo ? `ex.: ${c.exemplo}` : ''}
                         autoFocus={i === primeiroVazio} maxLength={200}
                         onChange={(e) => setValores((vs) => vs.map((v, j) => (j === i ? e.target.value : v)))} />
                </label>
              ))}
            </div>
          )}
          <div className="mdl-previa" aria-label="Como o contato vai ler">
            <div className="w out p">
              <div className="b">
                <span className="tx">{preenche(escolhido.situacao.corpo, valores, escolhido.campos)}</span>
              </div>
              {escolhido.situacao.respostas.length > 0 && (
                <div className="bts-msg">
                  {escolhido.situacao.respostas.map((b) => <span key={b}>{b}</span>)}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="acoes">
          <p className="obs">
            {falta.length
              ? `Falta preencher: ${falta.join(', ')}.`
              : janela
                ? 'O texto sai igual ao aprovado pela Meta, com os botões embaixo.'
                : 'Sai mesmo com a janela de 24 horas fechada. Quando o contato responder, dá para escrever livre de novo.'}
          </p>
          <button type="submit" className="btn p" disabled={enviando || falta.length > 0}>
            {enviando ? 'Enviando...' : 'Enviar modelo'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mdl" role="dialog" aria-label="Escolher modelo">
      <div className="mdl-h">
        <span className="mdl-t"><b>Modelos aprovados</b><small>{lista.length} prontos para enviar</small></span>
        <button type="button" className="ib" title="Fechar" aria-label="Fechar" onClick={aoFechar}><Ic n="x" /></button>
      </div>
      {lista.length > 0 && (
        <>
          <div className="mdl-busca">
            <Ic n="busca" />
            <input value={busca} placeholder="Procurar modelo" aria-label="Procurar modelo" autoFocus
                   onChange={(e) => setBusca(e.target.value)} />
          </div>
          {grupos.length > 1 && (
            <div className="chips mdl-gr">
              <button type="button" className="chip" aria-pressed={!grupo} onClick={() => setGrupo(null)}>Todos</button>
              {grupos.map((g) => (
                <button key={g} type="button" className="chip" aria-pressed={grupo === g}
                        onClick={() => setGrupo(grupo === g ? null : g)}>{g}</button>
              ))}
            </div>
          )}
        </>
      )}
      <ul className="mdl-l">
        {visiveis.map((m) => (
          <li key={m.situacao.id}>
            <button type="button" onClick={() => escolhe(m)}>
              <span className="mdl-t"><b>{m.titulo}</b><small>{m.quando || m.situacao.corpo}</small></span>
              <span className="mdl-g">{m.grupo}</span>
              <Ic n="seta" />
            </button>
          </li>
        ))}
      </ul>
      {lista.length > 0 && !visiveis.length && <p className="vz">Nenhum modelo com esse nome. Tente outra palavra.</p>}
      {!lista.length && (
        <p className="vz">
          Nenhum modelo aprovado ainda. O sistema manda os modelos da escola para a Meta sozinho e a
          aprovação leva de minutos a dois dias. Acompanhe em Configurações, Modelos de mensagem.
        </p>
      )}
      {lista.length > 0 && emAnalise > 0 && (
        <p className="obs mdl-rod">{emAnalise === 1 ? 'Mais 1 modelo está' : `Mais ${emAnalise} modelos estão`} em análise na Meta.</p>
      )}
    </div>
  );
}

/* ================= nas Configurações ================= */

const PONTO: Record<EstadoModelo, 'ok' | 'aviso' | 'erro' | 'falta'> = {
  aprovado: 'ok', em_analise: 'aviso', nao_enviado: 'aviso',
  recusado: 'erro', pausado: 'erro', desativado: 'erro', nao_existe: 'falta',
};

interface Linha {
  id: string;
  nome: string;
  titulo: string;
  grupo: string;
  quando: string;
  corpo: string;
  respostas: string[];
  categoriaPedida?: CategoriaModelo;
  s?: SituacaoDoModelo;
  daBiblioteca: boolean;
}

export function ModelosDeMensagem({ gestao, chama }: {
  gestao: boolean;
  chama: (caminho: string, corpo?: unknown) => Promise<Record<string, unknown>>;
}) {
  const salvos = useModelos();
  const [aberto, setAberto] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');

  const linhas = useMemo<Linha[]>(() => {
    const porId = new Map(salvos.map((s) => [s.id, s]));
    const daBiblioteca = BIBLIOTECA.map((m) => ({
      id: idDoModelo(m.nome), nome: m.nome, titulo: m.titulo, grupo: m.grupo, quando: m.quando,
      corpo: preenche(m.corpo, [], m.campos), respostas: m.respostas || [],
      categoriaPedida: m.categoria, s: porId.get(idDoModelo(m.nome)), daBiblioteca: true,
    }));
    const outros = salvos
      .filter((s) => !s.daBiblioteca && s.estado !== 'nao_existe')
      .map((s) => ({
        id: s.id, nome: s.nome, titulo: s.nome.replace(/_/g, ' '), grupo: 'Feitos na Meta', quando: '',
        corpo: s.corpo, respostas: s.respostas, s, daBiblioteca: false,
      }));
    return [...daBiblioteca, ...outros];
  }, [salvos]);

  const conta = (e: EstadoModelo) => linhas.filter((l) => l.daBiblioteca && (l.s?.estado || 'nao_enviado') === e).length;
  const resumo = [
    [conta('aprovado'), 'aprovados'], [conta('em_analise'), 'em análise'], [conta('nao_enviado'), 'ainda não enviados'],
    [conta('recusado') + conta('pausado') + conta('desativado'), 'com problema'], [conta('nao_existe'), 'apagados na Meta'],
  ].filter(([n]) => Number(n) > 0).map(([n, t]) => `${n} ${t}`).join(', ');

  async function pede(corpo: Record<string, unknown>) {
    if (modoDemo) { setErro('Na demonstração não existe conexão com a Meta: isso funciona no sistema publicado.'); return; }
    setIndo(true); setErro('');
    try {
      const r = await chama('/api/whatsapp/modelos', corpo);
      if (!r.ok) { setErro(String(r.erro || 'Não consegui conferir com a Meta.')); return; }
      const criados = Number(r.criados || 0);
      const recusados = (r.recusadosNoPedido as string[] | undefined) || [];
      if (recusados.length) setErro(`A Meta não aceitou: ${recusados.join(' ')}`);
      avisa(criados ? `${criados} ${criados === 1 ? 'modelo enviado' : 'modelos enviados'} para aprovação` : 'Modelos conferidos com a Meta');
    } catch {
      setErro('Não consegui falar com o servidor. Tente de novo.');
    } finally { setIndo(false); }
  }

  const grupos = [...GRUPOS, 'Feitos na Meta'].filter((g) => linhas.some((l) => l.grupo === g));

  return (
    <section className="bl" id="modelos">
      <p className="bt">
        Modelos de mensagem
        {gestao && (
          <button className="tx-btn" disabled={indo} onClick={() => void pede({ acao: 'conferir' })}>
            {indo ? 'Conferindo...' : 'Conferir com a Meta'}
          </button>
        )}
      </p>
      <p className="vz">
        Modelo aprovado é o único jeito de falar com quem não escreve há mais de 24 horas, e o jeito
        de mandar aviso com botão. O sistema manda os modelos da escola para a Meta sozinho e confere
        de hora em hora; a aprovação leva de minutos a dois dias. Na conversa, use o botão de modelo
        ao lado do relógio.
        {resumo && <><br /><b className="mdl-res">{resumo}.</b></>}
      </p>
      {erro && <p className="erro" style={{ padding: '0 18px 10px' }}>{erro}</p>}

      {grupos.map((g) => (
        <div key={g} className="mdl-cfg">
          <p className="mdl-cfg-g">{g}</p>
          {linhas.filter((l) => l.grupo === g).map((l) => {
            const estado = l.s?.estado || 'nao_enviado';
            const categoria = l.s?.categoria || l.categoriaPedida;
            const mudouCategoria = Boolean(l.categoriaPedida && categoria !== l.categoriaPedida);
            const podeMandar = gestao && l.daBiblioteca && (estado === 'recusado' || estado === 'nao_existe' || estado === 'nao_enviado');
            const abre = aberto === l.id;
            return (
              <div key={l.id} className="lin mdl-lin">
                <span className={`pt ${PONTO[estado]}`} aria-hidden="true" />
                <span className="co">
                  <button type="button" className="mdl-ab" aria-expanded={abre} onClick={() => setAberto(abre ? null : l.id)}>
                    <b>{l.titulo}</b>
                    <small>
                      {NOME_DO_ESTADO[estado]}
                      {categoria ? `, ${NOME_DA_CATEGORIA[categoria]}` : ''}
                    </small>
                  </button>
                  {abre && (
                    <span className="mdl-det">
                      {l.quando && <small>{l.quando}</small>}
                      <span className="mdl-txt">{l.corpo}</span>
                      {l.respostas.length > 0 && (
                        <span className="mdl-bts">{l.respostas.map((b) => <span key={b}>{b}</span>)}</span>
                      )}
                      <small className="num">{l.nome}</small>
                      {l.s?.motivo && <small className="cons">{l.s.motivo}</small>}
                      {l.s?.falha && estado === 'nao_enviado' && <small className="cons">A Meta não aceitou o pedido: {l.s.falha}</small>}
                      {mudouCategoria && categoria && l.categoriaPedida && (
                        <small className="cons">
                          A Meta classificou como {NOME_DA_CATEGORIA[categoria]}, e não {NOME_DA_CATEGORIA[l.categoriaPedida]}.
                          {categoria === 'MARKETING' ? ' Marketing custa mais por envio.' : ''}
                        </small>
                      )}
                      {podeMandar && (
                        <button type="button" className="btn" disabled={indo}
                                onClick={() => void pede({ acao: 'mandar', nome: l.nome })}>
                          {estado === 'nao_enviado' ? 'Enviar para a Meta' : 'Mandar de novo para a Meta'}
                        </button>
                      )}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
