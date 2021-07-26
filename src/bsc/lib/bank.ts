import BigNumber from 'bignumber.js';
import Web3 from 'web3';
import { EventData } from 'web3-eth-contract';
// import { ethers } from "ethers";
import { AbiItem } from 'web3-utils';
import BANK_ABI from '../abis/bank_abi.json';
import GOBLIN_ABI from '../abis/goblin_abi.json';
import MASTERCHEF_ABI from '../abis/masterchef_abi.json';
import LP_TOKEN_ABI from '../abis/lp_token_abi.json';
import { getCoinsInfoAndHistoryMarketData, getOnlyCoingeckoRelevantinfo, ICoinWithInfoAndUsdPrice, LP_COINS } from '../../lib/coingecko';
import { Ensure } from '../../lib/util';

export type ICoinWithInfoAndUsdPriceFilled = Ensure<ICoinWithInfoAndUsdPrice, 'info' | 'marketData'>;
export type IPositionWithSharesFilled = Ensure<IPositionWithShares, 'goblinPayload' | 'bankValues'> & { coingecko: ICoinWithInfoAndUsdPriceFilled; }

export const BANK_PROXY_ADDRESS = '0x3bb5f6285c312fc7e1877244103036ebbeda193d';
export const BANK_IMPLEMENTATION_ADDRESS = '0x35cfacc93244fc94d26793cd6e68f59976380b3e';
// https://bscscan.com/address/0x3bb5f6285c312fc7e1877244103036ebbeda193d#readProxyContract
export const BANK_CONTRACT_DECIMALS = 18;

const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000';

export function convertToBankContractDecimals(n: BigNumber) {
    const decimalsDivider = new BigNumber(10).pow(BANK_CONTRACT_DECIMALS);
    return new BigNumber(n).dividedBy(decimalsDivider);
}

export function borrowInterestRate(utilization: BigNumber) {
    if (utilization.lt(new BigNumber(0.8))) {
        return utilization.times(new BigNumber(0.1)).div(new BigNumber(0.8))
    }
    if (utilization.lt(new BigNumber(0.9))) {
        return new BigNumber(0.1);
    }
    return new BigNumber(0.1).plus(
        utilization.minus(new BigNumber(0.9)).times(new BigNumber(0.4)).div(new BigNumber(0.1))
    );
}

export function getTokensPairUsdPrice(token0: string, token1: string, cgData: IPositionWithSharesFilled['coingecko']) {
    const coingeckoInfoToken0 = cgData.find(c => c.address === token0);
    const coingeckoInfoToken1 = cgData.find(c => c.address === token1);
    if (!coingeckoInfoToken0?.marketData || !coingeckoInfoToken1?.marketData) {
        throw new Error(`No coingecko token's info!. token0: ${token0} | token1: ${token1}`);
    }
    const usdPriceToken0 = coingeckoInfoToken0.marketData.market_data.current_price['usd'];
    const usdPriceToken1 = coingeckoInfoToken1.marketData.market_data.current_price['usd'];
    if (!usdPriceToken0 || !usdPriceToken1) {
        throw new Error(`No coingecko token's usd price!. token0: ${token0} | token1: ${token1}`);
    }
    return [usdPriceToken0, usdPriceToken1];
}

export function getTokenAmountsFromPosition(positionId: number, lpPayload: IGoblinLPPayload) {
    // const lpPayload = position.goblinPayload?.lpPayload;
    if (!lpPayload?.userInfo || !lpPayload?.reserves) {
        throw new Error(`Position.lpPayload full info missing. This should never happen!. pid: ${positionId}`);
    }
    const token0 = lpPayload.token0;
    const token1 = lpPayload.token1;
    const goblinLpDecimalsDivider = new BigNumber(10).pow(lpPayload.decimals);
    const goblinLpAmount = new BigNumber(lpPayload.userInfo.amount).dividedBy(goblinLpDecimalsDivider);
    const goblinLpTotalSupply = new BigNumber(lpPayload.totalSupply).dividedBy(goblinLpDecimalsDivider);
    const goblinLpShare = goblinLpAmount.dividedBy(goblinLpTotalSupply);
    const token0Map = LP_COINS.find(lp => lp.address === token0);
    const token1Map = LP_COINS.find(lp => lp.address === token1);
    const decimalsToken0 = token0Map?.decimals || 18;
    const decimalsToken1 = token1Map?.decimals|| 18;
    const coingeckoIdToken0 = token0Map?.coingekoId;
    const coingeckoIdToken1 = token1Map?.coingekoId;
    const decimalsDividerToken0 = new BigNumber(10).pow(decimalsToken0);
    const decimalsDividerToken1 = new BigNumber(10).pow(decimalsToken1);
    const reservesToken0 = new BigNumber(lpPayload.reserves._reserve0).dividedBy(decimalsDividerToken0);
    const reservesToken1 = new BigNumber(lpPayload.reserves._reserve1).dividedBy(decimalsDividerToken1);
    const amountToken0 = reservesToken0.multipliedBy(goblinLpShare);
    const amountToken1 = reservesToken1.multipliedBy(goblinLpShare);
    
    return [
        { amount: amountToken0, coingeckoId: coingeckoIdToken0 },
        { amount: amountToken1, coingeckoId: coingeckoIdToken1 },
    ];
}

