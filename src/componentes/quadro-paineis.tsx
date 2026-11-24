'use client';
/* Os painéis do menu do quadro (pedido do cliente, 24/11/2026): o plano de fundo, com
   opções prontas e imagem própria, e as etiquetas do quadro, criadas por nome. As regras
   (fundos, criar, renomear e apagar etiqueta) moram em dominio/quadros.ts. */
import { useRef, useState, type FormEvent } from 'react';
import { getDownloadURL, ref as refArquivo, uploadBytes } from 'firebase/storage';
import { arquivos } from '@/lib/firebase/cliente';
import { atualiza, grava, modoDemo, type OpGravacao } from '@/lib/dados/fonte';
import { avisa } from '@/componentes/aviso';
import { Ic } from '@/componentes/icones';
import { reduzParaLer } from '@/lib/dominio/foto';
import {
  CORES_DE_ETIQUETA, FUNDOS, apagaEtiqueta, criaEtiqueta, etiquetasDoQuadro, mudaEtiqueta,
} from '@/lib/dominio/quadros';
import type { Cartao, Etiqueta, Quadro } from '@/lib/dominio/tipos';

/** As bolinhas de cor para escolher a cor da etiqueta. */
export function EscolheCor({ valor, aoMudar }: { valor: string; aoMudar: (k: string) => void }) {
  return (
    <div className="qd-cores" role="radiogroup" aria-label="Cor da etiqueta">
      {CORES_DE_ETIQUETA.map((c) => (
        <button key={c.k} type="button" role="radio" aria-checked={valor === c.k} aria-label={c.nome} title={c.nome}
                className={`qd-cor lb-${c.k}`} onClick={() => aoMudar(c.k)} />
      ))}
    </div>
  );
}

/** Criar uma etiqueta por nome, com a cor. Devolve o erro para mostrar, ou nada. */
export function NovaEtiqueta({ aoCriar, aoCancelar }: { aoCriar: (nome: string, cor: string) => Promise<string | null>; aoCancelar?: () => void }) {
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState('az');
  const [erro, setErro] = useState('');
  async function envia(e: FormEvent) {
    e.preventDefault();
    const r = await aoCriar(nome, cor);
    if (r) { setErro(r); return; }
    setNome(''); setErro('');
  }
  return (
    <form className="qd-etq-nova" onSubmit={(e) => void envia(e)}>
      <input className="cx" autoFocus value={nome} maxLength={30} placeholder="Nome da etiqueta, ex.: Ligar amanhã" aria-label="Nome da etiqueta nova"
             onChange={(e) => { setNome(e.target.value); setErro(''); }}
             onKeyDown={(e) => { if (e.key === 'Escape' && aoCancelar) { e.stopPropagation(); aoCancelar(); } }} />
      <EscolheCor valor={cor} aoMudar={setCor} />
      {nome.trim() && <span className={`lbp lb-${cor} qd-etq-previa`}>{nome.trim()}</span>}
      {erro && <p className="erro">{erro}</p>}
      <div className="ln">
        <button className="btn p" type="submit" disabled={!nome.trim()}>Criar etiqueta</button>
        {aoCancelar && <button className="tx-btn" type="button" onClick={aoCancelar}>Cancelar</button>}
      </div>
    </form>
  );
}

/** As etiquetas do quadro: criar, renomear, trocar a cor e apagar (o que muda vai junto
    para os cartões do quadro, num lote só). */
