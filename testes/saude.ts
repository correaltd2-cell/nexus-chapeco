/* Prova dos avisos de saúde: o que vira alarme, quando some, e o que é só barulho.
   Rodar:  node --experimental-strip-types testes/saude.ts  */
import {
  avisosDaSaude, camposDoJaVi, classificaErroDoBanco, classificaRecusa, explicaErroDoServidor,
  linhasDaSaude, type EstadoServidor, type Saude,
} from '../src/lib/dominio/saude.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}

const AGORA = new Date('2026-11-19T14:30:00-03:00');
const antes = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString();
type Opcoes = { automaticoLigado: boolean; servidor: EstadoServidor };
const ok: Opcoes = { automaticoLigado: false, servidor: 'ok' };
const chaves = (s: Saude | null, o: Opcoes = ok) => avisosDaSaude(s, AGORA, o).map((a) => a.chave);

/* ---------- tudo bem ---------- */
igual('sem documento, sem aviso', chaves(null), []);
igual('tudo andando, sem aviso', chaves({
  webhookEm: antes(1), entradaEm: antes(3), saidaEm: antes(2), relogioEm: antes(1), agendadasEm: antes(8),
}, { automaticoLigado: true, servidor: 'ok' }), []);
igual('não saber do servidor não é alarme', chaves(null, { automaticoLigado: false, servidor: 'desconhecido' }), []);

/* ---------- servidor sem banco (o caso de 19/11) ---------- */
igual('servidor sem chave', chaves(null, { automaticoLigado: false, servidor: 'sem_chave' }), ['servidor_sem_chave']);
igual('servidor sem permissão é grave e não se dispensa',
  avisosDaSaude(null, AGORA, { automaticoLigado: false, servidor: 'sem_permissao' }).map((a) => [a.grave, a.dispensavel]),
  [[true, false]]);

/* ---------- a Meta calada ---------- */
igual('enviou e a Meta não voltou: alarme', chaves({ saidaEm: antes(15), webhookEm: antes(300) }), ['meta_calada']);
igual('enviou e nunca houve chamada da Meta: alarme', chaves({ saidaEm: antes(15) }), ['meta_calada']);
igual('enviou há pouco: ainda espera', chaves({ saidaEm: antes(5), webhookEm: antes(300) }), []);
igual('a Meta voltou depois do envio: sem alarme', chaves({ saidaEm: antes(15), webhookEm: antes(14) }), []);
/* as batidas são gravadas no máximo uma vez por minuto: a chamada da Meta pode ter
   ficado anotada até um minuto antes do envio sem ser problema */
igual('batida da Meta gravada pouco antes do envio não é alarme', chaves({ saidaEm: antes(15), webhookEm: antes(16) }), []);
igual('nunca enviou: não dá para saber, sem alarme', chaves({ webhookEm: antes(900) }), []);

/* ---------- relógio e fila ---------- */
const ligado = { automaticoLigado: true, servidor: 'ok' as const };
igual('relógio parado com o automático ligado', chaves({ relogioEm: antes(25) }, ligado), ['relogio_parado']);
igual('relógio que nunca rodou com o automático ligado', chaves({}, ligado), ['relogio_parado']);
igual('relógio parado com o automático desligado: sem alarme', chaves({ relogioEm: antes(25) }), []);
igual('relógio em dia', chaves({ relogioEm: antes(2) }, ligado), []);
igual('fila parada', chaves({ agendadasEm: antes(90) }), ['fila_parada']);
igual('fila em dia', chaves({ agendadasEm: antes(12) }), []);

/* ---------- falhas e o "já vi" ---------- */
const comFalhas: Saude = {
  falhas: {
    envio: { motivo: 'O token do WhatsApp expirou ou foi revogado', em: antes(30), vezes: 4 },
    ia: { motivo: 'A IA demorou demais', em: antes(5), vezes: 1 },
  },
};
const avisos = avisosDaSaude(comFalhas, AGORA, ok);
igual('falhas viram aviso, a mais recente primeiro', avisos.map((a) => a.chave), ['falha_ia', 'falha_envio']);
igual('conta as vezes e diz quando', avisos[1].detalhe,
  'O token do WhatsApp expirou ou foi revogado. Aconteceu 4 vezes, a última há 30 min.');
igual('uma vez só', avisos[0].detalhe, 'A IA demorou demais. Foi há 5 min.');
igual('IA fora não é grave (há texto de reserva)', avisos[0].grave, false);
igual('token vencido é grave', avisos[1].grave, true);

const visto = { ...comFalhas, ...camposDoJaVi(comFalhas, new Date(antes(3))) };
igual('depois do já vi, somem', chaves(visto), []);
igual('o já vi zera a contagem e guarda o motivo', visto.falhas?.envio,
  { motivo: 'O token do WhatsApp expirou ou foi revogado', em: antes(30), vezes: 0 });
const voltou: Saude = { ...visto, falhas: { ...visto.falhas, envio: { motivo: 'De novo', em: antes(1), vezes: 1 } } };
igual('falha nova depois do já vi volta a aparecer', chaves(voltou), ['falha_envio']);

igual('o que segue quebrado vem antes das falhas', chaves({ ...comFalhas, saidaEm: antes(40) }),
  ['meta_calada', 'falha_ia', 'falha_envio']);

/* ---------- linhas ---------- */
igual('linhas dizem quando cada parte andou', linhasDaSaude({ webhookEm: antes(0.5), entradaEm: antes(90) }, AGORA).slice(0, 3).map((l) => l.valor),
  ['agora há pouco', 'há 1 h 30 min', 'nenhum ainda']);

/* ---------- recusas da Meta ---------- */
igual('token vencido é da conta', classificaRecusa(190), 'conta');
igual('sem pagamento é da conta', classificaRecusa(131042), 'conta');
igual('rede fora é da conta', classificaRecusa(undefined), 'conta');
igual('modelo inexistente é do modelo', classificaRecusa(132001), 'modelo');
igual('janela fechada é do dia a dia', classificaRecusa(131047), 'contato');
igual('número sem WhatsApp é do dia a dia', classificaRecusa(131026), 'contato');

/* ---------- erros do banco ---------- */
igual('sem a variável', classificaErroDoBanco('FIREBASE_SERVICE_ACCOUNT nao esta no ambiente'), 'sem_chave');
igual('JSON quebrado', classificaErroDoBanco('Unexpected token } in JSON at position 4'), 'sem_chave');
igual('permissão negada', classificaErroDoBanco('7 PERMISSION_DENIED: Missing or insufficient permissions.'), 'sem_permissao');
igual('outra coisa', classificaErroDoBanco('socket hang up'), 'fora');
igual('explica permissão', explicaErroDoServidor('7 PERMISSION_DENIED: Missing or insufficient permissions.'),
  'O banco recusou a gravação: a conta de serviço está sem permissão.');
igual('erro desconhecido passa curto', explicaErroDoServidor('x'.repeat(300)).length, 200);

if (falhas) {
  console.log(`saúde: ${falhas} caso(s) falharam`);
  process.exit(1);
}
console.log('saúde: todos os casos passaram');
