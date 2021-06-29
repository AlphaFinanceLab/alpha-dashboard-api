import Web3 from 'web3';
import fs from 'fs';
import { EventData } from 'web3-eth-contract';
import { PrismaClient } from '@prisma/client'
import { delay } from '../common';
import {
    getEventsInBatches,
} from './lib/bank'

const prisma = new PrismaClient();
const NODE_URL = "https://speedy-nodes-nyc.moralis.io/6df2e03496e250e048360175/bsc/mainnet";

async function main() {
    const web3HttpProvider = new Web3.providers.HttpProvider(NODE_URL, { keepAlive: true, timeout: 0, });
    let web3 = new Web3(web3HttpProvider);
    web3.eth.transactionBlockTimeout = 0;
    web3.eth.transactionPollingTimeout = 0;
    const blockN = await web3.eth.getBlockNumber();

    // Number of positions over time (nextPositionID variable in Bank contract)
    const onGetEventCallback = async (ev: EventData[]) => {
        for (const singleEvent of ev) {
            try {
                const updateSingleEvent = {
                    transactionIndex: singleEvent.transactionIndex,
                    event: singleEvent.event,
                    address: singleEvent.address,
                    blockNumber: singleEvent.blockNumber,
                    returnValues: singleEvent.returnValues,
                };
                const newEvent = await prisma.events.upsert({
                    where: { transactionIndex: singleEvent.transactionIndex },
                    update: updateSingleEvent,
                    create: updateSingleEvent,
                });
                console.log(`Event updated ${JSON.stringify(newEvent)}`);
            } catch(err) {
                console.error('ERROR!', err);
            }
        }
        await delay(1);
    };
    const getEventsBatchesWithErrors = await getEventsInBatches(web3HttpProvider, 'Kill', onGetEventCallback, 1, blockN);
    if (getEventsBatchesWithErrors.length) {
        fs.writeFileSync('batchEventErrors.json', JSON.stringify(getEventsBatchesWithErrors));
    }
    console.log('DONE!');
    return true;
}

main().then(res => console.log(res));