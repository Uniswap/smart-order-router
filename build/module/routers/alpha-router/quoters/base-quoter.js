import _ from 'lodash';
import { log, metric, MetricLoggerUnit, poolToString, } from '../../../util';
/**
 * Interface for a Quoter.
 * Defines the base dependencies, helper methods and interface for how to fetch quotes.
 *
 * @abstract
 * @template CandidatePools
 * @template Route
 */
export class BaseQuoter {
    constructor(tokenProvider, chainId, protocol, blockedTokenListProvider, tokenValidatorProvider) {
        this.tokenProvider = tokenProvider;
        this.chainId = chainId;
        this.protocol = protocol;
        this.blockedTokenListProvider = blockedTokenListProvider;
        this.tokenValidatorProvider = tokenValidatorProvider;
    }
    /**
     * Public method which would first get the routes and then get the quotes.
     *
     * @param tokenIn The token that the user wants to provide
     * @param tokenOut The token that the usaw wants to receive
     * @param amounts the list of amounts to query for EACH route.
     * @param percents the percentage of each amount.
     * @param quoteToken
     * @param candidatePools
     * @param tradeType
     * @param routingConfig
     * @param gasModel the gasModel to be used for estimating gas cost
     * @param gasPriceWei instead of passing gasModel, gasPriceWei is used to generate a gasModel
     */
    getRoutesThenQuotes(tokenIn, tokenOut, amount, amounts, percents, quoteToken, candidatePools, tradeType, routingConfig, gasModel, gasPriceWei) {
        return this.getRoutes(tokenIn, tokenOut, candidatePools, tradeType, routingConfig).then((routesResult) => {
            if (routesResult.routes.length == 1) {
                metric.putMetric(`${this.protocol}QuoterSingleRoute`, 1, MetricLoggerUnit.Count);
                percents = [100];
                amounts = [amount];
            }
            if (routesResult.routes.length > 0) {
                metric.putMetric(`${this.protocol}QuoterRoutesFound`, routesResult.routes.length, MetricLoggerUnit.Count);
            }
            else {
                metric.putMetric(`${this.protocol}QuoterNoRoutesFound`, routesResult.routes.length, MetricLoggerUnit.Count);
            }
            return this.getQuotes(routesResult.routes, amounts, percents, quoteToken, tradeType, routingConfig, routesResult.candidatePools, gasModel, gasPriceWei);
        });
    }
    async applyTokenValidatorToPools(pools, isInvalidFn) {
        if (!this.tokenValidatorProvider) {
            return pools;
        }
        log.info(`Running token validator on ${pools.length} pools`);
        const tokens = _.flatMap(pools, (pool) => [pool.token0, pool.token1]);
        const tokenValidationResults = await this.tokenValidatorProvider.validateTokens(tokens);
        const poolsFiltered = _.filter(pools, (pool) => {
            const token0Validation = tokenValidationResults.getValidationByToken(pool.token0);
            const token1Validation = tokenValidationResults.getValidationByToken(pool.token1);
            const token0Invalid = isInvalidFn(pool.token0, token0Validation);
            const token1Invalid = isInvalidFn(pool.token1, token1Validation);
            if (token0Invalid || token1Invalid) {
                log.info(`Dropping pool ${poolToString(pool)} because token is invalid. ${pool.token0.symbol}: ${token0Validation}, ${pool.token1.symbol}: ${token1Validation}`);
            }
            return !token0Invalid && !token1Invalid;
        });
        return poolsFiltered;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS1xdW90ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvcm91dGVycy9hbHBoYS1yb3V0ZXIvcXVvdGVycy9iYXNlLXF1b3Rlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFLQSxPQUFPLENBQUMsTUFBTSxRQUFRLENBQUM7QUFRdkIsT0FBTyxFQUVMLEdBQUcsRUFDSCxNQUFNLEVBQ04sZ0JBQWdCLEVBQ2hCLFlBQVksR0FDYixNQUFNLGVBQWUsQ0FBQztBQWF2Qjs7Ozs7OztHQU9HO0FBQ0gsTUFBTSxPQUFnQixVQUFVO0lBYTlCLFlBQ0UsYUFBNkIsRUFDN0IsT0FBZ0IsRUFDaEIsUUFBa0IsRUFDbEIsd0JBQTZDLEVBQzdDLHNCQUFnRDtRQUVoRCxJQUFJLENBQUMsYUFBYSxHQUFHLGFBQWEsQ0FBQztRQUNuQyxJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUN2QixJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztRQUN6QixJQUFJLENBQUMsd0JBQXdCLEdBQUcsd0JBQXdCLENBQUM7UUFDekQsSUFBSSxDQUFDLHNCQUFzQixHQUFHLHNCQUFzQixDQUFDO0lBQ3ZELENBQUM7SUFnREQ7Ozs7Ozs7Ozs7Ozs7T0FhRztJQUNJLG1CQUFtQixDQUN4QixPQUFjLEVBQ2QsUUFBZSxFQUNmLE1BQXNCLEVBQ3RCLE9BQXlCLEVBQ3pCLFFBQWtCLEVBQ2xCLFVBQWlCLEVBQ2pCLGNBQThCLEVBQzlCLFNBQW9CLEVBQ3BCLGFBQWdDLEVBQ2hDLFFBQXlDLEVBQ3pDLFdBQXVCO1FBRXZCLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FDbkIsT0FBTyxFQUNQLFFBQVEsRUFDUixjQUFjLEVBQ2QsU0FBUyxFQUNULGFBQWEsQ0FDZCxDQUFDLElBQUksQ0FBQyxDQUFDLFlBQVksRUFBRSxFQUFFO1lBQ3RCLElBQUksWUFBWSxDQUFDLE1BQU0sQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFO2dCQUNuQyxN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