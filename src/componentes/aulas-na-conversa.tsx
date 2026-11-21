'use client';
/* A agenda dentro da conversa. O aluno é a chave: a conversa aponta para ele (ou, no
   Kids, o número do responsável aponta para os filhos), e daqui a equipe vê a próxima
   aula, confirma, remarca, agenda a seguinte e manda o aviso sem sair do atendimento.
   O aviso nunca sai sozinho: o texto vai para a caixa de escrever (ou o modelo aprovado
   abre preenchido, com a janela fechada) e quem envia é gente.
   Duas formas: 'painel' no painel do contato, 'atalho' em cima da caixa de escrever. */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { atualiza, cria } from '@/lib/dados/fonte';
import { confirmaPresenca, type Quem } from '@/lib/dados/agenda';
import { useSessao } from '@/componentes/sessao';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import { horaConhecida, useAgora } from '@/componentes/relogio';
import { Busca, type Opcao } from '@/componentes/agenda/escolha';
import { useAulasDosAlunos, type Cadastros } from '@/componentes/agenda/dados';
import ModalDaAula, { type Abertura, type AulaSalva } from '@/componentes/agenda/aula';
import {
  diaLocal, horaLocal, modeloDoAviso, permissoesDe, proximasAulas, quandoFalado, STATUS, sugereAula, textoDoAviso,
  ultimasAulas, type Agendamento, type AvisoDeAula,
} from '@/lib/dominio/agenda';
import { alunosDoContato, falaComoResponsavel } from '@/lib/dominio/contato';
import type { Aluno, Conversa } from '@/lib/dominio/tipos';

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function diaCurto(iso: string) {
  const d = diaLocal(iso);
  return `${SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]}, ${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

interface Props {
  conversa: Conversa;
  cad: Cadastros;
  modo: 'painel' | 'atalho';
  janela: boolean;
  /** põe o texto na caixa de escrever, para a pessoa revisar e enviar */
  aoEscrever: (texto: string) => void;
  /** abre o modelo aprovado já preenchido (janela de 24 horas fechada) */
  aoModelo: (nome: string, valores: string[]) => void;
  aoFechar?: () => void;
}

export default function AulasNaConversa({ conversa, cad, modo, janela, aoEscrever, aoModelo, aoFechar }: Props) {
  const { perfil } = useSessao();
  const agora = useAgora();
  const perm = permissoesDe(perfil?.papel);
  const quem: Quem = { id: perfil?.id || '', nome: perfil?.nome || 'Equipe', papel: perfil?.papel || 'recepcao' };

  const doContato = useMemo(() => alunosDoContato(cad.alunos, conversa), [cad.alunos, conversa]);
  const [escolhidoId, setEscolhidoId] = useState<string | null>(null);
  const aluno: Aluno | undefined = doContato.find((a) => a.id === escolhidoId) || doContato[0];
  const porAluno = useAulasDosAlunos(doContato.map((a) => a.id));
  const aulas = aluno ? porAluno[aluno.id] : undefined;
  const [trocando, setTrocando] = useState(false);
  const [modal, setModal] = useState<Abertura | null>(null);
  const [indo, setIndo] = useState<string | null>(null);

  const sabeHora = horaConhecida(agora);
  const proximas = aulas && sabeHora ? proximasAulas(aulas, agora, modo === 'painel' ? 3 : 2) : [];
  const ultimas = aulas && sabeHora && modo === 'painel' ? ultimasAulas(aulas, agora, 2) : [];
  const paraResponsavel = aluno ? falaComoResponsavel(aluno, conversa.waId) : false;

  const professor = (id: string) => cad.professores.find((p) => p.id === id);
  const nomeDaAula = (id: string) => cad.aulas.find((a) => a.id === id)?.nome || 'Aula';

  async function recado(texto: string) {
    await cria('mensagens', {
      conversaId: conversa.id, direcao: 'saida', autor: 'sistema', autorNome: quem.nome, texto, criadaEm: new Date().toISOString(),
    });
  }

  /** O aviso ao aluno: na caixa de escrever com a janela aberta, ou o modelo aprovado. */
  function prepara(tipo: AvisoDeAula, inicio: string, professorId: string) {
    if (!aluno) return;
    if (janela) {
      aoEscrever(textoDoAviso(tipo, {
        contato: conversa.nome, aluno: aluno.nome, paraResponsavel, inicio, professor: professor(professorId)?.nome,
      }));
    } else {
      const m = modeloDoAviso(tipo, { contato: conversa.nome, inicio });
      aoModelo(m.nome, m.valores);
    }
  }

  async function liga(id: string) {
    const a = cad.alunos.find((x) => x.id === id);
    if (!a) return;
    await atualiza('conversas', conversa.id, { alunoId: a.id });
    await recado(`${quem.nome} ligou esta conversa ao aluno ${a.nome}.`);
    setEscolhidoId(a.id);
    setTrocando(false);
  }

  async function confirma(a: Agendamento) {
    if (!aluno) return;
    setIndo(a.id);
    try {
      await confirmaPresenca(quem, a, aluno.id);
      await recado(`${quem.nome} confirmou na agenda a aula de ${aluno.nome}: ${quandoFalado(a.inicio)}.`);
      avisa(janela ? 'Presença confirmada. A mensagem para o aluno está na caixa de escrever.' : 'Presença confirmada na agenda');
      if (janela) prepara('confirmada', a.inicio, a.professorId);
    } catch {
      avisa('Não consegui confirmar agora. Confira a internet e tente de novo.');
    } finally { setIndo(null); }
  }

  function agenda() {
    if (!aluno || !sabeHora) return;
    const s = sugereAula(aulas || [], agora, cad.aulas);
    setModal({ tipo: 'nova', ...s, alunos: [{ id: aluno.id, nome: aluno.nome }] });
  }

  function salvou(s: AulaSalva) {
    if (!aluno || !s.alunoIds.includes(aluno.id)) return;
    if (!s.nova && !s.mudouHorario) return;
    const tipo: AvisoDeAula = s.nova ? 'marcada' : 'remarcada';
    void recado(`${quem.nome} ${s.nova ? 'marcou' : 'remarcou'} na agenda a aula de ${aluno.nome} para ${quandoFalado(s.inicio)}.`);
    prepara(tipo, s.inicio, s.professorId);
  }

  const opAlunos: Opcao[] = cad.alunos
    .slice().sort((a, b) => Number(b.ativo) - Number(a.ativo))
    .map((a) => ({
      id: a.id, nome: a.nome,
      detalhe: [a.nivel, a.responsavelNome ? `resp. ${a.responsavelNome}` : '', a.ativo ? '' : 'inativo'].filter(Boolean).join(' · '),
    }));
  const linkDaAgenda = aluno
    ? `/aulas?aluno=${aluno.id}${proximas[0] ? `&data=${diaLocal(proximas[0].inicio)}&hora=${horaLocal(proximas[0].inicio)}` : ''}`
    : '/aulas';

  const corpo = (
    <>
      {(!aluno || trocando) && (
        <div className="aul-liga">
          <p className="vz">
            {aluno
              ? 'Escolha o aluno certo para esta conversa.'
              : 'Esta conversa ainda não está ligada a um aluno. Ligue para ver as aulas e agendar daqui.'}
          </p>
          <Busca opcoes={opAlunos} valor="" aoEscolher={(id) => void liga(id)} placeholder="Procurar aluno pelo nome"
                 rotulo="Ligar a um aluno" limpaDepois />
          {aluno && <button type="button" className="tx-btn" onClick={() => setTrocando(false)}>Cancelar</button>}
        </div>
      )}

      {aluno && !trocando && (
        <>
          {doContato.length > 1 && (
            <div className="chips aul-quem" role="group" aria-label="Aluno">
              {doContato.map((a) => (
                <button key={a.id} type="button" className="chip" aria-pressed={a.id === aluno.id} onClick={() => setEscolhidoId(a.id)}>
                  {a.nome.split(' ')[0]}
                </button>
              ))}
            </div>
          )}
          {modo === 'painel' && (
            <div className="aul-aluno">
              <span className="co">
                <b>{aluno.nome}</b>
                <small>
                  {[aluno.nivel, `lição ${aluno.licao}`, paraResponsavel && aluno.responsavelNome ? `resp. ${aluno.responsavelNome}` : '']
                    .filter(Boolean).join(' · ')}
                </small>
              </span>
              {!aluno.ativo && <span className="aul-inativo">inativo</span>}
              <button type="button" className="tx-btn" onClick={() => setTrocando(true)}>Trocar</button>
            </div>
          )}

          <p className="aul-sub">{proximas.length > 1 ? 'Próximas aulas' : 'Próxima aula'}</p>
          {!aulas || !sabeHora ? (
            <p className="vz">Lendo a agenda...</p>
          ) : !proximas.length ? (
            <p className="vz">Nenhuma aula marcada.{perm.criar ? ' Agende a próxima por aqui.' : ''}</p>
          ) : (
            <ul className="aul-l">
              {proximas.map((a) => {
                const p = professor(a.professorId);
                const meu = a.alunos.find((x) => x.id === aluno.id);
                return (
                  <li key={a.id} className="aul-a">
                    <span className="aul-q">
                      <b>{diaCurto(a.inicio)}</b>
                      <span className="num">{horaLocal(a.inicio)}</span>
                    </span>
                    <span className="aul-d">
                      <span className="aul-st" style={{ '--st': STATUS[a.status].cor } as React.CSSProperties}>
                        <i aria-hidden="true" />{STATUS[a.status].nome}
                      </span>
                      <small>
                        <i className="aul-cor" style={{ background: p?.cor }} aria-hidden="true" />
                        {p?.nome.split(' ')[0] || 'Sem professor'} · {nomeDaAula(a.aulaId)}
                        {a.alunos.length > 1 ? ` · ${a.alunos.length} alunos` : ''}
                        {meu?.presenca === 'faltou' ? ' · faltou' : ''}
                      </small>
                    </span>
                    <span className="aul-b">
                      {a.status === 'agendado' && perm.editarStatus && (
                        <button type="button" className="chip ok" disabled={indo === a.id} onClick={() => void confirma(a)}>
                          <Ic n="check" />Confirmar
                        </button>
                      )}
                      {perm.remarcar && (
                        <button type="button" className="chip" onClick={() => setModal({ tipo: 'editar', agendamento: a })}>Remarcar</button>
                      )}
                      <button type="button" className="chip" title={janela ? 'Escrever a aula na mensagem' : 'Abrir o modelo de confirmação'}
                              onClick={() => prepara('proxima', a.inicio, a.professorId)}>
                        Avisar
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {ultimas.length > 0 && (
            <>
              <p className="aul-sub">Últimas aulas</p>
              <ul className="aul-l passadas">
                {ultimas.map((a) => {
                  const pres = a.alunos.find((x) => x.id === aluno.id)?.presenca;
                  return (
                    <li key={a.id}>
                      <button type="button" className="aul-a aul-passada" title="Abrir a aula"
                              onClick={() => setModal({ tipo: 'editar', agendamento: a })}>
                        <span className="aul-q"><b>{diaCurto(a.inicio)}</b><span className="num">{horaLocal(a.inicio)}</span></span>
                        <span className="aul-d">
                          <span className={`aul-pres ${pres || 'sem-pres'}`}>{pres === 'presente' ? 'Presente' : pres === 'faltou' ? 'Faltou' : 'Sem presença'}</span>
                          <small>{professor(a.professorId)?.nome.split(' ')[0] || ''} · {nomeDaAula(a.aulaId)}</small>
                        </span>
                        <Ic n="seta" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <div className="aul-acoes">
            {perm.criar && (
              <button type="button" className="btn p" disabled={!sabeHora || !aulas} onClick={agenda}>
                <Ic n="mais" />Agendar aula
              </button>
            )}
            <Link className="btn" href={linkDaAgenda}><Ic n="agenda" />Ver na agenda</Link>
          </div>
        </>
      )}

      {modal && typeof document !== 'undefined' && createPortal(
        <ModalDaAula key={modal.tipo === 'editar' ? modal.agendamento.id : `nova-${modal.inicio}`}
                     abertura={modal} cad={cad} aoFechar={() => setModal(null)} aoSalvar={salvou} />,
        document.body,
      )}
    </>
  );

  if (modo === 'atalho') {
    return (
      <div className="mdl aul-pop" role="dialog" aria-label={aluno ? `Aulas de ${aluno.nome}` : 'Aulas do aluno'}>
        <div className="mdl-h">
          <span className="mdl-t">
            <b>{aluno ? `Aulas de ${aluno.nome.split(' ')[0]}` : 'Aulas do aluno'}</b>
            <small>{aluno ? [aluno.nivel, `lição ${aluno.licao}`, paraResponsavel ? `falando com ${conversa.nome.split(' ')[0]}` : ''].filter(Boolean).join(' · ') : 'ligue a conversa a um aluno'}</small>
          </span>
          <button type="button" className="ib" title="Fechar" aria-label="Fechar" onClick={aoFechar}><Ic n="x" /></button>
        </div>
        <div className="aul-corpo">{corpo}</div>
      </div>
    );
  }

  return (
    <div className="bl aul">
      <p className="bt">{paraResponsavel && aluno ? 'Alunos e aulas' : 'Aluno e aulas'}</p>
      {corpo}
    </div>
  );
}
