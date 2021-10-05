import axios from 'axios';
import { delay, formatInTimeZone } from './util';

type ICoinGeckoCoin = {
    id: string;
    name: string;
    platforms?: {
        [key: string]: string;
    };
    symbol: string;
}

let CACHE_COINS_LIST: ICoinGeckoCoin[] | undefined;
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
async function getCoinHistoryMarketData(coinId: string, date: Date): Promise<ICoinMarketData | undefined> {
    try {
        const formattedDate = formatInTimeZone(date, 'dd-MM-yyyy', 'UTC');
        const coinDataRequest = await axios.get<ICoinMarketData>(
            `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${formattedDate}&localization=false`
        );
        if (!coinDataRequest.data.market_data) {
            throw new Error(`No market data for ${coinId} at date ${formattedDate}`);
        }
        return coinDataRequest.data;
    } catch(err: any) {
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
        Object.keys(c.platforms || {}).includes('binance-smart-chain') && ((c.platforms || {})['binance-smart-chain'])
    ));
}

export async function getCoinsListETH() {
    const coinsList = await getCoinsListWithCache();
    return coinsList.filter((c) => (
        Object.keys(c.platforms || {}).includes('ethereum') && ((c.platforms || {})['ethereum'])
    ));
}

// Some coins address from BSC are not listed at coingecko, maps those absent with a coingecko id
export const LP_COINS_BSC = [
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
const BSC_MAP_COINS_ADDR_TO_ID: { [addr: string]: string; } = {};
LP_COINS_BSC.forEach(c => BSC_MAP_COINS_ADDR_TO_ID[c.address.toLowerCase()] = c.coingekoId);

export const LP_COINS_ETH = [
    { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', coingekoId: 'weth', decimals: 18 },
    { address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', coingekoId: 'wrapped-bitcoin', decimals: 8 },
    { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', coingekoId: 'usd-coin', decimals: 6 },
    { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', coingekoId: 'tether', decimals: 6 },
    { address: '0x6b175474e89094c44da98b954eedeac495271d0f', coingekoId: 'dai', decimals: 18 },
    { address: '0x1494ca1f11d487c2bbe4543e90080aeba4ba3c2b', coingekoId: 'defipulse-index', decimals: 18 },
    { address: '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e', coingekoId: 'yearn-finance', decimals: 18 },
    { address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', coingekoId: 'uniswap', decimals: 18 },
    { address: '0x514910771af9ca656af840dff83e8264ecf986ca', coingekoId: 'chainlink', decimals: 18 },
    { address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', coingekoId: 'aave', decimals: 18 },
    { address: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', coingekoId: 'maker', decimals: 18 },
    { address: '0xeb4c2781e4eba804ce9a9803c67d0893436bb27d', coingekoId: 'renbtc', decimals: 8 },
    { address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f', coingekoId: 'havven', decimals: 18 },
    { address: '0x1ceb5cb57c4d4e2b2433641b95dd330a33185a44', coingekoId: 'keep3rv1', decimals: 18 },
    { address: '0xb753428af26e81097e7fd17f40c88aaa3e04902c', coingekoId: 'saffron-finance', decimals: 18 },
    { address: '0xbc396689893d065f41bc2c6ecbee5e0085233447', coingekoId: 'perpetual-protocol', decimals: 18 },
    { address: '0xc00e94cb662c3520282e6f5717214004a7f26888', coingekoId: 'compound-governance-token', decimals: 18 },
    { address: '0xd533a949740bb3306d119cc777fa900ba034cd52', coingekoId: 'curve-dao-token', decimals: 18 },
    { address: '0x967da4048cd07ab37855c090aaf366e4ce1b9f48', coingekoId: 'ocean-protocol', decimals: 18 },
    { address: '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2', coingekoId: 'sushi', decimals: 18 },
    { address: '0x429881672B9AE42b8EbA0E26cD9C73711b891Ca5', coingekoId: 'pickle-finance', decimals: 18 },
    { address: '0xa3bed4e1c75d00fa6f4e5e6922db7261b5e9acd2', coingekoId: 'meta', decimals: 18 },
    { address: '0xba11d00c5f74255f56a5e366f4f77f5a186d7f55', coingekoId: 'band-protocol', decimals: 18 },
    { address: '0x57ab1ec28d129707052df4df418d58a2d46d5f51', coingekoId: 'nusd', decimals: 18 },
    { address: '0x04fa0d235c4abf4bcf4787af4cf447de572ef828', coingekoId: 'uma', decimals: 18 },
    { address: '0x0aacfbec6a24756c20d41914f2caba817c0d8521', coingekoId: 'yam-2', decimals: 18 },
    { address: '0x408e41876cccdc0f92210600ef50372656052a38', coingekoId: 'republic-protocol', decimals: 18 },
    { address: '0xc944e90c64b2c07662a292be6244bdf05cda44a7', coingekoId: 'the-graph', decimals: 18 },
    { address: '0x3c9d6c1c73b31c837832c72e04d3152f051fc1a9', coingekoId: 'boringdao-[old]', decimals: 18 },
    { address: '0x8064d9ae6cdf087b1bcd5bdf3531bd5d8c537a68', coingekoId: 'boringdao-btc', decimals: 18 },
    { address: '0xa1faa113cbe53436df28ff0aee54275c13b40975', coingekoId: 'alpha-finance', decimals: 18 },
];
const ETH_MAP_COINS_ADDR_TO_ID: { [addr: string]: string; } = {};
LP_COINS_ETH.forEach(c => ETH_MAP_COINS_ADDR_TO_ID[c.address.toLowerCase()] = c.coingekoId);

type ICoinToQuery = { address: string; timestamp: number; }
export type ICoinWithInfoAndUsdPrice = ICoinToQuery & { info: ICoinGeckoCoin | null; marketData: ICoinMarketData | undefined; };
export async function getCoinsInfoAndHistoryMarketData(chain: 'BSC' | 'ETH', coinsToQuery: ICoinToQuery[]) {
    const allCoins = await getCoinsListWithCache();
    if (chain === 'BSC') {
        const bscCoins = await getCoinsListBSC();
        const coinsAddressInfoMap: { [addr: string]: ICoinGeckoCoin } = {};
        // in cases where there are coins bsc address that coingecko is not updated with their address, use the custom map
        for (const cq of coinsToQuery) {
            const cqAddr = cq.address.toLowerCase();
            if (BSC_MAP_COINS_ADDR_TO_ID[cqAddr]) {
                const coinInfo = allCoins.find(c => c.id === BSC_MAP_COINS_ADDR_TO_ID[cqAddr]);
                if (coinInfo) {
                    coinsAddressInfoMap[cqAddr] = coinInfo;
                }
            }
        }
        // first get the coin info
        for (const bscCoin of bscCoins) {
            coinsToQuery.some(cq => {
                const cqAddr = cq.address.toLowerCase();
                const matches = cqAddr === ((bscCoin.platforms || {})['binance-smart-chain']).toLowerCase();
                if (matches && !coinsAddressInfoMap[cqAddr]) { coinsAddressInfoMap[cqAddr] = bscCoin; }
                return matches;
            });
        }
        const ret: ICoinWithInfoAndUsdPrice[] = [];
        for (const coin of coinsToQuery) {
            const coinAddr = coin.address.toLowerCase();
            const info: ICoinGeckoCoin | undefined = coinsAddressInfoMap[coinAddr];
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
    } else if (chain === 'ETH') {
        const ethCoins = await getCoinsListETH();
        const coinsAddressInfoMap: { [addr: string]: ICoinGeckoCoin } = {};
        // in cases where there are coins bsc address that coingecko is not updated with their address, use the custom map
        for (const cq of coinsToQuery) {
            const cqAddr = cq.address.toLowerCase();
            if (ETH_MAP_COINS_ADDR_TO_ID[cqAddr]) {
                const coinInfo = allCoins.find(c => c.id === ETH_MAP_COINS_ADDR_TO_ID[cqAddr]);
                if (coinInfo) {
                    coinsAddressInfoMap[cqAddr] = coinInfo;
                } else {
                    console.error(`Can't get coingecko info for ${chain}: ${JSON.stringify(cq)}.`);
                }
            }
        }
        // first get the coin info
        for (const ethCoin of ethCoins) {
            coinsToQuery.some(cq => {
                const cqAddr = cq.address.toLowerCase();
                const matches = cqAddr === ((ethCoin.platforms || {})['ethereum']).toLowerCase();
                if (matches && !coinsAddressInfoMap[cqAddr]) { coinsAddressInfoMap[cqAddr] = ethCoin; }
                return matches;
            });
        }
        const ret: ICoinWithInfoAndUsdPrice[] = [];
        for (const coin of coinsToQuery) {
            const coinAddr = coin.address.toLowerCase();
            const info: ICoinGeckoCoin | undefined = coinsAddressInfoMap[coinAddr];
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
    }
    throw new Error(`Can't get coingecko market data for ${chain}: ${JSON.stringify(coinsToQuery)}`);
}

type ICGShortInfo = {
    info?: { id: string; name: string; symbol: string; };
    address: string;
    marketData: { market_data: { current_price: { usd?: number; } }}
};
export function getOnlyCoingeckoRelevantinfo(coinsInfo: Array<(ICoinWithInfoAndUsdPrice | ICGShortInfo)>): ICGShortInfo[] {
    return coinsInfo.map(cginfo => {
        const currentUsdPrice = cginfo.marketData?.market_data.current_price['usd'];
        return {
            info: cginfo.info ? {
                id: cginfo.info.id,
                name: cginfo.info.name,
                symbol: cginfo.info.symbol,
            } : undefined,
            address: cginfo.address,
            marketData: { market_data: { current_price: { usd: currentUsdPrice } } }
        };
    });
}
