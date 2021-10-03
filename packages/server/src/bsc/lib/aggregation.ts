import { eachHourOfInterval, startOfHour, endOfHour, getUnixTime } from 'date-fns';
import { BigNumber } from "bignumber.js";
import { PrismaClient, EventsBSC } from '@prisma/client';
import {
    IPositionWithSharesFilled,
    borrowInterestRate,
    getGoblinPooledValueInfo,
    IGoblinPayload,
    convertToBankContractDecimals,
    IGoblinLPPayload,
    getTokenAmountsFromPosition,
    getTokensPairUsdPrice,
} from './bank';
import { Ensure, IUnwrapPromise } from '../../lib/util';

const prisma = new PrismaClient();

type ITokenCoingeckoInfo = { coingeckoId: string; amount: BigNumber; usdPrice: number; usdValue: BigNumber; };
type IAggregationPoolInfo = {
    address: string;
    usdTotalValue: BigNumber;
    token0: ITokenCoingeckoInfo;
    token1: ITokenCoingeckoInfo;
    goblin: string;
}
type ITokenCoingeckoClonedInfo = { coingeckoId: string; amount: string; usdPrice: number; usdValue: string; };
type IAggregationPoolClonedInfo = {
    address: string;
    usdTotalValue: string;
    token0: ITokenCoingeckoClonedInfo;
    token1: ITokenCoingeckoClonedInfo;
    goblin: string;
}

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
    bankValues: {
        totalBNB: new BigNumber(0),
        glbDebtVal: new BigNumber(0),
        glbDebtShare: new BigNumber(0),
        reservePool: new BigNumber(0),
    },
    BNB: {
        lendingValue: new BigNumber(0),
        utilizationRate: new BigNumber(0),
        lendingAPY: new BigNumber(0),
    },
    loans: {
        number: 0,
        value: new BigNumber(0),
    },
    poolsInfo: ({} as { [addr: string]: IAggregationPoolInfo }),
    tvl: new BigNumber(0),
});

const getLastAggregationStateAndCursor = async () => {
    const lastBlockEvent = await prisma.indicatorsBSC.findFirst({ orderBy: { timestamp: 'desc' } });
    if (!lastBlockEvent) {
        return null;
    }
    const indicators = lastBlockEvent.indicators as ReturnType<typeof deepCloneState>;
    const poolsInfo: { [addr: string]: IAggregationPoolInfo } = {};
    for (const [poolKey, info] of Object.entries(indicators.poolsInfo)) {
        poolsInfo[poolKey] = {
            address: info.address,
            usdTotalValue: new BigNumber(info.usdTotalValue),
            goblin: info.goblin,
            token0: {
                coingeckoId: info.token0.coingeckoId,
                usdPrice: info.token0.usdPrice,
                usdValue: new BigNumber(info.token0.usdValue),
                amount: new BigNumber(info.token0.amount), // decimals
            },
            token1: {
                coingeckoId: info.token1.coingeckoId,
                usdPrice: info.token1.usdPrice,
                usdValue: new BigNumber(info.token1.usdValue),
                amount: new BigNumber(info.token1.amount), // decimals
            },
        };
    }
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
        bankValues: {
            totalBNB: new BigNumber(indicators.bankValues.totalBNB),
            glbDebtVal: new BigNumber(indicators.bankValues.glbDebtVal),
            glbDebtShare: new BigNumber(indicators.bankValues.glbDebtShare),
            reservePool: new BigNumber(indicators.bankValues.reservePool),
        },
        BNB: {
            lendingValue: new BigNumber(indicators.BNB.lendingValue),
            utilizationRate: new BigNumber(indicators.BNB.utilizationRate),
            lendingAPY: new BigNumber(indicators.BNB.lendingAPY),
        },
        loans: {
            number: indicators.loans.number,
            value: new BigNumber(indicators.loans.value),
        },
        tvl: new BigNumber(indicators.tvl),
        poolsInfo,
    };
    const lastEvent = (lastBlockEvent.lastEvent as ILastIndicatorEvent);
    const eventCursor: ICurrentEvent = { blockNumber: lastEvent.blockNumber, logIndex: lastEvent.logIndex };
    return { eventCursor, state };
};

