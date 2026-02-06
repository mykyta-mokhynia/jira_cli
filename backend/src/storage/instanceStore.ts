import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface JiraInstance {
    id: string;
    name: string;
    host: string;
    email: string;
    apiToken: string;
    createdAt: string;
    updatedAt: string;
}

interface InstanceStoreData {
    instances: JiraInstance[];
    selectedInstanceId: string | null;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'instances.json');

const defaultStore: InstanceStoreData = {
    instances: [],
    selectedInstanceId: null
};

const normalizeValue = (value: string) => value.trim();

const normalizeOptional = (value: unknown) => (typeof value === 'string' ? normalizeValue(value) : undefined);

const normalizeAuthFields = (email: string, apiToken: string) => {
    const trimmedEmail = normalizeValue(email || '');
    const trimmedToken = normalizeValue(apiToken || '');

    if (trimmedToken.includes(':')) {
        const [left, ...rest] = trimmedToken.split(':');
        const right = rest.join(':');
        if (left.includes('@') && right) {
            return {
                email: normalizeValue(left),
                apiToken: normalizeValue(right),
                legacyDetected: true
            };
        }
    }

    if (!trimmedToken && trimmedEmail.includes(':')) {
        const [left, ...rest] = trimmedEmail.split(':');
        const right = rest.join(':');
        if (left.includes('@') && right) {
            return {
                email: normalizeValue(left),
                apiToken: normalizeValue(right),
                legacyDetected: true
            };
        }
    }

    return {
        email: trimmedEmail,
        apiToken: trimmedToken,
        legacyDetected: false
    };
};

const normalizeHost = (host: string) => normalizeValue(host).replace(/\/+$/, '');

const readStore = async (): Promise<InstanceStoreData> => {
    try {
        const raw = await fs.readFile(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.instances)) {
            return { ...defaultStore };
        }
        return {
            instances: parsed.instances,
            selectedInstanceId: parsed.selectedInstanceId || null
        };
    } catch (error: any) {
        if (error?.code === 'ENOENT') {
            return { ...defaultStore };
        }
        throw error;
    }
};

const writeStore = async (data: InstanceStoreData) => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
};

export const listInstances = async () => {
    const store = await readStore();
    return store.instances;
};

export const getSelectedInstance = async () => {
    const store = await readStore();
    if (!store.selectedInstanceId) return null;
    return store.instances.find((instance) => instance.id === store.selectedInstanceId) || null;
};

export const getSelectedInstanceId = async () => {
    const store = await readStore();
    return store.selectedInstanceId;
};

export const createInstance = async (payload: {
    name: string;
    host: string;
    email: string;
    apiToken: string;
}) => {
    const store = await readStore();
    const now = new Date().toISOString();
    const auth = normalizeAuthFields(payload.email, payload.apiToken);
    if (auth.legacyDetected) {
        console.warn('[Instances] Detected legacy "email:token" format. Split into email/token.');
    }
    const instance: JiraInstance = {
        id: randomUUID(),
        name: normalizeValue(payload.name),
        host: normalizeHost(payload.host),
        email: auth.email,
        apiToken: auth.apiToken,
        createdAt: now,
        updatedAt: now
    };

    store.instances.push(instance);
    if (!store.selectedInstanceId) {
        store.selectedInstanceId = instance.id;
    }

    await writeStore(store);
    return instance;
};

export const updateInstance = async (
    id: string,
    updates: Partial<{ name: unknown; host: unknown; email: unknown; apiToken: unknown }>
) => {
    const store = await readStore();
    const index = store.instances.findIndex((instance) => instance.id === id);
    if (index < 0) return null;

    const existing = store.instances[index];
    const now = new Date().toISOString();

    const nextName = normalizeOptional(updates.name);
    const nextHost = normalizeOptional(updates.host);
    const nextEmail = normalizeOptional(updates.email);
    const nextToken = normalizeOptional(updates.apiToken);

    const auth = normalizeAuthFields(nextEmail ?? existing.email, nextToken ?? existing.apiToken);
    if (auth.legacyDetected) {
        console.warn('[Instances] Detected legacy "email:token" format on update. Split into email/token.');
    }

    const updated: JiraInstance = {
        ...existing,
        name: nextName ?? existing.name,
        host: nextHost ? normalizeHost(nextHost) : existing.host,
        email: auth.email,
        apiToken: auth.apiToken,
        updatedAt: now
    };

    store.instances[index] = updated;
    await writeStore(store);
    return updated;
};

export const deleteInstance = async (id: string) => {
    const store = await readStore();
    const remaining = store.instances.filter((instance) => instance.id !== id);
    if (remaining.length === store.instances.length) return false;

    store.instances = remaining;
    if (store.selectedInstanceId === id) {
        store.selectedInstanceId = remaining.length ? remaining[0].id : null;
    }
    await writeStore(store);
    return true;
};

export const selectInstance = async (id: string) => {
    const store = await readStore();
    const exists = store.instances.some((instance) => instance.id === id);
    if (!exists) return null;
    store.selectedInstanceId = id;
    await writeStore(store);
    return store.selectedInstanceId;
};
