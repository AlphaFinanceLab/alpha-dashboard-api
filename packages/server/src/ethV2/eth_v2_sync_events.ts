import '../lib/config';
import Web3 from 'web3';
import { EventData } from 'web3-eth-contract';
import { PrismaClient, EventsV2ETH } from '@prisma/client'
import {
    IGetEventCallback,
    IGetErrorCallback,
    getEventsInBatches,
    getBankPositionContext,
} from './lib/bankV2';
import { getCoinsInfoAndHistoryMarketData, getOnlyCoingeckoRelevantinfo } from '../lib/coingecko';
import { delay, IUnwrapPromise } from '../lib/util';

const prisma = new PrismaClient();

const MAX_ERRORS_COUNT_ALLOWED = 50;

// Moralis account 1
const NODE_URL = "https://speedy-nodes-nyc.moralis.io/6df2e03496e250e048360175/eth/mainnet/archive";
// const NODE_URL = "https://speedy-nodes-nyc.moralis.io/6df2e03496e250e048360175/eth/mainnet";

// Moralis account 2
// const NODE_URL = "https://speedy-nodes-nyc.moralis.io/b7a19f69cee6f40b46e40877/eth/mainnet/archive";
// const NODE_URL = "https://speedy-nodes-nyc.moralis.io/b7a19f69cee6f40b46e40877/eth/mainnet";

async function retryEventErrors(
    web3: Web3, onDone: IGetEventCallback, onError: IGetErrorCallback,
) {
    const eventsErrors = await prisma.eventErrorsV2ETH.findMany();
    for (const evErr of eventsErrors) {
        const onRetrySuccess: IGetEventCallback = async ed => {
            try {
                await prisma.eventErrorsV2ETH.delete({
                    where: { id: evErr.id }
                });
            } catch(delErr) {
                console.error('[ETH v2] Delete event error failed: ', delErr);
            } finally {
                await onDone(ed);
            }
        };
        const getEventsBatchesWithErrors = await getEventsInBatches(
            web3, 'allEvents', onRetrySuccess, onError, evErr.startBlock, evErr.endBlock,
        );
        if (getEventsBatchesWithErrors !== 0) {
            throw new Error(`[Error ETH v2] There are event errors that failed retry: ${getEventsBatchesWithErrors}.`)
        }
    }
}

async function validateThereAreNoErrors() {
    const eventsErrors = await prisma.eventErrorsV2ETH.findMany();
    if (eventsErrors.length) {
        throw new Error(`[ETH v2] There are fetching event errors. Can't continue calculating positions and indicators.`);
    }
}

async function fillEventsTimestamps(web3: Web3) {
    const filterQuery = { where: { timestamp: { equals: null } } };
    let count = await prisma.eventsV2ETH.count(filterQuery);
    let errorsCount = 0;
    while (count && errorsCount < MAX_ERRORS_COUNT_ALLOWED) {
        const eventsWithEmptyTimestamp = await prisma.eventsV2ETH.findMany({ ...filterQuery, take: 100 });
        console.log(`[ETH v2] Updating ${eventsWithEmptyTimestamp.length} events with empty timestamp.`);
        for (const ev of eventsWithEmptyTimestamp) {
            try {
                const timestamp = (await web3.eth.getBlock(ev.blockNumber)).timestamp;
                if (!timestamp) {
                    throw new Error(`[ETH v2] Can't get timestamp`);
                }
                const timestampNum = parseInt(`${timestamp}`);
                await prisma.eventsV2ETH.update({
                    where: {
                        EventsV2ETH_logIndex_transactionHash_unique_constraint: {
                            transactionHash: ev.transactionHash,
                            logIndex: ev.logIndex,
                        }
                    },
                    data: {
                        timestamp: timestampNum,
                        updatedAt: new Date(),
                    }
                });
                count = await prisma.eventsV2ETH.count(filterQuery);
            } catch(err) {
                errorsCount++;
                console.error(`[ETH v2] Can't update timestamp for event. Event: ${ev.event}. ${ev.transactionHash} ${ev.logIndex}. Error: ${err.message}`);
                if (errorsCount >= MAX_ERRORS_COUNT_ALLOWED) {
                    console.error(`[ETH v2] Limit of errors getting event timestamp reached.`);
                    return;
                }
                count = await prisma.eventsV2ETH.count(filterQuery);
            }
        }
    }
}

const EVENTS_TO_CHECK = ['Borrow', 'Repay', 'PutCollateral', 'TakeCollateral', 'Liquidate'] as const;

