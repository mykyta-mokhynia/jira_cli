import { Version3Client } from 'jira.js';
import { getJiraClients, bulkClearSecurityLevels, bulkSetSecurityLevel, verifySecurityCleared } from './jira';

export interface AuditResult {
    projectKey: string;
    groups: {
        missing: string[];      // Not in Jira
        notInProject: string[]; // In Jira but not in Role
        existing: string[];     // Correctly placed
    };
    proposedMembers: {
        admin: any[];
        serviceDesk: any[];
        users: any[];
    };
    permissionScheme: {
        current: string;
        target: string;
        action: 'create-copy' | 'link-existing' | 'ok';
    };
    securityScheme: {
        current: string;
        target: string;
        action: 'create-copy' | 'link-existing' | 'ok';
    };
}

type RoleMapping = { [group: string]: string | null };
type NormalizedRole = 'ORG_ADMINS' | 'ADMINISTRATOR' | 'EXECUTOR' | 'SERVICE_DESK' | 'USER' | 'WATCHERS';

const ROLE_PRIORITY: Record<NormalizedRole, number> = {
    ORG_ADMINS: 1,
    ADMINISTRATOR: 2,
    EXECUTOR: 3,
    SERVICE_DESK: 4,
    USER: 5,
    WATCHERS: 6
};

const getJiraErrorMessage = (error: any) => {
    const messages = error?.response?.data?.errorMessages;
    if (Array.isArray(messages) && messages.length) {
        return messages.join('; ');
    }
    return error?.response?.data?.message || error?.message || 'unknown error';
};

const findRoleName = (projectRoles: Record<string, string>, candidates: string[]) => {
    const roleNames = Object.keys(projectRoles);
    const lowerNames = roleNames.map((name) => name.toLowerCase());

    for (const candidate of candidates) {
        const idx = lowerNames.findIndex((name) => name === candidate.toLowerCase());
        if (idx >= 0) return roleNames[idx];
    }

    for (const candidate of candidates) {
        const idx = lowerNames.findIndex((name) => name.includes(candidate.toLowerCase()));
        if (idx >= 0) return roleNames[idx];
    }

    return null;
};

const buildRoleMapping = (projectKey: string, projectType: 'team' | 'non-team', projectRoles: Record<string, string>) => {
    const roleCandidates = projectType === 'team' ? {
        serviceDeskTeam: ['Member', 'Members'],
        admin: ['Administrators', 'Administrator', 'Admin'],
        executor: ['Executor'],
        user: ['Member', 'Members'],
        watchers: ['Watchers', 'Viewer', 'Viewers'],
        viewer: ['Viewer', 'Viewers']
    } : {
        serviceDeskTeam: ['Service Desk Team'],
        admin: ['Administrators', 'Administrator', 'Admin'],
        executor: ['Executor'],
        user: ['User', 'Service Desk Customers', 'Customers'],
        watchers: ['Watchers', 'Viewer', 'Viewers'],
        viewer: ['Viewer', 'Viewers']
    };

    const roleNameByNormalized: Record<NormalizedRole, string | null> = {
        ORG_ADMINS: 'org-admins',
        ADMINISTRATOR: findRoleName(projectRoles, roleCandidates.admin),
        EXECUTOR: findRoleName(projectRoles, roleCandidates.executor),
        SERVICE_DESK: findRoleName(projectRoles, roleCandidates.serviceDeskTeam),
        USER: findRoleName(projectRoles, roleCandidates.user),
        WATCHERS: findRoleName(projectRoles, roleCandidates.watchers)
    };

    const groupToRoleKey: { [group: string]: keyof typeof roleCandidates } = {
        'full_access_to_tasks': 'serviceDeskTeam',
        [`${projectKey}group`]: 'serviceDeskTeam',
        [`${projectKey}group_admin`]: 'admin',
        [`${projectKey}group_executor`]: 'executor',
        [`${projectKey}group_user`]: 'user',
        [`${projectKey}group_watchers`]: 'watchers',
        'audit': 'viewer',
        'org-admins': 'admin'
    };

    const mapping: RoleMapping = {};
    const warnings: string[] = [];

    for (const [groupName, roleKey] of Object.entries(groupToRoleKey)) {
        const roleName = findRoleName(projectRoles, roleCandidates[roleKey]);
        if (!roleName && groupName !== 'org-admins') {
            warnings.push(`Role not found for ${groupName} (${roleCandidates[roleKey].join(', ')})`);
        }
        mapping[groupName] = roleName;
    }

    return { mapping, warnings, roleNameByNormalized };
};

