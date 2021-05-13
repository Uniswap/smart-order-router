import { Router, RouterParams as RouterParams } from './router';
import { V3InterfaceRouter } from './v3-interface-router/v3-interface-router';

export enum RouterId {
  V3Interface = 'V3Interface',
}

export const ROUTER_IDS_LIST = Object.values(RouterId) as string[];

export const ROUTER_MAPPING = (
  strategy: string
): new (params: RouterParams) => Router => {
  switch (strategy) {
    case RouterId.V3Interface:
      return V3InterfaceRouter;
    default:
      throw new Error('Implementation of strategy not found.');
  }
};