const deepClonePoolsInfoState = (pis: IAggregationState['poolsInfo']) => {
    const poolsInfoClone: { [addr: string]: IAggregationPoolClonedInfo } = {};
    for (const poolInfo of Object.values(pis)) {
        poolsInfoClone[poolInfo.address] = {
            address: poolInfo.address,
            goblin: poolInfo.goblin,
            token0: {
                coingeckoId: poolInfo.token0.coingeckoId,
                amount: poolInfo.token0.amount.toString(),
                usdPrice: poolInfo.token0.usdPrice,
                usdValue: poolInfo.token0.usdValue.toString(),
            },
            token1: {
                coingeckoId: poolInfo.token1.coingeckoId,
                amount: poolInfo.token1.amount.toString(),
                usdPrice: poolInfo.token1.usdPrice,
                usdValue: poolInfo.token1.usdValue.toString(),
            },
            usdTotalValue: poolInfo.usdTotalValue.toString(),
        }
    }
    return poolsInfoClone;
}

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
    bankValues: {
        totalBNB: s.bankValues.totalBNB.toString(), // decimals
        glbDebtVal: s.bankValues.glbDebtVal.toString(), // decimals
        glbDebtShare: s.bankValues.glbDebtShare.toString(), // decimals
        reservePool: s.bankValues.reservePool.toString(), // decimals
    },
    BNB: { // contextValues.bankValues
        lendingValue: s.BNB.lendingValue.toString(), // is totalBNB // decimals
        utilizationRate: s.BNB.utilizationRate.toString(), // is glbDebtVal / totalETH + reservePool // decimals
        lendingAPY: s.BNB.lendingAPY.toString(), // https://alphafinancelab.gitbook.io/alpha-homora/interest-rate-model // decimals
    },
    loans: {
        number: s.loans.number,
        value: s.loans.value.toString(),
    },
    tvl: s.tvl.toString(),
    poolsInfo: deepClonePoolsInfoState(s.poolsInfo),
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
type EventsBSCFilled = Ensure<EventsBSC, 'timestamp' | 'contextValues'> & {
    contextValues: IPositionWithSharesFilled;
}
// Generator that will paginate all events in batches
const BATCH_SIZE = 1000;
async function *batchedEventsAfterCurrent({ current }: IEventsPaginator) {
    let currentPage = 0;
    const currentQuery = (
        { where: { AND: [
            { event: { in: ['Work', 'Kill', 'AddDebt', 'RemoveDebt'] } },
            { blockNumber: { gte: current?.blockNumber || 0 }}
        ] }}
    );
    const eventsListCount = await prisma.eventsBSC.count(currentQuery as Parameters<typeof prisma.eventsBSC.count>[0]);
    const totalPages = Math.ceil(eventsListCount/BATCH_SIZE);
    while (currentPage < totalPages) {
        const eventsList = await prisma.eventsBSC.findMany({
            ...currentQuery as Parameters<typeof prisma.eventsBSC.findMany>[0],
            orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }],
            take: BATCH_SIZE,
            skip: currentPage * BATCH_SIZE,
        }) as EventsBSCFilled[];
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
        await prisma.indicatorsBSC.upsert({
            where: { timestamp },
            update: { indicators, lastEvent },
            create: { timestamp, indicators, lastEvent },
        });
    } catch(err: any) {
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
            if (ev.contextValues?.bankValues) {
                GLOBAL_STATE.bankValues.glbDebtVal = convertToBankContractDecimals(
                    new BigNumber(ev.contextValues.bankValues.glbDebt)
                );
                GLOBAL_STATE.bankValues.glbDebtShare = convertToBankContractDecimals(
                    new BigNumber(ev.contextValues.bankValues.glbDebtShare)
                );
                GLOBAL_STATE.bankValues.reservePool = convertToBankContractDecimals(
                    new BigNumber(ev.contextValues.bankValues.reservePool)
                );
                GLOBAL_STATE.bankValues.totalBNB = convertToBankContractDecimals(
                    new BigNumber(ev.contextValues.bankValues.totalBNB)
                );
                GLOBAL_STATE.BNB.lendingValue = convertToBankContractDecimals(
                    new BigNumber(ev.contextValues.bankValues.totalBNB)
                );
                // * [PARTIAL] ETH/BNB Utilization rate (glbDebtVal / totalBNB + reservePool)
                GLOBAL_STATE.BNB.utilizationRate = (
                    GLOBAL_STATE.bankValues.glbDebtVal.dividedBy(GLOBAL_STATE.bankValues.totalBNB.plus(GLOBAL_STATE.bankValues.reservePool))
                );
                GLOBAL_STATE.BNB.lendingAPY = borrowInterestRate(GLOBAL_STATE.BNB.utilizationRate)
                    .times(GLOBAL_STATE.BNB.utilizationRate)
                    .times(0.9) // 10% goes to reserve
            }
            if (ev.event === 'Work') {
                if (ev.contextValues.id > GLOBAL_STATE.positions.overTime) {
                    GLOBAL_STATE.positions.overTime = ev.contextValues.id;
                    // ev.contextValues.goblinPayload.lpPayload?.reserves
                }
                if (ev.positionId) {
                    const positionPrevState = await prisma.positionWithSharesBSC.findUnique({ where: { id: ev.positionId } });
                    const updatePosition = {
                        id: ev.positionId,
                        goblin: ev.contextValues.goblin,
                        owner: ev.contextValues.owner,
                        debtShare: convertToBankContractDecimals(new BigNumber(ev.contextValues.debtShare)).toString(),
                        goblinPayload: ev.contextValues.goblinPayload,
                        isActive: ev.contextValues.isActive,
                    }
                    await prisma.positionWithSharesBSC.upsert({
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
                    // * Number and value of positions refilled (Work event which id !== 0, the value is in loan argument)
                    if (positionPrevState
                        && (positionPrevState.isActive === true || positionPrevState.isActive === false)
                        && ev.contextValues.isActive
                        && (ev.returnValues as any)?.loan
                    ) {
                        GLOBAL_STATE.positions.refilled++;
                        GLOBAL_STATE.positions.refilledValue = GLOBAL_STATE.positions.refilledValue.plus(
                            convertToBankContractDecimals(new BigNumber((ev.returnValues as any).loan))
                        );
                    }
    
                } else {
                    throw new Error(`Work event without positionId should never happen!. pid: ${ev.positionId}, ${ev.transactionHash} ${ev.logIndex}`);
                }
            } else if (ev.event === 'Kill') {
                if (ev.positionId) {
                    const positionPrevState = await prisma.positionWithSharesBSC.findUnique({ where: { id: ev.positionId } });
                    if (!positionPrevState) {
                        throw new Error(`Kill event without positionPrevState should never happen!. pid: ${ev.positionId}, ${ev.transactionHash} ${ev.logIndex}`);
                    }
                    GLOBAL_STATE.positions.liquidated++;
                    // in Goblin contract, there will be lpToken and staking variable.
                    const goblinPayload = (positionPrevState.goblinPayload as IGoblinPayload & { lpPayload: IGoblinLPPayload; });
                    if (!goblinPayload.lpPayload || !goblinPayload.lpPayload.userInfo || !goblinPayload.lpPayload.reserves) {
                        throw new Error(`Kill event without lpPayload full info should never happen!. pid: ${ev.positionId}, ${ev.transactionHash} ${ev.logIndex}`);
                    }
                    // Calculate the position usd value that is liquidated
                    const [positionToken0Info, positionToken1Info] = getTokenAmountsFromPosition(ev.positionId, goblinPayload.lpPayload);
                    const [usdPriceToken0, usdPriceToken1] = getTokensPairUsdPrice(
                        goblinPayload.lpPayload.token0, goblinPayload.lpPayload.token1, ev.contextValues.coingecko
                    );
                    const usdValuePositionToken0 = positionToken0Info.amount.multipliedBy(usdPriceToken0);
                    const usdValuePositionToken1 = positionToken1Info.amount.multipliedBy(usdPriceToken1);
                    const usdValuePosition = usdValuePositionToken0.plus(usdValuePositionToken1);
                    GLOBAL_STATE.positions.liquidatedValue = GLOBAL_STATE.positions.liquidatedValue.plus(usdValuePosition);
                } else {
                    throw new Error(`Kill event without positionId should never happen!. pid: ${ev.positionId}, ${ev.transactionHash} ${ev.logIndex}`);
                }
            } else if (ev.event === 'AddDebt') {
                GLOBAL_STATE.loans.number++;
                if (!((ev.returnValues as any).debtShare)) {
                    throw new Error('Invalid addDebt with no debt share value');
                }
                /*
                NOTE!: from the contract, this is how share to val is calculated:
                    /// @dev Return the BNB debt value given the debt share. Be careful of unaccrued interests.
                    /// @param debtShare The debt share to be converted.
                    function debtShareToVal(uint debtShare) public view returns (uint) {
                        if (glbDebtShare == 0) return debtShare; // When there's no share, 1 share = 1 val.
                        return debtShare.mul(glbDebtVal).div(glbDebtShare);
                    }
                */
                // TODO: validate that the conversion is ok
                const returnDebtShare = convertToBankContractDecimals(
                    new BigNumber((ev.returnValues as any).debtShare)
                );
                const debShareValue = GLOBAL_STATE.bankValues.glbDebtShare.isEqualTo(new BigNumber(0))
                    ? returnDebtShare
                    : returnDebtShare.multipliedBy(GLOBAL_STATE.bankValues.glbDebtVal).dividedBy(GLOBAL_STATE.bankValues.glbDebtShare);
                GLOBAL_STATE.loans.value = (GLOBAL_STATE.loans.value.plus(debShareValue));
            } else if (ev.event === 'RemoveDebt') {
                const returnDebtShare = convertToBankContractDecimals(
                    new BigNumber((ev.returnValues as any).debtShare)
                );
                // TODO: Validate is ok to remove loans value on RemoveDebt event
                GLOBAL_STATE.loans.value = GLOBAL_STATE.loans.value.minus(returnDebtShare)
            }
            
            // Fill pools info and TVL
            if (ev.positionId && ev.contextValues?.goblinPayload?.lpPayload) {
                const valueInfo = getGoblinPooledValueInfo(
                    ev.positionId,
                    ev.contextValues.goblinPayload as (IGoblinPayload & { lpPayload: IGoblinLPPayload}),
                    ev.contextValues.coingecko,
                );
                GLOBAL_STATE.poolsInfo[valueInfo.lpToken] = {
                    address: valueInfo.lpToken,
                    usdTotalValue: valueInfo.usdTotalValue,
                    goblin: ev.contextValues.goblin, // the goblin address
                    token0:  {
                        coingeckoId: valueInfo.token0.coingeckoId || '',
                        amount: valueInfo.token0.amount,
                        usdPrice: valueInfo.token0.usdPrice,
                        usdValue: valueInfo.token0.usdValue,
                    },
                    token1:  {
                        coingeckoId: valueInfo.token1.coingeckoId || '',
                        amount: valueInfo.token1.amount,
                        usdPrice: valueInfo.token1.usdPrice,
                        usdValue: valueInfo.token1.usdValue,
                    }
                };
                GLOBAL_STATE.tvl = Object.values(GLOBAL_STATE.poolsInfo).reduce((prev, next) => prev.plus(next.usdTotalValue), new BigNumber(0));
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
