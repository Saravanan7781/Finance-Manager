// Minimal in-memory Firestore used by the API tests. Covers only what the controllers call.

const isSentinel = (v) => v && typeof v === 'object' && v.__op;

const FieldValue = {
    increment: (n) => ({ __op: 'increment', n }),
    arrayUnion: (...items) => ({ __op: 'arrayUnion', items }),
    arrayRemove: (...items) => ({ __op: 'arrayRemove', items }),
    delete: () => ({ __op: 'delete' }),
};

const applySentinel = (current, value) => {
    switch (value.__op) {
        case 'increment': return (current || 0) + value.n;
        case 'arrayUnion': {
            const arr = Array.isArray(current) ? [...current] : [];
            value.items.forEach((i) => { if (!arr.includes(i)) arr.push(i); });
            return arr;
        }
        case 'arrayRemove':
            return (Array.isArray(current) ? current : []).filter((i) => !value.items.includes(i));
        default: return current;
    }
};

const comparable = (v) => (v instanceof Date ? v.getTime() : v);

const matches = (docValue, op, target) => {
    const a = comparable(docValue);
    const b = comparable(target);
    switch (op) {
        case '==': return a === b;
        case '!=': return a !== b;
        case '>': return a > b;
        case '>=': return a >= b;
        case '<': return a < b;
        case '<=': return a <= b;
        case 'in': return target.map(comparable).includes(a);
        case 'array-contains': return Array.isArray(docValue) && docValue.includes(target);
        default: throw new Error(`Unsupported operator ${op}`);
    }
};

class DocSnapshot {
    constructor(ref, data) {
        this.ref = ref;
        this.id = ref.id;
        this._data = data;
        this.exists = data !== undefined;
    }

    data() {
        return this._data === undefined ? undefined : structuredClone(this._data);
    }
}

class DocRef {
    constructor(db, collection, id) {
        this.db = db;
        this.collection = collection;
        this.id = id;
    }

    get _store() { return this.db._collection(this.collection); }

    async get() { return new DocSnapshot(this, this._store.get(this.id)); }

    async set(data, options = {}) {
        const base = options.merge ? (this._store.get(this.id) || {}) : {};
        this._store.set(this.id, { ...base, ...structuredClone(data) });
    }

    async update(data) {
        const current = this._store.get(this.id);
        if (!current) throw new Error(`NOT_FOUND: no document to update ${this.collection}/${this.id}`);
        const next = { ...current };
        Object.keys(data).forEach((key) => {
            const value = data[key];
            if (isSentinel(value)) {
                if (value.__op === 'delete') delete next[key];
                else next[key] = applySentinel(current[key], value);
            } else {
                next[key] = structuredClone(value);
            }
        });
        this._store.set(this.id, next);
    }

    async delete() { this._store.delete(this.id); }
}

class Query {
    constructor(db, collection, state = {}) {
        this.db = db;
        this.collectionName = collection;
        this.state = { filters: [], orders: [], limit: null, after: null, ...state };
    }

    _next(patch) {
        return new Query(this.db, this.collectionName, { ...this.state, ...patch });
    }

    where(field, op, value) { return this._next({ filters: [...this.state.filters, { field, op, value }] }); }
    orderBy(field, dir = 'asc') { return this._next({ orders: [...this.state.orders, { field, dir }] }); }
    limit(n) { return this._next({ limit: n }); }
    startAfter(snapshot) { return this._next({ after: snapshot.id }); }

    async get() {
        let rows = [...this.db._collection(this.collectionName).entries()];
        this.state.filters.forEach(({ field, op, value }) => {
            rows = rows.filter(([, data]) => matches(data[field], op, value));
        });
        this.state.orders.slice().reverse().forEach(({ field, dir }) => {
            rows.sort(([, a], [, b]) => {
                const x = comparable(a[field]);
                const y = comparable(b[field]);
                const cmp = x < y ? -1 : x > y ? 1 : 0;
                return dir === 'desc' ? -cmp : cmp;
            });
        });
        if (this.state.after) {
            const idx = rows.findIndex(([id]) => id === this.state.after);
            if (idx >= 0) rows = rows.slice(idx + 1);
        }
        if (this.state.limit != null) rows = rows.slice(0, this.state.limit);

        const docs = rows.map(([id, data]) => new DocSnapshot(new DocRef(this.db, this.collectionName, id), data));
        return {
            docs,
            empty: docs.length === 0,
            size: docs.length,
            forEach: (fn) => docs.forEach(fn),
        };
    }
}

class CollectionRef extends Query {
    doc(id) { return new DocRef(this.db, this.collectionName, id || this.db._newId()); }

    async add(data) {
        const ref = this.doc();
        await ref.set(data);
        return ref;
    }
}

class FakeFirestore {
    constructor() {
        this.collections = new Map();
        this.counter = 0;
    }

    _collection(name) {
        if (!this.collections.has(name)) this.collections.set(name, new Map());
        return this.collections.get(name);
    }

    _newId() { return `doc${++this.counter}`; }

    collection(name) { return new CollectionRef(this, name); }

    async runTransaction(fn) {
        const writes = [];
        const tx = {
            get: (ref) => ref.get(),
            set: (ref, data, options) => { writes.push(() => ref.set(data, options)); },
            update: (ref, data) => { writes.push(() => ref.update(data)); },
            delete: (ref) => { writes.push(() => ref.delete()); },
        };
        const result = await fn(tx);
        for (const write of writes) await write();
        return result;
    }

    reset() {
        this.collections.clear();
        this.counter = 0;
    }
}

// Auth stub: the bearer token is "token-<uid>", and registering creates a user with that uid.
class FakeAuth {
    constructor() { this.users = new Map(); this.counter = 0; }

    async createUser({ email, displayName }) {
        if ([...this.users.values()].some((u) => u.email === email)) {
            const err = new Error('The email address is already in use');
            err.statusCode = 409;
            throw err;
        }
        const uid = `user${++this.counter}`;
        this.users.set(uid, { uid, email, displayName });
        return { uid, email, displayName };
    }

    async verifyIdToken(token) {
        const match = /^token-(.+)$/.exec(token);
        if (!match) throw new Error('bad token');
        const uid = match[1];
        const user = this.users.get(uid);
        return { uid, email: user ? user.email : `${uid}@test.dev` };
    }

    reset() { this.users.clear(); this.counter = 0; }
}

module.exports = { FakeFirestore, FakeAuth, FieldValue };
