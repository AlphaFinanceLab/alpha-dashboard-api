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

Initial setup:
```

### PM2 setup
The server also implements cron tasks scheduled to periodically run using [PM2](https://pm2.keymetrics.io/docs/usage/pm2-doc-single-page/)
 (e.g.: query different exchanges).
 
Install:
```
npm install pm2@latest -g
```
 
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
