export function markTime(title: string) {
  const startTime = Date.now();

  return () => {
    const elapsed = Date.now() - startTime;

    console.debug(`Elapsed time for ${title}: ${elapsed} ms`);
  };
}
