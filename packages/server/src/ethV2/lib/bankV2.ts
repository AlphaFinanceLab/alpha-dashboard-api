import BigNumber from 'bignumber.js';
import Web3 from 'web3';
import { EventData } from 'web3-eth-contract';
import { AbiItem } from 'web3-utils';
import BANK_ABI from '../abis/bank_v2_abi.json';
import { getCoinsInfoAndHistoryMarketData, getOnlyCoingeckoRelevantinfo, ICoinWithInfoAndUsdPrice, LP_COINS_ETH } from '../../lib/coingecko';
import { Ensure, IUnwrapPromise } from '../../lib/util';
import { getPoolFromWToken } from './decodePool';
import LP_TOKEN_ABI from '../../eth/abis/lp_token_abi.json';

export type ICoinWithInfoAndUsdPriceFilled = Ensure<ICoinWithInfoAndUsdPrice, 'info' | 'marketData'>;
// export type IPositionWithSharesFilled = Ensure<IPositionWithShares, 'goblinPayload' | 'bankValues'> & { coingecko: ICoinWithInfoAndUsdPriceFilled; }

export const BANK_ADDRESS = '0xba5eBAf3fc1Fcca67147050Bf80462393814E54B';

export const BANK_ADDRESS_PROXIED = '0x99c666810ba4bf9a4c2318ce60cb2c279ee2cf56'

// https://etherscan.io/token/0x67b66c99d3eb37fa76aa3ed1ff33e8e39f0b9c7a
export const BANK_CONTRACT_DECIMALS = 18;

export enum ExchangeNamesV2 {
    Sushiswap = "Sushiswap",
    Uniswap = "Uniswap",
}

// Homora v2 : 0xba5eBAf3fc1Fcca67147050Bf80462393814E54B -> positionInfo, pools info

type IBankV2Position = {
    owner: string; // address (if position is not found value is 0x0000000000000000000000000000000000000000)
    collToken: string; // address (if position is not found value is 0x0000000000000000000000000000000000000000)
    collId: string;
    collateralSize: string; // uint256
}
async function getPositionInfo(web3: Web3, positionId: number, atBlockN?: number): Promise<IBankV2Position | null> {
    try {
        const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_ADDRESS);
        const positionInfo: IBankV2Position = await contract.methods.getPositionInfo(positionId).call({}, atBlockN);
        return positionInfo;
    } catch (err) {
        console.error(`[ERROR bankv2 positionInfo] ${JSON.stringify({ msg: err.message })}`)
        return null;
    }
}

export async function getNextPositionId(web3: Web3, atBlockN?: number): Promise<string | null> {
    try {
        const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_ADDRESS);
        const positionInfo: string = await contract.methods.nextPositionId().call({}, atBlockN);
        return positionInfo;
    } catch (err) {
        console.error(`[ERROR bankv2 nextPositionId] ${JSON.stringify({ msg: err.message })}`)
        return null;
    }
}

type IV2BankInfo = {
    isListed: boolean;
    index: number;
    cToken: string; //    address :  0x226F3738238932BA0dB2319a8117D9555446102f
    reserve: string; //   uint256 :  1033972476746257654190
    totalDebt: string; //    uint256 :  104276367934065255839452
    totalShare: string; //   uint256 :  98312539647620654897431
}
export async function getBankInfo(web3: Web3, rewardAddress: string, atBlockN?: number): Promise<IV2BankInfo | null> {
    try {
        const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_ADDRESS);
        const bankInfo: IV2BankInfo = await contract.methods.getBankInfo(rewardAddress).call({}, atBlockN);
        return bankInfo;
    } catch (err) {
        console.error(`[ERROR bankv2 getBankInfo] ${JSON.stringify({ msg: err.message, rewardAddress })}`)
        return null;
    }
}

