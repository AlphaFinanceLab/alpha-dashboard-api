import { eachHourOfInterval, startOfHour, endOfHour, getUnixTime } from 'date-fns';
import { BigNumber } from "bignumber.js";
import { PrismaClient, EventsV2ETH } from '@prisma/client';
import {
    getBankPositionContext, getTokensUsdValueFromLpAmount, BANK_CONTRACT_DECIMALS
} from './bankV2';
import { Ensure, IUnwrapPromise } from '../../lib/util';
import { SAFE_BOXES } from './safeboxEth';

const prisma = new PrismaClient();

type IAggregationState = ReturnType<typeof getInitialAggregationState>;
type IAssetValues = null | {
    totalDebt: BigNumber;
    totalShare: BigNumber;
    reserve: BigNumber;
    utilization: BigNumber;
    APR: BigNumber;
    APY: BigNumber;
};

// NOTE: Assume 1 block = 15 sec
const TOTAL_BLOCKS_PER_YEAR = 365 * 24 * 60 * 60 / 15;

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
    assets: {
        WETH: (null as IAssetValues),
        DAI: (null as IAssetValues),
        USDT: (null as IAssetValues),
        USDC: (null as IAssetValues),
        YFI: (null as IAssetValues),
        DPI: (null as IAssetValues),
        SNX: (null as IAssetValues),
        USD: (null as IAssetValues),
        LINK: (null as IAssetValues),
        WBTC: (null as IAssetValues),
        UNI: (null as IAssetValues),
        SUSHI: (null as IAssetValues),
    },
    tvl: new BigNumber(0),
});

const getLastAggregationStateAndCursor = async () => {
    const lastBlockEvent = await prisma.indicatorsV2ETH.findFirst({ orderBy: { timestamp: 'desc' } });
    if (!lastBlockEvent) {
        return null;
    }
    const indicators = lastBlockEvent.indicators as ReturnType<typeof deepCloneState>;
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
        assets: {
            WETH: instantiateAssetValue(indicators.assets.WETH),
            DAI: instantiateAssetValue(indicators.assets.DAI),
            USDT: instantiateAssetValue(indicators.assets.USDT),
            USDC: instantiateAssetValue(indicators.assets.USDC),
            YFI: instantiateAssetValue(indicators.assets.YFI),
            DPI: instantiateAssetValue(indicators.assets.DPI),
            SNX: instantiateAssetValue(indicators.assets.SNX),
            USD: instantiateAssetValue(indicators.assets.USD),
            LINK: instantiateAssetValue(indicators.assets.LINK),
            WBTC: instantiateAssetValue(indicators.assets.WBTC),
            UNI: instantiateAssetValue(indicators.assets.UNI),
            SUSHI: instantiateAssetValue(indicators.assets.SUSHI),
        },
        tvl: new BigNumber(indicators.tvl),
    };
    const lastEvent = (lastBlockEvent.lastEvent as ILastIndicatorEvent);
    const eventCursor: ICurrentEvent = { blockNumber: lastEvent.blockNumber, logIndex: lastEvent.logIndex };
    return { eventCursor, state };
};

const deepCloneAssetValue = (av: IAssetValues) => {
    if (!av) { return null; }
    return {
        totalDebt: av.totalDebt.toFixed(4),
        totalShare: av.totalShare.toFixed(4),
        reserve: av.reserve.toFixed(4),
        utilization: av.utilization.toFixed(4),
        APR: av.APR.toFixed(4),
        APY: av.APY.toFixed(4),
    };
};

const instantiateAssetValue = (av: ReturnType<typeof deepCloneAssetValue>): IAssetValues => {
    if (!av) { return null; }
    return {
        totalDebt: new BigNumber(av.totalDebt),
        totalShare: new BigNumber(av.totalShare),
        reserve: new BigNumber(av.reserve),
        utilization: new BigNumber(av.utilization),
        APR: new BigNumber(av.APR),
        APY: new BigNumber(av.APY),
    };
};

