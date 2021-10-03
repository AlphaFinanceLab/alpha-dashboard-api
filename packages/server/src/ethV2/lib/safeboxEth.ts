// import BigNumber from 'bignumber.js';
import Web3 from 'web3';
// import { EventData } from 'web3-eth-contract';
import { AbiItem } from 'web3-utils';
// import SAFEBOX_ABI from '../abis/safebox_eth_abi.json';
import CTOKEN_ABI from '../abis/ctoken_abi.json';

// V2 Safe Boxes -> lending e.g. poolSize, utilization
const SAFE_BOXES = {
    WETH: {
        address: '0xeEa3311250FE4c3268F8E684f7C87A82fF183Ec1',
        cToken: '0x41c84c0e2ee0b740cf0d31f63f3b6f627dc6b393',
    },
    DAI: {
        address: '0xee8389d235E092b2945fE363e97CDBeD121A0439',
        cToken: '0x8e595470ed749b85c6f7669de83eae304c2ec68f',
    },
    USDT: {
        address: '0x020eDC614187F9937A1EfEeE007656C6356Fb13A',
        cToken: '0x48759f220ed983db51fa7a8c0d2aab8f3ce4166a',
    },
    USDC: {
        address: '0x08bd64BFC832F1C2B3e07e634934453bA7Fa2db2',
        cToken: '0x76eb2fe28b36b3ee97f3adae0c69606eedb2a37c',
    },
    YFI: {
        address: '0xe52557bf7315Fd5b38ac0ff61304cb33BB973603',
        cToken: '0xfa3472f7319477c9bfecdd66e4b948569e7621b9',
    },
    DPI: {
        address: '0xd80CE6816f263C3cA551558b2034B61bc9852b97',
        cToken: '0x7736ffb07104c0c400bb0cc9a7c228452a732992',
    },
    SNX: {
        address: '0x4d38b1ac1fad488e22282db451613EDd10434bdC',
        cToken: '0x12a9cc33a980daa74e00cc2d1a0e74c57a93d12c',
    },
    USD: {
        address: '0x8897cA3e1B9BC5D5D715b653f186Cc7767bD4c66',
        cToken: '0xa7c4054afd3dbbbf5bfe80f41862b89ea05c9806',
    },
    LINK: {
        address: '0xb59Ecdf6C2AEA5E67FaFbAf912B26658d43295Ed',
        cToken: '0xe7bff2da8a2f619c2586fb83938fa56ce803aa16',
    },
    WBTC: {
        address: '0xE520679df7E32600D9B2Caf50bD5a4337ea3CF89',
        cToken: '0x8fc8bfd80d6a9f17fb98a373023d72531792b431',
    },
    UNI: {
        address: '0x6cdd8cBcFfB3821bE459f6fCaC647a447E56c999',
        cToken: '0xfeeb92386a055e2ef7c2b598c872a4047a7db59f',
    },
    SUSHI: {
        address: '0x2ABBA23Bdc48245f5F68661E390da243755B569f',
        cToken: '0x226f3738238932ba0db2319a8117d9555446102f',
    },
}

// export async function getSafeBoxInfo(
//     web3: Web3,
//     safeBoxKey: keyof typeof SAFE_BOXES,
//     atBlockN?: number,
// ) {
//     try {
//         const sbAddress = SAFE_BOXES[safeBoxKey].address;
//         const contractSB = new web3.eth.Contract((SAFEBOX_ABI as unknown) as AbiItem, sbAddress);
//         const totalSupply: string = await contractSB.methods.totalSupply().call({}, atBlockN);
//         const decimals: string = await contractSB.methods.decimals().call({}, atBlockN);
//         return { totalSupply, decimals };
//     } catch (err: any) {
//         console.error(`[ERROR getlpPayload] ${JSON.stringify({ safeBoxKey, atBlockN, msg: err?.message })}`)
//         return null;
//     }
// }

// export async function getSafeBoxBalanceOf(
//     web3: Web3,
//     safeBoxKey: keyof typeof SAFE_BOXES,
//     addr: string,
//     atBlockN?: number,
// ) {
//     try {
//         const sbAddress = SAFE_BOXES[safeBoxKey].address;
//         const contractSB = new web3.eth.Contract((SAFEBOX_ABI as unknown) as AbiItem, sbAddress);
//         const balanceOf: string = await contractSB.methods.balanceOf(addr).call({}, atBlockN);
//         return balanceOf;
//     } catch (err: any) {
//         console.error(`[ERROR getSafeBoxBalanceOf] ${JSON.stringify({ addr,safeBoxKey, atBlockN, msg: err?.message })}`)
//         return null;
//     }
// }

export async function getSafeboxInfoFromTokenKey(web3: Web3, tokenSymbol: string, atBlockN?: number) {
    const safeBoxKey = tokenSymbol.toUpperCase();
    try {
        if (Object.keys(SAFE_BOXES).indexOf(safeBoxKey) === -1) {
            throw new Error(`[ETH v2] Safebox invalid token key: ${tokenSymbol}`);
        }
        const safeBox = SAFE_BOXES[safeBoxKey as keyof typeof SAFE_BOXES];
        const contractCT = new web3.eth.Contract((CTOKEN_ABI as unknown) as AbiItem, safeBox.cToken);
        const decimals: string = await contractCT.methods.decimals().call({}, atBlockN);
        const totalBorrows: string = await contractCT.methods.totalBorrows().call({}, atBlockN);
        const totalSupply: string = await contractCT.methods.totalSupply().call({}, atBlockN);
        const supplyRatePerBlock: string = await contractCT.methods.supplyRatePerBlock().call({}, atBlockN);
        const balanceOf: string = await contractCT.methods.balanceOf(safeBox.address).call({}, atBlockN);
        return { symbol: safeBoxKey, balanceOf, decimals, totalBorrows, totalSupply, supplyRatePerBlock };
    } catch (err: any) {
        console.error(`[ERROR getSafeboxInfoFromTokenKey] ${JSON.stringify({ safeBoxKey, atBlockN, msg: err?.message })}`)
        return null;
    }
}