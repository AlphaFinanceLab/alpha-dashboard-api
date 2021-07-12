import Web3 from 'web3';
import { EventData } from 'web3-eth-contract';
import { PrismaClient, EventsBSC } from '@prisma/client'
import { delay } from '../common';
import {
    IGetEventCallback,
    IGetErrorCallback,
    getEventsInBatches,
    getBankPositionContext,
    IPositionWithShares,
    syncBankValues,
} from './lib/bank';
import { getCoinsInfoAndHistoryMarketData } from '../lib/coingecko';

const prisma = new PrismaClient();
// const NODE_URL = "https://speedy-nodes-nyc.moralis.io/6df2e03496e250e048360175/bsc/mainnet";
// const NODE_URL = "https://bsc-dataseed4.binance.org/"; // "https://bsc-dataseed.binance.org";

// NOTE: an archive node is required to query past blocks states
const NODE_URL = "https://speedy-nodes-nyc.moralis.io/6df2e03496e250e048360175/bsc/mainnet/archive";

async function fillEventsTimestamps(web3: Web3) {
    const filterQuery = { where: { timestamp: { equals: null } } };
    let count = await prisma.eventsBSC.count(filterQuery);
    let errorsCount = 0;
    while (count && errorsCount < 10) {
        const eventsWithEmptyTimestamp = await prisma.eventsBSC.findMany({ ...filterQuery, take: 100 });
        console.log(`Updating ${eventsWithEmptyTimestamp.length} events with empty timestamp.`);
        for (const ev of eventsWithEmptyTimestamp) {
            try {
                const timestamp = (await web3.eth.getBlock(ev.blockNumber)).timestamp;
                if (!timestamp) {
                    throw new Error(`Can't get timestamp`);
                }
                const timestampNum = parseInt(`${timestamp}`);
                await prisma.eventsBSC.update({
                    where: {
                        Events_logIndex_transactionHash_unique_constraint: {
                            transactionHash: ev.transactionHash,
                            logIndex: ev.logIndex,
                        }
                    },
                    data: {
                        timestamp: timestampNum,
                        updatedAt: new Date(),
                    }
                });
                count = await prisma.eventsBSC.count(filterQuery);
            } catch(err) {
                errorsCount++;
                console.error(`Can't update timestamp for event. Event: ${ev.event}. ${ev.transactionHash} ${ev.logIndex}. Error: ${err.message}`);
                if (errorsCount >= 10) {
                    console.error(`Limit of errors getting event timestamp reached.`);
                    return;
                }
                count = await prisma.eventsBSC.count(filterQuery);
            }
        }
    }
}

// here we get coingecko values for the stuff mined
async function fillEventsContextCoingecko() {
    try {
        const filterQuery = {
            where: {
                AND: [
                    { OR: [{ event: 'Work' }, { event: 'Kill' }] },
                    { timestamp: { not: null } },
                    { contextValues: { path: ['goblinPayload', 'lpPayload'], not: null } },
                    { contextValues: { path: ['goblinPayload', 'lpPayload', 'token0'], not: null } },
                    { contextValues: { path: ['coingecko'], equals: null } },
                ]
            },
        };
        let count = await prisma.eventsBSC.count(filterQuery);
        if (!count) { return; }
        let errorsCount = 0;
        while (count && errorsCount < 10) {
            const eventsWithEmptyTimestamp = await prisma.eventsBSC.findMany({ ...filterQuery, take: 100 });
            console.log(`Updating ${eventsWithEmptyTimestamp.length} WORK or KILL events with empty coingecko values.`);
            for (const ev of eventsWithEmptyTimestamp) {
                try {
                    const contextValues: Partial<IPositionWithShares> | undefined = (ev.contextValues as any);
                    if (ev.timestamp && contextValues?.goblinPayload?.lpPayload) {
                        const coinsToQuery = [
                            { address: contextValues.goblinPayload.lpPayload.token0, timestamp: ev.timestamp },
                            { address: contextValues.goblinPayload.lpPayload.token1, timestamp: ev.timestamp },
                        ];
                        const coingecko = await getCoinsInfoAndHistoryMarketData('BSC', coinsToQuery);
                        await prisma.eventsBSC.update({
                            where: {
                                Events_logIndex_transactionHash_unique_constraint: {
                                    transactionHash: ev.transactionHash,
                                    logIndex: ev.logIndex,
                                }
                            },
                            data: {
                                contextValues: { ...(ev.contextValues as any), coingecko },
                                updatedAt: new Date(),
                            }
                        });
                        count = await prisma.eventsBSC.count(filterQuery);   
                        await delay(300);
                    } else {
                        // query should guarantee this never happens but, just a check for TS
                        throw new Error('Ups!');
                    }
                } catch(err) {
                    errorsCount++;
                    console.error(`Can't update coingecko values for event. Event: ${ev.event}. ${ev.transactionHash} ${ev.logIndex}. Error: ${err.message}`);
                    if (errorsCount >= 10) {
                        console.error(`Limit of errors getting event coingecko values reached.`);
                        return;
                    }
                    count = await prisma.eventsBSC.count(filterQuery);
                }
            }
        }
    } catch(err) {
        console.error(`[ERROR] Getting event coingecko: ${err.message}.`);
    }
}

