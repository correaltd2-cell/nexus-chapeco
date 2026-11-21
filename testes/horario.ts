/* Prova do horário de atendimento (src/lib/dominio/horario.ts). As horas são de
   Chapecó; os instantes vão em UTC (-03:00), como o servidor vê.
   Rodar:  node --experimental-strip-types testes/horario.ts  */
import {
  HORARIO_PADRAO, estaAberto, faixasDoTexto, horaFalada, horarioEmTexto, leFaixas, minutosDa, minutosUteis,
  proximaAbertura, relogioLocal, textoDoDia, ultimoFechamento,
} from '../src/lib/dominio/horario.ts';

let falhas = 0;
function igual<T>(nome: string, veio: T, esperado: T) {
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  x ${nome}\n    esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);
  }
}
/* 23/11/2026 é segunda-feira */
const em = (dia: number, hora: string) => new Date(`2026-11-${String(dia).padStart(2, '0')}T${hora}:00-03:00`);
const H = HORARIO_PADRAO;

igual('relógio de Chapecó', relogioLocal(em(23, '08:30')), { dia: 1, minutos: 510 });
igual('meia-noite e meia em Chapecó ainda é o dia certo', relogioLocal(new Date('2026-11-24T03:30:00Z')), { dia: 2, minutos: 30 });
igual('horas escritas', [minutosDa('8'), minutosDa('08:00'), minutosDa('8h30'), minutosDa('13h'), minutosDa('25:00'), minutosDa('oi')], [480, 480, 510, 780, null, null]);
igual('hora falada', [horaFalada(480), horaFalada(810), horaFalada(720)], ['8h', '13h30', '12h']);

/* aberto ou fechado */
igual('segunda 8h abre', estaAberto(H, em(23, '08:00')), true);
igual('segunda 7h59 fechado', estaAberto(H, em(23, '07:59')), false);
igual('meio-dia fecha', estaAberto(H, em(23, '12:00')), false);
igual('almoço fechado', estaAberto(H, em(23, '13:00')), false);
igual('13h30 abre', estaAberto(H, em(23, '13:30')), true);
igual('21h29 aberto', estaAberto(H, em(23, '21:29')), true);
igual('21h30 fecha', estaAberto(H, em(23, '21:30')), false);
igual('sábado 10h aberto', estaAberto(H, em(28, '10:00')), true);
igual('sábado 13h fechado', estaAberto(H, em(28, '13:00')), false);
igual('domingo fechado', estaAberto(H, em(29, '10:00')), false);

/* quando volta */
const volta = (d: Date) => proximaAbertura(H, d)?.texto;
igual('no almoço volta hoje', volta(em(23, '12:10')), 'hoje às 13h30');
igual('de noite volta amanhã', volta(em(23, '22:00')), 'amanhã às 8h');
igual('de madrugada volta hoje', volta(em(24, '05:00')), 'hoje às 8h');
igual('sexta de noite volta sábado', volta(em(27, '22:00')), 'amanhã às 9h');
igual('sábado à tarde volta segunda', volta(em(28, '15:00')), 'segunda às 8h');
igual('domingo volta amanhã', volta(em(29, '11:00')), 'amanhã às 8h');
igual('a hora exata da volta', proximaAbertura(H, em(28, '15:00'))?.em.toISOString(), em(30, '08:00').toISOString());
igual('só segunda: na próxima', proximaAbertura([{ dia: 1, abre: '08:00', fecha: '12:00' }], em(23, '13:00'))?.texto, 'na próxima segunda às 8h');
igual('sem horário', proximaAbertura([], em(23, '13:00')), null);

/* quando fechou */
igual('fechou no meio-dia', ultimoFechamento(H, em(23, '12:40'))?.toISOString(), em(23, '12:00').toISOString());
igual('domingo: fechou sábado ao meio-dia', ultimoFechamento(H, em(29, '10:00'))?.toISOString(), em(28, '12:00').toISOString());
igual('segunda cedo: fechou sábado', ultimoFechamento(H, em(23, '07:00'))?.toISOString(), em(21, '12:00').toISOString());

/* minutos de atendimento */
igual('dentro da faixa', minutosUteis(H, em(23, '09:00'), em(23, '10:30')), 90);
igual('atravessa o almoço', minutosUteis(H, em(23, '11:00'), em(23, '14:30')), 120);
igual('da noite para a manhã', minutosUteis(H, em(23, '21:00'), em(24, '09:00')), 90);
igual('sábado à noite até segunda 9h', minutosUteis(H, em(28, '20:00'), em(30, '09:00')), 60);
igual('fechado o tempo todo', minutosUteis(H, em(29, '08:00'), em(29, '20:00')), 0);
igual('ao contrário não conta', minutosUteis(H, em(24, '09:00'), em(23, '09:00')), 0);
igual('sem horário conta tudo', minutosUteis([], em(23, '09:00'), em(23, '10:00')), 60);

/* escrever e ler o horário */
igual('o horário falado', horarioEmTexto(H), 'segunda a sexta, das 8h às 12h e das 13h30 às 21h30; sábado, das 9h às 12h');
igual('texto do dia', textoDoDia(H, 1), '08:00-12:00, 13:30-21:30');
igual('dia fechado', textoDoDia(H, 0), '');
igual('digitado do jeito da escola', faixasDoTexto(1, '8h às 12h e 13h30 às 21h30'), { faixas: [{ dia: 1, abre: '08:00', fecha: '12:00' }, { dia: 1, abre: '13:30', fecha: '21:30' }] });
igual('vazio é fechado', faixasDoTexto(0, ''), { faixas: [] });
igual('fim antes do começo', 'erro' in faixasDoTexto(1, '12:00-08:00'), true);
igual('faixas que se cruzam', 'erro' in faixasDoTexto(1, '08:00-12:00, 11:00-14:00'), true);
igual('o que não é hora', 'erro' in faixasDoTexto(1, 'de manhã'), true);
igual('lê o guardado e descarta o torto', leFaixas([{ dia: 2, abre: '13:30', fecha: '21:30' }, { dia: 2, abre: '8:00', fecha: '12:00' }, { dia: 9, abre: '8', fecha: '9' }, { dia: 1, abre: '10', fecha: '09' }]),
  [{ dia: 2, abre: '08:00', fecha: '12:00' }, { dia: 2, abre: '13:30', fecha: '21:30' }]);
igual('sem nada guardado, o padrão', leFaixas(undefined).length, 11);

console.log(falhas ? `\n${falhas} falha(s)` : 'horário: tudo certo');
process.exit(falhas ? 1 : 0);
