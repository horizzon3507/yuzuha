export function featureTests(paths: readonly string[]): string {
  const tests: string[] = [];
  if (paths.includes('moderation/kick')) tests.push(`
for (const input of ['!ban <@2> spam', '!kick <@2> spam', '!timeout <@2> 10m spam', '!unban <@2> revisão']) {
  test(input + ': autor, bot, hierarquia e falha parcial', async t => {
    const f = fixture();
    t.after(() => f.destroy());
    assert.equal(await f.send(input, { guildID: undefined }), 'guarded');
    f.transport.setMember('100', { id: '1', owner: false, permissions: 0n, rank: 100 });
    assert.equal(await f.send(input), 'guarded');
    f.transport.setMember('100', { id: '1', owner: false, permissions: PermissionFlags.Administrator, rank: 100 });
    f.transport.setMember('100', { id: '999', owner: false, permissions: 0n, rank: 90 });
    assert.equal(await f.send(input), 'guarded');
    f.transport.setMember('100', { id: '999', owner: false, permissions: PermissionFlags.Administrator, rank: 90 });
    if (!input.startsWith('!unban')) {
      f.transport.setMember('100', { id: '2', owner: false, permissions: 0n, rank: 101 });
      assert.equal(await f.send(input), 'guarded');
      f.transport.setMember('100', { id: '2', owner: false, permissions: 0n, rank: 95 });
      f.transport.setMember('100', { id: '1', owner: true, permissions: PermissionFlags.Administrator, rank: 100 });
      assert.equal(await f.send(input), 'guarded');
      f.transport.setMember('100', { id: '2', owner: false, permissions: 0n, rank: 1 });
    }
    assert.equal(f.transport.actions.length, 0);
    assert.equal(await f.send(input), 'success');
    assert.equal(f.transport.actions.length, 1);
    assert.equal(await f.send('!caso 1'), 'success');
    assert.equal(f.messages.at(-1)?.payload.embeds?.[0]?.title, 'Caso #1');
    f.transport.setMember('101', { id: '1', owner: false, permissions: 0n, rank: 1 });
    assert.equal(await f.send('!caso 1', { guildID: '101' }), 'guarded');
    assert.deepEqual(f.errors, []);

    class FailingStore extends MemoryStore {
      async commit() { throw new Error('disk full'); }
    }
    const partial = fixture({ store: new FailingStore() });
    t.after(() => partial.destroy());
    assert.equal(await partial.send(input), 'error');
    assert.equal(partial.transport.actions.length, 1);
    assert.ok(partial.errors[0] instanceof PartialModerationError);
  });
}

test('casos não vazam entre servidores e limites de timeout são verificados', async t => {
  const f = fixture(); t.after(() => f.destroy());
  assert.equal(await f.send('!kick <@2>'), 'guarded');
  assert.equal(await f.send('!timeout <@2> 29d spam'), 'guarded');
  assert.equal(await f.send('!timeout <@2> 0s spam'), 'guarded');
  assert.equal(await f.send('!ban <@2> spam'), 'success');
  f.transport.setMember('101', { id: '1', owner: true, permissions: PermissionFlags.Administrator, rank: 100 });
  assert.equal(await f.send('!caso 1', { guildID: '101' }), 'success');
  assert.equal(f.messages.at(-1)?.payload.content, 'Caso não encontrado neste servidor.');
});
`);
  if (paths.includes('community/poll')) tests.push(`
test('comunidade mantém regras, sugestões limitadas e votação sem duplicatas', async t => {
  const f = fixture(); t.after(() => f.destroy());
  assert.equal(await f.send('!regras definir Respeite todos.'), 'success');
  assert.equal(await f.send('!regras ver'), 'success');
  assert.equal(f.messages.at(-1)?.payload.embeds?.[0]?.description, 'Respeite todos.');
  assert.equal(await f.send('!regras definir Outra', { authorID: '2' }), 'guarded');
  assert.equal(await f.send('!enquete criar Jogar hoje?'), 'success');
  assert.equal(await f.send('!enquete criar Substituir?'), 'guarded');
  assert.equal(await f.send('!enquete criar Outra?', { authorID: '2', channelID: '201' }), 'guarded');
  assert.equal(await f.send('!enquete votar sim', { authorID: '2' }), 'success');
  assert.equal(await f.send('!enquete votar nao', { authorID: '2' }), 'success');
  assert.equal(await f.send('!enquete votar sim'), 'success');
  assert.equal(await f.send('!enquete resultado'), 'success');
  assert.deepEqual(f.messages.at(-1)?.payload.embeds?.[0]?.fields?.map(field => field.value), ['1', '1']);
  assert.equal(await f.send('!enquete resultado', { channelID: '201' }), 'guarded');
  assert.equal(await f.send('!enquete resultado', { guildID: undefined }), 'guarded');
  assert.equal(await f.send('!enquete fechar', { authorID: '2' }), 'guarded');
  assert.equal(await f.send('!enquete fechar'), 'success');
  assert.equal(await f.send('!enquete votar sim'), 'guarded');
  assert.equal(await f.send('!enquete criar Nova pergunta?'), 'success');
  for (let index = 0; index < 11; index++) {
    assert.equal(await f.send('!sugestao enviar Sugestão ' + index), 'success');
    f.clock.advance(31000);
  }
  assert.equal(await f.send('!sugestao enviar Última'), 'success');
  assert.equal(await f.send('!sugestao enviar Repetida'), 'guarded');
  assert.equal(await f.send('!sugestao listar'), 'success');
  const description = f.messages.at(-1)?.payload.embeds?.[0]?.description ?? '';
  assert.equal(description.split('\\n').length, 10);
  assert.ok(!description.includes('Sugestão 0'));
  assert.deepEqual(f.errors, []);
});
`);
  if (paths.includes('economy/pay')) tests.push(`
test('economia confirma prêmios e pagamentos uma vez e preserva limites', async t => {
  const f = fixture(); t.after(() => f.destroy());
  assert.deepEqual((await Promise.all([f.send('!diario'), f.send('!diario')])).sort(), ['guarded', 'success']);
  assert.equal(await f.send('!trabalhar'), 'success');
  const payments = await Promise.all([f.send('!pagar <@2> 75'), f.send('!pagar <@2> 75')]);
  assert.deepEqual(payments.sort(), ['guarded', 'success']);
  assert.equal(await f.send('!saldo'), 'success');
  assert.equal(f.messages.at(-1)?.payload.embeds?.[0]?.fields?.[1]?.value, '50');
  assert.equal(await f.send('!saldo <@2>'), 'success');
  assert.equal(f.messages.at(-1)?.payload.embeds?.[0]?.fields?.[1]?.value, '75');
  for (const input of ['!pagar <@1> 1', '!pagar <@999> 1', '!pagar <@2> 0', '!pagar <@2> 1.5']) {
    assert.equal(await f.send(input), 'guarded');
  }
  assert.equal(await f.send('!saldo', { guildID: '101' }), 'success');
  assert.equal(f.messages.at(-1)?.payload.embeds?.[0]?.fields?.[1]?.value, '0');
  assert.equal(await f.send('!diario', { guildID: undefined }), 'guarded');
  await f.destroy();
  const restarted = fixture({ store: f.store, now: f.clock.now() });
  t.after(() => restarted.destroy());
  assert.equal(await restarted.send('!diario'), 'guarded');
  restarted.clock.advance(86400001);
  assert.equal(await restarted.send('!diario'), 'success');
  await restarted.store.update(state => {
    state.variables[JSON.stringify(['guild', '100', 'saldo:2'])] = Number.MAX_SAFE_INTEGER;
  });
  assert.equal(await restarted.send('!pagar <@2> 1'), 'guarded');
  assert.equal(await restarted.send('!saldo'), 'success');
  assert.equal(restarted.messages.at(-1)?.payload.embeds?.[0]?.fields?.[1]?.value, '150');
  assert.deepEqual(restarted.errors, []);
});
`);
  if (paths.includes('fun/choose')) tests.push(`
test('diversão respeita limites e escolhe apenas opções fornecidas', async t => {
  const f = fixture(); t.after(() => f.destroy());
  assert.equal(await f.send('!dado 2'), 'success');
  assert.match(f.messages.at(-1)?.payload.content ?? '', /^Dado de 2 lados: [12]\\.$/);
  for (const input of ['!dado 1', '!dado 101', '!dado 2.5', '!escolher único', '!escolher a || b']) {
    assert.equal(await f.send(input), 'guarded');
  }
  assert.equal(await f.send('!escolher pizza | sushi'), 'success');
  assert.ok(['pizza', 'sushi'].includes(f.messages.at(-1)?.payload.embeds?.[0]?.description ?? ''));
  assert.equal(await f.send('!moeda'), 'success');
  assert.match(f.messages.at(-1)?.payload.content ?? '', /^(Cara|Coroa)!$/);
  assert.equal(await f.send('!8ball Vai chover?'), 'success');
  assert.equal(f.messages.at(-1)?.payload.embeds?.[0]?.title, 'Bola 8');
  assert.deepEqual(f.errors, []);
});
`);
  if (paths.includes('utilities/notes')) tests.push(`
test('utilidades isolam notas em DM e validam datas explícitas', async t => {
  const f = fixture(); t.after(() => f.destroy());
  assert.equal(await f.send('!notas adicionar Segredo'), 'guarded');
  const dm = { guildID: undefined };
  assert.equal(await f.send('!notas adicionar Comprar café', dm), 'success');
  assert.equal(await f.send('!notas listar', { ...dm, authorID: '2' }), 'success');
  assert.equal(f.messages.at(-1)?.payload.embeds?.[0]?.description, 'Nenhuma nota salva.');
  assert.equal(await f.send('!notas listar', dm), 'success');
  assert.equal(f.messages.at(-1)?.payload.embeds?.[0]?.description, '1. Comprar café');
  assert.equal(await f.send('!notas apagar 2', dm), 'guarded');
  assert.equal(await f.send('!notas apagar 1', dm), 'success');
  for (let index = 0; index < 10; index++) assert.equal(await f.send('!notas adicionar Nota ' + index, dm), 'success');
  assert.equal(await f.send('!notas adicionar Outra', dm), 'guarded');
  assert.equal(await f.send('!data 2026-01-20T18:30:00-03:00'), 'success');
  assert.equal(f.messages.at(-1)?.payload.embeds?.[0]?.fields?.[0]?.value, '2026-01-20T21:30:00.000Z');
  assert.equal(await f.send('!data 2026-01-20'), 'guarded');
  assert.equal(await f.send('!data 2026-02-30T00:00:00Z'), 'guarded');
  assert.deepEqual(f.errors, []);
});
`);
  return tests.join('\n');
}
