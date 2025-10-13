/*
 * @Author: leo leean1687@gmail.com
 * @Date: 2025-10-09 17:51:12
 * @LastEditors: leo leean1687@gmail.com
 * @LastEditTime: 2025-10-13 18:05:50
 * @FilePath: /app/src/pages/api/smartrouter/index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { getRoute } from './quote'
export type ParamsOptions = {
  chainId: number
  amountIn: number
  walletAddress: string
  slippage: number
  token0: {
    address: string
    decimals: number
    symbol: string
    name: string
  }
  token1: {
    address: string
    decimals: number
    symbol: string
    name: string
  }
};
interface ApiError extends Error {
  code?: number;
  status?: number;
}
export const handleError = (res: NextApiResponse, error: unknown) => {
  if (error instanceof Error) {
    const apiError = error as ApiError & { cause?: unknown }
    const status = apiError.status ?? 500
    const code = apiError.code ?? status
    const payload: Record<string, unknown> = {
      code,
      message: apiError.message || 'Server internal error',
    }
    if (process.env.NODE_ENV === 'development') {
      payload.error = apiError.stack || (apiError as any).cause || undefined
    }
    res.status(status).json(payload)
    return
  }
  const message = typeof error === 'string' ? error : 'Server internal error'
  res.status(500).json({ code: 500, message })
}
const validateParams = async(req: NextApiRequest, method:'get' | 'post'): Promise<ParamsOptions> => {
  try {
    const paramsObj: any = method === 'get' ? req.query : (req.body ?? {})
    if(!paramsObj) {
      throw new Error('params cannot be empty')
    }
    if(!paramsObj.chainId  || !paramsObj.amountIn || !paramsObj.token0 || !paramsObj.token1 || !paramsObj.walletAddress || !paramsObj.slippage) {
      throw new Error('params cannot be empty')
    }
    if(!paramsObj.token0.address || !paramsObj.token0.decimals || !paramsObj.token1.address || !paramsObj.token1.decimals) {
      throw new Error('token(addrss,decimals) cannot be empty')
    }
    const { chainId, amountIn, walletAddress, slippage, token0, token1 } = paramsObj
    return {
      chainId, amountIn, walletAddress, slippage, token0, token1
    }
  } catch (error) {
    throw new Error('Address cannot be empty!!!') 
  }
  
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Origin', process.env.NEXT_PUBLIC_ALLOWED_ORIGIN || '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cron-Token')

    // 预检请求处理
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    // 支持 GET/POST
    const method: 'get' | 'post' = req.method === 'GET' ? 'get' : 'post'

    // 临时调试端点 - 检查环境变量
    const debug = typeof req.query.debug === 'string' ? req.query.debug : undefined
    if (debug === 'true') {
      res.status(200).json({
        schedulerToken: '',
        environment: process.env.NODE_ENV,
        headers: req.headers,
      })
      return
    }

    const params = await validateParams(req, method)
    const data = await getRoute(params)
    res.status(200).json({ code: 200, data, message: 'success' })
  } catch (error) {
    handleError(res, error)
  }
}