// here we get coingecko values for the stuff mined
async function fillEventsContextCoingecko() {
    try {
        const filterQuery = {
            where: {
                AND: [
                    { OR: [
                        { event: 'Borrow' },
                        { event: 'Repay' },
                        { event: 'PutCollateral'},
                        { event: 'TakeCollateral'},
                        { event: 'Liquidate'},
                    ] },
                    { timestamp: { not: null } },
                    { contextValues: { path: ['poolInfo'], not: null } },
                    { contextValues: { path: ['collToken'], not: null } },
                    { contextValues: { path: ['coingecko'], equals: null } },
                    { irrelevant: false }
                ]
            },
        };
        let count = await prisma.eventsV2ETH.count(filterQuery);
        if (!count) { return; }
        let errorsCount = 0;
        while (count && errorsCount < MAX_ERRORS_COUNT_ALLOWED) {
            const eventsWithEmptyTimestamp = await prisma.eventsV2ETH.findMany({ ...filterQuery, take: 100 });
            console.log(`[ETH v2] Updating ${eventsWithEmptyTimestamp.length} WORK or KILL events with empty coingecko values.`);
            for (const ev of eventsWithEmptyTimestamp) {
                try {
                    // TODO:!
                    // const contextValues: Partial<IPositionWithShares> | undefined = (ev.contextValues as any);
                    const contextValues: Partial<any> | undefined = (ev.contextValues as any);
                    if (ev.timestamp && contextValues?.goblinPayload?.lpPayload) {
                        const coingecko = getOnlyCoingeckoRelevantinfo(
                            await getCoinsInfoAndHistoryMarketData(
                                'ETH', contextValues.poolInfo.tokens.map((address: string) => ({ address, timestamp: ev.timestamp }))
                            )
                        );
                        await prisma.eventsV2ETH.update({
                            where: {
                                EventsV2ETH_logIndex_transactionHash_unique_constraint: {
                                    transactionHash: ev.transactionHash,
                                    logIndex: ev.logIndex,
                                }
                            },
                            data: {
                                contextValues: { ...(ev.contextValues as any), coingecko },
                                updatedAt: new Date(),
                            }
                        });
                        count = await prisma.eventsV2ETH.count(filterQuery);   
                        await delay(300);
                    } else {
                        // query should guarantee this never happens but, just a check for TS
                        throw new Error('Ups!');
                    }
                } catch(err) {
                    errorsCount++;
                    console.error(`Can't update coingecko values for event. Event: ${ev.event}. ${ev.transactionHash} ${ev.logIndex}. Error: ${err.message}`);
                    if (errorsCount >= MAX_ERRORS_COUNT_ALLOWED) {
                        console.error(`Limit of errors getting event coingecko values reached.`);
                        return;
                    }
                    count = await prisma.eventsV2ETH.count(filterQuery);
                }
            }
        }
    } catch(err) {
        console.error(`[ERROR] Getting event coingecko: ${err.message}.`);
    }
}

async function fillEventsContexts(web3: Web3) {
    const filterQuery = {
        where: {
            AND: [
                { OR: [
                    { event: 'Borrow' },
                    { event: 'Repay' },
                    { event: 'PutCollateral'},
                    { event: 'TakeCollateral'},
                    { event: 'Liquidate'},
                ] },
                { returnValues: { path: ['positionId'], not: null } },
                { OR: [
                    { contextValues: { equals: null } },
                    // { contextValues: { path: ['poolInfo'], equals: null } },
                ]},
                { irrelevant: false },
            ]
        }
    };
    let countWorkOrKillEventsWithEmptyContext = await prisma.eventsV2ETH.count(filterQuery);
    let errorsCount = 0;
    while (countWorkOrKillEventsWithEmptyContext && errorsCount < MAX_ERRORS_COUNT_ALLOWED) {
        const eventsWithEmptyContext = await prisma.eventsV2ETH.findMany({ ...filterQuery, take: 100 });
        console.log(`[ETH v2] Updating ${eventsWithEmptyContext.length} Kill or Work events with empty context.`);
        for (const ev of eventsWithEmptyContext) {
            try {
                const posId = (ev.returnValues as any)?.id;
                let irrelevant = false; // TODO:! handle irrelevant positions
                const contextValues = (posId) 
                    ? (await getBankPositionContext(web3, posId, ev.blockNumber, ev.timestamp))
                    : null;
                if (!contextValues && !irrelevant) {
                    throw new Error(`[ETH v2] Can't get event position context. ev: ${JSON.stringify(ev, null, 2)}`);
                }
                await prisma.eventsV2ETH.update({
                    where: {
                        EventsV2ETH_logIndex_transactionHash_unique_constraint: {
                            transactionHash: ev.transactionHash,
                            logIndex: ev.logIndex,
                        }
                    },
                    data: {
                        irrelevant,
                        contextValues,
                        updatedAt: new Date(),
                    }
                });
                countWorkOrKillEventsWithEmptyContext = await prisma.eventsV2ETH.count(filterQuery);
            } catch(err) {
                errorsCount++;
                console.error(`[ETH v2] Can't update position context for event. Event: ${ev.event}. ${ev.transactionHash} ${ev.logIndex}. Error: ${err.message}`);
                if (errorsCount >= MAX_ERRORS_COUNT_ALLOWED) {
                    console.error(`[ETH v2] Limit of errors getting event position context reached.`);
                    return;
                }
                countWorkOrKillEventsWithEmptyContext = await prisma.eventsV2ETH.count(filterQuery);
            }
        }
    }
}

