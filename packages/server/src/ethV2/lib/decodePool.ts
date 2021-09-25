import BigNumber from "bignumber.js";
import pools from "./poolsV2.json"; // https://homora-v2.alphafinance.io/static/pools.json

enum PoolType {
  LiquidityProviding = "Liquidity Providing",
  YieldFarming = "Yield Farming",
}

// wToken Addresses
export const werc20Address = "0x06799a1e4792001aa9114f0012b9650ca28059a3";
export const wMasterChefAddress = "0xa2caea05ff7b98f10ad5ddc837f15905f33feb60";
export const wLiquidityGauge = "0xf1f32c8eeb06046d3cc3157b8f9f72b09d84ee5b";
export const wStakingRewardIndex = "0x011535fd795fd28c749363e080662d62fbb456a7";

// Maps pool info from a wTokenAddress and collId
export const getPoolFromWToken = (wTokenAddress: string, id: string) => {
  let pool = null;
  const _wTokenAddress = wTokenAddress.toLowerCase();

  if (_wTokenAddress === werc20Address) {
    const parsedId = new BigNumber(id)
      .toString(16)
      .padStart(40, "0")
      .toLowerCase();
    const lpTokenAddress = "0x" + parsedId;

    for (const _pool of pools) {
      if (
        _pool.lpTokenAddress === lpTokenAddress &&
        _pool.type === PoolType.LiquidityProviding
      ) {
        pool = _pool;
        break;
      }
    }
  } else if (_wTokenAddress === wMasterChefAddress) {
    const pid = parseInt(id.substring(2, 6), 16);

    for (const _pool of pools) {
      if (
        _pool.pid === pid &&
        _wTokenAddress === _pool.wTokenAddress &&
        _pool.type === PoolType.YieldFarming
      ) {
        pool = _pool;
        break;
      }
    }
  } else if (_wTokenAddress === wLiquidityGauge) {
    const _id = BigInt(id);
    const pid = parseInt((_id >> BigInt(246)).toString());
    const gid = parseInt(((_id >> BigInt(240)) & BigInt(63)).toString());
    for (const _pool of pools) {
      if (
        _pool.gid === gid &&
        _pool.pid === pid &&
        _wTokenAddress === _pool.wTokenAddress
      ) {
        pool = _pool;
        break;
      }
    }
  } else {
    for (const _pool of pools) {
      if (
        _pool.wTokenAddress === _wTokenAddress &&
        _pool.type === PoolType.YieldFarming
      ) {
        pool = _pool;
        break;
      }
    }
  }

  return pool;
};
