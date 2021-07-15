import { PrismaClient } from '@prisma/client';
import { buildSchema } from 'graphql';
import Fastify from 'fastify'; // , { FastifyReply, FastifyRequest }
import mercurius, { IResolvers, MercuriusLoaders } from 'mercurius';
import mercuriusCodegen, { loadSchemaFiles } from 'mercurius-codegen';
import AltairFastify from 'altair-fastify-plugin';

const prisma = new PrismaClient();
export const app = Fastify({ logger: true });

const IS_PRODUCTION_ENV = process.env.NODE_ENV === 'development';
const SCHEMA_FILES = 'src/graphql/schema/**/*.gql';
const TARGET_PATH = './src/graphql/generated.ts';
const OPERATIONS_GLOB = './src/graphql/operations/*.gql';


// const helloTyped: IFieldResolver<
//   {} /** Root */,
//   MercuriusContext /** Context */,
//   {} /** Args */
// > = (root, args, ctx, info) => {
//   // root ~ {}
//   root
//   // args ~ {}
//   args
//   // ctx.authorization ~ string | undefined
//   // ctx.authorization
//   // info ~ GraphQLResolveInfo
//   info

//   return 'world'
// }

// const buildContext = async (req: FastifyRequest, _reply: FastifyReply) => ({
//     authorization: req.headers.authorization,
// });
// type PromiseType<T> = T extends PromiseLike<infer U> ? U : T;
// declare module 'mercurius' { interface MercuriusContext extends PromiseType<ReturnType<typeof buildContext>> {} };


const resolvers: IResolvers = {
  Query: {
    // async bscPositionById(_root, args, _ctx, _info) {
    //   const position = await prisma.positionWithSharesBSC.findFirst({
    //     where: { id: args.positionId },
    //   });
    //   return position;
    // },
    async bscEventByTransactionIndex(_root, args, _ctx, _info) {
      /// Valid events: AddDebt, RemoveDebt, Work, Kill, Transfer, Approval
      const VALID_EVENTS = ['AddDebt', 'RemoveDebt', 'Work', 'Kill', 'Transfer', 'Approval'];
      const typesProvided = new Set<string>(args.types);
      if (args.types.some((t: string) => !VALID_EVENTS.includes(t))) {
        throw new Error(`Invalid type provided. Valid types are ${VALID_EVENTS.join(',')}`);
      }
      const ev = await prisma.eventsBSC.findMany({
        where: { AND: [
          { timestamp : { gte: args.from }},
          { timestamp : { lte: args.to }},
          { event: { in: [...typesProvided] }}
        ]},
      });
      return ev;
    }
  },
};

const loaders: MercuriusLoaders = {
  // Dog: {
  //   async owner(queries, _ctx) {
  //     return queries.map(({ obj }) => owners[obj.name])
  //   },
  // },
};

const { schema } = loadSchemaFiles(SCHEMA_FILES, {
  watchOptions: {
    enabled: !IS_PRODUCTION_ENV,
    onChange(schema) {
      const bs = buildSchema(schema.join('\n'));
      app.graphql.replaceSchema(bs);
      app.graphql.defineResolvers(resolvers);
    },
  },
});

// graphiql
// app.register(mercurius, {
//   schema, resolvers, loaders, subscription: false, graphiql: true
// });
// context: buildContext,


// Altair
app.register(mercurius, {
  schema, resolvers, loaders, subscription: false, graphiql: false, ide: false, path: '/graphql'
});
app.register(AltairFastify, {
  path: '/altair',
  baseURL: '/altair/',
  // 'endpointURL' should be the same as the mercurius 'path'
  endpointURL: '/graphql'
})


mercuriusCodegen(app, {
  targetPath: TARGET_PATH,
  operationsGlob: OPERATIONS_GLOB,
  watchOptions: { enabled: !IS_PRODUCTION_ENV },
  codegenConfig: { scalars: { DateTime: 'Date', JSON: '{ [key: string]: any}' } },
}).catch(console.error);

app.listen(process.env.WEBAPP_PORT || 8080, '0.0.0.0');
