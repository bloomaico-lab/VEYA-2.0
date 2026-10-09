const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { openDb } = require('../db');
const community = require('../community');

process.env.ADMIN_TOKEN = 'test-admin-token';

function startServer(db, options) {
  return new Promise((resolve) => {
    const server = createApp(db, options).listen(0, () => resolve(server));
  });
}

// Minimal cookie-keeping client so each "browser" has its own session.
function clientFor(base) {
  return () => {
    let cookie = '';
    return async (path, { method = 'GET', body, headers = {} } = {}) => {
      const res = await fetch(base + path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.getSetCookie().find((c) => c.startsWith('veya_sid='));
      if (set) cookie = set.split(';')[0];
      return { status: res.status, body: await res.json().catch(() => null) };
    };
  };
}

test('vote percentages always add up to 100', () => {
  const { POLL, tally } = community;
  const three = tally(POLL, [{ option: 'beanie', n: 1 }, { option: 'cap', n: 1 }, { option: 'socks', n: 1 }]);
  assert.equal(three.total, 3);
  assert.deepEqual(three.options.map((o) => o.percent), [34, 33, 33, 0]);
  const two = tally(POLL, [{ option: 'cap', n: 2 }, { option: 'tote', n: 1 }, { option: 'retired-option', n: 5 }]);
  assert.equal(two.total, 3, 'votes for options no longer on the ballot are left out');
  assert.deepEqual(two.options.map((o) => [o.id, o.votes, o.percent]), [['beanie', 0, 0], ['cap', 2, 67], ['socks', 0, 0], ['tote', 1, 33]]);
  const none = tally(POLL, []);
  assert.equal(none.total, 0);
  assert.ok(none.options.every((o) => o.percent === 0));
});

describe('the VEYA Collective', () => {
  let server;
  let db;
  let client;
  before(async () => {
    db = openDb(':memory:');
    server = await startServer(db, { stripe: null });
    client = clientFor(`http://127.0.0.1:${server.address().port}`);
  });
  after(() => server.close());

  test('joining gives you a member number that stays yours', async () => {
    const api = client();
    let r = await api('/api/collective');
    assert.equal(r.body.member, null);
    assert.equal(r.body.foundingOpen, true);
    assert.equal(r.body.foundingMembers, 1000);
    assert.equal(r.body.poll.question, 'What should we make next?');
    assert.equal(r.body.poll.options.length, 4);
    assert.equal(r.body.poll.results, null, 'no results before voting');

    r = await api('/api/subscribe', { method: 'POST', body: { email: 'First@Example.com' } });
    assert.equal(r.status, 201);
    assert.equal(r.body.member.number, '0001');
    assert.equal(r.body.member.founding, true);
    assert.match(r.body.message, /member No\. 0001/);
    assert.equal((await api('/api/collective')).body.member.number, '0001', 'this browser remembers its member');

    const second = client();
    assert.equal((await second('/api/subscribe', { method: 'POST', body: { email: 'second@example.com' } })).body.member.number, '0002');

    // The same email from another browser is the same member.
    const elsewhere = client();
    r = await elsewhere('/api/subscribe', { method: 'POST', body: { email: 'first@example.com' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.alreadySubscribed, true);
    assert.equal(r.body.member.number, '0001');

    // Leaving takes the membership away; coming back gives the same number again.
    const { unsubscribe_token: token } = db.prepare("SELECT unsubscribe_token FROM subscribers WHERE email = 'first@example.com'").get();
    await fetch(`http://127.0.0.1:${server.address().port}/unsubscribe?token=${token}`, { method: 'POST' });
    assert.equal((await api('/api/collective')).body.member, null);
    r = await api('/api/subscribe', { method: 'POST', body: { email: 'first@example.com' } });
    assert.equal(r.status, 201);
    assert.equal(r.body.member.number, '0001');
  });

  test('members vote once and see the results after voting', async () => {
    const api = client();
    assert.equal((await api('/api/vote', { method: 'POST', body: { option: 'cap' } })).status, 400, 'non-members need an email');
    assert.equal((await api('/api/vote', { method: 'POST', body: { option: 'jetpack', email: 'v1@example.com' } })).status, 400);
    assert.equal((await api('/api/vote', { method: 'POST', body: { option: 'cap', email: 'not-an-email' } })).status, 400);

    let r = await api('/api/vote', { method: 'POST', body: { option: 'cap', email: 'v1@example.com' } });
    assert.equal(r.status, 201);
    assert.equal(r.body.counted, true);
    assert.equal(r.body.member.founding, true, 'voting joins the Collective');
    assert.equal(r.body.poll.yourVote, 'cap');
    const capBefore = r.body.poll.results.options.find((o) => o.id === 'cap').votes;
    assert.ok(capBefore >= 1);

    // Voting again from the same browser changes nothing.
    r = await api('/api/vote', { method: 'POST', body: { option: 'tote' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.counted, false);
    assert.equal(r.body.poll.yourVote, 'cap');
    assert.equal((await api('/api/collective')).body.poll.yourVote, 'cap');
    assert.ok((await api('/api/collective')).body.poll.results, 'results stay visible to a browser that voted');

    // The same email from another browser can't vote again, or see what that member picked.
    const other = client();
    r = await other('/api/vote', { method: 'POST', body: { option: 'beanie', email: 'v1@example.com' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.counted, false);
    assert.equal(r.body.poll.yourVote, null);
    assert.equal(r.body.poll.results.options.find((o) => o.id === 'beanie').votes, 0);

    // A member who joined through the sign-up form votes without typing their email again.
    const member = client();
    await member('/api/subscribe', { method: 'POST', body: { email: 'v2@example.com' } });
    r = await member('/api/vote', { method: 'POST', body: { option: 'beanie' } });
    assert.equal(r.status, 201);
    const results = r.body.poll.results;
    assert.equal(results.total, 2);
    assert.deepEqual(results.options.map((o) => o.percent), [50, 50, 0, 0]);
    assert.equal((await client()('/api/collective')).body.poll.results, null, 'a new browser sees the ballot, not the results');

    const admin = (await api('/api/admin/summary', { headers: { 'x-admin-token': 'test-admin-token' } })).body.collective;
    assert.ok(admin.members >= 4);
    assert.equal(admin.foundingMembers, admin.members);
    assert.equal(admin.poll.results.total, 2);
    assert.equal(admin.poll.question, 'What should we make next?');
  });

  test('logging in keeps the vote with the browser', async () => {
    const api = client();
    await api('/api/vote', { method: 'POST', body: { option: 'socks', email: 'login@example.com' } });
    await api('/api/auth/register', { method: 'POST', body: { name: 'Lo', email: 'login@example.com', password: 'supersecret' } });
    assert.equal((await api('/api/collective')).body.poll.yourVote, 'socks');
  });

  test('founding membership closes after the first 1,000 members', async () => {
    db.prepare("INSERT INTO subscribers (id, email, unsubscribe_token) VALUES (1000, 'thousandth@example.com', 'tok-1000')").run();
    const api = client();
    assert.equal((await api('/api/collective')).body.foundingOpen, false);
    const r = await api('/api/subscribe', { method: 'POST', body: { email: 'later@example.com' } });
    assert.equal(r.body.member.number, '1001');
    assert.equal(r.body.member.founding, false);
  });
});

test('new members get one welcome email; spin winners get it with their code', async () => {
  const sent = [];
  const mailer = { sendAll: async (messages, opts) => { sent.push({ messages, opts }); return messages.length; } };
  const saved = { from: process.env.EMAIL_FROM, address: process.env.MAILING_ADDRESS };
  process.env.EMAIL_FROM = 'VEYA <hello@veya.example>';
  process.env.MAILING_ADDRESS = '1 Example St, Miami FL';
  const db = openDb(':memory:');
  const server = await startServer(db, { stripe: null, mailer });
  const port = server.address().port;
  try {
    const client = clientFor(`http://127.0.0.1:${port}`);
    const api = client();
    let r = await api('/api/subscribe', { method: 'POST', body: { email: 'hello@example.com' } });
    assert.equal(r.body.emailed, true);
    assert.equal(sent.length, 1);
    const [welcome] = sent[0].messages;
    assert.equal(welcome.to, 'hello@example.com');
    assert.equal(welcome.subject, 'Welcome to the VEYA Collective');
    assert.match(welcome.text, /member number is No\. 0001/);
    assert.match(welcome.text, /Founding Member/);
    assert.match(welcome.text, /\/#vote/);
    assert.match(welcome.unsubscribeUrl, /\/unsubscribe\?token=[0-9a-f]{48}$/);
    assert.equal(sent[0].opts.idempotencyPrefix, 'welcome-0001');

    // Already a member, or leaving and coming back: no second welcome.
    await api('/api/subscribe', { method: 'POST', body: { email: 'hello@example.com' } });
    const { unsubscribe_token: token } = db.prepare("SELECT unsubscribe_token FROM subscribers WHERE email = 'hello@example.com'").get();
    await fetch(`http://127.0.0.1:${port}/unsubscribe?token=${token}`, { method: 'POST' });
    r = await api('/api/subscribe', { method: 'POST', body: { email: 'hello@example.com' } });
    assert.equal(r.body.emailed, false);
    assert.equal(sent.length, 1);

    // Voting as a new member welcomes them too.
    r = await client()('/api/vote', { method: 'POST', body: { option: 'tote', email: 'voter@example.com' } });
    assert.equal(r.body.emailed, true);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].messages[0].to, 'voter@example.com');

    // Spin winners join through the wheel: one email with the code and their member number.
    const spinner = client();
    await spinner('/api/spin', { method: 'POST' });
    const claim = await spinner('/api/spin/claim', { method: 'POST', body: { email: 'spinner@example.com' } });
    assert.equal(claim.body.member.number, '0003');
    assert.equal(sent.length, 3);
    const [codeEmail] = sent[2].messages;
    assert.equal(codeEmail.subject, 'Your VEYA code: 25% off your order');
    assert.ok(codeEmail.text.includes(claim.body.code));
    assert.match(codeEmail.text, /member No\. 0003 of the VEYA Collective, one of our Founding Members/);
  } finally {
    server.close();
    if (saved.from === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = saved.from;
    if (saved.address === undefined) delete process.env.MAILING_ADDRESS; else process.env.MAILING_ADDRESS = saved.address;
  }
});
