import Web3 from 'web3';
import { startOfHour, endOfHour, addHours, getUnixTime } from 'date-fns';
import { BigNumber } from "bignumber.js";
import { PrismaClient, EventsBSC } from '@prisma/client';
// import { delay } from '../common';
import {
    syncBankValues,
    IPositionWithShares,
} from './lib/bank';
import { ICoinWithInfoAndUsdPrice, LP_COINS } from '../lib/coingecko';



const prisma = new PrismaClient();
// ---------------------------------------
//                  TODO
// ---------------------------------------
// * Number of positions over time
//    (nextPositionID variable in Bank contract)
// ---------------------------------------
// * Number of active/inactive positions
//    (Need to loop over positions variable in Bank contract and combine with shares variable in each Goblin contract.
//    If shares[posId] > 0 then active else inactive)
// ---------------------------------------
// * Number and value of positions liquidated (Kill event)
// ---------------------------------------
// * Number and value of positions refilled (Work event which id !== 0, the value is in loan argument)
// ---------------------------------------
// * [PARTIAL] ETH/BNB Lending value (totalBNB variable)
// ---------------------------------------
// * [PARTIAL] ETH/BNB Utilization rate (glbDebtVal / totalBNB + reservePool)
// ---------------------------------------
// * ETH/BNB Lending APY (Formula in image)
// ---------------------------------------
// * Number and value of loans originated (Count AddDebt event)
// ---------------------------------------
// * Pools TVL. (LP tokens value holding by each Goblin (1 goblin = 1 pool))
// ---------------------------------------
// * ALPHA/ibETH pools APY, liquidity and volume
//    (lpTokenAddress : 0x411a9b902f364817a0f9c4261ce28b5566a42875
//    APY = trading fee APY (get avg volume x days -> convert to fee (0.3%) then compare to lp price)
//    Volume = swap activity)
// ---------------------------------------

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
        reservePool: new BigNumber(0),
    },
    bnb: {
        lendingValue: new BigNumber(0),
        utilizationRate: new BigNumber(0),
        lendingAPY: 0,
    },
    loans: {
        number: 0,
        value: new BigNumber(0),
    },
    tvl: new BigNumber(0),
    pools: {
        "ALPHA/ibETH": {
            apy: 0,
            volume: new BigNumber(0),
        },
    },
});

type IAggregationState = ReturnType<typeof getInitialAggregationState>;
const deepCloneState = (s: IAggregationState) => ({
    positions: {
        overTime: s.positions.overTime,
        active: s.positions.active,
        inactive: s.positions.inactive,
        liquidated: s.positions.liquidated,
        liquidatedValue: new BigNumber(s.positions.liquidatedValue),
        refilled: s.positions.refilled,
        refilledValue: new BigNumber(s.positions.refilledValue),
    },
    bankValues: {
        totalBNB: new BigNumber(s.bankValues.totalBNB),
        glbDebtVal: new BigNumber(s.bankValues.glbDebtVal),
        reservePool: new BigNumber(s.bankValues.reservePool),
    },
    bnb: { // contextValues.bankValues
        lendingValue: new BigNumber(s.bnb.lendingValue), // is totalBNB
        utilizationRate: new BigNumber(s.bnb.utilizationRate), // is glbDebtVal / totalETH + reservePool
        lendingAPY: s.bnb.lendingAPY, // https://alphafinancelab.gitbook.io/alpha-homora/interest-rate-model
    },
    loans: {
        number: s.loans.number,
        value: new BigNumber(s.loans.value),
    },
    tvl: new BigNumber(s.tvl),
    pools: {
        "ALPHA/ibETH": {
            apy: s.pools['ALPHA/ibETH'].apy,
            volume: new BigNumber(s.pools['ALPHA/ibETH'].volume),
        },
    },
});


