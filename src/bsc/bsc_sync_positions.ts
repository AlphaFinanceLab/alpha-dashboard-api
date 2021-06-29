import Web3 from 'web3';
import { HttpProvider } from 'web3-core';
import { PrismaClient } from '@prisma/client'
import { delay } from '../common';
import {
    getBankNextPositionId,
    getBankPositionWithSharesById,
    // getAllPositions,
    // getKillEvents,
    // IPositionWithShares,
} from './lib/bank'

const prisma = new PrismaClient();
const NODE_URL = "https://speedy-nodes-nyc.moralis.io/6df2e03496e250e048360175/bsc/mainnet";

export async function syncBankPositions(provider: HttpProvider, fromPositionId: number, toPositionId: number) {
    // const web3 = new Web3(provider);
    if (fromPositionId >= toPositionId) { throw new Error('Invalid positions'); }
    let currentPosition = fromPositionId;
    let errors = 0;
    while(currentPosition < toPositionId) {
        try {
            const positionWithShares = await getBankPositionWithSharesById(provider, currentPosition);
            if (positionWithShares) {
                const position = await prisma.positionWithShares.upsert({
                    where: { id: positionWithShares.id },
                    update: positionWithShares,
                    create: positionWithShares,
                });
                console.log(`Position updated ${JSON.stringify(position)}`);
            }
            currentPosition++;
            await delay(10);
        } catch (err) {
            errors++;
            console.error(`[ERROR getGoblinSharesById] ${JSON.stringify({ msg: err.message, stack: err.stack }, null, 2)}`)
            if (errors > 10) {
                throw new Error('More than 10 errors');
            }
        }
    }
    return currentPosition;
}

async function main() {
    const web3HttpProvider = new Web3.providers.HttpProvider(NODE_URL, { keepAlive: true, timeout: 0, });
    let web3 = new Web3(web3HttpProvider);
    web3.eth.transactionBlockTimeout = 0;
    web3.eth.transactionPollingTimeout = 0;
    const blockN = await web3.eth.getBlockNumber();

    // Number of positions over time (nextPositionID variable in Bank contract)
    const nextPositionID = await getBankNextPositionId(web3HttpProvider);

    if (!nextPositionID) {
        throw new Error(`Can't find next position id.`);
    }
    const positionsUpdated = await syncBankPositions(web3HttpProvider, 0, (parseInt(nextPositionID) - 1));

    const activeCount = await prisma.positionWithShares.count({ where: { isActive: { equals: true }, } });
    const inactiveCount = await prisma.positionWithShares.count({ where: { isActive: { equals: false }, } });
    
    console.log('POS:', positionsUpdated, activeCount, inactiveCount);

    // await getKillEvents(web3HttpProvider, 7603061);
    // Number and value of positions liquidated
    // Kill event

    // Number and value of positions refilled
    // Work event which id !== 0, the value is in loan argument


    // web3HttpProvider.disconnect();
    return { blockN, nextPositionID, positionsUpdated, activeCount, inactiveCount };
}

main().then(res => console.log(res));