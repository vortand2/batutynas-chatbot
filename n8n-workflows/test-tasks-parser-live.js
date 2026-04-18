/**
 * Run the refined Tasks→Calendar parser against the 222 LIVE tasks
 * fetched via the n8n Batutynas Tasks Dump workflow (aLbZOKSWP5phuOq7).
 *
 * Output: classification stats, 20 "deep-dive" samples (indices 20-39 in
 * the fetched list — the "next 20" beyond the original owner clarifications),
 * and a gap report flagging patterns the parser may mishandle.
 *
 * Usage: node n8n-workflows/test-tasks-parser-live.js
 * Effect: Local read-only. NO calendar writes.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const wfPath = path.join(__dirname, 'tasks-sync-workflow.json');
const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
const parseNode = wf.nodes.find(n => n.name === 'Parse Tasks');
if (!parseNode) { console.error('Parse Tasks node not found'); process.exit(1); }

const tasks = JSON.parse(fs.readFileSync('/tmp/batutynas-tasks.json', 'utf8'));

function runParser(taskList) {
  const sandbox = {
    $input: { first: () => ({ json: { items: taskList } }) },
    $json: null,
    console: console,
    Date: Date, Math: Math, JSON: JSON, Set: Set,
    Object: Object, Array: Array, parseInt: parseInt, parseFloat: parseFloat,
    result: null,
  };
  const wrappedCode = `result = (function(){ ${parseNode.parameters.jsCode} })();`;
  vm.createContext(sandbox);
  vm.runInContext(wrappedCode, sandbox);
  return sandbox.result[0].json;
}

console.log('=== RUNNING REFINED PARSER ON ALL ' + tasks.length + ' LIVE TASKS ===\n');
const parsed = runParser(tasks);
console.log('STATS:');
console.log('  Total tasks      :', parsed.stats.total);
console.log('  ORDER            :', parsed.stats.orders);
console.log('  TODO             :', parsed.stats.todos);
console.log('  INTERNAL         :', parsed.stats.internals);
console.log('  Events after merge:', parsed.stats.merged);

console.log('\n\n=== CLASSIFICATION BREAKDOWN (sample 20 from each bucket) ===');

// Need to re-run per-task to get individual classifications
// The parser returns bookings (orders merged) + skipped.todos/internals
console.log('\n--- INTERNAL (skipped, may hide real orders — INSPECT) ---');
parsed.skipped.internals.slice(0, 20).forEach((t, i) => {
  console.log('  ' + (i+1).toString().padStart(2) + '. ' + t.title);
});
console.log('  ... (' + parsed.skipped.internals.length + ' total INTERNAL)');

console.log('\n--- TODO (correctly skipped) ---');
parsed.skipped.todos.slice(0, 20).forEach((t, i) => {
  console.log('  ' + (i+1).toString().padStart(2) + '. ' + t.title);
});
console.log('  ... (' + parsed.skipped.todos.length + ' total TODO)');

console.log('\n\n=== NEW 20 DEEP-DIVE (tasks at list positions 21-40) ===\n');
const newBatch = tasks.slice(20, 40);
const parsedNew = runParser(newBatch);
console.log('Batch stats:', parsedNew.stats);
console.log('\nNew-batch classifications:');
for (let i = 0; i < newBatch.length; i++) {
  const t = newBatch[i];
  const wasSkippedInternal = parsedNew.skipped.internals.find(s => s.taskId === t.id);
  const wasSkippedTodo = parsedNew.skipped.todos.find(s => s.taskId === t.id);
  const booking = parsedNew.bookings.find(b => (b.taskIds || []).includes(t.id));
  let status = 'UNKNOWN';
  let detail = '';
  if (booking) {
    status = 'ORDER';
    detail = booking.summary + ' | ' + (booking.address || '-') + ' | ' + (booking.startDate || 'no-date') + ' | tags: ' + (booking.tags.join(',') || '-');
    if (booking.priceCheck && booking.priceCheck.verified && !booking.priceCheck.match) {
      detail += ' [⚠ VERIFY ' + booking.priceCheck.stated + '€ vs ' + booking.priceCheck.expected + '€]';
    }
    if (booking.durationDays > 1) detail += ' [MULTI-DAY ' + booking.durationDays + 'd]';
    if (booking.taskIds && booking.taskIds.length > 1) detail += ' [MERGED ' + booking.taskIds.length + ' tasks]';
  } else if (wasSkippedTodo) {
    status = 'TODO';
  } else if (wasSkippedInternal) {
    status = 'INTERNAL';
    detail = '(not synced)';
  }
  const title = (t.title || '[no title]').substring(0, 60);
  const due = t.due ? t.due.substring(0,10) : 'no-date';
  console.log('  ' + (i+21).toString().padStart(2) + '. [' + status.padEnd(8) + '] ' + title.padEnd(62) + ' | due: ' + due);
  if (detail) console.log('       → ' + detail);
}

console.log('\n\n=== GAP ANALYSIS ===');
// Look for tasks that mention equipment-like words but got classified as INTERNAL
const eqKeywords = ['mega','candy','giga','rocket','waikiki','ufonau','pilis','chameleon','monstrai','stalai','kedes','kėdes','paviljonas','klubas','dart','kamuoli','rodeo','bulius','kempini','sumo','putos','vata','astuonkojis','vienaragi','fantaziju','jumanji'];
const suspicious = parsed.skipped.internals.filter(t => {
  const n = (t.title || '').toLowerCase();
  return eqKeywords.some(kw => n.includes(kw));
});
console.log('\nINTERNAL tasks that contain equipment keywords (may be false negatives):');
suspicious.slice(0, 20).forEach((t, i) => {
  console.log('  ' + (i+1) + '. ' + t.title);
});
if (suspicious.length === 0) console.log('  (none — classifier looks clean)');

// Look for ORDER bookings with no address or no price (weak signal)
const weakOrders = parsed.bookings.filter(b => !b.address || !b.price);
console.log('\nORDER bookings missing address OR price (' + weakOrders.length + '):');
weakOrders.slice(0, 20).forEach((b, i) => {
  console.log('  ' + (i+1) + '. ' + b.taskTitle.substring(0, 60) + ' [addr: ' + (b.address ? 'yes' : 'NO') + ', price: ' + (b.price ? b.price+'€' : 'NO') + ']');
});

// Multi-day merges actually found
const multiDay = parsed.bookings.filter(b => b.durationDays > 1);
console.log('\nMulti-day merged events (' + multiDay.length + '):');
multiDay.forEach((b, i) => {
  console.log('  ' + (i+1) + '. ' + b.summary + ' | ' + b.startDate + ' | ' + b.durationDays + 'd | ' + (b.taskIds || []).length + ' tasks');
});

// Price mismatches
const mismatches = parsed.bookings.filter(b => b.priceCheck && b.priceCheck.verified && !b.priceCheck.match);
console.log('\nPrice VERIFY flags (' + mismatches.length + '):');
mismatches.forEach((b, i) => {
  console.log('  ' + (i+1) + '. ' + b.taskTitle + ' — stated ' + b.priceCheck.stated + '€ vs expected ' + b.priceCheck.expected + '€ (' + b.priceCheck.breakdown + ')');
});

// B2B tags
const b2b = parsed.bookings.filter(b => b.tags.includes('Bendruomenės namai'));
console.log('\nBendruomenės namai events (' + b2b.length + '):');
b2b.forEach((b, i) => {
  console.log('  ' + (i+1) + '. ' + b.summary + ' | ' + b.startDate + ' | ' + b.address);
});

console.log('\n=== END ===');
