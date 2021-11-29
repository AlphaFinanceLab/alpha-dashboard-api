# Explore

## Setup

Install nvm, yarn and the nodejs version at `./.nvmrc`. Then from the root of this project:

```
yarn install
yarn build
```
Then create a postgresdb, and setup the environmental variables at `./packages/server/.env`, including the db configuration. There is an example file at `./packages/server/.env.sample`. Then, to generate the db tables and schema go to `./packages/server` and run:
```
yarn prisma:generate
yarn prisma:migrate
```

More details about [prisma migrate](https://github.com/prisma/docs/blob/main/content/300-guides/050-database/100-developing-with-prisma-migrate/150-team-development.mdx).

And to run the application web server, go to `./packages/server` and run:
```
yarn start:dev
```

The application is a mono repo composed of other sub-packages.

## GrahpQL package
Contains the graphql schema definitions and the clients queries. The project builds the types, 
schema and versioned persisted queries so that this generated files can be used by client and server packages to consume the graphql api with type safety.

## Server package
Contains the nodejs application that uses postgres and implements the graphql schema. The server application uses Prisma, an ORM with a custom language like graphql that also generates typescript types based on an schema. Prisma manages craetion and migration of the postgrs db, the prisma schema definition is at `./packages/server/src/prisma/schema.prisma`.

## PM2 setup

The server implements cron tasks scheduled to periodically run using [PM2](https://pm2.keymetrics.io/docs/usage/pm2-doc-single-page/)
 (e.g.: query different exchanges).
 
Install:
```
npm install pm2@latest -g
```
### First data sync
 The server's first sync will be a long task that will bring all events since the contract deploy block for each chain. This first command needs the be run manually, not using the pm2 crontabs. E.g.: 

```
# From the packages/server folder, run:
pm2 start yarn -- eth:sync_events

# then for the bsc first sync, run:
pm2 start yarn -- bsc:sync_events
```

Once those two commands are done and up to date, remove them from the pm2 proocess and load the ecosystem that runs the cron tasks.

### Periodical data sync

The pm2 scheduler definitions are at `./packages/server/ecosystem.config.js`.

```
pm2 start ecosystem.config.js
# or
pm2 reload ecosystem.config.js
```
Automatically rotate logs with [pm2-logrotate](https://github.com/keymetrics/):
```
pm2 install pm2-logrotate
```
Some pm2 commands lograte examples:
```
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:rotateInterval 0 0 * * * # How often time rotate logs
```

## About each blockchain RPC api status

Sometimes the RPC status for querying old blocks may be down, a good source of information about status can be [the graph at the status website](https://status.thegraph.com/).

## Workflow for adding a new blockchain

To create a new workflow for a new blockchain. E.g. Avalanche

1. First edit the file schema.prisma to add tables for events, event errors, positions and indicators.

2. Create a new directory at src and create the sync script. E.g. ´./src/avax/avax_sync_events.ts´.

3. Edit models.graphql and schema.graphql to include the new models for avax at the graphql api schema.

4. Update the query.ts and schema.ts files to implement the new graphql models and methods just created.

5. Run the new sync script and validate all data is ok, after the first long run, now update the pm2 ecosystem.config.js. (NOTE: It is required to manually run the first sync because pm2 has a timout limit and will kill the process if it takes too long).
