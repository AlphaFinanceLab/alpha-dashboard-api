import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({
    path: path.join(path.dirname(__filename), '../../.env'),
});

export default {
    WEBAPP_PORT: process.env.WEBAPP_PORT || 3000,
    APP_HOSTNAME: process.env.APP_HOSTNAME || 'http://localhost:3000',
    DATABASE_URL: process.env.DATABASE_URL as string,
    GRAPHIQL: process.env.GRAPHIQL as string || null,
};
