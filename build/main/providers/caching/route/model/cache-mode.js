"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheMode = void 0;
/**
 * CacheMode enum that controls the way that the RouteCachingProvider works.
 * - *Livemode*:   This mode will set materialized routes into cache and fetch routes from cache.
 *                 If the route exists in cache, it will be quoted and returned, otherwise it will materialized.
 * - *Darkmode*:   This mode indicates that the cache will not be used, it will not be inserted nor fetched.
 *                 Routes will always be materialized.
 * - *Tapcompare*: In this mode we will insert and fetch routes to/from cache, and we will also materialize the route.
 *                 Ultimately the materialized route will be returned, but we will log some metrics comparing both.
 *
 * @enum {string}
 */
var CacheMode;
(function (CacheMode) {
    CacheMode["Livemode"] = "livemode";
    CacheMode["Darkmode"] = "darkmode";
    CacheMode["Tapcompare"] = "tapcompare";
})(CacheMode = exports.CacheMode || (exports.CacheMode = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGUtbW9kZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3NyYy9wcm92aWRlcnMvY2FjaGluZy9yb3V0ZS9tb2RlbC9jYWNoZS1tb2RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOzs7Ozs7Ozs7O0dBVUc7QUFDSCxJQUFZLFNBSVg7QUFKRCxXQUFZLFNBQVM7SUFDbkIsa0NBQXFCLENBQUE7SUFDckIsa0NBQXFCLENBQUE7SUFDckIsc0NBQXlCLENBQUE7QUFDM0IsQ0FBQyxFQUpXLFNBQVMsR0FBVCxpQkFBUyxLQUFULGlCQUFTLFFBSXBCIn0=