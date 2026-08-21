/**
 * RMR OPS — Web App que expõe Indisponibilidade e Claim/APV (BigQuery) como JSON.
 *
 * Réplica exata das fórmulas já validadas em:
 *   Claudinho/Turbi/Reuniao De Resultados - OPS/automacao/backend/queries/indisponibilidade.py
 *   Claudinho/Turbi/Reuniao De Resultados - OPS/automacao/backend/queries/claim_apv.py
 *
 * Requisitos antes de implantar:
 *   1. No editor do Apps Script: Serviços (+) → adicionar "BigQuery API" (serviço avançado).
 *   2. Implantar → Nova implantação → tipo "App da Web" → Executar como "Eu" → Acesso "Qualquer pessoa".
 *   3. Na primeira execução, autorizar com a conta lui.amaral@turbi.com.br (mesma conta que já lê
 *      turbi-dc-ops via gcloud) — não precisa de service account nem credencial nova.
 *
 * Importante: ContentService sempre responde HTTP 200, mesmo em erro — por isso todo erro vem
 * como corpo { "detail": "..." }. O front-end (index.html) trata isso explicitamente, não via
 * res.ok (que não existe aqui).
 */

var PROJECT_ID = 'turbi-dc-ops';
var TIMEZONE = 'America/Sao_Paulo';

// Ordem e cores fixas — idêntico a CATEGORIAS em indisponibilidade.py.
var CATEGORIAS = [
  { status: '09-Sinistro', name: 'Sinistro', color: '#232733' },
  { status: '06-Lavagem', name: 'Lavagem/Preparação', color: '#2E3340' },
  { status: '15-Preparando a Desmobilizacao', name: 'Prep. Desmobilização', color: '#3A4050' },
  { status: '11-Outros', name: 'Outros', color: '#474E60' },
  { status: '08-Mudanca de Pod', name: 'Mudança de Pod', color: '#555D70' },
  { status: '07-Revisao', name: 'Revisão', color: '#646C80' },
  { status: '13-Bateria baixa', name: 'Bateria baixa', color: '#747C90' },
  { status: '10-Manutencao de Pneus', name: 'Manut. Pneus', color: '#8790A0' },
  { status: '12-Sem Comunicacao', name: 'Sem Comunicação', color: '#9AA1B0' },
  { status: '17-Manut. IOT', name: 'Manut. IOT', color: '#AEB4C0' },
  { status: '19-Falha instalação', name: 'Falha de Instalação', color: '#C3C8D0' },
  { status: 'OPERATIONAL', name: 'Operational', color: '#D8DBE0' },
];

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

