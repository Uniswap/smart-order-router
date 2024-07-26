import { V2SubgraphPool, V3SubgraphPool } from '../../../../../providers';
import { RouteWithValidQuote } from '../../../entities';
import { CandidatePoolsBySelectionCriteria } from '../../../functions/get-candidate-pools';

export interface GetQuotesResult {
  routesWithValidQuotes: RouteWithValidQuote[];
  candidatePools?: CandidatePoolsBySelectionCriteria<V2SubgraphPool | V3SubgraphPool>;
}
