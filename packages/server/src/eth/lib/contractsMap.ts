import axios from 'axios';

const CONTRACTS_MAP_URL = 'https://homora.alphafinance.io/static/contracts.json';

let contractsMapCache: IContractsMap | null = null;

export async function getETHContractsMap(): Promise<IContractsMap> {
    if (contractsMapCache) {
        return contractsMapCache;
    }
    const contractsMapRequest = await axios.get<IContractsMap>(CONTRACTS_MAP_URL)
    contractsMapCache = contractsMapRequest.data;
    return contractsMapRequest.data
;}


// NOTE: types generated with https://app.quicktype.io/ and the api json response
export interface IContractsMap {
    bankAddress: string;
    WETHAddress: string;
    pools:       Pool[];
    alphaPools:  Pool[];
    exchanges:   IExchanges;
}

export interface Pool {
    exchange: ExchangeNames;
    name: string;
    tokenAddress: string;
    goblinAddress: string;
    lpTokenAddress: string;
    hasTradingFeeAPY?: boolean;
    hasFarmingAPY?: boolean;
    leverages: number[];
    logo?: string;
    lpStakingAddress?: string;
    id?: number;
}

export enum ExchangeNames {
    IndexCoop = "IndexCoop",
    MStable = "mStable",
    Pickle = "Pickle",
    Sushi = "Sushi",
    Uniswap = "Uniswap",
}

export interface IExchanges {
    Uniswap: IExchange;
    IndexCoop: IExchange;
    Sushi: IExchange;
    Pickle: IExchange;
    mStable: IExchange;
}

export interface IExchange {
    name: ExchangeNames;
    reward: IReward;
}

export interface IReward {
    tokenName: string;
    rewardPerPoolPerYear: string;
    rewardTokenAddress: string;
    rewardEthLpTokenAddress: string;
}


export async function getGoblinAddressPoolMap(goblinAddr: string) {
    const contractsMap = await getETHContractsMap();
    const poolMap = contractsMap.pools.find(p => p.goblinAddress.toLowerCase() === goblinAddr.toLowerCase());
    if (!poolMap) {
        throw new Error(`Goblin address provided is not present at contracts map. Goblin Address: ${goblinAddr}`);
    }
    return poolMap;
}
