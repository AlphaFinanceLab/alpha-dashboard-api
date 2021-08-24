import BigNumber from 'bignumber.js';
import Web3 from 'web3';
import { EventData } from 'web3-eth-contract';
// import { ethers } from "ethers";
import { AbiItem } from 'web3-utils';
import BANK_ABI from '../abis/bank_abi.json';
import GOBLIN_UNI_ABI from '../abis/goblin_uni_abi.json';
import GOBLIN_SUSHI_ABI from '../abis/goblin_sushi_abi.json';
import STAKING_ABI from '../abis/staking_rewards_abi.json';
import MASTERCHEF_ABI from '../abis/masterchef_abi.json';
import LP_TOKEN_ABI from '../abis/lp_token_abi.json';
import { getCoinsInfoAndHistoryMarketData, getOnlyCoingeckoRelevantinfo, ICoinWithInfoAndUsdPrice, LP_COINS_ETH } from '../../lib/coingecko';
import { Ensure } from '../../lib/util';
import { getGoblinAddressPoolMap, ExchangeNames, Pool } from './contractsMap';

export type ICoinWithInfoAndUsdPriceFilled = Ensure<ICoinWithInfoAndUsdPrice, 'info' | 'marketData'>;
export type IPositionWithSharesFilled = Ensure<IPositionWithShares, 'goblinPayload' | 'bankValues'> & { coingecko: ICoinWithInfoAndUsdPriceFilled; }

export const BANK_ADDRESS = '0x67b66c99d3eb37fa76aa3ed1ff33e8e39f0b9c7a';

// https://etherscan.io/token/0x67b66c99d3eb37fa76aa3ed1ff33e8e39f0b9c7a
export const BANK_CONTRACT_DECIMALS = 18;

const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000';

export function convertToBankContractDecimals(n: BigNumber) {
    return new BigNumber(n).dividedBy(`1e${BANK_CONTRACT_DECIMALS}`);
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
    if (!coingeckoInfoToken0?.marketData || !coingeckoInfoToken1?.marketData) {
        throw new Error(`No coingecko token's info!. token0: ${token0} | token1: ${token1}`);
    }
    const usdPriceToken0 = coingeckoInfoToken0.marketData.market_data.current_price['usd'];
    const usdPriceToken1 = coingeckoInfoToken1.marketData.market_data.current_price['usd'];
    if (!usdPriceToken0 || !usdPriceToken1) {
        throw new Error(`No coingecko token's usd price!. token0: ${token0} | token1: ${token1}`);
    }
    return [usdPriceToken0, usdPriceToken1];
}

export function getTokenAmountsFromPosition(positionId: number, lpPayload: IGoblinLPPayload) {
    if (!lpPayload?.userInfo || !lpPayload?.reserves) {
        throw new Error(`Position.lpPayload full info missing. This should never happen!. pid: ${positionId}`);
    }
    const token0 = lpPayload.token0;
    const token1 = lpPayload.token1;
    const goblinLpDecimalsDivider = new BigNumber(10).pow(lpPayload.decimals);
    const goblinLpAmount = new BigNumber(lpPayload.userInfo.amount).dividedBy(goblinLpDecimalsDivider);
    const goblinLpTotalSupply = new BigNumber(lpPayload.totalSupply).dividedBy(goblinLpDecimalsDivider);
    const goblinLpShare = goblinLpAmount.dividedBy(goblinLpTotalSupply);
    const token0Map = LP_COINS_ETH.find(lp => lp.address === token0);
    const token1Map = LP_COINS_ETH.find(lp => lp.address === token1);
    const decimalsToken0 = token0Map?.decimals || 18;
    const decimalsToken1 = token1Map?.decimals|| 18;
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
) {
    const lp = gp.lpPayload;
    const [token0Info, token1Info] = getTokenAmountsFromPosition(pid, lp);
    const [usdPriceToken0, usdPriceToken1] = getTokensPairUsdPrice(lp.token0, lp.token1, coingecko);
    const usdPricePooledToken0 = token0Info.amount.multipliedBy(usdPriceToken0);
    const usdPricePooledToken1 = token1Info.amount.multipliedBy(usdPriceToken1);
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

async function getReservePool(web3: Web3, atBlockN?: number): Promise<string | null> {
    try {
        const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_ADDRESS);
        const reservePool: string = await contract.methods.reservePool().call({}, atBlockN);
        return reservePool;
    } catch (err) {
        console.error(`[ERROR reservePool] ${JSON.stringify({ msg: err.message })}`)
        return null;
    }
}

