import axios from 'axios';
import { delay } from '../common';
import { formatInTimeZone } from './util';

type ICoinGeckoCoin = {
    id: string;
    name: string;
    platforms: {
        [key: string]: string;
    };
    symbol: string;
}

let CACHE_COINS_LIST: ICoinGeckoCoin[] | undefined;
export async function getCoinsListWithCache() {
    if (CACHE_COINS_LIST) {
        return CACHE_COINS_LIST;
    }
    const coinsList = await axios.get<ICoinGeckoCoin[]>('https://api.coingecko.com/api/v3/coins/list?include_platform=true')
    CACHE_COINS_LIST = coinsList.data;
    return CACHE_COINS_LIST;
}

type ICoinMarketData = {
    id: string;
    symbol: string;
    name: string;
    image: { thumb: string; small: string;};
    market_data: {
        current_price: { [key: string]: number; };
        market_cap: { [key: string]: number; };
        total_volume: { [key: string]: number; };
    };
    community_data: any;
    developer_data: any;
    public_interest_stats: any;
};


// Could also use market chart range endpoint, positive is that it can get an hourly historical price,
// but it has more configurations and limitations for periods past N months
// https://www.coingecko.com/api/documentations/v3#/coins/get_coins__id__market_chart_range
//
// So now using the history endpoint, which only gives daily, not hourly info.
// e.g.: https://api.coingecko.com/api/v3/coins/tether/history?date=30-01-2021&localization=false
async function getCoinHistoryMarketData(coinId: string, date: Date): Promise<ICoinMarketData | undefined> {
    try {
        const formattedDate = formatInTimeZone(date, 'dd-MM-yyyy', 'UTC');
        const coinDataRequest = await axios.get<ICoinMarketData>(
            `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${formattedDate}&localization=false`
        );
        if (!coinDataRequest.data.market_data) {
            throw new Error(`No market data for ${coinId} at date ${formattedDate}`);
        }
        return coinDataRequest.data;
    } catch(err) {
        if (err?.response?.status === 429) {
            console.error(`[WARN] getCoinHistoryMarketData failed too many requests, retrying. Msg: `, err.message);
            await delay(10000);
            const retrier = await getCoinHistoryMarketData(coinId, date);
            return retrier;
        }
        console.error(`[ERROR] With getCoinHistoryMarketData request. ${coinId} - ${date.getTime()}.`, err.message);
        return;
    }
}

export async function getCoinsListBSC() {
    const coinsList = await getCoinsListWithCache();
    return coinsList.filter((c) => (
        Object.keys(c.platforms).includes('binance-smart-chain') && c.platforms['binance-smart-chain']
    ));
}

// Some coins address from BSC are not listed at coingecko, maps those absent with a coingecko id
export const LP_COINS = [
    { address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', coingekoId: 'pancakeswap-token', decimals: 18 },
    { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', coingekoId: 'wbnb', decimals: 18 },
    { address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', coingekoId: 'binance-usd', decimals: 18 },
    { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', coingekoId: 'binance-bitcoin', decimals: 18 },
    { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', coingekoId: 'ethereum', decimals: 18 },
    { address: '0x55d398326f99059fF775485246999027B3197955', coingekoId: 'tether', decimals: 18 },
    { address: '0xa1faa113cbE53436Df28FF0aEe54275c13B40975', coingekoId: 'alpha-finance', decimals: 18 },
    { address: '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD', coingekoId: 'chainlink', decimals: 18 },
    { address: '0xBf5140A22578168FD562DCcF235E5D43A02ce9B1', coingekoId: 'uniswap', decimals: 18 },
    { address: '0x928e55daB735aa8260AF3cEDadA18B5f70C72f1b', coingekoId: 'frontier-token', decimals: 18 },
    { address: '0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63', coingekoId: 'venus', decimals: 18 },
    { address: '0xa2B726B1145A4773F68593CF171187d8EBe4d495', coingekoId: 'injective-protocol', decimals: 18 },
    // addressess not listed at coingecko, (so for now doing manual mapping here)
    { address: '0xAD6cAEb32CD2c308980a548bD0Bc5AA4306c6c18', coingekoId: 'band-protocol', decimals: 18 },
    { address: '0x88f1A5ae2A3BF98AEAF342D26B30a79438c9142e', coingekoId: 'yearn-finance', decimals: 18 },
    // NOTE: Binance-Peg Polkadot Token is listed at CG with id'binance-peg-polkadot', but not enough
    //       historical data, for now using 'polkadot' manual map instead, to show historical data.
    { address: '0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402', coingekoId: 'polkadot', decimals: 18 },
];

const BSC_MAP_COINS_ADDR_TO_ID: { [addr: string]: string; } = {};
LP_COINS.forEach(c => BSC_MAP_COINS_ADDR_TO_ID[c.address] = c.coingekoId);
type ICoinToQuery = { address: string; timestamp: number; }
export type ICoinWithInfoAndUsdPrice = ICoinToQuery & { info: ICoinGeckoCoin | null; marketData: ICoinMarketData | undefined; };
export async function getCoinsInfoAndHistoryMarketData(chain: 'BSC', coinsToQuery: ICoinToQuery[]) {
    const allCoins = await getCoinsListWithCache();
    if (chain === 'BSC') {
        const bscCoins = await getCoinsListBSC();
        const coinsAddressInfoMap: { [addr: string]: ICoinGeckoCoin } = {};
        // in cases where there are coins bsc address that coingecko is not updated with their address, use the custom map
        for (const cq of coinsToQuery) {
            if (BSC_MAP_COINS_ADDR_TO_ID[cq.address]) {
                const coinInfo = allCoins.find(c => c.id === BSC_MAP_COINS_ADDR_TO_ID[cq.address]);
                if (coinInfo) {
                    coinsAddressInfoMap[cq.address] = coinInfo;
                }
            }
        }
        // first get the coin info
        for (const bscCoin of bscCoins) {
            coinsToQuery.some(cq => {
                const matches = cq.address.toLowerCase() === bscCoin.platforms['binance-smart-chain'].toLowerCase();
                if (matches && !coinsAddressInfoMap[cq.address]) { coinsAddressInfoMap[cq.address] = bscCoin; }
                return matches;
            });
        }
        const ret: ICoinWithInfoAndUsdPrice[] = [];
        for (const coin of coinsToQuery) {
            const info: ICoinGeckoCoin | undefined = coinsAddressInfoMap[coin.address];
            if (info) {
                const marketData = await getCoinHistoryMarketData(info.id, new Date(coin.timestamp*1000));
                if (marketData) {
                    ret.push({ ...coin, info, marketData });
                } else {
                    throw new Error(`Can't get coingecko market data for ${chain}: ${JSON.stringify(coin)}.`);    
                }
            } else {
                throw new Error(`Can't get coingecko info for ${chain}: ${JSON.stringify(coin)}.`);
            }
        }
        return ret;
        // then get the coin info
    }
    throw new Error(`Can't get coingecko market data for ${chain}: ${JSON.stringify(coinsToQuery)}`);
}