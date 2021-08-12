import config from './lib/config';
import app from './app';

app().listen(config.WEBAPP_PORT, () => {
    console.info(`App is running at port: ${config.WEBAPP_PORT}, ENV: ${config.DATABASE_URL}`);
});