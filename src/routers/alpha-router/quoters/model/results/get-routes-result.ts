import { SupportedRoutes } from '../../../../router';
import { CandidatePoolsBySelectionCriteria } from '../../../functions/get-candidate-pools';

export interface GetRoutesResult<Route extends SupportedRoutes> {
  routes: Route[];
  candidatePools: CandidatePoolsBySelectionCriteria;
}
