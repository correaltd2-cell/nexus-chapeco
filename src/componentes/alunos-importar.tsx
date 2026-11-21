'use client';
/* Trazer alunos para a planilha do sistema: de um arquivo (o Excel ou o CSV que a escola
   já tem) ou, mais adiante, da planilha do Google. As duas passam pela mesma conferência
   antes de gravar: quantos entram, quantos mudam, quais conversas se ligam, as primeiras
   linhas como vão ficar.
   O arquivo é lido no navegador (dominio/xlsx.ts) e não vai para lugar nenhum; a
   comparação e a gravação usam as mesmas regras da planilha do Google
   (dominio/planilha.ts), num lote só. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { grava, modoDemo, novoId } from '@/lib/dados/fonte';
import { useSessao } from '@/componentes/sessao';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import {
  CAMPOS, NOME_DA_SITUACAO, NOME_DO_CAMPO, confere, escritasDaImportacao, horarioEmTexto, lePlanilha,
  type AlunoDoSistema, type Campo, type Conferencia, type ConversaParaLigar, type Mapa,
} from '@/lib/dominio/planilha';
import type { Pasta } from '@/lib/dominio/xlsx';
import { dataHoraBR } from '@/lib/dominio/formato';

/* ================= a conferência, igual para arquivo e Google ================= */