export const auditProject = async (projectKey: string, projectType: 'team' | 'non-team'): Promise<AuditResult> => {
    const { jira } = await getJiraClients();
    // 1. Setup
    const templateGroups = [
        'full_access_to_tasks',
        `${projectKey}group`,
        `${projectKey}group_admin`,
        `${projectKey}group_executor`,
        `${projectKey}group_user`,
        `${projectKey}group_watchers`,
        'audit',
        'org-admins'
    ];

    // 2. Fetch Project Data
    const project = await jira.projects.getProject({
        projectIdOrKey: projectKey,
        expand: 'issueSecurityScheme,permissionScheme'
    }) as any;

    // Fetch roles and actors
    const projectRoles = await jira.projectRoles.getProjectRoles({ projectIdOrKey: projectKey });
    const { mapping: roleMapping, roleNameByNormalized } = buildRoleMapping(projectKey, projectType, projectRoles);
    const groupToRolesMap = new Map<string, string[]>();

    for (const [roleName, roleUrl] of Object.entries(projectRoles)) {
        try {
            const parts = (roleUrl as string).split('/');
            const roleId = parseInt(parts[parts.length - 1], 10);
            if (isNaN(roleId)) continue;

            const roleDetails = await jira.projectRoles.getProjectRole({ projectIdOrKey: projectKey, id: roleId });
            for (const actor of (roleDetails.actors || [])) {
                if (actor.type === 'atlassian-group-role-actor' && actor.name) {
                    const roles = groupToRolesMap.get(actor.name) || [];
                    roles.push(roleName);
                    groupToRolesMap.set(actor.name, roles);
                }
            }
        } catch (e) {
            console.warn(`[Audit] Failed to fetch details for role ${roleName}`);
        }
    }

    // 3. Category Groups
    const missing: string[] = [];
    const notInProject: string[] = [];
    const existing: string[] = [];

    for (const groupName of templateGroups) {
        const targetRole = roleMapping[groupName];
        const assignedRoles = groupToRolesMap.get(groupName) || [];

        if (targetRole && assignedRoles.includes(targetRole)) {
            existing.push(groupName);
        } else {
            // Check if group exists in Jira at all
            try {
                const groupSearch = await jira.groups.findGroups({ query: groupName });
                const foundGroups = (groupSearch as any).groups || groupSearch || [];
                const exactMatch = (foundGroups as any[]).find(g => g.name === groupName);

                if (exactMatch) {
                    notInProject.push(groupName);
                } else {
                    missing.push(groupName);
                }
            } catch (e) {
                console.warn(`[Audit] Failed to check existence of group ${groupName}`);
                missing.push(groupName);
            }
        }
    }

    // 4. Schemes Audit
    if (!project.permissionScheme) {
        try {
            const permSchemeResponse = await jira.projectPermissionSchemes.getAssignedPermissionScheme({ projectKeyOrId: projectKey });
            if (permSchemeResponse) project.permissionScheme = permSchemeResponse;
        } catch (e) { }
    }

    if (!project.issueSecurityScheme) {
        try {
            const secSchemeResponse = await jira.projectPermissionSchemes.getProjectIssueSecurityScheme({ projectKeyOrId: projectKey });
            if (secSchemeResponse) project.issueSecurityScheme = secSchemeResponse;
        } catch (e) { }
    }

    const currentPermSchemeName = project.permissionScheme ? project.permissionScheme.name : 'Default Permission Scheme';
    const targetPermSchemeName = projectKey.toUpperCase();
    let permAction: 'create-copy' | 'link-existing' | 'ok' = 'create-copy';
    if (currentPermSchemeName === targetPermSchemeName) {
        permAction = 'ok';
    } else {
        const schemes = await jira.permissionSchemes.getAllPermissionSchemes();
        const targetExists = schemes.permissionSchemes?.some((s: any) => s.name === targetPermSchemeName);
        if (targetExists) permAction = 'link-existing';
    }

    const currentSecSchemeName = project.issueSecurityScheme ? project.issueSecurityScheme.name : 'None';
    const targetSecSchemeName = (projectType === 'non-team') ? 'R_A_W' : projectKey.toUpperCase();
    let secAction: 'create-copy' | 'link-existing' | 'ok' = 'create-copy';
    if (currentSecSchemeName === targetSecSchemeName) {
        secAction = 'ok';
    } else {
        const secSchemes = await jira.issueSecuritySchemes.getIssueSecuritySchemes();
        const targetSecExists = secSchemes.issueSecuritySchemes?.some(s => s.name === targetSecSchemeName);
        if (targetSecExists) secAction = 'link-existing';
    }

    // 5. Simulate Migration to identify proposed members
    const proposedAdminMembers = new Map<string, any>();
    const proposedSdMembers = new Map<string, any>();
    const proposedUserMembers = new Map<string, any>();
    const orgAdmins = new Set<string>();

    try {
        const oaMembers = await jira.groups.getUsersFromGroup({ groupname: 'org-admins' });
        ((oaMembers as any).values || []).forEach((u: any) => { if (u.accountId) orgAdmins.add(u.accountId); });
    } catch (e) { }

    const roleNameToNormalized = new Map<string, NormalizedRole>();
    Object.entries(roleNameByNormalized).forEach(([normalized, roleName]) => {
        if (roleName) roleNameToNormalized.set(roleName, normalized as NormalizedRole);
    });

    const usersToMigrate = new Map<string, { user: any, role: NormalizedRole, priority: number }>();

    for (const [roleName, roleUrl] of Object.entries(projectRoles)) {
        const normalizedRole = roleNameToNormalized.get(roleName);
        if (!normalizedRole || normalizedRole === 'ORG_ADMINS') continue;

        try {
            const parts = (roleUrl as string).split('/');
            const roleId = parseInt(parts[parts.length - 1], 10);
            if (isNaN(roleId)) continue;

            const roleDetails = await jira.projectRoles.getProjectRole({ projectIdOrKey: projectKey, id: roleId });
            for (const actor of (roleDetails.actors || [])) {
                if (actor.type === 'atlassian-group-role-actor' && actor.name) {
                    if (!templateGroups.includes(actor.name) && actor.name !== 'org-admins' && actor.name !== 'audit') {
                        // Alien group - collect members
                        const membersResult = await jira.groups.getUsersFromGroup({ groupname: actor.name });
                        const members = (membersResult as any).values || membersResult || [];
                        for (const u of members) {
                            if (u.accountId && u.accountType === 'atlassian') {
                                updateHighestRoleSim(usersToMigrate, u, normalizedRole);
                            }
                        }
                    }
                } else if (actor.type === 'atlassian-user-role-actor') {
                    const u = (actor as any).actorUser;
                    if (u?.accountId) {
                        updateHighestRoleSim(usersToMigrate, u, normalizedRole);
                    }
                }
            }
        } catch (e) { }
    }

    // Add current members of template groups too
    try {
        const adminResult = await jira.groups.getUsersFromGroup({ groupname: `${projectKey}group_admin` });
        ((adminResult as any).values || adminResult || []).forEach((u: any) => {
            if (u.accountId && !orgAdmins.has(u.accountId)) proposedAdminMembers.set(u.accountId, u);
        });

        const sdResult = await jira.groups.getUsersFromGroup({ groupname: `${projectKey}group` });
        ((sdResult as any).values || sdResult || []).forEach((u: any) => {
            if (u.accountId && !orgAdmins.has(u.accountId)) proposedSdMembers.set(u.accountId, u);
        });

        const uResult = await jira.groups.getUsersFromGroup({ groupname: `${projectKey}group_user` });
        ((uResult as any).values || uResult || []).forEach((u: any) => {
            if (u.accountId && !orgAdmins.has(u.accountId)) proposedUserMembers.set(u.accountId, u);
        });
    } catch (e) { }

    for (const [accountId, data] of usersToMigrate) {
        if (orgAdmins.has(accountId)) continue;
        if (data.role === 'ADMINISTRATOR') {
            proposedAdminMembers.set(accountId, data.user);
        } else if (data.role === 'SERVICE_DESK') {
            proposedSdMembers.set(accountId, data.user);
        } else if (data.role === 'USER') {
            proposedUserMembers.set(accountId, data.user);
        }
    }

    return {
        projectKey,
        groups: { missing, notInProject, existing },
        proposedMembers: {
            admin: Array.from(proposedAdminMembers.values()),
            serviceDesk: Array.from(proposedSdMembers.values()),
            users: Array.from(proposedUserMembers.values())
        },
        permissionScheme: { current: currentPermSchemeName, target: targetPermSchemeName, action: permAction },
        securityScheme: { current: currentSecSchemeName, target: targetSecSchemeName, action: secAction }
    };
};