const deepCloneState = (s: IAggregationState) => ({
    positions: {
        overTime: s.positions.overTime,
        active: s.positions.active,
        inactive: s.positions.inactive,
        liquidated: s.positions.liquidated,
        liquidatedValue: s.positions.liquidatedValue.toFixed(4),
        refilled: s.positions.refilled,
        refilledValue: s.positions.refilledValue.toFixed(4),
    },
    assets: {
        WETH: deepCloneAssetValue(s.assets.WETH),
        DAI: deepCloneAssetValue(s.assets.DAI),
        USDT: deepCloneAssetValue(s.assets.USDT),
        USDC: deepCloneAssetValue(s.assets.USDC),
        YFI: deepCloneAssetValue(s.assets.YFI),
        DPI: deepCloneAssetValue(s.assets.DPI),
        SNX: deepCloneAssetValue(s.assets.SNX),
        USD: deepCloneAssetValue(s.assets.USD),
        LINK: deepCloneAssetValue(s.assets.LINK),
        WBTC: deepCloneAssetValue(s.assets.WBTC),
        UNI: deepCloneAssetValue(s.assets.UNI),
        SUSHI: deepCloneAssetValue(s.assets.SUSHI),
    },
    tvl: s.tvl.toFixed(4),
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
                        throw new Error(`[ETH v2] PutCollateral with no lpPayload or coingecko info should not happen. ${JSON.stringify({ ev })}`);
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
                        throw new Error(`[ETH v2] Liquidate with no lpPayload or coingecko info should not happen. ${JSON.stringify({ ev })}`);
                    }
                    const amountValues = getTokensUsdValueFromLpAmount(
                        (ev.returnValues as any).amount, ev.contextValues.lpPayload, ev.contextValues.coingecko
                    )
                    GLOBAL_STATE.positions.liquidatedValue = GLOBAL_STATE.positions.liquidatedValue.plus(
                        amountValues.amountUsd
                    );
                } // else if (ev.event === 'TakeCollateral') {
                //     // TakeCollateral [id, token, amount, caller, positionId]
                // } else if (ev.event === 'Borrow') {
                //     // Borrow [share, token, amount, caller, positionId]
                // } else if (ev.event === 'Repay') {
                //     // Repay [share, token, amount, caller, positionId]
                // }

                // Bank vaults values
                for (const sb of ev.contextValues.safeBoxes) {
                    // const currAssetVals = GLOBAL_STATE.assets[sb.symbol]
                    const totalBorrows = new BigNumber(sb.totalBorrows).dividedBy(`1e${sb.decimals}`);
                    // NOTE: confirm total loanable calc
                    const totalLoanable = new BigNumber(sb.balanceOf).dividedBy(`1e${sb.decimals}`);
                    const APR = new BigNumber(sb.supplyRatePerBlock).multipliedBy(TOTAL_BLOCKS_PER_YEAR).dividedBy(`1e${BANK_CONTRACT_DECIMALS}`);
                    const APY = ((APR.dividedBy(365)).plus(1)).pow(365).minus(1);
                    const safeBoxMapInfo = SAFE_BOXES[sb.symbol];
                    const bankInfo = ev.contextValues.bankValues.find(b => (
                        b?.cToken.toLowerCase() === safeBoxMapInfo.cToken.toLowerCase())
                    );
                    if (bankInfo) {
                        GLOBAL_STATE.assets[sb.symbol] = {
                            totalDebt: new BigNumber(bankInfo.totalDebt).dividedBy(`1e${BANK_CONTRACT_DECIMALS}`),
                            totalShare: new BigNumber(bankInfo.totalShare).dividedBy(`1e${BANK_CONTRACT_DECIMALS}`),
                            reserve: new BigNumber(bankInfo.reserve).dividedBy(`1e${BANK_CONTRACT_DECIMALS}`),
                            utilization: totalBorrows.dividedBy(totalBorrows.plus(totalLoanable)),
                            APR,
                            APY,
                        };
                    } else {
                        console.error(`[ETH v2] No bank info for cToken!. pid: ${ev.positionId}, ${ev.transactionHash} ${ev.logIndex}. Data: ${JSON.stringify(sb)}`);
                    }
                }
                // TODO: confirm TVL calculation
                // GLOBAL_STATE.tvl = 
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