export function ConferenciaDaImportacao({
  conf, mapa, aoMudarMapa, aoMudarAba, aoReconferir, ocupado, children,
}: {
  conf: Conferencia;
  mapa: Mapa;
  aoMudarMapa: (m: Mapa) => void;
  aoMudarAba: (aba: string) => void;
  aoReconferir?: () => void;
  ocupado?: boolean;
  children: ReactNode;
}) {
  const { leitura, plano } = conf;
  const c = leitura.contas;
  /* a coluna que vale para cada campo: a escolhida, ou a que o sistema reconheceu */
  const escolhida = (campo: Campo) => (campo in mapa
    ? mapa[campo] ?? ''
    : leitura.colunas[campo] === undefined ? '' : leitura.cabecalho[leitura.colunas[campo] as number]);
  const semNome = leitura.colunas.nome === undefined;

  return (
    <div className="frm alu-conf">
      <div className="ln">
        {conf.abas.length > 1 && (
          <label className="alu-campo">Aba
            <select className="cx" value={conf.aba} onChange={(e) => aoMudarAba(e.target.value)}>
              {conf.abas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
        )}
        <p className="obs" style={{ alignSelf: 'end' }}>
          {conf.titulo}{leitura.cabecalho.length ? `: cabeçalho na linha ${leitura.linhaCabecalho}.` : ': essa aba está vazia.'}
        </p>
      </div>

      <details className="alu-colunas" open={semNome}>
        <summary>Colunas reconhecidas: {Object.keys(leitura.colunas).length} de {CAMPOS.length}. Toque para conferir ou trocar.</summary>
        <p className="obs">O sistema reconheceu as colunas pelo nome. Se alguma estiver errada, troque aqui{aoReconferir ? ' e confira de novo' : ''}.</p>
        <div className="alu-mapa">
          {CAMPOS.map(({ campo, obrigatorio }) => (
            <label key={campo} className="alu-campo">
              <span>{NOME_DO_CAMPO[campo]}{obrigatorio ? ' *' : ''}</span>
              <select className="cx" value={escolhida(campo)} onChange={(e) => aoMudarMapa({ ...mapa, [campo]: e.target.value || null })}>
                <option value="">não tem</option>
                {leitura.cabecalho.map((h, i) => h && <option key={`${h}-${i}`} value={h}>{h}</option>)}
              </select>
            </label>
          ))}
        </div>
        {aoReconferir && <div className="ln"><button className="btn" disabled={ocupado} onClick={aoReconferir}>Conferir de novo com estas colunas</button></div>}
      </details>

      <p className="alu-sub">O que a planilha diz</p>
      <ul className="alu-res">
        <li><b className="num">{c.total}</b> alunos, <b className="num">{c.ativos}</b> ativos.</li>
        {leitura.colunaDeMarcacao && <li><b className="num">{c.marcaram}</b> marcaram a próxima semana e <b className="num">{c.naoMarcaram}</b> ainda não.</li>}
        <li><b className="num">{c.trancados}</b> trancados, <b className="num">{c.off}</b> off (inclusive quem volta num mês), <b className="num">{c.obs}</b> obs{c.inativos ? `, ${c.inativos} inativos` : ''}.</li>
        <li><b className="num">{c.comFixo}</b> ativos com horário fixo.</li>
      </ul>

      <p className="alu-sub">O que vai acontecer no sistema</p>
      <ul className="alu-res">
        <li><b className="num">{plano.novos}</b> entram{plano.exemplosNovos.length ? `: ${plano.exemplosNovos.join(', ')}${plano.novos > 5 ? '...' : ''}` : '.'}</li>
        <li><b className="num">{plano.atualizados}</b> já existem e mudam{plano.exemplosAtualizados.length ? `: ${plano.exemplosAtualizados.join('; ')}${plano.atualizados > 5 ? '...' : ''}` : '.'}</li>
        {plano.iguais > 0 && <li><b className="num">{plano.iguais}</b> já estão iguais.</li>}
        <li>
          <b className="num">{conf.vincular}</b> conversas sem aluno vão ficar ligadas
          {conf.vincularPeloNome ? ` (${conf.vincularPeloNome} pelo nome do contato no WhatsApp, quando só um aluno bate)` : ''}.
          {leitura.colunas.telefone === undefined && ' A planilha não tem telefone: as outras conversas se ligam no painel do contato, com um toque, e o número fica guardado no aluno.'}
        </li>
        {plano.foraDaPlanilha > 0 && <li><b className="num">{plano.foraDaPlanilha}</b> alunos do sistema não estão neste arquivo ({plano.exemplosFora.join(', ')}). Ninguém é apagado nem desativado por isso.</li>}
      </ul>
      {leitura.situacoesDesconhecidas.length > 0 && (
        <p className="obs alerta">Situações que não reconheci, tratadas como ativo: {leitura.situacoesDesconhecidas.join(', ')}.</p>
      )}
      {leitura.problemas.length > 0 && (
        <details className="alu-prob">
          <summary>{leitura.problemas.length} {leitura.problemas.length === 1 ? 'linha com problema' : 'linhas com problema'}</summary>
          <ul>{leitura.problemas.slice(0, 40).map((p, i) => <li key={i}><span className="num">linha {p.linha}</span>: {p.motivo}</li>)}</ul>
        </details>
      )}

      {conf.amostra.length > 0 && (
        <>
          <p className="alu-sub">As primeiras linhas, como vão entrar</p>
          <div className="alu-tab-caixa">
            <table className="rel-tab">
              <thead><tr><th>Linha</th><th>Cód.</th><th>Aluno</th><th>Livro</th><th>Horário fixo</th><th>Situação</th></tr></thead>
              <tbody>
                {conf.amostra.map((a) => (
                  <tr key={a.linha}>
                    <td className="num">{a.linha}</td>
                    <td className="num">{a.codigo || '—'}</td>
                    <td>{a.nome}{a.menor && <small>menor de idade</small>}</td>
                    <td>{a.nivel || '—'}{(a.tipoCurso && a.tipoCurso !== 'turma') || a.trilha === 'kids' ? <small>{[a.tipoCurso && a.tipoCurso !== 'turma' ? a.tipoCurso : '', a.trilha === 'kids' ? 'Kids' : ''].filter(Boolean).join(' · ')}</small> : null}</td>
                    <td>{a.horariosFixos.length ? horarioEmTexto(a.horariosFixos) : a.horarioFixoTexto || '—'}</td>
                    <td>
                      <span className={`alu-sit ${a.situacao}`}>{NOME_DA_SITUACAO[a.situacao]}</span>
                      {a.situacao === 'ativo' && typeof a.marcouSemana === 'boolean' && <small>{a.marcouSemana ? 'marcou a semana' : 'não marcou'}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {children}
    </div>
  );
}

/* ================= de um arquivo ================= */

interface Aberto { nome: string; pasta: Pasta; aba: string }

/** Escolhe a aba que tem cara de lista de alunos: a ATIVOS da escola, ou a primeira. */
const abaInicial = (abas: string[]) => abas.find((a) => /^ativos?$/i.test(a.trim())) || abas[0];

export function TrazerDeArquivo({
  alunos, conversas, aoFechar,
}: {
  alunos: AlunoDoSistema[];
  conversas: ConversaParaLigar[];
  aoFechar: () => void;
}) {
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [mapa, setMapa] = useState<Mapa>({});
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState('');
  const escolhe = useRef<HTMLInputElement>(null);
  const bloco = useRef<HTMLElement>(null);

  /* aberto pelo botão do topo, o bloco vem para a vista */
  useEffect(() => { bloco.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, []);

  async function abre(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(''); setLendo(true);
    try {
      const { abreArquivo, ErroDoArquivo } = await import('@/lib/dominio/xlsx');
      try {
        const pasta = abreArquivo(arquivo.name, new Uint8Array(await arquivo.arrayBuffer()));
        setAberto({ nome: arquivo.name, pasta, aba: abaInicial(pasta.abas) });
        setMapa({});
      } catch (e) {
        setErro(e instanceof ErroDoArquivo ? e.message : 'Não consegui ler esse arquivo. Confira se é o Excel (.xlsx) ou o CSV da lista de alunos.');
        setAberto(null);
      }
    } finally {
      setLendo(false);
      if (escolhe.current) escolhe.current.value = '';
    }
  }

  /* a conferência é refeita na hora a cada troca de aba ou de coluna */
  const resultado = useMemo(() => {
    if (!aberto) return null;
    try {
      const leitura = lePlanilha(aberto.pasta.linhas(aberto.aba), mapa);
      return { leitura, ...confere(leitura, alunos, conversas, { titulo: aberto.nome, abas: aberto.pasta.abas, aba: aberto.aba }) };
    } catch {
      return null;
    }
  }, [aberto, mapa, alunos, conversas]);

  async function importa() {
    if (!resultado) return;
    setGravando(true); setErro('');
    try {
      const idsNovos = resultado.plano.novos.map(() => novoId('alunos'));
      const { escritas, ligadas } = escritasDaImportacao(resultado.plano, alunos, conversas, idsNovos, new Date().toISOString());
      await grava(escritas);
      avisa(`${resultado.plano.novos.length} alunos novos, ${resultado.plano.atualizados.length} atualizados, ${ligadas} conversas ligadas`);
      aoFechar();
    } catch {
      setErro('Não consegui gravar agora. Tente de novo: importar o mesmo arquivo outra vez não duplica ninguém, porque o aluno é reconhecido pelo código.');
    } finally {
      setGravando(false);
    }
  }

  const total = resultado?.leitura.alunos.length ?? 0;
  const semNome = resultado ? resultado.leitura.colunas.nome === undefined : false;

  return (
    <section ref={bloco} className="bl alu-pl" aria-label="Trazer alunos de um arquivo">
      <div className="alu-pl-cab">
        <p className="bt">Trazer alunos de um arquivo</p>
        <button type="button" className="tx-btn" onClick={aoFechar}>Fechar</button>
      </div>
      <div className="frm">
        <p className="alu-pl-linha">
          <Ic n="doc" />
          <span>
            Escolha a planilha da escola em Excel (.xlsx) ou CSV. No Google Sheets: Arquivo, Fazer download, Microsoft Excel.
            O arquivo é lido aqui mesmo no navegador; nada é gravado antes de você conferir e tocar em Importar.
          </span>
        </p>
        <div className="ln">
          <input ref={escolhe} type="file" accept=".xlsx,.csv,.txt,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                 className="alu-arquivo" aria-label="Arquivo da planilha de alunos" onChange={(e) => void abre(e.target.files?.[0])} />
          <button type="button" className="btn p" disabled={lendo} onClick={() => escolhe.current?.click()}>
            <Ic n="clipe" />{lendo ? 'Lendo o arquivo...' : aberto ? 'Escolher outro arquivo' : 'Escolher arquivo'}
          </button>
          {aberto && <span className="obs" style={{ alignSelf: 'center' }}>{aberto.nome}</span>}
        </div>
        {erro && <p className="erro">{erro}</p>}
      </div>

      {aberto && resultado && (
        <ConferenciaDaImportacao
          conf={resultado.conferencia}
          mapa={mapa}
          aoMudarMapa={setMapa}
          aoMudarAba={(aba) => { setAberto({ ...aberto, aba }); setMapa({}); }}
        >
          <div className="ln">
            <button className="btn p" disabled={gravando || !total || semNome} onClick={() => void importa()}>
              {gravando ? 'Importando...' : `Importar ${total} alunos`}
            </button>
            {semNome && <span className="obs alerta">Escolha a coluna do nome do aluno em Colunas reconhecidas.</span>}
            {!semNome && !total && <span className="obs alerta">Essa aba não tem alunos. Escolha outra aba.</span>}
          </div>
        </ConferenciaDaImportacao>
      )}
    </section>
  );
}

/* ================= a planilha do Google (fica para depois) ================= */

interface Resumo { quando: string; quem: string; titulo: string; aba: string; lidos: number; novos: number; atualizados: number; vinculadas: number; foraDaPlanilha: number }
interface ConfigSalva { planilhaId: string; aba: string; titulo?: string; mapa?: Mapa; automatico: boolean; ultima?: Resumo; erro?: { quando: string; motivo: string } | null }

export function PlanilhaDoGoogle() {
  const { perfil, usuario } = useSessao();
  const gestao = perfil?.papel === 'admin' || perfil?.papel === 'gestor';
  const atualiza = gestao || perfil?.papel === 'recepcao';
  const [estado, setEstado] = useState<{ email: string; projeto: string; config: ConfigSalva | null } | null>(null);
  const [montando, setMontando] = useState(false);
  const [link, setLink] = useState('');
  const [aba, setAba] = useState('');
  const [mapa, setMapa] = useState<Mapa>({});
  const [automatico, setAutomatico] = useState(false);
  const [conf, setConf] = useState<Conferencia | null>(null);
  const [indo, setIndo] = useState('');
  const [erro, setErro] = useState('');

  async function chama(metodo: 'GET' | 'POST', corpo?: unknown) {
    if (!usuario) throw new Error('sem login');
    const token = await usuario.getIdToken();
    const r = await fetch('/api/alunos/planilha', {
      method: metodo, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });
    return (await r.json()) as Record<string, unknown>;
  }

  async function recarrega() {
    if (modoDemo || !usuario) return;
    const r = await chama('GET');
    if (r.ok) setEstado({ email: String(r.email || ''), projeto: String(r.projeto || ''), config: (r.config as ConfigSalva) || null });
  }
  useEffect(() => {
    if (modoDemo || !usuario) return;
    let vivo = true;
    void (async () => {
      const token = await usuario.getIdToken();
      const r = (await (await fetch('/api/alunos/planilha', { headers: { authorization: `Bearer ${token}` } })).json()) as Record<string, unknown>;
      if (vivo && r.ok) setEstado({ email: String(r.email || ''), projeto: String(r.projeto || ''), config: (r.config as ConfigSalva) || null });
    })();
    return () => { vivo = false; };
  }, [usuario]);

  const config = estado?.config;

  async function conferir(o: { aba?: string; mapa?: Mapa } = {}) {
    setIndo('Lendo a planilha...'); setErro('');
    try {
      const r = await chama('POST', { acao: 'conferir', link: link || config?.planilhaId || '', aba: o.aba ?? aba, mapa: o.mapa ?? mapa });
      if (!r.ok) { setErro(String(r.erro)); setConf(null); return; }
      const c = r.conferencia as Conferencia;
      setConf(c); setAba(c.aba);
    } catch { setErro('Não consegui falar com o servidor.'); } finally { setIndo(''); }
  }

  async function importar() {
    setIndo('Importando...'); setErro('');
    try {
      const r = await chama('POST', { acao: 'importar', link: link || config?.planilhaId || '', aba, mapa, automatico });
      if (!r.ok) { setErro(String(r.erro)); return; }
      const res = r.resumo as Resumo;
      avisa(`${res.novos} alunos novos, ${res.atualizados} atualizados, ${res.vinculadas} conversas ligadas`);
      setConf(null); setMontando(false); setLink('');
      await recarrega();
    } catch { setErro('Não consegui falar com o servidor.'); } finally { setIndo(''); }
  }

  async function atualizaAgora() {
    setIndo('Atualizando...'); setErro('');
    try {
      const r = await chama('POST', { acao: 'importar' });
      if (!r.ok) setErro(String(r.erro));
      else { const res = r.resumo as Resumo; avisa(`${res.novos} novos, ${res.atualizados} atualizados, ${res.vinculadas} conversas ligadas`); }
      await recarrega();
    } catch { setErro('Não consegui falar com o servidor.'); } finally { setIndo(''); }
  }

  async function mudaAutomatico(v: boolean) {
    const r = await chama('POST', { acao: 'automatico', automatico: v });
    if (!r.ok) setErro(String(r.erro)); else { avisa(v ? 'Atualiza sozinha de hora em hora' : 'Atualização automática desligada'); await recarrega(); }
  }

  function copia(t: string) {
    navigator.clipboard?.writeText(t).then(() => avisa('E-mail copiado'), () => undefined);
  }

  if (modoDemo) {
    return (
      <p className="vz">
        Na demonstração não há servidor para ler a planilha do Google. No sistema publicado, a gestão cola aqui o link da planilha,
        confere o que vai entrar e importa; depois ela pode se atualizar sozinha de hora em hora.
      </p>
    );
  }
  if (!estado) return <p className="vz">Carregando...</p>;

  const ligada = Boolean(config?.planilhaId);
  const erroSalvo = config?.erro && (!config.ultima || config.erro.quando > config.ultima.quando) ? config.erro : null;

  return (
    <>
      {ligada && !montando && (
        <div className="frm">
          <p className="alu-pl-linha">
            <Ic n="lista" />
            <span>Ligada à planilha <b>{config?.titulo || 'de alunos'}</b>, aba <b>{config?.aba}</b>.
              {config?.automatico ? ' Atualiza sozinha de hora em hora: o que mudar lá passa por cima do que foi editado aqui.' : ' Atualiza quando alguém toca em Atualizar agora.'}</span>
          </p>
          {config?.ultima && (
            <p className="obs">
              Última leitura em {dataHoraBR(config.ultima.quando)}, por {config.ultima.quem}: {config.ultima.lidos} alunos na planilha,
              {' '}{config.ultima.novos} novos, {config.ultima.atualizados} atualizados, {config.ultima.vinculadas} conversas ligadas
              {config.ultima.foraDaPlanilha ? `, ${config.ultima.foraDaPlanilha} alunos do sistema que não estão mais na planilha` : ''}.
            </p>
          )}
          {erroSalvo && <p className="erro">A última leitura falhou em {dataHoraBR(erroSalvo.quando)}: {erroSalvo.motivo}</p>}
          <div className="ln">
            {atualiza && <button className="btn p" disabled={Boolean(indo)} onClick={() => void atualizaAgora()}>{indo || 'Atualizar agora'}</button>}
            {gestao && <button className="btn" onClick={() => { setMontando(true); setConf(null); setLink(''); setMapa(config?.mapa || {}); setAba(config?.aba || ''); setAutomatico(config?.automatico ?? false); }}>Trocar planilha ou colunas</button>}
            {gestao && (
              <label className="lig alu-auto">
                <input type="checkbox" checked={Boolean(config?.automatico)} onChange={(e) => void mudaAutomatico(e.target.checked)} />
                <span><b>Atualizar sozinha de hora em hora</b></span>
              </label>
            )}
          </div>
        </div>
      )}

      {(!ligada || montando) && (
        gestao ? (
          <div className="frm">
            <ol className="alu-passos">
              <li>
                <b>Compartilhe a planilha com o sistema, como leitor.</b> No Google Sheets, toque em Compartilhar e adicione este e-mail:
                <span className="alu-email"><code>{estado.email || 'conta de serviço não configurada'}</code>
                  {estado.email && <button type="button" className="tx-btn" onClick={() => copia(estado.email)}>Copiar</button>}</span>
              </li>
              <li>
                <b>Ligue a API do Google Sheets no projeto, uma vez só.</b>{' '}
                <a href={`https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=${estado.projeto}`} target="_blank" rel="noopener noreferrer">Abrir no Google Cloud</a> e tocar em Ativar.
              </li>
              <li>
                <b>Cole o link da planilha</b> (o endereço que aparece no navegador quando ela está aberta). Na planilha de marcação, a aba é a ATIVOS.
                <div className="ln">
                  <input className="cx" value={link} placeholder="https://docs.google.com/spreadsheets/d/..." aria-label="Link da planilha"
                         onChange={(e) => setLink(e.target.value)} />
                  <button className="btn p" disabled={Boolean(indo) || (!link.trim() && !config?.planilhaId)} onClick={() => void conferir()}>
                    {indo === 'Lendo a planilha...' ? indo : 'Conferir planilha'}
                  </button>
                  {montando && <button className="btn" onClick={() => { setMontando(false); setConf(null); }}>Cancelar</button>}
                </div>
              </li>
            </ol>
          </div>
        ) : (
          <p className="vz">A gestão ainda não ligou a planilha do Google.</p>
        )
      )}

      {erro && <p className="erro" style={{ margin: '0 18px 12px' }}>{erro}</p>}

      {conf && (
        <ConferenciaDaImportacao
          conf={conf}
          mapa={mapa}
          aoMudarMapa={setMapa}
          aoMudarAba={(a) => { setAba(a); setMapa({}); void conferir({ aba: a, mapa: {} }); }}
          aoReconferir={() => void conferir({ mapa })}
          ocupado={Boolean(indo)}
        >
          <label className="lig">
            <input type="checkbox" checked={automatico} onChange={(e) => setAutomatico(e.target.checked)} />
            <span><b>Atualizar sozinha de hora em hora</b>O que mudar na planilha do Google passa por cima do que foi editado no sistema.</span>
          </label>
          <div className="ln">
            <button className="btn p" disabled={Boolean(indo) || !conf.leitura.total || conf.leitura.colunas.nome === undefined} onClick={() => void importar()}>
              {indo === 'Importando...' ? indo : `Importar ${conf.leitura.total} alunos`}
            </button>
          </div>
        </ConferenciaDaImportacao>
      )}
    </>
  );
}
