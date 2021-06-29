// import BigNumber from 'bignumber.js';
import Web3 from 'web3';
import { EventData } from 'web3-eth-contract';
// import { ethers } from "ethers";
import { HttpProvider } from 'web3-core';
import { AbiItem } from 'web3-utils';
import BANK_ABI from '../abis/bank_abi.json';
import GOBLIN_ABI from '../abis/goblin_abi.json';

export const BANK_PROXY_ADDRESS = '0x3bb5f6285c312fc7e1877244103036ebbeda193d';
export const BANK_IMPLEMENTATION_ADDRESS = '0x35cfacc93244fc94d26793cd6e68f59976380b3e';
const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000';

// Queries the next position id from the bank contract
export async function getBankNextPositionId(provider: HttpProvider): Promise<string | null> {
    try {
        const web3 = new Web3(provider);
        const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_PROXY_ADDRESS);
        const nextPositionID: string = await contract.methods.nextPositionID().call();
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
async function getBankPositionById(provider: HttpProvider, positionId: number): Promise<IBankPosition | null> {
    try {
        const web3 = new Web3(provider);
        const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_PROXY_ADDRESS);
        const position: IBankPosition = await contract.methods.positions(positionId).call();
        if (position.goblin === EMPTY_ADDRESS || position.owner === EMPTY_ADDRESS) {
            return null
        }
        return position;
    } catch (err) {
        console.error(`[ERROR getBankPositionById] ${JSON.stringify({ msg: err.message, stack: err.stack }, null, 2)}`)
        return null;
    }
}

// Given a position id, it queries goblin contract to get it's shares property
async function getGoblinSharesById(provider: HttpProvider, goblinAddr: string, positionId: number): Promise<any | null> {
    try {
        const web3 = new Web3(provider);
        const contract = new web3.eth.Contract((GOBLIN_ABI as unknown) as AbiItem, goblinAddr);
        const shares: string = await contract.methods.shares(positionId).call();
        return shares;
    } catch (err) {
        console.error(`[ERROR getGoblinSharesById] ${JSON.stringify({ msg: err.message, stack: err.stack }, null, 2)}`)
        return null;
    }
}

export type IPositionWithShares = {
    id: number;
    goblin: string;
    owner: string;
    debtShare: string;
    goblinShares: string;
    isActive: boolean;
}
// Given a position id, it queries the bank and goblin contract to get the shares and know if it's an active position
export async function getBankPositionWithSharesById(provider: HttpProvider, positionId: number) {
    const bankPositionReturn = await getBankPositionById(provider, positionId);
    if (!bankPositionReturn) { return null; }
    const positionWithShares: IPositionWithShares = {
        id: positionId,
        goblin: bankPositionReturn.goblin,
        debtShare: bankPositionReturn.debtShare,
        owner: bankPositionReturn.owner,
        goblinShares: '0',
        isActive: false,
    }
    const goblinShares = await getGoblinSharesById(provider, bankPositionReturn.goblin, positionId);
    positionWithShares.goblinShares = goblinShares;
    positionWithShares.isActive = goblinShares !== '0';
    return positionWithShares;
}

// NOTE: get kill events only works when requesting a size of about 20k blocks each bulk, if requested more,
// it might fail with timeout. Need to setup a strategy that sync's all events in batches.
const MAX_BLOCKS_TO_QUERY_EACH_REQ = 8e3; // 50k

// This block number is taken from the first alpha token transfer from
// https://bscscan.com/token/0xa1faa113cbe53436df28ff0aee54275c13b40975
const MIN_BLOCK = 7042530;

type IValidEventNames = 'AddDebt' | 'Approval' | 'Kill' | 'RemoveDebt' | 'Transfer' | 'Work' | 'allEvents';
type IBlockRange = { fromBlock: number, toBlock: number };
type IGetEventCallback = (ed: EventData[]) => (void | Promise<void>);
export async function getEvents(
    provider: HttpProvider,
    eventName: IValidEventNames,
    onGetEventCallback: IGetEventCallback,
    fromBlock: number,
    toBlock: number,
) {
    const web3 = new Web3(provider);
    const contract = new web3.eth.Contract((BANK_ABI as unknown) as AbiItem, BANK_PROXY_ADDRESS);
    const eventProps: IBlockRange = { fromBlock, toBlock };
    const eventsReturned = await contract.getPastEvents(eventName, eventProps);
    if (eventsReturned.length) { await onGetEventCallback(eventsReturned); }
}

export async function getEventsInBatches(
    provider: HttpProvider,
    eventName: IValidEventNames,
    onGetEventCallback: IGetEventCallback,
    fromBlock: number,
    toBlock: number | 'latest' = 'latest',
) {
    const web3 = new Web3(provider);
    const endBlock = toBlock === 'latest' ? (await web3.eth.getBlockNumber()) : toBlock;
    const startingBlock = fromBlock < MIN_BLOCK ? MIN_BLOCK : fromBlock
    let totalBlocks = (endBlock-startingBlock);
    const requestErrors: IBlockRange[] = [];
    if (totalBlocks > MAX_BLOCKS_TO_QUERY_EACH_REQ) {
        let fromBlockLoop = startingBlock;
        let toBlockLoop = startingBlock + MAX_BLOCKS_TO_QUERY_EACH_REQ;
        while (totalBlocks > 0) {
            totalBlocks = totalBlocks - (toBlockLoop-fromBlockLoop);
            try {
                await getEvents(provider, eventName, onGetEventCallback, fromBlockLoop, toBlockLoop);
            } catch(e) {
                console.error('getEventsInBatches Error!', e, fromBlockLoop, toBlockLoop);
                requestErrors.push({ fromBlock: fromBlockLoop, toBlock: toBlockLoop });
            } finally {
                fromBlockLoop = toBlockLoop + 1;
                const nextBlockLoopEnd = fromBlockLoop + MAX_BLOCKS_TO_QUERY_EACH_REQ;
                toBlockLoop = nextBlockLoopEnd > endBlock ? endBlock : nextBlockLoopEnd;
            }
        }
        return requestErrors;
    } else {
        try {
            await getEvents(provider, eventName, onGetEventCallback, startingBlock, endBlock)
        } catch(e) {
            requestErrors.push({ fromBlock: startingBlock, toBlock: endBlock });
            console.error('getEventsInBatches Error!', e, startingBlock, endBlock);
        } finally {
            return requestErrors;
        }
    }
}