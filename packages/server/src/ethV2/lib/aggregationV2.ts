import { eachHourOfInterval, startOfHour, endOfHour, getUnixTime } from 'date-fns';
import { BigNumber } from "bignumber.js";
import { PrismaClient, EventsV2ETH } from '@prisma/client';
import {
    getBankPositionContext, getTokensUsdValueFromLpAmount
} from './bankV2';
import { Ensure, IUnwrapPromise } from '../../lib/util';

const prisma = new PrismaClient();

// type ITokenCoingeckoInfo = { coingeckoId: string; amount: BigNumber; usdPrice: number; usdValue: BigNumber; };
// type IAggregationPoolInfo = {
//     address: string;
//     usdTotalValue: BigNumber;
//     token0: ITokenCoingeckoInfo;
//     token1: ITokenCoingeckoInfo;
//     goblin: string;
// }
// type ITokenCoingeckoClonedInfo = { coingeckoId: string; amount: string; usdPrice: number; usdValue: string; };
// type IAggregationPoolClonedInfo = {
//     address: string;
//     usdTotalValue: string;
//     token0: ITokenCoingeckoClonedInfo;
//     token1: ITokenCoingeckoClonedInfo;
//     goblin: string;
// }

type IAggregationState = IUnwrapPromise<ReturnType<typeof getInitialAggregationState>>;
const getInitialAggregationState = () => ({
    positions: {
        overTime: 0,
        active: 0,
        inactive: 0,
        liquidated: 0,
        liquidatedValue: new BigNumber(0),
        refilled: 0,
        refilledValue: new BigNumber(0),
    },
    // bankValues: {
    //     totalETH: new BigNumber(0),
    //     glbDebtVal: new BigNumber(0),
    //     glbDebtShare: new BigNumber(0),
    //     reservePool: new BigNumber(0),
    // },
    // ETH: {
    //     lendingValue: new BigNumber(0),
    //     utilizationRate: new BigNumber(0),
    //     lendingAPY: new BigNumber(0),
    // },
    // loans: {
    //     number: 0,
    //     value: new BigNumber(0),
    // },
    // poolsInfo: ({} as { [addr: string]: IAggregationPoolInfo }),
    // tvl: new BigNumber(0),
});

const getLastAggregationStateAndCursor = async () => {
    const lastBlockEvent = await prisma.indicatorsV2ETH.findFirst({ orderBy: { timestamp: 'desc' } });
    if (!lastBlockEvent) {
        return null;
    }
    const indicators = lastBlockEvent.indicators as ReturnType<typeof deepCloneState>;
    // const poolsInfo: { [addr: string]: IAggregationPoolInfo } = {};
    // for (const [poolKey, info] of Object.entries(indicators.poolsInfo)) {
    //     poolsInfo[poolKey] = {
    //         address: info.address,
    //         usdTotalValue: new BigNumber(info.usdTotalValue),
    //         goblin: info.goblin,
    //         token0: {
    //             coingeckoId: info.token0.coingeckoId,
    //             usdPrice: info.token0.usdPrice,
    //             usdValue: new BigNumber(info.token0.usdValue),
    //             amount: new BigNumber(info.token0.amount), // decimals
    //         },
    //         token1: {
    //             coingeckoId: info.token1.coingeckoId,
    //             usdPrice: info.token1.usdPrice,
    //             usdValue: new BigNumber(info.token1.usdValue),
    //             amount: new BigNumber(info.token1.amount), // decimals
    //         },
    //     };
    // }
    const state = {
        positions: {
            overTime: indicators.positions.overTime,
            active: indicators.positions.active,
            inactive: indicators.positions.inactive,
            liquidated: indicators.positions.liquidated,
            liquidatedValue: new BigNumber(indicators.positions.liquidatedValue),
            refilled: indicators.positions.refilled,
            refilledValue: new BigNumber(indicators.positions.refilledValue),
        },
        // bankValues: {
        //     totalETH: new BigNumber(indicators.bankValues.totalETH),
        //     glbDebtVal: new BigNumber(indicators.bankValues.glbDebtVal),
        //     glbDebtShare: new BigNumber(indicators.bankValues.glbDebtShare),
        //     reservePool: new BigNumber(indicators.bankValues.reservePool),
        // },
        // ETH: {
        //     lendingValue: new BigNumber(indicators.ETH.lendingValue),
        //     utilizationRate: new BigNumber(indicators.ETH.utilizationRate),
        //     lendingAPY: new BigNumber(indicators.ETH.lendingAPY),
        // },
        // loans: {
        //     number: indicators.loans.number,
        //     value: new BigNumber(indicators.loans.value),
        // },
        // tvl: new BigNumber(indicators.tvl),
        // poolsInfo,
    };
    const lastEvent = (lastBlockEvent.lastEvent as ILastIndicatorEvent);
    const eventCursor: ICurrentEvent = { blockNumber: lastEvent.blockNumber, logIndex: lastEvent.logIndex };
    return { eventCursor, state };
};

