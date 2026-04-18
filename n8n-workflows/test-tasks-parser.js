/**
 * Local test harness for the Tasks -> Calendar parser.
 * Extracts the Parse Tasks code from the generated workflow JSON
 * and runs it in a sandboxed vm context against a representative sample.
 *
 * Usage:  node n8n-workflows/test-tasks-parser.js
 * Effect: Prints classification + merged booking output. NO calendar writes.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const wfPath = path.join(__dirname, 'tasks-sync-workflow.json');
const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
const parseNode = wf.nodes.find(n => n.name === 'Parse Tasks');
if (!parseNode) { console.error('Parse Tasks node not found'); process.exit(1); }

// Representative sample from the 20 live tasks analyzed with owner clarifications.
const sampleTasks = [
  { id: 'task-01', title: 'Candy Pop uz 100',
    notes: 'Vytauto g. 12, Taurage\nJonas\n+37060012345\njonas@example.com',
    due: '2026-04-20T00:00:00.000Z', status: 'needsAction' },
  { id: 'task-02', title: 'Mega Rocket + Vata uz 250',
    notes: 'Laisves al. 8, Taurage\nBirutes gimtadienis\n861234567',
    due: '2026-04-22T00:00:00.000Z', status: 'needsAction' },
  { id: 'task-03', title: '20 kedziu ir 2 stalai uz 70 Eur',
    notes: 'Bendruomenes namai, Taurage\nAgne\n865678901',
    due: '2026-04-25T00:00:00.000Z', status: 'needsAction' },
  { id: 'task-04', title: 'Giga ruozas uz 200',
    notes: 'Gluosniu g. 5, Taurage\nMarius\n860123456',
    due: '2026-04-28T00:00:00.000Z', status: 'needsAction' },
  { id: 'task-05', title: 'Giga ruozas 2 diena',
    notes: 'Gluosniu g. 5, Taurage\nMarius',
    due: '2026-04-29T00:00:00.000Z', status: 'needsAction' },
  { id: 'task-06', title: 'Chameleonas uz 120',
    notes: 'Saules g. 3, Taurage\nRasa\n0860987654',
    due: '2026-04-30T00:00:00.000Z', status: 'needsAction' },
  { id: 'task-07', title: 'Kempiniukas uz 80',
    notes: 'Dariaus ir Gireno g. 10\nLina',
    due: '2026-05-01T00:00:00.000Z', status: 'needsAction' },
  { id: 'task-08', title: 'Klubas + JBL + popcorn uz 150',
    notes: 'Pergales g. 4, Taurage\nGerda\n860555333',
    due: '2026-05-02T00:00:00.000Z', status: 'needsAction' },
  { id: 'task-09', title: 'palaistyti geles', notes: '', due: null, status: 'needsAction' },
  { id: 'task-10', title: 'nurasyti 30 eur Candy Pop', notes: '', due: null, status: 'needsAction' },
  { id: 'task-11', title: 'Mega trasa uz 180',
    notes: 'Zemaiciu g. 15, Taurage\nLukas\n860888999',
    due: '2026-05-03T00:00:00.000Z', status: 'needsAction' },
  { id: 'task-12', title: 'Candy Pop + Pilis uz 150',
    notes: 'Ramybes g. 2, Taurage\nEgle\n860777666\neglee@example.lt',
    due: '2026-05-05T00:00:00.000Z', status: 'needsAction' },
  { id: 'task-13', title: 'Mega Waikiki uz 230',
    notes: 'Seimynos g. 9\nDovile\n0860111222',
    due: '2026-05-07T00:00:00.000Z', status: 'needsAction' },
  { id: 'task-14', title: 'Mega Ufonautai uz 230 per nakti',
    notes: 'Berzu g. 1, Taurage\nPovilas',
    due: '2026-05-10T00:00:00.000Z', status: 'needsAction' },
  { id: 'task-15', title: 'Sumo kostiumai uz 50',
    notes: 'Vaidoto g. 7\nTomas',
    due: '2026-05-11T00:00:00.000Z', status: 'needsAction' },
];

// Sandbox the parser code using vm
const jsCode = parseNode.parameters.jsCode;
const sandbox = {
  $input: {
    first: () => ({ json: { items: sampleTasks } }),
    all: () => sampleTasks.map(t => ({ json: t })),
  },
  $json: null,
  console: console,
  Date: Date,
  Math: Math,
  JSON: JSON,
  Set: Set,
  Object: Object,
  Array: Array,
  parseInt: parseInt,
  parseFloat: parseFloat,
  result: null,
};

// Wrap so the `return` at the end gets captured
const wrappedCode = `result = (function(){ ${jsCode} })();`;
vm.createContext(sandbox);
vm.runInContext(wrappedCode, sandbox);
const output = sandbox.result;
const parsed = output[0].json;

console.log('\n========== PARSE TASKS OUTPUT ==========\n');
console.log('STATS:', JSON.stringify(parsed.stats, null, 2));

console.log('\n---------- SKIPPED (non-ORDER) ----------');
console.log('TODOs (' + parsed.skipped.todos.length + '):');
parsed.skipped.todos.forEach(t => console.log('  -', t.taskId, '|', t.title));
console.log('INTERNAL (' + parsed.skipped.internals.length + '):');
parsed.skipped.internals.forEach(t => console.log('  -', t.taskId, '|', t.title));

console.log('\n---------- BOOKINGS (ORDER, merged) ----------');
for (const b of parsed.bookings) {
  console.log('\n---');
  console.log('Task IDs merged:', b.taskIds);
  console.log('Summary        :', b.summary);
  console.log('Equipment      :', b.equipmentList);
  console.log('Addons         :', b.addons);
  console.log('Price          :', b.price + '€');
  if (b.priceCheck && b.priceCheck.verified) {
    const status = b.priceCheck.match ? 'OK' : 'MISMATCH';
    console.log('Price check    : [' + status + '] stated ' + b.priceCheck.stated +
      '€ vs expected ' + b.priceCheck.expected + '€ (' + b.priceCheck.breakdown + ')');
  }
  console.log('Date           :', b.startDate, '| duration:', b.durationDays + 'd');
  console.log('Address        :', b.address);
  console.log('Customer       :', b.customer_name);
  console.log('Phone          :', b.phone, '| Email:', b.email || '-');
  console.log('Tags           :', b.tags);
}

console.log('\n========================================\n');