async function getGlbDebtVal(web3: Web3, atBlockN?: number): Promise<string | null> {
    try {
        const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_ADDRESS);
        const glbDebtVal: string = await contract.methods.glbDebtVal().call({}, atBlockN);
        return glbDebtVal;
    } catch (err) {
        console.error(`[ERROR getGlbDebtVal] ${JSON.stringify({ msg: err.message })}`)
        return null;
    }
}

async function getGlbDebtShare(web3: Web3, atBlockN?: number): Promise<string | null> {
    try {
        const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_ADDRESS);
        const glbDebtVal: string = await contract.methods.glbDebtShare().call({}, atBlockN);
        return glbDebtVal;
    } catch (err) {
        console.error(`[ERROR getGlbDebtShare] ${JSON.stringify({ msg: err.message })}`)
        return null;
    }
}

async function getShareNonPrivate(web3: Web3, goblinAddr: string, posId: number, atBLockN?: number){
    const position = web3.utils.keccak256((posId + 11).toString(16)); // .toString(16)
    const shares = await web3.eth.getStorageAt(goblinAddr, position, atBLockN || 'latest');
    return shares;
}

async function getTotalETH(web3: Web3, atBlockN?: number): Promise<string | null> {
    try {
        const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_ADDRESS);
        const totalETH: string = await contract.methods.totalETH().call({}, atBlockN);
        return totalETH;
    } catch (err) {
        console.error(`[ERROR getTotalETH] ${JSON.stringify({ msg: err.message })}`)
        return null;
    }
}

export async function syncBankValues(web3: Web3, atBlockN?: number) {
    try {
        const reservePool = await getReservePool(web3, atBlockN);
        const glbDebt = await getGlbDebtVal(web3, atBlockN);
        const glbDebtShare = await getGlbDebtShare(web3, atBlockN);
        const totalETH = await getTotalETH(web3, atBlockN);
        if (!reservePool || !glbDebt || !glbDebtShare || !totalETH) {
            throw new Error(`Invalid sync values ${JSON.stringify({ reservePool, glbDebt, glbDebtShare, totalETH, atBlockN })}`);
        }
        return { reservePool, glbDebt, glbDebtShare, totalETH };
    } catch (err) {
        console.error(`[ERROR syncBankValues] ${JSON.stringify({ msg: err.message })}`)
        return;
    }
}

type IBankPosition = {
    goblin: string; // address (if position is not found value is 0x0000000000000000000000000000000000000000)
    owner: string; // address (if position is not found value is 0x0000000000000000000000000000000000000000)
    debtShare: string; // uint256
}

// Given a position id, it queries the bank contract for the goblin, owner and debtShare properties
async function getBankPositionById(web3: Web3, positionId: number, atBlockN?: number): Promise<IBankPosition | null> {
    try {
        const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_ADDRESS);
        const position: IBankPosition = await contract.methods.positions(positionId).call({}, atBlockN);
        if (position.goblin === EMPTY_ADDRESS || position.owner === EMPTY_ADDRESS) {
            return null
        }
        return position;
    } catch (err) {
        console.error(`[ERROR getBankPositionById] ${JSON.stringify({ msg: err.message })}`)
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
    } | null;
    totalSupply: string;
    decimals: string;
    token0: string;
    token1: string;
};