// const deepClonePoolsInfoState = (pis: IAggregationState['poolsInfo']) => {
//     const poolsInfoClone: { [addr: string]: IAggregationPoolClonedInfo } = {};
//     for (const poolInfo of Object.values(pis)) {
//         poolsInfoClone[poolInfo.address] = {
//             address: poolInfo.address,
//             goblin: poolInfo.goblin,
//             token0: {
//                 coingeckoId: poolInfo.token0.coingeckoId,
//                 amount: poolInfo.token0.amount.toString(),
//                 usdPrice: poolInfo.token0.usdPrice,
//                 usdValue: poolInfo.token0.usdValue.toString(),
//             },
//             token1: {
//                 coingeckoId: poolInfo.token1.coingeckoId,
//                 amount: poolInfo.token1.amount.toString(),
//                 usdPrice: poolInfo.token1.usdPrice,
//                 usdValue: poolInfo.token1.usdValue.toString(),
//             },
//             usdTotalValue: poolInfo.usdTotalValue.toString(),
//         }
//     }
//     return poolsInfoClone;
// }

const deepCloneState = (s: IAggregationState) => ({
    positions: {
        overTime: s.positions.overTime,
        active: s.positions.active,
        inactive: s.positions.inactive,
        liquidated: s.positions.liquidated,
        liquidatedValue: s.positions.liquidatedValue.toString(),
        refilled: s.positions.refilled,
        refilledValue: s.positions.refilledValue.toString(),
    },
    /*
    bankValues: {
        totalETH: s.bankValues.totalETH.toString(), // decimals
        glbDebtVal: s.bankValues.glbDebtVal.toString(), // decimals
        glbDebtShare: s.bankValues.glbDebtShare.toString(), // decimals
        reservePool: s.bankValues.reservePool.toString(), // decimals
    },
    ETH: { // contextValues.bankValues
        lendingValue: s.ETH.lendingValue.toString(), // is totalETH // decimals
        utilizationRate: s.ETH.utilizationRate.toString(), // is glbDebtVal / totalETH + reservePool // decimals
        lendingAPY: s.ETH.lendingAPY.toString(), // https://alphafinancelab.gitbook.io/alpha-homora/interest-rate-model // decimals
    },
    loans: {
        number: s.loans.number,
        value: s.loans.value.toString(),
    },
    tvl: s.tvl.toString(),
    poolsInfo: deepClonePoolsInfoState(s.poolsInfo),
    */

    // pools: {
    //     "ALPHA/ibETH": {
    //         apy: s.pools['ALPHA/ibETH'].apy,
    //         volume: s.pools['ALPHA/ibETH'].volume.toString(),
    //     },
    // },
});

