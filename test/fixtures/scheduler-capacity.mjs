import { SQLiteStore, Scheduler } from '../../src/index.ts';
const store = new SQLiteStore(process.argv[2]);
const blocked = process.argv[3] === 'hold';
let calls = 0;
const scheduler = new Scheduler(store, async task => {
  calls++;
  if (blocked) {
    process.send?.({ event: 'started', id: task.id });
    await new Promise(resolve => process.once('message', resolve));
  }
}, { globalConcurrency: 1 });
try {
  await scheduler.tick(0);
  process.send?.({ event: 'done', calls });
} finally { await store.close(); process.disconnect(); }