// Valid events: AddDebt, RemoveDebt, Work, Kill, Transfer, Approval)
type IEventsPaginator = { take: number; skip: number; current?: { blockNumber: number; logIndex: number; }};
type RequiredNotNull<T> = {[P in keyof T]: NonNullable<T[P]>};
type Ensure<T, K extends keyof T> = T & RequiredNotNull<Pick<T, K>>
type ICoinWithInfoAndUsdPriceFilled = Ensure<ICoinWithInfoAndUsdPrice, 'info' | 'marketData'>;
type IPositionWithSharesFilled = Ensure<IPositionWithShares, 'goblinPayload' | 'bankValues'> & { coingecko: ICoinWithInfoAndUsdPriceFilled; }
type EventsBSCFilled = Ensure<EventsBSC, 'timestamp' | 'contextValues'> & {
    contextValues: IPositionWithSharesFilled;
}
export async function getEventsToAggregate({ take, skip, current }: IEventsPaginator) {
    // TODO: First validate there is no event without timestamp, nor incomplete context or return values
    const currentQuery: Parameters<typeof prisma.eventsBSC.findMany>[0] = current
        ? { where: { blockNumber: { gte: current.blockNumber }} }
        : {};
    const eventsList = await prisma.eventsBSC.findMany({
        ...currentQuery,
        orderBy: { blockNumber: 'asc', logIndex: 'asc' },
        take,
        skip, 
    }) as EventsBSCFilled[];
    const eventsToProcess = current
        ? eventsList.filter(ev => !(ev.blockNumber === current.blockNumber && ev.logIndex <= current.logIndex))
        : eventsList
    return eventsToProcess

    // INITIAL_AGGREGATOR_STATE
}

function getTokenAmountsFromPosition(position: IPositionWithSharesFilled) {
    const lpPayload = position.goblinPayload?.lpPayload;
    if (!lpPayload?.userInfo || !lpPayload?.reserves) {
        throw new Error(`Position.lpPayload full info missing. This should never happen!. pid: ${position.id}`);
    }
    const token0 = lpPayload.token0;
    const token1 = lpPayload.token1;
    // prevGoblinPayload.goblinPayload.lpPayload
    const goblinLpDecimalsDivider = new BigNumber(10).pow(lpPayload.decimals);
    const goblinLpAmount = new BigNumber(lpPayload.userInfo.amount).dividedBy(goblinLpDecimalsDivider);
    const goblinLpTotalSupply = new BigNumber(lpPayload.totalSupply).dividedBy(goblinLpDecimalsDivider);
    const goblinLpShare = goblinLpAmount.dividedBy(goblinLpTotalSupply)
    const decimalsToken0 = LP_COINS.find(lp => lp.address === token0)?.decimals || 18;
    const decimalsToken1 = LP_COINS.find(lp => lp.address === token1)?.decimals|| 18;
    const decimalsDividerToken0 = new BigNumber(10).pow(decimalsToken0);
    const decimalsDividerToken1 = new BigNumber(10).pow(decimalsToken1);
    const reservesToken0 = new BigNumber(lpPayload.reserves._reserve0).dividedBy(decimalsDividerToken0);
    const reservesToken1 = new BigNumber(lpPayload.reserves._reserve1).dividedBy(decimalsDividerToken1);
    const amountToken0 = reservesToken0.multipliedBy(goblinLpShare);
    const amountToken1 = reservesToken1.multipliedBy(goblinLpShare);
    return [amountToken0, amountToken1];
}

function getTokensPairUsdValue(token0: string, token1: string, cgData: IPositionWithSharesFilled['coingecko']) {
    const coingeckoInfoToken0 = cgData.find(c => c.address === token0);
    const coingeckoInfoToken1 = cgData.find(c => c.address === token1);
    if (!coingeckoInfoToken0?.marketData || !coingeckoInfoToken1?.marketData) {
        throw new Error(`No coingecko token's info!. token0: ${token0} | token1: ${token1}`);
    }
    const usdValueToken0 = coingeckoInfoToken0.marketData.market_data.current_price['usd'];
    const usdValueToken1 = coingeckoInfoToken1.marketData.market_data.current_price['usd'];
    if (!usdValueToken0 || !usdValueToken1) {
        throw new Error(`No coingecko token's usd price!. token0: ${token0} | token1: ${token1}`);
    }
    return [usdValueToken0, usdValueToken1];
}

const SNAPSHOTS_CACHE: {[unixTimestamp: number]: IAggregationState; } = {}

function addSnapshot(d: Date, cache: IAggregationState) {
    const unixTime = getUnixTime(d);
    SNAPSHOTS_CACHE[unixTime] = deepCloneState(cache);
}