// Valid events: AddDebt, RemoveDebt, Work, Kill, Transfer, Approval)
type ICurrentEvent = { blockNumber: number; logIndex: number; };
type IEventsPaginator = { current?: ICurrentEvent };
type EventsV2ETHFilled = Ensure<EventsV2ETH, 'timestamp' | 'contextValues'> & {
    contextValues: IUnwrapPromise<ReturnType<typeof getBankPositionContext>>;
}
// Generator that will paginate all events in batches
const BATCH_SIZE = 1000;
async function *batchedEventsAfterCurrent({ current }: IEventsPaginator) {
    let currentPage = 0;
    const currentQuery = (
        { where: { AND: [
            { event: { in: ['Borrow', 'Repay', 'PutCollateral', 'TakeCollateral', 'Liquidate'] } },
            { blockNumber: { gte: current?.blockNumber || 0 }},
            { irrelevant: false },
        ] }}
    );
    const eventsListCount = await prisma.eventsV2ETH.count(currentQuery as Parameters<typeof prisma.eventsV2ETH.count>[0]);
    const totalPages = Math.ceil(eventsListCount/BATCH_SIZE);
    while (currentPage < totalPages) {
        const eventsList = await prisma.eventsV2ETH.findMany({
            ...currentQuery as Parameters<typeof prisma.eventsV2ETH.findMany>[0],
            orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }],
            take: BATCH_SIZE,
            skip: currentPage * BATCH_SIZE,
        }) as EventsV2ETHFilled[];
        currentPage++;
        const eventsToProcess = current
            ? eventsList.filter(ev => !(ev.blockNumber === current.blockNumber && ev.logIndex <= current.logIndex))
            : eventsList
        yield eventsToProcess;
    }
}

// const SNAPSHOTS_CACHE: {[unixTimestamp: number]: IAggregationState; } = {}
type ILastIndicatorEvent = { logIndex: number; blockNumber: number; };
async function fillPeriodIndicators(startOfPeriod: Date, state: IAggregationState, lastEvent: ILastIndicatorEvent) {
    const timestamp = getUnixTime(startOfPeriod);
    const indicators = deepCloneState(state);
    try {
        // Unique constraint failed on the fields: (`timestamp`)
        await prisma.indicatorsV2ETH.upsert({
            where: { timestamp },
            update: { indicators, lastEvent },
            create: { timestamp, indicators, lastEvent },
        });
    } catch(err) {
        console.error(err);
    }
}

