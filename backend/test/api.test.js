process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeFirestore, FakeAuth, FieldValue } = require('./fakeFirestore');

// Swap the real Firebase config for in-memory fakes before anything requires it.
const db = new FakeFirestore();
const auth = new FakeAuth();
const firebasePath = require.resolve('../config/firebase');
require.cache[firebasePath] = {
    id: firebasePath,
    filename: firebasePath,
    loaded: true,
    exports: { admin: { firestore: { FieldValue } }, db, auth },
};

const app = require('../app');

let server;
let baseUrl;

test.before(async () => {
    await new Promise((resolve) => {
        server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test.beforeEach(() => {
    db.reset();
    auth.reset();
});

const call = async (method, path, { as, body } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(as ? { Authorization: `Bearer token-${as}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
};

const register = async (name) => {
    const { status, body } = await call('POST', '/api/auth/register', {
        body: { email: `${name}@test.dev`, password: 'secret123', displayName: name },
    });
    assert.equal(status, 201);
    return body.uid;
};

// owner runs a family, member has been approved into it, outsider belongs to nobody.
const setup = async () => {
    const owner = await register('Owner');
    const member = await register('Member');
    const outsider = await register('Outsider');

    const created = await call('POST', '/api/family/create', { as: owner, body: { familyName: 'The Rao Family' } });
    assert.equal(created.status, 201);
    const { familyId, inviteCode } = created.body;

    const join = await call('POST', '/api/family/join', { as: member, body: { inviteCode } });
    assert.equal(join.status, 202);
    const approve = await call('POST', `/api/family/requests/${join.body.requestId}/approve`, { as: owner });
    assert.equal(approve.status, 200);

    return { owner, member, outsider, familyId, inviteCode };
};

const addTx = (as, familyId, extra = {}) => call('POST', '/api/transactions', {
    as,
    body: { familyId, amount: 100, type: 'expense', category: 'Groceries', date: '2026-10-05T10:00:00.000Z', ...extra },
});

test('requests without a valid token are rejected', async () => {
    assert.equal((await call('GET', '/api/me')).status, 401);
    assert.equal((await call('GET', '/api/me', { as: '' })).status, 401);
});

test('register validates input and creates a profile', async () => {
    const bad = await call('POST', '/api/auth/register', { body: { email: 'nope', password: '1', displayName: '' } });
    assert.equal(bad.status, 400);

    const uid = await register('Asha');
    const me = await call('GET', '/api/me', { as: uid });
    assert.equal(me.status, 200);
    assert.equal(me.body.displayName, 'Asha');
    assert.equal(me.body.family, null);
});

test('joining a family needs admin approval', async () => {
    const owner = await register('Owner');
    const joiner = await register('Joiner');
    const { body: created } = await call('POST', '/api/family/create', { as: owner, body: { familyName: 'Home' } });

    const wrongCode = await call('POST', '/api/family/join', { as: joiner, body: { inviteCode: 'ZZZZZZZZ' } });
    assert.equal(wrongCode.status, 404);

    // Codes are case-insensitive.
    const join = await call('POST', '/api/family/join', { as: joiner, body: { inviteCode: created.inviteCode.toLowerCase() } });
    assert.equal(join.status, 202);

    const again = await call('POST', '/api/family/join', { as: joiner, body: { inviteCode: created.inviteCode } });
    assert.equal(again.status, 409);

    const pending = await call('GET', '/api/me', { as: joiner });
    assert.equal(pending.body.family, null);
    assert.equal(pending.body.pendingRequest.familyName, 'Home');

    // Not a member yet, so no access.
    assert.equal((await call('GET', `/api/transactions/${created.familyId}`, { as: joiner })).status, 403);

    // Only the admin can see or decide on requests.
    assert.equal((await call('GET', `/api/family/${created.familyId}/requests`, { as: joiner })).status, 403);
    assert.equal((await call('POST', `/api/family/requests/${join.body.requestId}/approve`, { as: joiner })).status, 403);

    const list = await call('GET', `/api/family/${created.familyId}/requests`, { as: owner });
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].displayName, 'Joiner');

    const approved = await call('POST', `/api/family/requests/${join.body.requestId}/approve`, { as: owner });
    assert.equal(approved.status, 200);
    assert.equal((await call('POST', `/api/family/requests/${join.body.requestId}/approve`, { as: owner })).status, 409);

    const joined = await call('GET', '/api/me', { as: joiner });
    assert.equal(joined.body.family.id, created.familyId);
    assert.equal(joined.body.pendingRequest, null);
    assert.equal((await call('GET', `/api/transactions/${created.familyId}`, { as: joiner })).status, 200);
});

test('rejected requests do not grant access', async () => {
    const owner = await register('Owner');
    const joiner = await register('Joiner');
    const { body: created } = await call('POST', '/api/family/create', { as: owner, body: { familyName: 'Home' } });
    const join = await call('POST', '/api/family/join', { as: joiner, body: { inviteCode: created.inviteCode } });

    assert.equal((await call('POST', `/api/family/requests/${join.body.requestId}/reject`, { as: owner })).status, 200);
    assert.equal((await call('GET', `/api/family/${created.familyId}`, { as: joiner })).status, 403);

    // A rejected person can ask again.
    const retry = await call('POST', '/api/family/join', { as: joiner, body: { inviteCode: created.inviteCode } });
    assert.equal(retry.status, 202);
});

test('a user cannot create or join a second family', async () => {
    const { owner, outsider } = await setup();
    const second = await call('POST', '/api/family/create', { as: owner, body: { familyName: 'Another' } });
    assert.equal(second.status, 409);

    const other = await call('POST', '/api/family/create', { as: outsider, body: { familyName: 'Other' } });
    const join = await call('POST', '/api/family/join', { as: outsider, body: { inviteCode: other.body.inviteCode } });
    assert.equal(join.status, 400);
});

test('family details list members and hide nothing from members only', async () => {
    const { owner, member, outsider, familyId } = await setup();

    const details = await call('GET', `/api/family/${familyId}`, { as: member });
    assert.equal(details.status, 200);
    assert.equal(details.body.members.length, 2);
    assert.deepEqual(details.body.members.map((m) => m.role).sort(), ['admin', 'member']);

    assert.equal((await call('GET', `/api/family/${familyId}`, { as: outsider })).status, 403);
    assert.equal((await call('POST', `/api/family/${familyId}/invite`, { as: member })).status, 403);

    const regenerated = await call('POST', `/api/family/${familyId}/invite`, { as: owner });
    assert.equal(regenerated.status, 200);
    assert.match(regenerated.body.inviteCode, /^[0-9A-F]{8}$/);
});

test('outsiders cannot read or write another family\'s data', async () => {
    const { owner, outsider, familyId } = await setup();
    const tx = await addTx(owner, familyId);
    const goal = await call('POST', '/api/goals', { as: owner, body: { familyId, title: 'Trip', targetAmount: 5000 } });
    const loan = await call('POST', '/api/loans', { as: owner, body: { familyId, person: 'Ravi', amount: 300 } });

    const attempts = [
        call('GET', `/api/transactions/${familyId}`, { as: outsider }),
        call('GET', `/api/transactions/${familyId}/summary`, { as: outsider }),
        addTx(outsider, familyId),
        call('PUT', `/api/transactions/${tx.body.id}`, { as: outsider, body: { amount: 1 } }),
        call('DELETE', `/api/transactions/${tx.body.id}`, { as: outsider }),
        call('GET', `/api/goals/${familyId}`, { as: outsider }),
        call('POST', '/api/goals', { as: outsider, body: { familyId, title: 'Hack', targetAmount: 1 } }),
        call('PUT', '/api/goals/update', { as: outsider, body: { goalId: goal.body.id, amount: 999 } }),
        call('DELETE', `/api/goals/${goal.body.id}`, { as: outsider }),
        call('GET', `/api/loans/${familyId}`, { as: outsider }),
        call('PUT', `/api/loans/${loan.body.id}/repay`, { as: outsider }),
        call('GET', `/api/budgets/${familyId}`, { as: outsider }),
        call('PUT', '/api/budgets', { as: outsider, body: { familyId, category: 'Food', limit: 10 } }),
    ];
    const results = await Promise.all(attempts);
    results.forEach((r, i) => assert.equal(r.status, 403, `attempt ${i} should be forbidden, got ${r.status}`));
});

test('transactions: add, list, filter, edit, delete', async () => {
    const { owner, member, familyId } = await setup();

    const first = await addTx(owner, familyId, { amount: 12.345, description: 'Milk' });
    assert.equal(first.status, 201);
    await addTx(member, familyId, { type: 'income', category: 'Salary', amount: 1000, date: '2026-10-06T10:00:00.000Z' });
    await addTx(member, familyId, { category: 'Travel', amount: 50, date: '2026-10-07T10:00:00.000Z' });

    const bad = await call('POST', '/api/transactions', { as: owner, body: { familyId, amount: -5, type: 'expense', category: 'X' } });
    assert.equal(bad.status, 400);

    const all = await call('GET', `/api/transactions/${familyId}`, { as: owner });
    assert.equal(all.body.length, 3);
    assert.equal(all.body[0].category, 'Travel', 'newest first');
    assert.equal(typeof all.body[0].date, 'string');

    const incomeOnly = await call('GET', `/api/transactions/${familyId}?type=income`, { as: owner });
    assert.deepEqual(incomeOnly.body.map((t) => t.category), ['Salary']);

    const ranged = await call('GET', `/api/transactions/${familyId}?from=2026-10-06T00:00:00.000Z`, { as: owner });
    assert.equal(ranged.body.length, 2);

    const searched = await call('GET', `/api/transactions/${familyId}?search=milk`, { as: owner });
    assert.equal(searched.body.length, 1);
    assert.equal(searched.body[0].description, 'Milk');

    const page1 = await call('GET', `/api/transactions/${familyId}?limit=2`, { as: owner });
    const page2 = await call('GET', `/api/transactions/${familyId}?limit=2&startAfter=${page1.body[1].id}`, { as: owner });
    assert.equal(page1.body.length, 2);
    assert.equal(page2.body.length, 1);

    // The person who added it can edit; another non-admin member cannot.
    const memberTx = all.body[0];
    assert.equal((await call('PUT', `/api/transactions/${first.body.id}`, { as: member, body: { amount: 1 } })).status, 403);
    assert.equal((await call('PUT', `/api/transactions/${memberTx.id}`, { as: member, body: { amount: 55 } })).status, 200);

    // The admin can edit anyone's entry.
    assert.equal((await call('PUT', `/api/transactions/${memberTx.id}`, { as: owner, body: { category: 'Fuel' } })).status, 200);
    assert.equal((await call('PUT', `/api/transactions/${memberTx.id}`, { as: owner, body: {} })).status, 400);

    assert.equal((await call('DELETE', `/api/transactions/${first.body.id}`, { as: member })).status, 403);
    assert.equal((await call('DELETE', `/api/transactions/${first.body.id}`, { as: owner })).status, 200);
    assert.equal((await call('DELETE', `/api/transactions/${first.body.id}`, { as: owner })).status, 404);
});

test('transactions: duplicate SMS captures are rejected', async () => {
    const { owner, familyId } = await setup();
    const body = { source: 'sms', dedupeKey: 'HDFCBK-123' };

    assert.equal((await addTx(owner, familyId, body)).status, 201);
    assert.equal((await addTx(owner, familyId, body)).status, 409);
    assert.equal((await addTx(owner, familyId, { source: 'sms', dedupeKey: 'HDFCBK-124' })).status, 201);
});

test('transactions: batch import adds multiple transactions and skips existing dedupeKeys', async () => {
    const { owner, familyId } = await setup();
    await addTx(owner, familyId, { source: 'sms', dedupeKey: 'SMS-EXISTING-1', amount: 50 });

    const batchRes = await call('POST', '/api/transactions/batch', {
        as: owner,
        body: {
            familyId,
            items: [
                { amount: 150, type: 'expense', category: 'Food', description: 'Swiggy', dedupeKey: 'SMS-EXISTING-1' },
                { amount: 300, type: 'expense', category: 'Groceries', description: 'Blinkit', dedupeKey: 'SMS-NEW-2' },
                { amount: 5000, type: 'income', category: 'Salary', description: 'Client', dedupeKey: 'SMS-NEW-3' },
            ],
        },
    });

    assert.equal(batchRes.status, 201);
    assert.equal(batchRes.body.added, 2);
    assert.equal(batchRes.body.skipped, 1);
    assert.equal(batchRes.body.ids.length, 2);
});

test('transactions: batch-delete reverts imported batch and updates balance', async () => {
    const { owner, familyId } = await setup();
    const batchRes = await call('POST', '/api/transactions/batch', {
        as: owner,
        body: {
            familyId,
            items: [
                { amount: 200, type: 'expense', category: 'Food', description: 'Swiggy', dedupeKey: 'UNDO-1' },
                { amount: 1000, type: 'income', category: 'Salary', description: 'Bonus', dedupeKey: 'UNDO-2' },
            ],
        },
    });

    assert.equal(batchRes.status, 201);
    assert.equal(batchRes.body.ids.length, 2);

    const deleteRes = await call('POST', '/api/transactions/batch-delete', {
        as: owner,
        body: { familyId, ids: batchRes.body.ids },
    });

    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.deleted, 2);

    const listRes = await call('GET', `/api/transactions/${familyId}`, { as: owner });
    assert.equal(listRes.body.length, 0);
});

test('transactions: delete all SMS transactions removes all source=sms entries', async () => {
    const { owner, familyId } = await setup();
    await addTx(owner, familyId, { amount: 150, source: 'manual', description: 'Manual entry' });
    await addTx(owner, familyId, { amount: 250, source: 'sms', description: 'SMS entry 1' });
    await addTx(owner, familyId, { amount: 350, source: 'sms', description: 'SMS entry 2' });

    const deleteSmsRes = await call('DELETE', `/api/transactions/family/${familyId}/source/sms`, { as: owner });
    assert.equal(deleteSmsRes.status, 200);
    assert.equal(deleteSmsRes.body.deleted, 2);

    const listRes = await call('GET', `/api/transactions/${familyId}`, { as: owner });
    assert.equal(listRes.body.length, 1);
    assert.equal(listRes.body[0].description, 'Manual entry');
});

test('summary: salary with countForNextMonth is added to next month received', async () => {
    const { owner, familyId } = await setup();

    // Salary received on Oct 31st with countForNextMonth = true
    await addTx(owner, familyId, {
        amount: 50000,
        type: 'income',
        category: 'Salary',
        description: 'Monthly Salary',
        date: '2026-10-31T18:00:00.000Z',
        countForNextMonth: true,
    });

    // October summary should NOT include this salary
    const octRes = await call('GET', `/api/transactions/${familyId}/summary?month=2026-10`, { as: owner });
    assert.equal(octRes.status, 200);
    assert.equal(octRes.body.income, 0);

    // November summary SHOULD include this salary in received income!
    const novRes = await call('GET', `/api/transactions/${familyId}/summary?month=2026-11`, { as: owner });
    assert.equal(novRes.status, 200);
    assert.equal(novRes.body.income, 50000);

    // In transactions list: October list does NOT include it, but November list DOES include it!
    const octList = await call('GET', `/api/transactions/${familyId}?month=2026-10`, { as: owner });
    assert.equal(octList.status, 200);
    assert.equal(octList.body.length, 0);

    const novList = await call('GET', `/api/transactions/${familyId}?month=2026-11`, { as: owner });
    assert.equal(novList.status, 200);
    assert.equal(novList.body.length, 1);
    assert.equal(novList.body[0].amount, 50000);
    assert.equal(novList.body[0].countForNextMonth, true);

    // Edit transaction: toggle countForNextMonth to false
    const txId = novList.body[0].id;
    const editRes = await call('PUT', `/api/transactions/${txId}`, {
        as: owner,
        body: { countForNextMonth: false },
    });
    assert.equal(editRes.status, 200);

    // Now October summary SHOULD have the 50,000 income, and November should NOT
    const octResAfter = await call('GET', `/api/transactions/${familyId}/summary?month=2026-10`, { as: owner });
    assert.equal(octResAfter.body.income, 50000);
    const novResAfter = await call('GET', `/api/transactions/${familyId}/summary?month=2026-11`, { as: owner });
    assert.equal(novResAfter.body.income, 0);

    // In monthly lists: October list now has it, November list does not
    const octListAfter = await call('GET', `/api/transactions/${familyId}?month=2026-10`, { as: owner });
    assert.equal(octListAfter.body.length, 1);
    const novListAfter = await call('GET', `/api/transactions/${familyId}?month=2026-11`, { as: owner });
    assert.equal(novListAfter.body.length, 0);

    // Toggle it back to countForNextMonth: true
    await call('PUT', `/api/transactions/${txId}`, {
        as: owner,
        body: { countForNextMonth: true },
    });
    const novResRestored = await call('GET', `/api/transactions/${familyId}/summary?month=2026-11`, { as: owner });
    assert.equal(novResRestored.body.income, 50000);
});

test('batch transactions: batch import supports countForNextMonth', async () => {
    const { owner, familyId } = await setup();

    const batchRes = await call('POST', '/api/transactions/batch', {
        as: owner,
        body: {
            familyId,
            items: [
                {
                    amount: 350,
                    type: 'expense',
                    category: 'Food',
                    description: 'Swiggy',
                    date: '2026-10-25T12:00:00.000Z',
                },
                {
                    amount: 80000,
                    type: 'income',
                    category: 'Salary',
                    description: 'Tech Corp Salary',
                    date: '2026-10-31T15:00:00.000Z',
                    countForNextMonth: true,
                },
            ],
        },
    });
    assert.equal(batchRes.status, 201);
    assert.equal(batchRes.body.added, 2);

    // November summary must reflect the 80,000 received income
    const novSum = await call('GET', `/api/transactions/${familyId}/summary?month=2026-11`, { as: owner });
    assert.equal(novSum.body.income, 80000);

    // October summary should only reflect the expense, not the salary
    const octSum = await call('GET', `/api/transactions/${familyId}/summary?month=2026-10`, { as: owner });
    assert.equal(octSum.body.income, 0);
    assert.equal(octSum.body.expense, 350);

    // November transactions list must include the Salary
    const novList = await call('GET', `/api/transactions/${familyId}?month=2026-11`, { as: owner });
    assert.equal(novList.body.length, 1);
    assert.equal(novList.body[0].category, 'Salary');
    assert.equal(novList.body[0].amount, 80000);
    assert.equal(novList.body[0].countForNextMonth, true);
});

test('summary totals, category shares and month comparison', async () => {
    const { owner, member, familyId } = await setup();

    await addTx(owner, familyId, { amount: 100, category: 'Groceries', date: '2026-10-05T10:00:00.000Z' });
    await addTx(member, familyId, { amount: 50, category: 'Travel', date: '2026-10-10T10:00:00.000Z' });
    await addTx(owner, familyId, { amount: 1000, type: 'income', category: 'Salary', date: '2026-10-12T10:00:00.000Z' });
    await addTx(owner, familyId, { amount: 200, category: 'Groceries', date: '2026-09-20T10:00:00.000Z' });

    const { status, body } = await call('GET', `/api/transactions/${familyId}/summary?month=2026-10`, { as: member });
    assert.equal(status, 200);
    assert.equal(body.income, 1000);
    assert.equal(body.expense, 150);
    assert.equal(body.net, 850);
    assert.equal(body.balance, 650, 'balance spans every month');
    assert.equal(body.previousExpense, 200);
    assert.equal(body.expenseChangePercent, -25);
    assert.equal(body.transactionCount, 3);
    assert.deepEqual(body.byCategory.map((c) => [c.category, c.total, c.percent]), [['Groceries', 100, 66.7], ['Travel', 50, 33.3]]);
    assert.deepEqual(body.byMember.map((m) => [m.name, m.expense]), [['Owner', 100], ['Member', 50]]);
    assert.equal(body.byDay.length, 3);

    assert.equal((await call('GET', `/api/transactions/${familyId}/summary?month=2026-13`, { as: owner })).status, 400);
});

test('summary respects the caller timezone at month boundaries', async () => {
    const { owner, familyId } = await setup();
    // 01 Nov 02:00 in India (+05:30) is still 31 Oct in UTC.
    await addTx(owner, familyId, { amount: 80, date: '2026-10-31T20:30:00.000Z' });

    const utc = await call('GET', `/api/transactions/${familyId}/summary?month=2026-10`, { as: owner });
    const ist = await call('GET', `/api/transactions/${familyId}/summary?month=2026-10&tzOffset=330`, { as: owner });
    const istNov = await call('GET', `/api/transactions/${familyId}/summary?month=2026-11&tzOffset=330`, { as: owner });

    assert.equal(utc.body.expense, 80);
    assert.equal(ist.body.expense, 0);
    assert.equal(istNov.body.expense, 80);
});

test('summary can be limited to the caller\'s own transactions', async () => {
    const { owner, member, familyId } = await setup();

    await addTx(owner, familyId, { amount: 100, category: 'Groceries', date: '2026-10-05T10:00:00.000Z' });
    await addTx(member, familyId, { amount: 50, category: 'Travel', date: '2026-10-10T10:00:00.000Z' });
    await addTx(member, familyId, { amount: 500, type: 'income', category: 'Salary', date: '2026-10-11T10:00:00.000Z' });
    await addTx(member, familyId, { amount: 20, category: 'Travel', date: '2026-09-11T10:00:00.000Z' });

    const family = await call('GET', `/api/transactions/${familyId}/summary?month=2026-10`, { as: member });
    assert.equal(family.body.scope, 'family');
    assert.equal(family.body.expense, 150);

    const mine = await call('GET', `/api/transactions/${familyId}/summary?month=2026-10&scope=me`, { as: member });
    assert.equal(mine.body.scope, 'me');
    assert.equal(mine.body.expense, 50);
    assert.equal(mine.body.income, 500);
    assert.equal(mine.body.balance, 430, 'balance counts only my own entries');
    assert.equal(mine.body.previousExpense, 20);
    assert.deepEqual(mine.body.byCategory.map((c) => [c.category, c.percent]), [['Travel', 100]]);
    assert.deepEqual(mine.body.byMember.map((m) => m.name), ['Member']);

    const theirs = await call('GET', `/api/transactions/${familyId}/summary?month=2026-10&scope=me`, { as: owner });
    assert.equal(theirs.body.expense, 100);
    assert.equal(theirs.body.income, 0);
});

test('trend: day, week and month buckets, limited to me on request', async () => {
    const { owner, member, outsider, familyId } = await setup();
    const DAY = 86400000;
    const ago = (days) => new Date(Date.now() - days * DAY).toISOString();

    await addTx(owner, familyId, { amount: 100, date: ago(0) });
    await addTx(member, familyId, { amount: 40, date: ago(0) });
    await addTx(owner, familyId, { amount: 30, date: ago(2) });
    await addTx(owner, familyId, { amount: 500, type: 'income', category: 'Salary', date: ago(2) });
    await addTx(owner, familyId, { amount: 70, date: ago(20) });
    await addTx(owner, familyId, { amount: 900, date: ago(400) });

    const days = await call('GET', `/api/transactions/${familyId}/trend?range=day`, { as: owner });
    assert.equal(days.status, 200);
    assert.equal(days.body.range, 'day');
    assert.equal(days.body.buckets.length, 7);
    assert.equal(days.body.buckets[6].expense, 140, 'today, everyone');
    assert.equal(days.body.buckets[4].expense, 30);
    assert.equal(days.body.buckets[4].income, 500);
    days.body.buckets.slice(1).forEach((b, i) => assert.equal(b.start, days.body.buckets[i].end, 'buckets touch end to start'));

    const total = (res) => res.body.buckets.reduce((sum, b) => sum + b.expense, 0);
    const weeks = await call('GET', `/api/transactions/${familyId}/trend?range=week`, { as: owner });
    const months = await call('GET', `/api/transactions/${familyId}/trend?range=month`, { as: owner });
    assert.equal(weeks.body.buckets.length, 8);
    assert.equal(months.body.buckets.length, 6);
    assert.equal(total(weeks), 240, 'the 400 day old entry is outside the window');
    assert.equal(total(months), 240);
    assert.equal(weeks.body.buckets[7].expense >= 140, true, 'this week holds today');

    // The pie chart's numbers: expenses only, across the whole window.
    assert.deepEqual(days.body.byCategory, [{ category: 'Groceries', total: 170, percent: 100 }]);
    assert.equal(weeks.body.byCategory[0].total, 240);

    const mine = await call('GET', `/api/transactions/${familyId}/trend?range=day&scope=me`, { as: member });
    assert.equal(mine.body.scope, 'me');
    assert.equal(mine.body.buckets[6].expense, 40);
    assert.equal(mine.body.buckets[4].income, 0);

    // A bucket's own start and end return exactly its transactions.
    const today = days.body.buckets[6];
    const inBucket = await call('GET', `/api/transactions/${familyId}?from=${today.start}&to=${new Date(Date.parse(today.end) - 1).toISOString()}`, { as: owner });
    assert.equal(inBucket.body.length, 2);

    const fallback = await call('GET', `/api/transactions/${familyId}/trend?range=bogus`, { as: owner });
    assert.equal(fallback.body.range, 'day');
    assert.equal((await call('GET', `/api/transactions/${familyId}/trend?range=day`, { as: outsider })).status, 403);
});

test('transaction list can be limited to my own entries', async () => {
    const { owner, member, familyId } = await setup();
    await addTx(owner, familyId, { amount: 10 });
    await addTx(member, familyId, { amount: 20 });
    await addTx(member, familyId, { amount: 30, type: 'income', category: 'Salary' });

    const everyone = await call('GET', `/api/transactions/${familyId}`, { as: member });
    const mine = await call('GET', `/api/transactions/${familyId}?scope=me`, { as: member });
    const mineIncome = await call('GET', `/api/transactions/${familyId}?scope=me&type=income`, { as: member });
    assert.equal(everyone.body.length, 3);
    assert.deepEqual(mine.body.map((t) => t.amount).sort(), [20, 30]);
    assert.deepEqual(mineIncome.body.map((t) => t.amount), [30]);
});

test('goals: create, contribute, clamp at zero, edit, delete', async () => {
    const { owner, member, familyId } = await setup();

    const created = await call('POST', '/api/goals', { as: owner, body: { familyId, title: 'Goa trip', targetAmount: 1000, deadline: '2027-01-01' } });
    assert.equal(created.status, 201);
    const goalId = created.body.id;

    const first = await call('PUT', '/api/goals/update', { as: member, body: { goalId, amount: 400 } });
    assert.equal(first.body.currentAmount, 400);
    assert.equal(first.body.completed, false);

    const second = await call('PUT', '/api/goals/update', { as: owner, body: { goalId, amount: 600 } });
    assert.equal(second.body.completed, true);

    const overdraw = await call('PUT', '/api/goals/update', { as: owner, body: { goalId, amount: -5000 } });
    assert.equal(overdraw.body.currentAmount, 0);

    assert.equal((await call('PUT', `/api/goals/${goalId}`, { as: owner, body: { title: 'Goa 2027', deadline: null } })).status, 200);
    assert.equal((await call('PUT', `/api/goals/${goalId}`, { as: owner, body: {} })).status, 400);

    const list = await call('GET', `/api/goals/${familyId}`, { as: member });
    assert.equal(list.body[0].title, 'Goa 2027');
    assert.equal(list.body[0].deadline, null);

    assert.equal((await call('DELETE', `/api/goals/${goalId}`, { as: owner })).status, 200);
    assert.equal((await call('GET', `/api/goals/${familyId}`, { as: owner })).body.length, 0);
});

test('loans: default due date, partial and full repayment', async () => {
    const { owner, member, familyId } = await setup();

    const created = await call('POST', '/api/loans', { as: owner, body: { familyId, person: 'Ravi', amount: 500 } });
    assert.equal(created.status, 201);

    const list = await call('GET', `/api/loans/${familyId}`, { as: member });
    const loan = list.body[0];
    assert.equal(loan.direction, 'lent');
    assert.equal(loan.status, 'open');
    const days = (new Date(loan.dueDate) - Date.now()) / 86400000;
    assert.ok(days > 6.9 && days < 7.1, `due date should default to +7 days, got ${days}`);

    const partial = await call('PUT', `/api/loans/${loan.id}/repay`, { as: owner, body: { amount: 200 } });
    assert.deepEqual(partial.body, { repaidAmount: 200, outstanding: 300, status: 'open' });

    const rest = await call('PUT', `/api/loans/${loan.id}/repay`, { as: owner });
    assert.deepEqual(rest.body, { repaidAmount: 500, outstanding: 0, status: 'settled' });
    assert.equal((await call('PUT', `/api/loans/${loan.id}/repay`, { as: owner })).status, 409);

    assert.equal((await call('GET', `/api/loans/${familyId}?status=open`, { as: owner })).body.length, 0);
    assert.equal((await call('GET', `/api/loans/${familyId}?status=settled`, { as: owner })).body.length, 1);

    assert.equal((await call('DELETE', `/api/loans/${loan.id}`, { as: owner })).status, 200);
});

test('budgets: one per category, upsert and delete', async () => {
    const { owner, member, familyId } = await setup();

    const set = await call('PUT', '/api/budgets', { as: owner, body: { familyId, category: 'Groceries', limit: 8000 } });
    assert.equal(set.status, 200);
    await call('PUT', '/api/budgets', { as: member, body: { familyId, category: 'groceries', limit: 9000 } });
    await call('PUT', '/api/budgets', { as: owner, body: { familyId, category: 'Travel', limit: 3000 } });

    const list = await call('GET', `/api/budgets/${familyId}`, { as: owner });
    assert.equal(list.body.length, 2);
    assert.equal(list.body.find((b) => b.id === set.body.id).limit, 9000);

    assert.equal((await call('DELETE', `/api/budgets/${set.body.id}`, { as: owner })).status, 200);
    assert.equal((await call('GET', `/api/budgets/${familyId}`, { as: owner })).body.length, 1);
});

test('members can leave, the admin must hand over first, admins can remove members', async () => {
    const { owner, member, familyId } = await setup();

    const blocked = await call('POST', '/api/family/leave', { as: owner });
    assert.equal(blocked.status, 400);

    assert.equal((await call('DELETE', `/api/family/${familyId}/members/${member}`, { as: member })).status, 403);
    assert.equal((await call('DELETE', `/api/family/${familyId}/members/${owner}`, { as: owner })).status, 400);

    const transfer = await call('PUT', `/api/family/${familyId}/admin`, { as: owner, body: { userId: member } });
    assert.equal(transfer.status, 200);

    const left = await call('POST', '/api/family/leave', { as: owner });
    assert.equal(left.status, 200);
    assert.equal((await call('GET', '/api/me', { as: owner })).body.family, null);
    assert.equal((await call('GET', `/api/transactions/${familyId}`, { as: owner })).status, 403);

    // The last person leaving closes the family down.
    assert.equal((await call('POST', '/api/family/leave', { as: member })).status, 200);
    assert.equal((await call('GET', `/api/family/${familyId}`, { as: member })).status, 404);
});

test('admin can remove a member', async () => {
    const { owner, member, familyId } = await setup();

    assert.equal((await call('DELETE', `/api/family/${familyId}/members/${member}`, { as: owner })).status, 200);
    assert.equal((await call('GET', '/api/me', { as: member })).body.familyId, null);
    assert.equal((await call('GET', `/api/transactions/${familyId}`, { as: member })).status, 403);
});

test('only the admin can rename the family', async () => {
    const { owner, member, outsider, familyId } = await setup();

    assert.equal((await call('PATCH', `/api/family/${familyId}`, { as: member, body: { familyName: 'Nope Family' } })).status, 403);
    assert.equal((await call('PATCH', `/api/family/${familyId}`, { as: outsider, body: { familyName: 'Nope Family' } })).status, 403);
    assert.equal((await call('PATCH', `/api/family/${familyId}`, { as: owner, body: { familyName: 'X' } })).status, 400);

    const renamed = await call('PATCH', `/api/family/${familyId}`, { as: owner, body: { familyName: '  The Iyer Family ' } });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.name, 'The Iyer Family');

    assert.equal((await call('GET', '/api/me', { as: member })).body.family.name, 'The Iyer Family');
    assert.equal((await call('GET', `/api/family/${familyId}`, { as: member })).body.name, 'The Iyer Family');
});

test('profile name can be updated', async () => {
    const uid = await register('Asha');
    assert.equal((await call('PATCH', '/api/me', { as: uid, body: { displayName: 'A' } })).status, 400);
    assert.equal((await call('PATCH', '/api/me', { as: uid, body: { displayName: 'Asha R' } })).status, 200);
    assert.equal((await call('GET', '/api/me', { as: uid })).body.displayName, 'Asha R');
});

test('goal contribution can record in transactions', async () => {
    const { owner, familyId } = await setup();
    const goalRes = await call('POST', '/api/goals', {
        as: owner,
        body: { familyId, title: 'Trip Fund', targetAmount: 5000 },
    });
    const goalId = goalRes.body.id;

    // Contribute with recordTransaction: true
    const contRes = await call('PUT', '/api/goals/update', {
        as: owner,
        body: { goalId, amount: 1500, recordTransaction: true, paymentMethod: 'UPI' },
    });
    assert.equal(contRes.status, 200);
    assert.equal(contRes.body.currentAmount, 1500);

    // Verify transaction was created
    const txsRes = await call('GET', `/api/transactions/${familyId}`, { as: owner });
    assert.equal(txsRes.status, 200);
    const goalTx = txsRes.body.find((t) => t.category === 'Savings');
    assert.ok(goalTx);
    assert.equal(goalTx.amount, 1500);
    assert.equal(goalTx.type, 'expense');
    assert.equal(goalTx.paymentMethod, 'UPI');
});

test('loan repayment can record in transactions', async () => {
    const { owner, familyId } = await setup();
    const loanRes = await call('POST', '/api/loans', {
        as: owner,
        body: { familyId, direction: 'lent', person: 'Ravi', amount: 2000 },
    });
    const loanId = loanRes.body.id;

    // Repay partial with recordTransaction: true
    const repayRes = await call('PUT', `/api/loans/${loanId}/repay`, {
        as: owner,
        body: { amount: 800, recordTransaction: true, paymentMethod: 'Card' },
    });
    assert.equal(repayRes.status, 200);
    assert.equal(repayRes.body.repaidAmount, 800);

    // Verify transaction was created as income (since direction was 'lent')
    const txsRes = await call('GET', `/api/transactions/${familyId}`, { as: owner });
    assert.equal(txsRes.status, 200);
    const loanTx = txsRes.body.find((t) => t.category === 'Loan repayment');
    assert.ok(loanTx);
    assert.equal(loanTx.amount, 800);
    assert.equal(loanTx.type, 'income');
    assert.equal(loanTx.paymentMethod, 'Card');
});

test('custom categories can be added and deleted', async () => {
    const { owner, member, familyId } = await setup();

    const addRes = await call('POST', `/api/family/${familyId}/categories`, {
        as: owner,
        body: { name: 'Pet Care', type: 'expense', tint: '#10B981', icon: 'PawPrint' },
    });
    assert.equal(addRes.status, 201);
    assert.equal(addRes.body.name, 'Pet Care');

    // Duplicate name rejected
    const dupRes = await call('POST', `/api/family/${familyId}/categories`, {
        as: owner,
        body: { name: 'pet care', type: 'expense' },
    });
    assert.equal(dupRes.status, 409);

    // Family details include the new custom category
    const famRes = await call('GET', `/api/family/${familyId}`, { as: member });
    assert.equal(famRes.status, 200);
    assert.equal(famRes.body.customCategories.length, 1);
    assert.equal(famRes.body.customCategories[0].name, 'Pet Care');

    // Delete category
    const catId = addRes.body.id;
    const delRes = await call('DELETE', `/api/family/${familyId}/categories/${catId}`, { as: member });
    assert.equal(delRes.status, 200);

    const famAfter = await call('GET', `/api/family/${familyId}`, { as: owner });
    assert.equal(famAfter.body.customCategories.length, 0);
});

test('recurring transactions: create, record instance, delete', async () => {
    const { owner, familyId } = await setup();

    const createRes = await call('POST', '/api/recurring', {
        as: owner,
        body: {
            familyId,
            amount: 799,
            type: 'expense',
            category: 'Bills',
            description: 'Netflix subscription',
            frequency: 'monthly',
            paymentMethod: 'Card',
            autoRecord: false,
        },
    });
    assert.equal(createRes.status, 201);
    const recId = createRes.body.id;

    // List recurring
    const listRes = await call('GET', `/api/recurring/${familyId}`, { as: owner });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.length, 1);
    assert.equal(listRes.body[0].description, 'Netflix subscription');

    // Record an instance manually
    const recInst = await call('POST', `/api/recurring/${recId}/record`, {
        as: owner,
        body: { paymentMethod: 'UPI' },
    });
    assert.equal(recInst.status, 200);
    assert.ok(recInst.body.transactionId);

    // Check transaction was posted
    const txsRes = await call('GET', `/api/transactions/${familyId}`, { as: owner });
    assert.equal(txsRes.status, 200);
    const tx = txsRes.body.find((t) => t.source === 'recurring');
    assert.ok(tx);
    assert.equal(tx.amount, 799);
    assert.equal(tx.paymentMethod, 'UPI');

    // Delete recurring
    const delRes = await call('DELETE', `/api/recurring/${recId}`, { as: owner });
    assert.equal(delRes.status, 200);
});

test('edge cases and error resilience', async () => {
    const { owner, familyId } = await setup();

    // 1. Invalid transaction updates (invalid date, negative amount, empty update)
    const tx = await addTx(owner, familyId, { amount: 50, category: 'Food' });
    const badDate = await call('PUT', `/api/transactions/${tx.body.id}`, { as: owner, body: { date: 'invalid-date' } });
    assert.equal(badDate.status, 400);

    const badAmt = await call('PUT', `/api/transactions/${tx.body.id}`, { as: owner, body: { amount: -20 } });
    assert.equal(badAmt.status, 400);

    const badAmtStr = await call('PUT', `/api/transactions/${tx.body.id}`, { as: owner, body: { amount: 'not-a-number' } });
    assert.equal(badAmtStr.status, 400);

    // 2. Invalid loan updates
    const loan = await call('POST', '/api/loans', { as: owner, body: { familyId, person: 'Friend', amount: 100 } });
    assert.equal(loan.status, 201);

    const badLoanAmt = await call('PUT', `/api/loans/${loan.body.id}`, { as: owner, body: { amount: -50 } });
    assert.equal(badLoanAmt.status, 400);

    const badLoanDue = await call('PUT', `/api/loans/${loan.body.id}`, { as: owner, body: { dueDate: 'invalid-due' } });
    assert.equal(badLoanDue.status, 400);

    const badRepay = await call('PUT', `/api/loans/${loan.body.id}/repay`, { as: owner, body: { amount: -10 } });
    assert.equal(badRepay.status, 400);

    // 3. Invalid goal updates
    const goal = await call('POST', '/api/goals', { as: owner, body: { familyId, title: 'Trip', targetAmount: 500 } });
    assert.equal(goal.status, 201);

    const badGoalAmt = await call('PUT', `/api/goals/${goal.body.id}`, { as: owner, body: { targetAmount: -100 } });
    assert.equal(badGoalAmt.status, 400);

    const badGoalDue = await call('PUT', `/api/goals/${goal.body.id}`, { as: owner, body: { deadline: 'invalid-deadline' } });
    assert.equal(badGoalDue.status, 400);

    // 4. Invalid recurring updates
    const rec = await call('POST', '/api/recurring', {
        as: owner,
        body: { familyId, amount: 200, category: 'Bills', description: 'Power', frequency: 'monthly' },
    });
    assert.equal(rec.status, 201);

    const badRecFreq = await call('PUT', `/api/recurring/${rec.body.id}`, { as: owner, body: { frequency: 'invalid-freq' } });
    assert.equal(badRecFreq.status, 400);

    const badRecDate = await call('PUT', `/api/recurring/${rec.body.id}`, { as: owner, body: { nextRunDate: 'invalid-date' } });
    assert.equal(badRecDate.status, 400);
});


test('transactions: split expense persists isSplit, myShare, lentAmount, splitWith', async () => {
    const { owner, familyId } = await setup();
    const splitTx = await addTx(owner, familyId, {
        amount: 300,
        type: 'expense',
        category: 'Food',
        description: 'Dinner with friends',
        isSplit: true,
        myShare: 100,
        lentAmount: 200,
        splitWith: 'Friends',
    });
    assert.equal(splitTx.status, 201);
    assert.ok(splitTx.body.id);

    const list = await call('GET', `/api/transactions/${familyId}`, { as: owner });
    const found = list.body.find((t) => t.id === splitTx.body.id);
    assert.ok(found);
    assert.equal(found.isSplit, true);
    assert.equal(found.amount, 100); // Expense transaction only records the user's share!
    assert.equal(found.totalAmount, 300); // Total bill preserved
    assert.equal(found.myShare, 100);
    assert.equal(found.lentAmount, 200);
    assert.equal(found.splitWith, 'Friends');
    assert.ok(found.linkedLoanId);

    // Verify automatic loan was created
    const loansRes1 = await call('GET', `/api/loans/${familyId}`, { as: owner });
    assert.equal(loansRes1.status, 200);
    const createdLoan = loansRes1.body.find((l) => l.id === found.linkedLoanId);
    assert.ok(createdLoan);
    assert.equal(createdLoan.direction, 'lent');
    assert.equal(createdLoan.amount, 200);
    assert.equal(createdLoan.person, 'Friends');
    assert.equal(createdLoan.isSplitLoan, true);

    // Verify summary only considers myShare as expense
    const sum1 = await call('GET', `/api/transactions/${familyId}/summary?month=2026-10`, { as: owner });
    assert.equal(sum1.status, 200);
    assert.equal(sum1.body.expense, 100);
    assert.equal(sum1.body.balance, -100);

    // Update split details
    const updated = await call('PUT', `/api/transactions/${splitTx.body.id}`, {
        as: owner,
        body: {
            isSplit: true,
            myShare: 120,
            lentAmount: 180,
            splitWith: 'Rahul',
        },
    });
    assert.equal(updated.status, 200);
    const refreshed = await call('GET', `/api/transactions/${familyId}`, { as: owner });
    const updatedFound = refreshed.body.find((t) => t.id === splitTx.body.id);
    assert.equal(updatedFound.myShare, 120);
    assert.equal(updatedFound.lentAmount, 180);
    assert.equal(updatedFound.splitWith, 'Rahul');

    // Verify linked loan updated
    const loansRes2 = await call('GET', `/api/loans/${familyId}`, { as: owner });
    const updatedLoan = loansRes2.body.find((l) => l.id === updatedFound.linkedLoanId);
    assert.ok(updatedLoan);
    assert.equal(updatedLoan.amount, 180);
    assert.equal(updatedLoan.person, 'Rahul');

    // Verify summary updated to myShare 120
    const sum2 = await call('GET', `/api/transactions/${familyId}/summary?month=2026-10`, { as: owner });
    assert.equal(sum2.body.expense, 120);
    assert.equal(sum2.body.balance, -120);

    // Repay the split loan with recordTransaction: true
    // Split loan repayments recover lent funds and MUST NOT create income transaction or inflate balance
    const repayRes = await call('PUT', `/api/loans/${updatedFound.linkedLoanId}/repay`, {
        as: owner,
        body: { amount: 180, recordTransaction: true },
    });
    assert.equal(repayRes.status, 200);

    // Verify loan is settled
    const loansRes3 = await call('GET', `/api/loans/${familyId}?status=settled`, { as: owner });
    const settledLoan = loansRes3.body.find((l) => l.id === updatedFound.linkedLoanId);
    assert.ok(settledLoan);
    assert.equal(settledLoan.status, 'settled');

    // Verify NO income transaction was recorded
    const afterRepayTx = await call('GET', `/api/transactions/${familyId}`, { as: owner });
    const incomeTxs = afterRepayTx.body.filter((t) => t.type === 'income');
    assert.equal(incomeTxs.length, 0);

    // Verify family balance was NOT increased by repayment
    const sumAfterRepay = await call('GET', `/api/transactions/${familyId}/summary?month=2026-10`, { as: owner });
    assert.equal(sumAfterRepay.body.balance, -120);

    // Test single=1 and range=year for trend
    const yearTrend = await call('GET', `/api/transactions/${familyId}/trend?range=year&single=1`, { as: owner });
    assert.equal(yearTrend.status, 200);
    assert.equal(yearTrend.body.range, 'year');
    assert.ok(yearTrend.body.buckets.length > 0);
});