export async function fillHistoricalSnapshots() {
    const GLOBAL_STATE = getInitialAggregationState();
    const paginator: IEventsPaginator = { take: 1000, skip: 0, current: undefined };
    const eventsPage = await getEventsToAggregate(paginator);
    if (!eventsPage.length) { return; }
    let startOfPeriod = startOfHour(new Date(eventsPage[0].timestamp * 1000));
    let endOfPeriod = endOfHour(startOfPeriod);

    for (const ev of eventsPage) {
        const evDate = new Date(ev.timestamp * 1000);
        while (evDate.getTime() > endOfPeriod.getTime()) {
            addSnapshot(startOfPeriod, GLOBAL_STATE); // TODO!!!!!
            startOfPeriod = addHours(startOfPeriod, 1);
            endOfPeriod = endOfHour(startOfPeriod);
        }
        if (ev.event === 'Work') {
            if (ev.contextValues.id > GLOBAL_STATE.positions.overTime) {
                GLOBAL_STATE.positions.overTime = ev.contextValues.id
            }
            if (ev.positionId) {
                const positionPrevState = await prisma.positionWithSharesBSC.findUnique({ where: { id: ev.positionId } });
                await prisma.positionWithSharesBSC.upsert({
                    where: { id: ev.positionId },
                    update: ev.contextValues,
                    create: ev.contextValues,
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
                // refilled: 0,
                // refilledValue: new BigNumber(0),
                // TODO: Define this better
            } else {
                throw new Error(`Work event without positionId should never happen!. pid: ${ev.positionId}, ${ev.transactionHash} ${ev.logIndex}`);
            }
        } else if (ev.event === 'Kill') {
            // liquidated: 0,
            // liquidatedValue: new BigNumber(0),
            if (ev.positionId) {
                const positionPrevState = await prisma.positionWithSharesBSC.findUnique({ where: { id: ev.positionId } });
                if (!positionPrevState) {
                    throw new Error(`Kill event without positionPrevState should never happen!. pid: ${ev.positionId}, ${ev.transactionHash} ${ev.logIndex}`);
                }
                GLOBAL_STATE.positions.liquidated++;
                // in Goblin contract, there will be lpToken and staking variable.
                const prevPositionContext = (positionPrevState.goblinPayload as IPositionWithSharesFilled);
                const lpPayload = prevPositionContext?.goblinPayload?.lpPayload;
                if (!lpPayload?.userInfo || !lpPayload?.reserves) {
                    throw new Error(`Kill event without lpPayload full info should never happen!. pid: ${ev.positionId}, ${ev.transactionHash} ${ev.logIndex}`);
                }
                const token0 = lpPayload.token0;
                const token1 = lpPayload.token1;
                const [amountToken0, amountToken1] = getTokenAmountsFromPosition(prevPositionContext);
                const [usdValueToken0, usdValueToken1] = getTokensPairUsdValue(token0, token1, ev.contextValues.coingecko);
                const usdPooledValueToken0 = amountToken0.multipliedBy(usdValueToken0);
                const usdPooledValueToken1 = amountToken1.multipliedBy(usdValueToken1);
                const usdPooledValue = usdPooledValueToken0.plus(usdPooledValueToken1);
                GLOBAL_STATE.positions.liquidatedValue = GLOBAL_STATE.positions.liquidatedValue.plus(usdPooledValue);
            } else {
                throw new Error(`Kill event without positionId should never happen!. pid: ${ev.positionId}, ${ev.transactionHash} ${ev.logIndex}`);
            }
        }
        // else if (ev.event === 'AddDebt') {

        // } else if (ev.event === 'RemoveDebt') {
        // }
    }
    
}



// const prisma = new PrismaClient();
const NODE_URL = "https://speedy-nodes-nyc.moralis.io/6df2e03496e250e048360175/bsc/mainnet";

// blockNumber,
// reservePool,
// glbDebt,
// totalBNB,

async function main() {
    const web3HttpProvider = new Web3.providers.HttpProvider(NODE_URL, { keepAlive: true, timeout: 0, });
    let web3 = new Web3(web3HttpProvider);
    web3.eth.transactionBlockTimeout = 0;
    web3.eth.transactionPollingTimeout = 0;
    const blockNumber = await web3.eth.getBlockNumber();

    // Number of positions over time (nextPositionID variable in Bank contract)
    const bankValues = await syncBankValues(web3);

    if (!bankValues) {
        throw new Error(`Can't get all bank values correctly.`);
    }
    return { blockNumber, ...bankValues };
}

main().then(res => console.log(res));