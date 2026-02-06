import { Version3Client, AgileClient } from 'jira.js';
import { config } from '../config/env';
import { getSelectedInstance } from '../storage/instanceStore';

type JiraAuthConfig = {
    host: string;
    email: string;
    apiToken: string;
};

const ensureAuth = (auth: JiraAuthConfig) => {
    if (!auth.host || !auth.email || !auth.apiToken) {
        throw new Error('Jira credentials missing. Select an instance or configure .env.');
    }
};

const buildAuthConfig = (instance?: { host: string; email: string; apiToken: string }): JiraAuthConfig => {
    if (instance) {
        return {
            host: instance.host,
            email: instance.email,
            apiToken: instance.apiToken
        };
    }

    return {
        host: config.JIRA.HOST,
        email: config.JIRA.EMAIL,
        apiToken: config.JIRA.API_TOKEN
    };
};

const createClients = (auth: JiraAuthConfig) => {
    const options = {
        host: auth.host,
        authentication: {
            basic: {
                email: auth.email,
                apiToken: auth.apiToken
            }
        }
    };

    return {
        jira: new Version3Client(options),
        agile: new AgileClient(options)
    };
};

export const getJiraClients = async () => {
    const instance = await getSelectedInstance();
    const auth = buildAuthConfig(instance || undefined);
    ensureAuth(auth);
    return createClients(auth);
};

export const getIssue = async (issueKey: string) => {
    try {
        const { jira } = await getJiraClients();
        const issue = await jira.issues.getIssue({ issueIdOrKey: issueKey });
        return issue;
    } catch (error) {
        console.error(`Error fetching issue ${issueKey}:`, error);
        throw error;
    }
};

export const searchIssues = async (jql: string) => {
    try {
        const { jira } = await getJiraClients();
        const response = await jira.sendRequestFullResponse({
            url: '/rest/api/3/search',
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            data: {
                jql,
                maxResults: 50,
            },
        });
        console.log(response.data);
        return response.data;
    } catch (error) {
        console.error("Error searching issues:", error);
        throw error;
    }
};

export const createIssue = async (issueData: any) => {
    try {
        const { jira } = await getJiraClients();
        const issue = await jira.issues.createIssue(issueData);
        return issue;
    } catch (error) {
        console.error("Error creating issue:", error);
        throw error;
    }
};

export const updateIssue = async (issueKey: string, issueData: any) => {
    try {
        const { jira } = await getJiraClients();
        const issue = await jira.issues.editIssue({ issueIdOrKey: issueKey, ...issueData });
        return issue;
    } catch (error) {
        console.error(`Error updating issue ${issueKey}:`, error);
        throw error;
    }
};

export const getProjects = async () => {
    try {
        const { jira } = await getJiraClients();
        const projects = await jira.projects.searchProjects({});
        return projects;
    } catch (error) {
        console.error("Error fetching projects:", error);
        throw error;
    }
};

export const getBoards = async () => {
    try {
        const { agile } = await getJiraClients();
        const boards = await agile.board.getAllBoards();
        return boards;
    } catch (error) {
        console.error("Error fetching boards:", error);
        throw error;
    }
};

export const getProjectDetails = async (projectKeyOrId: string) => {
    try {
        const { jira } = await getJiraClients();
        const project = await jira.projects.getProject({
            projectIdOrKey: projectKeyOrId,
            expand: ['issueSecurityScheme', 'permissionScheme', 'description', 'lead', 'url']
        });
        return project;
    } catch (error) {
        console.error(`Error fetching project details for ${projectKeyOrId}:`, error);
        throw error;
    }
};

export const getProjectRoles = async (projectKeyOrId: string) => {
    try {
        const { jira } = await getJiraClients();
        const rolesUrls = await jira.projectRoles.getProjectRoles({ projectIdOrKey: projectKeyOrId });
        const roleNames = Object.keys(rolesUrls);

        // Groups that should remain collapsed
        const COLLAPSED_GROUPS = ['org-admins', 'All users from G Suite', 'full_access_to_tasks'];

        const rolesPromises = roleNames.map(async (roleName) => {
            try {
                const parts = rolesUrls[roleName].split('/');
                const id = parseInt(parts[parts.length - 1], 10);
                if (isNaN(id)) return null;

                const roleDetails: any = await jira.projectRoles.getProjectRole({
                    projectIdOrKey: projectKeyOrId,
                    id: id
                });

                const expandedActors: any[] = [];
                const actors = roleDetails.actors || [];

                for (const actor of actors) {
                    if (actor.type === 'atlassian-group-role-actor' && actor.name) {
                        if (COLLAPSED_GROUPS.includes(actor.name)) {
                            // Keep whitelisted groups as is
                            expandedActors.push(actor);
                        } else {
                            // Expand other groups
                            try {
                                const membersResult = await jira.groups.getUsersFromGroup({ groupname: actor.name });
                                const members = (membersResult as any).values || membersResult || [];

                                for (const user of members) {
                                    // Create a user actor structure resembling what Jira returns for user actors
                                    // but add expandedFrom to indicate origin
                                    if (user.accountId && user.accountType === 'atlassian') {
                                        expandedActors.push({
                                            id: user.accountId, // artificial ID for keying
                                            displayName: user.displayName,
                                            name: user.displayName,
                                            type: 'atlassian-user-role-actor',
                                            avatarUrl: user.avatarUrls?.['48x48'],
                                            actorUser: user,
                                            expandedFrom: actor.name
                                        });
                                    }
                                }
                            } catch (e) {
                                console.warn(`Failed to expand group ${actor.name} in role ${roleName}`, e);
                                // If expansion fails, fallback to keeping the group
                                expandedActors.push(actor);
                            }
                        }
                    } else {
                        // Keep direct user assignments
                        expandedActors.push(actor);
                    }
                }

                // Deduplicate actors by accountId (if user is both direct and via group, or via multiple groups)
                // Priority: Direct > Group. detailed merge logic could be complex, simple map by accountId wins first seen?
                // Actually, let's allow duplicates if meaningful, but usually we want unique users.
                // If we want to show "User (via Group)", we probably want to prioritize Direct if exists?
                // Let's rely on simple display logic first. We'll return all.

                roleDetails.actors = expandedActors;
                return roleDetails;
            } catch (e) {
                console.warn(`Failed to fetch role ${roleName}`, e);
                return null;
            }
        });

        const roles = await Promise.all(rolesPromises);
        return roles.filter(r => r !== null);
    } catch (error) {
        console.error(`Error fetching roles for ${projectKeyOrId}:`, error);
        throw error;
    }
};