async function getUniswapGoblinLPPayload(
    web3: Web3,
    lpToken: string,
    staking: string,
    globlinAddr: string,
    atBlockN?: number,
): Promise<IGoblinLPPayload | null> {
    try {
        const contractMC = new web3.eth.Contract((STAKING_ABI as unknown) as AbiItem, staking);
        // NOTE: this is different on sushi contracts, on sushi there is une method called userInfo that returns this two values
        const amount: string = await contractMC.methods.balanceOf(globlinAddr).call({}, atBlockN);
        const earned: string = await contractMC.methods.earned(globlinAddr).call({}, atBlockN);
        const contractLP = new web3.eth.Contract((LP_TOKEN_ABI as unknown) as AbiItem, lpToken);
        const totalSupply: string = await contractLP.methods.totalSupply().call({}, atBlockN);
        const decimals: string = await contractLP.methods.decimals().call({}, atBlockN);
        const token0: string = await contractLP.methods.token0().call({}, atBlockN);
        const token1: string = await contractLP.methods.token1().call({}, atBlockN);
        const reserves: IGoblinLPPayload['reserves'] = await contractLP.methods.getReserves().call({}, atBlockN);
        return { userInfo: { amount, rewardDebt: earned }, totalSupply, decimals, token0, token1, reserves };
    } catch (err) {
        console.error(`[ERROR getGoblinLPPayload] ${JSON.stringify({ msg: err.message })}`)
        return null;
    }
}

// calculate how much share the goblin have in that pool => goblinLpAmount/lpTotalSupply
async function getMastercheffGoblinLPPayload(
    web3: Web3,
    lpToken: string,
    masterChef: string,
    goblinPID: string,
    globlinAddr: string,
    atBlockN?: number,
): Promise<IGoblinLPPayload | null> {
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
        console.error(`[ERROR getGoblinLPPayload] ${JSON.stringify({ msg: err.message })}`)
        return null;
    }
}

export type IGoblinPayload = IGoblinPayloadSushi | IGoblinPayloadUni;
type IGoblinPayloadSushi = {
    shares: string;
    lpToken: string;
    masterChef: string;
    pid: string;
    lpPayload?: IGoblinLPPayload | null;
    dex: ExchangeNames.Sushi;
};
type IGoblinPayloadUni = {
    shares: string;
    lpToken: string;
    staking: string;
    lpPayload?: IGoblinLPPayload | null;
    dex: ExchangeNames.Uniswap;
};

