'use client';
/* O painel do lado da conversa. Daqui o atendente resolve o que antes dependia de
   outra tela: arruma o contato, troca o setor, abre tarefa no quadro e ve o que esta
   programado para sair. Cada acao deixa recado na conversa, para quem pegar depois
   saber o que aconteceu. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { APAGAR, assina, atualiza, cria, modoDemo } from '@/lib/dados/fonte';
import { useSessao } from '@/componentes/sessao';
import { Ic } from '@/componentes/icones';
import { useAgora, horaConhecida } from '@/componentes/relogio';
import { NOME_SETOR, SETORES } from '@/lib/dominio/acessos';
import { leAtendimento } from '@/lib/dominio/config';
import { detalheDaSituacao, esperandoDesde } from '@/lib/dominio/conversas';
import { SetorTag } from '@/componentes/setor';
import {
  dataBR, dataHoraBR, duracao, iniciais, janelaAberta, paraCampoDeData, telefoneLegivel, tomDoNome,
} from '@/lib/dominio/formato';
import { reduzFoto } from '@/lib/dominio/foto';
import { ETIQUETAS_PADRAO, cartoesDaLista, novoId, ordemEntre, vencido } from '@/lib/dominio/quadros';
import { leAssunto, tarefaDaConversa, tarefaDoAssunto } from '@/lib/dominio/triagem';
import type {
  Cartao, Conversa, Lista, Mensagem, MensagemAgendada, Quadro, Setor,
} from '@/lib/dominio/tipos';

interface Props {
  conversa: Conversa;
  mensagens: Mensagem[];
  agendadas: MensagemAgendada[];
  aoFechar: () => void;
}

export default function PainelContato({ conversa, mensagens, agendadas, aoFechar }: Props) {
  const { perfil, usuario } = useSessao();
  const agora = useAgora();
  const [quadros, setQuadros] = useState<Quadro[]>([]);
  const [listas, setListas] = useState<Lista[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [configs, setConfigs] = useState<Record<string, unknown>[]>([]);

  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(conversa.nome);
  const [observacao, setObservacao] = useState(conversa.observacao || '');
  const [abrindo, setAbrindo] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [prazo, setPrazo] = useState('');
  const [ondeId, setOndeId] = useState('');
  const [aviso, setAviso] = useState('');
  const foto = useRef<HTMLInputElement>(null);

  useEffect(() => assina('quadros', (d) => setQuadros(d as unknown as Quadro[])), []);
  useEffect(() => assina('listas', (d) => setListas(d as unknown as Lista[])), []);
  useEffect(() => assina('cartoes', (d) => setCartoes(d as unknown as Cartao[])), []);
  useEffect(() => assina('config', (d) => setConfigs(d as Record<string, unknown>[])), []);

  const nomeDoAutor = perfil?.nome || 'Equipe';
  const quadrosAbertos = useMemo(
    () => quadros.filter((q) => !q.arquivado).sort((a, b) => a.ordem - b.ordem), [quadros],
  );
  const tarefas = useMemo(
    () => cartoes.filter((c) => c.conversaId === conversa.id && !c.arquivado), [cartoes, conversa.id],
  );
  const naFila = agendadas.filter((a) => a.estado === 'agendada')
    .sort((a, b) => a.quando.localeCompare(b.quando));

  /* o que o contato escreveu desde a ultima fala nossa: é disso que sai a sugestao */
  const sugestao = useMemo(() => {
    if (tarefaDaConversa(cartoes, conversa.id)) return null;
    const dele = mensagens.filter((m) => m.direcao === 'entrada' && m.texto);
    const texto = dele.slice(-3).map((m) => m.texto).join(' ');
    if (!texto) return null;
    return tarefaDoAssunto(leAssunto(texto), conversa.nome, dele[dele.length - 1].texto, quadros, listas);
  }, [cartoes, conversa.id, conversa.nome, mensagens, quadros, listas]);

  const desde = esperandoDesde(conversa, mensagens);
  /* quanto tempo é demais é da escola, em Configurações; meia hora é o padrão */
  const limite = leAtendimento(
    configs.find((c) => c.id === 'atendimento') as Parameters<typeof leAtendimento>[0],
  ).minutosDeAguardo;
  const demais = Boolean(
    desde && horaConhecida(agora) && agora.getTime() - new Date(desde).getTime() > limite * 60_000,
  );
  const janela = janelaAberta(conversa, horaConhecida(agora) ? agora : new Date());

  async function recado(texto: string) {
    const quando = new Date().toISOString();
    await cria('mensagens', {
      conversaId: conversa.id, direcao: 'saida', autor: 'sistema',
      autorNome: nomeDoAutor, texto, criadaEm: quando,
    });
  }

  async function salvaContato() {
    const limpo = nome.trim();
    if (!limpo) { setAviso('O contato precisa de um nome.'); return; }
    await atualiza('conversas', conversa.id, {
      nome: limpo,
      observacao: observacao.trim() ? observacao.trim() : APAGAR,
    });
    setEditando(false); setAviso('');
  }

  async function trocaFoto(arquivo?: File | null) {
    if (!arquivo) return;
    if (arquivo.size > 12 * 1024 * 1024) { setAviso('A imagem passa de 12 MB. Mande uma menor.'); return; }
    try {
      await atualiza('conversas', conversa.id, { foto: await reduzFoto(arquivo) });
      setAviso('');
    } catch {
      setAviso('Não consegui ler essa imagem. Tente outra, em JPG ou PNG.');
    }
  }

  /* Passar de setor vai pelo servidor: a Coordenação e a Coordenação Kids recebem o
     aviso no celular pessoal, e isso usa o token do WhatsApp. Na demonstração não tem
     servidor, entao muda direto na base de memória. */
  async function transfere(setor: Setor) {
    if (setor === conversa.setor) return;
    setAviso('');
    if (modoDemo) {
      await atualiza('conversas', conversa.id, {
        setor, estado: 'aguardando', agenteAtivo: false,
        aguardandoDesde: new Date().toISOString(),
      });
      await recado(`${nomeDoAutor} passou a conversa para ${NOME_SETOR[setor]}.`);
      return;
    }
    if (!usuario) return;
    try {
      const token = await usuario.getIdToken();
      const r = await fetch('/api/conversas/transferir', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversaId: conversa.id, setor }),
      });
      const resposta = (await r.json()) as { ok?: boolean; erro?: string };
      if (!r.ok || !resposta.ok) setAviso(resposta.erro || 'Não consegui passar a conversa agora.');
    } catch {
      setAviso('Não consegui falar com o servidor. Tente de novo.');
    }
  }

  async function abreTarefa(e: React.FormEvent) {
    e.preventDefault();
    const nomeDaTarefa = titulo.trim();
    const lista = listas.filter((l) => l.quadroId === ondeId && !l.arquivada)
      .sort((a, b) => a.ordem - b.ordem)[0];
    if (!nomeDaTarefa || !lista) { setAviso('Escolha o quadro e escreva o que precisa ser feito.'); return; }
    await novoCartao({
      quadroId: ondeId, listaId: lista.id, titulo: nomeDaTarefa, descricao: '',
      etiquetas: [], prazo: prazo || undefined,
    });
    setAbrindo(false); setTitulo(''); setPrazo(''); setAviso('');
  }

  async function novoCartao(dados: {
    quadroId: string; listaId: string; titulo: string; descricao: string;
    etiquetas: string[]; prazo?: string;
  }) {
    const quando = new Date().toISOString();
    const primeiro = cartoesDaLista(cartoes, dados.listaId)[0];
    const id = await cria('cartoes', {
      ...dados,
      ordem: ordemEntre(undefined, primeiro),
      membros: perfil ? [perfil.id] : [],
      prazoConcluido: false, checklist: [], comentarios: [], anexos: [],
      conversaId: conversa.id,
      ...(conversa.alunoId ? { alunoId: conversa.alunoId } : {}),
      arquivado: false, criadoEm: quando, atualizadoEm: quando,
      atividade: [{
        id: novoId(), autorNome: nomeDoAutor,
        texto: `abriu a tarefa pela conversa com ${conversa.nome}`, criadoEm: quando,
      }],
    });
    if (!conversa.tarefaId) await atualiza('conversas', conversa.id, { tarefaId: id });
    await recado(`${nomeDoAutor} abriu a tarefa "${dados.titulo}" no quadro.`);
  }

  async function etiqueta(nomeDaEtiqueta: string) {
    const tem = conversa.etiquetas.includes(nomeDaEtiqueta);
    await atualiza('conversas', conversa.id, {
      etiquetas: tem
        ? conversa.etiquetas.filter((e) => e !== nomeDaEtiqueta)
        : [...conversa.etiquetas, nomeDaEtiqueta],
    });
  }

  const nomeDoQuadro = (id: string) => quadros.find((q) => q.id === id)?.nome || 'quadro';

  return (
    <>
      <div className="ph">
        <button className="ib" title="Fechar dados do contato" aria-label="Fechar dados do contato"
                onClick={aoFechar}><Ic n="x" /></button>
        Dados do contato
      </div>

      <div className="bl cab">
        <span className="pf">
          <span className={conversa.foto ? 'av l' : `av l ${tomDoNome(conversa.nome)}`} aria-hidden="true">
            {conversa.foto
              ? /* eslint-disable-next-line @next/next/no-img-element */
                <img src={conversa.foto} alt="" />
              : iniciais(conversa.nome)}
          </span>
          <button className="ib" title="Trocar a foto" aria-label="Trocar a foto do contato"
                  onClick={() => foto.current?.click()}>
            <Ic n="camera" />
          </button>
          <input ref={foto} type="file" accept="image/*" hidden
                 onChange={(e) => { void trocaFoto(e.target.files?.[0]); e.target.value = ''; }} />
        </span>
        <h2>{conversa.nome}</h2>
        <span className="num">{telefoneLegivel(conversa.waId)}</span>
        <span>{conversa.alunoId ? 'Aluno cadastrado' : 'Ainda não ligado a um aluno'}</span>
        {conversa.foto && (
          <button className="tx-btn" onClick={() => void atualiza('conversas', conversa.id, { foto: APAGAR })}>
            Tirar a foto
          </button>
        )}
      </div>

      {aviso && <p className="erro" style={{ margin: '0 12px 10px' }}>{aviso}</p>}

      <div className="bl">
        <p className="bt">
          Contato
          <button className="tx-btn" onClick={() => {
            setNome(conversa.nome); setObservacao(conversa.observacao || '');
            setEditando(!editando); setAviso('');
          }}>
            {editando ? 'Cancelar' : 'Editar'}
          </button>
        </p>
        {editando ? (
          <div className="frm">
            <div>
              <label htmlFor="ct-nome">Nome</label>
              <input id="ct-nome" className="cx" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <label htmlFor="ct-obs">Observação do time</label>
              <textarea id="ct-obs" className="cx" value={observacao} rows={3}
                        placeholder="o que quem atender precisa saber"
                        onChange={(e) => setObservacao(e.target.value)} />
            </div>
            <p className="obs">
              O telefone vem do WhatsApp e é a chave da conversa, por isso não muda aqui.
            </p>
            <div className="acoes">
              <button className="btn p" onClick={() => void salvaContato()}>Salvar contato</button>
            </div>
          </div>
        ) : (
          <p className="vz">
            {conversa.observacao || 'Sem observação. Escreva o que quem atender precisa saber.'}
          </p>
        )}
      </div>

      <div className="bl">
        <p className="bt">Atendimento</p>
        <dl className="kv">
          <dt>Setor</dt>
          <dd className="dd-setor">
            <SetorTag setor={conversa.setor} />
            {detalheDaSituacao(conversa) && <small>{detalheDaSituacao(conversa)}</small>}
          </dd>
          <dt>Janela de 24 horas</dt><dd>{janela ? 'aberta' : 'fechada'}</dd>
          <dt>Esperando há</dt>
          <dd className={demais ? 'atr' : undefined}>
            {desde && horaConhecida(agora) ? duracao(desde, agora) : 'ninguém esperando'}
          </dd>
        </dl>
        <p className="bt">Passar para</p>
        <div className="setores">
          {SETORES.map((s) => (
            <button key={s} className="chip" aria-pressed={conversa.setor === s}
                    onClick={() => void transfere(s)}>
              {NOME_SETOR[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="bl">
        <p className="bt">
          Tarefas no quadro
          <button className="tx-btn" onClick={() => {
            setAbrindo(!abrindo); setAviso('');
            setOndeId(ondeId || quadrosAbertos[0]?.id || '');
          }}>
            {abrindo ? 'Cancelar' : 'Criar'}
          </button>
        </p>

        {tarefas.map((t) => (
          <div key={t.id} className="lin">
            <Ic n="quadro" />
            <span className="co">
              <b>{t.titulo}</b>
              <small className={vencido(t, horaConhecida(agora) ? agora : undefined) ? 'atr' : undefined}>
                {nomeDoQuadro(t.quadroId)}
                {t.prazo ? `, para ${dataBR(t.prazo)}` : ''}
              </small>
            </span>
          </div>
        ))}
        {!tarefas.length && !abrindo && (
          <p className="vz">Nenhuma tarefa aberta por esta conversa.</p>
        )}

        {abrindo && (
          <form className="frm" onSubmit={(e) => void abreTarefa(e)}>
            <div>
              <label htmlFor="tf-t">O que precisa ser feito</label>
              <input id="tf-t" className="cx" value={titulo} autoFocus
                     placeholder={`Retornar para ${conversa.nome}`}
                     onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="ln">
              <select className="cx" aria-label="Quadro" value={ondeId}
                      onChange={(e) => setOndeId(e.target.value)}>
                {quadrosAbertos.map((q) => <option key={q.id} value={q.id}>{q.nome}</option>)}
              </select>
              <input className="cx" type="date" aria-label="Lembrar em" value={prazo}
                     min={horaConhecida(agora) ? paraCampoDeData(agora) : undefined}
                     onChange={(e) => setPrazo(e.target.value)} />
            </div>
            <p className="obs">Com data, o cartão aparece como lembrete e fica vermelho quando o dia passa.</p>
            <div className="acoes">
              <button type="submit" className="btn p">Criar tarefa</button>
            </div>
          </form>
        )}

        {sugestao && !abrindo && (
          <button className="sug" onClick={() => void novoCartao(sugestao)}>
            <b>A triagem leu: {sugestao.titulo}</b>
            Abrir em {sugestao.quadroNome}, na lista {sugestao.listaNome}.
          </button>
        )}
      </div>

      {naFila.length > 0 && (
        <div className="bl">
          <p className="bt">Mensagens programadas</p>
          {naFila.map((a) => (
            <div key={a.id} className="lin">
              <Ic n="relogio" />
              <span className="co">
                <b>{a.texto}</b>
                <small>{dataHoraBR(a.quando)}, por {a.autorNome}</small>
              </span>
              <button className="ib" title="Cancelar o envio" aria-label="Cancelar o envio"
                      onClick={() => void atualiza('agendadas', a.id, { estado: 'cancelada' })}>
                <Ic n="x" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bl">
        <p className="bt">Etiquetas</p>
        <div className="tags" style={{ padding: '2px 18px 16px' }}>
          {ETIQUETAS_PADRAO.map((e) => (
            <button key={e.nome} className="tag" aria-pressed={conversa.etiquetas.includes(e.nome)}
                    onClick={() => void etiqueta(e.nome)}>
              {e.nome}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
