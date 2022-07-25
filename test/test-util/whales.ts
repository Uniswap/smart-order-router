import { DAI_MAINNET, UNI_MAINNET, USDC_MAINNET, USDT_MAINNET, WETH9 } from "../../src"
import {
    Token,
} from '@uniswap/sdk-core';

export const WHALES = (token:Token):string => {
    switch(token) {
        case WETH9[1]:
            return '0x06920c9fc643de77b99cb7670a944ad31eaaa260'
        case USDC_MAINNET:
        case UNI_MAINNET:
        case DAI_MAINNET:
        case USDT_MAINNET:
        default:
            return '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503'
    }
}