// Given a position id, it queries goblin contract to get it's shares property
// it may query uniswap shares contract or masterchef contract depending on the addres pool map
async function getGoblinPayload(
    web3: Web3,
    goblinAddr: string,
    positionId: number,
    atBlockN?: number,
): Promise<IGoblinPayload | null> {
    try {
        const contractUni = new web3.eth.Contract((GOBLIN_UNI_ABI as unknown) as AbiItem, goblinAddr);
        const contractSushi = new web3.eth.Contract((GOBLIN_SUSHI_ABI as unknown) as AbiItem, goblinAddr);
        const poolMap = await getGoblinAddressPoolMap(goblinAddr);
        if (poolMap.exchange === ExchangeNames.Uniswap) {
            // NOTE: shares is not public value
            let shares = '';
            try {
                shares = await contractUni.methods.shares(positionId).call({}, atBlockN);
            } catch(err) {
                const sharesHexVal = await getShareNonPrivate(web3, goblinAddr, positionId, atBlockN);
                const sharesBN = new BigNumber(sharesHexVal);
                shares = sharesBN.toString();
                if (shares !== '0') {
                    console.warn('SHARES!', shares);
                } 
            }
            const lpToken: string = await contractUni.methods.lpToken().call({}, atBlockN);
            const staking: string = await contractUni.methods.staking().call({}, atBlockN);
            const lpPayload = await getUniswapGoblinLPPayload(web3, lpToken, staking, goblinAddr, atBlockN);
            return { shares, lpToken, staking, lpPayload, dex: ExchangeNames.Uniswap  };

        } else if (poolMap.exchange === ExchangeNames.Sushi) {
            // NOTE: shares is public at sushi contract
            const shares: string = await contractSushi.methods.shares(positionId).call({}, atBlockN);
            const lpToken: string = await contractSushi.methods.lpToken().call({}, atBlockN);
            const masterChef: string = await contractSushi.methods.masterChef().call({}, atBlockN);
            const pid: string = await contractSushi.methods.pid().call({}, atBlockN);
            const lpPayload = await getMastercheffGoblinLPPayload(web3, lpToken, masterChef, pid, goblinAddr, atBlockN);
            return { shares, lpToken, masterChef, pid, lpPayload, dex: ExchangeNames.Sushi };
        } else {
            console.error(`Position from exchange not handled (${poolMap.exchange}). goblinAddr: ${goblinAddr}, positionId: ${positionId}`);
            return null;
        }
    } catch (err) {
        console.error(`[ERROR getGoblinPayload] ${JSON.stringify({ msg: err.message, trace: err.stack })}`)
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
    bankValues?: { reservePool: string; glbDebt: string; glbDebtShare: string; totalETH: string; };
}

// Given a position id, it queries the bank and goblin contract to get the shares and know if it's an active position
export type IHandleIrrelevantPositions = (
    (w3: Web3, pid: number, bn?: number, tm?: number | null, bankPosition?: IBankPosition, pool?: Pool) => boolean
);
export async function getBankPositionContext(
    web3: Web3,
    positionId: number,
    atBlockN?: number,
    timestamp?: number | null,
    isIrrelevantPosition?: IHandleIrrelevantPositions,
) {
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
    const IGNORED_GOBLIN_ADDRESSES = [
        '0x9EED7274Ea4b614ACC217e46727d377f7e6F9b24',
        '0xA4BC927300F174155b95d342488Cb2431E7E864E',
    ]
    const isIgnoredGoblinAddr = IGNORED_GOBLIN_ADDRESSES.some(
        (addr => addr.toLowerCase() === bankPositionReturn.goblin?.toLowerCase())
    );
    const poolMap = isIgnoredGoblinAddr
        ? undefined
        : await getGoblinAddressPoolMap(bankPositionReturn.goblin);
    // NOTE: there are positions that can be considered irrelevant
    // due to that they belong to filed / removed contracts.
    // Or events from exchanges that are not implemented
    const isIrrelevant = isIrrelevantPosition
        ? (isIrrelevantPosition(web3, positionId, atBlockN, timestamp, bankPositionReturn, poolMap))
        : false;
    if (isIrrelevant) {
        // don't get goblin payload or coingecko info for irrelevant positions/events
        return positionWithShares;
    }
    const goblinPayload = await getGoblinPayload(web3, bankPositionReturn.goblin, positionId, atBlockN);
    if (timestamp && goblinPayload?.lpPayload) {
        const coinsToQuery = [
            { address: goblinPayload.lpPayload.token0, timestamp },
            { address: goblinPayload.lpPayload.token1, timestamp },
        ];
        positionWithShares.coingecko = getOnlyCoingeckoRelevantinfo(
            await getCoinsInfoAndHistoryMarketData('ETH', coinsToQuery)
        );
    }
    positionWithShares.goblinPayload = goblinPayload;
    positionWithShares.isActive = !!goblinPayload && goblinPayload.shares !== '0';
    return positionWithShares;
}

// NOTE: get kill events only works when requesting a size of about 20k blocks each bulk, if requested more,
// it might fail with timeout. Need to setup a strategy that sync's all events in batches.
const MAX_BLOCKS_TO_QUERY_EACH_REQ = 1e3; // 1k

// This block number is taken from when the bank contract was deployed to eth
// https://etherscan.io/tx/0xbe3c1b7b4b1d34654d7f63badfdab362c107c090bca5b972e8e674ad3b7bfcb2
const MIN_BLOCK = 11007158;
const MAX_BLOCK = 0;

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
    // NOTA: 
    // ANTES ERA CON PROXY ADDRS
    // const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_PROXY_ADDRESS);
    const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_ADDRESS);
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
            if (fromBlockLoop >= toBlockLoop) {
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