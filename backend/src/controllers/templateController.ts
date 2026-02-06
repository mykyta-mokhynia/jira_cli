import { Request, Response } from 'express';
import * as TemplateService from '../services/template';

export const auditProject = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const { type } = req.query; // 'team' or 'non-team'

        if (!type || (type !== 'team' && type !== 'non-team')) {
            res.status(400).json({ error: 'Query param "type" must be "team" or "non-team"' });
            return;
        }

        const result = await TemplateService.auditProject(key as string, type as 'team' | 'non-team');
        res.json(result);
    } catch (error: any) {
        console.error('Audit error:', error);
        res.status(500).json({ error: error.message || 'Failed to audit project' });
    }
};

export const applyProjectTemplate = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const { projectType, leaderAccountId, serviceDeskMembers, userMembers, adminMembers } = req.body;

        if (!projectType || (projectType !== 'team' && projectType !== 'non-team')) {
            res.status(400).json({ error: 'Body param "projectType" must be "team" or "non-team"' });
            return;
        }

        const result = await TemplateService.applyProjectTemplate(key as string, projectType, leaderAccountId, serviceDeskMembers, userMembers, adminMembers);
        res.json(result);
    } catch (error: any) {
        console.error('Apply Template error:', error);
        res.status(500).json({ error: error.message || 'Failed to apply template' });
    }
};
