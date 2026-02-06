import { Request, Response } from 'express';
import * as InstanceStore from '../storage/instanceStore';

const getRequiredField = (value: any) => (typeof value === 'string' ? value.trim() : '');

export const listInstances = async (_req: Request, res: Response) => {
    try {
        const instances = await InstanceStore.listInstances();
        res.json(instances);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to list instances' });
    }
};

export const getSelectedInstance = async (_req: Request, res: Response) => {
    try {
        const instance = await InstanceStore.getSelectedInstance();
        res.json(instance);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to load selected instance' });
    }
};

export const createInstance = async (req: Request, res: Response) => {
    try {
        const name = getRequiredField(req.body?.name);
        const host = getRequiredField(req.body?.host);
        const email = getRequiredField(req.body?.email);
        const apiToken = getRequiredField(req.body?.apiToken);

        const hasLegacyAuth =
            (apiToken.includes(':') && apiToken.includes('@')) ||
            (!apiToken && email.includes(':') && email.includes('@'));
        if (!name || !host || (!apiToken && !hasLegacyAuth) || (!email && !hasLegacyAuth)) {
            res.status(400).json({ error: 'name, host, email and apiToken are required' });
            return;
        }

        const instance = await InstanceStore.createInstance({ name, host, email, apiToken });
        res.status(201).json(instance);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to create instance' });
    }
};

export const updateInstance = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = {
            name: typeof req.body?.name === 'string' ? req.body.name : undefined,
            host: typeof req.body?.host === 'string' ? req.body.host : undefined,
            email: typeof req.body?.email === 'string' ? req.body.email : undefined,
            apiToken: typeof req.body?.apiToken === 'string' ? req.body.apiToken : undefined
        };

        if (!updates.name && !updates.host && !updates.email && !updates.apiToken) {
            res.status(400).json({ error: 'At least one field (name, host, email, apiToken) is required' });
            return;
        }

        const updated = await InstanceStore.updateInstance(id, updates);
        if (!updated) {
            res.status(404).json({ error: 'Instance not found' });
            return;
        }
        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to update instance' });
    }
};

export const deleteInstance = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const removed = await InstanceStore.deleteInstance(id);
        if (!removed) {
            res.status(404).json({ error: 'Instance not found' });
            return;
        }
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to delete instance' });
    }
};

export const selectInstance = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const selectedId = await InstanceStore.selectInstance(id);
        if (!selectedId) {
            res.status(404).json({ error: 'Instance not found' });
            return;
        }
        res.json({ success: true, selectedInstanceId: selectedId });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to select instance' });
    }
};