async function fillEventsContexts(web3: Web3) {
    // let countUsers = await prisma.eventsBSC.count({ where: { timestamp: { equals: null } } });
    const filterQuery = {
        where: {
            AND: [
                { OR: [{ event: 'Work' }, { event: 'Kill'}] },
                { returnValues: { path: ['id'], not: null } },
                { OR: [
                    {contextValues: { equals: null } },
                    {contextValues: { path: ['goblinPayload', 'lpPayload', 'token0'], equals: null } },
                ]}
            ]
        }
    };
    let countWorkOrKillEventsWithEmptyContext = await prisma.eventsBSC.count(filterQuery);
    let errorsCount = 0;
    while (countWorkOrKillEventsWithEmptyContext && errorsCount < 10) {
        const eventsWithEmptyContext = await prisma.eventsBSC.findMany({ ...filterQuery, take: 100 });
        console.log(`Updating ${eventsWithEmptyContext.length} Kill or Work events with empty context.`);
        for (const ev of eventsWithEmptyContext) {
            try {
                const posId = (ev.returnValues as any)?.id;
                const contextValues = (posId) 
                    ? (await getBankPositionContext(web3, posId, ev.blockNumber, ev.timestamp))
                    : null;
                if (!contextValues) {
                    throw new Error(`Can't get event position context.`);
                }
                await prisma.eventsBSC.update({
                    where: {
                        Events_logIndex_transactionHash_unique_constraint: {
                            transactionHash: ev.transactionHash,
                            logIndex: ev.logIndex,
                        }
                    },
                    data: {
                        contextValues,
                        updatedAt: new Date(),
                    }
                });
                countWorkOrKillEventsWithEmptyContext = await prisma.eventsBSC.count(filterQuery);
            } catch(err) {
                errorsCount++;
                console.error(`Can't update position context for event. Event: ${ev.event}. ${ev.transactionHash} ${ev.logIndex}. Error: ${err.message}`);
                if (errorsCount >= 10) {
                    console.error(`Limit of errors getting event position context reached.`);
                    return;
                }
                countWorkOrKillEventsWithEmptyContext = await prisma.eventsBSC.count(filterQuery);
            }
        }
    }
}

async function fillEventsBankValueContexts(web3: Web3) {
    const filterQuery = {
        where: {
            AND: [
                { OR: [{ event: 'Work' }, { event: 'Kill'}] },
                {contextValues: { path: ['goblinPayload', 'lpPayload', 'token0'], not: { equals: null } } },
                {contextValues: { path: ['bankValues', 'reservePool'], equals: null } },
            ]
        }
    };
    let countWorkOrKillEventsWithEmptyBankValues = await prisma.eventsBSC.count(filterQuery);
    let errorsCount = 0;
    while (countWorkOrKillEventsWithEmptyBankValues && errorsCount < 10) {
        const eventsWithEmptyBankValue = await prisma.eventsBSC.findMany({ ...filterQuery, take: 100 });
        console.log(`Updating ${eventsWithEmptyBankValue.length} Kill or Work events with empty bank value.`);
        for (const ev of eventsWithEmptyBankValue) {
            try {
                const bankValues = await syncBankValues(web3, ev.blockNumber);
                if (!bankValues) {
                    throw new Error(`Can't get event bankValues.`);
                }
                await prisma.eventsBSC.update({
                    where: {
                        Events_logIndex_transactionHash_unique_constraint: {
                            transactionHash: ev.transactionHash,
                            logIndex: ev.logIndex,
                        }
                    },
                    data: {
                        contextValues: { ...((ev.contextValues as IPositionWithShares) || {}), bankValues },
                        updatedAt: new Date(),
                    }
                });
                countWorkOrKillEventsWithEmptyBankValues = await prisma.eventsBSC.count(filterQuery);
            } catch(err) {
                errorsCount++;
                console.error(`Can't update position context.bankValues for event. Event: ${ev.event}. ${ev.transactionHash} ${ev.logIndex}. Error: ${err.message}`);
                if (errorsCount >= 10) {
                    console.error(`Limit of errors getting event position context.bankValues reached.`);
                    return;
                }
                countWorkOrKillEventsWithEmptyBankValues = await prisma.eventsBSC.count(filterQuery);
            }
        }
    }
}

// Validate all work or kill events are filled correctly
async function countIncompleteWorkOrKillEvents() {
    const incompleteEventsCount = await prisma.eventsBSC.count({
        where: {
            AND: [
                { OR: [{ event: 'Work' }, { event: 'Kill'}] },
                {
                    OR: [
                        { returnValues: { path: ['id'], equals: null } },
                        { contextValues: { path: ['goblinPayload', 'lpPayload', 'token0'], equals: null } },
                        { contextValues: { path: ['bankValues', 'reservePool'], equals: null } },
                        { contextValues: { path: ['coingecko'], equals: null } },
                        { positionId: { equals: null } },
                        { timestamp: { equals: null } },
                    ]
                },
            ]
        }
    });
    return (incompleteEventsCount);
}

