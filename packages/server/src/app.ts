import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import addGraphqlRoutes from './routes/graphql';
import config from './lib/config';

function setupApp() {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', true);
    app.get('/robots.txt', (_req, res) => {
        res.type('text/plain');
        res.send("User-agent: *\nDisallow: /");
    });
    app.use(helmet({ contentSecurityPolicy: (config.GRAPHIQL === 'allow') ? false : undefined }));
    app.use(cors());
    app.use(compression());
    app.set('views', 'views');
    app.set('view engine', 'html');
    app.use(cookieParser());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    addGraphqlRoutes(app);
    return app;
}

export default setupApp;