export async function getBankPositionContext(
    web3: Web3,
    positionId: number,
    atBlockN?: number,
    timestamp?: number | null,
) {
    const positionInfo = await getPositionInfo(web3, positionId, atBlockN);
    if (!positionInfo) { return null; }
    const poolInfo = await getPoolFromWToken(positionInfo.collToken, positionInfo.collId);

    let coingecko: ReturnType<typeof getOnlyCoingeckoRelevantinfo> | null = null;
    if (timestamp && poolInfo) {
        coingecko = getOnlyCoingeckoRelevantinfo(
            await getCoinsInfoAndHistoryMarketData('ETH', poolInfo.tokens.map(address => ({ address, timestamp })))
        );
    }
    let bankValues: IUnwrapPromise<ReturnType<typeof getBankInfo>> = null
    if (poolInfo?.rewardAddress) {
        bankValues = await getBankInfo(web3, poolInfo.rewardAddress, atBlockN);
    }
    let lpPayload: IUnwrapPromise<ReturnType<typeof getlpPayload>> = null
    if (coingecko) {
        lpPayload = await getlpPayload(web3,coingecko,poolInfo,positionInfo)
    }
    const positionWithShares = {
        id: positionId,
        isActive: positionInfo.collateralSize !== "0",
        poolInfo,
        positionInfo,
        bankValues,
        timestamp,
        coingecko,
        lpPayload,
    };
    return positionWithShares;
}

// NOTE: get kill events only works when requesting a size of about 20k blocks each bulk, if requested more,
// it might fail with timeout. Need to setup a strategy that sync's all events in batches.
const MAX_BLOCKS_TO_QUERY_EACH_REQ = 1e3; // 1k

// This block number is taken from when the bank contract was deployed to eth
// https://etherscan.io/address/0x99c666810ba4bf9a4c2318ce60cb2c279ee2cf56
const MIN_BLOCK = 12327023;
const MAX_BLOCK = 0;

type IEventNames = 'AddBank' | 'SetOracle' | 'SetFeeBps' | 'WithdrawReserve' | 'Borrow' | 'Repay' | 'PutCollateral' | 'TakeCollateral' | 'Liquidate';
type IValidEventNames = IEventNames | 'allEvents';


