import * as persistedQueries from '@alphadashboard/graphql/build/persisted_queries.json';
import { Application, NextFunction, Request, Response } from 'express';
import schema from '../schema/schema';

import { graphqlHTTP } from 'express-graphql';

export default function (app: Application) {
    const persistedGQL = (req: Request, res: Response, next: NextFunction) => {
        let msg = 'GraphQL ';
        if (
            req.body.persistedQueryId &&
            typeof req.body.persistedQueryId === 'string' &&
            !req.body.query &&
            (persistedQueries as any)[req.body.persistedQueryId]
        ) {
            req.body.query = (persistedQueries as any)[req.body.persistedQueryId];
            msg += 'Persisted Query: ';
        } else {
            msg += 'Standard Query: ';
        }
        if (req.method === 'POST' && !req.body.query) {
            return res.sendStatus(400);
        }
        const { query, ...params } = req.body;
        console.debug(JSON.stringify({ msg, query, params }, null, 2));
        next();
    };
    app.use('/graphql', persistedGQL, graphqlHTTP({
        schema: schema,
        graphiql: true,
    }));
}
