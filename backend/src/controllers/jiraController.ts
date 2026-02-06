import { Request, Response } from 'express';
import * as JiraService from '../services/jira';

export const getIssue = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const issue = await JiraService.getIssue(key as string);
        res.json(issue);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch issue' });
    }
};

export const searchIssues = async (req: Request, res: Response) => {
    try {
        const { jql } = req.query;
        if (typeof jql !== 'string') {
            res.status(400).json({ error: 'JQL query parameter is required and must be a string' });
            return; // Explicit return to satisfy void
        }
        const results = await JiraService.searchIssues(jql);
        res.json(results);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to search issues' });
    }
};

export const createIssue = async (req: Request, res: Response) => {
    try {
        const issueData = req.body;
        const newIssue = await JiraService.createIssue(issueData);
        res.status(201).json(newIssue);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to create issue' });
    }
};

export const updateIssue = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const updateData = req.body;
        const result = await JiraService.updateIssue(key as string, updateData);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to update issue' });
    }
};

export const getProjects = async (req: Request, res: Response) => {
    try {
        const projects = await JiraService.getProjects();
        res.json(projects);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch projects' });
    }
};

export const getBoards = async (req: Request, res: Response) => {
    try {
        const boards = await JiraService.getBoards();
        res.json(boards);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch boards' });
    }
};

export const getProjectDetails = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const project = await JiraService.getProjectDetails(key as string);
        res.json(project);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch project details' });
    }
};

export const getProjectRoles = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const roles = await JiraService.getProjectRoles(key as string);
        res.json(roles);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch project roles' });
    }
};

export const addRoleActor = async (req: Request, res: Response) => {
    try {
        const { key, id } = req.params;
        const { user, group } = req.body;
        const result = await JiraService.addActorToProjectRole(key, parseInt(id, 10), { user: user ? [user] : undefined, group: group ? [group] : undefined });
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to add actor' });
    }
};

export const removeRoleActor = async (req: Request, res: Response) => {
    try {
        const { key, id } = req.params;
        const { user, group } = req.query;
        const result = await JiraService.removeActorFromProjectRole(key, parseInt(id, 10), { user: user as string, group: group as string });
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to remove actor' });
    }
};

export const getUsers = async (req: Request, res: Response) => {
    try {
        const users = await JiraService.getUsers();
        res.json(users);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch users' });
    }
};

export const getAssignableUsers = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const { query } = req.query;
        const users = await JiraService.getAssignableUsers(key as string, typeof query === 'string' ? query : undefined);
        res.json(users);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch assignable users' });
    }
};

export const getCurrentUser = async (_req: Request, res: Response) => {
    try {
        const user = await JiraService.getCurrentUser();
        res.json(user);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch current user' });
    }
};

export const clearSecurityLevels = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const issueIdsOrKeys = Array.isArray(req.body?.issueIdsOrKeys)
            ? req.body.issueIdsOrKeys.filter((value: unknown) => typeof value === 'string')
            : undefined;
        const result = await JiraService.bulkClearSecurityLevels(key as string, issueIdsOrKeys);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to clear security levels' });
    }
};

export const getProjectAudit = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const audit = await JiraService.getProjectAudit(key as string);
        res.json(audit);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch project audit' });
    }
};

export const normalizeProjectRoles = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        // Check for projectKey in body if not in params, or verify. 
        // User request says POST /people/normalize with { "projectKey": "COUN" }
        // But better to use URL param /project/:key/people/normalize
        const result = await JiraService.normalizeProjectRoles(key as string);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to normalize project roles' });
    }
};

export const addProjectRoleUser = async (req: Request, res: Response) => {
    try {
        const { key, roleKey } = req.params;
        const { accountId } = req.body;
        if (!accountId) {
            res.status(400).json({ error: 'accountId is required' });
            return;
        }
        const result = await JiraService.addUserToProjectRole(key as string, roleKey as JiraService.RoleKey, accountId);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to add user to role' });
    }
};

export const removeProjectRoleUser = async (req: Request, res: Response) => {
    try {
        const { key, roleKey, accountId } = req.params;
        const result = await JiraService.removeUserFromProjectRole(key as string, roleKey as JiraService.RoleKey, accountId);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to remove user from role' });
    }
};

export const getProjectConfigSchemes = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const config = await JiraService.getProjectConfigSchemes(key as string);
        res.json(config);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch project configuration schemes' });
    }
};

export const getPermissionSchemeDiff = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const diff = await JiraService.getPermissionSchemeDiff(key as string);
        res.json(diff);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch permission scheme diff' });
    }
};

export const normalizePermissionScheme = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const result = await JiraService.normalizePermissionScheme(key as string);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to normalize permission scheme' });
    }
};
