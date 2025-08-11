// Zora hook addresses on Base
export const ZORA_CREATOR_HOOK_ON_BASE =
  '0xd61A675F8a0c67A73DC3B54FB7318B4D91409040';
export const ZORA_POST_HOOK_ON_BASE =
  '0x9ea932730A7787000042e34390B8E435dD839040';

/**
 * Checks if a pool has Zora hooks
 */
export function hasZoraHooks(pool: { hooks: string }): boolean {
  const hooks = pool.hooks.toLowerCase();
  return (
    hooks === ZORA_CREATOR_HOOK_ON_BASE.toLowerCase() ||
    hooks === ZORA_POST_HOOK_ON_BASE.toLowerCase()
  );
}