export async function fillHistoricalSnapshots() {
    const aggregationState = (await getLastAggregationStateAndCursor());
    let GLOBAL_STATE = aggregationState ? aggregationState.state : getInitialAggregationState();
    const paginator: IEventsPaginator = { current: aggregationState?.eventCursor };
    if (aggregationState) {
        paginator.current = aggregationState.eventCursor;
        GLOBAL_STATE = aggregationState.state;
    } else {
        GLOBAL_STATE = getInitialAggregationState();
    }
    for await (const eventsPage of batchedEventsAfterCurrent(paginator)) {
        if (!eventsPage.length) { continue; }
        let startOfPeriod = startOfHour(new Date(eventsPage[0].timestamp * 1000));
        let endOfPeriod = endOfHour(startOfPeriod);
        let idx = 0;
        for (const ev of eventsPage) {
            const evDate = new Date(ev.timestamp * 1000);
            if (evDate.getTime() > endOfPeriod.getTime()) { // fill blank candles if event is ahead of the current period
                const hoursIntervals = eachHourOfInterval({ start: startOfPeriod, end: evDate });
                console.log(`Filling ${hoursIntervals.length} hours.`)
                for (const periodDate of hoursIntervals) {
                    startOfPeriod = periodDate;
                    endOfPeriod = endOfHour(startOfPeriod);
                    await fillPeriodIndicators(
                        startOfPeriod,
                        GLOBAL_STATE,
                        { logIndex: ev.logIndex, blockNumber: ev.blockNumber },
                    );
                }
            }
            if (ev.contextValues.id > GLOBAL_STATE.positions.overTime) {
                GLOBAL_STATE.positions.overTime = ev.contextValues.id;
            }
            if (ev.positionId) {
                const positionPrevState = await prisma.positionWithSharesV2ETH.findUnique({ where: { id: ev.positionId } });
                const updatePosition = {
                    id: ev.positionId,
                    owner: ev.contextValues.positionInfo.owner,
                    payload: ev.contextValues,
                    isActive: ev.contextValues.isActive,
                }
                await prisma.positionWithSharesV2ETH.upsert({
                    where: { id: ev.positionId },
                    update: updatePosition,
                    create: updatePosition,
                });
                // active & inactive
                if (!positionPrevState && ev.contextValues.isActive) {
                    GLOBAL_STATE.positions.active++;
                } else if (positionPrevState && !positionPrevState.isActive && ev.contextValues.isActive) {
                    GLOBAL_STATE.positions.inactive--;
                    GLOBAL_STATE.positions.active++;
                } else if (positionPrevState?.isActive && !ev.contextValues.isActive) {
                    GLOBAL_STATE.positions.active--;
                    GLOBAL_STATE.positions.inactive++;
                }

                // Number and value of positions refilled
                // PutCollateral Event in homora bank
                if (ev.event === 'PutCollateral' && positionPrevState) {
                    // PutCollateral returnValues = [id, token, amount, caller, positionId]
                    GLOBAL_STATE.positions.refilled++;
                    // TODO: need to confirm the refilled usd value calc is ok
                    if (!ev.contextValues.lpPayload || !ev.contextValues.coingecko) {
                        throw new Error(`[ETH v2] PutCollateral with no lpPayload or coingecko info should not happen.`);
                    }
                    const amountValues = getTokensUsdValueFromLpAmount(
                        (ev.returnValues as any).amount, ev.contextValues.lpPayload, ev.contextValues.coingecko
                    )
                    GLOBAL_STATE.positions.refilledValue = GLOBAL_STATE.positions.refilledValue.plus(
                        amountValues.amountUsd
                    );
                } else if (ev.event === 'Liquidate' && positionPrevState) {
                    // Liquidate returnValues = [share, amount, bounty, debtToken, liquidator, positionId]
                    GLOBAL_STATE.positions.liquidated++;
                    // TODO: need to confirm the liquidated value is the lpValueUsd
                    if (!ev.contextValues.lpPayload || !ev.contextValues.coingecko) {
                        throw new Error(`[ETH v2] PutCollateral with no lpPayload or coingecko info should not happen.`);
                    }
                    const amountValues = getTokensUsdValueFromLpAmount(
                        (ev.returnValues as any).amount, ev.contextValues.lpPayload, ev.contextValues.coingecko
                    )
                    GLOBAL_STATE.positions.liquidatedValue = GLOBAL_STATE.positions.liquidatedValue.plus(
                        amountValues.amountUsd
                    );
                }
                // else if (ev.event === 'TakeCollateral') {
                //     // TakeCollateral [id, token, amount, caller, positionId]
                // } else if (ev.event === 'Borrow') {
                //     // Borrow [share, token, amount, caller, positionId]
                // } else if (ev.event === 'Repay') {
                //     // Repay [share, token, amount, caller, positionId]
                // }
            } else {
                throw new Error(`[ETH v2] Event without positionId should never happen!. pid: ${ev.positionId}, ${ev.transactionHash} ${ev.logIndex}`);
            }
            if (!eventsPage[idx+1]) {
                // Take snapshot of aggregation state if no next event or the last event of the pagination page
                await fillPeriodIndicators(
                    startOfPeriod,
                    GLOBAL_STATE,
                    { logIndex: ev.logIndex, blockNumber: ev.blockNumber },
                );
            }
            idx++;
        }
    }
}