export function getGoblinPooledValueInfo(
    pid: number,
    gp: (IPositionWithSharesFilled['goblinPayload'] & { lpPayload: IGoblinLPPayload; }), 
    coingecko: IPositionWithSharesFilled['coingecko'],
    // token0: string,
    // token1: string,
) {
    const lp = gp.lpPayload;
    // const token0 = lpPayload.token0;
    // const token1 = lpPayload.token1;
    const [token0Info, token1Info] = getTokenAmountsFromPosition(pid, lp);
    const [usdPriceToken0, usdPriceToken1] = getTokensPairUsdPrice(lp.token0, lp.token1, coingecko);
    const usdPricePooledToken0 = token0Info.amount.multipliedBy(usdPriceToken0);
    const usdPricePooledToken1 = token1Info.amount.multipliedBy(usdPriceToken1);
    // goblinPayload.coingecko[0].info!.symbol
    return {
        lpToken: gp.lpToken,
        usdTotalValue: usdPricePooledToken0.plus(usdPricePooledToken1),
        token0: {
            coingeckoId: token0Info.coingeckoId,
            address: lp.token0,
            amount: token0Info.amount,
            usdPrice: usdPriceToken0,
            usdValue: usdPricePooledToken0,
        },
        token1: {
            coingeckoId: token1Info.coingeckoId,
            address: lp.token1,
            amount: token1Info.amount,
            usdPrice: usdPriceToken1,
            usdValue: usdPricePooledToken1,
        },
    };
}

async function getReservePool(web3: Web3, atBlockN?: number): Promise<string | null> {
    try {
        const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_PROXY_ADDRESS);
        const reservePool: string = await contract.methods.reservePool().call({}, atBlockN);
        return reservePool;
    } catch (err) {
        console.error(`[ERROR reservePool] ${JSON.stringify({ msg: err.message, stack: err.stack }, null, 2)}`)
        return null;
    }
}

async function getGlbDebtVal(web3: Web3, atBlockN?: number): Promise<string | null> {
    try {
        const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_PROXY_ADDRESS);
        const glbDebtVal: string = await contract.methods.glbDebtVal().call({}, atBlockN);
        return glbDebtVal;
    } catch (err) {
        console.error(`[ERROR getGlbDebtVal] ${JSON.stringify({ msg: err.message, stack: err.stack }, null, 2)}`)
        return null;
    }
}

async function getTotalBNB(web3: Web3, atBlockN?: number): Promise<string | null> {
    try {
        const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_PROXY_ADDRESS);
        const totalBNB: string = await contract.methods.totalBNB().call({}, atBlockN);
        return totalBNB;
    } catch (err) {
        console.error(`[ERROR getTotalBNB] ${JSON.stringify({ msg: err.message, stack: err.stack }, null, 2)}`)
        return null;
    }
}

export async function syncBankValues(web3: Web3, atBlockN?: number) {
    try {
        const reservePool = await getReservePool(web3, atBlockN);
        const glbDebt = await getGlbDebtVal(web3, atBlockN);
        const totalBNB = await getTotalBNB(web3, atBlockN);
        if (!reservePool || !glbDebt || !totalBNB) {
            throw new Error(`Invalid sync values ${JSON.stringify({ reservePool, glbDebt, totalBNB, atBlockN })}`);
        }
        return { reservePool, glbDebt, totalBNB };
    } catch (err) {
        console.error(`[ERROR syncBankValues] ${JSON.stringify({ msg: err.message, stack: err.stack }, null, 2)}`)
        return;
    }
}

// Queries the next position id from the bank contract
export async function getBankNextPositionId(web3: Web3, atBlockN?: number): Promise<string | null> {
    try {
        const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_PROXY_ADDRESS);
        const nextPositionID: string = await contract.methods.nextPositionID().call({}, atBlockN);
        return nextPositionID;
    } catch (err) {
        console.error(`[ERROR getBankNextPositionId] ${JSON.stringify({ msg: err.message, stack: err.stack }, null, 2)}`)
        return null;
    }
}

