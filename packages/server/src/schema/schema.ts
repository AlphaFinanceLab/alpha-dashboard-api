import * as GQL from '@alphadashboard/graphql/build/server_gql_types';
import { makeExecutableSchema } from '@graphql-tools/schema';
import * as fs from 'fs';
import { GraphQLScalarType } from 'graphql';
import { JSONResolver } from 'graphql-scalars';
import { Kind } from 'graphql/language';
import * as path from 'path';
import { Query } from './query';


export const typeDefs = fs.readFileSync(path.resolve(__dirname, '../../../graphql/build/full_schema.graphql'), 'utf8').toString();

type IResolverKeys = keyof GQL.Resolvers<{ req: Request; res: Response; }>;
export type IRequiredResolvers = {
    [K in IResolverKeys]: NonNullable<GQL.Resolvers<{ req: Request; res: Response; }>[K]>;
};

export const resolvers: IRequiredResolvers = {
    // ========================================
    //                Main schema
    // ========================================
    Query,
    // Mutation: schemaMutation,

    // ========================================
    //           Nested type resolvers
    // ========================================
    BSCEvent: {},
    // ========================================
    //             Scalar resolvers
    // ========================================
    Date: new GraphQLScalarType({
        name: 'Date',
        description: 'Date represented as ISO string',
        parseValue: (value: string) => new Date(value), // value from the client
        // value sent to the client
        serialize: (value: string | Date) => (typeof value === 'string' ? value : value.toISOString()),
        parseLiteral(ast) {
            if (ast.kind !== Kind.STRING) { return null; }
            const date = new Date(ast.value);
            return isNaN(date.getTime()) ? null : date;
        },
    }),
    JSON: JSONResolver,
};
export default makeExecutableSchema<{ req: Request; res: Response; }>({
    typeDefs,
    resolvers,
    resolverValidationOptions: {
        requireResolversForResolveType: 'ignore'
    },
});
