import { TPool } from '@uniswap/router-sdk/dist/utils/TPool';
import { Currency } from '@uniswap/sdk-core';
import { nativeOnChain } from '../../../util';
import { V4_ETH_WETH_FAKE_POOL } from '../../../util/pools';
import { MixedRoute } from '../../router';
import { nativePoolContainsWrappedNativeOrNative } from './native-pool-contains-wrapped-native-or-native';
import { wrappedNativePoolContainsNativeOrWrappedNative } from './wrapped-native-pool-contains-native-or-wrapped-native';

export function ammendMixedRouteEthWeth(
  currencyIn: Currency,
  currencyOut: Currency,
  route: MixedRoute
): MixedRoute {
  const amendedPools: TPool[] = [];

  for (let i = 0; i < route.pools.length; i++) {
    if (i === 0) {
      if (
        nativePoolContainsWrappedNativeOrNative(currencyIn, route.pools[i]!) ||
        wrappedNativePoolContainsNativeOrWrappedNative(
          currencyIn,
          route.pools[i]!
        )
      ) {
        amendedPools.push(V4_ETH_WETH_FAKE_POOL[currencyIn.chainId]!);
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      amendedPools.push(route.pools[i]!);
    } else if (i > 0 && i < route.pools.length - 1) {
      const previousPool = amendedPools[amendedPools.length - 1]! as {
        involvesToken(currency: Currency): boolean;
      };
      const currentPool = route.pools[i]! as {
        involvesToken(currency: Currency): boolean;
      };
      const native = nativeOnChain(currencyIn.chainId);
      const wrappedNative = nativeOnChain(currencyIn.chainId).wrapped;
      const previousPoolNativeCurrentPoolWrappedNative =
        previousPool.involvesToken(native) &&
        currentPool.involvesToken(wrappedNative);
      const previousPoolWrappedNativeCurrentPoolNative =
        previousPool.involvesToken(wrappedNative) &&
        currentPool.involvesToken(native);

      if (
        previousPoolNativeCurrentPoolWrappedNative ||
        previousPoolWrappedNativeCurrentPoolNative
      ) {
        amendedPools.push(V4_ETH_WETH_FAKE_POOL[currencyIn.chainId]!);
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      amendedPools.push(route.pools[i]!);
    } else {
      // i === route.pools.length - 1
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      amendedPools.push(route.pools[i]!);

      if (
        nativePoolContainsWrappedNativeOrNative(currencyIn, route.pools[i]!) ||
        wrappedNativePoolContainsNativeOrWrappedNative(
          currencyIn,
          route.pools[i]!
        )
      ) {
        amendedPools.push(V4_ETH_WETH_FAKE_POOL[currencyIn.chainId]!);
      }
    }
  }

  return new MixedRoute(amendedPools, currencyIn, currencyOut);
}