type IBlockRange = { fromBlock: number, toBlock: number };
export type IGetEventCallback = (ed: EventData[]) => Promise<void>;
export type IGetErrorCallback = (range: IBlockRange, err?: Error,) => Promise<void>;
export async function getEvents(
    web3: Web3,
    eventName: IValidEventNames,
    onGetEventCallback: IGetEventCallback,
    fromBlock: number,
    toBlock: number,
) {
    const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_ADDRESS);
    const eventProps: IBlockRange = { fromBlock, toBlock };
    const eventsReturned = await contract.getPastEvents(eventName, eventProps);
    if (eventsReturned.length) {
        console.log(`[BANK v2] Block range (${fromBlock} - ${toBlock}). Events: ${eventsReturned.length}`);
        await onGetEventCallback(eventsReturned);
    } else {
        console.log(`[BANK v2] Block range (${fromBlock} - ${toBlock})is empty of events.`);
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
    let totalBlocks = (endBlock - startingBlock);
    let requestErrors = 0;
    if (totalBlocks > MAX_BLOCKS_TO_QUERY_EACH_REQ) {
        let fromBlockLoop = startingBlock;
        let toBlockLoop = startingBlock + MAX_BLOCKS_TO_QUERY_EACH_REQ;
        while (totalBlocks) {
            totalBlocks = totalBlocks - (toBlockLoop - fromBlockLoop);
            if (fromBlockLoop >= toBlockLoop) {
                break;
            }
            try {
                await getEvents(web3, eventName, onGetEventCallback, fromBlockLoop, toBlockLoop);
                fromBlockLoop = toBlockLoop + 1;
                const nextBlockLoopEnd = fromBlockLoop + MAX_BLOCKS_TO_QUERY_EACH_REQ;
                toBlockLoop = nextBlockLoopEnd > endBlock ? endBlock : nextBlockLoopEnd;
            } catch (e) {
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
        } catch (e) {
            requestErrors++;
            await onGetErrorCallback({ fromBlock: startingBlock, toBlock: endBlock }, e);
        } finally {
            return requestErrors;
        }
    }
}

type ILPReserves = {
    _blockTimestampLast: string;
    _reserve0: string;
    _reserve1: string;
} | null;

async function getlpPayload(
    web3: Web3,
    coingeckoInfo: ReturnType<typeof getOnlyCoingeckoRelevantinfo>,
    poolInfo: ReturnType<typeof getPoolFromWToken>,
    positionInfo: IBankV2Position,
    atBlockN?: number,
) {
    try {
        if (poolInfo?.exchange !== ExchangeNamesV2.Uniswap && poolInfo?.exchange !== ExchangeNamesV2.Sushiswap) {
            throw new Error(`Invalid exchange ${poolInfo?.exchange}`);
        }
        const contractLP = new web3.eth.Contract((LP_TOKEN_ABI as unknown) as AbiItem, poolInfo?.lpTokenAddress);
        const totalSupply: string = await contractLP.methods.totalSupply().call({}, atBlockN);
        const decimals: string = await contractLP.methods.decimals().call({}, atBlockN);
        const token0: string = await contractLP.methods.token0().call({}, atBlockN);
        const token1: string = await contractLP.methods.token1().call({}, atBlockN);
        const reserves: ILPReserves = await contractLP.methods.getReserves().call({}, atBlockN);
        if (!reserves) {
            throw new Error(`No reserves! ${JSON.stringify(poolInfo, null, 2)}`);
        }
        const lpTokenValue = new BigNumber(positionInfo.collateralSize).dividedBy(`1e${decimals}`);
        const lpTotalSupply = new BigNumber(totalSupply).dividedBy(`1e${decimals}`);
        const cgToken0Info = coingeckoInfo.find(cg => cg.address.toLowerCase() === token0.toLowerCase());
        const cgToken1Info = coingeckoInfo.find(cg => cg.address.toLowerCase() === token1.toLowerCase());
        if (!cgToken0Info || !cgToken1Info) {
            throw new Error(`No token CG info! ${JSON.stringify({ token0, token1 }, null, 2)}`);
        }
        
        const tokenReserveMap: { [key: string]: { reserve: string; usdValue: number; } } = {};
        tokenReserveMap[token0] = {
            reserve: reserves._reserve0,
            usdValue: 0
        };
        tokenReserveMap[token1] = {
            reserve: reserves._reserve1,
            usdValue: 0
        };

        const token0PriceUsd = (cgToken0Info.marketData.market_data.current_price.usd) || 0;
        const token1PriceUsd = (cgToken1Info.marketData.market_data.current_price.usd) || 0;

        const token0MapInfo = LP_COINS_ETH.find(lp => lp.address.toLowerCase() === token0.toLowerCase());
        const token1MapInfo = LP_COINS_ETH.find(lp => lp.address.toLowerCase() === token1.toLowerCase());

        if (!token0PriceUsd || !token1PriceUsd || !token0MapInfo || !token1MapInfo) {
            throw new Error(`No token Price info! ${JSON.stringify({ token0PriceUsd, token1PriceUsd, token0MapInfo, token1MapInfo }, null, 2)}`);
        }
        const token0Reserve = new BigNumber(reserves._reserve0).dividedBy(`1e${token0MapInfo.decimals || 18}`);
        const token1Reserve = new BigNumber(reserves._reserve1).dividedBy(`1e${token1MapInfo.decimals || 18}`);

        const lpShare = lpTokenValue.dividedBy(lpTotalSupply);
        const token0Amount = token0Reserve.multipliedBy(lpShare);
        const token1Amount = token1Reserve.multipliedBy(lpShare);
        const token0UsdReserveValue = token0Amount.multipliedBy(token0PriceUsd);
        const token1UsdReserveValue = token1Amount.multipliedBy(token1PriceUsd);
        const totalPoolReserveValue = token0UsdReserveValue.plus(token1UsdReserveValue);
        const lpTokenValueUsd = lpTokenValue.dividedBy(totalPoolReserveValue).multipliedBy(lpTotalSupply);

        return {
            token0Amount: token0Amount.toString(),
            token1Amount: token1Amount.toString(),
            lpTokenValue: lpTokenValue.toString(),
            token0UsdReserveValue: token0UsdReserveValue.toString(),
            token1UsdReserveValue: token1UsdReserveValue.toString(),
            lpTokenValueUsd: lpTokenValueUsd.toString(),
            totalPoolReserveValue: totalPoolReserveValue.toString(),
            reserves,
        };
    } catch (err) {
        console.error(`[ERROR getlpPayload] ${JSON.stringify({ msg: err.message })}`)
        return null;
    }
}