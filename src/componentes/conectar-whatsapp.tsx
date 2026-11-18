'use client';
/* Conectar o WhatsApp da recepção por coexistência. A janela é a da Meta (Embedded
   Signup do app da Firma Moderna, que é Tech Provider): a recepção escolhe conectar o
   app do WhatsApp Business, lê o código no celular, e o mesmo número passa a chegar
   aqui sem sair do celular. Daqui só sai o código da Meta; o token é trocado e guardado
   no servidor. */
import { useRef, useState } from 'react';
import { modoDemo } from '@/lib/dados/fonte';
import { avisa } from '@/componentes/aviso';
import { dataHoraBR } from '@/lib/dominio/formato';
import { horaConhecida, useAgora } from '@/componentes/relogio';

type Chama = (caminho: string, corpo?: unknown) => Promise<Record<string, unknown>>;

interface RespostaLogin { authResponse?: { code?: string } | null }
interface SdkDaMeta {
  init(o: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }): void;
  login(cb: (r: RespostaLogin) => void, o: Record<string, unknown>): void;
}
declare global {
  interface Window { FB?: SdkDaMeta; fbAsyncInit?: () => void }
}

interface Sincronia { status?: string; em?: string; erro?: string; progresso?: number }
interface Conexao {
  numero?: string; nome?: string; coexistencia?: boolean; conectadoEm?: string; conectadoPor?: string;
  webhookDaConta?: string; contatosSync?: Sincronia; historicoSync?: Sincronia;
  contatosSincronizados?: number; historicoMensagens?: number;
}
interface Info { appId: string; configId: string; falta: string[]; porVariaveis: boolean; conexao: Conexao | null }
interface Passo { nome: string; ok: boolean; detalhe: string }

const SITUACAO: Record<string, string> = {
  PEDIDO: 'pedido, esperando a Meta mandar',
  RECEBIDO: 'recebido',
  RECEBENDO: 'chegando',
  COMPLETO: 'completo',
  ERRO: 'não veio',
};