async function main() {
    const web3HttpProvider = new Web3.providers.HttpProvider(NODE_URL, { keepAlive: true, timeout: 20000, });
    const web3 = new Web3(web3HttpProvider);
    web3.eth.transactionBlockTimeout = 20000;
    web3.eth.transactionPollingTimeout = 60000;
    const blockN = await web3.eth.getBlockNumber();
    const lastBlockEvent = await prisma.eventsV2ETH.findFirst({ orderBy: { blockNumber: 'desc' } });
    const startingBlock = lastBlockEvent?.blockNumber
        ? (lastBlockEvent?.blockNumber - 1)
        : 1;

    // Number of positions over time (nextPositionID variable in Bank contract)
    const onGetEventCallback: IGetEventCallback = async (ev: EventData[]) => {
        for (const singleEvent of ev) {
            let timestamp: string | number | undefined;
            // TODO:!
            // let contextValues: IPositionWithShares | null = null;
            let contextValues: IUnwrapPromise<ReturnType<typeof getBankPositionContext>> = null;
            let irrelevant = false;
            try {
                // TODO:! handle irrelevant positions
                timestamp = (await web3.eth.getBlock(singleEvent.blockNumber)).timestamp;
                if (
                    (EVENTS_TO_CHECK.some(ev => ev === singleEvent.event))
                    && singleEvent.returnValues?.positionId
                    && timestamp
                 ) {
                    const posId = singleEvent.returnValues?.positionId;
                    contextValues = (posId)
                        ? await getBankPositionContext(web3, posId, singleEvent.blockNumber, parseInt(`${timestamp}`))
                        : null;
                }
            } catch(e) {
                console.error('[ETH v2] ERROR GETTING BLOCK TIMESTAMP OR CONTEXT', singleEvent.blockNumber, e);
            } finally {
                try {
                    let positionId: null | number = null;
                    if (singleEvent.returnValues?.positionId && EVENTS_TO_CHECK.some(ev => ev === singleEvent.event)) {
                        positionId = parseInt(singleEvent.returnValues.positionId);
                    }
                    // https://ethereum.stackexchange.com/questions/55155/contract-event-transactionindex-and-logindex/55157
                    const updateSingleEvent: Omit<EventsV2ETH, 'updatedAt'> = {
                        logIndex: singleEvent.logIndex,
                        transactionHash: singleEvent.transactionHash,
                        transactionIndex: singleEvent.transactionIndex,
                        event: singleEvent.event,
                        address: singleEvent.address,
                        blockNumber: singleEvent.blockNumber,
                        returnValues: singleEvent.returnValues,
                        contextValues,
                        positionId,
                        irrelevant,
                        timestamp: timestamp ? parseInt(`${timestamp}`) : null,
                    };
                    await prisma.eventsV2ETH.upsert({
                        where: {
                            EventsV2ETH_logIndex_transactionHash_unique_constraint: {
                                transactionHash: singleEvent.transactionHash,
                                logIndex: singleEvent.logIndex,
                            }
                        },
                        update: updateSingleEvent,
                        create: updateSingleEvent,
                    });   
                } catch(err) {
                    console.error('[ETH v2] ERROR!', err);
                }
            }
        }
        await delay(1);
    };
    const onGetErrorCallback: IGetErrorCallback = async (range, err) => {
        try {
            console.error('[ETH v2] Get events error!', err?.message, range.fromBlock, range.toBlock);
            // NOTE: generating a unique id composed of the range blocks
            const syncEventRangeId = `${range.fromBlock}-${range.toBlock}`;
            await prisma.eventErrorsV2ETH.upsert({
                where: { id: syncEventRangeId },
                update: { startBlock: range.fromBlock, endBlock: range.toBlock },
                create: { id: syncEventRangeId, startBlock: range.fromBlock, endBlock: range.toBlock },
            });
        } catch(e) {
            console.error('[ETH v2] Error saving error!', range, e, e.stack)
        }
    };
    await retryEventErrors(web3, onGetEventCallback, onGetErrorCallback);
    const getEventsBatchesWithErrors = await getEventsInBatches(
        web3, 'allEvents', onGetEventCallback, onGetErrorCallback, startingBlock, blockN,
    );
    await retryEventErrors(web3, onGetEventCallback, onGetErrorCallback);
    
    // validate there are no event errors
    await validateThereAreNoErrors();
    // now double check to fill all required data is filled in case something faileds
    await fillEventsTimestamps(web3);
    await fillEventsContexts(web3);
    await fillEventsContextCoingecko();
    
    console.log(`[DONE ETH v2] Sync Events. Errors: ${getEventsBatchesWithErrors}`);
    // TODOO! first countIncompleteWorkOrKillEvents then fill historical snapshots here!
    return true;
}

main().finally(() => {
    prisma.$disconnect().then(() => (
        process.exit(0)
    ));
});