export const createGroup = async (groupName: string) => {
    try {
        const { jira } = await getJiraClients();
        const group = await jira.groups.createGroup({ name: groupName });
        return group;
    } catch (error) {
        console.error(`Error creating group ${groupName}:`, error);
        throw error;
    }
};

export const addUserToGroup = async (accountId: string, groupName: string) => {
    try {
        const { jira } = await getJiraClients();
        const result = await jira.groups.addUserToGroup({
            groupname: groupName,
            accountId: accountId
        });
        return result;
    } catch (error) {
        console.error(`Error adding user ${accountId} to group ${groupName}:`, error);
        throw error;
    }
};

export const removeUserFromGroup = async (accountId: string, groupName: string) => {
    try {
        const { jira } = await getJiraClients();
        const result = await jira.groups.removeUserFromGroup({
            groupname: groupName,
            accountId: accountId
        });
        return result;
    } catch (error) {
        console.error(`Error removing user ${accountId} from group ${groupName}:`, error);
        throw error;
    }
};

export const addGroupToProjectRole = async (projectKeyOrId: string, roleId: number, groupName: string) => {
    try {
        const { jira } = await getJiraClients();
        const result = await jira.projectRoleActors.addActorUsers({
            projectIdOrKey: projectKeyOrId,
            id: roleId,
            group: [groupName]
        });
        return result;
    } catch (error) {
        console.error(`Error adding group ${groupName} to role ${roleId} in ${projectKeyOrId}:`, error);
        throw error;
    }
};

export const getProjectRoleByName = async (projectKeyOrId: string, roleName: string) => {
    try {
        const { jira } = await getJiraClients();
        const rolesUrls = await jira.projectRoles.getProjectRoles({ projectIdOrKey: projectKeyOrId });
        if (rolesUrls[roleName]) {
            const parts = rolesUrls[roleName].split('/');
            const id = parseInt(parts[parts.length - 1], 10);
            return { name: roleName, id: id, self: rolesUrls[roleName] };
        }
        return null;
    } catch (error) {
        console.error(`Error finding role ${roleName} in ${projectKeyOrId}:`, error);
        throw error;
    }
};

export const addActorToProjectRole = async (projectKeyOrId: string, roleId: number, actor: { user?: string[], group?: string[] }) => {
    try {
        const { jira } = await getJiraClients();
        const result = await jira.projectRoleActors.addActorUsers({
            projectIdOrKey: projectKeyOrId,
            id: roleId,
            user: actor.user,
            group: actor.group
        });
        return result;
    } catch (error) {
        console.error(`Error adding actor to role ${roleId} in ${projectKeyOrId}:`, error);
        throw error;
    }
};

export const removeActorFromProjectRole = async (projectKeyOrId: string, roleId: number, actor: { user?: string, group?: string }) => {
    try {
        const { jira } = await getJiraClients();
        if (actor.user) {
            await jira.projectRoleActors.deleteActor({
                projectIdOrKey: projectKeyOrId,
                id: roleId,
                user: actor.user
            });
        }
        if (actor.group) {
            await jira.projectRoleActors.deleteActor({
                projectIdOrKey: projectKeyOrId,
                id: roleId,
                group: actor.group
            });
        }
        return { success: true };
    } catch (error) {
        console.error(`Error removing actor from role ${roleId} in ${projectKeyOrId}:`, error);
        throw error;
    }
};

export const getUsers = async () => {
    try {
        const { jira } = await getJiraClients();
        const users = await jira.users.getAllUsers({ maxResults: 1000 });
        console.log(`Fetched ${users.length} users`);
        return users;
    } catch (error) {
        const status = (error as any)?.response?.status;
        const dataMessage = (error as any)?.response?.data?.errorMessages?.join('; ');
        const responseMessage = (error as any)?.response?.data;
        const message = dataMessage || responseMessage || (error as any)?.message || 'unknown error';
        if (status === 403) {
            console.warn('[Jira] Missing "Browse users and groups" permission. Returning empty users list.');
            return [];
        }
        console.error(`[Jira] Users request failed (${status ?? 'unknown'}): ${message}`);
        throw new Error(message);
    }
};

export const getAssignableUsers = async (projectKeyOrId: string, query?: string) => {
    try {
        const { jira } = await getJiraClients();
        const response = await jira.sendRequestFullResponse({
            url: '/rest/api/3/user/assignable/search',
            method: 'GET',
            headers: {
                Accept: 'application/json'
            },
            params: {
                project: projectKeyOrId,
                maxResults: 1000,
                ...(query ? { query } : {})
            }
        });
        return response.data;
    } catch (error) {
        const status = (error as any)?.response?.status;
        const dataMessage = (error as any)?.response?.data?.errorMessages?.join('; ');
        const responseMessage = (error as any)?.response?.data;
        const message = dataMessage || responseMessage || (error as any)?.message || 'unknown error';
        console.error(`[Jira] Assignable users request failed (${status ?? 'unknown'}): ${message}`);
        throw new Error(message);
    }
};

