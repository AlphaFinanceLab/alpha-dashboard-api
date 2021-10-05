// import * as GQL from '@alphadashboard/graphql/build/server_gql_types';
import { PrismaClient } from '@prisma/client';
import { IRequiredResolvers } from './schema';

const prisma = new PrismaClient();

type IQueryResolverKeys = keyof IRequiredResolvers['Query'];
export type RequiredQueryResolvers = {
    [K in IQueryResolverKeys]: NonNullable<IRequiredResolvers['Query'][K]>;
};

export const Query: RequiredQueryResolvers = {
    async bscIndicators(_obj, args, _ctx) {
        const indicators = await prisma.indicatorsBSC.findMany({
            where: {
              AND: [
                { timestamp: { gte: args.from } },
                { timestamp: { lte: args.to } }
              ]
            },
            take: 200,
          });
          return indicators;
    },
    async bscEvents(_obj, args, _ctx) {
        /// Valid events: AddDebt, RemoveDebt, Work, Kill, Transfer, Approval
        const VALID_EVENTS = ['AddDebt', 'RemoveDebt', 'Work', 'Kill', 'Transfer', 'Approval'];
        const typesProvided = new Set<string>(args.types);
        if (args.types.some((t: string) => !VALID_EVENTS.includes(t))) {
        throw new Error(`Invalid type provided. Valid types are ${VALID_EVENTS.join(',')}`);
        }
        const ev = await prisma.eventsBSC.findMany({
        where: { AND: [
            { timestamp : { gte: args.from }},
            { timestamp : { lte: args.to }},
            { event: { in: [...typesProvided] }}
        ]},
        });
        return ev;
    },
    async ethIndicators(_obj, args, _ctx) {
      const indicators = await prisma.indicatorsETH.findMany({
        where: {
          AND: [
            { timestamp: { gte: args.from } },
            { timestamp: { lte: args.to } }
          ]
        },
        take: 200,
      });
      return indicators;
    },
    async ethEvents(_obj, args, _ctx) {
      /// Valid events: AddDebt, RemoveDebt, Work, Kill, Transfer, Approval
      const VALID_EVENTS = ['AddDebt', 'RemoveDebt', 'Work', 'Kill', 'Transfer', 'Approval'];
      const typesProvided = new Set<string>(args.types);
      if (args.types.some((t: string) => !VALID_EVENTS.includes(t))) {
        throw new Error(`Invalid type provided. Valid types are ${VALID_EVENTS.join(',')}`);
      }
      const ev = await prisma.eventsETH.findMany({
      where: { AND: [
          { timestamp : { gte: args.from }},
          { timestamp : { lte: args.to }},
          { event: { in: [...typesProvided] }},
          { irrelevant: false }
      ]},
      });
      return ev;
    },
    async ethEventsV2(_obj, args, _ctx) {
      /// Valid events: AddDebt, RemoveDebt, Work, Kill, Transfer, Approval
      const VALID_EVENTS = ['Borrow', 'Repay', 'PutCollateral', 'TakeCollateral', 'Liquidate'];
      const typesProvided = new Set<string>(args.types);
      if (args.types.some((t: string) => !VALID_EVENTS.includes(t))) {
        throw new Error(`Invalid type provided. Valid types are ${VALID_EVENTS.join(',')}`);
      }
      const ev = await prisma.eventsV2ETH.findMany({
      where: { AND: [
          { timestamp : { gte: args.from }},
          { timestamp : { lte: args.to }},
          { event: { in: [...typesProvided] }},
          { irrelevant: false }
      ]},
      });
      return ev;
    },
    async ethV2Indicators(_obj, args, _ctx) {
      const indicators = await prisma.indicatorsV2ETH.findMany({
        where: {
          AND: [
            { timestamp: { gte: args.from } },
            { timestamp: { lte: args.to } }
          ]
        },
        take: 200,
      });
      return indicators;
    },
};
