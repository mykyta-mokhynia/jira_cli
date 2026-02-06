import dotenv from 'dotenv';
import path from 'path';

// Read .env from the backend folder
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

let jiraEmail = process.env.JIRA_EMAIL || '';
let jiraToken = process.env.JIRA_API_TOKEN || '';
const legacyAuth = process.env.JIRA_AUTH;

if ((!jiraEmail || !jiraToken) && legacyAuth && legacyAuth.includes(':')) {
    const [email, token] = legacyAuth.split(':');
    jiraEmail = email.trim();
    jiraToken = token.trim();
}

export const config = {
    PORT: process.env.JIRA_CLI_PORT || process.env.JIRA_BACKEND_PORT || 3001,
    JIRA: {
        HOST: process.env.JIRA_HOST || process.env.JIRA_BASE_URL || '',
        EMAIL: jiraEmail,
        API_TOKEN: jiraToken,
    }
};

if (!config.JIRA.HOST || !config.JIRA.EMAIL || !config.JIRA.API_TOKEN) {
    console.warn('WARNING: JIRA credentials missing in jira-cli/backend. Checked .env in jira-cli/backend.');
}
