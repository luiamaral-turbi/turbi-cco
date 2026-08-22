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

// Ordem fixa (não muda). Cores: rampa única em tom de azul da marca Turbi (#231DB0,
// escuro→claro) — 3ª versão da paleta categórica. Trocou a rampa cinza-azulada
// dessaturada anterior por pedido do Lui (2026-08-22): queria a identidade visual da
// marca mais presente, não mais neutro/cinza. Mesma rampa usada em COGS_COLORS e nas
// cores de Wash/Damage/POD do index.html — trocar aqui exige trocar lá também.
var CATEGORIAS = [
  { status: '09-Sinistro', name: 'Sinistro', color: '#120F4A' },
  { status: '06-Lavagem', name: 'Lavagem/Preparação', color: '#171469' },
  { status: '15-Preparando a Desmobilizacao', name: 'Prep. Desmobilização', color: '#1E1987' },
  { status: '11-Outros', name: 'Outros', color: '#231DB0' },
  { status: '08-Mudanca de Pod', name: 'Mudança de Pod', color: '#2B26C4' },
  { status: '07-Revisao', name: 'Revisão', color: '#3B36D8' },
  { status: '13-Bateria baixa', name: 'Bateria baixa', color: '#5854DD' },
  { status: '10-Manutencao de Pneus', name: 'Manut. Pneus', color: '#7572E3' },
  { status: '12-Sem Comunicacao', name: 'Sem Comunicação', color: '#938FE9' },
  { status: '17-Manut. IOT', name: 'Manut. IOT', color: '#B0ADEE' },
  { status: '19-Falha instalação', name: 'Falha de Instalação', color: '#C9C7F3' },
  { status: 'OPERATIONAL', name: 'Operational', color: '#DDDCF8' },
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
    } else if (endpoint === 'claim-detail') {
      data = getClaimDetail(range.start, range.end, city, params.component);
    } else {
      data = { detail: 'endpoint inválido — use ?endpoint=indisponibilidade, ?endpoint=claim-apv ou ?endpoint=claim-detail' };
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
/* Claim/APV — drill-down por componente (Pareto 2 níveis + nuvem de palavras) */
/*                                                                              */
/* Hoje só "damage" está implementado (fase 1, pedido do Lui). wash/pod         */
/* respondem {detail:...} até serem implementados no mesmo padrão — nunca      */
/* erro 500. NÃO reaproveita/edita getClaimApv() — é uma CTE irmã, com 2       */
/* colunas extras (ReviewSectionGroupName, PostTripReviewComment).            */
/*                                                                              */
/* Requisito de privacidade (LGPD, não-negociável — site é público, sem       */
/* login): o comentário bruto do cliente NUNCA sai do BigQuery. Toda a         */
/* tokenização/contagem/anonimização roda dentro do SQL (query B abaixo) —    */
/* stopwords PT, tamanho mínimo de palavra, frequência mínima (HAVING),        */
/* e exclusão de tokens com formato de placa/número puro.                     */
/* -------------------------------------------------------------------------- */

var CLAIM_DETAIL_COMPONENTS = {
  damage: { category: 'Avarias no veículo', extraFilterSql: "AND ReviewItemLabel != 'Cars'" },
  // wash/pod entram aqui depois, no mesmo padrão. Atenção: getClaimApv() usa
  // ReviewItemName (não ReviewItemLabel) pra excluir 'Vagas' em POD — conferir
  // se ReviewItemLabel é mesmo o campo certo pro Pareto nível 2 de POD antes
  // de só copiar a config de Damage.
};

// Stopwords em português SEM acento (o pipeline de tokenização remove acento
// das palavras também, via NORMALIZE(...,NFD) + remoção de \p{Mn} — a lista
// precisa casar). Curada, não exaustiva — revisar contra o resultado real da
// 1ª execução em produção e completar com ruído encontrado (é código, não
// dado; iterar aqui é seguro).
var DAMAGE_STOPWORDS_PT = [
  'a','ao','aos','aquela','aquelas','aquele','aqueles','aquilo','as','ate','com','como',
  'da','das','de','dela','delas','dele','deles','depois','do','dos','e','ela','elas','ele',
  'eles','em','entao','entre','era','eram','essa','essas','esse','esses','esta','estas',
  'este','estes','estou','estamos','estao','estava','estavam','estive','eu','foi','foram',
  'fosse','fui','ha','isso','isto','ja','la','lhe','lhes','lo','mais','mas','me','mesmo',
  'meu','meus','minha','minhas','muito','muita','muitos','muitas','na','nas','nao','nem',
  'no','nos','nossa','nossas','nosso','nossos','num','numa','o','os','ou','para','pela',
  'pelas','pelo','pelos','per','pode','podem','pois','por','porque','porem','qual','quando',
  'que','quem','se','sem','ser','seu','seus','so','sua','suas','tal','tambem','te','tem',
  'tendo','tenho','ter','teu','teus','ti','tinha','tinham','tive','tivemos','toda','todas',
  'todo','todos','tu','tua','tuas','um','uma','umas','uns','vai','vao','vc','voce','voces',
  'vos','sido','sendo','apos','ai','tipo','pra','pro','bem','aqui','coisa','tava','tao','meio',
];

function sqlStringList_(arr) {
  return arr.map(function (w) { return "'" + String(w).replace(/'/g, "\\'") + "'"; }).join(',');
}

/** CTE irmã da de getClaimApv(), com 2 colunas extras pro drill-down. */
function claimDetailScopedCte_(city, componentCfg) {
  var hasCity = !!city;
  var join = hasCity
    ? '  LEFT JOIN (SELECT DISTINCT podid, podCity FROM `turbi-dc-ops.ops_geral.vw_frota_historico_contabil`) f ON r.podid = f.podid\n'
    : '';
  var cityFilter = hasCity ? '  AND f.podCity = @city\n' : '';
  return (
    'WITH base AS (\n' +
    '  SELECT r.bookingId, r.review_item_category, r.ReviewItemLabel,\n' +
    '    r.ReviewSectionGroupName, r.PostTripReviewComment\n' +
    '  FROM `turbi-dc-ops.atendimento.vw_post_trip_review_por_item` r\n' +
    join +
    '  WHERE r.dt_conclusao BETWEEN @start_date AND @end_date\n' +
    cityFilter +
    '),\n' +
    'scoped AS (\n' +
    "  SELECT bookingId, COALESCE(ReviewSectionGroupName, 'Outros/Sem classificação') AS grupo,\n" +
    '    ReviewItemLabel AS item, PostTripReviewComment AS comentario\n' +
    '  FROM base\n' +
    '  WHERE review_item_category = @category\n' +
    '  ' + componentCfg.extraFilterSql + '\n' +
    ')\n'
  );
}

function getClaimDetail(startDate, endDate, city, component) {
  var cfg = CLAIM_DETAIL_COMPONENTS[component];
  if (!cfg) {
    return { detail: "component inválido ou ainda não implementado — use ?component=damage" };
  }
  var hasCity = !!city;
  var scopedCte = claimDetailScopedCte_(city, cfg);
  var baseParams = [
    param_('start_date', 'DATE', startDate),
    param_('end_date', 'DATE', endDate),
    param_('category', 'STRING', cfg.category),
  ];
  if (hasCity) baseParams.push(param_('city', 'STRING', city));

  // Query A — Pareto nível 1 (grupo) + nível 2 (item) juntos. Nível 1 é derivado
  // aqui no Apps Script somando os itens de cada grupo — garante por construção
  // que "soma dos itens do grupo = contagem do grupo" (evita divergência entre
  // os dois Paretos). COUNT(DISTINCT bookingId+item), não COUNT(*): proteção
  // contra fan-out da view "por item".
  var sqlA =
    scopedCte +
    "SELECT grupo, item, COUNT(DISTINCT CONCAT(bookingId, '|', item)) AS n " +
    'FROM scoped GROUP BY grupo, item ORDER BY grupo, n DESC';
  var rowsA = runQuery_(sqlA, baseParams);

  // Query B — nuvem de palavras, agregada e anonimizada 100% em SQL (o comentário
  // bruto nunca sai do BigQuery). DISTINCT bookingId+grupo+comentario antes de
  // tokenizar: a view repete o mesmo comentário em cada item da mesma reserva,
  // sem isso o mesmo texto seria contado 2x quando há 2 itens no mesmo grupo.
  var sqlB =
    scopedCte +
    ', comments AS (\n' +
    '  SELECT DISTINCT bookingId, grupo, comentario FROM scoped\n' +
    "  WHERE comentario IS NOT NULL AND TRIM(comentario) != ''\n" +
    '),\n' +
    'tokens AS (\n' +
    '  SELECT grupo, word\n' +
    '  FROM comments,\n' +
    // REGEXP_EXTRACT_ALL extrai sequências de [a-z0-9] diretamente — evita o bug de
    // SPLIT(texto, ' ') não quebrar em quebra de linha real (comentário multi-linha
    // gerava tokens tipo "\n\no" grudando a última palavra de uma linha com a próxima).
    '  UNNEST(REGEXP_EXTRACT_ALL(\n' +
    "    REGEXP_REPLACE(NORMALIZE(LOWER(comentario), NFD), r'\\p{Mn}', ''),\n" +
    "    r'[a-z0-9]+'\n" +
    '  )) AS word\n' +
    ')\n' +
    'SELECT grupo, word, COUNT(*) AS n\n' +
    'FROM tokens\n' +
    'WHERE LENGTH(word) >= 3\n' +
    '  AND word NOT IN (' + sqlStringList_(DAMAGE_STOPWORDS_PT) + ')\n' +
    "  AND NOT REGEXP_CONTAINS(word, r'^[0-9]+$')\n" +
    "  AND NOT REGEXP_CONTAINS(word, r'^[a-z]{3}[0-9]{4}$')\n" +
    "  AND NOT REGEXP_CONTAINS(word, r'^[a-z]{3}[0-9][a-z][0-9]{2}$')\n" +
    'GROUP BY grupo, word\n' +
    'HAVING n >= 3\n' +
    'ORDER BY grupo, n DESC';
  var rowsB = runQuery_(sqlB, baseParams);

  return buildClaimDetailResponse_(component, startDate, endDate, rowsA, rowsB);
}

/** Junta rowsA (grupo,item,n) e rowsB (grupo,word,n) em groups[]. */
function buildClaimDetailResponse_(component, startDate, endDate, rowsA, rowsB) {
  var groupsMap = {};
  var order = [];
  rowsA.forEach(function (r) {
    if (!groupsMap[r.grupo]) {
      groupsMap[r.grupo] = { group: r.grupo, count: 0, items: [], words: [] };
      order.push(r.grupo);
    }
    var g = groupsMap[r.grupo];
    g.items.push({ label: r.item, count: Number(r.n) });
    g.count += Number(r.n);
  });
  rowsB.forEach(function (r) {
    if (!groupsMap[r.grupo]) {
      groupsMap[r.grupo] = { group: r.grupo, count: 0, items: [], words: [] };
      order.push(r.grupo);
    }
    groupsMap[r.grupo].words.push({ word: r.word, count: Number(r.n) });
  });
  var groups = order
    .map(function (k) { return groupsMap[k]; })
    .sort(function (a, b) { return b.count - a.count; });
  var totalCount = groups.reduce(function (s, g) { return s + g.count; }, 0);
  return { component: component, start_date: startDate, end_date: endDate, total_count: totalCount, groups: groups };
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
  Logger.log('Claim detail damage: %s', JSON.stringify(getClaimDetail(range.start, range.end, null, 'damage')));
  Logger.log('Claim detail wash (esperado: detail de "não implementado"): %s', JSON.stringify(getClaimDetail(range.start, range.end, null, 'wash')));
}