function updateHighestRoleSim(
    map: Map<string, { user: any, role: NormalizedRole, priority: number }>,
    user: any,
    role: NormalizedRole
) {
    const priority = ROLE_PRIORITY[role];
    if (map.has(user.accountId)) {
        const existing = map.get(user.accountId)!;
        if (priority < existing.priority) map.set(user.accountId, { user, role, priority });
    } else {
        map.set(user.accountId, { user, role, priority });
    }
}

export const applyProjectTemplate = async (
    projectKey: string,
    projectType: string,
    leaderAccountId?: string,
    serviceDeskMembers?: string[],
    userMembers?: string[],
    adminMembers?: string[]
) => {
    const { jira } = await getJiraClients();
    const errors: string[] = [];
    const templateGroups = [
        'full_access_to_tasks',
        `${projectKey}group`,
        `${projectKey}group_admin`,
        `${projectKey}group_executor`,
        `${projectKey}group_user`,
        `${projectKey}group_watchers`,
        'audit',
        'org-admins'
    ];

    const projectRoles = await jira.projectRoles.getProjectRoles({ projectIdOrKey: projectKey });
    const { mapping: roleMapping, warnings, roleNameByNormalized } = buildRoleMapping(projectKey, projectType as 'team' | 'non-team', projectRoles);
    errors.push(...warnings);

    // 1. Create Groups
    for (const groupName of templateGroups) {
        if (groupName === 'org-admins' || groupName === 'audit' || groupName === 'full_access_to_tasks') continue;
        try {
            const groupSearch = await jira.groups.findGroups({ query: groupName });
            const groupsList = (groupSearch as any).groups || groupSearch || [];
            const exists = (groupsList as any[]).some(g => g.name === groupName);

            if (!exists) {
                await jira.groups.createGroup({ name: groupName });
                console.log(`Created group: ${groupName}`);
            }
        } catch (e) {
            const msg = getJiraErrorMessage(e);
            if (msg.toLowerCase().includes('already exists')) {
                console.log(`Group already exists: ${groupName}`);
                continue;
            }
            console.error(`Failed to handle group ${groupName}`, msg);
            errors.push(`Failed to ensure group ${groupName}: ${msg}`);
        }
    }

    // 2. Assign Groups to Roles
    for (const [groupName, roleName] of Object.entries(roleMapping)) {
        if (!roleName) {
            errors.push(`Missing role for group ${groupName}`);
            continue;
        }
        try {
            const roleUrl = projectRoles[roleName];
            if (!roleUrl) {
                errors.push(`Role not found in project: ${roleName}`);
                continue;
            }
            const parts = roleUrl.split('/');
            const roleId = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(roleId)) {
                await jira.projectRoleActors.addActorUsers({
                    projectIdOrKey: projectKey,
                    id: roleId,
                    group: [groupName]
                });
                console.log(`Added group ${groupName} to role ${roleName}`);
            }
        } catch (e: any) {
            const msg = e?.response?.data?.errorMessages?.[0] || '';
            if (!msg.includes('already assigned')) {
                console.warn(`Failed to assign group ${groupName} to role ${roleName}`, msg);
                errors.push(`Failed to assign ${groupName} to ${roleName}: ${msg || 'unknown error'}`);
            }
        }
    }

    // 3. Configure Schemes
    // --- Permission Scheme ---
    const targetPermSchemeName = projectKey.toUpperCase();
    const permSchemes = await jira.permissionSchemes.getAllPermissionSchemes();
    let targetPermScheme = (permSchemes.permissionSchemes as any[])?.find(s => s.name === targetPermSchemeName);

    if (!targetPermScheme) {
        console.log(`[Schemes] Permission scheme ${targetPermSchemeName} not found. Creating from .Blank...`);
        const sourcePermScheme = (permSchemes.permissionSchemes as any[])?.find(s => s.name === '.Blank');
        if (sourcePermScheme) {
            try {
                const newScheme = await jira.permissionSchemes.createPermissionScheme({
                    name: targetPermSchemeName,
                    description: `Cloned from .Blank for ${projectKey}`
                });

                if (sourcePermScheme.id) {
                    const sourceDetails = await jira.permissionSchemes.getPermissionScheme({ schemeId: sourcePermScheme.id });
                    if (sourceDetails.permissions) {
                        for (const p of sourceDetails.permissions) {
                            try {
                                const { holder, permission } = p as any;
                                if (!holder || !permission) continue;

                                const cleanHolder: any = { type: holder.type };
                                if (holder.parameter) cleanHolder.parameter = holder.parameter;
                                if (holder.value) cleanHolder.parameter = holder.value; // Fallback for some API versions

                                await jira.permissionSchemes.createPermissionGrant({
                                    schemeId: newScheme.id!,
                                    holder: cleanHolder,
                                    permission
                                });
                            } catch (e: any) {
                                console.warn(`[Schemes] Failed to add permission grant for ${p.permission}: ${getJiraErrorMessage(e)}`);
                            }
                        }
                    }
                }
                targetPermScheme = newScheme;
            } catch (e: any) {
                const msg = getJiraErrorMessage(e);
                errors.push(`Failed to create permission scheme ${targetPermSchemeName}: ${msg}`);
            }
        } else {
            errors.push(`Source permission scheme ".Blank" not found. Cannot create ${targetPermSchemeName}.`);
        }
    }

    if (targetPermScheme) {
        try {
            await jira.projects.updateProject({
                projectIdOrKey: projectKey,
                permissionScheme: targetPermScheme.id,
                notifyUsers: false
            } as any);
        } catch (e: any) {
            errors.push(`Failed to link permission scheme ${targetPermSchemeName} to project: ${getJiraErrorMessage(e)}`);
        }
    }

    // --- Security Scheme ---
    const targetSecSchemeName = (projectType === 'non-team') ? 'R_A_W' : projectKey.toUpperCase();
    const secSchemes = await jira.issueSecuritySchemes.getIssueSecuritySchemes();
    let targetSecScheme = secSchemes.issueSecuritySchemes?.find(s => s.name === targetSecSchemeName);

    console.log(`[Security] Clearing issue security levels for ${projectKey}...`);
    const clearResult = await bulkClearSecurityLevels(projectKey);
    console.log(
        `[Security] Clear result: total=${clearResult.total}, cleared=${clearResult.cleared}, errors=${clearResult.errors.length}`
    );
    if (clearResult.errors.length > 0) {
        console.warn(`[Security] Clear errors: ${JSON.stringify(clearResult.errors)}`);
        errors.push(...clearResult.errors);
        return { success: false, errors, projectKey, projectType };
    }

    const remaining = await verifySecurityCleared(clearResult.issues || []);
    console.log(`[Security] Post-clear verification: remaining=${remaining.length}`);
    if (remaining.length > 0) {
        errors.push(
            `Security levels are still present after cleanup: ${remaining.slice(0, 20).join(', ')}${
                remaining.length > 20 ? '…' : ''
            }`
        );
        return { success: false, errors, projectKey, projectType };
    }

    if (!targetSecScheme) {
        console.log(`[Schemes] Security scheme ${targetSecSchemeName} not found. Linking fallback...`);
        // For security schemes, cloning is restricted in some Jira versions via API.
        // We will try to find R_A_W or .Blank and use it if it exists.
        const fallback = secSchemes.issueSecuritySchemes?.find(s => s.name === 'R_A_W' || s.name === '.Blank');
        if (fallback) targetSecScheme = fallback;
    }

    if (targetSecScheme) {
        try {
            console.log(`[Security] Linking security scheme ${targetSecSchemeName} to ${projectKey}...`);
            await jira.projects.updateProject({
                projectIdOrKey: projectKey,
                issueSecurityScheme: targetSecScheme.id,
                notifyUsers: false
            } as any);
            console.log(`[Security] Security scheme linked: ${targetSecSchemeName}`);
        } catch (e: any) {
            errors.push(`Failed to link security scheme ${targetSecSchemeName} to project: ${getJiraErrorMessage(e)}`);
            return { success: false, errors, projectKey, projectType };
        }
    } else {
        errors.push(`Security scheme ${targetSecSchemeName} not found or unavailable.`);
        return { success: false, errors, projectKey, projectType };
    }

    console.log(`[Security] Applying security level Default to all issues in ${projectKey}...`);
    const setResult = await bulkSetSecurityLevel(projectKey, 'Default', clearResult.issues || []);
    console.log(
        `[Security] Set Default result: total=${setResult.total}, updated=${setResult.updated}, errors=${setResult.errors.length}`
    );
    if (setResult.errors.length > 0) {
        console.warn(`[Security] Set Default errors: ${JSON.stringify(setResult.errors)}`);
        errors.push(...setResult.errors);
        return { success: false, errors, projectKey, projectType };
    }

    // 4. User Migration & Cleanup
    await migrateUsersAndCleanup(jira, projectKey, roleMapping, templateGroups, roleNameByNormalized);

    // 5. Leader Selection
    if (leaderAccountId) {
        try {
            await jira.projects.updateProject({
                projectIdOrKey: projectKey,
                leadAccountId: leaderAccountId,
                notifyUsers: false
            } as any);
            const executorGroup = `${projectKey}group_executor`;
            try {
                const leader = await jira.users.getUser({ accountId: leaderAccountId });
                if ((leader as any)?.accountType && (leader as any).accountType !== 'atlassian') {
                    const msg = `Leader account type "${(leader as any).accountType}" cannot be added to groups`;
                    console.warn(`Failed to add leader to executor group`, msg);
                    errors.push(`Failed to add leader to ${executorGroup}: ${msg}`);
                } else {
                    await jira.groups.addUserToGroup({ groupname: executorGroup, accountId: leaderAccountId });
                    await removeUserFromOtherTemplateGroups(jira, leaderAccountId, executorGroup, templateGroups);
                }
            } catch (e: any) {
                const msg = getJiraErrorMessage(e);
                if (!msg.includes('already a member')) {
                    console.warn(`Failed to add leader to executor group`, msg);
                    errors.push(`Failed to add leader to ${executorGroup}: ${msg}`);
                }
            }
        } catch (e) {
            console.error(`Failed to set project lead`, e);
            errors.push('Failed to set project lead');
        }
    }

    // 6. Manual Group Membership Override
    const groupsToOverride = [
        { name: `${projectKey}group_admin`, members: adminMembers },
        { name: `${projectKey}group`, members: serviceDeskMembers },
        { name: `${projectKey}group_user`, members: userMembers },
        { name: `${projectKey}group_executor`, members: leaderAccountId ? [leaderAccountId] : [] }
    ];

    for (const group of groupsToOverride) {
        if (!group.members) continue;

        try {
            // 1. Ensure group exists
            try {
                const groupSearch = await jira.groups.findGroups({ query: group.name });
                const groupsList = (groupSearch as any).groups || groupSearch || [];
                const exists = (groupsList as any[]).some(g => g.name === group.name);
                if (!exists) {
                    await jira.groups.createGroup({ name: group.name });
                }
            } catch (e) { }

            // 2. Clear current members
            const currentMembersResult = await jira.groups.getUsersFromGroup({ groupname: group.name });
            const currentMembers = (currentMembersResult as any).values || currentMembersResult || [];
            for (const user of currentMembers) {
                if (user.accountId) {
                    await jira.groups.removeUserFromGroup({ groupname: group.name, accountId: user.accountId });
                }
            }

            // 3. Add new members
            for (const accountId of group.members) {
                try {
                    await jira.groups.addUserToGroup({ groupname: group.name, accountId });
                } catch (e: any) {
                    const msg = getJiraErrorMessage(e);
                    if (!msg.includes('already a member')) {
                        errors.push(`Failed to add user ${accountId} to ${group.name}: ${msg}`);
                    }
                }
            }
        } catch (e: any) {
            const msg = getJiraErrorMessage(e);
            errors.push(`Failed to manage members for ${group.name}: ${msg}`);
        }
    }

    return { success: errors.length === 0, errors, projectKey, projectType };
};