export const getCurrentUser = async () => {
    try {
        const { jira } = await getJiraClients();
        const response = await jira.sendRequestFullResponse({
            url: '/rest/api/3/myself',
            method: 'GET',
            headers: {
                Accept: 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        const status = (error as any)?.response?.status;
        const dataMessage = (error as any)?.response?.data?.errorMessages?.join('; ');
        const responseMessage = (error as any)?.response?.data;
        const message = dataMessage || responseMessage || (error as any)?.message || 'unknown error';
        console.error(`[Jira] Current user request failed (${status ?? 'unknown'}): ${message}`);
        throw error;
    }
};

export const updateProjectLead = async (projectKeyOrId: string, leadAccountId: string) => {
    try {
        const { jira } = await getJiraClients();
        const result = await jira.projects.updateProject({
            projectIdOrKey: projectKeyOrId,
            leadAccountId: leadAccountId,
            notifyUsers: false
        } as any);
        return result;
    } catch (error) {
        console.error(`Error updating project lead for ${projectKeyOrId}:`, error);
        throw error;
    }
};

export const getGroupMembers = async (groupName: string) => {
    try {
        const { jira } = await getJiraClients();
        const result = await jira.groups.getUsersFromGroup({ groupname: groupName });
        return (result as any).values || result || [];
    } catch (error) {
        console.error(`Error fetching members for group ${groupName}:`, error);
        return [];
    }
};

export const bulkClearSecurityLevels = async (projectKey: string, issueIdsOrKeys?: string[]) => {
    let totalCleared = 0;
    let totalFound = 0;
    const errors: string[] = [];
    let startAt = 0;
    const maxResults = 50;
    const { jira } = await getJiraClients();
    const allIssueIdsOrKeys: string[] = [];

    console.log(`[BulkClear] Starting security level removal for project ${projectKey}...`);

    const waitForBulkTask = async (taskId: string) => {
        const maxAttempts = 60;
        const delayMs = 2000;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const progress = await jira.issueBulkOperations.getBulkOperationProgress({ taskId });
            const status = progress?.status;

            if (status && ['COMPLETE', 'FAILED', 'CANCELLED', 'DEAD'].includes(status)) {
                return progress;
            }

            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        return { taskId, status: 'TIMEOUT' } as any;
    };

    const resolveSecurityFieldConfig = async (issueIdOrKey: string) => {
        try {
            const fieldsResponse = await jira.issueBulkOperations.getBulkEditableFields({
                issueIdsOrKeys: issueIdOrKey,
            });
            const fields = fieldsResponse.fields || [];
            const securityField =
                fields.find((field: { id?: string; name?: string; type?: string }) => field.id === 'security') ||
                fields.find((field: { id?: string; name?: string; type?: string }) => field.type === 'security') ||
                fields.find((field: { id?: string; name?: string; type?: string }) => /security/i.test(field.name || ''));

            const fieldId = securityField?.id || 'security';
            const fieldOptions = (securityField as any)?.fieldOptions as Array<{ id?: string | number; name?: string }> | undefined;
            const clearOption = fieldOptions?.find((option) =>
                /remove|none|no security|unrestricted|clear/i.test(option.name || '')
            );

            return {
                fieldId,
                clearOptionId: clearOption?.id,
                isSupported: Boolean(securityField),
            };
        } catch (error) {
            console.warn('[BulkClear] Failed to resolve security field config, fallback to "security".');
            return {
                fieldId: 'security',
                isSupported: false,
            };
        }
    };

    let securityFieldId: string | null = null;
    let securityClearOptionId: number | undefined;
    let securityBulkSupported: boolean | null = null;
    let pendingIssueIds: string[] = [];

    const submitBulkClear = async (issueIds: string[], useEmptyOption: boolean) => {
        const fieldId = securityFieldId || 'security';
        if (securityClearOptionId !== undefined) {
            return jira.issueBulkOperations.submitBulkEdit({
                selectedIssueIdsOrKeys: issueIds,
                selectedActions: [fieldId],
                editedFieldsInput: {
                    singleSelectFields: [
                        {
                            fieldId,
                            option: { optionId: securityClearOptionId },
                        },
                    ],
                },
                sendBulkNotification: false,
            });
        }

        return jira.issueBulkOperations.submitBulkEdit({
            selectedIssueIdsOrKeys: issueIds,
            selectedActions: [fieldId],
            editedFieldsInput: {
                singleSelectFields: [
                    {
                        fieldId,
                        option: useEmptyOption ? {} : { optionId: -1 },
                    },
                ],
            },
            sendBulkNotification: false,
        });
    };

    const flushBulkBatch = async () => {
        if (pendingIssueIds.length === 0) return;

        if (securityBulkSupported === false) {
            for (const issueIdOrKey of pendingIssueIds) {
                try {
                    await jira.issues.editIssue({
                        issueIdOrKey,
                        fields: { security: null as any },
                    });
                    totalCleared++;
                } catch (e: any) {
                    const msg = e.response?.data?.errorMessages?.[0] || e.message || 'unknown error';
                    errors.push(`Failed to clear ${issueIdOrKey}: ${msg}`);
                }
            }
            pendingIssueIds = [];
            return;
        }

        let taskId: string | undefined;

        try {
            const submitted = await submitBulkClear(pendingIssueIds, false);
            taskId = submitted?.taskId;
        } catch (e: any) {
            const status = e.response?.status;
            const responseData = e.response?.data;
            const msg =
                responseData?.errorMessages?.[0] ||
                e.data?.errorMessages?.[0] ||
                e.message ||
                'unknown error';
            if (status === 400 || /optionId|-1|option/i.test(msg)) {
                try {
                    const submitted = await submitBulkClear(pendingIssueIds, true);
                    taskId = submitted?.taskId;
                } catch (retryError: any) {
                    const retryStatus = retryError.response?.status;
                    const retryResponseData = retryError.response?.data;
                    const retryMsg =
                        retryResponseData?.errorMessages?.[0] ||
                        retryError.data?.errorMessages?.[0] ||
                        retryError.message ||
                        'unknown error';
                    errors.push(`Bulk edit request failed: ${retryMsg}`);
                    pendingIssueIds = [];
                    return;
                }
            } else {
                errors.push(`Bulk edit request failed: ${msg}`);
                pendingIssueIds = [];
                return;
            }
        }

        if (!taskId) {
            errors.push('Bulk edit request did not return a taskId.');
            pendingIssueIds = [];
            return;
        }

        const progress = await waitForBulkTask(taskId);
        const status = progress?.status;

        if (status === 'COMPLETE') {
            totalCleared += progress.processedAccessibleIssues?.length || 0;
            if (progress.failedAccessibleIssues) {
                errors.push(`Bulk edit failures: ${JSON.stringify(progress.failedAccessibleIssues)}`);
            }
            if (progress.invalidOrInaccessibleIssueCount) {
                errors.push(
                    `Invalid or inaccessible issues: ${progress.invalidOrInaccessibleIssueCount}`
                );
            }
        } else {
            errors.push(`Bulk edit task ${taskId} ended with status ${status || 'unknown'}.`);
        }

        pendingIssueIds = [];
    };

    if (issueIdsOrKeys && issueIdsOrKeys.length > 0) {
        totalFound = issueIdsOrKeys.length;
        if (!securityFieldId) {
            const config = await resolveSecurityFieldConfig(issueIdsOrKeys[0]);
            securityFieldId = config.fieldId;
            if (config.clearOptionId !== undefined) {
                const parsed = Number(config.clearOptionId);
                securityClearOptionId = Number.isFinite(parsed) ? parsed : undefined;
            }
            securityBulkSupported = config.isSupported;
        }
        for (let i = 0; i < issueIdsOrKeys.length; i += 1000) {
            pendingIssueIds = issueIdsOrKeys.slice(i, i + 1000);
            allIssueIdsOrKeys.push(...pendingIssueIds);
            await flushBulkBatch();
        }
        return {
            total: totalFound,
            cleared: totalCleared,
            errors: errors,
            issues: allIssueIdsOrKeys
        };
    }

    let nextPageToken: string | undefined;

    while (true) {
        let data: any;

        try {
            const response = await jira.sendRequestFullResponse({
                url: '/rest/api/3/search/jql',
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
                params: {
                    jql: `project = "${projectKey}" AND level is not EMPTY`,
                    maxResults,
                    fields: 'id,key',
                    nextPageToken,
                },
            });
            data = response.data;
        } catch (e: any) {
            const msg = e.response?.data?.errorMessages?.[0] || e.data?.errorMessages?.[0] || e.message || 'unknown error';
            console.error(`[BulkClear] Search error:`, msg);
            throw new Error(`Failed to search issues: ${msg}`);
        }

        const currentBatch = data.issues || [];
        if (currentBatch.length === 0) break;

        totalFound += currentBatch.length;

        if (!securityFieldId && currentBatch[0]?.key) {
            const config = await resolveSecurityFieldConfig(currentBatch[0].key);
            securityFieldId = config.fieldId;
            if (config.clearOptionId !== undefined) {
                const parsed = Number(config.clearOptionId);
                securityClearOptionId = Number.isFinite(parsed) ? parsed : undefined;
            }
            securityBulkSupported = config.isSupported;
        }

        pendingIssueIds.push(...currentBatch.map((issue: any) => issue.key || issue.id));
        allIssueIdsOrKeys.push(...currentBatch.map((issue: any) => issue.key || issue.id));
        if (pendingIssueIds.length >= 1000) {
            await flushBulkBatch();
        }

        if (data.isLast) break;
        nextPageToken = data.nextPageToken;
        if (!nextPageToken) break;
    }

    await flushBulkBatch();

    return {
        total: totalFound,
        cleared: totalCleared,
        errors: errors,
        issues: allIssueIdsOrKeys
    };
};

export const verifySecurityCleared = async (issueIdsOrKeys: string[]) => {
    const { jira } = await getJiraClients();
    const remaining: string[] = [];

    for (const issueIdOrKey of issueIdsOrKeys) {
        try {
            const issue = await jira.issues.getIssue({
                issueIdOrKey,
                fields: ['security'],
            });
            const security = (issue as any)?.fields?.security;
            if (security) {
                remaining.push(issueIdOrKey);
            }
        } catch (e: any) {
            const msg = e.response?.data?.errorMessages?.[0] || e.message || 'unknown error';
            remaining.push(`${issueIdOrKey} (check failed: ${msg})`);
        }
    }

    return remaining;
};

export const hasSecurityLevels = async (projectKey: string) => {
    const { jira } = await getJiraClients();
    try {
        const response = await jira.sendRequestFullResponse({
            url: '/rest/api/3/search/jql',
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            params: {
                jql: `project = "${projectKey}" AND level is not EMPTY`,
                maxResults: 1,
                fields: 'id',
            },
        });
        const data = (response.data || {}) as { issues?: unknown[] };
        return Array.isArray(data.issues) && data.issues.length > 0;
    } catch (e: any) {
        const msg = e.response?.data?.errorMessages?.[0] || e.data?.errorMessages?.[0] || e.message || 'unknown error';
        throw new Error(`Failed to validate security levels: ${msg}`);
    }
};

export const bulkSetSecurityLevel = async (
    projectKey: string,
    levelName: string,
    issueIdsOrKeys?: string[]
) => {
    let totalUpdated = 0;
    let totalFound = 0;
    const errors: string[] = [];
    const maxResults = 50;
    const { jira } = await getJiraClients();

    const resolveSecurityLevelId = async () => {
        try {
            const schemeInfo = await jira.projectPermissionSchemes.getProjectIssueSecurityScheme({
                projectKeyOrId: projectKey,
            });
            const schemeId = (schemeInfo as any)?.id;
            if (!schemeId) return undefined;

            const scheme = await jira.issueSecuritySchemes.getIssueSecurityScheme({ id: schemeId });
            const levels = (scheme as any)?.levels || [];
            const matched = levels.find(
                (level: { name?: string }) => (level.name || '').toLowerCase() === levelName.toLowerCase()
            );
            return matched?.id;
        } catch (_e) {
            return undefined;
        }
    };

    const resolveSecurityFieldConfig = async (issueIdOrKey: string) => {
        try {
            const fieldsResponse = await jira.issueBulkOperations.getBulkEditableFields({
                issueIdsOrKeys: issueIdOrKey,
            });
            const fields = fieldsResponse.fields || [];
            const securityField =
                fields.find((field: { id?: string; name?: string; type?: string }) => field.id === 'security') ||
                fields.find((field: { id?: string; name?: string; type?: string }) => field.type === 'security') ||
                fields.find((field: { id?: string; name?: string; type?: string }) => /security/i.test(field.name || ''));

            const fieldId = securityField?.id || 'security';
            const fieldOptions = (securityField as any)?.fieldOptions as Array<{ id?: string | number; name?: string }> | undefined;
            const targetOption = fieldOptions?.find(
                (option) => (option.name || '').toLowerCase() === levelName.toLowerCase()
            );
            const schemeLevelId = await resolveSecurityLevelId();

            return {
                fieldId,
                optionId: targetOption?.id ?? schemeLevelId,
                isSupported: Boolean(securityField),
            };
        } catch (error) {
            const schemeLevelId = await resolveSecurityLevelId();
            return {
                fieldId: 'security',
                optionId: schemeLevelId,
                isSupported: false,
            };
        }
    };

    let securityFieldId: string | null = null;
    let securityOptionId: number | undefined;
    let securityBulkSupported: boolean | null = null;
    let pendingIssueIds: string[] = [];

    const submitBulkSet = async (issueIds: string[]) => {
        const fieldId = securityFieldId || 'security';

        if (securityOptionId === undefined) {
            throw new Error(`Security level "${levelName}" not found in bulk options.`);
        }

        return jira.issueBulkOperations.submitBulkEdit({
            selectedIssueIdsOrKeys: issueIds,
            selectedActions: [fieldId],
            editedFieldsInput: {
                singleSelectFields: [
                    {
                        fieldId,
                        option: { optionId: securityOptionId },
                    },
                ],
            },
            sendBulkNotification: false,
        });
    };

    const flushBulkBatch = async () => {
        if (pendingIssueIds.length === 0) return;

        if (securityBulkSupported === false) {
            for (const issueIdOrKey of pendingIssueIds) {
                try {
                    if (securityOptionId === undefined) {
                        throw new Error(`Security level "${levelName}" not found in bulk options.`);
                    }
                    await jira.issues.editIssue({
                        issueIdOrKey,
                        fields: { security: { id: String(securityOptionId) } as any },
                    });
                    totalUpdated++;
                } catch (e: any) {
                    const msg = e.response?.data?.errorMessages?.[0] || e.message || 'unknown error';
                    errors.push(`Failed to set ${issueIdOrKey}: ${msg}`);
                }
            }
            pendingIssueIds = [];
            return;
        }

        let taskId: string | undefined;

        try {
            const submitted = await submitBulkSet(pendingIssueIds);
            taskId = submitted?.taskId;
        } catch (e: any) {
            const status = e.response?.status;
            const responseData = e.response?.data;
            const msg =
                responseData?.errorMessages?.[0] ||
                e.data?.errorMessages?.[0] ||
                e.message ||
                'unknown error';

            if (status === 400 && /unsupported fields/i.test(JSON.stringify(responseData || msg))) {
                securityBulkSupported = false;
                return flushBulkBatch();
            }

            errors.push(`Bulk edit request failed: ${msg}`);
            pendingIssueIds = [];
            return;
        }

        if (!taskId) {
            errors.push('Bulk edit request did not return a taskId.');
            pendingIssueIds = [];
            return;
        }

        const progress = await jira.issueBulkOperations.getBulkOperationProgress({ taskId });
        const status = progress?.status;

        if (status === 'COMPLETE') {
            totalUpdated += progress.processedAccessibleIssues?.length || 0;
            if (progress.failedAccessibleIssues) {
                errors.push(`Bulk edit failures: ${JSON.stringify(progress.failedAccessibleIssues)}`);
            }
            if (progress.invalidOrInaccessibleIssueCount) {
                errors.push(`Invalid or inaccessible issues: ${progress.invalidOrInaccessibleIssueCount}`);
            }
        } else {
            errors.push(`Bulk edit task ${taskId} ended with status ${status || 'unknown'}.`);
        }

        pendingIssueIds = [];
    };

    if (issueIdsOrKeys && issueIdsOrKeys.length > 0) {
        totalFound = issueIdsOrKeys.length;
        if (!securityFieldId) {
            const config = await resolveSecurityFieldConfig(issueIdsOrKeys[0]);
            securityFieldId = config.fieldId;
            if (config.optionId !== undefined) {
                const parsed = Number(config.optionId);
                securityOptionId = Number.isFinite(parsed) ? parsed : undefined;
            }
            securityBulkSupported = config.isSupported;
        }
        for (let i = 0; i < issueIdsOrKeys.length; i += 1000) {
            pendingIssueIds = issueIdsOrKeys.slice(i, i + 1000);
            await flushBulkBatch();
        }
        return {
            total: totalFound,
            updated: totalUpdated,
            errors: errors
        };
    }

    let nextPageToken: string | undefined;

    while (true) {
        let data: any;

        try {
            const response = await jira.sendRequestFullResponse({
                url: '/rest/api/3/search/jql',
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
                params: {
                    jql: `project = "${projectKey}"`,
                    maxResults,
                    fields: 'id,key',
                    nextPageToken,
                },
            });
            data = response.data;
        } catch (e: any) {
            const msg = e.response?.data?.errorMessages?.[0] || e.data?.errorMessages?.[0] || e.message || 'unknown error';
            throw new Error(`Failed to search issues: ${msg}`);
        }

        const currentBatch = data.issues || [];
        if (currentBatch.length === 0) break;

        totalFound += currentBatch.length;

        if (!securityFieldId && currentBatch[0]?.key) {
            const config = await resolveSecurityFieldConfig(currentBatch[0].key);
            securityFieldId = config.fieldId;
            if (config.optionId !== undefined) {
                const parsed = Number(config.optionId);
                securityOptionId = Number.isFinite(parsed) ? parsed : undefined;
            }
            securityBulkSupported = config.isSupported;
        }

        pendingIssueIds.push(...currentBatch.map((issue: any) => issue.key || issue.id));
        if (pendingIssueIds.length >= 1000) {
            await flushBulkBatch();
        }

        if (data.isLast) break;
        nextPageToken = data.nextPageToken;
        if (!nextPageToken) break;
    }

    await flushBulkBatch();

    return {
        total: totalFound,
        updated: totalUpdated,
        errors: errors
    };
};

// --- People Audit & Normalize ---

export type RoleKey = 'ADMINISTRATORS' | 'EXECUTOR' | 'SERVICE_DESK' | 'USER' | 'WATCHERS';

export interface AuditUser {
    accountId: string;
    displayName: string;
    emailAddress: string;
    avatarUrl: string;
    active: boolean;
    groups: string[]; // List of project-related groups this user is in
    roles: RoleKey[]; // Calculated roles based on groups
}

const ROLE_PRIORITY: RoleKey[] = [
    'ADMINISTRATORS',
    'EXECUTOR',
    'SERVICE_DESK',
    'USER',
    'WATCHERS'
];

const getProjectGroupName = (projectKey: string, role: RoleKey): string => {
    // Canonical group mapping
    switch (role) {
        case 'ADMINISTRATORS': return `${projectKey}group_admin`;
        case 'EXECUTOR': return `${projectKey}group_executor`;
        case 'SERVICE_DESK': return `${projectKey}group`; // Note: "Service Desk Team" -> "group"
        case 'USER': return `${projectKey}group_user`;
        case 'WATCHERS': return `${projectKey}group_watchers`;
    }
};

const getRoleFromGroupName = (projectKey: string, groupName: string): RoleKey | null => {
    if (groupName === `${projectKey}group_admin`) return 'ADMINISTRATORS';
    if (groupName === `${projectKey}group_executor`) return 'EXECUTOR';
    if (groupName === `${projectKey}group`) return 'SERVICE_DESK';
    if (groupName === `${projectKey}group_user`) return 'USER';
    if (groupName === `${projectKey}group_watchers`) return 'WATCHERS';
    return null;
};

export const getProjectAudit = async (projectKey: string): Promise<AuditUser[]> => {
    const roles: RoleKey[] = ['ADMINISTRATORS', 'EXECUTOR', 'SERVICE_DESK', 'USER', 'WATCHERS'];
    const userMap = new Map<string, AuditUser>();

    // Fetch members of all canonical groups
    for (const role of roles) {
        const groupName = getProjectGroupName(projectKey, role);
        const members = await getGroupMembers(groupName);

        for (const member of members) {
            if (!member.accountId) continue;

            let user = userMap.get(member.accountId);
            if (!user) {
                user = {
                    accountId: member.accountId,
                    displayName: member.displayName || 'Unknown',
                    emailAddress: member.emailAddress || '',
                    avatarUrl: member.avatarUrls?.['48x48'] || '',
                    active: member.active !== false,
                    groups: [],
                    roles: []
                };
                userMap.set(member.accountId, user);
            }

            if (!user.groups.includes(groupName)) {
                user.groups.push(groupName);
            }
            if (!user.roles.includes(role)) {
                user.roles.push(role);
            }
        }
    }

    // Sort users by name for consistent display
    return Array.from(userMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
};

export const normalizeProjectRoles = async (projectKey: string) => {
    const auditUsers = await getProjectAudit(projectKey);
    const changes: any[] = [];
    let processed = 0;

    for (const user of auditUsers) {
        processed++;
        if (user.roles.length <= 1 && user.roles[0] !== 'WATCHERS') {
            // If user has 0 or 1 role and it's not JUST watchers (unless watchers is their only role, which is fine)
            // Actually, "Watchers always removed if there is any other role".
            // If user has ONLY Watchers, that's allowed.
            continue;
        }

        // Determine highest priority role
        let highestRole: RoleKey | null = null;
        for (const pRole of ROLE_PRIORITY) {
            if (user.roles.includes(pRole)) {
                highestRole = pRole;
                break;
            }
        }

        if (!highestRole) continue; // Should not happen if roles.length > 0

        // Identification of roles to remove
        // Logic: Keep highestRole. Remove all others.
        // Special Watcher Logic: "Watchers always removed, if there is any other role". 
        // Our priority list handles this naturally: Watchers is lowest.
        // If highest is Watchers, it means they have NO other roles. So we keep Watchers.
        // If highest is e.g. Admin, we keep Admin and remove everything else including Watchers.

        const keptGroup = getProjectGroupName(projectKey, highestRole);
        const groupsToRemove = user.groups.filter(g => g !== keptGroup);

        if (groupsToRemove.length > 0) {
            console.log(`[Normalize] User ${user.displayName} (${user.emailAddress}): Keeping ${highestRole}, removing ${groupsToRemove.join(', ')}`);

            for (const group of groupsToRemove) {
                try {
                    await removeUserFromGroup(user.accountId, group);
                } catch (e) {
                    console.error(`Failed to remove user ${user.accountId} from ${group}`, e);
                }
            }

            changes.push({
                accountId: user.accountId,
                displayName: user.displayName,
                keptRole: highestRole,
                removedGroups: groupsToRemove
            });
        }
    }

    return {
        processed,
        changed: changes.length,
        details: changes
    };
};

export const addUserToProjectRole = async (projectKey: string, role: RoleKey, accountId: string) => {
    const groupName = getProjectGroupName(projectKey, role);
    return addUserToGroup(accountId, groupName);
};

export const removeUserFromProjectRole = async (projectKey: string, role: RoleKey, accountId: string) => {
    const groupName = getProjectGroupName(projectKey, role);
    return removeUserFromGroup(accountId, groupName);
};

export const getProjectConfigSchemes = async (projectKey: string) => {
    try {
        const { jira } = await getJiraClients();
        console.log(`[ConfigSchemes] Fetching config for ${projectKey}...`);

        // 1. Get Project Basics (ID, Permission Scheme ID, Security Scheme ID)
        const projectResponse = await jira.projects.getProject({
            projectIdOrKey: projectKey,
            expand: ['permissionScheme', 'issueSecurityScheme']
        });
        const project = projectResponse as any;

        const projectId = Number(project.id);

        let permissionSchemeId = project.permissionScheme ? Number(project.permissionScheme.id) : null;
        let securitySchemeId = project.issueSecurityScheme ? Number(project.issueSecurityScheme.id) : null;

        // Fallbacks if schemes are missing in project object
        if (!permissionSchemeId) {
            try {
                const permScheme = await jira.projectPermissionSchemes.getAssignedPermissionScheme({ projectKeyOrId: projectKey });
                if (permScheme && permScheme.id) permissionSchemeId = Number(permScheme.id);
            } catch (e) {
                console.warn(`[ConfigSchemes] Failed to fallback fetch permission scheme for ${projectKey}`, e);
            }
        }

        if (!securitySchemeId) {
            try {
                const secScheme = await jira.projectPermissionSchemes.getProjectIssueSecurityScheme({ projectKeyOrId: projectKey });
                if (secScheme && secScheme.id) securitySchemeId = Number(secScheme.id);
            } catch (e) {
                console.warn(`[ConfigSchemes] Failed to fallback fetch security scheme for ${projectKey}`, e);
            }
        }

        // 2. Fetch all schemes in parallel -> Updated to fetch .Blank for comparison
        const [
            permissionSchemeData,
            securitySchemeData,
            issueTypeSchemeData,
            screenSchemeData,
            fieldConfigSchemeData,
            blankSchemeData
        ] = await Promise.all([
            // Permission Scheme
            permissionSchemeId
                ? jira.permissionSchemes.getPermissionScheme({ schemeId: permissionSchemeId })
                    .catch(e => { console.warn('Failed to fetch permission scheme', e); return null; })
                : Promise.resolve(null),

            // Security Scheme
            securitySchemeId
                ? jira.issueSecuritySchemes.getIssueSecurityScheme({ id: securitySchemeId })
                    .catch(e => { console.warn('Failed to fetch security scheme', e); return null; })
                : Promise.resolve(null),

            // Issue Type Scheme
            jira.issueTypeSchemes.getIssueTypeSchemeForProjects({ projectId: [projectId] })
                .then(res => (res.values && res.values.length > 0) ? res.values[0] : null)
                .catch(e => { console.warn('Failed to fetch issue type scheme', e); return null; }),

            // Screen Scheme
            jira.sendRequestFullResponse({
                url: '/rest/api/3/issuetypescreenscheme/project',
                method: 'GET',
                params: { projectId: projectId }
            }).then(res => (res.data as any).values?.[0] || null)
                .catch(e => { console.warn('Failed to fetch screen scheme', e); return null; }),

            // Field Configuration Scheme
            jira.sendRequestFullResponse({
                url: '/rest/api/3/fieldconfigurationscheme/project',
                method: 'GET',
                params: { projectId: projectId }
            }).then(res => (res.data as any).values?.[0] || null)
                .catch(e => { console.warn('Failed to fetch field config scheme', e); return null; }),

            // .Blank Scheme (Reference)
            jira.permissionSchemes.getAllPermissionSchemes()
                .then(res => res.permissionSchemes?.find(s => s.name === '.Blank') || null)
                .then(async (blank) => {
                    if (blank?.id) {
                        return jira.permissionSchemes.getPermissionScheme({ schemeId: blank.id });
                    }
                    return null;
                })
                .catch(e => { console.warn('Failed to fetch .Blank scheme', e); return null; })
        ]);

        // Compliance Check Logic
        let isStandard = true;
        let diffCount = 0;

        if (permissionSchemeData && blankSchemeData && blankSchemeData.permissions) {
            const currentPerms = new Set(permissionSchemeData.permissions?.map(p =>
                `${p.permission}:${p.holder?.type}:${p.holder?.parameter || ''}`
            ) || []);
            const blankPerms = new Set(blankSchemeData.permissions?.map(p =>
                `${p.permission}:${p.holder?.type}:${p.holder?.parameter || ''}`
            ) || []);

            let diffs = 0;
            // Check missing in current
            for (const p of blankPerms) {
                if (!currentPerms.has(p)) diffs++;
            }
            // Check extra in current (strict equality)
            for (const p of currentPerms) {
                if (!blankPerms.has(p)) diffs++;
            }

            if (diffs > 0) {
                isStandard = false;
                diffCount = diffs;
            }
        } else if (!permissionSchemeData) {
            isStandard = false; // Missing scheme is non-standard
        }

        return {
            project: {
                key: projectKey,
                name: project.name
            },
            permissions: {
                permissionScheme: permissionSchemeData,
                securityScheme: securitySchemeData,
                isStandard,
                diffCount
            },
            types: {
                issueTypeScheme: issueTypeSchemeData
            },
            screens: {
                screenScheme: screenSchemeData
            },
            fields: {
                fieldConfigScheme: fieldConfigSchemeData
            }
        };

    } catch (error: any) {
        console.error(`Error fetching config schemes for ${projectKey}:`, error);
        throw error;
    }
};

export const getPermissionSchemeDiff = async (projectKey: string) => {
    try {
        const { jira } = await getJiraClients();
        console.log(`[PermDiff] Calculating permission diff for ${projectKey}...`);

        // 1. Get Project & Current Scheme ID
        const projectResponse = await jira.projects.getProject({
            projectIdOrKey: projectKey,
            expand: ['permissionScheme']
        });
        const project = projectResponse as any;
        let permissionSchemeId = project.permissionScheme ? Number(project.permissionScheme.id) : null;

        if (!permissionSchemeId) {
            try {
                const permScheme = await jira.projectPermissionSchemes.getAssignedPermissionScheme({ projectKeyOrId: projectKey });
                if (permScheme && permScheme.id) permissionSchemeId = Number(permScheme.id);
            } catch (e) { }
        }

        // 2. Fetch Data in Parallel
        const [currentScheme, blankScheme, allPermissionsRes, projectRolesRes, fieldsRes] = await Promise.all([
            permissionSchemeId
                ? jira.permissionSchemes.getPermissionScheme({ schemeId: permissionSchemeId })
                : Promise.resolve(null),
            jira.permissionSchemes.getAllPermissionSchemes()
                .then(res => res.permissionSchemes?.find(s => s.name === '.Blank') || null)
                .then(async (blank) => {
                    if (blank?.id) return jira.permissionSchemes.getPermissionScheme({ schemeId: blank.id });
                    return null;
                }),
            jira.permissions.getAllPermissions(),
            jira.projectRoles.getProjectRoles({ projectIdOrKey: projectKey })
                .catch(e => { console.warn('Failed to fetch project roles', e); return {}; }),
            jira.issueFields.getFields()
                .catch(e => { console.warn('Failed to fetch fields', e); return []; })
        ]);

        const allPermissions = Object.values((allPermissionsRes as any).permissions || {}) as any[];

        // Build Maps
        const roleMap = new Map<string, string>();
        if (projectRolesRes) {
            Object.entries(projectRolesRes).forEach(([name, url]) => {
                // url format: .../role/10002
                const id = String(url).split('/').pop();
                if (id) roleMap.set(id, name);
            });
        }

        const fieldMap = new Map<string, string>();
        if (Array.isArray(fieldsRes)) {
            fieldsRes.forEach((f: any) => {
                if (f.id && f.name) fieldMap.set(f.id, f.name);
            });
        }

        // 3. Process Permissions
        // Group permissions by category (optional, but good for UI if needed, flat for now)
        // Map: Permission Key -> { name, description, currentGrants[], blankGrants[], isDifferent }

        const diffResult: any[] = [];

        // Helper to format grant info
        const formatGrant = (g: any) => {
            if (!g || !g.holder) return { type: 'unknown', parameter: '', display: 'Unknown' };
            const type = g.holder.type;
            const param = g.holder.parameter || g.holder.value || ''; // specific user/group/role ID or name

            // Map types to readable text if possible
            let displayType = type;
            let displayParam = param;

            if (type === 'projectRole') {
                displayType = 'Project Role';
                if (roleMap.has(param)) {
                    displayParam = roleMap.get(param);
                } else if (roleMap.has(String(g.holder.value))) {
                    // Fallback to value if parameter is missing or different
                    displayParam = roleMap.get(String(g.holder.value));
                }
            }
            if (type === 'group') displayType = 'Group';
            if (type === 'user') displayType = 'User';
            if (type === 'userCustomField') {
                displayType = 'User Custom Field';
                if (fieldMap.has(param)) {
                    displayParam = fieldMap.get(param);
                }
            }
            if (type === 'applicationRole') displayType = 'Application Access';
            if (type === 'reporter') displayType = 'Reporter';
            if (type === 'assignee') displayType = 'Current assignee';
            if (type === 'lead') displayType = 'Project lead';

            return {
                type,
                parameter: param,
                display: displayParam ? `${displayType} (${displayParam})` : displayType
            };
        };

        const sortGrants = (a: any, b: any) => a.display.localeCompare(b.display);


        const getPermissionCategory = (permissionKey: string): string => {
            const categories: Record<string, string[]> = {
                'Project Permissions': ['BROWSE_PROJECTS', 'VIEW_DEV_TOOLS', 'VIEW_READONLY_WORKFLOW'],
                'Issue Permissions': [
                    'CREATE_ISSUES', 'EDIT_ISSUES', 'ASSIGN_ISSUES', 'RESOLVE_ISSUES',
                    'TRANSITION_ISSUES', 'DELETE_ISSUES', 'CLOSE_ISSUES', 'MOVE_ISSUES',
                    'LINK_ISSUES', 'MODIFY_REPORTER', 'SCHEDULE_ISSUES',
                    'SET_ISSUE_SECURITY', 'ASSIGNABLE_USER'
                ],
                'Voters & Watchers Permissions': ['MANAGE_WATCHERS', 'VIEW_VOTERS_AND_WATCHERS'],
                'Comments Permissions': [
                    'ADD_COMMENTS', 'EDIT_ALL_COMMENTS', 'EDIT_OWN_COMMENTS',
                    'DELETE_ALL_COMMENTS', 'DELETE_OWN_COMMENTS'
                ],
                'Attachments Permissions': [
                    'CREATE_ATTACHMENTS', 'DELETE_ALL_ATTACHMENTS', 'DELETE_OWN_ATTACHMENTS'
                ],
                'Time Tracking Permissions': [
                    'WORK_ON_ISSUES', 'EDIT_OWN_WORKLOGS', 'EDIT_ALL_WORKLOGS',
                    'DELETE_OWN_WORKLOGS', 'DELETE_ALL_WORKLOGS'
                ],
                'Administration Permissions': [
                    'ADMINISTER_PROJECTS', 'EDIT_WORKFLOW', 'EDIT_ISSUE_LAYOUT'
                ]
            };

            for (const [category, keys] of Object.entries(categories)) {
                if (keys.includes(permissionKey)) return category;
            }
            return 'Other Permissions';
        };

        for (const p of allPermissions) {
            const key = p.key;

            // Find grants in Current Scheme
            const currentGrantsRaw = currentScheme?.permissions?.filter(g => g.permission === key) || [];
            const currentGrants = currentGrantsRaw.map(formatGrant).sort(sortGrants);

            // Find grants in Blank Scheme
            const blankGrantsRaw = blankScheme?.permissions?.filter(g => g.permission === key) || [];
            const blankGrants = blankGrantsRaw.map(formatGrant).sort(sortGrants);

            // Compare
            const currentSet = new Set(currentGrants.map(g => g.display));
            const blankSet = new Set(blankGrants.map(g => g.display));

            let isDifferent = false;
            // Check if arrays are different
            if (currentGrants.length !== blankGrants.length) {
                isDifferent = true;
            } else {
                if (currentSet.size !== blankSet.size) {
                    isDifferent = true;
                } else {
                    for (const item of currentSet) {
                        if (!blankSet.has(item)) {
                            isDifferent = true;
                            break;
                        }
                    }
                }
            }

            diffResult.push({
                key: p.key,
                name: p.name || p.key,
                description: p.description,
                type: p.type, // PROJECT or GLOBAL usually
                category: getPermissionCategory(p.key),
                currentGrants,
                blankGrants,
                isDifferent
            });
        }

        return {
            project: {
                key: projectKey,
                name: project.name
            },
            schemeName: currentScheme?.name || 'Unknown',
            diffs: diffResult
        };

    } catch (error: any) {
        console.error(`Error calculating permission diff for ${projectKey}:`, error);
        throw error;
    }
};

export const normalizePermissionScheme = async (projectKey: string) => {
    const { jira } = await getJiraClients();
    const targetName = projectKey.toUpperCase();

    const projectResponse = await jira.projects.getProject({
        projectIdOrKey: projectKey,
        expand: ['permissionScheme']
    });
    const project = projectResponse as any;
    let schemeId = project.permissionScheme ? Number(project.permissionScheme.id) : null;
    if (!schemeId) {
        const assigned = await jira.projectPermissionSchemes.getAssignedPermissionScheme({ projectKeyOrId: projectKey });
        if (assigned?.id) schemeId = Number(assigned.id);
    }
    if (!schemeId) {
        throw new Error(`Permission scheme not found for ${projectKey}.`);
    }

    const schemes = await jira.permissionSchemes.getAllPermissionSchemes();
    const blankScheme = schemes.permissionSchemes?.find((scheme: any) => scheme.name === '.Blank');
    if (!blankScheme?.id) {
        throw new Error('Source permission scheme ".Blank" not found.');
    }
    const blankDetails = await jira.permissionSchemes.getPermissionScheme({ schemeId: blankScheme.id });
    const blankPermissions = (blankDetails as any)?.permissions || [];

    const targetScheme = schemes.permissionSchemes?.find((scheme: any) => scheme.name === targetName);
    if (targetScheme?.id && Number(targetScheme.id) !== schemeId) {
        await jira.projects.updateProject({
            projectIdOrKey: projectKey,
            permissionScheme: targetScheme.id,
            notifyUsers: false
        } as any);
        schemeId = Number(targetScheme.id);
    }

    let currentScheme = await jira.permissionSchemes.getPermissionScheme({ schemeId });
    if (currentScheme?.name !== targetName) {
        await jira.permissionSchemes.updatePermissionScheme({
            schemeId,
            name: targetName,
            description: `Normalized for ${projectKey}`
        } as any);
        currentScheme = await jira.permissionSchemes.getPermissionScheme({ schemeId });
    }

    const currentPermissions = (currentScheme as any)?.permissions || [];

    const normalizeHolder = (holder: any) => {
        if (!holder) return null;
        const type = holder.type;
        const parameter = holder.parameter ?? holder.value ?? '';
        return { type, parameter };
    };

    const signature = (permission: string, holder: any) => {
        const normalized = normalizeHolder(holder);
        if (!normalized) return null;
        return `${permission}|${normalized.type}|${normalized.parameter}`;
    };

    const currentMap = new Map<string, { id?: number; permission?: string; holder?: any }>();
    for (const grant of currentPermissions) {
        if (!grant?.permission || !grant?.holder) continue;
        const sig = signature(grant.permission, grant.holder);
        if (!sig) continue;
        currentMap.set(sig, { id: grant.id, permission: grant.permission, holder: grant.holder });
    }

    const blankSet = new Set<string>();
    for (const grant of blankPermissions) {
        if (!grant?.permission || !grant?.holder) continue;
        const sig = signature(grant.permission, grant.holder);
        if (!sig) continue;
        blankSet.add(sig);
    }

    const toAdd: Array<{ permission: string; holder: any }> = [];
    blankSet.forEach((sig) => {
        if (!currentMap.has(sig)) {
            const [permission, type, parameter] = sig.split('|');
            const holder: any = { type };
            if (parameter) holder.parameter = parameter;
            toAdd.push({ permission, holder });
        }
    });

    const toRemove: Array<{ id: number }> = [];
    currentMap.forEach((value, sig) => {
        if (!blankSet.has(sig) && value.id) {
            toRemove.push({ id: value.id });
        }
    });

    for (const remove of toRemove) {
        await jira.permissionSchemes.deletePermissionSchemeEntity({
            schemeId,
            permissionId: remove.id
        });
    }

    for (const add of toAdd) {
        await jira.permissionSchemes.createPermissionGrant({
            schemeId,
            permission: add.permission,
            holder: add.holder
        });
    }

    return {
        projectKey,
        schemeId,
        schemeName: targetName,
        added: toAdd.length,
        removed: toRemove.length
    };
};
