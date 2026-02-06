import app from './app';
import { config } from './config/env';

const PORT = config.PORT;

app.listen(PORT, () => {
    console.log(`jira-cli backend is running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});