const migrateUsersAndCleanup = async (
    jira: Version3Client,
    projectKey: string,
    roleMapping: RoleMapping,
    templateGroups: string[],
    roleNameByNormalized: Record<NormalizedRole, string | null>
) => {
    console.log(`[Migration] Starting User Migration & Cleanup for ${projectKey}...`);
    const usersToMigrate = new Map<string, { accountId: string, role: NormalizedRole, priority: number }>();
    const alienGroupsToRemove: { groupName: string, roleId: number, roleName: string }[] = [];
    const alienUsersToRemove: { accountId: string, roleId: number, roleName: string }[] = [];
    const visitedRoles = new Set<string>();

    const ROLE_TO_GROUP: Record<NormalizedRole, string> = {
        ORG_ADMINS: 'org-admins',
        ADMINISTRATOR: `${projectKey}group_admin`,
        EXECUTOR: `${projectKey}group_executor`,
        SERVICE_DESK: `${projectKey}group`,
        USER: `${projectKey}group_user`,
        WATCHERS: `${projectKey}group_watchers`
    };

    const roleNameToNormalized = new Map<string, NormalizedRole>();
    Object.entries(roleNameByNormalized).forEach(([normalized, roleName]) => {
        if (roleName) roleNameToNormalized.set(roleName, normalized as NormalizedRole);
    });

    const projectRoles = await jira.projectRoles.getProjectRoles({ projectIdOrKey: projectKey });

    for (const roleName of Object.values(roleMapping).filter((name): name is string => Boolean(name))) {
        if (visitedRoles.has(roleName)) continue;
        visitedRoles.add(roleName);
        if (!projectRoles[roleName]) continue;
        const normalizedRole = roleNameToNormalized.get(roleName);
        if (!normalizedRole || normalizedRole === 'ORG_ADMINS') continue;

        const parts = projectRoles[roleName].split('/');
        const roleId = parseInt(parts[parts.length - 1], 10);
        if (isNaN(roleId)) continue;

        try {
            const roleDetails = await jira.projectRoles.getProjectRole({ projectIdOrKey: projectKey, id: roleId });
            const currentActors = roleDetails.actors || [];

            for (const actor of currentActors) {
                if (actor.type === 'atlassian-group-role-actor') {
                    const name = actor.name;
                    if (!name) continue;
                    if (!templateGroups.includes(name) && name !== 'org-admins' && name !== 'audit') {
                        alienGroupsToRemove.push({ groupName: name, roleId, roleName });
                    }
                    const membersResult = await jira.groups.getUsersFromGroup({ groupname: name });
                    const members = (membersResult as any).values || membersResult || [];
                    for (const user of members) {
                        if (user.accountId && user.accountType === 'atlassian') {
                            updateHighestRole(usersToMigrate, user.accountId, normalizedRole);
                        }
                    }
                } else if (actor.type === 'atlassian-user-role-actor') {
                    const accountId = (actor as any).actorUser?.accountId;
                    if (accountId) {
                        alienUsersToRemove.push({ accountId, roleId, roleName });
                        updateHighestRole(usersToMigrate, accountId, normalizedRole);
                    }
                }
            }
        } catch (e) {
            console.warn(`[Migration] Error scanning role ${roleName}`, e);
        }
    }

    const orgAdmins = new Set<string>();
    try {
        const oaMembers = await jira.groups.getUsersFromGroup({ groupname: 'org-admins' });
        ((oaMembers as any).values || []).forEach((u: any) => { if (u.accountId) orgAdmins.add(u.accountId); });
    } catch (e) { }

    let migratedCount = 0;
    let skippedOrgAdmins = 0;
    for (const [accountId, data] of usersToMigrate) {
        if (orgAdmins.has(accountId)) {
            skippedOrgAdmins += 1;
            continue;
        }
        const targetGroup = ROLE_TO_GROUP[data.role];
        if (targetGroup) {
            try {
                await jira.groups.addUserToGroup({ groupname: targetGroup, accountId });
                await removeUserFromOtherTemplateGroups(jira, accountId, targetGroup, templateGroups);
                migratedCount += 1;
            } catch (e: any) {
                const msg = e?.response?.data?.errorMessages?.[0] || '';
                if (!msg.includes('already a member')) console.warn(`[Migration] Failed to add user ${accountId}`, msg);
            }
        }
    }
    console.log(`[Migration] Migrated users: ${migratedCount}`);
    console.log(`[Migration] Skipped org-admins: ${skippedOrgAdmins}`);

    for (const item of alienGroupsToRemove) {
        try {
            await jira.projectRoleActors.deleteActor({ projectIdOrKey: projectKey, id: item.roleId, group: item.groupName });
        } catch (e) { }
    }
    for (const item of alienUsersToRemove) {
        try {
            await jira.projectRoleActors.deleteActor({ projectIdOrKey: projectKey, id: item.roleId, user: item.accountId });
        } catch (e) { }
    }
    console.log(`[Migration] Completed for ${projectKey}`);
};

function updateHighestRole(
    map: Map<string, { accountId: string, role: NormalizedRole, priority: number }>,
    accountId: string,
    role: NormalizedRole
) {
    const priority = ROLE_PRIORITY[role];
    if (map.has(accountId)) {
        const existing = map.get(accountId)!;
        if (priority < existing.priority) map.set(accountId, { accountId, role, priority });
    } else {
        map.set(accountId, { accountId, role, priority });
    }
}

const removeUserFromOtherTemplateGroups = async (
    jira: Version3Client,
    accountId: string,
    keepGroup: string,
    templateGroups: string[]
) => {
    for (const groupName of templateGroups) {
        if (groupName === keepGroup || groupName === 'org-admins' || groupName === 'audit' || groupName === 'full_access_to_tasks') {
            continue;
        }
        try {
            await jira.groups.removeUserFromGroup({ groupname: groupName, accountId });
        } catch (e: any) {
            const msg = e?.response?.data?.errorMessages?.[0] || '';
            if (!msg.includes('not a member')) {
                console.warn(`[Migration] Failed to remove user ${accountId} from ${groupName}`, msg);
            }
        }
    }
};
