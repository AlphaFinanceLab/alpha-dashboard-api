import { PrismaClient } from '@prisma/client';
import { buildSchema } from 'graphql';
import Fastify from 'fastify'; // , { FastifyReply, FastifyRequest }
import mercurius, { IResolvers, MercuriusLoaders } from 'mercurius';
import mercuriusCodegen, { loadSchemaFiles } from 'mercurius-codegen';

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
    async bscPositionById(_root, args, _ctx, _info) {
      const position = await prisma.positionWithSharesBSC.findFirst({
        where: { id: args.positionId },
      });
      return position;
    },
    async bscEventByTransactionIndex(_root, args, _ctx, _info) {
      const ev = await prisma.eventsBSC.findMany({
        where: { AND: [
          { timestamp : { gte: args.from }},
          { timestamp : { lte: args.to }}
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
      app.graphql.replaceSchema(buildSchema(schema.join('\n')));
      app.graphql.defineResolvers(resolvers);
    },
  },
});
// context: buildContext,
app.register(mercurius, { schema, resolvers, loaders, subscription: false, graphiql: true });

mercuriusCodegen(app, {
  targetPath: TARGET_PATH,
  operationsGlob: OPERATIONS_GLOB,
  watchOptions: { enabled: !IS_PRODUCTION_ENV },
  codegenConfig: { scalars: { DateTime: 'Date', JSON: '{ [key: string]: any}' } },
}).catch(console.error);

app.listen(8000);