type IBankPosition = {
    goblin: string; // address (if position is not found value is 0x0000000000000000000000000000000000000000)
    owner: string; // address (if position is not found value is 0x0000000000000000000000000000000000000000)
    debtShare: string; // uint256
}
// Given a position id, it queries the bank contract for the goblin, owner and debtShare properties
async function getBankPositionById(web3: Web3, positionId: number, atBlockN?: number): Promise<IBankPosition | null> {
    try {
        const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_PROXY_ADDRESS);
        const position: IBankPosition = await contract.methods.positions(positionId).call({}, atBlockN);
        if (position.goblin === EMPTY_ADDRESS || position.owner === EMPTY_ADDRESS) {
            return null
        }
        return position;
    } catch (err) {
        console.error(`[ERROR getBankPositionById] ${JSON.stringify({ msg: err.message, stack: err.stack }, null, 2)}`)
        return null;
    }
}

export type IGoblinLPPayload = {
    userInfo?: {
        amount: string;
        rewardDebt: string;
    } | null;
    reserves?: {
        _blockTimestampLast: string;
        _reserve0: string;
        _reserve1: string;
    } | null;
    totalSupply: string;
    decimals: string;
    token0: string;
    token1: string;
};
// calculate how much share the goblin have in that pool => goblinLpAmount/lpTotalSupply
async function getGoblinLPPayload(
    web3: Web3,
    lpToken: string,
    masterChef: string,
    goblinPID: string,
    globlinAddr: string,
    atBlockN?: number,
): Promise<IGoblinLPPayload | null> {
    try {
        const contractMC = new web3.eth.Contract((MASTERCHEF_ABI as unknown) as AbiItem, masterChef);
        const userInfo: IGoblinLPPayload['userInfo'] = await contractMC.methods.userInfo(goblinPID, globlinAddr).call({}, atBlockN);
        const contractLP = new web3.eth.Contract((LP_TOKEN_ABI as unknown) as AbiItem, lpToken);
        const totalSupply: string = await contractLP.methods.totalSupply().call({}, atBlockN);
        const decimals: string = await contractLP.methods.decimals().call({}, atBlockN);
        const token0: string = await contractLP.methods.token0().call({}, atBlockN);
        const token1: string = await contractLP.methods.token1().call({}, atBlockN);
        const reserves: IGoblinLPPayload['reserves'] = await contractLP.methods.getReserves().call({}, atBlockN);
        return { userInfo, totalSupply, decimals, token0, token1, reserves };
    } catch (err) {
        console.error(`[ERROR getGoblinLPPayload] ${JSON.stringify({ msg: err.message, stack: err.stack }, null, 2)}`)
        return null;
    }
}

export type IGoblinPayload = {
    shares: string;
    lpToken: string;
    masterChef: string;
    pid: string;
    lpPayload?: IGoblinLPPayload | null;
};

// Given a position id, it queries goblin contract to get it's shares property
async function getGoblinPayload(
    web3: Web3,
    goblinAddr: string,
    positionId: number,
    atBlockN?: number,
): Promise<IGoblinPayload | null> {
    try {
        const contract = new web3.eth.Contract((GOBLIN_ABI as unknown) as AbiItem, goblinAddr);
        const shares: string = await contract.methods.shares(positionId).call({}, atBlockN);
        const lpToken: string = await contract.methods.lpToken().call({}, atBlockN);
        const masterChef: string = await contract.methods.masterChef().call({}, atBlockN);
        const pid: string = await contract.methods.pid().call({}, atBlockN);
        const lpPayload = await getGoblinLPPayload(web3, lpToken, masterChef, pid, goblinAddr, atBlockN);
        return { shares, lpToken, masterChef, pid, lpPayload };
    } catch (err) {
        console.error(`[ERROR getGoblinPayload] ${JSON.stringify({ msg: err.message, stack: err.stack }, null, 2)}`)
        return null;
    }
}

export type IPositionWithShares = {
    id: number;
    goblin: string;
    owner: string;
    debtShare: string;
    goblinPayload: IGoblinPayload | null;
    isActive: boolean;
    coingecko?: ReturnType<typeof getOnlyCoingeckoRelevantinfo>;
    bankValues?: { reservePool: string; glbDebt: string; totalBNB: string; };
}
// Given a position id, it queries the bank and goblin contract to get the shares and know if it's an active position
export async function getBankPositionContext(web3: Web3, positionId: number, atBlockN?: number, timestamp?: number | null) {
    const bankPositionReturn = await getBankPositionById(web3, positionId, atBlockN);
    if (!bankPositionReturn) { return null; }
    const bankValues = await syncBankValues(web3, atBlockN);
    const positionWithShares: IPositionWithShares = {
        id: positionId,
        goblin: bankPositionReturn.goblin,
        debtShare: bankPositionReturn.debtShare,
        owner: bankPositionReturn.owner,
        goblinPayload: null,
        isActive: false,
        bankValues,
    };
    const goblinPayload = await getGoblinPayload(web3, bankPositionReturn.goblin, positionId, atBlockN);

    if (timestamp && goblinPayload?.lpPayload) {
        const coinsToQuery = [
            { address: goblinPayload.lpPayload.token0, timestamp },
            { address: goblinPayload.lpPayload.token1, timestamp },
        ];
        positionWithShares.coingecko = getOnlyCoingeckoRelevantinfo(
            await getCoinsInfoAndHistoryMarketData('BSC', coinsToQuery)
        );
    }
    positionWithShares.goblinPayload = goblinPayload;
    positionWithShares.isActive = !!goblinPayload && goblinPayload.shares !== '0';
    return positionWithShares;
}