export function PainelDeEtiquetas({ quadro, cartoes, aoFechar }: { quadro: Quadro; cartoes: Cartao[]; aoFechar: () => void }) {
  const lista = etiquetasDoQuadro(quadro);
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState('az');
  const [criando, setCriando] = useState(false);
  const doQuadro = cartoes.filter((c) => c.quadroId === quadro.id);
  const usos = (n: string) => doQuadro.filter((c) => c.etiquetas.includes(n)).length;

  async function grava2(novaLista: Etiqueta[], mudancas: { id: string; etiquetas: string[] }[]) {
    const ops: OpGravacao[] = [
      { tipo: 'atualizar', colecao: 'quadros', id: quadro.id, campos: { etiquetas: novaLista } },
      ...mudancas.map((m): OpGravacao => ({ tipo: 'atualizar', colecao: 'cartoes', id: m.id, campos: { etiquetas: m.etiquetas, atualizadoEm: new Date().toISOString() } })),
    ];
    await grava(ops);
  }

  async function cria(n: string, k: string) {
    const r = criaEtiqueta(lista, n, k);
    if ('erro' in r) return r.erro;
    try { await grava2(r.lista, []); } catch { return 'Não consegui salvar. Confira a internet e tente de novo.'; }
    setCriando(false);
    return null;
  }

  async function salva(de: string) {
    const r = mudaEtiqueta(lista, doQuadro, de, nome, cor);
    if ('erro' in r) { avisa(r.erro); return; }
    try { await grava2(r.lista, r.cartoes); setEditando(null); } catch { avisa('Não consegui salvar. Confira a internet e tente de novo.'); }
  }

  async function apaga(n: string) {
    const r = apagaEtiqueta(lista, doQuadro, n);
    try { await grava2(r.lista, r.cartoes); setEditando(null); avisa(`Etiqueta ${n} apagada`); } catch { avisa('Não consegui apagar. Tente de novo.'); }
  }

  return (
    <div className="fp qd-painel" role="dialog" aria-label="Etiquetas do quadro">
      <div className="qd-painel-cab"><b>Etiquetas de {quadro.nome}</b><button className="ib" aria-label="Fechar" onClick={aoFechar}><Ic n="x" /></button></div>
      <p className="obs">Elas aparecem nos cartões deste quadro. Renomear ou apagar muda nos cartões também.</p>
      <ul className="qd-etqs">
        {lista.map((e) => (
          <li key={e.nome}>
            {editando === e.nome ? (
              <div className="qd-etq-ed">
                <input className="cx" autoFocus value={nome} maxLength={30} aria-label={`Novo nome de ${e.nome}`}
                       onChange={(x) => setNome(x.target.value)} onKeyDown={(x) => { if (x.key === 'Enter') void salva(e.nome); if (x.key === 'Escape') setEditando(null); }} />
                <EscolheCor valor={cor} aoMudar={setCor} />
                <div className="ln">
                  <button className="btn p" type="button" onClick={() => void salva(e.nome)}>Salvar</button>
                  <button className="tx-btn" type="button" onClick={() => setEditando(null)}>Cancelar</button>
                  <button className="tx-btn perigo" type="button" onClick={() => void apaga(e.nome)}>
                    Apagar{usos(e.nome) ? ` (sai de ${usos(e.nome)} ${usos(e.nome) === 1 ? 'cartão' : 'cartões'})` : ''}
                  </button>
                </div>
              </div>
            ) : (
              <button className="qd-etq" onClick={() => { setEditando(e.nome); setNome(e.nome); setCor(e.cor); setCriando(false); }}>
                <span className={`lbp lb-${e.cor}`}>{e.nome}</span>
                <small className="num">{usos(e.nome) || ''}</small>
                <Ic n="texto" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {criando
        ? <NovaEtiqueta aoCriar={cria} aoCancelar={() => setCriando(false)} />
        : <button className="btn" onClick={() => { setCriando(true); setEditando(null); }}><Ic n="mais" />Criar etiqueta</button>}
    </div>
  );
}

/** O plano de fundo do quadro: os prontos e uma imagem do computador ou do celular. */
export function PainelDoFundo({ quadro, aoFechar }: { quadro: Quadro; aoFechar: () => void }) {
  const [subindo, setSubindo] = useState(false);
  const escolhe = useRef<HTMLInputElement>(null);
  const atual = quadro.fundo || 'padrao';

  const muda = (fundo: string) => void atualiza('quadros', quadro.id, { fundo, ...(fundo !== 'imagem' ? { fundoImagem: null } : {}) });

  async function sobe(arquivo: File) {
    if (modoDemo) { avisa('Na demonstração não dá para subir imagem: escolha um dos fundos prontos.'); return; }
    if (!arquivo.type.startsWith('image/')) { avisa('Escolha uma imagem (JPG ou PNG).'); return; }
    setSubindo(true);
    try {
      const leve = await reduzParaLer(arquivo, 2400);
      const caminho = `quadros/${quadro.id}/fundo-${Date.now()}.jpg`;
      await uploadBytes(refArquivo(arquivos(), caminho), leve, { contentType: leve.type || 'image/jpeg' });
      const url = await getDownloadURL(refArquivo(arquivos(), caminho));
      await atualiza('quadros', quadro.id, { fundo: 'imagem', fundoImagem: url });
      avisa('Fundo do quadro trocado');
    } catch (e) {
      avisa(e instanceof Error && e.message === 'foto' ? 'Não consegui abrir essa imagem. Use JPG ou PNG.' : 'Não consegui subir a imagem. Tente de novo.');
    } finally {
      setSubindo(false);
    }
  }

  return (
    <div className="fp qd-painel qd-painel-fundo" role="dialog" aria-label="Plano de fundo do quadro">
      <div className="qd-painel-cab"><b>Plano de fundo</b><button className="ib" aria-label="Fechar" onClick={aoFechar}><Ic n="x" /></button></div>
      <div className="qd-fundos">
        {FUNDOS.map((f) => (
          <button key={f.id} className={`qd-fundo${f.id === 'padrao' ? ' padrao' : f.escuro ? '' : ' claro'}`} aria-pressed={atual === f.id} onClick={() => muda(f.id)}
                  style={f.css ? { background: f.css } : undefined}>
            <span>{f.nome}</span>
          </button>
        ))}
        {quadro.fundoImagem && (
          <button className="qd-fundo" aria-pressed={atual === 'imagem'} onClick={() => muda('imagem')}
                  style={{ background: `center / cover no-repeat url("${quadro.fundoImagem}")` }}>
            <span>Sua imagem</span>
          </button>
        )}
      </div>
      <input ref={escolhe} type="file" accept="image/jpeg,image/png,image/webp" className="alu-arquivo" aria-hidden="true" tabIndex={-1}
             onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void sobe(f); }} />
      <button className="btn" disabled={subindo} onClick={() => escolhe.current?.click()}>
        <Ic n="camera" />{subindo ? 'Subindo a imagem...' : 'Usar uma imagem minha'}
      </button>
    </div>
  );
}