function doGet(e) {
  var params = (e && e.parameter) || {};
  try {
    var endpoint = params.endpoint;
    var range = defaultRange_(params.start_date, params.end_date);
    var city = params.city || null;

    var data;
    if (endpoint === 'indisponibilidade') {
      data = getIndisponibilidade(range.start, range.end, city);
    } else if (endpoint === 'claim-apv') {
      data = getClaimApv(range.start, range.end, city);
    } else {
      data = { detail: 'endpoint inválido — use ?endpoint=indisponibilidade ou ?endpoint=claim-apv' };
    }
    return jsonOutput_(data);
  } catch (err) {
    return jsonOutput_({ detail: String(err && err.message ? err.message : err) });
  }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Mesma regra do _default_range() do FastAPI: 1º de janeiro do ano corrente até ontem. */
function defaultRange_(startParam, endParam) {
  var today = new Date();
  var yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  var jan1 = new Date(today.getFullYear(), 0, 1);
  return {
    start: startParam || Utilities.formatDate(jan1, TIMEZONE, 'yyyy-MM-dd'),
    end: endParam || Utilities.formatDate(yesterday, TIMEZONE, 'yyyy-MM-dd'),
  };
}

/* -------------------------------------------------------------------------- */
/* BigQuery helper                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Executa uma query parametrizada no BigQuery e devolve linhas como objetos
 * simples { nomeDoCampo: valor }. Usa o serviço avançado BigQuery (Serviços → BigQuery API).
 */
function runQuery_(sql, queryParameters) {
  var request = {
    query: sql,
    useLegacySql: false,
    parameterMode: 'NAMED',
    queryParameters: queryParameters,
  };

  var response = BigQuery.Jobs.query(request, PROJECT_ID);
  var jobId = response.jobReference.jobId;
  var location = response.jobReference.location;

  // Pagina até jobComplete=true e junta todas as páginas de linhas.
  var rows = response.rows || [];
  var pageToken = response.pageToken;
  while (!response.jobComplete || pageToken) {
    response = BigQuery.Jobs.getQueryResults(PROJECT_ID, jobId, {
      location: location,
      pageToken: pageToken,
    });
    if (response.rows) rows = rows.concat(response.rows);
    pageToken = response.pageToken;
    if (!pageToken) break;
  }

  var fields = (response.schema && response.schema.fields) || [];
  return rows.map(function (row) {
    var obj = {};
    row.f.forEach(function (cell, i) {
      obj[fields[i].name] = cell.v;
    });
    return obj;
  });
}

function param_(name, type, value) {
  return { name: name, parameterType: { type: type }, parameterValue: { value: value } };
}

/* -------------------------------------------------------------------------- */
/* Indisponibilidade — réplica de indisponibilidade.py                        */
/* -------------------------------------------------------------------------- */

function getIndisponibilidade(startDate, endDate, city) {
  var hasCity = !!city;
  var sql =
    'WITH filtered AS (' +
    "  SELECT FORMAT_DATE('%Y-%m', dt_result) AS ym, status_ajustado, segundos_no_status" +
    '  FROM `turbi-dc-ops.ops_geral.vw_frota_historico_contabil`' +
    '  WHERE dt_result BETWEEN @start_date AND @end_date' +
    (hasCity ? '  AND podCity = @city' : '') +
    '), totals AS (' +
    '  SELECT ym, SUM(segundos_no_status) AS total_seg FROM filtered GROUP BY ym' +
    '), cats AS (' +
    '  SELECT ym, status_ajustado, SUM(segundos_no_status) AS seg_cat' +
    '  FROM filtered' +
    "  WHERE status_ajustado IN ('09-Sinistro','06-Lavagem','15-Preparando a Desmobilizacao'," +
    "    '11-Outros','08-Mudanca de Pod','07-Revisao','13-Bateria baixa','10-Manutencao de Pneus'," +
    "    '12-Sem Comunicacao','17-Manut. IOT','19-Falha instalação','OPERATIONAL')" +
    '  GROUP BY ym, status_ajustado' +
    ')' +
    'SELECT c.ym, c.status_ajustado, t.total_seg, c.seg_cat ' +
    'FROM cats c JOIN totals t USING (ym) ' +
    'ORDER BY c.ym';

  var params = [param_('start_date', 'DATE', startDate), param_('end_date', 'DATE', endDate)];
  if (hasCity) params.push(param_('city', 'STRING', city));

  var rows = runQuery_(sql, params);

  var meses = Array.from(new Set(rows.map(function (r) { return r.ym; }))).sort();

  // total_seg por mês (igual para todas as categorias daquele mês).
  var totalSegByMonth = {};
  rows.forEach(function (r) {
    totalSegByMonth[r.ym] = Number(r.total_seg);
  });

  var categorias = CATEGORIAS.map(function (cat) {
    var byMonth = {};
    rows.forEach(function (r) {
      if (r.status_ajustado === cat.status) byMonth[r.ym] = Number(r.seg_cat);
    });

    var values = meses.map(function (m) {
      var totalSeg = totalSegByMonth[m] || 1; // proteção contra zero, igual ao "or 1" do Python
      var segCat = byMonth[m] || 0;
      return round2_((100 * segCat) / totalSeg);
    });

    var ytdSegCat = meses.reduce(function (acc, m) { return acc + (byMonth[m] || 0); }, 0);
    var ytdTotalSeg = meses.reduce(function (acc, m) { return acc + (totalSegByMonth[m] || 0); }, 0) || 1;
    var ytd = round2_((100 * ytdSegCat) / ytdTotalSeg);

    return { name: cat.name, color: cat.color, values: values, ytd: ytd };
  });

  // bq_direto = soma dos segundos BRUTOS das 12 categorias por mês, arredondando só no
  // final (igual ao Python) — nunca somar os % já arredondados de "categorias", senão o
  // arredondamento acumula erro de até 0,01pp por mês.
  var segKpiByMonth = {};
  rows.forEach(function (r) {
    segKpiByMonth[r.ym] = (segKpiByMonth[r.ym] || 0) + Number(r.seg_cat);
  });
  var bqDireto = meses.map(function (m) {
    var totalSeg = totalSegByMonth[m] || 1;
    return round2_((100 * (segKpiByMonth[m] || 0)) / totalSeg);
  });

  var ytdSegCatTotal = 0;
  var ytdTotalSegAll = meses.reduce(function (acc, m) { return acc + (totalSegByMonth[m] || 0); }, 0) || 1;
  CATEGORIAS.forEach(function (cat) {
    rows.forEach(function (r) {
      if (r.status_ajustado === cat.status) ytdSegCatTotal += Number(r.seg_cat);
    });
  });
  var ytdBqDireto = round2_((100 * ytdSegCatTotal) / ytdTotalSegAll);

  return { meses: meses, categorias: categorias, bq_direto: bqDireto, ytd_bq_direto: ytdBqDireto };
}

/* -------------------------------------------------------------------------- */
/* Claim/APV — réplica de claim_apv.py                                        */
/* -------------------------------------------------------------------------- */

function getClaimApv(startDate, endDate, city) {
  var hasCity = !!city;

  var baseCte = hasCity
    ? 'WITH base AS (' +
      "  SELECT r.bookingId, FORMAT_DATE('%Y-%m', r.dt_conclusao) AS ym," +
      '    r.review_item_category, r.ReviewItemLabel, r.ReviewItemName' +
      '  FROM `turbi-dc-ops.atendimento.vw_post_trip_review_por_item` r' +
      '  LEFT JOIN (' +
      '    SELECT DISTINCT podid, podCity FROM `turbi-dc-ops.ops_geral.vw_frota_historico_contabil`' +
      '  ) f ON r.podid = f.podid' +
      '  WHERE r.dt_conclusao BETWEEN @start_date AND @end_date' +
      '  AND f.podCity = @city' +
      ')'
    : 'WITH base AS (' +
      "  SELECT r.bookingId, FORMAT_DATE('%Y-%m', r.dt_conclusao) AS ym," +
      '    r.review_item_category, r.ReviewItemLabel, r.ReviewItemName' +
      '  FROM `turbi-dc-ops.atendimento.vw_post_trip_review_por_item` r' +
      '  WHERE r.dt_conclusao BETWEEN @start_date AND @end_date' +
      ')';

  var sql =
    baseCte +
    ', totals AS (' +
    '  SELECT ym, COUNT(DISTINCT bookingId) AS total_bookings FROM base GROUP BY ym' +
    '), wash AS (' +
    '  SELECT ym, COUNT(DISTINCT bookingId) AS n FROM base' +
    "  WHERE review_item_category = 'Limpeza e cheiro' GROUP BY ym" +
    '), damage AS (' +
    '  SELECT ym, COUNT(DISTINCT bookingId) AS n FROM base' +
    "  WHERE review_item_category = 'Avarias no veículo' AND ReviewItemLabel != 'Cars' GROUP BY ym" +
    '), pod AS (' +
    '  SELECT ym, COUNT(DISTINCT bookingId) AS n FROM base' +
    "  WHERE review_item_category = 'Estacionamento' AND ReviewItemName != 'Vagas' GROUP BY ym" +
    ') ' +
    'SELECT t.ym, t.total_bookings, COALESCE(w.n, 0) AS wash_n, COALESCE(d.n, 0) AS damage_n, COALESCE(p.n, 0) AS pod_n ' +
    'FROM totals t ' +
    'LEFT JOIN wash w USING (ym) ' +
    'LEFT JOIN damage d USING (ym) ' +
    'LEFT JOIN pod p USING (ym) ' +
    'ORDER BY t.ym';

  var params = [param_('start_date', 'DATE', startDate), param_('end_date', 'DATE', endDate)];
  if (hasCity) params.push(param_('city', 'STRING', city));

  var rows = runQuery_(sql, params);
  var meses = rows.map(function (r) { return r.ym; });

  var wash = [];
  var damage = [];
  var pod = [];
  var soma = [];
  var totalBookingsSum = 0;
  var washSum = 0;
  var damageSum = 0;
  var podSum = 0;

  rows.forEach(function (r) {
    var totalBookings = Number(r.total_bookings) || 1; // proteção contra zero
    var washPct = round2_((100 * Number(r.wash_n)) / totalBookings);
    var damagePct = round2_((100 * Number(r.damage_n)) / totalBookings);
    var podPct = round2_((100 * Number(r.pod_n)) / totalBookings);
    wash.push(washPct);
    damage.push(damagePct);
    pod.push(podPct);
    soma.push(round2_(washPct + damagePct + podPct));

    totalBookingsSum += Number(r.total_bookings);
    washSum += Number(r.wash_n);
    damageSum += Number(r.damage_n);
    podSum += Number(r.pod_n);
  });

  var totalBookingsYtd = totalBookingsSum || 1;
  var ytdWash = round2_((100 * washSum) / totalBookingsYtd);
  var ytdDamage = round2_((100 * damageSum) / totalBookingsYtd);
  var ytdPod = round2_((100 * podSum) / totalBookingsYtd);
  var ytdSoma = round2_(ytdWash + ytdDamage + ytdPod);

  return {
    meses: meses,
    wash: wash,
    damage: damage,
    pod: pod,
    soma: soma,
    ytd: { wash: ytdWash, damage: ytdDamage, pod: ytdPod, soma: ytdSoma },
  };
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/* Teste manual — rodar do editor do Apps Script antes de implantar           */
/* -------------------------------------------------------------------------- */

function testeManual() {
  var range = defaultRange_(null, null);
  Logger.log('Indisponibilidade nacional: %s', JSON.stringify(getIndisponibilidade(range.start, range.end, null)));
  Logger.log('Indisponibilidade Campinas: %s', JSON.stringify(getIndisponibilidade(range.start, range.end, 'Campinas')));
  Logger.log('Claim/APV nacional: %s', JSON.stringify(getClaimApv(range.start, range.end, null)));
  Logger.log('Claim/APV Campinas: %s', JSON.stringify(getClaimApv(range.start, range.end, 'Campinas')));
}
