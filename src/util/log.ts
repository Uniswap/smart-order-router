import Logger from 'bunyan';
import nullLogger from 'bunyan-blackhole';

export let log: Logger = nullLogger('/dev/null');

export const setGlobalLogger = (log: Logger) => {
  log = log;
};