async function main() {
    const web3HttpProvider = new Web3.providers.HttpProvider(NODE_URL, { keepAlive: true, timeout: 20000, });
    const web3 = new Web3(web3HttpProvider);
    web3.eth.transactionBlockTimeout = 20000;
    web3.eth.transactionPollingTimeout = 60000;
    const blockN = await web3.eth.getBlockNumber();
    // SELECT * FROM public."EventsBSC" order by "blockNumber" asc limit 1000
    const lastBlockEvent = await prisma.eventsBSC.findFirst({ orderBy: { blockNumber: 'desc' } });
    const startingBlock = lastBlockEvent?.blockNumber
        ? (lastBlockEvent?.blockNumber - 1)
        : 1;

    // Number of positions over time (nextPositionID variable in Bank contract)
    const onGetEventCallback: IGetEventCallback = async (ev: EventData[]) => {
        for (const singleEvent of ev) {
            let timestamp: string | number | undefined;
            let contextValues: IPositionWithShares | null = null;
            try {
                timestamp = (await web3.eth.getBlock(singleEvent.blockNumber)).timestamp;
                if (
                    (singleEvent.event === 'Work' || singleEvent.event === 'Kill')
                    && singleEvent.returnValues?.id
                    && timestamp
                 ) {
                    contextValues = await getBankPositionContext(
                        web3,
                        singleEvent.returnValues?.id,
                        singleEvent.blockNumber,
                        parseInt(`${timestamp}`),
                    );
                }
            } catch(e) {
                console.error('ERROR GETTING BLOCK TIMESTAMP', singleEvent.blockNumber, e);
            } finally {
                try {
                    let positionId: null | number = null;
                    if (singleEvent.returnValues?.id && ['AddDebt', 'RemoveDebt', 'Work', 'Kill'].some(ev => ev === singleEvent.event)) {
                        positionId = parseInt(singleEvent.returnValues.id);
                    }
                    // https://ethereum.stackexchange.com/questions/55155/contract-event-transactionindex-and-logindex/55157
                    const updateSingleEvent: Omit<EventsBSC, 'updatedAt'> = {
                        logIndex: singleEvent.logIndex,
                        transactionHash: singleEvent.transactionHash,
                        transactionIndex: singleEvent.transactionIndex,
                        event: singleEvent.event,
                        address: singleEvent.address,
                        blockNumber: singleEvent.blockNumber,
                        returnValues: singleEvent.returnValues,
                        contextValues,
                        positionId,
                        timestamp: timestamp ? parseInt(`${timestamp}`) : null,
                    };
                    await prisma.eventsBSC.upsert({
                        where: {
                            Events_logIndex_transactionHash_unique_constraint: {
                                transactionHash: singleEvent.transactionHash,
                                logIndex: singleEvent.logIndex,
                            }
                        },
                        update: updateSingleEvent,
                        create: updateSingleEvent,
                    });   
                } catch(err) {
                    console.error('ERROR!', err);
                }
            }
        }
        await delay(1);
    };
    const onGetErrorCallback: IGetErrorCallback = async (range, err) => {
        try {
            console.error('Get events error!', err?.message, range.fromBlock, range.toBlock);
            // NOTE: generating a unique id composed of the range blocks
            const syncEventRangeId = `${range.fromBlock}-${range.toBlock}`;
            await prisma.eventErrorsBSC.upsert({
                where: { id: syncEventRangeId },
                update: { startBlock: range.fromBlock, endBlock: range.toBlock },
                create: { id: syncEventRangeId, startBlock: range.fromBlock, endBlock: range.toBlock },
            });
        } catch(e) {
            console.error('Error saving error!', range, e.message, e.stack)
        }
    };
    
    const getEventsBatchesWithErrors = await getEventsInBatches(
        web3, 'allEvents', onGetEventCallback, onGetErrorCallback, startingBlock, blockN,
    );
    // now double check to fill all required data is filled in case something faileds
    await fillEventsTimestamps(web3);
    await fillEventsContexts(web3)
    await fillEventsBankValueContexts(web3);
    await fillEventsContextCoingecko();


    const incompleteCount = await countIncompleteWorkOrKillEvents();
    const doneWithoutErrors = (incompleteCount === 0 && getEventsBatchesWithErrors === 0);
    if (doneWithoutErrors) {
        console.log(`[DONE] Without errors!`);
    } else {
        console.error(`There are ${incompleteCount} events with missing returnValues, contextValues, positionId or timestamp!`)
        console.log(`[DONE] Errors found: ${getEventsBatchesWithErrors}`);
    }
    return doneWithoutErrors;
}

main().then(res => console.log(res));