// NOTE: get kill events only works when requesting a size of about 20k blocks each bulk, if requested more,
// it might fail with timeout. Need to setup a strategy that sync's all events in batches.
const MAX_BLOCKS_TO_QUERY_EACH_REQ = 1e3; // 10k

// This block number is taken from when the bank contract was deployed to bsc
// https://bscscan.com/address/0x35cfacc93244fc94d26793cd6e68f59976380b3e
const MIN_BLOCK = 5732773;
const MAX_BLOCK = 0; // 8880893;

type IValidEventNames = 'AddDebt' | 'Approval' | 'Kill' | 'RemoveDebt' | 'Transfer' | 'Work' | 'allEvents';
type IBlockRange = { fromBlock: number, toBlock: number };
export type IGetEventCallback = (ed: EventData[]) => Promise<void>;
export type IGetErrorCallback = (range: IBlockRange, err?: Error, ) => Promise<void>;
export async function getEvents(
    web3: Web3,
    eventName: IValidEventNames,
    onGetEventCallback: IGetEventCallback,
    fromBlock: number,
    toBlock: number,
) {
    const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_PROXY_ADDRESS);
    const eventProps: IBlockRange = { fromBlock, toBlock };
    const eventsReturned = await contract.getPastEvents(eventName, eventProps);
    if (eventsReturned.length) {
        console.log(`Block range (${fromBlock} - ${toBlock}). Events: ${eventsReturned.length}`);
        await onGetEventCallback(eventsReturned);
    } else {
        console.log(`Block range (${fromBlock} - ${toBlock})is empty of events.`);
    }
}

export async function getEventsInBatches(
    web3: Web3,
    eventName: IValidEventNames,
    onGetEventCallback: IGetEventCallback,
    onGetErrorCallback: IGetErrorCallback,
    fromBlock: number,
    toBlock: number | 'latest' = 'latest',
) {
    let endBlock = toBlock === 'latest' ? (await web3.eth.getBlockNumber()) : toBlock;
    if (MAX_BLOCK && endBlock > MAX_BLOCK) { 
        endBlock = MAX_BLOCK;
    }
    const startingBlock = fromBlock < MIN_BLOCK ? MIN_BLOCK : fromBlock
    let totalBlocks = (endBlock-startingBlock);
    let requestErrors = 0;
    if (totalBlocks > MAX_BLOCKS_TO_QUERY_EACH_REQ) {
        let fromBlockLoop = startingBlock;
        let toBlockLoop = startingBlock + MAX_BLOCKS_TO_QUERY_EACH_REQ;
        while (totalBlocks) {
            totalBlocks = totalBlocks - (toBlockLoop-fromBlockLoop);
            if (fromBlockLoop >= toBlockLoop) {
                break;
            }
            try {
                await getEvents(web3, eventName, onGetEventCallback, fromBlockLoop, toBlockLoop);
                fromBlockLoop = toBlockLoop + 1;
                const nextBlockLoopEnd = fromBlockLoop + MAX_BLOCKS_TO_QUERY_EACH_REQ;
                toBlockLoop = nextBlockLoopEnd > endBlock ? endBlock : nextBlockLoopEnd;
            } catch(e) {
                requestErrors++;
                await onGetErrorCallback({ fromBlock: fromBlockLoop, toBlock: toBlockLoop }, e);
                fromBlockLoop = toBlockLoop + 1;
                const nextBlockLoopEnd = fromBlockLoop + MAX_BLOCKS_TO_QUERY_EACH_REQ;
                toBlockLoop = nextBlockLoopEnd > endBlock ? endBlock : nextBlockLoopEnd;
            }
        }
        return requestErrors;
    } else {
        try {
            await getEvents(web3, eventName, onGetEventCallback, startingBlock, endBlock)
        } catch(e) {
            requestErrors++;
            await onGetErrorCallback({ fromBlock: startingBlock, toBlock: endBlock }, e);
        } finally {
            return requestErrors;
        }
    }
}