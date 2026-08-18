import {
  MixedRouteHeuristicGasModelFactory,
  V2HeuristicGasModelFactory,
  V3HeuristicGasModelFactory,
  V4HeuristicGasModelFactory,
} from '../../../../../src';

describe('gas model factory exports', () => {
  it('re-exports the heuristic gas model factories from the package root', () => {
    expect(typeof V2HeuristicGasModelFactory).toBe('function');
    expect(typeof V3HeuristicGasModelFactory).toBe('function');
    expect(typeof V4HeuristicGasModelFactory).toBe('function');
    expect(typeof MixedRouteHeuristicGasModelFactory).toBe('function');
  });
});
