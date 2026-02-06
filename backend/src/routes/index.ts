import { Router } from 'express';
import * as JiraController from '../controllers/jiraController';
import * as TemplateController from '../controllers/templateController';
import * as InstanceController from '../controllers/instanceController';

const router = Router();

router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date(), service: 'jira-cli-backend' });
});

// Template Management
router.get('/project/:key/audit', TemplateController.auditProject);
router.post('/project/:key/apply-template', TemplateController.applyProjectTemplate);

// Jira Instances
router.get('/instances', InstanceController.listInstances);
router.get('/instances/selected', InstanceController.getSelectedInstance);
router.post('/instances', InstanceController.createInstance);
router.put('/instances/:id', InstanceController.updateInstance);
router.delete('/instances/:id', InstanceController.deleteInstance);
router.post('/instances/:id/select', InstanceController.selectInstance);

// Jira Proxies / Utilities
router.get('/me', JiraController.getCurrentUser);
router.get('/users', JiraController.getUsers);
router.get('/project/:key/assignable-users', JiraController.getAssignableUsers);
router.get('/project/:key', JiraController.getProjectDetails);
router.get('/project/:key/config-schemes', JiraController.getProjectConfigSchemes);
router.get('/project/:key/permissions/diff', JiraController.getPermissionSchemeDiff);
router.post('/project/:key/permissions/normalize', JiraController.normalizePermissionScheme);
router.get('/project/:key/roles', JiraController.getProjectRoles);
router.get('/projects', JiraController.getProjects);
router.get('/boards', JiraController.getBoards);
router.post('/project/:key/role/:id/actors', JiraController.addRoleActor);
router.delete('/project/:key/role/:id/actors', JiraController.removeRoleActor);
router.post('/project/:key/clear-security', JiraController.clearSecurityLevels);
router.get('/issue/:key', JiraController.getIssue);
router.post('/issue', JiraController.createIssue);
router.put('/issue/:key', JiraController.updateIssue);
router.get('/search', JiraController.searchIssues);

// People Audit & Normalize
router.get('/project/:key/people/audit', JiraController.getProjectAudit);
router.post('/project/:key/people/normalize', JiraController.normalizeProjectRoles);
router.post('/project/:key/people/role/:roleKey/user', JiraController.addProjectRoleUser);
router.delete('/project/:key/people/role/:roleKey/user/:accountId', JiraController.removeProjectRoleUser);

export default router;
