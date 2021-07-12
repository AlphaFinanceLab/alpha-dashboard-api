// import BigNumber from 'bignumber.js';
import Web3 from 'web3';
import { EventData } from 'web3-eth-contract';
// import { ethers } from "ethers";
import { AbiItem } from 'web3-utils';
import BANK_ABI from '../abis/bank_abi.json';
import GOBLIN_ABI from '../abis/goblin_abi.json';
import MASTERCHEF_ABI from '../abis/masterchef_abi.json';
import LP_TOKEN_ABI from '../abis/lp_token_abi.json';
import { getCoinsInfoAndHistoryMarketData, ICoinWithInfoAndUsdPrice } from '../../lib/coingecko';

export const BANK_PROXY_ADDRESS = '0x3bb5f6285c312fc7e1877244103036ebbeda193d';
export const BANK_IMPLEMENTATION_ADDRESS = '0x35cfacc93244fc94d26793cd6e68f59976380b3e';
const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000';

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

type IGoblinLPPayload = {
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

type IGoblinPayload = {
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
    coingecko?: ICoinWithInfoAndUsdPrice[];
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
        positionWithShares.coingecko = await getCoinsInfoAndHistoryMarketData('BSC', coinsToQuery);
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