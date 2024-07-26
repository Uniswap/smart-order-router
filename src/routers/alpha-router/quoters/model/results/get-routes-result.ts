import { V2SubgraphPool, V3SubgraphPool } from '../../../../../providers';
import { MixedRoute, V2Route, V3Route } from '../../../../router';
import { CandidatePoolsBySelectionCriteria } from '../../../functions/get-candidate-pools';

export interface GetRoutesResult<Route extends V2Route | V3Route | MixedRoute> {
  routes: Route[];
  candidatePools: CandidatePoolsBySelectionCriteria<V2SubgraphPool | V3SubgraphPool>;
}