export default function ConectarWhatsApp({ chama }: { chama: Chama }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  const [sdk, setSdk] = useState(false);
  const [passos, setPassos] = useState<Passo[] | null>(null);
  const agora = useAgora();
  const codigo = useRef<string | null>(null);
  const sessao = useRef<{ wabaId?: string; numeroId?: string } | null>(null);
  const enviado = useRef(false);
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const escuta = useRef<((e: MessageEvent) => void) | null>(null);

  async function carrega() {
    if (modoDemo) { setErro('Na demonstração não existe conexão com a Meta: isso funciona no sistema publicado.'); return; }
    setErro('');
    try {
      const r = await chama('/api/whatsapp/coexistencia');
      if (!r.ok) { setErro(String(r.erro || 'Não consegui ler a conexão.')); return; }
      const i = r as unknown as Info;
      setInfo(i);
      if (!i.falta.length) carregaSdk(i.appId);
    } catch {
      setErro('Não consegui falar com o servidor.');
    }
  }

  /* a janela da Meta precisa abrir direto do toque no botão, senão o navegador bloqueia:
     por isso o SDK carrega antes, quando a pessoa abre este bloco */
  function carregaSdk(appId: string) {
    if (window.FB) { setSdk(true); return; }
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v23.0' });
      setSdk(true);
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    s.async = true;
    s.defer = true;
    s.crossOrigin = 'anonymous';
    s.onerror = () => setErro('Não consegui carregar a janela da Meta. Se houver bloqueador de anúncios, libere o facebook.com nesta página.');
    document.body.appendChild(s);
  }

  function paraDeEscutar() {
    if (escuta.current) window.removeEventListener('message', escuta.current);
    escuta.current = null;
  }

  async function envia() {
    if (enviado.current || !codigo.current) return;
    enviado.current = true;
    clearTimeout(espera.current);
    paraDeEscutar();
    try {
      const r = await chama('/api/whatsapp/coexistencia', {
        acao: 'conectar', code: codigo.current, wabaId: sessao.current?.wabaId, numeroId: sessao.current?.numeroId,
      });
      setPassos((r.passos as Passo[] | undefined) || null);
      if (!r.ok) setErro(String(r.erro || 'Não consegui conectar.'));
      else avisa('WhatsApp da recepção conectado');
      await carrega();
    } catch {
      setErro('Não consegui falar com o servidor.');
    } finally {
      setIndo(false);
    }
  }

  function conectar() {
    if (!info || !window.FB) return;
    setErro(''); setPassos(null);
    codigo.current = null; sessao.current = null; enviado.current = false;

    /* a janela avisa por mensagem quando termina, e é nela que vem a conta conectada */
    const ouve = (e: MessageEvent) => {
      let host = '';
      try { host = new URL(e.origin).hostname; } catch { return; }
      if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return;
      let d: { type?: string; event?: string; data?: Record<string, string> } | null = null;
      try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      if (!d || d.type !== 'WA_EMBEDDED_SIGNUP') return;
      const evento = String(d.event || '');
      if (evento.startsWith('FINISH')) {
        sessao.current = { wabaId: d.data?.waba_id, numeroId: d.data?.phone_number_id };
        if (codigo.current) void envia();
      } else if (evento === 'CANCEL') {
        setErro(`O cadastro foi interrompido${d.data?.current_step ? ` (no passo ${d.data.current_step})` : ''}. Nada mudou.`);
      } else if (evento === 'ERROR') {
        setErro(`A Meta deu erro no cadastro: ${d.data?.error_message || 'sem detalhe'}.`);
      }
    };
    paraDeEscutar();
    escuta.current = ouve;
    window.addEventListener('message', ouve);

    window.FB.login((r) => {
      const code = r?.authResponse?.code;
      if (!code) {
        paraDeEscutar();
        setErro((atual) => atual || 'A janela da Meta foi fechada antes de terminar. Nada mudou.');
        return;
      }
      codigo.current = code;
      setIndo(true);
      /* a mensagem com a conta costuma chegar antes; se não chegar, o servidor descobre pelo token */
      if (sessao.current) void envia();
      else espera.current = setTimeout(() => void envia(), 6000);
    }, {
      config_id: info.configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
    });
  }

  async function acao(corpo: Record<string, unknown>, feito: string) {
    setIndo(true); setErro('');
    try {
      const r = await chama('/api/whatsapp/coexistencia', corpo);
      if (!r.ok) setErro(String(r.erro || 'Não consegui.'));
      else avisa(feito);
      await carrega();
    } catch {
      setErro('Não consegui falar com o servidor.');
    } finally {
      setIndo(false);
    }
  }

  const c = info?.conexao;
  /* contatos e histórico só podem ser pedidos até 24 horas depois de conectar */
  const dentroDas24h = Boolean(c?.conectadoEm && horaConhecida(agora)
    && agora.getTime() - new Date(c.conectadoEm).getTime() < 24 * 3600 * 1000);
  const ponto = (s?: Sincronia) => (s?.status === 'ERRO' ? 'erro' : s?.status === 'COMPLETO' || s?.status === 'RECEBIDO' ? 'ok' : 'aviso');

  return (
    <section className="bl">
      <p className="bt">
        WhatsApp da recepção, com coexistência
        {!info && <button className="tx-btn" onClick={() => void carrega()}>Ver a conexão</button>}
      </p>

      {!info && !erro && (
        <p className="vz">
          O número da recepção continua no WhatsApp Business do celular e passa a chegar aqui,
          com o que a recepção mandar pelo celular e o histórico dos últimos meses.
        </p>
      )}

      {info && info.falta.length > 0 && (
        <div className="lin">
          <span className="pt falta" aria-hidden="true" />
          <span className="co">
            <b>Falta configurar na Vercel</b>
            <small>{info.falta.join(', ')}</small>
            <small className="cons">O passo a passo está em docs/whatsapp-coexistencia.md. Depois de preencher, publique de novo.</small>
          </span>
        </div>
      )}

      {c?.numero && (
        <>
          <div className="lin">
            <span className={`pt ${c.coexistencia ? 'ok' : 'aviso'}`} aria-hidden="true" />
            <span className="co">
              <b>{c.nome ? `${c.nome}: ` : ''}{c.numero}</b>
              <small>
                {c.coexistencia ? 'No celular e no sistema ao mesmo tempo.' : 'Para a Meta, este número não está no app do celular.'}
                {c.conectadoEm ? ` Conectado em ${dataHoraBR(c.conectadoEm)}${c.conectadoPor ? ` por ${c.conectadoPor}` : ''}.` : ''}
              </small>
            </span>
          </div>
          <div className="lin">
            <span className={`pt ${ponto(c.contatosSync)}`} aria-hidden="true" />
            <span className="co">
              <b>Agenda de contatos do celular: {SITUACAO[c.contatosSync?.status || ''] || 'não pedida'}</b>
              <small>{c.contatosSync?.erro || (c.contatosSincronizados ? `${c.contatosSincronizados} contatos recebidos.` : 'Chega uma vez, poucos minutos depois de conectar.')}</small>
            </span>
          </div>
          <div className="lin">
            <span className={`pt ${ponto(c.historicoSync)}`} aria-hidden="true" />
            <span className="co">
              <b>
                Histórico de conversas: {SITUACAO[c.historicoSync?.status || ''] || 'não pedido'}
                {c.historicoSync?.status === 'RECEBENDO' && c.historicoSync.progresso != null ? ` (${c.historicoSync.progresso}%)` : ''}
              </b>
              <small>{c.historicoSync?.erro || (c.historicoMensagens ? `${c.historicoMensagens} mensagens antigas guardadas.` : 'Até 180 dias, em lotes. As conversas antigas entram como encerradas.')}</small>
            </span>
          </div>
        </>
      )}

      {passos && (
        <div className="frm">
          <span className="obs" style={{ padding: 0 }}>O que aconteceu na conexão</span>
          {passos.map((p) => (
            <p key={p.nome} className={p.ok ? 'obs' : 'obs alerta'} style={{ padding: 0 }}>
              {p.ok ? 'Feito' : 'Atenção'}: <b>{p.nome}</b>. {p.detalhe}
            </p>
          ))}
        </div>
      )}

      {erro && <p className="erro" style={{ padding: '0 18px 10px' }}>{erro}</p>}

      {info && !info.falta.length && (
        <div className="frm">
          {info.porVariaveis && (
            <p className="obs">Hoje o número está ligado pelas variáveis da Vercel. Para usar a coexistência, tire WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID de lá depois de conectar por aqui.</p>
          )}
          <p className="obs forte">
            Antes de conectar: o celular da recepção com o WhatsApp Business atualizado e por
            perto, porque a Meta pede para ler um código nele. Na janela, escolha conectar o app
            do WhatsApp Business que já existe. O número não pode estar ligado à API em outro lugar.
          </p>
          <div className="acoes" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', display: 'flex', gap: 8 }}>
            <button className="btn p" disabled={!sdk || indo} onClick={conectar}>
              {indo ? 'Conectando...' : c?.numero ? 'Conectar de novo' : 'Conectar o WhatsApp da recepção'}
            </button>
            {c?.numero && dentroDas24h && c.contatosSync?.status === 'ERRO' && (
              <button className="btn" disabled={indo} onClick={() => void acao({ acao: 'sincronizar', tipo: 'contatos' }, 'Agenda pedida de novo')}>
                Pedir a agenda de novo
              </button>
            )}
            {c?.numero && dentroDas24h && c.historicoSync?.status === 'ERRO' && (
              <button className="btn" disabled={indo} onClick={() => void acao({ acao: 'sincronizar', tipo: 'historico' }, 'Histórico pedido de novo')}>
                Pedir o histórico de novo
              </button>
            )}
            {c?.numero && (
              <button className="btn" disabled={indo} onClick={() => void acao({ acao: 'webhook' }, 'Webhook refeito')}>
                Refazer o webhook
              </button>
            )}
            <button className="tx-btn" disabled={indo} onClick={() => void carrega()}>Atualizar</button>
          </div>
          {!sdk && <p className="obs">Carregando a janela da Meta...</p>}
        </div>
      )}
    </section>
  );
}
